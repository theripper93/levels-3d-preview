import * as THREE from "three";
import { rawTexture } from "../three/rawTexture.js";
import { ATLASES, getSprite, spriteNameFromPath } from "./atlas.js";

const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "mov", "apng"];
const WARM_ATLASES = ["sprites"];

const materialCache = {};
const persistentMaps = new WeakSet();

export const BLENDING = {
    add: THREE.AdditiveBlending,
    normal: THREE.NormalBlending,
};

function isVideo(path) {
    return VIDEO_EXTENSIONS.includes(path.split(".").pop());
}

export function isPersistentMap(map) {
    return persistentMaps.has(map);
}

export async function getTextureMaterial(path, blending = THREE.AdditiveBlending, owner = null) {
    const video = isVideo(path);
    const key = `${path}${blending}`;
    if (materialCache[key] && !video) return materialCache[key];

    const tex = await game.Levels3DPreview.helpers.loadTexture(path);
    if (tex.image?.currentTime) tex.image.currentTime = 0;
    const material = new THREE.MeshBasicMaterial({
        map: rawTexture(tex),
        blending,
        transparent: true,
        side: THREE.DoubleSide,
        fog: true,
    });

    if (video) {
        owner?._toDispose.push(material);
        return material;
    }
    materialCache[key] = material;
    persistentMaps.add(material.map);
    return material;
}

export async function getSpriteMaterial(sprite, blending = THREE.AdditiveBlending, owner = null) {
    const entry = getSprite(sprite) ?? getSprite(spriteNameFromPath(sprite));
    if (!entry) return { material: await getTextureMaterial(sprite, blending, owner), uTileCount: 1, vTileCount: 1, index: 0, frames: 1, kind: "single" };
    const atlas = ATLASES[entry.atlas];
    return { material: await getTextureMaterial(atlas.src, blending), uTileCount: atlas.cols, vTileCount: atlas.rows, index: entry.index, frames: entry.frames, kind: entry.kind };
}

export async function preloadMaterials() {
    const materials = [];
    for (const id of WARM_ATLASES) {
        if (!ATLASES[id]) continue;
        for (const blending of Object.values(BLENDING)) materials.push({ material: await getTextureMaterial(ATLASES[id].src, blending), uTileCount: ATLASES[id].cols, vTileCount: ATLASES[id].rows });
    }
    return materials;
}
