import * as THREE from "three";
import { isAnimatedTile, isInScene, sameMatrix, textureKey } from "./shadowBatcher.js";
import { compileForComposer } from "../render/pipeline.js";
import { SideSplitter } from "./sideSplitter.js";
import { setStaticSubtree } from "../three/matrixWorld.js";
import { BatchPrepass, prepassAllowed, wantsPrepass } from "./batchPrepass.js";
import { BatchLod } from "./batchLod.js";
import { BATCH_FADE_DEFINE, isTileFadeHook, tileCut } from "./tileOcclusion.js";
import { windBatchCompile, windSwayParams, windSwayKey, addWindAttributes } from "../shaders/wind/windBatch.js";

const BUILD_DELAY = 500;
const BUILD_BUDGET = 4;
const SETTLE_BUDGET = 50;
const INITIAL_VERTICES = 16384;
const INITIAL_INSTANCES = 64;
const CHECK_BUDGET = 64;
const KINDS = new Set(["kit", "wall", "floor"]);
const MATERIAL_TYPES = new Set(["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshBasicMaterial", "MeshLambertMaterial", "MeshPhongMaterial"]);
const SKIP_KEYS = new Set(["uuid", "id", "name", "version", "color", "userData", "_listeners"]);
const WHOLE = [{ start: 0, count: Infinity, materialIndex: 0 }];
const _matrix = new THREE.Matrix4();
const _instance = new THREE.Matrix4();
const _color = new THREE.Color();
const _instanceColor = new THREE.Color();
const _rgba = new THREE.Vector4();
const _frustum = new THREE.Frustum();
const _projection = new THREE.Matrix4();

export class KitBatcher {
    constructor(parent) {
        this._parent = parent;
        this.enabled = true;
        this.models = true;
        this.active = false;
        this.root = new THREE.Group();
        this.root.matrixAutoUpdate = false;
        this.root.matrixWorldAutoUpdate = false;
        this.batches = new Map();
        this.records = new Map();
        this.pending = new Map();
        this.list = [];
        this.shownList = [];
        this.sources = [];
        this.autoUpdateScene = null;
        this.stale = new Set();
        this.cursor = 0;
        this.splitter = new SideSplitter(this.root);
        this.lod = new BatchLod(this);
        this.wrapRenderer();
        Hooks.on("3DCanvasScatterGenerated", (field) => {
            this.splitter.invalidate(field.document.id);
            if (this.records.has(field.document.id)) this.stale.add(field.tile3d);
        });
    }

    get drawCount() {
        let count = 0;
        for (const batch of this.batches.values()) if (batch.mesh.instanceCount) count++;
        return count;
    }

    get idle() {
        if (this.pending.size) return false;
        for (const batch of this.batches.values()) if (!this.isReady(batch)) return false;
        return true;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.clear();
    }

    clear() {
        this.end();
        for (const batch of this.batches.values()) {
            batch.prepass?.removeFromParent();
            batch.mesh.removeFromParent();
            batch.mesh.material.dispose();
            batch.mesh.dispose();
        }
        for (const record of this.records.values()) setStaticSubtree(record.mesh, false);
        this.lod.clear();
        this.batches.clear();
        this.records.clear();
        this.pending.clear();
        this.stale.clear();
        this.splitter.clear();
        this.list = [];
        this.shownList = [];
        this.sources = [];
    }

    wrapRenderer() {
        const batcher = this;
        const renderer = this._parent.renderer;
        const render = renderer.render;
        renderer.render = function (scene, camera) {
            if (batcher.active || (!batcher.sources.length && !batcher.splitter.size) || scene !== batcher._parent.scene || scene.overrideMaterial) return render.call(this, scene, camera);
            batcher.begin(scene, camera);
            try {
                return render.call(this, scene, camera);
            } finally {
                batcher.end();
            }
        };
        const shadowMap = renderer.shadowMap;
        const shadowRender = shadowMap.render;
        shadowMap.render = function (...args) {
            batcher.end();
            return shadowRender.apply(this, args);
        };
    }

