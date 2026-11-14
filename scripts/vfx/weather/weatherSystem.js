import * as THREE from "three";
import { wind } from "./wind.js";
import { resolveFlag, resolveState, mixStates, emptyState } from "./presets.js";
import { PrecipitationLayer, wrapDistance } from "./precipitation.js";
import { ShelterMap } from "./shelterMap.js";
import { Atmosphere } from "./atmosphere.js";
import { getQuality } from "../quality.js";
import { sampleGlobalLight } from "../probe.js";

const MODULE_ID = "levels-3d-preview";
const TRANSITION = 4;
const BASE_SQUARES = 12;
const EDGE_SQUARES = 2;
const MIN_LIGHT = 0.1;
const CLOUD_SHADE = 0.35;
const FLASH_LIGHT = 2;
const LEVEL_SMOOTHING = 0.35;

export class WeatherSystem {
    static current = null;

    constructor(parent) {
        WeatherSystem.current?.destroy();
        WeatherSystem.current = this;
        this._parent = parent;
        this.scene = parent.scene;
        this.layers = new Map();
        this.time = 0;
        this.group = new THREE.Group();
        this.group.name = "weather";
        this.group.userData.ignoreHover = true;
        this.scene.add(this.group);
        this.shared = {
            uShelterMap: { value: null },
            uShelterRect: { value: new THREE.Vector4(0, 0, 1, 1) },
            uShelterY: { value: new THREE.Vector2(-1, 0) },
            uCenter: { value: new THREE.Vector3() },
            uBounds: { value: new THREE.Vector4() },
            uEdge: { value: 0.2 },
            uBase: { value: 1 },
            uLevel: { value: 0 },
            uMaxLevel: { value: 0 },
            uTime: { value: 0 },
            uTexel: { value: 0.01 },
            uLight: { value: new THREE.Color(1, 1, 1) },
            uGlow: { value: 1 },
        };
        this.setupVolume();
        this.atmosphere = new Atmosphere(this);
        this.state = emptyState();
        this.reload(false);
    }

    get effects() {
        return [...this.layers.values()];
    }

    get squareSize() {
        return canvas.scene.dimensions.size / this._parent.factor;
    }

    setupVolume() {
        const dimensions = canvas.scene.dimensions;
        const factor = this._parent.factor;
        const square = this.squareSize;
        const x = dimensions.sceneX / factor;
        const z = dimensions.sceneY / factor;
        const width = dimensions.sceneWidth / factor;
        const height = dimensions.sceneHeight / factor;
        this.base = BASE_SQUARES * square;
        this.maxSize = Math.max(width, height, this.base) + EDGE_SQUARES * 2 * square;
        this.shared.uBase.value = this.base;
        this.shared.uMaxLevel.value = Math.ceil(Math.log2(this.maxSize / this.base)) + 1;
        this.shared.uBounds.value.set(x, z, x + width, z + height);
        this.shared.uEdge.value = EDGE_SQUARES * square;
        this.wrap = wrapDistance(this.base, this.shared.uMaxLevel.value);
    }

    get flag() {
        return resolveFlag(canvas.scene);
    }

    reload(transition = true) {
        const flags = canvas.scene.flags[MODULE_ID] ?? {};
        const flag = getQuality().enabled ? this.flag : { preset: "none" };
        const key = JSON.stringify([flag, flag.preset === "custom" || flags.particlePresetCustom ? Object.entries(flags).filter(([name]) => name.startsWith("particle")) : null]);
        if (key === this._key) return;
        this._key = key;
        this.target = resolveState(flag, { squareSize: this.squareSize, flags });
        this.from = this.state;
        this.duration = transition ? TRANSITION : 0;
        this.progress = 0;
        this.transitioning = true;
    }

    applyState(state) {
        this.state = state;
        const context = { squareSize: this.squareSize, quality: getQuality(), shared: this.shared };
        for (const [key, layer] of this.layers) {
            if (state.layers.has(key)) continue;
            layer.dispose();
            this.layers.delete(key);
        }
        let index = 0;
        for (const [key, definition] of state.layers) {
            let layer = this.layers.get(key);
            if (!layer) {
                layer = new PrecipitationLayer(definition, this.shared, (index * 0.618) % 1);
                layer.addTo(this.group);
                this.layers.set(key, layer);
            }
            layer.apply(definition, context);
            index++;
        }
        if ((state.layers.size || state.lightning) && !this.shelter) this.shelter = new ShelterMap(this._parent, this.shared);
        this.atmosphere.setState(state);
        wind.set(state.wind.direction, state.wind.speed, state.wind.gustiness, this.squareSize);
    }

