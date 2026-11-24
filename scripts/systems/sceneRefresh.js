import { MODULE_ID } from "../main.js";
import { recomputeGravityDebounced } from "../entities/tile3d.js";
import { clearParkedTiles } from "./levelSwitch.js";

const CORE_REDRAW_KEYS = ["width", "height", "padding", "shiftX", "shiftY", "grid.type", "grid.size", "grid.distance", "grid.units", "weather"];
const REBUILD_KEYS = ["width", "height", "padding", "grid.size", "grid.distance"];
const BOARD_KEYS = ["shiftX", "shiftY", "grid.type"];
const TABLE_KEYS = ["grid.type"];
const LEVEL_REDRAW_KEYS = ["background", "elevation", "foreground", "fog", "textures", "visibility"];

let pendingRedraw = null;
let afterRedraw = null;

function markRedraw(scene, soft, keys = []) {
    const previous = pendingRedraw?.sceneId === scene.id ? pendingRedraw : null;
    pendingRedraw = {
        sceneId: scene.id,
        soft: soft && (previous?.soft ?? true),
        board: !!previous?.board || keys.some((key) => BOARD_KEYS.includes(key)),
        table: !!previous?.table || keys.some((key) => TABLE_KEYS.includes(key)),
    };
}

function trackSceneRedraw(scene, changes) {
    const embedded = Object.values(scene.constructor.metadata.embedded);
    const keys = Object.keys(foundry.utils.flattenObject(changes)).filter((key) => CORE_REDRAW_KEYS.includes(key) || embedded.includes(key));
    if (!keys.length) return;
    const soft = keys.every((key) => !REBUILD_KEYS.includes(key) && (key === "levels" || !embedded.includes(key)));
    markRedraw(scene, soft, keys);
}

export function takeSceneRedraw(scene) {
    const redraw = pendingRedraw;
    pendingRedraw = null;
    afterRedraw = redraw?.soft && redraw.sceneId === scene?.id ? redraw : null;
    return !!afterRedraw;
}

function finishRedraw(L) {
    const redraw = afterRedraw;
    afterRedraw = null;
    if (!redraw) return;
    if (redraw.board) L.createBoard();
    if (redraw.table) L.createTable();
}

function sceneContentsChanged(L) {
    const im = L.interactionManager;
    im._candidateCache = im._rayMemo = null;
    im.sightOccluders?.entries.clear();
    recomputeGravityDebounced();
    Hooks.callAll("3DCanvasSceneReady", L, { levelSwitch: true });
}

function refreshSight(L) {
    const enabled = canvas.scene.getFlag(MODULE_ID, "object3dSight") ?? false;
    if (enabled === L.object3dSight) return;
    L.object3dSight = enabled;
    const workers = L.workers;
    workers.clearMeshes();
    if (workers.enabled) {
        const tiles = Object.values(L.tiles).filter((tile3d) => tile3d?.mesh);
        workers._waitingForInit = true;
        if (tiles.length) tiles.forEach((tile3d) => tile3d.sendToWorker());
        else workers._visionReady = true;
    }
    L.interactionManager.forceSightCollisions();
    L._refreshPerception();
}

function refreshWalls(L) {
    for (const wall3d of Object.values(L.walls)) wall3d.destroy();
    L.walls = {};
    L.doors = {};
    L.createWalls();
    sceneContentsChanged(L);
}

async function refreshTiles(L) {
    if (canvas.scene.getFlag(MODULE_ID, "showSceneFloors") === false) {
        for (const [id, tile3d] of Object.entries(L.tiles)) {
            tile3d.destroy(true);
            L.workers.removeMesh(id);
        }
        L.tiles = {};
        clearParkedTiles();
    } else {
        const loads = canvas.tiles.placeables.filter((tile) => !L.tiles[tile.id]).map((tile) => L.createTile(tile));
        await Promise.all(loads);
    }
    if (L._active) sceneContentsChanged(L);
}

function refreshLights(L) {
    for (const light3d of Object.values(L.lights.sceneLights)) light3d.destroy();
    L.lights.sceneLights = {};
    L.createSceneLights();
}

function refreshFog(L) {
    L.createFog();
    L._refreshPerception();
}

export function refreshSceneSettings(L, scene, changes) {
    const flags = changes.flags?.[MODULE_ID] ?? {};
    const has = (key) => key in flags || `-=${key}` in flags;
    const fogChanged = "fog" in changes || "tokenVision" in changes || has("enableFogOfWar");
    const wallsChanged = has("showSceneWalls") || has("showSceneDoors");
    const inPlace = [has("object3dSight"), wallsChanged, has("showSceneFloors"), has("renderSceneLights"), fogChanged];
    if (inPlace.some(Boolean) && !L._ready) {
        L.reload();
        return true;
    }
    if (has("mirrorLevels")) L.mirrorLevelsVisibility = scene.getFlag(MODULE_ID, "mirrorLevels") ?? true;
    if (has("object3dSight")) refreshSight(L);
    if (wallsChanged) refreshWalls(L);
    if (has("showSceneFloors")) refreshTiles(L);
    if (has("renderSceneLights")) refreshLights(L);
    if (fogChanged) refreshFog(L);
    trackSceneRedraw(scene, changes);
}

export function setSceneRefreshHooks() {
    Hooks.on("updateLevel", (level, changes) => {
        const L = game.Levels3DPreview;
        if (!L?._active || level.parent !== canvas.scene || !level.isVisible) return;
        if (LEVEL_REDRAW_KEYS.some((key) => key in changes)) markRedraw(level.parent, true);
    });
    Hooks.on("3DCanvasSceneReady", (L, options) => {
        if (options?.levelSwitch) finishRedraw(L);
    });
}
