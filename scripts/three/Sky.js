import { BackSide, BoxGeometry, Color, Mesh, ShaderMaterial, UniformsUtils, Vector2, Vector3 } from "three";
import { SKY_UNIFORMS, SKY_NOISE, SKY_STARS, SKY_CLOUDS, SKY_FINISH } from "../atmosphere/sky/chunks.js";

const STATE_COLORS = ["skyZenith", "skyHorizon", "skyGround", "sunColor", "moonColor", "fogColor"];

const STATE_SCALARS = ["daylight", "twilight", "night", "starVisibility", "moonPhase", "sunDiscSize", "sunGlow", "haze", "fogDensity", "flash"];

const CLOUD_SCALARS = {
    cover: "cloudCover",
    density: "cloudDensity",
    darkness: "cloudDarkness",
    speed: "cloudSpeed",
    scale: "cloudScale",
    alpha: "cloudAlpha",
};

class Sky extends Mesh {
    constructor(shader = Sky.SkyShader) {
        const material = new ShaderMaterial({
            name: shader.name ?? "SkyShader",
            fragmentShader: shader.fragmentShader,
            vertexShader: shader.vertexShader,
            uniforms: UniformsUtils.clone(shader.uniforms),
            side: BackSide,
            depthWrite: false,
        });
        super(new BoxGeometry(1, 1, 1), material);
    }

    applyState(state) {
        if (!state) return;
        const uniforms = this.material.uniforms;
        if (state.sunDirection) uniforms.sunDirection.value.copy(state.sunDirection);
        if (state.moonDirection) uniforms.moonDirection.value.copy(state.moonDirection);
        for (const key of STATE_COLORS) {
            if (state[key]) uniforms[key].value.copy(state[key]);
        }
        for (const key of STATE_SCALARS) {
            if (Number.isFinite(state[key])) uniforms[key].value = state[key];
        }
        const clouds = state.clouds;
        if (!clouds) return;
        for (const [key, uniform] of Object.entries(CLOUD_SCALARS)) {
            if (Number.isFinite(clouds[key])) uniforms[uniform].value = clouds[key];
        }
        if (clouds.tint) uniforms.cloudTint.value.copy(clouds.tint);
        if (clouds.drift) uniforms.cloudDrift.value.copy(clouds.drift);
        uniforms.cloudsEnabled.value = clouds.enabled === false ? 0 : 1;
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}

Sky.prototype.isSky = true;

Sky.SkyShader = {
    uniforms: {
        time: { value: 0 },
        environmentMode: { value: 0 },
        environmentClamp: { value: 4 },
        sunDirection: { value: new Vector3(0.3, 0.8, 0.5).normalize() },
        moonDirection: { value: new Vector3(-0.3, -0.8, -0.5).normalize() },
        skyZenith: { value: new Color(0.12, 0.3, 0.75) },
        skyHorizon: { value: new Color(0.55, 0.72, 0.9) },
        skyGround: { value: new Color(0.25, 0.27, 0.3) },
        sunColor: { value: new Color(1, 0.95, 0.85) },
        moonColor: { value: new Color(0.6, 0.7, 1) },
        daylight: { value: 1 },
        twilight: { value: 0 },
        night: { value: 0 },
        starVisibility: { value: 0 },
        moonPhase: { value: 0.5 },
        sunDiscSize: { value: 1 },
        sunGlow: { value: 1 },
        haze: { value: 0.3 },
        fogColor: { value: new Color(0.6, 0.7, 0.8) },
        fogDensity: { value: 0 },
        edgeBlend: { value: 0 },
        flash: { value: 0 },
        cloudsEnabled: { value: 1 },
        cloudCover: { value: 0.35 },
        cloudDensity: { value: 0.6 },
        cloudDarkness: { value: 0 },
        cloudTint: { value: new Color(1, 1, 1) },
        cloudSpeed: { value: 1 },
        cloudScale: { value: 1 },
        cloudAlpha: { value: 0.9 },
        cloudDrift: { value: new Vector2() },
    },

    vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
            vDirection = mat3(modelMatrix) * position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position.z = gl_Position.w;
        }`,

    fragmentShader: /* glsl */ `
        ${SKY_UNIFORMS}
        ${SKY_NOISE}
        ${SKY_STARS}
        ${SKY_CLOUDS}
        ${SKY_FINISH}

        const float SUN_RADIUS = 0.024;
        const float MOON_RADIUS = 0.04;

