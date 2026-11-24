import { Color } from "three";
import { skyDirection } from "../../sky/dome.js";

const DARKNESS_DIM = 0.6;
const SKY_DARKNESS_DIM = 0.55;

export const ELEMENTAL_GLSL = /* glsl */ `
        float azimuth01(vec3 dir) {
            return atan(dir.z, dir.x) / PI2 + 0.5;
        }

        float wrapNoise(vec2 p, float period) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float x0 = mod(i.x, period);
            float x1 = mod(i.x + 1.0, period);
            return mix(mix(hash12(vec2(x0, i.y)), hash12(vec2(x1, i.y)), u.x), mix(hash12(vec2(x0, i.y + 1.0)), hash12(vec2(x1, i.y + 1.0)), u.x), u.y);
        }

        float motes(vec3 dir, float cells, float chance, float rise, float sway, float seed) {
            float v = asin(clamp(dir.y, -1.0, 1.0)) / PI2 * cells - time * rise;
            vec2 grid = vec2(azimuth01(dir) * cells, v);
            vec2 dx = dFdx(grid);
            vec2 dy = dFdy(grid);
            dx.x -= cells * floor(dx.x / cells + 0.5);
            dy.x -= cells * floor(dy.x / cells + 0.5);
            float footprint = min(max(abs(dx.x) + abs(dy.x), abs(dx.y) + abs(dy.y)), 0.25);
            vec2 id = vec2(mod(floor(grid.x), cells), floor(grid.y)) + seed;
            float pick = hash12(id);
            if (pick > chance) return 0.0;
            vec2 center = 0.25 + 0.5 * vec2(hash12(id + 3.7), hash12(id + 9.1));
            center.x += sin(time * (0.6 + pick * 2.0 / chance) + pick * 40.0) * sway;
            float dist = length(fract(grid) - center);
            float size = 0.03 + 0.03 * hash12(id + 5.3);
            float radius = max(size, footprint * 0.8);
            float energy = (size * size) / (radius * radius);
            float flicker = 0.55 + 0.45 * sin(time * (2.0 + 5.0 * hash12(id + 7.7)) + pick * 91.0);
            return smoothstep(radius, radius * 0.2, dist) * energy * flicker;
        }
`;

export function fixedDirection(azimuth, elevation) {
    return ({ sunDirection, moonDirection }) => {
        skyDirection(azimuth, elevation, sunDirection);
        moonDirection.copy(sunDirection).negate();
    };
}

export function readColor(target, value, fallback) {
    return target.set(value || fallback);
}

export function lightEnclosed(state, { darkness, setKeyLight }, look) {
    const dim = 1 - DARKNESS_DIM * darkness;
    const skyDim = 1 - SKY_DARKNESS_DIM * darkness;
    state.lightIsMoon = false;
    setKeyLight(state.sunDirection, look.key, look.keyIntensity * dim);
    state.shadowIntensity = look.shadow;
    state.shadowSoftness = look.softness;
    state.ambientSky.copy(look.ambientSky);
    state.ambientGround.copy(look.ambientGround);
    state.ambientIntensity = look.ambient * dim;
    state.environmentGain = look.environment * dim;
    state.skyZenith.copy(look.zenith).multiplyScalar(skyDim);
    state.skyHorizon.copy(look.horizon).multiplyScalar(skyDim);
    state.skyGround.copy(look.ground).multiplyScalar(skyDim);
    state.fogColor.copy(look.fog).multiplyScalar(skyDim);
    state.sunColor.copy(look.accent);
    state.moonColor.copy(look.accent);
    state.fogDensity = look.fogDensity;
    state.fogHeight *= look.fogHeight ?? 1;
    state.haze = 0;
    state.daylight = 1;
    state.twilight = 0;
    state.night = 0;
    state.starVisibility = 0;
    state.flash = 0;
    state.clouds.enabled = false;
    const grade = state.grade;
    grade.exposure = look.exposure ?? 1;
    grade.contrast = look.contrast ?? 1.05;
    grade.saturation = look.saturation ?? 1;
    grade.night = 0;
}

export function createLook() {
    return {
        key: new Color(),
        keyIntensity: 1,
        shadow: 1,
        softness: 1,
        ambientSky: new Color(),
        ambientGround: new Color(),
        ambient: 0.4,
        environment: 1,
        zenith: new Color(),
        horizon: new Color(),
        ground: new Color(),
        fog: new Color(),
        accent: new Color(),
        fogDensity: 0,
        fogHeight: 1,
        exposure: 1,
        contrast: 1.05,
        saturation: 1,
    };
}
