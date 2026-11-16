import { BackSide, BoxGeometry, Color, Mesh, ShaderMaterial, UniformsUtils, Vector2, Vector3 } from "three";

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
    constructor() {
        const shader = Sky.SkyShader;
        const material = new ShaderMaterial({
            name: "SkyShader",
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
        uniform float time;
        uniform float environmentMode;
        uniform float environmentClamp;
        uniform vec3 sunDirection;
        uniform vec3 moonDirection;
        uniform vec3 skyZenith;
        uniform vec3 skyHorizon;
        uniform vec3 skyGround;
        uniform vec3 sunColor;
        uniform vec3 moonColor;
        uniform float daylight;
        uniform float twilight;
        uniform float night;
        uniform float starVisibility;
        uniform float moonPhase;
        uniform float sunDiscSize;
        uniform float sunGlow;
        uniform float haze;
        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float flash;
        uniform float cloudsEnabled;
        uniform float cloudCover;
        uniform float cloudDensity;
        uniform float cloudDarkness;
        uniform vec3 cloudTint;
        uniform float cloudSpeed;
        uniform float cloudScale;
        uniform float cloudAlpha;
        uniform vec2 cloudDrift;

        varying vec3 vDirection;

        const float PI2 = 6.28318530718;
        const float SUN_RADIUS = 0.024;
        const float MOON_RADIUS = 0.04;
        const float CLOUD_PLANET = 8.0;
        const float CLOUD_FREQUENCY = 14.0;
        const mat2 OCTAVE = mat2(1.6, 1.2, -1.2, 1.6);

        float hash12(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }

        float valueNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        float fbm2(vec2 p) {
            return 0.66 * valueNoise(p) + 0.34 * valueNoise(OCTAVE * p + 5.3);
        }

        float fbm3(vec2 p) {
            float sum = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 3; i++) {
                sum += amplitude * valueNoise(p);
                p = OCTAVE * p + vec2(3.1, 1.7);
                amplitude *= 0.5;
            }
            return sum / 0.875;
        }

        float cloudShape(vec2 p, out float coarse) {
            float sum = 0.0;
            float amplitude = 0.5;
            coarse = 0.0;
            for (int i = 0; i < 5; i++) {
                sum += amplitude * valueNoise(p);
                if (i == 2) coarse = sum / 0.875;
                p = OCTAVE * p + vec2(3.1, 1.7);
                amplitude *= 0.5;
            }
            return sum / 0.96875;
        }

        vec3 tintOf(vec3 color) {
            return color / max(max(color.r, max(color.g, color.b)), 1e-4);
        }

        float starLayer(vec3 dir, float cells, float chance, float seed) {
            vec3 a = abs(dir);
            vec2 uv;
            float face;
            if (a.x > a.y && a.x > a.z) {
                uv = dir.yz / a.x;
                face = 1.0 + sign(dir.x);
            } else if (a.y > a.z) {
                uv = dir.xz / a.y;
                face = 4.0 + sign(dir.y);
            } else {
                uv = dir.xy / a.z;
                face = 7.0 + sign(dir.z);
            }
            vec2 grid = uv * cells;
            vec2 id = floor(grid) + face * 157.0 + seed;
            float pick = hash12(id);
            if (pick > chance) return 0.0;
            vec2 center = 0.2 + 0.6 * vec2(hash12(id + 3.7), hash12(id + 9.1));
            float dist = length(fract(grid) - center);
            float footprint = min(max(fwidth(grid.x), fwidth(grid.y)), 0.25);
            float radius = max(0.04, footprint * 0.9);
            float energy = (0.04 * 0.04) / (radius * radius);
            float magnitude = pow(hash12(id + 21.3), 6.0) * 4.0 + 0.25;
            float twinkle = 0.75 + 0.25 * sin(time * (1.3 + 3.0 * pick / chance) + pick * 91.0);
            return smoothstep(radius, radius * 0.25, dist) * energy * magnitude * twinkle;
        }

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

            if (cloudsEnabled > 0.5 && cloudAlpha > 0.001 && y > -0.05) {
                float t = sqrt(CLOUD_PLANET * CLOUD_PLANET * y * y + 2.0 * CLOUD_PLANET + 1.0) - CLOUD_PLANET * y;
                vec2 layer = dir.xz * t * 0.125;
                float motion = time * cloudSpeed;
                vec2 p = (layer + cloudDrift + vec2(0.004, 0.0015) * motion) * CLOUD_FREQUENCY * cloudScale;
                vec2 warp = vec2(fbm2(p * 0.45 + vec2(0.0, 0.03 * motion)), fbm2(p * 0.45 + vec2(5.2, 1.3) - 0.02 * motion));
                p += (warp - 0.5) * 0.7;

                float coarse;
                float shape = cloudShape(p, coarse);
                float threshold = mix(0.78, 0.18, clamp(cloudCover, 0.0, 1.0));
                float overcast = clamp(cloudCover, 0.0, 1.0);
                overcast *= overcast;
                float softness = mix(0.3, 0.12, clamp(cloudDensity, 0.0, 1.0)) + 0.2 * overcast;
                float density = smoothstep(threshold, threshold + softness, shape);

                if (density > 0.001) {
                    float lightUp = sunUp;
                    vec3 lightDir = normalize(mix(moonDir, sunDir, lightUp));
                    vec3 lightColor = sunTint * sunPower + moonTint * moonPower * night * 0.07 * (0.3 + lit) * (1.0 - lightUp);
                    vec2 toward = lightDir.xz;
                    float towardLength = length(toward);
                    toward = towardLength > 1e-4 ? toward / towardLength : vec2(0.0);
                    float slant = 0.25 + 0.5 * (1.0 - clamp(lightDir.y, 0.0, 1.0));
                    float coarseLight = fbm3(p + toward * slant);
                    float shadow = smoothstep(-0.04, 0.1, coarseLight - coarse) * (1.0 - 0.7 * overcast);
                    float thickness = smoothstep(threshold, threshold + softness * 2.5, shape);
                    lightColor *= 1.0 - 0.65 * overcast;
                    float darkness = clamp(cloudDarkness, 0.0, 1.0);

                    vec3 ambient = mix(skyHorizon, skyZenith, 0.55);
                    float lowSun = clamp(twilight, 0.0, 1.0) * afterglow;
                    float direct = (1.0 - shadow) * (1.0 - 0.45 * thickness);
                    vec3 cloud = ambient * mix(0.85, 0.5, thickness) * (1.0 - 0.25 * shadow) * (1.0 - 0.5 * lowSun);
                    cloud += lightColor * mix(vec3(1.0), sunTint, lightUp) * direct * mix(0.85, 0.5, lowSun);
                    cloud += sunTint * sunTint * lowSun * (0.28 - 0.18 * shadow) * (0.35 + 0.65 * towardSun);
                    cloud *= mix(vec3(1.0), vec3(0.56, 0.63, 0.75), 0.35 * thickness * daylight * (1.0 - lowSun));
                    cloud = mix(cloud, cloud * vec3(1.3, 0.75, 0.6), lowSun * thickness * 0.5);
                    float edge = clamp(density * (1.0 - thickness) * 3.0, 0.0, 1.0);
                    float forward = pow(max(dot(dir, lightDir), 0.0), 5.0);
                    cloud += lightColor * edge * (0.25 + 2.5 * forward) * (1.0 - darkness) * (1.0 - overcast);
                    vec3 deck = mix(skyHorizon, skyZenith, 0.3) * (1.15 - 0.45 * thickness - 0.3 * shadow + 0.25 * (coarse - 0.5)) * (0.7 + 0.6 * fbm2(p * 0.22 + 0.02 * motion));
                    cloud = mix(cloud, deck, overcast * 0.85);
                    cloud *= mix(1.0, 0.3, darkness * mix(0.5, 1.0, thickness)) * cloudTint;
                    cloud += vec3(0.75, 0.82, 1.0) * flash * (1.0 + 2.0 * thickness) * (0.4 + coarse);
                    cloud = mix(cloud, skyHorizon, (1.0 - smoothstep(0.0, 0.25, y)) * mix(0.2, 0.45, haze));

                    float alpha = density * mix(0.65, 1.0, clamp(cloudDensity, 0.0, 1.0)) * clamp(cloudAlpha, 0.0, 1.0) * smoothstep(-0.02, 0.06, y);
                    sky = mix(sky, cloud, alpha);
                }
            }

            sky += vec3(0.55, 0.6, 0.75) * flash * 0.35 * horizonMask;
            sky = mix(sky, skyHorizon, haze * pow(1.0 - up, 10.0) * 0.6);
            float fogAmount = clamp(fogDensity, 0.0, 1.0);
            float fogBand = 1.0 - smoothstep(-0.02, mix(0.06, 0.3, fogAmount), y);
            sky = mix(sky, fogColor, fogAmount * fogBand);
            sky *= 1.0 - 0.3 * (1.0 - env) * smoothstep(0.0, 0.3, -y);

            if (env > 0.5) sky = min(sky, vec3(environmentClamp));

            gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);

            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }`,
};

export { Sky };
