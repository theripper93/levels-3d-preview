import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

const MODULE_ID = "levels-3d-preview";

export const GRAPHICS_SETTINGS = ["resolutionMultiplier", "effectsQuality", "ambientOcclusion", "shadowQuality", "softShadows", "antialiasing", "fowQuality", "dofblur", "enableShaders", "reduceMotion"];

const performancePresets = {
    verylow: {
        ambientOcclusion: "off",
        softShadows: false,
        shadowQuality: 0,
        antialiasing: "none",
        fowQuality: 0.1,
        enableShaders: false,
        effectsQuality: "off",
    },
    low: {
        ambientOcclusion: "off",
        softShadows: false,
        shadowQuality: 0,
        antialiasing: "none",
        fowQuality: 0.25,
        enableShaders: true,
        effectsQuality: "low",
    },
    medium: {
        ambientOcclusion: "low",
        softShadows: false,
        shadowQuality: 2,
        antialiasing: "fxaa",
        fowQuality: 0.5,
        enableShaders: true,
        effectsQuality: "medium",
    },
    high: {
        ambientOcclusion: "medium",
        softShadows: true,
        shadowQuality: 4,
        antialiasing: "smaa",
        fowQuality: 0.75,
        enableShaders: true,
        effectsQuality: "high",
    },
    veryhigh: {
        ambientOcclusion: "high",
        softShadows: true,
        shadowQuality: 8,
        antialiasing: "smaa",
        fowQuality: 1,
        enableShaders: true,
        effectsQuality: "ultra",
    },
};

export function setPerformancePreset() {
    new GraphicsSettings().render(true);
}

function findCurrentPreset(values) {
    for (const [id, preset] of Object.entries(performancePresets)) {
        if (Object.entries(preset).every(([key, value]) => values[key] === value)) return id;
    }
    return "custom";
}

function presetDescription(id) {
    return game.i18n.localize(`levels3dpreview.performance.description.${id}`);
}

function createField(setting) {
    const fields = foundry.data.fields;
    let field;
    if (setting.type instanceof fields.DataField) field = setting.type;
    else if (setting.type === Boolean) field = new fields.BooleanField({ initial: setting.default ?? false });
    else if (setting.type === Number) field = new fields.NumberField({ required: true, choices: setting.choices, initial: setting.default, ...setting.range });
    else field = new fields.StringField({ required: true, choices: setting.choices });
    field.name = setting.key;
    field.label ||= game.i18n.localize(setting.name ?? "");
    field.hint ||= game.i18n.localize(setting.hint ?? "");
    return field;
}

function resolutionHint(resMulti) {
    const dpr = game.settings.get("core", "pixelRatioResolutionScaling") ? window.devicePixelRatio : 1;
    const width = Math.round(window.innerWidth * dpr * resMulti);
    const height = Math.round(window.innerHeight * dpr * resMulti);
    const level = width > 3000 ? "error" : width > 2000 ? "warning" : "success";
    const resolution = `<strong data-tooltip="${game.i18n.localize("levels3dpreview.performance.settings.resolutionTooltip")}" style="cursor: help; color: var(--color-level-${level})">${width}x${height}</strong>`;
    return game.i18n.localize("levels3dpreview.performance.settings.resolution").replace("{resolution}", resolution);
}

export class GraphicsSettings extends HandlebarsApplication {
    #fields = new Map();

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            id: "levels-3d-preview-graphics-settings",
            tag: "form",
            window: {
                title: "levels3dpreview.performance.settings.title",
                icon: "fas fa-display",
                contentClasses: ["standard-form"],
            },
            position: {
                width: 560,
            },
            form: {
                handler: this._onSubmit,
                closeOnSubmit: true,
            },
        });
    }

    static get PARTS() {
        return {
            content: {
                template: `modules/${MODULE_ID}/templates/config/graphics-settings.hbs`,
                classes: ["scrollable"],
            },
            footer: {
                template: "templates/generic/form-footer.hbs",
            },
        };
    }

    async _prepareContext(options) {
        this.#fields.clear();
        const settings = [];
        const values = {};
        for (const key of GRAPHICS_SETTINGS) {
            const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
            if (!setting) continue;
            const field = createField(setting);
            this.#fields.set(key, field);
            values[key] = game.settings.get(MODULE_ID, key);
            settings.push({ field, value: values[key] });
        }
        const preset = findCurrentPreset(values);
        return {
            settings,
            preset,
            presetDescription: presetDescription(preset),
            presetOptions: Object.fromEntries([...Object.keys(performancePresets), "custom"].map((id) => [id, `levels3dpreview.performance.${id}`])),
            resolutionHint: resolutionHint(values.resolutionMultiplier ?? 1),
            buttons: [{ type: "submit", icon: "fas fa-save", label: "levels3dpreview.settings.configApp.save" }],
        };
    }

    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        this.element.addEventListener("change", (event) => {
            const isPreset = event.target.name === "preset";
            if (isPreset) this.#applyPreset(event.target.value);
            this.#refresh(isPreset && event.target.value === "custom");
        });
    }

    #readForm() {
        const data = new foundry.applications.ux.FormDataExtended(this.element).object;
        const values = {};
        for (const [key, field] of this.#fields) values[key] = field.clean(data[key]);
        return values;
    }

    #refresh(keepCustom = false) {
        const values = this.#readForm();
        const preset = keepCustom ? "custom" : findCurrentPreset(values);
        this.element.elements.preset.value = preset;
        this.element.querySelector(".preset-description").textContent = presetDescription(preset);
        this.element.querySelector(".resolution-hint").innerHTML = resolutionHint(values.resolutionMultiplier ?? 1);
    }

    #applyPreset(id) {
        if (!performancePresets[id]) return;
        const preset = performancePresets[id];
        for (const [key, value] of Object.entries(preset)) {
            const input = this.element.elements[key];
            if (!input) continue;
            if (input.type === "checkbox") input.checked = value;
            else input.value = input.tagName === "SELECT" ? String(value) : value;
        }
    }

    static async _onSubmit(event, form, formData) {
        const values = this.#readForm();
        let requiresReload = false;
        for (const [key, value] of Object.entries(values)) {
            if (value === game.settings.get(MODULE_ID, key)) continue;
            requiresReload ||= !!game.settings.settings.get(`${MODULE_ID}.${key}`).requiresReload;
            await game.settings.set(MODULE_ID, key, value);
        }
        if (requiresReload) foundry.applications.settings.SettingsConfig.reloadConfirm({ world: false });
    }
}
