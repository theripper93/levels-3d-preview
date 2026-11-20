import * as THREE from "three";
import { factor } from "../main.js";
import { collectSurfaces, renderTopDown, topDownCamera } from "../helpers/topDownRender.js";
import { pointInPoly } from "../helpers/mapMakerTerrain.js";
import { terrainWaterMeshes } from "../helpers/terrainWater.js";

const PER_CELL = 4;
const MAX_RES = 1024;
const RANGE_CELLS = 400;
const LARGE_CELLS = 12;
const MIN_OBSTACLE_HEIGHT = 0.25;
const PATH_WEIGHT = 30;

export function gridUnit() {
    return (canvas.scene?.grid.size ?? 100) / factor;
}

function isWater(tile) {
    return !!tile?.shaders?.realisticWater?.enabled;
}

function isDecal(tile) {
    return tile.dynaMesh === "decal" || tile.tile?.document?.flags?.["levels-3d-preview"]?.dynaMesh === "decal";
}

function isTerrain(tile) {
    return tile.isTerrain || tile.isPlane || tile.dynaMesh === "mapGen" || tile.noiseType !== "none" || (tile.dynaMesh === "mapMaker" && tile.mapMakerMesh?.k === "terrain");
}

export function isObstacle(tile) {
    if (isWater(tile) || isTerrain(tile) || isDecal(tile)) return false;
    if (tile.dynaMesh === "mapMaker") return true;
    const box = new THREE.Box3().setFromObject(tile.mesh);
    if (box.isEmpty()) return false;
    const size = box.getSize(new THREE.Vector3());
    const gs = gridUnit();
    return size.y > gs * MIN_OBSTACLE_HEIGHT && Math.max(size.x, size.z) < LARGE_CELLS * gs;
}

function terrainPaths() {
    const out = [];
    for (const tile of Object.values(game.Levels3DPreview.tiles)) {
        if (tile?.mapMakerMesh?.k !== "terrain" || !tile.mesh) continue;
        let state = null;
        tile.mesh.traverse((c) => (state ??= c.mapMakerTerrain ?? null));
        if (!state) continue;
        const paths = state.layers.map((l, k) => (k > 0 && l.path ? state.layerWeights(k) : null)).filter(Boolean);
        out.push({ state, o: state.data.o ?? [0, 0], paths, stamps: (state.data.stamps ?? []).flatMap((s) => s.polys) });
    }
    return out;
}

function decodeBuffer(buffer, n) {
    const y = new Float32Array(n);
    const hit = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        hit[i] = buffer[i * 4 + 1] > 0.5 ? 1 : 0;
        y[i] = hit[i] ? buffer[i * 4] : -Infinity;
    }
    return { y, hit };
}

export function sampleSurface(rect, { top = Infinity } = {}) {
    const gs = gridUnit();
    const x0 = rect.x / factor;
    const z0 = rect.y / factor;
    const w = Math.max(rect.width / factor, gs * 0.05);
    const h = Math.max(rect.height / factor, gs * 0.05);
    const scale = Math.min(1, MAX_RES / Math.max((w / gs) * PER_CELL, (h / gs) * PER_CELL));
    const rw = Math.max(8, Math.ceil((w / gs) * PER_CELL * scale));
    const rh = Math.max(8, Math.ceil((h / gs) * PER_CELL * scale));
    const surfaces = collectSurfaces((tile) => !isWater(tile) && !isDecal(tile) && !tile.mapMakerMesh?.noSurface);
    const box = new THREE.Box3();
    surfaces.forEach((m) => box.expandByObject(m));
    const ceiling = Math.min(Number.isFinite(top) ? top : Infinity, (box.isEmpty() ? 0 : box.max.y) + gs);
    const far = RANGE_CELLS * gs + Math.max(0, ceiling - (box.isEmpty() ? 0 : box.min.y));
    const cam = topDownCamera(x0 + w / 2, z0 + h / 2, w, h, ceiling, far);
    const tiles = Object.values(game.Levels3DPreview.tiles).filter((t) => t?.mesh && !t.scatterData);
    const obstacles = new Set(tiles.filter((t) => isObstacle(t)).map((t) => t.mesh));
    const waters = new Set([...tiles.filter((t) => isWater(t)).map((t) => t.mesh), ...[...terrainWaterMeshes].filter((m) => m.parent)]);
    const n = rw * rh;
    const [ground] = renderTopDown(surfaces, rw, rh, [cam]);
    const surface = decodeBuffer(ground, n);
    const blocked = obstacles.size ? decodeBuffer(renderTopDown(obstacles, rw, rh, [cam])[0], n) : null;
    const water = waters.size ? decodeBuffer(renderTopDown(waters, rw, rh, [topDownCamera(x0 + w / 2, z0 + h / 2, w, h, ceiling + far / 2, far)])[0], n) : null;
    const obstacle = new Uint8Array(n);
    if (blocked) {
        const eps = gs * 0.05;
        const raw = new Uint8Array(n);
        for (let i = 0; i < n; i++) raw[i] = blocked.hit[i] && blocked.y[i] >= surface.y[i] - eps ? 1 : 0;
        const r = Math.max(1, Math.round(PER_CELL * scale * 0.25));
        for (let j = 0; j < rh; j++) {
            for (let i = 0; i < rw; i++) {
                if (!raw[j * rw + i]) continue;
                for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
                    const ii = i + di, jj = j + dj;
                    if (ii >= 0 && jj >= 0 && ii < rw && jj < rh) obstacle[jj * rw + ii] = 1;
                }
            }
        }
    }
    return new SurfaceSampler({ x0, z0, w, h, rw, rh, surface, obstacle, water, paths: terrainPaths() });
}

