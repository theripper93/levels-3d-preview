import * as THREE from "three";
import { decodeGrid, encodeGridChanges, patchGrid } from "./chunkCodec.js";
import { refreshWaterBeds } from "../shaders/water/bedDepth.js";

export const WATER_TYPES = ["water", "ocean", "river", "swamp", "acid", "lava", "magicalFire", "sewage"];

export function waterDims(data) {
    if (data.wn) return data.wn;
    const cell = canvas.scene?.grid.type ? canvas.scene.grid.size : 100;
    return [Math.max(1, Math.round(data.w / cell)), Math.max(1, Math.round(data.h / cell))];
}

const point = new THREE.Vector3();
export const terrainWaterMeshes = new Set();

export class TerrainWater {
    constructor(state) {
        this.state = state;
        [this.wx, this.wy] = waterDims(state.data);
        const n = this.wx * this.wy;
        this.level = new Float32Array(n);
        this.type = new Uint8Array(n);
        this.lq = new Uint16Array(n);
        this.tq = new Uint8Array(n);
        this.vType = this.type;
        this.vLevel = this.level;
        this.entries = new Map();
        this.reach = 0;
        this.disposed = false;
    }

    get chunk() {
        return this.state.chunk;
    }

    get cellW() {
        return this.state.data.w / this.wx;
    }

    get cellH() {
        return this.state.data.h / this.wy;
    }

    async load(data) {
        const { wx, wy, chunk } = this;
        await Promise.all([decodeGrid(data.wl, this.lq, wx, wy, chunk, 16), decodeGrid(data.wk, this.tq, wx, wy, chunk, 8)]);
        for (let k = 0; k < this.lq.length; k++) this.level[k] = this.lq[k] / 65535;
        this.type.set(this.tq);
    }

    async patch(seen, data) {
        const { wx, wy, chunk } = this;
        let changed = false;
        const copy = (i0, j0, cw, ch) => {
            changed = true;
            for (let j = j0; j < j0 + ch; j++) {
                for (let k = j * wx + i0; k < j * wx + i0 + cw; k++) {
                    this.level[k] = this.lq[k] / 65535;
                    this.type[k] = this.tq[k];
                }
            }
        };
        await Promise.all([patchGrid(seen.wl, data.wl, this.lq, wx, wy, chunk, 16, 0, copy), patchGrid(seen.wk, data.wk, this.tq, wx, wy, chunk, 8, 0, copy)]);
        return changed;
    }

    async encode() {
        const { wx, wy, chunk } = this;
        const lq = Uint16Array.from(this.level, (v, k) => (this.type[k] ? Math.round(Math.max(0, Math.min(1, v)) * 65535) : 0));
        const [wl, wk] = await Promise.all([encodeGridChanges(lq, this.lq, wx, wy, chunk, 16, 0), encodeGridChanges(this.type, this.tq, wx, wy, chunk, 8, 0)]);
        this.lq = lq;
        this.tq = this.type.slice();
        return { wl, wk };
    }

    toPx(v) {
        const { min, max } = this.state.data;
        return min + v * (max - min);
    }

    fromPx(px) {
        const { min, max } = this.state.data;
        return (px - min) / (max - min);
    }

    cellAt(x, y) {
        const i = Math.floor(x / this.cellW);
        const j = Math.floor(y / this.cellH);
        if (i < 0 || j < 0 || i >= this.wx || j >= this.wy) return -1;
        return j * this.wx + i;
    }

    groundMin(k) {
        const state = this.state;
        const i = k % this.wx, j = (k / this.wx) | 0;
        const { nx, ny } = state;
        const { w, h } = state.data;
        const i0 = Math.floor(((i * this.cellW) / w) * (nx - 1)), i1 = Math.ceil((((i + 1) * this.cellW) / w) * (nx - 1));
        const j0 = Math.floor(((j * this.cellH) / h) * (ny - 1)), j1 = Math.ceil((((j + 1) * this.cellH) / h) * (ny - 1));
        const hts = state.stamped;
        let m = Infinity;
        for (let jj = Math.max(0, j0); jj <= Math.min(ny - 1, j1); jj++) for (let ii = Math.max(0, i0); ii <= Math.min(nx - 1, i1); ii++) m = Math.min(m, hts[jj * nx + ii]);
        return m;
    }

    surfaceAt(x, y) {
        const k = this.cellAt(x, y);
        if (k < 0 || !this.vType[k]) return null;
        const entry = this.entries.get(this.vType[k]);
        return entry ? this.cornerHeight(entry.corners, x, y) : this.toPx(this.vLevel[k]);
    }

    typeAt(x, y) {
        const k = this.cellAt(x, y);
        return k < 0 ? null : WATER_TYPES[this.vType[k] - 1] ?? null;
    }

