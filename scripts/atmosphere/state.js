import * as THREE from "three";
import { getPreset, getSetting, samplePreset, createSample, lerpSample, customTint, NIGHT_ELEVATION } from "./presets.js";
import { getSyncedMoonPhase } from "./moonSync.js";

const VERSION_EPSILON = 0.004;
const OVERCAST = new THREE.Color(0x59626b);
const FLASH_SKY = new THREE.Color(0xc8d4ff);
const SUN_DIM = 0.65;
const AMBIENT_DIM = 0.25;
const ENVIRONMENT_DIM = 0.35;
const SKY_GREY = 0.85;
const FLASH_SUN = 6;
const FLASH_AMBIENT = 1.2;
const FLASH_ENVIRONMENT = 0.6;
const WEATHER_FOG = 0.85;
const LUNAR_MONTH = 29.53;
const MOON_PHASE_OFFSET = 0.6;
const TWILIGHT_WIDTH = 0.4;
const MOON_HORIZON = [0.03, 0.15];
const SUN_HORIZON = [-0.03, 0.06];
const NIGHT_TINT = new THREE.Color(0.62, 0.95, 1.9);
const VIGNETTE = 0.15;
const OVERCAST_SHADOW = 0.6;
const OVERCAST_SATURATION = 0.25;
const NEUTRAL_GRADE = { exposure: 1, contrast: 1, saturation: 1, night: 0 };

const sample = createSample();
const nightSample = createSample();
const scratch = new THREE.Color();
const tint = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);

export function nightAt(elevation) {
    return 1 - THREE.MathUtils.smoothstep(elevation, -0.25, -0.02);
}

