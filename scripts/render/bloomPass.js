import { ShaderMaterial } from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { frame } from "./frame.js";

const BLOOM_THRESHOLD_MIN = 0.4;
const BLOOM_THRESHOLD_MAX = 8;
export const BLOOM_RADIUS = 0.6;
const BLOOM_KNEE = 0.15;
const BLOOM_CLAMP = 32;

const vertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D tDiffuse;
uniform float luminosityThreshold;
uniform float exposure;
varying vec2 vUv;

void main() {
    vec3 color = min(texture2D(tDiffuse, vUv).rgb * exposure, vec3(${BLOOM_CLAMP.toFixed(1)}));
    float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float soft = clamp(brightness - luminosityThreshold + ${BLOOM_KNEE.toFixed(2)}, 0.0, ${(2 * BLOOM_KNEE).toFixed(2)});
    soft = soft * soft / ${(4 * BLOOM_KNEE).toFixed(2)};
    gl_FragColor = vec4(color * max(soft, brightness - luminosityThreshold) / max(brightness, 0.0001), 1.0);
}
`;

export function bloomThreshold(flag) {
    return BLOOM_THRESHOLD_MIN * (BLOOM_THRESHOLD_MAX / BLOOM_THRESHOLD_MIN) ** Math.clamp(Number(flag) || 0, 0, 1);
}

export class HDRBloomPass extends UnrealBloomPass {
    constructor(resolution, strength, radius, threshold) {
        super(resolution, strength, radius, threshold);
        this.materialHighPassFilter.dispose();
        this.highPassUniforms = { tDiffuse: { value: null }, luminosityThreshold: { value: threshold }, exposure: { value: 1 } };
        this.materialHighPassFilter = new ShaderMaterial({ uniforms: this.highPassUniforms, vertexShader, fragmentShader });
    }

    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        const exposure = Math.max(frame.exposure, 0.001);
        this.highPassUniforms.exposure.value = exposure;
        this.copyUniforms.opacity.value = 1 / exposure;
        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    }

    dispose() {
        super.dispose();
        this.materialHighPassFilter.dispose();
    }
}
