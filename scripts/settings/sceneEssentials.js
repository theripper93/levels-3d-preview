import { weatherConfigFields } from "../vfx/weather/config.js";
import { presetDefaults } from "../vfx/weather/presets.js";
import { lookPresetField, lookPresetValues } from "./sceneLook.js";

const MODULE_ID = "levels-3d-preview";

export function essentialsFields(scene) {
    const flags = scene.flags[MODULE_ID] ?? {};
    const flag = (key) => game.i18n.localize(`levels3dpreview.flags.${key}`);
    const weather = weatherConfigFields(scene);
    const look = lookPresetField(scene);
    const select = (key, field, value) => ({ key, type: "select", label: field.label, notes: field.notes, value, options: Object.entries(field.options).map(([id, label]) => ({ id, label, selected: id === value })) });
    return [
        { key: "sunPosition", type: "range", label: flag("sunPosition.label"), value: flags.sunPosition ?? 9, min: 0, max: 24, step: 0.5 },
        select("weather.preset", weather["weather.preset"], weather["weather.preset"].default),
        { key: "weather.intensity", type: "range", label: weather["weather.intensity"].label, value: flags.weather?.intensity ?? 1, min: 0, max: 1, step: 0.01 },
        select("pp.preset", look, flags.pp?.preset ?? look.default),
    ];
}

export function essentialsUpdate(scene, key, value) {
    const flags = scene.flags[MODULE_ID] ?? {};
    if (key === "weather.preset") {
        const defaults = presetDefaults(value, Number(flags.weather?.intensity ?? 1));
        return { [`flags.${MODULE_ID}.weather`]: { preset: value, wind: defaults.wind, fog: defaults.fog, lightning: defaults.lightning } };
    }
    if (key === "pp.preset") {
        const values = lookPresetValues(value);
        return { [`flags.${MODULE_ID}.pp`]: values ? { ...values, preset: value } : { preset: value } };
    }
    if (key === "sunPosition" || key === "weather.intensity") return { [`flags.${MODULE_ID}.${key}`]: Number(value) };
    return null;
}
