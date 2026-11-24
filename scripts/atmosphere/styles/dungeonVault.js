import { Color } from "three";
import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_NOISE3, SKY_FINISH } from "../sky/chunks.js";
import { CAVE_GLSL, OVERHEAD, caveUniforms, createLook, lightCave, readColor } from "./underground/shared.js";
import { ELEMENTAL_GLSL } from "./elemental/shared.js";

const DEEP = new Color(0.005, 0.004, 0.0035);
const WARM_STONE = new Color(0.32, 0.27, 0.22);

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_NOISE3}
    ${SKY_FINISH}
    ${CAVE_GLSL}
    ${ELEMENTAL_GLSL}

    uniform vec3 stoneColor;
    uniform vec3 torchColor;
    uniform float torches;

    const float WALL_TOP = 0.15;
    const float SCONCES = 14.0;
    const float FLAME_Y = 0.068;
    const float COURSES = 16.0;
    const float BRICKS = 19.0;
    const float WALL_BLOCKS = 120.0;
    const float WALL_COURSES = 52.0;

    float flicker(float seed) {
        return 0.82 + 0.1 * sin(time * 7.3 + seed * 13.0) + 0.08 * sin(time * 12.9 + seed * 5.0) * sin(time * 3.1 + seed);
    }

    vec3 masonry(vec2 uv, vec2 pixel, float width, float seed, float period) {
        float row = floor(uv.y);
        float shift = 0.5 * mod(row, 2.0) + 0.15 * (hash12(vec2(row, seed)) - 0.5);
        vec2 brick = vec2(uv.x + shift, uv.y);
        vec2 id = floor(brick);
        if (period > 0.0) id.x = mod(id.x, period);
        vec2 f = fract(brick);
        vec2 d = min(f, 1.0 - f);
        float wobble = width * (0.6 + 0.8 * hash12(id + seed + 0.37));
        vec2 m = smoothstep(vec2(wobble), vec2(wobble) + pixel * 1.5, d);
        vec2 bevel = smoothstep(vec2(wobble), vec2(wobble) + max(pixel * 1.5, vec2(0.14, 0.22)), d);
        float face = 0.62 + 0.38 * bevel.x * bevel.y;
        return vec3(m.x * m.y * face, hash12(id + seed * 7.1), valueNoise(f * vec2(2.5, 1.5) + id * 3.7));
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float env = environmentMode;
        vec3 deep = fogColor;
        float angle = azimuth01(dir);
        float slot = angle * SCONCES;
        float sconce = mod(floor(slot + 0.5), SCONCES);
        float lobe = 0.5 + 0.5 * cos(slot * PI2);
        float warmth = torches * flicker(sconce);
        vec3 flameLight = mix(torchColor, vec3(1.0, 0.86, 0.72), 0.35);

        vec3 sky = deep * (0.5 + 1.2 * exp(-abs(y) * 6.0)) + torchColor * 0.01 * torches * exp(-abs(y) * 10.0);
        if (y > WALL_TOP - 0.01) {
            vec2 p = dir.xz / max(y, 0.05) * 1.05;
            vec2 cellId = floor(p);
            vec2 l = fract(p) - 0.5;
            vec2 a = abs(l);
            float pixel = length(fwidth(p));
            float blur = smoothstep(0.03, 0.12, pixel);
            bool spanX = a.y > a.x;
            float across = spanX ? l.y : l.x;
            float along = spanX ? l.x : l.y;
            float rise = sqrt(max(0.25 - across * across, 0.0));
            vec3 n = spanX ? vec3(0.0, -rise, -l.y) * 2.0 : vec3(-l.x, -rise, 0.0) * 2.0;

            float arc = asin(clamp(across * 2.0, -1.0, 1.0)) / 1.5708;
            vec2 uv = vec2(along * BRICKS + (spanX ? 0.0 : 3.7), arc * COURSES + 0.5);
            vec2 uvPixel = min(fwidth(uv), vec2(1.0));
            vec3 web = masonry(uv, uvPixel, 0.05, dot(cellId, vec2(3.1, 7.7)) + (spanX ? 0.0 : 11.0), 0.0);
            float brickBlur = max(blur, smoothstep(0.2, 0.5, max(uvPixel.x, uvPixel.y)));
            float joints = mix(web.x, 0.75, brickBlur);
            float grain = mix(web.z, 0.5, brickBlur);
            float pick = mix(web.y, 0.5, brickBlur);
            vec3 stone = stoneColor * mix(vec3(0.82, 0.86, 0.92), vec3(1.12, 1.02, 0.9), fract(pick * 7.3)) * (0.6 + 0.65 * pick) * (0.78 + 0.4 * grain);
            stone *= 0.42 + 0.58 * joints;
            float damp = smoothstep(0.55, 0.85, fbm2(p * 0.55 + 4.0));
            stone *= 1.0 - 0.35 * damp;

            float aa = pixel * 1.2 + 0.004;
            float groinD = abs(a.x - a.y) * 0.7071;
            float transD = 0.5 - max(a.x, a.y);
            float groinW = 0.02;
            float transW = 0.05;
            float groin = 1.0 - smoothstep(groinW - aa, groinW + aa, groinD);
            float trans = 1.0 - smoothstep(transW - aa, transW + aa, transD);
            vec2 perp = vec2(sign(l.x), -sign(l.y)) * 0.7071;
            float groinU = clamp((a.x - a.y) * 0.7071 / groinW, -1.0, 1.0);
            vec3 groinN = vec3(-l.x, -max(0.25 - a.x * a.x, 0.0) * 2.5, -l.y) + vec3(perp.x, 0.0, perp.y) * groinU * 0.55;
            vec2 edge = spanX ? vec2(0.0, sign(l.y)) : vec2(sign(l.x), 0.0);
            float transU = clamp(transD / transW, 0.0, 1.0);
            float archRise = sqrt(max(0.25 - along * along, 0.0));
            vec3 transN = vec3(0.0, -archRise * 2.0, 0.0) + (spanX ? vec3(-l.x, 0.0, 0.0) : vec3(0.0, 0.0, -l.y)) * 2.0 - vec3(edge.x, 0.0, edge.y) * transU * 0.7;
            float ribAo = mix(0.45, 1.0, smoothstep(groinW, groinW * 2.6 + aa, groinD)) * mix(0.45, 1.0, smoothstep(transW, transW * 2.0 + aa, transD));
            vec2 outward = p / max(length(p), 1e-3) * smoothstep(0.0, 2.5, length(p));
            float groinSide = (a.x - a.y) * 0.7071 * -sign(dot(perp, outward));
            float castG = smoothstep(groinW * 0.8, groinW, groinSide) * (1.0 - smoothstep(groinW, groinW * 4.0, groinSide));
            float castT = step(dot(edge, outward), 0.0) * (1.0 - smoothstep(transW, transW * 3.0, transD));
            stone *= mix(ribAo * (1.0 - 0.55 * max(castG, castT)), 1.0, blur);

            float bossR = length(l);
            float boss = 1.0 - smoothstep(0.055 - aa, 0.055 + aa, bossR);
            vec3 bossN = vec3(-l.x * 12.0, -0.6, -l.y * 12.0);
            float carve = 0.55 + 0.45 * smoothstep(0.012, 0.02, abs(bossR - 0.036)) * (0.7 + 0.3 * sin(atan(l.y, l.x) * 8.0));

            vec3 normal = normalize(n);
            normal = normalize(mix(normal, normalize(groinN), groin * (1.0 - blur)));
            normal = normalize(mix(normal, normalize(transN), trans * (1.0 - blur)));
            normal = normalize(mix(normal, normalize(bossN), boss * (1.0 - blur)));
            float segment = groin > trans ? (a.x + a.y) * 14.0 : along * 16.0;
            float segmentPixel = min(fwidth(segment), 1.0);
            float voussoir = smoothstep(0.0, 0.05 + segmentPixel * 1.5, min(fract(segment), 1.0 - fract(segment)));
            vec3 ribStone = stoneColor * 1.1 * (0.85 + 0.3 * valueNoise(p * 60.0 + 3.0)) * (0.85 + 0.25 * hash12(vec2(floor(segment), groin > trans ? dot(cellId, vec2(1.0, 9.0)) : dot(spanX ? vec2(cellId.x, floor(p.y + 0.5)) : vec2(floor(p.x + 0.5), cellId.y), vec2(1.0, 9.0)) + 0.5))) * (0.6 + 0.4 * mix(voussoir, 1.0, blur));
            float rib = max(max(groin, trans), boss) * (1.0 - blur);
            vec3 surface = mix(stone, ribStone * mix(1.0, carve, boss), rib);

            vec3 toTorch = normalize(vec3(outward.x, -0.75, outward.y));
            float facing = dot(normal, toTorch);
            float lambert = max(facing, 0.0) * 0.6 + 0.4 * (facing * 0.5 + 0.5);
            float height = y - WALL_TOP;
            float spread = smoothstep(0.08, 0.45, height);
            float vaultLobe = mix(lobe, 0.5, spread);
            float vaultWarmth = torches * mix(flicker(sconce), flicker(3.7), spread);
            float reach = exp(-height * 2.6);
            float pools = pow(vaultLobe, mix(10.0, 1.2, smoothstep(0.0, 0.5, height)));
            float soot = pow(lobe, 30.0) * exp(-height * 14.0) * smoothstep(0.0, 0.03, height);
            surface *= 1.0 - 0.75 * soot;
            vec3 light = flameLight * vaultWarmth * reach * (0.25 + 1.8 * pools) * lambert * 1.6;
            light += vec3(0.2, 0.22, 0.28) * (0.6 - 0.4 * normal.y);
            vec3 ceiling = surface * (light + flameLight * vaultWarmth * pow(vaultLobe, 5.0) * exp(-height * 7.0) * 1.4);
            float cornice = smoothstep(WALL_TOP - 0.004, WALL_TOP + 0.002, y) * (1.0 - smoothstep(WALL_TOP + 0.006, WALL_TOP + 0.01, y));
            ceiling = mix(ceiling, stoneColor * flameLight * warmth * (0.4 + 2.0 * pow(lobe, 6.0)) * 0.8, cornice);
            ceiling *= mix(1.0, 0.7, smoothstep(WALL_TOP + 0.009, WALL_TOP + 0.02, y) * (1.0 - smoothstep(WALL_TOP + 0.02, WALL_TOP + 0.05, y)));
            float far = 1.0 - smoothstep(WALL_TOP, 0.5, y);
            sky = mix(ceiling * caveDim, sky, far * far * 0.25);
        }
        if (y < WALL_TOP + 0.002 && y > -0.08) {
            float rim = max(length(dir.xz), 1e-3);
            float du = length(fwidth(dir.xz)) / rim / PI2;
            vec2 wallUv = vec2(angle * WALL_BLOCKS, y * WALL_COURSES);
            vec2 wallPixel = min(vec2(du * WALL_BLOCKS, fwidth(y) * WALL_COURSES), vec2(1.0));
            vec3 block = masonry(wallUv, wallPixel, 0.04, 5.0, WALL_BLOCKS);
            float wallBlur = smoothstep(0.15, 0.5, max(wallPixel.x, wallPixel.y));
            float tone = mix(block.y, 0.5, wallBlur);
            vec3 wall = stoneColor * mix(vec3(0.82, 0.86, 0.92), vec3(1.12, 1.02, 0.9), fract(tone * 7.3)) * (0.6 + 0.6 * tone) * (0.8 + 0.4 * mix(block.z, 0.5, wallBlur));
            wall *= 0.3 + 0.7 * mix(block.x, 0.8, wallBlur);
            wall *= 0.75 + 0.5 * fbm2v(dir * vec3(16.0, 40.0, 16.0) + 2.0) * (1.0 - wallBlur);

            float dx = (fract(slot + 0.5) - 0.5) * PI2 / SCONCES;
            float dy = y - FLAME_Y;
            float sway = sin(time * 9.0 + sconce * 3.0) * 0.0012 * clamp(dy / 0.02, 0.0, 1.0);
            float pool = exp(-(dx * dx + dy * dy * 1.4) / 0.003);
            float wash = exp(-dx * dx / 0.012) * exp(-abs(dy) * 8.0);
            float plume = exp(-dx * dx / (0.00006 + max(dy, 0.0) * 0.0009)) * smoothstep(0.02, 0.045, dy);
            wall *= 1.0 - 0.8 * plume;
            vec3 lit = wall * flameLight * warmth * (0.06 + 2.6 * pool + 0.35 * wash) * 1.3;
            lit += wall * vec3(0.06, 0.065, 0.075);
            float bracket = (1.0 - smoothstep(0.0028, 0.0038, abs(dx))) * step(-0.03, dy) * step(dy, -0.004);
            float cup = (1.0 - smoothstep(0.007, 0.0085, abs(dx))) * step(-0.011, dy) * step(dy, -0.002);
            float iron = max(bracket, cup);
            lit = mix(lit, torchColor * warmth * 0.05 * (0.4 + smoothstep(-0.011, -0.002, dy)), iron);
            if (env < 0.5) {
                float fy = dy / 0.032;
                float widthAt = 0.0085 * pow(clamp(1.0 - fy, 0.0, 1.0), 0.8) + 1e-4;
                float fx = (dx - sway) / widthAt;
                float flame = (1.0 - smoothstep(0.4, 1.0, abs(fx))) * smoothstep(-0.1, 0.05, fy) * (1.0 - smoothstep(0.75, 1.0, fy));
                float inner = (1.0 - smoothstep(0.0, 0.6, abs(fx))) * (1.0 - smoothstep(0.1, 0.6, fy));
                float halo = exp(-(dx * dx + (dy - 0.01) * (dy - 0.01)) / 0.0003) * 0.35;
                vec3 fire = mix(torchColor, vec3(1.0, 0.88, 0.6), inner) * (flame * (1.6 + 1.4 * inner) + halo) * flicker(sconce + 0.5);
                lit += fire * step(0.001, torches);
            }
            float band = smoothstep(-0.07, -0.01, y) * (1.0 - smoothstep(WALL_TOP - 0.004, WALL_TOP + 0.002, y));
            sky = mix(sky, lit * caveDim, band);
        }
        skyOutput(skyFinish(sky, y, env));
    }
