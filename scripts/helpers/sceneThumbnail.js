import * as THREE from "three";
import { factor } from "../main.js";
import { fogUniforms } from "../systems/Fog.js";
import { Region3D } from "../entities/region3d.js";
import { Shape3D } from "../entities/shape3d.js";

const THUMB = { width: 300, height: 100, format: "image/webp", quality: 0.8 };
const AUTO_FOV = 20;
const AUTO_PITCH = 50;
const AUTO_YAW = 30;
const SETTLE_TIMEOUT = 30000;
const SETTLE_FRAMES = 3;
const FRAME_TIMEOUT = 10000;

export function setThumbnailHooks() {
    Hooks.on("getSceneContextOptions", (app, options) => {
        options.push({
            label: "levels3dpreview.thumbnail.generate",
            icon: "fa-solid fa-cube",
            visible: (li) => game.user.isGM && !!game.Levels3DPreview?._active && canvas.scene?.id === li.dataset.entryId,
            onClick: async (event, li) => {
                const scene = game.scenes.get(li.dataset.entryId);
                try {
                    await updateSceneThumbnail(scene);
                    ui.notifications.info("SCENE.GenerateThumbSuccess", { format: { name: scene.name } });
                } catch (err) {
                    ui.notifications.error(err.message);
                }
            },
        });
    });
}

export async function updateSceneThumbnail(scene = canvas.scene, options = {}) {
    if (!game.user.can("FILES_UPLOAD")) throw new Error(game.i18n.localize("SCENE.GenerateThumbUploadDenied"));
    const { thumb } = await captureSceneThumbnail(scene, options);
    await scene.update({ thumb }, { diff: false });
    await scene.setFlag("levels-3d-preview", "thumb3d", scene._source.thumb?.split("?")[0] ?? null);
    return thumb;
}

export async function captureSceneThumbnail(scene = canvas.scene, { framing = "view", bounds = null } = {}) {
    const L = game.Levels3DPreview;
    if (!L?._active || scene?.id !== canvas.scene?.id) throw new Error(game.i18n.localize("levels3dpreview.thumbnail.notActive"));
    await waitForSettled(L, scene.id);
    const source = await captureFrame(L, framing === "auto" ? autoPose(L, bounds) : null);
    const thumb = await foundry.helpers.media.ImageHelper.canvasToBase64(source, THUMB.format, THUMB.quality);
    return { thumb, ...THUMB };
}

function isSettled(L) {
    if (!L._ready || L._settling || L._loadingScatter) return false;
    if (!Object.values(L.tiles).every((tile) => !tile || tile._loaded)) return false;
    return L._isSettled();
}

async function waitForSettled(L, sceneId) {
    const start = performance.now();
    let quiet = 0;
    while (quiet < SETTLE_FRAMES && performance.now() - start < SETTLE_TIMEOUT) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!L._active || L._builtSceneId !== sceneId) throw new Error(game.i18n.localize("levels3dpreview.thumbnail.notActive"));
        quiet = isSettled(L) ? quiet + 1 : 0;
    }
}

function captureFrame(L, pose) {
    return new Promise((resolve, reject) => {
        const composer = L.composer;
        const own = Object.hasOwn(composer, "render");
        const render = composer.render;
        const release = () => (own ? (composer.render = render) : delete composer.render);
        const timeout = setTimeout(() => {
            release();
            reject(new Error(game.i18n.localize("levels3dpreview.thumbnail.notActive")));
        }, FRAME_TIMEOUT);
        composer.render = function (...args) {
            release();
            clearTimeout(timeout);
            const draw = () => render.apply(composer, args);
            try {
                resolve(renderThumbnail(L, pose, draw));
            } catch (err) {
                reject(err);
            } finally {
                draw();
            }
        };
    });
}

function renderThumbnail(L, pose, draw) {
    const restore = [];
    const hide = (object) => {
        if (!object?.isObject3D || !object.visible) return;
        object.visible = false;
        restore.push(() => (object.visible = true));
    };
    const show = (object) => {
        if (!object?.isObject3D || object.visible) return;
        object.visible = true;
        restore.push(() => (object.visible = false));
    };
    try {
        prepareScene(L, hide, show, restore);
        if (pose) applyPose(L, pose, restore);
        L.clusterManager.update();
        draw();
        return cropFrame(L);
    } finally {
        for (const undo of restore.reverse()) undo();
        L.clusterManager.update();
    }
}

