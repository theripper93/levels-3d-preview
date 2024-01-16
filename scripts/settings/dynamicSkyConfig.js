import { SKY_DEFAULTS } from "../systems/globalIllumination.js";

export class DynamicSkyConfig extends FormApplication {
    constructor (object) {
        super(object);
        this.object = object;
        this._onSubmit = debounce(this._onSubmit.bind(this), 100);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "dynamic-sky-config",
            title: game.i18n.localize("levels3dpreview.dynamicSkyConfig.title"),
            template: "modules/levels-3d-preview/templates/dynamicSky.hbs",
            classes: [],
            width: 400,
            height: "auto",
            closeOnSubmit: false,
            submitOnClose: true,
        });
    }

    getData() {
        return foundry.utils.mergeObject({...SKY_DEFAULTS}, this.object.flags["levels-3d-preview"]?.dynamicSky ?? {})
    }

    activateListeners(html) {
        super.activateListeners(html);
        html[0].querySelectorAll("input, select, checkbox").forEach(el => {
            el.addEventListener("change", this._onSubmit.bind(this));
        });
    }

    _updateObject(event, formData) {
        formData = expandObject(formData);
        this.object.update(formData);
    }
}
