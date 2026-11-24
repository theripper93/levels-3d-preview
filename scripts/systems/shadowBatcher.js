import * as THREE from "three";
import { compileForComposer } from "../render/pipeline.js";
import { windDepthMaterials, windSwayParams, windSwayKey, addWindAttributes } from "../shaders/wind/windBatch.js";

const BUILD_DELAY = 500;
const BUILD_BUDGET = 4;
const SETTLE_BUDGET = 50;
const CHECK_BUDGET = 64;
const INITIAL_VERTICES = 4096;
const INITIAL_INSTANCES = 64;
const LAYERS_EXCEPT_DEFAULT = 0xfffffffe;
const SHADOW_SIDES = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const _matrix = new THREE.Matrix4();
const _instance = new THREE.Matrix4();

export class ShadowBatcher {
    constructor(parent) {
        this._parent = parent;
        this.enabled = true;
        this.root = new THREE.Group();
        this.root.matrixAutoUpdate = false;
        this.root.matrixWorldAutoUpdate = false;
        this.batches = new Map();
        this.records = new Map();
        this.pending = new Map();
        this.objects = new Set();
        this.sources = [];
        this.otherLights = [];
        this.sunLights = [];
        this.type = null;
        this.cursor = 0;
        this.wrapShadowMap();
        Hooks.on("3DCanvasScatterGenerated", (field) => {
            const record = this.records.get(field.document.id);
            if (record) record.stale = true;
        });
    }

    get sun() {
        return this._parent.lights?.globalIllumination?.global?.sunlight;
    }

    get drawCount() {
        let count = 0;
        for (const batch of this.batches.values()) if (batch.mesh.instanceCount) count++;
        return count;
    }

    isBatched(object) {
        return this.enabled && this.objects.has(object);
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.clear();
    }

    clear() {
        for (const batch of this.batches.values()) {
            batch.mesh.removeFromParent();
            batch.mesh.material.dispose();
            batch.mesh.customDepthMaterial?.dispose();
            batch.mesh.customDistanceMaterial?.dispose();
            this.releaseWarm(batch);
            batch.mesh.dispose();
        }
        this.batches.clear();
        this.records.clear();
        this.pending.clear();
        this.objects.clear();
        this.sources = [];
    }

    wrapShadowMap() {
        const batcher = this;
        const shadowMap = this._parent.renderer.shadowMap;
        const render = shadowMap.render;
        shadowMap.render = function (lights, scene, camera) {
            const sun = batcher.sun;
            if (!batcher.enabled || !batcher.sources.length || !this.enabled || (!this.autoUpdate && !this.needsUpdate) || scene !== batcher._parent.scene || !lights.includes(sun) || (!sun.shadow.autoUpdate && !sun.shadow.needsUpdate)) return render.call(this, lights, scene, camera);
            const needsUpdate = this.needsUpdate;
            const others = batcher.otherLights;
            others.length = 0;
            for (const light of lights) if (light !== sun) others.push(light);
            if (others.length) render.call(this, others, scene, camera);
            this.needsUpdate = needsUpdate;
            batcher.renderSun(render, this, scene, camera, sun);
        };
    }

    renderSun(render, shadowMap, scene, camera, sun) {
        const layers = (sun.shadow.camera.layers.mask & LAYERS_EXCEPT_DEFAULT) !== 0 ? sun.shadow.camera.layers : camera.layers;
        this.sync(layers.mask, scene, shadowMap.type === THREE.VSMShadowMap);
        for (const batch of this.batches.values()) {
            batch.ready = this.isReady(batch);
            batch.mesh.layers.mask = layers.mask;
            batch.mesh.visible = batch.mesh.instanceCount > 0 && batch.ready;
        }
        const sources = this.sources;
        for (const source of sources) {
            const object = source.object;
            source.cast = object.castShadow;
            source.receive = object.receiveShadow;
            if (!source.ready) source.ready = isSourceReady(source);
            if (!source.ready) continue;
            object.castShadow = false;
            object.receiveShadow = false;
        }
        this.sunLights[0] = sun;
        scene.add(this.root);
        try {
            render.call(shadowMap, this.sunLights, scene, camera);
        } finally {
            scene.remove(this.root);
            for (const source of sources) {
                source.object.castShadow = source.cast;
                source.object.receiveShadow = source.receive;
            }
        }
    }

