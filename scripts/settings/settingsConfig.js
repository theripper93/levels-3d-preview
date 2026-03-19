import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

class canvas3dConfig extends HandlebarsApplication {

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            id: "levels-3d-preview-settings",
            tag: "form",
            window: {
                title: "levels3dpreview.settings.configApp.title",
                contentClasses: ["standard-form"],
            },
            position: {
                width: 600,
                // height: 600,
            },
            form: {
                handler: this._updateObject,
                closeOnSubmit: false,
                submitOnChange: false,
            }
        });
    }

    // static get PARTS() {
    //     return {
    //         content: {
    //             template: `modules/levels-3d-preview/templates/config.hbs`,
    //             classes: ["standard-form", "scrollable"],
    //         },
    //         footer: {
    //             template: "templates/generic/form-footer.hbs",
    //         }
    //     }
    // }

    static get PARTS() {
        return {
            tabs: {
                // template: 'modules/levels-3d-preview/templates/config/tab-navigation.hbs',
                template: 'templates/generic/tab-navigation.hbs',
            },
            base: {
                template: 'modules/levels-3d-preview/templates/config/tab-base.hbs',
                classes: ["scrollable"],
            },
            canvas: {
                template: 'modules/levels-3d-preview/templates/config/tab-canvas.hbs',
                classes: ["scrollable"],
            },
            token: {
                template: 'modules/levels-3d-preview/templates/config/tab-token.hbs',
                classes: ["scrollable"],
            },
            perm: {
                template: 'modules/levels-3d-preview/templates/config/tab-perm.hbs',
                classes: ["scrollable"],
            },
            gc: {
                template: 'modules/levels-3d-preview/templates/config/tab-gc.hbs',
                classes: ["scrollable"],
            },
            tools: {
                template: 'modules/levels-3d-preview/templates/config/tab-tools.hbs',
                classes: ["scrollable"],
            },
            misc: {
                template: 'modules/levels-3d-preview/templates/config/tab-misc.hbs',
                classes: ["scrollable"],
            },
            footer: {
                template: "templates/generic/form-footer.hbs",
            }
        }
    };

    static get TABS() {
        return {
            primary: {
                tabs: [
                    { id: "canvas", icon: "fas fa-map", label: "levels3dpreview.settings.configApp.tabs.canvas" },
                    { id: "token", icon: "fas fa-user-alt", label: "levels3dpreview.settings.configApp.tabs.token" },
                    { id: "base", icon: "fas fa-dot-circle", label: "levels3dpreview.settings.configApp.tabs.base" },
                    { id: "perm", icon: "fas fa-user-lock", label: "levels3dpreview.settings.configApp.tabs.perm" },
                    { id: "gc", icon: "fas fa-video", label: "levels3dpreview.settings.configApp.tabs.gc" },
                    { id: "tools", icon: "fas fa-tools", label: "levels3dpreview.settings.configApp.tabs.tools" },
                    { id: "misc", icon: "fas fa-cogs", label: "levels3dpreview.settings.configApp.tabs.misc" },
                ],
                initial: "canvas",
            },
        }
    };

    async _prepareContext(options) {
        const data = {};
        const settingsKeys = ["useRaycastRuler", "paddingAppearance", "lightCacheSize", "pingsound", "lightHelpers", "templateEffects", "templateAuto3D", "enableReticule", "fullTransparency", "outline", "gameCameraWarnings", "gameCameraAutoLock", "gameCameraDefaultGm", "gameCameraClipping", "gameCameraMaxZoom", "gameCameraMinAzimuth", "gameCameraMaxAzimuth", "gameCameraMinAngle", "gameCameraMaxAngle", "enableGameCamera", "rangeFinder", "sharedContext", "rotateIndicator", "navigatorAuto", "showAdvanced", "canpingpan", "canping", "baseStyle", "solidBaseMode", "solidBaseColor", "highlightCombat", "startMarker", "hideTarget", "hideEffects", "templateSyle", "autoPan", "flatTokenStyle", "preventNegative", "miniCanvas", "debugMode", "cameralockzero", "allTokens", "autoAssignToken", "assetBrowserCustomPath", "autoApply", "autoClose"];
        for (let key of settingsKeys) {
            data[key] = game.settings.get("levels-3d-preview", key);
        }
        data.CONFIG = game.Levels3DPreview.CONFIG;
        data.tabs = this._prepareTabs("primary");
        data.buttons = [{
            type: "submit",
            action: "submit",
            icon: "fas fa-save",
            label: "levels3dpreview.settings.configApp.save",
        }];
        return data;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        html.querySelectorAll('input[type="color"]').forEach(el => {
            el.addEventListener("change", this._colorChange.bind(this));
        });
    }

    _colorChange(e) {
        const input = e.target;
        const edit = input.dataset.edit;
        const value = input.value;
        this.element.querySelector(`input[name="${edit}"]`).value = value;
    }

    static async _updateObject(event) {
        const form = this.element;
        const formData = new foundry.applications.ux.FormDataExtended(form).object;
        for (let [key, value] of Object.entries(formData)) {
            await game.settings.set("levels-3d-preview", key, value);
        }
        game.settings.set("levels-3d-preview", "sceneReload", !game.settings.get("levels-3d-preview", "sceneReload"));
    }
}

