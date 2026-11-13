import * as THREE from "three";
import { WIND_MAX_SPEED } from "./wind.js";

const MODULE_ID = "levels-3d-preview";
const ASSETS = `modules/${MODULE_ID}/assets/particles/`;
const LEGACY_PIXEL_SIZE = 0.86;
const LEGACY_FRAME_RATE = 60;
const MAX_COLORS = 4;
const LEGACY_VIEW_SQUARES = 24;
const LEGACY_DENSITY_AREA = 9;

const LAYER_DEFAULTS = {
    textures: [`${ASSETS}emberssmall.png`],
    colors: ["#ffffff"],
    desaturate: 0,
    count: 1000,
    size: 0.1,
    sizeVariation: 0.5,
    fall: 0,
    drift: 0,
    windFactor: 1,
    speedVariation: 2,
    stretch: 0,
    sway: 0,
    swayFrequency: 0.5,
    spin: 0,
    randomRotation: 1,
    rotation: 0,
    flip: 0,
    twinkle: 0,
    opacity: 1,
    additive: 0,
    lit: 1,
    ground: 0,
    band: 1,
    offset: 0,
    shelter: 1,
    impact: null,
};

const LEAVES = [1, 2, 3, 4, 5, 6].map((index) => `ui/particles/leaf${index}.png`);

export const LAYERS = {
    rain: { textures: ["ui/particles/rain.png"], colors: ["#b4bfcb", "#d3dbe4"], count: 16000, size: 0.035, sizeVariation: 0.35, fall: 10, stretch: 0.85, randomRotation: 0, opacity: 0.65, speedVariation: 3, impact: { kind: "splash", count: 3000, size: 0.2 } },
    snow: { textures: ["ui/particles/snow.png", `${ASSETS}circle_05.png`], count: 7000, size: 0.07, sizeVariation: 0.6, fall: 1.1, windFactor: 1.3, sway: 0.25, swayFrequency: 0.6, spin: 0.8, opacity: 0.9 },
    hail: { textures: [`${ASSETS}circle_05.png`], colors: ["#ffffff", "#dde8f2"], count: 4500, size: 0.07, sizeVariation: 0.4, fall: 13, stretch: 0.16, randomRotation: 0, opacity: 0.95, impact: { kind: "bounce", count: 900, size: 0.07 } },
    sand: { textures: [`${ASSETS}dirt_01.png`, `${ASSETS}dirt_02.png`, `${ASSETS}dirt_03.png`], colors: ["#d9a05b", "#c98a45", "#e3b877"], count: 14000, size: 0.09, fall: 0.5, windFactor: 1.3, sway: 0.15, swayFrequency: 1.5, spin: 1, opacity: 0.6 },
    leaves: { textures: LEAVES, count: 420, size: 0.24, sizeVariation: 0.4, fall: 0.9, windFactor: 1.4, sway: 0.5, swayFrequency: 0.5, spin: 1.5, flip: 1 },
    petals: { textures: ["ui/particles/leaf4.png", "ui/particles/leaf5.png"], colors: ["#ffc7d9", "#ffe3ec", "#ff9fbf"], desaturate: 1, count: 900, size: 0.1, sizeVariation: 0.4, fall: 0.6, windFactor: 1.2, sway: 0.5, swayFrequency: 0.6, spin: 1.2, flip: 1 },
    embers: { colors: ["#ff3700", "#ff5900", "#cf380e", "#fa1900"], count: 1300, size: 0.07, sizeVariation: 0.7, fall: -0.25, windFactor: 0.6, sway: 0.25, swayFrequency: 0.8, twinkle: 0.7, additive: 1, lit: 0, shelter: 0 },
    mysteriouslights: { colors: ["#0084ff", "#00ff6a"], count: 450, size: 0.24, sizeVariation: 0.6, fall: -0.02, windFactor: 0.1, sway: 0.35, swayFrequency: 0.25, twinkle: 0.5, additive: 1, lit: 0, shelter: 0 },
    stars: { textures: [`${ASSETS}stars.png`], colors: ["#ffff80"], count: 450, size: 0.22, sizeVariation: 0.6, fall: -0.01, windFactor: 0.05, sway: 0.1, spin: 0.3, twinkle: 0.6, opacity: 0.7, additive: 1, lit: 0, shelter: 0 },
    starfall: { textures: [1, 4, 7].map((index) => `${ASSETS}star_0${index}.png`), colors: ["#ffb066", "#ffd9a0"], count: 170, size: 0.32, sizeVariation: 0.5, fall: 0.8, windFactor: 0.2, spin: 1, twinkle: 0.4, additive: 1, lit: 0 },
    dust: { textures: [`${ASSETS}dust.png`], colors: ["#5e461b"], count: 260, size: 3, sizeVariation: 0.6, windFactor: 0.5, sway: 0.3, swayFrequency: 0.1, spin: 0.05, opacity: 0.16, shelter: 0 },
    smoke: { textures: [`${ASSETS}dust.png`], colors: ["#0d0d0d"], count: 420, size: 1.2, sizeVariation: 0.6, fall: -0.05, windFactor: 0.5, sway: 0.2, swayFrequency: 0.15, spin: 0.05, opacity: 0.2, shelter: 0 },
    toxic: { textures: [`${ASSETS}dust.png`], colors: ["#21451c", "#38c75e", "#1b7533"], count: 200, size: 3.6, sizeVariation: 0.6, windFactor: 0.3, sway: 0.3, swayFrequency: 0.1, spin: 0.2, opacity: 0.2, lit: 0.6, shelter: 0 },
    ash: { textures: [`${ASSETS}circle_05.png`], colors: ["#8a8a8a", "#b0aca8", "#5f5c59"], count: 6000, size: 0.05, sizeVariation: 0.6, fall: 0.7, windFactor: 1.2, sway: 0.3, swayFrequency: 0.5, opacity: 0.85 },
    mist: { textures: [`${ASSETS}dust.png`, `${ASSETS}mist_01.png`], colors: ["#dfe6ea"], count: 150, size: 5, sizeVariation: 0.5, windFactor: 0.35, sway: 0.5, swayFrequency: 0.05, spin: 0.02, opacity: 0.2, ground: 1, band: 0.6, shelter: 0 },
    fireflies: { colors: ["#d8ff5a", "#aaff44", "#ffe066"], count: 300, size: 0.08, sizeVariation: 0.4, windFactor: 0.05, sway: 0.8, swayFrequency: 0.35, twinkle: 1, additive: 1, lit: 0, ground: 1, band: 2, shelter: 0 },
    haze: { textures: [`${ASSETS}dust.png`], colors: ["#c9a36a", "#b58a52"], count: 220, size: 4, sizeVariation: 0.5, windFactor: 1.2, sway: 0.3, swayFrequency: 0.1, spin: 0.05, opacity: 0.2, shelter: 0 },
};

