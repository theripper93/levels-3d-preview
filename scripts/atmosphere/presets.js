import * as THREE from "three";

export const PRESET_IDS = ["clear", "golden", "overcast", "storm", "moonlit", "eerie", "custom"];

export const NIGHT_ELEVATION = -0.35;

const KEY_FIELDS = ["sun", "sunIntensity", "zenith", "horizon", "ground", "ambientSky", "ambientGround", "ambientIntensity", "environmentIntensity"];
const COLOR_FIELDS = ["sun", "zenith", "horizon", "ground", "ambientSky", "ambientGround"];

function key(elevation, ...values) {
    const frame = { elevation };
    KEY_FIELDS.forEach((field, i) => {
        frame[field] = COLOR_FIELDS.includes(field) ? new THREE.Color(values[i]) : values[i];
    });
    return frame;
}

function preset(data) {
    data.moon.color = new THREE.Color(data.moon.color);
    data.clouds.tint = new THREE.Color(data.clouds.tint);
    data.keys.sort((a, b) => a.elevation - b.elevation);
    return data;
}

export const PRESETS = {
    clear: preset({
        keys: [
            key(1, "#fff0d8", 1.32, "#2f6cd8", "#a8cdf2", "#5c5648", "#94aee8", "#6a5a4a", 0.36, 0.55),
            key(0.5, "#ffe9cc", 1.28, "#3573d6", "#b5d3f0", "#5a5244", "#98b0e8", "#6a5644", 0.36, 0.52),
            key(0.25, "#ffd6a0", 1.23, "#3b6fc6", "#f0c890", "#55493c", "#9ca6dc", "#66523f", 0.36, 0.48),
            key(0.1, "#ffa858", 1.14, "#3f4fa8", "#ffb06a", "#4a3a33", "#8c84d0", "#5a4048", 0.36, 0.4),
            key(0.02, "#ff7838", 0.84, "#363a88", "#ff7a3e", "#3c2c2c", "#7066c0", "#4c3242", 0.36, 0.3),
            key(-0.04, "#ff6a40", 0.45, "#272a68", "#c85c62", "#261c26", "#56529e", "#30233a", 0.32, 0.2),
            key(-0.12, "#8a7cff", 0.2, "#131b4a", "#3b5092", "#141626", "#4a5684", "#1c1e30", 0.4, 0.14),
            key(-0.3, "#8aa0e0", 0.15, "#060b22", "#13204a", "#06080f", "#4a5a80", "#181c2c", 0.55, 0.1),
            key(-1, "#8aa0e0", 0.15, "#040818", "#0f1a3c", "#04060c", "#46567c", "#161a2a", 0.52, 0.09),
        ],
        moon: { color: "#a2b6e8", intensity: 0.16 },
        clouds: { cover: 0.35, density: 0.55, darkness: 0, tint: "#ffffff" },
        fog: { density: 0.15, height: 6 },
        haze: 0.15,
        sunGlow: 1.2,
        sunDiscSize: 1,
        stars: 1,
        shadow: 1,
        grade: { exposure: 1.05, contrast: 1.1, saturation: 1.06, night: 0.9 },
    }),
    golden: preset({
        keys: [
            key(1, "#ffd99a", 1.32, "#3c6fc8", "#f2d2a2", "#5e5040", "#a0a6e0", "#6e5640", 0.36, 0.5),
            key(0.4, "#ffd296", 1.32, "#4068bc", "#ffc88c", "#5a4a3a", "#9696d6", "#6a4e40", 0.36, 0.46),
            key(0.15, "#ffbc80", 1.41, "#4258b0", "#ffa85a", "#4e3a30", "#6f78c8", "#5c3e4a", 0.36, 0.4),
            key(0.03, "#ff8a4a", 0.92, "#3c3a90", "#ff7434", "#3e2a28", "#6a5cbc", "#4c3044", 0.36, 0.32),
            key(-0.04, "#ff5a40", 0.5, "#30286c", "#e05a6a", "#2a1c26", "#5c4ca4", "#3a2436", 0.32, 0.22),
            key(-0.12, "#9a7aff", 0.22, "#181a4e", "#5a4a92", "#161426", "#4c4c8a", "#1e1a34", 0.38, 0.15),
            key(-0.3, "#8c98e0", 0.16, "#080b24", "#1c1d4c", "#07070f", "#4a5280", "#16162a", 0.5, 0.1),
            key(-1, "#8c98e0", 0.16, "#05071a", "#14163e", "#05050c", "#464e7a", "#141426", 0.48, 0.09),
        ],
        moon: { color: "#aab2ec", intensity: 0.12 },
        clouds: { cover: 0.35, density: 0.5, darkness: 0, tint: "#ffe8d4" },
        fog: { density: 0.25, height: 5 },
        haze: 0.25,
        sunGlow: 2.2,
        sunDiscSize: 1.3,
        stars: 1,
        shadow: 1,
        grade: { exposure: 1.05, contrast: 1.1, saturation: 1.04, night: 0.85 },
    }),
    overcast: preset({
        keys: [
            key(1, "#eef1f4", 0.3, "#8e98a6", "#c2c8d0", "#5e5f5c", "#b4c0d0", "#6c6862", 0.62, 0.6),
            key(0.25, "#e6e6e4", 0.28, "#868e9a", "#b8bcc2", "#5a5a56", "#b0bccc", "#686460", 0.58, 0.55),
            key(0.06, "#e8c8a8", 0.24, "#6e7482", "#a29c98", "#4c4a48", "#a4aab8", "#5c5654", 0.5, 0.42),
            key(-0.06, "#a8a8c8", 0.12, "#363c4c", "#585c6a", "#24252a", "#6a7088", "#2c2c34", 0.42, 0.22),
            key(-0.3, "#8c9ac0", 0.08, "#0e1118", "#1a1e28", "#08090c", "#4a5268", "#16181e", 0.48, 0.1),
            key(-1, "#8c9ac0", 0.08, "#0a0c12", "#151820", "#06070a", "#464e62", "#14161a", 0.46, 0.09),
        ],
        moon: { color: "#a4b2d0", intensity: 0.05 },
        clouds: { cover: 0.82, density: 0.85, darkness: 0.25, tint: "#e8ecf0" },
        fog: { density: 0.45, height: 7 },
        haze: 0.6,
        sunGlow: 0.35,
        sunDiscSize: 0.8,
        stars: 0.2,
        shadow: 0.35,
        grade: { exposure: 1.06, contrast: 1.05, saturation: 0.72, night: 0.9 },
    }),
    storm: preset({
        keys: [
            key(1, "#d0d8e0", 0.22, "#262c34", "#7c8894", "#3c3e40", "#5f7890", "#4a4a4a", 0.62, 0.45),
            key(0.25, "#c8d0d8", 0.2, "#242a32", "#748090", "#383a3c", "#5c7488", "#464646", 0.6, 0.42),
            key(0.05, "#c0b4a8", 0.16, "#1e232a", "#5c646e", "#2c2e30", "#566678", "#3c3a3a", 0.52, 0.32),
            key(-0.06, "#909cb4", 0.08, "#14171c", "#323a44", "#141518", "#46506a", "#222428", 0.42, 0.18),
            key(-0.3, "#7a8aac", 0.05, "#08090e", "#161a22", "#050607", "#3a4258", "#101216", 0.46, 0.08),
            key(-1, "#7a8aac", 0.05, "#06070a", "#12161c", "#040405", "#363e52", "#0e1012", 0.44, 0.07),
        ],
        moon: { color: "#9aa8c8", intensity: 0.03 },
        clouds: { cover: 0.95, density: 1, darkness: 0.55, tint: "#c8ced6" },
        fog: { density: 0.6, height: 8 },
        haze: 0.75,
        sunGlow: 0.15,
        sunDiscSize: 0.7,
        stars: 0,
        shadow: 0.15,
        grade: { exposure: 1.05, contrast: 1.12, saturation: 0.7, night: 0.9 },
    }),
    moonlit: preset({
        keys: [
            key(1, "#eef2ff", 1.14, "#3a66c4", "#b2c8ec", "#4e5260", "#a8bef6", "#5a5a66", 0.36, 0.5),
            key(0.25, "#e2e6ff", 1.06, "#3a5cb4", "#c6cae6", "#4a4c5a", "#a2b0ec", "#58566a", 0.36, 0.45),
            key(0.06, "#ffb488", 0.79, "#3a4696", "#c68c9a", "#3a3442", "#7e7cc6", "#4e3e50", 0.36, 0.32),
            key(-0.04, "#c08cff", 0.35, "#1e2466", "#5a5aa6", "#1c1c30", "#4a54aa", "#24223e", 0.34, 0.2),
            key(-0.14, "#a8bce8", 0.3, "#0c1442", "#283e7c", "#0c1020", "#323e60", "#141a30", 0.45, 0.14),
            key(-0.3, "#a8bce8", 0.3, "#0a1230", "#24386a", "#060a16", "#2a3654", "#121828", 0.6, 0.14),
            key(-1, "#a8bce8", 0.3, "#081028", "#203262", "#050812", "#283452", "#101626", 0.58, 0.13),
        ],
        moon: { color: "#a8bce8", intensity: 0.4 },
        clouds: { cover: 0.2, density: 0.45, darkness: 0, tint: "#dfe6ff" },
        fog: { density: 0.2, height: 4 },
        haze: 0.25,
        sunGlow: 0.9,
        sunDiscSize: 1,
        stars: 1.6,
        shadow: 1,
        grade: { exposure: 1.05, contrast: 1.1, saturation: 1.05, night: 0.92 },
    }),
    eerie: preset({
        keys: [
            key(1, "#dcffd8", 0.4, "#1c3c3a", "#6a9c7c", "#2e3a32", "#6aa894", "#3a2a4a", 0.48, 0.42),
            key(0.25, "#d0f4c0", 0.38, "#1a3836", "#648f74", "#2c362e", "#629e8a", "#382846", 0.46, 0.38),
            key(0.06, "#e8e09a", 0.34, "#183034", "#6a8a62", "#262e28", "#528a7a", "#342640", 0.42, 0.3),
            key(-0.05, "#7affc8", 0.3, "#0e2a30", "#2c5c4c", "#141e1a", "#3a7468", "#261c34", 0.4, 0.18),
            key(-0.3, "#80ffd0", 0.26, "#03120f", "#0c2c26", "#040a08", "#2a5a4e", "#1c1428", 0.42, 0.1),
            key(-1, "#80ffd0", 0.26, "#020d0b", "#0a2420", "#030806", "#265246", "#1a1226", 0.4, 0.09),
        ],
        moon: { color: "#8cffd4", intensity: 0.09 },
        clouds: { cover: 0.45, density: 0.7, darkness: 0.25, tint: "#b8e0c8" },
        fog: { density: 0.55, height: 3 },
        haze: 0.55,
        sunGlow: 0.7,
        sunDiscSize: 1.1,
        stars: 0.8,
        shadow: 0.8,
        grade: { exposure: 1, contrast: 1.15, saturation: 0.9, night: 0.6 },
    }),
};

