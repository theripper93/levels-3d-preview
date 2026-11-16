import { AddEquation, CustomBlending, HalfFloatType, Matrix4, NearestFilter, OneFactor, RGFormat, ShaderMaterial, SrcColorFactor, Vector2, WebGLRenderTarget, ZeroFactor } from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { getQuality } from "../vfx/quality.js";
import { frame } from "./frame.js";

const MAX_SAMPLES = 16;
const RADIUS = 0.6;
const STRENGTH = 6;
const AO_TINT = [1, 0.96, 0.82];
const FADE_DISTANCE = 150;
const SKY_DEPTH = 0.99999;

const vertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const occlusionShader = `
uniform sampler2D tDepth;
uniform mat4 projectionInverse;
uniform vec2 projectionScale;
uniform float radius;
uniform float strength;
uniform float fadeDistance;
uniform int samples;
varying vec2 vUv;

ivec2 depthSize;

vec3 viewPosition(vec2 uv, float depth) {
    vec4 view = projectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
    return view.xyz / view.w;
}

vec3 viewAtTexel(ivec2 texel) {
    texel = clamp(texel, ivec2(0), depthSize - 1);
    return viewPosition((vec2(texel) + 0.5) / vec2(depthSize), texelFetch(tDepth, texel, 0).r);
}

vec3 viewAt(vec2 uv) {
    return viewAtTexel(ivec2(uv * vec2(depthSize)));
}

vec3 closest(vec3 a, vec3 b) {
    return (abs(a.z) < abs(b.z) && dot(a, a) > 0.0) || dot(b, b) == 0.0 ? a : b;
}

void main() {
    depthSize = textureSize(tDepth, 0);
    ivec2 texel = ivec2(vUv * vec2(depthSize));
    float depth = texelFetch(tDepth, texel, 0).r;
    if (depth >= ${SKY_DEPTH}) {
        gl_FragColor = vec4(1.0, 60000.0, 0.0, 1.0);
        return;
    }
    vec3 position = viewPosition((vec2(texel) + 0.5) / vec2(depthSize), depth);
    ivec2 dx = ivec2(1, 0);
    ivec2 dy = ivec2(0, 1);
    vec3 tangent = closest(viewAtTexel(texel + dx) - position, position - viewAtTexel(texel - dx));
    vec3 bitangent = closest(viewAtTexel(texel + dy) - position, position - viewAtTexel(texel - dy));
    vec3 normal = normalize(cross(tangent, bitangent));
    float viewDistance = -position.z;
    float fade = 1.0 - smoothstep(fadeDistance * 0.5, fadeDistance, viewDistance);
    vec2 disk = radius * projectionScale * 0.5 / viewDistance;
    disk *= min(1.0, 0.2 / disk.y);
    float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float angle = noise * 6.2831853;
    float radius2 = radius * radius;
    float bias = viewDistance * 0.001 + radius * 0.1;
    float occlusion = 0.0;
    for (int i = 0; i < ${MAX_SAMPLES}; i++) {
        if (i >= samples) break;
        float t = (float(i) + noise) / float(samples);
        float a = angle + float(i) * 2.3999632;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * disk * t;
        vec3 offset = viewAt(uv) - position;
        float length2 = dot(offset, offset);
        occlusion += max((dot(offset, normal) - bias) * inversesqrt(length2 + 1e-10) - 0.2, 0.0) * max(1.0 - length2 / radius2, 0.0);
    }
    float ao = 1.0 - clamp(occlusion / float(samples) * strength * fade, 0.0, 1.0);
    gl_FragColor = vec4(ao, viewDistance, 0.0, 1.0);
}
`;

const blurShader = `
uniform sampler2D tAO;
uniform vec2 direction;
uniform float tolerance;
varying vec2 vUv;

void main() {
    vec2 center = textureLod(tAO, vUv, 0.0).rg;
    float total = center.r;
    float weights = 1.0;
    float limit = max(tolerance, center.g * 0.01);
    for (int i = -3; i <= 3; i++) {
        if (i == 0) continue;
        vec2 neighbour = textureLod(tAO, vUv + direction * float(i), 0.0).rg;
        float weight = exp(-float(i * i) * 0.125) * max(1.0 - abs(neighbour.g - center.g) / limit, 0.0);
        total += neighbour.r * weight;
        weights += weight;
    }
    gl_FragColor = vec4(total / weights, center.g, 0.0, 1.0);
}
`;

