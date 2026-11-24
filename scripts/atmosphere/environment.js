import * as THREE from "three";

const CUBE_SIZE = 128;
const MIN_INTERVAL = 250;
const REFRESH_INTERVAL = 4000;
const ENVIRONMENT_GAIN = 1;
const NIGHT_LIFT = 2;
const FLASH_GAIN = 1.5;
const DAY_HEMISPHERE = 0.5;
const DAY_ENVIRONMENT = 0.85;
const TWILIGHT_ENVIRONMENT = 0.5;
const TWILIGHT_HEMISPHERE = 0.8;

export class SkyEnvironment {
    constructor(parent) {
        this._parent = parent;
        this.texture = null;
        this._sky = null;
        this._version = -1;
        this._time = 0;
    }

    get renderer() {
        return this._parent.renderer;
    }

    createMaterial(sky) {
        return new THREE.ShaderMaterial({
            name: "SkyEnvironmentShader",
            vertexShader: sky.material.vertexShader,
            fragmentShader: sky.material.fragmentShader,
            uniforms: { ...sky.material.uniforms, environmentMode: { value: 1 } },
            side: THREE.BackSide,
            depthTest: false,
            depthWrite: false,
        });
    }

    compile(sky) {
        const material = this.createMaterial(sky);
        if (!this._cubeTarget) return material;
        const mesh = new THREE.Mesh(sky.geometry, material);
        mesh.frustumCulled = false;
        const renderer = this.renderer;
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(this._cubeTarget);
        try {
            renderer.compile(mesh, this._cubeCamera.children[0]);
        } finally {
            renderer.setRenderTarget(previous);
        }
        return material;
    }

    retarget(sky, material = this.createMaterial(sky)) {
        this._mesh.material = material;
        this._mesh.geometry = sky.geometry;
        this._material.dispose();
        this._material = material;
        this._sky = sky;
        this._version = -1;
        this._time = -Infinity;
        return this.texture;
    }

    attach(sky, material) {
        if (this._sky === sky) {
            material?.dispose();
            return this.texture;
        }
        if (this._sky) return this.retarget(sky, material);
        this._sky = sky;
        material ??= this.createMaterial(sky);
        const mesh = new THREE.Mesh(sky.geometry, material);
        mesh.frustumCulled = false;
        this._scene = new THREE.Scene();
        this._scene.add(mesh);
        this._mesh = mesh;
        this._material = material;
        this._cubeTarget = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
        this._cubeCamera = new THREE.CubeCamera(0.1, 10, this._cubeTarget);
        this._pmrem = new THREE.PMREMGenerator(this.renderer);
        this.renderer.resetState();
        try {
            this.render();
        } finally {
            this._parent.resetPixiState();
        }
        this._time = -Infinity;
        this.texture = this._target.texture;
        return this.texture;
    }

    update(state, hemisphere) {
        if (!this._target) return;
        const scene = this._parent.scene;
        if (scene.environment === this.texture) {
            scene.environmentIntensity = THREE.MathUtils.lerp(DAY_ENVIRONMENT, ENVIRONMENT_GAIN, state.night) * (1 - TWILIGHT_ENVIRONMENT * state.twilight) * (1 + NIGHT_LIFT * state.night) * (1 + FLASH_GAIN * state.flash) * state.environmentGain;
            hemisphere.intensity *= THREE.MathUtils.lerp(DAY_HEMISPHERE, 1, state.night) * (1 + TWILIGHT_HEMISPHERE * state.twilight);
        }
        const now = performance.now();
        const elapsed = now - this._time;
        const clouds = state.clouds;
        const drifting = state.skyAnimated || (clouds.enabled && clouds.alpha > 0 && clouds.speed > 0);
        if (state.version !== this._version ? elapsed < MIN_INTERVAL : !drifting || elapsed < REFRESH_INTERVAL) return;
        this._version = state.version;
        this.render();
    }

    render() {
        this._cubeCamera.update(this.renderer, this._scene);
        this._target = this._pmrem.fromCubemap(this._cubeTarget.texture, this._target);
        this._time = performance.now();
    }

    dispose() {
        if (!this._sky) return;
        const scene = this._parent.scene;
        if (scene.environment === this.texture) scene.environment = null;
        this._material.dispose();
        this._cubeTarget.dispose();
        this._target?.dispose();
        this._pmrem.dispose();
        this._sky = this._scene = this._mesh = this._material = this._cubeTarget = this._cubeCamera = this._pmrem = this._target = this.texture = null;
        this._version = -1;
    }
}
