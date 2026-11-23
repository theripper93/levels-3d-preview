import { walkStep } from "../handlers/moveWalk.js";
import { movementFloor } from "../helpers/elevationFloor.js";

const MODULE_ID = "levels-3d-preview";
const SLICE_MS = 6;
const MAX_NODES = 50000;
const MAX_SEARCH_MS = 1000;
const MAX_CACHE = 1024;
const TURN_PENALTY = 0.001;
const DIAGONAL_PENALTY = 0.0001;
const CLIMB_PENALTY = 0.001;
const HEURISTIC_WEIGHT = 1.0001;
const STRAIGHT_ACTIONS = new Set(["fly", "burrow", "jump", "fall"]);
const WALKING_ACTIONS = new Set(["walk", "crawl"]);
const INVALIDATING_HOOKS = ["canvasReady", "updateScene", "3DCanvasSceneReady", "3DCanvasBakeComplete"];
const INVALIDATING_DOCUMENTS = ["Wall", "Token", "Region", "RegionBehavior", "Tile", "Level"];

const segmentCache = new Map();
let edgeCache = new Map();
let knownCache = { id: 0, drag: null, cells: new Map() };

export function isPathfindingEnabled() {
    return !!game.settings.get(MODULE_ID, "rulerPathfinding") && !!canvas?.ready && !canvas.grid.isGridless;
}

export function clearPathfindingCache() {
    segmentCache.clear();
    edgeCache = new Map();
}

export function onPathfindingSettingChange() {
    clearPathfindingCache();
    canvas?.tokens?.recalculatePlannedMovementPaths?.();
}

export function registerRulerPathfinding() {
    libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype.findMovementPath", findMovementPath, "MIXED");
    for (const hook of INVALIDATING_HOOKS) Hooks.on(hook, clearPathfindingCache);
    for (const name of INVALIDATING_DOCUMENTS) for (const action of ["create", "update", "delete"]) Hooks.on(`${action}${name}`, clearPathfindingCache);
    migrateRaycastRuler();
}

async function migrateRaycastRuler() {
    if (!game.user.isGM || game.settings.get(MODULE_ID, "rulerPathfindingMigrated")) return;
    const legacy = game.settings.storage.get("world")?.getSetting?.(`${MODULE_ID}.useRaycastRuler`);
    let enabled = false;
    try {
        enabled = JSON.parse(legacy?._source?.value ?? "false") === true;
    } catch {}
    if (enabled) await game.settings.set(MODULE_ID, "rulerPathfinding", true);
    await game.settings.set(MODULE_ID, "rulerPathfindingMigrated", true);
}

let bypass = false;

function constrainFoundPath(token, path, options) {
    bypass = true;
    try {
        return token.findMovementPath(path, options);
    } finally {
        bypass = false;
    }
}

function findMovementPath(wrapped, waypoints, options = {}) {
    if (bypass || waypoints.length < 2 || !this.scene || !isPathfindingEnabled()) return wrapped(waypoints, options);
    let search;
    try {
        search = new PathSearch(this, waypoints, options);
        if (search.run(SLICE_MS)) return wrapped(search.result, options);
    } catch (e) {
        console.error(e);
        return wrapped(waypoints, options);
    }
    let resolve;
    let cancelled = false;
    const job = { result: undefined, promise: new Promise((r) => (resolve = r)) };
    const finish = (result) => {
        if (job.result !== undefined) return;
        job.result = result;
        resolve(result);
    };
    const complete = (path) => {
        try {
            const inner = constrainFoundPath(this, path, options);
            if (inner.result !== undefined) finish(inner.result);
            else inner.promise.then(finish, () => finish(null));
        } catch (e) {
            console.error(e);
            finish(null);
        }
    };
    job.cancel = () => {
        cancelled = true;
        finish(null);
    };
    const step = () => {
        if (cancelled) return;
        if (this.destroyed || !this.scene) return finish(null);
        try {
            if (search.run(SLICE_MS)) complete(search.result);
            else setTimeout(step, 0);
        } catch (e) {
            console.error(e);
            complete(search.waypoints);
        }
    };
    setTimeout(step, options.delay ?? 0);
    return job;
}

function definedEntries(object) {
    const out = {};
    for (const [key, value] of Object.entries(object ?? {})) if (value !== undefined) out[key] = value;
    return out;
}

