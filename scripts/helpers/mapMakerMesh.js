import * as THREE from "three";
import { factor } from "../main.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildTerrainMesh } from "./mapMakerTerrain.js";
import { windUniforms } from "../shaders/wind/windSway.js";


const UP = new THREE.Vector3(0, 1, 0);
const GLOW_INTENSITY = 0.6;
const GLOW_LUMA = 0.33;
const CRYSTAL_FRAGMENT = `
vec3 crystalView = normalize(vViewPosition);
float crystalFacing = clamp(abs(dot(normal, crystalView)), 0.0, 1.0);
float crystalRim = pow(1.0 - crystalFacing, 2.0);
float crystalCore = pow(crystalFacing, 4.0);
float crystalPulse = 0.88 + 0.12 * sin(fwTime * 1.4 + dot(vWorldPositionFoW.xz, vec2(3.1, 4.7)));
vec3 crystalHue = emissive / max(max(emissive.r, max(emissive.g, emissive.b)), 0.001);
vec3 crystalFilm = 0.5 + 0.5 * cos(6.2832 * (crystalRim * 1.4 + dot(normal, vec3(0.35, 0.55, 0.25)) + vec3(0.0, 0.33, 0.67)));
totalEmissiveRadiance *= crystalPulse * (0.35 + 1.4 * crystalCore);
totalEmissiveRadiance += crystalHue * crystalHue * crystalRim * 0.55 + crystalFilm * crystalHue * crystalRim * 0.18;
diffuseColor.rgb *= 0.6;
diffuseColor.a = mix(0.5, 0.95, crystalRim);
`;

