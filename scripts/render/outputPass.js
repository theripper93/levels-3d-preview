import { Color, ColorManagement, Matrix3, ShaderChunk, ShaderLib, ShaderMaterial, SRGBTransfer, Vector3, Vector4 } from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { frame } from "./frame.js";
import { visionNight } from "../systems/visionModeMask.js";

const TONE_MAPPING = "ACESFilmic";
const CONTRAST_PIVOT = 0.18;
const NIGHT_LUMINANCE = 0.2;

const acesInputInverse = new Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777).invert();
const acesOutputInverse = new Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602).invert();
const zero = new Vector3();
const scratch = new Vector3();

function inverseRRTAndODTFit(value) {
    const y = Math.min(Math.max(value, 0), 1.016);
    const a = 1 - 0.983729 * y;
    const b = 0.0245786 - 0.432951 * y;
    const c = -(0.000090537 + 0.238081 * y);
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

export class DisplayReferredColor extends Color {
    wrap(source, renderer) {
        this.source = source;
        this.renderer = renderer;
        return this;
    }

    getRGB(target) {
        const { source } = this;
        scratch.set(source.r, source.g, source.b).applyMatrix3(acesOutputInverse);
        scratch.set(inverseRRTAndODTFit(scratch.x), inverseRRTAndODTFit(scratch.y), inverseRRTAndODTFit(scratch.z));
        scratch.applyMatrix3(acesInputInverse).multiplyScalar(0.6 / Math.max(this.renderer.toneMappingExposure, 0.001)).max(zero);
        target.r = scratch.x;
        target.g = scratch.y;
        target.b = scratch.z;
        return target;
    }
}

export const displayBackground = new DisplayReferredColor();

const glslMatrix = (matrix) => `mat3(${matrix.elements.map((value) => value.toFixed(6)).join(", ")})`;

const DISPLAY_BACKGROUND = `
vec3 displayBackgroundToScene(vec3 color) {
    vec3 y = clamp(${glslMatrix(acesOutputInverse)} * color, 0.0, 1.016);
    vec3 a = 1.0 - 0.983729 * y;
    vec3 b = 0.0245786 - 0.432951 * y;
    vec3 c = -(0.000090537 + 0.238081 * y);
    return max(${glslMatrix(acesInputInverse)} * ((-b + sqrt(b * b - 4.0 * a * c)) / (2.0 * a)), 0.0);
}
`;

for (const shader of [ShaderLib.background, ShaderLib.backgroundCube]) {
    shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", `${DISPLAY_BACKGROUND}\nvoid main() {`)
        .replace("texColor.rgb *= backgroundIntensity;", "texColor.rgb = backgroundIntensity < 0.0 ? displayBackgroundToScene(texColor.rgb) * -backgroundIntensity : texColor.rgb * backgroundIntensity;");
}

export function displayTextureBackground(scene, renderer) {
    const background = scene.background;
    if (!background?.isTexture || ColorManagement.getTransfer(background.colorSpace) !== SRGBTransfer) return null;
    const intensity = scene.backgroundIntensity;
    Object.defineProperty(scene, "backgroundIntensity", { configurable: true, enumerable: true, get: () => (-intensity * 0.6) / Math.max(renderer.toneMappingExposure, 0.001) });
    return () => Object.defineProperty(scene, "backgroundIntensity", { configurable: true, enumerable: true, writable: true, value: intensity });
}

const GRADING_DEFAULTS = { enabled: true, chromaticAberration: 0, tint: "#ffffff", contrast: 1, brightness: 1, saturation: 1, sepia: 0, hue: 0, vignette: 0, grain: 0 };

const vertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
#include <common>
#include <dithering_pars_fragment>
${ShaderChunk.tonemapping_pars_fragment.replace("uniform float toneMappingExposure;", "const float toneMappingExposure = 1.0;")}
uniform sampler2D tDiffuse;
uniform float exposure;
uniform bool grading;
uniform float chromaticAberration;
uniform vec3 tint;
uniform float contrast;
uniform float brightness;
uniform float saturation;
uniform float sepia;
uniform float hue;
uniform float vignette;
uniform float grain;
uniform vec4 atmosphereGrade;
uniform vec4 atmosphereNight;
varying vec2 vUv;

vec3 gradeScene(vec3 color) {
    color *= atmosphereGrade.x;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float fire = smoothstep(0.6, 0.2, color.g / max(color.r, 1e-4));
    color = mix(color, luma * atmosphereNight.rgb, atmosphereNight.a * (1.0 - fire) * (1.0 - smoothstep(0.0, ${NIGHT_LUMINANCE.toFixed(2)}, luma)));
    return atmosphereGrade.y == 1.0 ? color : ${CONTRAST_PIVOT.toFixed(2)} * pow(max(color, vec3(0.0)) / ${CONTRAST_PIVOT.toFixed(2)}, vec3(atmosphereGrade.y));
}

vec3 displayColor(vec2 uv) {
    return sRGBTransferOETF(vec4(${TONE_MAPPING}ToneMapping(gradeScene(texture2D(tDiffuse, uv).rgb * exposure)), 1.0)).rgb;
}

void main() {
    vec3 color = displayColor(vUv);
    color = clamp(mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, atmosphereGrade.z), 0.0, 1.0);
    if (atmosphereGrade.w > 0.0) {
        vec2 edge = vUv * (1.0 - vUv);
        color *= mix(1.0, pow(clamp(edge.x * edge.y * 16.0, 0.0, 1.0), 0.25), atmosphereGrade.w);
    }
    if (grading) {
        if (chromaticAberration > 0.0) {
            color.r = displayColor(vUv - vec2(0.001 * chromaticAberration, 0.0)).r;
            color.b = displayColor(vUv + vec2(0.001 * chromaticAberration, 0.0)).b;
        }
        if (contrast != 1.0) color = mix(vec3(1.0), color, contrast);
        vec3 bright = color * brightness;
        color = mix(vec3(0.5), mix(vec3(dot(bright, vec3(0.2125, 0.7154, 0.0721))), bright, saturation), contrast);
        if (sepia > 0.0) color = mix(color, clamp(mat3(0.393, 0.349, 0.272, 0.769, 0.686, 0.534, 0.189, 0.168, 0.131) * color, 0.0, 1.0), sepia);
        if (hue != 0.0) {
            float angle = radians(hue);
            vec3 axis = vec3(0.57735);
            color = clamp(color * cos(angle) + cross(axis, color) * sin(angle) + axis * dot(axis, color) * (1.0 - cos(angle)), 0.0, 1.0);
        }
        if (vignette > 0.0) {
            vec2 edge = vUv * (1.0 - vUv);
            color *= pow(edge.x * edge.y * 10.0 / (vignette + 0.15), 0.25);
        }
        if (grain > 0.0) color += fract(sin(dot(vUv, vec2(12.9898, 78.233) * 2.0)) * 43758.5453) * grain;
        color *= tint;
    }
    gl_FragColor = vec4(dithering(color), 1.0);
}
`;

export class OutputPass extends Pass {
    constructor() {
        super();
        this.uniforms = {
            tDiffuse: { value: null },
            exposure: { value: 1 },
            grading: { value: true },
            chromaticAberration: { value: 0 },
            tint: { value: new Color(1, 1, 1) },
            contrast: { value: 1 },
            brightness: { value: 1 },
            saturation: { value: 1 },
            sepia: { value: 0 },
            hue: { value: 0 },
            vignette: { value: 0 },
            grain: { value: 0 },
            atmosphereGrade: { value: new Vector4(1, 1, 1, 0) },
            atmosphereNight: { value: new Vector4(0, 0, 0, 0) },
        };
        this.material = new ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, toneMapped: false, dithering: true, depthTest: false, depthWrite: false });
        this.fsQuad = new FullScreenQuad(this.material);
    }

    setupUniforms(values) {
        for (const [key, value] of Object.entries({ ...GRADING_DEFAULTS, ...values })) {
            const uniform = this.uniforms[key === "enabled" ? "grading" : key];
            if (!uniform) continue;
            if (uniform.value?.isColor) uniform.value.set(value);
            else uniform.value = value;
        }
    }

    applyAtmosphere(atmosphere) {
        const { atmosphereGrade, atmosphereNight } = this.uniforms;
        if (!atmosphere?.enabled) {
            atmosphereGrade.value.set(1, 1, 1, 0);
            atmosphereNight.value.set(0, 0, 0, 0);
            return;
        }
        const { exposure, contrast, saturation, vignette, night, nightTint } = atmosphere.grade;
        atmosphereGrade.value.set(exposure, contrast, saturation, vignette);
        atmosphereNight.value.set(nightTint.r, nightTint.g, nightTint.b, night * visionNight.scale);
    }

    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tDiffuse.value = readBuffer.texture;
        this.uniforms.exposure.value = frame.exposure;
        this.applyAtmosphere(game.Levels3DPreview?.lights?.globalIllumination?.atmosphere);
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.fsQuad.render(renderer);
    }

    dispose() {
        this.material.dispose();
        this.fsQuad.dispose();
    }
}