    warm(batches) {
        const parent = this._parent;
        for (const batch of batches) batch.warmed = true;
        if (!parent._ready || !batches.length) return;
        const vsm = this.type === THREE.VSMShadowMap;
        const swaps = batches.map((batch) => {
            const mesh = batch.mesh;
            const source = mesh.material;
            const depth = mesh.customDepthMaterial ?? new THREE.MeshDepthMaterial();
            depth.side = source.shadowSide ?? (vsm ? source.side : SHADOW_SIDES[source.side]);
            depth.map = source.map;
            depth.alphaMap = source.alphaMap;
            depth.alphaTest = source.alphaTest;
            mesh.material = depth;
            return { batch, source, depth };
        });
        const target = { traverse: (callback) => swaps.forEach(({ batch }) => callback(batch.mesh)), traverseVisible: () => {} };
        const fog = parent.scene.fog;
        parent.scene.fog = null;
        try {
            compileForComposer(parent, target, parent.camera, parent.scene);
        } finally {
            parent.scene.fog = fog;
            for (const { batch, source } of swaps) batch.mesh.material = source;
        }
        for (const { batch, depth } of swaps) {
            const program = parent.renderer.properties.get(depth).currentProgram;
            batch.program = program?.usedTimes > 0 && !program.isReady() ? program : null;
            if (depth !== batch.mesh.customDepthMaterial) batch.warmMaterial = depth;
        }
    }

    releaseWarm(batch) {
        batch.warmMaterial?.dispose();
        batch.warmMaterial = null;
    }

    get idle() {
        if (this.pending.size) return false;
        for (const batch of this.batches.values()) if (!this.isReady(batch)) return false;
        return true;
    }

    isReady(batch) {
        if (batch.program && (batch.program.usedTimes === 0 || batch.program.isReady())) batch.program = null;
        return !batch.program;
    }

    sync(mask, scene, vsm) {
        for (const record of this.records.values()) if (record.sources.length) record.shown = isInScene(record.mesh, scene);
        for (const source of this.sources) {
            const object = source.object;
            const moved = !sameMatrix(source.matrix, object.matrixWorld.elements) || (object.isInstancedMesh && source.version !== object.instanceMatrix.version);
            if (moved) this.updateMatrices(source);
            const visible = source.record.shown && (object.layers.mask & mask) !== 0 && (object.castShadow || (vsm && object.receiveShadow)) && isShownWithin(object, source.record.mesh);
            const count = object.isInstancedMesh ? object.count : 1;
            if (!moved && visible === source.visible && count === source.count) continue;
            source.visible = visible;
            source.count = count;
            for (const entry of source.entries) entry.batch.mesh.setVisibleAt(entry.id, visible && entry.finite && entry.index < count);
        }
    }

    updateMatrices(source) {
        const object = source.object;
        source.matrix.set(object.matrixWorld.elements);
        if (object.isInstancedMesh) source.version = object.instanceMatrix.version;
        for (const entry of source.entries) {
            _matrix.copy(object.matrixWorld);
            if (object.isInstancedMesh) _matrix.multiply(object.getMatrixAt(entry.index, _instance));
            entry.finite = _matrix.elements.every(Number.isFinite);
            if (entry.finite) entry.batch.mesh.setMatrixAt(entry.id, _matrix);
        }
    }

    update() {
        if (!this.enabled) return;
        const type = this._parent.renderer.shadowMap.type;
        if (type !== this.type) {
            this.clear();
            this.type = type;
        }
        const sources = this.sources;
        for (let n = 0; n < sources.length && n < CHECK_BUDGET; n++) {
            this.cursor = (this.cursor + 1) % sources.length;
            const source = sources[this.cursor];
            if (!isCurrent(source)) source.record.stale = true;
        }
        const tiles = this._parent.tiles;
        let changed = false;
        for (const [id, record] of this.records) {
            const tile3d = record.tile3d;
            if (tiles[id] === tile3d && tile3d.mesh === record.mesh && !record.stale && !(record.sources.length && (tile3d.mixer || tile3d.isAnimated))) continue;
            this.removeRecord(id, record);
            changed = true;
        }
        const now = performance.now();
        const settling = this._parent._settling;
        const delay = settling ? 0 : BUILD_DELAY;
        const buildBudget = settling ? SETTLE_BUDGET : BUILD_BUDGET;
        for (const id in tiles) {
            const tile3d = tiles[id];
            if (!tile3d?._loaded || !tile3d.mesh || this.records.has(id)) continue;
            const pending = this.pending.get(id);
            if (pending?.tile3d !== tile3d || pending.mesh !== tile3d.mesh) this.pending.set(id, { tile3d, mesh: tile3d.mesh, time: now + delay });
        }
        for (const [id, pending] of this.pending) {
            if (performance.now() - now > buildBudget) break;
            if (pending.time > now) continue;
            this.pending.delete(id);
            if (tiles[id] !== pending.tile3d || pending.tile3d.mesh !== pending.mesh) continue;
            this.addRecord(id, pending.tile3d);
            changed = true;
        }
        if (changed) {
            this.sources = [...this.records.values()].flatMap((record) => record.sources);
            this.warm([...this.batches.values()].filter((batch) => !batch.warmed));
        }
        if (!this.pending.size) for (const batch of this.batches.values()) if (batch.grown) this.trim(batch);
    }