`;

const stone = new Color();
const torch = new Color();
const look = createLook();

function colors(options) {
    readColor(stone, options.stoneColor, "#7a6e62");
    torch.set(options.torchColor || "#ff9a48");
}

export default {
    id: "dungeonVault",
    group: "underground",
    order: 230,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "stoneColor", type: "color", default: "#7a6e62" },
        { name: "torchColor", type: "color", default: "#ff9a48" },
        { name: "torches", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "ambient", type: "range", min: 0.2, max: 2, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "DungeonVaultSkyShader",
            uniforms: caveUniforms({
                stoneColor: { value: new Color() },
                torchColor: { value: new Color() },
                torches: { value: 1 },
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
        const torches = Number(options.torches);
        const ambient = Number(options.ambient);
        look.key.copy(torch).lerp(WARM_STONE, 0.5);
        look.keyIntensity = 0.01 + 0.02 * torches;
        look.ambientSky.copy(stone).lerp(torch, 0.08 + 0.1 * torches).multiplyScalar(0.7);
        look.ambientGround.copy(stone).multiplyScalar(0.1).lerp(torch, 0.05);
        look.ambient = (0.28 + 0.06 * torches) * ambient;
        look.environment = 0.06 + 0.04 * torches;
        look.fog.copy(torch).multiplyScalar(0.003 * torches).add(DEEP);
        look.saturation = 1;
        look.contrast = 1.06;
        lightCave(state, context, look);
    },

    apply(dome, state, { options, dim }) {
        const uniforms = dome.material.uniforms;
        colors(options);
        uniforms.stoneColor.value.copy(stone).multiplyScalar(0.6);
        uniforms.torchColor.value.copy(torch);
        uniforms.torches.value = Number(options.torches);
        uniforms.caveDim.value = dim ?? 1;
        dome.setBodies([]);
    },
};
