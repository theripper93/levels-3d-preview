import { DataTexture, RGBAFormat, FloatType, LinearFilter, Vector2 } from "three";
import { punctualToPhysical } from "../../three/legacyLights.js";
import { ClusterMasks } from "./clusterMasks.js";
import { maskReaches } from "./masks/maskCoverage.js";
import { ClusterLight } from "./clusterLight.js";
import { setClusterSamplerLimit } from "./clusterChunks.js";
import { factor } from "../../main.js";
import { refreshWorldMatrix } from "../../three/matrixWorld.js";

export const EFFECT_SLOTS = 16;
export const DATA_WIDTH = 1024;
export const RECORD_TEXELS = 6;
const RECORD_FLOATS = RECORD_TEXELS * 4;
const ROW_FLOATS = DATA_WIDTH * 4;
const MIN_CAPACITY = 256;
const MAX_CAPACITY = 4096;
const MAX_GRID = 128;
const CELL_SQUARES = 1;
const SHRINK_RATIO = 0.5;
const BIN_MARGIN = 1.1;

function createDataTexture(rows, source) {
    const data = new Float32Array(ROW_FLOATS * rows);
    if (source) data.set(source.subarray(0, Math.min(source.length, data.length)));
    const texture = new DataTexture(data, DATA_WIDTH, rows, RGBAFormat, FloatType);
    texture.needsUpdate = true;
    return texture;
}

