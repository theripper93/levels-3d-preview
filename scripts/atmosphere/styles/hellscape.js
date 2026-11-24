import { Color, Vector3 } from "three";
import { skyDirection, SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_BODIES, SKY_FINISH } from "../sky/chunks.js";

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_BODIES}
    ${SKY_FINISH}

    uniform float fireGlow;
    uniform float ashAmount;
    uniform vec3 emberColor;

    vec4 smokeClouds(vec3 dir, vec3 sunDir) {
        float y = dir.y;
        if (cloudsEnabled < 0.5 || cloudAlpha <= 0.001 || y <= -0.03) return vec4(0.0);
        float t = time * cloudSpeed;
        vec2 p = (dir.xz / (y + 0.14) * 0.45 + cloudDrift + vec2(0.004, 0.0015) * t) * 3.2 * cloudScale;
        vec2 warp = vec2(fbm2(p * 0.5 + vec2(0.0, 0.02 * t)), fbm2(p * 0.5 + vec2(5.2, 1.3) - 0.015 * t));
        p += (warp - 0.5) * 1.1;
        float coarse;
        float shape = cloudShape(p, coarse);
        float threshold = mix(0.7, 0.28, clamp(cloudCover, 0.0, 1.0));
        float density = smoothstep(threshold, threshold + 0.26, shape);
        if (density <= 0.001) return vec4(0.0);
        float inner = smoothstep(threshold + 0.05, threshold + 0.35, shape);
        float billow = clamp((shape - coarse) * 4.0 + 0.5, 0.0, 1.0);
        float low = exp(-max(y, 0.0) * 3.2);
        vec3 smoke = (vec3(0.06, 0.05, 0.046) * (0.7 + 0.6 * billow) + skyHorizon * 0.12 * low) * mix(1.0, 0.55, inner * clamp(cloudDarkness + 0.4, 0.0, 1.0));
        float under = (0.15 + 0.85 * low) * pow(1.0 - billow, 1.5) * (0.5 + 0.5 * warp.x);
        vec3 cloud = smoke + emberColor * under * fireGlow * mix(1.0, 0.4, inner);
        cloud += sunColor * 0.25 * pow(max(dot(dir, sunDir), 0.0), 6.0) * (1.0 - inner);
        cloud = cloud * cloudTint + vec3(1.0, 0.6, 0.4) * flash * (0.5 + inner);
        float alpha = density * clamp(cloudAlpha + 0.2, 0.0, 1.0) * smoothstep(-0.02, 0.1, y);
        return vec4(cloud, alpha);
    }

    float flakes(vec2 grid, float chance, float seed, out float pick) {
        vec2 id = floor(grid) + seed;
        pick = hash12(id);
        if (pick > chance) return 0.0;
        vec2 center = 0.3 + 0.4 * vec2(hash12(id + 3.7), hash12(id + 9.1));
        center.x += 0.2 * sin(time * (0.5 + pick * 3.0) + pick * 40.0);
        vec2 offset = (fract(grid) - center) * vec2(1.0, 2.0);
        float size = 0.06 + 0.06 * hash12(id + 5.1);
        return exp(-dot(offset, offset) / (size * size));
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float y = dir.y;
        float up = max(y, 0.0);
        float env = environmentMode;
        vec3 sunDir = normalize(sunDirection);

        vec3 sky = mix(skyZenith, skyHorizon, pow(1.0 - up, mix(3.0, 1.6, haze)));
        float flicker = 0.75 + 0.25 * fbm2(dir.xz * 3.0 + vec2(time * 0.03, -time * 0.02));
        sky += emberColor * fireGlow * (0.4 * exp(-up * 10.0) + 0.06 * exp(-up * 3.0)) * flicker;
        sky = mix(sky, skyGround, smoothstep(0.0, 0.1, -y));
        float horizonMask = smoothstep(-0.01, 0.02, y);

        vec4 bodies = skyBodies(dir, env);
        sky = sky * (1.0 - bodies.a * horizonMask) + bodies.rgb * horizonMask;

        vec4 clouds = smokeClouds(dir, sunDir);
        sky = mix(sky, clouds.rgb, clouds.a);

        if (env < 0.5 && ashAmount > 0.0 && y > -0.03 && y < 0.75) {
            float azimuth = atan(dir.z, dir.x) / PI2;
            float pick;
            float ash = flakes(vec2(azimuth * 120.0, y * 40.0 + time * 0.25), 0.09 * ashAmount, 0.0, pick);
            float ember = flakes(vec2(azimuth * 120.0, y * 40.0 - time * 0.25), 0.05 * ashAmount, 31.0, pick);
            float fade = smoothstep(-0.03, 0.05, y) * (1.0 - smoothstep(0.45, 0.75, y));
            sky = mix(sky, vec3(0.025, 0.02, 0.02), clamp(ash * 0.85, 0.0, 1.0) * fade);
            sky += emberColor * ember * (1.2 + 1.5 * sin(time * 3.0 + pick * 80.0)) * fade;
        }

        skyOutput(skyFinish(sky, y, env));
    }
