import * as THREE from "three";

const TEXELS_PER_GRID = 8;
const MAX_RESOLUTION = 2048;
const SOFTNESS = 0.5;
const REVEAL_TAU = 0.5;
const HIDE_TAU = 1;
const FADE_DURATION = 1;
const SETTLE_FACTOR = 7;
const TOGGLE_SPEED = 2;
const MAX_BLUR_RADIUS = 4;
const FIT_ITERATIONS = 30;
const REGION_PADDING = 2;
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

const LAYERS = /* glsl */ `
vec4 layers(vec4 texel) {
    return vec4(clamp(vec2(texel.r * 2.0, texel.r * 2.0 - 1.0), 0.0, 1.0), texel.gb);
}
`;

const BLUR_ROWS_SHADER = /* glsl */ `
uniform sampler2D uSource;
uniform int uRadius;
uniform float uWeights[${MAX_BLUR_RADIUS + 1}];
${LAYERS}
void main() {
    int width = textureSize(uSource, 0).x;
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 sum = vec4(0.0);
    for (int x = 0; x <= ${MAX_BLUR_RADIUS}; x++) {
        if (x > uRadius) break;
        vec4 right = texelFetch(uSource, ivec2(min(pixel.x + x, width - 1), pixel.y), 0);
        vec4 left = texelFetch(uSource, ivec2(max(pixel.x - x, 0), pixel.y), 0);
        float w = x == 0 ? uWeights[0] * 0.5 : uWeights[x];
        sum += (layers(right) + layers(left)) * w;
    }
    gl_FragColor = sum;
}
`;

