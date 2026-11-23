import { MeshoptSimplifier } from "meshoptimizer";

const MIN_REDUCTION = 0.95;
const LOD_STEP = 0.85;

export const simplifierSupported = MeshoptSimplifier.supported;
export const simplifierReady = MeshoptSimplifier.supported ? MeshoptSimplifier.ready : Promise.resolve();

export function runSimplify({ indices, positions, attributes, stride, weights, ratio, error }) {
    const target = Math.floor((indices.length * ratio) / 3) * 3;
    const flags = ["LockBorder"];
    const [result] = stride ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, stride, weights, null, target, error, flags) : MeshoptSimplifier.simplify(indices, positions, 3, target, error, flags);
    if (!result.length || result.length >= indices.length * MIN_REDUCTION) return null;
    const [remap, unique] = MeshoptSimplifier.compactMesh(result);
    return { indices: result, remap, unique };
}

export function runLodChain({ indices, positions, attributes, stride, weights, errors }) {
    const levels = [];
    const scale = MeshoptSimplifier.getScale(positions, 3);
    let previous = indices.length;
    for (const limit of errors) {
        const [result, error] = stride ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, stride, weights, null, 0, limit, ["LockBorder"]) : MeshoptSimplifier.simplify(indices, positions, 3, 0, limit, ["LockBorder"]);
        if (!result.length || result.length > previous * LOD_STEP) continue;
        levels.push({ indices: result, error: Math.max(error, limit * 0.5) * scale });
        previous = result.length;
    }
    return levels;
}

export function runCoarseChain({ indices, positions, attributes, stride, weights, ratios }) {
    const levels = [];
    const scale = MeshoptSimplifier.getScale(positions, 3);
    let previous = indices.length;
    for (const ratio of ratios) {
        const target = Math.floor((indices.length * ratio) / 3) * 3;
        let [result, error] = stride ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, stride, weights, null, target, 1, []) : MeshoptSimplifier.simplify(indices, positions, 3, target, 1, []);
        if (result.length > target * 1.5) [result, error] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 1);
        if (!result.length || result.length > previous * LOD_STEP) continue;
        const [remap, unique] = MeshoptSimplifier.compactMesh(result);
        levels.push({ indices: result, remap, unique, error: error * scale });
        previous = result.length;
    }
    return levels;
}

function compactSources(sources, remap, unique) {
    return sources.map(({ name, array, itemSize, normalized }) => {
        const out = new array.constructor(unique * itemSize);
        for (let i = 0; i < remap.length; i++) {
            const target = remap[i];
            if (target === 0xffffffff) continue;
            for (let c = 0; c < itemSize; c++) out[target * itemSize + c] = array[i * itemSize + c];
        }
        return { name, array: out, itemSize, normalized };
    });
}

function recomputeNormals(attributes, indices) {
    const position = attributes.find((a) => a.name === "position");
    const normal = attributes.find((a) => a.name === "normal");
    if (!position || !normal || normal.itemSize !== 3 || !(normal.array instanceof Float32Array)) return;
    const p = position.array;
    const n = normal.array;
    const s = position.itemSize;
    n.fill(0);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];
        const e1x = p[b * s] - p[a * s];
        const e1y = p[b * s + 1] - p[a * s + 1];
        const e1z = p[b * s + 2] - p[a * s + 2];
        const e2x = p[c * s] - p[a * s];
        const e2y = p[c * s + 1] - p[a * s + 1];
        const e2z = p[c * s + 2] - p[a * s + 2];
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        for (const v of [a, b, c]) {
            n[v * 3] += nx;
            n[v * 3 + 1] += ny;
            n[v * 3 + 2] += nz;
        }
    }
    for (let i = 0; i < n.length; i += 3) {
        const length = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
        n[i] /= length;
        n[i + 1] /= length;
        n[i + 2] /= length;
    }
}

export function runJob(payload) {
    if (payload.type === "lod") return runLodChain(payload);
    if (payload.type === "coarse") {
        return runCoarseChain(payload).map((level) => {
            const attributes = compactSources(payload.sources, level.remap, level.unique);
            recomputeNormals(attributes, level.indices);
            return { indices: level.indices, unique: level.unique, error: level.error, attributes };
        });
    }
    const result = runSimplify(payload);
    if (!result) return null;
    return { indices: result.indices, unique: result.unique, attributes: compactSources(payload.sources, result.remap, result.unique) };
}

export function simplifyTransferables(result) {
    const levels = Array.isArray(result) ? result : result ? [result] : [];
    return levels.flatMap((level) => [level.indices.buffer, ...(level.attributes ?? []).map((attribute) => attribute.array.buffer)]);
}

export function payloadTransferables(payload) {
    const buffers = new Set([payload.indices.buffer, payload.positions.buffer, payload.attributes?.buffer, ...(payload.sources ?? []).map((source) => source.array.buffer)]);
    buffers.delete(undefined);
    return [...buffers];
}

const CACHE_VERSION = 1;

export function cacheKey(payload) {
    let h1 = 0x811c9dc5 ^ CACHE_VERSION;
    let h2 = 0x01000193;
    const mix = (view) => {
        for (let i = 0; i < view.length; i++) {
            h1 = Math.imul(h1 ^ view[i], 16777619);
            h2 = Math.imul(h2 + view[i], 2246822519) ^ (h2 >>> 13);
        }
    };
    const words = (typed) => new Uint32Array(typed.buffer, typed.byteOffset, typed.byteLength >> 2);
    const params = JSON.stringify({ type: payload.type, ratio: payload.ratio, error: payload.error, ratios: payload.ratios, errors: payload.errors, weights: payload.weights, stride: payload.stride, sources: payload.sources?.map((source) => [source.name, source.itemSize, source.normalized, source.array.constructor.name]) });
    for (let i = 0; i < params.length; i++) h1 = Math.imul(h1 ^ params.charCodeAt(i), 16777619);
    mix(words(payload.indices));
    mix(words(payload.positions));
    if (payload.attributes?.byteLength) mix(words(payload.attributes));
    for (const source of payload.sources ?? []) if (!(source.name in { position: 1 }) && source.array.byteLength % 4 === 0) mix(words(source.array));
    return `${CACHE_VERSION}:${payload.indices.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
}
