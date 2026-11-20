import * as THREE from "three";
import { factor } from "../main.js";
import { decodeGrid, encodeGridChanges, patchGrid } from "./chunkCodec.js";
import { GroundCover } from "./groundCover.js";
import { buildRoadMask, applyRoad, linkRoads, paintRoads } from "./terrainRoads.js";
import { TerrainWater, waterDims } from "./terrainWater.js";

const CHUNK = 64;
export const MAX_TERRAIN_LAYERS = 16;
const LAYER_SIZE = 1024;
const layerArrayCache = new Map();

export function flatLevel(data) {
    return ((data.base ?? 0) - data.min) / (data.max - data.min);
}

const STRUCTURE = ["w", "h", "nx", "ny", "min", "max", "chunk", "wn"];
const signature = (data, keys) => JSON.stringify(keys.map((k) => (k === "wn" && data ? waterDims(data) : data?.[k] ?? null)));
const stampKey = (data) => JSON.stringify([data?.stamps ?? [], data?.roads ?? []]);

const CAVE_BASE = { shift: 0.1, jag: 0.6, fine: 0.2, band: 0.6, rim: 0.6, outer: 1.8, floor: 0.07, top: 0.35, mouth: 0.5, ramp: 2 };
const CAVE_STYLES = { mine: { ...CAVE_BASE,shift: 0.05, jag: 0.12, fine: 0.05, band: 0.3, floor: 0.025, top: 0.12 } };
const POOL = { depth: 0.45, sigma: 0.65, radius: 0.75, wobble: 0.4, bank: 0.6 };
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function hashNoise(x, y, seed) {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 61.3) * 43758.5453;
    return s - Math.floor(s);
}

function valueNoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hashNoise(xi, yi, seed), b = hashNoise(xi + 1, yi, seed), c = hashNoise(xi, yi + 1, seed), d = hashNoise(xi + 1, yi + 1, seed);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

export function fbm(x, y, seed) {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 3; o++) {
        v += amp * valueNoise(x * f, y * f, seed + o * 17);
        f *= 2.03;
        amp *= 0.5;
    }
    return v / 0.875;
}

function smoothLoop(poly, step) {
    let pts = [];
    for (let a = 0; a < poly.length; a += 2) {
        const b = (a + 2) % poly.length;
        const n = Math.max(1, Math.round(Math.hypot(poly[b] - poly[a], poly[b + 1] - poly[a + 1]) / step));
        for (let k = 0; k < n; k++) pts.push(poly[a] + ((poly[b] - poly[a]) * k) / n, poly[a + 1] + ((poly[b + 1] - poly[a + 1]) * k) / n);
    }
    for (let it = 0; it < 2; it++) {
        const next = [];
        for (let a = 0; a < pts.length; a += 2) {
            const b = (a + 2) % pts.length;
            next.push(pts[a] * 0.75 + pts[b] * 0.25, pts[a + 1] * 0.75 + pts[b + 1] * 0.25, pts[a] * 0.25 + pts[b] * 0.75, pts[a + 1] * 0.25 + pts[b + 1] * 0.75);
        }
        pts = next;
    }
    return pts;
}

function segDist(x, y, s, k) {
    const x1 = s[k], y1 = s[k + 1], dx = s[k + 2] - x1, dy = s[k + 3] - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}

function refAt(ref, x, y) {
    const fx = Math.max(0, Math.min(ref.cols - 1.001, (x - ref.x) / ref.cell));
    const fy = Math.max(0, Math.min(ref.rows - 1.001, (y - ref.y) / ref.cell));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const v = ref.v, k = j * ref.cols + i;
    return (v[k] * (1 - tx) + v[k + 1] * tx) * (1 - ty) + (v[k + ref.cols] * (1 - tx) + v[k + ref.cols + 1] * tx) * ty;
}

function poolDrop(pools, x, y, cell, seed) {
    let f = 0;
    for (let q = 0; q < pools.length; q += 2) {
        const r2 = ((x - pools[q]) ** 2 + (y - pools[q + 1]) ** 2) / (cell * cell);
        if (r2 < 9) f += Math.exp(-r2 / (POOL.sigma * POOL.sigma));
    }
    if (f < 1e-3) return 0;
    const d = POOL.sigma * Math.sqrt(Math.max(0, -Math.log(f))) - POOL.radius + POOL.wobble * (2 * fbm(x / (1.1 * cell), y / (1.1 * cell), seed + 23) - 1);
    return POOL.depth * cell * smooth(-d / POOL.bank);
}

