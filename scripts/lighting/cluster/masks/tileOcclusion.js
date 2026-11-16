import { Raycaster } from "three";
import { buildOccluder, createMaskJob, traceMaskRay } from "./selfOcclusion.js";

const SLICE_MS = 1.5;
const REQUEST_TIMEOUT = 5000;
const DOOR_SETTLE_MS = 600;

const _raycaster = new Raycaster();
_raycaster.firstHitOnly = true;

function isSightMesh(tile, object) {
    if (object.userData.isDoor) return !object.userData.isOpen;
    return tile.hasTags ? !!object.userData.sight : !!tile.sight;
}

function collectSightMeshes(tile) {
    const meshes = [];
    const visit = (object) => {
        if (object.name === "sightMesh" || object === tile.sightMesh) return;
        if (object.isMesh && isSightMesh(tile, object)) meshes.push(object);
        object.children.forEach(visit);
    };
    visit(tile.mesh);
    return meshes;
}

export class TileOcclusion {
    constructor(onResult, onInvalidate) {
        this.onResult = onResult;
        this.onInvalidate = onInvalidate;
        this.queue = new Map();
        this.inflight = new Map();
        this.pending = new Map();
        this.ids = new Map();
        this.job = null;
        this.lastResultTime = -Infinity;
        this.stats = { requests: 0, results: 0, workerMs: 0, workerRays: 0, mainMs: 0 };
        this._onMeshesChanged = (bbox) => this.onInvalidate(bbox);
        this._onTileChange = (tile) => this.invalidateTile(tile);
        this._hooks = ["createTile", "updateTile", "deleteTile"].map((hook) => [hook, Hooks.on(hook, this._onTileChange)]);
        this._workers = null;
    }

    get workers() {
        const workers = game.Levels3DPreview?.workers;
        return workers?.enabled && workers.raycastWorker ? workers : null;
    }

    subscribe() {
        const workers = game.Levels3DPreview?.workers;
        if (!workers?.meshesChangedListeners || workers === this._workers) return;
        this._workers?.meshesChangedListeners.delete(this._onMeshesChanged);
        workers.meshesChangedListeners.add(this._onMeshesChanged);
        this._workers = workers;
    }

    invalidateTile(tile) {
        if (this.workers) return;
        const factor = game.Levels3DPreview?.factor ?? 1000;
        const bbox = { minX: tile.x / factor, minZ: tile.y / factor, maxX: (tile.x + tile.width) / factor, maxZ: (tile.y + tile.height) / factor };
        this._tileOccluders = null;
        this.onInvalidate(bbox);
        setTimeout(() => {
            this._tileOccluders = null;
            this.onInvalidate(bbox);
        }, DOOR_SETTLE_MS);
    }

    request(entry, params) {
        if (this.inflight.has(entry)) this.pending.set(entry, params);
        else this.queue.set(entry, params);
    }

    cancel(entry) {
        this.queue.delete(entry);
        this.pending.delete(entry);
        const inflight = this.inflight.get(entry);
        if (inflight) this.ids.delete(inflight.id);
        this.inflight.delete(entry);
        if (this.job?.entry === entry) this.job = null;
    }

    update() {
        this.subscribe();
        const now = performance.now();
        for (const [entry, inflight] of this.inflight) {
            if (now - Math.max(inflight.time, this.lastResultTime) < REQUEST_TIMEOUT) continue;
            this.inflight.delete(entry);
            this.ids.delete(inflight.id);
            if (!this.queue.has(entry)) this.queue.set(entry, this.pending.get(entry) ?? inflight.params);
            this.pending.delete(entry);
        }
        if (!this.queue.size && !this.job) return;
        const workers = this.workers;
        if (workers) this.sendToWorker(workers, now);
        else this.runSlice();
    }

    sendToWorker(workers, now) {
        const lights = [];
        for (const [entry, params] of this.queue) {
            const id = `${entry.id}.${++this.stats.requests}`;
            this.inflight.set(entry, { id, params, time: now });
            this.ids.set(id, entry);
            lights.push({ id, ...params });
        }
        this.queue.clear();
        workers.requestLightMasks(lights, (data) => this.handleWorkerResult(data));
    }

    handleWorkerResult({ id, points, time, rays }) {
        this.lastResultTime = performance.now();
        const entry = this.ids.get(id);
        if (!entry) return;
        this.ids.delete(id);
        const inflight = this.inflight.get(entry);
        this.inflight.delete(entry);
        this.stats.results++;
        this.stats.workerMs += time;
        this.stats.workerRays += rays;
        this.stats.lastWorkerMs = time;
        const next = this.pending.get(entry);
        if (next) {
            this.pending.delete(entry);
            this.queue.set(entry, next);
        }
        this.onResult(entry, points, inflight.params);
    }

    get tileOccluders() {
        const tiles = game.Levels3DPreview?.tiles ?? {};
        const list = Object.values(tiles);
        const cache = this._tileOccluders;
        if (cache && cache.tiles === tiles && cache.size === list.length && cache.roots.every((root, index) => root === list[index]?.mesh)) return cache.occluders;
        const occluders = [];
        for (const tile of list) {
            if (!tile?.mesh || (!tile.sight && !tile.hasTags) || tile.dynaMesh == "decal") continue;
            tile.mesh.updateMatrixWorld(true);
            const meshes = collectSightMeshes(tile);
            if (meshes.length) occluders.push(buildOccluder(meshes, !!tile.isDoor));
        }
        this._tileOccluders = { tiles, size: list.length, roots: list.map((tile) => tile?.mesh), occluders };
        return occluders;
    }

    runSlice() {
        if (!game.Levels3DPreview) return;
        const start = performance.now();
        while (performance.now() - start < SLICE_MS) {
            if (!this.job) {
                const next = this.queue.entries().next().value;
                if (!next) break;
                const [entry, params] = next;
                this.queue.delete(entry);
                this.job = Object.assign(createMaskJob(_raycaster, this.tileOccluders, params), { entry });
            }
            const job = this.job;
            if (job.active) traceMaskRay(_raycaster, job, job.index);
            else job.index = job.params.rays - 1;
            if (++job.index >= job.params.rays) {
                this.job = null;
                this.stats.results++;
                this.onResult(job.entry, job.hits ? job.points : null, job.params);
            }
        }
        this.stats.mainMs += performance.now() - start;
    }

    dispose() {
        this._hooks.forEach(([hook, id]) => Hooks.off(hook, id));
        this._workers?.meshesChangedListeners.delete(this._onMeshesChanged);
        this.queue.clear();
        this.pending.clear();
        this.inflight.clear();
        this.ids.clear();
        this.job = null;
        this._tileOccluders = null;
    }
}
