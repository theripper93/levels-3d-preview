export const SKY_UNIFORMS = /* glsl */ `
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
        uniform float edgeBlend;
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
`;

export const SKY_NOISE = /* glsl */ `
        const float PI2 = 6.28318530718;
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

        vec2 cubeCell(vec3 dir, out float face) {
            vec3 a = abs(dir);
            if (a.x > a.y && a.x > a.z) {
                face = 1.0 + sign(dir.x);
                return dir.yz / a.x;
            }
            if (a.y > a.z) {
                face = 4.0 + sign(dir.y);
                return dir.xz / a.y;
            }
            face = 7.0 + sign(dir.z);
            return dir.xy / a.z;
        }

        vec3 skyBasisRight(vec3 axis) {
            vec3 helper = abs(axis.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            return normalize(cross(helper, axis));
        }
`;

export const SKY_NOISE3 = /* glsl */ `
        const mat3 OCTAVE3 = mat3(0.0, 1.6, 1.2, -1.6, 0.72, -0.96, -1.2, -0.96, 1.28);

        float hash13(vec3 p) {
            p = fract(p * 0.1031);
            p += dot(p, p.zyx + 31.32);
            return fract((p.x + p.y) * p.z);
        }

        float valueNoise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            vec3 u = f * f * (3.0 - 2.0 * f);
            float a = mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x);
            float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x);
            float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x);
            float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x);
            return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
        }

        float fbm2v(vec3 p) {
            return 0.66 * valueNoise3(p) + 0.34 * valueNoise3(OCTAVE3 * p + 5.3);
        }

        float fbm3v(vec3 p) {
            return (0.5 * valueNoise3(p) + 0.25 * valueNoise3(OCTAVE3 * p + vec3(3.1, 1.7, 2.3)) + 0.125 * valueNoise3(OCTAVE3 * OCTAVE3 * p + vec3(8.2, 4.5, 6.1))) / 0.875;
        }
`;

export const SKY_STARS = /* glsl */ `
        float starLayer(vec3 dir, float cells, float chance, float seed) {
            vec3 a = abs(dir);
            float footprint = min(cells * length(fwidth(dir)) / max(a.x, max(a.y, a.z)), 0.25);
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
            float radius = max(0.04, footprint * 0.9);
            float energy = (0.04 * 0.04) / (radius * radius);
            float magnitude = pow(hash12(id + 21.3), 6.0) * 4.0 + 0.25;
            float twinkle = 0.75 + 0.25 * sin(time * (1.3 + 3.0 * pick / chance) + pick * 91.0);
            return smoothstep(radius, radius * 0.25, dist) * energy * magnitude * twinkle;
        }
`;

export const SKY_CLOUDS = /* glsl */ `
        const float CLOUD_PLANET = 8.0;
        const float CLOUD_FREQUENCY = 14.0;

        vec4 realisticClouds(vec3 dir, vec3 sunDir, vec3 moonDir, vec3 sunTint, vec3 moonTint, float sunUp, float sunPower, float moonPower, float lit, float towardSun, float afterglow) {
            float y = dir.y;
            if (cloudsEnabled < 0.5 || cloudAlpha <= 0.001 || y <= -0.05) return vec4(0.0);
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
            if (density <= 0.001) return vec4(0.0);

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
            return vec4(cloud, alpha);
        }
`;

export const SKY_FINISH = /* glsl */ `
        vec3 skyFinish(vec3 sky, float y, float env) {
            float up = max(y, 0.0);
            float horizonMask = smoothstep(-0.01, 0.02, y);
            sky += vec3(0.55, 0.6, 0.75) * flash * 0.35 * horizonMask;
            sky = mix(sky, skyHorizon, haze * pow(1.0 - up, 10.0) * 0.6);
            float fogAmount = clamp(fogDensity, 0.0, 1.0);
            float fogBand = 1.0 - smoothstep(-0.02, mix(0.06, 0.3, fogAmount), y);
            sky = mix(sky, fogColor, fogAmount * fogBand);
            sky *= 1.0 - 0.3 * (1.0 - env) * smoothstep(0.0, 0.3, -y);
            sky = mix(sky, fogColor, edgeBlend * (1.0 - env) * (1.0 - smoothstep(-0.01, 0.05, y)));
            if (env > 0.5) sky = min(sky, vec3(environmentClamp));
            return max(sky, vec3(0.0));
        }

        void skyOutput(vec3 sky) {
            gl_FragColor = vec4(sky, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
`;

