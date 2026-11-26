import * as THREE from "three";
import { factor } from "../main.js";
import {DynamicSkyConfig} from "../settings/dynamicSkyConfig.js";
import { AtmosphereState, nightAt } from "../atmosphere/state.js";
import { installAtmosphereFog, applyAtmosphereFog, resetAtmosphereFog } from "../atmosphere/fog.js";
import { updateMapEdge } from "../atmosphere/mapEdge.js";
import { SkyEnvironment } from "../atmosphere/environment.js";
import { toneMappedBackground } from "../atmosphere/background.js";
import { SkyStyleController } from "../atmosphere/sky/styleController.js";
import { styleUsesTime } from "../atmosphere/sky/registry.js";
import { getSetting } from "../settings/settingsConfig.js";
import { isUndergroundLevel } from "../helpers/undergroundLevel.js";

const MODULE_ID = "levels-3d-preview";
const MOON_OFFSET = 0.4;
const SUN_SOFTNESS = 0.3;
const SUN_SOFT_TEXELS = 2;
const SUN_MAP_MIN = 256;
const SUN_MAP_MAX = 2048;
const SUN_BLUR_SAMPLES = 12;

let worldClockDelta = 0;

const sunLocal = new THREE.Vector3();
const moonLocal = new THREE.Vector3();
const sunDirection = new THREE.Vector3();
const moonDirection = new THREE.Vector3();
const overrideAngle = new THREE.Quaternion();
const inverseAngle = new THREE.Quaternion();
const sunEuler = new THREE.Euler();
const overrideTint = new THREE.Color();
const settingBackground = new THREE.Color();
const WORK_SKY = new THREE.Color(0xffffff);
const WORK_GROUND = new THREE.Color(0x6e6a66);
const workScratch = new THREE.Color();
const timeAngle = new THREE.Quaternion();
const LIGHTS_ON_TIME = 19.5;
const LIGHTS_OFF_TIME = 6.5;
const DUSK_DARKNESS = 0.1;
const TIME_SPLINE = new THREE.SplineCurve([new THREE.Vector2(0, 0), new THREE.Vector2(6, Math.PI / 2), new THREE.Vector2(12, Math.PI), new THREE.Vector2(20, (Math.PI * 3) / 2), new THREE.Vector2(24, 2 * Math.PI)]);

function sunAngleAt(time) {
    return TIME_SPLINE.getPointAt(time / 24).y;
}

function sunQuaternion(time, tilt, target) {
    return target.setFromEuler(sunEuler.set((tilt * Math.PI) / 2, 0, sunAngleAt(time)));
}

export function darknessAtTime(scene, time) {
    const flags = scene.flags[MODULE_ID] ?? {};
    const sign = (flags.sunDistance ?? 10) < 0 ? 1 : -1;
    const t = Math.clamp(Number(time), 0, 24);
    sunLocal.set(0, sign, 0).applyQuaternion(sunQuaternion(t, Number(flags.sunTilt ?? 0), timeAngle));
    const dusk = t >= LIGHTS_ON_TIME || t < LIGHTS_OFF_TIME ? DUSK_DARKNESS : 0;
    return Math.round(Math.max(nightAt(sunLocal.y), dusk) * 100) / 100;
}

export function timeDrivesDarkness(scene) {
    const sky = scene.getFlag(MODULE_ID, "dynamicSky");
    if (scene === canvas.scene && isUndergroundLevel(scene)) return false;
    return isDynamicSkyEnabled(scene) && (sky?.setting ?? SKY_DEFAULTS.setting) === "outdoor" && styleUsesTime(sky);
}


export class GlobalIllumination {
    constructor (parent) {
        if (game.system.id === "pf2e") {
            const wco = game.pf2e.worldClock.worldCreatedOn.c;
            worldClockDelta = wco.hour * 3600 + wco.minute * 60 + wco.second;
        }
        this._parent = parent;
        this.lights = {};
        this.animationTarget = null;
        this.DynamicSkyConfig = DynamicSkyConfig;
        this.atmosphere = new AtmosphereState();
        this.skyEnvironment = new SkyEnvironment(parent);
        this.styles = new SkyStyleController(this);
        this.disposed = false;
        this._time = 12;
        this._distance = -10;
        this._sceneTint = new THREE.Color(1, 1, 1);
        this.workLight = 0;
        this.generateTimeSpline();
        this.init();

    }

