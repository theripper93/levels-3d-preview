import * as THREE from "three";

const TEXELS_PER_GRID = 8;
const MAX_RESOLUTION = 2048;
const SOFTNESS = 0.5;
const REVEAL_TAU = 0.5;
const HIDE_TAU = 1;
const FADE_DURATION = 1;
const SETTLE_FACTOR = 7;
const TOGGLE_SPEED = 2;
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
    vec3 sum = vec3(0.0);
    for (int i = first; i <= last; i++) {
        vec4 texel = texelFetch(uSource, base + step * i, 0);
        value = min(value, texel.r);
        sum += texel.gba;
    }
    gl_FragColor = vec4(value, sum / float(max(last - first + 1, 1)));
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
    vec4 total = vec4(0.0);
    vec2 layers = vec2(0.0);
    float weight = 0.0;
    for (int y = -radius; y <= radius; y++) {
        for (int x = -radius; x <= radius; x++) {
            float d = float(x * x + y * y);
            if (d > limit) continue;
            float w = exp(-0.5 * d / (sigma * sigma));
            vec4 texel = texelFetch(uSource, clamp(pixel + ivec2(x, y), ivec2(0), size - 1), 0);
            total += texel * w;
            layers += clamp(vec2(texel.r * 2.0, texel.r * 2.0 - 1.0), 0.0, 1.0) * w;
            weight += w;
        }
    }
    vec2 edge = smoothstep(vec2(0.45), vec2(0.8), layers / weight);
    gl_FragColor = vec4((edge.x + edge.y) * 0.5, total.gba / weight);
}
`;

const BLEND_SHADER = /* glsl */ `
uniform sampler2D uShown;
uniform sampler2D uTarget;
uniform float uStep;
uniform float uHideStep;
void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 shown = texelFetch(uShown, pixel, 0);
    vec4 target = texelFetch(uTarget, pixel, 0);
    vec4 rate = mix(vec4(uStep), vec4(uHideStep), vec4(lessThanEqual(target, shown)));
    vec4 next = shown + (target - shown) * rate;
    gl_FragColor = mix(next, target, vec4(lessThan(abs(target - next), vec4(0.004))));
}
`;

function passMaterial(fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX_SHADER, fragmentShader, depthTest: false, depthWrite: false });
}

function maskTarget(width, height, filter = THREE.NearestFilter) {
    const target = new THREE.WebGLRenderTarget(width, height, { format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false, generateMipmaps: false });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
}

export class FogSmoother {
    constructor(renderer) {
        this.renderer = renderer;
        this.poolMaterial = passMaterial(POOL_SHADER, { uSource: { value: null }, uAxis: { value: AXIS_X }, uScale: { value: 1 } });
        this.blurMaterial = passMaterial(BLUR_SHADER, { uSource: { value: null }, uRadius: { value: 0 } });
        this.blendMaterial = passMaterial(BLEND_SHADER, { uShown: { value: null }, uTarget: { value: null }, uStep: { value: 1 }, uHideStep: { value: 1 } });
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
        this.speed = 1;
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
        this.ping = maskTarget(outWidth, outHeight);
        this.smoothed = maskTarget(outWidth, outHeight);
        this.shown = [maskTarget(outWidth, outHeight, THREE.LinearFilter), maskTarget(outWidth, outHeight, THREE.LinearFilter)];
        this.primed = false;
        this.fadeRemaining = 0;
    }

    setSource(texture, width, height, toggled = false) {
        if (toggled) this.speed = TOGGLE_SPEED;
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
        this.pass(this.blurMaterial, { uSource: this.ping.texture, uRadius: this.blurRadius }, this.smoothed);
        this.fadeRemaining = this.primed ? Math.max(FADE_DURATION, SETTLE_FACTOR * Math.max(REVEAL_TAU, HIDE_TAU)) / this.speed : 0;
        this.primed = true;
    }

    blend(delta) {
        const elapsed = Math.max(delta, 0);
        this.fadeRemaining -= elapsed;
        const finalStep = this.fadeRemaining <= 0;
        if (finalStep) this.fadeRemaining = 0;
        const speed = this.speed;
        if (finalStep) this.speed = 1;
        const next = 1 - this.shownIndex;
        const ease = (tau) => (finalStep ? 1 : 1 - Math.exp((-elapsed * speed) / tau));
        this.pass(this.blendMaterial, { uShown: this.shown[this.shownIndex].texture, uTarget: this.smoothed.texture, uStep: ease(REVEAL_TAU), uHideStep: ease(HIDE_TAU) }, this.shown[next]);
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
        this.smoothed?.dispose();
        this.shown?.forEach((target) => target.dispose());
    }

    dispose() {
        this.disposeTargets();
        this.poolMaterial.dispose();
        this.blurMaterial.dispose();
        this.blendMaterial.dispose();
        this.quad.geometry.dispose();
        this.source = null;
    }
}
