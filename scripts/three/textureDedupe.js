const PROBE_SIZE = 32;
const candidates = new Map();
let probeContext = null;
let fullContext = null;

export function dedupeTextures(root) {
    const textures = new Set();
    root.traverse((object) => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (!material) continue;
            for (const key in material) {
                const value = material[key];
                if (value?.isTexture) textures.add(value);
            }
        }
    });
    for (const texture of textures) shareSource(texture);
    fullContext = null;
}

function shareSource(texture) {
    const source = texture.source;
    if (source._sharedWith !== undefined) {
        if (source._sharedWith) texture.source = source._sharedWith;
        return;
    }
    source._sharedWith = null;
    const data = source.data;
    if (!isStaticImage(data)) return;
    const probe = probeHash(data);
    if (probe === null) return;
    const key = `${data.constructor.name}|${data.width}x${data.height}|${probe}`;
    const list = candidates.get(key);
    if (!list) {
        candidates.set(key, [source]);
        return;
    }
    const hash = fullHash(source);
    if (hash === null) return;
    for (const other of list) {
        if (fullHash(other) !== hash) continue;
        source._sharedWith = other;
        texture.source = other;
        return;
    }
    list.push(source);
}

function isStaticImage(data) {
    if (!data?.width || !data.height) return false;
    if (typeof ImageBitmap !== "undefined" && data instanceof ImageBitmap) return true;
    return typeof HTMLImageElement !== "undefined" && data instanceof HTMLImageElement && data.complete;
}

function context(size, existing) {
    if (existing && existing.canvas.width >= size.width && existing.canvas.height >= size.height) return existing;
    const canvas = new OffscreenCanvas(Math.max(size.width, existing?.canvas.width ?? 0), Math.max(size.height, existing?.canvas.height ?? 0));
    return canvas.getContext("2d", { willReadFrequently: true });
}

function probeHash(data) {
    try {
        probeContext = context({ width: PROBE_SIZE, height: PROBE_SIZE }, probeContext);
        probeContext.clearRect(0, 0, PROBE_SIZE, PROBE_SIZE);
        probeContext.drawImage(data, 0, 0, PROBE_SIZE, PROBE_SIZE);
        return hashBytes(probeContext.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data);
    } catch {
        return null;
    }
}

function fullHash(source) {
    if (source._contentHash !== undefined) return source._contentHash;
    source._contentHash = null;
    const data = source.data;
    try {
        fullContext = context(data, fullContext);
        fullContext.clearRect(0, 0, data.width, data.height);
        fullContext.drawImage(data, 0, 0);
        const pixels = fullContext.getImageData(0, 0, data.width, data.height).data;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return null;
        source._contentHash = hashBytes(pixels);
    } catch {
        source._contentHash = null;
    }
    return source._contentHash;
}

function hashBytes(bytes) {
    let a = 2166136261;
    let b = 5381;
    for (let i = 0; i < bytes.length; i++) {
        const v = bytes[i];
        a = Math.imul(a ^ v, 16777619);
        b = (Math.imul(b, 33) + v) | 0;
    }
    return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}${bytes.length}`;
}
