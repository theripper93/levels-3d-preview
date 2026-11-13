import { NoBlending, PlaneGeometry, ShaderMaterial } from "three";
import { InstancePool, PooledEffect } from "./instancePool.js";
import { sceneUniforms } from "./sceneBuffer.js";

const vertexShader = `
attribute vec4 iParams;
attribute float iSeed;
varying vec2 vUv;
flat varying vec4 vParams;
flat varying vec2 vSeedSoftness;

void main() {
    mat4 localToWorld = modelMatrix * instanceMatrix;
    vec2 size = vec2(length(localToWorld[0].xyz), length(localToWorld[1].xyz));
    vUv = uv;
    vParams = iParams;
    vSeedSoftness = vec2(iSeed, 0.25 * min(size.x, size.y));
    vec4 mvPosition = viewMatrix * localToWorld * vec4(position, 1.0);
    if (iParams.w > 0.5) {
        mvPosition = viewMatrix * vec4(localToWorld[3].xyz, 1.0);
        mvPosition.xy += position.xy * size;
    }
    gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
#include <vfx_scene_pars_fragment>
varying vec2 vUv;
flat varying vec4 vParams;
flat varying vec2 vSeedSoftness;

float distortionHash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float distortionNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 blend = fract(point);
    blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(mix(distortionHash(cell), distortionHash(cell + vec2(1.0, 0.0)), blend.x), mix(distortionHash(cell + vec2(0.0, 1.0)), distortionHash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
}

void main() {
    vec2 point = vUv * 2.0 - 1.0;
    float radius = length(point);
    vec2 offset;
    if (vParams.y >= 0.0) {
        float band = clamp((radius - vParams.y) / vParams.z, -1.0, 1.0);
        offset = -point / max(radius, 0.0001) * pow(1.0 - band * band, 2.0);
    } else {
        vec2 flow = point * vParams.z + vec2(vSeedSoftness.x * 37.0, vSeedSoftness.x * 11.0 - uSceneTime * 1.6);
        offset = (vec2(distortionNoise(flow), distortionNoise(flow + 19.19)) - 0.5) * (1.0 - smoothstep(0.2, 1.0, radius));
    }
    vec2 screenUv = vfxScreenUv();
    offset *= vParams.x * vfxSoftFade(screenUv, vSeedSoftness.y);
    vec2 dx = dFdx(vUv);
    vec2 dy = dFdy(vUv);
    float determinant = dx.x * dy.y - dy.x * dx.y;
    vec2 pixels = vec2(dy.y * offset.x - dy.x * offset.y, dx.x * offset.y - dx.y * offset.x) / determinant;
    if (abs(determinant) < 1e-12 || dot(pixels, pixels) < 0.04) discard;
    vec2 uv = screenUv + pixels / uSceneResolution;
    if (vfxSceneDistance(uv) < vfxFragmentDistance()) uv = screenUv;
    gl_FragColor = vec4(vfxSceneColor(uv).rgb, 1.0);
}
`;

let distortionPool = null;

export function attachDistortion() {
    distortionPool?.destroy();
    const material = new ShaderMaterial({ uniforms: { ...sceneUniforms }, vertexShader, fragmentShader, blending: NoBlending, depthWrite: false, toneMapped: false });
    distortionPool = new InstancePool(new PlaneGeometry(1, 1), material, { iParams: 4, iSeed: 1 }, "distortion");
    return distortionPool;
}

export class Distortion extends PooledEffect {
    constructor({ position, size = 1, strength = 0.02, mode = "haze", frequency = 3, width = 0.25, radius = null, billboard = true, ...lifetime } = {}) {
        super(distortionPool, lifetime);
        this.strength = strength;
        this.mode = mode;
        this.frequency = frequency;
        this.width = width;
        this.radius = radius;
        this.billboard = billboard;
        this.seed = Math.random();
        if (position) this.position.copy(position);
        this.scale.set(size.x ?? size, size.y ?? size, 1);
    }

    static shockwave(options) {
        return new Distortion({ mode: "ring", life: 0.6, strength: 0.08, ...options });
    }

    write(attributes, index) {
        const ring = this.mode === "ring";
        const animated = ring && this.radius === null;
        const progress = this.progress;
        const radius = animated ? (1 - (1 - progress) ** 2) * (1 - this.width) : this.radius;
        const strength = this.strength * this.envelope * (animated ? 1 - progress : 1);
        attributes.iParams.setXYZW(index, strength, ring ? radius : -1, ring ? this.width : this.frequency, this.billboard ? 1 : 0);
        attributes.iSeed.setX(index, this.seed);
    }
}
