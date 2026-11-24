import { Color, Vector3 } from "three";
import { SkyDome, skyDirection } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_SPACE, SKY_BODIES, SKY_FINISH } from "../sky/chunks.js";

const SPACE = new Color(0.0025, 0.003, 0.006);
const SUN = new Color(1, 0.99, 0.97);
const PLANETS = { moon: { color: "#a9a49c", ring: 0, kind: "moon" }, ringed: { color: "#d2b48a", ring: 2.3, kind: "planet" } };

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_SPACE}
    ${SKY_BODIES}
    ${SKY_FINISH}

    uniform float starDensityScale;
    uniform float milkyWayStrength;
    uniform vec3 nebulaColor;
    uniform float nebulaStrength;
    uniform vec3 galaxyNormal;

    void main() {
        vec3 dir = normalize(vDirection);
        float env = environmentMode;
        vec3 sky = skyZenith;
        sky += milkyWay(dir, galaxyNormal, vec3(1.0, 0.86, 0.66), vec3(0.5, 0.6, 0.9), milkyWayStrength * 0.16);
        sky += nebula(dir, nebulaColor, nebulaColor.brg * 0.5 + vec3(0.05), nebulaStrength * 0.18, 3.0);

        if (env < 0.5) {
            float galaxy = exp(-pow(dot(dir, galaxyNormal), 2.0) / 0.03);
            float density = starDensityScale;
            float stars = starPoints(dir, 320.0, 0.3 * density, 0.0, 0.0) * 0.5;
            stars += starPoints(dir, 150.0, 0.22 * density, 11.0, 0.0);
            stars += starPoints(dir, 60.0, 0.1 * density, 23.0, 0.04) * 2.2;
            if (galaxy > 0.02) stars += starPoints(dir, 520.0, 0.55 * galaxy * density, 37.0, 0.0) * 0.45;
            sky += starColor(dir, 0.0) * stars * 0.9;
        }

        vec4 bodies = skyBodies(dir, env);
        sky = sky * (1.0 - bodies.a) + bodies.rgb;
        if (env > 0.5) sky = min(sky, vec3(environmentClamp));
        skyOutput(max(sky, vec3(0.0)));
    }
`;

const sun = { kind: "star", radius: 0.02, color: SUN, brightness: 0.6, glow: 0.8, direction: new Vector3() };
const planet = { kind: "planet", radius: 0.085, color: "#ffffff", brightness: 1, glow: 0, direction: new Vector3(), litFrom: null, lit: 1.4, seed: 3 };
const bodies = [sun, planet];

export default {
    id: "deepSpace",
    order: 65,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "sunAzimuth", type: "range", min: 0, max: 360, step: 1, default: 135 },
        { name: "sunElevation", type: "range", min: 5, max: 90, step: 1, default: 40 },
        { name: "stars", type: "range", min: 0.2, max: 2, step: 0.1, default: 1 },
        { name: "milkyWay", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
        { name: "nebula", type: "range", min: 0, max: 1, step: 0.05, default: 0.35 },
        { name: "nebulaColor", type: "color", default: "#6a3cc8" },
        { name: "planet", type: "select", default: "ringed", choices: { none: "levels3dpreview.skyStyles.deepSpace.planets.none", moon: "levels3dpreview.skyStyles.deepSpace.planets.moon", ringed: "levels3dpreview.skyStyles.deepSpace.planets.ringed" } },
    ],

    createDome() {
        return new SkyDome({
            name: "DeepSpaceSkyShader",
            uniforms: {
                starDensityScale: { value: 1 },
                milkyWayStrength: { value: 1 },
                nebulaColor: { value: new Color() },
                nebulaStrength: { value: 0.35 },
                galaxyNormal: { value: new Vector3(0.35, 0.62, 0.7).normalize() },
            },
            fragmentShader,
        });
    },

    orient({ options, sunDirection, moonDirection }) {
        skyDirection(Number(options.sunAzimuth), Number(options.sunElevation), sunDirection);
        moonDirection.copy(sunDirection).negate();
    },

    light(state, { darkness, setKeyLight }) {
        const dim = 1 - 0.7 * darkness;
        state.lightIsMoon = false;
        setKeyLight(state.sunDirection, SUN, 2.3 * dim);
        state.shadowIntensity = 1;
        state.shadowSoftness = 0.3;
        state.ambientSky.setRGB(0.36, 0.4, 0.55);
        state.ambientGround.setRGB(0.05, 0.05, 0.07);
        state.ambientIntensity = 0.22 * dim;
        state.environmentGain = 1;
        for (const color of [state.skyZenith, state.skyHorizon, state.skyGround, state.fogColor]) color.copy(SPACE);
        state.sunColor.copy(SUN);
        state.fogDensity = 0;
        state.haze = 0;
        state.daylight = 1;
        state.twilight = 0;
        state.night = 0;
        state.starVisibility = 1;
        state.clouds.enabled = false;
        const grade = state.grade;
        grade.exposure = 1;
        grade.contrast = 1.12;
        grade.saturation = 0.95;
        grade.night = 0;
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        uniforms.starDensityScale.value = Number(options.stars);
        uniforms.milkyWayStrength.value = Number(options.milkyWay);
        uniforms.nebulaStrength.value = Number(options.nebula);
        uniforms.nebulaColor.value.set(options.nebulaColor || "#6a3cc8");
        sun.direction.copy(state.sunDirection);
        const kind = PLANETS[options.planet];
        if (kind) {
            skyDirection(Number(options.sunAzimuth) + 150, 22, planet.direction);
            planet.color = kind.color;
            planet.kind = kind.kind;
            planet.ring = kind.ring;
            planet.litFrom = state.sunDirection;
        }
        dome.setBodies(kind ? bodies : [sun]);
    },
};