    cornersFor(t) {
        const { wx, wy } = this;
        const corners = new Float32Array((wx + 1) * (wy + 1));
        for (let cj = 0; cj <= wy; cj++) {
            for (let ci = 0; ci <= wx; ci++) {
                let sum = 0, n = 0;
                for (let j = cj - 1; j <= cj; j++) {
                    for (let i = ci - 1; i <= ci; i++) {
                        if (i < 0 || j < 0 || i >= wx || j >= wy) continue;
                        const k = j * wx + i;
                        if (this.vType[k] !== t) continue;
                        sum += this.vLevel[k];
                        n++;
                    }
                }
                corners[cj * (wx + 1) + ci] = n ? this.toPx(sum / n) : NaN;
            }
        }
        return corners;
    }

    cornerHeight(corners, x, y) {
        const fx = Math.max(0, Math.min(this.wx, x / this.cellW));
        const fy = Math.max(0, Math.min(this.wy, y / this.cellH));
        const i = Math.min(this.wx - 1, Math.floor(fx)), j = Math.min(this.wy - 1, Math.floor(fy));
        const tx = fx - i, ty = fy - j;
        const row = this.wx + 1;
        const a = corners[j * row + i], b = corners[j * row + i + 1], c = corners[(j + 1) * row + i], d = corners[(j + 1) * row + i + 1];
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }

    innerGeometry(t, corners) {
        const { wx, wy, cellW, cellH } = this;
        const s = this.state.scale;
        const row = wx + 1;
        const positions = [];
        const map = new Map();
        const index = [];
        const vert = (ci, cj) => {
            const key = cj * row + ci;
            if (!map.has(key)) {
                map.set(key, positions.length / 3);
                positions.push(ci * cellW * s, corners[key] * s, cj * cellH * s);
            }
            return map.get(key);
        };
        for (let j = 0; j < wy; j++) {
            for (let i = 0; i < wx; i++) {
                if (this.vType[j * wx + i] !== t) continue;
                const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
                index.push(a, c, b, b, c, d);
            }
        }
        return finishGeometry(positions, index);
    }

    ringGeometry(t, corners) {
        const { wx, wy, cellW, cellH } = this;
        const { w, h } = this.state.data;
        const s = this.state.scale;
        const R = this.reach;
        const row = wx + 1;
        const positions = [];
        const index = [];
        const quad = (x0, z0, x1, z1, h00, h10, h01, h11) => {
            const b = positions.length / 3;
            positions.push(x0 * s, h00 * s, z0 * s, x1 * s, h10 * s, z0 * s, x0 * s, h01 * s, z1 * s, x1 * s, h11 * s, z1 * s);
            index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        };
        const at = (ci, cj) => corners[cj * row + ci];
        for (let i = 0; i < wx; i++) {
            if (this.type[i] === t) quad(i * cellW, -R, (i + 1) * cellW, 0, at(i, 0), at(i + 1, 0), at(i, 0), at(i + 1, 0));
            if (this.type[(wy - 1) * wx + i] === t) quad(i * cellW, h, (i + 1) * cellW, h + R, at(i, wy), at(i + 1, wy), at(i, wy), at(i + 1, wy));
        }
        for (let j = 0; j < wy; j++) {
            if (this.type[j * wx] === t) quad(-R, j * cellH, 0, (j + 1) * cellH, at(0, j), at(0, j), at(0, j + 1), at(0, j + 1));
            if (this.type[j * wx + wx - 1] === t) quad(w, j * cellH, w + R, (j + 1) * cellH, at(wx, j), at(wx, j), at(wx, j + 1), at(wx, j + 1));
        }
        const corner = (k, ci, cj, x0, z0) => this.type[k] === t && quad(x0, z0, x0 + R, z0 + R, at(ci, cj), at(ci, cj), at(ci, cj), at(ci, cj));
        corner(0, 0, 0, -R, -R);
        corner(wx - 1, wx, 0, w, -R);
        corner((wy - 1) * wx, 0, wy, -R, h);
        corner(wy * wx - 1, wx, wy, w, h);
        return index.length ? finishGeometry(positions, index) : null;
    }

    ringSurface(corners, t, x, y) {
        const { w, h } = this.state.data;
        if (x >= 0 && y >= 0 && x <= w && y <= h) return null;
        const cx = Math.max(0, Math.min(w - 1e-3, x));
        const cy = Math.max(0, Math.min(h - 1e-3, y));
        if (this.type[this.cellAt(cx, cy)] !== t) return null;
        return this.cornerHeight(corners, cx, cy);
    }

    setReach(reach) {
        reach = reach || 0;
        if (reach === this.reach) return;
        this.reach = reach;
        this.build();
    }

    build() {
        if (this.disposed) return;
        this.applyPools();
        const present = new Set(this.vType);
        present.delete(0);
        for (const key of [...this.entries.keys()]) if (!present.has(key)) this.remove(key);
        for (const t of present) {
            if (!WATER_TYPES[t - 1]) continue;
            const corners = this.cornersFor(t);
            const fresh = !this.entries.has(t);
            const entry = this.entries.get(t) ?? this.createEntry(t);
            entry.corners = corners;
            this.setGeometry(entry.inner, this.innerGeometry(t, corners));
            if (fresh) game.Levels3DPreview.lightWarmup?.warmObject(entry.inner.mesh);
            const ring = this.reach > 0 ? this.ringGeometry(t, corners) : null;
            if (ring) {
                entry.ring ??= this.createPart(t, true, entry);
                this.setGeometry(entry.ring, ring);
            } else if (entry.ring) {
                this.disposePart(entry.ring);
                entry.ring = null;
            }
        }
        refreshWaterBeds();
    }

