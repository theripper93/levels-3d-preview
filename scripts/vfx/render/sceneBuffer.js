import { DataTexture, Matrix4, ShaderChunk, Vector2 } from "three";

export const farDepth = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
farDepth.needsUpdate = true;

export const sceneUniforms = {
    tSceneDepth: { value: farDepth },
    tSceneColor: { value: null },
    uSceneResolution: { value: new Vector2(1, 1) },
    uSceneNearFar: { value: new Vector2(0.01, 100) },
    uSceneProjectionInverse: { value: new Matrix4() },
    uSceneCameraWorld: { value: new Matrix4() },
    uSceneTime: { value: 0 },
};

ShaderChunk.vfx_scene_pars_fragment = `
uniform sampler2D tSceneDepth;
uniform sampler2D tSceneColor;
uniform vec2 uSceneResolution;
uniform vec2 uSceneNearFar;
uniform mat4 uSceneProjectionInverse;
uniform mat4 uSceneCameraWorld;
uniform float uSceneTime;

vec2 vfxScreenUv() {
    return gl_FragCoord.xy / uSceneResolution;
}

float vfxSceneDepth(vec2 uv) {
    return texture2D(tSceneDepth, uv).r;
}

float vfxLinearDepth(float depth) {
    return uSceneNearFar.x * uSceneNearFar.y / (uSceneNearFar.y - depth * (uSceneNearFar.y - uSceneNearFar.x));
}

float vfxSceneDistance(vec2 uv) {
    return vfxLinearDepth(vfxSceneDepth(uv));
}

float vfxFragmentDistance() {
    return vfxLinearDepth(gl_FragCoord.z);
}

float vfxSoftFade(vec2 uv, float fadeDistance) {
    return clamp((vfxSceneDistance(uv) - vfxFragmentDistance()) / fadeDistance, 0.0, 1.0);
}

vec3 vfxViewPosition(vec2 uv, float depth) {
    vec4 view = uSceneProjectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
    return view.xyz / view.w;
}

vec3 vfxWorldPosition(vec2 uv, float depth) {
    return (uSceneCameraWorld * vec4(vfxViewPosition(uv, depth), 1.0)).xyz;
}

vec3 vfxSurfaceNormal(vec3 worldPosition) {
    return normalize(cross(dFdx(worldPosition), dFdy(worldPosition)));
}

vec4 vfxSceneColor(vec2 uv) {
    return texture2D(tSceneColor, uv);
}
`;

ShaderChunk.vfx_fog_of_war_pars_fragment = `
float vfxFogOfWar(vec3 worldPosition) {
    vec2 limit = sceneDimensions - sceneOrigin;
    if (sceneDimensions.x == 0.0 || worldPosition.x < sceneOrigin.x || worldPosition.z < sceneOrigin.y || worldPosition.x > limit.x || worldPosition.z > limit.y) return 1.0;
    return texture2D(fogTexture, worldPosition.xz / sceneDimensions).r;
}
`;
