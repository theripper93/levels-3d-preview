import * as THREE from "three";
import { factor } from "../main.js";
import { clusterUniforms } from "../lighting/cluster/clusterManager.js";

const MAX_WAVE_SOURCES = 4;
const GRADIENT_SIZE = 128;
const GRADIENT_STOPS = [
    [0, 1],
    [0.45, 1],
    [0.75, 0.6],
    [1, 0],
];
const RESTORE_STOPS = [
    [0, 1],
    [0.75, 1],
    [0.9, 0.6],
    [1, 0],
];

const VISION_MODE = { none: 0, grade: 1, amplify: 2, tremor: 3, blind: 4 };

const MODE_LOOK = {
    grade: { gain: 1.6, contrast: 0, lift: 0.004 },
    darkvision: { gain: 2.1, contrast: 0, lift: 0.006 },
    amplify: { gain: 8, contrast: 0, lift: 0.01 },
    tremor: { gain: 1.2, contrast: 0, lift: 0.006 },
    blind: { gain: 0.6, contrast: -2, lift: 0.004 },
};

const SIGHT_FLOOR = 0.5;
const NIGHT_FADE_RATE = 1.5;
const AMPLIFY_TINT = [0.12, 0.6, 0.12];
const TREMOR_TINT = [0.8, 0.1, 0.8];
const SIGHT_TINT_STRENGTH = 0.6;
const MIST_GRADE ={ amplify: 1.6, tremor: 0.35, tremorTint: 0.25, blind: 0.5 };
const TREMOR_MIST = new THREE.Color();

export const visionNight = { scale: 1, target: 1 };

export const visionModeUniforms = {
    l3dVM: { value: 0 },
    l3dVMGrade: { value: new THREE.Vector4(1, 0, 0, 0) },
    l3dVMTint: { value: new THREE.Vector3(1, 1, 1) },
    l3dVMSources: { value: Array.from({ length: MAX_WAVE_SOURCES }, () => new THREE.Vector4()) },
    l3dVMTime: { value: 0 },
    l3dVMFloor: { value: 0 },
    l3dVMGlow: { value: 0 },
};

export const VISION_MODE_PARS = /* glsl */ `
uniform float l3dVM;
uniform vec4 l3dVMGrade;
uniform vec3 l3dVMTint;
uniform vec4 l3dVMSources[${MAX_WAVE_SOURCES}];
uniform float l3dVMTime;
uniform float l3dVMFloor;
uniform float l3dVMGlow;
uniform bool l3dNoVisionMode;
uniform bool l3dSelfLit;

#ifndef L3D_VM_ALBEDO
#define L3D_VM_ALBEDO vec3(0.0)
#endif

vec3 l3dVisionGrade(vec3 color, float lum, float saturation) {
    vec3 graded = max(mix(vec3(lum), color, 1.0 + saturation), 0.0) * l3dVMGrade.x;
    graded = l3dVMGrade.y < 0.0 ? graded / (1.0 - graded * l3dVMGrade.y * 10.0) : graded;
    return graded + l3dVMGrade.w * smoothstep(0.0, 0.02, lum);
}

vec3 l3dTremorWaves(vec2 xz) {
    float ring = 0.0;
    float beam = 0.0;
    for (int i = 0; i < ${MAX_WAVE_SOURCES}; i++) {
        vec4 source = l3dVMSources[i];
        if (source.z <= 0.0) continue;
        vec2 offset = xz - source.xy;
        float dist = length(offset);
        float grid = dist / max(source.w, 1e-4);
        float reach = dist / max(source.z, 1e-4);
        float fade = smoothstep(0.1, 0.5, grid) * (1.0 - smoothstep(0.92, 1.0, reach));
        float wave = 0.5 + 0.5 * cos(sqrt(grid) * 36.0 - l3dVMTime * 3.0);
        ring = max(ring, pow(wave, 24.0) * fade * (0.35 + reach));
        float angle = atan(offset.y, offset.x);
        beam = max(beam, pow(abs(cos(2.0 * angle - l3dVMTime * 0.6)), 6.0) * fade * reach);
    }
    return l3dVMTint * (0.018 + 0.08 * beam + 0.05 * ring);
}

vec3 l3dVisionMode(vec3 color, vec4 texel, vec2 xz, vec3 albedo, float up) {
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    if (l3dVM > 3.5) return l3dVisionGrade(vec3(min(lum, 0.03)), min(lum, 0.03), -1.0);
    float weight = texel.g;
    if (weight <= 0.0) return color;
    vec3 result;
    float sightMask = l3dVM < 1.5 ? texel.b : clamp(texel.r * 2.0 - 1.0, 0.0, 1.0);
    vec3 sighted = albedo * (l3dVMFloor * sightMask * mix(0.6, 1.0, up));
    float sightedLum = dot(sighted, vec3(0.2126, 0.7152, 0.0722));
    if (l3dVM < 1.5) {
        result = l3dVisionGrade(color, lum, l3dVMGrade.z) * l3dVMTint;
        result = max(result, mix(vec3(sightedLum), sighted, 1.0 + l3dVMGrade.z) * l3dVMTint);
    } else if (l3dVM < 2.5) {
        float level = max(lum, sightedLum) * l3dVMGrade.x;
        vec3 vision = smoothstep(0.0, 1.0, level * 1.5) * l3dVMTint;
        result = vision + vision * level * 0.1 + l3dVMTint * l3dVMGrade.w;
        float blowout = texel.b * texel.b * texel.b * smoothstep(0.0, 0.01, lum);
        result = mix(result, mix(l3dVMTint, vec3(1.0), 0.7) * (0.4 + level * 0.5), blowout);
    } else {
        float level = min(lum, 0.025);
        result = mix(vec3(level), color * (level / max(lum, 1e-5)), 0.2) * l3dVMGrade.x + l3dVMGrade.w * l3dVMTint + l3dTremorWaves(xz) * texel.b;
    }
    return mix(color, result, weight);
}
`;

