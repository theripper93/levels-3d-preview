import { Color } from "three";
import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_NOISE3, SKY_FINISH } from "../sky/chunks.js";
import { CAVE_GLSL, OVERHEAD, caveUniforms, createLook, lightCave, readColor } from "./underground/shared.js";

const COOL = new Color(0.3, 0.36, 0.46);
const DEEP = new Color(0.004, 0.005, 0.007);

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_NOISE3}
    ${SKY_FINISH}
    ${CAVE_GLSL}

    uniform vec3 rockColor;
    uniform vec3 dripColor;
    uniform float drips;
    uniform float mist;

    const vec3 OCHRE = vec3(1.45, 0.98, 0.55);
    const vec3 KEY_LIGHT = vec3(0.62, 0.5, 0.6);
    const vec3 FILL_LIGHT = vec3(-0.72, 0.55, -0.3);

    float caveHeight(vec2 p, float detail) {
        vec2 warp = vec2(valueNoise(p * 0.3 + 1.7), valueNoise(p * 0.3 + 8.3)) - 0.5;
        vec2 q = p + warp * 1.8;
        float masses = valueNoise(q * 0.32) * 0.65 + valueNoise(q * 0.8 + 3.1) * 0.35;
        vec2 f = OCTAVE * q;
        float crest = 1.0 - abs(2.0 * valueNoise(f * vec2(0.5, 0.9) + 5.7) - 1.0);
        float knob = 1.0 - abs(2.0 * valueNoise(q * 1.7 + 9.4) - 1.0);
        float fine = valueNoise(OCTAVE * f * 2.4 + 2.2);
        float layered = masses * 5.0;
        float ledge = (floor(layered) + smoothstep(0.6, 0.9, fract(layered))) / 5.0;
        return mix(masses, ledge, 0.75) * 0.7 + crest * 0.12 + knob * knob * 0.07 * detail + (fine - 0.5) * 0.015 * detail;
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float env = environmentMode;
        vec3 deep = fogColor;
        vec2 around = normalize(dir.xz + vec2(1e-4));
        float ridge;
        float wall = caveWall(around, y, 0.14, 0.025, ridge);
        vec3 key = normalize(KEY_LIGHT);
        vec3 fill = normalize(FILL_LIGHT);

        vec3 sky = deep * (0.5 + 1.2 * exp(-abs(y) * 6.0));
        if (y > 0.015 && wall < 1.0) {
            float far = 1.0 - smoothstep(0.015, 0.32, y);
            vec2 p0 = dir.xz / max(y, 0.04) * 0.85;
            float pixel = length(fwidth(p0));
            float detail = 1.0 - smoothstep(0.04, 0.16, pixel);
            float h0 = caveHeight(p0, detail);
            vec2 p = p0 * (1.0 + 0.18 * (1.0 - h0));
            float h = caveHeight(p, detail);
            float e = 0.035;
            float hx = caveHeight(p + vec2(e, 0.0), detail);
            float hz = caveHeight(p + vec2(0.0, e), detail);
            float relief = 1.7 * (1.0 - 0.75 * smoothstep(0.1, 0.6, pixel));
            float rough = 1.0 - smoothstep(0.01, 0.04, pixel);
            vec2 grit = vec2(valueNoise(p * 34.0 + 3.3), valueNoise(p * 34.0 + 8.8)) + vec2(valueNoise(p * 80.0 + 1.1), valueNoise(p * 80.0 + 6.1)) * 0.6 - 0.8;
            vec3 n = normalize(vec3(-(hx - h) / e * relief + grit.x * 0.6 * rough, 1.0, -(hz - h) / e * relief + grit.y * 0.6 * rough));
            float lk = max(dot(n, key) * 0.8 + 0.2, 0.0);
            float lf = max(dot(n, fill) * 0.6 + 0.4, 0.0);
            float cavity = smoothstep(0.05, 0.7, h);

            float tone = valueNoise(p * 0.22 + 4.0);
            vec3 stone = rockColor * mix(vec3(0.82, 0.92, 1.1), vec3(1.1, 1.0, 0.88), tone);
            float streak = valueNoise(vec2(dot(p, vec2(0.8, 0.6)) * 3.2, dot(p, vec2(-0.6, 0.8)) * 0.3) + 9.0);
            float ochre = smoothstep(0.6, 0.85, streak) * smoothstep(0.35, 0.65, valueNoise(p * 0.45 + 12.0));
            stone = mix(stone, stone * OCHRE, ochre * 0.8);
            float pale = smoothstep(0.5, 0.8, valueNoise(p * 0.18 - 7.0));
            stone = mix(stone, stone * vec3(1.5, 1.42, 1.3), pale * 0.7);
            stone *= 0.88 + 0.24 * mix(0.5, valueNoise(p * 45.0), rough);
            float wet = smoothstep(0.55, 0.8, valueNoise(p * 0.6 - 3.0)) * min(drips, 1.5);
            stone *= 1.0 - 0.25 * wet;

            vec3 light = vec3(0.72, 0.84, 1.0) * lk * 1.15 + vec3(0.95, 0.82, 0.68) * lf * 0.3;
            vec3 ceiling = stone * light * (0.3 + 0.7 * cavity);
            float spec = pow(max(dot(n, normalize(key + vec3(0.0, 1.0, 0.0))), 0.0), 28.0);
            ceiling += (dripColor * 0.6 + 0.4) * rockColor * spec * wet * 1.6 * cavity * detail;
            if (env < 0.5) {
                float hue;
                float glints = glowPoints(p + 1.9, 11.0, 0.02 + 0.2 * wet, 5.0, pixel, hue);
                float blink = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(time * (0.4 + hue) + hue * 50.0), 6.0);
                ceiling += dripColor * glints * blink * min(drips, 2.0) * 0.08 * cavity;
            }
            sky = mix(ceiling * caveDim, sky, far * far * (3.0 - 2.0 * far));
        }
        if (wall > 0.0) {
            vec2 tangent = vec2(-around.y, around.x);
            vec3 wp = vec3(around * 12.0, y * 22.0);
            float drape = fbm2v(wp);
            float drapeNext = fbm2v(wp + vec3(tangent * 0.12, 0.0));
            float drapeUp = fbm2v(wp + vec3(0.0, 0.0, 0.12));
            float strata = valueNoise3(vec3(around * 9.0, y * 55.0));
            float shade = clamp(0.6 + (drapeNext - drape) * 7.0 + (drapeUp - drape) * 4.0, 0.08, 1.4);
            float lift = 0.35 + 0.65 * smoothstep(-0.03, 0.14, y);
            vec3 cliff = rockColor * (0.3 + 0.7 * drape) * (0.85 + 0.3 * strata) * shade * lift * 0.9;
            cliff = mix(cliff, cliff * OCHRE, smoothstep(0.62, 0.82, valueNoise3(vec3(around * 11.0, y * 2.0) + 5.0)) * 0.6);
            sky = mix(sky, cliff * caveDim + deep * 0.2, wall * smoothstep(-0.05, 0.0, y));
        }
        if (mist > 0.0) {
            float drift = time * 0.012;
            float cloud = fbm2v(vec3(dir.x * 3.0 + drift, dir.y * 30.0, dir.z * 3.0 - drift * 0.7));
            float band = exp(-abs(y - 0.03) * 14.0);
            vec3 haze = mix(rockColor * vec3(0.85, 0.95, 1.15), dripColor * 0.1, 0.2) * 0.8 * caveDim;
            sky = mix(sky, haze * (0.6 + 0.6 * cloud), clamp(band * (0.1 + 0.45 * cloud) * mist, 0.0, 0.85));
        }
        skyOutput(skyFinish(sky, y, env));
    }
