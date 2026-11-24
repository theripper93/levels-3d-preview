import { Color, Vector3 } from "three";
import { SkyDome, skyDirection } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_SPACE, SKY_FINISH } from "../sky/chunks.js";

const SPACE = new Color(0.002, 0.0025, 0.005);
const SUN = new Color(1, 0.98, 0.95);
const SPIN_RATE = 0.006;

const PLANETS = {
    terran: { kind: 0, low: "#17468c", high: "#5d7a3c", cloud: "#d4e0f4", atmosphere: "#4f9cff", glow: "#ffb35c", clouds: 0.8, bounce: "#5d8fd8" },
    desert: { kind: 1, low: "#9a5530", high: "#e0a865", cloud: "#f6e2c8", atmosphere: "#ffb27a", glow: "#000000", clouds: 0.18, bounce: "#e09a5c" },
    ice: { kind: 2, low: "#7f9fbf", high: "#eef4fa", cloud: "#ffffff", atmosphere: "#a8dcff", glow: "#000000", clouds: 0.45, bounce: "#bcd6f0" },
    gas: { kind: 3, low: "#8a5636", high: "#f0dcb8", cloud: "#fff4e0", atmosphere: "#b88a5c", glow: "#000000", clouds: 0, bounce: "#d8b088" },
    lava: { kind: 4, low: "#2a1d18", high: "#5e4a40", cloud: "#2a2220", atmosphere: "#ff7a3c", glow: "#ff5a14", clouds: 0.3, bounce: "#ff6a2a" },
};

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_SPACE}
    ${SKY_FINISH}

    uniform vec3 planetDirection;
    uniform vec3 planetAxis;
    uniform float planetRadius;
    uniform float planetSpeed;
    uniform float planetKind;
    uniform float planetClouds;
    uniform vec3 planetLow;
    uniform vec3 planetHigh;
    uniform vec3 planetCloud;
    uniform vec3 planetAtmosphere;
    uniform vec3 planetGlow;
    uniform vec3 galaxyNormal;

    float sphereFbm(vec3 p, int octaves) {
        float sum = 0.0;
        float amplitude = 0.5;
        float total = 0.0;
        for (int i = 0; i < 3; i++) {
            if (i >= octaves) break;
            sum += amplitude * valueNoise3(p);
            total += amplitude;
            p = p * 2.03 + vec3(1.7, 9.2, 3.1);
            amplitude *= 0.5;
        }
        return sum / total;
    }

    vec3 spinFrame(vec3 n, float angle) {
        vec3 right = skyBasisRight(planetAxis);
        vec3 forward = cross(planetAxis, right);
        float x = dot(n, right);
        float z = dot(n, forward);
        float c = cos(angle);
        float s = sin(angle);
        return vec3(c * x - s * z, dot(n, planetAxis), s * x + c * z);
    }

    vec3 planetSurface(vec3 q, vec3 qc, float env, out float ocean, out float emissive, out float cloud) {
        ocean = 0.0;
        emissive = 0.0;
        cloud = 0.0;
        int detail = env > 0.5 ? 2 : 3;
        vec3 albedo;
        if (planetKind < 0.5) {
            float grain = env < 0.5 ? valueNoise3(q * 30.0) - 0.5 : 0.0;
            float land = sphereFbm(q * 4.0, detail) + 0.22 * grain;
            float coast = smoothstep(0.5, 0.512, land);
            ocean = 1.0 - coast;
            vec3 ground = mix(planetHigh * (0.8 + 0.6 * grain), vec3(0.36, 0.3, 0.17), smoothstep(0.7, 0.76, land + 0.3 * grain) * 0.85);
            albedo = mix(planetLow * (0.75 + 0.5 * smoothstep(0.38, 0.5, land)), ground, coast);
            albedo = mix(albedo, vec3(0.78, 0.86, 0.98), smoothstep(0.8, 0.84, abs(q.y) + 0.12 * land + 0.1 * grain));
            vec3 town = q * 160.0;
            float lights = step(0.86, hash13(floor(town))) * smoothstep(0.42, 0.1, length(fract(town) - 0.5));
            emissive = coast * lights * smoothstep(0.53, 0.6, land) * 0.7;
        } else if (planetKind < 1.5) {
            float dunes = sphereFbm(q * 3.0, detail);
            float ridges = 1.0 - abs(valueNoise3(q * 10.0) * 2.0 - 1.0);
            float rock = valueNoise3(q * 6.0 + 3.0);
            albedo = mix(planetLow, planetHigh, smoothstep(0.38, 0.62, dunes)) * (0.7 + 0.45 * ridges);
            albedo = mix(albedo, planetLow * 0.4, smoothstep(0.62, 0.72, rock) * 0.8);
            albedo = mix(albedo, vec3(0.95), smoothstep(0.9, 0.95, abs(q.y)));
        } else if (planetKind < 2.5) {
            float sheet = sphereFbm(q * 3.2, detail);
            float cracks = smoothstep(0.035, 0.0, abs(valueNoise3(q * 8.0) - 0.5)) + 0.6 * smoothstep(0.03, 0.0, abs(valueNoise3(q * 17.0 + 5.0) - 0.5));
            albedo = mix(planetLow, planetHigh, smoothstep(0.35, 0.6, sheet));
            albedo = mix(albedo, vec3(0.36, 0.24, 0.18), min(cracks, 1.0) * 0.65);
            ocean = 0.4 * (1.0 - smoothstep(0.35, 0.5, sheet));
        } else if (planetKind < 3.5) {
            float swirl = sphereFbm(q * vec3(3.0, 14.0, 3.0), detail);
            float bands = sin(q.y * 34.0 + 4.0 * swirl) * 0.65 + sin(q.y * 83.0 + 6.0 * swirl) * 0.35;
            albedo = mix(planetLow, planetHigh, smoothstep(-0.6, 0.6, bands));
            albedo = mix(albedo, vec3(0.55, 0.26, 0.12), smoothstep(0.55, 0.9, sin(q.y * 11.0 + 1.5 + 2.0 * swirl)) * 0.6);
            albedo *= 0.8 + 0.35 * swirl;
            float storm = smoothstep(0.12, 0.0, length(vec2(atan(q.z, q.x) * 0.5 - 1.2, (q.y + 0.25) * 2.2)));
            albedo = mix(albedo, vec3(0.75, 0.38, 0.22), storm * 0.8);
        } else {
            float crust = sphereFbm(q * 3.8, detail);
            float vein = 1.0 - abs(valueNoise3(q * 7.0) * 2.0 - 1.0);
            float fissure = env < 0.5 ? 1.0 - abs(valueNoise3(q * 19.0 + 2.0) * 2.0 - 1.0) : 0.0;
            albedo = mix(planetLow, planetHigh, crust);
            emissive = smoothstep(0.92, 0.99, vein) * (0.35 + 0.65 * smoothstep(0.4, 0.7, crust)) + smoothstep(0.94, 0.99, fissure) * smoothstep(0.5, 0.7, crust) * 0.6;
        }
        if (planetClouds > 0.0) {
            float c = sphereFbm(qc * vec3(7.0, 20.0, 7.0) + vec3(0.0, 4.0, 0.0), detail);
            float wisp = env < 0.5 ? valueNoise3(qc * vec3(32.0, 85.0, 32.0)) : 0.5;
            cloud = smoothstep(0.5, 0.75, c + 0.25 * (wisp - 0.5)) * (0.55 + 0.45 * wisp) * planetClouds;
        }
        return albedo;
    }

    vec4 planetLayer(vec3 dir, vec3 sunDir, float env) {
        vec3 center = normalize(planetDirection);
        float r = planetRadius;
        float b = dot(dir, center);
        float miss = sqrt(max(1.0 - b * b, 0.0)) / r;
        float aa = max(fwidth(miss), 0.002) * 1.5;
        if (b <= 0.0) return vec4(0.0);
        vec3 limbNormal = normalize(dir - center * b);
        float limbLit = smoothstep(-0.35, 0.45, dot(limbNormal, sunDir));
        float behind = pow(max(dot(dir, sunDir), 0.0), 6.0);
        float haloShape = exp(-max(miss - 1.0, 0.0) * 30.0) + 0.2 * exp(-max(miss - 1.0, 0.0) * 8.0);
        vec3 halo = planetAtmosphere * haloShape * (limbLit * 0.9 + behind * 3.0);
        float cover = 1.0 - smoothstep(1.0 - aa, 1.0, miss);
        if (cover <= 0.0) return vec4(halo, 0.0);

        float disc = b * b - (1.0 - r * r);
        float t = b - sqrt(max(disc, 0.0));
        vec3 normal = normalize((dir * t - center) / r);
        float angle = time * planetSpeed;
        vec3 q = spinFrame(normal, angle);
        vec3 qc = spinFrame(normal, angle * 1.35 + 0.7);
        float ocean;
        float emissive;
        float cloud;
        vec3 albedo = planetSurface(q, qc, env, ocean, emissive, cloud);

        float ndl = dot(normal, sunDir);
        float day = smoothstep(-0.12, 0.35, ndl);
        float diffuse = clamp(ndl * 0.9 + 0.1, 0.0, 1.0) * day;
        vec3 sunLight = tintOf(sunColor);
        vec3 color = albedo * (1.0 - cloud) * sunLight * diffuse * 0.9;
        color += planetCloud * cloud * sunLight * (diffuse * 0.8 + 0.01);
        color += planetAtmosphere * diffuse * 0.08;
        float facing = max(dot(normal, -dir), 0.0);
        if (ocean > 0.0 && env < 0.5) {
            float glint = pow(max(dot(reflect(-sunDir, normal), -dir), 0.0), 400.0);
            color += sunLight * glint * ocean * (1.0 - cloud) * 0.7 * day;
        }
        float dark = 1.0 - smoothstep(-0.15, 0.1, ndl);
        color += planetGlow * emissive * (1.0 - cloud * 0.7) * (planetKind > 3.5 ? 1.4 : dark * 0.9);
        color += planetGlow * planetGlow * emissive * emissive * step(3.5, planetKind) * 1.5;
        float rim = pow(1.0 - facing, 2.5);
        color = mix(color, planetAtmosphere * (day * 0.9 + 0.04), rim * 0.6);
        color += planetAtmosphere * pow(1.0 - facing, 6.0) * behind * 2.0;
        return vec4(color * cover + halo * (1.0 - cover), cover);
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float env = environmentMode;
        vec3 sunDir = normalize(sunDirection);
        vec3 sky = skyZenith;
        vec3 center = normalize(planetDirection);
        float hidden = step(sqrt(max(1.0 - dot(dir, center) * dot(dir, center), 0.0)), planetRadius) * step(0.0, dot(dir, center));

        if (hidden < 0.5) {
            sky += milkyWay(dir, galaxyNormal, vec3(1.0, 0.86, 0.66), vec3(0.5, 0.6, 0.9), 0.04);
            if (env < 0.5) {
                float stars = starPoints(dir, 300.0, 0.32, 0.0, 0.0) * 0.5;
                stars += starPoints(dir, 140.0, 0.22, 11.0, 0.0);
                stars += starPoints(dir, 55.0, 0.1, 23.0, 0.05) * 2.2;
                sky += starColor(dir, 0.0) * stars * 0.9;
            }
            float mu = max(dot(dir, sunDir), 0.0);
            float discMask = smoothstep(0.99984, 0.99989, mu);
            sky += sunColor * (discMask * mix(30.0, 4.0, env) + pow(mu, 900.0) * 1.2 + pow(mu, 40.0) * 0.06);
        }

        vec4 planet = planetLayer(dir, sunDir, env);
        sky = sky * (1.0 - planet.a) + planet.rgb;
        if (env > 0.5) sky = min(sky, vec3(environmentClamp));
        skyOutput(max(sky, vec3(0.0)));
    }
