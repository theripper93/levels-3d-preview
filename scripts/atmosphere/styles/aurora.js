import { Color } from "three";
import { SkyDome, realisticShader } from "../sky/dome.js";
import { SKY_AURORA } from "../sky/chunks.js";

const low = new Color();
const high = new Color();
const glow = new Color();

const fragmentShader = realisticShader(
    `${SKY_AURORA}
    uniform vec3 auroraLow;
    uniform vec3 auroraHigh;
    uniform float auroraStrength;
    uniform float auroraSpeed;`,
    `vec3 aurora = auroraLayer(dir, auroraLow, auroraHigh, auroraStrength, auroraSpeed);
    sky += aurora * (1.0 - 0.7 * clouds.a) * mix(1.0, 0.5, env);`,
);

function visibility(state, strength) {
    return strength * Math.clamp(state.night * 1.25 - 0.15, 0, 1);
}

export default {
    id: "aurora",
    order: 20,
    animated: true,
    fields: [
        { name: "color", type: "color", default: "#2dff8a" },
        { name: "secondColor", type: "color", default: "#b03cff" },
        { name: "intensity", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "speed", type: "range", min: 0, max: 3, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "AuroraSkyShader",
            uniforms: {
                auroraLow: { value: new Color() },
                auroraHigh: { value: new Color() },
                auroraStrength: { value: 0 },
                auroraSpeed: { value: 1 },
            },
            fragmentShader,
        });
    },

    light(state, { options }) {
        const amount = visibility(state, Number(options.intensity));
        if (amount <= 0) return;
        low.set(options.color || "#2dff8a");
        high.set(options.secondColor || "#b03cff");
        glow.copy(low).lerp(high, 0.25);
        state.ambientSky.lerp(glow, Math.min(0.18 * amount, 0.3));
        state.ambientIntensity *= 1 + 0.12 * amount;
        state.skyHorizon.lerp(glow.multiplyScalar(0.05), Math.min(0.25 * amount, 0.4));
        state.fogColor.lerp(state.skyHorizon, 0.4);
        if (state.lightIsMoon) state.lightColor.lerp(low, Math.min(0.12 * amount, 0.2));
        state.grade.nightTint.lerp(low, 0.1 * Math.min(amount, 1));
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        uniforms.auroraLow.value.set(options.color || "#2dff8a");
        uniforms.auroraHigh.value.set(options.secondColor || "#b03cff");
        uniforms.auroraStrength.value = visibility(state, Number(options.intensity));
        uniforms.auroraSpeed.value = Number(options.speed);
    },
};
