import { sceneUniforms } from "../render/sceneBuffer.js";

function hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
}

function valueNoise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash(i) * (1 - u) + hash(i + 1) * u;
}

export function flameSeed(key = "") {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return (h >>> 0) % 10007;
}

export function flameTime() {
    return sceneUniforms.uSceneTime.value;
}

export function flameNoise(seed = 0, time = flameTime(), speed = 1) {
    const t = time * speed + seed * 1.618;
    return valueNoise(t * 2.3) * 0.45 + valueNoise(t * 6.1 + 17.3) * 0.35 + valueNoise(t * 13.7 + 41.9) * 0.2;
}

const flickers = new Map();

export function setLightFlicker(key, value) {
    if (value === null) flickers.delete(key);
    else flickers.set(key, value);
}

export function lightFlicker(key, fallback = 1) {
    return flickers.get(key) ?? fallback;
}

export function slowNoise(seed = 0, time = flameTime(), speed = 1) {
    return valueNoise((time * speed + seed * 1.618) * 0.6);
}