function completeWaypoints(token, waypoints) {
    const source = token.document._source;
    let previous = { x: source.x, y: source.y, elevation: source.elevation, width: source.width, height: source.height, depth: source.depth, shape: source.shape, level: source.level, action: token.document.movementAction };
    return waypoints.map((waypoint) => (previous = { ...previous, snapped: false, explicit: false, checkpoint: false, ...definedEntries(waypoint) }));
}

class PathSearch {
    constructor(token, waypoints, options) {
        this.context = new SearchContext(token, options);
        this.waypoints = completeWaypoints(token, waypoints).filter((waypoint, i) => i === 0 || !waypoint.intermediate);
        this.result = [waypoints[0]];
        this.index = 1;
        this.segment = null;
    }

    run(ms) {
        const start = performance.now();
        const deadline = start + ms;
        try {
            while (this.index < this.waypoints.length) {
                const from = this.waypoints[this.index - 1];
                const to = this.waypoints[this.index];
                if (!this.segment) {
                    const cached = this.context.cached(from, to);
                    if (cached) {
                        this.result.push(...cached);
                        this.index++;
                        continue;
                    }
                    this.segment = this.context.createSegment(from, to);
                }
                if (this.segment && !this.segment.step(deadline)) return false;
                this.result.push(...this.context.store(from, to, this.segment?.path ?? null));
                this.segment = null;
                this.index++;
            }
            return true;
        } finally {
            this.context.spent += performance.now() - start;
        }
    }
}

class SearchContext {
    constructor(token, options) {
        this.token = token;
        this.document = token.document;
        this.grid = canvas.grid;
        this.distance = canvas.grid.distance;
        this.diagonals = canvas.grid.diagonals;
        this.isHex = canvas.grid.isHexagonal;
        this.previewOption = !!options.preview;
        this.preview = this.previewOption && canvas.visibility.tokenVision && !game.user.isGM;
        this.measureOptions = { ...(options.measureOptions ?? {}), preview: this.previewOption };
        this.terrainOptions = { ...(options.terrainOptions ?? {}), preview: this.previewOption };
        this.spent = 0;
        const im = game.Levels3DPreview?._active && canvas.scene.flags?.[MODULE_ID]?.object3dSight ? game.Levels3DPreview.interactionManager : null;
        this.interactionManager = im ?? null;
        this.free = !!im?._tokenDrag && !!im.isTokenDragFree?.(token);
        this.floor = im ? movementFloor() : -Infinity;
        this.blockers = this.collectBlockers();
        this.terrainRegions = null;
        this.configs = new Map();
        this.restricted = !!canvas.visibility?.tokenVision && (!game.user.isGM || Array.from(canvas.effects?.visionSources ?? []).some((s) => s.active));
        this.explorable = this.restricted && !!canvas.fog?.fogExploration;
        const drag = canvas.tokens._draggedToken ?? null;
        if (!drag || knownCache.drag !== drag) knownCache = { id: knownCache.id + 1, drag, cells: new Map() };
        this.known = knownCache;
    }

    isKnownPoint(point) {
        if (!this.restricted) return true;
        if (canvas.visibility.testVisibility(point, { tolerance: 1 })) return true;
        return this.explorable && canvas.fog.isPointExplored(point);
    }

    isKnownCell(i, j) {
        if (!this.restricted) return true;
        const key = `${i}|${j}`;
        let known = this.known.cells.get(key);
        if (known === undefined) {
            known = this.isKnownPoint(this.grid.getCenterPoint({ i, j }));
            this.known.cells.set(key, known);
        }
        return known;
    }

    isKnownWaypoint(waypoint) {
        if (!this.restricted) return true;
        const center = this.document.getCenterPoint({ x: waypoint.x, y: waypoint.y, width: waypoint.width, height: waypoint.height, shape: waypoint.shape });
        return this.isKnownPoint(center);
    }

    get exhausted() {
        return this.spent > MAX_SEARCH_MS;
    }

    key(from, to) {
        const p = (w) => `${w.x},${w.y},${Math.round(w.elevation * 100)}`;
        return `${this.document.id}|${p(from)}|${p(to)}|${to.action}|${from.width}x${from.height}x${from.depth}|${from.shape}|${from.level}|${to.level}|${this.previewOption}|${this.free}|${this.restricted ? this.known.id : 0}`;
    }

    cached(from, to) {
        const path = segmentCache.get(this.key(from, to));
        return path ? [...path.slice(0, -1).map((w) => ({ ...w })), to] : null;
    }