function buildCaveMask(stamp, data, nx, ny, layers) {
    const { w, h, min, max } = data;
    const CAVE = CAVE_STYLES[stamp.variant] ?? CAVE_BASE;
    const cell = stamp.cell || 100;
    const seed = stamp.seed ?? 1;
    const pools = (stamp.pools ?? []).map((v, q, p) => v + (hashNoise(p[q - (q % 2)], p[q - (q % 2) + 1], seed + 5 + (q % 2)) - 0.5) * 0.4 * cell);
    const norm = (v) => Math.max(0, Math.min(1, (v - min) / (max - min)));
    const reach = (CAVE.shift + CAVE.jag + CAVE.band + CAVE.rim + CAVE.outer) * cell;
    const segs = [];
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const poly of stamp.polys) {
        const p = smoothLoop(poly, cell);
        for (let a = 0; a < p.length; a += 2) {
            const b = (a + 2) % p.length;
            segs.push(p[a], p[a + 1], p[b], p[b + 1]);
            bx0 = Math.min(bx0, p[a]);
            bx1 = Math.max(bx1, p[a]);
            by0 = Math.min(by0, p[a + 1]);
            by1 = Math.max(by1, p[a + 1]);
        }
    }
    const i0 = Math.max(0, Math.floor(((bx0 - reach) / w) * (nx - 1)));
    const i1 = Math.min(nx - 1, Math.ceil(((bx1 + reach) / w) * (nx - 1)));
    const j0 = Math.max(0, Math.floor(((by0 - reach) / h) * (ny - 1)));
    const j1 = Math.min(ny - 1, Math.ceil(((by1 + reach) / h) * (ny - 1)));
    const cw = i1 - i0 + 1, ch = j1 - j0 + 1;
    if (cw <= 0 || ch <= 0 || !segs.length) return null;
    const bx = (bx0 - reach), by = (by0 - reach);
    const bw = Math.ceil((bx1 - bx0 + 2 * reach) / cell) + 1;
    const buckets = new Map();
    for (let k = 0; k < segs.length; k += 4) {
        const qi0 = Math.floor((Math.min(segs[k], segs[k + 2]) - bx) / cell), qi1 = Math.floor((Math.max(segs[k], segs[k + 2]) - bx) / cell);
        const qj0 = Math.floor((Math.min(segs[k + 1], segs[k + 3]) - by) / cell), qj1 = Math.floor((Math.max(segs[k + 1], segs[k + 3]) - by) / cell);
        for (let qj = qj0; qj <= qj1; qj++) for (let qi = qi0; qi <= qi1; qi++) {
            const key = qj * bw + qi;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(k);
        }
    }
    const span = Math.ceil(reach / cell);
    const open = stamp.open ?? [];
    const mouth = new Uint8Array(segs.length / 4);
    for (let k = 0; k < segs.length; k += 4) {
        const mx = (segs[k] + segs[k + 2]) / 2, my = (segs[k + 1] + segs[k + 3]) / 2;
        for (let e = 0; e < open.length && !mouth[k / 4]; e += 4) if (segDist(mx, my, open, e) < 0.3 * cell) mouth[k / 4] = 1;
    }
    const size = cw * ch;
    const m = { kind: "cave", i0, j0, cw, ch, F: new Float32Array(size), T: new Float32Array(size), a: new Float32Array(size), b: new Float32Array(size), c: new Float32Array(size), R: stamp.ref?.v?.length ? new Float32Array(size) : null, o: new Float32Array(size), p: new Float32Array(size), skip: new Uint8Array(size) };
    m.paint = stamp.paint ? layers.findIndex((l) => l.id === stamp.paint) : -1;
    m.wallPaint = stamp.wallPaint ? layers.findIndex((l) => l.id === stamp.wallPaint) : -1;
    if (m.wallPaint > 0) m.pw = new Float32Array(size);
    const crossings = [];
    for (let j = 0; j < ch; j++) {
        const y = ((j0 + j) / (ny - 1)) * h;
        crossings.length = 0;
        for (let k = 0; k < segs.length; k += 4) {
            const y1 = segs[k + 1], y2 = segs[k + 3];
            if (y1 > y !== y2 > y) crossings.push(segs[k] + ((y - y1) * (segs[k + 2] - segs[k])) / (y2 - y1));
        }
        crossings.sort((p, q) => p - q);
        let cross = 0;
        for (let i = 0; i < cw; i++) {
            const x = ((i0 + i) / (nx - 1)) * w;
            while (cross < crossings.length && crossings[cross] < x) cross++;
            const inside = cross % 2 === 1;
            const q = j * cw + i;
            let d = reach;
            let dWall = reach;
            const qi = Math.floor((x - bx) / cell), qj = Math.floor((y - by) / cell);
            for (let dj = -span; dj <= span; dj++) for (let di = -span; di <= span; di++) {
                const list = buckets.get((qj + dj) * bw + qi + di);
                if (list) for (const k of list) {
                    const dk = segDist(x, y, segs, k);
                    d = Math.min(d, dk);
                    if (!mouth[k / 4]) dWall = Math.min(dWall, dk);
                }
            }
            let dOpen = Infinity;
            for (let k = 0; k < open.length; k += 4) dOpen = Math.min(dOpen, segDist(x, y, open, k));
            const o = open.length ? smooth(0.5 + (dWall - dOpen) / (CAVE.mouth * cell)) : 0;
            if (!inside && d >= reach && o === 0) {
                m.skip[q] = 1;
                continue;
            }
            const sd = inside ? -d : d;
            const u = sd - (CAVE.shift + CAVE.jag * smooth((fbm(x / (2.2 * cell), y / (2.2 * cell), seed) - 0.3) / 0.4) + CAVE.fine * fbm(x / (0.6 * cell), y / (0.6 * cell), seed + 11)) * cell;
            m.a[q] = smooth(u / (CAVE.band * cell));
            m.b[q] = smooth((u - (CAVE.band + CAVE.rim) * cell) / (CAVE.outer * cell));
            m.c[q] = smooth(sd / (CAVE.ramp * cell));
            m.o[q] = o;
            if (m.R) m.R[q] = norm(refAt(stamp.ref, x, y));
            m.F[q] = norm(stamp.z + (fbm(x / (1.7 * cell), y / (1.7 * cell), seed + 3) - 0.5) * 2 * CAVE.floor * cell - (inside && pools.length ? poolDrop(pools, x, y, cell, seed) : 0));
            m.T[q] = norm(stamp.z + stamp.wall * (1 - CAVE.top / 2 + CAVE.top * fbm(x / (2.2 * cell), y / (2.2 * cell), seed + 7)));
            m.p[q] = (1 - m.a[q]) * (1 - o) + (1 - m.c[q]) * o;
            if (m.pw) m.pw[q] = smooth(u / (0.3 * cell) + 1) * (1 - m.b[q]) * (1 - o);
        }
    }
    return m;
}

function applyCave(out, m, nx) {
    const { i0, j0, cw } = m;
    for (let q = 0; q < m.skip.length; q++) {
        if (m.skip[q]) continue;
        const k = (j0 + ((q / cw) | 0)) * nx + i0 + (q % cw);
        const r = out[k];
        const floor = m.R ? m.F[q] + Math.min(0, r - m.R[q]) : m.F[q];
        const top = Math.max(r, m.T[q]);
        let closed = floor + (top - floor) * m.a[q];
        closed += (r - closed) * m.b[q];
        const opened = floor + (r - floor) * m.c[q];
        out[k] = closed + (opened - closed) * m.o[q];
    }
}