function prepareScene(L, hide, show, restore) {
    for (const token of Object.values(L.tokens)) hide(token?.mesh);
    for (const light of Object.values(L.lights.sceneLights)) {
        hide(light?.dragHandle);
        hide(light?.lightHelper);
    }
    for (const sound of Object.values(L.sounds)) hide(sound?.mesh);
    for (const note of Object.values(L.notes)) hide(note?.mesh);
    for (const tile of Object.values(L.tiles)) {
        if (!tile?.mesh) continue;
        if (tile.tile?.document?.hidden) hide(tile.mesh);
        else if (L.hiddenTiles?.has(tile.tile?.document?.id)) show(tile.mesh);
        if (tile.controlledBox?.parent) hide(tile.controlledBox);
        hide(tile.sightMesh);
        hide(tile._decalCone);
    }
    for (const region of Region3D.regions.values()) if (!region.hasShaders) hide(region);
    for (const finder of L.rangeFinders) finder.meshes?.forEach(hide);
    for (const ping of L.pings) hide(ping?.ping);
    for (const cursor of Object.values(L.cursors?._cursors ?? {})) hide(cursor);
    for (const child of L.scene.children) {
        if (child instanceof Shape3D || child.name?.includes("ruler-3d")) hide(child);
    }
    hide(L.grid?.grid);
    hide(L.grid?.secondaryGrid);
    hide(L.transformControls?.getHelper?.());
    hide(L.outline?.root);
    hide(L.detectionLook?.root);
    hide(L.turnStartMarker?.mesh);
    hide(L.firstPerson?.dot);
    hide(L.fogExploration?.mist?.mesh);
    const extra = [];
    Hooks.callAll("3DCanvasThumbnailCapture", extra);
    extra.forEach(hide);

    const sceneVisible = L.scene.visible;
    L.scene.visible = true;
    restore.push(() => (L.scene.visible = sceneVisible));

    for (const shader of L.shaderHandler?.shaders ?? []) {
        const grid = shader.uniforms?.gridAlpha;
        if (!grid?.value) continue;
        const alpha = grid.value;
        grid.value = 0;
        restore.push(() => (grid.value = alpha));
    }

    const fogDimensions = fogUniforms.sceneDimensions.value;
    fogUniforms.sceneDimensions.value = new THREE.Vector2(0, 0);
    restore.push(() => (fogUniforms.sceneDimensions.value = fogDimensions));

    const gi = L.lights.globalIllumination;
    if (gi?.workLight) {
        const work = gi.workLight;
        gi.workLight = 0;
        refreshAmbient(gi);
        restore.push(() => {
            gi.workLight = work;
            refreshAmbient(gi);
        });
    }
}

function refreshAmbient(gi) {
    if (gi.sky) gi.updateAtmosphere();
    else gi._mixWorkLight();
}

function autoPose(L, bounds) {
    const initial = canvas.scene.getFlag("levels-3d-preview", "initialPosition");
    if (Number.isFinite(initial?.position?.x) && Number.isFinite(initial?.target?.x)) {
        return { position: new THREE.Vector3().copy(initial.position), target: new THREE.Vector3().copy(initial.target), fov: L.camera.fov };
    }
    const box = bounds?.isBox3 && !bounds.isEmpty() ? bounds : sceneBounds();
    const center = box.getCenter(new THREE.Vector3());
    const pitch = THREE.MathUtils.degToRad(AUTO_PITCH);
    const yaw = THREE.MathUtils.degToRad(AUTO_YAW);
    const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const forward = back.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(AUTO_FOV / 2));
    const tanH = (THUMB.width / THUMB.height) * tanV;
    const corner = new THREE.Vector3();
    let distance = 0;
    for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
        distance = Math.max(distance, Math.abs(corner.dot(right)) / tanH - corner.dot(forward));
    }
    const tanFull = tanV * Math.max(1, THUMB.width / THUMB.height / L.camera.aspect);
    const radius = box.getSize(corner).length() / 2;
    return { position: center.clone().addScaledVector(back, distance), target: center, fov: THREE.MathUtils.radToDeg(2 * Math.atan(tanFull)), far: distance + radius * 2 };
}

function sceneBounds() {
    const { sceneX, sceneY, sceneWidth, sceneHeight } = canvas.scene.dimensions;
    const y = (canvas.primary?.background?.elevation ?? 0) * canvas.scene.dimensions.distancePixels / factor;
    return new THREE.Box3(new THREE.Vector3(sceneX / factor, y, sceneY / factor), new THREE.Vector3((sceneX + sceneWidth) / factor, y, (sceneY + sceneHeight) / factor));
}

function applyPose(L, pose, restore) {
    const camera = L.camera;
    const target = L.controls.target;
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov, far: camera.far, target: target.clone() };
    restore.push(() => {
        camera.position.copy(saved.position);
        camera.quaternion.copy(saved.quaternion);
        camera.fov = saved.fov;
        camera.far = saved.far;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        target.copy(saved.target);
        if (L.lights.globalIllumination?.sky) L.lights.globalIllumination.updateAtmosphere();
    });
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.fov = pose.fov;
    if (pose.far) camera.far = Math.max(camera.far, pose.far);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    target.copy(pose.target);
    if (L.lights.globalIllumination?.sky) L.lights.globalIllumination.updateAtmosphere();
}

function cropFrame(L) {
    const source = L.renderer.getContext().canvas;
    const buffer = L.renderer.getDrawingBufferSize(new THREE.Vector2());
    const aspect = THUMB.width / THUMB.height;
    const sw = Math.min(buffer.x, buffer.y * aspect);
    const sh = sw / aspect;
    const sx = (buffer.x - sw) / 2;
    const sy = source.height - buffer.y + (buffer.y - sh) / 2;
    const output = document.createElement("canvas");
    output.width = THUMB.width;
    output.height = THUMB.height;
    const context = output.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, sx, sy, sw, sh, 0, 0, THUMB.width, THUMB.height);
    return output;
}