    applyPools() {
        const stamps = (this.state.data.stamps ?? []).filter((s) => s.pools?.length);
        if (!stamps.length) {
            this.vType = this.type;
            this.vLevel = this.level;
            return;
        }
        this.vType = this.type.slice();
        this.vLevel = this.level.slice();
        for (const stamp of stamps) {
            const t = WATER_TYPES.indexOf(stamp.liquid ?? "lava") + 1;
            const level = this.fromPx(stamp.level);
            for (let q = 0; q < stamp.pools.length; q += 2) {
                for (let n = 0; n < 9; n++) {
                    const k = this.cellAt(stamp.pools[q] + ((n % 3) - 1) * this.cellW, stamp.pools[q + 1] + (((n / 3) | 0) - 1) * this.cellH);
                    if (k < 0 || this.type[k]) continue;
                    this.vType[k] = t;
                    this.vLevel[k] = level;
                }
            }
        }
    }

    setGeometry(part, geometry) {
        part.mesh.geometry.dispose();
        part.mesh.geometry = geometry;
        const box = geometry.boundingBox;
        part.entity.bb = { width: box.max.x - box.min.x, height: box.max.z - box.min.z, depth: Math.max(box.max.y - box.min.y, 0.001) };
    }

    createEntry(t) {
        const entry = { corners: null, inner: null, ring: null };
        entry.inner = this.createPart(t, false, entry);
        this.entries.set(t, entry);
        return entry;
    }

    createPart(t, ring, entry) {
        const L = game.Levels3DPreview;
        const id = WATER_TYPES[t - 1];
        const preset = L.CONFIG.shaders.shaders.realisticWater?.presets?.[id] ?? {};
        const style = !(preset.crust > 0) && String(this.state.layers[0]?.src ?? "").includes("_Stylized2") ? 1 : 0;
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0 }));
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = true;
        mesh.raycast = () => {};
        mesh.userData.noIntersect = true;
        mesh.userData.noSurface = true;
        const part = { mesh, destroyed: false };
        const water = this;
        part.entity = {
            id: `terrainWater${t}${ring ? "r" : ""}`,
            bb: { width: 1, height: 1, depth: 0.001 },
            mesh,
            shaders: { realisticWater: { enabled: true, preset: id, style, contained: false, ...preset } },
            get _destroyed() {
                return part.destroyed;
            },
            prepareBed: () => water.follow(mesh),
            waterSurfaceAt: (x, z) => water.worldSurface(entry.corners, t, ring, x, z),
        };
        mesh.onBeforeRender = () => this.follow(mesh);
        this.follow(mesh);
        L.shaderHandler.applyShader(mesh, part.entity, part.entity.shaders);
        L.scene.add(mesh);
        terrainWaterMeshes.add(mesh);
        return part;
    }

    follow(mesh) {
        const surface = this.state.surfaceMesh;
        if (!surface) return;
        surface.updateWorldMatrix(true, false);
        if (mesh.matrixWorld.equals(surface.matrixWorld)) return;
        mesh.matrix.copy(surface.matrixWorld);
        mesh.matrixWorld.copy(surface.matrixWorld);
    }

    worldSurface(corners, t, ring, x, z) {
        const surface = this.state.surfaceMesh;
        if (!surface || !corners) return null;
        const f = 1 / this.state.scale;
        surface.worldToLocal(point.set(x, 0, z));
        const lx = point.x * f, lz = point.z * f;
        let px;
        if (ring) px = this.ringSurface(corners, t, lx, lz);
        else {
            const k = this.cellAt(lx, lz);
            px = k >= 0 && this.vType[k] === t ? this.cornerHeight(corners, lx, lz) : null;
        }
        if (px === null || Number.isNaN(px)) return null;
        point.y = px * this.state.scale;
        return surface.localToWorld(point).y;
    }

    disposePart(part) {
        part.destroyed = true;
        terrainWaterMeshes.delete(part.mesh);
        part.mesh.removeFromParent();
        part.mesh.geometry.dispose();
        part.mesh.material.dispose();
        part.mesh.customDepthMaterial?.dispose();
    }

    remove(t) {
        const entry = this.entries.get(t);
        if (!entry) return;
        this.disposePart(entry.inner);
        if (entry.ring) this.disposePart(entry.ring);
        this.entries.delete(t);
    }

    dispose() {
        this.disposed = true;
        for (const t of [...this.entries.keys()]) this.remove(t);
    }
}

function finishGeometry(positions, index) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const normals = new Float32Array(positions.length);
    for (let k = 1; k < normals.length; k += 3) normals[k] = 1;
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
    geometry.setIndex(index);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}