function buildStampMasks(data, nx, ny, layers = []) {
    const { w, h, min, max } = data;
    const roads = (data.roads ?? []).map((road) => buildRoadMask(road, data, nx, ny, layers)).filter(Boolean);
    const masks = linkRoads(roads, nx, ny);
    for (const stamp of data.stamps ?? []) {
        if (stamp.kind === "cave") {
            const mask = buildCaveMask(stamp, data, nx, ny, layers);
            if (mask) masks.push(mask);
            continue;
        }
        const falloff = Math.max(1, stamp.falloff ?? 50);
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (const poly of stamp.polys) {
            for (let k = 0; k < poly.length; k += 2) {
                bx0 = Math.min(bx0, poly[k]);
                bx1 = Math.max(bx1, poly[k]);
                by0 = Math.min(by0, poly[k + 1]);
                by1 = Math.max(by1, poly[k + 1]);
            }
        }
        const i0 = Math.max(0, Math.floor(((bx0 - falloff) / w) * (nx - 1)));
        const i1 = Math.min(nx - 1, Math.ceil(((bx1 + falloff) / w) * (nx - 1)));
        const j0 = Math.max(0, Math.floor(((by0 - falloff) / h) * (ny - 1)));
        const j1 = Math.min(ny - 1, Math.ceil(((by1 + falloff) / h) * (ny - 1)));
        const cw = i1 - i0 + 1, ch = j1 - j0 + 1;
        if (cw <= 0 || ch <= 0) continue;
        const weights = new Float32Array(cw * ch);
        for (let j = 0; j < ch; j++) {
            for (let i = 0; i < cw; i++) {
                const x = ((i0 + i) / (nx - 1)) * w;
                const y = ((j0 + j) / (ny - 1)) * h;
                let inside = false;
                let dist = Infinity;
                for (const poly of stamp.polys) {
                    if (pointInPoly(x, y, poly)) inside = !inside;
                    dist = Math.min(dist, distToPoly(x, y, poly));
                }
                const t = dist / falloff;
                weights[j * cw + i] = inside ? 0 : t < 1 ? t * t * (3 - 2 * t) : 1;
            }
        }
        masks.push({ i0, j0, cw, ch, target: (stamp.z - min) / (max - min), weights, ...(stamp.cover ? { kind: "cover" } : {}) });
    }
    return masks;
}

function applyStamps(raw, masks, nx, ny, data) {
    const out = new Float32Array(raw);
    for (const mask of masks) {
        if (mask.kind === "road") {
            applyRoad(out, mask, data, nx, ny);
            continue;
        }
        if (mask.kind === "cave") {
            applyCave(out, mask, nx);
            continue;
        }
        if (mask.kind === "cover") continue;
        const { i0, j0, cw, ch, target, weights } = mask;
        for (let j = 0; j < ch; j++) {
            for (let i = 0; i < cw; i++) {
                const wgt = weights[j * cw + i];
                if (wgt === 1) continue;
                const idx = (j0 + j) * nx + i0 + i;
                out[idx] = target + (out[idx] - target) * wgt;
            }
        }
    }
    return out;
}

