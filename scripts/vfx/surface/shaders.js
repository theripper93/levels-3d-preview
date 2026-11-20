export const surfaceParsFragment = /* glsl */ `
#ifdef L3D_SURFACE
uniform sampler2D uSurfaceMap;
uniform vec4 uSurfaceRect;
uniform vec2 uSurfaceY;
uniform float uSurfaceTexel;
uniform float uSurfaceSquare;
uniform float uSurfaceCover;
uniform float uSurfaceWet;
uniform float uSurfaceRain;
uniform float uSurfaceTime;
uniform vec3 uSurfaceColor;
uniform float uSurfaceRoughness;
uniform float uSurfaceSparkle;
uniform float uSurfaceLumps;
uniform vec2 uSurfaceWind;
uniform float uSurfaceQuality;
uniform float uSurfaceEnabled;
uniform vec4 uSurfaceGrowth;
uniform vec4 uSurfaceAmount;
uniform vec4 uSurfaceShape;
uniform vec4 uSurfaceDetail;
uniform vec4 uSurfaceStyle;
uniform vec3 uSurfaceAmbient;
uniform vec3 uSurfaceSky;

float surfaceRelief = 0.0;
float surfaceEnvSpec = 1.0;
float surfaceEnvDesat = 0.0;

struct SurfaceInfo {
    vec3 position;
    vec3 normal;
    vec2 uv;
    vec2 s;
    vec2 wind;
    vec2 warp;
    float windStrength;
    float pixel;
    float inside;
    float rect;
    float fade;
    float exposed;
    float mask;
    float shelterEdge;
    float melt;
    float slush;
    float trail;
    vec2 trailSlope;
    float up;
    float lead;
    float bank;
    float lee;
    float contact;
    float noise;
    vec2 slope;
    vec2 lumps;
    float macro;
    float mid;
    float fine;
    float fineFade;
    float detail;
    float foliage;
    float baseRoughness;
    float cover;
    float spread;
    float wet;
    float puddle;
    float glint;
    float envSpec;
};

float surfaceLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float surfaceHash(vec2 p) {
    uvec2 q = uvec2(ivec2(floor(p)) + 32768);
    uint h = (q.x * 1597334677u) ^ (q.y * 3812015801u);
    h = h * 747796405u + 2891336453u;
    h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
    h = (h >> 22u) ^ h;
    return float(h) / 4294967295.0;
}

vec3 surfaceNoiseD(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = surfaceHash(i);
    float b = surfaceHash(i + vec2(1.0, 0.0));
    float c = surfaceHash(i + vec2(0.0, 1.0));
    float d = surfaceHash(i + vec2(1.0, 1.0));
    float k = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * vec2(b - a + k * u.y, c - a + k * u.x));
}

vec2 surfaceGradient(vec2 cell) {
    float h = surfaceHash(cell);
    return (vec2(h, fract(h * 64.0)) - 0.5) * 2.45;
}

vec3 surfaceGradientD(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    vec2 ga = surfaceGradient(i);
    vec2 gb = surfaceGradient(i + vec2(1.0, 0.0));
    vec2 gc = surfaceGradient(i + vec2(0.0, 1.0));
    vec2 gd = surfaceGradient(i + vec2(1.0, 1.0));
    float va = dot(ga, f);
    float vb = dot(gb, f - vec2(1.0, 0.0));
    float vc = dot(gc, f - vec2(0.0, 1.0));
    float vd = dot(gd, f - vec2(1.0, 1.0));
    float k = va - vb - vc + vd;
    vec2 d = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * k + vec2(vb, vc) - va);
    return vec3(0.5 + va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k, d);
}

float surfaceFade(float pixel, float scale) {
    return 1.0 - smoothstep(0.3, 0.9, pixel / scale);
}

float surfaceSmoothSlope(float a, float b, float x) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return 6.0 * t * (1.0 - t) / (b - a);
}

vec2 surfaceUv(vec2 xz) {
    return vec2((xz.x - uSurfaceRect.x) * uSurfaceRect.z, 1.0 - (xz.y - uSurfaceRect.y) * uSurfaceRect.w);
}

float surfaceHeight(vec4 texel) {
    return uSurfaceY.x + (texel.r * 65280.0 + texel.g * 255.0) / 65535.0 * uSurfaceY.y;
}

vec4 surfaceFetch(ivec2 pixel, ivec2 size) {
    return texelFetch(uSurfaceMap, clamp(pixel, ivec2(0), size - 1), 0);
}

float surfaceRoofAbove(vec2 xz, float y) {
    return surfaceHeight(textureLod(uSurfaceMap, surfaceUv(xz), 0.0)) - y;
}

float surfaceOpen(float above, float eps) {
    return 1.0 - smoothstep(eps, eps * 2.0, above);
}

void surfaceSheltering(inout SurfaceInfo info) {
    ivec2 size = textureSize(uSurfaceMap, 0);
    vec2 xz = info.position.xz + info.warp * uSurfaceSquare;
    float y = info.position.y;
    float normalY = max(info.normal.y, 0.2);
    float slope = min(sqrt(max(1.0 - normalY * normalY, 0.0)) / normalY, 3.0);
    float texel = max(uSurfaceTexel, 1e-4);
    vec2 pixel = surfaceUv(xz) * vec2(size) - 0.5;
    vec2 base = floor(pixel);
    vec2 f = pixel - base;
    vec2 g = f * f * (3.0 - 2.0 * f);
    vec2 dg = 6.0 * f * (1.0 - f);
    ivec2 b = ivec2(base);
    vec4 t00 = surfaceFetch(b, size);
    vec4 t10 = surfaceFetch(b + ivec2(1, 0), size);
    vec4 t01 = surfaceFetch(b + ivec2(0, 1), size);
    vec4 t11 = surfaceFetch(b + ivec2(1, 1), size);
    vec4 above = vec4(surfaceHeight(t00), surfaceHeight(t10), surfaceHeight(t01), surfaceHeight(t11)) - y;
    float cap = uSurfaceSquare * 0.15;
    vec4 weights = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
    vec4 near = clamp(above, -cap, cap);
    vec4 deviation = near - dot(near, weights);
    float spread = min(2.0 * sqrt(dot(weights, deviation * deviation)), cap);
    float eps = texel + (length(info.warp) * uSurfaceSquare + texel * 2.0) * slope + spread;
    info.exposed = mix(mix(surfaceOpen(above.x, eps), surfaceOpen(above.y, eps), f.x), mix(surfaceOpen(above.z, eps), surfaceOpen(above.w, eps), f.x), f.y);
    vec2 mixed = mix(mix(t00.ba, t10.ba, g.x), mix(t01.ba, t11.ba, g.x), g.y);
    info.mask = mixed.x;
    info.trail = mixed.y;
    float dx = mix(t10.a - t00.a, t11.a - t01.a, g.y) * dg.x;
    float dy = mix(t01.a - t00.a, t11.a - t10.a, g.x) * dg.y;
    info.trailSlope = vec2(dx, -dy) * (uSurfaceSquare / max(uSurfaceTexel, 1e-5));
    info.shelterEdge = 1.0 - step(0.02, min(min(t00.b, t10.b), min(t01.b, t11.b)));
    if (info.shelterEdge < 0.5) {
        float heat = 1.0 - info.mask;
        info.melt = smoothstep(0.4, 0.5, heat);
        info.slush = smoothstep(0.18, 0.4, heat) * (1.0 - info.melt);
    }
    if (uSurfaceQuality < 1.5) return;
    vec2 r = vec2(min(eps * 1.2, texel * 1.5));
    vec2 t = vec2(-r.y, r.x);
    float tolerance = eps * 2.5;
    vec4 taps = vec4(surfaceRoofAbove(xz + r, y), surfaceRoofAbove(xz - r, y), surfaceRoofAbove(xz + t, y), surfaceRoofAbove(xz - t, y));
    float soft = max(tolerance, 0.75 * max(abs(taps.x - taps.y), abs(taps.z - taps.w)));
    vec4 open = 1.0 - smoothstep(vec4(tolerance), vec4(tolerance + soft), taps);
    info.exposed = (info.exposed * 4.0 + dot(open, vec4(1.0))) / 8.0;
    float square = uSurfaceSquare;
    float reach = square * 0.4;
    float low = square * 0.15;
    float high = square * 0.5;
    float down = smoothstep(low, high, surfaceRoofAbove(xz + info.wind * reach, y));
    float upwind = smoothstep(low, high, surfaceRoofAbove(xz - info.wind * reach, y));
    float sides = 0.0;
    if (uSurfaceQuality > 2.5) {
        vec2 side = vec2(-info.wind.y, info.wind.x) * reach;
        sides = max(smoothstep(low, high, surfaceRoofAbove(xz + side, y)), smoothstep(low, high, surfaceRoofAbove(xz - side, y)));
    }
    info.contact = max(max(down, upwind), sides);
    float drift = 0.5 + uSurfaceShape.w;
    info.bank = (0.08 * down * info.windStrength + 0.04 * info.contact * (1.0 - info.windStrength)) * drift;
    info.lee = upwind * info.windStrength * (0.6 + 0.4 * uSurfaceShape.w);
}

void surfaceField(inout SurfaceInfo info) {
    vec2 s = info.s;
    float stretch = mix(1.0, 0.5, smoothstep(0.5, 1.0, uSurfaceShape.w));
    vec2 across = vec2(-info.wind.y, info.wind.x);
    vec2 d = vec2(dot(s, info.wind) * stretch, dot(s, across));
    vec3 o1 = surfaceNoiseD(d / 3.0);
    mat2 turn2 = mat2(0.8, 0.6, -0.6, 0.8);
    mat2 turn3 = mat2(0.28, -0.96, 0.96, 0.28);
    vec2 p2 = turn2 * d / 0.5 + vec2(17.0, 0.0);
    vec3 o2 = uSurfaceQuality > 1.5 ? surfaceGradientD(p2) : surfaceNoiseD(p2);
    info.fineFade = uSurfaceQuality > 1.5 ? surfaceFade(info.pixel, 0.08) : 0.0;
    vec3 o3 = info.fineFade > 0.0 ? surfaceGradientD(turn3 * d / 0.08 + vec2(41.0, 0.0)) : vec3(0.5, 0.0, 0.0);
    float gradientScale = uSurfaceQuality > 1.5 ? 0.62 : 1.0;
    o2.yz = o2.yz * turn2 * gradientScale;
    o3.yz = o3.yz * turn3 * 0.62;
    info.fine = mix(0.5, o3.x, info.fineFade);
    info.noise = 0.45 * o1.x + 0.3 * o2.x + 0.25 * info.fine;
    vec2 g = o1.yz * (0.45 / 3.0) + o2.yz * (0.3 / 0.5) + o3.yz * (0.25 / 0.08) * info.fineFade;
    info.slope = info.wind * g.x * stretch + across * g.y;
    vec2 l = o1.yz / 3.0 + o2.yz * (0.12 / 0.5) * surfaceFade(info.pixel, 0.5);
    info.lumps = info.wind * l.x * stretch + across * l.y;
    info.macro = o1.x;
    info.mid = o2.x;
    float relief = surfaceRelief * (1.0 - info.lead);
    info.detail = 1.0 + relief;
    info.noise -= clamp(relief, -0.6, 0.6) * uSurfaceShape.z * 0.07;
}

SurfaceInfo surfaceInfo(vec3 position, vec3 worldNormal, float pixel) {
    SurfaceInfo info;
    float square = max(uSurfaceSquare, 1e-4);
    info.position = position;
    info.normal = worldNormal;
    info.uv = surfaceUv(position.xz);
    info.s = position.xz / square;
    float windLength = length(uSurfaceWind);
    info.wind = windLength > 1e-3 ? uSurfaceWind / windLength : vec2(0.70710678);
    info.windStrength = clamp(windLength, 0.0, 1.0);
    info.pixel = pixel / square;
    vec3 jitter = surfaceNoiseD(info.s / 0.75 + vec2(61.0, 13.0));
    info.warp = jitter.yz * 0.15;
    float warpLength = length(info.warp);
    if (warpLength > 0.25) info.warp *= 0.25 / warpLength;
    vec2 outside2 = max(-info.uv, info.uv - 1.0) / uSurfaceRect.zw;
    float outside = max(outside2.x, outside2.y) / square;
    info.rect = step(outside, 0.0);
    info.inside = info.rect;
    info.fade = (1.0 - smoothstep(-0.2, 0.0, outside + (jitter.x - 0.5) * 0.3)) * info.rect;
    info.exposed = 0.0;
    info.mask = 0.0;
    info.shelterEdge = 0.0;
    info.melt = 0.0;
    info.slush = 0.0;
    info.trail = 0.0;
    info.trailSlope = vec2(0.0);
    info.bank = 0.0;
    info.lee = 0.0;
    info.contact = 0.0;
    info.lead = smoothstep(0.1, 0.6, (position.y - max(uSurfaceY.x, 0.0)) / square);
    info.up = smoothstep(mix(0.55, 0.2, info.lead), mix(0.9, 0.5, info.lead), worldNormal.y);
    info.noise = 0.5;
    info.slope = vec2(0.0);
    info.lumps = vec2(0.0);
    info.macro = 0.5;
    info.mid = 0.5;
    info.fine = 0.5;
    info.fineFade = 0.0;
    info.detail = 1.0;
    info.foliage = 0.0;
    info.baseRoughness = 1.0;
    info.cover = 0.0;
    info.spread = 0.0;
    info.wet = 0.0;
    info.puddle = 0.0;
    info.glint = 0.0;
    info.envSpec = 1.0;
    if (info.inside > 0.5) {
        surfaceSheltering(info);
        surfaceField(info);
    }
    return info;
}

SurfaceInfo surfaceInfo(vec3 position, vec3 worldNormal) {
    return surfaceInfo(position, worldNormal, length(fwidth(position.xz)));
}

float surfaceCoverAmount(inout SurfaceInfo info) {
    if (uSurfaceCover <= 0.0 || info.inside < 0.5) return 0.0;
    float threshold = mix(uSurfaceGrowth.x, uSurfaceGrowth.z, info.lead);
    float fullness = mix(uSurfaceGrowth.y, uSurfaceGrowth.w, info.lead);
    float area = mix(uSurfaceAmount.x, uSurfaceAmount.y, info.lead);
    float field = info.noise + info.bank - info.lee * 0.25;
    float band = max(uSurfaceStyle.z, uSurfaceQuality > 1.5 ? 0.0 : 0.04);
    info.spread = smoothstep(threshold - band, threshold + band, field);
    float into = clamp((field - threshold) / 0.12, 0.0, 1.0);
    float dusting = mix(0.12, 0.45, smoothstep(0.05, 0.35, uSurfaceCover));
    float patches = info.spread * mix(dusting, 1.0, clamp(fullness * (0.5 + 2.0 * into), 0.0, 1.0));
    float film = clamp(area * (0.85 + (info.noise - 0.5) * 1.6 + info.bank * 2.5), 0.0, 1.0);
    float amount = mix(patches, film, uSurfaceShape.y) * uSurfaceShape.x;
    float pitch = mix(1.0, mix(0.6, 1.0, smoothstep(0.574, 0.819, info.normal.y)), info.lead);
    float foliage = mix(1.0, uSurfaceStyle.y, info.foliage);
    float gate = info.shelterEdge > 0.5 ? info.mask : 1.0 - info.melt;
    float trail = smoothstep(0.4, 0.7, info.trail) * mix(0.95, 0.45, smoothstep(0.35, 0.6, uSurfaceCover));
    return amount * pitch * foliage * info.up * info.exposed * gate * info.fade * (1.0 - trail);
}

float surfaceHeatWet(SurfaceInfo info) {
    if (uSurfaceCover <= 0.0 || info.shelterEdge > 0.5) return 0.0;
    return max(info.melt, info.slush * 0.6) * info.exposed * info.fade * info.up;
}

float surfaceWetAmount(SurfaceInfo info) {
    if (info.inside < 0.5) return 0.0;
    float heatWet = surfaceHeatWet(info);
    if (uSurfaceWet <= 0.0) return heatWet;
    float exposure = mix(0.15, 1.0, info.exposed * info.mask);
    return max(uSurfaceWet * exposure * info.fade * (0.55 + 0.45 * info.up), heatWet);
}

float surfaceFoliage(vec3 albedo, float lead) {
    float green = (albedo.g - max(albedo.r, albedo.b)) / max(albedo.g, 0.02);
    float foliage = smoothstep(0.08, 0.3, green);
    #ifdef USE_ALPHATEST
    return foliage;
    #else
    return foliage * lead;
    #endif
}

void surfaceBend(inout vec3 viewNormal, vec2 tilt) {
    viewNormal = normalize(viewNormal + (viewMatrix * vec4(tilt.x, 0.0, tilt.y, 0.0)).xyz);
}

void surfaceApplyCover(inout SurfaceInfo info, inout vec3 albedo, inout float roughness, inout float metalness, inout vec3 viewNormal, vec3 viewGeometryNormal) {
    info.baseRoughness = roughness;
    info.foliage = surfaceFoliage(albedo, info.lead);
    info.cover = surfaceCoverAmount(info);
    float threshold = mix(uSurfaceGrowth.x, uSurfaceGrowth.z, info.lead);
    float field = info.noise + info.bank - info.lee * 0.25;
    float margin = smoothstep(threshold - 0.1, threshold - 0.02, field) * (1.0 - info.spread) * uSurfaceDetail.w * clamp(uSurfaceAmount.x * 4.0, 0.0, 1.0) * info.up * info.exposed * (1.0 - uSurfaceShape.y);
    albedo *= 1.0 - 0.15 * margin;
    if (info.cover <= 0.0) return;
    float hole = 0.0;
    float rim = 0.0;
    if (uSurfaceAmount.z < 1.0) {
        float broad = surfaceNoiseD(info.s / 5.0 + vec2(29.0, 3.0)).x;
        float paved = 1.0 - smoothstep(0.6, 0.85, info.baseRoughness);
        float bias = (1.0 - smoothstep(0.6, 0.8, uSurfaceAmount.z)) * (0.08 * paved - 0.12 * info.contact - 0.15 * (1.0 - info.exposed));
        float holeField = 0.6 * (1.0 - broad) + 0.3 * (1.0 - info.mid) + 0.1 * (1.0 - info.fine) + bias;
        hole = smoothstep(uSurfaceAmount.z - 0.02, uSurfaceAmount.z + 0.02, holeField);
        rim = smoothstep(uSurfaceAmount.z - 0.07, uSurfaceAmount.z - 0.015, holeField) * (1.0 - hole);
        info.cover *= 1.0 - hole;
    }
    float depth = clamp(info.cover * 1.4 - 0.4, 0.0, 1.0);
    float thick = smoothstep(0.4, 0.6, depth);
    vec3 color = uSurfaceColor;
    color *= mix(1.0, clamp(info.detail, 0.5, 1.5), uSurfaceDetail.x);
    color *= 1.0 + 0.12 * (info.macro - 0.5);
    color *= 1.0 + uSurfaceDetail.y * smoothstep(0.66, 0.86, info.fine) * info.fineFade;
    color *= 1.0 - 0.07 * info.contact;
    color *= 1.0 - 0.4 * max(rim, info.slush);
    color = min(color, vec3(0.8));
    vec3 tinted = albedo * uSurfaceColor / max(surfaceLuminance(uSurfaceColor), 0.05);
    color = mix(color, min(tinted, vec3(0.8)), uSurfaceStyle.x);
    albedo = mix(albedo, vec3(surfaceLuminance(albedo)), info.cover * uSurfaceShape.y * 0.8 * (1.0 - uSurfaceStyle.x));
    albedo = mix(albedo, color, info.cover);
    float coverRoughness = mix(max(uSurfaceRoughness, 0.9), uSurfaceRoughness, thick);
    coverRoughness = mix(coverRoughness, 0.4, rim);
    roughness = max(mix(roughness, coverRoughness, info.cover), roughness + 0.15 * info.cover * uSurfaceShape.y * (1.0 - uSurfaceLumps));
    roughness = min(roughness, 1.0);
    metalness *= 1.0 - info.cover;
    info.envSpec = mix(1.0, 0.3, clamp(info.cover / max(uSurfaceShape.x, 0.1), 0.0, 1.0));
    if (uSurfaceQuality < 1.5) return;
    float solid = 1.0 - uSurfaceShape.y;
    viewNormal = normalize(mix(viewNormal, viewGeometryNormal, info.cover * 0.9 * solid));
    vec2 tilt = -info.lumps * uSurfaceLumps * 0.9 * depth;
    float edge = info.spread * (1.0 - info.spread) * 4.0 * solid * info.cover;
    float slopeLength = length(info.slope);
    if (slopeLength > 1e-4) tilt -= info.slope / slopeLength * 0.45 * edge;
    if (uSurfaceDetail.z > 0.0) {
        float warp = surfaceNoiseD(info.s / 0.6 + vec2(23.0, 7.0)).x;
        float phase = (dot(info.s, info.wind) / 0.08 + 1.5 * warp) * 6.2831853;
        float fade = 1.0 - smoothstep(0.15, 0.4, info.pixel / 0.08);
        tilt += info.wind * cos(phase) * 0.11 * uSurfaceDetail.z * depth * fade;
    }
    surfaceBend(viewNormal, tilt * info.up);
    if (uSurfaceQuality < 2.5 || uSurfaceSparkle <= 0.0) return;
    vec2 cell = floor(info.s / 0.035);
    float pick = surfaceHash(cell + vec2(91.0, 37.0));
    float fade = surfaceFade(info.pixel, 0.035);
    if (pick < 0.035 * uSurfaceSparkle && fade > 0.0 && depth > 0.5) {
        vec2 jitter = vec2(surfaceHash(cell + vec2(13.0, 3.0)), surfaceHash(cell + vec2(5.0, 71.0))) - 0.5;
        vec2 local = fract(info.s / 0.035) - 0.5 - jitter * 0.4;
        info.glint = fade * depth * (1.0 - smoothstep(0.1, 0.22, length(local)));
        surfaceBend(viewNormal, jitter * 0.5 * info.glint);
        roughness = mix(roughness, 0.3, info.glint);
        info.envSpec = mix(info.envSpec, 1.0, info.glint);
    }
}

float surfaceRipples(SurfaceInfo info, out vec2 tilt) {
    tilt = vec2(0.0);
    float strength = 0.0;
    float rate = sqrt(clamp(uSurfaceRain * 3.0, 0.0, 1.0));
    for (int layer = 0; layer < 2; layer++) {
        float shift = float(layer);
        vec2 grid = info.s / 0.5 + shift * vec2(0.5, 0.37);
        vec2 cell = floor(grid);
        vec2 local = grid - cell;
        float seed = surfaceHash(cell + vec2(7.0 + shift * 31.0, 3.0));
        float clock = uSurfaceTime * (0.8 + 0.4 * seed) + seed;
        float cycle = floor(clock);
        float life = clock - cycle;
        vec2 key = cell + vec2(cycle * 1.37, cycle * 0.71 + shift * 11.0);
        if (surfaceHash(key) > rate * 0.85 + 0.1) continue;
        vec2 center = 0.3 + 0.4 * vec2(surfaceHash(key + vec2(3.0, 0.0)), surfaceHash(key + vec2(0.0, 5.0)));
        float reach = 0.3 + 0.2 * surfaceHash(key + vec2(9.0, 9.0));
        vec2 offset = local - center;
        float span = length(offset);
        if (span < 1e-4) continue;
        vec2 dir = offset / span;
        float fade = (1.0 - life) * (1.0 - life);
        float width = 0.035;
        float x = (span - life * reach) / width;
        float ring = -2.0 * x * exp(-x * x);
        float x2 = (span - life * reach * 0.6) / width;
        ring += -1.2 * x2 * exp(-x2 * x2) * step(0.5, surfaceHash(key + vec2(2.0, 17.0)));
        tilt += dir * ring * fade * 0.35;
        strength = max(strength, abs(ring) * fade);
    }
    float zoom = surfaceFade(info.pixel, 0.03);
    tilt *= zoom;
    return clamp(strength, 0.0, 1.0) * zoom;
}

void surfaceApplyWet(inout SurfaceInfo info, inout vec3 albedo, inout float roughness, inout vec3 viewNormal, vec3 viewGeometryNormal) {
    info.wet = surfaceWetAmount(info);
    if (info.wet <= 0.0) return;
    float snow = info.cover;
    float porous = smoothstep(0.75, 0.85, info.baseRoughness) * (1.0 - snow);
    albedo *= mix(1.0, mix(0.65, 0.8, snow), info.wet);
    roughness = mix(roughness, 0.4, 0.7 * info.wet * mix(0.6, 1.0, info.up));
    roughness = max(roughness, 0.45 * info.lead * min(info.wet * 10.0, 1.0));
    info.envSpec *= mix(1.0, mix(0.5, 0.25, porous), info.wet);
    float open = smoothstep(0.965, 0.98, info.normal.y) * info.exposed * info.mask * (1.0 - snow) * info.rect * (1.0 - info.lead);
    if (open <= 0.0) return;
    vec3 n1 = surfaceNoiseD(info.s / 1.2 + vec2(5.0, 0.0));
    vec3 n2 = surfaceNoiseD(info.s / 0.45 + vec2(0.0, 9.0));
    float field = 0.65 * n1.x + 0.35 * n2.x - surfaceRelief * 0.3;
    info.puddle = smoothstep(uSurfaceAmount.w - 0.015, uSurfaceAmount.w + 0.015, field) * open;
    vec3 water = mix(albedo * 0.45, uSurfaceSky * 0.5, 0.35);
    albedo = mix(albedo, water, info.puddle);
    roughness = mix(roughness, 0.05, info.puddle);
    info.envSpec = mix(info.envSpec, 1.0, info.puddle);
    if (uSurfaceQuality < 1.5) return;
    viewNormal = normalize(mix(viewNormal, viewGeometryNormal, info.puddle));
    if (uSurfaceQuality < 2.5 || uSurfaceRain <= 0.0) return;
    vec2 tilt;
    float ring = surfaceRipples(info, tilt);
    surfaceBend(viewNormal, tilt * mix(0.06, 0.5, info.puddle) * info.wet * open);
    roughness = max(roughness, 0.15 * smoothstep(0.05, 0.3, ring) * info.puddle);
}

float surfaceGroove(float trail) {
    return smoothstep(0.4, 0.7, trail);
}

void surfaceTrail(SurfaceInfo info, inout vec3 albedo, inout float roughness, inout vec3 viewNormal) {
    float a = info.trail;
    if (a <= 0.0 || info.exposed * info.up <= 0.0) return;
    float groove = surfaceGroove(a);
    float print = smoothstep(0.76, 0.95, a);
    float pressed = groove * (0.85 + 0.15 * print) * info.exposed * info.up;
    float snowy = clamp(info.cover * 2.5, 0.0, 1.0);
    albedo = mix(albedo, albedo * vec3(0.74, 0.75, 0.78) * (1.0 - 0.08 * print), pressed * snowy);
    roughness = mix(roughness, max(roughness - 0.15, 0.45), pressed * snowy);
    albedo *= 1.0 - 0.12 * pressed * info.wet;
    if (uSurfaceQuality < 1.5) return;
    float rimSlope = surfaceSmoothSlope(0.02, 0.25, a) * (1.0 - smoothstep(0.38, 0.55, a)) - smoothstep(0.02, 0.25, a) * surfaceSmoothSlope(0.38, 0.55, a);
    float grooveSlope = surfaceSmoothSlope(0.4, 0.7, a) * (1.0 + 0.3 * print) + groove * 0.3 * surfaceSmoothSlope(0.76, 0.95, a);
    float rise = 0.4 * rimSlope - grooveSlope;
    float depth = clamp(info.cover * 1.4 - 0.4, 0.0, 1.0);
    vec2 tilt = -rise * info.trailSlope * 0.025 * max(depth, 0.3 * snowy) * info.exposed * info.up;
    float tiltLength = length(tilt);
    if (tiltLength > 0.8) tilt *= 0.8 / tiltLength;
    surfaceBend(viewNormal, tilt);
}

void surfaceSpecular(SurfaceInfo info, inout vec3 albedo, inout float metalness) {
    float cut = info.cover * (1.0 - info.glint) * (1.0 - info.puddle);
    if (cut <= 0.0 || metalness > 0.0) return;
    float depth = clamp(info.cover * 1.4 - 0.4, 0.0, 1.0);
    float keep = mix(0.0, 0.5, smoothstep(0.4, 0.6, depth));
    float scaled = -0.04 * (1.0 - keep) / max(max(albedo.r, max(albedo.g, albedo.b)) - 0.04, 0.14);
    metalness = max(scaled * cut, -0.25);
    albedo /= 1.0 - metalness;
}
#endif
`;