`;

const rock = new Color();
const drip = new Color();
const look = createLook();

function colors(options) {
    readColor(rock, options.rockColor, "#5a5d64");
    drip.set(options.dripColor || "#8fd0ff");
}

export default {
    id: "cavern",
    group: "underground",
    order: 200,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "rockColor", type: "color", default: "#5a5d64" },
        { name: "dripColor", type: "color", default: "#8fd0ff" },
        { name: "drips", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "mist", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "ambient", type: "range", min: 0.2, max: 2, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "CavernSkyShader",
            uniforms: caveUniforms({
                rockColor: { value: new Color() },
                dripColor: { value: new Color() },
                drips: { value: 1 },
                mist: { value: 1 },
            }),
            fragmentShader,
        });
    },

    orient({ sunDirection, moonDirection }) {
        sunDirection.copy(OVERHEAD);
        moonDirection.copy(OVERHEAD);
    },

    light(state, context) {
        const { options } = context;
        colors(options);
        const ambient = Number(options.ambient);
        look.key.copy(rock).lerp(COOL, 0.7);
        look.keyIntensity = 0.03;
        look.ambientSky.copy(COOL).lerp(drip, 0.1).multiplyScalar(0.8);
        look.ambientGround.copy(rock).multiplyScalar(0.15);
        look.ambient = 0.3 * ambient;
        look.environment = 0.12;
        look.fog.copy(drip).multiplyScalar(0.003).add(DEEP);
        look.saturation = 0.92;
        look.contrast = 1.08;
        lightCave(state, context, look);
    },

    apply(dome, state, { options, dim }) {
        const uniforms = dome.material.uniforms;
        colors(options);
        uniforms.rockColor.value.copy(rock).multiplyScalar(1.05);
        uniforms.dripColor.value.copy(drip);
        uniforms.drips.value = Number(options.drips);
        uniforms.mist.value = Number(options.mist ?? 1);
        uniforms.caveDim.value = dim ?? 1;
        dome.setBodies([]);
    },
};
