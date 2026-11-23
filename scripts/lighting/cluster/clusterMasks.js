import { Vector3 } from "three";
import { MaskAtlas, MIN_BLOCK } from "./masks/maskAtlas.js";
import { MaskRasterizer } from "./masks/maskRaster.js";
import { TileOcclusion } from "./masks/tileOcclusion.js";
import { summarizeMask } from "./masks/maskCoverage.js";
import { BASE_SQUARES, CONTACT_SQUARES, HANG_SQUARES, PROP_MAX_SQUARES, PROP_PAD_SQUARES, REACH_SQUARES, SPAN_SQUARES, WALL_SQUARES } from "./masks/selfOcclusion.js";
import { refreshWorldMatrix } from "../../three/matrixWorld.js";

const MAX_RASTERS_PER_FRAME = 8;
const MAX_TILE_SIZE = 256;
const TEXELS_PER_SQUARE = 16;
const TOKEN_THROTTLE_MS = 150;
const MOVE_EPSILON = 0.001;
const MOVE_STEP_SQUARES = 0.05;
const SETTLE_MS = 50;
const RADIUS_TOLERANCE = 0.02;
const TILE_KEY_SQUARES = 0.05;
const SWEEP_PER_FRAME = 2;
const WAKE_FRAMES = 2;
const WAKE_HOOKS = ["canvasReady", "initializeLightSources", "lightingRefresh", "refreshAmbientLight", "updateAmbientLight", "refreshToken", "updateToken"];

const _position = new Vector3();

function maskRadius(light) {
    return light.baseDistance > 0 ? light.baseDistance : light.distance;
}

function getLightShape(source) {
    const lightSource = source.lightSource ?? source.light;
    if (!lightSource?.active) return null;
    return lightSource.shape ?? null;
}

function hashPoints(points) {
    let hash = points.length;
    for (let i = 0; i < points.length; i++) hash = (Math.imul(hash, 31) + Math.round(points[i])) | 0;
    return hash;
}