export const surfaceMapFragment = /* glsl */ `
#ifdef L3D_SURFACE
#ifdef L3D_SURFACE_BASIC
if (uSurfaceEnabled > 0.5) {
    vec3 surfaceNormalBasic = normalize(cross(dFdx(vWorldPositionFoW), dFdy(vWorldPositionFoW)));
    if (dot(surfaceNormalBasic, cameraPosition - vWorldPositionFoW) < 0.0) surfaceNormalBasic = -surfaceNormalBasic;
    SurfaceInfo surfaceBasic = surfaceInfo(vWorldPositionFoW, surfaceNormalBasic, length(fwidth(vWorldPositionFoW.xz)));
    if (surfaceBasic.inside > 0.5) {
        surfaceBasic.foliage = surfaceFoliage(diffuseColor.rgb, surfaceBasic.lead);
        float surfaceBasicCover = surfaceCoverAmount(surfaceBasic);
        vec3 surfaceBasicColor = min(uSurfaceColor * (1.0 + 0.12 * (surfaceBasic.macro - 0.5)), vec3(0.8));
        surfaceBasicColor = mix(surfaceBasicColor, diffuseColor.rgb * uSurfaceColor / max(surfaceLuminance(uSurfaceColor), 0.05), uSurfaceStyle.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, surfaceBasicColor * uSurfaceAmbient, surfaceBasicCover);
        diffuseColor.rgb *= 1.0 - 0.3 * surfaceWetAmount(surfaceBasic) * (1.0 - surfaceBasicCover);
    }
}
#else
#ifdef USE_MAP
if (uSurfaceEnabled > 0.5 && uSurfaceQuality > 1.5) {
    vec2 surfaceTexels = fwidth(vMapUv) * vec2(textureSize(map, 0));
    float surfaceLod = log2(max(max(surfaceTexels.x, surfaceTexels.y), 1e-3));
    float surfaceBlur = surfaceLuminance(textureLod(map, vMapUv, max(4.5, surfaceLod + 3.0)).rgb);
    float surfaceSharp = surfaceLuminance(textureLod(map, vMapUv, max(1.5, surfaceLod + 1.0)).rgb);
    surfaceRelief = clamp((surfaceSharp - surfaceBlur) / max(surfaceBlur, 0.04), -1.0, 1.0);
}
#endif
#endif
#endif
`;