    trim(batch) {
        const mesh = batch.mesh;
        batch.grown = false;
        mesh.optimize();
        batch.vertices = Math.max(1, batch.vertices - mesh.unusedVertexCount);
        batch.indices = Math.max(1, batch.indices - mesh.unusedIndexCount);
        mesh.setGeometrySize(batch.vertices, batch.indices);
    }

    addRecord(id, tile3d) {
        const record = { tile3d, mesh: tile3d.mesh, sources: [] };
        this.records.set(id, record);
        if (isAnimatedTile(tile3d)) return;
        const vsm = this.type === THREE.VSMShadowMap;
        const visit = (object) => {
            if (object === tile3d.sightMesh || object.userData?.dynamicShadow || (object.userData?.entity3D && object.userData.entity3D !== tile3d)) return;
            if (isStaticCaster(object, vsm)) this.addSource(record, object);
            for (const child of object.children) visit(child);
        };
        visit(tile3d.mesh);
    }

    addSource(record, object) {
        const source = { object, record, ready: false, geometry: object.geometry, positionVersion: object.geometry.attributes.position.version, material: object.material, depthState: depthState(object.material), entries: [], matrix: new Float64Array(16).fill(NaN), version: -1, visible: false, count: -1 };
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const groups = Array.isArray(object.material) ? object.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
        const instances = object.isInstancedMesh ? object.instanceMatrix.count : 1;
        for (const group of groups) {
            const material = materials[group.materialIndex];
            if (!material?.visible) continue;
            const wind = windSwayParams(material);
            const batch = this.getBatch(material, !!wind);
            const geometry = this.getGeometry(batch, object.geometry, group, wind);
            if (!geometry) continue;
            for (let index = 0; index < instances; index++) {
                geometry.refs++;
                source.entries.push({ batch, geometry, index, id: this.addInstance(batch, geometry.id), finite: false });
            }
        }
        if (!source.entries.length) return;
        record.sources.push(source);
        this.objects.add(object);
    }

    removeRecord(id, record) {
        this.records.delete(id);
        for (const source of record.sources) {
            this.objects.delete(source.object);
            for (const entry of source.entries) {
                const mesh = entry.batch.mesh;
                mesh.deleteInstance(entry.id);
                if (--entry.geometry.refs) continue;
                mesh.deleteGeometry(entry.geometry.id);
                entry.batch.geometries.delete(entry.geometry.key);
            }
        }
    }

    getBatch(material, wind) {
        const cutout = material.alphaTest > 0 && !!(material.map || material.alphaMap);
        const key = (cutout ? `${material.side}|${material.shadowSide}|${material.alphaTest}|${textureKey(material.map)}|${textureKey(material.alphaMap)}` : `${material.side}|${material.shadowSide}`) + (wind ? "|wind" : "");
        let batch = this.batches.get(key);
        if (batch) return batch;
        const shadowMaterial = new THREE.MeshBasicMaterial({
            side: material.side,
            shadowSide: material.shadowSide,
            map: cutout ? material.map : null,
            alphaMap: cutout ? material.alphaMap : null,
            alphaTest: cutout ? material.alphaTest : 0,
        });
        const mesh = new THREE.BatchedMesh(INITIAL_INSTANCES, INITIAL_VERTICES, INITIAL_VERTICES * 2, shadowMaterial);
        mesh.perObjectFrustumCulled = false;
        mesh.sortObjects = false;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;
        if (wind) {
            const custom = windDepthMaterials();
            mesh.customDepthMaterial = custom.depth;
            mesh.customDistanceMaterial = custom.distance;
        }
        const uvs = cutout ? [...new Set([material.map, material.alphaMap].filter(Boolean).map(uvName))] : [];
        batch = { key, mesh, uvs, geometries: new Map(), vertices: INITIAL_VERTICES, indices: INITIAL_VERTICES * 2 };
        this.root.add(mesh);
        this.batches.set(key, batch);
        return batch;
    }

    getGeometry(batch, source, group, wind) {
        const key = `${source.uuid}|${group.start}|${group.count}|${windSwayKey(wind)}`;
        const cached = batch.geometries.get(key);
        if (cached) return cached;
        const geometry = buildGeometry(source, group, batch.uvs);
        if (!geometry) return null;
        if (wind) addWindAttributes(geometry, wind);
        const entry = { key, id: this.addGeometry(batch, geometry), refs: 0 };
        batch.geometries.set(key, entry);
        return entry;
    }