function crystalShader(shader) {
    shader.uniforms.fwTime = windUniforms.fwTime;
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", "uniform float fwTime;\nvoid main() {").replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${CRYSTAL_FRAGMENT}`);
}

export async function buildMapMakerMesh(data) {
    if (data?.k === "kit") return buildKitMesh(data, 1 / factor);
    if (data?.k === "terrain") return buildTerrainMesh(data);
    const { geometry, groups } = buildMapMakerGeometry(data);
    if (data?.k === "anchor" || !groups.length) {
        return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
    }
    const materials = await Promise.all(groups.map((key) => getMapMakerMaterial(data.mats?.[key])));
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.userData.mapMaker = data.k;
    return mesh;
}

export function computeMapMakerBounds(data) {
    const { geometry } = buildMapMakerGeometry(data, { unitScale: 1 });
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    geometry.dispose();
    return { minX: b.min.x, maxX: b.max.x, minY: b.min.z, maxY: b.max.z, minZ: b.min.y, maxZ: b.max.y };
}

export async function computeMapMakerBoundsAsync(data) {
    if (data?.k === "terrain") return { minX: 0, maxX: data.w, minY: 0, maxY: data.h, minZ: data.min, maxZ: data.max };
    if (data?.k !== "kit") return computeMapMakerBounds(data);
    const b = new THREE.Box3();
    const matrix = new THREE.Matrix4();
    const part = new THREE.Matrix4();
    for (const p of data.parts ?? []) {
        part.fromArray(p.m);
        for (const piece of await loadKitPieces(p.src, p.node)) {
            if (!piece.geometry.boundingBox) piece.geometry.computeBoundingBox();
            const pb = piece.geometry.boundingBox.clone().applyMatrix4(matrix.multiplyMatrices(part, piece.matrix));
            if (p.clip) pb.intersect(new THREE.Box3(new THREE.Vector3(p.clip[0], p.clip[1], p.clip[2]), new THREE.Vector3(p.clip[3], p.clip[4], p.clip[5])));
            if (!pb.isEmpty()) b.union(pb);
        }
    }
    if (b.isEmpty()) return { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
    return { minX: b.min.x, maxX: b.max.x, minY: b.min.z, maxY: b.max.z, minZ: b.min.y, maxZ: b.max.y };
}


const kitPieceCache = new Map();

function loadKitPieces(src, node = null) {
    const cacheKey = node ? `${src}#${node}` : src;
    if (!kitPieceCache.has(cacheKey)) {
        kitPieceCache.set(
            cacheKey,
            (async () => {
                const model = node ? await game.Levels3DPreview.loader.loadAsync(src).catch(() => null) : await game.Levels3DPreview.helpers.loadModel(src);
                const scene = model?.scene ?? model?.model;
                if (!scene) {
                    console.warn(`3D Canvas | Map Maker: could not load kit piece ${src}`);
                    return [];
                }
                scene.updateMatrixWorld(true);
                const root = node ? scene.getObjectByName(node) : scene;
                if (!root) {
                    console.warn(`3D Canvas | Map Maker: node ${node} not found in ${src}`);
                    return [];
                }
                const pieces = [];
                root.traverse((child) => {
                    if (!child.isMesh || child.isSkinnedMesh) return;
                    const material = sharedKitMaterial(Array.isArray(child.material) ? child.material[0] : child.material);
                    pieces.push({ geometry: child.geometry, material, matrix: child.matrixWorld.clone() });
                });
                return pieces;
            })(),
        );
    }
    return kitPieceCache.get(cacheKey);
}

const kitMaterials = new Map();
const textureHashes = new WeakMap();
const TEXTURE_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap"];

function sharedKitMaterial(material) {
    if (!material) return material;
    const textures = TEXTURE_SLOTS.map((slot) => {
        const t = material[slot];
        return t ? [textureHash(t), t.colorSpace, t.flipY, t.wrapS, t.wrapT, t.channel, t.offset.x, t.offset.y, t.repeat.x, t.repeat.y, t.rotation].join(":") : "";
    });
    const key = [material.type, material.name, material.color?.getHexString(), material.emissive?.getHexString(), material.emissiveIntensity, material.roughness, material.metalness, material.opacity, material.transparent, material.alphaTest, material.side, material.vertexColors, material.normalScale?.x, material.normalScale?.y, ...textures].join("|");
    if (!kitMaterials.has(key)) kitMaterials.set(key, material);
    return kitMaterials.get(key);
}

function textureHash(texture) {
    let hash = textureHashes.get(texture);
    if (hash !== undefined) return hash;
    hash = texture.uuid;
    const image = texture.image;
    if (image?.width && image?.height) {
        try {
            const context = new OffscreenCanvas(16, 16).getContext("2d", { willReadFrequently: true });
            context.drawImage(image, 0, 0, 16, 16);
            let h = 2166136261;
            for (const v of context.getImageData(0, 0, 16, 16).data) h = Math.imul(h ^ v, 16777619);
            hash = `${image.width}x${image.height}:${h >>> 0}`;
        } catch {}
    }
    textureHashes.set(texture, hash);
    return hash;
}

export async function modelBounds(src, node = null) {
    const pieces = await loadKitPieces(src, node);
    const box = new THREE.Box3();
    for (const p of pieces) {
        if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
        box.union(p.geometry.boundingBox.clone().applyMatrix4(p.matrix));
    }
    return { min: box.min.toArray(), max: box.max.toArray() };
}

async function buildKitMesh(data, unitScale, { shareMaterials = false } = {}) {
    const parts = data.parts ?? [];
    const partKey = (p) => (p.node ? `${p.src}#${p.node}` : p.src);
    const sources = new Map(parts.map((p) => [partKey(p), p]));
    const loaded = new Map(await Promise.all([...sources].map(async ([k, p]) => [k, await loadKitPieces(p.src, p.node)])));
    const scale = new THREE.Matrix4().makeScale(unitScale, unitScale, unitScale);
    const buckets = new Map();
    const partMatrix = new THREE.Matrix4();
    const full = new THREE.Matrix4();
    for (const part of parts) {
        partMatrix.fromArray(part.m);
        const flip = partMatrix.determinant() < 0;
        for (const piece of loaded.get(partKey(part)) ?? []) {
            full.multiplyMatrices(scale, partMatrix).multiply(piece.matrix);
            let geo = piece.geometry.clone();
            for (const name of Object.keys(geo.attributes)) {
                if (!["position", "normal", "uv", "color", "tangent"].includes(name)) geo.deleteAttribute(name);
            }
            geo.morphAttributes = {};
            if (geo.index) geo = geo.toNonIndexed();
            const uvt = part.uv?.[piece.material.name];
            if (uvt && geo.attributes.uv) {
                const uv = geo.attributes.uv;
                for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvt[0] + uvt[1], uv.getY(i) * uvt[2] + uvt[3]);
            }
            geo.applyMatrix4(full);
            if (flip) flipWinding(geo);
            if (part.clip) {
                geo = clipToBox(geo, part.clip.map((v) => v * unitScale));
                if (!geo) continue;
            }
            const key = `${piece.material.uuid}|${part.c ?? ""}|${part.g ?? ""}|${Object.keys(geo.attributes).sort().join(",")}`;
            let bucket = buckets.get(key);
            if (!bucket) buckets.set(key, (bucket = { material: piece.material, tint: part.c, glow: part.g, geos: [] }));
            bucket.geos.push(geo);
        }
    }
    const group = new THREE.Group();
    for (const { material, tint, glow, geos } of buckets.values()) {
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        if (geos.length > 1) geos.forEach((g) => g.dispose());
        if (!merged) continue;
        merged.computeBoundingBox();
        const override = !shareMaterials && data.mo?.[material.name];
        const mat = shareMaterials ? material : Object.assign(material.clone(), override || {});
        if (!shareMaterials && tint && mat.color) mat.color = mat.color.clone().multiply(new THREE.Color(tint));
        if (!shareMaterials && glow && mat.emissive) {
            const emissive = new THREE.Color(glow);
            const luma = 0.2126 * emissive.r + 0.7152 * emissive.g + 0.0722 * emissive.b;
            Object.assign(mat, { color: emissive.clone().multiplyScalar(0.15), emissive, emissiveIntensity: GLOW_INTENSITY * Math.min(1, GLOW_LUMA / Math.max(luma, 0.01)), roughness: 0.12, metalness: 0, envMapIntensity: 1.6, transparent: true, depthWrite: true });
            mat.userData.batchShader = true;
            mat.onBeforeCompile = crystalShader;
        }
        group.add(new THREE.Mesh(merged, mat));
    }
    const proxy = solidProxy(parts, loaded, partKey, unitScale);
    if (proxy) group.add(proxy);
    group.userData.mapMaker = "kit";
    return group;
}

const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });

function solidProxy(parts, loaded, partKey, unitScale) {
    const boxes = [];
    const scale = new THREE.Matrix4().makeScale(unitScale, unitScale, unitScale);
    const matrix = new THREE.Matrix4();
    for (const part of parts) {
        if (!part.s) continue;
        matrix.multiplyMatrices(scale, new THREE.Matrix4().fromArray(part.m));
        for (const piece of loaded.get(partKey(part)) ?? []) {
            if (!piece.geometry.boundingBox) piece.geometry.computeBoundingBox();
            const box = piece.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, piece.matrix));
            if (part.clip) box.intersect(new THREE.Box3().setFromArray(part.clip.map((v) => v * unitScale)));
            if (box.isEmpty()) continue;
            box.expandByScalar(unitScale);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            boxes.push(new THREE.BoxGeometry(size.x, size.y, size.z).translate(center.x, center.y, center.z));
        }
    }
    if (!boxes.length) return null;
    const geometry = mergeGeometries(boxes, false);
    boxes.forEach((b) => b.dispose());
    const mesh = new THREE.Mesh(geometry, proxyMaterial);
    mesh.userData.kitProxy = true;
    return mesh;
}

function clipToBox(geo, box) {
    const names = Object.keys(geo.attributes);
    const sizes = names.map((n) => geo.attributes[n].itemSize);
    const pos = names.indexOf("position");
    const vertex = (i) => names.map((n, k) => Array.from(geo.attributes[n].array.slice(i * sizes[k], (i + 1) * sizes[k])));
    const lerp = (a, b, t) => a.map((attr, k) => attr.map((v, c) => v + (b[k][c] - v) * t));
    const out = names.map(() => []);
    for (let i = 0; i < geo.attributes.position.count; i += 3) {
        let poly = [vertex(i), vertex(i + 1), vertex(i + 2)];
        for (let axis = 0; axis < 3 && poly.length; axis++) {
            for (const [limit, sign] of [[box[axis], 1], [box[axis + 3], -1]]) {
                const d = (v) => (v[pos][axis] - limit) * sign;
                const next = [];
                poly.forEach((a, k) => {
                    const b = poly[(k + 1) % poly.length];
                    if (d(a) >= 0) next.push(a);
                    if (d(a) >= 0 !== d(b) >= 0) next.push(lerp(a, b, d(a) / (d(a) - d(b))));
                });
                poly = next;
            }
        }
        for (let k = 1; k + 1 < poly.length; k++) for (const v of [poly[0], poly[k], poly[k + 1]]) v.forEach((attr, n) => out[n].push(...attr));
    }
    geo.dispose();
    if (!out[pos].length) return null;
    const res = new THREE.BufferGeometry();
    names.forEach((n, k) => res.setAttribute(n, new THREE.Float32BufferAttribute(out[k], sizes[k])));
    return res;
}

