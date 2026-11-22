import * as THREE from "three";
import { factor, MODULE_ID } from "../main.js";
import { posCanvasTo3d, unitsToPixels } from "../helpers/coords3d.js";

const INDOOR_SKIES = ["interior", "underground"];
const RING_RAYS = 16;
const RING_RANGE_CELLS = 15;
const MAX_RISE_CELLS = 20;
const FINE_RISE_CELLS = 4;
const REFINE_STEPS = 3;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const cache = new Map();
let epoch = 0;
let lists = null;
let listsRect = null;

function L() {
    return game.Levels3DPreview;
}

function isReady() {
    const l = L();
    return !!(l?._active && l._ready && l.interactionManager && canvas.scene);
}

function isIndoorSky() {
    return INDOOR_SKIES.includes(canvas.scene?.flags?.[MODULE_ID]?.dynamicSky?.setting);
}

function toElevation(y3d) {
    return (y3d * factor * canvas.scene.dimensions.distance) / canvas.scene.dimensions.size;
}

function cellOf(x, y) {
    const size = canvas.grid.size;
    const j = Math.floor(x / size);
    const i = Math.floor(y / size);
    return { i, j, cx: (j + 0.5) * size, cy: (i + 0.5) * size };
}

function collisionLists(cx, cy) {
    const reach = canvas.grid.size * (RING_RANGE_CELLS + 1);
    if (lists && listsRect && Math.abs(listsRect.x - cx) < canvas.grid.size && Math.abs(listsRect.y - cy) < canvas.grid.size) return lists;
    const im = L().interactionManager;
    im.forceSightCollisions({ x: cx - reach, y: cy - reach }, { x: cx + reach, y: cy + reach });
    lists = { sight: (im._sightCollisions.sight ?? []).slice(), move: (im._sightCollisions.move ?? []).slice() };
    listsRect = { x: cx, y: cy };
    queueMicrotask(() => (lists = listsRect = null));
    return lists;
}

function cast(targets, origin, dir, far) {
    const im = L().interactionManager;
    const rc = im.sightRaycaster;
    rc.far = far;
    rc.firstHitOnly = true;
    rc.set(origin, dir);
    return rc.intersectObjects(im.sightBroadphase.filter(rc, targets), true)[0] ?? null;
}

function offSeam(x, y, z) {
    const nudge = canvas.grid.size * 0.0173;
    return posCanvasTo3d({ x: x + nudge, y: y + nudge * 1.31, z });
}

function findFloor(targets, x, y, elevation) {
    const start = offSeam(x, y, elevation + canvas.scene.dimensions.distance * 0.25);
    const hit = cast(targets.move, start, DOWN, Infinity) ?? cast(targets.sight, start, DOWN, Infinity);
    return hit ? toElevation(hit.point.y) : elevation;
}

function findTop(targets, cx, cy, dir, reach, floor, start, maxTop) {
    const d = canvas.scene.dimensions.distance;
    const blocked = (h) => !!cast(targets, posCanvasTo3d({ x: cx, y: cy, z: h }), dir, reach);
    let lo = start;
    let hi = null;
    while (lo < maxTop) {
        const h = Math.min(lo + (lo - floor < FINE_RISE_CELLS * d ? d * 0.5 : d), maxTop);
        if (!blocked(h)) {
            hi = h;
            break;
        }
        lo = h;
    }
    if (hi === null) return maxTop;
    for (let k = 0; k < REFINE_STEPS; k++) {
        const mid = (lo + hi) / 2;
        if (blocked(mid)) lo = mid;
        else hi = mid;
    }
    return hi;
}

function virtualCeiling(targets, cx, cy, floor, realCeiling) {
    const d = canvas.scene.dimensions.distance;
    const probe = floor + d * 0.2;
    const lowTop = floor + d;
    const maxTop = Math.min(floor + d * MAX_RISE_CELLS, realCeiling);
    const range = (canvas.grid.size * RING_RANGE_CELLS) / factor;
    const margin = (canvas.grid.size * 0.5) / factor;
    const origin = posCanvasTo3d({ x: cx, y: cy, z: probe });
    const tops = [];
    let misses = 0;
    for (let n = 0; n < RING_RAYS; n++) {
        if (misses > RING_RAYS / 2) return Infinity;
        const a = (n / RING_RAYS) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const hit = cast(targets, origin, dir, range);
        if (!hit) {
            misses++;
            continue;
        }
        const top = findTop(targets, cx, cy, dir, hit.distance * 1.25 + margin, floor, probe, maxTop);
        if (top <= lowTop) misses++;
        else tops.push(top);
    }
    if (tops.length < RING_RAYS / 2) return Infinity;
    tops.sort((a, b) => a - b);
    const mid = tops.length >> 1;
    return tops.length % 2 ? tops[mid] : (tops[mid - 1] + tops[mid]) / 2;
}