    store(from, to, path) {
        const result = path ?? [to];
        const key = this.key(from, to);
        if (segmentCache.size >= MAX_CACHE) segmentCache.delete(segmentCache.keys().next().value);
        segmentCache.set(key, result.map((w) => ({ ...w })));
        return [...result.slice(0, -1), to];
    }

    createSegment(from, to) {
        const actionConfig = CONFIG.Token.movement.actions[to.action];
        if (!actionConfig || actionConfig.teleport || !actionConfig.walls || STRAIGHT_ACTIONS.has(to.action)) return null;
        if (from.width !== to.width || from.height !== to.height || from.shape !== to.shape) return null;
        if (!this.isKnownWaypoint(from) || !this.isKnownWaypoint(to)) return null;
        return new SegmentSearch(this, from, to);
    }

    collectBlockers() {
        const blockers = new Map();
        const occupied = new Set();
        const own = this.document;
        this.layerBlocking = typeof canvas.tokens.isOccupiedGridSpaceBlocking === "function";
        this.layerDifficult = typeof canvas.tokens.isOccupiedGridSpaceDifficult === "function";
        this.blockedSpaces = new Map();
        for (const other of canvas.tokens.placeables) {
            const document = other.document;
            if (other === this.token || other.isPreview || document.id === own.id || document.hidden) continue;
            if (!game.user.isGM && !other.visible) continue;
            const offsets = document.getOccupiedGridSpaceOffsets();
            for (const { i, j } of offsets) occupied.add(`${i}|${j}`);
            if (this.layerBlocking || document.disposition === own.disposition) continue;
            if (other.actor?.statuses?.has(CONFIG.specialStatusEffects.DEFEATED)) continue;
            const bottom = document.elevation;
            const top = bottom + Math.max(document.depth || 1, 0.5) * this.distance;
            for (const { i, j } of offsets) {
                const key = `${i}|${j}`;
                const list = blockers.get(key);
                if (list) list.push([bottom, top]);
                else blockers.set(key, [[bottom, top]]);
            }
        }
        this.occupied = occupied;
        return blockers;
    }

    isOccupied(offsets) {
        if (!this.occupied.size) return false;
        return offsets.some(({ i, j }) => this.occupied.has(`${i}|${j}`));
    }

    isBlocked(offsets, elevation, height) {
        if (!this.occupied.size) return false;
        if (this.layerBlocking) {
            const k = Math.floor(elevation / this.distance + 1e-8);
            for (const { i, j } of offsets) {
                if (!this.occupied.has(`${i}|${j}`)) continue;
                const key = `${i}|${j}|${k}`;
                let blocked = this.blockedSpaces.get(key);
                if (blocked === undefined) {
                    blocked = !!canvas.tokens.isOccupiedGridSpaceBlocking({ i, j, k }, this.token, { preview: this.preview });
                    this.blockedSpaces.set(key, blocked);
                }
                if (blocked) return true;
            }
            return false;
        }
        for (const { i, j } of offsets) {
            const list = this.blockers.get(`${i}|${j}`);
            if (!list) continue;
            for (const [bottom, top] of list) if (elevation < top && elevation + height > bottom) return true;
        }
        return false;
    }

    getTerrainRegions(segment) {
        if (this.terrainRegions) return this.terrainRegions;
        const data = { width: segment.from.width, height: segment.from.height, depth: segment.from.depth, shape: segment.from.shape, level: segment.from.level, action: segment.to.action, preview: this.previewOption };
        this.terrainRegions = [];
        for (const region of canvas.scene.regions) {
            if (region.hidden) continue;
            let affects = false;
            for (const behavior of region.behaviors) {
                if (behavior.disabled) continue;
                try {
                    if (behavior.system?._getTerrainEffects?.(this.document, data, this.terrainOptions)?.length) affects = true;
                } catch {
                    affects = true;
                }
                if (affects) break;
            }
            if (affects) this.terrainRegions.push(regionBounds(region));
        }
        return this.terrainRegions;
    }

    collisionConfig(segment) {
        const level = segment.from.level;
        if (this.configs.has(level)) return this.configs.get(level);
        const { width, height, depth, shape } = segment.from;
        const action = segment.to.action;
        let config = null;
        try {
            config = this.token._getMovementCollisionTestConfiguration({ width, height, depth, shape, level, action, actionConfig: CONFIG.Token.movement.actions[action] }, { preview: this.preview });
        } catch (e) {
            console.error(e);
        }
        if (!config?.level || !config.type) config = null;
        this.configs.set(level, config);
        return config;
    }