const calm = { direction: 90, speed: 0.05, gustiness: 0.2 };

export const PRESETS = {
    none: {},
    overcast: { clouds: 0.85, wind: { direction: 90, speed: 0.15, gustiness: 0.3 } },
    drizzle: { layers: [{ kind: "rain", count: 10000, size: 0.02, stretch: 0.35, fall: 6, opacity: 0.4, impact: { kind: "splash", count: 900, size: 0.1 } }], wind: { direction: 90, speed: 0.08, gustiness: 0.2 }, clouds: 0.6, fog: 0.12 },
    rain: { layers: [{ kind: "rain" }], wind: { direction: 90, speed: 0.18, gustiness: 0.25 }, clouds: 0.75, fog: 0.1 },
    heavyrain: { layers: [{ kind: "rain", count: 32000, stretch: 1.05, fall: 12, opacity: 0.55, impact: { kind: "splash", count: 4000, size: 0.19 } }], wind: { direction: 90, speed: 0.25, gustiness: 0.3 }, clouds: 0.9, fog: 0.22 },
    thunderstorm: { layers: [{ kind: "rain", count: 40000, stretch: 1.2, fall: 13, opacity: 0.55, impact: { kind: "splash", count: 4500, size: 0.2 } }], wind: { direction: 90, speed: 0.6, gustiness: 0.6 }, clouds: 1, fog: 0.3, lightning: 0.7, fogColor: "#6f7a86" },
    snow: { layers: [{ kind: "snow" }], wind: { direction: 90, speed: 0.04, gustiness: 0.3 }, clouds: 0.7, fog: 0.1, fogColor: "#d5dce4" },
    blizzard: { layers: [{ kind: "snow", count: 24000, size: 0.06, fall: 1.8, windFactor: 1.6, sway: 0.4, stretch: 0.12 }], wind: { direction: 90, speed: 0.8, gustiness: 0.5 }, clouds: 1, fog: 0.6, fogColor: "#dfe6ee" },
    hail: { layers: [{ kind: "hail" }], wind: { direction: 90, speed: 0.1, gustiness: 0.2 }, clouds: 0.85, fog: 0.08 },
    fog: { layers: [{ kind: "mist" }], wind: calm, clouds: 0.6, fog: 0.8, fogColor: "#b9c2c9" },
    mist: { layers: [{ kind: "mist", count: 110, opacity: 0.16 }], wind: calm, clouds: 0.3, fog: 0.35, fogColor: "#c3ccd2" },
    sand: { layers: [{ kind: "sand" }], wind: { direction: 90, speed: 0.6, gustiness: 0.3 }, fog: 0.15, fogColor: "#c79f6b" },
    sandstorm: { layers: [{ kind: "sand", count: 20000 }, { kind: "haze" }], wind: { direction: 90, speed: 0.9, gustiness: 0.5 }, clouds: 0.4, fog: 0.55, fogColor: "#c79f6b" },
    ashfall: { layers: [{ kind: "ash" }, { kind: "embers", count: 350 }], wind: { direction: 90, speed: 0.1, gustiness: 0.3 }, clouds: 0.85, fog: 0.3, fogColor: "#6b6661" },
    leaves: { layers: [{ kind: "leaves" }], wind: { direction: 90, speed: 0.25, gustiness: 0.5 } },
    petals: { layers: [{ kind: "petals" }], wind: { direction: 90, speed: 0.2, gustiness: 0.5 } },
    embers: { layers: [{ kind: "embers" }], wind: { direction: 90, speed: 0.1, gustiness: 0.4 } },
    fireflies: { layers: [{ kind: "fireflies" }], wind: calm },
    mysteriouslights: { layers: [{ kind: "mysteriouslights" }], wind: calm },
    stars: { layers: [{ kind: "stars" }], wind: calm },
    starfall: { layers: [{ kind: "starfall" }], wind: calm },
    dust: { layers: [{ kind: "dust" }], wind: { direction: 90, speed: 0.1, gustiness: 0.2 }, fog: 0.08, fogColor: "#8a7350" },
    smoke: { layers: [{ kind: "smoke" }], wind: calm, fog: 0.15, fogColor: "#3a3a3a" },
    toxic: { layers: [{ kind: "toxic" }], wind: calm, fog: 0.15, fogColor: "#3f6b3a" },
    custom: {},
};