const compositeShader = `
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2 aoSize;
uniform vec2 nearFar;
uniform float tolerance;
varying vec2 vUv;

void main() {
    float depth = textureLod(tDepth, vUv, 0.0).r;
    if (depth >= ${SKY_DEPTH}) {
        gl_FragColor = vec4(1.0);
        return;
    }
    float viewDistance = nearFar.x * nearFar.y / (nearFar.y - depth * (nearFar.y - nearFar.x));
    vec2 position = vUv * aoSize - 0.5;
    vec2 base = floor(position);
    vec2 f = position - base;
    float limit = max(tolerance, viewDistance * 0.01);
    float total = 0.0;
    float weights = 0.0;
    for (int i = 0; i < 4; i++) {
        vec2 corner = vec2(float(i - (i / 2) * 2), float(i / 2));
        vec2 sampleAO = textureLod(tAO, (base + corner + 0.5) / aoSize, 0.0).rg;
        vec2 bilinear = mix(1.0 - f, f, corner);
        float weight = bilinear.x * bilinear.y * (max(1.0 - abs(sampleAO.g - viewDistance) / limit, 0.0) + 0.001);
        total += sampleAO.r * weight;
        weights += weight;
    }
    gl_FragColor = vec4(1.0 - (1.0 - total / weights) * vec3(${AO_TINT.map((value) => value.toFixed(2)).join(", ")}), 1.0);
}
`;

function createTarget() {
    return new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGFormat, depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter });
}

function material(fragmentShader, uniforms, options = {}) {
    return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false, ...options });
}

export class AOPass extends Pass {
    constructor(parent) {
        super();
        this.parent = parent;
        this.needsSwap = false;
        this.aoTarget = createTarget();
        this.blurTarget = createTarget();
        this.aoSize = new Vector2(1, 1);
        this.occlusion = material(occlusionShader, {
            tDepth: { value: null },
            projectionInverse: { value: new Matrix4() },
            projectionScale: { value: new Vector2() },
            radius: { value: 0.06 },
            strength: { value: STRENGTH },
            fadeDistance: { value: 15 },
            samples: { value: 8 },
        });
        this.blur = material(blurShader, { tAO: { value: null }, direction: { value: new Vector2() }, tolerance: { value: 0.03 } });
        this.composite = material(
            compositeShader,
            { tAO: { value: null }, tDepth: { value: null }, aoSize: { value: this.aoSize }, nearFar: { value: new Vector2() }, tolerance: { value: 0.03 } },
            { blending: CustomBlending, blendEquation: AddEquation, blendSrc: ZeroFactor, blendDst: SrcColorFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor },
        );
        this.fsQuad = new FullScreenQuad(this.occlusion);
    }

    setSize(width, height) {
        this.aoSize.set(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
        this.aoTarget.setSize(this.aoSize.x, this.aoSize.y);
        this.blurTarget.setSize(this.aoSize.x, this.aoSize.y);    }

    updateUniforms(depthTexture) {
        const camera = this.parent.camera;
        const grid = (canvas.dimensions?.size ?? 100) / this.parent.factor;
        const radius = grid * RADIUS;
        const occlusion = this.occlusion.uniforms;
        occlusion.tDepth.value = depthTexture;
        occlusion.projectionInverse.value.copy(camera.projectionMatrixInverse);
        occlusion.projectionScale.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
        occlusion.radius.value = radius;
        occlusion.strength.value = STRENGTH;
        occlusion.fadeDistance.value = grid * FADE_DISTANCE;
        occlusion.samples.value = Math.min(getQuality().ao || 0, MAX_SAMPLES);
        this.blur.uniforms.tolerance.value = radius * 0.5;
        const composite = this.composite.uniforms;
        composite.tAO.value = this.aoTarget.texture;
        composite.tDepth.value = depthTexture;
        composite.nearFar.value.set(camera.near, camera.far);
        composite.tolerance.value = radius * 0.5;
    }

    draw(renderer, material, target) {
        this.fsQuad.material = material;
        renderer.setRenderTarget(target);
        this.fsQuad.render(renderer);
    }

    render(renderer, writeBuffer, readBuffer) {
        const depthTexture = frame.depthTexture;
        if (!depthTexture || !getQuality().ao) return;
        this.updateUniforms(depthTexture);
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        try {
            this.draw(renderer, this.occlusion, this.aoTarget);
            const blur = this.blur.uniforms;
            blur.tAO.value = this.aoTarget.texture;
            blur.direction.value.set(1 / this.aoSize.x, 0);
            this.draw(renderer, this.blur, this.blurTarget);
            blur.tAO.value = this.blurTarget.texture;
            blur.direction.value.set(0, 1 / this.aoSize.y);
            this.draw(renderer, this.blur, this.aoTarget);
            this.draw(renderer, this.composite, readBuffer);
        } finally {
            renderer.autoClear = autoClear;
        }
    }

    dispose() {
        this.aoTarget.dispose();
        this.blurTarget.dispose();
        this.occlusion.dispose();
        this.blur.dispose();
        this.composite.dispose();
        this.fsQuad.dispose();
    }
}

export function createAOPass(parent) {
    const enabled = !!getQuality().ao;
    frame.needsDepth = enabled;
    return enabled ? new AOPass(parent) : null;
}
