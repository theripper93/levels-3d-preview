import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { factor } from "../main.js";
import { decodeGrid, encodeGridChanges, patchGrid } from "./chunkCodec.js";
import { GroundCover } from "./groundCover.js";
import { applyRoad, paintRoads } from "./terrainRoads.js";
import { applyCave, fbm, smooth, pointInPoly } from "./terrainMasks.js";
import { terrainJobs } from "./terrainWorkerClient.js";
import { TerrainWater, waterDims } from "./terrainWater.js";

export { fbm, smooth, pointInPoly };

const CHUNK = 64;
export const MAX_TERRAIN_LAYERS = 16;
export const SKIRT_CELLS = 3;
const LAYER_SIZE = 1024;
const layerArrayCache = new Map();

export function lowestGround(scene = canvas.scene) {
    let min = canvas.primary?.background?.elevation ?? 0;
    for (const tile of scene?.tiles ?? []) if (tile.flags?.["levels-3d-preview"]?.mapMakerMesh?.k === "terrain") min = Math.min(min, tile.elevation);
    return min;
}

export function flatLevel(data) {
    return ((data.base ?? 0) - data.min) / (data.max - data.min);
}

const STRUCTURE = ["w", "h", "nx", "ny", "min", "max", "chunk", "wn"];
const signature = (data, keys) => JSON.stringify(keys.map((k) => (k === "wn" && data ? waterDims(data) : data?.[k] ?? null)));
const stampKey = (data) => JSON.stringify([data?.stamps ?? [], data?.roads ?? []]);
const shapeKey = (data) => JSON.stringify([(data?.stamps ?? []).filter((s) => !s.cover), data?.roads ?? []]);

function applyFlatten(out, mask, nx, insideOnly = false) {
    const { i0, j0, cw, ch, target, weights } = mask;
    for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) {
            const wgt = weights[j * cw + i];
            if (wgt === 1 || (insideOnly && wgt !== 0)) continue;
            const idx = (j0 + j) * nx + i0 + i;
            out[idx] = target + (out[idx] - target) * wgt;
        }
    }
}

