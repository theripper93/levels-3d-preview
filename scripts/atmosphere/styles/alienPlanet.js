import { Color, Vector3 } from "three";
import { SkyDome, realisticShader, skyDirection } from "../sky/dome.js";
import { SKY_BODIES } from "../sky/chunks.js";

const fragmentShader = realisticShader(
    `${SKY_BODIES}
    uniform float planetHaze;`,
    `vec4 bodies = skyBodies(dir, env);
    vec3 veil = mix(skyHorizon, skyZenith, 0.35);
    float behind = 1.0 - 0.85 * clouds.a;
    vec3 seen = mix(bodies.rgb, veil * bodies.a, planetHaze * (1.0 - smoothstep(0.0, 0.5, y)));
    sky = sky * (1.0 - bodies.a * horizonMask * behind) + seen * horizonMask * behind;`,
);

const tint = new Color();
const secondTint = new Color();
const scratch = new Color();
const noon = new Vector3();

const sun = { kind: "star", radius: 0.014, color: new Color(), brightness: 0.5, glow: 0.9, direction: new Vector3(), seed: 1 };
const planet = { kind: "planet", radius: 0.2, color: new Color(), brightness: 1, glow: 0.15, direction: new Vector3(), litFrom: null, lit: 1.3, ring: 2.3, seed: 6 };
const bodies = [planet, sun];

let secondSunPower = 0;

function luminance(color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function normalized(hex, target) {
    target.set(hex);
    const max = Math.max(target.r, target.g, target.b, 1e-3);
    return target.multiplyScalar(1 / max);
}

function shift(color, hue, amount) {
    const l = luminance(color);
    scratch.copy(hue).multiplyScalar(l / Math.max(luminance(hue), 0.05));
    return color.lerp(scratch, amount);
}

export default {
    id: "alienPlanet",
    order: 60,
    options: ["preset", "time", "sun", "stars", "moon", "clouds"],
    fields: [
        { name: "atmosphere", type: "color", default: "#34d6b0" },
        { name: "secondSun", type: "color", default: "#ff5a8a" },
        { name: "planetColor", type: "color", default: "#c99af0" },
        { name: "planetSize", type: "range", min: 0.4, max: 2, step: 0.1, default: 1 },
        { name: "rings", type: "checkbox", default: true },
    ],

    createDome() {
        return new SkyDome({ name: "AlienPlanetSkyShader", uniforms: { planetHaze: { value: 0.3 } }, fragmentShader });
    },

    light(state, ctx) {
        const { options } = ctx;
        normalized(options.atmosphere || "#34d6b0", tint);
        normalized(options.secondSun || "#ff5a8a", secondTint);
        ctx.directionAt(ctx.time - 1.8, sun.direction, { azimuth: 32 });
        secondSunPower = Math.clamp((sun.direction.y + 0.05) / 0.2, 0, 1) * (1 - 0.8 * ctx.darkness);

        shift(state.skyZenith, tint, 0.85);
        shift(state.skyHorizon, scratch.copy(tint).lerp(secondTint, 0.55), 0.75);
        shift(state.skyGround, tint, 0.5);
        state.skyHorizon.lerp(scratch.copy(secondTint).multiplyScalar(luminance(state.skyHorizon) * 1.4), 0.3 * secondSunPower * (0.4 + state.twilight));
        state.fogColor.copy(state.skyHorizon).lerp(state.skyZenith, 0.2);
        state.sunColor.lerp(scratch.copy(tint).lerp(secondTint, 0.5).multiplyScalar(luminance(state.sunColor)), 0.25);
        if (!state.lightIsMoon) state.lightColor.lerp(scratch.copy(tint).multiplyScalar(luminance(state.lightColor) * 1.2), 0.2);

        shift(state.ambientSky, tint, 0.6);
        shift(state.ambientGround, tint, 0.3);
        state.ambientSky.lerp(scratch.copy(secondTint).multiplyScalar(luminance(state.ambientSky) * 1.3), 0.45 * secondSunPower);
        state.ambientGround.lerp(scratch.copy(secondTint).multiplyScalar(luminance(state.ambientGround)), 0.3 * secondSunPower);
        state.ambientIntensity *= 1 + 0.45 * secondSunPower * (1 - 0.5 * state.daylight);
        state.environmentGain = 1.1;
        state.grade.saturation *= 1.12;
        state.grade.nightTint.copy(tint).multiplyScalar(1.4).lerp(state.grade.nightTint, 0.5);
    },

    apply(dome, state, ctx) {
        const { options } = ctx;
        sun.color.copy(secondTint);
        sun.brightness = 0.5 * Math.max(secondSunPower, 0.15);
        ctx.directionAt(12, noon);
        const azimuth = (Math.atan2(noon.x, -noon.z) * 180) / Math.PI;
        const size = Number(options.planetSize);
        planet.radius = 0.2 * size;
        skyDirection(azimuth + 205, 4 + 6 * size, planet.direction);
        planet.color.set(options.planetColor || "#c99af0");
        planet.ring = options.rings ? 2.3 : 0;
        planet.litFrom = state.sunDirection;
        planet.lit = 1.3;
        planet.brightness = 1 - 0.35 * state.night;
        dome.material.uniforms.planetHaze.value = 0.45 * state.daylight;
        dome.setBodies(bodies);
    },
};