    addGeometry(batch, geometry) {
        const mesh = batch.mesh;
        const vertices = geometry.attributes.position.count;
        const indices = geometry.index.count;
        if (mesh.unusedVertexCount < vertices || mesh.unusedIndexCount < indices) mesh.optimize();
        if (mesh.unusedVertexCount < vertices || mesh.unusedIndexCount < indices) {
            batch.vertices = Math.max(batch.vertices * 2, batch.vertices - mesh.unusedVertexCount + vertices);
            batch.indices = Math.max(batch.indices * 2, batch.indices - mesh.unusedIndexCount + indices);
            mesh.setGeometrySize(batch.vertices, batch.indices);
        }
        const id = mesh.addGeometry(geometry);
        batch.grown = true;
        geometry.dispose();
        return id;
    }

    addInstance(batch, geometryId) {
        const mesh = batch.mesh;
        if (mesh.instanceCount >= mesh.maxInstanceCount) mesh.setInstanceCount(mesh.maxInstanceCount * 2);
        const id = mesh.addInstance(geometryId);
        mesh.setVisibleAt(id, false);
        return id;
    }
}

function isCurrent(source) {
    const object = source.object;
    return object.geometry === source.geometry && object.geometry.attributes.position.version === source.positionVersion && object.material === source.material && sameDepthState(source.depthState, object.material);
}

function isShownWithin(object, root) {
    for (let current = object; current; current = current.parent) {
        if (current === root) return true;
        if (!current.visible) return false;
    }
    return false;
}

function depthState(material) {
    return (Array.isArray(material) ? material : [material]).map((entry) => [entry.visible, entry.side, entry.shadowSide, entry.alphaTest, entry.map, entry.alphaMap]);
}

function sameDepthState(state, material) {
    for (let i = 0; i < state.length; i++) {
        const entry = Array.isArray(material) ? material[i] : material;
        const s = state[i];
        if (!entry || s[0] !== entry.visible || s[1] !== entry.side || s[2] !== entry.shadowSide || s[3] !== entry.alphaTest || s[4] !== entry.map || s[5] !== entry.alphaMap) return false;
    }
    return true;
}

function isSourceReady(source) {
    for (const entry of source.entries) if (!entry.batch.ready) return false;
    return true;
}

export function isAnimatedTile(tile3d) {
    return !!(tile3d.mixer || tile3d.isAnimated || tile3d.onAnimation || tile3d.maxInstances || hasEnabledShader(tile3d.shaders));
}

function hasEnabledShader(shaders) {
    for (const key in shaders) if (shaders[key]?.enabled) return true;
    return false;
}

function isStaticCaster(object, vsm) {
    if (!object.isMesh || object.isSkinnedMesh || object.isBatchedMesh || !object.geometry?.attributes?.position) return false;
    if (!(object.castShadow || (vsm && object.receiveShadow))) return false;
    const wind = !Array.isArray(object.material) && !!windSwayParams(object.material);
    if (object.geometry.morphAttributes?.position || (!wind && hasCustomShader(object.customDepthMaterial))) return false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.every((material) => material && !material.isShaderMaterial && (wind || !hasCustomShader(material)) && !material.wireframe && !material.alphaToCoverage && !(material.displacementMap && material.displacementScale) && !(material.clipShadows && material.clippingPlanes?.length));
}

function hasCustomShader(material) {
    return !!material && (material.isShaderMaterial || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile);
}

export function isInScene(object, scene) {
    for (let current = object; current; current = current.parent) {
        if (!current.visible) return false;
        if (current === scene) return true;
    }
    return false;
}

export function sameMatrix(stored, elements) {
    for (let i = 0; i < 16; i++) {
        const a = stored[i];
        const b = elements[i];
        if (a !== b && (a === a || b === b)) return false;
    }
    return true;
}

export function textureKey(texture) {
    if (!texture) return "";
    if (texture.matrixAutoUpdate) texture.updateMatrix();
    return [texture.source.uuid, texture.channel, texture.wrapS, texture.wrapT, ...texture.matrix.elements].join();
}

function uvName(texture) {
    return texture.channel ? `uv${texture.channel}` : "uv";
}

function toFloat(attribute) {
    const { count, itemSize } = attribute;
    const array = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) for (let j = 0; j < itemSize; j++) array[i * itemSize + j] = attribute.getComponent(i, j);
    return new THREE.BufferAttribute(array, itemSize);
}

function buildGeometry(source, group, uvs) {
    const position = source.attributes.position;
    const index = source.index;
    const total = index ? index.count : position.count;
    const start = Math.max(group.start, source.drawRange.start);
    const end = Math.min(total, group.start + group.count, source.drawRange.start + source.drawRange.count);
    if (end <= start) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", toFloat(position));
    for (const name of uvs) geometry.setAttribute(name, source.attributes[name] ? toFloat(source.attributes[name]) : new THREE.Float32BufferAttribute(position.count * 2, 2));
    const indices = new Uint32Array(end - start);
    for (let i = start; i < end; i++) indices[i - start] = index ? index.getX(i) : i;
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    return geometry;
}