PRESETS.custom = PRESETS.clear;

export const SETTING_IDS = ["outdoor", "interior", "underground"];

const unlit = () => ({ moon: { color: "#000000", intensity: 0 }, clouds: { cover: 0, density: 0, darkness: 0, tint: "#ffffff" }, haze: 0, sunGlow: 0, sunDiscSize: 1, stars: 0, shadow: 1 });

export const SETTINGS = {
    interior: preset({
        ...unlit(),
        keys: [
            key(1, "#000000", 0, "#1e1a18", "#262019", "#14110f", "#c8b090", "#5a4838", 0.5, 1),
            key(0.2, "#000000", 0, "#1e1a18", "#262019", "#14110f", "#c4ac8c", "#584636", 0.48, 1),
            key(0.02, "#000000", 0, "#1e1a1e", "#241e20", "#141014", "#b8a090", "#4e4040", 0.42, 1),
            key(-0.12, "#000000", 0, "#262634", "#30303e", "#1a1a22", "#a8acc8", "#3e3a46", 0.26, 1),
            key(-0.3, "#000000", 0, "#1c1e2a", "#252836", "#131419", "#8c96b8", "#2e2e3a", 0.2, 1),
        ],
        fog: { density: 0.35, height: 40 },
        darknessDim: 0.55,
        weather: 0.4,
        grade: { exposure: 1, contrast: 1.08, saturation: 1.05, night: 0 },
    }),
    underground: preset({
        ...unlit(),
        keys: [
            key(1, "#000000", 0, "#141821", "#1c212b", "#0a0b0e", "#4a5670", "#1e2028", 0.75, 1),
            key(-1, "#000000", 0, "#141821", "#1c212b", "#0a0b0e", "#4a5670", "#1e2028", 0.75, 1),
        ],
        fog: { density: 0.5, height: 40 },
        darknessDim: 0.35,
        weather: 0,
        grade: { exposure: 1, contrast: 1.1, saturation: 0.95, night: 0.5 },
    }),
};

