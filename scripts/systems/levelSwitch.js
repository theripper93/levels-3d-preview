import { Region3D } from "../entities/region3d.js";
import { elevationFloor } from "../helpers/elevationFloor.js";
import { scatterFields } from "../scatter/scatterField.js";

const LOAD_TIMEOUT = 20000;

const parkedTiles = new Map();

export function canSwitchLevel(L, { nextScene, nextLevel } = {}) {
    return !!(L._active && L._ready && nextScene && nextLevel) && nextScene.id === canvas.scene?.id && nextLevel.id !== canvas.level?.id && L._builtSceneId === nextScene.id;
}

async function preload(L, loads) {
    let settled = false;
    const timeout = new Promise((resolve) => setTimeout(resolve, LOAD_TIMEOUT));
    const ready = (async () => {
        await Promise.all(loads);
        let pending = scatterFields().filter((field) => !field.base && !field.tile3d._parked);
        while (pending.length) {
            await Promise.all(pending.map((field) => field.generate().catch(() => null)));
            await new Promise((resolve) => setTimeout(resolve, 50));
            pending = pending.filter((field) => !field.base && !field.disposed && !field.tile3d._parked && !settled);
        }
    })();
    await Promise.race([ready, timeout]);
    settled = true;
}

export async function switchLevel(L) {
    L._levelSwitch = false;
    const loads = [];
    for (const [id, tile3d] of Object.entries(L.tiles)) {
        const placeable = canvas.tiles.get(id);
        if (placeable) tile3d.tile = tile3d.placeable = placeable;
        else if (tile3d.mesh) parkTile(L, id, tile3d);
        else tile3d.destroy();
    }
    for (const placeable of canvas.tiles.placeables) {
        if (L.tiles[placeable.id]) continue;
        const tile3d = parkedTiles.get(placeable.id);
        if (tile3d) unparkTile(L, tile3d, placeable);
        else loads.push(L.createTile(placeable));
    }
    const sceneId = canvas.scene.id;
    const levelId = canvas.level.id;
    await preload(L, loads);
    if (!L._active || canvas.scene?.id !== sceneId || canvas.level?.id !== levelId) return;
    L._pauseRendering = false;
    const bindings = [
        [L.tokens, canvas.tokens, "token", (token) => L.addToken(token)],
        [L.lights.sceneLights, canvas.lighting, "light", (light) => L.addLight(light)],
        [L.sounds, canvas.sounds, "sound", (sound) => L.addSound(sound)],
        [L.notes, canvas.notes, "note", (note) => L.createNote(note)],
    ];
    for (const [entities, layer, key, create] of bindings) {
        for (const [id, entity] of Object.entries(entities)) {
            const placeable = layer.get(id);
            if (placeable) {
                entity[key] = entity.placeable = placeable;
                continue;
            }
            entity.destroy();
            delete entities[id];
        }
        for (const placeable of layer.placeables) if (!entities[placeable.id]) create(placeable);
    }
    for (const token3d of Object.values(L.tokens)) {
        token3d.isOwner = token3d.token.isOwner;
        if (token3d.light) token3d.light.light = token3d.token;
    }
    Object.values(L.walls).forEach((wall) => wall.destroy());
    L.createWalls();
    for (const region of [...Region3D.regions.keys()]) if (!region.rendered) Region3D.destroy(region);
    L.createRegions();
    L.createFog();
    if (L.scene.background?.isColor && !(canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false)) L.scene.background.set(canvas.level.background.color ?? 0xffffff);
    if (L._boardKey !== `${canvas.level.background.src}|${canvas.primary.background.elevation}`) L.createBoard();
    if (L._tableFloor !== elevationFloor()) L.createTable();
    L.hideBoard();
    L.refreshRulers();
    L._refreshPerception();
    setTimeout(() => {
        Object.values(L.tokens).forEach((token) => {
            token.forceDrawBars();
            token.drawName();
        });
    }, 200);
    Hooks.callAll("3DCanvasSceneReady", L, { levelSwitch: true });
}

function tileSatellites(tile3d) {
    const objects = [tile3d.mesh];
    tile3d.mesh.traverse((object) => {
        const state = object.mapMakerTerrain;
        if (!state) return;
        for (const layer of state.cover?.layers ?? []) objects.push(layer.mesh);
        for (const entry of state.water?.entries?.values() ?? []) objects.push(entry.inner?.mesh, entry.ring?.mesh);
    });
    return objects.filter(Boolean);
}

function parkTile(L, id, tile3d) {
    tile3d._parked = true;
    tile3d._parkedObjects = tileSatellites(tile3d);
    for (const object of tile3d._parkedObjects) object.removeFromParent();
    L.workers.parkMesh(id);
    delete L.tiles[id];
    parkedTiles.set(id, tile3d);
}

function unparkTile(L, tile3d, placeable) {
    parkedTiles.delete(placeable.id);
    tile3d.tile = tile3d.placeable = placeable;
    for (const object of tile3d._parkedObjects) L.scene.add(object);
    tile3d._parkedObjects = null;
    tile3d._parked = false;
    L.tiles[placeable.id] = tile3d;
    L.workers.parkMesh(placeable.id, false);
    if (tile3d.scatterField && !tile3d.scatterField.base) tile3d.scatterField.schedule();
}

function dropParkedTile(id) {
    const tile3d = parkedTiles.get(id);
    if (!tile3d) return;
    parkedTiles.delete(id);
    const tiles = game.Levels3DPreview.tiles;
    const current = tiles[id];
    tile3d.destroy();
    if (current) tiles[id] = current;
}

export function clearParkedTiles() {
    for (const id of [...parkedTiles.keys()]) dropParkedTile(id);
}

export function setLevelSwitchHooks() {
    for (const hook of ["updateTile", "deleteTile"]) Hooks.on(hook, (document) => dropParkedTile(document.id));
}