export const SKY_BODIES = /* glsl */ `
        #define MAX_SKY_BODIES 4
        uniform int bodyCount;
        uniform vec4 bodyDirection[MAX_SKY_BODIES];
        uniform vec4 bodyColor[MAX_SKY_BODIES];
        uniform vec4 bodyShape[MAX_SKY_BODIES];
        uniform vec4 bodyLight[MAX_SKY_BODIES];

        vec3 bodyLocal(vec3 dir, vec3 axis, float radius) {
            vec3 right = skyBasisRight(axis);
            vec3 upAxis = cross(axis, right);
            vec2 local = vec2(dot(dir, right), dot(dir, upAxis)) / radius;
            return vec3(local, dot(dir, axis));
        }

        float bodyPhaseShade(vec2 local, float r2, float phase, float softness) {
            vec3 normal = vec3(local, sqrt(max(1.0 - r2, 0.0)));
            float angle = phase * PI2;
            vec3 light = vec3(sin(angle), 0.0, -cos(angle));
            return smoothstep(-softness, softness * 2.0, dot(normal, light));
        }

        float bodyLitShade(vec2 local, float r2, vec3 lightLocal, float softness) {
            vec3 normal = vec3(local, sqrt(max(1.0 - r2, 0.0)));
            return smoothstep(-softness, softness * 2.0, dot(normal, normalize(lightLocal)));
        }

        vec4 skyBody(vec3 dir, int i, float env) {
            vec4 direction = bodyDirection[i];
            vec4 color = bodyColor[i];
            vec4 shape = bodyShape[i];
            vec4 lighting = bodyLight[i];
            vec3 axis = normalize(direction.xyz);
            float radius = max(direction.w, 1e-4);
            float mu = dot(dir, axis);
            float glow = color.w * pow(max(mu, 0.0), clamp(1.5 / (radius * radius), 40.0, 6000.0)) + color.w * 0.03 * pow(max(mu, 0.0), 16.0);
            vec3 local = bodyLocal(dir, axis, radius);
            float seed = shape.w * 17.0;
            float ring = shape.z;
            float ringReach = ring > 0.0 ? ring : 1.0;
            vec4 result = vec4(color.rgb * glow * (shape.y < 0.5 ? 1.0 : 0.15), 0.0);
            if (local.z <= 0.0 || dot(local.xy, local.xy) > ringReach * ringReach * 1.2) return result;
            float r2 = dot(local.xy, local.xy);
            float edge = 1.0 - smoothstep(0.9, 1.0, sqrt(r2));
            vec3 surface = color.rgb;
            float kind = shape.y;
            if (kind < 0.5) {
                surface *= (1.0 - 0.35 * r2) * mix(24.0, 3.0, env);
            } else {
                float shade = shape.x < 0.0 ? bodyLitShade(local.xy, r2, lighting.xyz, 0.08) : bodyPhaseShade(local.xy, r2, shape.x, 0.06);
                if (kind < 1.5) {
                    surface *= 0.72 + 0.28 * valueNoise(local.xy * 2.6 + 11.0 + seed) - 0.12 * valueNoise(local.xy * 6.0 + 3.0 + seed);
                } else {
                    float bands = sin(local.y * 9.0 + 2.5 * fbm2(local.xy * vec2(1.5, 5.0) + seed));
                    surface *= 0.75 + 0.25 * bands;
                }
                surface = surface * (shade * lighting.w + 0.04);
            }
            result.rgb = mix(result.rgb, surface, edge);
            result.a = edge;
            if (ring > 0.0) {
                float tilt = 0.28;
                vec2 ringUv = vec2(local.x, local.y / tilt);
                float ringR = length(ringUv);
                float band = smoothstep(1.3, 1.4, ringR) * (1.0 - smoothstep(ring - 0.15, ring, ringR));
                float grooves = valueNoise(vec2(ringR * 22.0, seed)) * 0.6 + valueNoise(vec2(ringR * 70.0, seed + 4.0)) * 0.4;
                band *= smoothstep(0.25, 0.75, grooves) * (1.0 - 0.6 * smoothstep(ring * 0.75, ring, ringR));
                bool behind = local.y > 0.0 && r2 < 1.0;
                if (!behind && band > 0.0) {
                    vec3 ringColor = color.rgb * mix(vec3(0.9, 0.85, 0.8), vec3(0.6, 0.6, 0.65), grooves) * 0.55 * lighting.w;
                    result.rgb = mix(result.rgb, ringColor, band * 0.7);
                    result.a = max(result.a, band * 0.7);
                }
            }
            return result;
        }

        vec4 skyBodies(vec3 dir, float env) {
            vec4 total = vec4(0.0);
            for (int i = 0; i < MAX_SKY_BODIES; i++) {
                if (i >= bodyCount) break;
                vec4 body = skyBody(dir, i, env);
                total.rgb = total.rgb * (1.0 - body.a) + body.rgb;
                total.a = 1.0 - (1.0 - total.a) * (1.0 - body.a);
            }
            return total;
        }
`;