    updateTransition(delta) {
        if (!this.transitioning) return;
        this.progress = this.duration > 0 ? Math.min(this.progress + delta / this.duration, 1) : 1;
        const t = THREE.MathUtils.smoothstep(this.progress, 0, 1);
        this.applyState(t >= 1 ? this.target : mixStates(this.from, this.target, t));
        if (t >= 1) this.transitioning = false;
    }

    updateVolume(delta) {
        const L = this._parent;
        const target = L.controls?.target;
        if (!target) return;
        const distance = L.camera.position.distanceTo(target);
        const size = Math.clamp(2 * distance, this.base, this.maxSize);
        const level = Math.log2(size / this.base);
        const current = this.shared.uLevel.value;
        this.shared.uLevel.value = this.levelReady ? level + (current - level) * Math.exp(-delta / LEVEL_SMOOTHING) : level;
        this.levelReady = true;
        this.shared.uCenter.value.copy(target);
    }

    updateLight() {
        const light = sampleGlobalLight(this.shared.uLight.value);
        const scale = (1 - this.state.clouds * CLOUD_SHADE) * (1 + this.atmosphere.flash * this.state.lightning * FLASH_LIGHT);
        light.setRGB(Math.max(light.r * scale, MIN_LIGHT), Math.max(light.g * scale, MIN_LIGHT), Math.max(light.b * scale, MIN_LIGHT));
        return light;
    }

    randomGroundPoint() {
        const center = this.shared.uCenter.value;
        const size = this.base * Math.pow(2, this.shared.uLevel.value);
        const bounds = this.shared.uBounds.value;
        const x = Math.clamp(center.x + (Math.random() - 0.5) * size, bounds.x, bounds.z);
        const z = Math.clamp(center.z + (Math.random() - 0.5) * size, bounds.y, bounds.w);
        return new THREE.Vector3(x, this.shelter?.heightAt(x, z) ?? 0, z);
    }

    update(delta) {
        if (this._parent.scene !== this.scene) return;
        delta = Math.min(delta, 0.1);
        this.updateTransition(delta);
        this.time += delta;
        wind.time = this.time;
        this.shared.uTime.value = this.time;
        this.shelter?.update();
        this.updateVolume(delta);
        this.atmosphere.update(delta, { light: this.updateLight(), wind });
        if (!this.layers.size) return;
        const context = { wind, gust: wind.gustAt(this.time), squareSize: this.squareSize, wrap: this.wrap };
        for (const layer of this.layers.values()) layer.update(delta, context);
    }

    async toMacro() {
        const name = await foundry.applications.api.DialogV2.prompt({
            window: { title: "levels3dpreview.macrodialog.title" },
            content: `<div class="form-group"><label>${game.i18n.localize("levels3dpreview.macrodialog.label")}</label><div class="form-fields"><input type="text" name="macroname" placeholder="${game.i18n.localize("levels3dpreview.macrodialog.placeholder")}" required></div></div>`,
            ok: { label: "levels3dpreview.macrodialog.export", callback: (event, button) => button.form.elements.macroname.value },
        });
        if (!name) return null;
        const weather = canvas.scene.getFlag(MODULE_ID, "weather") ?? this.flag;
        return Macro.create({ name, type: "script", img: "icons/magic/air/weather-clouds-rainbow.webp", command: `await game.Levels3DPreview.vfx.weather.setWeather(${JSON.stringify(weather)});` });
    }

    setWeather(weather) {
        return setWeather(weather);
    }

    destroy() {
        for (const layer of this.layers.values()) layer.dispose();
        this.layers.clear();
        this.shelter?.dispose();
        this.shelter = null;
        this.atmosphere.dispose();
        this.group.removeFromParent();
        wind.set(0, 0, 0);
        if (WeatherSystem.current === this) WeatherSystem.current = null;
    }
}

export function setWeather(weather, scene = canvas.scene) {
    const value = weather ? foundry.data.operators.ForcedReplacement.create(weather) : foundry.data.operators.ForcedDeletion.create();
    return scene.update({ flags: { [MODULE_ID]: { weather: value } } });
}

function needsReload(changes) {
    if ("weather" in changes || "environment" in changes) return true;
    return Object.keys(changes.flags?.[MODULE_ID] ?? {}).some((key) => key.includes("weather") || key.includes("particle"));
}

Hooks.on("updateScene", (scene, changes) => {
    if (scene === canvas.scene && needsReload(changes)) WeatherSystem.current?.reload();
});

for (const hook of ["createTile", "updateTile", "deleteTile", "createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"]) {
    Hooks.on(hook, (document) => {
        if ((document.parent?.parent ?? document.parent) === canvas.scene) WeatherSystem.current?.shelter?.invalidate();
    });
}