function flipWinding(geo) {
    for (const attr of Object.values(geo.attributes)) {
        const a = attr.array;
        const s = attr.itemSize;
        for (let i = 0; i < attr.count; i += 3) {
            for (let k = 0; k < s; k++) {
                const t = a[(i + 1) * s + k];
                a[(i + 1) * s + k] = a[(i + 2) * s + k];
                a[(i + 2) * s + k] = t;
            }
        }
        attr.needsUpdate = true;
    }
}

export function buildMapMakerGeometry(data, { unitScale = 1 / factor } = {}) {
    let res;
    switch (data?.k) {
        case "wall":
            res = buildWall(data);
            break;
        case "floor":
            res = buildFloor(data);
            break;
        default:
            res = { buckets: new Map() };
    }
    const geometry = bucketsToGeometry(res.buckets, data);
    if (!geometry) return { geometry: new THREE.BoxGeometry(0.01, 0.01, 0.01), groups: [] };
    geometry.geometry.scale(unitScale, unitScale, unitScale);
    return geometry;
}


function buildWall(data) {
    const buckets = new Map();
    for (const seg of data.segs ?? []) {
        const t = seg.t ?? data.t ?? 20;
        const h = seg.h ?? data.h ?? 200;
        const base = seg.base ?? data.b ?? 0;
        const ax = seg.a[0], ay = seg.a[1];
        const dx = seg.b[0] - ax, dy = seg.b[1] - ay;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;
        const dir = { x: dx / len, y: dy / len };
        const n = { x: -dir.y, y: dir.x };
        const u0 = -(seg.e0 ?? 0);
        const u1 = len + (seg.e1 ?? 0);
        const ops = (seg.ops ?? []).filter((o) => o.w > 0 && o.y1 > o.y0);

        const shape = new THREE.Shape();
        shape.moveTo(u0, -base);
        shape.lineTo(u1, -base);
        shape.lineTo(u1, h);
        shape.lineTo(u0, h);
        shape.lineTo(u0, -base);
        for (const op of ops) {
            const y0 = Math.max(op.y0, -base + 0.5);
            const y1 = Math.min(op.y1, h - 0.5);
            shape.holes.push(openingPath(op.u, op.w, y0, y1, op.s));
        }

        const matrix = segmentMatrix(ax, ay, dir, n, t);
        const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, steps: 1, curveSegments: 10 });
        wallGeo.applyMatrix4(matrix);
        const capTolerance = 0.5;
        addTriangles(buckets, wallGeo, (normal, centroid) => {
            const d = normal.x * n.x + normal.z * n.y;
            if (d > 0.7) return seg.mp;
            if (d < -0.7) return seg.mn;
            const along = normal.x * dir.x + normal.z * dir.y;
            if (Math.abs(along) > 0.7) {
                const u = (centroid.x - ax) * dir.x + (centroid.z - ay) * dir.y;
                if (along < 0 && Math.abs(u - u0) < capTolerance) return seg.c0 ?? seg.mc ?? seg.mp;
                if (along > 0 && Math.abs(u - u1) < capTolerance) return seg.c1 ?? seg.mc ?? seg.mp;
            }
            return seg.mc ?? seg.mp;
        });
        wallGeo.dispose();

        for (const op of ops) {
            const f = op.f ?? 0;
            if (f <= 0) continue;
            const p = op.p ?? 2;
            const q = op.q ?? p;
            const y0 = Math.max(op.y0, -base + 0.5);
            const y1 = Math.min(op.y1, h - 0.5);
            const isDoor = op.d ?? y0 <= f + 1;
            const frameShape = framePath(op.u, op.w - 1.5, isDoor ? y0 : y0 + 0.75, y1 - 0.75, op.s, f, isDoor);
            const frameMatrix = segmentMatrix(ax + (n.x * (p - q)) / 2, ay + (n.y * (p - q)) / 2, dir, n, t + p + q);
            const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: t + p + q, bevelEnabled: false, steps: 1, curveSegments: 10 });
            frameGeo.applyMatrix4(frameMatrix);
            addTriangles(buckets, frameGeo, () => op.fm ?? seg.mc ?? seg.mp);
            frameGeo.dispose();
        }
    }
    return { buckets };
}