    testWalls(segment, origin, destination) {
        const config = this.collisionConfig(segment);
        if (!config) return false;
        config.source?.initialize({ ...origin, level: config.level.id });
        const backend = CONFIG.Canvas.polygonBackends[config.type];
        if (!this.preview) return !!backend.testCollision(origin, destination, { ...config, mode: "any" });
        const collisions = backend.testCollision(origin, destination, { ...config, mode: "all" });
        return collisions.some((c) => canvas.fog.isPointExplored(c) || canvas.visibility.testVisibility(c, { tolerance: 1 }));
    }
}

function regionBounds(region) {
    const bounds = region.object?.bounds;
    if (bounds) return bounds;
    let rect = null;
    for (const polygon of region.polygons ?? []) {
        const b = polygon.getBounds();
        rect = rect ? rect.enlarge(b) : b;
    }
    return rect;
}

class Heap {
    constructor() {
        this.ids = [];
        this.keys = [];
    }

    get size() {
        return this.ids.length;
    }

    push(id, key) {
        const ids = this.ids;
        const keys = this.keys;
        let n = ids.length;
        ids.push(id);
        keys.push(key);
        while (n > 0) {
            const parent = (n - 1) >> 1;
            if (keys[parent] <= key) break;
            ids[n] = ids[parent];
            keys[n] = keys[parent];
            n = parent;
        }
        ids[n] = id;
        keys[n] = key;
    }

    pop() {
        const ids = this.ids;
        const keys = this.keys;
        const top = ids[0];
        const lastId = ids.pop();
        const lastKey = keys.pop();
        const length = ids.length;
        if (!length) return top;
        let n = 0;
        while (true) {
            let child = 2 * n + 1;
            if (child >= length) break;
            if (child + 1 < length && keys[child + 1] < keys[child]) child++;
            if (keys[child] >= lastKey) break;
            ids[n] = ids[child];
            keys[n] = keys[child];
            n = child;
        }
        ids[n] = lastId;
        keys[n] = lastKey;
        return top;
    }
}

class SegmentSearch {
    constructor(context, from, to) {
        this.context = context;
        this.from = from;
        this.to = to;
        this.path = null;
        const document = context.document;
        const grid = context.grid;
        const { width, height, shape, depth } = from;
        this.size = { width, height, depth, shape };
        this.multi = width !== 1 || height !== 1;
        this.height = Math.max(depth || 1, 0.5) * context.distance;
        this.walking = !!context.interactionManager && !context.free && WALKING_ACTIONS.has(to.action);
        this.collide3D = !!context.interactionManager && !this.walking;
        this.pivot = document.getCenterPoint({ x: 0, y: 0, width, height, shape });
        const snapped = document.getSnappedPosition({ x: from.x, y: from.y, elevation: from.elevation, width, height, shape });
        const snappedCenter = document.getCenterPoint({ x: snapped.x, y: snapped.y, width, height, shape });
        this.start = grid.getOffset(document.getCenterPoint({ x: from.x, y: from.y, width, height, shape }));
        const startCell = grid.getCenterPoint(this.start);
        this.shift = { x: snappedCenter.x - startCell.x, y: snappedCenter.y - startCell.y };
        this.goal = grid.getOffset(document.getCenterPoint({ x: to.x, y: to.y, width, height, shape }));
        this.goalCube = context.isHex ? grid.offsetToCube(this.goal) : null;
        this.tolerance = context.distance * 0.5;
        this.nodes = [];
        this.index = new Map();
        this.heap = new Heap();
        this.candidate = -1;
        this.done = false;
        this.diagonalCost = { 0: 1, 1: Math.SQRT2, 2: 1.5, 3: 2, 4: 1, 5: 1, 6: Infinity }[context.diagonals] ?? 1;
        if (this.start.i === this.goal.i && this.start.j === this.goal.j) {
            this.done = true;
            return;
        }
        this.addNode(this.start.i, this.start.j, from.elevation, 0, 0, -1, -1);
    }

    nodeKey(i, j, elevation, parity) {
        return `${i}|${j}|${Math.round(elevation / (this.context.distance * 0.25))}|${parity}`;
    }

