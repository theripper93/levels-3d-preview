import { fbm, smooth } from "./mapMakerTerrain.js";

export const ROAD_STYLES = {
    trail: { rank: 1, edge: 0.45, shoulder: 0, ruts: 0.05, camber: 0, raise: 0, stones: 0, grass: 0.3, pebble: 1.3, verge: 1.8, crisp: 0 },
    mud: { rank: 2, edge: 0.4, shoulder: 0.25, ruts: 0.08, camber: 0, raise: 0, stones: 0, grass: 0.15, pebble: 0.6, verge: 1.5, crisp: 0 },
    stone: { rank: 3, edge: 0.25, shoulder: 0.1, ruts: 0, camber: 0, raise: 0, stones: 1, grass: 0.45, pebble: 1, verge: 1.7, crisp: 0.2 },
    cobble: { rank: 4, edge: 0.15, shoulder: 0.2, ruts: 0, camber: 0.035, raise: 0, stones: 0, grass: 0.6, pebble: 0.4, verge: 2.2, crisp: 0.6 },
    paved: { rank: 5, edge: 0.05, shoulder: 0.15, ruts: 0, camber: 0.02, raise: 0.06, stones: 0, grass: 0.15, pebble: 0.2, verge: 1.6, crisp: 1 },
};

export function roadSpline(flat, spacing) {
    const points = [];
    for (let k = 0; k < flat.length - 1; k += 2) points.push({ x: flat[k], y: flat[k + 1] });
    if (points.length < 2) return points;
    const out = [];
    const p = [points[0], ...points, points[points.length - 1]];
    for (let s = 1; s < p.length - 2; s++) {
        const [p0, p1, p2, p3] = [p[s - 1], p[s], p[s + 1], p[s + 2]];
        const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / spacing));
        for (let k = 0; k < steps; k++) {
            const t = k / steps, t2 = t * t, t3 = t2 * t;
            out.push({
                x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            });
        }
    }
    out.push(points[points.length - 1]);
    return out;
}

const gauss = (v) => Math.exp(-v * v);
const PROFILE_WINDOW = 8;

