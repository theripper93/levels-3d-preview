import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { factor } from "../main.js";
import { decodeGrid } from "../helpers/chunkCodec.js";
import { SCATTER_SETS } from "./sets.js";
import { generateInstances } from "./generate.js";
import { sampleSurface, gridUnit } from "./surface.js";
import { WIND_GLSL, windUniforms, updateWindSway, isFoliage } from "../shaders/wind/windSway.js";

const CHUNK_CELLS = 16;
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

function loadAsset(asset) {
    const key = `${asset.src}|${asset.wind ?? 0}`;
    if (!assetCache.has(key)) {
        assetCache.set(
            key,
            (async () => {
                const model = await game.Levels3DPreview.helpers.loadModel(asset.src);
                const root = model?.model ?? model?.scene;
                if (!root) return null;
                root.updateMatrixWorld(true);
                const raw = [];
                root.traverse((c) => c.isMesh && !c.isSkinnedMesh && raw.push(c));
                const box = new THREE.Box3();
                const geometries = raw.map((c) => {
                    const g = c.geometry.clone().applyMatrix4(c.matrixWorld);
                    g.computeBoundingBox();
                    box.union(g.boundingBox);
                    return g;
                });
                const size = box.getSize(new THREE.Vector3());
                const sway = asset.wind ?? 0;
                const parts = raw.map((c, k) => {
                    const materials = Array.isArray(c.material) ? c.material : [c.material];
                    const converted = materials.map((m) => (sway ? windMaterial(m, swayParams(asset, m, box)) : m));
                    const shadow = sway ? windShadowMaterials(materials[0], swayParams(asset, materials[0], box)) : null;
                    return { geometry: geometries[k], material: Array.isArray(c.material) ? converted : converted[0], shadow };
                });
                return { parts, box, size };
            })(),
        );
    }
    return assetCache.get(key);
}

