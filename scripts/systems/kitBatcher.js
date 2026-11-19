import * as THREE from "three";
import { isDynamicTile, isInScene, sameMatrix, textureKey } from "./shadowBatcher.js";
import { compileForComposer } from "../render/pipeline.js";

const BUILD_DELAY = 500;
const BUILD_BUDGET = 4;
const INITIAL_VERTICES = 16384;
const INITIAL_INSTANCES = 64;
const KINDS = new Set(["kit", "wall", "floor"]);
const SKIP_KEYS = new Set(["uuid", "id", "name", "version", "color", "userData", "_listeners"]);

export class KitBatcher {
    constructor(parent) {
        this._parent = parent;
        this.enabled = true;
        this.active = false;
        this.root = new THREE.Group();
        this.root.matrixAutoUpdate = false;
        this.root.matrixWorldAutoUpdate = false;
        this.batches = new Map();
        this.records = new Map();
        this.pending = new Map();
        this.sources = [];
        this.wrapRenderer();
    }

    get drawCount() {
        let count = 0;
        for (const batch of this.batches.values()) if (batch.mesh.instanceCount) count++;
        return count;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.clear();
    }

    clear() {
        this.end();
        for (const batch of this.batches.values()) {
            batch.mesh.removeFromParent();
            batch.mesh.material.dispose();
            batch.mesh.dispose();
        }
        this.batches.clear();
        this.records.clear();
        this.pending.clear();
        this.sources = [];
    }

