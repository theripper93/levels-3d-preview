import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { MapBrowser } from "../apps/sharing.js";
import { registerQualitySettings } from "../vfx/quality.js";
import { GraphicsSettings } from "./performancePresets.js";
import { queueGraphicsChange, updateRulerFontSize } from "./liveGraphics.js";
const settingCache = {};

const CACHED_SETTINGS = ["tokenVisibility", "shadowQuality", "regionsAlwaysFlat", "preventNegative", "rulerPathfinding"];
const TOKEN_VISIBILITY = ["off", "standard", "dynamic"];

export function getSetting(key) {
    return settingCache[key] ?? game.settings.get("levels-3d-preview", key);
}

function readLegacySetting(key) {
    const stored = game.settings.storage.get("world")?.getSetting?.(`levels-3d-preview.${key}`);
    if (!stored) return undefined;
    try {
        return JSON.parse(stored._source?.value ?? stored.value);
    } catch {
        return undefined;
    }
}

export async function migrateSettings() {
    if (!game.user.isGM || game.settings.get("levels-3d-preview", "settingsMigrated")) return;
    const exact = readLegacySetting("exactTokenVisibility") ?? true;
    const dynamic = readLegacySetting("dynamicTokenVisibility") ?? false;
    const visibility = !exact ? "off" : dynamic ? "dynamic" : "standard";
    if (visibility !== game.settings.get("levels-3d-preview", "tokenVisibility")) await game.settings.set("levels-3d-preview", "tokenVisibility", visibility);
    await game.settings.set("levels-3d-preview", "settingsMigrated", true);
}

const GAME_CAMERA_SETTINGS = ["enableGameCamera", "gameCameraMaxAngle", "gameCameraMinAngle", "gameCameraMaxZoom", "gameCameraClipping", "gameCameraDefaultGm"];

