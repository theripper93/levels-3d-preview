import { LIGHT_PRESETS, getLightPresetUpdate } from "./presets.js";

const MODULE_ID = "levels-3d-preview";
const L10N = "levels3dpreview.lightFx";

export function lightFxConfigFields() {
    const localize = (key) => game.i18n.localize(`${L10N}.${key}`);
    const buttons = Object.entries(LIGHT_PRESETS)
        .map(([id, preset]) => `<button type="button" data-light-preset="${id}"><i class="${preset.icon}"></i> ${localize(`presets.${id}`)}</button>`)
        .join("");
    return {
        lightFxHeader: {
            type: "custom",
            html: `<fieldset><legend><i class="fas fa-sun"></i> ${localize("header.title")}</legend><p class="hint">${localize("header.notes")}</p><div class="form-group"><label>${localize("presets.label")}</label><div class="form-fields">${buttons}</div></div>`,
        },
        lightHalo: { type: "checkbox", label: localize("lightHalo.label"), notes: localize("lightHalo.notes"), default: false },
        lightHaloScale: { type: "range", label: localize("lightHaloScale.label"), default: 1, min: 0.25, max: 4, step: 0.05 },
        lightShaft: { type: "checkbox", label: localize("lightShaft.label"), notes: localize("lightShaft.notes"), default: false },
        lightShaftIntensity: { type: "range", label: localize("lightShaftIntensity.label"), default: 0.35, min: 0.05, max: 1, step: 0.05 },
        lightShaftMotes: { type: "checkbox", label: localize("lightShaftMotes.label"), default: true },
        lightFxEnd: { type: "custom", html: "</fieldset>" },
    };
}

function setInput(html, name, value) {
    const input = html.querySelector(`[name="${name}"]`);
    if (!input) return null;
    if (input.type === "checkbox") input.checked = value;
    else input.value = value;
    return input;
}

function syncForm(html, update) {
    const values = foundry.utils.flattenObject(update);
    const typeKey = `flags.${MODULE_ID}.ParticleType`;
    if (typeKey in values) setInput(html, typeKey, values[typeKey])?.dispatchEvent(new Event("change", { bubbles: true }));
    let last = null;
    for (const [name, value] of Object.entries(values)) if (name !== typeKey) last = setInput(html, name, value) ?? last;
    last?.dispatchEvent(new Event("change", { bubbles: true }));
}

export function activateLightFxConfig(app, html) {
    html.querySelectorAll("[data-light-preset]").forEach((button) => {
        button.addEventListener("click", async () => {
            const update = getLightPresetUpdate(button.dataset.lightPreset, app.document.parent);
            if (!update) return;
            await app.document.update(update);
            syncForm(app.element, update);
        });
    });
}