const CORE_WEATHER = { leaves: "leaves", rain: "rain", rainStorm: "heavyrain", fog: "fog", snow: "snow", blizzard: "blizzard" };
const DEFAULT_WIND = { direction: 90, speed: 0, gustiness: 0 };
const DEFAULT_FOG_COLOR = "#8f9aa6";

function isPreset(id) {
    return !!id && id !== "none" && id in PRESETS;
}

function legacyFlag(flags) {
    const presets = [flags.particlePreset, flags.particlePreset2].filter(isPreset);
    if (!presets.length && !flags.particlePresetCustom?.length) return null;
    return { preset: presets[0] ?? "none", layer2: presets[1] ?? "none", fog: 0, clouds: 0, lightning: 0, linkSky: false };
}

export function resolveFlag(scene) {
    const flags = scene.flags[MODULE_ID] ?? {};
    const weather = flags.weather;
    if (weather && (isPreset(weather.preset) || isPreset(weather.layer2) || weather.layers?.length)) return weather;
    return (weather ? null : legacyFlag(flags)) ?? { preset: CORE_WEATHER[scene.weather] ?? "none" };
}

function starfallTextures() {
    const folder = ["jb2a_patreon", "JB2A_DnD5e"].find((id) => game.modules.get(id)?.active);
    if (!folder) return null;
    return [5, 4, 6, 7, 8, 9].map((index) => `modules/${folder}/Library/Generic/Twinkling_Stars/TwinklingStars_0${index}_Orange_100x100.webm`);
}

