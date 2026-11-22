import { buildRoadMask, linkRoads } from "./terrainRoads.js";

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

export function applyCave(out, m, nx) {
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

export function buildStampMasks(data, nx, ny, layers = []) {
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
