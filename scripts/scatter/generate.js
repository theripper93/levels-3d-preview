import * as THREE from "three";
import { factor } from "../main.js";

const MIN_NORMAL_Y = 0.6;
const FLOAT_LIFT = 0.03;

function hashInt(...values) {
    let h = 0x811c9dc5;
    for (const v of values) {
        h = Math.imul(h ^ (v | 0), 0x01000193);
        h ^= h >>> 15;
        h = Math.imul(h, 0x2c1b3c6d);
        h ^= h >>> 12;
    }
    return h >>> 0;
}

function rng(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function clumpNoise(seed, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const h = (a, b) => hashInt(seed, a, b) / 4294967296;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function clumpFactor(asset, seed, i, j, cellsPerGrid) {
    const k = asset.clumpK ?? (asset.blocking ? 0.5 : 0.8);
    if (!k) return 1;
    const period = (asset.clump ?? (asset.blocking ? 6 : 3)) * cellsPerGrid;
    const t = Math.max(0, Math.min(1, (clumpNoise(hashInt(seed, asset.index, 7919), i / period, j / period) - 0.35) / 0.3));
    return 1 + (2 * t * t * (3 - 2 * t) - 1) * k;
}

function separation(a, b) {
    if (a === b) return a.spacing;
    if (a.blocking && b.blocking) return (a.spacing + b.spacing) / 2;
    return Math.min(a.spacing, b.spacing) / 2;
}

class SpatialHash {
    constructor(size) {
        this.size = size;
        this.cells = new Map();
    }

    key(x, y) {
        return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
    }

    add(item) {
        const key = this.key(item.x, item.z);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(item);
    }

    blocked(asset, x, y, gridPx) {
        const ci = Math.floor(x / this.size);
        const cj = Math.floor(y / this.size);
        for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
                for (const other of this.cells.get(`${ci + di},${cj + dj}`) ?? []) {
                    const min = separation(asset, other.asset) * gridPx;
                    if ((other.x - x) ** 2 + (other.z - y) ** 2 < min * min) return true;
                }
            }
        }
        return false;
    }
}

export function generateInstances({ data, set, density, nx, ny, width, height, gridPx, qualityDensity = 1, sample, fallbackY = 0 }) {
    const cell = data.cell;
    const assets = set.assets.map((a, index) => ({ ...a, index, spacing: Math.max(0.05, a.spacing ?? 1), weight: a.weight ?? 0.5 }));
    const order = [...assets].sort((a, b) => (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0) || b.spacing - a.spacing || a.index - b.index);
    const maxSep = Math.max(...assets.map((a) => a.spacing)) * gridPx;
    const hash = new SpatialHash(Math.max(maxSep, cell));
    const avoid = { buildings: true, paths: true, water: true, ...(data.avoid ?? {}) };
    const out = [];
    const cellArea = (cell / gridPx) ** 2;
    for (const asset of order) {
        const perCell = (asset.weight * cellArea * (data.density ?? 1) * (asset.blocking ? 1 : qualityDensity)) / asset.spacing ** 2;
        const [smin, smax] = Array.isArray(asset.scale) ? asset.scale : [asset.scale ?? 1, asset.scale ?? 1];
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const d = density[j * nx + i];
                if (!d) continue;
                const random = rng(hashInt(data.seed, asset.index, i, j));
                const expected = ((perCell * d) / 255) * clumpFactor(asset, data.seed, i, j, gridPx / cell);
                const count = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
                for (let k = 0; k < count; k++) {
                    const x = (i + random()) * cell;
                    const y = (j + random()) * cell;
                    const yaw = random() * Math.PI * 2;
                    const scale = (smin + (smax - smin) * random() ** (asset.scaleBias ?? 1)) * (data.scale ?? 1);
                    if (x > width || y > height) continue;
                    if (hash.blocked(asset, x, y, gridPx)) continue;
                    const s = sample(x, y);
                    if (!s || (!asset.float && s.normal.y < MIN_NORMAL_Y)) continue;
                    if (avoid.buildings && s.obstacle) continue;
                    if (avoid.paths && s.path) continue;
                    if (asset.float ? !s.underwater : !asset.aquatic && avoid.water && s.underwater) continue;
                    const item = { asset, x, z: y, y: asset.float ? s.waterY + (FLOAT_LIFT * gridPx) / factor : s.y, yaw, scale, normal: s.normal, cell: j * nx + i };
                    hash.add(item);
                    out.push(item);
                }
            }
        }
    }
    for (const it of data.items ?? []) {
        const asset = assets[it.a];
        if (!asset) continue;
        const s = sample(it.x, it.y);
        const i = Math.min(nx - 1, Math.max(0, Math.floor(it.x / cell)));
        const j = Math.min(ny - 1, Math.max(0, Math.floor(it.y / cell)));
        out.push({ asset, x: it.x, z: it.y, y: (s?.y ?? fallbackY) + ((it.h ?? 0) * gridPx) / 2 / factor, yaw: it.r ?? 0, scale: it.s ?? 1, normal: new THREE.Vector3(0, 1, 0), cell: j * nx + i, explicit: true });
    }
    return out;
}
