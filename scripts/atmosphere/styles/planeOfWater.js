import { Color } from "three";
import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_FINISH } from "../sky/chunks.js";
import { ELEMENTAL_GLSL, createLook, fixedDirection, lightEnclosed, readColor } from "./elemental/shared.js";

const SUNLIGHT = new Color(0.92, 1, 0.97);
const ABYSS = new Color(0.004, 0.012, 0.03);
const water = new Color();
const look = createLook();

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_FINISH}
    ${ELEMENTAL_GLSL}

    uniform float causticStrength;

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float up = max(y, 0.0);
        float env = environmentMode;
        vec3 sunDir = normalize(sunDirection);
        vec3 shallow = skyZenith;
        vec3 water = skyHorizon;
        vec3 light = tintOf(sunColor);
        float t = time;

        vec3 sky = mix(water, shallow, smoothstep(0.0, 0.75, y));
        sky = mix(sky, skyGround, smoothstep(0.0, 0.7, -y));

        if (y > 0.05) {
            vec2 sp = dir.xz / y;
            vec2 wave = vec2(valueNoise(sp * 1.4 + vec2(t * 0.12, 0.0)), valueNoise(sp * 1.4 + vec2(3.1, 1.7) - vec2(0.0, t * 0.1))) - 0.5;
            float windowY = y + wave.x * 0.05;
            float window = smoothstep(0.6, 0.7, windowY);
            vec3 bent = normalize(dir + vec3(wave.x, 0.0, wave.y) * 0.25);
            float sunSpot = pow(max(dot(bent, sunDir), 0.0), 24.0);
            vec3 surface = mix(shallow * 1.6, light * 2.2, 0.35 + 0.3 * wave.y) + light * sunSpot * mix(4.0, 1.5, env);
            sky = mix(sky, surface, window);
            sky += shallow * exp(-pow((windowY - 0.65) * 22.0, 2.0)) * 0.6;

            if (causticStrength > 0.0) {
                vec2 cp = sp * 2.4 + wave * 1.2;
                float a = valueNoise(cp + vec2(t * 0.35, t * 0.12));
                float b = valueNoise(cp * 1.2 + vec2(7.0 - t * 0.27, t * 0.21));
                float web = pow(1.0 - abs(a - b), mix(20.0, 4.0, env)) * (0.35 + a + b * 0.5);
                float fade = smoothstep(0.08, 0.35, y) * mix(1.0, 0.5, window);
                sky += mix(shallow * 1.4, light, 0.35) * web * fade * causticStrength * mix(0.9, 0.3, env);
            }
        }

        if (env < 0.5) {
            float u = azimuth01(dir) * 48.0;
            float shafts = wrapNoise(vec2(u, t * 0.15), 48.0) * wrapNoise(vec2(u * 2.5, t * 0.22 + 4.0), 120.0);
            shafts = smoothstep(0.18, 0.62, shafts);
            float band = smoothstep(-0.35, 0.25, y) * (1.0 - smoothstep(0.45, 0.85, y));
            float facing = 0.55 + 0.45 * max(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-4), normalize(vec3(sunDir.x, 0.0, sunDir.z) + 1e-4)), 0.0);
            sky += mix(shallow, light, 0.3) * shafts * band * facing * 0.24;

            float bubbles = motes(dir, 140.0, 0.1, 0.4, 0.14, 0.0);
            sky += mix(shallow, vec3(1.0), 0.6) * bubbles * (1.0 - smoothstep(0.3, 0.8, y)) * 0.6;
        }

        vec3 result = skyFinish(sky, y, env);
        if (y < 0.0) result = min(mix(result, mix(fogColor, skyGround, smoothstep(0.0, 0.45, -y)), smoothstep(0.0, 0.04, -y)), vec3(mix(1e4, environmentClamp, env)));
        skyOutput(result);
    }
`;

export default {
    id: "planeOfWater",
    order: 51,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "waterColor", type: "color", default: "#1d8f9c" },
        { name: "depth", type: "range", min: 0, max: 1, step: 0.05, default: 0.35 },
        { name: "caustics", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "PlaneOfWaterSkyShader",
            uniforms: { causticStrength: { value: 1 } },
            fragmentShader,
        });
    },

    orient: fixedDirection(200, 76),

    light(state, ctx) {
        const { options } = ctx;
        const depth = Number(options.depth);
        const shallowness = 1 - depth;
        readColor(water, options.waterColor, "#1d8f9c");
        look.accent.copy(SUNLIGHT).lerp(water, 0.15);
        look.key.copy(SUNLIGHT).lerp(water, 0.5 + 0.3 * depth);
        look.keyIntensity = 0.6 + 1.1 * shallowness;
        look.shadow = 0.75;
        look.softness = 1.8;
        look.ambientSky.copy(water).lerp(SUNLIGHT, 0.35);
        look.ambientGround.copy(water).multiplyScalar(0.3);
        look.ambient = 0.55 + 0.35 * shallowness;
        look.environment = 0.9;
        look.zenith.copy(water).lerp(SUNLIGHT, 0.45).multiplyScalar(0.35 + 1.1 * shallowness);
        look.horizon.copy(water).multiplyScalar(0.18 + 0.4 * shallowness);
        look.ground.copy(ABYSS).lerp(water, 0.08);
        look.fog.copy(water).multiplyScalar(0.16 + 0.34 * shallowness);
        look.fogDensity = 0.55 + 0.4 * depth;
        look.fogHeight = 12;
        look.contrast = 1.04;
        look.saturation = 1.02;
        lightEnclosed(state, ctx, look);
        state.grade.night = 0.35 + 0.35 * depth;
        state.grade.nightTint.copy(water).lerp(SUNLIGHT, 0.4).multiplyScalar(1.5);
    },

    apply(dome, state, { options }) {
        dome.material.uniforms.causticStrength.value = Number(options.caustics);
    },
};
