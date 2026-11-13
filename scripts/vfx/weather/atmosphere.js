import * as THREE from "three";
import { getQuality } from "../quality.js";

const SUN_DIM = 0.65;
const EXPOSURE_DIM = 0.3;
const FLASH_EXPOSURE = 1.4;
const FLASH_SUN = 6;
const BASE_CLOUD_COVER = 0.2;
const INERT_FOG_NEAR = 1e7;
const INERT_FOG_FAR = 1e8;
const INERT_FOG = "levels3dInertFog";

export function createInertFog() {
    const fog = new THREE.Fog(0xffffff, INERT_FOG_NEAR, INERT_FOG_FAR);
    fog.name = INERT_FOG;
    return fog;
}
const MAX_INTERVAL = 30;
const MIN_INTERVAL = 3;
const BOLT_CHANCE = 0.6;
const drift = new THREE.Vector2();
const weatherColor = new THREE.Color();
const savedFogColor = new THREE.Color();
const savedSkyTint = new THREE.Color();
const OVERCAST = new THREE.Color(0x59626b);
const SKY_GREY = 0.85;
const BOLT_COLOR = "#dfe8ff";
const HORIZON_RADIUS = 0.95;
const SCENE_FOG_HORIZON = 0.85;
const HORIZON_FOG_DEPTH = 2;