function createLayer(definition, amount) {
    const base = LAYERS[definition.kind] ?? {};
    const layer = { ...LAYER_DEFAULTS, ...base, ...definition, amount };
    layer.key = definition.key ?? definition.kind;
    if (layer.key === "starfall" && !definition.textures) {
        const textures = starfallTextures();
        if (textures) Object.assign(layer, { textures, colors: ["#ffffff"] });
    }
    layer.colors = layer.colors.slice(0, MAX_COLORS).map((color) => new THREE.Color(color));
    return layer;
}

function legacyOptions(flags, squareSize) {
    const world = (value) => value / 1000;
    return {
        density: flags.particleDensity ?? 100,
        direction: THREE.MathUtils.degToRad(flags.particleDirection ?? 90),
        color: flags.particleColor ?? "#ffffff",
        size: world(0.1 * (flags.particleSize ?? 20)),
        speed: world(0.1 * (flags.particleSpeed ?? 5)),
        variation: flags.particleVelocity ?? 1,
        opacity: flags.particleOpacity ?? 0.5,
        texture: flags.particleTexture,
        randomRotation: flags.particleRandomRotation ?? false,
        randomScale: flags.particleRandomScale ?? true,
        blending: flags.particleBlend ?? flags.particleBlending ?? false,
        rotationSpeed: THREE.MathUtils.degToRad((flags.particleRotationspeed ?? 0) / 5),
        groundOffset: world(flags.particleGroundOffset ?? 0),
        squareSize,
    };
}

function legacyMotion(options) {
    const speed = (options.speed * LEGACY_FRAME_RATE) / options.squareSize;
    return { fall: speed * Math.sin(options.direction), drift: -speed * Math.cos(options.direction) };
}

function legacyLayer(options, key, squareSize) {
    const { fall, drift } = legacyMotion({ squareSize, ...options });
    const textures = String(options.texture || LAYER_DEFAULTS.textures[0]).split(",").map((path) => path.trim());
    const colors = String(options.color ?? "#ffffff").split(",").map((color) => color.trim());
    const variable = options.randomScale ?? true;
    return {
        key,
        textures,
        colors,
        count: Math.clamp((500 * (options.density ?? 1) * (LEGACY_VIEW_SQUARES * squareSize) ** 2) / LEGACY_DENSITY_AREA, 20, 60000),
        size: (((options.size ?? 0.008) * LEGACY_PIXEL_SIZE) / squareSize) * (variable ? 1.5 : 1),
        sizeVariation: variable ? 0.66 : 0,
        fall,
        drift,
        windFactor: 0,
        speedVariation: Math.clamp(Math.round(options.variation ?? 2), 0, 8),
        spin: (options.rotationSpeed ?? 0) * LEGACY_FRAME_RATE,
        randomRotation: options.randomRotation ? 1 : 0,
        rotation: Math.PI - (options.direction ?? 0),
        opacity: options.opacity ?? 1,
        additive: options.blending && options.blending !== THREE.NormalBlending ? 1 : 0,
        lit: options.blending && options.blending !== THREE.NormalBlending ? 0 : 1,
        offset: (options.groundOffset ?? 0) / squareSize,
        shelter: fall > 0.3 ? 1 : 0,
    };
}

function sceneCustomLayer(flags, squareSize) {
    const options = legacyOptions(flags, squareSize);
    const layer = legacyLayer(options, "custom", squareSize);
    const { drift } = legacyMotion(options);
    const speed = Math.min(Math.abs(drift) / WIND_MAX_SPEED, 1);
    return { layer: { ...layer, drift: 0, windFactor: 1 }, wind: { direction: drift < 0 ? 270 : 90, speed, gustiness: 0 } };
}

export function customWind(flags, squareSize) {
    return sceneCustomLayer(flags, squareSize).wind;
}

