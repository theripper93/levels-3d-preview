import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { dynamicImport } from "../lib/utils.js";
import { factor } from "../main.js";

const MERGE_PROTECTED = new Set(["base", "eyeL", "eyeR", "portrait-target", "sightMesh"]);
const MATERIAL_MAPS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap", "displacementMap", "lightMap", "specularMap", "envMap", "clearcoatMap", "clearcoatNormalMap", "clearcoatRoughnessMap", "sheenColorMap", "sheenRoughnessMap", "transmissionMap", "thicknessMap", "specularIntensityMap", "specularColorMap", "iridescenceMap", "anisotropyMap", "matcap", "gradientMap"];
const BAKE_MAPS = ["map", "alphaMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];
const TEXTURE_SIZES = [256, 512, 1024, 2048, 4096];
const TEXELS_PER_SQUARE = 128;
const PREVIEW_SIZE = 280;
const MODE = { color: 0, normal: 1, orm: 2, emissive: 3, mask: 4 };
const XATLAS_PATH = "modules/levels-3d-preview/scripts/lib/xatlas/index.mjs";
const BAKE_VERTEX = `precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec2 uv1;
in vec4 color;
in vec4 tangent;
in vec2 bakeUv;
out vec3 vPos;
out vec3 vNormal;
out vec2 vUv0;
out vec2 vUv1;
out vec4 vColor;
out vec4 vTangent;
out vec2 vBakeUv;
void main() {
    vPos = position;
    vNormal = normal;
    vUv0 = uv;
    vUv1 = uv1;
    vColor = color;
    vTangent = tangent;
    vBakeUv = bakeUv;
    gl_Position = vec4(bakeUv * 2.0 - 1.0, 0.0, 1.0);
}`;
const QUAD_VERTEX = `precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const DILATE_FRAGMENT = `precision highp float;
uniform sampler2D tex;
uniform sampler2D mask;
uniform vec2 texel;
in vec2 vUv;
out vec4 outColor;
void main() {
    if (textureLod(mask, vUv, 0.0).a > 0.5) {
        outColor = textureLod(tex, vUv, 0.0);
        return;
    }
    vec4 sum = vec4(0.0);
    float count = 0.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vUv + vec2(float(x), float(y)) * texel;
            if (textureLod(mask, offset, 0.0).a > 0.5) {
                sum += textureLod(tex, offset, 0.0);
                count += 1.0;
            }
        }
    }
    outColor = count > 0.0 ? sum / count : textureLod(tex, vUv, 0.0);
}`;

let xatlasModule;

export function mergeMeshes(model) {
    const groups = new Map();
    let meshCount = 0;
    model.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(model.matrixWorld).invert();
    model.traverse((child) => {
        if (!child.isMesh) return;
        meshCount++;
        if (!isMergeable(child)) return;
        const matrix = new THREE.Matrix4().multiplyMatrices(toRoot, child.matrixWorld);
        if (matrix.determinant() <= 0) return;
        const key = `${materialKey(child.material)}|${attributeKey(child.geometry)}|${child.castShadow}|${child.receiveShadow}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ mesh: child, matrix });
    });
    let merged = 0;
    for (const entries of groups.values()) {
        if (entries.length < 2) continue;
        const looseBox = new THREE.Box3();
        const geometries = entries.map(({ mesh, matrix }) => {
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            looseBox.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
            const geometry = mesh.geometry.clone().applyMatrix4(matrix);
            if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
            geometry.clearGroups();
            return geometry;
        });
        const geometry = mergeGeometries(geometries);
        geometries.forEach((g) => g.dispose());
        if (!geometry) continue;
        geometry.boundingBox = looseBox;
        const source = entries[0].mesh;
        const mesh = new THREE.Mesh(geometry, source.material);
        mesh.name = source.name;
        mesh.castShadow = source.castShadow;
        mesh.receiveShadow = source.receiveShadow;
        mesh.customDepthMaterial = source.customDepthMaterial;
        for (const { mesh: original } of entries) original.removeFromParent();
        model.add(mesh);
        merged += entries.length - 1;
    }
    if (merged) console.log(`3D Canvas | Merged Meshes: ${meshCount} -> ${meshCount - merged}`);
}

export function isMergeable(mesh) {
    const { material, geometry } = mesh;
    if (!material || Array.isArray(material) || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh) return false;
    if (material.transparent || material.name === "effect" || MERGE_PROTECTED.has(mesh.name)) return false;
    if (Object.keys(geometry.morphAttributes).length || geometry.groups.length > 1) return false;
    if (Object.values(geometry.attributes).some((attribute) => attribute.isInterleavedBufferAttribute)) return false;
    return !!geometry.attributes.position;
}

export function materialKey(material) {
    const texture = (t) => (t ? `${t.source?.uuid ?? t.uuid}:${t.offset.x},${t.offset.y}:${t.repeat.x},${t.repeat.y}:${t.rotation}:${t.channel}:${t.wrapS}:${t.wrapT}:${t.flipY}:${t.colorSpace}` : "");
    const values = [material.type, material.side, material.alphaTest, material.opacity, material.vertexColors, material.flatShading, material.wireframe, material.depthWrite, material.depthTest, material.blending];
    for (const key of ["color", "emissive", "specularColor", "sheenColor", "attenuationColor"]) values.push(material[key]?.getHexString?.() ?? "");
    for (const key of ["roughness", "metalness", "emissiveIntensity", "aoMapIntensity", "envMapIntensity", "bumpScale", "displacementScale", "clearcoat", "transmission", "ior", "sheen", "specularIntensity"]) values.push(material[key] ?? "");
    values.push(material.normalScale ? `${material.normalScale.x},${material.normalScale.y}` : "");
    for (const key of MATERIAL_MAPS) values.push(texture(material[key]));
    if (material.isShaderMaterial || material.onBeforeCompile?.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) values.push(material.uuid);
    return values.join("|");
}

