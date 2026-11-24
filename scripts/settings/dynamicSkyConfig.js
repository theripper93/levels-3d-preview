import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { SKY_DEFAULTS, darknessAtTime, isDynamicSkyEnabled } from "../systems/globalIllumination.js";
import { PRESET_IDS, SETTING_IDS } from "../atmosphere/presets.js";
import { STYLE_GROUPS, getSkyStyle, getSkyStyles, skyStyleId, styleOptions, styleUsesTime, undergroundStyleId } from "../atmosphere/sky/registry.js";

const BUSY_TIMEOUT = 60000;
const MOON_PHASES =["new", "waxingCrescent", "firstQuarter", "waxingGibbous", "full", "waningGibbous", "lastQuarter", "waningCrescent"];

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
        data.enabled = isDynamicSkyEnabled(this.object);
        data.time = this.object.getFlag("levels-3d-preview", "sunPosition") ?? 12;
        data.settings = Object.fromEntries(SETTING_IDS.map((id) => [id, `levels3dpreview.dynamicSkyConfig.settings.${id}`]));
        data.presets = Object.fromEntries(PRESET_IDS.map((id) => [id, `levels3dpreview.dynamicSkyConfig.presets.${id}`]));
        data.moonPhases = { "": "levels3dpreview.dynamicSkyConfig.moonPhase.auto" };
        MOON_PHASES.forEach((phase, i) => (data.moonPhases[i / MOON_PHASES.length] = `levels3dpreview.dynamicSkyConfig.moonPhase.${phase}`));
        data.moonPhase = data.moonPhase ?? "";
        data.style = skyStyleId(data);
        data.undergroundStyle = undergroundStyleId(data);
        data.outdoorStyles = this._styleGroups("outdoor", data.style);
        data.undergroundStyles = this._styleGroups("underground", data.undergroundStyle);
        data.styleFields = getSkyStyles()
            .filter((style) => style.fields.length)
            .map((style) => {
                const values = styleOptions(style, data);
                const fields = style.fields.map((field) => ({
                    ...field,
                    name: `flags.levels-3d-preview.dynamicSky.styles.${style.id}.${field.name}`,
                    label: `levels3dpreview.skyStyles.${style.id}.fields.${field.name}`,
                    value: values[field.name],
                }));
                return { id: style.id, label: style.label, fields };
            });
        return data;
    }

    _styleGroups(active, selected) {
        const styles = getSkyStyles();
        const groups = [active, ...STYLE_GROUPS.filter((group) => group !== active)];
        return groups.map((group) => {
            const choices = styles.filter((style) => style.group === group).map((style) => ({ value: style.id, label: style.label }));
            if (group === "underground") choices.unshift({ value: "", label: "levels3dpreview.dynamicSkyConfig.styleStandard" });
            return {
                label: `levels3dpreview.dynamicSkyConfig.styleGroups.${group}`,
                disabled: group !== active,
                choices: choices.map((choice) => ({ ...choice, selected: group === active && choice.value === selected })),
            };
        });
    }

    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        this.element.addEventListener("input", () => this._preview());
        this._busyHook = Hooks.on("3DCanvasSkyCompile", (busy) => this._setBusy(busy));
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this._disabled = null;
        this._setBusy(!!game.Levels3DPreview?.lights?.globalIllumination?.styles?.busy && !!this.atmosphere);
        this.element.querySelectorAll("select[name$='dynamicSky.preset'], select[name$='dynamicSky.setting'], select[name$='dynamicSky.style'], select[name$='dynamicSky.undergroundStyle']").forEach((select) => select.addEventListener("change", () => this._toggleFields()));
        this._toggleFields();
    }

    _toggleFields() {
        const value = (name) => this.element.querySelector(`select[name$='dynamicSky.${name}']`).value;
        const setting = value("setting");
        const outdoor = setting === "outdoor";
        const style = getSkyStyle(value("style"));
        const activeStyle = outdoor ? style.id : value("undergroundStyle");
        const options = new Set(style.options);
        const rules = { customOnly: value("preset") === "custom", outdoorOnly: outdoor, indoorOnly: !outdoor, timed: setting !== "underground" };
        for (const el of this.element.querySelectorAll("[data-custom-only], [data-outdoor-only], [data-indoor-only], [data-timed], [data-sky-option], [data-style-fields]")) {
            const data = el.dataset;
            const visible = Object.entries(rules).every(([key, allowed]) => allowed || !(key in data)) && (!data.skyOption || data.skyOption.split(" ").some((option) => options.has(option))) && (!("styleFields" in data) || data.styleFields === activeStyle);
            el.classList.toggle("hidden", !visible);
        }
        this.setPosition({ height: "auto" });
    }

    _preview() {
        const atmosphere = this.atmosphere;
        if (!atmosphere) return;
        const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object).flags["levels-3d-preview"];
        const sky = data.dynamicSky;
        const time = Number(data.sunPosition);
        const darkness = sky.enabled && sky.setting === "outdoor" && styleUsesTime(sky) && game.Levels3DPreview.lights.globalIllumination.darknessDrivesSky ? darknessAtTime(this.object, time) : undefined;
        atmosphere.setOverride({ enabled: sky.enabled, preset: sky.preset, time, sky, darkness });
        if (!sky.enabled) game.Levels3DPreview.lights.globalIllumination.setTarget({ time });
    }

    _setBusy(busy) {
        if (!this.element) return;
        clearTimeout(this._busyTimeout);
        if (busy && !this.atmosphere) return;
        this.element.classList.toggle("sky-busy", busy);
        let overlay = this.element.querySelector(".sky-busy-overlay");
        if (busy && !overlay) {
            overlay = document.createElement("div");
            overlay.className = "sky-busy-overlay";
            overlay.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${game.i18n.localize("levels3dpreview.dynamicSkyConfig.compiling")}`;
            this.element.querySelector(".window-content").append(overlay);
        }
        if (!busy) overlay?.remove();
        if (busy && !this._disabled) {
            this._disabled = [...this.element.querySelectorAll(".window-content :is(input, select, textarea, button, color-picker, range-picker)")].filter((el) => !el.disabled);
            this._disabled.forEach((el) => (el.disabled = true));
            this._busyTimeout = setTimeout(() => this._setBusy(false), BUSY_TIMEOUT);
        } else if (!busy && this._disabled) {
            this._disabled.forEach((el) => (el.disabled = false));
            this._disabled = null;
        }
    }

    _onClose(options) {
        super._onClose(options);
        clearTimeout(this._busyTimeout);
        Hooks.off("3DCanvasSkyCompile", this._busyHook);
        this.atmosphere?.setOverride(null);
    }

    static _updateObject(event, form, formData) {
        this.object.update(formData.object);
    }
}
