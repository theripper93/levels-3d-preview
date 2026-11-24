import { Color } from "three";
import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_FINISH } from "../sky/chunks.js";
import { ELEMENTAL_GLSL, createLook, fixedDirection, lightEnclosed, readColor } from "./elemental/shared.js";

const ROCK = new Color(0.085, 0.07, 0.058);
const DUST = new Color(0.32, 0.25, 0.18);
const WARM = new Color(1, 0.9, 0.75);
const vein = new Color();
const look = createLook();

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_FINISH}
    ${ELEMENTAL_GLSL}

    uniform float veinGlow;

    float ridge(float n, float sharpness) {
        return pow(1.0 - abs(n * 2.0 - 1.0), sharpness);
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float up = max(y, 0.0);
        float env = environmentMode;
        vec3 sunDir = normalize(sunDirection);
        vec3 vein = tintOf(sunColor);
        vec3 rock = skyZenith;
        vec3 dust = skyHorizon;
        float t = time;

        vec3 sky = dust;
        if (y > -0.02) {
            vec2 p = dir.xz / (up + 0.12) * 0.8;
            float stone = fbm3(p * 2.6);
            vec2 warp = vec2(valueNoise(p * 0.7), valueNoise(p * 0.7 + 5.2)) - 0.5;
            float heart = pow(max(dot(dir, sunDir), 0.0), 3.0);
            float region = smoothstep(0.35, 0.75, valueNoise(p * 0.3 + 9.0)) * 0.7 + 0.3 + heart * 0.8;
            float line = ridge(fbm2(p * 1.1 + warp * 1.5 + (stone - 0.5) * 0.25), 1.0);
            float veins = pow(line, mix(36.0, 6.0, env)) * (env > 0.5 ? 1.0 : smoothstep(0.25, 0.65, valueNoise(p * 2.2 + 17.0)) * 1.3);
            float halo = pow(line, 5.0) * 0.12;
            if (env < 0.5 && region > 0.45) veins += pow(ridge(valueNoise(p * 3.4 + warp * 2.5 + 3.0), 1.0), 40.0) * 0.5 * smoothstep(0.45, 0.8, region);
            veins *= region * veinGlow;
            halo *= region * veinGlow;

            float ledge = fract(stone * 5.0);
            float facet = 0.6 + 0.4 * smoothstep(0.0, 0.15, ledge) - 0.18 * smoothstep(0.8, 1.0, ledge);
            sky = rock * (0.25 + 1.4 * stone * stone) * facet * (1.0 + 6.0 * halo) + vein * (region * veinGlow * 0.03 + halo);
            sky += vein * veins * 2.2 + mix(vein, vec3(1.0), 0.5) * pow(veins, 3.0) * 1.5;

            if (env < 0.5) {
                vec2 grid = p * 7.0;
                vec2 id = floor(grid);
                float pick = hash12(id + 31.0);
                if (pick < 0.05 * region * veinGlow) {
                    vec2 center = 0.3 + 0.4 * vec2(hash12(id + 3.7), hash12(id + 9.1));
                    float d = length(fract(grid) - center);
                    float pulse = 0.75 + 0.25 * sin(t * (0.6 + pick * 8.0) + pick * 50.0);
                    float crystal = (1.0 - smoothstep(0.0, 0.07, d)) * 2.5 + exp(-d * 9.0) * 0.5;
                    sky += mix(vein, vec3(1.0), 0.45) * crystal * pulse * smoothstep(0.05, 0.3, y);
                }
            }

            sky = mix(sky, dust, (1.0 - smoothstep(0.0, 0.3, up)) * 0.9);
        }

        if (env < 0.5 && y > -0.06 && y < 0.25) {
            float u = azimuth01(dir);
            float ridgeLine = 0.05 + 0.16 * pow(wrapNoise(vec2(u * 9.0, 0.0), 9.0), 2.0) + 0.03 * wrapNoise(vec2(u * 60.0, 1.0), 60.0);
            float wall = 1.0 - smoothstep(ridgeLine - 0.003, ridgeLine + 0.003, y);
            float wallHaze = smoothstep(0.0, ridgeLine, y);
            sky = mix(sky, mix(rock * 0.8, dust, 0.1 + 0.55 * (1.0 - wallHaze)) + vein * 0.02 * veinGlow, wall * 0.9 * smoothstep(-0.06, 0.0, y));
        }

        if (env < 0.5) {
            float specks = motes(dir, 180.0, 0.12, -0.04, 0.35, 5.0);
            sky += mix(dust, vein, 0.5) * specks * (1.0 - smoothstep(0.2, 0.7, up)) * 0.5;
        }

        sky = mix(sky, skyGround, smoothstep(0.0, 0.25, -y));
        vec3 result = skyFinish(sky, y, env);
        if (y < 0.0) result = min(mix(result, mix(fogColor, skyGround, smoothstep(0.0, 0.4, -y)), smoothstep(0.0, 0.04, -y)), vec3(mix(1e4, environmentClamp, env)));
        skyOutput(result);
    }
`;

export default {
    id: "planeOfEarth",
    order: 53,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "veinColor", type: "color", default: "#ffad45" },
        { name: "glow", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "dust", type: "range", min: 0, max: 1, step: 0.05, default: 0.4 },
    ],

    createDome() {
        return new SkyDome({
            name: "PlaneOfEarthSkyShader",
            uniforms: { veinGlow: { value: 1 } },
            fragmentShader,
        });
    },

    orient: fixedDirection(60, 70),

    light(state, ctx) {
        const { options } = ctx;
        const glow = Number(options.glow);
        const dust = Number(options.dust);
        readColor(vein, options.veinColor, "#ffad45");
        look.accent.copy(vein);
        look.key.copy(vein).lerp(WARM, 0.45);
        look.keyIntensity = 0.25 + 0.75 * glow;
        look.shadow = 0.7;
        look.softness = 1.8;
        look.ambientSky.copy(vein).lerp(DUST, 0.5);
        look.ambientGround.copy(DUST).multiplyScalar(0.35);
        look.ambient = 0.45 + 0.25 * glow;
        look.environment = 0.8;
        look.zenith.copy(ROCK);
        look.horizon.copy(DUST).lerp(vein, 0.2).multiplyScalar(0.25 + 0.25 * glow);
        look.ground.copy(ROCK).multiplyScalar(0.5);
        look.fog.copy(look.horizon);
        look.fogDensity = 0.08 + 0.5 * dust;
        look.fogHeight = 3;
        look.contrast = 1.06;
        look.saturation = 0.96;
        lightEnclosed(state, ctx, look);
    },

    apply(dome, state, { options }) {
        dome.material.uniforms.veinGlow.value = Number(options.glow);
    },
};