export class SurfaceSampler {
    constructor(data) {
        Object.assign(this, data);
    }

    index(x, z) {
        const i = Math.floor(((x - this.x0) / this.w) * this.rw);
        const j = Math.floor(((this.z0 + this.h - z) / this.h) * this.rh);
        if (i < 0 || j < 0 || i >= this.rw || j >= this.rh) return -1;
        return j * this.rw + i;
    }

    heightAt(x, z) {
        const k = this.index(x, z);
        return k < 0 ? -Infinity : this.surface.y[k];
    }

    normalAt(x, z) {
        const dx = this.w / this.rw;
        const dz = this.h / this.rh;
        const c = this.heightAt(x, z);
        const pick = (v) => (Number.isFinite(v) ? v : c);
        const gx = (pick(this.heightAt(x + dx, z)) - pick(this.heightAt(x - dx, z))) / (2 * dx);
        const gz = (pick(this.heightAt(x, z + dz)) - pick(this.heightAt(x, z - dz))) / (2 * dz);
        return new THREE.Vector3(-gx, 1, -gz).normalize();
    }

    onPath(px, py) {
        for (const { state, o, paths, stamps } of this.paths) {
            const lx = px - o[0];
            const ly = py - o[1];
            const { w, h } = state.data;
            if (lx < 0 || ly < 0 || lx > w || ly > h) continue;
            if (state.onRoad?.(lx, ly)) return true;
            const fx = (lx / w) * (state.nx - 1);
            const fy = (ly / h) * (state.ny - 1);
            const i = Math.min(Math.floor(fx), state.nx - 2);
            const j = Math.min(Math.floor(fy), state.ny - 2);
            const tx = fx - i;
            const ty = fy - j;
            const at = (weights) => {
                const k = j * state.nx + i;
                const top = weights[k] * (1 - tx) + weights[k + 1] * tx;
                const bottom = weights[k + state.nx] * (1 - tx) + weights[k + state.nx + 1] * tx;
                return top * (1 - ty) + bottom * ty;
            };
            if (paths.some((weights) => at(weights) > PATH_WEIGHT)) return true;
        }
        return false;
    }

    inStamp(px, py) {
        for (const { o, stamps } of this.paths) if (stamps.some((poly) => pointInPoly(px - o[0], py - o[1], poly))) return true;
        return false;
    }

    sample(px, py) {
        const x = px / factor;
        const z = py / factor;
        const k = this.index(x, z);
        if (k < 0 || !this.surface.hit[k]) return null;
        const y = this.surface.y[k];
        const waterY = this.water?.hit[k] ? this.water.y[k] : -Infinity;
        return {
            y,
            waterY,
            underwater: waterY > y + 0.0005,
            obstacle: !!this.obstacle[k] || this.inStamp(px, py),
            path: this.onPath(px, py),
            normal: this.normalAt(x, z),
        };
    }
}