export const VISION_MODE_FRAGMENT = `
            if (l3dSelfLit) gl_FragColor.rgb = max(gl_FragColor.rgb, L3D_VM_ALBEDO * (${SIGHT_FLOOR} * fogTexel.r));
            float l3dVMUp = abs(fowFaceNormal.y) * inversesqrt(max(dot(fowFaceNormal, fowFaceNormal), 1e-12));
            #ifdef L3D_VM_KEEP
            if (l3dVM > 0.5 && !l3dNoVisionMode) {
                vec3 l3dVMKeep = clamp(L3D_VM_KEEP * (fogTexel.r * l3dVMGlow), vec3(0.0), max(gl_FragColor.rgb, 0.0));
                vec3 l3dVMAlbedo = L3D_VM_ALBEDO * (1.0 - step(1e-4, dot(l3dVMKeep, vec3(1.0))));
                gl_FragColor.rgb = l3dVisionMode(gl_FragColor.rgb - l3dVMKeep, fogTexel, vWorldPositionFoW.xz, l3dVMAlbedo, l3dVMUp) + l3dVMKeep;
            }
            #else
            if (l3dVM > 0.5 && !l3dNoVisionMode) gl_FragColor.rgb = l3dVisionMode(gl_FragColor.rgb, fogTexel, vWorldPositionFoW.xz, L3D_VM_ALBEDO, l3dVMUp);
            #endif`;

function classify(mode) {
    if (!mode || mode.vision?.preferred) return VISION_MODE.none;
    if (mode.id === "blindness") return VISION_MODE.blind;
    if (mode.id === "tremorsense") return VISION_MODE.tremor;
    const shaders = foundry.canvas.rendering?.shaders ?? {};
    if (mode.id === "lightAmplification" || (shaders.AmplificationSamplerShader && mode.canvas?.shader === shaders.AmplificationSamplerShader)) return VISION_MODE.amplify;
    return mode.canvas?.shader ? VISION_MODE.grade : VISION_MODE.none;
}

function restoresLights(mode) {
    const lighting = mode.lighting ?? {};
    const disabled = foundry.canvas.perception.VisionMode.LIGHTING_VISIBILITY.DISABLED;
    if ((lighting.background?.visibility ?? 1) === disabled) return false;
    return !["background", "illumination", "coloration"].some((channel) => lighting[channel]?.postProcessingModes?.includes("SATURATION"));
}

function lookFor(type, mode) {
    if (type === VISION_MODE.blind) return MODE_LOOK.blind;
    if (type === VISION_MODE.tremor) return MODE_LOOK.tremor;
    if (type === VISION_MODE.amplify) return MODE_LOOK.amplify;
    return mode.id === "darkvision" ? MODE_LOOK.darkvision : MODE_LOOK.grade;
}

function sourceWeight(source, type) {
    if (type !== VISION_MODE.grade) return 1;
    const saturation = source.visionModeOverrides?.saturation ?? source.data?.saturation ?? -1;
    return Math.clamp(-saturation, 0, 1);
}

function dimAsBright(mode) {
    const levels = mode?.lighting?.levels;
    const { DIM, BRIGHT } = CONST.LIGHTING_LEVELS;
    return !!levels && levels[DIM] >= BRIGHT;
}

