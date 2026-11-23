import * as THREE from "three";
import { MODULE_ID } from "../main.js";
import { payloadTransferables, runJob, runSimplify, simplifierReady, simplifierSupported } from "./simplifyJobs.js";

const MIN_TRIANGLES = 2000;
const LOD_MIN_TRIANGLES = 1000;
const LOD_ERRORS = [0.0005, 0.001, 0.002, 0.004, 0.008];
const LOD_ATTRIBUTE_SCALE = 2;
const COARSE_RATIOS = [0.4, 0.2, 0.1];
const COARSE_ATTRIBUTE_SCALE = 0.1;
const TARGET_ERROR = 0.001;
const MAX_WORKERS = 8;
const ATTRIBUTE_WEIGHTS = { normal: 0.5, uv: 1, uv1: 0.5, color: 0.5, tangent: 0.25 };
const results = new WeakMap();

export { simplifierReady };

export const simplifyJobs = {
    workers: [],
    failed: false,
    pending: new Map(),
    seq: 0,
    submitted: 0,
    completed: 0,
    cached: 0,

    get busy() {
        return this.pending.size > 0;
    },

    get size() {
        return Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 4) - 1));
    },

    spawn() {
        const instance = new Worker(foundry.utils.getRoute(`modules/${MODULE_ID}/simplifyWorker.js`));
        const slot = { instance, load: 0 };
        instance.onmessage = ({ data }) => {
            const job = this.pending.get(data.id);
            if (!job) return;
            this.pending.delete(data.id);
            slot.load--;
            this.completed++;
            if (data.cached) this.cached++;
            if (data.error) job.reject(new Error(data.error));
            else job.resolve(data.result);
        };
        instance.onerror = (event) => {
            event.preventDefault();
            this.fail(new Error(event.message || "simplify worker error"));
        };
        return slot;
    },

    pick() {
        if (this.failed) return null;
        try {
            if (this.workers.length < this.size && this.workers.every((slot) => slot.load > 0)) this.workers.push(this.spawn());
        } catch (err) {
            this.fail(err);
            return null;
        }
        return this.workers.reduce((best, slot) => (!best || slot.load < best.load ? slot : best), null);
    },

    fail(err) {
        this.failed = true;
        for (const slot of this.workers) slot.instance.terminate();
        this.workers = [];
        for (const job of this.pending.values()) job.reject(err);
        this.pending.clear();
    },

    run(payload) {
        this.submitted++;
        const slot = this.pick();
        if (!slot) {
            this.completed++;
            return simplifierReady.then(() => runJob(payload));
        }
        const id = ++this.seq;
        slot.load++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            slot.instance.postMessage({ id, payload }, payloadTransferables(payload));
        });
    },
};

function readAttributes(attributes, count, stride) {
    const values = new Float32Array(count * stride);
    if (attributes.length === 1 && attributes[0].itemSize === stride && !attributes[0].isInterleavedBufferAttribute && !attributes[0].normalized && attributes[0].array instanceof Float32Array) {
        values.set(attributes[0].array.subarray(0, count * stride));
        return values;
    }
    for (let i = 0; i < count; i++) {
        let offset = i * stride;
        for (const attribute of attributes) for (let c = 0; c < attribute.itemSize; c++) values[offset++] = attribute.getComponent(i, c);
    }
    return values;
}

function readSources(geometry) {
    const count = geometry.attributes.position.count;
    return Object.entries(geometry.attributes).map(([name, attribute]) => {
        const size = attribute.itemSize;
        const array = new attribute.array.constructor(count * size);
        if (attribute.isInterleavedBufferAttribute) for (let i = 0; i < count; i++) for (let c = 0; c < size; c++) array[i * size + c] = attribute.getComponent(i, c);
        else array.set(attribute.array.subarray(0, count * size));
        return { name, array, itemSize: size, normalized: attribute.normalized };
    });
}

function canSimplify(geometry, minTriangles) {
    const index = geometry.index;
    if (!simplifierSupported || !index || !geometry.attributes.position || index.count / 3 < minTriangles) return false;
    if (Object.keys(geometry.morphAttributes ?? {}).length || geometry.attributes.skinIndex || geometry.groups.length > 1) return false;
    return geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity;
}

