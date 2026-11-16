import { Scene } from "three";

const LEGACY_INTENSITY_SCALE = Math.PI;
const COLOR_MANAGEMENT_EXPOSURE_SCALE = 1.1;

const PUNCTUAL_INTENSITY_SCALE = 0.2;

export function punctualToPhysical({ intensity, distance, decay }) {
    return { intensity: intensity * PUNCTUAL_INTENSITY_SCALE, distance, decay };
}

function toPhysical(light) {
    const legacy = { intensity: light.intensity };
    light.intensity *= light.isPointLight || light.isSpotLight ? PUNCTUAL_INTENSITY_SCALE : LEGACY_INTENSITY_SCALE;
    return legacy;
}

const pendingRestores = new WeakMap();

function onBeforeRender(renderer, scene) {
    const restores = [[renderer, { toneMappingExposure: renderer.toneMappingExposure }]];
    renderer.toneMappingExposure *= COLOR_MANAGEMENT_EXPOSURE_SCALE;
    scene.traverseVisible((object) => {
        if (object.isLight) restores.push([object, toPhysical(object)]);
    });
    pendingRestores.set(scene, restores);
}

function onAfterRender(renderer, scene) {
    const restores = pendingRestores.get(scene);
    if (!restores) return;
    for (const [target, legacy] of restores) Object.assign(target, legacy);
    pendingRestores.delete(scene);
}

export function injectLegacyLights() {
    Scene.prototype.onBeforeRender = onBeforeRender;
    Scene.prototype.onAfterRender = onAfterRender;
}