export function attributeKey(geometry) {
    return Object.entries(geometry.attributes)
        .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}:${!!attribute.isInterleavedBufferAttribute}`)
        .sort()
        .join(",");
}

const MODEL_FLAG = "flags.levels-3d-preview.model3d";

function isHeroForge(path) {
    return /heroforge/i.test(path ?? "");
}

function modelPath(document) {
    return foundry.utils.getProperty(document, MODEL_FLAG);
}

export function injectBakeButton(app, html) {
    const picker = html.querySelector(`[name="${MODEL_FLAG}"]`);
    const target = app.document ?? app.token;
    if (!game.user.isGM || !picker || !target || picker.parentElement.querySelector(".levels3d-bake-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("levels3d-bake-button");
    button.dataset.tooltip = game.i18n.localize("levels3dpreview.modelBaker.title");
    button.innerHTML = `<i class="fas fa-fire" inert></i>`;
    button.addEventListener("click", () => {
        if (!picker.value) return ui.notifications.warn("levels3dpreview.modelBaker.errors.noModel", { localize: true });
        if (isHeroForge(picker.value)) return ui.notifications.warn("levels3dpreview.modelBaker.errors.heroForge", { localize: true });
        new ModelBaker(target, picker).render(true);
    });
    picker.after(button);
}

export function modelStats(model) {
    const materials = new Set();
    const textures = new Set();
    let meshes = 0;
    let drawCalls = 0;
    model.traverse((child) => {
        if (!child.isMesh) return;
        meshes++;
        drawCalls += child.geometry.groups.length || 1;
        for (const material of [child.material].flat()) {
            if (!material) continue;
            materials.add(material);
            for (const key of MATERIAL_MAPS) if (material[key]?.isTexture) textures.add(material[key].source?.uuid ?? material[key].uuid);
        }
    });
    return { meshes, materials: materials.size, textures: textures.size, drawCalls };
}

export async function bakeModel(path, { size = 512, onProgress = () => {} } = {}) {
    const helpers = game.Levels3DPreview.helpers;
    const loaded = await helpers.loadModel(path);
    if (!loaded?.model) throw new Error(game.i18n.localize("levels3dpreview.modelBaker.errors.load"));
    const model = loaded.model;
    let unsupported = !!loaded.object?.animations?.some((clip) => clip.tracks.length);
    model.traverse((child) => {
        if (child.isSkinnedMesh || child.isInstancedMesh || child.isBatchedMesh || (child.isMesh && Object.keys(child.geometry.morphAttributes).length)) unsupported = true;
    });
    if (unsupported) throw new Error(game.i18n.localize("levels3dpreview.modelBaker.errors.animated"));
    model.removeFromParent();
    model.updateMatrixWorld(true);
    const fitBox = new THREE.Box3().setFromObject(model);
    const parts = collectParts(model);
    if (!parts.length) throw new Error(game.i18n.localize("levels3dpreview.modelBaker.errors.load"));
    const result = await bakeParts(parts, fitBox, { size, onProgress, name: path.split("/").pop().split(".")[0] });
    return { ...result, before: modelStats(model) };
}

export async function bakeTiles(entities, { size = 512, onProgress = () => {} } = {}) {
    const parts = entities.flatMap((entity) => {
        entity.mesh.updateWorldMatrix(true, true);
        return collectParts(entity.mesh, tileSkip(entity));
    });
    if (!parts.length) throw new Error(game.i18n.localize("levels3dpreview.modelBaker.errors.load"));
    const box = new THREE.Box3();
    parts.forEach((part) => box.union(new THREE.Box3().setFromArray(part.positions)));
    for (const axis of ["x", "z"]) {
        const min = Math.floor(box.min[axis] * factor);
        const max = Math.ceil(box.max[axis] * factor);
        box.min[axis] = min / factor;
        box.max[axis] = (max + ((max - min) % 2)) / factor;
    }
    const origin = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    for (const part of parts) {
        for (let i = 0; i < part.positions.length; i += 3) {
            part.positions[i] -= origin.x;
            part.positions[i + 1] -= origin.y;
            part.positions[i + 2] -= origin.z;
        }
    }
    const before = partStats(parts);
    const result = await bakeParts(parts, box.clone().translate(origin.clone().negate()), { size, onProgress, name: canvas.scene.name.slugify() });
    return { ...result, before, box };
}

async function bakeParts(parts, fitBox, { size, onProgress, name }) {
    const textured = parts.filter((part) => !isFlatMaterial(part.material));
    const flat = parts.filter((part) => isFlatMaterial(part.material));
    let atlas = null;
    let textures = null;
    if (textured.length) {
        onProgress(0.1, "unwrap");
        atlas = await unwrapParts(textured, size);
        onProgress(0.3, "bake");
        textures = bakeTextures(textured, atlas, size, (pct) => onProgress(0.3 + pct * 0.5, "bake"));
    }
    const { geometry, slots } = buildGeometry(textured, flat, atlas, fitBox);
    const materials = buildMaterials(textures?.material, flat, slots);
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = name;
    onProgress(0.85, "export");
    const glb = await new GLTFExporter().parseAsync(mesh, { binary: true });
    const after = { ...modelStats(mesh), textures: textures?.count ?? 0 };
    textures?.dispose();
    materials.forEach((material) => material.dispose());
    geometry.dispose();
    return { glb, after };
}

function eachVisibleMesh(root, skip, callback) {
    if (skip.has(root)) return;
    if (root.isMesh && !root.material?.wireframe) callback(root);
    for (const child of root.children) if (child.visible) eachVisibleMesh(child, skip, callback);
}

function partStats(parts) {
    const textures = new Set();
    for (const { material } of parts) for (const key of MATERIAL_MAPS) if (material[key]?.isTexture) textures.add(material[key].source?.uuid ?? material[key].uuid);
    return { meshes: new Set(parts.map((part) => part.object)).size, materials: new Set(parts.map((part) => part.material)).size, textures: textures.size, drawCalls: parts.length };
}

function collectParts(model, skip = new Set()) {
    const parts = [];
    eachVisibleMesh(model, skip, (child) => {
        const geometry = child.geometry;
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        const materials = [child.material].flat();
        const index = geometry.index;
        const count = index ? index.count : geometry.attributes.position.count;
        const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
        const matrix = child.matrixWorld;
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
        const flip = matrix.determinant() < 0;
        for (const group of groups) {
            const material = materials[group.materialIndex ?? 0];
            if (!material || material.visible === false) continue;
            const remap = new Int32Array(geometry.attributes.position.count).fill(-1);
            const source = [];
            const indices = [];
            const end = Math.min(group.start + group.count, count);
            for (let i = group.start; i + 2 < end; i += 3) {
                const triangle = [i, i + 1, i + 2].map((j) => (index ? index.getX(j) : j));
                if (flip) triangle.reverse();
                for (const vertex of triangle) {
                    if (remap[vertex] < 0) remap[vertex] = source.push(vertex) - 1;
                    indices.push(remap[vertex]);
                }
            }
            if (!indices.length) continue;
            const positions = new Float32Array(source.length * 3);
            const normals = new Float32Array(source.length * 3);
            const vector = new THREE.Vector3();
            source.forEach((vertex, i) => {
                vector.fromBufferAttribute(geometry.attributes.position, vertex).applyMatrix4(matrix).toArray(positions, i * 3);
                vector.fromBufferAttribute(geometry.attributes.normal, vertex).applyMatrix3(normalMatrix).normalize().toArray(normals, i * 3);
            });
            parts.push({ object: child, geometry, material, matrix, source, positions, normals, indices: Uint32Array.from(indices) });
        }
    });
    return parts;
}

async function unwrapParts(parts, size) {
    xatlasModule ??= await dynamicImport(foundry.utils.getRoute(XATLAS_PATH)).then((module) => module.default());
    const atlas = xatlasModule.createAtlas();
    try {
        for (const part of parts) {
            const error = atlas.addMesh({ positions: part.positions, normals: part.normals, indices: part.indices });
            if (error !== xatlasModule.AddMeshError.Success) throw new Error(xatlasModule.addMeshErrorString(error));
        }
        atlas.computeCharts();
        const packOptions = { resolution: size, padding: Math.max(2, Math.round(size / 512)), bilinear: true };
        atlas.packCharts(packOptions);
        for (let i = 0; i < 8 && atlas.atlasCount > 1; i++) {
            packOptions.texelsPerUnit = atlas.texelsPerUnit * 0.8;
            atlas.packCharts(packOptions);
        }
        if (atlas.atlasCount > 1) throw new Error(game.i18n.localize("levels3dpreview.modelBaker.errors.atlas"));
        return { width: atlas.width, height: atlas.height, padding: packOptions.padding, meshes: parts.map((part, i) => atlas.getMesh(i)) };
    } finally {
        atlas.destroy();
    }
}

function partGeometry(part, mesh, atlas) {
    const source = part.geometry.attributes;
    const count = mesh.vertexCount;
    const arrays = { position: new Float32Array(count * 3), normal: new Float32Array(count * 3), uv: new Float32Array(count * 2), uv1: new Float32Array(count * 2), color: new Float32Array(count * 4).fill(1), tangent: new Float32Array(count * 4), bakeUv: new Float32Array(count * 2) };
    const tangent = new THREE.Vector3();
    mesh.vertices.forEach((vertex, i) => {
        const local = vertex.xref;
        const original = part.source[local];
        arrays.position.set(part.positions.subarray(local * 3, local * 3 + 3), i * 3);
        arrays.normal.set(part.normals.subarray(local * 3, local * 3 + 3), i * 3);
        arrays.bakeUv[i * 2] = vertex.uv[0] / atlas.width;
        arrays.bakeUv[i * 2 + 1] = vertex.uv[1] / atlas.height;
        const uv = source.uv ?? source.uv1;
        if (uv) arrays.uv.set([uv.getX(original), uv.getY(original)], i * 2);
        const uv1 = source.uv1 ?? uv;
        if (uv1) arrays.uv1.set([uv1.getX(original), uv1.getY(original)], i * 2);
        if (source.color) arrays.color.set([source.color.getX(original), source.color.getY(original), source.color.getZ(original), source.color.itemSize === 4 ? source.color.getW(original) : 1], i * 4);
        if (source.tangent) {
            tangent.fromBufferAttribute(source.tangent, original).transformDirection(part.matrix).toArray(arrays.tangent, i * 4);
            arrays.tangent[i * 4 + 3] = source.tangent.getW(original);
        }
    });
    const geometry = new THREE.BufferGeometry();
    for (const [name, array] of Object.entries(arrays)) geometry.setAttribute(name, new THREE.BufferAttribute(array, array.length / count));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    return geometry;
}

function needsAlpha(material) {
    return !!(material.transparent || material.alphaTest > 0 || material.alphaMap || material.opacity < 1);
}

function bakeMaterial(part, uniforms) {
    const material = part.material;
    const maps = BAKE_MAPS.filter((key) => material[key]?.isTexture);
    const ownUniforms = {
        diffuse: { value: material.color?.clone() ?? new THREE.Color(1, 1, 1) },
        opacity: { value: material.opacity ?? 1 },
        emissive: { value: (material.emissive?.clone() ?? new THREE.Color(0, 0, 0)).multiplyScalar(material.emissiveIntensity ?? 1) },
        roughness: { value: material.roughness ?? 1 },
        metalness: { value: material.metalness ?? 0 },
        aoIntensity: { value: material.aoMapIntensity ?? 1 },
        normalScale: { value: material.normalScale?.clone() ?? new THREE.Vector2(1, 1) },
        vertexColors: { value: !!material.vertexColors && !!part.geometry.attributes.color },
        useTangent: { value: !!part.geometry.attributes.tangent },
    };
    const samplers = maps.map((key) => {
        const texture = material[key];
        if (texture.matrixAutoUpdate) texture.updateMatrix();
        ownUniforms[key] = { value: texture };
        ownUniforms[`${key}Transform`] = { value: texture.matrix };
        return `uniform sampler2D ${key};