export async function removeGameCameraData() {
    if (!game.user.isGM || game.settings.get("levels-3d-preview", "gameCameraRemoved")) return;
    const storage = game.settings.storage.get("world");
    const ids = GAME_CAMERA_SETTINGS.map((key) => storage?.getSetting?.(`levels-3d-preview.${key}`)?.id).filter(Boolean);
    try {
        if (ids.length) await foundry.documents.Setting.deleteDocuments(ids);
        for (const scene of game.scenes) {
            if (scene.flags["levels-3d-preview"]?.enableGameCamera !== undefined) await scene.unsetFlag("levels-3d-preview", "enableGameCamera");
        }
    } catch (e) {
        console.warn("3D Canvas | Game Camera data cleanup failed", e);
    }
    await game.settings.set("levels-3d-preview", "gameCameraRemoved", true);
}

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
            tabs: {
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
            regions: {
                template: 'modules/levels-3d-preview/templates/config/tab-regions.hbs',
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
                    { id: "regions", icon: "fas fa-draw-polygon", label: "levels3dpreview.settings.configApp.tabs.regions" },
                    { id: "token", icon: "fas fa-user-alt", label: "levels3dpreview.settings.configApp.tabs.token" },
                    { id: "base", icon: "fas fa-dot-circle", label: "levels3dpreview.settings.configApp.tabs.base" },
                    { id: "perm", icon: "fas fa-user-lock", label: "levels3dpreview.settings.configApp.tabs.perm" },
                    { id: "tools", icon: "fas fa-tools", label: "levels3dpreview.settings.configApp.tabs.tools" },
                    { id: "misc", icon: "fas fa-cogs", label: "levels3dpreview.settings.configApp.tabs.misc" },
                ],
                initial: "canvas",
            },
        }
    };

    async _prepareContext(options) {
        const data = {};
        const settingsKeys = ["rulerPathfinding", "revealTokens", "regionShells", "pingsound", "templateEffects","rangeFinder", "canpingpan", "canping", "baseStyle", "solidBaseColor", "removeModelBase", "highlightCombat", "startMarker", "autoPan", "flatTokenStyle", "preventNegative", "allTokens", "autoAssignToken", "assetBrowserCustomPath", "autoApply", "autoClose", "regionsAlwaysFlat", "tokenVisibility"];
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
            config: false,
            type: Number,
            range: {
                min: 0.25,
                max: 2,
                step: 0.05,
            },
            default: 1,
            onChange: () => queueGraphicsChange("resolutionMultiplier"),
        });
        updateRulerFontSize();
        //Intentional: also scales the 2D PIXI canvas, since in shared-context mode three renders into the same canvas/resolution
        canvasConfig.resolution *= game.settings.get("levels-3d-preview", "resolutionMultiplier");
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

        game.settings.register("levels-3d-preview", "tacticalCamera", {
            scope: "client",
            config: false,
            type: Boolean,
            default: true,
            onChange: (value) => game.Levels3DPreview?.tacticalCamera?.onPreferredChange(value),
        });

        game.settings.register("levels-3d-preview", "gameCameraRemoved", {
            scope: "world",
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

        game.settings.registerMenu("levels-3d-preview", "graphicsMenu", {
            name: game.i18n.localize("levels3dpreview.performance.settings.name"),
            label: game.i18n.localize("levels3dpreview.performance.settings.label"),
            hint: game.i18n.localize("levels3dpreview.performance.settings.hint"),
            icon: "fas fa-display",
            scope: "client",
            restricted: false,
            type: GraphicsSettings,
        });

        game.settings.register("levels-3d-preview", "baseStyle", {
            name: game.i18n.localize("levels3dpreview.settings.baseStyle.name"),
            hint: game.i18n.localize("levels3dpreview.settings.baseStyle.hint"),
            scope: "world",
            config: false,
            type: String,
            default: "ringSimple",
        });

        game.settings.register("levels-3d-preview", "rulerPathfinding", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
            onChange: (value) => {
                settingCache.rulerPathfinding = value;
                canvas?.tokens?.recalculatePlannedMovementPaths?.();
            },
        });

        game.settings.register("levels-3d-preview", "revealTokens", {
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
        });

        game.settings.register("levels-3d-preview", "rulerPathfindingMigrated", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
        });

        game.settings.register("levels-3d-preview", "solidBaseColor", {
            name: game.i18n.localize("levels3dpreview.settings.solidBaseColor.name"),
            hint: game.i18n.localize("levels3dpreview.settings.solidBaseColor.hint"),
            scope: "world",
            config: false,
            type: String,
            default: "#2b2b2b",
        });

        game.settings.register("levels-3d-preview", "removeModelBase", {
            name: game.i18n.localize("levels3dpreview.settings.removeModelBase.name"),
            hint: game.i18n.localize("levels3dpreview.settings.removeModelBase.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
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
            default: false,
        });

        game.settings.register("levels-3d-preview", "templateEffects", {
            name: game.i18n.localize("levels3dpreview.settings.templateEffects.name"),
            hint: game.i18n.localize("levels3dpreview.settings.templateEffects.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
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

        game.settings.register("levels-3d-preview", "enabledamping", {
            name: game.i18n.localize("levels3dpreview.settings.enabledamping.name"),
            hint: game.i18n.localize("levels3dpreview.settings.enabledamping.hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => {
                const controls = game.Levels3DPreview?.controls;
                if (controls) controls.enableDamping = value;
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
                game.Levels3DPreview?.tacticalCamera?.setControlPreset();
            },
        });


        game.settings.register("levels-3d-preview", "loadingShown", {
            scope: "client",
            config: false,
            type: Boolean,
            default: false,
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

        game.settings.register("levels-3d-preview", "tokenVisibility", {
            name: game.i18n.localize("levels3dpreview.settings.tokenVisibility.name"),
            hint: game.i18n.localize("levels3dpreview.settings.tokenVisibility.hint"),
            scope: "world",
            config: false,
            type: String,
            choices: Object.fromEntries(TOKEN_VISIBILITY.map((k) => [k, game.i18n.localize(`levels3dpreview.settings.tokenVisibility.options.${k}`)])),
            default: "standard",
            onChange: (value) => {
                settingCache.tokenVisibility = value;
            },
        });

        game.settings.register("levels-3d-preview", "settingsMigrated", {
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
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
            onChange: (value) => {
                settingCache.preventNegative = value;
            },
        });

        game.settings.register("levels-3d-preview", "enableShaders", {
            name: game.i18n.localize("levels3dpreview.settings.enableShaders.name"),
            hint: game.i18n.localize("levels3dpreview.settings.enableShaders.hint"),
            scope: "client",
            config: false,
            type: Boolean,
            default: true,
            onChange: () => queueGraphicsChange("enableShaders"),
        });

        game.settings.register("levels-3d-preview", "waterQuality", {
            name: game.i18n.localize("levels3dpreview.settings.waterQuality.name"),
            hint: game.i18n.localize("levels3dpreview.settings.waterQuality.hint"),
            scope: "client",
            config: false,
            type: String,
            choices: {
                low: game.i18n.localize("levels3dpreview.settings.waterQuality.choices.low"),
                high: game.i18n.localize("levels3dpreview.settings.waterQuality.choices.high"),
            },
            default: "high",
            onChange: () => queueGraphicsChange("enableShaders"),
        });

        game.settings.register("levels-3d-preview", "scatterQuality", {
            name: game.i18n.localize("levels3dpreview.settings.scatterQuality.name"),
            hint: game.i18n.localize("levels3dpreview.settings.scatterQuality.hint"),
            scope: "client",
            config: false,
            type: String,
            choices: {
                low: game.i18n.localize("levels3dpreview.settings.scatterQuality.choices.low"),
                medium: game.i18n.localize("levels3dpreview.settings.scatterQuality.choices.medium"),
                high: game.i18n.localize("levels3dpreview.settings.scatterQuality.choices.high"),
            },
            default: "high",
            onChange: () => game.Levels3DPreview?.scatter?.refreshAll(),
        });

        game.settings.register("levels-3d-preview", "groundCover", {
            name: game.i18n.localize("levels3dpreview.settings.groundCover.name"),
            hint: game.i18n.localize("levels3dpreview.settings.groundCover.hint"),
            scope: "client",
            config: false,
            type: String,
            choices: Object.fromEntries(["off", "low", "medium", "high"].map((k) => [k, game.i18n.localize(`levels3dpreview.settings.groundCover.choices.${k}`)])),
            default: "medium",
            onChange: () => game.Levels3DPreview?.scene?.traverse((o) => o.mapMakerTerrain?.rebuildCover()),
        });

        registerQualitySettings();

        game.settings.register("levels-3d-preview", "softShadows", {
            name: game.i18n.localize("levels3dpreview.settings.softShadows.name"),
            hint: game.i18n.localize("levels3dpreview.settings.softShadows.hint"),
            scope: "client",
            config: false,
            type: Boolean,
            default: true,
            onChange: () => queueGraphicsChange("softShadows"),
        });

        game.settings.register("levels-3d-preview", "regionShells", {
            name: game.i18n.localize("levels3dpreview.settings.regionShells.name"),
            hint: game.i18n.localize("levels3dpreview.settings.regionShells.hint"),
            scope: "world",
            config: false,
            type: Boolean,
            default: true,
            onChange: () => {
                if (!game.Levels3DPreview?._active) return;
                canvas.scene?.regions.forEach((region) => game.Levels3DPreview.CONFIG.entityClass.Region3D?.handle(region));
            },
        });

        game.settings.register("levels-3d-preview", "shadowQuality", {
            name: game.i18n.localize("levels3dpreview.settings.shadowQuality.name"),
            hint: game.i18n.localize("levels3dpreview.settings.shadowQuality.hint"),
            scope: "client",
            config: false,
            type: Number,
            choices: {
                32: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.gamer"),
                16: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.ultra"),
                8: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.high"),
                4: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.medium"),
                2: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.low"),
                0: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.none"),
            },
            onChange: (value) => {
                settingCache.shadowQuality = value;
                queueGraphicsChange("shadowQuality");
            },
            default: 4,
        });

        game.settings.register("levels-3d-preview", "antialiasing", {
            name: game.i18n.localize("levels3dpreview.settings.antialiasing.name"),
            hint: game.i18n.localize("levels3dpreview.settings.antialiasing.hint"),
            scope: "client",
            config: false,
            type: String,
            choices: {
                none: game.i18n.localize("levels3dpreview.settings.antialiasing.options.none"),
                fxaa: game.i18n.localize("levels3dpreview.settings.antialiasing.options.fxaa"),
                smaa: game.i18n.localize("levels3dpreview.settings.antialiasing.options.smaa"),
            },
            onChange: () => queueGraphicsChange("antialiasing"),
            default: "fxaa",
        });

        game.settings.register("levels-3d-preview", "volumetricFog", {
            name: game.i18n.localize("levels3dpreview.settings.volumetricFog.name"),
            hint: game.i18n.localize("levels3dpreview.settings.volumetricFog.hint"),
            scope: "client",
            config: false,
            type: Boolean,
            onChange: () => queueGraphicsChange("volumetricFog"),
            default: false,
        });

        game.settings.register("levels-3d-preview", "dofblur", {
            name: game.i18n.localize("levels3dpreview.settings.dofblur.name"),
            hint: game.i18n.localize("levels3dpreview.settings.dofblur.hint"),
            scope: "client",
            config: false,
            type: String,
            choices: {
                off: game.i18n.localize("levels3dpreview.settings.dofblur.options.off"),
                low: game.i18n.localize("levels3dpreview.settings.dofblur.options.low"),
                medium: game.i18n.localize("levels3dpreview.settings.dofblur.options.medium"),
                high: game.i18n.localize("levels3dpreview.settings.dofblur.options.high"),
            },
            onChange: () => queueGraphicsChange("dofblur"),
            default: false,
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

        game.settings.register("levels-3d-preview", "assetBrowserMemory", {
            scope: "client",
            config: false,
            type: Object,
            default: {},
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

        game.settings.register("levels-3d-preview", "regionsAlwaysFlat", {
            name: "",
            hint: "",
            scope: "world",
            config: false,
            type: Boolean,
            default: false,
            onChange: (value) => {
                settingCache.regionsAlwaysFlat = value;
            },
        });

        for (const key of CACHED_SETTINGS) settingCache[key] = game.settings.get("levels-3d-preview", key);
    });

    Hooks.once("ready", migrateSettings);
    Hooks.once("ready", removeGameCameraData);

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

        const showNewUserExperience = game.modules.get("canvas3dcompendium")?.active && game.tours.get("levels-3d-preview.first-scene").status === "unstarted";

        const showWelcomeMessage = !game.settings.get("levels-3d-preview", "oneTimeMessages").welcome;

        if (showWelcomeMessage && !showNewUserExperience) {
            const dialog = new foundry.applications.api.DialogV2({
                window: { title: "levels3dpreview.welcome.title" },
                classes: ["levels-3d-preview-welcome"],
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
                            const a = document.createElement("a");
                            a.href = "https://wiki.theripper93.com/levels-3d-preview";
                            a.target = "_blank";
                            a.click();
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
                classes: ["levels-3d-preview-welcome"],
                content: game.i18n.localize("levels3dpreview.newuserexperience.content"),
                buttons: [
                    {
                        action: "starttour",
                        icon: "fas fa-person-hiking",
                        label: "levels3dpreview.newuserexperience.starttour",
                        callback: () => {
                            game.tours.get("levels-3d-preview.first-scene").start();
                        },
                    },
                    {
                        action: "importdemo",
                        icon: "fas fa-download",
                        label: "levels3dpreview.newuserexperience.importdemo",
                        callback: () => {
                            MapBrowser.importDemoScene();
                        },
                    }
                ],
                default: "starttour",
            });
            dialog.render(true);
        }
    });
}
