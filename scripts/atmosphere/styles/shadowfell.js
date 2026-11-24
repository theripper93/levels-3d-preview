import { Color } from "three";
import { skyDirection, SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_FINISH } from "../sky/chunks.js";

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_FINISH}

    uniform float lightningAmount;
    uniform float lightningFlicker;
    uniform vec3 coronaColor;

    const float SUN_RADIUS = 0.055;

    vec4 heavyClouds(vec3 dir, vec3 sunDir, out vec2 plane, out float inner) {
        plane = vec2(0.0);
        inner = 0.0;
        float y = dir.y;
        if (cloudsEnabled < 0.5 || cloudAlpha <= 0.001 || y <= -0.03) return vec4(0.0);
        float t = time * cloudSpeed;
        plane = (dir.xz / (y + 0.2) * 0.45 + cloudDrift + vec2(0.0025, 0.001) * t) * 1.8 * cloudScale;
        float coarse;
        float shape = cloudShape(plane, coarse);
        float threshold = mix(0.72, 0.3, clamp(cloudCover, 0.0, 1.0));
        float density = smoothstep(threshold, threshold + 0.22, shape);
        if (density <= 0.001) return vec4(0.0);
        vec2 toward = normalize(sunDir.xz + vec2(1e-4));
        float lightSample = fbm2(plane + toward * 0.35);
        float shade = clamp(0.55 + (coarse - lightSample) * 5.0 + (shape - coarse) * 2.0, 0.0, 1.0);
        inner = smoothstep(threshold + 0.04, threshold + 0.32, shape);
        vec3 belly = skyZenith * 0.38;
        vec3 top = mix(skyHorizon, coronaColor * 0.5, 0.25) * 1.1;
        vec3 cloud = mix(belly, top, shade) * mix(1.0, 0.55, inner * clamp(cloudDarkness + 0.5, 0.0, 1.0)) * cloudTint;
        cloud += vec3(0.75, 0.82, 1.0) * flash * (0.5 + inner);
        cloud = mix(cloud, skyHorizon, (1.0 - smoothstep(0.0, 0.2, y)) * 0.4);
        float alpha = density * clamp(cloudAlpha + 0.15, 0.0, 1.0) * smoothstep(-0.02, 0.1, y);
        return vec4(cloud, alpha);
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float up = max(y, 0.0);
        float env = environmentMode;
        vec3 sunDir = normalize(sunDirection);

        vec3 sky = mix(skyZenith, skyHorizon, pow(1.0 - up, mix(3.2, 1.8, haze)));
        sky = mix(sky, skyGround, smoothstep(0.0, 0.1, -y));
        float horizonMask = smoothstep(-0.01, 0.02, y);

        float mu = dot(dir, sunDir);
        float angle = sqrt(max(2.0 * (1.0 - mu), 0.0));
        float outside = max(angle - SUN_RADIUS, 0.0);
        vec3 right = skyBasisRight(sunDir);
        vec3 upAxis = cross(sunDir, right);
        float theta = atan(dot(dir, upAxis), dot(dir, right) + 1e-6);
        float rays = 0.6 + 0.4 * sin(theta * 9.0 + 1.6 * sin(theta * 4.0 + time * 0.04)) * sin(theta * 5.0 - time * 0.03);
        float corona = 0.9 * exp(-outside * 45.0) + 0.3 * exp(-outside * 9.0) * rays + 0.06 * exp(-outside * 2.5);
        float disc = (1.0 - smoothstep(SUN_RADIUS * 0.96, SUN_RADIUS, angle)) * horizonMask;
        sky += coronaColor * corona * mix(1.0, 0.5, env) * horizonMask;

        vec2 plane;
        float inner;
        vec4 clouds = heavyClouds(dir, sunDir, plane, inner);
        sky = mix(sky, clouds.rgb, clouds.a);
        sky += coronaColor * corona * clouds.a * 0.2 * horizonMask * (1.0 - disc);
        if (env < 0.5) {
            float limb = smoothstep(SUN_RADIUS * 0.8, SUN_RADIUS, angle) * 0.06;
            sky = mix(sky, coronaColor * limb, disc);
        }

        if (env < 0.5 && lightningAmount > 0.0 && clouds.a > 0.01) {
            vec2 q = plane * 1.2;
            vec2 cell = floor(q);
            float h = hash12(cell + 7.0);
            if (h > 0.6) {
                vec2 center = 0.45 + 0.1 * vec2(hash12(cell + 1.3), hash12(cell + 5.9));
                vec2 offset = fract(q) - center;
                float cellFade = 1.0 - smoothstep(0.25, 0.44, max(abs(offset.x), abs(offset.y)));
                float glow = exp(-dot(offset, offset) * 20.0) * cellFade * inner * inner * (0.25 + 0.75 * valueNoise(q * 7.0 + h * 30.0));
                float cycle = fract(time * (0.04 + 0.07 * h) + h * 13.0);
                float strike = step(cycle, 0.035) * (0.55 + 0.45 * sin(time * 41.0 + h * 50.0));
                float pulse = mix(0.06, strike, lightningFlicker);
                sky += vec3(1.0, 0.16, 0.08) * glow * pulse * lightningAmount * clouds.a * 2.2;
            }
        }

        skyOutput(skyFinish(sky, y, env));
    }