function createPayload(geometry, { ratio = 0, error = TARGET_ERROR, attributes = true, sources = false } = {}) {
    const count = geometry.attributes.position.count;
    const used = attributes ? Object.keys(ATTRIBUTE_WEIGHTS).filter((name) => geometry.attributes[name]) : [];
    const stride = used.reduce((sum, name) => sum + geometry.attributes[name].itemSize, 0);
    return {
        indices: Uint32Array.from(geometry.index.array.subarray(0, geometry.index.count)),
        positions: readAttributes([geometry.attributes.position], count, 3),
        attributes: stride ? readAttributes(used.map((name) => geometry.attributes[name]), count, stride) : new Float32Array(0),
        stride,
        weights: used.flatMap((name) => Array(geometry.attributes[name].itemSize).fill(ATTRIBUTE_WEIGHTS[name])),
        ratio,
        error,
        sources: sources ? readSources(geometry) : undefined,
    };
}

function compact(geometry, { indices, remap, unique }) {
    const result = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const size = attribute.itemSize;
        const array = new attribute.array.constructor(unique * size);
        const source = attribute.isInterleavedBufferAttribute ? null : attribute.array;
        for (let i = 0; i < remap.length; i++) {
            const target = remap[i];
            if (target === 0xffffffff) continue;
            for (let c = 0; c < size; c++) array[target * size + c] = source ? source[i * size + c] : attribute.getComponent(i, c);
        }
        result.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
    }
    return finishGeometry(result, geometry, indices, unique);
}

function finishGeometry(result, geometry, indices, unique) {
    result.setIndex(new THREE.BufferAttribute(unique > 65535 ? indices : Uint16Array.from(indices), 1));
    if (geometry.groups.length === 1) result.addGroup(0, Infinity, geometry.groups[0].materialIndex);
    result.name = geometry.name;
    result.userData = { ...geometry.userData };
    return result;
}

function buildGeometry(geometry, level) {
    const result = new THREE.BufferGeometry();
    for (const { name, array, itemSize, normalized } of level.attributes) result.setAttribute(name, new THREE.BufferAttribute(array, itemSize, normalized));
    return finishGeometry(result, geometry, level.indices, level.unique);
}

export function simplifyGeometry(geometry, { minTriangles = MIN_TRIANGLES, ...options } = {}) {
    if (!canSimplify(geometry, minTriangles)) return geometry;
    const result = runSimplify(createPayload(geometry, options));
    return result ? compact(geometry, result) : geometry;
}

async function simplifyGeometryAsync(geometry) {
    if (!canSimplify(geometry, MIN_TRIANGLES)) return geometry;
    const result = await simplifyJobs.run(createPayload(geometry, { sources: true })).catch(() => null);
    return result ? buildGeometry(geometry, result) : geometry;
}

function lodSupported(geometry) {
    const index = geometry.index;
    const position = geometry.attributes.position;
    return simplifierSupported && index && position && index.count / 3 >= LOD_MIN_TRIANGLES && !position.isInterleavedBufferAttribute;
}

export function requestLodChain(geometry) {
    if (!lodSupported(geometry)) return Promise.resolve(null);
    const full = Uint32Array.from(geometry.index.array.subarray(0, geometry.index.count));
    const payload = createPayload(geometry, { attributes: true });
    payload.weights = payload.weights.map((weight) => weight * LOD_ATTRIBUTE_SCALE);
    return simplifyJobs
        .run({ ...payload, type: "lod", errors: LOD_ERRORS })
        .then((levels) => (levels?.length ? [{ indices: full, error: 0 }, ...levels] : null))
        .catch(() => null);
}

export function requestCoarseChain(geometry) {
    if (!lodSupported(geometry)) return Promise.resolve(null);
    const payload = createPayload(geometry, { attributes: true, sources: true });
    payload.weights = payload.weights.map((weight) => weight * COARSE_ATTRIBUTE_SCALE);
    return simplifyJobs
        .run({ ...payload, type: "coarse", ratios: COARSE_RATIOS })
        .then((levels) => (levels?.length ? levels.map((level) => ({ geometry: buildGeometry(geometry, level), error: level.error, triangles: level.indices.length / 3 })) : null))
        .catch(() => null);
}

export async function simplifyModel(model) {
    let before = 0;
    let after = 0;
    if (!simplifierSupported) return { before, after };
    const meshes = [];
    model.traverse((child) => {
        if (child.isMesh && !child.isSkinnedMesh && child.geometry) meshes.push(child);
    });
    for (const mesh of meshes) if (!results.has(mesh.geometry)) results.set(mesh.geometry, simplifyGeometryAsync(mesh.geometry));
    for (const mesh of meshes) {
        const geometry = mesh.geometry;
        const simplified = await results.get(geometry);
        before += geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
        after += simplified.index?.count ?? simplified.attributes.position?.count ?? 0;
        if (simplified !== geometry) mesh.geometry = simplified;
    }
    return { before: before / 3, after: after / 3 };
}