    begin(scene, camera) {
        this.active = true;
        if (scene.matrixWorldAutoUpdate) {
            scene.updateMatrixWorld();
            scene.matrixWorldAutoUpdate = false;
            this.autoUpdateScene = scene;
        }
        if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
        _frustum.setFromProjectionMatrix(_projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
        const mask = camera.layers.mask;
        const prepassEnabled = prepassAllowed(this._parent.renderer);
        for (const batch of this.batches.values()) {
            batch.ready = this.isReady(batch);
            batch.mesh.layers.mask = mask;
            const prepass = prepassEnabled && wantsPrepass(batch);
            if (prepass && !batch.prepass) this.root.add((batch.prepass = new BatchPrepass(batch.mesh)));
            if (batch.prepass) batch.prepass.active = prepass;
        }
        for (const record of this.shownList) record.shown = isInScene(record.mesh, scene);
        const sources = this.sources;
        for (let i = sources.length - 1; i >= 0; i--) {
            const source = sources[i];
            const object = source.object;
            const instanced = object.isInstancedMesh;
            const moved = !sameMatrix(source.matrix, object.matrixWorld.elements) || (instanced && source.instanceVersion !== object.instanceMatrix.version);
            if (moved) updateMatrices(source);
            if (!source.ready) source.ready = isSourceReady(source);
            const visible = source.ready && source.record.shown && (object.layers.mask & mask) !== 0 && (!object.frustumCulled || _frustum.intersectsSphere(source.sphere)) && isShownWithin(object, source.record.mesh);
            const count = instanced ? object.count : 1;
            source.wasVisible = object.visible;
            if (source.ready) object.visible = false;
            const cut = tileCut(source.record.tile3d);
            if (cut !== source.cut) setFade(source, cut);
            if (!moved && visible === source.visible && count === source.count) continue;
            this.lod.dirty = true;
            source.visible = visible;
            source.count = count;
            for (const entry of source.entries) {
                const on = visible && entry.finite && entry.index < count;
                if (on !== entry.on) {
                    entry.on = on;
                    entry.batch.shown += on ? 1 : -1;
                }
                entry.batch.mesh.setVisibleAt(entry.id, on);
            }
        }
        for (const batch of this.batches.values()) batch.mesh.visible = batch.ready && batch.shown > 0;
        this.lod.update(sources, camera, this._parent.renderer);
        this.splitter.begin(scene);
        scene.add(this.root);
    }

    end() {
        if (!this.active) return;
        this.active = false;
        for (const source of this.sources) source.object.visible = source.wasVisible;
        this.splitter.end();
        if (this.autoUpdateScene) this.autoUpdateScene.matrixWorldAutoUpdate = true;
        this.autoUpdateScene = null;
        this.root.removeFromParent();
    }

    isEligible(tile3d) {
        if (tile3d.dynaMesh === "default") return this.models && !(tile3d.scatterField && !tile3d.scatterField.base) && isStaticTile(tile3d);
        return tile3d.dynaMesh === "mapMaker" && KINDS.has(tile3d.mapMakerMesh?.k) && isStaticTile(tile3d);
    }

    update() {
        if (!this.enabled) return;
        this.splitter.update(this._parent.tiles);
        const shadowType = this._parent.renderer.shadowMap.type;
        if (shadowType !== this.shadowType) {
            if (this.shadowType !== undefined) for (const batch of this.batches.values()) batch.mesh.material.needsUpdate = true;
            this.shadowType = shadowType;
        }
        const tiles = this._parent.tiles;
        const list = this.list;
        const invalid = [];
        for (const record of list) {
            const tile3d = record.tile3d;
            if (tiles[record.id] !== tile3d || tile3d.mesh !== record.mesh || this.stale.has(tile3d)) invalid.push(record);
        }
        this.stale.clear();
        let budget = CHECK_BUDGET;
        for (let n = 0; n < list.length && budget > 0; n++) {
            this.cursor = (this.cursor + 1) % list.length;
            const record = list[this.cursor];
            budget -= record.sources.length + 1;
            if (!this.isEligible(record.tile3d) || !isCurrent(record)) invalid.push(record);
        }
        let changed = false;
        const settling = this._parent._settling;
        const delay = settling ? 0 : BUILD_DELAY;
        const buildBudget = settling ? SETTLE_BUDGET : BUILD_BUDGET;
        for (const record of invalid) {
            if (this.records.get(record.id) !== record) continue;
            this.removeRecord(record.id, record);
            changed = true;
        }
        const now = performance.now();
        for (const id in tiles) {
            const tile3d = tiles[id];
            if (!tile3d?._loaded || !tile3d.mesh || this.records.has(id)) continue;
            const pending = this.pending.get(id);
            if (pending?.tile3d === tile3d && pending.mesh === tile3d.mesh) continue;
            if (this.isEligible(tile3d)) this.pending.set(id, { tile3d, mesh: tile3d.mesh, time: now + delay });
        }
        for (const [id, pending] of this.pending) {
            if (performance.now() - now > buildBudget) break;
            if (pending.time > now) continue;
            this.pending.delete(id);
            if (tiles[id] !== pending.tile3d || pending.tile3d.mesh !== pending.mesh || !this.isEligible(pending.tile3d)) continue;
            this.addRecord(id, pending.tile3d);
            changed = true;
        }
        if (changed) this.updateActive();
        if (!this.pending.size) this.lod.flush();
        if (!this.pending.size && !this.lod.busy) this.trimNext();
    }

    trimNext() {
        for (const batch of this.batches.values()) {
            if (!batch.grown) continue;
            this.trim(batch);
            return;
        }
    }

    updateActive() {
        this.list = [...this.records.values()];
        this.sources = [];
        this.shownList = [];
        for (const record of this.list) {
            let shown = false;
            for (const source of record.sources) {
                const active = source.batches.some((batch) => batch.units > 1);
                if (active !== source.active) {
                    if (active) this.activate(source);
                    else deactivate(source);
                }
                if (!active) continue;
                this.sources.push(source);
                shown = true;
            }
            if (shown) this.shownList.push(record);
        }
    }

    activate(source) {
        source.active = true;
        source.matrix.fill(NaN);
        source.visible = false;
        source.count = -1;
        for (const batch of source.batches) if (!batch.warmed) this.warm(batch);
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
        const kit = tile3d.dynaMesh === "mapMaker";
        const order = kit ? (tile3d.document.elevation >= canvas.scene.grid.distance ? -1 : 0) : null;
        const record = { id, tile3d, mesh: tile3d.mesh, sources: [], shown: false };
        this.records.set(id, record);
        if (!tile3d.isDoor && !hasModelDoors(tile3d)) setStaticSubtree(record.mesh, true);
        const skip = new Set([tile3d.controlledBox, tile3d.sightMesh, tile3d._decalCone].filter(Boolean));
        const visit = (object) => {
            if (skip.has(object) || (object.userData.entity3D && object.userData.entity3D !== tile3d)) return;
            if (isBatchable(object, kit)) this.addSource(record, object, order ?? object.renderOrder);
            for (const child of object.children) visit(child);
        };
        visit(tile3d.mesh);
    }

    addSource(record, object, order) {
        const multi = Array.isArray(object.material);
        const materials = multi ? object.material : [object.material];
        const instances = object.isInstancedMesh ? object.instanceMatrix.count : 1;
        const entries = [];
        const batches = [];
        const cut = tileCut(record.tile3d);
        for (const group of multi ? object.geometry.groups : WHOLE) {
            const material = materials[group.materialIndex];
            if (!material?.visible) continue;
            const batch = this.getBatch(material, object, order);
            const geometry = this.getGeometry(batch, object.geometry, group, windSwayParams(material));
            if (!geometry) continue;
            batch.units++;
            batches.push(batch);
            for (let index = 0; index < instances; index++) {
                geometry.refs++;
                const id = this.addInstance(batch, geometry.id);
                _color.copy(material.color);
                if (object.instanceColor) _color.multiply(object.getColorAt(index, _instanceColor));
                batch.mesh.setColorAt(id, _rgba.set(_color.r, _color.g, _color.b, 1 - cut));
                entries.push({ batch, id, geometry, index, finite: false, on: false });
            }
        }
        if (!entries.length) {
            for (const batch of batches) batch.units--;
            return;
        }
        const source = {
            object,
            record,
            entries,
            batches,
            active: false,
            cut,
            instances,
            geometry: object.geometry,
            positionVersion: object.geometry.attributes.position.version,
            material: object.material,
            version: materialVersion(object.material),
            colorVersion: object.instanceColor?.version,
            instanceVersion: -1,
            matrix: new Float64Array(16).fill(NaN),
            sphere: new THREE.Sphere(),
            ready: false,
            visible: false,
            count: -1,
            wasVisible: true,
        };
        record.sources.push(source);
    }

    warm(batch) {
        batch.warmed = true;
        const parent = this._parent;
        if (!parent._ready) return;
        compileForComposer(parent, batch.mesh, parent.camera, parent.scene);
        const program = parent.renderer.properties.get(batch.mesh.material).currentProgram;
        batch.program = program?.usedTimes > 0 && !program.isReady() ? program : null;
    }

    isReady(batch) {
        if (batch.program && (batch.program.usedTimes === 0 || batch.program.isReady())) batch.program = null;
        return !batch.program;
    }

    removeRecord(id, record) {
        this.records.delete(id);
        setStaticSubtree(record.mesh, false);
        for (const source of record.sources) {
            for (const batch of source.batches) batch.units--;
            for (const entry of source.entries) {
                const mesh = entry.batch.mesh;
                if (entry.on) entry.batch.shown--;
                mesh.deleteInstance(entry.id);
                if (--entry.geometry.refs) continue;
                this.lod.detach(entry.geometry);
                mesh.deleteGeometry(entry.geometry.id);
                entry.batch.geometries.delete(entry.geometry.key);
            }
        }
    }

    getBatch(material, object, order) {
        const wind = !!windSwayParams(material);
        const orderFree = isOrderFree(material);
        const key = `${materialKey(material)}#${definesKey(material)}#${!!material.userData?.foliage}#${attributeKey(object.geometry)}#${object.receiveShadow}#${orderFree ? "any" : order}#${wind}`;
        let batch = this.batches.get(key);
        if (batch) {
            if (order < batch.mesh.renderOrder) batch.mesh.renderOrder = order;
            return batch;
        }
        const batchMaterial = material.clone();
        batchMaterial.defines = { ...material.defines, [BATCH_FADE_DEFINE]: "" };
        batchMaterial.color?.set(0xffffff);
        if (wind) batchMaterial.onBeforeCompile = windBatchCompile;
        else if (material.userData.batchShader) batchMaterial.onBeforeCompile = material._userOnBeforeCompile;
        const mesh = new THREE.BatchedMesh(INITIAL_INSTANCES, INITIAL_VERTICES, INITIAL_VERTICES * 2, batchMaterial);
        mesh.frustumCulled = false;
        mesh.perObjectFrustumCulled = false;
        mesh.sortObjects = material.transparent;
        mesh.receiveShadow = object.receiveShadow;
        mesh.renderOrder = order;
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;
        mesh.userData.kitBatch = true;
        batch = { key, mesh, geometries: new Map(), vertices: INITIAL_VERTICES, indices: INITIAL_VERTICES * 2, ready: false, shown: 0, units: 0 };
        this.root.add(mesh);
        this.batches.set(key, batch);
        return batch;
    }

    getGeometry(batch, source, group, wind) {
        const key = `${source.uuid}|${group.start}|${group.count}|${windSwayKey(wind)}`;
        const cached = batch.geometries.get(key);
        if (cached) return cached;
        const geometry = buildGeometry(source, group);
        if (!geometry) return null;
        if (wind) addWindAttributes(geometry, wind);
        const entry = { key, id: this.addGeometry(batch, geometry), refs: 0 };
        batch.geometries.set(key, entry);
        this.lod.attach(batch, entry, geometry);
        return entry;
    }

    addGeometry(batch, geometry) {
        const mesh = batch.mesh;
        const vertices = geometry.attributes.position.count;
        const indices = geometry.index?.count ?? 0;
        if (mesh.unusedVertexCount < vertices || mesh.unusedIndexCount < indices) mesh.optimize();
        if (mesh.unusedVertexCount < vertices || mesh.unusedIndexCount < indices) {
            batch.vertices = Math.max(batch.vertices * 2, batch.vertices - mesh.unusedVertexCount + vertices);
            batch.indices = Math.max(batch.indices * 2, batch.indices - mesh.unusedIndexCount + indices);
            mesh.setGeometrySize(batch.vertices, batch.indices);
        }
        const id = mesh.addGeometry(geometry);
        batch.grown = true;
        return id;
    }

    reserve(batch, vertices, indices) {
        const mesh = batch.mesh;
        if (mesh.unusedVertexCount >= vertices && mesh.unusedIndexCount >= indices) return;
        mesh.optimize();
        if (mesh.unusedVertexCount >= vertices && mesh.unusedIndexCount >= indices) return;
        batch.vertices = batch.vertices - mesh.unusedVertexCount + vertices;
        batch.indices = batch.indices - mesh.unusedIndexCount + indices;
        mesh.setGeometrySize(batch.vertices, batch.indices);
    }

    addInstance(batch, geometryId) {
        const mesh = batch.mesh;
        if (mesh.instanceCount >= mesh.maxInstanceCount) mesh.setInstanceCount(mesh.maxInstanceCount * 2);
        const id = mesh.addInstance(geometryId);
        mesh.setVisibleAt(id, false);
        return id;
    }
}

function setFade(source, cut) {
    source.cut = cut;
    for (const entry of source.entries) {
        const texture = entry.batch.mesh._colorsTexture;
        texture.image.data[entry.id * 4 + 3] = 1 - cut;
        texture.needsUpdate = true;
    }
}

function deactivate(source) {
    source.active = false;
    source.visible = false;
    source.count = -1;
    for (const entry of source.entries) {
        if (entry.on) {
            entry.on = false;
            entry.batch.shown--;
        }
        entry.batch.mesh.setVisibleAt(entry.id, false);
    }
}

function hasModelDoors(tile3d) {
    for (const id in tile3d._doors) return true;
    return false;
}

function isStaticTile(tile3d) {
    return !isAnimatedTile(tile3d);
}

function updateMatrices(source) {
    const object = source.object;
    source.matrix.set(object.matrixWorld.elements);
    if (object.isInstancedMesh) {
        source.instanceVersion = object.instanceMatrix.version;
        object.computeBoundingSphere();
        source.sphere.copy(object.boundingSphere);
    } else {
        if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
        source.sphere.copy(object.geometry.boundingSphere);
    }
    source.sphere.applyMatrix4(object.matrixWorld);
    for (const entry of source.entries) {
        _matrix.copy(object.matrixWorld);
        if (object.isInstancedMesh) _matrix.multiply(object.getMatrixAt(entry.index, _instance));
        entry.finite = _matrix.elements.every(Number.isFinite);
        if (entry.finite) entry.batch.mesh.setMatrixAt(entry.id, _matrix);
    }
}

function isSourceReady(source) {
    for (const entry of source.entries) if (!entry.batch.ready) return false;
    return true;
}

function isShownWithin(object, root) {
    for (let current = object; current; current = current.parent) {
        if (current === root) return true;
        if (!current.visible) return false;
    }
    return false;
}

function isCurrent(record) {
    for (const source of record.sources) {
        const object = source.object;
        if (object.geometry !== source.geometry || object.geometry.attributes.position.version !== source.positionVersion || object.material !== source.material || materialVersion(object.material) !== source.version) return false;
        if (object.isInstancedMesh && (object.instanceMatrix.count !== source.instances || object.instanceColor?.version !== source.colorVersion)) return false;
    }
    return true;
}

function isBatchable(object, kit) {
    if (!object.isMesh || object.isSkinnedMesh || object.isBatchedMesh || !object.geometry?.attributes?.position) return false;
    if (object.isInstancedMesh && (kit || object.morphTexture)) return false;
    if (object.userData.noShaders || object.geometry.morphAttributes?.position || (object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender && !isTileFadeHook(object))) return false;
    for (const name in object.geometry.attributes) if (object.geometry.attributes[name].isInterleavedBufferAttribute) return false;
    if (object.geometry.index?.isInterleavedBufferAttribute) return false;
    return [object.material].flat().every((material) => isBatchableMaterial(material, kit));
}

function isBatchableMaterial(material, kit) {
    if (!material || !(kit ? material.isMeshStandardMaterial : MATERIAL_TYPES.has(material.type))) return false;
    if (!kit && (material.transparent || material.transmission > 0)) return false;
    return (!material._userOnBeforeCompile || material.userData.batchShader || (!kit && windSwayParams(material))) && !material.clippingPlanes?.length && !material.wireframe && !material.alphaToCoverage && !(material.displacementMap && material.displacementScale);
}

function isOrderFree(material) {
    return !material.transparent && material.depthTest && material.depthWrite && material.blending === THREE.NormalBlending && !material.alphaToCoverage;
}

function materialVersion(material) {
    if (!Array.isArray(material)) return material.version;
    let sum = 0;
    for (const entry of material) sum += entry.version;
    return sum;
}

function materialKey(material) {
    const parts = [];
    for (const key in material) {
        if (SKIP_KEYS.has(key)) continue;
        const value = material[key];
        if (value == null || typeof value === "function") continue;
        if (typeof value !== "object") parts.push(`${key}:${value}`);
        else if (value.isTexture) parts.push(`${key}:${textureKey(value)}`);
        else if (value.isColor) parts.push(`${key}:${value.getHexString()}`);
        else if (value.isVector2) parts.push(`${key}:${value.x},${value.y}`);
        else if (value.isEuler) parts.push(`${key}:${value.x},${value.y},${value.z}`);
    }
    return parts.join("|");
}

function definesKey(material) {
    return Object.entries(material.defines ?? {})
        .map(([name, value]) => `${name}=${value}`)
        .sort()
        .join();
}

function attributeKey(geometry) {
    const attributes = Object.entries(geometry.attributes)
        .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`)
        .sort()
        .join();
    return `${attributes}|${!!geometry.index}`;
}

function buildGeometry(source, group) {
    const index = source.index;
    const total = index ? index.count : source.attributes.position.count;
    const start = Math.max(group.start, source.drawRange.start);
    const end = Math.min(total, group.start + group.count, source.drawRange.start + source.drawRange.count);
    if (end <= start) return null;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
        const size = attribute.itemSize;
        const array = index ? attribute.array : attribute.array.subarray(start * size, end * size);
        geometry.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
    }
    if (index) geometry.setIndex(new THREE.BufferAttribute(index.array.subarray(start, end), 1));
    return geometry;
}