function sightTint(type, source) {
    if (type !== VISION_MODE.grade && type !== VISION_MODE.amplify) return null;
    const rgb = source?.visionModeOverrides?.colorRGB;
    if (!rgb) return null;
    const peak = Math.max(rgb[0], rgb[1], rgb[2]);
    if (!(peak > 0)) return null;
    if (type === VISION_MODE.amplify) return rgb.map((channel) => (channel * Math.max(...AMPLIFY_TINT)) / peak);
    return rgb.map((channel) => THREE.MathUtils.lerp(1, channel / peak, SIGHT_TINT_STRENGTH));
}

const LUMA = [0.2126, 0.7152, 0.0722];

export function gradeMistColor(color) {
    const type = visionModeUniforms.l3dVM.value;
    if (type === VISION_MODE.none) return color;
    const lum = color.r * LUMA[0] + color.g * LUMA[1] + color.b * LUMA[2];
    const tint = visionModeUniforms.l3dVMTint.value;
    if (type === VISION_MODE.grade) {
        const keep = 1 + Math.clamp(visionModeUniforms.l3dVMGrade.value.z, -1, 0);
        return color.setRGB(THREE.MathUtils.lerp(lum, color.r, keep) * tint.x, THREE.MathUtils.lerp(lum, color.g, keep) * tint.y, THREE.MathUtils.lerp(lum, color.b, keep) * tint.z);
    }
    if (type === VISION_MODE.amplify) return color.setRGB(tint.x, tint.y, tint.z).multiplyScalar(lum * MIST_GRADE.amplify);
    if (type === VISION_MODE.tremor) return color.setRGB(lum, lum, lum).multiplyScalar(MIST_GRADE.tremor).addScaledVector(TREMOR_MIST.set(tint.x, tint.y, tint.z), lum * MIST_GRADE.tremorTint);
    return color.setRGB(lum, lum, lum).multiplyScalar(MIST_GRADE.blind);
}

function createGradient(stops) {
    const element = document.createElement("canvas");
    element.width = element.height = GRADIENT_SIZE;
    const context = element.getContext("2d");
    const half = GRADIENT_SIZE / 2;
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    for (const [stop, alpha] of stops) gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, GRADIENT_SIZE, GRADIENT_SIZE);
    return PIXI.Texture.from(element);
}

export class VisionModeMask {
    constructor() {
        this.type = VISION_MODE.none;
        this.animated = false;
        this.gradient = createGradient(GRADIENT_STOPS);
        this.restoreGradient = createGradient(RESTORE_STOPS);
        this.base = new PIXI.Graphics();
        this.restore = new PIXI.Graphics();
        this.coverageBase = new PIXI.Graphics();
        this.coverage = new PIXI.Graphics();
        this.coverage.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
        this.modeLayer = new PIXI.Container();
        this.modeLayer.addChild(this.base, this.restore);
        this.coverageLayer = new PIXI.Container();
        this.coverageLayer.addChild(this.coverageBase, this.coverage);
        this.matrix = new PIXI.Matrix();
    }

    get active() {
        return this.type !== VISION_MODE.none;
    }

    refresh() {
        const sources = [...(canvas.effects?.visionSources ?? [])].filter((source) => source.active);
        const single = canvas.visibility?.visionModeData?.source;
        clusterUniforms.uClusterLevels.value = dimAsBright(single?.visionMode) ? 1 : 0;
        const leader = single && classify(single.visionMode) ? single : sources.find((source) => classify(source.visionMode));
        const mode = leader?.visionMode;
        let type = classify(mode);
        const restoreLights = type !== VISION_MODE.none && restoresLights(mode);
        if (restoreLights && canvas.environment?.globalLightSource?.active) type = VISION_MODE.none;
        this.type = type;
        this.signature = `${type}|${restoreLights}|${sourceWeight(leader, type)}`;
        if (type === VISION_MODE.none) return this.reset();
        this.setUniforms(type, mode, sources, leader, restoreLights);
        if (type === VISION_MODE.blind) return;
        this.drawMode(sourceWeight(leader, type), sources, restoreLights);
        this.drawCoverage(type, sources);
    }

