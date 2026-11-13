import { THEMES } from "./themes.js";
import { injectConfig } from "../../lib/injectConfig.js";
import { ShaderConfig } from "../../shaders/ShaderLib.js";

const MODULE_ID = "levels-3d-preview";
const PREFIX = `flags.${MODULE_ID}`;

function fieldset(region) {
    const { fields, elements } = foundry.applications;
    const fx = region.getFlag(MODULE_ID, "regionFx") ?? {};
    const container = document.createElement("fieldset");
    container.classList.add("levels3d-region-fx");
    container.innerHTML = `<legend>${game.i18n.localize("levels3dpreview.regionFx.legend")}</legend>`;
    const theme = fields.createSelectInput({
        name: `${PREFIX}.regionFx.theme`,
        value: fx.theme ?? "",
        blank: "levels3dpreview.regionFx.theme.auto",
        options: Object.keys(THEMES).map((id) => ({ value: id, label: `levels3dpreview.regionFx.themes.${id}` })),
        localize: true,
    });
    const color = elements.HTMLColorPickerElement.create({ name: `${PREFIX}.regionFx.color`, value: fx.color ?? "" });
    const intensity = elements.HTMLRangePickerElement.create({ name: `${PREFIX}.regionFx.intensity`, value: Number(fx.intensity ?? 1), min: 0.2, max: 2, step: 0.1 });
    const particles = fields.createCheckboxInput({ name: `${PREFIX}.regionFx.particles`, value: fx.particles !== false });
    const weatherZone = fields.createSelectInput({
        name: `${PREFIX}.weatherZone`,
        value: region.getFlag(MODULE_ID, "weatherZone") ?? "",
        options: [
            { value: "", label: "levels3dpreview.regionFx.weatherZone.none" },
            { value: "shelter", label: "levels3dpreview.regionFx.weatherZone.shelter" },
        ],
        localize: true,
    });
    const groups = [
        { label: "levels3dpreview.regionFx.theme.label", hint: "levels3dpreview.regionFx.theme.hint", input: theme },
        { label: "levels3dpreview.regionFx.weatherZone.label", hint: "levels3dpreview.regionFx.weatherZone.hint", input: weatherZone },
        { label: "levels3dpreview.regionFx.color.label", hint: "levels3dpreview.regionFx.color.hint", input: color },
        { label: "levels3dpreview.regionFx.intensity.label", input: intensity },
        { label: "levels3dpreview.regionFx.particles.label", input: particles },
    ];
    for (const group of groups) container.append(fields.createFormGroup({ ...group, localize: true }));
    return container;
}

export function registerRegionConfig() {
    Hooks.on("renderRegionConfig", (app, html) => {
        html.querySelectorAll(`[data-tab="${MODULE_ID}"]`).forEach((el) => el.remove());
        injectConfig.inject(app, html, { moduleId: MODULE_ID, tab: { name: MODULE_ID, label: "3D", icon: "fas fa-cube" } });
        const tab = html.querySelector(`.tab[data-tab="${MODULE_ID}"]`);
        if (tab) {
            tab.append(fieldset(app.document));
            const shaders = document.createElement("fieldset");
            shaders.innerHTML = `<legend>${game.i18n.localize("levels3dpreview.regionFx.shaders")}</legend>`;
            tab.append(shaders);
            ShaderConfig.injectButton(app, html, shaders.querySelector("legend"));
        }
        injectConfig._trySetPosition(app, { height: "auto" });
    });
}