export class ScatterField {
    constructor(tile3d) {
        this.tile3d = tile3d;
        this.container = new THREE.Group();
        this.content = new THREE.Group();
        this.proxies = new THREE.Group();
        this.proxies.visible = false;
        this.pick = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
        this.pick.raycast = function (raycaster, intersects) {
            if (canvas.tiles?.active) THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
        };
        this.pick.userData.noShaders = true;
        this.container.add(this.content, this.proxies, this.pick);
        this.pick.scale.set(this.width / factor, 1, this.height / factor);
        this.instances = [];
        this.stats = {};
        this.version = 0;
        this.schedule = foundry.utils.debounce(() => this.generate(), 300);
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

    async generate() {
        const L = game.Levels3DPreview;
        if (this.disposed || !L?._active) return;
        if (Object.values(L.tiles).some((t) => t && !t._loaded && t !== this.tile3d)) return this.schedule();
        const version = ++this.version;
        const start = performance.now();
        const data = this.data;
        const set = SCATTER_SETS[data.set];
        const assets = set ? await Promise.all(set.assets.map((a) => loadAsset(a))) : [];
        if (version !== this.version || this.disposed) return;
        const t = this.tile3d;
        const { values, nx, ny, cell } = await readDensity(this.document, data);
        if (version !== this.version || this.disposed) return;
        const depth = this.document.getFlag("levels-3d-preview", "depth");
        const top = depth > 0 ? t.center.y + depth / factor : Infinity;
        const sampler = set ? sampleSurface(this.sceneRect(), { top }) : null;
        const quality = scatterQuality();
        const instances = set
            ? generateInstances({
                  data: { ...data, cell },
                  set,
                  density: values,
                  nx,
                  ny,
                  width: this.width,
                  height: this.height,
                  gridPx: canvas.scene.grid.size,
                  qualityDensity: quality.density,
                  fallbackY: t.center.y,
                  sample: (lx, ly) => {
                      const p = this.localToScene(lx, ly);
                      return sampler.sample(p.x, p.y);
                  },
              }).filter((inst) => assets[inst.asset.index])
            : [];
        this.instances = instances;
        this.build(instances, assets, quality);
        this.stats = { instances: instances.length, meshes: this.content.children.length, ms: Math.round(performance.now() - start) };
        t.sendToWorker();
        Hooks.callAll("3DCanvasScatterGenerated", this);
    }

    instanceMatrix(inst, out = new THREE.Matrix4()) {
        const t = this.tile3d;
        const k = (gridUnit() / 2) * inst.scale;
        const up = THREE.Object3D.DEFAULT_UP;
        const normal = inst.normal.clone().applyAxisAngle(up, -this.angle);
        const tilt = new THREE.Quaternion().setFromUnitVectors(up, up.clone().lerp(normal, inst.asset.align ?? 0).normalize());
        const q = tilt.multiply(new THREE.Quaternion().setFromAxisAngle(up, inst.yaw));
        const pos = new THREE.Vector3((inst.x - this.width / 2) / factor, inst.y - t.center.y + (inst.asset.yOffset ?? 0) * k, (inst.z - this.height / 2) / factor);
        return out.compose(pos, q, new THREE.Vector3(k, k, k));
    }

    build(instances, assets, quality) {
        this.clear();
        const chunkPx = CHUNK_CELLS * canvas.scene.grid.size;
        const groups = new Map();
        for (const inst of instances) {
            const key = `${inst.asset.index}|${Math.floor(inst.x / chunkPx)},${Math.floor(inst.z / chunkPx)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(inst);
        }
        const matrix = new THREE.Matrix4();
        for (const list of groups.values()) {
            const asset = list[0].asset;
            const info = assets[asset.index];
            const castShadow = quality.shadows === "all" || (quality.shadows === "blocking" && !!asset.blocking);
            for (const part of info.parts) {
                const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
                list.forEach((inst, i) => mesh.setMatrixAt(i, this.instanceMatrix(inst, matrix)));
                mesh.instanceMatrix.needsUpdate = true;
                mesh.computeBoundingSphere();
                mesh.computeBoundingBox();
                mesh.castShadow = castShadow;
                mesh.receiveShadow = true;
                if (part.shadow) {
                    mesh.customDepthMaterial = part.shadow.depth;
                    mesh.customDistanceMaterial = part.shadow.distance;
                }
                mesh.raycast = noRaycast;
                mesh.userData.sight = false;
                mesh.userData.collision = false;
                mesh.userData.cameraCollision = false;
                this.content.add(mesh);
            }
        }
        this.buildProxies(instances, assets);
        this.pick.scale.set(this.width / factor, 1, this.height / factor);
        this.pick.position.y = instances.length ? instances.reduce((sum, inst) => sum + inst.y, 0) / instances.length - this.tile3d.center.y : 0;
        this.container.updateMatrixWorld(true);
    }

    buildProxies(instances, assets) {
        const template = new THREE.CylinderGeometry(1, 1, 1, 8, 1).translate(0, 0.5, 0);
        template.deleteAttribute("uv");
        template.deleteAttribute("normal");
        const geometries = [];
        const matrix = new THREE.Matrix4();
        for (const inst of instances) {
            if (!inst.asset.blocking) continue;
            const info = assets[inst.asset.index];
            const radius = inst.asset.trunk ?? Math.min(info.size.x, info.size.z) * 0.4;
            const bottom = Math.min(0, info.box.min.y);
            const shape = new THREE.Matrix4().makeScale(radius, Math.max(info.box.max.y - bottom, 0.01), radius).setPosition((info.box.min.x + info.box.max.x) / 2, bottom, (info.box.min.z + info.box.max.z) / 2);
            const yawOnly = { ...inst, asset: { ...inst.asset, align: 0 } };
            geometries.push(template.clone().applyMatrix4(this.instanceMatrix(yawOnly, matrix).multiply(shape)));
        }
        template.dispose();
        if (!geometries.length) return;
        const mesh = new THREE.Mesh(mergeGeometries(geometries), proxyMaterial);
        geometries.forEach((g) => g.dispose());
        mesh.geometry.computeBoundsTree();
        mesh.userData = { sight: true, collision: true, cameraCollision: false, noShaders: true };
        this.proxies.add(mesh);
    }

    clear() {
        this.content.children.slice().forEach((m) => {
            m.removeFromParent();
            m.dispose();
        });
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

export function refreshScatter(doc) {
    for (const field of fields) if (!doc || field.overlaps(doc)) field.schedule();
}

export function scatterFields() {
    return [...fields];
}

export function registerScatterHooks() {
    const onChange = (doc) => {
        if (doc.parent !== canvas.scene || doc.flags?.["levels-3d-preview"]?.scatter?.set) return;
        refreshScatter(doc);
    };
    for (const hook of ["createTile", "updateTile", "deleteTile"]) Hooks.on(hook, onChange);
    Hooks.on("3DCanvasSceneReady", () => refreshScatter());
}