    addNode(i, j, elevation, parity, g, parent, direction) {
        const key = this.nodeKey(i, j, elevation, parity);
        const existing = this.index.get(key);
        if (existing !== undefined) {
            const node = this.nodes[existing];
            if (node.closed || node.g <= g) return;
            Object.assign(node, { elevation, g, parent, direction });
            this.heap.push(existing, g + this.heuristic(i, j));
            return;
        }
        const id = this.nodes.length;
        this.nodes.push({ i, j, elevation, parity, g, parent, direction, closed: false });
        this.index.set(key, id);
        this.heap.push(id, g + this.heuristic(i, j));
    }

    heuristic(i, j) {
        const distance = this.context.distance * HEURISTIC_WEIGHT;
        if (this.goalCube) return foundry.grid.HexagonalGrid.cubeDistance(this.context.grid.offsetToCube({ i, j }), this.goalCube) * distance;
        const di = Math.abs(i - this.goal.i);
        const dj = Math.abs(j - this.goal.j);
        const diagonal = Math.min(di, dj);
        const straight = Math.max(di, dj) - diagonal;
        if (!Number.isFinite(this.diagonalCost)) return (di + dj) * distance;
        return (straight + diagonal * this.diagonalCost) * distance;
    }

    stepCost(diagonal, parity) {
        if (!diagonal) return [1, parity];
        const d = this.context.diagonals;
        if (d === CONST.GRID_DIAGONALS.ALTERNATING_1) return [parity ? 2 : 1, parity ^ 1];
        if (d === CONST.GRID_DIAGONALS.ALTERNATING_2) return [parity ? 1 : 2, parity ^ 1];
        return [this.diagonalCost, 0];
    }

    positionAt(i, j) {
        const center = this.context.grid.getCenterPoint({ i, j });
        let x = Math.round(center.x + this.shift.x - this.pivot.x);
        let y = Math.round(center.y + this.shift.y - this.pivot.y);
        if (this.context.isHex && this.multi) {
            const snapped = this.context.document.getSnappedPosition({ x, y, ...this.size });
            x = Math.round(snapped.x);
            y = Math.round(snapped.y);
        }
        return { x, y };
    }

    centerAt(position, elevation) {
        const origin = this.context.document.getMovementOrigin({ x: position.x, y: position.y, elevation, ...this.size });
        return { x: Math.round(origin.x), y: Math.round(origin.y), elevation: origin.elevation };
    }

    isGoal(i, j) {
        return i === this.goal.i && j === this.goal.j;
    }

    step(deadline) {
        if (this.done) return true;
        const context = this.context;
        const grid = context.grid;
        let count = 0;
        while (this.heap.size) {
            if ((++count & 15) === 0 && performance.now() > deadline) return false;
            if (this.nodes.length > MAX_NODES || context.exhausted) break;
            const id = this.heap.pop();
            const node = this.nodes[id];
            if (node.closed) continue;
            node.closed = true;
            if (this.isGoal(node.i, node.j)) {
                if (!this.walking || Math.abs(node.elevation - this.to.elevation) <= this.tolerance) return this.finish(id);
                if (this.candidate < 0) this.candidate = id;
            }
            const position = this.positionAt(node.i, node.j);
            const center = this.centerAt(position, node.elevation);
            for (const offset of grid.getAdjacentOffsets({ i: node.i, j: node.j })) {
                const di = offset.i - node.i;
                const dj = offset.j - node.j;
                const diagonal = !context.isHex && di !== 0 && dj !== 0;
                if (diagonal && !Number.isFinite(this.diagonalCost)) continue;
                const edge = this.evaluate(node, position, center, offset);
                if (!edge) continue;
                const [cost, parity] = this.stepCost(diagonal, node.parity);
                const direction = (di + 2) * 5 + (dj + 2);
                const turn = (node.direction >= 0 && node.direction !== direction ? TURN_PENALTY : 0) + (diagonal ? DIAGONAL_PENALTY : 0) + (CLIMB_PENALTY * Math.abs(edge.elevation - node.elevation)) / context.distance;
                const g = node.g + (cost * edge.ratio + turn) * context.distance;
                this.addNode(offset.i, offset.j, edge.elevation, parity, g, id, direction);
            }
        }
        return this.finish(this.candidate);
    }

