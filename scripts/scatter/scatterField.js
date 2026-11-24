import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { factor } from "../main.js";
import { decodeGrid } from "../helpers/chunkCodec.js";
import { affectsSurface, changedRect, trackTileRects } from "../helpers/tileChange.js";
import { SCATTER_SETS } from "./sets.js";
import { generateInstances, explicitInstances, resolveItemAsset, isGroundCover } from "./generate.js";
import { sampleSurface, gridUnit, isObstacle } from "./surface.js";
import { WIND_GLSL, windUniforms, updateWindSway, isFoliage } from "../shaders/wind/windSway.js";
import { markReceivers } from "../vfx/surface/receivers.js";
import { setWindSwayParams } from "../shaders/wind/windBatch.js";
import { buildDressing, dressTier } from "./dressing.js";
import { dressUniforms } from "./cobwebs.js";
import { propLevel, propMaterial, propFrame, dressPropVector, propWebs, buildPropWebs } from "./propDressing.js";

const CHUNK_CELLS = 48;
const MAX_CHUNKS = 3;
const MERGE_MAX = 6;
const SHADOW_MIN_HEIGHT = 0.35;
const BLOCKER_MARGIN = 0.15;
const MAX_PATCHES = 12;
const QUALITY = {
    low: { density: 0.35, shadows: "none" },
    medium: { density: 0.65, shadows: "blocking" },
    high: { density: 1, shadows: "all" },
};
const assetCache = new Map();
const fields = new Set();
const FLUTTER = 0.3;
const TREE_PROFILE = { anchor: 0.3, stiffness: 3 };
const PLANT_PROFILE = { anchor: 0, stiffness: 2 };
const proxyMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
const noRaycast = () => {};
const pickSpheres = new WeakMap();
const _pickMesh = new THREE.Mesh();
const _pickHits = [];
const _pickMatrix = new THREE.Matrix4();
const _pickLocal = new THREE.Matrix4();
const _pickSphere = new THREE.Sphere();

function instanceSpheres(mesh) {
    let entry = pickSpheres.get(mesh);
    const elements = mesh.matrixWorld.elements;
    if (entry && entry.version === mesh.instanceMatrix.version && entry.count === mesh.count && entry.matrix.every((v, i) => v === elements[i])) return entry.spheres;
    if (mesh.geometry.boundingSphere === null) mesh.geometry.computeBoundingSphere();
    const spheres = new Float32Array(mesh.count * 4);
    for (let i = 0; i < mesh.count; i++) {
        _pickMatrix.multiplyMatrices(mesh.matrixWorld, mesh.getMatrixAt(i, _pickLocal));
        _pickSphere.copy(mesh.geometry.boundingSphere).applyMatrix4(_pickMatrix);
        spheres.set([_pickSphere.center.x, _pickSphere.center.y, _pickSphere.center.z, _pickSphere.radius], i * 4);
    }
    entry = { version: mesh.instanceMatrix.version, count: mesh.count, matrix: [...elements], spheres };
    pickSpheres.set(mesh, entry);
    return spheres;
}

function raycastInstances(mesh, raycaster, intersects) {
    const spheres = instanceSpheres(mesh);
    _pickMesh.geometry = mesh.geometry;
    _pickMesh.material = mesh.material;
    for (let i = 0; i < mesh.count; i++) {
        _pickSphere.center.fromArray(spheres, i * 4);
        _pickSphere.radius = spheres[i * 4 + 3];
        if (!raycaster.ray.intersectsSphere(_pickSphere)) continue;
        _pickMesh.matrixWorld.multiplyMatrices(mesh.matrixWorld, mesh.getMatrixAt(i, _pickLocal));
        _pickHits.length = 0;
        _pickMesh.raycast(raycaster, _pickHits);
        for (const hit of _pickHits) {
            hit.instanceId = i;
            hit.object = mesh;
            intersects.push(hit);
        }
    }
    _pickHits.length = 0;
}

export function scatterQuality() {
    const key = game.settings.settings.has("levels-3d-preview.scatterQuality") ? game.settings.get("levels-3d-preview", "scatterQuality") : "high";
    return QUALITY[key] ?? QUALITY.high;
}

export function scatterDefaults(data = {}) {
    return { v: 1, set: "", seed: 1, cell: (canvas.scene?.grid.size ?? 100) / 2, chunk: 64, base: 0, dc: {}, scale: 1, density: 1, ...data, avoid: { buildings: true, paths: true, water: true, ...(data.avoid ?? {}) } };
}

export function densityGrid(doc, data = scatterDefaults(doc.flags["levels-3d-preview"]?.scatter)) {
    const cell = Math.max(1, data.cell);
    const nx = Math.max(1, Math.ceil(Math.abs(doc.width) / cell));
    const ny = Math.max(1, Math.ceil(Math.abs(doc.height) / cell));
    return { nx, ny, cell, chunk: data.chunk || 64, base: data.base ?? 0 };
}

export async function readDensity(doc, data) {
    const grid = densityGrid(doc, data);
    const values = new Uint8Array(grid.nx * grid.ny).fill(grid.base);
    await decodeGrid((data ?? scatterDefaults(doc.flags["levels-3d-preview"]?.scatter)).dc, values, grid.nx, grid.ny, grid.chunk, 8);
    return { ...grid, values };
}

const SWAY_VERTEX = `#include <begin_vertex>
#ifdef USE_INSTANCING
{
    mat4 swM = modelMatrix * instanceMatrix;
    vec3 swWorld = (swM * vec4(transformed, 1.0)).xyz;
    vec3 swPivot = (swM * vec4(0.0, scatterBase, 0.0, 1.0)).xyz;
    vec3 swNew = fw_sway(swWorld, swPivot, scatterHeight * length(swM[1].xyz), scatterSway, scatterAnchor, scatterStiffness, scatterFlutter);
    transformed += inverse(mat3(swM)) * (swNew - swWorld);
}
#endif`;

