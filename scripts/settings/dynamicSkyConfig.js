import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { SKY_DEFAULTS } from "../systems/globalIllumination.js";

export class DynamicSkyConfig extends HandlebarsApplication {

    constructor(object) {
        super(object);
        this.object = object;
        this._onSubmit = foundry.utils.debounce(this._onSubmit.bind(this), 100);
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            tag: "form",
            window: {
                title: "levels3dpreview.dynamicSkyConfig.title",
                contentClasses: ["standard-form"],
            },
            position: {
                width: 400,
            },
            form: {
                handler: this._updateObject,
                closeOnSubmit: false,
                submitOnChange: false,
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

    async _prepareContext(options) {
        return foundry.utils.mergeObject({ ...SKY_DEFAULTS }, this.object.flags["levels-3d-preview"]?.dynamicSky ?? {});
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        html.querySelectorAll("input, select, checkbox").forEach((el) => {
            el.addEventListener("change", this._onSubmit.bind(this));
        });
    }

    static _updateObject(event) {
        const form = this.element;
        const formData = new foundry.applications.ux.FormDataExtended(form).object;
        formData = foundry.utils.expandObject(formData);
        this.object.update(formData);
    }
}