export const surfaceNormalFragment = /* glsl */ `
#ifdef L3D_SURFACE
if (uSurfaceEnabled > 0.5) {
    float surfacePixel = length(fwidth(vWorldPositionFoW.xz));
    #ifdef L3D_SURFACE_BLADE
    vec3 surfaceWorldNormal = vec3(0.0, 1.0, 0.0);
    #else
    vec3 surfaceWorldNormal = normalize((vec4(nonPerturbedNormal, 0.0) * viewMatrix).xyz);
    #endif
    SurfaceInfo surface = surfaceInfo(vWorldPositionFoW, surfaceWorldNormal, surfacePixel);
    if (surface.inside > 0.5) {
        #ifdef L3D_SURFACE_BLADE
        surface.up *= smoothstep(0.0, 0.7, L3D_SURFACE_BLADE + uSurfaceCover * 0.7 - 0.1);
        #endif
        #ifdef L3D_SURFACE_FORCE_BANK
        surface.bank += 1.0;
        #endif
        #ifdef STANDARD
        float surfaceRoughness = roughnessFactor;
        float surfaceMetalness = metalnessFactor;
        #else
        float surfaceRoughness = 1.0;
        float surfaceMetalness = 0.0;
        #endif
        vec3 surfaceAlbedo = diffuseColor.rgb;
        surfaceApplyCover(surface, surfaceAlbedo, surfaceRoughness, surfaceMetalness, normal, nonPerturbedNormal);
        surfaceApplyWet(surface, surfaceAlbedo, surfaceRoughness, normal, nonPerturbedNormal);
        surfaceTrail(surface, surfaceAlbedo, surfaceRoughness, normal);
        #ifdef STANDARD
        surfaceSpecular(surface, surfaceAlbedo, surfaceMetalness);
        #endif
        diffuseColor.rgb = surfaceAlbedo;
        #ifdef STANDARD
        roughnessFactor = surfaceRoughness;
        metalnessFactor = surfaceMetalness;
        #endif
        surfaceEnvSpec = surface.envSpec;
        surfaceEnvDesat = 0.6 * clamp(surface.cover / max(uSurfaceShape.x, 0.1), 0.0, 1.0);
    }
}
#endif
`;

export const surfaceLightsFragment = /* glsl */ `
#ifdef L3D_SURFACE
#if defined( RE_IndirectDiffuse )
irradiance = mix(irradiance, vec3(surfaceLuminance(irradiance)), surfaceEnvDesat);
iblIrradiance = mix(iblIrradiance, vec3(surfaceLuminance(iblIrradiance)), surfaceEnvDesat);
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
radiance *= surfaceEnvSpec;
#endif
#endif
`;