uniform mat3 ${key}Transform;
vec2 uv_${key}() { return (${key}Transform * vec3(${texture.channel === 1 ? "vUv1" : "vUv0"}, 1.0)).xy; }
vec4 sample_${key}() { return texture(${key}, uv_${key}()); }`;
    });
    const has = (key) => maps.includes(key);
    return new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        uniforms: { ...uniforms, ...ownUniforms },
        vertexShader: BAKE_VERTEX,
        fragmentShader: `precision highp float;
uniform int mode;
uniform bool alphaOut;
uniform float emissiveScale;
uniform vec3 diffuse;
uniform float opacity;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float aoIntensity;
uniform vec2 normalScale;
uniform bool vertexColors;
uniform bool useTangent;
in vec3 vPos;
in vec3 vNormal;
in vec2 vUv0;
in vec2 vUv1;
in vec4 vColor;
in vec4 vTangent;
in vec2 vBakeUv;
out vec4 outColor;
${samplers.join("\n")}
vec3 srgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c));
}
mat3 tangentFrame(vec3 position, vec3 normal, vec2 uv, float faceSign) {
    vec3 q0 = dFdx(position);
    vec3 q1 = dFdy(position);
    vec2 st0 = dFdx(uv);
    vec2 st1 = dFdy(uv);
    vec3 q1perp = cross(q1, normal);
    vec3 q0perp = cross(normal, q0);
    vec3 T = q1perp * st0.x + q0perp * st1.x;
    vec3 B = q1perp * st0.y + q0perp * st1.y;
    float det = max(dot(T, T), dot(B, B));
    float scale = det == 0.0 ? 0.0 : inversesqrt(det) * faceSign;
    return mat3(T * scale, B * scale, normal);
}
void main() {
    float faceSign = gl_FrontFacing ? 1.0 : -1.0;
    vec3 N = normalize(vNormal);
    if (mode == ${MODE.mask}) {
        outColor = vec4(1.0);
    } else if (mode == ${MODE.color}) {
        vec4 c = vec4(diffuse, opacity);
        ${has("map") ? "c *= sample_map();" : ""}
        ${has("alphaMap") ? "c.a *= sample_alphaMap().g;" : ""}
        if (vertexColors) c *= vColor;
        outColor = vec4(srgb(c.rgb), alphaOut ? c.a : 1.0);
    } else if (mode == ${MODE.normal}) {
        vec3 n = N;
        ${has("normalMap") ? `vec3 mapN = sample_normalMap().xyz * 2.0 - 1.0;
        mapN.xy *= normalScale;
        mat3 tbn = useTangent ? mat3(normalize(vTangent.xyz), normalize(cross(N, vTangent.xyz) * vTangent.w), N) : tangentFrame(vPos, N, uv_normalMap(), faceSign);
        n = normalize(tbn * mapN);` : ""}
        mat3 frame = tangentFrame(vPos, N, vBakeUv, faceSign);
        vec3 tangential = n - N * dot(n, N);
        float a = dot(frame[0], frame[0]);
        float b = dot(frame[0], frame[1]);
        float d = dot(frame[1], frame[1]);
        float det = a * d - b * b;
        vec2 r = vec2(dot(frame[0], tangential), dot(frame[1], tangential));
        vec2 xy = det > 1e-12 ? vec2(d * r.x - b * r.y, a * r.y - b * r.x) / det : vec2(0.0);
        outColor = vec4(normalize(vec3(xy.x, -xy.y, max(dot(n, N), 0.0))) * 0.5 + 0.5, 1.0);
    } else if (mode == ${MODE.orm}) {
        float ao = ${has("aoMap") ? "(sample_aoMap().r - 1.0) * aoIntensity + 1.0" : "1.0"};
        float r = roughness${has("roughnessMap") ? " * sample_roughnessMap().g" : ""};
        float m = metalness${has("metalnessMap") ? " * sample_metalnessMap().b" : ""};
        outColor = vec4(ao, r, m, 1.0);
    } else {
        vec3 e = emissive${has("emissiveMap") ? " * sample_emissiveMap().rgb" : ""};
        outColor = vec4(srgb(e / emissiveScale), 1.0);
    }
}`,
    });
}

function bakeTextures(parts, atlas, size, onProgress) {
    const parent = game.Levels3DPreview;
    const renderer = parent.renderer;
    const materials = parts.map((part) => part.material);
    const alpha = materials.some(needsAlpha);
    const emissiveScale = Math.max(0, ...materials.map((m) => (m.emissive ? Math.max(m.emissive.r, m.emissive.g, m.emissive.b) * (m.emissiveIntensity ?? 1) : 0)));
    const roughness = materials.map((m) => m.roughness ?? 1);
    const metalness = materials.map((m) => m.metalness ?? 0);
    const hasAo = materials.some((m) => m.aoMap);
    const needsOrm = hasAo || materials.some((m) => m.roughnessMap || m.metalnessMap) || new Set(roughness).size > 1 || new Set(metalness).size > 1;
    const outputs = ["color", materials.some((m) => m.normalMap) && "normal", needsOrm && "orm", emissiveScale > 0 && "emissive"].filter(Boolean);
    const uniforms = { mode: { value: MODE.color }, alphaOut: { value: alpha }, emissiveScale: { value: emissiveScale || 1 } };
    const scene = new THREE.Scene();
    const meshes = parts.map((part, i) => {
        const mesh = new THREE.Mesh(partGeometry(part, atlas.meshes[i], atlas), bakeMaterial(part, uniforms));
        mesh.frustumCulled = false;
        scene.add(mesh);
        return mesh;
    });
    const quadMaterial = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        depthTest: false,
        depthWrite: false,
        uniforms: { tex: { value: null }, mask: { value: null }, texel: { value: new THREE.Vector2(1 / size, 1 / size) } },
        vertexShader: QUAD_VERTEX,
        fragmentShader: DILATE_FRAGMENT,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial);
    quad.frustumCulled = false;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const target = () => new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: false });
    const targets = [target(), target(), target(), target()];
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear };
    const pixels = new Uint8Array(size * size * 4);
    const canvases = {};
    if (parent._sharedContext) renderer.resetState();
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    try {
        outputs.forEach((output, i) => {
            let [current, spare, mask, maskSpare] = targets;
            uniforms.mode.value = MODE.mask;
            renderer.setRenderTarget(mask);
            renderer.render(scene, camera);
            uniforms.mode.value = MODE[output];
            renderer.setRenderTarget(current);
            renderer.render(scene, camera);
            for (let step = 0; step < atlas.padding * 2 + 4; step++) {
                quadMaterial.uniforms.mask.value = mask.texture;
                quadMaterial.uniforms.tex.value = current.texture;
                renderer.setRenderTarget(spare);
                renderer.render(quad, camera);
                quadMaterial.uniforms.tex.value = mask.texture;
                renderer.setRenderTarget(maskSpare);
                renderer.render(quad, camera);
                [current, spare, mask, maskSpare] = [spare, current, maskSpare, mask];
            }
            renderer.readRenderTargetPixels(current, 0, 0, size, size, pixels);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = size;
            canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0);
            canvases[output] = canvas;
            onProgress((i + 1) / outputs.length);
        });
    } finally {
        renderer.setRenderTarget(previous.target);
        renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear;
        if (parent._sharedContext) {
            renderer.resetState();
            parent.resetPixiState?.();
        }
        targets.forEach((t) => t.dispose());
        meshes.forEach((mesh) => {
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        quad.geometry.dispose();
        quadMaterial.dispose();
    }
    const texture = (output, colorSpace) => {
        if (!canvases[output]) return null;
        const texture = new THREE.CanvasTexture(canvases[output]);
        texture.flipY = false;
        texture.colorSpace = colorSpace;
        texture.userData.mimeType = "image/webp";
        return texture;
    };
    const orm = texture("orm", THREE.NoColorSpace);
    const material = new THREE.MeshStandardMaterial({
        name: "baked",
        map: texture("color", THREE.SRGBColorSpace),
        normalMap: texture("normal", THREE.NoColorSpace),
        normalScale: new THREE.Vector2(1, -1),
        roughnessMap: orm,
        metalnessMap: orm,
        aoMap: hasAo ? orm : null,
        roughness: orm ? 1 : roughness[0],
        metalness: orm ? 1 : metalness[0],
        emissiveMap: texture("emissive", THREE.SRGBColorSpace),
        emissive: emissiveScale > 0 ? 0xffffff : 0x000000,
        emissiveIntensity: emissiveScale || 1,
        alphaTest: Math.max(0, ...materials.map((m) => m.alphaTest ?? 0)),
        side: materials.some((m) => m.side === THREE.DoubleSide) ? THREE.DoubleSide : THREE.FrontSide,
    });
    return {
        material,
        count: outputs.length,
        dispose: () => {
            BAKE_MAPS.forEach((key) => material[key]?.dispose());
            material.dispose();
        },
    };
}

function uvSpan(geometry) {
    if (geometry.userData.uvSpan !== undefined) return geometry.userData.uvSpan;
    const uv = geometry.attributes.uv;
    let span = 0;
    if (uv) {
        let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
        for (let i = 0; i < uv.count; i++) {
            const u = uv.getX(i);
            const v = uv.getY(i);
            if (u < minU) minU = u;
            if (u > maxU) maxU = u;
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
        }
        span = Math.max(maxU - minU, maxV - minV);
    }
    return (geometry.userData.uvSpan = span);
}

function isTiling(mesh) {
    return [mesh.material].flat().some((material) => {
        const map = material && BAKE_MAPS.map((key) => material[key]).find(Boolean);
        if (!map) return false;
        return Math.max(map.repeat?.x ?? 1, map.repeat?.y ?? 1) * uvSpan(mesh.geometry) > TILING_SPAN;
    });
}

const triangle = new THREE.Triangle();

function texturedArea(mesh, group, count) {
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const scale = (factor / (canvas.grid?.size || 100)) ** 2;
    let area = 0;
    for (let i = group.start; i + 2 < Math.min(group.start + group.count, count); i += 3) {
        const [a, b, c] = [i, i + 1, i + 2].map((j) => (index ? index.getX(j) : j));
        triangle.a.fromBufferAttribute(position, a).applyMatrix4(mesh.matrixWorld);
        triangle.b.fromBufferAttribute(position, b).applyMatrix4(mesh.matrixWorld);
        triangle.c.fromBufferAttribute(position, c).applyMatrix4(mesh.matrixWorld);
        area += triangle.getArea();
    }
    return area * scale;
}

function sizeForArea(area) {
    return Math.sqrt(area / ATLAS_FILL) * TEXELS_PER_SQUARE;
}

function isFlatMaterial(material) {
    return !BAKE_MAPS.some((key) => material[key]) && !(material.emissive?.getHex() > 0 && (material.emissiveIntensity ?? 1) > 0);
}

function partVertices(part, mesh, atlas) {
    if (!mesh) return { count: part.positions.length / 3, xref: (i) => i, uv: () => [0, 0], indices: part.indices };
    return { count: mesh.vertexCount, xref: (i) => mesh.vertices[i].xref, uv: (i) => [mesh.vertices[i].uv[0] / atlas.width, mesh.vertices[i].uv[1] / atlas.height], indices: mesh.indices };
}

function vertexColor(part, vertex, target) {
    const material = part.material;
    const color = material.color ?? new THREE.Color(1, 1, 1);
    const source = material.vertexColors ? part.geometry.attributes.color : null;
    const original = part.source[vertex];
    target[0] = color.r * (source ? source.getX(original) : 1);
    target[1] = color.g * (source ? source.getY(original) : 1);
    target[2] = color.b * (source ? source.getZ(original) : 1);
    target[3] = (material.opacity ?? 1) * (source?.itemSize === 4 ? source.getW(original) : 1);
    return target;
}

function buildGeometry(textured, flat, atlas, fitBox) {
    const entries = [
        ...textured.map((part, i) => ({ part, vertices: partVertices(part, atlas.meshes[i], atlas), slot: part.material.transparent ? 1 : 0 })),
        ...flat.map((part) => ({ part, vertices: partVertices(part), slot: part.material.transparent ? 3 : 2 })),
    ].sort((a, b) => a.slot - b.slot);
    const vertexCount = entries.reduce((total, entry) => total + entry.vertices.count, 0);
    const indexCount = entries.reduce((total, entry) => total + entry.vertices.indices.length, 0);
    const position = new Float32Array((vertexCount + 2) * 3);
    const normal = new Float32Array((vertexCount + 2) * 3);
    const uv = new Float32Array((vertexCount + 2) * 2);
    const color = flat.length ? new Float32Array((vertexCount + 2) * 4).fill(1) : null;
    const index = new Uint32Array(indexCount);
    const groups = [];
    const rgba = [0, 0, 0, 1];
    let vertexOffset = 0;
    let indexOffset = 0;
    for (const { part, vertices, slot } of entries) {
        for (let i = 0; i < vertices.count; i++) {
            const local = vertices.xref(i);
            const target = vertexOffset + i;
            position.set(part.positions.subarray(local * 3, local * 3 + 3), target * 3);
            normal.set(part.normals.subarray(local * 3, local * 3 + 3), target * 3);
            uv.set(vertices.uv(i), target * 2);
            if (color && slot > 1) color.set(vertexColor(part, local, rgba), target * 4);
        }
        for (let i = 0; i < vertices.indices.length; i++) index[indexOffset + i] = vertices.indices[i] + vertexOffset;
        const last = groups.at(-1);
        if (last?.slot === slot) last.count += vertices.indices.length;
        else groups.push({ slot, start: indexOffset, count: vertices.indices.length });
        vertexOffset += vertices.count;
        indexOffset += vertices.indices.length;
    }
    const tightBox = new THREE.Box3().setFromArray(position.subarray(0, vertexCount * 3));
    const keepFit = fitBox.min.distanceTo(tightBox.min) + fitBox.max.distanceTo(tightBox.max) > 1e-6;
    const count = keepFit ? vertexCount + 2 : vertexCount;
    if (keepFit) {
        fitBox.union(tightBox);
        fitBox.min.toArray(position, vertexCount * 3);
        fitBox.max.toArray(position, (vertexCount + 1) * 3);
        normal.set([0, 1, 0, 0, 1, 0], vertexCount * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position.subarray(0, count * 3), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normal.subarray(0, count * 3), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv.subarray(0, count * 2), 2));
    if (color) geometry.setAttribute("color", new THREE.BufferAttribute(color.subarray(0, count * 4), 4));
    geometry.setIndex(new THREE.BufferAttribute(count > 65535 ? index : Uint16Array.from(index), 1));
    groups.forEach((group, i) => geometry.addGroup(group.start, group.count, i));
    return { geometry, slots: groups.map((group) => group.slot) };
}

function buildMaterials(texturedMaterial, flat, slots) {
    const average = (key, fallback) => flat.reduce((total, part) => total + (part.material[key] ?? fallback), 0) / Math.max(flat.length, 1);
    const flatMaterial = flat.length
        ? new THREE.MeshStandardMaterial({
              name: "baked-color",
              vertexColors: true,
              roughness: average("roughness", 1),
              metalness: average("metalness", 0),
              alphaTest: Math.max(0, ...flat.map((part) => part.material.alphaTest ?? 0)),
              side: flat.some((part) => part.material.side === THREE.DoubleSide) ? THREE.DoubleSide : THREE.FrontSide,
          })
        : null;
    const used = new Set();
    return slots.map((slot) => {
        const source = slot < 2 ? texturedMaterial : flatMaterial;
        if (slot % 2 === 0 && !used.has(source)) {
            used.add(source);
            return source;
        }
        const blended = source.clone();
        blended.name = `${source.name}-blend`;
        blended.transparent = true;
        return blended;
    });
}

function cleanPath(path) {
    return decodeURIComponent((path ?? "").split("?")[0]);
}

function isPackagePath(path) {
    return /^(modules|systems)\//.test(path) || /^[a-z]+:/i.test(path);
}

function bakedPath(path) {
    const clean = cleanPath(path);
    const name = clean.split("/").pop().replace(/\.[^.]+$/, "");
    if (!isPackagePath(clean)) return { directory: clean.split("/").slice(0, -1).join("/"), file: `${name}.baked.glb` };
    return { directory: bakeFolder(), file: `${name}-${hashString(clean)}.baked.glb` };
}

const BAKED_DIRECTORY = () => `worlds/${game.world.id}/baked-models`;
const FOLDER_SETTING = "bakedModelsFolder";

Hooks.once("init", () => game.settings.register("levels-3d-preview", FOLDER_SETTING, { scope: "world", config: false, type: String, default: "" }));

function bakeFolder() {
    const folder = game.settings.get("levels-3d-preview", FOLDER_SETTING);
    return folder && !isPackagePath(folder) ? folder : BAKED_DIRECTORY();
}

function chooseBakeFolder() {
    return new Promise((resolve) => {
        const FilePicker = foundry.applications.apps.FilePicker.implementation;
        const picker = new FilePicker({
            type: "folder",
            current: bakeFolder(),
            callback: async (path) => {
                const folder = cleanPath(path).replace(/\/+$/, "");
                if (!folder || isPackagePath(folder)) {
                    ui.notifications.warn("levels3dpreview.modelBaker.errors.packageFolder", { localize: true });
                    return resolve(null);
                }
                await game.settings.set("levels-3d-preview", FOLDER_SETTING, folder);
                resolve(folder);
            },
        });
        picker.render(true);
    });
}

function folderField() {
    const l = (key) => game.i18n.localize(`levels3dpreview.modelBaker.${key}`);
    return `<div class="form-group">
                <label>${l("destination")}</label>
                <div class="form-fields"><input type="text" value="${foundry.utils.escapeHTML(bakeFolder())}" data-bake-folder readonly><button type="button" class="icon fa-solid fa-folder-open" data-action="changeFolder" data-tooltip="${l("changeFolder")}"></button></div>
            </div>`;
}

async function changeFolder(event, target) {
    const folder = await chooseBakeFolder();
    if (!folder) return;
    const root = target.closest(".application") ?? document;
    root.querySelectorAll("[data-bake-folder]").forEach((element) => (element.tagName === "INPUT" ? (element.value = folder) : (element.textContent = folder)));
}

function hashString(text) {
    return ([...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 0) >>> 0).toString(36);
}

async function uploadBaked(glb, { directory, file }) {
    await ensureDirectory(directory);
    const upload = await foundry.applications.apps.FilePicker.implementation.upload("data", directory, new File([glb], file, { type: "model/gltf-binary" }), {}, { notify: false });
    if (!upload?.path) throw new Error(game.i18n.localize("levels3dpreview.modelBaker.errors.upload"));
    delete game.Levels3DPreview.helpers.modelCache[upload.path];
    THREE.Cache.remove(upload.path);
    return upload.path;
}

async function repointDocuments(scene, documents, path) {
    for (const documentName of ["Tile", "Token"]) {
        const updates = documents.filter((document) => document.documentName === documentName).map((document) => ({ _id: document.id, [MODEL_FLAG]: path }));
        if (updates.length) await scene.updateEmbeddedDocuments(documentName, updates);
    }
    return documents.length;
}

const UNWRAP_WARN = 50000;
const UNWRAP_LIMIT = 150000;
const DYNAMIC_DYNAMESH = new Set(["decal", "billboard", "billboard2", "paper", "counter", "counterradial"]);
const NO_REPOINT = new Set(["notLoaded", "shader", "terrain", "tags", "heroForge", "animated", "script"]);
const COMPLEX_DRAW_CALLS = 8;
const COMPLEX_TRIANGLES = 20000;
const COMPLEX_SQUARES = 4;
const TILING_SPAN = 1.5;
const ATLAS_FILL = 0.7;
const MERGE_MAX_SIZE = 1024;

function tileSkip(entity) {
    return new Set([entity.controlledBox, entity.sightMesh, entity._decalCone].filter(Boolean));
}

export function bakeExclusion(entity) {
    const document = entity?.document;
    if (!entity?.mesh || !entity._loaded || entity._destroyed) return "notLoaded";
    const flag = (key) => document.getFlag("levels-3d-preview", key);
    if (Object.values(flag("shaders") ?? {}).some((shader) => shader?.enabled)) return "shader";
    if (flag("displacementMap") || (flag("noiseType") ?? "none") !== "none" || entity.dynaMesh === "mapGen" || flag("mapMakerMesh")?.kind === "terrain") return "terrain";
    if (isHeroForge(entity.gtflPath)) return "heroForge";
    if (entity._animationModelReference?.object?.animations?.some((clip) => clip.tracks.length)) return "animated";
    if (entity.hasTags) return "tags";
    if (flag("onAnimation")) return "script";
    if (entity.isPlane) return "plane";
    if (entity.isInstanced || entity.mergedMatrix || !["stretch", "fit"].includes(entity.fillType)) return "instanced";
    if (entity.isDoor) return "door";
    if ((flag("ParticleType") ?? "none") !== "none") return "particles";
    if ((flag("ior") ?? -0.01) !== -0.01 && (flag("transmission") ?? -0.01) !== -0.01) return "material";
    if (entity.isGravity || (entity.enableGravity ?? "none") !== "none" || entity.highlightOnHover || flag("gmOnlyInteractive") || entity.isInteractiveDynaMesh || entity.pathTraced || DYNAMIC_DYNAMESH.has(entity.dynaMesh)) return "dynamic";
    if (document.hidden) return "hidden";
    let reason = null;
    eachVisibleMesh(entity.mesh, tileSkip(entity), (mesh) => {
        if (mesh.isSkinnedMesh || Object.keys(mesh.geometry.morphAttributes).length || [mesh.material].flat().some((material) => material && BAKE_MAPS.some((key) => material[key]?.isVideoTexture))) reason ??= "animated";
        if (mesh.isInstancedMesh || mesh.isBatchedMesh) reason ??= "instanced";
    });
    return reason;
}

function levelKey(document) {
    return [...document.levels].sort().join(",");
}

function behaviourKey(entity) {
    return [entity.collision, entity.sight, entity.cameraCollision, entity.castShadow].join(",");
}

function levelName(document) {
    if (!document.levels.size) return game.i18n.localize("levels3dpreview.modelBaker.allLevels");
    return [...document.levels].map((id) => document.parent.levels.get(id)?.name ?? id).join(", ");
}

export function entityName(entity) {
    const document = entity.document;
    return document.name || decodeURIComponent((entity.gtflPath ?? "").split("/").pop()) || entity.dynaMesh || document.id;
}

function tileSummary(entities) {
    const summary = { drawCalls: 0, triangles: 0, unwrap: 0, area: 0, tiling: false, box: new THREE.Box3(), slots: new Set() };
    for (const entity of entities) {
        entity.mesh.updateWorldMatrix(true, true);
        eachVisibleMesh(entity.mesh, tileSkip(entity), (mesh) => {
            const geometry = mesh.geometry;
            const count = geometry.index?.count ?? geometry.attributes.position.count;
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            summary.box.union(geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
            const materials = [mesh.material].flat();
            if (isTiling(mesh)) summary.tiling = true;
            for (const group of geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }]) {
                const material = materials[group.materialIndex ?? 0];
                if (!material || material.visible === false) continue;
                const triangles = Math.floor(Math.max(0, Math.min(group.start + group.count, count) - group.start) / 3);
                const flat = isFlatMaterial(material);
                summary.drawCalls++;
                summary.triangles += triangles;
                if (!flat) {
                    summary.unwrap += triangles;
                    summary.area += texturedArea(mesh, group, count);
                }
                summary.slots.add((flat ? 2 : 0) + (material.transparent ? 1 : 0));
            }
        });
    }
    summary.size = Math.clamp(2 ** Math.ceil(Math.log2(Math.max(sizeForArea(summary.area), 1))), TEXTURE_SIZES[0], MERGE_MAX_SIZE);
    summary.after = summary.slots.size;
    return summary;
}

function bakedTileData(entities, box, path) {
    const first = entities[0];
    const { size, distance } = canvas.dimensions;
    return {
        x: Math.round(((box.min.x + box.max.x) / 2) * factor),
        y: Math.round(((box.min.z + box.max.z) / 2) * factor),
        width: Math.round((box.max.x - box.min.x) * factor),
        height: Math.round((box.max.z - box.min.z) * factor),
        elevation: (box.min.y * factor * distance) / size,
        levels: [...first.document.levels],
        texture: { src: "modules/levels-3d-preview/assets/blank.webp", anchorX: 0.5, anchorY: 0.5 },
        flags: { "levels-3d-preview": { model3d: path, depth: (box.max.y - box.min.y) * factor, fillType: "stretch", autoGround: false, autoCenter: false, collision: first.collision, sight: first.sight, cameraCollision: first.cameraCollision, castShadow: first.castShadow } },
    };
}

function tilesFile(entities) {
    const scene = entities[0].document.parent;
    return { directory: bakeFolder(), file: `${scene.name.slugify() || "scene"}-${hashString(scene.id + entities.map((entity) => entity.document.id).sort().join(""))}.baked.glb` };
}

async function replaceTiles(entities, box, path) {
    if (entities.some((entity) => entity._destroyed)) throw new Error(game.i18n.localize("levels3dpreview.modelBaker.errors.changed"));
    const scene = entities[0].document.parent;
    await scene.createEmbeddedDocuments("Tile", [bakedTileData(entities, box, path)]);
    await scene.deleteEmbeddedDocuments("Tile", entities.map((entity) => entity.document.id));
    return entities.length;
}

async function promptBackup(scene, content) {
    const l = (key) => game.i18n.localize(`levels3dpreview.modelBaker.backup.${key}`);
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: l("title"), icon: "fas fa-fire" },
        content,
        buttons: [
            { action: "backup", label: l("backup"), icon: "fas fa-copy", default: true },
            { action: "continue", label: l("continue"), icon: "fas fa-forward" },
            { action: "cancel", label: l("cancel"), icon: "fas fa-times" },
        ],
        rejectClose: false,
    });
    if (!choice || choice === "cancel") return false;
    if (choice === "backup") await scene.clone({ name: game.i18n.format("levels3dpreview.modelBaker.backup.name", { name: scene.name }) }, { save: true });
    return true;
}

function splitEligible(entities) {
    const eligible = [];
    const excluded = [];
    for (const entity of entities) {
        const reason = bakeExclusion(entity);
        if (reason) excluded.push({ entity, reason });
        else eligible.push(entity);
    }
    return { eligible, excluded };
}

export function injectTileBakeButton(beforeButton) {
    if (!game.user.isGM || !beforeButton || canvas.tiles.controlled.length < 2) return;
    const button = document.createElement("button");
    button.className = "control-icon";
    button.dataset.action = "bake-tiles";
    button.dataset.tooltip = game.i18n.localize("levels3dpreview.modelBaker.tilesTitle");
    button.innerHTML = `<i class="fas fa-fire" inert></i>`;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        openTileBaker(canvas.tiles.controlled.map((tile) => tile.document));
    });
    beforeButton.before(button);
}

export function openTileBaker(documents) {
    const warn = (key) => ui.notifications.warn(`levels3dpreview.modelBaker.errors.${key}`, { localize: true });
    const { eligible, excluded } = splitEligible(documents.map((document) => game.Levels3DPreview.tiles[document.id]).filter(Boolean));
    if (eligible.length < 2) {
        excluded.forEach(({ entity, reason }) => console.warn(`3D Canvas | ${entityName(entity)}: ${game.i18n.localize(`levels3dpreview.modelBaker.reasons.${reason}`)}`));
        return warn("notEnough");
    }
    if (new Set(eligible.map((entity) => levelKey(entity.document))).size > 1) return warn("levels");
    if (new Set(eligible.map(behaviourKey)).size > 1) return warn("behaviour");
    new TileGroupBaker(eligible, excluded).render(true);
}

function mergeExclusion(entity, summary) {
    if (summary.tiling) return "tiling";
    const document = entity.document;
    const squares = Math.max(document.width, document.height) / (document.parent?.grid?.size || 100);
    if (summary.drawCalls >= COMPLEX_DRAW_CALLS || summary.unwrap >= COMPLEX_TRIANGLES || squares >= COMPLEX_SQUARES) return "complex";
    return null;
}

function splitByDetail(items) {
    const chunks = [];
    const split = (list) => {
        const unwrap = list.reduce((total, item) => total + item.unwrap, 0);
        const area = list.reduce((total, item) => total + item.area, 0);
        if (list.length < 2 || (unwrap <= UNWRAP_WARN && sizeForArea(area) <= MERGE_MAX_SIZE)) return chunks.push(list.map((item) => item.entity));
        const box = new THREE.Box3().setFromPoints(list.map((item) => item.center));
        const size = box.getSize(new THREE.Vector3());
        const axis = size.x >= size.z ? "x" : "z";
        const sorted = [...list].sort((a, b) => a.center[axis] - b.center[axis]);
        let index = 0;
        for (let total = 0; index < sorted.length - 1 && total + sorted[index].unwrap <= unwrap / 2; index++) total += sorted[index].unwrap;
        index = Math.clamp(index, 1, sorted.length - 1);
        split(sorted.slice(0, index));
        split(sorted.slice(index));
    };
    split(items);
    return chunks;
}

export function autoBakePlan(scene, recommendations) {
    const entities = Object.values(game.Levels3DPreview.tiles).filter((entity) => entity.document?.parent === scene);
    const { eligible, excluded } = splitEligible(entities);
    const groups = new Map();
    for (const entity of eligible) {
        const summary = tileSummary([entity]);
        const reason = mergeExclusion(entity, summary);
        if (reason) {
            excluded.push({ entity, reason });
            continue;
        }
        const key = `${levelKey(entity.document)}|${behaviourKey(entity)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ entity, unwrap: summary.unwrap, area: summary.area, center: summary.box.getCenter(new THREE.Vector3()) });
    }
    const merges = [];
    for (const group of groups.values()) {
        for (const chunk of splitByDetail(group)) {
            if (chunk.length < 2) excluded.push({ entity: chunk[0], reason: "single" });
            else merges.push({ entities: chunk, level: levelName(chunk[0].document), ...tileSummary(chunk) });
        }
    }
    const reasons = new Map(excluded.map(({ entity, reason }) => [entity.document.id, reason]));
    const merged = new Set(merges.flatMap((merge) => merge.entities.map((entity) => entity.document.id)));
    const singles = recommendations
        .map((row) => {
            const documents = row.documents.filter((document) => document.documentName === "Token" || (!merged.has(document.id) && reasons.has(document.id) && !NO_REPOINT.has(reasons.get(document.id))));
            if (!documents.length) return null;
            return { ...row, documents, size: Math.max(...documents.map(recommendedSize)) };
        })
        .filter(Boolean);
    const singled = new Set(singles.flatMap((row) => row.documents.map((document) => document.id)));
    excluded.forEach((entry) => (entry.singleBaked = singled.has(entry.entity.document.id)));
    return { merges, singles, excluded, unloaded: scene.tiles.filter((document) => !game.Levels3DPreview.tiles[document.id]).length };
}