export function buildRoadMask(road, data, nx, ny, layers) {
    if (!road?.pts || road.pts.length < 4) return null;
    const style = ROAD_STYLES[road.style] ?? ROAD_STYLES.trail;
    const { w, h } = data;
    const cell = road.cell || 100;
    const seed = road.seed ?? 1;
    const hw = Math.max(cell * 0.2, (road.w ?? cell * 2) / 2);
    const fall = Math.max(hw * 0.6, cell * 0.6);
    const outer = hw * (1 + style.shoulder);
    const reach = Math.max(hw + fall, outer + hw * 0.5) + cell * 0.3;
    const pts = roadSpline(road.pts, Math.max(4, cell / 4));
    if (pts.length < 2) return null;
    const gx = w / (nx - 1), gy = h / (ny - 1);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const p of pts) {
        bx0 = Math.min(bx0, p.x);
        bx1 = Math.max(bx1, p.x);
        by0 = Math.min(by0, p.y);
        by1 = Math.max(by1, p.y);
    }
    const i0 = Math.max(0, Math.floor((bx0 - reach) / gx));
    const i1 = Math.min(nx - 1, Math.ceil((bx1 + reach) / gx));
    const j0 = Math.max(0, Math.floor((by0 - reach) / gy));
    const j1 = Math.min(ny - 1, Math.ceil((by1 + reach) / gy));
    const cw = i1 - i0 + 1, ch = j1 - j0 + 1;
    if (cw <= 0 || ch <= 0) return null;
    const size = cw * ch;
    const D = new Float32Array(size).fill(Infinity);
    const S = new Float32Array(size);
    for (let a = 0; a < pts.length - 1; a++) {
        const x1 = pts[a].x, y1 = pts[a].y, dx = pts[a + 1].x - x1, dy = pts[a + 1].y - y1;
        const len = dx * dx + dy * dy || 1;
        const si0 = Math.max(i0, Math.floor((Math.min(x1, x1 + dx) - reach) / gx)), si1 = Math.min(i1, Math.ceil((Math.max(x1, x1 + dx) + reach) / gx));
        const sj0 = Math.max(j0, Math.floor((Math.min(y1, y1 + dy) - reach) / gy)), sj1 = Math.min(j1, Math.ceil((Math.max(y1, y1 + dy) + reach) / gy));
        for (let j = sj0; j <= sj1; j++) {
            for (let i = si0; i <= si1; i++) {
                const x = i * gx, y = j * gy;
                const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len));
                const d = Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
                const q = (j - j0) * cw + (i - i0);
                if (d < D[q]) {
                    D[q] = d;
                    S[q] = a + t;
                }
            }
        }
    }
    const index = (id) => (id ? layers.findIndex((l) => l.id === id) : -1);
    const m = {
        kind: "road",
        rank: style.rank,
        i0, j0, cw, ch, pts,
        inside: new Float32Array(size),
        cell,
        D, S,
        F: new Float32Array(size),
        O: new Float32Array(size),
        grass: new Float32Array(size).fill(1),
        pebble: new Float32Array(size).fill(1),
        size: new Float32Array(size).fill(1),
        occ: new Uint8Array(size),
        paints: [],
    };
    const shoulder = style.shoulder > 0 ? new Float32Array(size) : null;
    const surface = new Float32Array(size);
    const bed = new Float32Array(size);
    const soft = 1 - style.crisp;
    for (let q = 0; q < size; q++) {
        const d = D[q];
        if (!(d < reach)) continue;
        const x = (i0 + (q % cw)) * gx, y = (j0 + ((q / cw) | 0)) * gy;
        const wobble = (fbm(x / (cell * 0.9), y / (cell * 0.9), seed) - 0.5) * 2 * style.edge * hw;
        const de = d + wobble;
        const r = Math.min(1, d / hw);
        m.F[q] = 1 - smooth((d - hw) / fall);
        let offset = -style.camber * cell * r * r - style.ruts * cell * gauss((d - hw * 0.45) / (hw * 0.14 + gx * 0.5)) + style.raise * cell * (1 - smooth((d - hw) / (fall * 0.5)));
        const edge = hw * 0.45 * soft + gx * 1.5;
        let core = 1 - smooth((de - hw + edge) / edge);
        bed[q] = core;
        if (style.stones) {
            const stones = smooth((fbm(x / (cell * 0.42), y / (cell * 0.42), seed + 5) - 0.32) / 0.28) * (0.35 + 0.65 * smooth((fbm(x / (cell * 1.6), y / (cell * 1.6), seed + 9) - 0.3) / 0.3));
            core *= stones;
            offset += style.stones * cell * 0.025 * core;
        }
        m.O[q] = offset;
        surface[q] = core;
        if (shoulder) shoulder[q] = 1 - smooth((de - outer + hw * 0.2) / (hw * 0.45 + gx * 1.5));
        const inside = 1 - smooth((d - hw) / (hw * 0.3 + gx));
        m.inside[q] = inside;
        const band = gauss((d - hw * 1.1) / (hw * 0.35 + gx)) * (1 - inside * 0.6);
        m.grass[q] = (1 + (style.grass - 1) * inside) * (1 + 0.4 * band);
        m.pebble[q] = 1 + (style.pebble - 1) * inside + (style.verge - 1) * band;
        m.size[q] = 1 + 0.6 * band;
        m.occ[q] = d < hw + fall * 0.3 ? 1 : 0;
    }
    const shoulderIndex = index(road.layers?.shoulder);
    const surfaceIndex = index(road.layers?.surface);
    if (shoulder && shoulderIndex >= 0) {
        m.paints.push({ index: shoulderIndex, p: shoulder, shoulder: true });
        if (style.stones) m.paints.push({ index: shoulderIndex, p: bed });
    }
    if (surfaceIndex >= 0) m.paints.push({ index: surfaceIndex, p: surface });
    return m;
}

