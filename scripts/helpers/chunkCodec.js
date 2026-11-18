function forEachChunk(nx, ny, size, fn) {
    for (let j0 = 0; j0 < ny; j0 += size) {
        for (let i0 = 0; i0 < nx; i0 += size) fn(`${i0 / size},${j0 / size}`, i0, j0, Math.min(size, nx - i0), Math.min(size, ny - j0));
    }
}

function extract(values, nx, i0, j0, cw, ch) {
    const out = new values.constructor(cw * ch);
    for (let j = 0; j < ch; j++) out.set(values.subarray((j0 + j) * nx + i0, (j0 + j) * nx + i0 + cw), j * cw);
    return out;
}

function predict(p, k, i, j, cw) {
    const a = i ? p[k - 1] : j ? p[k - cw] : 0;
    const b = j ? p[k - cw] : a;
    const c = i && j ? p[k - cw - 1] : a;
    return c >= Math.max(a, b) ? Math.min(a, b) : c <= Math.min(a, b) ? Math.max(a, b) : a + b - c;
}

async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

function toBase64(bytes) {
    let s = "";
    for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    return btoa(s);
}

async function encodePlane(plane, cw, bits) {
    const n = plane.length;
    const size = 1 << bits;
    const bytes = new Uint8Array(n * (bits >> 3));
    for (let k = 0; k < n; k++) {
        let d = (plane[k] - predict(plane, k, k % cw, (k / cw) | 0, cw)) & (size - 1);
        if (d >= size >> 1) d -= size;
        const z = d >= 0 ? d * 2 : -d * 2 - 1;
        bytes[k] = z & 255;
        if (bits > 8) bytes[n + k] = z >> 8;
    }
    return toBase64(await pipe(bytes, new CompressionStream("deflate-raw")));
}

async function decodePlane(b64, plane, cw, bits) {
    const bytes = await pipe(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), new DecompressionStream("deflate-raw"));
    const n = plane.length;
    const mask = (1 << bits) - 1;
    for (let k = 0; k < n; k++) {
        const z = bits > 8 ? bytes[k] | (bytes[n + k] << 8) : bytes[k];
        plane[k] = (predict(plane, k, k % cw, (k / cw) | 0, cw) + (z & 1 ? -((z + 1) >> 1) : z >> 1)) & mask;
    }
    return plane;
}

export async function decodeGrid(chunks, values, nx, ny, size, bits) {
    const jobs = [];
    forEachChunk(nx, ny, size, (key, i0, j0, cw, ch) => {
        if (!chunks?.[key]) return;
        jobs.push(
            decodePlane(chunks[key], new values.constructor(cw * ch), cw, bits).then((plane) => {
                for (let j = 0; j < ch; j++) values.set(plane.subarray(j * cw, (j + 1) * cw), (j0 + j) * nx + i0);
            }),
        );
    });
    await Promise.all(jobs);
}

export async function encodeGridChanges(values, base, nx, ny, size, bits, fill) {
    const out = {};
    const jobs = [];
    forEachChunk(nx, ny, size, (key, i0, j0, cw, ch) => {
        const cur = extract(values, nx, i0, j0, cw, ch);
        const old = extract(base, nx, i0, j0, cw, ch);
        if (cur.every((v, k) => v === old[k])) return;
        if (cur.every((v) => v === fill)) out[key] = null;
        else jobs.push(encodePlane(cur, cw, bits).then((b64) => (out[key] = b64)));
    });
    await Promise.all(jobs);
    return out;
}

export async function patchGrid(oldChunks, newChunks, base, nx, ny, size, bits, fill, onChange) {
    const jobs = [];
    forEachChunk(nx, ny, size, (key, i0, j0, cw, ch) => {
        const b64 = newChunks?.[key] ?? null;
        if ((oldChunks?.[key] ?? null) === b64) return;
        const plane = new base.constructor(cw * ch);
        jobs.push(
            (b64 ? decodePlane(b64, plane, cw, bits) : Promise.resolve(plane.fill(fill))).then(() => {
                const old = extract(base, nx, i0, j0, cw, ch);
                if (plane.every((v, k) => v === old[k])) return;
                for (let j = 0; j < ch; j++) base.set(plane.subarray(j * cw, (j + 1) * cw), (j0 + j) * nx + i0);
                onChange(i0, j0, cw, ch);
            }),
        );
    });
    await Promise.all(jobs);
}
