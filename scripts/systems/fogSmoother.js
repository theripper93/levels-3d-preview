import * as THREE from "three";

const TEXELS_PER_GRID = 8;
const MAX_RESOLUTION = 2048;
const SOFTNESS = 0.5;
const SAFETY_MARGIN = 1.5;
const FADE_DURATION = 0.25;
const AXIS_X = new THREE.Vector2(1, 0);
const AXIS_Y = new THREE.Vector2(0, 1);

const VERTEX_SHADER = "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }";

const POOL_SHADER = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uAxis;
uniform float uScale;
void main() {
    ivec2 size = textureSize(uSource, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float o = dot(vec2(pixel), uAxis);
    int axisSize = int(dot(vec2(size), uAxis));
    int first = max(int(floor(o * uScale)), 0);
    int last = min(int(ceil((o + 1.0) * uScale)) - 1, axisSize - 1);
    ivec2 step = ivec2(uAxis);
    ivec2 base = pixel * (ivec2(1) - step);
    float value = 1.0;
    for (int i = first; i <= last; i++) value = min(value, texelFetch(uSource, base + step * i, 0).r);
    gl_FragColor = vec4(value, 0.0, 0.0, 1.0);
}
`;

const ERODE_SHADER = /* glsl */ `
uniform sampler2D uSource;
uniform float uRadius;
void main() {
    ivec2 size = textureSize(uSource, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    int radius = int(ceil(uRadius));
    float limit = uRadius * uRadius;
    float value = 1.0;
    for (int y = -radius; y <= radius; y++) {
        for (int x = -radius; x <= radius; x++) {
            if (float(x * x + y * y) > limit) continue;
            value = min(value, texelFetch(uSource, clamp(pixel + ivec2(x, y), ivec2(0), size - 1), 0).r);
        }
    }
    gl_FragColor = vec4(value, 0.0, 0.0, 1.0);
}
`;

const BLUR_SHADER = /* glsl */ `
uniform sampler2D uSource;
uniform float uRadius;
void main() {
    ivec2 size = textureSize(uSource, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    int radius = int(uRadius);
    float limit = uRadius * uRadius;
    float sigma = max(uRadius * 0.5, 0.5);
    float total = 0.0;
    float weight = 0.0;
    for (int y = -radius; y <= radius; y++) {
        for (int x = -radius; x <= radius; x++) {
            float d = float(x * x + y * y);
            if (d > limit) continue;
            float w = exp(-0.5 * d / (sigma * sigma));
            total += texelFetch(uSource, clamp(pixel + ivec2(x, y), ivec2(0), size - 1), 0).r * w;
            weight += w;
        }
    }
    gl_FragColor = vec4(total / weight, 0.0, 0.0, 1.0);
}
`;

const BLEND_SHADER = /* glsl */ `
uniform sampler2D uShown;
uniform sampler2D uTarget;
uniform float uStep;
void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float shown = texelFetch(uShown, pixel, 0).r;
    float target = texelFetch(uTarget, pixel, 0).r;
    gl_FragColor = vec4(target <= shown ? target : min(target, shown + uStep), 0.0, 0.0, 1.0);
}
`;

function passMaterial(fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX_SHADER, fragmentShader, depthTest: false, depthWrite: false });
}

function maskTarget(width, height, filter = THREE.NearestFilter) {
    const target = new THREE.WebGLRenderTarget(width, height, { format: THREE.RedFormat, minFilter: filter, magFilter: filter, depthBuffer: false, generateMipmaps: false });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
}

export class FogSmoother {
    constructor(renderer) {
        this.renderer = renderer;
        this.poolMaterial = passMaterial(POOL_SHADER, { uSource: { value: null }, uAxis: { value: AXIS_X }, uScale: { value: 1 } });
        this.erodeMaterial = passMaterial(ERODE_SHADER, { uSource: { value: null }, uRadius: { value: 0 } });
        this.blurMaterial = passMaterial(BLUR_SHADER, { uSource: { value: null }, uRadius: { value: 0 } });
        this.blendMaterial = passMaterial(BLEND_SHADER, { uShown: { value: null }, uTarget: { value: null }, uStep: { value: 1 } });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blendMaterial);
        this.quad.frustumCulled = false;
        this.scene = new THREE.Scene();
        this.scene.add(this.quad);
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.source = null;
        this.sourceSize = new THREE.Vector2();
        this.dirty = false;
        this.primed = false;
        this.fadeRemaining = 0;
        this.shownIndex = 0;
        this.resize();
    }

    get texture() {
        return this.shown[this.shownIndex].texture;
    }

    get smoothedTexture() {
        return this.smoothed.texture;
    }

    get active() {
        return this.dirty || this.fadeRemaining > 0;
    }

    resize() {
        const { width, height, size } = canvas.dimensions;
        const grids = Math.max(width, height) / size;
        this.texelsPerGrid = Math.min(TEXELS_PER_GRID, MAX_RESOLUTION / grids);
        const outWidth = Math.max(1, Math.ceil((width / size) * this.texelsPerGrid));
        const outHeight = Math.max(1, Math.ceil((height / size) * this.texelsPerGrid));
        if (this.width === outWidth && this.height === outHeight) return;
        this.disposeTargets();
        this.width = outWidth;
        this.height = outHeight;
        this.blurRadius = Math.max(1, Math.round(this.texelsPerGrid * SOFTNESS));
        this.erodeRadius = this.blurRadius + SAFETY_MARGIN;
        this.ping = maskTarget(outWidth, outHeight);
        this.pong = maskTarget(outWidth, outHeight);
        this.smoothed = maskTarget(outWidth, outHeight);
        this.shown = [maskTarget(outWidth, outHeight, THREE.LinearFilter), maskTarget(outWidth, outHeight, THREE.LinearFilter)];
        this.primed = false;
        this.fadeRemaining = 0;
    }

    setSource(texture, width, height) {
        this.source = texture;
        this.sourceSize.set(width, height);
        this.dirty = true;
    }

    update(delta) {
        if (!this.active) return;
        const renderer = this.renderer;
        const state = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, shadows: renderer.shadowMap.autoUpdate };
        renderer.autoClear = false;
        renderer.shadowMap.autoUpdate = false;
        try {
            if (this.dirty) this.smooth();
            this.blend(delta);
        } finally {
            renderer.setRenderTarget(state.target);
            renderer.autoClear = state.autoClear;
            renderer.shadowMap.autoUpdate = state.shadows;
        }
    }

    smooth() {
        this.dirty = false;
        const source = this.source;
        if (!source || !this.sourceSize.x || !this.sourceSize.y) return;
        if (this.rows?.height !== this.sourceSize.y) {
            this.rows?.dispose();
            this.rows = maskTarget(this.width, this.sourceSize.y);
        }
        this.pass(this.poolMaterial, { uSource: source, uAxis: AXIS_X, uScale: this.sourceSize.x / this.width }, this.rows);
        this.pass(this.poolMaterial, { uSource: this.rows.texture, uAxis: AXIS_Y, uScale: this.sourceSize.y / this.height }, this.ping);
        this.pass(this.erodeMaterial, { uSource: this.ping.texture, uRadius: this.erodeRadius }, this.pong);
        this.pass(this.blurMaterial, { uSource: this.pong.texture, uRadius: this.blurRadius }, this.smoothed);
        this.fadeRemaining = this.primed ? FADE_DURATION : 0;
        this.primed = true;
    }

    blend(delta) {
        const elapsed = Math.max(delta, 0);
        this.fadeRemaining -= elapsed;
        const finalStep = this.fadeRemaining <= 0;
        if (finalStep) this.fadeRemaining = 0;
        const next = 1 - this.shownIndex;
        this.pass(this.blendMaterial, { uShown: this.shown[this.shownIndex].texture, uTarget: this.smoothed.texture, uStep: finalStep ? 1 : elapsed / FADE_DURATION }, this.shown[next]);
        this.shownIndex = next;
    }

    pass(material, values, target) {
        const uniforms = material.uniforms;
        for (const [key, value] of Object.entries(values)) uniforms[key].value = value;
        this.draw(material, target);
        for (const key of Object.keys(values)) if (uniforms[key].value?.isTexture) uniforms[key].value = null;
    }

    draw(material, target) {
        this.quad.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
    }

    disposeTargets() {
        this.rows?.dispose();
        this.rows = null;
        this.ping?.dispose();
        this.pong?.dispose();
        this.smoothed?.dispose();
        this.shown?.forEach((target) => target.dispose());
    }

    dispose() {
        this.disposeTargets();
        this.poolMaterial.dispose();
        this.erodeMaterial.dispose();
        this.blurMaterial.dispose();
        this.blendMaterial.dispose();
        this.quad.geometry.dispose();
        this.source = null;
    }
}