    evaluate(node, position, center, offset) {
        const context = this.context;
        const key = `${context.document.id}|${this.size.width}x${this.size.height}|${this.walking ? 1 : this.collide3D ? 2 : 0}|${this.to.action}|${this.from.level}|${context.preview}|${node.i}|${node.j}|${Math.round(node.elevation * 100)}>${offset.i}|${offset.j}`;
        let edge = edgeCache.get(key);
        if (edge === undefined) {
            edge = this.computeEdge(node, position, center, offset);
            edgeCache.set(key, edge);
        }
        if (!edge) return edge;
        const occupied = this.occupiedAt(this.positionAt(offset.i, offset.j), edge.elevation, offset);
        if (context.restricted && !occupied.every(({ i, j }) => context.isKnownCell(i, j))) return null;
        if (this.isGoal(offset.i, offset.j)) return edge;
        return context.isBlocked(occupied, edge.elevation, this.height) ? null : edge;
    }

    computeEdge(node, position, center, offset) {
        const context = this.context;
        const target = this.positionAt(offset.i, offset.j);
        let elevation = node.elevation;
        const flat = this.centerAt(target, elevation);
        if (!canvas.dimensions.rect.contains(flat.x, flat.y)) return null;
        const im = context.interactionManager;
        if (this.walking) {
            const walked = walkStep({ x: center.x, y: center.y, z: node.elevation }, { x: flat.x, y: flat.y, z: node.elevation });
            if (walked?.blocked) return null;
            if (walked) elevation = Math.max(Math.round(walked.elevation * 100) / 100, context.floor);
            else if (im.computeSightCollision({ x: center.x, y: center.y, z: center.elevation }, { x: flat.x, y: flat.y, z: flat.elevation }, "move")) return null;
        } else if (this.collide3D) {
            if (im.computeSightCollision({ x: center.x, y: center.y, z: center.elevation }, { x: flat.x, y: flat.y, z: flat.elevation }, "move")) return null;
        }
        const destination = elevation === node.elevation ? flat : this.centerAt(target, elevation);
        if (this.context.testWalls(this, center, destination)) return null;
        const ratio = this.terrainRatio(position, node.elevation, target, elevation, offset);
        return ratio === null ? null : { elevation, ratio };
    }

    occupiedAt(position, elevation, offset) {
        return this.multi ? this.context.document.getOccupiedGridSpaceOffsets({ x: position.x, y: position.y, elevation, ...this.size }) : [offset];
    }

    terrainRatio(position, elevation, target, targetElevation, offset) {
        const context = this.context;
        const regions = context.getTerrainRegions(this);
        const crowded = context.layerDifficult && context.isOccupied(this.occupiedAt(target, targetElevation, offset));
        if (!regions.length && !crowded) return 1;
        const { width, height } = context.document.getSize(this.size);
        const left = Math.min(position.x, target.x);
        const top = Math.min(position.y, target.y);
        const right = Math.max(position.x, target.x) + width;
        const bottom = Math.max(position.y, target.y) + height;
        if (!crowded && !regions.some((r) => !r || (r.right >= left && r.x <= right && r.bottom >= top && r.y <= bottom))) return 1;
        const token = this.context.token;
        const base = { ...this.size, level: this.from.level, action: this.to.action };
        const path = token.createTerrainMovementPath([{ ...base, ...position, elevation }, { ...base, ...target, elevation: targetElevation }], this.context.terrainOptions);
        const measurement = token.measureMovementPath(path, this.context.measureOptions);
        if (!(measurement.distance > 0)) return 1;
        const ratio = measurement.cost / measurement.distance;
        return Number.isFinite(ratio) ? Math.max(ratio, 0) : null;
    }

    finish(id) {
        this.done = true;
        if (id < 0) return true;
        const chain = [];
        for (let n = id; n >= 0; n = this.nodes[n].parent) chain.push(this.nodes[n]);
        chain.reverse();
        const points = chain.map((node) => ({ ...this.positionAt(node.i, node.j), elevation: node.elevation }));
        const path = [];
        const base = { ...this.size, level: this.from.level, action: this.to.action, snapped: true, explicit: false, checkpoint: false };
        for (let k = 1; k < points.length - 1; k++) {
            const a = points[k - 1];
            const b = points[k];
            const c = points[k + 1];
            const straight = b.x - a.x === c.x - b.x && b.y - a.y === c.y - b.y && Math.abs(b.elevation - a.elevation - (c.elevation - b.elevation)) < 1e-6;
            if (!straight) path.push({ ...base, ...b });
        }
        path.push(this.to);
        this.path = path;
        return true;
    }
}
