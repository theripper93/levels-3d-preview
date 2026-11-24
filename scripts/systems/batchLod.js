import { Vector2 } from "three";
import { requestCoarseChain, requestLodChain, simplifyJobs } from "../helpers/meshSimplify.js";
import { getQuality } from "../vfx/quality.js";

const PIXEL_ERROR = { off: 2, low: 2, medium: 1.5, high: 1, ultra: 1 };
const COARSER_MARGIN = 0.7;
const INDEX_BUDGET = 1500000;
const FLUSH_BUDGET = 4;
const _size = new Vector2();

const PRESETS = [null, 1.5, 3];
const DEFAULT_AGGRESSIVENESS = 2;

export class BatchLod {
    constructor(batcher) {
        this.batcher = batcher;
        this.geometries = new Set();
        this.coarse = new Set();
        this.queue = [];
        this.dirty = true;
        this._aggressiveness = null;
        this.signature = new Float64Array(18);
        this.stats = { switches: 0, lastMs: 0, levels: new Array(8).fill(0), coarse: new Array(8).fill(0) };
    }

    get enabled() {
        return this._enabled !== false;
    }

    set enabled(value) {
        this._enabled = !!value;
        this.dirty = true;
        if (this._enabled) return;
        for (const entry of this.geometries) if (entry.lod.level) this.apply(entry, 0);
        for (const source of this.batcher.sources) for (const entry of source.entries) this.setCoarse(entry, 0);
    }

    get aggressiveness() {
        return this._aggressiveness ?? DEFAULT_AGGRESSIVENESS;
    }

    set aggressiveness(value) {
        this._aggressiveness = Math.max(0, Math.min(PRESETS.length - 1, Math.round(value) || 0));
        if (!this._aggressiveness) for (const source of this.batcher.sources) for (const entry of source.entries) this.setCoarse(entry, 0);
        this.dirty = true;
    }

    attach(batch, entry, geometry) {
        entry.lod = null;
        entry.coarse = null;
        requestLodChain(geometry).then((levels) => {
            if (!levels || batch.geometries.get(entry.key) !== entry) return;
            entry.lod = { batch, levels, level: 0, scale: 0 };
            this.geometries.add(entry);
            this.stats.levels[0]++;
            this.dirty = true;
        });
        requestCoarseChain(geometry).then((levels) => {
            if (levels && batch.geometries.get(entry.key) === entry) this.queue.push({ batch, entry, levels });
        });
    }

    get busy() {
        return simplifyJobs.busy || this.queue.length > 0;
    }

    flush() {
        if (!this.queue.length || simplifyJobs.busy) return;
        const queue = this.queue.splice(0);
        const byBatch = new Map();
        for (const item of queue) {
            if (item.batch.geometries.get(item.entry.key) !== item.entry) continue;
            if (!byBatch.has(item.batch)) byBatch.set(item.batch, []);
            byBatch.get(item.batch).push(item);
        }
        const start = performance.now();
        for (const [batch, items] of byBatch) {
            if (performance.now() - start > FLUSH_BUDGET) {
                this.queue.push(...items);
                continue;
            }
            let vertices = 0;
            let indices = 0;
            for (const { levels } of items) {
                for (const { geometry } of levels) {
                    vertices += geometry.attributes.position.count;
                    indices += geometry.index.count;
                }
            }
            this.batcher.reserve(batch, vertices, indices);
            for (const { entry, levels } of items) {
                try {
                    entry.coarse = levels.map((level) => ({ id: batch.mesh.addGeometry(level.geometry), error: level.error, triangles: level.triangles }));
                } catch {
                    continue;
                }
                this.coarse.add(entry);
            }
        }
        this.dirty = true;
    }

    detach(entry) {
        if (entry.lod && this.geometries.delete(entry)) this.stats.levels[entry.lod.level]--;
        entry.lod = null;
        if (entry.coarse && this.coarse.delete(entry)) {
            const mesh = entry.batch?.mesh ?? [...this.batcher.batches.values()].find((batch) => batch.geometries.get(entry.key) === entry)?.mesh;
            for (const level of entry.coarse) mesh?.deleteGeometry(level.id);
        }
        entry.coarse = null;
    }