function createWhiteTexture() {
    const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function recordRows(capacity) {
    return Math.ceil((capacity * RECORD_TEXELS) / DATA_WIDTH);
}

const whiteTexture = createWhiteTexture();

function primeUnpackState(renderer) {
    const gl = renderer.getContext();
    for (const name of [gl.UNPACK_ROW_LENGTH, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS]) renderer.state.pixelStorei(name, 0);
}

export const clusterUniforms = {
    uClusterLights: { value: createDataTexture(recordRows(MIN_CAPACITY) + 1) },
    uClusterMasks: { value: whiteTexture },
    uClusterLayout: { value: new Vector2() },
    uClusterOrigin: { value: new Vector2() },
    uClusterCell: { value: 1 },
    uClusterDims: { value: new Vector2() },
    uClusterEffects: { value: 0 },
    uClusterLevels: { value: 0 },
    uClusterDarkness: { value: 0 },
};

const scratch = new Float32Array(RECORD_FLOATS);

export class ClusterManager {
    static ClusterLight = ClusterLight;

    constructor(parent) {
        this._parent = parent;
        this.lights = new Set();
        this.states = new Map();
        this.capacity = MIN_CAPACITY;
        this.records = clusterUniforms.uClusterLights.value.image.data;
        this.gridBase = recordRows(MIN_CAPACITY) * DATA_WIDTH;
        this.freeEffectSlots = [];
        this.freeSlots = [];
        this.nextSlot = EFFECT_SLOTS;
        for (let i = EFFECT_SLOTS - 1; i >= 0; i--) this.freeEffectSlots.push(i);
        this.grid = { key: null, width: 0, height: 0, cell: 1, originX: 0, originZ: 0, counts: new Int32Array(0) };
        this._recordsDirty = false;
        this._gridDirty = false;
        this._warned = new Set();
        this._enabled = true;
        this.stats = { gridRebuilds: 0, recordUploads: 0, lastUpdateMs: 0 };
        this.masks = new ClusterMasks(this);
        setClusterSamplerLimit(parent.renderer?.capabilities.maxTextures);
    }

    get enabled() {
        return this._enabled;
    }

    set enabled(value) {
        this._enabled = !!value;
        this._gridDirty = true;
        this._recordsDirty = true;
        if (!this._enabled) {
            clusterUniforms.uClusterDims.value.set(0, 0);
            clusterUniforms.uClusterEffects.value = 0;
            clusterUniforms.uClusterDarkness.value = 0;
        } else this.updateEffectCount();
    }

    register(light) {
        if (this.states.has(light)) return;
        const binned = !light.unbinned || !this.freeEffectSlots.length;
        if (light.unbinned && binned) this.warnOnce("effects", `3D Canvas | More than ${EFFECT_SLOTS} effect lights, extra lights are binned`);
        const slot = binned ? this.allocateSlot() : this.freeEffectSlots.pop();
        if (slot === undefined) return this.warnOnce("capacity", `3D Canvas | Clustered light capacity (${MAX_CAPACITY}) exceeded`);
        this.lights.add(light);
        this.states.set(light, { slot, binned, x: 0, z: 0, radius: 0, peakRadius: 0, binX: 0, binZ: 0, binRadius: -1 });
        this.clearSlot(slot);
        if (binned) {
            this._gridDirty = true;
            this.masks.add(light);
        } else this.updateEffectCount();
        this._recordsDirty = true;
    }

    unregister(light) {
        const state = this.states.get(light);
        if (!state) return;
        this.states.delete(light);
        this.lights.delete(light);
        this.clearSlot(state.slot);
        if (state.binned) {
            this.masks.remove(light);
            this.freeSlots.push(state.slot);
            this._gridDirty = true;
        } else {
            this.freeEffectSlots.push(state.slot);
            this.updateEffectCount();
        }
        this._recordsDirty = true;
    }

    clear() {
        [...this.lights].forEach((light) => this.unregister(light));
        this.freeSlots = [];
        this.nextSlot = EFFECT_SLOTS;
        this.grid.key = null;
        this._gridDirty = true;
    }

    markRecordsDirty() {
        this._recordsDirty = true;
    }

    markGridDirty() {
        this._gridDirty = true;
    }

    allocateSlot() {
        if (this.freeSlots.length) return this.freeSlots.pop();
        if (this.nextSlot >= this.capacity) {
            if (this.capacity >= MAX_CAPACITY) return undefined;
            this.growRecords(Math.min(this.capacity * 2, MAX_CAPACITY));
        }
        return this.nextSlot++;
    }

    growRecords(capacity) {
        this.capacity = capacity;
        this.gridBase = recordRows(capacity) * DATA_WIDTH;
        this.ensureRows(recordRows(capacity) + 1);
        this._gridDirty = true;
    }

    ensureRows(rows) {
        const previous = clusterUniforms.uClusterLights.value;
        if (previous.image.height >= rows) return previous;
        const texture = createDataTexture(2 ** Math.ceil(Math.log2(rows)), this.records);
        clusterUniforms.uClusterLights.value = texture;
        this.records = texture.image.data;
        previous.dispose();
        return texture;
    }

    uploadRows(firstRow, endRow) {
        const texture = clusterUniforms.uClusterLights.value;
        const renderer = this._parent.renderer;
        const properties = renderer?.properties;
        const uploaded = properties?.has(texture) && properties.get(texture).__version === texture.version;
        if (!uploaded) texture.clearUpdateRanges();
        else {
            for (let row = firstRow; row < endRow; row++) texture.addUpdateRange(row * ROW_FLOATS, ROW_FLOATS);
            primeUnpackState(renderer);
        }
        texture.needsUpdate = true;
    }

    clearSlot(slot) {
        this.records.fill(0, slot * RECORD_FLOATS, (slot + 1) * RECORD_FLOATS);
    }

    updateEffectCount() {
        let count = 0;
        for (const state of this.states.values()) if (!state.binned) count = Math.max(count, state.slot + 1);
        clusterUniforms.uClusterEffects.value = this._enabled ? count : 0;
    }

    warnOnce(key, message) {
        if (this._warned.has(key)) return;
        this._warned.add(key);
        console.warn(message);
    }

    isEmitting(light) {
        const camera = this._parent.camera;
        if (camera && !light.layers.test(camera.layers)) return false;
        let object = light;
        while (object) {
            if (!object.visible) return false;
            if (!object.parent) return object === this._parent.scene;
            object = object.parent;
        }
        return false;
    }

    writeRecord(light, state) {
        refreshWorldMatrix(light);
        const e = light.matrixWorld.elements;
        const x = e[12];
        const y = e[13];
        const z = e[14];
        const physical = punctualToPhysical(light);
        const darkness = !!light.isDarkness;
        const active = light.intensity > 0 && this.isEmitting(light);
        const emitting = active && !darkness ? physical.intensity : 0;
        const radius = physical.distance > 0 ? physical.distance : Infinity;
        scratch[0] = x;
        scratch[1] = y;
        scratch[2] = z;
        scratch[3] = physical.distance;
        scratch[4] = light.color.r * emitting;
        scratch[5] = light.color.g * emitting;
        scratch[6] = light.color.b * emitting;
        scratch[7] = physical.decay;
        let penumbraCos = 0;
        if (darkness) {
            scratch[8] = light.color.r;
            scratch[9] = light.color.g;
            scratch[10] = light.color.b;
            scratch[11] = -2;
        } else if (light.isSpotLight) {
            const t = light.target.matrixWorld.elements;
            let dx = x - t[12];
            let dy = y - t[13];
            let dz = z - t[14];
            const length = Math.hypot(dx, dy, dz) || 1;
            scratch[8] = dx / length;
            scratch[9] = dy / length;
            scratch[10] = dz / length;
            scratch[11] = Math.cos(light.angle);
            penumbraCos = Math.cos(light.angle * (1 - light.penumbra));
        } else {
            scratch[8] = 0;
            scratch[9] = 0;
            scratch[10] = 0;
            scratch[11] = -2;
        }
        const mask = state.binned ? light.mask : null;
        if (mask) {
            scratch.set(mask.rect, 12);
            scratch.set(mask.center, 16);
        } else {
            scratch.fill(0, 12, 16);
            scratch[16] = x;
            scratch[17] = z;
            scratch[18] = physical.distance;
        }
        scratch[19] = penumbraCos;
        scratch[20] = light.userData.brightRatio ?? 0;
        scratch[21] = darkness && active ? Math.min(light.intensity, 1) : 0;
        scratch[22] = light.userData.priority ?? 0;
        const offset = state.slot * RECORD_FLOATS;
        let changed = false;
        for (let i = 0; i < RECORD_FLOATS; i++) {
            if (this.records[offset + i] === scratch[i]) continue;
            this.records[offset + i] = scratch[i];
            changed = true;
        }
        state.x = x;
        state.z = z;
        state.radius = radius;
        const baseRadius = light.baseDistance > light.distance && light.distance > 0 ? (radius * light.baseDistance) / light.distance : radius;
        state.peakRadius = baseRadius < state.peakRadius * SHRINK_RATIO ? baseRadius : Math.max(state.peakRadius, baseRadius);
        if (state.binned && !this._gridDirty) {
            const contained = Math.hypot(x - state.binX, z - state.binZ) + radius <= state.binRadius;
            if (!contained || state.peakRadius < state.binRadius * SHRINK_RATIO) this._gridDirty = true;
        }
        return changed;
    }

    update() {
        if (!this._enabled) return;
        const start = performance.now();
        const renderer = this._parent.renderer;
        this.masks.update(renderer);
        const maskTexture = this.masks.texture ?? whiteTexture;
        if (clusterUniforms.uClusterMasks.value !== maskTexture) clusterUniforms.uClusterMasks.value = maskTexture;
        let changed = this._recordsDirty;
        let darkness = 0;
        for (const [light, state] of this.states) {
            if (this.writeRecord(light, state)) changed = true;
            if (light.isDarkness && state.binned) darkness++;
        }
        clusterUniforms.uClusterDarkness.value = darkness;
        if (this._gridDirty) this.rebuildGrid();
        if (changed) {
            this.uploadRows(0, Math.ceil((this.nextSlot * RECORD_TEXELS) / DATA_WIDTH));
            this.stats.recordUploads++;
        }
        this._recordsDirty = false;
        this.stats.lastUpdateMs = performance.now() - start;
    }

    async settleMasks(timeout = 10000) {
        if (!this._enabled) return;
        const end = performance.now() + timeout;
        this.masks.dirtyFrames = Math.max(this.masks.dirtyFrames, 1);
        do {
            this.update();
            if (!this.masks.busy) return;
            await new Promise((resolve) => setTimeout(resolve, 16));
        } while (performance.now() < end);
    }

    configureGrid() {
        const dimensions = canvas?.dimensions;
        if (!dimensions) return false;
        const { x, y, width, height } = dimensions.rect;
        const key = `${x}|${y}|${width}|${height}|${dimensions.size}`;
        if (this.grid.key === key) return true;
        const worldWidth = width / factor;
        const worldHeight = height / factor;
        let cell = (CELL_SQUARES * dimensions.size) / factor;
        if (Math.max(worldWidth, worldHeight) / cell > MAX_GRID) cell = Math.max(worldWidth, worldHeight) / MAX_GRID;
        const gridWidth = Math.max(1, Math.ceil(worldWidth / cell));
        const gridHeight = Math.max(1, Math.ceil(worldHeight / cell));
        Object.assign(this.grid, { key, width: gridWidth, height: gridHeight, cell, originX: x / factor, originZ: y / factor, counts: new Int32Array(gridWidth * gridHeight) });
        clusterUniforms.uClusterOrigin.value.set(this.grid.originX, this.grid.originZ);
        clusterUniforms.uClusterCell.value = cell;
        return true;
    }

    forEachCell(state, callback) {
        const { width, height, cell, originX, originZ } = this.grid;
        const radius = state.binRadius;
        const localX = state.x - originX;
        const localZ = state.z - originZ;
        const minX = Math.max(0, Math.floor((localX - radius) / cell));
        const maxX = Math.min(width - 1, Math.floor((localX + radius) / cell));
        const minZ = Math.max(0, Math.floor((localZ - radius) / cell));
        const maxZ = Math.min(height - 1, Math.floor((localZ + radius) / cell));
        const radiusSq = radius * radius;
        for (let cz = minZ; cz <= maxZ; cz++) {
            const dz = Math.max(cz * cell - localZ, 0, localZ - (cz + 1) * cell);
            for (let cx = minX; cx <= maxX; cx++) {
                const dx = Math.max(cx * cell - localX, 0, localX - (cx + 1) * cell);
                if (dx * dx + dz * dz <= radiusSq) callback(cz * width + cx);
            }
        }
    }

    updateCells(light, state) {
        const mask = light.mask ?? null;
        const grid = this.grid;
        const cache = state.cellCache;
        if (cache && cache.mask === mask && cache.x === state.binX && cache.z === state.binZ && cache.radius === state.binRadius && cache.grid === grid.key) return;
        const { width, cell, originX, originZ } = grid;
        const cells = [];
        this.forEachCell(state, (index) => {
            const cx = index % width;
            const minX = originX + cx * cell;
            const minZ = originZ + ((index - cx) / width) * cell;
            if (maskReaches(mask, minX, minX + cell, minZ, minZ + cell)) cells.push(index);
        });
        state.cells = cells;
        state.cellCache = { mask, x: state.binX, z: state.binZ, radius: state.binRadius, grid: grid.key };
    }

    rebuildGrid() {
        this._gridDirty = false;
        if (!this.configureGrid()) return;
        const { width, height, counts } = this.grid;
        const binned = [];
        for (const [light, state] of this.states) {
            if (!state.binned) continue;
            state.binX = state.x;
            state.binZ = state.z;
            state.binRadius = state.peakRadius * BIN_MARGIN;
            this.updateCells(light, state);
            binned.push(state);
        }
        counts.fill(0);
        for (const state of binned) for (const index of state.cells) counts[index]++;
        let total = 0;
        for (let i = 0; i < counts.length; i++) total += counts[i];
        const listBase = this.gridBase + Math.ceil(counts.length / 2);
        const endRow = Math.ceil((listBase + Math.ceil(total / 4)) / DATA_WIDTH);
        this.ensureRows(endRow);
        const data = this.records;
        const headerStart = this.gridBase * 4;
        let offset = 0;
        for (let i = 0; i < counts.length; i++) {
            data[headerStart + i * 2] = offset;
            data[headerStart + i * 2 + 1] = 0;
            offset += counts[i];
        }
        const listStart = listBase * 4;
        for (const state of binned) {
            for (const index of state.cells) {
                const filled = data[headerStart + index * 2 + 1];
                data[listStart + data[headerStart + index * 2] + filled] = state.slot;
                data[headerStart + index * 2 + 1] = filled + 1;
            }
        }
        this.uploadRows(this.gridBase / DATA_WIDTH, endRow);
        clusterUniforms.uClusterLayout.value.set(this.gridBase, listBase);
        clusterUniforms.uClusterDims.value.set(width, height);
        this.stats.gridRebuilds++;
    }

    dispose() {
        this.clear();
        this.masks.dispose();
    }
}
