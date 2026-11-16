import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { SKY_DEFAULTS } from "../systems/globalIllumination.js";
import { PRESET_IDS, SETTING_IDS } from "../atmosphere/presets.js";

const MOON_PHASES = ["new", "waxingCrescent", "firstQuarter", "waxingGibbous", "full", "waningGibbous", "lastQuarter", "waningCrescent"];

export class DynamicSkyConfig extends HandlebarsApplication {

    constructor(object) {
        super(object);
        this.object = object;
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            tag: "form",
            window: {
                title: "levels3dpreview.dynamicSkyConfig.title",
                icon: "fas fa-cloud-sun",
                contentClasses: ["standard-form"],
            },
            position: {
                width: 440,
            },
            form: {
                handler: this._updateObject,
                closeOnSubmit: false,
                submitOnChange: true,
            }
        });
    }

    static get PARTS() {
        return {
            content: {
                template: `modules/levels-3d-preview/templates/dynamicSky.hbs`,
                classes: ["standard-form", "scrollable"],
            }
        }
    }

    get atmosphere() {
        if (!game.Levels3DPreview?._active || canvas.scene?.id !== this.object.id) return null;
        return game.Levels3DPreview.lights?.globalIllumination?.atmosphere ?? null;
    }

    async _prepareContext(options) {
        const data = foundry.utils.mergeObject({ ...SKY_DEFAULTS }, this.object.flags["levels-3d-preview"]?.dynamicSky ?? {});
        data.time = this.object.getFlag("levels-3d-preview", "sunPosition") ?? 12;
        data.settings = Object.fromEntries(SETTING_IDS.map((id) => [id, `levels3dpreview.dynamicSkyConfig.settings.${id}`]));
        data.presets = Object.fromEntries(PRESET_IDS.map((id) => [id, `levels3dpreview.dynamicSkyConfig.presets.${id}`]));
        data.moonPhases = { "": "levels3dpreview.dynamicSkyConfig.moonPhase.auto" };
        MOON_PHASES.forEach((phase, i) => (data.moonPhases[i / MOON_PHASES.length] = `levels3dpreview.dynamicSkyConfig.moonPhase.${phase}`));
        data.moonPhase = data.moonPhase ?? "";
        return data;
    }

    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        this.element.addEventListener("input", () => this._preview());
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this.element.querySelectorAll("select[name$='dynamicSky.preset'], select[name$='dynamicSky.setting']").forEach((select) => select.addEventListener("change", () => this._toggleFields()));
        this._toggleFields();
    }

    _toggleFields() {
        const value = (name) => this.element.querySelector(`select[name$='dynamicSky.${name}']`).value;
        const setting = value("setting");
        const outdoor = setting === "outdoor";
        const toggle = (selector, visible) => this.element.querySelectorAll(selector).forEach((el) => el.classList.toggle("hidden", !visible));
        toggle("[data-custom-only]", value("preset") === "custom");
        toggle("[data-outdoor-only]", outdoor);
        toggle("[data-indoor-only]", !outdoor);
        toggle("[data-timed]", setting !== "underground");
        this.setPosition({ height: "auto" });
    }

    _preview() {
        const atmosphere = this.atmosphere;
        if (!atmosphere) return;
        const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object).flags["levels-3d-preview"];
        const sky = data.dynamicSky;
        const time = Number(data.sunPosition);
        atmosphere.setOverride({ enabled: sky.enabled, preset: sky.preset, time, sky });
        if (!sky.enabled) game.Levels3DPreview.lights.globalIllumination.setTarget({ time });
    }

    _onClose(options) {
        super._onClose(options);
        this.atmosphere?.setOverride(null);
    }

    static _updateObject(event, form, formData) {
        this.object.update(formData.object);
    }
}
