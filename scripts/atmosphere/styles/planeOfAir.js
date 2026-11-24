import { Color } from "three";
import { SkyDome, realisticShader } from "../sky/dome.js";

const WHITE = new Color(1, 1, 1);
const DEEPEN = new Color(0.82, 0.92, 1.06);
const sea = new Color();
const bounce = new Color();

const WIND_SPEED = 1.5;

function applyWind(dome, drift) {
    const uniforms = dome.material.uniforms;
    const offset = dome.userData.windOffset ?? 0;
    uniforms.windOffset.value = offset;
    uniforms.cloudDrift.value.set(0.004, 0.0015).multiplyScalar(offset * WIND_SPEED);
    if (drift) uniforms.cloudDrift.value.add(drift);
}

const declarations = /* glsl */ `
    uniform float windOffset;
    uniform vec3 seaTint;
`;

const layer = /* glsl */ `
    vec3 daylit = sunTint * sunPower + moonTint * moonPower * night * 0.08 * (0.3 + lit);
    vec3 above = skyFinish(sky, y, env);
    if (y < 0.02) {
        float down = max(-y, 0.0);
        vec2 sp = dir.xz / (down + 0.03) * 1.1 + vec2(0.056, 0.021) * windOffset;
        float tops = fbm3(sp);
        float billow = env > 0.5 ? 0.5 : valueNoise(sp * 5.0 + 2.0);
        tops += (billow - 0.5) * 0.18;
        vec2 toward = normalize(sunDir.xz + vec2(1e-4));
        float shade = env > 0.5 ? tops : fbm2(sp * 1.3 + toward * 0.1) + (valueNoise(sp * 5.0 + 2.0 + toward * 0.3) - 0.5) * 0.18;
        float lift = clamp(0.5 + (tops - shade) * 5.0 + 0.6 * (tops - 0.5), 0.0, 1.0);
        float puff = smoothstep(0.22, 0.42, tops);
        vec3 ambient = mix(skyZenith, skyHorizon, 0.6);
        vec3 litColor = seaTint * (daylit * 0.95 + ambient * 0.5);
        vec3 shadeColor = seaTint * mix(ambient * 0.75, litColor * 0.5, 0.3);
        vec3 gapColor = mix(skyHorizon, skyZenith, 0.35);
        gapColor = mix(gapColor, vec3(dot(gapColor, vec3(0.2126, 0.7152, 0.0722))), 0.45) * 0.55;
        vec3 deck = mix(gapColor, mix(shadeColor, litColor, lift), puff);
        float glint = pow(max(dot(normalize(vec3(dir.x, -dir.y, dir.z)), sunDir), 0.0), 10.0);
        deck += sunTint * sunPower * glint * (0.15 + 0.5 * twilight);
        deck = mix(deck, fogColor, (1.0 - smoothstep(0.0, 0.22, down)) * 0.85);
        above = mix(above, deck, 1.0 - smoothstep(-0.015, 0.012, y));
        if (env > 0.5) above = min(above, vec3(environmentClamp));
    }
    skyOutput(above);
    return;
`;

export default {
    id: "planeOfAir",
    order: 52,
    options: ["preset", "time", "tint", "moon"],
    fields: [
        { name: "wind", type: "range", min: 0, max: 2, step: 0.1, default: 1, hint: "levels3dpreview.skyStyles.planeOfAir.hints.wind" },
        { name: "highClouds", type: "range", min: 0, max: 1, step: 0.05, default: 0.5, hint: "levels3dpreview.skyStyles.planeOfAir.hints.highClouds" },
        { name: "seaColor", type: "color", default: "#ffffff" },
    ],

    createDome() {
        return new SkyDome({
            name: "PlaneOfAirSkyShader",
            uniforms: { windOffset: { value: 0 }, seaTint: { value: new Color(1, 1, 1) } },
            fragmentShader: realisticShader(declarations, layer),
        });
    },

    light(state, { options }) {
        sea.set(options.seaColor || "#ffffff");
        const high = Number(options.highClouds);
        const clouds = state.clouds;
        clouds.enabled = high > 0;
        clouds.cover = 0.12 + 0.5 * high;
        clouds.density = 0.35 + 0.3 * high;
        clouds.darkness = 0;
        clouds.alpha = 0.45 + 0.4 * high;
        clouds.scale = 1.4;
        clouds.speed = 0;
        clouds.tint.set(1, 1, 1);
        state.skyAnimated = Number(options.wind) > 0;
        state.skyZenith.multiply(DEEPEN);
        state.haze *= 0.4;
        state.fogColor.copy(state.skyHorizon).lerp(WHITE, 0.3 * state.daylight).multiply(sea);
        state.fogDensity = Math.min(state.fogDensity, 0.08);
        bounce.copy(state.lightColor).multiply(sea).multiplyScalar(0.6 * state.daylight).add(state.ambientGround);
        state.ambientGround.lerp(bounce, 0.7);
        state.ambientSky.lerp(state.skyZenith, 0.15);
        state.shadowSoftness = 0.55;
        state.lightIntensity *= 1.08;
        state.grade.contrast *= 1.04;
        state.grade.saturation *= 1.05;
    },

    apply(dome, state) {
        dome.material.uniforms.seaTint.value.copy(sea);
        applyWind(dome, state.clouds.drift);
    },

    update(dome, delta, { options, state }) {
        const data = dome.userData;
        const now = dome.material.uniforms.time.value;
        data.windOffset = (data.windOffset ?? 0) + Math.max(now - (data.windTime ?? now), 0) * Number(options.wind ?? 1);
        data.windTime = now;
        applyWind(dome, state?.clouds.drift);
    },
};
