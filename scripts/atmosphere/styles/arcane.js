import { Color, MathUtils, Vector3 } from "three";
import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_STARS, SKY_BODIES, SKY_FINISH } from "../sky/chunks.js";

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_STARS}
    ${SKY_BODIES}
    ${SKY_FINISH}

    uniform float moteAmount;
    uniform vec3 glowTint;
    uniform float moonHalo;

    vec2 swirl(vec2 p, float t) {
        float a = t + 1.4 / (1.0 + 0.6 * length(p));
        float c = cos(a);
        float s = sin(a);
        return mat2(c, -s, s, c) * p;
    }

    vec4 arcaneClouds(vec3 dir, float lightPower, out float filament) {
        filament = 0.0;
        float y = dir.y;
        if (cloudsEnabled < 0.5 || cloudAlpha <= 0.001 || y <= -0.03) return vec4(0.0);
        float t = time * cloudSpeed;
        vec2 p = dir.xz / (y + 0.24) * 0.9 * cloudScale;
        p = swirl(p, t * 0.004) + cloudDrift * 4.0;
        vec2 warp = vec2(fbm2(p * 0.7 + vec2(0.0, t * 0.006)), fbm2(p * 0.7 + vec2(5.2, 1.3) - t * 0.005));
        float n = fbm3(p * 1.25 + (warp - 0.5) * 2.6);
        float threshold = mix(0.66, 0.36, clamp(cloudCover, 0.0, 1.0));
        float density = smoothstep(threshold, threshold + 0.3, n);
        if (density <= 0.001) return vec4(0.0);
        filament = clamp(1.0 - abs(n - threshold - 0.1) * 9.0, 0.0, 1.0);
        vec3 hue = mix(vec3(0.55, 0.26, 1.0), glowTint, smoothstep(0.35, 0.65, warp.x));
        vec3 day = mix(skyHorizon, vec3(1.0, 0.96, 1.0), 0.2) * (0.65 + 0.35 * lightPower) + hue * (0.12 + 0.3 * filament);
        vec3 glow = hue * (0.08 + 0.3 * filament) + skyZenith * 0.6;
        float dark = clamp(night + 0.4 * twilight * (1.0 - daylight), 0.0, 1.0);
        vec3 cloud = mix(day, glow, dark) + hue * filament * 0.18 * (1.0 - dark);
        cloud *= cloudTint;
        float alpha = density * clamp(cloudAlpha, 0.0, 1.0) * smoothstep(-0.02, 0.14, y) * 0.65;
        return vec4(cloud, alpha);
    }

    float moteLayer(vec3 dir, float cells, float chance, float seed, float spin) {
        float a = time * spin;
        float c = cos(a);
        float s = sin(a);
        vec3 d = vec3(c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z);
        float face;
        vec2 grid = cubeCell(d, face) * cells;
        vec2 id = floor(grid) + face * 157.0 + seed;
        float pick = hash12(id);
        if (pick > chance) return 0.0;
        vec2 center = 0.35 + 0.3 * vec2(hash12(id + 3.7), hash12(id + 9.1));
        center += 0.15 * vec2(sin(time * 0.35 + pick * 40.0), cos(time * 0.27 + pick * 23.0));
        vec2 offset = fract(grid) - center;
        float size = 0.05 + 0.07 * hash12(id + 5.1);
        float pulse = 0.5 + 0.5 * sin(time * (0.6 + 1.6 * pick / chance) + pick * 60.0);
        return exp(-dot(offset, offset) / (size * size)) * (0.35 + 0.65 * pulse);
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float up = max(y, 0.0);
        float env = environmentMode;

        vec3 sunDir = normalize(sunDirection);
        vec3 moonDir = normalize(moonDirection);
        vec3 sunTint = tintOf(sunColor);
        vec3 moonTint = tintOf(moonColor);
        float sunPower = smoothstep(-0.12, 0.04, sunDir.y) * clamp(max(daylight, twilight), 0.0, 1.0);

        float horizonBand = pow(1.0 - up, mix(4.0, 2.2, haze));
        vec3 color = mix(skyZenith, skyHorizon, horizonBand);
        float side = dot(normalize(dir.xz + 1e-4), normalize(moonDir.xz + 1e-4)) * 0.5 + 0.5;
        color *= mix(vec3(1.0), mix(vec3(0.8, 1.12, 1.08), vec3(1.15, 0.82, 1.2), side), 0.55 * horizonBand);
        color = mix(color, skyGround, smoothstep(0.0, 0.1, -y));

        float mu = dot(dir, sunDir);
        float muPos = max(mu, 0.0);
        float towardSun = pow(mu * 0.5 + 0.5, 3.0);
        color = mix(color, color * sunTint * 1.25, twilight * horizonBand * towardSun);
        color += sunTint * sunGlow * sunPower * (0.35 * pow(muPos, 32.0) + 0.08 * pow(muPos, 5.0)) * (1.0 - 0.5 * env);

        float moonMu = max(dot(dir, moonDir), 0.0);
        vec3 haloTint = mix(moonTint, glowTint, 0.45);
        color += haloTint * moonHalo * (0.3 * pow(moonMu, 60.0) + 0.07 * pow(moonMu, 8.0)) * (0.3 + 0.7 * night);

        float horizonMask = smoothstep(-0.01, 0.02, y);
        vec3 sky = color;

        if (env < 0.5 && starVisibility > 0.001) {
            float stars = starLayer(dir, 160.0, 0.18, 0.0) + starLayer(dir, 60.0, 0.1, 41.0) * 1.4;
            vec3 starTint = mix(vec3(0.8, 0.7, 1.0), glowTint, hash12(floor(dir.xz * 300.0)));
            sky += starTint * stars * starVisibility * smoothstep(0.0, 0.2, y) * (1.0 - clamp(fogDensity, 0.0, 1.0));
        }

        vec4 bodies = skyBodies(dir, env);
        sky = sky * (1.0 - bodies.a * horizonMask) + bodies.rgb * horizonMask;

        float filament;
        vec4 clouds = arcaneClouds(dir, sunPower, filament);
        sky = mix(sky, clouds.rgb, clouds.a);
        sky += haloTint * moonHalo * pow(moonMu, 14.0) * clouds.a * 0.25 * (0.3 + 0.7 * night);

        if (env < 0.5 && moteAmount > 0.0 && y > -0.03) {
            float motes = moteLayer(dir, 26.0, 0.16, 0.0, 0.012) + moteLayer(dir, 55.0, 0.12, 19.0, -0.007) * 0.6;
            vec3 moteTint = mix(glowTint, vec3(1.0, 0.85, 0.5), hash12(floor(dir.xz * 26.0) + 3.0) * 0.6);
            sky += moteTint * motes * moteAmount * mix(0.35, 1.8, night) * smoothstep(-0.03, 0.08, y);
        }

        skyOutput(skyFinish(sky, y, env));
    }