export const SKY_SPACE = /* glsl */ `
        ${SKY_NOISE3}

        float starPoints(vec3 dir, float cells, float chance, float seed, float twinkleAmount) {
            vec3 a = abs(dir);
            float footprint = min(cells * length(fwidth(dir)) / max(a.x, max(a.y, a.z)), 0.25);
            float face;
            vec2 grid = cubeCell(dir, face) * cells;
            vec2 id = floor(grid) + face * 157.0 + seed;
            float pick = hash12(id);
            if (pick > chance) return 0.0;
            vec2 center = 0.2 + 0.6 * vec2(hash12(id + 3.7), hash12(id + 9.1));
            float dist = length(fract(grid) - center);
            float radius = max(0.035, footprint * 0.9);
            float energy = (0.035 * 0.035) / (radius * radius);
            float magnitude = pow(hash12(id + 21.3), 7.0) * 5.0 + 0.2;
            float twinkle = 1.0 - twinkleAmount * (0.5 + 0.5 * sin(time * (1.3 + 3.0 * pick / chance) + pick * 91.0));
            return smoothstep(radius, radius * 0.2, dist) * energy * magnitude * twinkle;
        }

        vec3 starColor(vec3 dir, float seed) {
            float t = hash12(floor(dir.xz * 300.0 + dir.y * 97.0) + seed);
            return t < 0.5 ? mix(vec3(0.7, 0.8, 1.0), vec3(1.0), t * 2.0) : mix(vec3(1.0), vec3(1.0, 0.82, 0.62), t * 2.0 - 1.0);
        }

        vec3 milkyWay(vec3 dir, vec3 normal, vec3 core, vec3 tint, float strength) {
            vec3 right = skyBasisRight(normal);
            vec3 forward = cross(normal, right);
            vec3 band = vec3(dot(dir, right), dot(dir, forward), dot(dir, normal));
            float angle = atan(band.y, band.x);
            float width = 0.16 + 0.06 * sin(angle * 2.0 + 1.3);
            float profile = exp(-band.z * band.z / (width * width));
            if (profile < 0.01) return vec3(0.0);
            vec3 p = vec3(band.xy * 3.0, band.z * 9.0);
            float cloud = fbm3v(p * 1.7 + 4.0);
            float dust = smoothstep(0.45, 0.8, fbm3v(p * vec3(2.2, 2.2, 3.5) + 9.0)) * exp(-band.z * band.z / (width * width * 0.18));
            float bulge = pow(max(cos(angle - 0.6), 0.0), 3.0);
            vec3 color = mix(tint, core, bulge);
            return color * profile * (0.35 + 0.9 * cloud + 0.8 * bulge * profile) * (1.0 - 0.85 * dust) * strength;
        }

        vec3 nebula(vec3 dir, vec3 colorA, vec3 colorB, float strength, float seed) {
            if (strength <= 0.0) return vec3(0.0);
            vec3 q = dir * 2.2 + seed;
            float a = fbm2v(q);
            float b = fbm2v(q * 1.3 + 7.0);
            float shape = smoothstep(0.45, 0.85, a * 0.6 + b * 0.5);
            return mix(colorA, colorB, b) * shape * shape * strength;
        }
`;