export async function runAutoBake(scene, plan) {
    const l = (key, data) => (data ? game.i18n.format(`levels3dpreview.modelBaker.auto.${key}`, data) : game.i18n.localize(`levels3dpreview.modelBaker.auto.${key}`));
    const merges = plan.merges.filter((merge) => merge.unwrap <= UNWRAP_LIMIT);
    if (!merges.length && !plan.singles.length) return ui.notifications.warn(l("nothing"));
    const counts = { singles: plan.singles.length, placeables: plan.singles.reduce((total, row) => total + row.documents.length, 0), merges: merges.length, tiles: merges.reduce((total, merge) => total + merge.entities.length, 0) };
    const large = merges.some((merge) => merge.unwrap > UNWRAP_WARN) ? `<p class="notification warning">${game.i18n.localize("levels3dpreview.modelBaker.trianglesWarn")}</p>` : "";
    const ownFolders = plan.singles.filter((row) => !isPackagePath(cleanPath(row.path))).map((row) => bakedPath(row.path).directory);
    const chosen = merges.length + plan.singles.length - ownFolders.length;
    const folders = Object.entries(ownFolders.reduce((total, folder) => ({ ...total, [folder]: (total[folder] ?? 0) + 1 }), {}))
        .map(([folder, count]) => `<li>${foundry.utils.escapeHTML(folder)} (${count})</li>`)
        .join("");
    const files = `<p>${l("files", { count: merges.length + plan.singles.length })}</p><ul>${chosen ? `<li><span data-bake-folder>${foundry.utils.escapeHTML(bakeFolder())}</span> (${chosen})</li>` : ""}${folders}</ul>${chosen ? folderField() : ""}`;
    const proceed = await foundry.applications.api.DialogV2.confirm({ window: { title: l("title"), icon: "fas fa-fire" }, position: { width: 520 }, actions: { changeFolder }, content: `<p>${[counts.singles && l("confirmSingles", counts), counts.merges && l("confirmMerges", counts), l("confirm")].filter(Boolean).join(" ")}</p>${files}${large}` });
    if (!proceed) return;
    if (!(await promptBackup(scene, `<p>${l("backup", counts)}</p>`))) return;
    const total = plan.singles.length + merges.length;
    const notification = ui.notifications.info(l("progress", { current: 0, total }), { progress: true });
    let done = 0;
    let failed = 0;
    const step = async (task) => {
        try {
            await task();
        } catch (error) {
            console.error(error);
            failed++;
        }
        done++;
        notification.update({ pct: done / total, message: l("progress", { current: done, total }) });
    };
    for (const row of plan.singles) {
        await step(async () => {
            const result = await bakeModel(row.path, { size: row.size });
            await repointDocuments(scene, row.documents, await uploadBaked(result.glb, bakedPath(row.path)));
        });
    }
    for (const merge of merges) {
        await step(async () => {
            const result = await bakeTiles(merge.entities, { size: merge.size });
            await replaceTiles(merge.entities, result.box, await uploadBaked(result.glb, tilesFile(merge.entities)));
        });
    }
    ui.notifications[failed ? "warn" : "info"](l(failed ? "failed" : "done", { count: done - failed, failed }));
    Hooks.callAll("3DCanvasBakeComplete");
}

