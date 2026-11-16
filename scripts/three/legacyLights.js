import { Scene } from "three";

const LEGACY_INTENSITY_SCALE = Math.PI;
const COLOR_MANAGEMENT_EXPOSURE_SCALE = 1.1;
const FIT_SAMPLES = 120;
const FIT_RANGE = 1.5;
const FIT_RADII = [0.3, 1, 3];
const falloffFits = new Map();

function legacyFalloff(x, decay) {
    return x < 1 ? Math.pow(1 - x, decay) : 0;
}

function physicalFalloff(x, radius, cutoff, decay) {
    const w = Math.max(0, 1 - Math.pow(x / cutoff, 4));
    return (w * w * Math.pow(radius, decay)) / Math.max(Math.pow(x * radius, decay), 0.01);
}

function perceptual(value) {
    return Math.pow(Math.max(value, 0), 1 / 2.2);
}

const SCALE_MIN = perceptual(1e-3);
const SCALE_MAX = perceptual(10);

function fitScale(legacy, cutoff, decay) {
    let pp = 0;
    let pl = 0;
    let ll = 0;
    let i = 0;
    for (const radius of FIT_RADII) {
        for (let s = 0; s < FIT_SAMPLES; s++, i++) {
            const p = perceptual(physicalFalloff(((s + 0.5) / FIT_SAMPLES) * FIT_RANGE, radius, cutoff, decay));
            pp += p * p;
            pl += p * legacy[i];
            ll += legacy[i] * legacy[i];
        }
    }
    const k = Math.min(Math.max(pp > 0 ? pl / pp : SCALE_MAX, SCALE_MIN), SCALE_MAX);
    return { scale: k ** 2.2, error: k * k * pp - 2 * k * pl + ll };
}

function fitFalloff(legacyDecay) {
    const key = Math.round(legacyDecay * 20) / 20;
    if (falloffFits.has(key)) return falloffFits.get(key);
    const legacy = FIT_RADII.flatMap(() => Array.from({ length: FIT_SAMPLES }, (_, s) => perceptual(legacyFalloff(((s + 0.5) / FIT_SAMPLES) * FIT_RANGE, key))));
    let best = { cutoff: 1, decay: 0, scale: 1, error: Infinity };
    for (let decay = 0; decay <= 1; decay += 0.25) {
        for (let cutoff = 0.4; cutoff <= 2; cutoff += 0.02) {
            const { scale, error } = fitScale(legacy, cutoff, decay);
            if (error < best.error) best = { cutoff, decay, scale, error };
        }
    }
    falloffFits.set(key, best);
    return best;
}

function toPhysical(light) {
    const isPunctual = light.isPointLight || light.isSpotLight;
    const legacy = isPunctual ? { intensity: light.intensity, distance: light.distance, decay: light.decay } : { intensity: light.intensity };
    let intensity = light.intensity * LEGACY_INTENSITY_SCALE;
    if (isPunctual) {
        if (light.distance > 0 && light.decay > 0) {
            const { cutoff, decay, scale } = fitFalloff(light.decay);
            intensity *= scale * Math.pow(light.distance, decay);
            light.distance *= cutoff;
            light.decay = decay;
        } else {
            light.distance = 0;
            light.decay = 0;
        }
    }
    light.intensity = intensity;
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