`;

function key(elevation, zenith, horizon, ground, sun, sunIntensity, ambientSky, ambientGround, ambientIntensity) {
    return { elevation, colors: [zenith, horizon, ground, sun, ambientSky, ambientGround].map((c) => new Color(c)), sunIntensity, ambientIntensity };
}

const KEYS = [
    key(1, "#5236c0", "#9adcd6", "#2a3846", "#fff2fa", 1.2, "#a49cf0", "#4a7a6a", 0.42),
    key(0.25, "#5232b8", "#c0b0f0", "#2c3244", "#ffe8f2", 1.15, "#a092ec", "#507062", 0.42),
    key(0.06, "#4424a8", "#ffa0b4", "#2a2238", "#ffbcd8", 0.9, "#9a78e0", "#5a3a58", 0.42),
    key(-0.08, "#1e1262", "#8a4cbc", "#140e22", "#d6a6ff", 0.3, "#7a60c8", "#2c3a4a", 0.46),
    key(-0.3, "#0c0a32", "#1c4a66", "#080a14", "#c8b8ff", 0, "#6a5ac4", "#1c3c40", 0.5),
];

const sample = { colors: KEYS[0].colors.map(() => new Color()), sunIntensity: 0, ambientIntensity: 0 };
const MOON = new Color("#d4c8ff");
const GLOW = "#4ff0d0";
const MOON_LIGHT = 0.55;
const MOON_ELEVATION = (32 * Math.PI) / 180;
const UP = new Vector3(0, 1, 0);
const east = new Vector3();
const noon = new Vector3();
const side = new Vector3();

function sampleKeys(elevation) {
    let i = 0;
    while (i < KEYS.length - 2 && elevation < KEYS[i + 1].elevation) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = Math.clamp((a.elevation - elevation) / (a.elevation - b.elevation), 0, 1);
    sample.colors.forEach((color, j) => color.copy(a.colors[j]).lerp(b.colors[j], t));
    sample.sunIntensity = MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    sample.ambientIntensity = MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, t);
}

function moonLit(phase) {
    return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
}

const sun = { kind: "star", radius: 0.028, color: new Color(), brightness: 0.7, glow: 0.6, direction: new Vector3() };
const moon = { kind: "moon", radius: 0.11, color: MOON, brightness: 1.4, glow: 0.9, direction: new Vector3(), phase: 0.5, seed: 5 };
const bodies = [sun, moon];

export default {
    id: "arcane",
    order: 30,
    options: ["time", "moon", "clouds"],
    fields: [
        { name: "moonSize", type: "range", min: 0.5, max: 2, step: 0.1, default: 1 },
        { name: "motes", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "glowColor", type: "color", default: GLOW },
    ],

    createDome() {
        return new SkyDome({
            name: "ArcaneSkyShader",
            uniforms: { moteAmount: { value: 1 }, glowTint: { value: new Color(GLOW) }, moonHalo: { value: 1 } },
            fragmentShader,
        });
    },

    orient({ moonDirection, directionAt }) {
        directionAt(6, east);
        directionAt(12, noon);
        east.y = 0;
        if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
        east.normalize();
        side.crossVectors(east, UP).normalize();
        if (side.dot(noon) > 0) side.negate();
        moonDirection.copy(side).addScaledVector(east, 0.4).normalize().multiplyScalar(Math.cos(MOON_ELEVATION)).addScaledVector(UP, Math.sin(MOON_ELEVATION)).normalize();
    },

    light(state, { darkness }) {
        const elevation = state.sunDirection.y;
        sampleKeys(MathUtils.lerp(elevation, Math.min(elevation, -0.3), darkness));
        const [zenith, horizon, ground, sunColor, ambientSky, ambientGround] = sample.colors;
        state.skyZenith.copy(zenith);
        state.skyHorizon.copy(horizon);
        state.skyGround.copy(ground);
        state.sunColor.copy(sunColor);
        state.moonColor.copy(MOON);
        state.ambientSky.copy(ambientSky);
        state.ambientGround.copy(ambientGround);
        state.ambientIntensity = sample.ambientIntensity;
        state.fogColor.copy(horizon).lerp(zenith, 0.4);
        state.fogDensity = 0.1;
        state.haze = 0.1;

        const sunFade = MathUtils.smoothstep(elevation, -0.03, 0.1) * (1 - darkness);
        const moonLight = MOON_LIGHT * (0.35 + 0.65 * moonLit(state.moonPhase));
        state.lightIsMoon = sunFade <= 0.5;
        if (state.lightIsMoon) {
            state.lightColor.copy(MOON);
            state.lightIntensity = moonLight * (1 - 2 * sunFade);
        } else {
            state.lightColor.copy(sunColor);
            state.lightIntensity = sample.sunIntensity * (2 * sunFade - 1);
        }
        state.starVisibility = state.night * 0.8;
        state.shadowIntensity = 0.75;
        state.shadowSoftness = 1.5;
        state.environmentGain = 1.1;
        state.clouds.cover = 0.5;
        state.clouds.darkness = 0;
        const grade = state.grade;
        grade.exposure = 1.05;
        grade.contrast = 1.02;
        grade.saturation = 1.18;
        grade.night = 0.45 * state.night;
        grade.nightTint.setRGB(1.05, 0.75, 1.7);
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        const size = Number(options.moonSize);
        uniforms.moteAmount.value = Number(options.motes);
        uniforms.glowTint.value.set(options.glowColor || GLOW);
        uniforms.moonHalo.value = size * (0.3 + 0.7 * moonLit(state.moonPhase));
        sun.direction.copy(state.sunDirection);
        sun.color.copy(state.sunColor);
        moon.direction.copy(state.moonDirection);
        moon.radius = 0.11 * size;
        moon.phase = state.moonPhase;
        moon.brightness = MathUtils.lerp(0.45, 0.7, state.night);
        dome.setBodies(bodies);
    },
};
