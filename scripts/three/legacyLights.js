import { Scene } from "three";

const LEGACY_INTENSITY_SCALE = Math.PI;
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

function fitError(legacyDecay, cutoff, decay, scale) {
    let error = 0;
    for (const radius of FIT_RADII) {
        for (let i = 0; i < FIT_SAMPLES; i++) {
            const x = ((i + 0.5) / FIT_SAMPLES) * FIT_RANGE;
            error += (perceptual(scale * physicalFalloff(x, radius, cutoff, decay)) - perceptual(legacyFalloff(x, legacyDecay))) ** 2;
        }
    }
    return error;
}

function fitScale(legacyDecay, cutoff, decay) {
    let lo = -3;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
        const a = lo + (hi - lo) / 3;
        const b = hi - (hi - lo) / 3;
        if (fitError(legacyDecay, cutoff, decay, 10 ** a) < fitError(legacyDecay, cutoff, decay, 10 ** b)) hi = b;
        else lo = a;
    }
    const scale = 10 ** ((lo + hi) / 2);
    return { scale, error: fitError(legacyDecay, cutoff, decay, scale) };
}

function fitFalloff(legacyDecay) {
    const key = Math.round(legacyDecay * 20) / 20;
    if (falloffFits.has(key)) return falloffFits.get(key);
    let best = { cutoff: 1, decay: 0, scale: 1, error: Infinity };
    for (let decay = 0; decay <= 1; decay += 0.25) {
        for (let cutoff = 0.4; cutoff <= 2; cutoff += 0.02) {
            const { scale, error } = fitScale(key, cutoff, decay);
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
    const restores = [];
    scene.traverseVisible((object) => {
        if (object.isLight) restores.push([object, toPhysical(object)]);
    });
    pendingRestores.set(scene, restores);
}

function onAfterRender(renderer, scene) {
    const restores = pendingRestores.get(scene);
    if (!restores) return;
    for (const [light, legacy] of restores) Object.assign(light, legacy);
    pendingRestores.delete(scene);
}

export function injectLegacyLights() {
    Scene.prototype.onBeforeRender = onBeforeRender;
    Scene.prototype.onAfterRender = onAfterRender;
}