    wrapRenderer() {
        const batcher = this;
        const renderer = this._parent.renderer;
        const render = renderer.render;
        renderer.render = function (scene, camera) {
            if (batcher.active || !batcher.sources.length || scene !== batcher._parent.scene || scene.overrideMaterial) return render.call(this, scene, camera);
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
        const mask = camera.layers.mask;
        for (const source of this.sources) {
            const object = source.object;
            object.updateWorldMatrix(true, false);
            if (!sameMatrix(source.matrix, object.matrixWorld.elements)) {
                source.matrix.set(object.matrixWorld.elements);
                source.finite = object.matrixWorld.elements.every(Number.isFinite);
                if (source.finite) for (const entry of source.entries) entry.batch.mesh.setMatrixAt(entry.id, object.matrixWorld);
            }
            const ready = source.entries.every((entry) => this.isReady(entry.batch));
            const visible = ready && source.finite && (object.layers.mask & mask) !== 0 && isInScene(object, scene);
            if (visible !== source.visible) {
                source.visible = visible;
                for (const entry of source.entries) entry.batch.mesh.setVisibleAt(entry.id, visible);
            }
            source.wasVisible = object.visible;
            if (ready) object.visible = false;
        }
        for (const batch of this.batches.values()) {
            batch.mesh.layers.mask = mask;
            batch.mesh.visible = batch.mesh.instanceCount > 0 && this.isReady(batch);
        }
        scene.add(this.root);
    }

    end() {
        if (!this.active) return;
        this.active = false;
        for (const source of this.sources) source.object.visible = source.wasVisible;
        this.root.removeFromParent();
    }

    update() {
        if (!this.enabled) return;
        const tiles = this._parent.tiles;
        let changed = false;
        for (const [id, record] of this.records) {
            const tile3d = record.tile3d;
            if (tiles[id] === tile3d && tile3d.mesh === record.mesh && isEligible(tile3d) && record.sources.every((source) => source.version === materialVersion(source.object))) continue;
            this.removeRecord(id, record);
            changed = true;
        }
        const now = performance.now();
        for (const id in tiles) {
            const tile3d = tiles[id];
            if (!tile3d?._loaded || !tile3d.mesh || this.records.has(id) || !isEligible(tile3d)) continue;
            const pending = this.pending.get(id);
            if (pending?.tile3d !== tile3d || pending.mesh !== tile3d.mesh) this.pending.set(id, { tile3d, mesh: tile3d.mesh, time: now + BUILD_DELAY });
        }
        for (const [id, pending] of this.pending) {
            if (performance.now() - now > BUILD_BUDGET) break;
            if (pending.time > now) continue;
            this.pending.delete(id);
            if (tiles[id] !== pending.tile3d || pending.tile3d.mesh !== pending.mesh || !isEligible(pending.tile3d)) continue;
            this.addRecord(id, pending.tile3d);
            changed = true;
        }
        if (changed) this.sources = [...this.records.values()].flatMap((record) => record.sources);
        if (!this.pending.size) for (const batch of this.batches.values()) if (batch.grown) this.trim(batch);
    }

    trim(batch) {
        const mesh = batch.mesh;
        batch.grown = false;
        mesh.optimize();
        batch.vertices = Math.max(1, batch.vertices - mesh.unusedVertexCount);
        mesh.setGeometrySize(batch.vertices, batch.vertices);
    }

    addRecord(id, tile3d) {
        const record = { tile3d, mesh: tile3d.mesh, sources: [] };
        this.records.set(id, record);
        const skip = new Set([tile3d.controlledBox, tile3d.sightMesh, tile3d._decalCone].filter(Boolean));
        const visit = (object) => {
            if (skip.has(object)) return;
            if (isBatchable(object)) this.addSource(record, object);
            for (const child of object.children) visit(child);
        };
        visit(tile3d.mesh);
    }

    addSource(record, object) {
        const materials = [object.material].flat();
        const groups = Array.isArray(object.material) ? object.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
        const parts = groups.map((group) => ({ material: materials[group.materialIndex], group })).filter(({ material }) => material?.visible);
        const geometries = parts.map(({ group }) => buildGeometry(object.geometry, group));
        if (!geometries.length || geometries.some((geometry) => !geometry)) return geometries.forEach((geometry) => geometry?.dispose());
        const source = { object, entries: [], matrix: new Float64Array(16).fill(NaN), finite: false, visible: false, wasVisible: true, version: materialVersion(object) };
        const elevated = record.tile3d.document.elevation >= canvas.scene.grid.distance;
        parts.forEach(({ material }, i) => {
            const batch = this.getBatch(material, geometries[i], elevated);
            const geometryId = this.addGeometry(batch, geometries[i]);
            const id = this.addInstance(batch, geometryId);
            batch.mesh.setColorAt(id, material.color);
            source.entries.push({ batch, id, geometryId });
        });
        for (const { batch } of source.entries) if (!batch.warmed) this.warm(batch);
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
        for (const source of record.sources) {
            for (const entry of source.entries) {
                entry.batch.mesh.deleteInstance(entry.id);
                entry.batch.mesh.deleteGeometry(entry.geometryId);
            }
        }
    }

    getBatch(material, geometry, elevated) {
        const key = `${materialKey(material)}#${Object.keys(material.defines ?? {})}#${attributeKey(geometry)}#${elevated}`;
        let batch = this.batches.get(key);
        if (batch) return batch;
        const batchMaterial = material.clone();
        batchMaterial.defines = { ...material.defines };
        batchMaterial.color?.set(0xffffff);
        if (material.userData.batchShader) batchMaterial.onBeforeCompile = material._userOnBeforeCompile;
        const mesh = new THREE.BatchedMesh(INITIAL_INSTANCES, INITIAL_VERTICES, INITIAL_VERTICES, batchMaterial);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.renderOrder = elevated ? -1 : 0;
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;
        mesh.userData.kitBatch = true;
        batch = { key, mesh, vertices: INITIAL_VERTICES };
        this.root.add(mesh);
        this.batches.set(key, batch);
        return batch;
    }

    addGeometry(batch, geometry) {
        const mesh = batch.mesh;
        const vertices = geometry.attributes.position.count;
        if (mesh.unusedVertexCount < vertices) mesh.optimize();
        if (mesh.unusedVertexCount < vertices) {
            batch.vertices = Math.max(batch.vertices * 2, batch.vertices - mesh.unusedVertexCount + vertices);
            mesh.setGeometrySize(batch.vertices, batch.vertices);
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

function isEligible(tile3d) {
    return tile3d.dynaMesh === "mapMaker" && KINDS.has(tile3d.mapMakerMesh?.k) && !isDynamicTile(tile3d) && !tile3d.highlightOnHover && !Object.keys(tile3d._doors ?? {}).length;
}

function isBatchable(object) {
    if (!object.isMesh || object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh || !object.geometry?.attributes?.position) return false;
    if (object.userData.noShaders || object.geometry.morphAttributes?.position || Object.values(object.geometry.attributes).some((attribute) => attribute.isInterleavedBufferAttribute) || object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
    return [object.material].flat().every((material) => material?.isMeshStandardMaterial && (!material._userOnBeforeCompile || material.userData.batchShader) &&!material.clippingPlanes?.length && !material.wireframe && !material.alphaToCoverage && !(material.displacementMap && material.displacementScale));
}

function materialVersion(object) {
    return [object.material].flat().reduce((sum, material) => sum + material.version, 0);
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

function attributeKey(geometry) {
    return Object.entries(geometry.attributes)
        .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`)
        .sort()
        .join();
}

function buildGeometry(source, group) {
    const flat = source.index ? source.toNonIndexed() : source;
    const total = flat.attributes.position.count;
    const start = Math.max(group.start, source.drawRange.start);
    const end = Math.min(total, group.start + group.count, source.drawRange.start + source.drawRange.count);
    if (end <= start) return null;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(flat.attributes)) {
        const size = attribute.itemSize;
        geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array.slice(start * size, end * size), size, attribute.normalized));
    }
    if (flat !== source) flat.dispose();
    return geometry;
}
