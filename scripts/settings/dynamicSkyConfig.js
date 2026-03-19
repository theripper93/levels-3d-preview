import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { SKY_DEFAULTS } from "../systems/globalIllumination.js";

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
                contentClasses: ["standard-form"],
            },
            position: {
                width: 400,
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

    async _prepareContext(options) {
        return foundry.utils.mergeObject({ ...SKY_DEFAULTS }, this.object.flags["levels-3d-preview"]?.dynamicSky ?? {});
    }

    static _updateObject(event, form, formData) {
        this.object.update(formData.object);
    }
}