export function bakeLimits() {
    return { warn: UNWRAP_WARN, limit: UNWRAP_LIMIT };
}

async function ensureDirectory(directory) {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    let current = "";
    for (const segment of directory.split("/").filter(Boolean)) {
        current = current ? `${current}/${segment}` : segment;
        try {
            await FilePicker.browse("data", current);
        } catch {
            await FilePicker.createDirectory("data", current);
        }
    }
}

async function fileSize(path) {
    try {
        const response = await fetch(path, { method: "HEAD" });
        const length = Number(response.headers.get("content-length"));
        if (length) return length;
        return (await (await fetch(path)).blob()).size;
    } catch {
        return 0;
    }
}

function formatSize(bytes) {
    return bytes ? `${(bytes / 1024).toFixed(1)} KB` : "-";
}

const RECOMMEND_DRAW_CALLS = 4;
const RECOMMEND_TEXTURES = 6;

function isBakeable(loaded) {
    if (!loaded?.model || loaded.object?.animations?.some((clip) => clip.tracks.length)) return false;
    let bakeable = true;
    loaded.model.traverse((child) => {
        if (child.isSkinnedMesh || child.isInstancedMesh || child.isBatchedMesh || (child.isMesh && Object.keys(child.geometry.morphAttributes).length)) bakeable = false;
    });
    return bakeable;
}