function luminance(color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function overcastTo(color, amount) {
    scratch.copy(OVERCAST).multiplyScalar(luminance(color) / luminance(OVERCAST));
    return color.lerp(scratch, amount);
}

export class AtmosphereState {
    constructor() {
        this.enabled = false;
        this.preset = "clear";
        this.setting = "outdoor";
        this.sunDirection = new THREE.Vector3(0, 1, 0);
        this.moonDirection = new THREE.Vector3(0, -1, 0);
        this.daylight = 1;
        this.twilight = 0;
        this.night = 0;
        this.darkness = 0;
        this.sunColor = new THREE.Color();
        this.sunIntensity = 1;
        this.moonColor = new THREE.Color();
        this.moonIntensity = 0;
        this.lightColor = new THREE.Color();
        this.lightIntensity = 1;
        this.lightIsMoon = false;
        this.skyZenith = new THREE.Color();
        this.skyHorizon = new THREE.Color();
        this.skyGround = new THREE.Color();
        this.ambientSky = new THREE.Color();
        this.ambientGround = new THREE.Color();
        this.ambientIntensity = 0;
        this.environmentIntensity = 1;
        this.fogColor = new THREE.Color();
        this.fogDensity = 0;
        this.fogHeight = 0;
        this.starVisibility = 0;
        this.moonPhase = 0.5;
        this.sunDiscSize = 1;
        this.sunGlow = 1;
        this.haze = 0;
        this.clouds = { cover: 0, density: 0, darkness: 0, tint: new THREE.Color(), speed: 1, scale: 1, alpha: 1, drift: new THREE.Vector2(), enabled: true };
        this.flash = 0;
        this.shadowIntensity = 1;
        this.grade = { exposure: 1, contrast: 1, saturation: 1, vignette: 0, night: 0, nightTint: NIGHT_TINT };
        this.weatherFog = 0;
        this.version = 0;
        this.weather = { cover: 0, darkness: 0, drift: new THREE.Vector2(), flash: 0, overcast: 0, fogAmount: 0, fogColor: new THREE.Color(0xb0b8c0) };
        this.override = null;
        this._skyColors = [this.skyZenith, this.skyHorizon, this.skyGround, this.fogColor];
        this._signature = new Float32Array(24);
        this._snapshot = new Float32Array(24).fill(NaN);
    }

    setOverride(partial) {
        this.override = partial ? foundry.utils.mergeObject(this.override ?? {}, partial, { inplace: false }) : null;
        game.Levels3DPreview?.lights?.globalIllumination?.onOverrideChanged();
        return this.override;
    }

    setWeather({ cover, darkness, drift, flash, overcast, fogAmount, fogColor } = {}) {
        const weather = this.weather;
        if (cover !== undefined) weather.cover = cover;
        if (darkness !== undefined) weather.darkness = darkness;
        if (drift) weather.drift.copy(drift);
        if (flash !== undefined) weather.flash = flash;
        if (overcast !== undefined) weather.overcast = overcast;
        if (fogAmount !== undefined) weather.fogAmount = fogAmount;
        if (fogColor) weather.fogColor.copy(fogColor);
    }

    clearWeather() {
        this.setWeather({ cover: 0, darkness: 0, flash: 0, overcast: 0, fogAmount: 0 });
        this.weather.drift.set(0, 0);
    }

    compute({ sunDirection, moonDirection, sunDistance, sceneTint, darkness, sky, worldTime, gridSize }) {
        const presetId = sky.preset ?? "clear";
        const setting = getSetting(sky.setting);
        const custom = presetId === "custom" && !setting;
        const preset = setting ?? getPreset(presetId);
        const weather = this.weather;
        const weatherScale = setting ? setting.weather : 1;
        this.enabled = true;
        this.preset = presetId;
        this.setting = setting ? sky.setting : "outdoor";
        this.darkness = darkness;
        this.sunDirection.copy(sunDirection);
        this.moonDirection.copy(moonDirection);
        const elevation = sunDirection.y;

        samplePreset(preset, elevation, sample);
        if (darkness > 0) lerpSample(sample, samplePreset(preset, Math.min(elevation, NIGHT_ELEVATION), nightSample), darkness);
        if (sky.color && !setting) {
            customTint(sky.color, tint).lerp(WHITE, 0.2);
            sample.zenith.multiply(tint);
            sample.ground.multiply(tint);
            sample.horizon.multiply(tint.lerp(WHITE, THREE.MathUtils.lerp(0.25, 0.5, 1 - THREE.MathUtils.smoothstep(Math.abs(elevation), 0, TWILIGHT_WIDTH))));
        }

        this.daylight = THREE.MathUtils.smoothstep(elevation, -0.04, 0.2) * (1 - darkness);
        this.twilight = (1 - THREE.MathUtils.smoothstep(Math.abs(elevation), 0, TWILIGHT_WIDTH)) * (1 - darkness);
        this.night = Math.max(nightAt(elevation), darkness);

        const overcast = Math.clamp(weather.overcast, 0, 1) * weatherScale;
        const flash = Math.clamp(weather.flash, 0, 1) * weatherScale;
        const fogAmount = setting ? 0 : Math.clamp(weather.fogAmount, 0, 1);
        this.weatherFog = fogAmount;
        this.flash = flash;
        const sunOn = sunDistance !== 0 ? 1 : 0;

        this.sunColor.copy(sample.sun).multiply(sceneTint);
        this.sunIntensity = sample.sunIntensity * (1 - darkness) * (1 - overcast * SUN_DIM) * sunOn;
        this.moonColor.copy(preset.moon.color).multiply(sceneTint);
        this.moonIntensity = preset.moon.intensity * (1 - overcast * SUN_DIM) * sunOn;

        const sunFade = THREE.MathUtils.smoothstep(elevation, SUN_HORIZON[0], SUN_HORIZON[1]);
        const moonFade = THREE.MathUtils.smoothstep(moonDirection.y, MOON_HORIZON[0], MOON_HORIZON[1]);
        this.lightIsMoon = sunFade <= 0;
        if (this.lightIsMoon) {
            this.lightColor.copy(this.moonColor);
            this.lightIntensity = this.moonIntensity * moonFade;
        } else {
            const moonShare = darkness * this.moonIntensity;
            const sunShare = this.sunIntensity;
            this.lightIntensity = (sunShare + moonShare) * sunFade;
            this.lightColor.copy(this.sunColor).lerp(this.moonColor, sunShare + moonShare > 0 ? moonShare / (sunShare + moonShare) : 0);
        }
        this.skyZenith.copy(sample.zenith);
        this.skyHorizon.copy(sample.horizon);
        this.skyGround.copy(sample.ground);
        if (overcast > 0) {
            overcastTo(this.skyZenith, overcast * SKY_GREY);
            overcastTo(this.skyHorizon, overcast * SKY_GREY);
            overcastTo(this.skyGround, overcast * SKY_GREY * 0.5);
        }
        this.ambientSky.copy(sample.ambientSky);
        this.ambientGround.copy(sample.ambientGround);
        if (overcast > 0) {
            overcastTo(this.ambientSky, overcast * 0.6);
            overcastTo(this.ambientGround, overcast * 0.4);
        }
        this.ambientIntensity = sample.ambientIntensity * (1 - overcast * AMBIENT_DIM);
        this.environmentIntensity = sample.environmentIntensity * (1 - overcast * ENVIRONMENT_DIM);

        const turbidityHaze = custom ? Math.clamp(((sky.turbidity ?? 10) - 10) / 10, 0, 1) * 0.5 : 0;
        this.haze = Math.clamp(preset.haze + turbidityHaze + overcast * 0.3 + fogAmount * 0.5, 0, 1);
        this.fogColor.copy(this.skyHorizon).lerp(this.skyZenith, 0.15);
        if (fogAmount > 0) {
            scratch.copy(weather.fogColor).multiplyScalar(Math.max(luminance(this.fogColor) / Math.max(luminance(weather.fogColor), 1e-3), 0));
            this.fogColor.lerp(scratch, fogAmount * 0.5);
        }
        this.fogDensity = Math.clamp(Math.max(preset.fog.density + this.haze * 0.2, fogAmount * WEATHER_FOG), 0, 1);
        this.fogHeight = preset.fog.height * gridSize * (1 + fogAmount * 2);

        const starScale = custom ? sky.starDensity ?? 1 : preset.stars;
        const starNight = Math.max(1 - THREE.MathUtils.smoothstep(elevation, -0.25, -0.03), darkness * 0.85);
        this.starVisibility = Math.clamp(starNight * (1 - Math.max(overcast, preset.clouds.cover * 0.5)) * starScale, 0, 1);
        this.moonPhase = sky.moonPhase ?? getSyncedMoonPhase() ?? ((((worldTime ?? 0) / 86400 / LUNAR_MONTH + MOON_PHASE_OFFSET) % 1) + 1) % 1;

        this.sunDiscSize = preset.sunDiscSize * (1 + this.twilight * 0.6);
        const mieGlow = custom ? Math.clamp(((sky.mieDirectionalG ?? 0.999) - 0.7) / 0.299, 0, 1) : 1;
        this.sunGlow = preset.sunGlow * mieGlow * (1 + this.twilight) * (1 - overcast * 0.8);

        const clouds = this.clouds;
        clouds.enabled = sky.enableClouds ?? true;
        clouds.cover = Math.clamp((custom ? sky.cloudsCover ?? preset.clouds.cover : preset.clouds.cover) + weather.cover * 0.9, 0, 1);
        clouds.density = Math.clamp(preset.clouds.density + weather.cover * 0.3, 0, 1);
        clouds.darkness = Math.clamp(preset.clouds.darkness + weather.darkness - flash * 0.4, 0, 1);
        clouds.tint.set(sky.cloudsTint ?? "#ffffff").multiply(preset.clouds.tint);
        clouds.speed = sky.cloudsSpeed ?? 1;
        clouds.scale = Math.max((10 - (sky.cloudsScale ?? 9.5)) * 2, 0.1);
        clouds.alpha = sky.cloudsAlpha ?? 0.7;
        clouds.drift.copy(weather.drift);

        this.shadowIntensity = (preset.shadow ?? 1) * (1 - overcast * OVERCAST_SHADOW);
        const grade = this.grade;
        const presetGrade = preset.grade ?? NEUTRAL_GRADE;
        grade.exposure = presetGrade.exposure;
        grade.contrast = presetGrade.contrast;
        grade.saturation = presetGrade.saturation * (1 - overcast * OVERCAST_SATURATION);
        grade.vignette = VIGNETTE;
        grade.night = presetGrade.night * (setting ? 1 : this.night);

        if (setting) this.applySetting(setting, sky.backgroundColor);
        this.updateVersion();
        if (flash > 0) this.applyFlash(flash);
        return this;
    }

    applySetting(setting, backgroundColor) {
        this.daylight = this.twilight = this.night = 0;
        this.clouds.enabled = false;
        const dim = THREE.MathUtils.lerp(1, setting.darknessDim, this.darkness);
        for (const color of this._skyColors) color.multiplyScalar(dim);
        this.ambientIntensity *= dim;
        this.environmentIntensity *= dim;
        if (backgroundColor) this.fogColor.set(backgroundColor);
    }

    applyFlash(flash) {
        this.lightIntensity += flash * FLASH_SUN;
        this.ambientIntensity += flash * FLASH_AMBIENT;
        this.environmentIntensity += flash * FLASH_ENVIRONMENT;
        this.skyZenith.lerp(FLASH_SKY, flash * 0.5);
        this.skyHorizon.lerp(FLASH_SKY, flash * 0.5);
    }

    disable() {
        this.enabled = false;
    }

    updateVersion() {
        const s = this._signature;
        let i = 0;
        for (const color of this._skyColors) {
            s[i++] = color.r;
            s[i++] = color.g;
            s[i++] = color.b;
        }
        s[i++] = this.sunDirection.x;
        s[i++] = this.sunDirection.y;
        s[i++] = this.sunDirection.z;
        s[i++] = this.lightColor.r * this.lightIntensity;
        s[i++] = this.lightColor.g * this.lightIntensity;
        s[i++] = this.lightColor.b * this.lightIntensity;
        s[i++] = this.clouds.cover;
        s[i++] = this.clouds.darkness;
        s[i++] = this.starVisibility;
        s[i++] = this.haze;
        s[i++] = this.fogDensity;
        s[i++] = this.clouds.enabled ? 1 : 0;
        const snapshot = this._snapshot;
        for (let j = 0; j < i; j++) {
            if (Math.abs(s[j] - snapshot[j]) > VERSION_EPSILON || Number.isNaN(snapshot[j])) {
                snapshot.set(s);
                this.version++;
                return;
            }
        }
    }
}
