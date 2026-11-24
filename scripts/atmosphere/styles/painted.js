import { SkyDome } from "../sky/dome.js";
import { SKY_UNIFORMS, SKY_NOISE, SKY_NOISE3, SKY_PAINTED, SKY_FINISH } from "../sky/chunks.js";

const fragmentShader = /* glsl */ `
    ${SKY_UNIFORMS}
    ${SKY_NOISE}
    ${SKY_NOISE3}
    ${SKY_PAINTED}
    ${SKY_FINISH}

    uniform float paintBands;
    uniform float brushStrength;

    const float SUN_RADIUS = 0.045;
    const float MOON_RADIUS = 0.06;

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

        float stroke = fbm2v(vec3(dir.x * 2.0, y * 21.0, dir.z * 2.0)) * 0.6 + fbm2v(vec3(dir.x * 6.0, y * 45.0, dir.z * 6.0) + 4.1) * 0.4;
        float height = clamp(up + (stroke - 0.5) * 0.09 * brushStrength, 0.0, 1.0);
        float horizonBand = pow(paintBand(1.0 - height, paintBands, 0.16), mix(2.6, 1.4, haze));
        vec3 zenith = skyZenith * vec3(0.85, 0.95, 1.1) + vec3(0.004, 0.008, 0.03) * night;
        vec3 horizon = mix(skyHorizon, skyHorizon * vec3(1.18, 1.06, 0.82), 0.6 * daylight);
        vec3 color = mix(zenith, horizon, horizonBand);
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = max(mix(vec3(luma), color, 1.35), vec3(0.0));
        color = mix(color, skyGround, smoothstep(0.0, 0.1, -y));

        float mu = dot(dir, sunDir);
        float muPos = max(mu, 0.0);
        float towardSun = pow(mu * 0.5 + 0.5, 3.0);
        float afterglow = smoothstep(-0.3, 0.02, sunDir.y);
        float warm = paintBand(clamp(twilight * afterglow * horizonBand * towardSun * 1.3, 0.0, 1.0), paintBands, 0.2);
        color = mix(color, color * sunTint * 1.6 + sunTint * 0.06, warm);

        float rings = max(paintBands, 3.0);
        float halo = paintBand(pow(muPos, 24.0), rings, 0.15) * 0.45 + paintBand(pow(muPos, 5.0), rings, 0.2) * 0.14 * (0.4 + twilight);
        color += sunTint * sunGlow * sunPower * halo * (1.0 - 0.5 * env);

        float moonMu = max(dot(dir, moonDir), 0.0);
        color += moonTint * moonPower * night * paintBand(pow(moonMu, 60.0), 3.0, 0.2) * 0.1;

        float horizonMask = smoothstep(-0.01, 0.02, y);
        vec3 sky = color;

        if (env < 0.5) {
            if (starVisibility > 0.001) {
                float stars = sparkleLayer(dir, 34.0, 0.1, 0.0) + sparkleLayer(dir, 80.0, 0.07, 17.0) * 0.55;
                float starMask = starVisibility * smoothstep(0.02, 0.25, y) * (1.0 - clamp(fogDensity, 0.0, 1.0));
                sky += mix(vec3(1.0, 0.95, 0.75), vec3(0.8, 0.9, 1.0), hash12(floor(dir.xz * 40.0))) * stars * starMask;
            }

            float sunAngle = sqrt(max(2.0 * (1.0 - mu), 0.0));
            float sunRadius = SUN_RADIUS * sunDiscSize;
            float disc = 1.0 - smoothstep(sunRadius * 0.93, sunRadius, sunAngle);
            float core = 1.0 - smoothstep(sunRadius * 0.5, sunRadius * 0.72, sunAngle);
            vec3 sunPaint = mix(sunTint * vec3(1.0, 0.82, 0.55), vec3(1.0, 0.97, 0.88), core) * mix(3.0, 8.0, daylight);
            sky = mix(sky, sunPaint, disc * sunPower * horizonMask);

            vec3 right = skyBasisRight(moonDir);
            vec3 upAxis = cross(moonDir, right);
            vec2 local = vec2(dot(dir, right), dot(dir, upAxis)) / MOON_RADIUS;
            float r2 = dot(local, local);
            if (r2 < 1.0 && dot(dir, moonDir) > 0.0) {
                vec3 normal = vec3(local, sqrt(1.0 - r2));
                float angle = moonPhase * PI2;
                float shade = smoothstep(-0.02, 0.04, dot(normal, vec3(sin(angle), 0.0, -cos(angle))));
                float craters = 1.0 - 0.18 * (1.0 - smoothstep(0.16, 0.2, length(local - vec2(-0.3, 0.25)))) - 0.12 * (1.0 - smoothstep(0.1, 0.13, length(local - vec2(0.28, -0.32))));
                vec3 lit = mix(moonTint, vec3(1.0, 0.97, 0.85), 0.6) * craters * 2.2;
                vec3 dark = sky * 0.75 + moonTint * 0.02;
                float edge = 1.0 - smoothstep(0.93, 1.0, sqrt(r2));
                sky = mix(sky, mix(dark, lit, shade), edge * moonPower * horizonMask);
            }
        }

        vec3 lightDir = normalize(mix(moonDir, sunDir, sunUp));
        vec3 litColor = mix(vec3(1.0, 0.96, 0.88), sunTint, 0.25 + 0.55 * twilight) * (0.15 * max(daylight, twilight) + 0.8 * sunPower) + skyHorizon * 0.45 + moonTint * moonPower * night * 0.08;
        vec3 shadeColor = mix(litColor * vec3(0.8, 0.8, 0.95), zenith, 0.25);
        vec4 clouds = paintedClouds(dir, lightDir, litColor, shadeColor, paintBands);
        sky = mix(sky, clouds.rgb, clouds.a);

        skyOutput(skyFinish(sky, y, env));
    }
`;

export default {
    id: "painted",
    order: 10,
    fields: [
        { name: "bands", type: "range", min: 0, max: 8, step: 1, default: 5 },
        { name: "brush", type: "range", min: 0, max: 2, step: 0.1, default: 1 },
    ],

    createDome() {
        return new SkyDome({
            name: "PaintedSkyShader",
            uniforms: { paintBands: { value: 5 }, brushStrength: { value: 1 } },
            fragmentShader,
        });
    },

    light(state) {
        state.ambientIntensity *= 1.15;
        state.shadowIntensity *= 0.85;
        state.shadowSoftness = 1.8;
        state.grade.saturation *= 1.12;
        state.grade.contrast *= 0.94;
        state.grade.nightTint.setRGB(0.85, 0.8, 1.9);
        state.fogColor.lerp(state.skyHorizon, 0.25);
    },

    apply(dome, state, { options }) {
        const uniforms = dome.material.uniforms;
        uniforms.paintBands.value = Number(options.bands);
        uniforms.brushStrength.value = Number(options.brush);
    },
};