export const SKY_AURORA = /* glsl */ `
        vec3 auroraLayer(vec3 dir, vec3 colorLow, vec3 colorHigh, float strength, float speed) {
            if (dir.y < -0.02 || strength <= 0.0) return vec3(0.0);
            float t = time * speed;
            vec2 ring = vec2(dir.x, -dir.z) / max(length(dir.xz), 1e-4);
            float elevation = asin(clamp(dir.y, -1.0, 1.0));
            float north = 0.15 + 0.85 * smoothstep(-0.5, 0.6, ring.y);
            vec3 total = vec3(0.0);
            for (int i = 0; i < 3; i++) {
                float k = float(i);
                vec2 seed = vec2(k * 17.3 + 2.0, k * 5.1 + 9.0);
                float base = 0.15 + 0.12 * k + 0.3 * (fbm2(ring * 1.9 + seed + vec2(t * 0.004, -t * 0.003)) - 0.5);
                float height = elevation - base;
                if (height < -0.04) continue;
                float cover = smoothstep(0.36, 0.6, fbm2(ring * 0.8 + seed * 1.7 + vec2(-t * 0.002, t * 0.0015)));
                if (cover <= 0.0) continue;
                float angle = t * (0.004 + 0.002 * k);
                vec2 slide = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * ring;
                float coarse = valueNoise(slide * (11.0 + 4.0 * k) + seed);
                float fine = valueNoise(slide * (37.0 + 9.0 * k) + seed * 2.3 + vec2(0.0, t * 0.02));
                float fold = 0.3 + 0.9 * valueNoise(slide * 4.5 + seed * 3.1 + vec2(t * 0.006, 0.0));
                float streak = coarse * 0.6 + fine * 0.4;
                float rays = 0.12 + 1.5 * streak * streak;
                float rise = max(height, 0.0);
                float reach = 0.6 + 0.8 * coarse;
                float edge = smoothstep(-0.025, 0.006, height);
                float low = exp(-rise / (0.08 * reach)) * (0.75 + 0.5 * exp(-rise / 0.012));
                float high = exp(-rise / (0.22 * reach)) * smoothstep(0.015, 0.18, rise);
                vec3 curtain = colorLow * low + colorHigh * high * 0.6;
                total += curtain * rays * fold * edge * cover * (1.0 - 0.22 * k);
            }
            total += colorLow * 0.035 * exp(-max(elevation, 0.0) * 7.0);
            float fade = smoothstep(-0.01, 0.06, elevation) * (1.0 - smoothstep(0.9, 1.4, elevation));
            return total * north * fade * strength * 0.34;
        }
`;