function applyStamps(raw, masks, nx, ny, data) {
    const out = new Float32Array(raw);
    const flat = masks.filter((m) => !m.kind);
    for (const mask of masks) if (mask.kind === "road") applyRoad(out, mask, data, nx, ny);
    for (const mask of flat) applyFlatten(out, mask, nx);
    const caves = masks.filter((m) => m.kind === "cave");
    for (const mask of caves) applyCave(out, mask, nx, raw);
    if (caves.length) for (const mask of flat) applyFlatten(out, mask, nx, true);
    return out;
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

function packWeights(splat, n, slices, target = null) {
    const groups = Math.max(1, Math.ceil(slices / 4));
    const reuse = target?.length === groups * n * 4;
    const out = reuse ? target : new Uint8Array(groups * n * 4);
    for (let s = 0; s < groups * 4; s++) {
        const base = Math.floor(s / 4) * n * 4 + (s % 4);
        if (s >= slices) {
            if (reuse) for (let k = 0; k < n; k++) out[base + k * 4] = 0;
            continue;
        }
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
        this.stampMasks = [];
        this.maskEpoch = 0;
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
            shape: shapeKey(data),
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
        const shapeChanged = shapeKey(data) !== seen.shape;
        this.data = data;
        const layers = lookChanged ? (data.layers ?? []).slice(0, MAX_TERRAIN_LAYERS) : this.layers;
        const masks = lookChanged || stampsChanged ? this.buildMasks(data, layers) : null;
        let heightsChanged = false;
        await patchGrid(seen.hc, data.hc, this.hq, nx, ny, chunk, 16, this.flatQ, (i0, j0, cw, ch) => {
            heightsChanged = true;
            for (let j = j0; j < j0 + ch; j++) for (let k = j * nx + i0; k < j * nx + i0 + cw; k++) this.raw[k] = this.hq[k] / 65535;
        });
        const waterChanged = await this.water.patch(seen, data);
        if (lookChanged) {
            this.layers = layers;
            this.weights = new Uint8Array(n * Math.max(1, this.layers.length - 1));
            await Promise.all(this.layers.slice(1).map((l, k) => decodeGrid(data.sc?.[l.id], this.layerWeights(k + 1), nx, ny, chunk, 8)));
            this.wq = this.weights.slice();
            this.stampMasks = await masks;
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
            if (stampsChanged) this.stampMasks = await masks;
            if (splatChanged || stampsChanged) this.refreshSplat();
        }
        if (stampsChanged) await this.refreshHoles();
        if (heightsChanged || shapeChanged) {
            this.refreshHeights();
            game.Levels3DPreview?.scatter?.surfacesChanged?.();
        } else if (stampsChanged && this.cover?.height) this.cover.update(this.cover.height.image.data);
        if (waterChanged || lookChanged || shapeChanged) this.water.build();
        this.remember(data);
    }

    async load() {
        const { nx, ny, chunk } = this;
        const masks = this.buildMasks(this.data, this.layers);
        await Promise.all([decodeGrid(this.data.hc, this.hq, nx, ny, chunk, 16), ...this.layers.slice(1).map((l, k) => decodeGrid(this.data.sc?.[l.id], this.layerWeights(k + 1), nx, ny, chunk, 8)), this.water.load(this.data)]);
        for (let k = 0; k < this.raw.length; k++) this.raw[k] = this.hq[k] / 65535;
        this.wq = this.weights.slice();
        this.stampMasks = await masks;
        this.composeSplat();
        this.buildGeometry();
        await this.refreshSurface();
        await this.createMaterial();
        this.water.build();
    }

    buildMasks(data, layers) {
        this.maskEpoch++;
        return this.maskJob(data, layers);
    }

    maskJob(data, layers) {
        const { w, h, min, max, roads, stamps } = data;
        return terrainJobs.run("masks", { data: { w, h, min, max, roads, stamps }, nx: this.nx, ny: this.ny, layers: layers.map(({ id }) => ({ id })) });
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
        this.seen.shape = shapeKey(this.data);
        this._roadsDirty = true;
        return (this._roadJob ??= this.applyRoads());
    }

    async applyRoads() {
        while (this._roadsDirty) {
            this._roadsDirty = false;
            const epoch = this.maskEpoch;
            const masks = await this.maskJob(this.data, this.layers);
            if (epoch !== this.maskEpoch || !this.surfaceMesh || this.water.disposed) continue;
            this.stampMasks = masks;
            this.refreshSplat();
            this.refreshHeights();
        }
        this._roadJob = null;
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
        surface.computeBoundsTree = function (options) {
            return this.boundsTree ?? THREE.BufferGeometry.prototype.computeBoundsTree.call(this, options);
        };
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
    }

    async refreshSurface() {
        const geometry = this.surfaceMesh.geometry;
        const { w, h } = this.data;
        const holes = (this.data.stamps ?? []).flatMap((s) => s.holes ?? []);
        this.holeKey = JSON.stringify(holes);
        const version = this.heightVersion;
        const { roots, index } = await terrainJobs.run("surface", { positions: geometry.getAttribute("position").array, nx: this.nx, ny: this.ny, w, h, holes });
        if (this.surfaceMesh?.geometry !== geometry || this.water.disposed) return;
        geometry.setIndex(new THREE.BufferAttribute(index, 1));
        geometry.boundsTree = MeshBVH.deserialize({ roots, index, indirectBuffer: null }, geometry, { setIndex: false });
        if (version !== this.heightVersion) geometry.boundsTree.refit();
    }

    async refreshHoles() {
        if (!this.surfaceMesh || JSON.stringify((this.data.stamps ?? []).flatMap((s) => s.holes ?? [])) === this.holeKey) return;
        await this.refreshSurface();
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
        let low = Infinity;
        for (const k of border) low = Math.min(low, positions[k * 3 + 1]);
        const bottom = Math.max(this.data.min * this.scale, low - SKIRT_CELLS * canvas.scene.grid.size * this.scale);
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
        this.weightTexture.image.data = packWeights(this.splat, this.nx * this.ny, Math.max(0, this.layers.length - 1), this.weightTexture.image.data);
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
            mmCrisp: { value: layers.map((l) => (l?.crisp ? 1 : 0)) },
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
                    uniform float mmCrisp[MM_COUNT];
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
                    void mmLayer(int i, float raw, float sharp, vec2 p, vec2 dx, vec2 dy, float fine, inout float acc, inout float wallW, inout int wallI, inout vec3 col, inout vec2 tn, inout float h, inout float r) {
                        if (i < MM_COUNT) {
                            bool crisp = mmCrisp[i] > 0.5;
                            if (crisp) raw = sharp;
                            acc += raw;
                            float w = raw / max(acc, 1e-4);
                            float edge = 1.0 - abs(w * 2.0 - 1.0);
                            float mid = mmNoise(p * 18.0 + float(i) * 3.71) * 0.65 + mmNoise(p * 41.0 + float(i) * 1.37) * 0.35;
                            w = crisp ? smoothstep(0.4, 0.6, w) : clamp(w + ((mid - 0.5) * 1.2 + (fine - 0.5) * 0.4) * edge, 0.0, 1.0);
                            wallW = mix(wallW, mmWalls[i], w);
                            if (mmWalls[i] > 0.5 && w > 0.25) wallI = i;
                            if (w > 0.0 && mmWalls[i] < 0.5) {
                                float s = mmScales[i];
                                vec4 d = textureGrad(mmDetail, vec3(p * s, float(i)), dx * s, dy * s);
                                float t = crisp ? w : mmBlend(h, d.b, w);
                                if (t > 0.0) {
                                    col = mix(col, textureGrad(mmLayers, vec3(p * s, float(i)), dx * s, dy * s).rgb * mmTints[i], t);
                                    tn = mix(tn, d.rg * 2.0 - 1.0, t);
                                    h = mix(h, d.b, t);
                                    r = mix(r, d.a, t);
                                }
                            }
                        }
                    }
                    #define MM_LAYER(I, RAW, SHARP) mmLayer(I, RAW, SHARP, mmP, mmDx, mmDy, mmFine, mmAcc, mmWallW, mmWallI, mmCol, mmTn, mmH, mmR)
                    #define MM_GROUP(G, W, S) MM_LAYER(G * 4 + 1, W.x, S.x); MM_LAYER(G * 4 + 2, W.y, S.y); MM_LAYER(G * 4 + 3, W.z, S.z); MM_LAYER(G * 4 + 4, W.w, S.w)`,
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
                    vec2 mmUvC = (vMmUv * (mmSz - 1.0) + 0.5) / mmSz;
                    #if MM_GROUPS > 1
                    for (int g = 0; g < MM_GROUPS; g++) {
                        vec4 mmW4 = mmWs[g];
                        vec4 mmC4 = texture(mmWeights, vec3(mmUvC, float(g)));
                        MM_GROUP(g, mmW4, mmC4);
                    }
                    #else
                    vec4 mmC0 = texture(mmWeights, vec3(mmUvC, 0.0));
                    MM_GROUP(0, mmWs[0], mmC0);
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
