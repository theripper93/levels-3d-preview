import { Color, Vector3 } from "three";
import { SkyDome, realisticShader } from "../sky/dome.js";
import { SKY_BODIES } from "../sky/chunks.js";

const MOON_RADIUS = 0.04;

const fragmentShader = realisticShader(
    `${SKY_BODIES}
    uniform float moonsVisible;`,
    `if (moonsVisible > 0.0) {
        vec4 moons = skyBodies(dir, env);
        float cover = moons.a * horizonMask * moonsVisible * (1.0 - clouds.a);
        sky = sky * (1.0 - cover) + moons.rgb * horizonMask * moonsVisible * (1.0 - clouds.a);
    }`,
);

function makeMoon(seed) {
    return { kind: "moon", direction: new Vector3(), radius: MOON_RADIUS, color: new Color(), brightness: 3, glow: 0, phase: 0.5, lit: 1, seed, power: 0 };
}

const second = makeMoon(5);
const third = makeMoon(9);
const bodies = [second, third];
const firstLight = new Color();
const blend = new Color();
const scratch = new Color();

function litFraction(phase) {
    return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
}

function aboveHorizon(direction) {
    return Math.clamp((direction.y + 0.03) / 0.12, 0, 1);
}

function placeMoon(moon, ctx, offset, azimuth, color, size, phase) {
    ctx.directionAt(ctx.time + 12 + offset, moon.direction, { azimuth });
    moon.color.set(color);
    moon.radius = MOON_RADIUS * size;
    moon.phase = phase;
    const lit = litFraction(phase);
    moon.glow = 0.5 * lit * size;
    moon.power = aboveHorizon(moon.direction) * (0.15 + 0.85 * lit) * Math.min(size, 1.6);
}

export default {
    id: "twinMoons",
    order: 25,
    fields: [
        { name: "secondColor", type: "color", default: "#ffb27a" },
        { name: "secondSize", type: "range", min: 0.4, max: 3, step: 0.1, default: 1.7 },
        { name: "secondPhase", type: "range", min: 0, max: 1, step: 0.05, default: 0.35 },
        { name: "thirdMoon", type: "checkbox", default: false },
        { name: "thirdColor", type: "color", default: "#8ff0d0" },
        { name: "thirdSize", type: "range", min: 0.4, max: 3, step: 0.1, default: 0.6 },
        { name: "thirdPhase", type: "range", min: 0, max: 1, step: 0.05, default: 0.8 },
    ],

    createDome() {
        return new SkyDome({ name: "TwinMoonsSkyShader", uniforms: { moonsVisible: { value: 1 } }, fragmentShader });
    },

    light(state, ctx) {
        const { options } = ctx;
        placeMoon(second, ctx, 2.5, 28, options.secondColor || "#ffb27a", Number(options.secondSize), Number(options.secondPhase));
        placeMoon(third, ctx, -3, -35, options.thirdColor || "#8ff0d0", Number(options.thirdSize), Number(options.thirdPhase));
        const moons = options.thirdMoon ? 2 : 1;
        const firstPower = aboveHorizon(state.moonDirection) * (0.15 + 0.85 * litFraction(state.moonPhase));
        firstLight.copy(state.moonColor);
        let brightest = null;
        let bestPower = firstPower;
        let total = firstPower;
        blend.copy(firstLight).multiplyScalar(firstPower);
        for (let i = 0; i < moons; i++) {
            const moon = bodies[i];
            total += moon.power;
            blend.add(scratch.copy(moon.color).multiplyScalar(moon.power));
            if (moon.power > bestPower) {
                bestPower = moon.power;
                brightest = moon;
            }
        }
        if (total <= 0.001) return;
        blend.multiplyScalar(1 / total);
        const night = state.night;
        state.ambientSky.lerp(blend, 0.45 * night);
        state.ambientIntensity *= 1 + 0.3 * night * Math.min(total - firstPower, 1.5);
        state.grade.nightTint.lerp(scratch.copy(blend).multiplyScalar(1.6), 0.2);
        if (!state.lightIsMoon) return;
        if (brightest) {
            ctx.setKeyLight(brightest.direction, scratch.copy(brightest.color).lerp(firstLight, 0.35), state.moonIntensity * Math.min(bestPower, 1.4) * 1.1);
        } else {
            state.lightColor.lerp(blend, 0.3);
            state.lightIntensity *= 1 + 0.25 * Math.min(total - firstPower, 1.5);
        }
    },

    apply(dome, state, { options }) {
        dome.material.uniforms.moonsVisible.value = 0.35 + 0.65 * Math.clamp(state.night, 0, 1);
        dome.setBodies(options.thirdMoon ? bodies : [second]);
    },
};