    setUniforms(type, mode, sources, leader, restoreLights) {
        const look = lookFor(type, mode);
        const adjustments = mode.canvas?.uniforms ?? {};
        visionModeUniforms.l3dVM.value = type;
        visionNight.target = 0;
        visionModeUniforms.l3dVMGrade.value.set(look.gain, look.contrast, adjustments.saturation ?? -1, look.lift);
        visionModeUniforms.l3dVMFloor.value = type === VISION_MODE.grade || type === VISION_MODE.amplify ? SIGHT_FLOOR : 0;
        visionModeUniforms.l3dVMGlow.value = type === VISION_MODE.amplify || (type === VISION_MODE.grade && restoreLights) ? 1 : 0;
        const tint = type === VISION_MODE.amplify ? AMPLIFY_TINT : type === VISION_MODE.tremor ? TREMOR_TINT : [1, 1, 1];
        visionModeUniforms.l3dVMTint.value.fromArray(sightTint(type, leader) ?? tint);
        const waves = type === VISION_MODE.tremor ? sources.filter((source) => classify(source.visionMode) === VISION_MODE.tremor).slice(0, MAX_WAVE_SOURCES) : [];
        const grid = canvas.dimensions.size / factor;
        visionModeUniforms.l3dVMSources.value.forEach((slot, index) => {
            const source = waves[index];
            if (source) slot.set(source.data.x / factor, source.data.y / factor, source.data.radius / factor, grid);
            else slot.set(0, 0, 0, 0);
        });
        this.animated = waves.length > 0 && game.settings.get("core", "visionAnimation");
    }

    drawMode(weight, sources, restoreLights) {
        const { width, height } = canvas.dimensions;
        const level = Math.round(weight * 255);
        this.base.clear().beginFill((level << 16) | (level << 8) | level, 1).drawRect(0, 0, width, height).endFill();
        this.restore.clear();
        for (const source of sources) {
            const points = source.shape?.points;
            if (points?.length && source.visionMode?.vision?.preferred) this.restore.beginFill(0x000000, 1).drawPolygon(points).endFill();
        }
        if (restoreLights) this.drawLights(this.restore, 0x000000, this.restoreGradient);
        this.drawDarkness(this.restore, (level << 16) | (level << 8) | level);
    }

    drawDarkness(graphics, color) {
        for (const darkness of canvas.effects.darknessSources ?? []) {
            const points = darkness.active ? darkness.shape?.points : null;
            if (points?.length) graphics.beginFill(color, 1).drawPolygon(points).endFill();
        }
    }

    drawCoverage(type, sources) {
        const { width, height } = canvas.dimensions;
        this.coverageBase.clear().beginFill(0x000000, 1).drawRect(0, 0, width, height).endFill();
        this.coverage.clear();
        if (type === VISION_MODE.amplify) {
            this.drawLights(this.coverage, 0xffffff);
            return this.drawDarkness(this.coverage, 0x000000);
        }
        for (const source of sources) {
            const points = source.shape?.points;
            if (points?.length && classify(source.visionMode) === type) this.coverage.beginFill(0xffffff, 1).drawPolygon(points).endFill();
        }
    }

    drawLights(graphics, color, texture = this.gradient) {
        for (const light of canvas.effects.lightSources) {
            if (!light.active || light instanceof foundry.canvas.sources.GlobalLightSource) continue;
            const points = light.shape?.points;
            const radius = light.data.radius;
            if (!points?.length || !(radius > 0)) continue;
            const scale = (radius * 2) / GRADIENT_SIZE;
            this.matrix.set(scale, 0, 0, scale, light.data.x - radius, light.data.y - radius);
            graphics.beginTextureFill({ texture, color, alpha: 1, matrix: this.matrix }).drawPolygon(points).endFill();
        }
    }

    render(renderer, renderTexture) {
        if (!this.active || this.type === VISION_MODE.blind) return;
        const gl = renderer.gl;
        try {
            gl.colorMask(false, true, true, true);
            renderer.render(this.modeLayer, { renderTexture, clear: false });
            gl.colorMask(false, false, true, false);
            renderer.render(this.coverageLayer, { renderTexture, clear: false });
        } finally {
            gl.colorMask(true, true, true, true);
        }
    }

    update(delta) {
        if (visionNight.scale !== visionNight.target) {
            const step = Math.max(delta, 0) * NIGHT_FADE_RATE;
            visionNight.scale = Math.abs(visionNight.target - visionNight.scale) <= step ? visionNight.target : visionNight.scale + Math.sign(visionNight.target - visionNight.scale) * step;
        }
        if (!this.animated || canvas.photosensitiveMode) return;
        visionModeUniforms.l3dVMTime.value = (visionModeUniforms.l3dVMTime.value + delta) % 3600;
    }

    reset() {
        this.type = VISION_MODE.none;
        this.animated = false;
        visionModeUniforms.l3dVM.value = VISION_MODE.none;
        clusterUniforms.uClusterLevels.value = 0;
        visionNight.target = 1;
    }

    destroy() {
        this.reset();
        visionNight.scale = 1;
        this.modeLayer.destroy({ children: true });
        this.coverageLayer.destroy({ children: true });
        this.gradient.destroy(true);
        this.restoreGradient.destroy(true);
    }
}
