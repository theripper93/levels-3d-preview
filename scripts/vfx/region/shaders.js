export const regionPars = `
uniform sampler2D uField;
uniform vec4 uFieldRect;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uStyle;
uniform vec4 uState;
uniform vec3 uOrigin;
uniform vec4 uParams;
uniform vec4 uShape;
uniform vec4 uFog;
uniform float uGlow;
uniform float uGain;
uniform float uTime;

float rfHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float rfNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(rfHash(i), rfHash(i + vec2(1.0, 0.0)), u.x), mix(rfHash(i + vec2(0.0, 1.0)), rfHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float rfFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * rfNoise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        amplitude *= 0.5;
    }
    return value;
}

vec2 rfVoronoi(vec2 p, float motion) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(rfHash(i + g), rfHash(i + g + 19.7));
            o = 0.5 + 0.42 * sin(motion + 6.2831 * o);
            float d = length(g + o - f);
            if (d < d1) {
                d2 = d1;
                d1 = d;
            } else if (d < d2) d2 = d;
        }
    }
    return vec2(d1, d2 - d1);
}

float regionDistance(vec2 xz) {
    vec2 uv = (xz - uFieldRect.xy) / uFieldRect.zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
    return texture2D(uField, uv).r;
}

float regionPattern(vec2 xz, float d, float depthIn) {
    int style = int(uStyle + 0.5);
    float result = 0.0;
    vec2 p = xz * uParams.z;
    float t = uTime * uParams.w;
    vec2 toOrigin = xz - uOrigin.xy;
    float r = length(toOrigin);
    float angle = atan(toOrigin.y, toOrigin.x);
    if (style == 1) {
        float n = rfFbm(p * 0.8 + vec2(t * 0.3, -t * 1.2));
        float f = rfFbm(p * 1.9 - vec2(t * 0.5, t * 1.8));
        float tongues = smoothstep(0.3, 0.0, depthIn - n * 0.4);
        result = 0.12 + 0.88 * smoothstep(0.3, 0.8, n * f * 2.2 + tongues * 0.35);
    } else if (style == 2) {
        vec2 v = rfVoronoi(p * 0.9, 0.0);
        vec2 w = rfVoronoi(p * 2.3 + 7.0, 0.0);
        float cracks = 1.0 - smoothstep(0.0, 0.05, v.y);
        float fine = 1.0 - smoothstep(0.0, 0.035, w.y);
        float shimmer = 0.5 + 0.5 * sin(t * 2.0 + rfHash(floor(p * 0.9)) * 6.2831);
        result = clamp(0.22 + 0.25 * rfFbm(p * 2.0) + cracks * (0.6 + 0.3 * shimmer) + fine * 0.3, 0.0, 1.0);
    } else if (style == 3) {
        vec2 v = rfVoronoi(p * 1.1 + vec2(0.0, t * 0.15), t * 1.5);
        float rim = smoothstep(0.045, 0.0, abs(v.x - 0.28));
        result = clamp(0.25 + 0.35 * rfFbm(p * 0.7 + t * 0.2) + rim * 0.75, 0.0, 1.0);
    } else if (style == 4) {
        float flicker = step(0.4, rfNoise(vec2(t * 9.0, 3.1)));
        float a = abs(rfFbm(p * 0.6 + vec2(floor(t * 6.0) * 1.7, 0.0)) - 0.5);
        float b = abs(rfFbm(p * 1.1 - vec2(0.0, floor(t * 8.0) * 2.3)) - 0.5);
        float bolts = smoothstep(0.025, 0.0, a) + smoothstep(0.02, 0.0, b) * 0.6;
        result = clamp(0.12 + bolts * (0.5 + 0.7 * flicker) + 0.15 * rfFbm(p * 0.5 + t), 0.0, 1.0);
    } else if (style == 5) {
        float waves = pow(0.5 + 0.5 * sin(r * uParams.z * 2.2 - t * 4.0), 8.0);
        float wobble = rfFbm(p * 0.8 + t * 0.2);
        result = clamp(0.16 + waves * (0.45 + 0.5 * wobble) + 0.2 * wobble, 0.0, 1.0);
    } else if (style == 6) {
        float n = rfFbm(p * 0.45 + vec2(t * 0.15, -t * 0.1));
        float m = rfFbm(p * 1.1 - vec2(t * 0.12, t * 0.07) + n * 1.5);
        result = clamp(smoothstep(0.25, 0.85, n * 0.7 + m * 0.6) * 0.85 + 0.15, 0.0, 1.0);
    } else if (style == 7) {
        float rays = pow(0.5 + 0.5 * sin(angle * 14.0 + rfFbm(vec2(angle * 3.0, t * 0.4)) * 5.0), 5.0);
        vec2 cell = floor(p * 2.5);
        float sparkle = step(0.93, rfHash(cell)) * pow(0.5 + 0.5 * sin(t * 4.0 + rfHash(cell + 3.0) * 6.2831), 6.0) * smoothstep(0.35, 0.0, length(fract(p * 2.5) - 0.5));
        result = clamp(0.25 + rays * 0.35 * (0.75 + 0.25 * sin(t * 2.0)) + sparkle + 0.2 * (1.0 - depthIn), 0.0, 1.0);
    } else if (style == 8) {
        float rn = r / max(uOrigin.z, 0.001);
        float rings = smoothstep(0.012, 0.0, abs(fract(rn * 4.0) - 0.5) - 0.47);
        float spin = angle / 6.2831 * 36.0 + t * (mod(floor(rn * 4.0), 2.0) * 2.0 - 1.0);
        float ticks = step(0.55, fract(spin)) * smoothstep(0.16, 0.1, abs(fract(rn * 4.0) - 0.5) - 0.28);
        float runes = step(0.45, rfHash(vec2(floor(spin), floor(rn * 4.0)))) * ticks;
        result = clamp(0.18 + rings * 0.7 + runes * 0.6 + 0.15 * rfFbm(p * 0.6 + t * 0.3), 0.0, 1.0);
    } else if (style == 9) {
        float spokes = 14.0;
        float a = angle / 6.2831 * spokes + rfNoise(vec2(r * 30.0, 1.0)) * 0.15;
        float spoke = smoothstep(0.004, 0.0, abs(fract(a) - 0.5) * 6.2831 / spokes * r - 0.0015);
        float ringPhase = r * uParams.z * 0.9 + rfNoise(vec2(angle * 4.0, 2.0)) * 0.3;
        float ring = smoothstep(0.06, 0.0, abs(fract(ringPhase) - 0.5) - 0.44);
        result = clamp((spoke + ring * 0.8) * 0.9 + 0.05, 0.0, 1.0);
    } else if (style == 10) {
        float stems = 1.0 - abs(rfFbm(p * 0.55 + rfFbm(p * 0.3) * 1.5) * 2.0 - 1.0);
        float leaves = step(0.7, rfNoise(p * 3.0)) * smoothstep(0.75, 0.9, stems);
        result = clamp(smoothstep(0.82, 0.96, stems) + leaves * 0.6 + 0.12 * rfFbm(p * 2.0), 0.0, 1.0);
    } else if (style == 11) {
        vec2 q = vec2(p.x * 0.8 + p.y * 0.6, p.y * 0.8 - p.x * 0.6);
        float streak = smoothstep(0.62, 0.95, rfNoise(vec2(q.x * 0.35 - t * 2.5, q.y * 3.5)));
        float swirl = rfFbm(q * 0.5 - vec2(t * 0.6, 0.0));
        result = clamp(0.1 + streak * 0.75 + swirl * 0.2, 0.0, 1.0);
    } else if (style == 12) {
        vec2 v = rfVoronoi(p * 0.9 + rfFbm(p * 0.4 + t * 0.1), t * 1.2);
        float caustic = smoothstep(0.12, 0.0, v.y);
        result = clamp(0.3 + caustic * 0.6 + 0.2 * rfFbm(p * 0.5 - t * 0.1), 0.0, 1.0);
    } else if (style == 13) {
        vec2 v = rfVoronoi(p * 0.7, 0.0);
        float cracks = 1.0 - smoothstep(0.0, 0.04, v.y);
        result = clamp(0.15 + cracks * 0.5 * rfFbm(p * 1.5) + 0.25 * rfFbm(p * 2.0 + t * 0.05), 0.0, 1.0);
    } else if (style == 14) {
        vec2 h = p * 1.2;
        vec2 a = mod(h, vec2(1.0, 1.732)) - vec2(0.5, 0.866);
        vec2 b = mod(h - vec2(0.5, 0.866), vec2(1.0, 1.732)) - vec2(0.5, 0.866);
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        vec2 q = abs(g);
        float hex = 0.5 - max(dot(q, vec2(0.866, 0.5)), q.y);
        float cellId = rfHash(floor((h - g) * 2.0));
        float wave = pow(0.5 + 0.5 * sin(r * uParams.z * 1.5 - t * 3.0 + cellId * 2.0), 6.0);
        result = clamp(0.15 + smoothstep(0.06, 0.0, hex) * (0.55 + 0.45 * wave) + wave * 0.25 * step(0.6, cellId), 0.0, 1.0);
    } else {
        result = 0.35 + 0.2 * rfFbm(p * 0.35 + t * 0.15);
    }
    return result;
}

float regionLifecycle(vec2 xz, inout float flash) {
    float rn = length(xz - uOrigin.xy) / max(uOrigin.z, 0.001);
    float wave = uState.y * 1.2;
    float reveal = smoothstep(wave, wave - 0.15, rn);
    flash += exp(-abs(rn - wave) * 40.0) * (1.0 - uState.y) * uShape.w;
    float n = rfNoise(xz * 45.0) * 0.7 + rfNoise(xz * 9.0) * 0.3;
    float presence = smoothstep(n - 0.04, n + 0.04, uState.x * 1.1);
    flash += smoothstep(0.1, 0.0, abs(uState.x * 1.1 - n)) * step(uState.x, 0.999) * 0.8;
    return reveal * presence;
}

vec4 regionSurface(vec2 xz, float d, float facing) {
    float inside = 1.0 - smoothstep(-0.0015, 0.0015, d);
    float depthIn = clamp(-d / max(uShape.x, 0.01), 0.0, 1.0);
    float preview = uState.z;
    float sweep = pow(0.5 + 0.5 * sin(length(xz - uOrigin.xy) * 40.0 - uTime * 3.0), 12.0);
    float pattern = preview > 0.5 ? 0.3 + 0.5 * sweep : regionPattern(xz, d, depthIn);
    float level = smoothstep(0.25, 0.75, facing);
    float fill = inside * (0.4 + 0.6 * pattern) * uParams.x * mix(0.3, 1.0, level) * mix(1.0, 0.4, preview);
    float wobble = (rfNoise(xz * 70.0 + vec2(uTime * 1.5, -uTime)) - 0.5) * 0.004 * (1.0 - preview);
    float e = abs(d + wobble);
    float line = exp(-e / max(uParams.y * 0.35, 0.0001));
    float halo = inside * exp(d / max(uParams.y * 3.0, 0.0001)) * 0.3;
    float pulse = 0.85 + 0.15 * sin(uTime * 2.5 - length(xz - uOrigin.xy) * 25.0);
    float edge = clamp((line + halo) * mix(pulse, 1.0, preview), 0.0, 1.0) * mix(0.6, 1.0, level);
    float flash = 0.0;
    float life = regionLifecycle(xz, flash);
    fill *= life * uState.w;
    edge = (edge * life + flash * (inside + line)) * uState.w;
    vec3 fillColor = mix(uColorB * (1.0 - 0.35 * uGlow), uColorA, pattern * pattern * mix(1.0, pattern, uGlow));
    vec3 edgeColor = mix(uColorA, vec3(1.0), 0.25);
    vec3 color = fillColor * fill * (0.6 + uGlow * (1.8 * pattern * pattern * pattern - 0.25)) + edgeColor * edge * (0.5 + 0.5 * uGlow);
    float alpha = clamp(fill * (1.0 + uGlow * 0.15) + edge * 0.45, 0.0, 1.0);
    return vec4(color * uGain, alpha);
}
`;