`;

const scratch = new Color();
const bounce = new Color();
const planetDirection = new Vector3();

function planetOf(options) {
    return PLANETS[options.planet] ?? PLANETS.terran;
}

function placePlanet(options, target) {
    const size = Number(options.size);
    return skyDirection(Number(options.planetDirection), -size * 0.55, target);
}

export default {
    id: "stationView",
    order: 75,
    timeOfDay: false,
    options: [],
    fields: [
        { name: "planet", type: "select", default: "terran", choices: Object.fromEntries(Object.keys(PLANETS).map((key) => [key, `levels3dpreview.skyStyles.stationView.planets.${key}`])) },
        { name: "size", type: "range", min: 10, max: 60, step: 1, default: 32 },
        { name: "planetDirection", type: "range", min: 0, max: 360, step: 1, default: 220 },
        { name: "spin", type: "range", min: 0, max: 3, step: 0.1, default: 1 },
        { name: "sunAzimuth", type: "range", min: 0, max: 360, step: 1, default: 120 },
        { name: "sunElevation", type: "range", min: 5, max: 90, step: 1, default: 35 },
    ],

    createDome() {
        return new SkyDome({
            name: "StationViewSkyShader",
            uniforms: {
                planetDirection: { value: new Vector3(0, -0.3, -1).normalize() },
                planetAxis: { value: new Vector3(0.25, 1, 0.15).normalize() },
                planetRadius: { value: 0.6 },
                planetSpeed: { value: SPIN_RATE },
                planetKind: { value: 0 },
                planetClouds: { value: 0.8 },
                planetLow: { value: new Color() },
                planetHigh: { value: new Color() },
                planetCloud: { value: new Color() },
                planetAtmosphere: { value: new Color() },
                planetGlow: { value: new Color() },
                galaxyNormal: { value: new Vector3(0.6, 0.45, -0.66).normalize() },
            },
            fragmentShader,
        });
    },

    orient({ options, sunDirection, moonDirection }) {
        skyDirection(Number(options.sunAzimuth), Number(options.sunElevation), sunDirection);
        placePlanet(options, moonDirection);
    },

    light(state, { options, darkness, setKeyLight }) {
        const dim = 1 - 0.7 * darkness;
        const planet = planetOf(options);
        placePlanet(options, planetDirection);
        const coverage = Math.sin((Number(options.size) * Math.PI) / 180);
        const litFace = Math.max(0, 0.5 - 0.5 * planetDirection.dot(state.sunDirection));
        const glow = planet.kind === 4 ? 0.35 : 0;
        state.lightIsMoon = false;
        setKeyLight(state.sunDirection, SUN, 2.4 * dim);
        state.shadowIntensity = 1;
        state.shadowSoftness = 0.3;
        bounce.set(planet.bounce);
        state.ambientSky.setRGB(0.2, 0.23, 0.32);
        state.ambientGround.copy(scratch.setRGB(0.03, 0.03, 0.045)).lerp(bounce, Math.min(1, coverage * (litFace + glow) * 1.6));
        state.ambientIntensity = (0.2 + 0.25 * coverage * (litFace + glow)) * dim;
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
        grade.saturation = 1;
        grade.night = 0;
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        const planet = planetOf(options);
        placePlanet(options, uniforms.planetDirection.value);
        uniforms.planetRadius.value = Math.sin((Number(options.size) * Math.PI) / 180);
        uniforms.planetSpeed.value = SPIN_RATE * Number(options.spin);
        uniforms.planetKind.value = planet.kind;
        uniforms.planetClouds.value = planet.clouds;
        uniforms.planetLow.value.set(planet.low);
        uniforms.planetHigh.value.set(planet.high);
        uniforms.planetCloud.value.set(planet.cloud);
        uniforms.planetAtmosphere.value.set(planet.atmosphere);
        uniforms.planetGlow.value.set(planet.glow);
        dome.setBodies([]);
    },
};