const horizonMaterial = () =>
    new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uStrength: { value: 0 } },
        vertexShader: `
            #include <common>
            #include <fog_pars_vertex>
            varying vec3 vDirection;
            void main() {
                vDirection = position;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `
            #include <fog_pars_fragment>
            uniform float uStrength;
            varying vec3 vDirection;
            void main() {
                float base = smoothstep(0.0, 0.12, uStrength);
                float alpha = base * (1.0 - smoothstep(0.0, 0.08 + 0.45 * uStrength, normalize(vDirection).y));
                #ifdef USE_FOG
                    gl_FragColor = vec4(fogColor, alpha);
                #else
                    gl_FragColor = vec4(0.0);
                #endif
            }`,
        fog: true,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
    });

const FLASH_SHAPE = [
    [0, 0],
    [0.04, 1],
    [0.1, 0.15],
    [0.16, 0.8],
    [0.3, 0.1],
    [0.6, 0],
];

function flashAt(time) {
    for (let i = 1; i < FLASH_SHAPE.length; i++) {
        const [t1, v1] = FLASH_SHAPE[i];
        if (time > t1) continue;
        const [t0, v0] = FLASH_SHAPE[i - 1];
        return THREE.MathUtils.lerp(v0, v1, (time - t0) / (t1 - t0));
    }
    return 0;
}

export class Atmosphere {
    constructor(weather) {
        this.weather = weather;
        this._parent = weather._parent;
        this.scene = weather.scene;
        this.fog = this.scene.fog?.name === INERT_FOG ? this.scene.fog : createInertFog();
        if (!this.scene.fog) this.scene.fog = this.fog;
        this.fogColor = new THREE.Color();
        this.light = new THREE.Color();
        this.clouds = 0;
        this.fogAmount = 0;
        this.flash = 0;
        this.flashTime = Infinity;
        this.nextStrike = MIN_INTERVAL;
        this.saved = null;
        this.horizon = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), horizonMaterial());
        this.horizon.frustumCulled = false;
        this.horizon.matrixAutoUpdate = false;
        this.horizon.renderOrder = -1e6;
        this.horizon.visible = false;
        this.horizon.userData.ignoreHover = true;
        this.horizon.raycast = () => {};
        weather.group.add(this.horizon);
        this.installHooks();
    }

    installHooks() {
        const scene = this.scene;
        const before = scene.onBeforeRender;
        const after = scene.onAfterRender;
        scene.onBeforeRender = (...args) => {
            before.apply(scene, args);
            this.beforeRender();
        };
        scene.onAfterRender = (...args) => {
            this.afterRender();
            after.apply(scene, args);
        };
        this.restoreHooks = () => {
            scene.onBeforeRender = before;
            scene.onAfterRender = after;
        };
    }

    get sunlight() {
        return this._parent.lights?.globalIllumination?.global?.sunlight;
    }

    get sky() {
        return this._parent.lights?.globalIllumination?.sky;
    }

    setState(state) {
        this.clouds = state.clouds;
        this.fogAmount = state.fog;
        this.fogColor.copy(state.fogColor);
        this.lightning = state.lightning;
        if (!this.scene.fog) this.scene.fog = this.fog;
        if (state.fog <= 0.001) {
            this.fog.near = INERT_FOG_NEAR;
            this.fog.far = INERT_FOG_FAR;
        }
    }

    get reduceFlashing() {
        return getQuality().reduceMotion;
    }

    update(delta, { light, wind }) {
        this.light.copy(light);
        this.updateLightning(delta);
        this.updateSky(delta, wind);
    }

    updateSky(delta, wind) {
        const uniforms = this.sky?.clouds?.material?.uniforms;
        if (!uniforms?.cloudsCover) return;
        uniforms.cloudsCover.value = BASE_CLOUD_COVER + this.clouds * 0.9;
        uniforms.cloudsDarkness.value = this.clouds * this.clouds * 0.55 - this.flash * 0.4;
        uniforms.cloudsDrift.value.addScaledVector(drift.set(wind.vector.x, wind.vector.z), -delta * 0.002);
    }

    updateLightning(delta) {
        this.flashTime += delta;
        this.flash = this.reduceFlashing ? 0 : flashAt(this.flashTime);
        if (!this.lightning) return;
        this.nextStrike -= delta;
        if (this.nextStrike > 0) return;
        const interval = THREE.MathUtils.lerp(MAX_INTERVAL, MIN_INTERVAL, this.lightning);
        this.nextStrike = interval * (0.4 + Math.random() * 1.2);
        this.strike();
    }

    strike() {
        this.flashTime = 0;
        if (Math.random() > BOLT_CHANCE) return;
        const point = this.weather.randomGroundPoint();
        if (!point) return;
        try {
            new Particle3D("lightning").to(point).scale(2).color(BOLT_COLOR, BOLT_COLOR).start(false);
        } catch (error) {
            console.warn("3D Canvas | Weather lightning failed", error);
        }
    }

    fogRange(distance) {
        const amount = this.fogAmount;
        return {
            near: distance * (0.6 - 0.5 * amount),
            far: distance * (1.5 + 10 * (1 - amount) ** 2),
        };
    }

    beforeRender() {
        const sunlight = this.sunlight;
        const renderer = this._parent.renderer;
        const fog = this.scene.fog;
        const skyTint = this.sky?.material?.uniforms?.skyTint?.value;
        this.saved = {
            skyTint: skyTint ? savedSkyTint.copy(skyTint) : null,
            sun: sunlight?.intensity,
            exposure: renderer.toneMappingExposure,
            fog: fog ? { near: fog.near, far: fog.far, color: savedFogColor.copy(fog.color) } : null,
        };
        if (skyTint) skyTint.lerp(OVERCAST, this.clouds * SKY_GREY);
        const dim = 1 - this.clouds * SUN_DIM;
        if (sunlight) sunlight.intensity = sunlight.intensity * dim + this.flash * FLASH_SUN * this.lightning;
        renderer.toneMappingExposure = renderer.toneMappingExposure * (1 - this.clouds * EXPOSURE_DIM) * (1 + this.flash * FLASH_EXPOSURE * this.lightning);
        if (fog && this.fogAmount > 0.001) {
            const camera = this._parent.camera;
            const distance = camera.position.distanceTo(this._parent.controls.target);
            const { near, far } = this.fogRange(distance);
            weatherColor.copy(this.fogColor).multiply(this.light);
            if (fog === this.fog) {
                fog.near = near;
                fog.far = far;
                fog.color.copy(weatherColor);
            } else {
                fog.near = Math.min(fog.near, near);
                fog.far = Math.min(fog.far, far);
                fog.color.lerp(weatherColor, this.fogAmount);
            }
        }
        this.updateHorizon(fog);
    }

    updateHorizon(fog) {
        if (this.scene.overrideMaterial) return;
        const strength = fog ? (fog === this.fog ? this.fogAmount : Math.max(this.fogAmount, SCENE_FOG_HORIZON)) : 0;
        this.horizon.visible = strength > 0.001;
        if (!this.horizon.visible) return;
        const camera = this._parent.camera;
        this.horizon.position.copy(camera.position);
        this.horizon.scale.setScalar(Math.min(fog.far * HORIZON_FOG_DEPTH, camera.far * HORIZON_RADIUS));
        this.horizon.updateMatrix();
        this.horizon.updateMatrixWorld();
        this.horizon.material.uniforms.uStrength.value = strength;
    }

    afterRender() {
        const saved = this.saved;
        if (!saved) return;
        const sunlight = this.sunlight;
        if (sunlight && saved.sun !== undefined) sunlight.intensity = saved.sun;
        this._parent.renderer.toneMappingExposure = saved.exposure;
        if (saved.skyTint) this.sky?.material?.uniforms?.skyTint?.value.copy(saved.skyTint);
        const fog = this.scene.fog;
        if (fog && saved.fog) {
            fog.near = saved.fog.near;
            fog.far = saved.fog.far;
            fog.color.copy(saved.fog.color);
        }
        this.saved = null;
    }

    dispose() {
        this.restoreHooks();
        this.horizon.geometry.dispose();
        this.horizon.material.dispose();
        if (this.scene.fog === this.fog) {
            this.fog.near = INERT_FOG_NEAR;
            this.fog.far = INERT_FOG_FAR;
        }
        const uniforms = this.sky?.clouds?.material?.uniforms;
        if (uniforms?.cloudsCover) {
            uniforms.cloudsCover.value = BASE_CLOUD_COVER;
            uniforms.cloudsDarkness.value = 0;
        }
    }
}
