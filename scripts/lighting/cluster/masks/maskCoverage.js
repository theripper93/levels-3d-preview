const TILE_SHIFT = 2;
const MARGIN_TEXELS = 7;
const LIT_PRODUCT = 0.04 * 255 * 255;

export function summarizeMask(data, size) {
    const tiles = size >> TILE_SHIFT;
    const maxR = new Uint8Array(tiles * tiles);
    const maxG = new Uint8Array(tiles * tiles);
    for (let y = 0; y < size; y++) {
        const row = (y >> TILE_SHIFT) * tiles;
        for (let x = 0; x < size; x++) {
            const o = (y * size + x) * 4;
            const t = row + (x >> TILE_SHIFT);
            if (data[o] > maxR[t]) maxR[t] = data[o];
            if (data[o + 1] > maxG[t]) maxG[t] = data[o + 1];
        }
    }
    return { size, tiles, maxR, maxG };
}

function texelRange(min, max, origin, half, size) {
    const inner = size - 2;
    const scale = inner / (2 * half);
    const u0 = (min - origin + half) * scale + 1 - MARGIN_TEXELS;
    const u1 = (max - origin + half) * scale + 1 + MARGIN_TEXELS;
    const lo = Math.min(size - 1, Math.max(0, Math.floor(u0 - 0.5)));
    const hi = Math.min(size - 1, Math.max(0, Math.floor(u1 - 0.5) + 1));
    return [lo >> TILE_SHIFT, hi >> TILE_SHIFT];
}

export function maskReaches(mask, minX, maxX, minZ, maxZ) {
    const coverage = mask?.coverage;
    if (!coverage) return true;
    const [cx, cz, half] = mask.center;
    const [tx0, tx1] = texelRange(minX, maxX, cx, half, coverage.size);
    const [tz0, tz1] = texelRange(minZ, maxZ, cz, half, coverage.size);
    const { tiles, maxR, maxG } = coverage;
    let r = 0;
    let g = 0;
    for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
            const t = tz * tiles + tx;
            if (maxR[t] > r) r = maxR[t];
            if (maxG[t] > g) g = maxG[t];
        }
        if (r * g > LIT_PRODUCT) return true;
    }
    return r * g > LIT_PRODUCT;
}