export function resolveState(flag, { squareSize = 0.1, flags = {} } = {}) {
    const intensity = Math.clamp(flag.intensity ?? 1, 0, 1);
    const preset = PRESETS[flag.preset] ?? PRESETS.none;
    const custom = flag.preset === "custom" ? sceneCustomLayer(flags, squareSize) : null;
    const definitions = [...(flag.layers ?? [...(preset.layers ?? []), ...(custom ? [custom.layer] : []), ...(PRESETS[flag.layer2]?.layers ?? [])])];
    (flags.particlePresetCustom ?? []).forEach((options, index) => definitions.push(legacyLayer(options, `custom${index + 1}`, squareSize)));
    const layers = new Map();
    for (const definition of definitions) {
        const layer = createLayer(definition, intensity);
        if (!layers.has(layer.key)) layers.set(layer.key, layer);
    }
    const linked = flag.linkSky ?? true;
    return {
        layers,
        wind: { ...DEFAULT_WIND, ...preset.wind, ...custom?.wind, ...flag.wind },
        fog: Math.clamp(flag.fog ?? (preset.fog ?? 0) * intensity, 0, 1),
        fogColor: new THREE.Color(flag.fogColor ?? preset.fogColor ?? DEFAULT_FOG_COLOR),
        clouds: linked ? Math.clamp(flag.clouds ?? (preset.clouds ?? 0) * intensity, 0, 1) : 0,
        lightning: Math.clamp(flag.lightning ?? (preset.lightning ?? 0) * intensity, 0, 1),
    };
}

export function presetDefaults(id, intensity = 1) {
    const preset = PRESETS[id] ?? PRESETS.none;
    return { wind: { ...DEFAULT_WIND, ...preset.wind }, fog: (preset.fog ?? 0) * intensity, lightning: (preset.lightning ?? 0) * intensity };
}

function windVector(wind, target) {
    const radians = THREE.MathUtils.degToRad(wind.direction);
    return target.set(Math.sin(radians) * wind.speed, -Math.cos(radians) * wind.speed);
}

const windA = new THREE.Vector2();
const windB = new THREE.Vector2();

function mixWind(from, to, t) {
    windVector(from, windA).lerp(windVector(to, windB), t);
    const speed = windA.length();
    const direction = speed > 1e-4 ? (THREE.MathUtils.radToDeg(Math.atan2(windA.x, -windA.y)) + 360) % 360 : to.direction;
    return { direction, speed, gustiness: THREE.MathUtils.lerp(from.gustiness, to.gustiness, t) };
}

function mixLayer(from, to, t) {
    const layer = { ...(t < 0.5 ? from : to) };
    for (const [key, value] of Object.entries(to)) {
        if (typeof value === "number" && typeof from[key] === "number") layer[key] = THREE.MathUtils.lerp(from[key], value, t);
    }
    const count = Math.max(from.colors.length, to.colors.length);
    layer.colors = Array.from({ length: count }, (_, index) => from.colors[index % from.colors.length].clone().lerp(to.colors[index % to.colors.length], t));
    if (from.impact && to.impact) layer.impact = { kind: to.impact.kind, count: THREE.MathUtils.lerp(from.impact.count, to.impact.count, t), size: THREE.MathUtils.lerp(from.impact.size, to.impact.size, t) };
    return layer;
}

export function mixStates(from, to, t) {
    const layers = new Map();
    for (const key of new Set([...from.layers.keys(), ...to.layers.keys()])) {
        const a = from.layers.get(key);
        const b = to.layers.get(key);
        if (a && b) layers.set(key, mixLayer(a, b, t));
        else layers.set(key, a ? { ...a, amount: a.amount * (1 - t) } : { ...b, amount: b.amount * t });
    }
    const fog = THREE.MathUtils.lerp(from.fog, to.fog, t);
    const fogWeight = fog > 1e-4 ? (to.fog * t) / (from.fog * (1 - t) + to.fog * t) : t;
    return {
        layers,
        wind: mixWind(from.wind, to.wind, t),
        fog,
        fogColor: from.fogColor.clone().lerp(to.fogColor, fogWeight),
        clouds: THREE.MathUtils.lerp(from.clouds, to.clouds, t),
        lightning: THREE.MathUtils.lerp(from.lightning, to.lightning, t),
    };
}

export function emptyState() {
    return resolveState({ preset: "none" });
}