function computeCeiling(targets, cx, cy, floor) {
    const d = canvas.scene.dimensions.distance;
    const up = cast(targets.sight, offSeam(cx, cy, floor + d * 0.1), UP, Infinity);
    let ceiling = up ? toElevation(up.point.y) : Infinity;
    if (isIndoorSky()) ceiling = Math.min(ceiling, virtualCeiling(targets.sight, cx, cy, floor, ceiling));
    return ceiling;
}

export function sightCeilingAt(x, y, elevation) {
    if (!isReady()) return { floor: elevation, ceiling: Infinity };
    const { i, j, cx, cy } = cellOf(x, y);
    const targets = collisionLists(cx, cy);
    const floor = findFloor(targets, x, y, elevation);
    const key = `${i}|${j}|${Math.round(floor * 10)}`;
    let ceiling = cache.get(key);
    if (ceiling === undefined) {
        ceiling = computeCeiling(targets, cx, cy, floor);
        cache.set(key, ceiling);
    }
    return { floor, ceiling };
}

export function cappedEyeHeight(token3d, raw) {
    const token = token3d?.token;
    if (!token?.document || !isReady()) return raw;
    const elevation = token.document.elevation;
    const center = token.center;
    const size = canvas.grid.size;
    const key = `${epoch}|${Math.floor(center.x / size)}|${Math.floor(center.y / size)}|${elevation}`;
    let state = token3d._sightCeiling;
    if (state?.key !== key) state = token3d._sightCeiling = { key, ...sightCeilingAt(center.x, center.y, elevation) };
    if (!Number.isFinite(state.ceiling)) return raw;
    const d = canvas.scene.dimensions.distance;
    return Math.min(raw, Math.max(state.ceiling - d * 0.1, state.floor + d * 0.2));
}

function clampedElevation(tokenDocument, changes) {
    const token3d = L().tokens?.[tokenDocument.id];
    if (!token3d) return null;
    const e0 = tokenDocument.elevation;
    const e1 = changes.elevation ?? e0;
    const x = changes.x ?? tokenDocument.x;
    const y = changes.y ?? tokenDocument.y;
    const half = canvas.grid.size / 2;
    const center = { x: x + tokenDocument.width * half, y: y + tokenDocument.height * half };
    const height = token3d.tokenHeight;
    const d = canvas.scene.dimensions.distance;
    let { floor, ceiling } = sightCeilingAt(center.x, center.y, e1);
    if (x === tokenDocument.x && y === tokenDocument.y && e1 > e0) {
        const { cx, cy } = cellOf(center.x, center.y);
        const start = e0 + d * 0.1;
        const hit = cast(collisionLists(cx, cy).sight, offSeam(center.x, center.y, start), UP, unitsToPixels(e1 + height - start));
        if (hit) {
            const hitElevation = toElevation(hit.point.y);
            if (hitElevation < ceiling) {
                ceiling = hitElevation;
                floor = Math.min(floor, e0);
            }
        }
    }
    if (!Number.isFinite(ceiling)) return null;
    const limit = Math.max(floor, ceiling - height);
    if (e1 <= limit + d * 0.05) return null;
    return Math.round(limit * 100) / 100;
}

export function invalidateSightCeiling() {
    cache.clear();
    lists = listsRect = null;
    epoch++;
    if (!isReady()) return;
    for (const token of canvas.tokens.placeables) token.initializeSources?.();
    canvas.perception.update({ initializeVision: true, initializeLightSources: true });
}

const debouncedInvalidate = foundry.utils.debounce(invalidateSightCeiling, 500);

export function setSightCeilingHooks() {
    for (const hook of ["createWall", "updateWall", "deleteWall", "createTile", "updateTile", "deleteTile", "3DCanvasBakeComplete"]) {
        Hooks.on(hook, () => {
            if (L()?._active) debouncedInvalidate();
        });
    }
    Hooks.on("3DCanvasSceneReady", () => invalidateSightCeiling());
    Hooks.on("canvasTearDown", () => {
        cache.clear();
        lists = listsRect = null;
        epoch++;
    });
    Hooks.on("updateScene", (scene, changes) => {
        if (scene.id === canvas.scene?.id && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.dynamicSky`)) debouncedInvalidate();
    });
    Hooks.on("preUpdateToken", (tokenDocument, changes) => {
        if (game.user.isGM || !isReady() || tokenDocument.parent?.id !== canvas.scene?.id) return;
        if (!("elevation" in changes) && !("x" in changes) && !("y" in changes)) return;
        let elevation = null;
        try {
            elevation = clampedElevation(tokenDocument, changes);
        } catch (e) {
            console.error(e);
        }
        if (elevation === null) return;
        const update = { elevation };
        if ("x" in changes) update.x = changes.x;
        if ("y" in changes) update.y = changes.y;
        setTimeout(() => tokenDocument.update(update));
        return false;
    });
}