function segmentMatrix(ax, ay, dir, n, depth) {
    const m = new THREE.Matrix4();
    m.makeBasis(new THREE.Vector3(dir.x, 0, dir.y), UP, new THREE.Vector3(n.x, 0, n.y));
    m.setPosition(ax - (n.x * depth) / 2, 0, ay - (n.y * depth) / 2);
    return m;
}

function openingPath(uc, w, y0, y1, style) {
    const path = new THREE.Path();
    const l = uc - w / 2;
    const r = uc + w / 2;
    path.moveTo(l, y0);
    path.lineTo(r, y0);
    if (style === "arch") {
        const radius = w / 2;
        const spring = Math.max(y0 + 1, y1 - radius);
        path.lineTo(r, spring);
        path.absarc(uc, spring, radius, 0, Math.PI, false);
        path.lineTo(l, y0);
    } else {
        path.lineTo(r, y1);
        path.lineTo(l, y1);
        path.lineTo(l, y0);
    }
    return path;
}

function framePath(uc, w, y0, y1, style, f, isDoor) {
    const l = uc - w / 2;
    const r = uc + w / 2;
    if (!isDoor) {
        const outer = new THREE.Shape();
        const ol = l - f, or = r + f, ob = y0 - f, ot = y1 + f;
        if (style === "arch") {
            const radius = w / 2 + f;
            const spring = Math.max(y0 + 1, y1 - w / 2);
            outer.moveTo(ol, ob);
            outer.lineTo(or, ob);
            outer.lineTo(or, spring);
            outer.absarc(uc, spring, radius, 0, Math.PI, false);
            outer.lineTo(ol, ob);
        } else {
            outer.moveTo(ol, ob);
            outer.lineTo(or, ob);
            outer.lineTo(or, ot);
            outer.lineTo(ol, ot);
            outer.lineTo(ol, ob);
        }
        outer.holes.push(openingPath(uc, w, y0, y1, style));
        return outer;
    }
    const s = new THREE.Shape();
    s.moveTo(l - f, y0);
    s.lineTo(l, y0);
    if (style === "arch") {
        const radius = w / 2;
        const spring = Math.max(y0 + 1, y1 - radius);
        s.lineTo(l, spring);
        s.absarc(uc, spring, radius, Math.PI, 0, true);
        s.lineTo(r, y0);
        s.lineTo(r + f, y0);
        s.lineTo(r + f, spring);
        s.absarc(uc, spring, radius + f, 0, Math.PI, false);
        s.lineTo(l - f, y0);
    } else {
        s.lineTo(l, y1);
        s.lineTo(r, y1);
        s.lineTo(r, y0);
        s.lineTo(r + f, y0);
        s.lineTo(r + f, y1 + f);
        s.lineTo(l - f, y1 + f);
        s.lineTo(l - f, y0);
    }
    return s;
}


function buildFloor(data) {
    const buckets = new Map();
    const th = Math.max(data.th ?? 4, 0.5);
    for (const poly of data.polys ?? []) {
        const outer = poly.outer ?? poly;
        if (!outer || outer.length < 6) continue;
        const shape = new THREE.Shape();
        shape.moveTo(outer[0], outer[1]);
        for (let i = 2; i < outer.length; i += 2) shape.lineTo(outer[i], outer[i + 1]);
        for (const hole of poly.holes ?? []) {
            if (hole.length < 6) continue;
            const path = new THREE.Path();
            path.moveTo(hole[0], hole[1]);
            for (let i = 2; i < hole.length; i += 2) path.lineTo(hole[i], hole[i + 1]);
            shape.holes.push(path);
        }
        const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, steps: 1 });
        geo.rotateX(Math.PI / 2);
        geo.translate(0, th, 0);
        addTriangles(buckets, geo, (normal) => (normal.y < -0.7 ? data.mb ?? data.m : data.m));
        geo.dispose();
    }
    return { buckets };
}


const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _centroid = new THREE.Vector3();