    initAmbientLight() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    }

    updateAmbientLight({ intensity, color } = {}) {
        if(!this.ambientLight) this.initAmbientLight();
        const ambientLight = this.ambientLight;
        intensity = Number(intensity ?? canvas.scene.getFlag(MODULE_ID, "ambientLightIntensity") ?? 0) || 0;
        ambientLight.intensity = intensity;
        ambientLight.color.set(color || (canvas.scene.getFlag(MODULE_ID, "ambientLightColor") ?? "#ffffff"));
        if (intensity > 0 !== !!ambientLight.parent) intensity > 0 ? this._parent.scene.add(ambientLight) : this._parent.scene.remove(ambientLight);
    }

    get skyData() {
        const override = this.atmosphere.override;
        const data = foundry.utils.mergeObject({ ...SKY_DEFAULTS }, foundry.utils.deepClone(canvas.scene.getFlag(MODULE_ID, "dynamicSky") ?? {}));
        data.enabled = isDynamicSkyEnabled(canvas.scene);
        if (isUndergroundLevel()) {
            data.enabled = true;
            data.setting = "underground";
        }
        if (override?.sky) foundry.utils.mergeObject(data, override.sky);
        if (override?.enabled !== undefined) data.enabled = override.enabled;
        if (override?.preset) data.preset = override.preset;
        return data;
    }

    get skyEnabled() {
        return !!this.sky;
    }

    get darknessDrivesSky() {
        const timeSync = getTimeSync();
        return timeSync === "darkness" || timeSync === "both";
    }

    initDynamicSky() {
        if (this.sky) return this.styles.select(this._skyData);
        const sky = this.styles.initial(this._skyData);
        this.sky = sky;
        this._parent.scene.add(sky);
        this._parent.scene.environment = this.skyEnvironment.attach(sky);
    }

    updateDynamicSky() {
        const dynamicSkyData = this.skyData;
        this._skyData = dynamicSkyData;
        const wasEnabled = !!this.sky;
        if (dynamicSkyData.enabled) {
            this.initDynamicSky();
        } else if (this.sky) {
            this.styles.reset();
            this.skyEnvironment.dispose();
            this._parent.scene.remove(this.sky);
            this.sky.dispose?.();
            this.sky = null;
        }
        if (wasEnabled !== !!this.sky) {
            if (wasEnabled) this.disableAtmosphere();
            this.setTarget();
            if (this._parent.lights.globalIllumination === this) this._parent.makeSkybox(canvas.scene.getFlag(MODULE_ID, "enableFog") ?? false);
        }
    }

    dispose() {
        this.disposed = true;
        this.styles.reset();
        this.skyEnvironment.dispose();
        this.sky = null;
    }

    disableAtmosphere() {
        this.atmosphere.disable();
        this.hemisphereLight.intensity = 0;
        this._mixWorkLight();
        this._parent.scene.environmentIntensity = 1;
        this.global.sunlight.shadow.autoUpdate = true;
        this.global.sunlight.shadow.intensity = 1;
        this._parent.setFog();
        resetAtmosphereFog(this._parent.scene.fog);
    }

    generateTimeSpline() {
        this._timeSpline = TIME_SPLINE;
    }

    getAngleAt(time) {
        return sunAngleAt(time);
    }

    init() {
        const sunlight = new THREE.DirectionalLight(0xffa95c, 4);
        const lightTarget = new THREE.Object3D();
        sunlight.target = lightTarget;
        lightTarget.position.copy(this._parent.canvasCenter);

        const lightingGroup = new THREE.Group();
        lightingGroup.position.copy(this._parent.canvasCenter);
        const sizeY = (canvas.scene.dimensions.sceneWidth / factor) * 1.5;
        const sizeX = (canvas.scene.dimensions.sceneHeight / factor) * 1.5;
        sunlight.shadow.camera.left = -sizeX / 2;
        sunlight.shadow.camera.right = sizeX / 2;
        sunlight.shadow.camera.top = sizeY / 2;
        sunlight.shadow.camera.bottom = -sizeY / 2;
        sunlight.shadow.camera.updateProjectionMatrix();
        lightingGroup.add(sunlight);

        this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0);

        this.global = {
            sunlight,
            lightTarget,
            lightingGroup,
        };

        this._setShadowQuality();

        this._parent.scene.add(lightTarget);
        this._parent.scene.add(lightingGroup);
        this._parent.scene.add(this.hemisphereLight);

        this.updateDynamicSky();
        this.setTarget(true, false);
        this.updateAmbientLight();
    }

    get sunShadows() {
        return canvas.scene.getFlag(MODULE_ID, "sunShadows") ?? true;
    }

    _setShadowQuality() {
        const sunlight = this.global.sunlight;
        sunlight.shadow.bias = -0.000018;
        sunlight.castShadow = game.settings.get(MODULE_ID, "shadowQuality") > 0 && this.sunShadows;
        sunlight.shadow.camera.fov = 90;
        sunlight.shadow.camera.far = 100;
        sunlight.shadow.camera.near = 0.1;
        const shadowRes = game.settings.get(MODULE_ID, "shadowQuality");
        sunlight.shadow.mapSize.setScalar(0);
        if (!shadowRes) return;
        const shadowCamera = sunlight.shadow.camera;
        const extent = Math.max(shadowCamera.right - shadowCamera.left, shadowCamera.top - shadowCamera.bottom);
        const softness = (canvas.dimensions.size / factor) * SUN_SOFTNESS;
        const mapSize = Math.clamp(THREE.MathUtils.ceilPowerOfTwo((extent * SUN_SOFT_TEXELS) / softness), SUN_MAP_MIN, Math.min(1024 * shadowRes, SUN_MAP_MAX));
        const texelSize = extent / mapSize;
        sunlight.shadow.mapSize.setScalar(mapSize);
        sunlight.shadow.radius = softness / texelSize;
        this._sunShadowRadius = sunlight.shadow.radius;
        sunlight.shadow.blurSamples = SUN_BLUR_SAMPLES;
        sunlight.shadow.normalBias = texelSize * 1.5;
    }

    getSunAngle(time, tilt, target = new THREE.Quaternion()) {
        return sunQuaternion(time, tilt, target);
    }

    computeTarget(flags = true) {
        const color = new THREE.Color(flags.color ?? canvas.scene.getFlag(MODULE_ID, "sceneTint") ?? "white");
        const distance = -(flags.distance ?? canvas.scene.getFlag(MODULE_ID, "sunDistance") ?? 10);
        const time = Math.clamp(Number(flags.time ?? canvas.scene.getFlag(MODULE_ID, "sunPosition") ?? 12), 0, 24);
        const flagExposure = Number(flags.exposure ?? canvas.scene.getFlag(MODULE_ID, "exposure") ?? 1);
        const exposure = this.sky && this.darknessDrivesSky ? 1 : flagExposure;
        const sunTilt = flags.tilt ?? canvas.scene.getFlag(MODULE_ID, "sunTilt") ?? 0;
        const angle = this.getSunAngle(time, sunTilt);
        return { color, distance, angle, intensity: flagExposure, exposure, time };
    }

    setTarget(flags = true, animate = true) {
        const targetData = this.computeTarget(flags);
        if (!animate) {
            this.animationTarget = null;
            this._time = targetData.time;
            return this.setValues(targetData);
        }
        this._timePassed = 0;
        this.animationTarget = targetData;
    }

    setValues(values) {
        const { color, distance, angle, intensity, exposure } = values;
        const sunlight = this.global.sunlight;
        sunlight.color.copy(color);
        sunlight.position.set(0, distance, 0);
        sunlight.intensity = distance !== 0 ? intensity : 0;
        sunlight.castShadow = distance !== 0 && this.sunShadows && getSetting("shadowQuality") > 0;
        this._sceneTint.copy(color);
        this._distance = distance;
        this.global.lightingGroup.rotation.setFromQuaternion(angle);
        this._parent.renderer.toneMappingExposure = exposure;
    }

    setFromWorldTime() {
        const minutes = new Date((game.time.worldTime + worldClockDelta) * 1000).getUTCMinutes();
        const hours = new Date((game.time.worldTime + worldClockDelta) * 1000).getUTCHours();
        const final = parseFloat((hours + minutes / 60).toFixed(1));
        canvas.scene.update({ [`flags.${MODULE_ID}.sunPosition`]: final }, { worldTime: true });
    }

    onOverrideChanged() {
        this.updateDynamicSky();
        if (!this.atmosphere.override) this.setTarget();
    }

    update(delta) {
        this.styles.update(delta);
        this.updateAnimation(delta);
        if (this.sky) this.updateAtmosphere();
    }

    updateAnimation(delta) {
        if (!this.animationTarget) return;
        this._timePassed += delta / 50;
        if (this._timePassed >= 1) this._timePassed = 1;
        const sunlight = this.global.sunlight;
        const lightingGroup = this.global.lightingGroup;
        const { color, distance, angle, intensity, exposure, time } = this.animationTarget;
        const frameColor = this._sceneTint.clone().lerp(color, this._timePassed);
        const frameDistance = this._distance + (distance - this._distance) * this._timePassed;
        const currentAngle = new THREE.Quaternion().setFromEuler(lightingGroup.rotation);
        const frameAngle = currentAngle.slerp(angle, this._timePassed);
        const frameIntensity = sunlight.intensity + (intensity - sunlight.intensity) * this._timePassed;
        const frameExposure = this._parent.renderer.toneMappingExposure + (exposure - this._parent.renderer.toneMappingExposure) * this._timePassed;
        this._time += (time - this._time) * this._timePassed;
        this.setValues({ color: frameColor, distance: frameDistance, angle: frameAngle, intensity: frameIntensity, exposure: frameExposure });
        if (this._timePassed >= 1) this.animationTarget = null;
    }

    updateAtmosphere() {
        const { sunlight, lightingGroup } = this.global;
        const override = this.atmosphere.override;
        const skyData = this._skyData;
        let tint = this._sceneTint;
        if (override) {
            if (override.time !== undefined || override.tilt !== undefined) {
                const time = Math.clamp(Number(override.time ?? this._time), 0, 24);
                const tilt = Number(override.tilt ?? canvas.scene.getFlag(MODULE_ID, "sunTilt") ?? 0);
                lightingGroup.quaternion.copy(this.getSunAngle(time, tilt, overrideAngle));
            }
            if (override.sceneTint) tint = overrideTint.set(override.sceneTint);
        }
        const distance = this._distance;
        const sign = distance > 0 ? 1 : -1;
        sunLocal.set(0, sign, 0);
        moonLocal.set(0, -sign, MOON_OFFSET).normalize();
        sunDirection.copy(sunLocal).applyQuaternion(lightingGroup.quaternion);
        moonDirection.copy(moonLocal).applyQuaternion(lightingGroup.quaternion);
        const darkness = override?.darkness ?? (this.darknessDrivesSky ? (canvas.environment?.darknessLevel ?? canvas.scene.environment.darknessLevel ?? 0) : 0);
        const styleChanged = this.styles.prepare(skyData, { time: override?.time ?? this._time, darkness, sunDirection, moonDirection });
        const state = this.atmosphere.compute({
            adjust: this.styles.adjust,
            sunDirection,
            moonDirection,
            sunDistance: distance,
            sceneTint: tint,
            darkness: Math.clamp(darkness, 0, 1),
            sky: skyData,
            worldTime: game.time.worldTime + worldClockDelta,
            gridSize: canvas.scene.dimensions.size / factor,
        });

        const radius = Math.abs(distance);
        if (state.lightDirected) sunlight.position.copy(state.lightDirection).applyQuaternion(inverseAngle.copy(lightingGroup.quaternion).invert()).multiplyScalar(radius);
        else if (state.lightIsMoon) sunlight.position.copy(moonLocal).multiplyScalar(radius);
        else sunlight.position.set(0, distance, 0);
        if (this._sunShadowRadius) sunlight.shadow.radius = this._sunShadowRadius * state.shadowSoftness;
        sunlight.color.copy(state.lightColor);
        sunlight.intensity = state.lightIntensity;
        sunlight.shadow.autoUpdate = state.lightIntensity > 0.001;
        sunlight.shadow.intensity = state.shadowIntensity;

        const hemisphere = this.hemisphereLight;
        hemisphere.color.copy(state.ambientSky);
        hemisphere.groundColor.copy(state.ambientGround);
        hemisphere.intensity = state.ambientIntensity;

        const parent = this._parent;
        const enableFog = canvas.scene.getFlag(MODULE_ID, "enableFog") ?? false;
        applyAtmosphereFog(parent.scene.fog, state, {
            sceneSize: Math.max(canvas.scene.dimensions.width, canvas.scene.dimensions.height) / factor,
            fogDistance: enableFog ? (canvas.scene.getFlag(MODULE_ID, "fogDistance") ?? 3000) / factor : null,
            cameraDistance: parent.controls ? parent.camera.position.distanceTo(parent.controls.target) : 1,
        });

        updateMapEdge(state, this.sky);

        const outdoor = state.setting === "outdoor";
        this.sky.visible = outdoor || this.styles.underground;
        if (!outdoor) parent.scene.background = toneMappedBackground(state.fogColor, settingBackground);

        this.sky.applyState(state);
        this.styles.apply(this.sky, state, styleChanged);
        this.skyEnvironment.update(state, hemisphere);
        this._mixWorkLight();
    }

    setWorkLight(intensity = 0) {
        this.workLight = Math.max(0, Number(intensity) || 0);
        if (!this.sky) this._mixWorkLight();
    }

    _mixWorkLight() {
        const hemisphere = this.hemisphereLight;
        const work = this.workLight;
        if (!this.sky) {
            hemisphere.color.copy(WORK_SKY);
            hemisphere.groundColor.copy(WORK_GROUND);
            hemisphere.intensity = work;
            return;
        }
        if (!work) return;
        const base = hemisphere.intensity;
        hemisphere.color.multiplyScalar(base).add(workScratch.copy(WORK_SKY).multiplyScalar(work));
        hemisphere.groundColor.multiplyScalar(base).add(workScratch.copy(WORK_GROUND).multiplyScalar(work));
        hemisphere.intensity = 1;
    }

    static setHooks() {
        installAtmosphereFog();

        Hooks.on("preCreateScene", (scene, data) => {
            if (data.flags?.[MODULE_ID]) return;
            scene.updateSource({ flags: { [MODULE_ID]: { dynamicSky: { enabled: true, preset: "clear" }, mapEdge: "fade" } } });
        });

        Hooks.on("updateScene", (scene, updates) => {
            //if (!game.user.isGM) return;
            if (updates.flags && updates.flags[MODULE_ID] && game.Levels3DPreview._active) {
                game.Levels3DPreview.lights.globalIllumination.setTarget();
            }
        });

        let previousTime = 0;

        Hooks.on("updateWorldTime", () => {
            if (!game.user.isGM || !game.Levels3DPreview._active) return;
            const deltaTime = Math.abs(game.time.worldTime - previousTime);
            if (deltaTime < 10) return;
            const timeSync = getTimeSync();
            if (timeSync == "off" || timeSync == "darkness") return;
            previousTime = game.time.worldTime;
            game.Levels3DPreview.lights.globalIllumination.setFromWorldTime();
        });

        Hooks.on("preUpdateScene", (scene, updates, options) => {
            const time = updates.flags?.[MODULE_ID]?.sunPosition;
            if (time === undefined || options.worldTime || updates.environment?.darknessLevel !== undefined || !timeDrivesDarkness(scene)) return;
            foundry.utils.setProperty(updates, "environment.darknessLevel", darknessAtTime(scene, time));
        });

        Hooks.on("preUpdateScene", (scene, updates) => {
            if (!game.user.isGM || !game.Levels3DPreview?._active || scene.id != canvas.scene.id || updates.environment?.darknessLevel === undefined) return;
            const timeSync = getTimeSync();
            if (timeSync == "off" || timeSync == "time") return;
            if (isDynamicSkyEnabled(scene)) return;
            const lightness = 1 - updates.environment.darknessLevel;
            foundry.utils.mergeObject(updates, {
                flags: {
                    [MODULE_ID]: {
                        exposure: 0.26 + lightness * 0.8,
                    },
                },
            });
        });
    }
}

