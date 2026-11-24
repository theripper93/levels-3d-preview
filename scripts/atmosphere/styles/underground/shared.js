import { Color, Vector3 } from "three";

export const OVERHEAD = new Vector3(0.18, 1, 0.3).normalize();

export const CAVE_GLSL = /* glsl */ `
        uniform float caveDim;

        float glowPoints(vec2 p, float cells, float chance, float seed, float pixel, out float hue) {
            vec2 grid = p * cells;
            vec2 id = floor(grid) + seed;
            float pick = hash12(id);
            hue = hash12(id + 5.3);
            if (pick > chance) return 0.0;
            vec2 center = 0.2 + 0.6 * vec2(hash12(id + 3.7), hash12(id + 9.1));
            float dist = length(fract(grid) - center);
            float footprint = min(pixel * cells, 0.4);
            float radius = max(0.07, footprint);
            float energy = (0.07 * 0.07) / (radius * radius);
            float magnitude = 0.35 + 1.4 * pow(hash12(id + 21.3), 3.0);
            float core = smoothstep(radius, radius * 0.15, dist);
            float halo = exp(-dist * dist * 40.0) * 0.18;
            return (core + halo) * energy * magnitude;
        }

        vec3 rockCells(vec2 p) {
            vec2 cell = floor(p);
            vec2 local = fract(p);
            float near = 8.0;
            float second = 8.0;
            float id = 0.0;
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    vec2 g = vec2(float(x), float(y));
                    vec2 r = g + vec2(hash12(cell + g), hash12(cell + g + 17.3)) - local;
                    float d = dot(r, r);
                    if (d < near) {
                        second = near;
                        near = d;
                        id = hash12(cell + g + 5.1);
                    } else if (d < second) {
                        second = d;
                    }
                }
            }
            near = sqrt(near);
            return vec3(near, sqrt(second) - near, id);
        }

        float caveWall(vec2 around, float y, float height, float jag, out float ridge) {
            ridge = 0.5;
            if (y < -0.06 || y > height + jag + 0.02) return 0.0;
            ridge = fbm3(around * 6.0 + 2.0);
            float spires = pow(valueNoise(around * 46.0 + 9.0), 4.0);
            float top = 0.02 + height * ridge * ridge + jag * spires;
            return 1.0 - smoothstep(top - 0.006, top + 0.002, y);
        }
`;

export function caveUniforms(extra = {}) {
    return { caveDim: { value: 1 }, ...extra };
}

export function readColor(target, value, fallback) {
    return target.set(value || fallback);
}

export function lightCave(state, { setKeyLight, dim = 1 }, look) {
    state.lightIsMoon = false;
    setKeyLight(OVERHEAD, look.key, look.keyIntensity * dim);
    state.shadowIntensity = look.shadow ?? 0.55;
    state.shadowSoftness = look.softness ?? 1.8;
    state.ambientSky.copy(look.ambientSky);
    state.ambientGround.copy(look.ambientGround);
    state.ambientIntensity = look.ambient * dim;
    state.environmentGain = look.environment * dim;
    state.fogColor.copy(look.fog).multiplyScalar(dim);
    for (const color of [state.skyZenith, state.skyHorizon, state.skyGround]) color.copy(state.fogColor);
    state.sunColor.copy(look.key);
    state.haze = 0;
    state.daylight = 0;
    state.twilight = 0;
    state.night = 1;
    state.starVisibility = 0;
    state.flash = 0;
    state.clouds.enabled = false;
    const grade = state.grade;
    grade.exposure = look.exposure ?? 1.05;
    grade.contrast = look.contrast ?? 1.06;
    grade.saturation = look.saturation ?? 1;
    grade.night = 0;
}

export function createLook() {
    return {
        key: new Color(),
        keyIntensity: 0.1,
        ambientSky: new Color(),
        ambientGround: new Color(),
        ambient: 0.3,
        environment: 0.8,
        fog: new Color(),
    };
}