export function linkRoads(masks, nx, ny) {
    const ordered = masks.map((m, order) => ({ m, order })).sort((a, b) => b.m.rank - a.m.rank || b.order - a.order).map(({ m }) => m);
    const taken = new Float32Array(nx * ny);
    for (const m of ordered) {
        for (let q = 0; q < m.F.length; q++) {
            const k = (m.j0 + ((q / m.cw) | 0)) * nx + m.i0 + (q % m.cw);
            if (taken[k] > 0) m.F[q] *= 1 - taken[k];
        }
        for (let q = 0; q < m.F.length; q++) {
            const k = (m.j0 + ((q / m.cw) | 0)) * nx + m.i0 + (q % m.cw);
            if (m.inside[q] > taken[k]) taken[k] = m.inside[q];
        }
    }
    return ordered;
}

export function paintRoads(splat, ordered, nx, n, slices) {
    const painting = ordered.slice().reverse();
    for (const shoulders of [true, false]) {
        for (const m of painting) paintLayers(splat, m, m.paints.filter((p) => !!p.shoulder === shoulders), nx, n, slices);
    }
}

export function roadCover(ordered, nx, ny) {
    const n = nx * ny;
    const band = new Float32Array(n * 3).fill(1);
    const own = new Float32Array(n * 3).fill(1);
    const best = new Float32Array(n);
    for (const m of ordered) {
        for (let q = 0; q < m.D.length; q++) {
            if (m.D[q] === Infinity) continue;
            const k = (m.j0 + ((q / m.cw) | 0)) * nx + m.i0 + (q % m.cw);
            const values = [m.grass[q], m.pebble[q], m.size[q]];
            for (let c = 0; c < 3; c++) band[k * 3 + c] *= values[c];
            if (m.inside[q] > best[k]) {
                best[k] = m.inside[q];
                for (let c = 0; c < 3; c++) own[k * 3 + c] = values[c];
            }
        }
    }
    for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) band[k * 3 + c] += (own[k * 3 + c] - band[k * 3 + c]) * best[k];
    return band;
}

function sampleGrid(grid, fx, fy, nx, ny) {
    fx = Math.max(0, Math.min(nx - 1.001, fx));
    fy = Math.max(0, Math.min(ny - 1.001, fy));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * nx + i;
    return (grid[k] * (1 - tx) + grid[k + 1] * tx) * (1 - ty) + (grid[k + nx] * (1 - tx) + grid[k + nx + 1] * tx) * ty;
}

export function applyRoad(out, m, data, nx, ny) {
    const { w, h, min, max } = data;
    const range = max - min;
    const samples = m.pts.map((p) => sampleGrid(out, (p.x / w) * (nx - 1), (p.y / h) * (ny - 1), nx, ny));
    const win = PROFILE_WINDOW;
    const sum = new Float64Array(samples.length + 1);
    for (let k = 0; k < samples.length; k++) sum[k + 1] = sum[k] + samples[k];
    const profile = samples.map((_, k) => {
        const a = Math.max(0, k - win), b = Math.min(samples.length - 1, k + win);
        return (sum[b + 1] - sum[a]) / (b - a + 1);
    });
    const last = profile.length - 1;
    for (let q = 0; q < m.F.length; q++) {
        const f = m.F[q];
        if (!(f > 0)) continue;
        const s = Math.min(last, m.S[q]);
        const a = Math.floor(s), t = s - a;
        const base = profile[a] * (1 - t) + profile[Math.min(last, a + 1)] * t;
        const k = (m.j0 + ((q / m.cw) | 0)) * nx + m.i0 + (q % m.cw);
        out[k] += (base + m.O[q] / range - out[k]) * f;
    }
}

function paintLayers(splat, m, paints, nx, n, slices) {
    for (const { index, p } of paints) {
        const target = index - 1;
        for (let q = 0; q < p.length; q++) {
            const v = p[q];
            if (!(v > 0.002)) continue;
            const k = (m.j0 + ((q / m.cw) | 0)) * nx + m.i0 + (q % m.cw);
            for (let s = 0; s < slices; s++) {
                const at = s * n + k;
                splat[at] = s === target ? Math.round(splat[at] + (255 - splat[at]) * v) : Math.round(splat[at] * (1 - v));
            }
        }
    }
}