function getTimeSync() {
    const flag = canvas.scene.getFlag(MODULE_ID, "timeSync");
    return flag ?? getTimeSyncDefault(canvas.scene);
}

export function getTimeSyncDefault(scene) {
    const smalltime = game.modules.get("smalltime")?.active;
    if (smalltime && scene.getFlag("smalltime", "darkness-link")) return "time";
    return "darkness";
}

export function isDynamicSkyEnabled(scene = canvas.scene) {
    const enabled = scene?.getFlag(MODULE_ID, "dynamicSky")?.enabled;
    if (enabled !== undefined && enabled !== null) return !!enabled;
    return SKY_DEFAULTS.enabled || (!customEnvironment(scene, "exr") && !customEnvironment(scene, "skybox"));
}

const LEGACY_SKIES = new Set(["modules/levels-3d-preview/assets/skybox/venice_sunrise_1k.exr", "modules/canvas3dcompendium/assets/Beautiful-Sky/2K/Sky_LowPoly_01_Day_a.webp"]);

function customEnvironment(scene, flag) {
    const value = scene?.getFlag(MODULE_ID, flag);
    return !!value && !LEGACY_SKIES.has(value);
}

export const SKY_DEFAULTS = {
    enabled: false,
    setting: "outdoor",
    style: "realistic",
    backgroundColor: "",
    preset: "custom",
    turbidity: 10,
    mieDirectionalG: 0.999,
    color: "#3f8ea2",
    starDensity: 1,
    enableClouds: true,
    cloudsCover: 0.35,
    cloudsSpeed: 1,
    cloudsAlpha: 0.7,
    cloudsTint: "#ffffff",
    cloudsScale: 9.5,
};