export const SKY_PAINTED = /* glsl */ `
        float paintBand(float value, float bands, float softness) {
            if (bands < 1.5) return value;
            float scaled = value * bands;
            float base = floor(scaled);
            return (base + smoothstep(0.5 - softness, 0.5 + softness, scaled - base)) / bands;
        }

        float brushNoise(vec2 p) {
            return fbm2(p * vec2(1.0, 7.0)) * 0.6 + fbm2(p * vec2(3.0, 15.0) + 4.1) * 0.4;
        }

        float paintedCloudShape(vec2 p) {
            float base = fbm3(p * 0.5);
            float puffs = 1.0 - abs(valueNoise(p * 1.6 + 3.0) * 2.0 - 1.0);
            return base * 0.62 + puffs * 0.26 + valueNoise(p * 4.5 + 1.7) * 0.12;
        }

        vec4 paintedClouds(vec3 dir, vec3 lightDir, vec3 litColor, vec3 shadeColor, float bands) {
            float y = dir.y;
            if (cloudsEnabled < 0.5 || cloudAlpha <= 0.001 || y <= -0.03) return vec4(0.0);
            float t = sqrt(64.0 * y * y + 17.0) - 8.0 * y;
            vec2 layer = dir.xz * t * 0.125;
            float motion = time * cloudSpeed;
            vec2 p = (layer + cloudDrift + vec2(0.004, 0.0015) * motion) * 16.0 * cloudScale * vec2(0.75, 1.0);
            float shape = paintedCloudShape(p);
            float threshold = mix(0.68, 0.3, clamp(cloudCover, 0.0, 1.0));
            float density = smoothstep(threshold, threshold + 0.035, shape);
            if (density <= 0.001) return vec4(0.0);
            vec2 toward = normalize(lightDir.xz + vec2(1e-4));
            float lightSample = paintedCloudShape(p + toward * 0.3);
            float lit = clamp(0.45 + (shape - lightSample) * 9.0 + 0.15 * lightDir.y - 0.35 * smoothstep(threshold, threshold + 0.25, shape), 0.0, 1.0);
            lit = paintBand(lit, max(bands * 0.5, 2.0), 0.1);
            float inner = smoothstep(threshold + 0.05, threshold + 0.3, shape);
            vec3 cloud = mix(shadeColor, litColor, lit);
            float rim = density * (1.0 - smoothstep(threshold + 0.02, threshold + 0.08, shape));
            cloud = mix(cloud, litColor * 1.15, rim * 0.6 * max(dot(dir, lightDir), 0.2));
            cloud *= 0.94 + 0.12 * brushNoise(p * 0.8);
            cloud = mix(cloud, cloud * mix(1.0, 0.4, clamp(cloudDarkness, 0.0, 1.0)), inner);
            cloud *= cloudTint;
            cloud += vec3(0.8, 0.85, 1.0) * flash * (0.6 + inner);
            float alpha = density * clamp(cloudAlpha + 0.2, 0.0, 1.0) * smoothstep(-0.02, 0.16, y);
            alpha *= 0.85 + 0.15 * brushNoise(p * 1.3 + 7.0);
            return vec4(cloud, clamp(alpha, 0.0, 1.0));
        }

        float sparkleLayer(vec3 dir, float cells, float chance, float seed) {
            float face;
            vec2 grid = cubeCell(dir, face) * cells;
            vec2 id = floor(grid) + face * 157.0 + seed;
            float pick = hash12(id);
            if (pick > chance) return 0.0;
            vec2 center = 0.25 + 0.5 * vec2(hash12(id + 3.7), hash12(id + 9.1));
            vec2 d = abs(fract(grid) - center);
            float size = 0.12 + 0.2 * hash12(id + 5.1);
            float spikes = max(1.0 - d.x / (size * 0.12) - d.y / size, 0.0) + max(1.0 - d.y / (size * 0.12) - d.x / size, 0.0);
            float dotCore = 1.0 - smoothstep(0.0, size * 0.25, length(d));
            float twinkle = 0.7 + 0.3 * sin(time * (0.8 + 2.0 * pick / chance) + pick * 71.0);
            return clamp(spikes + dotCore, 0.0, 1.5) * twinkle;
        }
`;