export function registerSettings() {
    Hooks.once("canvasConfig", (canvasConfig) => {
        game.settings.register("levels-3d-preview", "resolutionMultiplier", {
            name: game.i18n.localize("levels3dpreview.settings.resolutionMultiplier.name"),
            hint: game.i18n.localize("levels3dpreview.settings.resolutionMultiplier.hint"),
            scope: "client",
            config: true,
            type: Number,
            range: {
                min: 0.25,
                max: 2,
                step: 0.05,
            },
            default: 1,
            requiresReload: true,
        });
        const resFactor = (window.innerHeight * (game.settings.get("core", "pixelRatioResolutionScaling") ? window.devicePixelRatio : 1)) / 2160;
        document.documentElement.style.setProperty("--levels3d-ruler-font-size", `${game.settings.get("levels-3d-preview", "resolutionMultiplier") * resFactor * 6}rem`);
        canvasConfig.resolution *= game.settings.get("levels-3d-preview", "resolutionMultiplier");
    });

    Hooks.on("renderSettingsConfig", (app, html, data) => {
        game.Levels3DPreview.helpers.injectPresetButtons(html);
    });

    Hooks.once("init", function () {
        game.settings.register("levels-3d-preview", "sceneReload", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
            onChange: () => {
                if (game.Levels3DPreview?._active) {
                    game.Levels3DPreview.reload();
                }
            },
        });

        game.settings.register("levels-3d-preview", "paddingAppearance", {
            scope: "world",
            config: false,
            type: String,
            default: "matpaper",
        });

        //game camera
        game.settings.register("levels-3d-preview", "enableGameCamera", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "gameCameraMaxAngle", {
            scope: "world",
            config: false,
            type: Number,
            default: 45,
        });

        game.settings.register("levels-3d-preview", "gameCameraMinAngle", {
            scope: "world",
            config: false,
            type: Number,
            default: 45,
        });

        game.settings.register("levels-3d-preview", "gameCameraMaxAzimuth", {
            scope: "world",
            config: false,
            type: Number,
            default: 180,
        });

        game.settings.register("levels-3d-preview", "gameCameraMinAzimuth", {
            scope: "world",
            config: false,
            type: Number,
            default: -180,
        });

        game.settings.register("levels-3d-preview", "gameCameraMaxZoom", {
            scope: "world",
            config: false,
            type: Number,
            default: 1,
        });

        game.settings.register("levels-3d-preview", "gameCameraClipping", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "gameCameraDefaultGm", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "gameCameraWarnings", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "gameCameraAutoLock", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "removeKeybindingsPrompt", {
            scope: "client",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "shaderAutoSave", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.registerMenu("levels-3d-preview", "configMenu", {
            name: game.i18n.localize("levels3dpreview.settings.configApp.name"),
            label: game.i18n.localize("levels3dpreview.settings.configApp.label"),
            hint: game.i18n.localize("levels3dpreview.settings.configApp.hint"),
            icon: "fas fa-cogs",
            scope: "world",
            restricted: true,
            type: canvas3dConfig,
        });

        game.settings.register("levels-3d-preview", "baseStyle", {
            name: game.i18n.localize("levels3dpreview.settings.baseStyle.name"),
            hint: game.i18n.localize("levels3dpreview.settings.baseStyle.hint"),
            scope: "world",
            config: false,
            type: String,
            default: "ringSimple",
        });

        game.settings.register("levels-3d-preview", "outline", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "fullTransparency", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "lightHelpers", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "useRaycastRuler", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
            onChange: (value) => {
                game.Levels3DPreview.ruler.useRaycastRuler = value;
            },
        });

        game.settings.register("levels-3d-preview", "enableReticule", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "navigatorAuto", {
            scope: "world",
            config: false,
            type: String,
            choices: {
                none: game.i18n.localize("levels3dpreview.settings.navigatorAuto.options.none"),
                players: game.i18n.localize("levels3dpreview.settings.navigatorAuto.options.players"),
                all: game.i18n.localize("levels3dpreview.settings.navigatorAuto.options.all"),
            },
            default: "players",
        });

        game.settings.register("levels-3d-preview", "solidBaseMode", {
            name: game.i18n.localize("levels3dpreview.settings.solidBaseMode.name"),
            hint: game.i18n.localize("levels3dpreview.settings.solidBaseMode.hint"),
            scope: "world",
            config: false,
            type: String,
            choices: {
                merge: game.i18n.localize("levels3dpreview.settings.solidBaseMode.options.merge"),
                ontop: game.i18n.localize("levels3dpreview.settings.solidBaseMode.options.ontop"),
            },
            default: "ontop",
        });

        game.settings.register("levels-3d-preview", "solidBaseColor", {
            name: game.i18n.localize("levels3dpreview.settings.solidBaseColor.name"),
            hint: game.i18n.localize("levels3dpreview.settings.solidBaseColor.hint"),
            scope: "world",
            config: false,
            type: String,
            default: "#2b2b2b",
        });

        game.settings.register("levels-3d-preview", "highlightCombat", {
            name: game.i18n.localize("levels3dpreview.settings.highlightCombat.name"),
            hint: game.i18n.localize("levels3dpreview.settings.highlightCombat.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "startMarker", {
            name: game.i18n.localize("levels3dpreview.settings.startMarker.name"),
            hint: game.i18n.localize("levels3dpreview.settings.startMarker.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "hideTarget", {
            name: game.i18n.localize("levels3dpreview.settings.hideTarget.name"),
            hint: game.i18n.localize("levels3dpreview.settings.hideTarget.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "hideEffects", {
            name: game.i18n.localize("levels3dpreview.settings.hideEffects.name"),
            hint: game.i18n.localize("levels3dpreview.settings.hideEffects.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "sharedContext", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "rotateIndicator", {
            name: game.i18n.localize("levels3dpreview.settings.rotateIndicator.name"),
            hint: game.i18n.localize("levels3dpreview.settings.rotateIndicator.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "templateEffects", {
            name: game.i18n.localize("levels3dpreview.settings.templateEffects.name"),
            hint: game.i18n.localize("levels3dpreview.settings.templateEffects.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "templateAuto3D", {
            name: game.i18n.localize("levels3dpreview.settings.templateAuto3D.name"),
            hint: game.i18n.localize("levels3dpreview.settings.templateAuto3D.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "templateSyle", {
            name: game.i18n.localize("levels3dpreview.settings.templateSyle.name"),
            hint: game.i18n.localize("levels3dpreview.settings.templateSyle.hint"),
            scope: "world",
            config: false,
            type: String,
            choices: {
                wireframe: game.i18n.localize("levels3dpreview.settings.templateSyle.options.wireframe"),
                solid: game.i18n.localize("levels3dpreview.settings.templateSyle.options.solid"),
            },
            default: "wireframe",
        });

        game.settings.register("levels-3d-preview", "autoPan", {
            name: game.i18n.localize("levels3dpreview.settings.autoPan.name"),
            hint: game.i18n.localize("levels3dpreview.settings.autoPan.hint"),
            scope: "world",
            config: false,
            type: String,
            choices: {
                none: game.i18n.localize("levels3dpreview.settings.autoPan.options.none"),
                player: game.i18n.localize("levels3dpreview.settings.autoPan.options.player"),
                all: game.i18n.localize("levels3dpreview.settings.autoPan.options.all"),
            },
            default: "all",
            onChange: (value) => {
                game.Levels3DPreview.setAutopan(value);
            },
        });

        game.settings.register("levels-3d-preview", "mapsharingJournal", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "rangeFinder", {
            scope: "world",
            config: false,
            type: String,
            default: "combat",
        });

        game.settings.register("levels-3d-preview", "screenspacepanning", {
            name: game.i18n.localize("levels3dpreview.settings.screenspacepanning.name"),
            hint: game.i18n.localize("levels3dpreview.settings.screenspacepanning.hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => {
                game.Levels3DPreview.controls.screenSpacePanning = value;
            },
        });

        game.settings.register("levels-3d-preview", "altCameraControls", {
            name: game.i18n.localize("levels3dpreview.settings.altCameraControls.name"),
            hint: game.i18n.localize("levels3dpreview.settings.altCameraControls.hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => {
                game.Levels3DPreview.GameCamera.setControlPreset();
            },
        });

        game.settings.register("levels-3d-preview", "enabledamping", {
            name: game.i18n.localize("levels3dpreview.settings.enabledamping.name"),
            hint: game.i18n.localize("levels3dpreview.settings.enabledamping.hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
        });

        game.settings.register("levels-3d-preview", "loadingShown", {
            scope: "client",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "cameralockzero", {
            name: game.i18n.localize("levels3dpreview.settings.cameralockzero.name"),
            hint: game.i18n.localize("levels3dpreview.settings.cameralockzero.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "canping", {
            name: game.i18n.localize("levels3dpreview.settings.canping.name"),
            hint: game.i18n.localize("levels3dpreview.settings.canping.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "canpingpan", {
            name: game.i18n.localize("levels3dpreview.settings.canpingpan.name"),
            hint: game.i18n.localize("levels3dpreview.settings.canpingpan.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "pingsound", {
            scope: "world",
            config: false,
            type: String,
            default: "sounds/combat/epic-turn-1hit.ogg",
        });

        game.settings.register("levels-3d-preview", "flatTokenStyle", {
            name: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.name"),
            hint: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.hint"),
            scope: "world",
            config: false,
            type: String,
            choices: {
                flat: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.options.flat"),
                extruded: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.options.extruded"),
                coin: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.options.coin"),
            },
            default: "extruded",
        });

        game.settings.register("levels-3d-preview", "preventNegative", {
            name: game.i18n.localize("levels3dpreview.settings.preventNegative.name"),
            hint: game.i18n.localize("levels3dpreview.settings.preventNegative.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "showAdvanced", {
            name: game.i18n.localize("levels3dpreview.settings.showAdvanced.name"),
            hint: game.i18n.localize("levels3dpreview.settings.showAdvanced.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "miniCanvas", {
            name: game.i18n.localize("levels3dpreview.settings.miniCanvas.name"),
            hint: game.i18n.localize("levels3dpreview.settings.miniCanvas.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "enableShaders", {
            name: game.i18n.localize("levels3dpreview.settings.enableShaders.name"),
            hint: game.i18n.localize("levels3dpreview.settings.enableShaders.hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
        });

        game.settings.register("levels-3d-preview", "enableEffects", {
            name: game.i18n.localize("levels3dpreview.settings.enableEffects.name"),
            hint: game.i18n.localize("levels3dpreview.settings.enableEffects.hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
        });

        game.settings.register("levels-3d-preview", "softShadows", {
            name: game.i18n.localize("levels3dpreview.settings.softShadows.name"),
            hint: game.i18n.localize("levels3dpreview.settings.softShadows.hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => {
                game.Levels3DPreview.renderer.shadowMap.type = value ? game.Levels3DPreview.THREE.PCFSoftShadowMap : game.Levels3DPreview.THREE.PCFShadowMap;
            },
        });

        game.settings.register("levels-3d-preview", "shadowQuality", {
            name: game.i18n.localize("levels3dpreview.settings.shadowQuality.name"),
            hint: game.i18n.localize("levels3dpreview.settings.shadowQuality.hint"),
            scope: "client",
            config: true,
            type: Number,
            choices: {
                32: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.gamer"),
                16: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.ultra"),
                8: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.high"),
                4: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.medium"),
                2: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.low"),
                0: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.none"),
            },
            onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
            default: 4,
        });

        game.settings.register("levels-3d-preview", "antialiasing", {
            name: game.i18n.localize("levels3dpreview.settings.antialiasing.name"),
            hint: game.i18n.localize("levels3dpreview.settings.antialiasing.hint"),
            scope: "client",
            config: true,
            type: String,
            choices: {
                none: game.i18n.localize("levels3dpreview.settings.antialiasing.options.none"),
                fxaa: game.i18n.localize("levels3dpreview.settings.antialiasing.options.fxaa"),
                smaa: game.i18n.localize("levels3dpreview.settings.antialiasing.options.smaa"),
            },
            onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
            default: "fxaa",
        });

        game.settings.register("levels-3d-preview", "fowQuality", {
            name: game.i18n.localize("levels3dpreview.settings.fowQuality.name"),
            hint: game.i18n.localize("levels3dpreview.settings.fowQuality.hint"),
            scope: "client",
            config: true,
            type: Number,
            choices: {
                1: game.i18n.localize("levels3dpreview.settings.fowQuality.options.native"),
                0.75: game.i18n.localize("levels3dpreview.settings.fowQuality.options.high"),
                0.5: game.i18n.localize("levels3dpreview.settings.fowQuality.options.medium"),
                0.25: game.i18n.localize("levels3dpreview.settings.fowQuality.options.low"),
                0.1: game.i18n.localize("levels3dpreview.settings.fowQuality.options.verylow"),
            },
            onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
            default: 1,
        });

        game.settings.register("levels-3d-preview", "dofblur", {
            name: game.i18n.localize("levels3dpreview.settings.dofblur.name"),
            hint: game.i18n.localize("levels3dpreview.settings.dofblur.hint"),
            scope: "client",
            config: true,
            type: String,
            choices: {
                off: game.i18n.localize("levels3dpreview.settings.dofblur.options.off"),
                low: game.i18n.localize("levels3dpreview.settings.dofblur.options.low"),
                medium: game.i18n.localize("levels3dpreview.settings.dofblur.options.medium"),
                high: game.i18n.localize("levels3dpreview.settings.dofblur.options.high"),
            },
            onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
            default: false,
        });

        game.settings.register("levels-3d-preview", "lightCacheSize", {
            name: game.i18n.localize("levels3dpreview.settings.lightCacheSize.name"),
            hint: game.i18n.localize("levels3dpreview.settings.lightCacheSize.hint"),
            scope: "world",
            config: false,
            type: Number,
            default: 4,
        });

        game.settings.register("levels-3d-preview", "debugMode", {
            name: game.i18n.localize("levels3dpreview.settings.debugMode.name"),
            hint: game.i18n.localize("levels3dpreview.settings.debugMode.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
            onChange: (sett) => {
                game.Levels3DPreview.debugMode = sett;
            },
        });

        game.settings.register("levels-3d-preview", "minicanvasposition", {
            name: "",
            hint: "",
            scope: "client",
            config: false,
            type: Object,
            default: {
                top: 0,
                left: 0,
            },
        });

        game.settings.register("levels-3d-preview", "allTokens", {
            name: "",
            hint: "",
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "autoAssignToken", {
            name: "",
            hint: "",
            scope: "world",
            config: false,
            choices: {
                0: "Disabled",
                1: "3D Model Only",
                2: "3D Model and Top Down Token",
            },
            type: Number,
            default: 1,
        });

        game.settings.register("levels-3d-preview", "assetBrowserCustomPath", {
            name: "",
            hint: "",
            scope: "world",
            config: false,
            filePicker: "folder",
            type: String,
            default: "",
        }),

        game.settings.register("levels-3d-preview", "assetbrowsertour", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "assetbrowserpainttour", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "autoApply", {
            name: "",
            hint: "",
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "autoClose", {
            name: "",
            hint: "",
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

    });

    Hooks.once("ready", () => {
        let clipNavigatorFollowClientDefault = false;
        const autoModeSetting = game.settings.get("levels-3d-preview", "navigatorAuto");
        if (autoModeSetting == "none") clipNavigatorFollowClientDefault = false;
        else if (autoModeSetting == "players") clipNavigatorFollowClientDefault = !game.user.isGM;
        else clipNavigatorFollowClientDefault = true;

        game.settings.register("levels-3d-preview", "clipNavigatorFollowClient", {
            scope: "client",
            config: false,
            type: Boolean,
            default: clipNavigatorFollowClientDefault,
        });
    });

    //Welcome Message

    Hooks.once("ready", () => {
        if (!game.user.isGM) return;
        game.settings.register("levels-3d-preview", "oneTimeMessages", {
            scope: "world",
            config: false,
            type: Object,
            default: {},
        });

        async function setSetting(key) {
            let oldSett = game.settings.get("levels-3d-preview", "oneTimeMessages");
            oldSett[key] = true;
            await game.settings.set("levels-3d-preview", "oneTimeMessages", oldSett);
        }

        const showNewUserExperience = game.modules.get("canvas3dcompendium")?.active && !game.settings.get("levels-3d-preview", "oneTimeMessages").newuserexperience;

        const showWelcomeMessage = !game.settings.get("levels-3d-preview", "oneTimeMessages").welcome;

        if (showWelcomeMessage && !showNewUserExperience) {
            const dialog = new foundry.applications.api.DialogV2({
                window: { title: "levels3dpreview.welcome.title" },
                content: game.i18n.localize("levels3dpreview.welcome.content"),
                buttons: [
                    {
                        action: "ok",
                        icon: "fas fa-times",
                        label: "levels3dpreview.welcome.ok",
                    },
                    {
                        action: "dontshowagain",
                        icon: "fas fa-check-double",
                        label: "levels3dpreview.welcome.dontshowagain",
                        callback: () => {
                            setSetting("welcome");
                        },
                    },
                    {
                        action: "opencompendium",
                        icon: "fas fa-book",
                        label: "levels3dpreview.welcome.opencompendium",
                        callback: () => {
                            game.packs.get("levels-3d-preview.documentation").render(true);
                        },
                    },
                ],
                default: "ok",
            });
            dialog.render(true);
            Hooks.once("renderDialog", (app, html) => {
                html.querySelectorAll("button").forEach(btn => {
                    btn.style.height = "3rem";
                });
                app.setPosition({ width: 500, height: "auto", left: window.innerWidth / 2 - 250 });
            });
        }

        if (showNewUserExperience) {
            const dialog = new foundry.applications.api.DialogV2({
                window: { title: "levels3dpreview.newuserexperience.title" },
                content: game.i18n.localize("levels3dpreview.newuserexperience.content"),
                buttons: [
                    {
                        action: "starttour",
                        icon: "fas fa-person-hiking",
                        label: "levels3dpreview.newuserexperience.starttour",
                        callback: () => {
                            game.tours.get("levels-3d-preview.first-scene").start();
                            setSetting("newuserexperience");
                        },
                    },
                ],
                default: "starttour",
            });
            dialog.render(true);
        }
    });
}