export const groundFragment = `
${regionPars}
vec4 projectionColor(vec3 world, vec3 local, vec3 normal, float facing) {
    float d = regionDistance(world.xz);
    if (d > 0.05) return vec4(0.0);
    vec4 color = regionSurface(world.xz, d, facing);
    return color * smoothstep(0.0, 0.08, 0.5 - abs(local.y)) * vfxFogOfWar(world);
}
`;

export const flatVertex = `
varying vec3 vRegionWorld;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vRegionWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const flatFragment = `
#include <common>
#include <vfx_fog_of_war_pars_fragment>
${regionPars}
varying vec3 vRegionWorld;
void main() {
    float d = regionDistance(vRegionWorld.xz);
    if (d > 0.05) discard;
    gl_FragColor = regionSurface(vRegionWorld.xz, d, 1.0) * vfxFogOfWar(vRegionWorld);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export const shellVertex = `
varying vec3 vRegionWorld;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
varying float vWorldNormalY;
void main() {
    vWorldNormalY = normalize(mat3(modelMatrix) * normal).y;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vRegionWorld = world.xyz;
    vec4 view = viewMatrix * world;
    vViewPosition = view.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * view;
}
`;

export const shellFragment = `
#include <common>
#include <vfx_scene_pars_fragment>
#include <vfx_fog_of_war_pars_fragment>
${regionPars}
uniform vec3 uShell;
varying vec3 vRegionWorld;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
varying float vWorldNormalY;
void main() {
    vec3 viewDir = normalize(-vViewPosition);
    float facing = abs(dot(normalize(vViewNormal), viewDir));
    float side = gl_FrontFacing ? 1.0 : 0.35;
    float rim = pow(1.0 - facing, 6.0) * side;
    float sheen = pow(1.0 - facing, 3.0) * side;
    float gap = vfxSceneDistance(vfxScreenUv()) - vfxFragmentDistance();
    float contact = exp(-max(gap, 0.0) / 0.008) * step(-0.003, gap) * (1.0 - smoothstep(0.7, 0.95, abs(vWorldNormalY)));
    float soft = mix(0.5, clamp(gap / 0.03, 0.0, 1.0), uShell.z);
    vec3 q = vRegionWorld * uParams.z * 3.0;
    float drift = rfFbm(q.xz * 0.5 + vec2(q.y * 0.7 - uTime * uParams.w * 0.6, uTime * 0.1));
    float veins = smoothstep(0.08, 0.0, abs(drift - 0.5)) * 0.8 + drift * 0.4;
    float flash = 0.0;
    float life = regionLifecycle(vRegionWorld.xz, flash);
    float glow = ((rim * 0.9 + sheen * veins * 0.2) * uShell.x * soft + contact * 1.4 * uShell.y * uShell.z) * life + flash * 0.5 * (rim + sheen + contact * uShell.z);
    glow *= uState.w * mix(1.0, 0.6, uState.z) * vfxFogOfWar(vRegionWorld);
    vec3 color = mix(uColorB, mix(uColorA, vec3(1.0), 0.35), clamp(contact + rim * 0.6, 0.0, 1.0));
    gl_FragColor = vec4(color * glow * (0.7 + uGlow) * uGain, clamp(glow * 0.5, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export const fogVertex = `
varying vec3 vRegionWorld;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vRegionWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const fogFragment = `
#include <common>
#include <vfx_scene_pars_fragment>
${regionPars}
varying vec3 vRegionWorld;
void main() {
    vec3 origin = cameraPosition;
    vec3 direction = normalize(vRegionWorld - origin);
    vec3 boxMin = vec3(uFieldRect.x, uShape.y, uFieldRect.y);
    vec3 boxMax = vec3(uFieldRect.x + uFieldRect.z, uShape.z, uFieldRect.y + uFieldRect.w);
    vec3 invDirection = 1.0 / direction;
    vec3 t0 = (boxMin - origin) * invDirection;
    vec3 t1 = (boxMax - origin) * invDirection;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);
    float near = max(max(max(tMin.x, tMin.y), tMin.z), 0.0);
    float far = min(min(tMax.x, tMax.y), tMax.z);
    vec2 uv = vfxScreenUv();
    vec3 surface = vfxWorldPosition(uv, vfxSceneDepth(uv));
    if (uFog.w > 0.5) far = min(far, dot(surface - origin, direction));
    if (far <= near) discard;
    float stepLength = (far - near) / 8.0;
    float jitter = rfHash(gl_FragCoord.xy + fract(uTime));
    float height = max(uShape.z - uShape.y, 0.001);
    float density = 0.0;
    float lightness = 0.0;
    for (int i = 0; i < 8; i++) {
        vec3 p = origin + direction * (near + stepLength * (float(i) + jitter));
        float d = regionDistance(p.xz);
        float footprint = 1.0 - smoothstep(-uFog.y, 0.0, d);
        float h = clamp((p.y - uShape.y) / height, 0.0, 1.0);
        float layer = 1.0 - smoothstep(0.2, 1.0, h);
        float n = rfFbm(p.xz * 9.0 + vec2(p.y * 6.0 + uTime * 0.08, -uTime * 0.05));
        float amount = footprint * layer * smoothstep(0.15, 0.75, n * 0.8 + layer * 0.35);
        float flash = 0.0;
        amount *= regionLifecycle(p.xz, flash);
        density += amount;
        lightness += amount * n;
    }
    float alpha = 1.0 - exp(-density * stepLength * uFog.x * uState.w);
    vec3 color = mix(uColorB, uColorA, clamp(lightness / max(density, 0.0001), 0.0, 1.0)) * uFog.z;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
