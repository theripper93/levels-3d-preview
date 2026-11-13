import { flameNoise, slowNoise } from "./noise.js";

const TAU = Math.PI * 2;
const hsl = { h: 0, s: 0, l: 0 };

export const LIGHT_ANIMATIONS = {
    none: {},
    flame: { flame: 0.35, radius: 0.12 },
    torch: { flame: 0.6, radius: 0.25, rate: 1.4 },
    revolving: { revolve: 0.5, shimmer: 0.05 },
    siren: { revolve: 1, beacon: 0.85 },
    pulse: { pulse: 0.6, frequency: 0.5, radius: 0.6 },
    reactivepulse: { pulse: 0.5, frequency: 1, radius: 0.5 },
    chroma: { hue: 0.1, legacyChroma: true },
    wave: { pulse: 0.35, frequency: 0.8, radius: 0.4 },
    fog: { drift: 0.4, radius: 0.3 },
    sunburst: { pulse: 0.3, frequency: 0.3, radius: 0.3, drift: 0.2 },
    dome: { shimmer: 0.1 },
    emanation: { drift: 0.5, hueSwing: 0.04 },
    hexa: { shimmer: 0.2 },
    ghost: { drift: 0.6, twinkle: 0.4 },
    energy: { flame: 0.4, rate: 3, shimmer: 0.2 },
    vortex: { revolve: 1.5, pulse: 0.25, frequency: 0.5 },
    witchwave: { pulse: 0.4, frequency: 0.4, hueSwing: 0.08, radius: 0.3 },
    rainbowswirl: { hue: 0.15 },
    radialrainbow: { hue: 0.08, pulse: 0.2, frequency: 0.3 },
    fairy: { twinkle: 0.7 },
    grid: { square: 0.35, frequency: 0.6 },
    starlight: { twinkle: 0.3 },
    smokepatch: { drift: 0.5, radius: 0.2 },
};

export function getLightAnimation(type) {
    return LIGHT_ANIMATIONS[type] ?? null;
}

function amount(value, strength) {
    return Math.min(0.95, value * strength);
}

export function sampleIntensity(def, seed, time, speed, strength) {
    let factor = 1;
    if (def.flame) factor *= 1 - amount(def.flame, strength) * (1 - flameNoise(seed, time, speed * (def.rate ?? 1)));
    if (def.pulse) factor *= 1 - amount(def.pulse, strength) * (0.5 + 0.5 * Math.sin(TAU * def.frequency * speed * time));
    if (def.square) factor *= 1 - amount(def.square, strength) * (Math.sin(TAU * def.frequency * speed * time) > 0 ? 1 : 0);
    if (def.drift) factor *= 1 - amount(def.drift, strength) * slowNoise(seed, time, speed);
    if (def.shimmer) factor *= 1 - amount(def.shimmer, strength) * flameNoise(seed + 3, time, speed * 4);
    if (def.twinkle) factor *= 1 - amount(def.twinkle, strength) * (1 - Math.min(1, flameNoise(seed + 7, time, speed * 0.6) ** 3 * 3));
    if (def.beacon) factor *= 1 - def.beacon * (1 - Math.max(0, Math.sin(TAU * 0.5 * speed * time)) ** 4);
    return Math.max(0, factor);
}

export function sampleRadius(def, factor) {
    return 1 - (def.radius ?? 0) * (1 - Math.min(1, factor));
}

export function sampleColor(def, target, base, seed, time, speed) {
    target.copy(base);
    if (!def.hue && !def.hueSwing) return target;
    target.getHSL(hsl);
    const shift = def.hue ? def.hue * speed * time : def.hueSwing * Math.sin(TAU * 0.2 * speed * time + seed);
    return target.setHSL((((hsl.h + shift) % 1) + 1) % 1, def.hue ? Math.max(hsl.s, 0.7) : hsl.s, def.hue ? Math.min(Math.max(hsl.l, 0.4), 0.7) : hsl.l);
}

export function sampleRevolve(def, time, speed) {
    return def.revolve ? TAU * 0.25 * def.revolve * speed * time : 0;
}
