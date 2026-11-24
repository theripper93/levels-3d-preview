import * as THREE from "three";
import { factor } from "../main.js";

const RIM_OUTER = 0.4;
const PLATE_DEPTH = 0.06;
const FALLBACK_INNER = 0.83;
const STEEL = "#6f6b75";
const PLATE = "#2a2730";
const DEFAULT_BACKGROUND = [0.17, 0.145, 0.19];
const ALPHA_SAMPLES = 64;

const geometryCache = new Map();
const materialCache = new Map();
const boundsCache = new Map();
const coreSheets = new Map();

const FACE_CHUNK = `
vec4 medallionTexel = texture2D(map, vMapUv);
float medallionHeight = vMapUv.y - 0.5 + MEDALLION_RADIUS;
float medallionEdge = max(fwidth(medallionHeight), 1e-5);
diffuseColor *= vec4(medallionTexel.rgb, medallionTexel.a * smoothstep(-medallionEdge, medallionEdge, medallionHeight));
`;

const SHEET_CHUNK = `
vec4 sheetTexel = texture2D(map, vMapUv);
vec2 sheetLocal = (vMapUv - SHEET_FRAME.xy) / (SHEET_FRAME.zw - SHEET_FRAME.xy);
float sheetDist = length(sheetLocal - 0.5) * 2.0;
float sheetEdge = max(fwidth(sheetDist), 1e-5);
#ifdef SHEET_RING
float sheetBand = smoothstep(SHEET_BAND.x - sheetEdge, SHEET_BAND.x + sheetEdge, sheetDist) * (1.0 - smoothstep(SHEET_BAND.y - sheetEdge, SHEET_BAND.y + sheetEdge, sheetDist));
vec3 sheetColor = mix(sheetTexel.rgb, SHEET_TINT * sheetTexel.r, sheetBand);
#else
vec3 sheetColor = sheetTexel.rgb * SHEET_TINT;
#endif
diffuseColor *= vec4(sheetColor, sheetTexel.a);
`;

function medallionFaceCompile(shader) {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", FACE_CHUNK);
}

function medallionSheetCompile(shader) {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", SHEET_CHUNK);
}

export function isMedallionToken(document, modelPath, rawStyle, imageTexture) {
    return !modelPath && !imageTexture && rawStyle === "default" && !!document.ring?.enabled;
}

function cached(cache, key, create) {
    let value = cache.get(key);
    if (!value) cache.set(key, (value = create()));
    return value;
}

function isWhite(color) {
    return color === null || color === undefined || Number(color) === 0xffffff;
}

function ringColors(token) {
    return foundry.utils.mergeObject(token.document.ring.colors, token.getRingColors?.() ?? {}, { inplace: false });
}

function backgroundColor(tint) {
    if (isWhite(tint)) return new THREE.Color().setRGB(...DEFAULT_BACKGROUND, THREE.SRGBColorSpace);
    const [r, g, b] = Color.from(tint).rgb;
    return new THREE.Color().setRGB(2 * DEFAULT_BACKGROUND[0] * r, 2 * DEFAULT_BACKGROUND[1] * g, 2 * DEFAULT_BACKGROUND[2] * b, THREE.SRGBColorSpace);
}

function glsl(color) {
    return `vec3(${color.r.toFixed(5)}, ${color.g.toFixed(5)}, ${color.b.toFixed(5)})`;
}

function alphaBounds(src, image) {
    return cached(boundsCache, src, () => {
        const full = { u0: 0, u1: 1, v0: 0, v1: 1 };
        if (!image || image instanceof HTMLVideoElement) return full;
        try {
            const sampler = document.createElement("canvas");
            sampler.width = sampler.height = ALPHA_SAMPLES;
            const context = sampler.getContext("2d", { willReadFrequently: true });
            context.drawImage(image, 0, 0, ALPHA_SAMPLES, ALPHA_SAMPLES);
            const data = context.getImageData(0, 0, ALPHA_SAMPLES, ALPHA_SAMPLES).data;
            let x0 = ALPHA_SAMPLES;
            let x1 = -1;
            let y0 = ALPHA_SAMPLES;
            let y1 = -1;
            for (let y = 0; y < ALPHA_SAMPLES; y++) {
                for (let x = 0; x < ALPHA_SAMPLES; x++) {
                    if (data[(y * ALPHA_SAMPLES + x) * 4 + 3] < 96) continue;
                    x0 = Math.min(x0, x);
                    x1 = Math.max(x1, x);
                    y0 = Math.min(y0, y);
                    y1 = Math.max(y1, y);
                }
            }
            if (x1 < 0) return full;
            const pad = 1 / ALPHA_SAMPLES;
            return {
                u0: Math.max(0, x0 / ALPHA_SAMPLES - pad),
                u1: Math.min(1, (x1 + 1) / ALPHA_SAMPLES + pad),
                v0: Math.max(0, 1 - (y1 + 1) / ALPHA_SAMPLES - pad),
                v1: Math.min(1, 1 - y0 / ALPHA_SAMPLES + pad),
            };
        } catch {
            return full;
        }
    });
}

