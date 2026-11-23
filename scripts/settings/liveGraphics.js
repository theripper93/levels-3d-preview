import * as THREE from "three";
import { refreshQuality } from "../vfx/quality.js";
import { refreshDressing } from "../scatter/scatterField.js";

const MODULE_ID = "levels-3d-preview";
const REBUILD_KEYS = ["enableShaders", "effectsToggle"];
const COMPOSER_KEYS = ["ambientOcclusion", "dofblur"];
const SHADOW_KEYS = ["shadowQuality", "softShadows"];

const pending = new Set();
const flush = foundry.utils.debounce(applyPending, 50);

export function queueGraphicsChange(key) {
    pending.add(key);
    flush();
}

export function updateRulerFontSize() {
    const resFactor = (window.innerHeight * basePixelRatio()) / 2160;
    document.documentElement.style.setProperty("--levels3d-ruler-font-size", `${game.settings.get(MODULE_ID, "resolutionMultiplier") * resFactor * 6}rem`);
}

function basePixelRatio() {
    return game.settings.get("core", "pixelRatioResolutionScaling") ? window.devicePixelRatio : 1;
}

function shadowMapType() {
    return game.settings.get(MODULE_ID, "softShadows") ? THREE.VSMShadowMap : THREE.PCFShadowMap;
}

function applyPending() {
    const keys = new Set(pending);
    pending.clear();
    refreshQuality();
    const has = (list) => list.some((key) => keys.has(key));
    if (keys.has("resolutionMultiplier")) applyResolution();
    const canvas3d = game.Levels3DPreview;
    if (!canvas3d?._active) {
        if (canvas3d?.renderer) canvas3d.renderer.shadowMap.type = shadowMapType();
        return;
    }
    if (has(REBUILD_KEYS)) {
        canvas3d.renderer.shadowMap.type = shadowMapType();
        return canvas3d.UTILS.debouncedReload();
    }
    if (has(COMPOSER_KEYS)) canvas3d.buildComposerPasses();
    else if (keys.has("antialiasing")) canvas3d.initAA();
    if (keys.has("effectsQuality")) {
        canvas3d.weather?.surface?.refreshQuality();
        refreshDressing();
    }
    if (keys.has("volumetricFog")) canvas3d.fogExploration?.refreshMist();
    if (has(SHADOW_KEYS)) applyShadows(canvas3d);
}

function applyResolution() {
    updateRulerFontSize();
    const resolution = basePixelRatio() * game.settings.get(MODULE_ID, "resolutionMultiplier");
    const pixi = canvas.app?.renderer;
    if (pixi) {
        pixi.resolution = resolution;
        pixi.resize(window.innerWidth, window.innerHeight);
    }
    const canvas3d = game.Levels3DPreview;
    if (!canvas3d?.renderer) return;
    canvas3d.resolutionMulti = resolution;
    canvas3d.renderer.setPixelRatio(resolution);
    canvas3d.composer.setPixelRatio(resolution);
    canvas3d.resizeCanvasToDisplaySize();
}

function applyShadows(canvas3d) {
    const quality = game.settings.get(MODULE_ID, "shadowQuality");
    const type = shadowMapType();
    const renderer = canvas3d.renderer;
    const illumination = canvas3d.lights.globalIllumination;
    const sun = illumination?.global?.sunlight;
    const lights = [...Object.values(canvas3d.lights.sceneLights), ...Object.values(canvas3d.tokens).map((token) => token.light)].filter((light) => light?.light3d);
    const casters = lights.filter((light) => !light.light3d.isClusterLight).map((light) => [light.light3d, !!light.wantsShadow?.(light.light)]);
    const promoted = lights.filter((light) => (light.light3d.isClusterLight ? light.wantsShadow?.(light.light) : !light.wantsShadow?.(light.light) && light.clustered));
    if (sun) casters.push([sun, quality > 0 && illumination._distance !== 0 && illumination.sunShadows]);
    const previous = { type: renderer.shadowMap.type, cast: casters.map(([light]) => light.castShadow) };
    const change = {
        apply: () => {
            renderer.shadowMap.type = type;
            casters.forEach(([light, cast]) => (light.castShadow = cast));
        },
        revert: () => {
            renderer.shadowMap.type = previous.type;
            casters.forEach(([light], index) => (light.castShadow = previous.cast[index]));
        },
        done: () => {
            illumination?._setShadowQuality();
            change.apply();
            lights.forEach((light) => light.light3d.shadow.mapSize.setScalar(256 * quality));
            casters.forEach(([light]) => resetShadowMap(light.shadow));
            promoted.forEach((light) => light.refresh());
        },
    };
    const recompile = previous.type !== type || casters.some(([, cast], index) => cast !== previous.cast[index]);
    if (recompile) canvas3d.lightWarmup.warmChange(change);
    else {
        change.apply();
        change.done();
    }
}

function resetShadowMap(shadow) {
    shadow.map?.depthTexture?.dispose();
    shadow.dispose();
    shadow.map = null;
    shadow.mapPass = null;
    shadow.needsUpdate = true;
}