function addTriangles(buckets, geometry, pickMaterial) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i += 3) {
        _a.fromBufferAttribute(pos, i);
        _b.fromBufferAttribute(pos, i + 1);
        _c.fromBufferAttribute(pos, i + 2);
        _e1.subVectors(_b, _a);
        _e2.subVectors(_c, _a);
        _n.crossVectors(_e1, _e2);
        if (_n.lengthSq() < 1e-12) continue;
        _n.normalize();
        _centroid.set((_a.x + _b.x + _c.x) / 3, (_a.y + _b.y + _c.y) / 3, (_a.z + _b.z + _c.z) / 3);
        const key = pickMaterial(_n, _centroid) ?? "default";
        let arr = buckets.get(key);
        if (!arr) buckets.set(key, (arr = []));
        arr.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    }
    if (geo !== geometry) geo.dispose();
}

function bucketsToGeometry(buckets, data) {
    if (!buckets.size) return null;
    const ox = data.o?.[0] ?? 0;
    const oy = data.o?.[1] ?? 0;
    const groups = [];
    const positions = [];
    const uvs = [];
    const geometry = new THREE.BufferGeometry();
    let start = 0;
    let groupIndex = 0;
    for (const [key, arr] of buckets) {
        const def = data.mats?.[key];
        const scale = def?.s || 100;
        for (let i = 0; i < arr.length; i += 9) {
            _a.set(arr[i], arr[i + 1], arr[i + 2]);
            _b.set(arr[i + 3], arr[i + 4], arr[i + 5]);
            _c.set(arr[i + 6], arr[i + 7], arr[i + 8]);
            _n.crossVectors(_e1.subVectors(_b, _a), _e2.subVectors(_c, _a)).normalize();
            const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
            for (const v of [_a, _b, _c]) {
                positions.push(v.x, v.y, v.z);
                const wx = v.x + ox;
                const wz = v.z + oy;
                let u, w;
                if (ay >= ax && ay >= az) {
                    u = wx;
                    w = def?.flipV ? -wz : wz;
                    if (def?.rot) [u, w] = [-w, u];
                } else if (ax >= az) {
                    u = _n.x > 0 ? -wz : wz;
                    w = v.y;
                } else {
                    u = _n.z > 0 ? wx : -wx;
                    w = v.y;
                }
                uvs.push(u / scale, w / scale);
            }
        }
        const count = arr.length / 3;
        geometry.addGroup(start, count, groupIndex++);
        groups.push(key);
        start += count;
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return { geometry, groups };
}


const mapTextures = new Map();

function loadMapTexture(src, linear) {
    const key = `${src}|${linear}`;
    if (!mapTextures.has(key)) {
        mapTextures.set(
            key,
            game.Levels3DPreview.helpers.loadTexture(src, { linear }).then((texture) => {
                if (!texture?.image) {
                    mapTextures.delete(key);
                    return null;
                }
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                return texture;
            }),
        );
    }
    return mapTextures.get(key);
}

async function getMapMakerMaterial(def) {
    const helpers = game.Levels3DPreview.helpers;
    let material;
    try {
        if (def?.src) {
            if (def.maps) {
                const base = def.src.replace(/_NormalGL\.(\w+)$/, "");
                const ext = def.src.split(".").pop();
                const slots = { Color: "map", NormalGL: "normalMap", Roughness: "roughnessMap", Metalness: "metalnessMap" };
                material = new THREE.MeshStandardMaterial();
                await Promise.all(
                    def.maps.map(async (type) => {
                        const texture = await loadMapTexture(`${base}_${type}.${ext}`, type !== "Color");
                        if (texture) material[slots[type]] = texture;
                    }),
                );
            } else if (helpers.isPBR(def.src)) {
                material = await helpers.getPBRMat(def.src, { getMatClone: true });
            } else {
                const texture = await helpers.loadTexture(def.src);
                if (texture?.image) {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                }
                material = new THREE.MeshStandardMaterial({ map: texture?.image ? texture : null });
            }
        }
    } catch (e) {
        console.error("3D Canvas | Map Maker: failed to load material", def?.src, e);
    }
    material ??= new THREE.MeshStandardMaterial({ color: 0xbbbbbb });
    material.roughness = def?.roughness ?? material.roughness ?? 1;
    material.metalness = def?.metalness ?? 0;
    if (def?.tint) material.color = new THREE.Color(def.tint);
    if (def?.env != null) material.envMapIntensity = def.env;
    material.needsUpdate = true;
    return material;
}
