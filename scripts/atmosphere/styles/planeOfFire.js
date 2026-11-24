import { Color } from "three";
import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_FINISH } from "../sky/chunks.js";
import { ELEMENTAL_GLSL, createLook, fixedDirection, lightEnclosed, readColor } from "./elemental/shared.js";

const WHITE_HOT = new Color(1, 0.86, 0.55);
const SMOKE = new Color(0.16, 0.05, 0.025);
const flame = new Color();
const look = createLook();

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_FINISH}
    ${ELEMENTAL_GLSL}

    uniform float emberAmount;
    uniform float flameSpeed;

    vec3 fireRamp(float h, vec3 flame) {
        vec3 c = mix(flame * flame * 0.2, flame * 0.85, smoothstep(0.0, 0.35, h));
        c = mix(c, mix(flame, vec3(1.0, 0.6, 0.16), 0.7) * 1.25, smoothstep(0.3, 0.7, h));
        return mix(c, vec3(1.5, 1.15, 0.65), smoothstep(0.72, 1.0, h));
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float up = max(y, 0.0);
        float env = environmentMode;
        vec3 sunDir = normalize(sunDirection);
        vec3 flame = tintOf(sunColor);
        float t = time * flameSpeed;
        float level = skyZenith.r;
        vec3 smoke = fogColor;
        vec3 sky;

        if (y > -0.03) {
            vec2 p = dir.xz / (up + 0.14) * 1.5;
            vec2 warp = vec2(fbm2(p * 0.55 + vec2(0.0, t * 0.06)), fbm2(p * 0.55 + vec2(4.3, 1.9) - t * 0.05));
            float n = env > 0.5 ? fbm2(p + (warp - 0.5) * 2.4) : fbm3(p + (warp - 0.5) * 2.4 + vec2(t * 0.04, -t * 0.02));
            float core = pow(max(dot(dir, sunDir), 0.0), 4.0);
            float cover = smoothstep(0.45, 0.72, n) * (1.0 - 0.8 * core);
            float heat = clamp((1.0 - smoothstep(0.25, 0.6, n)) * 0.5 + 0.22 + core * 0.7, 0.0, 1.0);
            vec3 fire = fireRamp(heat, flame) * level;
            vec3 billow = smoke * (0.3 + 0.5 * smoothstep(0.85, 0.5, n)) + fireRamp(0.2, flame) * level * 0.5 * smoothstep(0.66, 0.45, n);
            sky = mix(fire, billow, cover);

            float horizon = 1.0 - smoothstep(0.0, 0.4, up);
            if (env < 0.5 && horizon > 0.0) {
                float u = azimuth01(dir) * 140.0;
                float tongue = wrapNoise(vec2(u, y * 6.0 - t * 0.9), 140.0) * 0.65 + wrapNoise(vec2(u * 2.0, y * 12.0 - t * 1.6) + vec2(0.0, 7.0), 280.0) * 0.35;
                float flames = smoothstep(0.32 + 2.4 * up, 0.6 + 2.4 * up, tongue + 0.2 * warp.x);
                float inner = smoothstep(0.58 + 2.4 * up, 0.85 + 2.4 * up, tongue + 0.2 * warp.x);
                sky = mix(sky, fireRamp(0.22 + 0.2 * flames + 0.4 * inner, flame) * level, flames * horizon * 0.7);
            }
            sky = mix(sky, fireRamp(0.3, flame) * level, pow(horizon, 5.0) * 0.4);
        } else {
            sky = smoke;
        }

        vec3 result = skyFinish(sky, y, env);
        if (y < 0.0) {
            float down = -y;
            vec2 q = dir.xz / (down + 0.05) * 0.9;
            float crust = fbm2(q * 0.35 + 11.0);
            float r = 1.0 - min(abs(fbm2(q + (crust - 0.5) * 1.5 + vec2(t * 0.01, 0.0)) - 0.5) * 5.0, 1.0);
            float lava = pow(r, 6.0) * (0.3 + 0.9 * smoothstep(0.3, 0.7, crust));
            vec3 sea = mix(skyGround * (0.5 + crust) + fireRamp(0.1, flame) * level * pow(r, 3.0) * 0.4, fireRamp(0.45 + 0.45 * lava, flame) * level, min(lava * 1.4, 1.0));
            sea += fireRamp(0.25, flame) * level * smoothstep(0.6, 0.9, crust) * 0.2;
            sea = mix(sea, smoke, 1.0 - smoothstep(0.0, 0.22, down));
            result = mix(result, sea, smoothstep(0.0, 0.025, down));
        }

        if (env < 0.5 && emberAmount > 0.0) {
            float embers = motes(dir, 110.0, 0.22 * emberAmount, 0.9 * flameSpeed, 0.18, 0.0) + motes(dir, 190.0, 0.18 * emberAmount, 1.6 * flameSpeed, 0.22, 13.0) * 0.6;
            float mask = 1.0 - smoothstep(0.15, 0.75, y);
            result += fireRamp(0.75, flame) * embers * mask * 2.5;
        }

        if (env > 0.5) result = min(result, vec3(environmentClamp));
        skyOutput(result);
    }
`;

export default {
    id: "planeOfFire",
    order: 50,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "flameColor", type: "color", default: "#ff6a1a" },
        { name: "embers", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "speed", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "PlaneOfFireSkyShader",
            uniforms: { emberAmount: { value: 1 }, flameSpeed: { value: 1 } },
            fragmentShader,
        });
    },

    orient: fixedDirection(150, 64),

    light(state, ctx) {
        readColor(flame, ctx.options.flameColor, "#ff6a1a");
        look.accent.copy(flame);
        look.key.copy(flame).lerp(WHITE_HOT, 0.55);
        look.keyIntensity = 2.1;
        look.shadow = 0.85;
        look.softness = 1.4;
        look.ambientSky.copy(flame).lerp(WHITE_HOT, 0.3);
        look.ambientGround.copy(flame).multiply(flame).multiplyScalar(0.55);
        look.ambient = 0.75;
        look.environment = 0.9;
        look.zenith.setRGB(1, 1, 1);
        look.horizon.copy(flame).multiplyScalar(0.6);
        look.ground.copy(SMOKE).multiplyScalar(0.35).lerp(flame, 0.04);
        look.fog.copy(SMOKE).lerp(flame, 0.15);
        look.fogDensity = 0.22;
        look.fogHeight = 2;
        look.contrast = 1.08;
        look.saturation = 1.04;
        lightEnclosed(state, ctx, look);
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        uniforms.emberAmount.value = Number(options.embers);
        uniforms.flameSpeed.value = Number(options.speed);
    },
};