export async function bakeRecommendations(scene) {
    const byModel = new Map();
    for (const document of [...scene.tiles, ...scene.tokens]) {
        const path = modelPath(document);
        if (!path || /\.baked\.glb$/i.test(path) || isHeroForge(path)) continue;
        if (!byModel.has(path)) byModel.set(path, []);
        byModel.get(path).push(document);
    }
    const helpers = game.Levels3DPreview.helpers;
    const rows = [];
    for (const [path, documents] of byModel) {
        const loaded = await helpers.loadModel(path).catch(() => null);
        if (!isBakeable(loaded)) continue;
        const stats = modelStats(loaded.model);
        if (stats.drawCalls < RECOMMEND_DRAW_CALLS && stats.textures < RECOMMEND_TEXTURES) continue;
        const document = documents.reduce((best, current) => (footprint(current) > footprint(best) ? current : best));
        const entities = document.documentName === "Token" ? game.Levels3DPreview.tokens : game.Levels3DPreview.tiles;
        rows.push({ path, documents, document, entity: entities[document.id], stats, size: recommendedSize(document), savedCalls: (stats.drawCalls - 1) * documents.length });
    }
    return rows.sort((a, b) => b.savedCalls - a.savedCalls);
}

export function openModelBaker(target) {
    const picker = document.createElement("input");
    picker.value = modelPath(target);
    new ModelBaker(target, picker).render(true);
}