const BLUR_COLUMNS_SHADER = /* glsl */ `
uniform sampler2D uSource;
uniform int uRadius;
uniform float uWeights[${MAX_BLUR_RADIUS + 1}];
void main() {
    int height = textureSize(uSource, 0).y;
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 sum = vec4(0.0);
    for (int y = -${MAX_BLUR_RADIUS}; y <= ${MAX_BLUR_RADIUS}; y++) {
        int offset = abs(y);
        if (offset > uRadius) continue;
        sum += texelFetch(uSource, ivec2(pixel.x, clamp(pixel.y + y, 0, height - 1)), 0) * uWeights[offset];
    }
    vec2 edge = smoothstep(vec2(0.45), vec2(0.8), sum.xy);
    gl_FragColor = vec4((edge.x + edge.y) * 0.5, sum.zw, 1.0);
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

const COMPARE_SHADER = /* glsl */ `
uniform sampler2D uPrevious;
uniform sampler2D uCurrent;
void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    if (texelFetch(uPrevious, pixel, 0) == texelFetch(uCurrent, pixel, 0)) discard;
    gl_FragColor = vec4(0.0);
}
`;

function passMaterial(fragmentShader, uniforms, options = {}) {
    return new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX_SHADER, fragmentShader, depthTest: false, depthWrite: false, ...options });
}

function maskTarget(width, height, filter = THREE.NearestFilter) {
    const target = new THREE.WebGLRenderTarget(width, height, { format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false, generateMipmaps: false });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
}

function gaussian(radius, sigma) {
    return Array.from({ length: MAX_BLUR_RADIUS + 1 }, (_, i) => (i <= radius ? Math.exp((-0.5 * i * i) / (sigma * sigma)) : 0));
}

function axisVariance(weights, radius) {
    let sum = weights[0];
    let moment = 0;
    for (let i = 1; i <= radius; i++) {
        sum += 2 * weights[i];
        moment += 2 * i * i * weights[i];
    }
    return moment / sum;
}

function discVariance(radius, sigma) {
    let sum = 0;
    let moment = 0;
    for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
            if (x * x + y * y > radius * radius) continue;
            const w = Math.exp((-0.5 * (x * x + y * y)) / (sigma * sigma));
            sum += w;
            moment += x * x * w;
        }
    }
    return moment / sum;
}

function blurWeights(radius) {
    const target = discVariance(radius, Math.max(radius * 0.5, 0.5));
    let low = 0.05;
    let high = radius * 4;
    for (let i = 0; i < FIT_ITERATIONS; i++) {
        const mid = (low + high) / 2;
        if (axisVariance(gaussian(radius, mid), radius) < target) low = mid;
        else high = mid;
    }
    const weights = gaussian(radius, (low + high) / 2);
    let sum = weights[0];
    for (let i = 1; i <= radius; i++) sum += 2 * weights[i];
    return weights.map((value) => value / sum);
}

export class FogSmoother {
    constructor(renderer) {
        this.renderer = renderer;
        this.poolMaterial = passMaterial(POOL_SHADER, { uSource: { value: null }, uAxis: { value: AXIS_X }, uScale: { value: 1 } });
        this.blurRowsMaterial = passMaterial(BLUR_ROWS_SHADER, { uSource: { value: null }, uRadius: { value: 0 }, uWeights: { value: [] } });
        this.blurColumnsMaterial = passMaterial(BLUR_COLUMNS_SHADER, { uSource: { value: null }, uRadius: { value: 0 }, uWeights: { value: [] } });
        this.blendMaterial = passMaterial(BLEND_SHADER, { uShown: { value: null }, uTarget: { value: null }, uStep: { value: 1 }, uHideStep: { value: 1 } });
        this.compareMaterial = passMaterial(COMPARE_SHADER, { uPrevious: { value: null }, uCurrent: { value: null } }, { colorWrite: false });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blendMaterial);
        this.quad.frustumCulled = false;
        this.scene = new THREE.Scene();
        this.scene.add(this.quad);
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.source = null;
        this.sourceSize = new THREE.Vector2();
        this.smoothedSourceSize = new THREE.Vector2();
        this.region = null;
        this.restartFade = null;
        this.dirty = false;
        this.primed = false;
        this.valid = false;
        this.partial = false;
        this.fadeRemaining = 0;
        this.speed = 1;
        this.shownIndex = 0;
        this.generation = 0;
        this.stalled = false;
        this.query = null;
        this.queryPending = false;
        this.queryGeneration = -1;
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
        this.blurRadius = Math.min(MAX_BLUR_RADIUS, Math.max(1, Math.round(this.texelsPerGrid * SOFTNESS)));
        this.configureBlur();
        this.ping = maskTarget(outWidth, outHeight);
        this.blurRows = maskTarget(outWidth, outHeight);
        this.smoothed = maskTarget(outWidth, outHeight);
        this.shown = [maskTarget(outWidth, outHeight, THREE.LinearFilter), maskTarget(outWidth, outHeight, THREE.LinearFilter)];
        this.primed = false;
        this.valid = false;
        this.partial = false;
        this.fadeRemaining = 0;
    }

    configureBlur() {
        const weights = blurWeights(this.blurRadius);
        for (const material of [this.blurRowsMaterial, this.blurColumnsMaterial]) {
            material.uniforms.uRadius.value = this.blurRadius;
            material.uniforms.uWeights.value = weights;
        }
    }

    setSource(texture, width, height, toggled = false, region = null) {
        if (toggled) this.speed = TOGGLE_SPEED;
        this.region = this.dirty ? mergeRegions(this.region, region) : region;
        this.source = texture;
        this.sourceSize.set(width, height);
        this.dirty = true;
        this.restartFade = true;
    }

    refresh() {
        this.region = null;
        this.dirty = true;
        this.restartFade ??= false;
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
        const region = this.region;
        const restartFade = this.restartFade !== false;
        this.region = null;
        this.restartFade = null;
        const source = this.source;
        if (!source || !this.sourceSize.x || !this.sourceSize.y) return;
        if (this.rows?.height !== this.sourceSize.y) {
            this.rows?.dispose();
            this.rows = maskTarget(this.width, this.sourceSize.y);
            this.valid = false;
        }
        if (!this.smoothedSourceSize.equals(this.sourceSize)) this.valid = false;
        const partial = this.valid && region !== null;
        const area = partial ? this.texelArea(region) : { x0: 0, y0: 0, x1: this.width, y1: this.height };
        if (area) this.smoothArea(area);
        this.smoothedSourceSize.copy(this.sourceSize);
        this.valid = true;
        this.partial = partial;
        if (restartFade) {
            this.fadeRemaining = this.primed ? Math.max(FADE_DURATION, SETTLE_FACTOR * Math.max(REVEAL_TAU, HIDE_TAU)) / this.speed : 0;
            this.primed = true;
        }
        this.generation++;
        this.stalled = false;
    }

    texelArea(region) {
        if (!region) return null;
        const { width, height } = canvas.dimensions;
        const x0 = Math.max(0, Math.floor((region.x0 / width) * this.width) - REGION_PADDING);
        const y0 = Math.max(0, Math.floor((region.y0 / height) * this.height) - REGION_PADDING);
        const x1 = Math.min(this.width, Math.ceil((region.x1 / width) * this.width) + REGION_PADDING);
        const y1 = Math.min(this.height, Math.ceil((region.y1 / height) * this.height) + REGION_PADDING);
        return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
    }

    smoothArea({ x0, y0, x1, y1 }) {
        const radius = this.blurRadius;
        const rowsScale = this.sourceSize.y / this.height;
        const rowsY0 = Math.max(0, Math.floor(y0 * rowsScale));
        const rowsY1 = Math.min(this.sourceSize.y, Math.ceil(y1 * rowsScale));
        const blurX0 = Math.max(0, x0 - radius);
        const blurX1 = Math.min(this.width, x1 + radius);
        this.pass(this.poolMaterial, { uSource: this.source, uAxis: AXIS_X, uScale: this.sourceSize.x / this.width }, this.rows, [x0, rowsY0, x1, rowsY1]);
        this.pass(this.poolMaterial, { uSource: this.rows.texture, uAxis: AXIS_Y, uScale: this.sourceSize.y / this.height }, this.ping, [x0, y0, x1, y1]);
        this.pass(this.blurRowsMaterial, { uSource: this.ping.texture }, this.blurRows, [blurX0, y0, blurX1, y1]);
        this.pass(this.blurColumnsMaterial, { uSource: this.blurRows.texture }, this.smoothed, [blurX0, Math.max(0, y0 - radius), blurX1, Math.min(this.height, y1 + radius)]);
    }

    blend(delta) {
        const elapsed = Math.max(delta, 0);
        this.fadeRemaining -= elapsed;
        const finalStep = this.fadeRemaining <= 0;
        if (finalStep) this.fadeRemaining = 0;
        const speed = this.speed;
        if (finalStep) this.speed = 1;
        if (this.stalled && !finalStep) return;
        const next = 1 - this.shownIndex;
        const ease = (tau) => (finalStep ? 1 : 1 - Math.exp((-elapsed * speed) / tau));
        this.pass(this.blendMaterial, { uShown: this.shown[this.shownIndex].texture, uTarget: this.smoothed.texture, uStep: ease(REVEAL_TAU), uHideStep: ease(HIDE_TAU) }, this.shown[next]);
        this.shownIndex = next;
        if (!finalStep) this.checkStalled();
    }

    checkStalled() {
        const gl = this.renderer.getContext();
        if (this.queryPending) {
            if (!gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) return;
            this.queryPending = false;
            if (this.queryGeneration === this.generation && !gl.getQueryParameter(this.query, gl.QUERY_RESULT)) {
                this.stalled = true;
                return;
            }
        }
        this.query ??= gl.createQuery();
        this.queryGeneration = this.generation;
        gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, this.query);
        this.pass(this.compareMaterial, { uPrevious: this.shown[1 - this.shownIndex].texture, uCurrent: this.shown[this.shownIndex].texture }, this.smoothed);
        gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
        this.queryPending = true;
    }

    pass(material, values, target, rect = null) {
        const uniforms = material.uniforms;
        for (const [key, value] of Object.entries(values)) uniforms[key].value = value;
        target.scissorTest = !!rect;
        if (rect) target.scissor.set(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
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
        this.blurRows?.dispose();
        this.smoothed?.dispose();
        this.shown?.forEach((target) => target.dispose());
    }

    dispose() {
        this.disposeTargets();
        this.poolMaterial.dispose();
        this.blurRowsMaterial.dispose();
        this.blurColumnsMaterial.dispose();
        this.blendMaterial.dispose();
        this.compareMaterial.dispose();
        this.quad.geometry.dispose();
        if (this.query) this.renderer.getContext().deleteQuery(this.query);
        this.query = null;
        this.queryPending = false;
        this.source = null;
    }
}

function mergeRegions(a, b) {
    if (a === null || b === null) return null;
    if (!a) return b ? { ...b } : false;
    if (!b) return a;
    return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