function nextPow2(value) {
    return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

export class ClusterMasks {
    constructor(manager) {
        this.manager = manager;
        this.entries = new Map();
        this.rasterQueue = new Set();
        this.atlas = new MaskAtlas();
        this.rasterizer = new MaskRasterizer();
        this.occlusion = new TileOcclusion(
            (entry, points, params) => this.onTileResult(entry, points, params),
            (bbox) => this.invalidate(bbox),
        );
        this.shift = 0;
        this.useTiles = null;
        this.stale = new Set();
        this.dirtyFrames = WAKE_FRAMES;
        this.stats = { rasters: 0, rasterMs: 0, lastFrameRasters: 0, lastFrameUploads: 0, shrinks: 0 };
        this._wake = () => (this.dirtyFrames = WAKE_FRAMES);
        this._hooks = WAKE_HOOKS.map((hook) => [hook, Hooks.on(hook, this._wake)]);
    }

    get texture() {
        return this.atlas.texture;
    }

    get busy() {
        const o = this.occlusion;
        return !!(this.stale.size || this.rasterQueue.size || o.queue.size || o.inflight.size || o.pending.size || o.job);
    }

    get gridWorld() {
        const factor = game.Levels3DPreview?.factor ?? 1000;
        return (canvas?.dimensions?.size ?? 100) / factor;
    }

    add(light) {
        if (this.entries.has(light) || light.unbinned) return;
        const entry = {
            light,
            id: light.uuid ?? foundry.utils.randomID(),
            shape: undefined,
            wallHash: null,
            walls: null,
            tiles: undefined,
            tileKey: null,
            lastTileRequest: -Infinity,
            center: null,
            half: 0,
            block: null,
            seen: { source: null, shape: null, distance: 0, x: 0, y: 0, z: 0 },
        };
        this.entries.set(light, entry);
        this.stale.add(entry);
    }

    remove(light) {
        const entry = this.entries.get(light);
        if (!entry) return;
        this.stale.delete(entry);
        this.release(entry);
        this.entries.delete(light);
    }

    release(entry) {
        this.rasterQueue.delete(entry);
        this.occlusion.cancel(entry);
        this.atlas.release(entry.block);
        entry.block = null;
        entry.center = null;
        entry.shape = undefined;
        entry.wallHash = null;
        entry.tileKey = null;
        entry.tiles = undefined;
        if (entry.light.mask) {
            entry.light.mask = null;
            this.manager.markRecordsDirty();
            this.manager.markGridDirty();
        }
    }

    update(renderer) {
        if (!renderer) return;
        this.atlas.ensureWhite(renderer);
        const useTiles = !!game.Levels3DPreview?.object3dSight;
        if (useTiles !== this.useTiles) {
            this.useTiles = useTiles;
            for (const entry of this.entries.values()) {
                entry.tileKey = null;
                entry.tiles = undefined;
                this.stale.add(entry);
                if (entry.center) this.rasterQueue.add(entry);
            }
        }
        const now = performance.now();
        if (this.dirtyFrames > 0) {
            this.dirtyFrames--;
            for (const entry of this.entries.values()) if (this.stale.has(entry) || this.changed(entry)) this.check(entry, now);
        } else if (this.stale.size) for (const entry of [...this.stale]) this.check(entry, now);
        this.sweepEntries(now);
        if (useTiles) this.occlusion.update();
        this.rasterize(renderer);
    }

    changed(entry) {
        const light = entry.light;
        const source = light.source;
        const seen = entry.seen;
        if (source !== seen.source || maskRadius(light) !== seen.distance) return true;
        if (source && getLightShape(source) !== seen.shape) return true;
        const e = light.matrixWorld.elements;
        return e[12] !== seen.x || e[13] !== seen.y || e[14] !== seen.z;
    }

    sweepEntries(now) {
        for (let i = 0; i < Math.min(SWEEP_PER_FRAME, this.entries.size); i++) {
            let next = this.sweep?.next();
            if (!next || next.done) next = (this.sweep = this.entries.values()).next();
            if (!next.done) this.check(next.value, now);
        }
    }

    check(entry, now) {
        const light = entry.light;
        const source = light.source;
        const seen = entry.seen;
        this.stale.delete(entry);
        seen.source = source;
        seen.distance = maskRadius(light);
        seen.shape = source ? getLightShape(source) : null;
        refreshWorldMatrix(light);
        const e = light.matrixWorld.elements;
        seen.x = e[12];
        seen.y = e[13];
        seen.z = e[14];
        if (!source) return entry.center && this.release(entry);
        const factor = game.Levels3DPreview?.factor ?? 1000;
        const shape = seen.shape;
        const position = _position.setFromMatrixPosition(light.matrixWorld);
        const radiusPx = shape?.config?.radius;
        const half = radiusPx > 0 ? radiusPx / factor : seen.distance;
        if (!(half > 0)) return entry.center && this.release(entry);
        const cx = shape ? shape.origin.x / factor : position.x;
        const cz = shape ? shape.origin.y / factor : position.z;
        if (shape !== entry.shape) {
            entry.shape = shape;
            const points = shape ? (shape._l3dWallPoints ?? shape.points) : null;
            const hash = points ? hashPoints(points) ^ Math.round(radiusPx) : null;
            if (hash !== entry.shapeHash) {
                entry.shapeHash = hash;
                entry.nextWalls = points ? { points: Float32Array.from(points, (v) => v / factor), origin: [cx, cz], radius: radiusPx / factor } : null;
                entry.changedAt = now;
            }
        }
        const probe = entry.probe;
        if (!probe || probe[0] !== cx || probe[1] !== cz || probe[2] !== half) {
            entry.probe = [cx, cz, half];
            entry.changedAt = now;
        }
        const distance = entry.center ? Math.hypot(cx - entry.center[0], cz - entry.center[1]) : Infinity;
        const resized = !entry.center || Math.abs(half - entry.half) > entry.half * RADIUS_TOLERANCE;
        const wallsChanged = entry.shapeHash !== entry.wallHash;
        if (distance > MOVE_EPSILON || resized || wallsChanged) {
            const settled = now - entry.changedAt >= SETTLE_MS;
            if (distance > MOVE_STEP_SQUARES * this.gridWorld || resized || settled || (wallsChanged && distance <= MOVE_EPSILON)) {
                entry.center = [cx, cz];
                entry.half = half;
                entry.wallHash = entry.shapeHash;
                entry.walls = entry.nextWalls;
                this.rasterQueue.add(entry);
            } else this.stale.add(entry);
        }
        if (this.useTiles) this.checkTiles(entry, source, position.y, now);
    }

    checkTiles(entry, source, height, now) {
        const step = TILE_KEY_SQUARES * this.gridWorld;
        const [cx, cz] = entry.center;
        const key = `${Math.round(cx / step)}|${Math.round(cz / step)}|${Math.round(height / step)}|${Math.round(entry.half / step)}`;
        if (key === entry.tileKey) return;
        if (source.document?.documentName === "Token" && now - entry.lastTileRequest < TOKEN_THROTTLE_MS) {
            this.stale.add(entry);
            return;
        }
        entry.tileKey = key;
        entry.lastTileRequest = now;
        const grid = this.gridWorld;
        const rays = Math.min(256, Math.max(64, Math.round((16 * entry.half) / grid)));
        this.occlusion.request(entry, {
            x: cx,
            y: cz,
            z: height,
            radius: entry.half,
            rays,
            prop: PROP_MAX_SQUARES * grid,
            pad: PROP_PAD_SQUARES * grid,
            span: SPAN_SQUARES * grid,
            near: CONTACT_SQUARES * grid,
            hang: HANG_SQUARES * grid,
            base: BASE_SQUARES * grid,
            reach: REACH_SQUARES * grid,
            wall: WALL_SQUARES * grid,
            ground: this.ground,
        });
    }

    get ground() {
        const board = game.Levels3DPreview?.board;
        if (!board?.parent) return undefined;
        return board.position.y + (board.geometry?.parameters?.height ?? 0) / 2;
    }

    onTileResult(entry, points, params) {
        if (this.entries.get(entry.light) !== entry || !this.useTiles) return;
        const half = params.rays * 2;
        entry.tiles = points ? { points: points.subarray(0, half), solid: points.subarray(half), origin: [params.x, params.y], radius: params.radius } : null;
        if (entry.center) this.rasterQueue.add(entry);
    }

    invalidate(bbox) {
        for (const entry of this.entries.values()) {
            if (!entry.center) continue;
            const [cx, cz] = entry.center;
            const dx = Math.max(bbox.minX - cx, 0, cx - bbox.maxX);
            const dz = Math.max(bbox.minZ - cz, 0, cz - bbox.maxZ);
            if (dx * dx + dz * dz > entry.half * entry.half) continue;
            entry.tileKey = null;
            this.stale.add(entry);
        }
    }

    tileSize(half) {
        const size = Math.min(MAX_TILE_SIZE, Math.max(MIN_BLOCK, nextPow2((half / this.gridWorld) * TEXELS_PER_SQUARE)));
        return Math.max(MIN_BLOCK, size >> this.shift);
    }

    shrink() {
        if (MAX_TILE_SIZE >> this.shift <= MIN_BLOCK) return false;
        this.shift++;
        this.stats.shrinks++;
        this.atlas.reset();
        for (const entry of this.entries.values()) {
            entry.block = null;
            if (entry.light.mask) entry.light.mask = null;
            if (entry.center) this.rasterQueue.add(entry);
        }
        this.manager.markRecordsDirty();
        this.manager.markGridDirty();
        return true;
    }

    rasterize(renderer) {
        const start = performance.now();
        const uploads = this.atlas.uploads;
        let count = 0;
        for (const entry of this.rasterQueue) {
            if (count >= MAX_RASTERS_PER_FRAME) break;
            this.rasterQueue.delete(entry);
            const size = this.tileSize(entry.half);
            if (entry.block?.size !== size) {
                this.atlas.release(entry.block);
                entry.block = this.atlas.allocate(size);
                if (!entry.block) {
                    if (!this.shrink()) {
                        entry.light.mask = null;
                        this.manager.markGridDirty();
                        this.manager.warnOnce?.("maskAtlas", "3D Canvas | Light mask atlas is full, some lights are unmasked");
                        continue;
                    }
                    this.rasterQueue.add(entry);
                    break;
                }
            }
            const data = this.rasterizer.draw({
                size,
                center: entry.center,
                half: entry.half,
                gridWorld: this.gridWorld,
                walls: entry.walls,
                tiles: this.useTiles ? (entry.tiles ?? null) : null,
            });
            this.atlas.upload(renderer, entry.block, data);
            entry.light.mask = { rect: this.atlas.rect(entry.block), center: [entry.center[0], entry.center[1], entry.half], coverage: summarizeMask(data, size) };
            count++;
        }
        if (count) {
            this.manager.markRecordsDirty();
            this.manager.markGridDirty();
        }
        this.stats.rasters += count;
        this.stats.lastFrameRasters = count;
        this.stats.lastFrameUploads = this.atlas.uploads - uploads;
        this.stats.maxFrameUploads = Math.max(this.stats.maxFrameUploads ?? 0, this.stats.lastFrameUploads);
        if (count) this.stats.rasterMs += performance.now() - start;
    }

    dispose() {
        this._hooks.forEach(([hook, id]) => Hooks.off(hook, id));
        for (const entry of this.entries.values()) this.release(entry);
        this.entries.clear();
        this.stale.clear();
        this.occlusion.dispose();
        this.atlas.dispose();
    }
}