        void main() {
            vec3 dir = normalize(vDirection);
            float y = dir.y;
            float up = max(y, 0.0);
            float env = environmentMode;

            vec3 sunDir = normalize(sunDirection);
            vec3 moonDir = normalize(moonDirection);
            vec3 sunTint = tintOf(sunColor);
            vec3 moonTint = tintOf(moonColor);
            float sunUp = smoothstep(-0.12, 0.04, sunDir.y);
            float sunPower = sunUp * clamp(max(daylight, twilight), 0.0, 1.0);
            float moonUp = smoothstep(-0.05, 0.05, moonDir.y);
            float moonPower = moonUp * mix(0.35, 1.0, clamp(night, 0.0, 1.0));
            float lit = clamp(0.5 - 0.5 * cos(moonPhase * PI2), 0.0, 1.0);

            float horizonBand = pow(1.0 - up, mix(10.0, 2.5, haze));
            vec3 color = mix(skyZenith, skyHorizon, horizonBand);
            color = mix(color, skyGround, smoothstep(0.0, 0.1, -y));

            float mu = dot(dir, sunDir);
            float muPos = max(mu, 0.0);
            float towardSun = pow(mu * 0.5 + 0.5, 4.0);
            float afterglow = smoothstep(-0.3, 0.02, sunDir.y);
            color = mix(color, color * sunTint * 1.5, twilight * afterglow * horizonBand * towardSun);
            vec3 sunHalo = sunTint * sunGlow * sunPower * ((0.15 * pow(muPos, 6.0) * (0.3 + twilight) + 0.45 * pow(muPos, mix(64.0, 24.0, twilight))) * (1.0 - 0.5 * env) + 2.0 * pow(muPos, 900.0) * (1.0 - env));
            color += sunHalo;

            float moonMu = max(dot(dir, moonDir), 0.0);
            color += moonTint * moonPower * night * (0.04 * pow(moonMu, 12.0) + 0.25 * pow(moonMu, 300.0)) * (0.05 + lit);

            float horizonMask = smoothstep(-0.01, 0.02, y);
            vec3 sky = color;

            if (env < 0.5) {
                float sunAngle = sqrt(max(2.0 * (1.0 - mu), 0.0));
                float sunRadius = SUN_RADIUS * sunDiscSize;
                float sunDisc = 1.0 - smoothstep(sunRadius * 0.85, sunRadius, sunAngle);
                sky += sunTint * sunDisc * sunPower * horizonMask * 24.0;

                vec3 helper = abs(moonDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
                vec3 moonRight = normalize(cross(helper, moonDir));
                vec3 moonUpAxis = cross(moonDir, moonRight);
                vec2 local = vec2(dot(dir, moonRight), dot(dir, moonUpAxis)) / MOON_RADIUS;
                float r2 = dot(local, local);
                if (r2 < 1.0 && dot(dir, moonDir) > 0.0) {
                    vec3 normal = vec3(local, sqrt(1.0 - r2));
                    float angle = moonPhase * PI2;
                    vec3 light = vec3(sin(angle), 0.0, -cos(angle));
                    float shade = smoothstep(-0.06, 0.12, dot(normal, light));
                    float albedo = 0.72 + 0.28 * valueNoise(local * 2.6 + 11.0) - 0.12 * valueNoise(local * 6.0 + 3.0);
                    float edge = 1.0 - smoothstep(0.92, 1.0, sqrt(r2));
                    vec3 moonDisc = moonTint * (shade * albedo * 3.0 + 0.04);
                    sky = mix(sky, moonDisc + sky * 0.8 * (1.0 - shade), edge * moonPower * horizonMask);
                }

                if (starVisibility > 0.001) {
                    float stars = starLayer(dir, 220.0, 0.22, 0.0) + starLayer(dir, 70.0, 0.12, 41.0) * 1.6;
                    float starMask = starVisibility * smoothstep(0.0, 0.2, y) * (1.0 - clamp(fogDensity, 0.0, 1.0));
                    vec3 starColor = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash12(floor(dir.xz * 300.0)));
                    sky += starColor * stars * starMask;
                }
            }

            vec4 clouds = realisticClouds(dir, sunDir, moonDir, sunTint, moonTint, sunUp, sunPower, moonPower, lit, towardSun, afterglow);
            sky = mix(sky, clouds.rgb, clouds.a);

            skyOutput(skyFinish(sky, y, env));
        }`,
};

export { Sky };