function footprint(document) {
    const size = Math.max(document.width, document.height);
    if (document.documentName === "Tile") return size / (document.parent?.grid?.size || canvas.grid?.size || 100);
    return size * Math.max(Math.abs(document.texture?.scaleX ?? 1), Math.abs(document.texture?.scaleY ?? 1));
}

function recommendedSize(document) {
    return sizeForSquares(footprint(document));
}

function sizeForSquares(squares) {
    const size = 2 ** Math.ceil(Math.log2(Math.max(squares, 1) * TEXELS_PER_SQUARE));
    return Math.clamp(size, TEXTURE_SIZES[0], 1024);
}

export class ModelBaker extends foundry.applications.api.ApplicationV2 {
    constructor(document, picker) {
        super();
        this.document = document;
        this.picker = picker;
        this.path = picker?.value;
        this.recommended = document ? recommendedSize(document) : TEXTURE_SIZES[1];
        this.size = this.recommended;
        this.all = false;
        this.busy = false;
        this.before = null;
        this.after = null;
        this.result = null;
        this.preview = null;
    }

    static DEFAULT_OPTIONS = {
        id: "levels3d-model-baker",
        tag: "form",
        window: {
            title: "levels3dpreview.modelBaker.title",
            icon: "fas fa-fire",
            contentClasses: ["standard-form"],
        },
        position: { width: 440 },
        actions: { bake: ModelBaker.#onBake, save: ModelBaker.#onSave, discard: ModelBaker.#onDiscard, changeFolder },
    };

    async _prepareContext() {
        if (!this.before) {
            const loaded = await game.Levels3DPreview.helpers.loadModel(this.path);
            this.before = { ...(loaded?.model ? modelStats(loaded.model) : {}), fileSize: formatSize(await fileSize(this.path)) };
        }
        return {};
    }

    async _renderHTML() {
        const l = (key) => game.i18n.localize(`levels3dpreview.modelBaker.${key}`);
        const locked = this.busy || this.result ? "disabled" : "";
        const sizes = TEXTURE_SIZES.map((size) => `<option value="${size}" ${size === this.size ? "selected" : ""}>${size === this.recommended ? game.i18n.format("levels3dpreview.modelBaker.recommended", { size }) : size}</option>`).join("");
        const rows = ["meshes", "materials", "textures", "drawCalls", "fileSize"].map((key) => `<tr><td>${l(`stats.${key}`)}</td><td>${this.before[key] ?? "-"}</td><td>${this.after?.[key] ?? "-"}</td></tr>`).join("");
        const buttons = this.result
            ? `<button type="button" data-action="discard" ${this.busy ? "disabled" : ""}><i class="fas fa-times"></i> ${l("discard")}</button>
               <button type="button" data-action="save" ${this.busy ? "disabled" : ""}><i class="fas fa-check"></i> ${l("save")}</button>`
            : `<button type="button" data-action="bake" ${this.busy ? "disabled" : ""}><i class="fas fa-fire"></i> ${l("bake")}</button>`;
        return `${this.description}
            ${this.needsFolder && !this.after?.path ? folderField() : ""}
            <div class="form-group">
                <label>${l("textureSize")}</label>
                <div class="form-fields"><select name="size" ${locked}>${sizes}</select></div>
            </div>
            <div class="form-group" ${this.document instanceof foundry.abstract.Document ? "" : "hidden"}>
                <label>${l("repointAll")}</label>
                <div class="form-fields"><input type="checkbox" name="all" ${this.all ? "checked" : ""} ${this.busy ? "disabled" : ""}></div>
                <p class="hint">${l("repointAllHint")}</p>
            </div>
            ${this.result ? `<div class="levels3d-bake-preview" style="display: flex; justify-content: center;"></div>` : ""}
            <table>
                <thead><tr><th></th><th>${l("stats.before")}</th><th>${l("stats.after")}</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            ${this.after?.path ? `<p class="hint">${this.after.path}</p>` : ""}
            <footer class="form-footer">${buttons}</footer>`;
    }

    get description() {
        return `<p class="hint">${this.path}</p>`;
    }

    get needsFolder() {
        return isPackagePath(cleanPath(this.path));
    }

    _replaceHTML(result, content) {
        content.innerHTML = result;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const slot = this.element.querySelector(".levels3d-bake-preview");
        if (slot && this.preview) slot.append(this.preview.renderer.domElement);
    }

    _onClose(options) {
        super._onClose(options);
        this.disposePreview();
    }

    async createPreview(glb) {
        const gltf = await new GLTFLoader().parseAsync(glb, "");
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE);
        const scene = new THREE.Scene();
        const sun = new THREE.DirectionalLight(0xffffff, 2);
        sun.position.set(1, 2, 1.5);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2), sun, gltf.scene);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
        const camera = new THREE.PerspectiveCamera(35, 1, radius / 100, radius * 100);
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(17.5));
        const start = performance.now();
        renderer.setAnimationLoop((time) => {
            const angle = (time - start) / 4000;
            camera.position.set(center.x + Math.sin(angle) * distance * 0.6, center.y + distance * 0.4, center.z + Math.cos(angle) * distance * 0.6);
            camera.lookAt(center);
            renderer.render(scene, camera);
        });
        this.preview = { renderer, scene };
    }

    disposePreview() {
        if (!this.preview) return;
        const { renderer, scene } = this.preview;
        renderer.setAnimationLoop(null);
        scene.traverse((child) => {
            child.geometry?.dispose();
            for (const material of [child.material ?? []].flat()) {
                BAKE_MAPS.forEach((key) => material[key]?.dispose());
                material.dispose();
            }
        });
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        this.preview = null;
    }

    static async #onBake() {
        this.size = Number(this.element.querySelector("[name=size]").value);
        this.all = this.element.querySelector("[name=all]").checked;
        this.busy = true;
        await this.render();
        const l = (key) => game.i18n.localize(`levels3dpreview.modelBaker.${key}`);
        const notification = ui.notifications.info(l("progress.load"), { progress: true });
        try {
            const result = await this.runBake({ size: this.size, onProgress: (pct, step) => notification.update({ pct, message: l(`progress.${step}`) }) });
            await this.createPreview(result.glb.slice(0));
            this.result = result;
            this.after = { ...result.after, fileSize: formatSize(result.glb.byteLength) };
            notification.update({ pct: 1, message: l("previewReady") });
        } catch (error) {
            console.error(error);
            notification.remove?.();
            ui.notifications.error(error.message);
        }
        this.busy = false;
        this.render();
    }

    runBake(options) {
        return bakeModel(this.path, options);
    }

    async apply(glb) {
        const path = await uploadBaked(glb, bakedPath(this.path));
        const count = await this.repoint(path);
        if (this.picker.isConnected) this.picker.value = path;
        ui.notifications.info(game.i18n.format("levels3dpreview.modelBaker.done", { count }));
        return path;
    }

    static async #onSave() {
        this.all = this.element.querySelector("[name=all]").checked;
        this.busy = true;
        await this.render();
        try {
            const path = await this.apply(this.result.glb);
            if (path) {
                this.after.path = path;
                this.result = null;
                this.disposePreview();
                Hooks.callAll("3DCanvasBakeComplete");
            }
        } catch (error) {
            console.error(error);
            ui.notifications.error(error.message);
        }
        this.busy = false;
        this.render();
    }

    async repoint(path) {
        const target = this.document;
        if (!(target instanceof foundry.abstract.Document)) {
            await target.parent.update({ [`prototypeToken.${MODEL_FLAG}`]: path });
            return 1;
        }
        const collection = target.documentName === "Token" ? target.parent.tokens : target.parent.tiles;
        const documents = this.all ? collection.filter((document) => modelPath(document) === this.path) : [target];
        return repointDocuments(target.parent, documents, path);
    }

    static #onDiscard() {
        this.result = null;
        this.after = null;
        this.disposePreview();
        this.render();
    }
}