export function getSetting(id) {
    return SETTINGS[id] ?? null;
}

const DEFAULT_SKY_TINT = new THREE.Color("#3f8ea2");
const tintScratch = new THREE.Color();

export function customTint(color, target) {
    tintScratch.set(color);
    const luma = (c) => Math.max(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 1e-3);
    const base = luma(DEFAULT_SKY_TINT);
    const value = luma(tintScratch);
    target.setRGB(tintScratch.r / value, tintScratch.g / value, tintScratch.b / value);
    const reference = tintScratch.setRGB(DEFAULT_SKY_TINT.r / base, DEFAULT_SKY_TINT.g / base, DEFAULT_SKY_TINT.b / base);
    return target.setRGB(Math.min(target.r / reference.r, 1), Math.min(target.g / reference.g, 1), Math.min(target.b / reference.b, 1));
}

export function getPreset(id) {
    return PRESETS[id] ?? PRESETS.clear;
}

export function samplePreset(presetData, elevation, target) {
    const keys = presetData.keys;
    let i = 1;
    while (i < keys.length - 1 && keys[i].elevation < elevation) i++;
    const a = keys[i - 1];
    const b = keys[i];
    const t = THREE.MathUtils.smoothstep(elevation, a.elevation, b.elevation);
    for (const field of KEY_FIELDS) {
        if (COLOR_FIELDS.includes(field)) target[field].copy(a[field]).lerp(b[field], t);
        else target[field] = THREE.MathUtils.lerp(a[field], b[field], t);
    }
    return target;
}

export function createSample() {
    const sample = {};
    for (const field of KEY_FIELDS) sample[field] = COLOR_FIELDS.includes(field) ? new THREE.Color() : 0;
    return sample;
}

export function lerpSample(target, other, t) {
    for (const field of KEY_FIELDS) {
        if (COLOR_FIELDS.includes(field)) target[field].lerp(other[field], t);
        else target[field] = THREE.MathUtils.lerp(target[field], other[field], t);
    }
    return target;
}
