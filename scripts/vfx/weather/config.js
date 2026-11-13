import { PRESETS, presetDefaults } from "./presets.js";

const MODULE_ID = "levels-3d-preview";
const FIELD = `flags.${MODULE_ID}.weather`;

function localize(key) {
    return game.i18n.localize(`levels3dpreview.weather.${key}`);
}

function presetOptions(ids) {
    return Object.fromEntries(ids.map((id) => [id, localize(`presets.${id}`)]));
}

function legacyPreset(id) {
    return id in PRESETS ? id : "none";
}

function range(label, defaultValue, max = 1, step = 0.01) {
    return { type: "range", label: localize(label), default: defaultValue, min: 0, max, step };
}

export function weatherConfigFields(scene) {
    const flags = scene.flags[MODULE_ID] ?? {};
    const preset = flags.weather?.preset ?? legacyPreset(flags.particlePreset);
    const defaults = presetDefaults(preset);
    const ids = Object.keys(PRESETS);
    return {
        "weather.preset": { type: "select", label: localize("preset"), notes: localize("presetNotes"), default: preset, options: presetOptions(ids) },
        "weather.layer2": { type: "select", label: localize("layer2"), default: legacyPreset(flags.particlePreset2), options: presetOptions(ids.filter((id) => id !== "custom")) },
        "weather.intensity": range("intensity", 1),
        "weather.wind.direction": range("windDirection", defaults.wind.direction, 360, 5),
        "weather.wind.speed": range("windSpeed", defaults.wind.speed),
        "weather.wind.gustiness": range("gustiness", defaults.wind.gustiness),
        "weather.fog": range("fog", defaults.fog),
        "weather.lightning": range("lightning", defaults.lightning),
        "weather.linkSky": { type: "checkbox", label: localize("linkSky"), notes: localize("linkSkyNotes"), default: true },
    };
}

function setInput(html, name, value) {
    const input = html.querySelector(`[name="${FIELD}.${name}"]`);
    if (input) input.value = Math.round(value * 100) / 100;
}

export function activateWeatherConfig(app, html, setPosition) {
    const select = html.querySelector(`[name="${FIELD}.preset"]`);
    if (!select) return;
    const toggleCustom = () => {
        html.querySelector("#part-group")?.classList.toggle("hidden", select.value !== "custom");
        setPosition();
    };
    select.addEventListener("change", () => {
        const intensity = Number(html.querySelector(`[name="${FIELD}.intensity"]`)?.value ?? 1);
        const defaults = presetDefaults(select.value, intensity);
        setInput(html, "wind.direction", defaults.wind.direction);
        setInput(html, "wind.speed", defaults.wind.speed);
        setInput(html, "wind.gustiness", defaults.wind.gustiness);
        setInput(html, "fog", defaults.fog);
        setInput(html, "lightning", defaults.lightning);
        toggleCustom();
    });
    toggleCustom();
}
