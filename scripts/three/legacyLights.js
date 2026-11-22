import { Object3D, Scene } from "three";

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
const lights = new Set();

function track(object) {
    if (object.isLight) lights.add(object);
}

function onBeforeRender(renderer, scene) {
    const restores = [[renderer, { toneMappingExposure: renderer.toneMappingExposure }]];
    renderer.toneMappingExposure *= COLOR_MANAGEMENT_EXPOSURE_SCALE;
    for (const light of lights) {
        let shown = light.visible;
        let root = light;
        while (root.parent) {
            root = root.parent;
            shown &&= root.visible;
        }
        if (!root.isScene) lights.delete(light);
        else if (shown && root === scene) restores.push([light, toPhysical(light)]);
    }
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
    const add = Object3D.prototype.add;
    const attach = Object3D.prototype.attach;
    Object3D.prototype.add = function (...objects) {
        const result = add.apply(this, objects);
        for (const object of objects) if (object?.isObject3D) object.traverse(track);
        return result;
    };
    Object3D.prototype.attach = function (object) {
        const result = attach.call(this, object);
        object.traverse(track);
        return result;
    };
}