export function pointInPoly(x, y, p) {
    let inside = false;
    for (let a = 0, b = p.length - 2; a < p.length; b = a, a += 2) {
        const xi = p[a], yi = p[a + 1], xj = p[b], yj = p[b + 1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function distToPoly(x, y, p) {
    let best = Infinity;
    for (let a = 0, b = p.length - 2; a < p.length; b = a, a += 2) {
        const x1 = p[b], y1 = p[b + 1], x2 = p[a], y2 = p[a + 1];
        const dx = x2 - x1, dy = y2 - y1;
        const len = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len));
        best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
    }
    return best;
}

const MAP_SUFFIX = /_(Color|NormalGL|Roughness|AmbientOcclusion|Metalness|Emissive)\./;
const DETAIL_DEFAULT = [128, 128, 255, 235];

async function loadLayerTexture(src, map = "Color") {
    if (!src) return null;
    try {
        const tex = await game.Levels3DPreview.helpers.loadTexture(src.replace(MAP_SUFFIX, `_${map}.`));
        return tex?.image ? tex : null;
    } catch {
        return null;
    }
}

function readPixels(ctx, tex) {
    if (!tex) return null;
    ctx.drawImage(tex.image, 0, 0, LAYER_SIZE, LAYER_SIZE);
    return ctx.getImageData(0, 0, LAYER_SIZE, LAYER_SIZE).data;
}

async function layerDetail(ctx, src) {
    const [normal, ao, rough] = await Promise.all(["NormalGL", "AmbientOcclusion", "Roughness"].map((map) => (src && MAP_SUFFIX.test(src) ? loadLayerTexture(src, map) : null)));
    const n = readPixels(ctx, normal);
    const a = readPixels(ctx, ao);
    const r = readPixels(ctx, rough);
    const out = new Uint8Array(LAYER_SIZE * LAYER_SIZE * 4);
    for (let k = 0; k < out.length; k += 4) {
        out[k] = n ? n[k] : DETAIL_DEFAULT[0];
        out[k + 1] = n ? n[k + 1] : DETAIL_DEFAULT[1];
        out[k + 2] = a ? a[k] : DETAIL_DEFAULT[2];
        out[k + 3] = r ? r[k] : DETAIL_DEFAULT[3];
    }
    return out;
}

function arrayTexture(pixels, depth, colorSpace) {
    const array = new THREE.DataArrayTexture(pixels, LAYER_SIZE, LAYER_SIZE, depth);
    array.wrapS = array.wrapT = THREE.RepeatWrapping;
    array.colorSpace = colorSpace;
    array.minFilter = THREE.LinearMipmapLinearFilter;
    array.magFilter = THREE.LinearFilter;
    array.generateMipmaps = true;
    array.anisotropy = 4;
    array.needsUpdate = true;
    return array;
}

function packWeights(splat, n, slices) {
    const groups = Math.max(1, Math.ceil(slices / 4));
    const out = new Uint8Array(groups * n * 4);
    for (let s = 0; s < slices; s++) {
        const base = Math.floor(s / 4) * n * 4 + (s % 4);
        const from = s * n;
        for (let k = 0; k < n; k++) out[base + k * 4] = splat[from + k];
    }
    return out;
}

function layerArrayTexture(layers) {
    const key = layers.map((l) => l.src ?? "").join("|");
    if (!layerArrayCache.has(key)) {
        layerArrayCache.set(
            key,
            (async () => {
                const textures = await Promise.all(layers.map((l) => loadLayerTexture(l.src)));
                const layerBytes = LAYER_SIZE * LAYER_SIZE * 4;
                const pixels = new Uint8Array(layerBytes * layers.length);
                const details = new Uint8Array(layerBytes * layers.length);
                const ctx = new OffscreenCanvas(LAYER_SIZE, LAYER_SIZE).getContext("2d", { willReadFrequently: true });
                textures.forEach((tex, k) => {
                    if (!tex) return pixels.fill(200, k * layerBytes, (k + 1) * layerBytes);
                    pixels.set(readPixels(ctx, tex), k * layerBytes);
                });
                for (let k = 0; k < layers.length; k++) details.set(await layerDetail(ctx, layers[k].src), k * layerBytes);
                const array = arrayTexture(pixels, layers.length, THREE.SRGBColorSpace);
                const detail = arrayTexture(details, layers.length, THREE.NoColorSpace);
                return { array, detail, textures };
            })(),
        );
        while (layerArrayCache.size > 2) {
            const [oldKey, old] = layerArrayCache.entries().next().value;
            layerArrayCache.delete(oldKey);
            old.then(({ array, detail }) => {
                array.dispose();
                detail.dispose();
            });
        }
    }
    return layerArrayCache.get(key);
}

export async function buildTerrainMesh(data) {
    const state = new TerrainState(data);
    await state.load();
    return state.group;
}

export class TerrainState {
    constructor(data) {
        this.data = data;
        this.nx = Math.max(2, data.nx | 0);
        this.ny = Math.max(2, data.ny | 0);
        this.chunk = data.chunk || CHUNK;
        this.layers = (data.layers ?? []).slice(0, MAX_TERRAIN_LAYERS);
        const n = this.nx * this.ny;
        this.flatQ = Math.round(Math.max(0, Math.min(1, flatLevel(data))) * 65535);
        this.hq = new Uint16Array(n).fill(this.flatQ);
        this.raw = new Float32Array(n);
        this.weights = new Uint8Array(n * Math.max(1, this.layers.length - 1));
        this.stampMasks = buildStampMasks(data, this.nx, this.ny, this.layers);
        this.group = new THREE.Group();
        Object.defineProperty(this.group, "mapMakerTerrain", { value: this, enumerable: false });
        this.water = new TerrainWater(this);
        this.remember(data);
    }

    remember(data) {
        this.data = data;
        this.seen = {
            hc: { ...data.hc },
            wl: { ...data.wl },
            wk: { ...data.wk },
            sc: Object.fromEntries(Object.entries(data.sc ?? {}).map(([id, chunks]) => [id, { ...chunks }])),
            structure: signature(data, STRUCTURE),
            look: signature(data, ["layers", "slope"]),
            stamps: stampKey(data),
        };
    }

    update(data) {
        if (!this.material || signature(data, STRUCTURE) !== this.seen.structure) return false;
        this._queue = (this._queue ?? Promise.resolve()).then(() => this.applyUpdate(data));
        return true;
    }

    async applyUpdate(data) {
        const { nx, ny, chunk, seen } = this;
        const n = nx * ny;
        const lookChanged = signature(data, ["layers", "slope"]) !== seen.look;
        const stampsChanged = stampKey(data) !== seen.stamps;
        this.data = data;
        let heightsChanged = false;
        await patchGrid(seen.hc, data.hc, this.hq, nx, ny, chunk, 16, this.flatQ, (i0, j0, cw, ch) => {
            heightsChanged = true;
            for (let j = j0; j < j0 + ch; j++) for (let k = j * nx + i0; k < j * nx + i0 + cw; k++) this.raw[k] = this.hq[k] / 65535;
        });
        const waterChanged = await this.water.patch(seen, data);
        if (lookChanged) {
            this.layers = (data.layers ?? []).slice(0, MAX_TERRAIN_LAYERS);
            this.weights = new Uint8Array(n * Math.max(1, this.layers.length - 1));
            await Promise.all(this.layers.slice(1).map((l, k) => decodeGrid(data.sc?.[l.id], this.layerWeights(k + 1), nx, ny, chunk, 8)));
            this.wq = this.weights.slice();
            this.stampMasks = buildStampMasks(data, nx, ny, this.layers);
            this.composeSplat();
            this.disposeMaterials();
            await this.createMaterial();
        } else {
            let splatChanged = false;
            await Promise.all(
                this.layers.slice(1).map((l, k) => {
                    const base = this.wq.subarray(k * n, (k + 1) * n);
                    const weights = this.layerWeights(k + 1);
                    return patchGrid(seen.sc[l.id], data.sc?.[l.id], base, nx, ny, chunk, 8, 0, (i0, j0, cw, ch) => {
                        splatChanged = true;
                        for (let j = j0; j < j0 + ch; j++) weights.set(base.subarray(j * nx + i0, j * nx + i0 + cw), j * nx + i0);
                    });
                }),
            );
            if (stampsChanged) this.stampMasks = buildStampMasks(data, nx, ny, this.layers);
            if (splatChanged || stampsChanged) this.refreshSplat();
        }
        if (stampsChanged) this.refreshHoles();
        if (heightsChanged || stampsChanged) this.refreshHeights();
        if (waterChanged || lookChanged || stampsChanged) this.water.build();
        this.remember(data);
    }

    async load() {
        const { nx, ny, chunk } = this;
        await Promise.all([decodeGrid(this.data.hc, this.hq, nx, ny, chunk, 16), ...this.layers.slice(1).map((l, k) => decodeGrid(this.data.sc?.[l.id], this.layerWeights(k + 1), nx, ny, chunk, 8)), this.water.load(this.data)]);
        for (let k = 0; k < this.raw.length; k++) this.raw[k] = this.hq[k] / 65535;
        this.wq = this.weights.slice();
        this.composeSplat();
        this.buildGeometry();
        await this.createMaterial();
        this.water.build();
    }

    waterAt(x, y) {
        return this.water.surfaceAt(x, y);
    }

    composeSplat() {
        const masks = this.stampMasks.filter((m) => m.paint > 0 || m.wallPaint > 0 || m.paints?.length);
        if (!masks.length) return (this.splat = this.weights);
        const { weights } = this;
        const n = this.nx * this.ny;
        const slices = this.layers.length - 1;
        if (this.splat === weights || this.splat?.length !== weights.length) this.splat = new Uint8Array(weights.length);
        const splat = this.splat;
        splat.set(weights);
        paintRoads(splat, masks.filter((m) => m.kind === "road"), this.nx, n, slices);
        const caveSlices = new Set();
        for (const m of masks) {
            if (m.kind === "road") continue;
            const earlier = [...caveSlices];
            for (const [index, p] of [[m.paint, m.p], [m.wallPaint, m.pw]]) {
                if (!(index > 0) || !p) continue;
                const target = (index - 1) * n;
                const covered = earlier.filter((s) => s !== target);
                for (let q = 0; q < p.length; q++) {
                    if (m.skip[q] || !p[q]) continue;
                    const k = (m.j0 + ((q / m.cw) | 0)) * this.nx + m.i0 + (q % m.cw);
                    let other = 0;
                    for (let s = 0; s < slices; s++) if (s * n !== target) other = Math.max(other, weights[s * n + k]);
                    splat[target + k] = Math.max(splat[target + k], Math.round(255 * p[q] * (1 - other / 255)));
                    for (const s of covered) splat[s + k] = Math.round(splat[s + k] * (1 - p[q]));
                }
                if (m.kind === "cave") caveSlices.add(target);
            }
        }
        return splat;
    }

    get scale() {
        return 1 / factor;
    }

    layerIndex(id) {
        return this.layers.findIndex((l) => l.id === id);
    }

    layerWeights(index) {
        const n = this.nx * this.ny;
        return this.weights.subarray((index - 1) * n, index * n);
    }

    get stamped() {
        if (this._stamped) return this._stamped;
        const base = this.stampMasks.length ? applyStamps(this.raw, this.stampMasks, this.nx, this.ny, this.data) : this.shore ? new Float32Array(this.raw) : this.raw;
        return (this._stamped = this.shore ? this.applyShore(base) : base);
    }

    setCoverOutskirts(heightAt, reach = 0) {
        this.coverOutskirts = heightAt;
        this.cover?.setOutskirts(heightAt);
        this.water.setReach(heightAt ? reach : 0);
    }

    setRoads(roads) {
        this.data = { ...this.data, roads };
        this.seen.stamps = stampKey(this.data);
        this.stampMasks = buildStampMasks(this.data, this.nx, this.ny, this.layers);
        this.refreshSplat();
        this.refreshHeights();
    }

    onRoad(x, y) {
        const i = Math.round((x / this.data.w) * (this.nx - 1));
        const j = Math.round((y / this.data.h) * (this.ny - 1));
        for (const m of this.stampMasks) {
            if (m.kind !== "road") continue;
            const qi = i - m.i0, qj = j - m.j0;
            if (qi >= 0 && qj >= 0 && qi < m.cw && qj < m.ch && m.occ[qj * m.cw + qi]) return true;
        }
        return false;
    }

    setShore(shore) {
        if (JSON.stringify(shore) === JSON.stringify(this.shore ?? null)) return false;
        this.shore = shore;
        this._stamped = null;
        if (this.skirtMesh) this.skirtMesh.visible = !shore;
        if (this.surfaceMesh) this.refreshHeights();
        return true;
    }

    applyShore(out) {
        const { nx, ny } = this;
        const { w, h, min, max } = this.data;
        const { width, depth } = this.shore;
        const target = Math.max(0, (-depth - min) / (max - min));
        for (let j = 0; j < ny; j++) {
            const y = (j / (ny - 1)) * h;
            for (let i = 0; i < nx; i++) {
                const x = (i / (nx - 1)) * w;
                const d = Math.min(x, w - x, y, h - y);
                if (d > width * 1.5) continue;
                const reach = width * (0.5 + fbm(x / (width * 1.7), y / (width * 1.7), 29));
                const k = j * nx + i;
                out[k] = Math.min(out[k], target + (out[k] - target) * smooth(d / reach));
            }
        }
        return out;
    }

    lowestElevation() {
        if (this._lowest?.version !== this.heightVersion) {
            const stamped = this.stamped;
            let m = Infinity;
            for (let k = 0; k < stamped.length; k++) if (stamped[k] < m) m = stamped[k];
            this._lowest = { version: this.heightVersion, value: m };
        }
        const { min, max } = this.data;
        const d = canvas.scene.dimensions;
        return ((min + this._lowest.value * (max - min)) / d.size) * d.distance;
    }

    computeHeights() {
        const { min, max } = this.data;
        this.heightVersion = (this.heightVersion ?? 0) + 1;
        this._stamped = null;
        const stamped = this.stamped;
        const out = new Float32Array(stamped.length);
        for (let k = 0; k < stamped.length; k++) out[k] = min + stamped[k] * (max - min);
        return out;
    }

    buildGeometry() {
        const { nx, ny } = this;
        const { w, h, min, max } = this.data;
        const s = this.scale;
        const heights = this.computeHeights();
        const positions = new Float32Array(nx * ny * 3);
        const uvs = new Float32Array(nx * ny * 2);
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const k = j * nx + i;
                positions[k * 3] = (i / (nx - 1)) * w * s;
                positions[k * 3 + 1] = heights[k] * s;
                positions[k * 3 + 2] = (j / (ny - 1)) * h * s;
                uvs[k * 2] = i / (nx - 1);
                uvs[k * 2 + 1] = j / (ny - 1);
            }
        }
        const surface = new THREE.BufferGeometry();
        surface.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        surface.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        surface.setIndex(this.surfaceIndex());
        this.updateNormals(surface, positions);
        surface.computeBoundingBox();

        const skirt = new THREE.BufferGeometry();
        skirt.setAttribute("position", new THREE.Float32BufferAttribute(this.skirtPositions(positions), 3));
        skirt.computeVertexNormals();

        const marker = new THREE.BufferGeometry();
        marker.setAttribute("position", new THREE.Float32BufferAttribute([0, min * s, 0, w * s, max * s, h * s, 0, min * s, h * s], 3));

        this.surfaceMesh = new THREE.Mesh(surface);
        this.skirtMesh = new THREE.Mesh(skirt);
        this.markerMesh = new THREE.Mesh(marker, new THREE.MeshBasicMaterial({ visible: false }));
        this.surfaceMesh.renderOrder = this.skirtMesh.renderOrder = 1;
        this.markerMesh.userData.noShaders = true;
        this.markerMesh.userData.noSight = true;
        this.markerMesh.raycast = () => {};
        this.group.add(this.surfaceMesh, this.skirtMesh, this.markerMesh);
        surface.computeBoundsTree?.();
    }

    surfaceIndex() {
        const { nx, ny } = this;
        const { w, h } = this.data;
        const holes = (this.data.stamps ?? []).flatMap((s) => s.holes ?? []);
        this.holeKey = JSON.stringify(holes);
        const index = [];
        for (let j = 0; j < ny - 1; j++) {
            for (let i = 0; i < nx - 1; i++) {
                const x = ((i + 0.5) / (nx - 1)) * w, y = ((j + 0.5) / (ny - 1)) * h;
                if (holes.some((p) => pointInPoly(x, y, p))) continue;
                const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                index.push(a, c, b, b, c, d);
            }
        }
        return index;
    }

    refreshHoles() {
        const geometry = this.surfaceMesh?.geometry;
        if (!geometry || JSON.stringify((this.data.stamps ?? []).flatMap((s) => s.holes ?? [])) === this.holeKey) return;
        geometry.setIndex(this.surfaceIndex());
        geometry.boundsTree = null;
        geometry.computeBoundsTree?.();
    }

    refreshHeights() {
        const heights = this.computeHeights();
        this.cover?.update(heights);
        const s = this.scale;
        const geometry = this.surfaceMesh.geometry;
        const pos = geometry.getAttribute("position");
        for (let k = 0; k < heights.length; k++) pos.array[k * 3 + 1] = heights[k] * s;
        pos.needsUpdate = true;
        this.updateNormals(geometry, pos.array);
        geometry.computeBoundingBox();
        geometry.boundsTree?.refit();
        const skirt = this.skirtMesh?.geometry.getAttribute("position");
        if (skirt) {
            skirt.array.set(this.skirtPositions(pos.array));
            skirt.needsUpdate = true;
            this.skirtMesh.geometry.computeBoundingBox();
            this.skirtMesh.geometry.computeBoundingSphere();
        }
    }

    skirtPositions(positions) {
        const { nx, ny } = this;
        const border = [];
        for (let i = 0; i < nx; i++) border.push(i);
        for (let j = 1; j < ny; j++) border.push(j * nx + nx - 1);
        for (let i = nx - 2; i >= 0; i--) border.push((ny - 1) * nx + i);
        for (let j = ny - 2; j > 0; j--) border.push(j * nx);
        border.push(0);
        const out = [];
        const bottom = this.data.min * this.scale;
        for (let k = 0; k < border.length - 1; k++) {
            const a = border[k], b = border[k + 1];
            const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
            const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
            out.push(ax, ay, az, ax, bottom, az, bx, by, bz, bx, by, bz, ax, bottom, az, bx, bottom, bz);
        }
        return out;
    }

    updateNormals(geometry, positions) {
        const { nx, ny } = this;
        const dx = (this.data.w * this.scale) / (nx - 1);
        const dz = (this.data.h * this.scale) / (ny - 1);
        let attr = geometry.getAttribute("normal");
        if (!attr) geometry.setAttribute("normal", (attr = new THREE.BufferAttribute(new Float32Array(nx * ny * 3), 3)));
        const out = attr.array;
        for (let j = 0; j < ny; j++) {
            const j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1);
            for (let i = 0; i < nx; i++) {
                const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1);
                const gx = (positions[(j * nx + i1) * 3 + 1] - positions[(j * nx + i0) * 3 + 1]) / ((i1 - i0) * dx);
                const gz = (positions[(j1 * nx + i) * 3 + 1] - positions[(j0 * nx + i) * 3 + 1]) / ((j1 - j0) * dz);
                const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
                const k = (j * nx + i) * 3;
                out[k] = -gx * inv;
                out[k + 1] = inv;
                out[k + 2] = -gz * inv;
            }
        }
        attr.needsUpdate = true;
    }

    refreshSplat() {
        this.composeSplat();
        if (!this.weightTexture) return;
        this.weightTexture.image.data = packWeights(this.splat, this.nx * this.ny, Math.max(0, this.layers.length - 1));
        this.weightTexture.needsUpdate = true;
        this.cover?.invalidate();
    }

    heightAt(x, y, raw = false) {
        const { nx, ny } = this;
        const { w, h, min, max } = this.data;
        const fx = Math.max(0, Math.min(nx - 1, (x / w) * (nx - 1)));
        const fy = Math.max(0, Math.min(ny - 1, (y / h) * (ny - 1)));
        const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy));
        const tx = fx - i, ty = fy - j;
        const hts = raw ? this.raw : this.stamped;
        const v = (hts[j * nx + i] * (1 - tx) + hts[j * nx + i + 1] * tx) * (1 - ty) + (hts[(j + 1) * nx + i] * (1 - tx) + hts[(j + 1) * nx + i + 1] * tx) * ty;
        return min + v * (max - min);
    }

    async encodeChanges() {
        const { nx, ny, chunk } = this;
        const hq = Uint16Array.from(this.raw, (v) => Math.round(Math.max(0, Math.min(1, v)) * 65535));
        const hc = await encodeGridChanges(hq, this.hq, nx, ny, chunk, 16, this.flatQ);
        const sc = {};
        const n = nx * ny;
        for (let k = 1; k < this.layers.length; k++) {
            const id = this.layers[k].id;
            const weights = this.layerWeights(k);
            if (weights.every((v) => v === 0)) {
                if (this.data.sc?.[id]) sc[id] = null;
                continue;
            }
            const changes = await encodeGridChanges(weights, this.wq.subarray((k - 1) * n, k * n), nx, ny, chunk, 8, 0);
            if (!foundry.utils.isEmpty(changes)) sc[id] = changes;
        }
        this.hq = hq;
        this.wq = this.weights.slice();
        const { wl, wk } = await this.water.encode();
        return { hc, sc, wl, wk };
    }

    async createMaterial() {
        const layers = this.layers.length ? this.layers : [{ src: null, s: 200 }];
        const count = layers.length;
        const { array: colors, detail, textures } = await layerArrayTexture(layers);
        const slices = count - 1;
        const groups = Math.max(1, Math.ceil(slices / 4));
        this.weightTexture = new THREE.DataArrayTexture(packWeights(this.splat ?? this.weights, this.nx * this.ny, slices), this.nx, this.ny, groups);
        this.weightTexture.format = THREE.RGBAFormat;
        this.weightTexture.minFilter = this.weightTexture.magFilter = THREE.LinearFilter;
        this.weightTexture.needsUpdate = true;

        const slope = this.data.slope ?? { layer: -1, start: 0.55, end: 0.75 };
        const slopeIndex = typeof slope.layer === "number" ? (slope.layer < count ? slope.layer : -1) : this.layerIndex(slope.layer);
        const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
        const uniforms = {
            mmLayers: { value: colors },
            mmDetail: { value: detail },
            mmWeights: { value: this.weightTexture },
            mmScales: { value: layers.map((l) => factor / (l?.s || 200)) },
            mmTints: { value: layers.map((l) => new THREE.Color(l?.tint ?? "#ffffff")) },
            mmSlopeLayer: { value: slopeIndex },
            mmWalls: { value: layers.map((l) => (l?.wall ? 1 : 0)) },
            mmSlope: { value: new THREE.Vector2(slope.start ?? 0.55, slope.end ?? 0.75) },
        };
        material.userData.mmUniforms = uniforms;
        material.customProgramCacheKey = () => `mapMakerTerrainPbr${count}`;
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", "#include <common>\nvarying vec3 vMmPos;\nvarying vec3 vMmNormal;\nvarying vec2 vMmUv;")
                .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMmPos = position;\nvMmNormal = normal;\nvMmUv = uv;");
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    "#include <common>",
                    `#include <common>
                    #define MM_COUNT ${count}
                    #define MM_GROUPS ${groups}
                    varying vec3 vMmPos;
                    varying vec3 vMmNormal;
                    varying vec2 vMmUv;
                    uniform sampler2DArray mmLayers;
                    uniform sampler2DArray mmDetail;
                    uniform sampler2DArray mmWeights;
                    uniform float mmScales[MM_COUNT];
                    uniform vec3 mmTints[MM_COUNT];
                    uniform int mmSlopeLayer;
                    uniform float mmWalls[MM_COUNT];
                    uniform vec2 mmSlope;
                    float mmHash(vec2 p) {
                        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                    }
                    float mmNoise(vec2 p) {
                        vec2 i = floor(p);
                        vec2 f = fract(p);
                        f = f * f * (3.0 - 2.0 * f);
                        return mix(mix(mmHash(i), mmHash(i + vec2(1.0, 0.0)), f.x), mix(mmHash(i + vec2(0.0, 1.0)), mmHash(i + 1.0), f.x), f.y);
                    }
                    float mmBlend(float hA, float hB, float w) {
                        float ma = max(hA + 1.0 - w, hB + w) - 0.08;
                        float a = max(hA + 1.0 - w - ma, 0.0);
                        float b = max(hB + w - ma, 0.0);
                        return b / max(a + b, 1e-4);
                    }
                    vec4 mmGroupWeight(vec2 uv, vec2 tx, float g) {
                        vec4 soft = texture(mmWeights, vec3(uv + vec2(2.2, 1.0) * tx, g)) + texture(mmWeights, vec3(uv + vec2(-1.0, 2.2) * tx, g)) + texture(mmWeights, vec3(uv + vec2(-2.2, -1.0) * tx, g)) + texture(mmWeights, vec3(uv + vec2(1.0, -2.2) * tx, g));
                        return mix(texture(mmWeights, vec3(uv, g)), soft * 0.25, 0.65);
                    }
                    void mmLayer(int i, float raw, vec2 p, vec2 dx, vec2 dy, float fine, inout float acc, inout float wallW, inout int wallI, inout vec3 col, inout vec2 tn, inout float h, inout float r) {
                        if (i < MM_COUNT) {
                            acc += raw;
                            float w = raw / max(acc, 1e-4);
                            float edge = 1.0 - abs(w * 2.0 - 1.0);
                            float mid = mmNoise(p * 18.0 + float(i) * 3.71) * 0.65 + mmNoise(p * 41.0 + float(i) * 1.37) * 0.35;
                            w = clamp(w + ((mid - 0.5) * 1.2 + (fine - 0.5) * 0.4) * edge, 0.0, 1.0);
                            wallW = mix(wallW, mmWalls[i], w);
                            if (mmWalls[i] > 0.5 && w > 0.25) wallI = i;
                            if (w > 0.0 && mmWalls[i] < 0.5) {
                                float s = mmScales[i];
                                vec4 d = textureGrad(mmDetail, vec3(p * s, float(i)), dx * s, dy * s);
                                float t = mmBlend(h, d.b, w);
                                if (t > 0.0) {
                                    col = mix(col, textureGrad(mmLayers, vec3(p * s, float(i)), dx * s, dy * s).rgb * mmTints[i], t);
                                    tn = mix(tn, d.rg * 2.0 - 1.0, t);
                                    h = mix(h, d.b, t);
                                    r = mix(r, d.a, t);
                                }
                            }
                        }
                    }
                    #define MM_LAYER(I, RAW) mmLayer(I, RAW, mmP, mmDx, mmDy, mmFine, mmAcc, mmWallW, mmWallI, mmCol, mmTn, mmH, mmR)
                    #define MM_GROUP(G, W) MM_LAYER(G * 4 + 1, W.x); MM_LAYER(G * 4 + 2, W.y); MM_LAYER(G * 4 + 3, W.z); MM_LAYER(G * 4 + 4, W.w)`,
                )
                .replace(
                    "#include <map_fragment>",
                    `vec2 mmP = vMmPos.xz;
                    vec2 mmDx = dFdx(mmP);
                    vec2 mmDy = dFdy(mmP);
                    float mmMacro = mmNoise(mmP * 1.7) * 0.6 + mmNoise(mmP * 5.3 + 7.1) * 0.4;
                    float mmHue = mmNoise(mmP * 3.1 + 19.7);
                    float mmFine = mmNoise(mmP * 38.0) * 0.6 + mmNoise(mmP * 91.0 + 3.3) * 0.4;
                    float mmS0 = mmScales[0];
                    vec2 mmQ0 = mmP * mmS0;
                    vec2 mmQ1 = mmP * mmS0 * 0.43 + vec2(0.37, 0.71);
                    vec2 mmQ2 = mmP * mmS0 * 3.1 + vec2(0.13, 0.57);
                    vec3 mmCol = mix(textureGrad(mmLayers, vec3(mmQ0, 0.0), mmDx * mmS0, mmDy * mmS0).rgb, textureGrad(mmLayers, vec3(mmQ1, 0.0), mmDx * mmS0 * 0.43, mmDy * mmS0 * 0.43).rgb, smoothstep(0.3, 0.7, mmMacro) * 0.55);
                    float mmDetailLum = dot(textureGrad(mmLayers, vec3(mmQ2, 0.0), mmDx * mmS0 * 3.1, mmDy * mmS0 * 3.1).rgb, vec3(0.2126, 0.7152, 0.0722));
                    float mmBaseLum = max(dot(mmCol, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
                    mmCol *= mix(1.0, clamp(mmDetailLum / mmBaseLum, 0.4, 1.8), 0.45);
                    mmCol *= mix(vec3(0.84, 0.96, 0.92), vec3(1.06, 1.06, 0.86), smoothstep(0.25, 0.75, mmHue));
                    mmCol *= mmTints[0];
                    vec4 mmD = textureGrad(mmDetail, vec3(mmQ0, 0.0), mmDx * mmS0, mmDy * mmS0);
                    vec2 mmTn = mmD.rg * 2.0 - 1.0;
                    float mmH = mmD.b;
                    float mmR = mmD.a;
                    vec2 mmSz = vec2(textureSize(mmWeights, 0).xy);
                    vec2 mmWarp = vec2(mmNoise(mmP * 14.0 + 1.3), mmNoise(mmP * 14.0 + 8.9)) - 0.5;
                    vec2 mmUv = (vMmUv * (mmSz - 1.0) + 0.5 + mmWarp * 1.6) / mmSz;
                    vec4 mmWs[MM_GROUPS];
                    float mmAcc = 1.0;
                    float mmWallW = 0.0;
                    int mmWallI = -1;
                    vec2 mmTx = 1.0 / mmSz;
                    #if MM_GROUPS > 1
                    for (int g = 0; g < MM_GROUPS; g++) {
                        mmWs[g] = mmGroupWeight(mmUv, mmTx, float(g));
                        mmAcc -= dot(mmWs[g], vec4(1.0));
                    }
                    #else
                    mmWs[0] = mmGroupWeight(mmUv, mmTx, 0.0);
                    mmAcc -= dot(mmWs[0], vec4(1.0));
                    #endif
                    mmAcc = max(mmAcc, 0.0);
                    #if MM_GROUPS > 1
                    for (int g = 0; g < MM_GROUPS; g++) {
                        vec4 mmW4 = mmWs[g];
                        MM_GROUP(g, mmW4);
                    }
                    #else
                    MM_GROUP(0, mmWs[0]);
                    #endif
                    vec3 mmGeo = normalize(vMmNormal);
                    vec3 mmObjN = normalize(mmGeo + vec3(mmTn.x, 0.0, -mmTn.y));
                    int mmSL = mmWallW > 0.25 && mmWallI >= 0 ? mmWallI : mmSlopeLayer;
                    if (mmSL >= 0) {
                        float mmSteep = 1.0 - clamp(mmGeo.y, 0.0, 1.0);
                        float mmT = smoothstep(mmSlope.x, mmSlope.y, mmSteep * 2.0 + (mmMacro - 0.5) * 0.35 + (mmFine - 0.5) * 0.25);
                        vec2 mmGx = dFdx(vMmPos.zy), mmGy = dFdy(vMmPos.zy);
                        vec2 mmZx = dFdx(vMmPos.xy), mmZy = dFdy(vMmPos.xy);
                        if (mmT > 0.0) {
                            float s = mmScales[mmSL];
                            float li = float(mmSL);
                            vec3 mmB = pow(abs(mmGeo), vec3(4.0));
                            mmB /= (mmB.x + mmB.y + mmB.z);
                            vec4 dX = textureGrad(mmDetail, vec3(vMmPos.zy * s, li), mmGx * s, mmGy * s);
                            vec4 dY = textureGrad(mmDetail, vec3(mmP * s, li), mmDx * s, mmDy * s);
                            vec4 dZ = textureGrad(mmDetail, vec3(vMmPos.xy * s, li), mmZx * s, mmZy * s);
                            float rockH = dX.b * mmB.x + dY.b * mmB.y + dZ.b * mmB.z;
                            float t = mmBlend(mmH, rockH, mmT);
                            if (t > 0.0) {
                                vec3 rock = textureGrad(mmLayers, vec3(vMmPos.zy * s, li), mmGx * s, mmGy * s).rgb * mmB.x + textureGrad(mmLayers, vec3(mmP * s, li), mmDx * s, mmDy * s).rgb * mmB.y + textureGrad(mmLayers, vec3(vMmPos.xy * s, li), mmZx * s, mmZy * s).rgb * mmB.z;
                                vec3 rockN = vec3(0.0, 1.0 - dX.g * 2.0, dX.r * 2.0 - 1.0) * mmB.x + vec3(dY.r * 2.0 - 1.0, 0.0, 1.0 - dY.g * 2.0) * mmB.y + vec3(dZ.r * 2.0 - 1.0, 1.0 - dZ.g * 2.0, 0.0) * mmB.z;
                                vec3 rockFacet = normalize(mmGeo + rockN * 1.4);
                                float moss = smoothstep(0.5, 0.82, rockFacet.y + (mmFine - 0.5) * 0.35 + (mmMacro - 0.5) * 0.2);
                                rock = mix(rock * mmTints[mmSL], mmCol * 0.78, moss);
                                mmCol = mix(mmCol, rock, t);
                                mmObjN = normalize(mix(mmObjN, normalize(mmGeo + rockN * (1.0 - moss * 0.6)), t));
                                mmH = mix(mmH, rockH, t);
                                mmR = mix(mmR, dX.a * mmB.x + dY.a * mmB.y + dZ.a * mmB.z, t);
                            }
                        }
                    }
                    mmCol *= mix(0.84, 1.1, mmMacro) * mix(1.0, mmH, 0.55);
                    diffuseColor.rgb *= mmCol;`,
                )
                .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.82, 1.0, mmR);")
                .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(mmObjN, 0.0)).xyz);");
        };
        const skirtMap = textures[slopeIndex >= 0 ? slopeIndex : 0] ?? null;
        if (skirtMap) {
            skirtMap.wrapS = skirtMap.wrapT = THREE.RepeatWrapping;
            skirtMap.colorSpace = THREE.SRGBColorSpace;
        }
        const skirtMaterial = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, map: skirtMap, color: 0xbbbbbb, side: THREE.DoubleSide });
        this.surfaceMesh.material = material;
        this.skirtMesh.material = skirtMaterial;
        this.material = material;
        this._coverArgs = { colors, detail, slopeIndex, slope: uniforms.mmSlope.value, factor };
        this.rebuildCover();
        game.Levels3DPreview.lightWarmup?.warmObject(this.surfaceMesh.parent);
        this.disposeMaterials = () => {
            this.cover?.dispose();
            this.weightTexture.dispose();
            material.dispose();
            skirtMaterial.dispose();
        };
        this.surfaceMesh.dispose = () => {
            this.disposeMaterials();
            this.water.dispose();
        };
    }

    rebuildCover() {
        this.cover?.dispose();
        this.cover = this._coverArgs ? new GroundCover(this, this._coverArgs) : null;
    }
}