`;

const ZENITH = new Color("#31353d");
const HORIZON = new Color("#70757e");
const GROUND = new Color("#1a1c20");
const CORONA = new Color("#dde2ea");
const KEY = new Color("#aab3c4");
const AMBIENT_SKY = new Color("#868d9a");
const AMBIENT_GROUND = new Color("#36383d");

export default {
    id: "shadowfell",
    order: 35,
    timeOfDay: false,
    options: ["clouds"],
    fields: [
        { name: "sunAzimuth", type: "range", min: 0, max: 360, step: 1, default: 210 },
        { name: "sunElevation", type: "range", min: 5, max: 90, step: 1, default: 32 },
        { name: "drain", type: "range", min: 0, max: 1, step: 0.05, default: 0.65 },
        { name: "lightning", type: "range", min: 0, max: 1, step: 0.05, default: 0.5 },
    ],

    createDome() {
        return new SkyDome({
            name: "ShadowfellSkyShader",
            uniforms: { lightningAmount: { value: 0.5 }, lightningFlicker: { value: 1 }, coronaColor: { value: CORONA.clone() } },
            fragmentShader,
        });
    },

    orient({ options, sunDirection, moonDirection }) {
        skyDirection(Number(options.sunAzimuth), Number(options.sunElevation), sunDirection);
        moonDirection.copy(sunDirection).negate();
    },

    light(state, { darkness, options, setKeyLight }) {
        const dim = 1 - 0.6 * darkness;
        state.lightIsMoon = false;
        setKeyLight(state.sunDirection, KEY, 0.85 * dim);
        state.shadowIntensity = 0.45;
        state.shadowSoftness = 2;
        state.ambientSky.copy(AMBIENT_SKY);
        state.ambientGround.copy(AMBIENT_GROUND);
        state.ambientIntensity = 0.55 * dim;
        state.environmentGain = 0.7;
        state.skyZenith.copy(ZENITH).multiplyScalar(dim);
        state.skyHorizon.copy(HORIZON).multiplyScalar(dim);
        state.skyGround.copy(GROUND).multiplyScalar(dim);
        state.fogColor.copy(HORIZON).lerp(ZENITH, 0.3).multiplyScalar(dim);
        state.sunColor.copy(CORONA);
        state.fogDensity = 0.45;
        state.haze = 0.4;
        state.daylight = 0.4;
        state.twilight = 0;
        state.night = 0;
        state.starVisibility = 0;
        state.clouds.cover = 0.7;
        state.clouds.darkness = 0.3;
        const grade = state.grade;
        grade.exposure = 0.95;
        grade.contrast = 0.92;
        grade.saturation = 1 - 0.85 * Number(options.drain);
        grade.night = 0;
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        uniforms.lightningAmount.value = Number(options.lightning);
        uniforms.lightningFlicker.value = canvas.photosensitiveMode ? 0 : 1;
    },
};