export class TileGroupBaker extends ModelBaker {
    constructor(entities, excluded = []) {
        super(null, null);
        this.entities = entities;
        this.excluded = excluded;
        this.summary = tileSummary(entities);
        this.recommended = this.size = this.summary.size;
        this.before = { ...partStats(entities.flatMap((entity) => collectStats(entity))), fileSize: "-" };
    }

    static DEFAULT_OPTIONS = {
        id: "levels3d-tile-baker",
        window: { title: "levels3dpreview.modelBaker.tilesTitle" },
    };

    get description() {
        const f = (key, data) => game.i18n.format(`levels3dpreview.modelBaker.${key}`, data);
        const { triangles, unwrap } = this.summary;
        const warning = unwrap > UNWRAP_WARN ? `<p class="notification ${unwrap > UNWRAP_LIMIT ? "error" : "warning"}">${game.i18n.format(`levels3dpreview.modelBaker.${unwrap > UNWRAP_LIMIT ? "errors.triangles" : "trianglesWarn"}`, { limit: UNWRAP_LIMIT })}</p>` : "";
        const excluded = this.excluded.length
            ? `<details><summary>${f("excluded", { count: this.excluded.length })}</summary><ul>${this.excluded.map(({ entity, reason }) => `<li>${foundry.utils.escapeHTML(entityName(entity))}: ${game.i18n.localize(`levels3dpreview.modelBaker.reasons.${reason}`)}</li>`).join("")}</ul></details>`
            : "";
        return `<p class="hint">${f("tilesHint", { count: this.entities.length, level: foundry.utils.escapeHTML(levelName(this.entities[0].document)) })}</p>
            <p class="hint">${f("triangles", { triangles, unwrap })}</p>${warning}${excluded}`;
    }

    get needsFolder() {
        return true;
    }

    runBake(options) {
        if (this.summary.unwrap > UNWRAP_LIMIT) throw new Error(game.i18n.format("levels3dpreview.modelBaker.errors.triangles", { limit: UNWRAP_LIMIT }));
        return bakeTiles(this.entities, options);
    }

    async apply(glb) {
        const scene = this.entities[0].document.parent;
        if (this.entities.some((entity) => entity._destroyed)) throw new Error(game.i18n.localize("levels3dpreview.modelBaker.errors.changed"));
        if (!(await promptBackup(scene, `<p>${game.i18n.format("levels3dpreview.modelBaker.backup.content", { count: this.entities.length })}</p>`))) return null;
        const path = await uploadBaked(glb, tilesFile(this.entities));
        const count = await replaceTiles(this.entities, this.result.box, path);
        ui.notifications.info(game.i18n.format("levels3dpreview.modelBaker.doneTiles", { count }));
        return path;
    }
}

function collectStats(entity) {
    const parts = [];
    eachVisibleMesh(entity.mesh, tileSkip(entity), (mesh) => {
        const materials = [mesh.material].flat();
        const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ materialIndex: 0 }];
        for (const group of groups) if (materials[group.materialIndex ?? 0]) parts.push({ object: mesh, material: materials[group.materialIndex ?? 0] });
    });
    return parts;
}
