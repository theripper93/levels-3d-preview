import * as THREE from "three";
import { factor } from "../main.js";
import { SCATTER_SETS, SCATTER_PROPS } from "./sets.js";

const MIN_NORMAL_Y = 0.6;
const FLOAT_LIFT = 0.03;
const REACH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const GROUND_COVER_SPACING = 0.5;
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
const HUG_RISE = 1;

export const isGroundCover = (asset) => !asset.blocking && (asset.spacing ?? 1) < GROUND_COVER_SPACING;

function hitsBlocker(blockers, x, y, radius) {
    return blockers.some((b) => {
        const dx = x - b.x;
        const dy = y - b.y;
        const u = dx * b.cos - dy * b.sin - b.cx;
        const v = dx * b.sin + dy * b.cos - b.cz;
        return Math.abs(u) < b.hx + radius && Math.abs(v) < b.hz + radius;
    });
}

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

    near(x, y, r) {
        const ci = Math.floor(x / this.size);
        const cj = Math.floor(y / this.size);
        for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
                if ((this.cells.get(`${ci + di},${cj + dj}`) ?? []).some((o) => o.asset.blocking && (o.x - x) ** 2 + (o.z - y) ** 2 < r * r)) return true;
            }
        }
        return false;
    }
}

function nearWall(sample, s, x, y, r, rise) {
    return AROUND.some(([dx, dy]) => {
        const o = sample(x + dx * r, y + dy * r);
        return !o || o.obstacle || o.y - s.y > rise;
    });
}

const setAssets = (set) => (set?.assets ?? []).map((a, index) => ({ ...a, index, spacing: Math.max(0.05, a.spacing ?? 1), weight: a.weight ?? 0.5 }));

export function resolveItemAsset(set, item) {
    if (!item.src) return set?.assets[item.a] ? { ...set.assets[item.a], index: item.a } : null;
    const src = decodeURI(item.src);
    const same = (a) => decodeURI(a.src) === src;
    const found = set?.assets.find(same) ?? Object.values(SCATTER_SETS).flatMap((s) => s.assets).find(same) ?? SCATTER_PROPS.find(same);
    return { align: 0, wind: 0, blocking: false, yOffset: 0, ...found, src: item.src, index: `src:${src}` };
}

export function explicitInstances({ items = [], set, nx, ny, cell, gridPx, sample, fallbackY = 0, flat = 0 }) {
    const out = [];
    items.forEach((it, item) => {
        const asset = resolveItemAsset(set, it);
        if (!asset) return;
        const s = sample(it.x, it.y);
        const ground = !s || (flat && Math.abs(s.y - fallbackY) > flat) ? fallbackY : s.y;
        const i = Math.min(nx - 1, Math.max(0, Math.floor(it.x / cell)));
        const j = Math.min(ny - 1, Math.max(0, Math.floor(it.y / cell)));
        out.push({ asset, x: it.x, z: it.y, y: ground + ((it.h ?? 0) * gridPx) / 2 / factor, yaw: it.r ?? 0, scale: it.s ?? 1, normal: new THREE.Vector3(0, 1, 0), cell: j * nx + i, explicit: true, item, rx: it.rx ?? 0, rz: it.rz ?? 0, tint: it.c ?? null, hue: it.hu ?? 0 });
    });
    return out;
}

export function generateInstances({ data, set, density, nx, ny, width, height, gridPx, qualityDensity = 1, sample, blockers = [], radii = [] }) {
    const cell = data.cell;
    const assets = setAssets(set);
    if (!assets.length) return [];
    const order = [...assets].sort((a, b) => (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0) || b.spacing - a.spacing || a.index - b.index);
    const maxSep = Math.max(...assets.map((a) => a.spacing)) * gridPx;
    const hash = new SpatialHash(Math.max(maxSep, cell));
    const avoid = { buildings: true, paths: true, water: true, ...(data.avoid ?? {}) };
    const out = [];
    const cellArea = (cell / gridPx) ** 2;
    for (const asset of order) {
        const cover = isGroundCover(asset);
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
                    if (!cover && hitsBlocker(blockers, x, y, radii[asset.index] ? radii[asset.index] * scale : (asset.spacing * gridPx) / 2)) continue;
                    const s = sample(x, y);
                    if (!s || (!asset.float && s.normal.y < MIN_NORMAL_Y)) continue;
                    const hug = (asset.hug ?? 0) * gridPx;
                    if (hug && !(hash.near(x, y, hug) || hitsBlocker(blockers, x, y, hug) || nearWall(sample, s, x, y, hug, (hug * HUG_RISE) / factor))) continue;
                    const reach = cover ? 0 : asset.spacing * 0.3 * scale * gridPx;
                    if (avoid.buildings && (s.obstacle || (reach && REACH.some(([dx, dy]) => sample(x + dx * reach, y + dy * reach)?.obstacle)))) continue;
                    if (avoid.paths && s.path) continue;
                    if (asset.float ? !s.underwater : !asset.aquatic && avoid.water && s.underwater) continue;
                    const item = { asset, x, z: y, y: asset.float ? s.waterY + (FLOAT_LIFT * gridPx) / factor : s.y, yaw, scale, normal: s.normal, cell: j * nx + i, id: `${asset.index}.${j * nx + i}.${k}` };
                    hash.add(item);
                    out.push(item);
                }
            }
        }
    }
    return out;
}
