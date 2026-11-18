const MODULE_ID = "levels-3d-preview";
const PP_FIELD = `flags.${MODULE_ID}.pp`;
const NEUTRAL = { tint: "#ffffff", contrast: 1, brightness: 1, saturation: 1, sepia: 0, hue: 0, vignette: 0, chromaticAberration: 0, grain: 0 };
const SCALED = ["contrast", "brightness", "saturation"];
const FILTER_FLAGS = ["filter", "filterStrength", "filterCustom"];

export const LOOK_PRESETS = {
    none: { enabled: false },
    warm: { enabled: true, tint: "#fff0dc", contrast: 1.05, saturation: 1.1 },
    cold: { enabled: true, tint: "#e2ecff", contrast: 1.05, saturation: 0.9 },
    dramatic: { enabled: true, contrast: 1.2, saturation: 1.15, vignette: 0.35 },
    noir: { enabled: true, contrast: 1.25, saturation: 0, vignette: 0.4, grain: 0.04 },
    vintage: { enabled: true, contrast: 0.92, sepia: 0.55, vignette: 0.3, grain: 0.06 },
    dreamy: { enabled: true, brightness: 1.06, contrast: 0.9, saturation: 0.85, vignette: 0.2 },
};

const FILTER_GRADING = {
    grayscale: (strength) => ({ saturation: 1 - Math.min(strength, 1) }),
    sepia: (strength) => ({ sepia: Math.min(strength, 1) }),
    contrast: (strength) => ({ contrast: strength }),
    brightness: (strength) => ({ brightness: strength }),
    saturate: (strength) => ({ saturation: strength }),
    "hue-rotate": (strength) => ({ hue: strength * 180 }),
};

export function lookPresetField(scene) {
    const pp = scene.flags[MODULE_ID]?.pp;
    const options = Object.fromEntries([...Object.keys(LOOK_PRESETS), "custom"].map((id) => [id, game.i18n.localize(`levels3dpreview.sceneConfig.look.presets.${id}`)]));
    return {
        type: "select",
        label: game.i18n.localize("levels3dpreview.sceneConfig.look.label"),
        notes: game.i18n.localize("levels3dpreview.sceneConfig.look.notes"),
        default: pp?.enabled ? "custom" : "none",
        options,
    };
}

export function lookPresetValues(id) {
    const preset = LOOK_PRESETS[id];
    return preset ? { ...NEUTRAL, ...preset } : null;
}

function setInput(input, value) {
    if (input.type === "checkbox") input.checked = value;
    else input.value = value;
}

export function activateLookPreset(html) {
    const select = html.querySelector(`[name="${PP_FIELD}.preset"]`);
    if (!select) return;
    const inputs = Array.from(html.querySelectorAll(`[name^="${PP_FIELD}."]`)).filter((input) => input !== select);
    let applying = false;
    select.addEventListener("change", () => {
        const preset = LOOK_PRESETS[select.value];
        if (!preset) return;
        const values = { ...NEUTRAL, ...preset };
        applying = true;
        for (const input of inputs) {
            const key = input.name.slice(PP_FIELD.length + 1);
            if (key in values) setInput(input, values[key]);
        }
        applying = false;
    });
    inputs.forEach((input) => input.addEventListener("change", () => {
        if (!applying) select.value = "custom";
    }));
}

export function filterMigration(scene) {
    const flags = scene.flags[MODULE_ID];
    if (!flags || !FILTER_FLAGS.some((flag) => flag in flags)) return null;
    const update = Object.fromEntries(FILTER_FLAGS.map((flag) => [flag, foundry.data.operators.ForcedDeletion.create()]));
    const grade = FILTER_GRADING[flags.filter]?.(Number(flags.filterStrength ?? 1));
    if (grade) {
        update.pp = { enabled: true, preset: "custom" };
        for (const [key, value] of Object.entries(grade)) update.pp[key] = SCALED.includes(key) ? (flags.pp?.[key] ?? 1) * value : value;
    }
    return { flags: { [MODULE_ID]: update } };
}

export async function migrateSceneFilters() {
    if (!game.user.isGM) return;
    const updates = game.scenes.map((scene) => {
        const update = filterMigration(scene);
        return update && { _id: scene.id, ...update };
    }).filter(Boolean);
    if (updates.length) await Scene.updateDocuments(updates);
}
