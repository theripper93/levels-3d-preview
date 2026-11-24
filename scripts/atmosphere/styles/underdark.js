import { Color } from "three";
import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_FINISH } from "../sky/chunks.js";
import { CAVE_GLSL, OVERHEAD, caveUniforms } from "./underground/shared.js";

const STONE = new Color(0.22, 0.24, 0.3);
const DEEP = new Color(0.004, 0.005, 0.008);

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_FINISH}
    ${CAVE_GLSL}

    uniform vec3 crystalColor;
    uniform vec3 fungusColor;
    uniform vec3 rockColor;
    uniform float glowStrength;

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float env = environmentMode;
        vec3 deep = fogColor;
        float glow = glowStrength;

        vec2 around = normalize(dir.xz + vec2(1e-4));
        float ridge;
        float wall = caveWall(around, y, 0.13, 0.07, ridge);

        vec3 mist = mix(crystalColor, fungusColor, 0.5 + 0.5 * sin(around.x * 3.0 + around.y * 2.0)) * 0.015 * glow;
        vec3 sky = deep * (0.5 + 1.4 * exp(-abs(y) * 7.0)) + mist * exp(-abs(y) * 10.0);
        vec2 p = dir.xz / max(y, 0.05) * 0.7;
        vec2 slope = fwidth(p);
        float pixel = max(slope.x, slope.y);
        if (y > 0.02 && wall < 1.0) {
            float far = 1.0 - smoothstep(0.02, 0.3, y);
            float rock = fbm2(p * 1.2);
            float clusterNoise = fbm2(p * 0.4 + 11.0);
            float mossNoise = fbm2(p * 0.7 - 4.0);
            vec3 cells = rockCells(p * 2.2 + (vec2(rock, mossNoise) - 0.5) * 2.4);
            float blur = clamp(pixel * 8.0, 0.0, 1.0);
            float crack = mix(smoothstep(0.0, 0.03 + 0.06 * rock, cells.y), 0.85, blur);
            float bulge = mix(1.0 - cells.x, 0.5, blur);
            float cluster = smoothstep(0.52, 0.78, clusterNoise);
            float moss = smoothstep(0.5, 0.75, mossNoise) * (1.0 - cluster);
            vec3 lit = crystalColor * cluster + fungusColor * moss;
            float facet = (0.55 + 0.6 * cells.z) * (0.35 + 0.9 * bulge * bulge) * (0.5 + 0.5 * crack);
            vec3 ceiling = rockColor * (0.3 + 1.2 * rock) * facet;
            ceiling += lit * glow * (0.01 + 0.07 * bulge * bulge) * crack;
            if (env < 0.5) {
                float hue;
                float crystals = glowPoints(p, 4.5, 0.03 + 0.6 * cluster, 0.0, pixel, hue);
                ceiling += mix(crystalColor, crystalColor.gbr * 0.6 + crystalColor * 0.6, hue * 0.5) * crystals * 1.6 * glow;
                float shimmer;
                float spores = glowPoints(p + 7.3, 10.0, 0.02 + 0.55 * moss, 17.0, pixel, shimmer);
                float pulse = 0.65 + 0.35 * sin(time * (0.4 + shimmer) + shimmer * 40.0);
                ceiling += mix(fungusColor, fungusColor * vec3(0.6, 1.2, 1.1), shimmer) * spores * pulse * glow;
                if (far < 0.9) {
                    float dust = glowPoints(p * 1.7 + 3.1, 22.0, 0.04, 29.0, pixel * 1.7, hue);
                    ceiling += mix(crystalColor, fungusColor, hue) * dust * 0.25 * glow;
                }
            } else {
                ceiling += (crystalColor * cluster * 0.25 + fungusColor * moss * 0.18) * glow;
            }
            sky = mix(ceiling * caveDim, sky, far * far * (3.0 - 2.0 * far));
        }
        if (wall > 0.0) {
            float strata = valueNoise(vec2(around.x * 60.0 + around.y * 37.0, y * 90.0));
            vec3 cliff = rockColor * (0.12 + 0.25 * strata) * caveDim + deep * 0.15;
            float seam = smoothstep(0.62, 0.85, fbm2(vec2(around.x * 14.0 - around.y * 9.0, y * 25.0)));
            cliff += mix(crystalColor, fungusColor, ridge) * seam * glow * 0.03 * caveDim;
            sky = mix(sky, cliff, wall * smoothstep(-0.05, 0.0, y));
        }
        skyOutput(skyFinish(sky, y, env));
    }
`;

const crystal = new Color();
const fungus = new Color();
const mixed = new Color();

function colors(options) {
    crystal.set(options.crystalColor || "#3fe0c8");
    fungus.set(options.fungusColor || "#9a5cff");
}

export default {
    id: "underdark",
    group: "underground",
    order: 210,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "crystalColor", type: "color", default: "#3fe0c8" },
        { name: "fungusColor", type: "color", default: "#9a5cff" },
        { name: "glow", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "ambient", type: "range", min: 0.2, max: 2, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "UnderdarkSkyShader",
            uniforms: caveUniforms({
                crystalColor: { value: new Color() },
                fungusColor: { value: new Color() },
                rockColor: { value: new Color(0.035, 0.032, 0.04) },
                glowStrength: { value: 1 },
            }),
            fragmentShader,
        });
    },

    orient({ sunDirection, moonDirection }) {
        sunDirection.copy(OVERHEAD);
        moonDirection.copy(OVERHEAD);
    },

    light(state, { options, dim, setKeyLight }) {
        colors(options);
        const glow = Number(options.glow);
        const ambient = Number(options.ambient);
        mixed.copy(crystal).lerp(fungus, 0.35).lerp(STONE, 0.4);
        state.lightIsMoon = false;
        setKeyLight(OVERHEAD, mixed, (0.1 + 0.12 * glow) * dim);
        state.shadowIntensity = 0.55;
        state.shadowSoftness = 1.8;
        state.ambientSky.copy(crystal).lerp(STONE, 0.55);
        state.ambientGround.copy(fungus).lerp(STONE, 0.5).multiplyScalar(0.8);
        state.ambientIntensity = (0.3 + 0.08 * glow) * ambient * dim;
        state.environmentGain = (0.6 + 0.3 * glow) * dim;
        state.fogColor.copy(crystal).add(fungus).multiplyScalar(0.006).add(DEEP).multiplyScalar(dim);
        for (const color of [state.skyZenith, state.skyHorizon, state.skyGround]) color.copy(state.fogColor);
        state.sunColor.copy(crystal);
        state.haze = 0;
        state.daylight = 0;
        state.twilight = 0;
        state.night = 1;
        state.starVisibility = 0;
        state.clouds.enabled = false;
        const grade = state.grade;
        grade.exposure = 1.05;
        grade.contrast = 1.06;
        grade.saturation = 1.05;
        grade.night = 0;
    },

    apply(dome, state, { options, dim }) {
        const uniforms = dome.material.uniforms;
        colors(options);
        uniforms.crystalColor.value.copy(crystal);
        uniforms.fungusColor.value.copy(fungus);
        uniforms.glowStrength.value = Number(options.glow);
        uniforms.caveDim.value = dim ?? 1;
        dome.setBodies([]);
    },
};
