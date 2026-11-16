export const propVertexHeader = /* glsl */ `
attribute vec3 aProp;
uniform float uPropCover;
uniform float uPropEnabled;
uniform float uPropUseMap;
uniform float uPropRamp;
uniform sampler2D uPropMap;
uniform vec4 uPropRect;
vec3 propScale;
float propLift = 1.0;
float propLiftSlope = 0.0;

vec3 propBent(vec3 n) {
    return vec3(n.x * propLift - (position.y + 0.14) * propLiftSlope * n.y, n.y, n.z * propLift);
}

vec2 propSurfaceTexel(ivec2 pixel, ivec2 limit) {
    return texelFetch(uPropMap, clamp(pixel, ivec2(0), limit), 0).ba;
}

vec2 propSurface(vec2 xz) {
    ivec2 size = textureSize(uPropMap, 0);
    vec2 pixel = vec2((xz.x - uPropRect.x) * uPropRect.z, 1.0 - (xz.y - uPropRect.y) * uPropRect.w) * vec2(size) - 0.5;
    ivec2 base = ivec2(floor(pixel));
    vec2 f = fract(pixel);
    ivec2 limit = size - 1;
    vec2 bottom = mix(propSurfaceTexel(base, limit), propSurfaceTexel(base + ivec2(1, 0), limit), f.x);
    vec2 top = mix(propSurfaceTexel(base + ivec2(0, 1), limit), propSurfaceTexel(base + ivec2(1, 1), limit), f.x);
    return mix(bottom, top, f.y);
}

float propGrowth() {
    vec4 origin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 surface = uPropUseMap > 0.5 ? propSurface(origin.xz) : vec2(1.0, 0.0);
    float amount = uPropCover * surface.x * uPropEnabled;
    return smoothstep(aProp.x, aProp.x + uPropRamp, amount) * (1.0 - 0.85 * smoothstep(0.4, 0.7, surface.y));
}
`;

export const moundVertexHeader = /* glsl */ `
attribute float aRim;
varying float vPropRim;
`;

export const icicleVertexHeader = /* glsl */ `
uniform float uPropViewport;
varying float vPropTip;
varying float vPropFade;
`;

export const moundScale = /* glsl */ `
    float propG = propGrowth();
    propScale = propG > 0.001 ? vec3(sqrt(propG), propG, sqrt(propG)) : vec3(0.0);
    float propEnd = position.x < 0.0 ? aProp.y : aProp.z;
    if (propEnd > 0.0) {
        float propT = clamp((1.0 - abs(position.x)) / propEnd, 0.0, 1.0);
        propLift = propT * propT * (3.0 - 2.0 * propT);
        propLiftSlope = -sign(position.x) * 6.0 * propT * (1.0 - propT) / propEnd;
    }
`;

export const moundVarying = /* glsl */ `
    vPropRim = aRim;
`;

export const icicleScale = /* glsl */ `
    float propG = propGrowth();
    propScale = propG > 0.001 ? vec3(mix(0.45, 1.0, propG), propG, mix(0.45, 1.0, propG)) : vec3(0.0);
`;

export const icicleVarying = /* glsl */ `
    vPropTip = clamp(-position.y, 0.0, 1.0);
    vec4 propView = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float propRadius = length((modelMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz) * propScale.x;
    float propPixel = (projectionMatrix[3][3] > 0.5 ? 2.0 : 2.0 * max(-propView.z, 1e-4)) / (projectionMatrix[1][1] * max(uPropViewport, 1.0));
    vPropFade = smoothstep(0.8, 2.2, 2.0 * propRadius / propPixel);
`;

export const propNormal = /* glsl */ `
    vec3 objectNormal = normalize(propBent(normal) / max(propScale, vec3(0.001)));
    #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
    #endif
`;

export const propBegin = /* glsl */ `
    vec3 transformed = position * propScale;
    transformed.y = mix(-0.14 * propScale.y, transformed.y, propLift);
    #ifdef USE_ALPHAHASH
        vPosition = vec3(position);
    #endif
`;

export const moundFragmentHeader = /* glsl */ `
uniform vec3 uPropColor;
uniform float uPropRoughness;
uniform float uPropFloor;
varying float vPropRim;
#ifdef L3D_SURFACE
SurfaceInfo propSurfaceInfo(vec3 position, vec3 worldNormal, float pixel) {
    SurfaceInfo info = surfaceInfo(position, worldNormal, pixel);
    info.exposed = 1.0;
    return info;
}
#endif
`;

export const moundNormal = /* glsl */ `
if (uPropFloor > 0.5) {
    vec3 propUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    normal = normalize(mix(normal, propUp, 0.35));
    nonPerturbedNormal = normalize(mix(nonPerturbedNormal, propUp, 0.35));
}
#define surfaceInfo propSurfaceInfo
#include <normal_fragment_maps>
#undef surfaceInfo
`;

export const moundColor = /* glsl */ `
    diffuseColor.rgb = min(uPropColor, vec3(0.8));
`;

export const moundRoughness = /* glsl */ `
    float roughnessFactor = uPropRoughness;
`;

export const moundBlend = /* glsl */ `
    #ifdef L3D_SURFACE
    {
        SurfaceInfo propInfo = propSurfaceInfo(vWorldPositionFoW, vec3(0.0, 1.0, 0.0), length(fwidth(vWorldPositionFoW.xz)));
        float propGround = max(smoothstep(0.3, 0.7, surfaceCoverAmount(propInfo)), uPropFloor * (1.0 - smoothstep(0.25, 0.95, vPropRim)));
        float propAlpha = (1.0 - smoothstep(0.7, 1.0, vPropRim)) * propGround;
        float propGrain = clamp(0.5 + 0.9 * (0.35 * propInfo.noise + 0.65 * propInfo.fine - 0.5), 0.02, 0.98);
        #ifdef USE_ALPHAHASH
        float propCut = getAlphaHashThreshold(vPosition);
        if (uPropFloor > 0.5) propCut = clamp(propGrain + 0.4 * (propCut - 0.5), 0.02, 0.98);
        if (propAlpha < propCut) discard;
        #else
        if (uPropFloor > 0.5) propAlpha = clamp((propAlpha - propGrain) / max(1.5 * fwidth(propAlpha - propGrain), 0.15) + 0.5, 0.0, 1.0);
        if (propAlpha < 0.02) discard;
        diffuseColor.a = propAlpha;
        #endif
        diffuseColor.rgb *= 1.0 - 0.25 * uPropFloor;
    }
    #endif
`;

export const icicleFragmentHeader = /* glsl */ `
varying float vPropTip;
varying float vPropFade;
`;

export const icicleColor = /* glsl */ `
    diffuseColor.a = mix(1.0, 0.75, smoothstep(0.2, 1.0, vPropTip)) * vPropFade;
`;

export const icicleRim = /* glsl */ `
    totalEmissiveRadiance += diffuseColor.rgb * 0.35 * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
`;