function quadGeometry(key, rect, uv, z) {
    return cached(geometryCache, `${key}|${z.toFixed(6)}`, () => {
        const geometry = new THREE.BufferGeometry();
        const corners = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ];
        const lerp = (a, b, t) => a + (b - a) * t;
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap(([s, t]) => [lerp(rect.x0, rect.x1, s), lerp(rect.y0, rect.y1, t), z]), 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(corners.flatMap(() => [0, 0, 1]), 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(corners.flatMap(([s, t]) => [lerp(uv.u0, uv.u1, s), lerp(uv.v0, uv.v1, t)]), 2));
        geometry.setIndex([0, 1, 2, 2, 1, 3]);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    });
}

function faceGeometry(src, bounds, size, radius, z) {
    const r = radius / size;
    const uv = { u0: Math.min(bounds.u0, 0.5 - r), u1: Math.max(bounds.u1, 0.5 + r), v0: 0.5 - r, v1: Math.max(bounds.v1, 0.5 + r) };
    const rect = { x0: (uv.u0 - 0.5) * size, x1: (uv.u1 - 0.5) * size, y0: (uv.v0 - 0.5) * size, y1: (uv.v1 - 0.5) * size };
    return quadGeometry(`face|${src}|${size.toFixed(5)}|${radius.toFixed(5)}`, rect, uv, z);
}

function squareGeometry(key, half, z, uv = { u0: 0, u1: 1, v0: 0, v1: 1 }) {
    return quadGeometry(`${key}|${half.toFixed(5)}`, { x0: -half, x1: half, y0: -half, y1: half }, uv, z);
}

function plateGeometry(radius, depth) {
    return cached(geometryCache, `plate|${radius.toFixed(5)}|${depth.toFixed(5)}`, () => new THREE.CylinderGeometry(radius, radius, depth, 96, 1).rotateX(Math.PI / 2));
}

function faceMaterial(texture, src, radius) {
    return cached(materialCache, `face|${src}|${radius.toFixed(5)}`, () => {
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
        material.defines = { MEDALLION_RADIUS: radius.toFixed(5) };
        material.onBeforeCompile = medallionFaceCompile;
        return material;
    });
}

function standardMaterial(key, options) {
    return cached(materialCache, key, () => new THREE.MeshStandardMaterial(options));
}

function sheetMaterial(texture, frame, tint, band) {
    const key = `sheet|${frame.join(",")}|${tint.getHexString()}|${band?.join(",") ?? ""}`;
    return cached(materialCache, key, () => {
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0.1, alphaTest: 0.5, alphaToCoverage: true });
        material.defines = { SHEET_FRAME: `vec4(${frame.map((v) => v.toFixed(6)).join(", ")})`, SHEET_TINT: glsl(tint) };
        if (band) Object.assign(material.defines, { SHEET_RING: "", SHEET_BAND: `vec2(${band[0].toFixed(4)}, ${band[1].toFixed(4)})` });
        material.onBeforeCompile = medallionSheetCompile;
        return material;
    });
}

async function loadCoreSheet(helpers) {
    const path = CONFIG.Token.ring.spritesheet;
    if (!coreSheets.has(path)) {
        const load = (async () => {
            const json = await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute(path));
            const texture = await helpers.loadTexture(path.slice(0, path.lastIndexOf("/") + 1) + json.meta.image);
            return { json, texture };
        })();
        coreSheets.set(path, load);
        load.catch(() => coreSheets.delete(path));
    }
    return coreSheets.get(path);
}

function frameUv(json, name) {
    const frame = json.frames[name]?.frame;
    if (!frame) return null;
    const { w, h } = json.meta.size;
    return { u0: frame.x / w, u1: (frame.x + frame.w) / w, v0: 1 - (frame.y + frame.h) / h, v1: 1 - frame.y / h };
}

function noOutline(mesh) {
    mesh.userData.noOutline = true;
    return mesh;
}