    setCoarse(instance, level) {
        const current = instance.coarseLevel ?? 0;
        if (current === level) return;
        const coarse = instance.geometry.coarse;
        const id = level && coarse ? coarse[level - 1].id : instance.geometry.id;
        const mesh = instance.batch.mesh;
        mesh.setGeometryIdAt(instance.id, id);
        mesh._visibilityChanged = true;
        this.stats.coarse[current]--;
        this.stats.coarse[level]++;
        instance.coarseLevel = level;
    }

    clear() {
        this.geometries.clear();
        this.coarse.clear();
        this.queue = [];
        this.stats.levels.fill(0);
        this.stats.coarse.fill(0);
    }

    cameraChanged(camera, renderer) {
        const s = this.signature;
        const m = camera.matrixWorld.elements;
        const p = camera.projectionMatrix.elements;
        const height = renderer.getDrawingBufferSize(_size).y;
        let changed = false;
        for (let i = 0; i < 16; i++) {
            if (s[i] !== m[i]) {
                s[i] = m[i];
                changed = true;
            }
        }
        if (s[16] !== p[5] || s[17] !== height) {
            s[16] = p[5];
            s[17] = height;
            changed = true;
        }
        return changed;
    }

    update(sources, camera, renderer) {
        if (!this.enabled || (!this.geometries.size && !this.coarse.size) || !camera.isPerspectiveCamera) return;
        if (!this.cameraChanged(camera, renderer) && !this.dirty) return;
        const start = performance.now();
        this.dirty = false;
        const projection = (this.signature[16] * this.signature[17]) / 2;
        const position = camera.position;
        const near = camera.near;
        const aggressiveness = this.aggressiveness;
        const threshold = PRESETS[aggressiveness] ?? PIXEL_ERROR[getQuality().tier] ?? 1;
        const coarseOn = aggressiveness > 0;
        for (const entry of this.geometries) entry.lod.scale = 0;
        for (const source of sources) {
            if (!source.visible) continue;
            const e = source.matrix;
            const scale = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
            const distance = Math.max(source.sphere.center.distanceTo(position) - source.sphere.radius, near);
            const pixels = (projection * scale) / distance;
            for (const entry of source.entries) {
                const lod = entry.geometry.lod;
                if (lod && entry.on && pixels > lod.scale) lod.scale = pixels;
                const coarse = coarseOn && entry.on ? entry.geometry.coarse : null;
                if (!coarse) continue;
                let level = entry.coarseLevel ?? 0;
                const error = (l) => (l ? coarse[l - 1].error : 0) * pixels;
                while (level > 0 && error(level) > threshold) level--;
                while (level < coarse.length && error(level + 1) < threshold * COARSER_MARGIN) level++;
                this.setCoarse(entry, level);
            }
        }
        let budget = INDEX_BUDGET;
        for (const entry of this.geometries) {
            const lod = entry.lod;
            if (!lod.scale) continue;
            const levels = lod.levels;
            let level = lod.level;
            while (level > 0 && levels[level].error * lod.scale > threshold) level--;
            while (level < levels.length - 1 && levels[level + 1].error * lod.scale < threshold * COARSER_MARGIN) level++;
            if (level === lod.level) continue;
            if (budget <= 0) {
                this.dirty = true;
                continue;
            }
            budget -= levels[level].indices.length;
            this.apply(entry, level);
        }
        this.stats.lastMs = performance.now() - start;
    }

    apply(entry, level) {
        const lod = entry.lod;
        const mesh = lod.batch.mesh;
        const info = mesh._geometryInfo[entry.id];
        if (!info?.active) return;
        const source = lod.levels[level].indices;
        const index = mesh.geometry.index;
        const target = index.array;
        const start = info.indexStart;
        const base = info.vertexStart;
        for (let i = 0; i < source.length; i++) target[start + i] = source[i] + base;
        info.indexCount = source.length;
        info.count = source.length;
        index.addUpdateRange(start, source.length);
        index.needsUpdate = true;
        mesh._visibilityChanged = true;
        this.stats.levels[lod.level]--;
        this.stats.levels[level]++;
        this.stats.switches++;
        lod.level = level;
    }
}
