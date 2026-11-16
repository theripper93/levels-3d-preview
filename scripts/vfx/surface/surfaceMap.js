import * as THREE from "three";

const MAX_RESOLUTION = 2048;
const SCALE = 2;

const copyMaterial = new THREE.ShaderMaterial({
    uniforms: { uShelter: { value: null } },
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: /* glsl */ `
uniform sampler2D uShelter;
uniform vec2 uScale;
vec4 shelterFetch(ivec2 pixel, ivec2 size) {
    return texelFetch(uShelter, clamp(pixel, ivec2(0), size - 1), 0);
}
float shelterHeight(vec4 texel) {
    return texel.r * 65280.0 + texel.g * 255.0;
}
float shelterBilinear(vec2 pixel, ivec2 size) {
    vec2 base = floor(pixel);
    vec2 f = pixel - base;
    ivec2 b = ivec2(base);
    float bottom = mix(shelterHeight(shelterFetch(b, size)), shelterHeight(shelterFetch(b + ivec2(1, 0), size)), f.x);
    float top = mix(shelterHeight(shelterFetch(b + ivec2(0, 1), size)), shelterHeight(shelterFetch(b + ivec2(1, 1), size)), f.x);
    return mix(bottom, top, f.y);
}
void main() {
    ivec2 size = textureSize(uShelter, 0);
    vec2 position = gl_FragCoord.xy * uScale;
    vec2 pixel = position - 0.5;
    float height = max(shelterBilinear(pixel, size), 0.25 * (shelterBilinear(pixel + vec2(-0.5, -0.5), size) + shelterBilinear(pixel + vec2(0.5, -0.5), size) + shelterBilinear(pixel + vec2(-0.5, 0.5), size) + shelterBilinear(pixel + vec2(0.5, 0.5), size)));
    float high = floor(height / 256.0);
    vec4 texel = shelterFetch(ivec2(position), size);
    gl_FragColor = vec4(high / 255.0, (height - high * 256.0) / 255.0, 1.0 - step(0.5, texel.b), 0.0);
}
`,
    depthTest: false,
    depthWrite: false,
});
copyMaterial.uniforms.uScale = { value: new THREE.Vector2(1, 1) };

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial);
quad.frustumCulled = false;
const quadScene = new THREE.Scene();
quadScene.add(quad);
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const SURFACE_CHANNELS = {
    height: [true, true, false, false],
    mask: [false, false, true, false],
    trail: [false, false, false, true],
    all: [true, true, true, true],
};

export class SurfaceMap {
    constructor(renderer, shelter) {
        this.renderer = renderer;
        this.rect = shelter.rect.clone();
        this.width = Math.min(MAX_RESOLUTION, shelter.width * SCALE);
        this.height = Math.min(MAX_RESOLUTION, shelter.height * SCALE);
        this.target = new THREE.WebGLRenderTarget(this.width, this.height, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
        this.target.texture.colorSpace = THREE.NoColorSpace;
        this.texel = this.rect.z / this.width;
        this.camera = new THREE.OrthographicCamera(this.rect.x, this.rect.x + this.rect.z, -this.rect.y, -(this.rect.y + this.rect.w), 0.001, 10000);
        this.camera.position.set(0, 5000, 0);
        this.camera.up.set(0, 0, -1);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
        this.clear(SURFACE_CHANNELS.all, [0, 0, 1, 0]);
    }

    get texture() {
        return this.target.texture;
    }

    matches(shelter) {
        return this.rect.equals(shelter.rect) && this.width === Math.min(MAX_RESOLUTION, shelter.width * SCALE) && this.height === Math.min(MAX_RESOLUTION, shelter.height * SCALE);
    }

    withTarget(channels, draw) {
        const renderer = this.renderer;
        const gl = renderer.getContext();
        const color = renderer.state.buffers.color;
        const state = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, shadows: renderer.shadowMap.autoUpdate, clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha() };
        renderer.setRenderTarget(this.target);
        renderer.autoClear = false;
        renderer.shadowMap.autoUpdate = false;
        color.setMask(true);
        gl.colorMask(...channels);
        color.setLocked(true);
        try {
            draw(renderer);
        } finally {
            color.setLocked(false);
            gl.colorMask(true, true, true, true);
            renderer.setRenderTarget(state.target);
            renderer.setClearColor(state.clearColor, state.clearAlpha);
            renderer.autoClear = state.autoClear;
            renderer.shadowMap.autoUpdate = state.shadows;
        }
    }

    clear(channels = SURFACE_CHANNELS.all, value = [0, 0, 0, 0]) {
        this.withTarget(channels, (renderer) => {
            renderer.setClearColor(new THREE.Color(value[0], value[1], value[2]), value[3]);
            renderer.clear(true, false, false);
        });
    }

    copyFromShelter(shelter) {
        copyMaterial.uniforms.uShelter.value = shelter.target.texture;
        copyMaterial.uniforms.uScale.value.set(shelter.width / this.width, shelter.height / this.height);
        this.withTarget([true, true, true, false], (renderer) => renderer.render(quadScene, quadCamera));
        copyMaterial.uniforms.uShelter.value = null;
    }

    stamp(scene, channels = SURFACE_CHANNELS.trail) {
        this.withTarget(channels, (renderer) => {
            const background = scene.background;
            scene.background = null;
            renderer.render(scene, this.camera);
            scene.background = background;
        });
    }

    dispose() {
        this.target.dispose();
    }
}
