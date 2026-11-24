import { Color } from "three";
import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_FINISH } from "../sky/chunks.js";
import { CAVE_GLSL, OVERHEAD, caveUniforms, createLook, lightCave, readColor } from "./underground/shared.js";
import { ELEMENTAL_GLSL } from "./elemental/shared.js";

const BASALT = new Color(0.05, 0.035, 0.03);
const DEEP = new Color(0.012, 0.004, 0.002);

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_FINISH}
    ${CAVE_GLSL}
    ${ELEMENTAL_GLSL}

    uniform vec3 magmaColor;
    uniform vec3 rockColor;
    uniform float glowStrength;
    uniform float embers;

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float env = environmentMode;
        vec3 deep = fogColor;
        float glow = glowStrength;
        vec2 around = normalize(dir.xz + vec2(1e-4));
        float ridge;
        float wall = caveWall(around, y, 0.11, 0.06, ridge);
        float heat = 0.75 + 0.25 * sin(time * 0.6 + fbm2(around * 3.0) * 6.0);

        vec3 sky = deep * (0.5 + 1.2 * exp(-abs(y) * 6.0)) + magmaColor * glow * 0.05 * exp(-abs(y) * 9.0) * heat;
        if (y < 0.0) {
            vec2 lake = dir.xz / max(-y, 0.04) * 0.5;
            float crust = fbm2(lake * 1.5 + vec2(time * 0.02, 0.0));
            float molten = 1.0 - smoothstep(0.35, 0.6, crust);
            sky = mix(sky, magmaColor * glow * (0.12 + 0.9 * molten) * heat, smoothstep(0.0, -0.03, y));
        }
        vec2 p = dir.xz / max(y, 0.05) * 0.6;
        vec2 slope = fwidth(p);
        float pixel = max(slope.x, slope.y);
        if (y > 0.02 && wall < 1.0) {
            float far = 1.0 - smoothstep(0.02, 0.3, y);
            float rock = fbm2(p * 1.3);
            float veinNoise = fbm2(p * 0.45 + 3.0);
            vec3 cells = rockCells(p * 2.6 + (vec2(rock, veinNoise) - 0.5) * 2.2);
            float blur = clamp(pixel * 8.0, 0.0, 1.0);
            float edge = mix(cells.y, 0.25, blur);
            float bulge = mix(1.0 - cells.x, 0.5, blur);
            float grit = mix(valueNoise(p * 11.0), 0.5, blur);
            float facet = (0.7 + 0.4 * cells.z) * (0.55 + 0.6 * bulge) * (0.7 + 0.3 * smoothstep(0.0, 0.08, edge)) * (0.7 + 0.6 * grit);
            float under = 0.15 + 0.85 * pow(1.0 - smoothstep(0.02, 0.5, y), 2.0);
            vec3 ember = mix(magmaColor, vec3(1.0, 0.5, 0.15), 0.5);
            vec3 ceiling = rockColor * (0.4 + 0.9 * rock) * facet;
            ceiling += ember * rockColor * glow * under * (0.6 + 3.0 * bulge * bulge * bulge) * heat;
            float lode = smoothstep(0.45, 0.7, veinNoise);
            float veins = lode * (1.0 - smoothstep(0.0, 0.05, edge)) * (1.0 - blur);
            float pulse = 0.65 + 0.35 * sin(time * 0.9 + veinNoise * 20.0);
            float core = lode * (1.0 - smoothstep(0.0, 0.015, edge)) * (1.0 - blur);
            ceiling += mix(ember, vec3(1.0, 0.75, 0.35), core) * (veins * 0.6 + core * 1.6) * pulse * glow;
            ceiling += ember * lode * blur * glow * 0.06;
            sky = mix(ceiling * caveDim, sky, far * far * (3.0 - 2.0 * far));
        }
        if (wall > 0.0) {
            float strata = valueNoise(vec2(around.x * 55.0 + around.y * 33.0, y * 80.0));
            vec3 cliff = rockColor * (0.15 + 0.25 * strata) * caveDim + deep * 0.2;
            float lit = exp(-max(y, 0.0) * 18.0);
            cliff += magmaColor * glow * lit * heat * 0.12;
            float seam = smoothstep(0.7, 0.88, fbm2(vec2(around.x * 16.0 - around.y * 11.0, y * 20.0)));
            cliff += magmaColor * seam * glow * 0.25 * (0.7 + 0.3 * sin(time * 1.3 + around.x * 9.0));
            sky = mix(sky, cliff, wall * smoothstep(-0.05, 0.0, y));
        }
        if (env < 0.5 && embers > 0.0 && y > -0.02 && y < 0.7) {
            float rise = motes(dir, 120.0, 0.06 * embers, 0.6, 0.15, 3.0) + motes(dir, 70.0, 0.04 * embers, 0.4, 0.25, 11.0) * 1.4;
            sky += mix(magmaColor, vec3(1.0, 0.85, 0.5), 0.35) * rise * (1.0 - smoothstep(0.2, 0.7, y)) * 1.5;
        }
        skyOutput(skyFinish(sky, y, env));
    }
`;

const magma = new Color();
const rock = new Color();
const look = createLook();

function colors(options) {
    magma.set(options.magmaColor || "#ff7420");
    readColor(rock, options.rockColor, "#4a3a34");
}

export default {
    id: "magmaChamber",
    group: "underground",
    order: 220,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "magmaColor", type: "color", default: "#ff7420" },
        { name: "rockColor", type: "color", default: "#4a3a34" },
        { name: "glow", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "embers", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "ambient", type: "range", min: 0.2, max: 2, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "MagmaChamberSkyShader",
            uniforms: caveUniforms({
                magmaColor: { value: new Color() },
                rockColor: { value: new Color() },
                glowStrength: { value: 1 },
                embers: { value: 1 },
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
        const glow = Number(options.glow);
        const ambient = Number(options.ambient);
        look.key.copy(magma).lerp(BASALT, 0.35);
        look.keyIntensity = 0.06 + 0.06 * glow;
        look.ambientSky.copy(rock).lerp(magma, 0.25);
        look.ambientGround.copy(magma).lerp(BASALT, 0.3).multiplyScalar(0.3 + 0.25 * glow);
        look.ambient = (0.3 + 0.1 * glow) * ambient;
        look.environment = 0.45 + 0.25 * glow;
        look.fog.copy(magma).multiplyScalar(0.01 + 0.008 * glow).add(DEEP);
        look.saturation = 1.05;
        look.contrast = 1.08;
        lightCave(state, context, look);
    },

    apply(dome, state, { options, dim }) {
        const uniforms = dome.material.uniforms;
        colors(options);
        uniforms.magmaColor.value.copy(magma);
        uniforms.rockColor.value.copy(rock).multiplyScalar(0.5);
        uniforms.glowStrength.value = Number(options.glow);
        uniforms.embers.value = Number(options.embers);
        uniforms.caveDim.value = dim ?? 1;
        dome.setBodies([]);
    },
};