async function coreRim(token3d, ctx) {
    const { outer, grid, depth, rimTint } = ctx;
    const sheet = await loadCoreSheet(token3d._parent.helpers).catch(() => null);
    const size = Math.min(token3d.document.width, token3d.document.height);
    const data = CONFIG.Token.ring.ringClass.getRingDataBySize(size);
    const ringUv = sheet && frameUv(sheet.json, data.ringName);
    if (!ringUv) return plainRim(ctx);
    const bkgUv = frameUv(sheet.json, data.bkgName);
    const band = [data.colorBand?.startRadius ?? 0.666, data.colorBand?.endRadius ?? 0.7225];
    const front = depth / 2;
    const parts = [new THREE.Mesh(plateGeometry(outer * 0.99, depth), standardMaterial("plate", { color: new THREE.Color(PLATE), metalness: 0.3, roughness: 0.6 }))];
    if (bkgUv) {
        const tint = isWhite(ctx.colors.background) ? new THREE.Color(1, 1, 1) : new THREE.Color(Color.from(ctx.colors.background).css).multiplyScalar(3);
        parts.push(noOutline(new THREE.Mesh(squareGeometry(`bkg|${data.bkgName}`, grid / 2, front + outer * 0.002, bkgUv), sheetMaterial(sheet.texture, [bkgUv.u0, bkgUv.v0, bkgUv.u1, bkgUv.v1], tint))));
    }
    parts.push(noOutline(new THREE.Mesh(squareGeometry(`ring|${data.ringName}`, grid / 2, front + outer * 0.004, ringUv), sheetMaterial(sheet.texture, [ringUv.u0, ringUv.v0, ringUv.u1, ringUv.v1], rimTint ?? new THREE.Color(1, 1, 1), band))));
    return { parts, front: front + outer * 0.008, back: depth / 2 };
}

function plainRim({ outer, depth, rimTint, background }) {
    const steel = rimTint ?? new THREE.Color(STEEL);
    const parts = [
        new THREE.Mesh(plateGeometry(outer, depth), standardMaterial(`steel|${steel.getHexString()}`, { color: steel, metalness: 0.6, roughness: 0.4 })),
        new THREE.Mesh(plateGeometry(outer * FALLBACK_INNER, depth * 1.2), standardMaterial(`backdrop|${background.getHexString()}`, { color: background, metalness: 0.2, roughness: 0.8 })),
    ];
    return { parts, front: depth * 0.6 + outer * 0.008, back: depth * 0.6 };
}

export async function buildMedallion(token3d) {
    const doc = token3d.document;
    const src = doc.ring.subject.texture || doc.texture.src;
    const texture = (await token3d._parent.helpers.loadTexture(src)) ?? token3d.texture;
    texture.colorSpace = THREE.SRGBColorSpace;
    const grid = (Math.min(doc.width, doc.height) * canvas.grid.size) / factor;
    const outer = RIM_OUTER * grid;
    const depth = outer * PLATE_DEPTH;
    const size = Math.max(doc.ring.subject.scale || 1, 0.05) * grid;
    const colors = ringColors(token3d.token);
    const rimTint = isWhite(colors.ring) ? null : new THREE.Color(Color.from(colors.ring).css);
    const background = backgroundColor(colors.background);
    const rim = await coreRim(token3d, { outer, grid, depth, rimTint, background, colors });

    const face = noOutline(new THREE.Mesh(faceGeometry(src, alphaBounds(src, texture.image), size, outer, rim.front), faceMaterial(texture, src, outer / size)));
    const pivot = new THREE.Group();
    pivot.position.y = outer;
    pivot.add(...rim.parts, face);
    const model = new THREE.Group();
    model.add(pivot);
    token3d.medallionPivot = pivot;
    token3d.medallionRadius = outer;
    token3d.medallionLift = rim.back + outer * 0.01;
    return { object: model, scene: model, model };
}

export function medallionProneTarget(token3d, position) {
    return position.clone().add(new THREE.Vector3(0, token3d.medallionLift, token3d.medallionRadius));
}

export function faceMedallion(token3d, camera) {
    const pivot = token3d.medallionPivot;
    if (!pivot || !token3d.model) return;
    let yaw = 0;
    if (!token3d.isProne) {
        const e = camera.matrixWorld.elements;
        yaw = Math.atan2(e[8] - e[4], e[10] - e[6]) - token3d.mesh.rotation.y - token3d.model.rotation.y;
    }
    if (pivot.rotation.y !== yaw) pivot.rotation.y = yaw;
}

