import { AdditiveBlending, Color, Mesh, PlaneGeometry, ShaderMaterial } from "three";
import { VFX_LAYER } from "../constants.js";
import { sceneUniforms } from "../render/sceneBuffer.js";

const vertexShader = `
uniform float uSize;
varying vec2 vUv;
flat varying vec3 vCenter;

void main() {
    vUv = uv;
    vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 clipCenter = projectionMatrix * center;
    vCenter = clipCenter.xyz / max(clipCenter.w, 0.0001);
    center.xy += position.xy * uSize;
    gl_Position = projectionMatrix * center;
}
`;

const fragmentShader = `
#include <common>
#include <vfx_scene_pars_fragment>
uniform vec3 uColor;
uniform float uIntensity;
uniform float uBias;
varying vec2 vUv;
flat varying vec3 vCenter;

float haloVisible(vec2 uv, float distance) {
    return step(distance - uBias, vfxSceneDistance(clamp(uv, vec2(0.001), vec2(0.999))));
}

void main() {
    vec2 uv = vCenter.xy * 0.5 + 0.5;
    float distance = vfxLinearDepth(vCenter.z * 0.5 + 0.5);
    vec2 tap = 2.5 / uSceneResolution;
    float visible = (haloVisible(uv, distance) * 2.0 + haloVisible(uv + vec2(tap.x, 0.0), distance) + haloVisible(uv - vec2(tap.x, 0.0), distance) + haloVisible(uv + vec2(0.0, tap.y), distance) + haloVisible(uv - vec2(0.0, tap.y), distance)) / 6.0;
    float radius = length(vUv - 0.5) * 2.0;
    float glow = pow(max(0.0, 1.0 - radius), 2.5) * 0.6 + exp(-radius * radius * 40.0) * 0.8;
    gl_FragColor = vec4(uColor * glow * uIntensity * visible, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

const geometry = new PlaneGeometry(1, 1);

export function createHaloMaterial() {
    return new ShaderMaterial({
        uniforms: { ...sceneUniforms, uColor: { value: new Color() }, uIntensity: { value: 1 }, uSize: { value: 0.1 }, uBias: { value: 0.02 } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
    });
}

export class LightHalo extends Mesh {
    constructor() {
        super(geometry, createHaloMaterial());
        this.layers.set(VFX_LAYER);
        this.frustumCulled = false;
        this.renderOrder = 20;
        this.userData.ignoreHover = true;
        this.userData.interactive = false;
    }

    configure({ color, size, intensity }) {
        const { uniforms } = this.material;
        uniforms.uColor.value.set(color);
        uniforms.uSize.value = size;
        uniforms.uBias.value = size * 0.35;
        this.baseIntensity = intensity;
    }

    update(factor) {
        this.material.uniforms.uIntensity.value = this.baseIntensity * factor;
    }

    destroy() {
        this.removeFromParent();
        this.material.dispose();
    }
}