function swayCompile({ sway, box, anchor, stiffness, flutter }, previous) {
    return function (shader, renderer) {
        previous?.call(this, shader, renderer);
        Object.assign(shader.uniforms, windUniforms, {
            scatterSway: { value: sway },
            scatterHeight: { value: Math.max(box.max.y - box.min.y, 1e-3) },
            scatterBase: { value: box.min.y },
            scatterAnchor: { value: anchor },
            scatterStiffness: { value: stiffness },
            scatterFlutter: { value: flutter },
        });
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", `#include <common>
uniform float scatterSway;
uniform float scatterHeight;
uniform float scatterBase;
uniform float scatterAnchor;
uniform float scatterStiffness;
uniform float scatterFlutter;
${WIND_GLSL}`)
            .replace("#include <begin_vertex>", SWAY_VERTEX);
    };
}

function swayParams(asset, material, box) {
    return { sway: asset.wind ?? 0, box, ...(asset.blocking ? TREE_PROFILE : PLANT_PROFILE), flutter: isFoliage(material) ? FLUTTER : 0 };
}

function windMaterial(material, params) {
    const m = material.clone();
    const previous = material._userOnBeforeCompile === material.onBeforeCompile ? null : material._userOnBeforeCompile;
    m.onBeforeCompile = swayCompile(params, previous);
    if (!previous) setWindSwayParams(m, { sway: params.sway, height: Math.max(params.box.max.y - params.box.min.y, 1e-3), base: params.box.min.y, anchor: params.anchor, stiffness: params.stiffness, flutter: params.flutter });
    return m;
}

function windShadowMaterials(material, params) {
    const alpha = material.alphaTest > 0 ? { alphaTest: material.alphaTest, map: material.map } : {};
    const onBeforeCompile = swayCompile(params);
    return {
        depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: material.side, onBeforeCompile, ...alpha }),
        distance: new THREE.MeshDistanceMaterial({ side: material.side, onBeforeCompile, ...alpha }),
    };
}

const HUE_VERTEX = `#include <begin_vertex>
vInstanceHue = instanceHue;`;
const HUE_FRAGMENT = `#include <map_fragment>
{
    const vec3 hueAxis = vec3(0.57735027);
    float hueCos = cos(vInstanceHue);
    diffuseColor.rgb = diffuseColor.rgb * hueCos + cross(hueAxis, diffuseColor.rgb) * sin(vInstanceHue) + hueAxis * dot(hueAxis, diffuseColor.rgb) * (1.0 - hueCos);
}`;
const hueVariants = new WeakMap();

function hueCompile(previous) {
    return function (shader, renderer) {
        previous?.call(this, shader, renderer);
        shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute float instanceHue;
varying float vInstanceHue;`).replace("#include <begin_vertex>", HUE_VERTEX);
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying float vInstanceHue;`).replace("#include <map_fragment>", HUE_FRAGMENT);
    };
}

function hueMaterial(material) {
    if (Array.isArray(material)) return material.map(hueMaterial);
    if (!hueVariants.has(material)) {
        const m = material.clone();
        const previous = material._userOnBeforeCompile;
        m.onBeforeCompile = hueCompile(previous);
        const baseKey = THREE.Material.prototype.customProgramCacheKey;
        m.customProgramCacheKey = function () {
            return `${baseKey.call(this)}|hue|${previous?.toString() ?? ""}`;
        };
        hueVariants.set(material, m);
    }
    return hueVariants.get(material);
}

function hueGeometry(geometry, list) {
    const g = geometry.clone();
    g.setAttribute("instanceHue", new THREE.InstancedBufferAttribute(new Float32Array(list.map((inst) => ((inst.hue ?? 0) * Math.PI) / 180)), 1));
    return g;
}

const imageKeys = new WeakMap();
const functionIds = new WeakMap();
const canonicalMaterials = new Map();
const hashCanvas = new OffscreenCanvas(64, 64);
const hashContext = hashCanvas.getContext("2d", { willReadFrequently: true });

function imageKey(texture) {
    const image = texture.image;
    if (!image) return texture.uuid;
    if (!imageKeys.has(image)) {
        let key = texture.source.uuid;
        try {
            hashContext.clearRect(0, 0, 64, 64);
            hashContext.drawImage(image, 0, 0, 64, 64);
            const data = hashContext.getImageData(0, 0, 64, 64).data;
            let a = 0x811c9dc5;
            let b = 7;
            for (let i = 0; i < data.length; i++) {
                a = Math.imul(a ^ data[i], 0x01000193);
                b = (b * 31 + data[i]) | 0;
            }
            key = `${image.width}x${image.height}:${a >>> 0}:${b >>> 0}`;
        } catch {}
        imageKeys.set(image, key);
    }
    return imageKeys.get(image);
}

function functionId(fn) {
    if (!functionIds.has(fn)) functionIds.set(fn, foundry.utils.randomID());
    return functionIds.get(fn);
}

function materialKey(material) {
    const parts = [];
    for (const [k, v] of Object.entries(material)) {
        if (k === "uuid" || k === "id" || k === "version") continue;
        if (v?.isTexture) parts.push(k, imageKey(v), v.channel, v.flipY, v.colorSpace, v.wrapS, v.wrapT, v.rotation, ...v.offset, ...v.repeat, ...v.center);
        else if (v?.isColor) parts.push(k, v.getHex());
        else if (v?.isVector2) parts.push(k, v.x, v.y);
        else if (typeof v === "function") parts.push(k, functionId(v));
        else if (v === null || ["number", "boolean", "string"].includes(typeof v)) parts.push(k, v);
    }
    return parts.join("|");
}

function canonicalMaterial(material) {
    const key = materialKey(material);
    if (!canonicalMaterials.has(key)) canonicalMaterials.set(key, material);
    return canonicalMaterials.get(key);
}

function mergeSource(part) {
    if (part.merge !== undefined) return part.merge;
    const material = part.material;
    if (part.shadow || Array.isArray(material) || part.geometry.groups.length > 1 || Object.keys(part.geometry.morphAttributes).length) return (part.merge = null);
    const channels = new Set(Object.values(material).filter((v) => v?.isTexture).map((t) => t.channel));
    const keep = (name) => ["position", "normal", "tangent"].includes(name) || (name === "color" && material.vertexColors) || (name.startsWith("uv") && channels.has(name === "uv" ? 0 : +name.slice(2)));
    const geometry = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(part.geometry.attributes)) {
        if (!keep(name)) continue;
        const array = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) array[i * a.itemSize + c] = a.getComponent(i, c);
        geometry.setAttribute(name, new THREE.BufferAttribute(array, a.itemSize));
    }
    const index = part.geometry.index;
    if (index) geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: index.count }, (_, i) => index.getX(i)), 1));
    else geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
    const key = `${material.uuid}|${Object.entries(geometry.attributes).map(([name, a]) => name + a.itemSize).sort().join()}`;
    return (part.merge = { geometry, key });
}

function posedGeometry(mesh) {
    mesh.skeleton.update();
    const g = mesh.geometry.clone();
    g.deleteAttribute("skinIndex");
    g.deleteAttribute("skinWeight");
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, ...mesh.getVertexPosition(i, v).toArray());
    return g;
}

export function loadAsset(asset) {
    const key = assetKey(asset);
    if (!assetCache.has(key)) {
        assetCache.set(
            key,
            (async () => {
                const model = await game.Levels3DPreview.helpers.loadModel(asset.src);
                const root = model?.model ?? model?.scene;
                if (!root) return null;
                root.updateMatrixWorld(true);
                const raw = [];
                root.traverse((c) => c.isMesh && raw.push(c));
                const box = new THREE.Box3();
                const geometries = raw.map((c) => {
                    const g = (c.isSkinnedMesh ? posedGeometry(c) : c.geometry.clone()).applyMatrix4(c.matrixWorld);
                    g.computeBoundingBox();
                    box.union(g.boundingBox);
                    return g;
                });
                const size = box.getSize(new THREE.Vector3());
                const sway = asset.wind ?? 0;
                const parts = raw.map((c, k) => {
                    const materials = Array.isArray(c.material) ? c.material : [c.material];
                    const converted = materials.map((m) => {
                        if (asset.tint) (m = m.clone()).color.multiply(new THREE.Color(asset.tint));
                        return sway ? windMaterial(canonicalMaterial(m), swayParams(asset, m, box)) : canonicalMaterial(m);
                    });
                    const shadow = sway ? windShadowMaterials(materials[0], swayParams(asset, materials[0], box)) : null;
                    return { geometry: geometries[k], material: Array.isArray(c.material) ? converted : converted[0], shadow };
                });
                return { parts, box, size };
            })(),
        );
    }
    return assetCache.get(key);
}

const assetKey = (asset) => `${asset.src}|${asset.wind ?? 0}|${asset.tint ?? ""}`;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const LAY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export class ScatterField {
    constructor(tile3d) {
        this.tile3d = tile3d;
        this.container = new THREE.Group();
        this.content = new THREE.Group();
        this.itemContent = new THREE.Group();
        this.proxies = new THREE.Group();
        this.proxies.visible = false;
        this.dressContent = new THREE.Group();
        this.pick = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
        this.pick.raycast = (raycaster, intersects) => {
            if (canvas.tiles?.active) this.raycastContent(raycaster, intersects);
        };
        this.pick.userData.noShaders = true;
        this.container.add(this.content, this.itemContent, this.dressContent, this.proxies, this.pick);
        this.pick.scale.set(this.width / factor, 1, this.height / factor);
        this.instances = [];
        this.groups = new Map();
        this.itemMeshes = [];
        this.mergedMeshes = [];
        this.merged = new Set();
        this.hiddenMerged = new Set();
        this.infos = new Map();
        this.ex = new Set();
        this.base = null;
        this.stats = {};
        this.version = 0;
        this.queued = false;
        this.generating = 0;
        const schedule = foundry.utils.debounce(() => this.generate(), 300);
        const quick = foundry.utils.debounce(() => this.generate(), 20);
        this.schedule = () => {
            this.queued = true;
            schedule();
        };
        this.quick = () => {
            this.queued = true;
            quick();
        };
        fields.add(this);
    }

    get data() {
        return this.tile3d.scatterData;
    }

    get document() {
        return this.tile3d.document;
    }

    get width() {
        return Math.abs(this.document.width);
    }

    get height() {
        return Math.abs(this.document.height);
    }

    get angle() {
        return -this.tile3d.angle * this.tile3d.rotSign;
    }

    localToScene(lx, ly) {
        const t = this.tile3d;
        const v = new THREE.Vector3(lx - this.width / 2, 0, ly - this.height / 2).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.angle);
        return { x: t.center2d.x + v.x, y: t.center2d.y + v.z };
    }

    sceneToLocal(x, y) {
        const t = this.tile3d;
        const v = new THREE.Vector3(x - t.center2d.x, 0, y - t.center2d.y).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.angle);
        return { x: v.x + this.width / 2, y: v.z + this.height / 2 };
    }

    sceneRect() {
        const pts = [this.localToScene(0, 0), this.localToScene(this.width, 0), this.localToScene(0, this.height), this.localToScene(this.width, this.height)];
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return new PIXI.Rectangle(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
    }

    overlaps(doc) {
        const w = Math.abs(doc.width);
        const h = Math.abs(doc.height);
        const r = Math.hypot(w, h) / 2;
        const cx = doc.x - (doc.shape?.anchorX ?? 0.5) * doc.width + doc.width / 2;
        const cy = doc.y - (doc.shape?.anchorY ?? 0.5) * doc.height + doc.height / 2;
        return this.sceneRect().intersects(new PIXI.Rectangle(cx - r, cy - r, r * 2, r * 2));
    }

    baseKey() {
        const { items, ex, dress, ...rest } = this.data;
        return JSON.stringify([rest, scatterQuality()]);
    }

    async blockers() {
        const gridPx = canvas.scene.grid.size;
        const margin = BLOCKER_MARGIN * gridPx;
        const out = [];
        for (const tile of Object.values(game.Levels3DPreview.tiles)) {
            const doc = tile?.document;
            if (!tile?.mesh || tile.scatterData || tile.dynaMesh === "mapMaker" || !doc?.flags["levels-3d-preview"]?.model3d || !isObstacle(tile)) continue;
            const p = this.sceneToLocal(tile.center2d.x, tile.center2d.y);
            const yaw = -Math.toRadians(doc.rotation) - this.angle;
            out.push({ x: p.x, y: p.y, cos: Math.cos(yaw), sin: Math.sin(yaw), cx: 0, cz: 0, hx: Math.abs(doc.width) / 2 + margin, hz: Math.abs(doc.height) / 2 + margin });
        }
        for (const field of fields) {
            if (field.disposed || !field.data?.items?.length) continue;
            const set = SCATTER_SETS[field.data.set] ?? null;
            for (const it of field.data.items) {
                const asset = resolveItemAsset(set, it);
                if (!asset || isGroundCover(asset)) continue;
                const info = await loadAsset(asset).catch(() => null);
                if (!info) continue;
                const k = (gridPx / 2) * (it.s ?? 1);
                const scene = field.localToScene(it.x, it.y);
                const p = this.sceneToLocal(scene.x, scene.y);
                const yaw = (it.r ?? 0) + field.angle - this.angle;
                const { min, max } = info.box;
                out.push({ x: p.x, y: p.y, cos: Math.cos(yaw), sin: Math.sin(yaw), cx: ((min.x + max.x) / 2) * k, cz: ((min.z + max.z) / 2) * k, hx: ((max.x - min.x) / 2) * k + margin, hz: ((max.z - min.z) / 2) * k + margin });
            }
        }
        return out;
    }

    invalidate(rect = null) {
        if (rect && this.base && !this.angle && (this.base.patches ?? 0) < MAX_PATCHES) (this.dirty ??= []).push(rect);
        else {
            this.base = null;
            this.dirty = null;
        }
        this.schedule();
    }

    patchBase(base, dirty, top, blockers, radii, set, data) {
        const area = dirty[0].clone();
        for (const r of dirty.slice(1)) area.enlarge(r);
        const bounds = this.sceneRect();
        const x0 = Math.max(area.x, bounds.x);
        const y0 = Math.max(area.y, bounds.y);
        const x1 = Math.min(area.right, bounds.right);
        const y1 = Math.min(area.bottom, bounds.bottom);
        if (x1 <= x0 || y1 <= y0) return base;
        const rect = new PIXI.Rectangle(x0, y0, x1 - x0, y1 - y0);
        const sampler = sampleSurface(rect, { top });
        const previous = base.sample;
        const sample = (lx, ly) => {
            const p = this.localToScene(lx, ly);
            return rect.contains(p.x, p.y) ? sampler.sample(p.x, p.y) : previous(lx, ly);
        };
        const { nx, ny, cell, values } = base.grid;
        const a = this.sceneToLocal(x0, y0);
        const b = this.sceneToLocal(x1, y1);
        const i0 = Math.max(0, Math.floor(Math.min(a.x, b.x) / cell) - 1);
        const i1 = Math.min(nx - 1, Math.floor(Math.max(a.x, b.x) / cell) + 1);
        const j0 = Math.max(0, Math.floor(Math.min(a.y, b.y) / cell) - 1);
        const j1 = Math.min(ny - 1, Math.floor(Math.max(a.y, b.y) / cell) + 1);
        const inside = (index) => {
            const i = index % nx;
            const j = Math.floor(index / nx);
            return i >= i0 && i <= i1 && j >= j0 && j <= j1;
        };
        const density = new values.constructor(values.length);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) density[j * nx + i] = values[j * nx + i];
        const fresh = set ? generateInstances({ data: { ...data, cell }, set, density, nx, ny, width: this.width, height: this.height, gridPx: canvas.scene.grid.size, qualityDensity: base.quality.density, sample, blockers, radii }) : [];
        const kept = [];
        const replaced = [];
        for (const inst of base.generated) (inside(inst.cell) ? replaced : kept).push(inst);
        const sig = (list) => list.map((inst) => `${inst.id}:${Math.round(inst.y * 1e4)}`).sort().join("|");
        if (sig(replaced) === sig(fresh)) return { ...base, sample, sampledAt: performance.now(), patches: (base.patches ?? 0) + 1, same: true };
        return { ...base, sample, generated: [...kept, ...fresh], sampledAt: performance.now(), patches: (base.patches ?? 0) + 1, same: false };
    }

    dataChanged() {
        if (this.base?.key === this.baseKey()) return this.quick();
        this.schedule();
    }

    get busy() {
        return this.queued || this.generating > 0;
    }

    async generate() {
        this.queued = false;
        this.generating++;
        try {
            return await this.regenerate();
        } finally {
            this.generating--;
        }
    }

    async regenerate() {
        const L = game.Levels3DPreview;
        if (this.disposed || !L?._active || !(L._ready || L._loadingScatter) || this.tile3d._parked) return;
        if (Object.values(L.tiles).some((t) => t && !t._loaded && t !== this.tile3d)) return this.schedule();
        const version = ++this.version;
        const start = performance.now();
        const data = this.data;
        const set = SCATTER_SETS[data.set] ?? null;
        const t = this.tile3d;
        const gridPx = canvas.scene.grid.size;
        const key = this.baseKey();
        const blockers = set && set.kind !== "furnish" ? await this.blockers() : [];
        if (version !== this.version || this.disposed) return;
        const blockKey = JSON.stringify(blockers.map((b) => [b.x, b.y, b.cos * 100, b.sin * 100, b.hx, b.hz].map(Math.round)));
        let base = this.base?.key === key && this.base.blockKey === blockKey ? this.base : null;
        if (!base) {
            const grid = await readDensity(this.document, data);
            if (version !== this.version || this.disposed) return;
            const depth = this.document.getFlag("levels-3d-preview", "depth");
            const sampledAt = performance.now();
            const sampler = sampleSurface(this.sceneRect(), { top: depth > 0 ? t.center.y + depth / factor : Infinity });
            const sample = (lx, ly) => {
                const p = this.localToScene(lx, ly);
                return sampler.sample(p.x, p.y);
            };
            const quality = scatterQuality();
            const radii = blockers.length ? await Promise.all(set.assets.map((a) => loadAsset(a).then((info) => (Math.max(info.size.x, info.size.z) * gridPx) / 4).catch(() => null))) : [];
            if (version !== this.version || this.disposed) return;
            const generated = set ? generateInstances({ data: { ...data, cell: grid.cell }, set, density: grid.values, nx: grid.nx, ny: grid.ny, width: this.width, height: this.height, gridPx, qualityDensity: quality.density, sample, blockers, radii }) : [];
            base = { key, blockKey, grid, sampler, sample, generated, quality, sampledAt };
            this.dirty = null;
        } else if (this.dirty?.length) {
            const radii = blockers.length ? await Promise.all(set.assets.map((a) => loadAsset(a).then((info) => (Math.max(info.size.x, info.size.z) * gridPx) / 4).catch(() => null))) : [];
            if (version !== this.version || this.disposed) return;
            const dirty = this.dirty;
            this.dirty = null;
            const depth = this.document.getFlag("levels-3d-preview", "depth");
            base = this.patchBase(base, dirty, depth > 0 ? t.center.y + depth / factor : Infinity, blockers, radii, set, data);
        }
        const { nx, ny, cell } = base.grid;
        const explicit = explicitInstances({ items: data.items, set, nx, ny, cell, gridPx, sample: base.sample, fallbackY: t.center.y, flat: this.flatTolerance(data, set) });
        const fresh = base !== this.base && !base.same;
        await this.loadAssets([...(fresh ? base.generated : []), ...explicit]);
        if (version !== this.version || this.disposed) return;
        const ex = new Set(data.ex ?? []);
        const changed = fresh ? null : new Set([...ex, ...this.ex].filter((id) => ex.has(id) !== this.ex.has(id)));
        this.base = base;
        this.interior = set?.kind === "furnish";
        this.ex = ex;
        const prevLevel = this.level;
        this.level = this.interior ? propLevel(data.dress) : null;
        const levelKey = JSON.stringify(this.level);
        const relevel = levelKey !== this.levelKey;
        this.levelKey = levelKey;
        const swap = relevel && !fresh && !changed.size && !!prevLevel && !!this.level;
        const rebuild = relevel && !swap;
        if (swap) this.swapLevel();
        if (fresh || changed.size || rebuild) this.buildGenerated(rebuild ? null : changed);
        const itemsKey = JSON.stringify(data.items ?? []);
        const explicitKey = JSON.stringify(explicit.map((inst) => [inst.x, inst.z, Math.round(inst.y * 1e4)]));
        const same = !fresh && !changed.size && !rebuild && this.items && itemsKey === this.itemsKey && explicitKey === this.explicitKey;
        const items = same ? this.items : explicit.filter((inst) => this.infos.get(assetKey(inst.asset)));
        if (!same) this.buildItems(items);
        this.items = items;
        this.itemsKey = itemsKey;
        this.explicitKey = explicitKey;
        const dressKey = JSON.stringify([data.dress ?? null, data.dress ? dressTier() : null]);
        const redress = fresh || dressKey !== this.dressKey;
        if (redress) this.buildDress(data.dress, base.sample);
        this.dressKey = dressKey;
        if (!fresh && !changed.size && !rebuild && !swap && same && !redress) return;
        this.instances = [...[...this.groups.values()].flatMap((g) => g.list.filter((inst) => !ex.has(inst.id))), ...items];
        if (!same || redress) this.buildPropDress(data.dress);
        this.pick.scale.set(this.width / factor, 1, this.height / factor);
        this.pick.position.y = this.instances.length ? this.instances.reduce((sum, inst) => sum + inst.y, 0) / this.instances.length - t.center.y : 0;
        this.container.updateMatrixWorld(true);
        markReceivers(this.content, t);
        markReceivers(this.itemContent, t);
        L.lightWarmup?.warmObject(this.content);
        if (!same || swap) for (const mesh of this.itemContent.children) L.lightWarmup?.warmObject(mesh);
        this.stats = { instances: this.instances.length, meshes: this.content.children.length + this.itemContent.children.length, ms: Math.round(performance.now() - start) };
        if (this.updateProxies(items)) t.sendToWorker();
        Hooks.callAll("3DCanvasScatterGenerated", this);
    }

    async loadAssets(instances) {
        const unique = new Map();
        for (const inst of instances) if (!this.infos.has(assetKey(inst.asset))) unique.set(assetKey(inst.asset), inst.asset);
        await Promise.all([...unique].map(async ([key, asset]) => this.infos.set(key, await loadAsset(asset).catch(() => null))));
    }

    instanceMatrix(inst, out = new THREE.Matrix4()) {
        const t = this.tile3d;
        const k = (gridUnit() / 2) * inst.scale;
        const up = THREE.Object3D.DEFAULT_UP;
        const normal = inst.normal.clone().applyAxisAngle(up, -this.angle);
        const tilt = new THREE.Quaternion().setFromUnitVectors(up, up.clone().lerp(normal, inst.asset.align ?? 0).normalize());
        const q = tilt.multiply(new THREE.Quaternion().setFromAxisAngle(up, inst.yaw));
        if (inst.rx || inst.rz) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(inst.rx ?? 0, 0, inst.rz ?? 0, "YXZ")));
        if (inst.asset.lay) q.multiply(LAY);
        const pos = new THREE.Vector3((inst.x - this.width / 2) / factor, inst.y - t.center.y + (inst.asset.yOffset ?? 0) * k, (inst.z - this.height / 2) / factor);
        return out.compose(pos, q, new THREE.Vector3(k, k, k));
    }

    worldMatrix(inst, out = new THREE.Matrix4()) {
        this.container.updateMatrixWorld();
        return out.multiplyMatrices(this.container.matrixWorld, this.instanceMatrix(inst));
    }

    castsShadow(asset, info) {
        const quality = this.base.quality;
        const tall = (info.size?.y ?? 1) * Math.max(...[asset.scale ?? 1].flat()) >= SHADOW_MIN_HEIGHT;
        return !this.interior && (quality.shadows === "all" ? tall || !!asset.blocking : quality.shadows === "blocking" && !!asset.blocking);
    }

    mergeable(inst) {
        return this.infoOf(inst).parts.every((part) => mergeSource(part));
    }

    instancedMeshes(list, parent) {
        if (!list.length) return [];
        const asset = list[0].asset;
        const info = this.infos.get(assetKey(asset));
        const castShadow = this.castsShadow(asset, info);
        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();
        const tinted = list.some((inst) => inst.tint);
        const hued = list.some((inst) => inst.hue);
        list.forEach((inst) => (inst.refs = []));
        const dressed = this.level ? new Float32Array(list.flatMap((inst) => dressPropVector(propFrame(inst, info, this.propScale()), this.propScale().metre))) : null;
        return info.parts.map((part) => {
            const geometry = hued ? hueGeometry(part.geometry, list) : dressed ? part.geometry.clone() : part.geometry;
            if (dressed) geometry.setAttribute("dressProp", new THREE.InstancedBufferAttribute(dressed, 4));
            const baseMaterial = hued ? hueMaterial(part.material) : part.material;
            const mesh = new THREE.InstancedMesh(geometry, propMaterial(baseMaterial, this.level, asset), list.length);
            mesh.userData.ownGeometry = hued || !!dressed;
            mesh.userData.dressBase = { material: baseMaterial, asset };
            list.forEach((inst, i) => {
                mesh.setMatrixAt(i, this.instanceMatrix(inst, matrix));
                if (tinted) mesh.setColorAt(i, color.set(inst.tint ?? 0xffffff));
                inst.refs.push({ mesh, i });
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.computeBoundingBox();
            mesh.castShadow = castShadow;
            mesh.receiveShadow = true;
            mesh.renderOrder = this.interior ? 1 : 0;
            if (part.shadow) {
                mesh.customDepthMaterial = part.shadow.depth;
                mesh.customDistanceMaterial = part.shadow.distance;
            }
            mesh.raycast = noRaycast;
            mesh.userData.sight = false;
            mesh.userData.collision = false;
            mesh.userData.cameraCollision = false;
            parent.add(mesh);
            return mesh;
        });
    }

    disposeMeshes(meshes = []) {
        meshes.forEach((m) => {
            m.removeFromParent();
            m.dispose();
            if (m.userData.ownGeometry) m.geometry.dispose();
        });
    }

    buildGenerated(changed = null) {
        if (!changed) {
            this.groups.forEach((g) => this.disposeMeshes(g.meshes));
            this.groups.clear();
            const chunkPx = Math.max(CHUNK_CELLS * canvas.scene.grid.size, Math.max(this.width, this.height) / MAX_CHUNKS);
            for (const inst of this.base.generated) {
                if (!this.infos.get(assetKey(inst.asset))) continue;
                const key = `${inst.asset.index}|${Math.floor(inst.x / chunkPx)},${Math.floor(inst.z / chunkPx)}`;
                if (!this.groups.has(key)) this.groups.set(key, { list: [], meshes: [] });
                this.groups.get(key).list.push(inst);
            }
        }
        for (const group of this.groups.values()) {
            if (changed && !group.list.some((inst) => changed.has(inst.id))) continue;
            this.disposeMeshes(group.meshes);
            group.meshes = this.instancedMeshes(group.list.filter((inst) => !this.ex.has(inst.id) && !(this.interior && this.mergeable(inst))), this.content);
        }
        this.genProxy?.dispose();
        this.genProxy = this.proxyGeometry([...this.groups.values()].flatMap((g) => g.list.filter((inst) => !this.ex.has(inst.id))));
        this.proxyKey = null;
    }

    buildItems(items) {
        this.disposeMeshes(this.itemMeshes);
        const byAsset = new Map();
        for (const inst of items) {
            const key = `${assetKey(inst.asset)}|${inst.tint ? "tint" : ""}|${inst.hue ? "hue" : ""}`;
            if (!byAsset.has(key)) byAsset.set(key, []);
            byAsset.get(key).push(inst);
        }
        const merge = this.interior ? [...this.groups.values()].flatMap((g) => g.list.filter((inst) => !this.ex.has(inst.id) && this.mergeable(inst))) : [];
        const instanced = [];
        for (const list of byAsset.values()) {
            if (!list[0].tint && !list[0].hue && (this.interior || list.length <= MERGE_MAX) && this.mergeable(list[0])) merge.push(...list);
            else instanced.push(list);
        }
        this.itemMeshes = instanced.flatMap((list) => this.instancedMeshes(list, this.itemContent));
        this.merged = new Set(merge);
        this.hiddenMerged = new Set();
        this.buildMerged();
    }

    buildMerged() {
        this.mergedMeshes.forEach((m) => {
            m.removeFromParent();
            m.geometry.dispose();
        });
        const groups = new Map();
        const matrix = new THREE.Matrix4();
        for (const inst of this.merged) {
            inst.refs = [];
            inst.mergedRanges = [];
            if (this.hiddenMerged.has(inst)) continue;
            const info = this.infoOf(inst);
            const castShadow = this.castsShadow(inst.asset, info);
            this.instanceMatrix(inst, matrix);
            const dressed = this.level ? dressPropVector(propFrame(inst, info, this.propScale()), this.propScale().metre) : null;
            for (const part of info.parts) {
                const source = mergeSource(part);
                const material = propMaterial(part.material, this.level, inst.asset);
                const key = `${source.key}|${castShadow}|${material.uuid}`;
                if (!groups.has(key)) groups.set(key, { material, castShadow, geometries: [], count: 0, dressBase: { material: part.material, asset: inst.asset } });
                const group = groups.get(key);
                const geometry = source.geometry.clone().applyMatrix4(matrix);
                const count = geometry.attributes.position.count;
                if (dressed) geometry.setAttribute("dressProp", new THREE.BufferAttribute(new Float32Array(count * 4).map((_, k) => dressed[k % 4]), 4));
                inst.mergedRanges.push({ group, start: group.count, count, source: source.geometry });
                group.count += count;
                group.geometries.push(geometry);
            }
        }
        this.mergedMeshes = [...groups.values()].map((group) => {
            const { material, castShadow, geometries } = group;
            const mesh = new THREE.Mesh(geometries.length > 1 ? mergeGeometries(geometries) : geometries[0], material);
            group.mesh = mesh;
            mesh.userData.dressBase = group.dressBase;
            if (geometries.length > 1) geometries.forEach((g) => g.dispose());
            mesh.geometry.computeBoundingSphere();
            mesh.geometry.computeBoundingBox();
            mesh.castShadow = castShadow;
            mesh.receiveShadow = true;
            mesh.renderOrder = this.interior ? 1 : 0;
            mesh.raycast = noRaycast;
            mesh.userData.sight = false;
            mesh.userData.collision = false;
            mesh.userData.cameraCollision = false;
            this.itemContent.add(mesh);
            return mesh;
        });
    }

    swapLevel() {
        for (const mesh of [...this.content.children, ...this.itemContent.children]) {
            const base = mesh.userData.dressBase;
            if (base) mesh.material = propMaterial(base.material, this.level, base.asset);
        }
    }

    buildDress(dress, sample) {
        this.disposeDress();
        if (!dress) return;
        const t = this.tile3d;
        const gridPx = canvas.scene.grid.size;
        const metre = gridPx / 2 / factor;
        const flat = (gridPx * 0.05) / factor;
        const toLocal = (lx, ly, h) => new THREE.Vector3((lx - this.width / 2) / factor, h * metre, (ly - this.height / 2) / factor);
        const reach = gridPx / 8;
        const valid = (s) => s && Math.abs(s.y - t.center.y) <= flat;
        const heights = [];
        for (let j = 1; j < 12; j++) for (let i = 1; i < 12; i++) {
            const s = sample((this.width * i) / 12, (this.height * j) / 12);
            if (valid(s)) heights.push(s.y - t.center.y);
        }
        heights.sort((a, b) => a - b);
        const base = heights.length ? heights[Math.floor(heights.length * 0.75)] : 0;
        const floorAt = (lx, ly) => {
            let best = -Infinity;
            for (const [dx, dy] of [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
                const s = sample(lx + dx, ly + dy);
                if (valid(s)) best = Math.max(best, s.y - t.center.y);
            }
            return Number.isFinite(best) ? Math.max(best, base - flat * 0.2) : base;
        };
        const holeAt = (lx, ly) => {
            const s = sample(lx, ly);
            return !s || s.y - t.center.y < base - flat * 0.6;
        };
        try {
            for (const mesh of buildDressing(dress, { toLocal, metre, floorAt, holeAt, detail: scatterQuality().density })) {
                this.dressContent.add(mesh);
                game.Levels3DPreview.lightWarmup?.warmObject(mesh);
            }
        } catch (err) {
            console.error(err);
        }
    }

    propScale() {
        const metre = gridUnit() / 2;
        return { metre, centerY: this.tile3d.center.y, mPx: metre * factor };
    }

    buildPropDress(dress) {
        for (const mesh of this.propDressMeshes ?? []) {
            mesh.removeFromParent();
            mesh.geometry.dispose();
        }
        this.propDressMeshes = [];
        if (!this.interior || !dress) return;
        const scale = this.propScale();
        const frames = this.instances.map((inst) => this.infoOf(inst) && propFrame(inst, this.infoOf(inst), scale)).filter(Boolean);
        dressUniforms.dressMetre.value = scale.metre;
        const toLocal = (lx, ly, h) => new THREE.Vector3((lx - this.width / 2) / factor, h * scale.metre, (ly - this.height / 2) / factor);
        try {
            this.propDressMeshes = buildPropWebs(propWebs(frames, dress, scale), { toLocal, metre: scale.metre, detail: scatterQuality().density });
            for (const mesh of this.propDressMeshes) {
                this.dressContent.add(mesh);
                game.Levels3DPreview.lightWarmup?.warmObject(mesh);
            }
        } catch (err) {
            console.error(err);
        }
    }

    disposeDress() {
        for (const mesh of this.dressContent.children.slice()) {
            mesh.removeFromParent();
            mesh.geometry.dispose();
            if (mesh.userData.ownMaterial) mesh.material.dispose();
        }
        this.dressKey = null;
    }

    updateProxies(items) {
        const blocking = items.filter((inst) => inst.asset.blocking);
        const key = JSON.stringify(blocking.map((inst) => [inst.asset.src, inst.x, inst.z, inst.y, inst.yaw, inst.scale]));
        if (key === this.proxyKey) return false;
        this.proxyKey = key;
        this.proxies.children.slice().forEach((m) => {
            m.removeFromParent();
            m.geometry.disposeBoundsTree?.();
            m.geometry.dispose();
        });
        const itemGeometry = this.proxyGeometry(blocking);
        const parts = [this.genProxy, itemGeometry].filter(Boolean);
        if (parts.length) {
            const mesh = new THREE.Mesh(parts.length > 1 ? mergeGeometries(parts) : parts[0].clone(), proxyMaterial);
            mesh.geometry.computeBoundsTree();
            mesh.userData = { sight: true, collision: true, cameraCollision: false, noShaders: true };
            this.proxies.add(mesh);
        }
        itemGeometry?.dispose();
        this.tile3d._collidersVersion = (this.tile3d._collidersVersion ?? 0) + 1;
        return true;
    }

    proxyGeometry(instances) {
        const template = new THREE.CylinderGeometry(1, 1, 1, 8, 1).translate(0, 0.5, 0);
        template.deleteAttribute("uv");
        template.deleteAttribute("normal");
        const geometries = [];
        const matrix = new THREE.Matrix4();
        for (const inst of instances) {
            if (!inst.asset.blocking) continue;
            const info = this.infos.get(assetKey(inst.asset));
            const radius = inst.asset.trunk ?? Math.min(info.size.x, info.size.z) * 0.4;
            const bottom = Math.min(0, info.box.min.y);
            const shape = new THREE.Matrix4().makeScale(radius, Math.max(info.box.max.y - bottom, 0.01), radius).setPosition((info.box.min.x + info.box.max.x) / 2, bottom, (info.box.min.z + info.box.max.z) / 2);
            const yawOnly = { ...inst, asset: { ...inst.asset, align: 0 } };
            geometries.push(template.clone().applyMatrix4(this.instanceMatrix(yawOnly, matrix).multiply(shape)));
        }
        template.dispose();
        if (!geometries.length) return null;
        const merged = mergeGeometries(geometries);
        geometries.forEach((g) => g.dispose());
        return merged;
    }

    setHidden(inst, hidden) {
        if (this.merged.has(inst)) {
            if (hidden === this.hiddenMerged.has(inst)) return;
            this.hiddenMerged[hidden ? "add" : "delete"](inst);
            if (!inst.mergedRanges?.length) return this.buildMerged();
            return this.writeMerged(inst, hidden);
        }
        const matrix = new THREE.Matrix4();
        for (const { mesh, i } of inst.refs ?? []) {
            mesh.setMatrixAt(i, hidden ? ZERO : this.instanceMatrix(inst, matrix));
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    writeMerged(inst, hidden) {
        const matrix = this.instanceMatrix(inst, new THREE.Matrix4());
        const v = new THREE.Vector3();
        for (const { group, start, count, source } of inst.mergedRanges) {
            const position = group.mesh.geometry.attributes.position;
            const from = source.attributes.position;
            for (let k = 0; k < count; k++) {
                if (hidden) position.setXYZ(start + k, 0, 0, 0);
                else {
                    v.fromBufferAttribute(from, k).applyMatrix4(matrix);
                    position.setXYZ(start + k, v.x, v.y, v.z);
                }
            }
            position.addUpdateRange(start * 3, count * 3);
            position.needsUpdate = true;
        }
    }

    infoOf(inst) {
        return this.infos.get(assetKey(inst.asset)) ?? null;
    }

    raycastContent(raycaster, intersects) {
        if (!this.instances.length) return THREE.Mesh.prototype.raycast.call(this.pick, raycaster, intersects);
        for (const group of [this.content, this.itemContent]) {
            for (const mesh of group.children) {
                if (!mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree({ indirect: true });
                if (mesh.isInstancedMesh) raycastInstances(mesh, raycaster, intersects);
                else if (mesh.isMesh) THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
            }
        }
    }

    pickInstance(ray, filter = () => true) {
        this.container.updateMatrixWorld();
        const container = this.container.matrixWorld;
        const world = new THREE.Matrix4();
        const inverse = new THREE.Matrix4();
        const local = new THREE.Ray();
        const hit = new THREE.Vector3();
        let best = null;
        for (const inst of this.instances) {
            const info = this.infoOf(inst);
            if (!info || !filter(inst, info)) continue;
            world.multiplyMatrices(container, this.instanceMatrix(inst, inverse));
            local.copy(ray).applyMatrix4(inverse.copy(world).invert());
            if (!local.intersectBox(info.box, hit)) continue;
            hit.applyMatrix4(world);
            const distance = hit.distanceTo(ray.origin);
            if (!best || distance < best.distance) best = { inst, distance, point: hit.clone(), field: this };
        }
        return best;
    }

    surfaceAt(x, y) {
        return this.base?.sampler.sample(x, y) ?? null;
    }

    flatTolerance(data = this.data, set = SCATTER_SETS[data.set] ?? null) {
        return data.flat ?? set?.kind === "furnish" ? (canvas.scene.grid.size * 0.05) / factor : 0;
    }

    groundAt(x, y) {
        const s = this.surfaceAt(x, y);
        const center = this.tile3d.center.y;
        const flat = this.flatTolerance();
        return !s || (flat && Math.abs(s.y - center) > flat) ? center : s.y;
    }

    clear() {
        this.groups.forEach((g) => this.disposeMeshes(g.meshes));
        this.groups.clear();
        this.disposeMeshes(this.itemMeshes);
        this.itemMeshes = [];
        this.items = null;
        this.disposeDress();
        this.merged.clear();
        this.buildMerged();
        this.genProxy?.dispose();
        this.genProxy = null;
        this.proxyKey = null;
        this.proxies.children.slice().forEach((m) => {
            m.removeFromParent();
            m.geometry.disposeBoundsTree?.();
            m.geometry.dispose();
        });
        this.tile3d._collidersVersion = (this.tile3d._collidersVersion ?? 0) + 1;
    }

    sendToWorker() {
        const workers = game.Levels3DPreview.workers;
        if (!workers?.enabled) return;
        const proxy = this.proxies.children[0];
        if (!proxy || !this.tile3d.sight) return workers.removeMesh(this.document.id);
        this.container.updateMatrixWorld(true);
        const mesh = new THREE.Mesh(proxy.geometry, proxyMaterial);
        mesh.applyMatrix4(proxy.matrixWorld);
        mesh.userData = { sight: true, collision: true };
        mesh.updateMatrixWorld();
        workers.addMesh({ type: "add", meshJSON: mesh.toJSONClean?.() ?? mesh.toJSON(), id: this.document.id, sight: true, hasTags: true, isDoor: false, isOpen: false });
    }

    assetInfo(asset) {
        return loadAsset(asset);
    }

    update() {
        updateWindSway();
    }

    dispose() {
        this.disposed = true;
        fields.delete(this);
        this.clear();
        this.pick.geometry.dispose();
    }
}

export function refreshScatter(doc, rect = null) {
    for (const field of fields) if (!doc || (rect ? field.sceneRect().intersects(rect) : field.overlaps(doc))) field.invalidate(rect);
}

let surfaceChangedAt = 0;
const refreshStaleSurfaces = foundry.utils.debounce(() => {
    for (const field of fields) if (field.base && field.base.sampledAt < surfaceChangedAt) field.invalidate();
}, 150);

export function surfacesChanged() {
    surfaceChangedAt = performance.now();
    refreshStaleSurfaces();
}

export function refreshDressing() {
    for (const field of fields) if (!field.disposed && field.data?.dress) field.quick();
}

export function scatterFields() {
    return [...fields];
}

export function registerScatterHooks() {
    trackTileRects();
    const onChange = (doc, changes, update = false) => {
        if (doc.parent !== canvas.scene) return;
        const scatter = doc.flags?.["levels-3d-preview"]?.scatter;
        if (!scatter) {
            if (update && (!affectsSurface(changes) || doc.flags?.["levels-3d-preview"]?.mapMakerMesh?.k === "terrain")) return;
            return refreshScatter(doc, changedRect(doc, canvas.scene.grid.size));
        }
        if (!scatter.items?.length && !foundry.utils.hasProperty(changes ?? {}, "flags.levels-3d-preview.scatter.items")) return;
        for (const field of fields) if (field.document !== doc && field.overlaps(doc)) field.quick();
    };
    Hooks.on("createTile", (doc, options) => onChange(doc, options));
    Hooks.on("updateTile", (doc, changes) => onChange(doc, changes, true));
    Hooks.on("deleteTile", (doc, options) => onChange(doc, options));
    Hooks.on("3DCanvasSceneReady", (L, options) => {
        if (options?.levelSwitch) return;
        for (const field of fields) if (!field.base) field.invalidate();
    });
}
