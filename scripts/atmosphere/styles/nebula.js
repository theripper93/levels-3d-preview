import { Color, Vector3 } from "three";
import { SkyDome, skyDirection } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_SPACE, SKY_FINISH } from "../sky/chunks.js";

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_SPACE}
    ${SKY_FINISH}

    uniform vec3 nebulaA;
    uniform vec3 nebulaB;
    uniform float nebulaGlow;
    uniform float nebulaDrift;
    uniform float starAmount;
    uniform vec3 coreDirection;

    void main() {
        vec3 dir = normalize(vDirection);
        float env = environmentMode;
        float t = time * nebulaDrift * 0.006;
        float coreMu = dot(dir, coreDirection);
        float region = 0.3 + 0.7 * smoothstep(-0.7, 0.9, coreMu);

        vec3 q = dir * 1.7;
        vec2 w = vec2(fbm2v(q * 0.8 + vec3(t, 0.0, 0.0)), fbm2v(q * 0.8 + vec3(5.0, 3.0, 7.0) - vec3(0.0, t, 0.0))) - 0.5;
        vec3 warp = vec3(w, w.x - w.y);
        float broad = fbm3v(q * 1.1 + warp.yzx * 1.6 + vec3(5.0 - t * 0.4, 5.0, 2.0));
        float gas = fbm3v(q * 2.6 + warp * 1.4 + vec3(0.0, t * 0.5, 0.0));
        float detail = fbm2v(q * 8.0 + warp * 3.0 + 2.0);
        float cloud = gas * 0.8 + detail * 0.2;
        float glowB = smoothstep(0.35, 0.85, broad * 0.7 + region * 0.4 - 0.08);
        float bodyA = smoothstep(0.55, 0.88, cloud + region * 0.18 - 0.08) * smoothstep(0.3, 0.65, broad + region * 0.15);
        float rim = pow(max(1.0 - abs(cloud * 2.0 - 1.15), 0.0), 7.0) * glowB;
        float dust = smoothstep(0.55, 0.78, fbm2v(q * vec3(2.0, 6.0, 2.0) + warp * 2.5 + 9.0)) * smoothstep(0.4, 0.7, cloud) * 0.8;

        vec3 neb = nebulaB * glowB * glowB * (0.6 + 0.6 * detail);
        neb += nebulaA * bodyA * (0.55 + 0.9 * detail);
        neb += mix(nebulaA, vec3(1.0, 0.92, 0.95), 0.6) * pow(bodyA * detail, 3.0) * 1.4;
        neb += mix(nebulaA, vec3(1.0, 0.85, 0.8), 0.35) * rim * 0.7;
        neb += mix(nebulaA + nebulaB, vec3(1.0), 0.6) * bodyA * glowB * pow(max(coreMu, 0.0), 6.0) * 1.2;
        neb += mix(nebulaA, nebulaB, 0.6) * (0.05 * pow(max(coreMu, 0.0), 3.0) + 0.3 * pow(max(coreMu, 0.0), 40.0));
        neb *= 1.0 - dust;
        vec3 sky = skyZenith + neb * nebulaGlow * 0.17;

        if (env < 0.5) {
            float stars = starPoints(dir, 300.0, 0.28 * starAmount, 0.0, 0.0) * 0.5;
            stars += starPoints(dir, 130.0, 0.2 * starAmount, 11.0, 0.05);
            stars += starPoints(dir, 48.0, 0.08 * starAmount, 23.0, 0.1) * 2.0;
            stars *= 1.0 - 0.7 * dust;
            sky += starColor(dir, 0.0) * stars * (0.9 + bodyA * 0.6);
            float angle = sqrt(max(2.0 * (1.0 - coreMu), 0.0));
            vec3 coreTint = mix(vec3(0.85, 0.92, 1.0), mix(nebulaA, nebulaB, 0.5), 0.25);
            sky += coreTint * (24.0 * (1.0 - smoothstep(0.006, 0.009, angle)) + 0.8 * exp(-angle * 60.0) * nebulaGlow);
        } else {
            sky += mix(nebulaA, nebulaB, 0.5) * pow(max(coreMu, 0.0), 40.0) * 3.0 * nebulaGlow;
        }

        if (env > 0.5) sky = min(sky, vec3(environmentClamp));
        skyOutput(max(sky, vec3(0.0)));
    }
`;

const SPACE = new Color(0.003, 0.0025, 0.007);
const WHITE = new Color(1, 1, 1);
const colorA = new Color();
const colorB = new Color();
const mixed = new Color();
const scratch = new Color();

function readColors(options) {
    colorA.set(options.color || "#ff3d8b");
    colorB.set(options.secondColor || "#2fa8ff");
    mixed.copy(colorA).lerp(colorB, 0.5);
}

export default {
    id: "nebula",
    order: 70,
    timeOfDay: false,
    animated: true,
    options: [],
    fields: [
        { name: "color", type: "color", default: "#ff3d8b" },
        { name: "secondColor", type: "color", default: "#2fa8ff" },
        { name: "glow", type: "range", min: 0.2, max: 2, step: 0.1, default: 1 },
        { name: "drift", type: "range", min: 0, max: 3, step: 0.1, default: 1 },
        { name: "stars", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "direction", type: "range", min: 0, max: 360, step: 5, default: 140 },
    ],

    createDome() {
        return new SkyDome({
            name: "NebulaSkyShader",
            uniforms: {
                nebulaA: { value: new Color() },
                nebulaB: { value: new Color() },
                nebulaGlow: { value: 1 },
                nebulaDrift: { value: 1 },
                starAmount: { value: 1 },
                coreDirection: { value: new Vector3(0, 1, 0) },
            },
            fragmentShader,
        });
    },

    orient({ options, sunDirection, moonDirection }) {
        skyDirection(Number(options.direction), 36, sunDirection);
        moonDirection.copy(sunDirection).negate();
    },

    light(state, { options, darkness, setKeyLight }) {
        readColors(options);
        const glow = Number(options.glow);
        const dim = 1 - 0.65 * darkness;
        state.lightIsMoon = false;
        scratch.copy(mixed).multiplyScalar(1 / Math.max(mixed.r, mixed.g, mixed.b, 1e-3)).lerp(WHITE, 0.45);
        setKeyLight(state.sunDirection, scratch, (0.9 + 0.6 * glow) * dim);
        state.shadowIntensity = 0.9;
        state.shadowSoftness = 1.4;
        state.ambientSky.copy(colorB).lerp(mixed, 0.25);
        state.ambientGround.copy(colorA).multiplyScalar(0.45);
        state.ambientIntensity = (0.3 + 0.18 * glow) * dim;
        state.environmentGain = 1;
        for (const color of [state.skyZenith, state.skyHorizon, state.skyGround]) color.copy(SPACE);
        state.fogColor.copy(mixed).multiplyScalar(0.035 * glow).add(SPACE);
        state.sunColor.copy(scratch);
        state.fogDensity = 0;
        state.haze = 0;
        state.daylight = 1;
        state.twilight = 0;
        state.night = 0;
        state.starVisibility = 1;
        state.clouds.enabled = false;
        const grade = state.grade;
        grade.exposure = 1;
        grade.contrast = 1.08;
        grade.saturation = 1.1;
        grade.night = 0;
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        uniforms.nebulaA.value.copy(colorA);
        uniforms.nebulaB.value.copy(colorB);
        uniforms.nebulaGlow.value = Number(options.glow);
        uniforms.nebulaDrift.value = Number(options.drift);
        uniforms.starAmount.value = Number(options.stars);
        uniforms.coreDirection.value.copy(state.sunDirection);
    },
};