`;

const ZENITH = new Color("#24100c");
const HORIZON = new Color("#9a4a1c");
const GROUND = new Color("#140806");
const FOG = new Color("#5a2816");
const SUN = new Color("#ff5a20");
const KEY = new Color("#ffb080");
const EMBER = new Color("#ff9a3a");
const AMBIENT_SKY = new Color("#6e4038");
const AMBIENT_GROUND = new Color("#ff7a34");

const sun = { kind: "star", radius: 0.05, color: SUN, brightness: 0.18, glow: 1.4, direction: new Vector3() };
const bodies = [sun];

export default {
    id: "hellscape",
    order: 40,
    timeOfDay: false,
    options: ["clouds"],
    fields: [
        { name: "sunAzimuth", type: "range", min: 0, max: 360, step: 1, default: 160 },
        { name: "sunElevation", type: "range", min: 5, max: 90, step: 1, default: 28 },
        { name: "fireGlow", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "ash", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "HellscapeSkyShader",
            uniforms: { fireGlow: { value: 1 }, ashAmount: { value: 1 }, emberColor: { value: EMBER.clone() } },
            fragmentShader,
        });
    },

    orient({ options, sunDirection, moonDirection }) {
        skyDirection(Number(options.sunAzimuth), Number(options.sunElevation), sunDirection);
        moonDirection.copy(sunDirection).negate();
    },

    light(state, { darkness, options, setKeyLight }) {
        const dim = 1 - 0.6 * darkness;
        const glow = Number(options.fireGlow);
        state.lightIsMoon = false;
        setKeyLight(state.sunDirection, KEY, 1.05 * dim);
        state.shadowIntensity = 0.85;
        state.shadowSoftness = 1.3;
        state.ambientSky.copy(AMBIENT_SKY);
        state.ambientGround.copy(AMBIENT_SKY).lerp(AMBIENT_GROUND, Math.min(glow, 1.5) / 1.5);
        state.ambientIntensity = (0.4 + 0.12 * glow) * dim;
        state.environmentGain = 0.9;
        state.skyZenith.copy(ZENITH).multiplyScalar(dim);
        state.skyHorizon.copy(HORIZON).multiplyScalar(dim);
        state.skyGround.copy(GROUND).multiplyScalar(dim);
        state.fogColor.copy(FOG).multiplyScalar(dim);
        state.sunColor.copy(SUN);
        state.fogDensity = 0.4;
        state.haze = 0.45;
        state.daylight = 0.5;
        state.twilight = 0;
        state.night = 0;
        state.starVisibility = 0;
        state.clouds.cover = 0.8;
        state.clouds.darkness = 0.2;
        const grade = state.grade;
        grade.exposure = 1;
        grade.contrast = 1.1;
        grade.saturation = 0.92;
        grade.night = 0;
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        uniforms.fireGlow.value = Number(options.fireGlow);
        uniforms.ashAmount.value = Number(options.ash);
        sun.direction.copy(state.sunDirection);
        dome.setBodies(bodies);
    },
};
