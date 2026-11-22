import { scatterConfigTab, activateScatterConfig } from "../scatter/config.js";
import { hideParams } from "../helpers/helpers.js";
import { ShaderConfig } from "../shaders/ShaderLib.js";
import { RegisterTours } from "../tours/tours.js";
import { MapGen } from "../apps/mapGen.js";
import { getTimeSyncDefault, isDynamicSkyEnabled } from "../systems/globalIllumination.js";
import { DynamicSkyConfig } from "./dynamicSkyConfig.js";
import { GradientPicker } from "../helpers/GradientPicker.js";
import { injectConfig } from "../lib/injectConfig.js";
import { weatherConfigFields, activateWeatherConfig } from "../vfx/weather/config.js";
import { surfaceConfigFields } from "../vfx/surface/config.js";
import { SURFACE_FLAG } from "../vfx/surface/state.js";
import { section, statusSection, activateStatusSection } from "./sceneConfigLayout.js";
import { EDGE_OPTIONS, BACKDROPS } from "../atmosphere/mapEdge.js";
import { lookPresetField, activateLookPreset } from "./sceneLook.js";
import { lightFxConfigFields, activateLightFxConfig } from "../vfx/light/config.js";
import { TacticalPingPicker, loadUserEmotes } from "../entities/effects/ping.js";
import { injectBakeButton } from "../helpers/modelBaker.js";
import { skipDefaultReloads } from "./sceneConfigSubmit.js";

export function registerConfigs() {
    const documentsToWiden = ["Scene", "Token", "Tile", "AmbientLight"];

    for (const document of documentsToWiden) {
        foundry.applications.sheets[`${document}Config`].DEFAULT_OPTIONS.position.width += 100;
    }

    Hooks.on("getSceneControlButtons", (buttons) => {
        buttons.tokens.tools.preview3d = {
            name: "preview3d",
            title: game.i18n.localize("levels3dpreview.controls.preview3d"),
            icon: "fas fa-cube",
            button: true,
            visible: canvas?.scene?.getFlag("levels-3d-preview", "enablePlayers") || game.user.isGM,
            onChange: () => {
                game.Levels3DPreview.toggle();
            },
        }
        
        const drawPolygonTool = {
            name: "tile3dPolygon",
            title: game.i18n.localize("levels3dpreview.controls.tile3dPolygon"),
            icon: "fa-solid fa-draw-polygon",
            control: true,
            order: 2.5,
            get visible(){
                return !!(game.Levels3DPreview?._active && game.user.isGM)
            }
        };
        buttons.tiles.tools.tile3dPolygon = drawPolygonTool;
        const oldOnChange = buttons.tiles.tools.browse.onChange;
        buttons.tiles.tools.browse.onChange = () => {
            if(game.Levels3DPreview?._active && game.user.isGM){
                game.Levels3DPreview.open3DFilePicker();
            }else{
                return oldOnChange();
            }
        };
    });

    Hooks.on("closeSceneConfig", (app) => {
        if (app.document !== canvas.scene) return;
        game.Levels3DPreview?.outputPass?.setupUniforms(canvas.scene.getFlag("levels-3d-preview", "pp"));
        if (game.Levels3DPreview?._bloomPreview) game.Levels3DPreview.setBloom();
    });

    Hooks.on("renderSceneConfig", (app, html) => {
        html.querySelectorAll(`[data-tab="levels-3d-preview"]`).forEach(el => el.remove());

        const flag = (key) => game.i18n.localize(`levels3dpreview.flags.${key}`);
        const pp = (key) => game.i18n.localize(`levels3dpreview.flags.postprocessing.${key}.label`);
        const tab = (key, icon) => ({
            tabLabel: game.i18n.localize(`levels3dpreview.sceneConfig.tabs.${key}`),
            tabIcon: icon,
        });
        const weather = weatherConfigFields(app.document);
        const ppRange = (key, max, defaultValue, min = 0) => ({ type: "range", label: pp(key), min, max, step: 0.01, default: defaultValue });

        const data = {
            moduleId: "levels-3d-preview",
            tab: {
                name: "levels-3d-preview",
                label: "3D Canvas",
                icon: "fas fa-cube",
                subTabs: true,
            },
            "essentials-3d": {
                ...tab("essentials", "fas fa-cube"),
                ...statusSection(),
                ...section("essentials", "basics", {
                    atmosphere: {
                        type: "custom",
                        html: `
                <div class="form-group">
                    <label>${game.i18n.localize("levels3dpreview.dynamicSkyConfig.sceneConfig.label")}</label>
                    <div class="form-fields">
                        <button type="button" data-key="sky-config"><i class="fas fa-cloud-sun"></i> ${game.i18n.localize("levels3dpreview.dynamicSkyConfig.sceneConfig.button")}</button>
                    </div>
                    <p class="hint">${game.i18n.localize(isDynamicSkyEnabled(app.document) ? "levels3dpreview.dynamicSkyConfig.sceneConfig.notesEnabled" : "levels3dpreview.dynamicSkyConfig.sceneConfig.notes")}</p>
                </div>
                `,
                    },
                    exr: {
                        type: "filepicker.any",
                        fpTypes: [".exr", ".jpeg", ".jpg", ".png", ".webp"],
                        label: flag("exr.label"),
                        placeholder: flag("exr.placeholder"),
                        notes: flag("exr.notes"),
                        default: game.modules.get("canvas3dcompendium") ? "modules/canvas3dcompendium/assets/Beautiful-Sky/2K/Sky_LowPoly_01_Day_a.webp" : "modules/levels-3d-preview/assets/skybox/venice_sunrise_1k.exr",
                    },
                    sunPosition: {
                        type: "range",
                        label: flag("sunPosition.label"),
                        default: 9,
                        min: 0,
                        max: 24,
                    },
                    "weather.preset": weather["weather.preset"],
                    "weather.intensity": weather["weather.intensity"],
                    "pp.preset": lookPresetField(app.document),
                    initialposition: {
                        type: "custom",
                        html: `
                <div class="form-group">
                    <label>${game.i18n.localize("levels3dpreview.flags.initialview.label")}</label>
                    <div class="form-fields">
                        <button class="capture-position" type="button" id="clear-3d-view" title="${game.i18n.localize("levels3dpreview.flags.initialview.buttondel")}">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="capture-position" type="button" id="capture-3d-view" title="${game.i18n.localize("levels3dpreview.flags.initialview.button")}">
                            <i class="fas fa-crop-alt fa-fw"></i>
                        </button>
                    </div>
                    <p class="hint">${game.i18n.localize("levels3dpreview.flags.initialview.notes")}</p>
                </div>
                `,
                    },
                }),
            },
            "sky-light-3d": {
                ...tab("skyLight", "fas fa-cloud-sun"),
                ...section("skyLight", "basics", {
                    timeSync: {
                        type: "select",
                        label: flag("timeSync.label"),
                        default: getTimeSyncDefault(app.document),
                        options: {
                            off: flag("timeSync.options.off"),
                            time: flag("timeSync.options.time"),
                            darkness: flag("timeSync.options.darkness"),
                            both: flag("timeSync.options.both"),
                        },
                    },
                    exposure: {
                        type: "range",
                        label: flag("exposure.label"),
                        default: 1,
                        min: 0.01,
                        max: 2,
                        step: 0.01,
                    },
                    sunShadows: {
                        type: "checkbox",
                        label: flag("sunShadows.label"),
                        notes: flag("sunShadows.notes"),
                        default: true,
                    },
                }),
                ...section("sun", "sun", {
                    sunDistance: {
                        type: "number",
                        label: flag("sunDistance.label"),
                        default: 10,
                    },
                    sunTilt: {
                        type: "range",
                        label: flag("sunTilt.label"),
                        default: 0,
                        min: -1,
                        max: 1,
                        step: 0.01,
                    },
                }),
                ...section("ambient", "ambient", {
                    sceneTint: {
                        type: "color",
                        label: flag("sceneTint.label"),
                        default: "#ffffff",
                    },
                    ambientLightIntensity: {
                        type: "range",
                        label: flag("ambientLightIntensity.label"),
                        default: 0,
                        min: 0,
                        max: 1,
                        step: 0.01,
                    },
                    ambientLightColor: {
                        type: "color",
                        label: flag("ambientLightColor.label"),
                        default: "#ffffff",
                    },
                }),
                ...section("background", "background", {
                    renderBackground: {
                        type: "checkbox",
                        label: flag("renderBackground.label"),
                        default: true,
                        notes: flag("renderBackground.notes"),
                    },
                    enableFog: {
                        type: "checkbox",
                        label: flag("enableFog.label"),
                        notes: flag("enableFog.notes"),
                        default: false,
                    },
                    fogColor: {
                        type: "color",
                        label: flag("fogColor.label"),
                        default: "#000000",
                    },
                    fogDistance: {
                        type: "number",
                        label: flag("fogDistance.label"),
                        default: 3000,
                    },
                }),
            },
            "weather-3d": {
                ...tab("weather", "fas fa-cloud-showers-heavy"),
                ...section("weather", "basics", {
                    "weather.layer2": weather["weather.layer2"],
                    "weather.linkSky": weather["weather.linkSky"],
                }),
                ...section("wind", "wind", {
                    "weather.wind.direction": weather["weather.wind.direction"],
                    "weather.wind.speed": weather["weather.wind.speed"],
                    "weather.wind.gustiness": weather["weather.wind.gustiness"],
                    "weather.fog": weather["weather.fog"],
                    "weather.lightning": weather["weather.lightning"],
                }),
                ...section("surface", "surface", surfaceConfigFields()),
                partGroupStart: {
                    type: "custom",
                    html: `<div id="part-group">`,
                },
                ...section("particles", "particles", {
                    particleTexture: {
                        type: "filepicker",
                        label: flag("particleTexture.label"),
                        default: "",
                    },
                    particleDensity: {
                        type: "range",
                        label: flag("particleDensity.label"),
                        default: 100,
                        min: 1,
                        max: 1000,
                        step: 1,
                    },
                    particleDirection: {
                        type: "range",
                        label: flag("particleDirection.label"),
                        default: 90,
                        min: 0,
                        max: 360,
                        step: 1,
                    },
                    particleSize: {
                        type: "range",
                        label: flag("particleSize.label"),
                        default: 20,
                        min: 1,
                        max: 10000,
                        step: 1,
                    },
                    particleColor: {
                        type: "color",
                        label: flag("particleColor.label"),
                        default: "#ffc494",
                    },
                    particleOpacity: {
                        type: "range",
                        label: flag("particleOpacity.label"),
                        default: 0.5,
                        min: 0,
                        max: 1,
                        step: 0.01,
                    },
                    particleSpeed: {
                        type: "range",
                        label: flag("particleSpeed.label"),
                        default: 5,
                        min: 0,
                        max: 10,
                        step: 0.1,
                    },
                    particleRotationspeed: {
                        type: "range",
                        label: flag("particleRotationspeed.label"),
                        default: 0,
                        min: -10,
                        max: 10,
                        step: 0.1,
                    },
                    particleVelocity: {
                        type: "range",
                        label: flag("particleVelocity.label"),
                        default: 1,
                        min: 0,
                        max: 10,
                        step: 0.1,
                    },
                    particleRandomRotation: {
                        type: "checkbox",
                        label: flag("particleRandomRotation.label"),
                        default: false,
                    },
                    particleRandomScale: {
                        type: "checkbox",
                        label: flag("particleRandomScale.label"),
                        default: true,
                    },
                    particleBlend: {
                        type: "checkbox",
                        label: flag("particleBlend.label"),
                        default: false,
                    },
                    particleGroundOffset: {
                        type: "number",
                        label: flag("particleGroundOffset.label"),
                        default: 0,
                    },
                }),
                partGroupEnd: {
                    type: "custom",
                    html: `</div>`,
                },
            },
            "visuals-3d": {
                ...tab("visuals", "fas fa-adjust"),
                ...section("look", "basics", {
                    "pp.enabled": {
                        type: "checkbox",
                        label: pp("enabled"),
                        default: false,
                    },
                    "pp.tint": {
                        type: "color",
                        label: pp("tint"),
                        default: "#ffffff",
                    },
                    "pp.contrast": ppRange("contrast", 2, 1),
                    "pp.brightness": ppRange("brightness", 2, 1),
                    "pp.saturation": ppRange("saturation", 2, 1),
                }),
                ...section("effects", "effects", {
                    "pp.sepia": ppRange("sepia", 1, 0),
                    "pp.hue": { type: "range", label: pp("hue"), min: -180, max: 180, step: 1, default: 0 },
                    "pp.vignette": ppRange("vignette", 1, 0),
                    "pp.chromaticAberration": ppRange("chromaticAberration", 1, 0),
                    "pp.grain": ppRange("grain", 1, 0),
                    pixel: {
                        type: "checkbox",
                        label: flag("pixel.label"),
                        default: false,
                    },
                }),
                ...section("bloom", "bloom", {
                    bloom: {
                        type: "checkbox",
                        label: flag("bloom.label"),
                        default: false,
                    },
                    bloomThreshold: {
                        type: "range",
                        label: flag("bloomThreshold.label"),
                        min: 0,
                        max: 1,
                        step: 0.01,
                        default: 0,
                    },
                    bloomStrength: {
                        type: "range",
                        label: flag("bloomStrength.label"),
                        min: 0,
                        max: 1,
                        step: 0.01,
                        default: 0.4,
                    },
                    bloomRadius: {
                        type: "range",
                        label: flag("bloomRadius.label"),
                        min: 0,
                        max: 1,
                        step: 0.01,
                        default: 0.6,
                    },
                }),
                ...section("mapEdge", "mapEdge", {
                    mapEdge: {
                        type: "select",
                        label: flag("mapEdge.label"),
                        notes: flag("mapEdge.notes"),
                        default: "legacy",
                        options: Object.fromEntries(EDGE_OPTIONS.map((o) => [o, flag(`mapEdge.options.${o}`)])),
                    },
                    edgeTexture: {
                        type: "filepicker",
                        label: flag("edgeTexture.label"),
                        placeholder: flag("edgeTexture.placeholder"),
                        default: "",
                    },
                    edgeColor: {
                        type: "color",
                        label: flag("edgeColor.label"),
                        default: "#59633f",
                    },
                    horizonBackdrop: {
                        type: "select",
                        label: flag("horizonBackdrop.label"),
                        default: "none",
                        options: Object.fromEntries(BACKDROPS.map((o) => [o, flag(`horizonBackdrop.options.${o}`)])),
                    },
                    renderTable: {
                        type: "select",
                        label: flag("renderTable.label"),
                        default: game.settings.get("levels-3d-preview", "paddingAppearance"),
                        options: {
                            none: flag("renderTable.options.none"),
                            table: flag("renderTable.options.table"),
                            matpaper: flag("renderTable.options.matpaper"),
                            matwood: flag("renderTable.options.matwood"),
                            matcloth: flag("renderTable.options.matcloth"),
                            matblueprint: flag("renderTable.options.matblueprint"),
                            matcustom: flag("renderTable.options.matcustom"),
                        },
                    },
                    tableTex: {
                        type: "filepicker",
                        label: flag("tableTex.label"),
                        placeholder: flag("tableTex.placeholder"),
                        default: "",
                    },
                    tableHeightmap: {
                        type: "filepicker",
                        label: flag("tableHeightmap.label"),
                        placeholder: flag("tableHeightmap.placeholder"),
                        default: "",
                    },
                    tableHeightmapScale: {
                        type: "range",
                        label: flag("tableHeightmapScale.label"),
                        default: 1,
                        min: 0.01,
                        max: 10,
                        step: 0.01,
                    },
                    tableColor: {
                        type: "color",
                        label: flag("tableColor.label"),
                        default: "#341f0f",
                    },
                }),
            },
            "misc-3d": {
                tabLabel: game.i18n.localize("SCENE.TABS.SHEET.misc"),
                tabIcon: "fa-solid fa-shapes",
                ...section("misc", "basics", {
                    enablePlayers: {
                        type: "checkbox",
                        label: flag("enablePlayers.label"),
                        default: false,
                        notes: flag("enablePlayers.notes"),
                    },
                    auto3d: {
                        type: "checkbox",
                        label: flag("auto3d.label"),
                        default: false,
                    },
                    object3dSight: {
                        type: "checkbox",
                        label: flag("object3dSight.label"),
                        notes: flag("object3dSight.notes"),
                        default: false,
                    },
                    enableGameCamera: {
                        type: "checkbox",
                        label: flag("enableGameCamera.label"),
                        notes: flag("enableGameCamera.notes"),
                        default: true,
                    },
                    enableFogOfWar: {
                        type: "checkbox",
                        label: flag("enableFogOfWar.label"),
                        default: true,
                    },
                    grounding: {
                        type: "select",
                        label: flag("grounding.label"),
                        notes: flag("grounding.notes"),
                        default: "",
                        options: {
                            "": flag("grounding.options.none"),
                            notFlying: flag("grounding.options.notFlying"),
                            always: flag("grounding.options.always"),
                        },
                    },
                    enableAnimationScripts: {
                        type: "checkbox",
                        label: flag("enableAnimationScripts.label"),
                        notes: flag("enableAnimationScripts.notes"),
                        default: true,
                    },
                }),
                ...section("objects", "objects", {
                    showSceneWalls: {
                        type: "checkbox",
                        label: flag("showSceneWalls.label"),
                        default: true,
                    },
                    showSceneDoors: {
                        type: "checkbox",
                        label: flag("showSceneDoors.label"),
                        default: true,
                    },
                    showSceneFloors: {
                        type: "checkbox",
                        label: flag("showSceneFloors.label"),
                        default: true,
                    },
                    renderSceneLights: {
                        type: "checkbox",
                        label: flag("renderSceneLights.label"),
                        default: true,
                    },
                    mirrorLevels: {
                        type: "checkbox",
                        label: flag("mirrorLevels.label"),
                        default: true,
                    },
                }),
                ...section("advanced", "advanced", {
                    maxElevation: {
                        type: "number",
                        label: flag("maxElevation.label"),
                        notes: flag("maxElevation.notes"),
                        default: 100000,
                    },
                }),
            },
        };
        const injected = injectConfig.inject(app, html, data);
        skipDefaultReloads(app);
        activateWeatherConfig(app, html, () => injectConfig._trySetPosition(app, { height: "auto" }));
        activateStatusSection(app, html);
        activateLookPreset(html);

        const ppInputs = Array.from(html.querySelectorAll("[name^='flags.levels-3d-preview.pp.']"));
        const ppValue = (input) => (input.type === "checkbox" ? input.checked : input.type === "color" || input.tagName === "COLOR-PICKER" || input.tagName === "SELECT" ? input.value : Number(input.value));
        ppInputs.forEach((input) => {
            input.addEventListener("change", () => {
                const ppData = Object.fromEntries(ppInputs.map((ppInput) => [ppInput.name.split(".").pop(), ppValue(ppInput)]));
                game.Levels3DPreview.uberPass?.setupUniforms(ppData);
            });
        });

        const bloomFlags = ["bloomThreshold", "bloomStrength", "bloomRadius"];
        const customTableFlags = ["tableTex", "tableHeightmap", "tableHeightmapScale", "tableColor"];
        const fogFlags = ["fogColor", "fogDistance"];
        const surfaceFlags = Object.keys(surfaceConfigFields()).filter((key) => key !== `${SURFACE_FLAG}.enabled`);
        hideParams(app, html, `[name="flags.levels-3d-preview.bloom"]`, bloomFlags, false);
        hideParams(app, html, `[name="flags.levels-3d-preview.${SURFACE_FLAG}.enabled"]`, surfaceFlags, false);
        hideParams(app, html, `[name="flags.levels-3d-preview.renderTable"]`, customTableFlags, ["table", "matcustom"], true);
        const edgeSelect = html.querySelector(`[name="flags.levels-3d-preview.mapEdge"]`);
        const tableSelect = html.querySelector(`[name="flags.levels-3d-preview.renderTable"]`);
        const toggleGroup = (name, show) => html.querySelector(`[name="flags.levels-3d-preview.${name}"]`)?.closest(".form-group")?.classList.toggle("hidden", !show);
        edgeSelect?.addEventListener("change", () => {
            const edge = edgeSelect.value;
            toggleGroup("edgeTexture", edge === "fade");
            toggleGroup("edgeColor", edge === "fade");
            toggleGroup("renderTable", edge === "legacy");
            if (edge === "legacy") tableSelect?.dispatchEvent(new Event("change"));
            else customTableFlags.forEach((f) => toggleGroup(f, false));
            app.setPosition({ height: "auto" });
        });
        edgeSelect?.dispatchEvent(new Event("change"));
        hideParams(app, html, `[name="flags.levels-3d-preview.enableFog"]`, fogFlags, false);

        if (isDynamicSkyEnabled(app.document)) {
            ["exr", "fogColor"].forEach((flag) => {
                const group = html.querySelector(`[name="flags.levels-3d-preview.${flag}"]`)?.closest(".form-group");
                if (group) group.style.display = "none";
            });
        }
        html.querySelector("button[data-key='sky-config']")?.addEventListener("click", (e) => {
            e.preventDefault();
            new DynamicSkyConfig(app.document).render(true);
        });
        if (app._activeTab) html.querySelector(`nav[data-group="levels-3d-preview"] .item[data-tab="${app._activeTab}"]`)?.click();

        if (canvas.scene.id !== app.document.id) return;
        const bloomInputs = ["bloom", ...bloomFlags].map((key) => html.querySelector(`[name="flags.levels-3d-preview.${key}"]`)).filter(Boolean);
        const previewBloom = () => {
            if (!game.Levels3DPreview?._active) return;
            game.Levels3DPreview.setBloom(Object.fromEntries(bloomInputs.map((input) => [input.name.split(".").pop(), input.type === "checkbox" ? input.checked : Number(input.value)])));
        };
        bloomInputs.forEach((input) => ["input", "change"].forEach((type) => input.addEventListener(type, previewBloom)));
        html.querySelectorAll("[name^='flags.levels-3d-preview.']").forEach(el => el.addEventListener("change", (e) => {
            if (!game.Levels3DPreview._active) return;
            const sunPosition = html.querySelector("[name='flags.levels-3d-preview.sunPosition']").value;
            const sunDistance = html.querySelector("[name='flags.levels-3d-preview.sunDistance']").value;
            const sceneTint = html.querySelector("[name='flags.levels-3d-preview.sceneTint']").value;
            const exposure = html.querySelector("[name='flags.levels-3d-preview.exposure']").value;
            const sunTilt = html.querySelector("[name='flags.levels-3d-preview.sunTilt']").value;
            game.Levels3DPreview.lights.globalIllumination.setTarget({
                color: sceneTint,
                time: sunPosition,
                distance: sunDistance,
                exposure: exposure,
                tilt: sunTilt,
            });
        }));
        html.querySelector("#clear-3d-view")?.addEventListener("click", (e) => {
            e.preventDefault();
            canvas.scene.update({ "flags.levels-3d-preview.-=initialPosition": null }, { render: false });
            ui.notifications.notify(game.i18n.localize("levels3dpreview.notifications.initialviewcleared"));
        });
        html.querySelector("#capture-3d-view")?.addEventListener("click", (e) => {
            e.preventDefault();
            canvas.scene.update(
                {
                    "flags.levels-3d-preview.initialPosition": {
                        target: {
                            x: game.Levels3DPreview.controls.target.x,
                            y: game.Levels3DPreview.controls.target.y,
                            z: game.Levels3DPreview.controls.target.z,
                        },
                        position: {
                            x: game.Levels3DPreview.camera.position.x,
                            y: game.Levels3DPreview.camera.position.y,
                            z: game.Levels3DPreview.camera.position.z,
                        },
                        firstPersonMode: game.Levels3DPreview.firstPersonMode,
                    },
                },
                { render: false },
            );
            ui.notifications.notify(game.i18n.localize("levels3dpreview.notifications.initialviewcaptured"));
        });
    });

    const subTab = (key, icon) => ({
        tabLabel: game.i18n.localize(`levels3dpreview.sceneConfig.tabs.${key}`),
        tabIcon: icon,
    });

    const activateParticleFields = (html, PS) => {
        const field = (key) => html.querySelector(`[name="flags.levels-3d-preview.${key}"]`);
        const group = (key) => field(key).closest(".form-group");
        group("ParticleScale").classList.add("hidden");
        group("ParticleColor2").classList.add("hidden");
        const type = field("ParticleType");
        const refresh = () => ["ParticleIntensity", "ParticleColor"].forEach((key) => group(key).classList.toggle("hidden", type.value === "none"));
        type.addEventListener("change", () => {
            refresh();
            const defaults = PS.getDefaultLightData(type.value);
            if (defaults) field("ParticleScale").value = defaults.scale;
        });
        field("ParticleColor").addEventListener("change", () => (field("ParticleColor2").value = field("ParticleColor").value));
        refresh();
    };

    const renderTokenConfig = (app, html) => {
        html.querySelectorAll(`[data-tab="levels-3d-preview"]`).forEach(el => el.remove());
        const isPrototype = app instanceof foundry.applications.sheets.PrototypeTokenConfig;
        const PS = game.Levels3DPreview.CONFIG.PARTICLE_SYSTEMS;

        const particleSelect = {
            none: game.i18n.localize("levels3dpreview.flags.particlePreset.options.none"),
            ...PS.getSelectOptions(PS.TOKEN_PARTICLE_SYSTEMS, { localize: true }),
        };

        const injected = injectConfig.inject(
            app,
            html,
            {
                moduleId: "levels-3d-preview",
                tab: {
                    name: "levels-3d-preview",
                    label: "3D Canvas",
                    icon: "fas fa-cube",
                    subTabs: true,
                },
                "essentials-3d": {
                    ...subTab("essentials", "fas fa-cube"),
                    ...section("tokenBasics", "basics", {
                        model3d: {
                            type: "filepicker.any",
                            fpTypes: [".gltf", ".GLTF", ".glb", ".GLB", ".fbx", ".FBX"],
                            label: game.i18n.localize("levels3dpreview.flags.model3d.label"),
                        },
                        scale: {
                            type: "number",
                            label: game.i18n.localize("levels3dpreview.flags.scale.label"),
                            step: 0.00001,
                            default: 1,
                        },
                        flatTokenStyle: {
                            type: "select",
                            label: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.name"),
                            default: "default",
                            options: {
                                default: game.i18n.localize("levels3dpreview.flags.faceCamera.options.default"),
                                flat: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.options.flat"),
                                extruded: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.options.extruded"),
                                coin: game.i18n.localize("levels3dpreview.settings.flatTokenStyle.options.coin"),
                            },
                        },
                        color: {
                            type: "color",
                            label: game.i18n.localize("levels3dpreview.flags.tint.label"),
                            default: "#ffffff",
                        },
                    }),
                    ...section("tokenBase", "base", {
                        baseStyle: {
                            type: "custom",
                            html: `<div class="form-group">
                            <label>${game.i18n.localize("levels3dpreview.flags.baseStyle.label")}</label>
                            <div class="form-fields">
                                <select data-base-style>
                                    ${["default", "merge", "ontop", "hidden"].map((style) => `<option value="${style}">${game.i18n.localize(`levels3dpreview.flags.baseStyle.options.${style}`)}</option>`).join("")}
                                </select>
                            </div>
                        </div>`,
                        },
                        disableBase: {
                            type: "checkbox",
                            label: game.i18n.localize("levels3dpreview.flags.disableBase.label"),
                            default: false,
                        },
                        solidBaseMode: {
                            type: "select",
                            label: game.i18n.localize("levels3dpreview.flags.solidBaseMode.label"),
                            default: "default",
                            options: {
                                default: game.i18n.localize("levels3dpreview.flags.solidBaseMode.options.default"),
                                merge: game.i18n.localize("levels3dpreview.flags.solidBaseMode.options.merge"),
                                ontop: game.i18n.localize("levels3dpreview.flags.solidBaseMode.options.ontop"),
                            },
                        },
                        baseColor: {
                            type: "color",
                            label: game.i18n.localize("levels3dpreview.flags.baseColor.label"),
                            default: "",
                            placeholder: game.settings.get("levels-3d-preview", "solidBaseColor"),
                        },
                    }),
                    ...section("tokenAnimation", "animation", {
                        enableAnim: {
                            type: "checkbox",
                            label: game.i18n.localize("levels3dpreview.flags.enableAnim.label"),
                            default: true,
                        },
                        animIndex: {
                            type: "number",
                            label: game.i18n.localize("levels3dpreview.flags.animIndex.label"),
                            default: 0,
                        },
                        animSpeed: {
                            type: "range",
                            label: game.i18n.localize("levels3dpreview.flags.animSpeed.label"),
                            default: 1,
                            min: 0,
                            max: 10,
                            step: 0.1,
                        },
                    }),
                },
                "position-3d": {
                    ...subTab("position", "fas fa-arrows-alt"),
                    ...section("tokenPosition", "basics", {
                        autoCenter: {
                            type: "checkbox",
                            label: game.i18n.localize("levels3dpreview.flags.autoCenter.label"),
                            default: false,
                        },
                        rotationY: {
                            type: "range",
                            label: game.i18n.localize("levels3dpreview.flags.rotationY.label"),
                            default: 0,
                            min: 0,
                            max: 360,
                            step: 1,
                        },
                    }),
                    ...section("tokenOffset", "offset", {
                        offsetX: {
                            type: "number",
                            label: game.i18n.localize("levels3dpreview.flags.offsetX.label"),
                            default: 0,
                        },
                        offsetY: {
                            type: "number",
                            label: game.i18n.localize("levels3dpreview.flags.offsetY.label"),
                            default: 0,
                        },
                        offsetZ: {
                            type: "number",
                            label: game.i18n.localize("levels3dpreview.flags.offsetZ.label"),
                            default: 0,
                        },
                    }),
                },
                "effects-3d": {
                    ...subTab("effects", "fas fa-fire"),
                    ...section("tokenParticles", "basics", {
                        ParticleType: {
                            type: "select",
                            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleType.label"),
                            default: "none",
                            options: particleSelect,
                        },
                        ParticleIntensity: {
                            type: "range",
                            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleIntensity.label"),
                            default: 1,
                            min: 0.1,
                            max: 10,
                            step: 0.1,
                        },
                        ParticleScale: {
                            type: "number",
                            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleScale.label"),
                            units: game.i18n.localize("levels3dpreview.units.gu"),
                            default: 1,
                            step: 0.000001,
                        },
                        ParticleColor: {
                            type: "color",
                            label: game.i18n.localize("levels3dpreview.flags.particleColor.label"),
                            default: "#ffffff",
                        },
                        ParticleColor2: {
                            type: "color",
                            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleColor2.label"),
                            default: "#ffffff",
                        },
                    }),
                    ...section("tokenAura", "aura", {
                        auraRange: {
                            type: "number",
                            label: game.i18n.localize("levels3dpreview.flags.auraRange.label"),
                            default: 0,
                        },
                        auraColor: {
                            type: "color",
                            label: game.i18n.localize("levels3dpreview.flags.auraColor.label"),
                            default: "#ffffff",
                        },
                    }),
                    ...section("tokenShaders", "shaders", {
                        shaderConfig: {
                            type: "custom",
                            html: `<div id="shader-config"></div>`,
                        },
                    }),
                },
                ...(isPrototype
                    ? {}
                    : {
                          "attachments-3d": {
                              ...subTab("attachments", "fas fa-link"),
                              ...section("tokenAttachments", "basics", {
                                  attachmentConfig: {
                                      type: "custom",
                                      html: `<div id="attachment-config"></div>`,
                                  },
                              }),
                          },
                      }),
            },
            app.token,
        );

        const attachmentHeader = html.querySelector(`#attachment-config`);

        const attachments = (attachmentHeader && app.token.getFlag("levels-3d-preview", "attachments")) || [];

        //create a 2 column table with filename, delete button and hide button

        const table = document.createElement("table");
        table.classList.add("levels-3d-preview-attachments");
        table.innerHTML = `<thead><tr><th>${game.i18n.localize("levels3dpreview.flags.attachments.filename")}</th><th></th></tr></thead><tbody></tbody>`;

        const tbody = table.querySelector("tbody");

        attachments.forEach((attachment, index) => {
            const fileName = attachment.src.split("/").pop().split(".").shift();
            const row = document.createElement("tr");
            row.innerHTML = `<td>${fileName}</td><td style="display:flex;"><button class="levels-3d-preview-togglehide-attachment" data-index="${index}"><i class="fas ${attachment.hidden ? "fa-eye-slash" : "fa-eye"}"></i></button><button class="levels-3d-preview-delete-attachment" data-index="${index}"><i class="fas fa-trash"></i></button></td>`;
            tbody.appendChild(row);
        });

        table.querySelectorAll(".levels-3d-preview-delete-attachment").forEach(btn => btn.addEventListener("click", (event) => {
            event.preventDefault();
            const index = parseInt(event.currentTarget.dataset.index);
            const attachments = app.token.getFlag("levels-3d-preview", "attachments") || [];
            attachments.splice(index, 1);
            app.token.setFlag("levels-3d-preview", "attachments", attachments);
        }));
        table.querySelectorAll(".levels-3d-preview-togglehide-attachment").forEach(btn => btn.addEventListener("click", (event) => {
            event.preventDefault();
            const index = parseInt(event.currentTarget.dataset.index);
            const attachments = app.token.getFlag("levels-3d-preview", "attachments") || [];
            attachments[index].hidden = !attachments[index].hidden;
            app.token.setFlag("levels-3d-preview", "attachments", attachments);
        }));
        if (attachments.length > 0) {
            attachmentHeader.replaceWith(table);
        } else if (attachmentHeader) {
            attachmentHeader.outerHTML = `<p class="hint">${game.i18n.localize("levels3dpreview.flags.attachments.hint")}</p>`;
        }
        ShaderConfig.injectButton(app, html, html.querySelector(`#shader-config`));

        activateParticleFields(html, PS);
        const disableBase = html.querySelector(`[name="flags.levels-3d-preview.disableBase"]`);
        const solidBaseMode = html.querySelector(`[name="flags.levels-3d-preview.solidBaseMode"]`);
        const baseStyle = html.querySelector("[data-base-style]");
        [disableBase, solidBaseMode].forEach((input) => input.closest(".form-group").classList.add("hidden"));
        baseStyle.value = disableBase.checked ? "hidden" : solidBaseMode.value;
        baseStyle.addEventListener("change", () => {
            disableBase.checked = baseStyle.value === "hidden";
            if (!disableBase.checked) solidBaseMode.value = baseStyle.value;
        });
        injectBakeButton(app, html);
    }

    Hooks.on("renderPrototypeTokenConfig", renderTokenConfig)

    Hooks.on("renderTokenConfig", renderTokenConfig);

    Hooks.on("renderTileConfig", (app, html) => {
        html.querySelectorAll(`[data-tab="levels-3d-preview"]`).forEach(el => el.remove());
        const tile3d = game.Levels3DPreview.tiles[app.document.id];

        const PS = game.Levels3DPreview.CONFIG.PARTICLE_SYSTEMS;

        const particleSelect = {
            none: game.i18n.localize("levels3dpreview.flags.particlePreset.options.none"),
            ...PS.getSelectOptions(PS.TILE_PARTICLE_SYSTEMS, { localize: true }),
        };

        const injected = injectConfig.inject(app, html, {
            moduleId: "levels-3d-preview",
            tab: {
                name: "levels-3d-preview",
                label: "3D Canvas",
                icon: "fas fa-cube",
                subTabs: true,
            },
            "essentials-3d": {
                ...subTab("essentials", "fas fa-cube"),
                ...section("tileBasics", "basics", {
                    model3d: {
                        type: "filepicker.any",
                        fpTypes: [".gltf", ".GLTF", ".glb", ".GLB", ".fbx", ".FBX"],
                        label: game.i18n.localize("levels3dpreview.flags.model3d.label"),
                    },
                    dynaMesh: {
                        type: "select",
                        label: game.i18n.localize("levels3dpreview.flags.dynaMesh.label"),
                        default: "default",
                        options: {
                            default: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.default"),
                            optbasic: {
                                optgroup: {
                                    start: true,
                                    label: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.optgroup.basic"),
                                },
                            },
                            box: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.box"),
                            plane: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.plane"),
                            sphere: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.sphere"),
                            dome: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.dome"),
                            cylinder: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.cylinder"),
                            tube: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.tube"),
                            cone: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.cone"),
                            billboard: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.billboard"),
                            billboard2: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.billboard2"),
                            text: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.text"),
                            decal: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.decal"),
                            optcomplex: {
                                optgroup: {
                                    start: true,
                                    label: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.optgroup.complex"),
                                },
                            },
                            stairs: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.stairs"),
                            paper: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.paper"),
                            rock: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.rock"),
                            rocksphere: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.rocksphere"),
                            rockcylinder: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.rockcylinder"),
                            rockcone: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.rockcone"),
                            optinteractive: {
                                optgroup: {
                                    start: true,
                                    label: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.optgroup.interactive"),
                                },
                            },
                            counter: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.counter"),
                            counterradial: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.counterradial"),
                            optspecial: {
                                optgroup: {
                                    start: true,
                                    label: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.optgroup.special"),
                                },
                            },
                            mapGen: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.mapGen"),
                            mapMaker: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.mapMaker"),
                            optadvanced: {
                                optgroup: {
                                    start: true,
                                    label: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.optgroup.advanced"),
                                },
                            },
                            polygon: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygon"),
                            polygonbevel: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygonbevel"),
                            polygonsolidify: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygonsolidify"),
                            polygonbevelsolidify: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygonbevelsolidify"),
                            polygonbevelsolidifyjagged: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygonbevelsolidifyjagged"),
                            polygonbevelsolidifyjaggeddouble: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygonbevelsolidifyjaggeddouble"),
                            polygonbevelsolidifyjaggedstraight: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygonbevelsolidifyjaggedstraight"),
                            polygonlathe: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygonlathe"),
                            polygonchain: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.polygonchain"),
                            vines: game.i18n.localize("levels3dpreview.flags.dynaMesh.options.vines"),
                        },
                    },
                    dynaMeshResolution: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.dynaMeshResolution.label"),
                        default: 1,
                        min: 0.1,
                        max: 10,
                        step: 0.1,
                    },
                    font: {
                        type: "filepicker.any",
                        fpTypes: [".json"],
                        label: game.i18n.localize("levels3dpreview.flags.font.label"),
                        notes: game.i18n.localize("levels3dpreview.flags.font.notes"),
                    },
                    autoGround: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.autoGround.label"),
                        default: false,
                    },
                    autoCenter: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.autoCenter.label"),
                        default: false,
                    },
                }),
                ...section("tileCollision", "collisionSight", {
                    collision: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.tcollision.label"),
                        default: true,
                    },
                    sight: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.tsight.label"),
                        default: true,
                    },
                    cameraCollision: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.tcameraCollision.label"),
                        notes: game.i18n.localize("levels3dpreview.flags.tcameraCollision.notes"),
                        default: false,
                    },
                }),
                ...section("tileAnimation", "animation", {
                    enableAnim: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.enableAnim.label"),
                        default: true,
                    },
                    animIndex: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.animIndex.label"),
                        default: 0,
                    },
                    animSpeed: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.animSpeed.label"),
                        default: 1,
                        min: 0,
                        max: 10,
                        step: 0.1,
                    },
                    animationOnce: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.animationOnce.label"),
                        default: false,
                    },
                    paused: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.paused.label"),
                        default: false,
                    },
                    playback: {
                        type: "custom",
                        html: `<div class="form-group">
                    <label>${game.i18n.localize("levels3dpreview.flags.playback.label")}</label>
                    <div class="form-fields">
                        <select data-playback>
                            <option value="loop">${game.i18n.localize("levels3dpreview.flags.playback.options.loop")}</option>
                            <option value="once">${game.i18n.localize("levels3dpreview.flags.playback.options.once")}</option>
                            <option value="paused">${game.i18n.localize("levels3dpreview.flags.playback.options.paused")}</option>
                        </select>
                    </div>
                </div>`,
                    },
                }),
                ...section("tileInteraction", "interaction", {
                    highlightOnHover: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.highlightOnHover.label"),
                        default: false,
                    },
                    gmOnlyInteractive: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.gmOnlyInteractive.label"),
                        default: false,
                    },
                }),
            },
            "position-3d": {
                ...subTab("position", "fas fa-arrows-alt"),
                ...section("tilePosition", "basics", {
                    depth: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.depth.label"),
                        default: 100,
                        step: 0.000001,
                    },
                    tiltX: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.tiltX.label"),
                        default: 0,
                        step: "any",
                    },
                    tiltZ: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.tiltZ.label"),
                        default: 0,
                        step: "any",
                    },
                    "offset.x": {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.offset.x.label"),
                        default: 0,
                    },
                    "offset.z": {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.offset.y.label"),
                        default: 0,
                    },
                    "offset.y": {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.offset.z.label"),
                        default: 0,
                    },
                }),
            },
            "material-3d": {
                ...subTab("material", "fas fa-circle-half-stroke"),
                ...section(
                    "tileMaterial",
                    "basics",
                    {
                        imageTexture: {
                            type: "filepicker",
                            label: game.i18n.localize("levels3dpreview.flags.imageTexture.label"),
                        },
                        textureRepeat: {
                            type: "range",
                            label: game.i18n.localize("levels3dpreview.flags.textureRepeat.label"),
                            default: 1,
                            min: 1,
                            max: 128,
                            step: 1,
                        },
                        color: {
                            type: "color",
                            label: game.i18n.localize("levels3dpreview.flags.tint.label"),
                            default: "#ffffff",
                        },
                        roughness: {
                            type: "range",
                            label: game.i18n.localize("levels3dpreview.flags.roughness.label"),
                            default: -0.01,
                            min: -0.01,
                            max: 1,
                            step: 0.01,
                        },
                        metalness: {
                            type: "range",
                            label: game.i18n.localize("levels3dpreview.flags.metalness.label"),
                            default: -0.01,
                            min: -0.01,
                            max: 1,
                            step: 0.01,
                        },
                        transparency: {
                            type: "range",
                            label: game.i18n.localize("levels3dpreview.flags.transparency.label"),
                            default: -0.01,
                            min: -0.01,
                            max: 1,
                            step: 0.01,
                        },
                        castShadow: {
                            type: "checkbox",
                            label: game.i18n.localize("levels3dpreview.flags.castShadow.label"),
                            default: true,
                        },
                    },
                    game.i18n.localize("levels3dpreview.flags.material.hint"),
                ),
                ...section("tileMaterialAdvanced", "advanced", {
                    alphaClip: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.alphaClip.label"),
                        default: -0.01,
                        min: -0.01,
                        max: 1,
                        step: 0.01,
                    },
                    sides: {
                        type: "select",
                        label: game.i18n.localize("levels3dpreview.flags.sides.label"),
                        default: "default",
                        options: {
                            default: game.i18n.localize("levels3dpreview.flags.sides.options.default"),
                            FrontSide: game.i18n.localize("levels3dpreview.flags.sides.options.FrontSide"),
                            BackSide: game.i18n.localize("levels3dpreview.flags.sides.options.BackSide"),
                            DoubleSide: game.i18n.localize("levels3dpreview.flags.sides.options.DoubleSide"),
                        },
                    },
                }),
            },
            "door-3d": {
                ...subTab("door", "fas fa-door-open"),
                ...section("tileDoor", "basics", {
                    doorType: {
                        type: "select",
                        label: game.i18n.localize("levels3dpreview.flags.doorType.label"),
                        default: 0,
                        options: {
                            0: game.i18n.localize("WALL.DoorTypes.NONE"),
                            1: game.i18n.localize("WALL.DoorTypes.DOOR"),
                            2: game.i18n.localize("WALL.DoorTypes.SECRET"),
                        },
                    },
                    doorState: {
                        type: "select",
                        label: game.i18n.localize("WALL.FIELDS.ds.label"),
                        default: 0,
                        options: {
                            0: game.i18n.localize("WALL.DoorStates.CLOSED"),
                            1: game.i18n.localize("WALL.DoorStates.OPEN"),
                            2: game.i18n.localize("WALL.DoorStates.LOCKED"),
                        },
                    },
                    doorSound: {
                        type: "select",
                        label: game.i18n.localize("WALL.FIELDS.doorSound.label"),
                        default: "",
                        options: Object.entries(CONFIG.Wall.doorSounds).reduce(
                            (obj, [key, value]) => {
                                obj[key] = game.i18n.localize(value.label);
                                return obj;
                            },
                            { "": "" },
                        ),
                    },
                }),
                ...section("tileDoorMovement", "movement", {
                    doorStyle: {
                        type: "select",
                        label: game.i18n.localize("levels3dpreview.flags.doorStyle.label"),
                        default: 0,
                        options: {
                            0: game.i18n.localize("levels3dpreview.flags.doorStyle.options.transparent"),
                            1: game.i18n.localize("levels3dpreview.flags.doorStyle.options.animate"),
                            2: game.i18n.localize("levels3dpreview.flags.doorStyle.options.slide"),
                            3: game.i18n.localize("levels3dpreview.flags.doorStyle.options.slideVertical"),
                            4: game.i18n.localize("levels3dpreview.flags.doorStyle.options.linkWithAnimation"),
                            5: game.i18n.localize("levels3dpreview.flags.doorStyle.options.linkWithAnimationReversed")
                        },
                    },
                    doorDouble: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.doorDouble.label"),
                        notes: game.i18n.localize("levels3dpreview.flags.doorDouble.notes"),
                        default: false,
                    },
                    doorAnimationDuration: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.doorAnimationDuration.label"),
                        units: game.i18n.localize("levels3dpreview.flags.doorAnimationDuration.units"),
                        default: 400,
                    },
                    doorAnimateAngle: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.doorAnimateAngle.label"),
                        default: 90,
                        min: -180,
                        max: 180,
                        step: 1,
                    },
                    doorSlidePercent: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.doorSlidePercent.label"),
                        default: 50,
                    },
                    doorGrabTokens: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.doorGrabTokens.label"),
                        notes: game.i18n.localize("levels3dpreview.flags.doorGrabTokens.notes"),
                        default: false,
                    },
                }),
            },
            "effects-3d": {
                ...subTab("effects", "fas fa-fire"),
                ...section("tileParticles", "basics", {
                    ParticleType: {
                        type: "select",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleType.label"),
                        default: "none",
                        options: particleSelect,
                    },
                    ParticleIntensity: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleIntensity.label"),
                        default: 1,
                        min: 0.1,
                        max: 10,
                        step: 0.1,
                    },
                    ParticleScale: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleScale.label"),
                        units: game.i18n.localize("levels3dpreview.units.gu"),
                        default: 1,
                        step: 0.000001,
                    },
                    ParticleColor: {
                        type: "color",
                        label: game.i18n.localize("levels3dpreview.flags.particleColor.label"),
                        default: "#ffffff",
                    },
                    ParticleColor2: {
                        type: "color",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleColor2.label"),
                        default: "#ffffff",
                    },
                }),
                ...section("tileShaders", "shaders", {
                    shaderConfig: {
                        type: "custom",
                        html: `<div id="shader-config"></div>`,
                    },
                }),
            },
            ...scatterConfigTab(app.document),
        });

        activateScatterConfig(app, html);

        const flagInput = (flag) => html.querySelector(`[name="flags.levels-3d-preview.${flag}"]`);
        const paused = flagInput("paused");
        const once = flagInput("animationOnce");
        const playback = html.querySelector("[data-playback]");
        [paused, once].forEach((input) => input.closest(".form-group").classList.add("hidden"));
        playback.value = paused.checked ? "paused" : once.checked ? "once" : "loop";
        playback.addEventListener("change", () => {
            paused.checked = playback.value === "paused";
            if (!paused.checked) once.checked = playback.value === "once";
        });
        const animationGroups = [...["enableAnim", "animIndex", "animSpeed"].map((flag) => flagInput(flag)), playback].map((input) => input.closest(".form-group"));
        if (!tile3d?.hasAnimations) animationGroups.forEach((group) => group.classList.add("hidden"));

        const doorFields = {
            doorState: () => true,
            doorSound: () => true,
            doorStyle: () => true,
            doorGrabTokens: () => true,
            doorDouble: (style) => style === "1" || style === "2",
            doorAnimationDuration: (style) => ["1", "2", "3"].includes(style),
            doorAnimateAngle: (style) => style === "1" || style === "2",
            doorSlidePercent: (style) => style === "2" || style === "3",
        };
        const doorType = flagInput("doorType");
        const doorStyle = flagInput("doorStyle");
        const refreshDoor = () => {
            for (const [flag, shown] of Object.entries(doorFields)) flagInput(flag).closest(".form-group").classList.toggle("hidden", doorType.value === "0" || !shown(doorStyle.value));
            app.setPosition({ height: "auto" });
        };
        [doorType, doorStyle].forEach((input) => input.addEventListener("change", refreshDoor));
        refreshDoor();
        hideParams(app, html, `[name="flags.levels-3d-preview.dynaMesh"]`, ["dynaMeshResolution"], "default");
        hideParams(app, html, `[name="flags.levels-3d-preview.dynaMesh"]`, ["font"], "text", true);
        hideParams(app, html, `[name="flags.levels-3d-preview.dynaMesh"]`, ["gmOnlyInteractive"], ["counter", "counterradial"], true);

        ShaderConfig.injectButton(app, html, html.querySelector(`#shader-config`));

        injectBakeButton(app, html);

        const mapGenBtn = document.createElement("button");
        mapGenBtn.type = "button";
        mapGenBtn.title = "Configure Map Generator";
        mapGenBtn.innerHTML = `<i class="fas fa-cog" style="margin: 0;"></i>`;

        const dMLabel = html.querySelector(`label[for="flags.levels-3d-preview.dynaMesh"]`);
        const dMSelect = html.querySelector(`select[name="flags.levels-3d-preview.dynaMesh"]`);
        dMSelect.after(mapGenBtn);
        dMSelect.addEventListener("change", (e) => {
            mapGenBtn.style.display = dMSelect.value === "mapGen" ? "" : "none";
        });
        dMSelect.dispatchEvent(new Event("change"));
        mapGenBtn.addEventListener("click", (e) => {
            new MapGen(app.document).render(true);
        });

        activateParticleFields(html, PS);

        injectConfig._trySetPosition(app, { height: "auto" });
    });

    Hooks.on("renderWallConfig", (app, html) => {
        if (html.querySelectorAll(`[data-tab="levels-3d-preview"]`).length) return;

        injectConfig.inject(app, html, {
            moduleId: "levels-3d-preview",
            tab: {
                name: "levels-3d-preview",
                label: "3D",
                icon: "fas fa-cube",
                width: 1,
            },
            wallTexture: {
                type: "filepicker",
                label: game.i18n.localize("levels3dpreview.flags.imageTexture.label"),
            },
            wallSidesTexture: {
                type: "filepicker",
                label: game.i18n.localize("levels3dpreview.flags.wallSidesTexture.label"),
            },
            wallTint: {
                type: "color",
                label: game.i18n.localize("levels3dpreview.flags.color.label"),
                default: "#ffffff",
            },
            wallSidesTint: {
                type: "color",
                label: game.i18n.localize("levels3dpreview.flags.wallSidesTint.label"),
                default: "#ffffff",
            },
            stretchTex: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.flags.stretchTex.label"),
            },
            wallOpacity: {
                type: "range",
                label: game.i18n.localize("levels3dpreview.flags.wallOpacity.label"),
                default: 1,
                min: 0,
                max: 1,
                step: 0.01,
            },
            wallDepth: {
                type: "number",
                label: game.i18n.localize("levels3dpreview.flags.wallDepth.label"),
                default: 30,
            },
            roughness: {
                type: "range",
                label: game.i18n.localize("levels3dpreview.flags.roughness.label"),
                default: 1,
                min: 0,
                max: 1,
                step: 0.01,
            },
            metalness: {
                type: "range",
                label: game.i18n.localize("levels3dpreview.flags.metalness.label"),
                default: 1,
                min: 0,
                max: 1,
                step: 0.01,
            },
            alwaysVisible: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.flags.alwaysVisible.label"),
                default: false,
            },
            joinWall: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.flags.joinWall.label"),
                default: false,
            },
        });
    });

    Hooks.on("renderMeasuredTemplateConfig", (app, html) => {
        if (html.querySelector(`[name="flags.levels-3d-preview.tilt"]`)) return;

        injectConfig.inject(app, html, {
            moduleId: "levels-3d-preview",
            tab: {
                name: "levels-3d-preview",
                label: "3D",
                icon: "fas fa-cube",
            },
            tilt: {
                type: "range",
                label: game.i18n.localize("levels3dpreview.flags.tilt.label"),
                default: 0,
                step: 1,
                min: -180,
                max: 180,
            },
            isFog: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.flags.isFog.label"),
                notes: game.i18n.localize("levels3dpreview.flags.isFog.notes"),
                default: false,
            },
        });
        ShaderConfig.injectButton(app, html, html.querySelector(`input[name="flags.levels-3d-preview.isFog"]`).closest(".form-group"));
    });

    Hooks.on("renderNoteConfig", (app, html) => {
        if (html.querySelector(`[name="flags.levels-3d-preview.rotation"]`)) return;

        injectConfig.inject(app, html, {
            moduleId: "levels-3d-preview",
            tab: {
                name: "levels-3d-preview",
                label: "3D",
                icon: "fas fa-cube",
            },
            // inject: 'input[name="icon.custom"]',
            model3d: {
                type: "filepicker.any",
                fpTypes: [".gltf", ".GLTF", ".glb", ".GLB", ".fbx", ".FBX"],
                label: game.i18n.localize("levels3dpreview.flags.model3d.label"),
            },
            rotation: {
                type: "range",
                label: game.i18n.localize("levels3dpreview.flags.rotation.label"),
                default: 0,
                min: 0,
                max: 360,
                step: 1,
            },
        });
    });

    Hooks.on("renderAmbientLightConfig", (app, html) => {
        html.querySelectorAll(`[data-tab="levels-3d-preview"]`).forEach((el) => el.remove());

        const PS = game.Levels3DPreview.CONFIG.PARTICLE_SYSTEMS;

        const particleSelect = {
            ...PS.getSelectOptions(PS.TARGET_ONLY_PRESET_SYSTEMS, { localize: true }),
            optstart: { optgroup: { label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleType.options.optgroup"), start: true } },
            ...PS.getSelectOptions(PS.TEMPLATE_PARTICLE_SYSTEMS, { localize: true }),
            optend: { optgroup: { end: true } },
        };

        const fx = lightFxConfigFields();
        const injhtml = injectConfig.inject(app, html, {
            moduleId: "levels-3d-preview",
            tab: {
                name: "levels-3d-preview",
                label: "3D Canvas",
                icon: "fas fa-cube",
                subTabs: true,
            },
            "essentials-3d": {
                ...subTab("essentials", "fas fa-cube"),
                ...section("lightEssentials", "basics", {
                    lightFxPresets: fx.lightFxPresets,
                    ParticleColor: {
                        type: "color",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleColor.label"),
                        default: "#ffffff",
                    },
                    ParticleColor2: {
                        type: "color",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleColor2.label"),
                        default: "#ffffff",
                    },
                    ParticleIntensity: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleIntensity.label"),
                        default: 1,
                        min: 0.1,
                        max: 10,
                        step: 0.1,
                    },
                    lightHalo: fx.lightHalo,
                }),
            },
            "light-effects-3d": {
                ...subTab("lightEffects", "fas fa-sun"),
                ...section("lightEffects", "basics", {
                    castShadow: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.castShadow.label"),
                        default: false,
                        notes: game.i18n.localize("levels3dpreview.flags.castShadow.notes"),
                    },
                    visibleWhenDisabled: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.visibleWhenDisabled.label"),
                        default: false,
                        notes: game.i18n.localize("levels3dpreview.flags.visibleWhenDisabled.notes"),
                    },
                    lightHaloScale: fx.lightHaloScale,
                }),
                ...section("lightSpot", "spotlight", {
                    tilt: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.tilt.label"),
                        default: 0,
                        min: -90,
                        max: 90,
                        step: 1,
                    },
                    lightShaft: fx.lightShaft,
                    lightShaftIntensity: fx.lightShaftIntensity,
                    lightShaftMotes: fx.lightShaftMotes,
                }),
            },
            "particles-3d": {
                ...subTab("particles", "fas fa-fire"),
                ...section("lightParticles", "basics", {
                    enableParticle: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.enableParticle.label"),
                        default: false,
                    },
                    ParticleType: {
                        type: "select",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleType.label"),
                        default: "torch",
                        options: particleSelect,
                    },
                    enableParticleHidden: {
                        type: "checkbox",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.enableParticleHidden.label"),
                        default: false,
                    },
                    ParticleScale: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleScale.label"),
                        units: game.i18n.localize("levels3dpreview.units.gu"),
                        default: 1,
                        step: 0.000001,
                    },
                    ParticleEmitterSizeMultiplier: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleEmitterSizeMultiplier.label"),
                        notes: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleEmitterSizeMultiplier.notes"),
                        default: 1,
                        step: 0.000001,
                    },
                }),
                ...section("lightCustomParticles", "customParticle", {
                    ParticleSprite: {
                        type: "filepicker.any",
                        fpTypes: [".png", ".jpg", ".jpeg", ".webp", ".svg", ".webm", ".mp4", ".gif", ".PNG", ".JPG", ".JPEG", ".WEBP", ".SVG", ".WEBM", ".MP4", ".GIF", "JSON", "json"],
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleSprite.label"),
                        default: "modules/levels-3d-preview/assets/particles/emberssmall.png",
                    },
                    ParticleAlphaStart: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleAlphaStart.label"),
                        default: 0,
                        min: 0,
                        max: 1,
                        step: 0.01,
                    },
                    ParticleAlphaEnd: {
                        type: "range",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleAlphaEnd.label"),
                        default: 1,
                        min: 0,
                        max: 1,
                        step: 0.01,
                    },
                    ParticleLife: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleLife.label"),
                        units: game.i18n.localize("levels3dpreview.units.ms"),
                        default: 1000,
                        step: 0.000001,
                    },
                    ParticleCount: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleCount.label"),
                        default: 5,
                        step: 0.000001,
                    },
                    ParticleEmitTime: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleEmitTime.label"),
                        units: game.i18n.localize("levels3dpreview.units.ms"),
                        default: 1,
                        step: 0.000001,
                    },
                    ParticleForce: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleForce.label"),
                        default: 0,
                        step: 0.000001,
                    },
                    ParticlePushX: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticlePushX.label"),
                        default: 0,
                        step: 0.000001,
                    },
                    ParticlePushY: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticlePushY.label"),
                        default: 0,
                        step: 0.000001,
                    },
                    ParticlePushZ: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticlePushZ.label"),
                        default: 0,
                        step: 0.000001,
                    },
                    ParticleGravity: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleGravity.label"),
                        default: 1,
                        step: 0.000001,
                    },
                    ParticleMass: {
                        type: "number",
                        label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleMass.label"),
                        default: 1000,
                        step: 0.000001,
                    },
                }),
            },
        });
        let firstChange = true;
        const showSprite = ["mysteriouslights", "vortex", "sparks", "fairy", "magicsphere", "json"];
        const lightFlag = (key) => html.querySelector(`[name='flags.levels-3d-preview.${key}']`);
        const presetKeys = ["ParticleType", "enableParticleHidden", "ParticleIntensity", "ParticleScale", "ParticleEmitterSizeMultiplier", "ParticleColor", "ParticleColor2"];
        const customKeys = ["ParticleSprite", "ParticleAlphaStart", "ParticleAlphaEnd", "ParticleLife", "ParticleCount", "ParticleEmitTime", "ParticleForce", "ParticlePushX", "ParticlePushY", "ParticlePushZ", "ParticleGravity", "ParticleMass"];
        const color1 = html.querySelector("[name='flags.levels-3d-preview.ParticleColor'] input");
        const color2 = html.querySelector("[name='flags.levels-3d-preview.ParticleColor2'] input");
        const gradientPickerEl = GradientPicker.create(color1, color2);
        lightFlag("ParticleColor2").closest(".form-group").after(gradientPickerEl);
        const refreshParticles = () => {
            const enabled = lightFlag("enableParticle").checked;
            const value = lightFlag("ParticleType").value;
            const custom = value === "custom";
            presetKeys.forEach((key) => lightFlag(key).closest(".form-group").classList.toggle("hidden", !enabled || (key === "ParticleIntensity" && custom)));
            customKeys.forEach((key) => lightFlag(key).closest(".form-group").classList.toggle("hidden", !enabled || (!custom && !(key === "ParticleSprite" && showSprite.includes(value)))));
            gradientPickerEl.classList.toggle("hidden", !enabled);
            app.setPosition({ height: "auto" });
        };
        html.querySelector(`.tab[data-tab="levels-3d-preview"]`).addEventListener("change", (event) => {
            if (event.target.matches("[name='flags.levels-3d-preview.enableParticle']")) return refreshParticles();
            if (!event.target.matches("select[name='flags.levels-3d-preview.ParticleType']")) return;

            if (!firstChange) {
                const defaultValues = PS.getDefaultLightData(event.target.value);
                if (defaultValues) {
                    lightFlag("ParticleScale").value = defaultValues.scale;
                    lightFlag("ParticleEmitterSizeMultiplier").value = defaultValues.emitterSize;
                }
                lightFlag("enableParticle").checked = true;
            } else {
                firstChange = false;
            }

            refreshParticles();
        });

        lightFlag("ParticleType").dispatchEvent(new Event("change", { bubbles: true }));
        activateLightFxConfig(app, html);

        injectConfig._trySetPosition(app, { height: "auto" });
    });

    Hooks.on("renderUserConfig", (app, html) => {
        const emote = app.document.getFlag("levels-3d-preview", "emote") ?? "";
        const emoteHtml = `
        <fieldset>
            <legend>${game.i18n.localize("levels3dpreview.flags.emote.header")}</legend>
            <div class="form-group character">
            ${emote ? `<img class="avatar" src="${emote}" alt="Aoth (Human Druid)">` : ``}
                <div class="form-fields">
                    <file-picker name="flags.levels-3d-preview.emote" data-dtype="String" value="${emote}" type="image" />
                </div>
                <p class="hint">${game.i18n.localize("levels3dpreview.flags.emote.notes")}</p>
            </div>
        </fieldset>
        `;
        Array.from(html.querySelectorAll("fieldset")).at(-1).insertAdjacentHTML("afterend", emoteHtml);
    });

    Hooks.on("updateUser", (user, data) => {
        loadUserEmotes();
    });

    Hooks.on("updateTile", (tile, updates) => {
        const mapGenForm = foundry.applications.instances.values().find((w) => w instanceof MapGen);
        if (mapGenForm && mapGenForm.document === tile) mapGenForm.saveGridAndRefresh();
    });

    //KEYBINDINGS
    Hooks.on("init", () => {
        const { SHIFT, CONTROL, ALT } = foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS;
        game.keybindings.register("levels-3d-preview", "resetView", {
            name: game.i18n.localize("levels3dpreview.keybindings.resetView"),
            editable: [{ key: "KeyR", modifiers: [SHIFT] }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview.resetCamera();
            },
        });

        game.keybindings.register("levels-3d-preview", "cameraToToken", {
            name: game.i18n.localize("levels3dpreview.keybindings.cameraToToken"),
            editable: [{ key: "KeyX", modifiers: [SHIFT] }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview.setCameraToControlled();
            },
        });

        game.keybindings.register("levels-3d-preview", "removeWaypoint", {
            name: "levels3dpreview.keybindings.removeWaypoint",
            hint: "levels3dpreview.keybindings.removeWaypointHint",
            editable: [
                {
                    key: "Space",
                },
            ],
            onDown: () => {
                if (!game.Levels3DPreview?._active) return false;
                const draggedToken = canvas.tokens?._draggedToken;
                if (draggedToken) {
                    draggedToken._removeDragWaypoint();
                    return true;
                }
                return game.Levels3DPreview.interactionManager?.removeWaypoint() ?? false;
            },
            precedence: -1,
        });

        game.keybindings.register("levels-3d-preview", "lockcamera", {
            name: game.i18n.localize("levels3dpreview.keybindings.lockcamera"),
            editable: [{ key: "Space" }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview.GameCamera.lock = !game.Levels3DPreview.GameCamera.lock;
                document.querySelector("#clip-navigation-lock")?.classList.toggle("clip-navigation-enabled", game.Levels3DPreview.GameCamera.lock);
            },
        });
        game.keybindings.register("levels-3d-preview", "gameCameraTopDown", {
            name: game.i18n.localize("levels3dpreview.keybindings.gameCameraTopDown"),
            editable: [{ key: "KeyO" }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                if (game.Levels3DPreview.GameCamera.enabled) {
                    game.Levels3DPreview.GameCamera.toggleTopDown();
                } else {
                    game.Levels3DPreview.resetCamera(true);
                }
            },
        });

        game.keybindings.register("levels-3d-preview", "toggleCameraLockPosition", {
            name: game.i18n.localize("levels3dpreview.keybindings.toggleCameraLockPosition"),
            editable: [{ key: "KeyH" }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview._toggleCameraLockPosition = game.Levels3DPreview.camera.position.clone();
            },
            onUp: () => {
                game.Levels3DPreview._toggleCameraLockPosition = null;
                game.Levels3DPreview.GameCamera.onChangeFreeCamera();
            },
        });

        game.keybindings.register("levels-3d-preview", "toggleFirstPerson", {
            name: game.i18n.localize("levels3dpreview.keybindings.toggleFirstPerson"),
            editable: [{ key: "KeyL" }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview.toggleFirstPerson();
            },
        });

        game.keybindings.register("levels-3d-preview", "panUp", {
            name: game.i18n.localize("levels3dpreview.keybindings.panUp"),
            editable: [{ key: "KeyW" }],
            precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
            onDown: (context) => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                if (game.Levels3DPreview.firstPerson?.keyMove(context, "panUp", 0, -1)) return true;
                game.Levels3DPreview.controls.screenSpacePanning = false;
                game.Levels3DPreview.GameCamera.lock = false;
            },
            onUp: () => {
                game.Levels3DPreview.firstPerson?.keyRelease("panUp");
                game.Levels3DPreview.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
            },
        });

        game.keybindings.register("levels-3d-preview", "panDown", {
            name: game.i18n.localize("levels3dpreview.keybindings.panDown"),
            editable: [{ key: "KeyS" }],
            precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
            onDown: (context) => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                if (game.Levels3DPreview.firstPerson?.keyMove(context, "panDown", 0, 1)) return true;
                game.Levels3DPreview.controls.screenSpacePanning = false;
                game.Levels3DPreview.GameCamera.lock = false;
            },
            onUp: () => {
                game.Levels3DPreview.firstPerson?.keyRelease("panDown");
                game.Levels3DPreview.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
            },
        });

        game.keybindings.register("levels-3d-preview", "panLeft", {
            name: game.i18n.localize("levels3dpreview.keybindings.panLeft"),
            editable: [{ key: "KeyA" }],
            precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
            onDown: (context) => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                if (game.Levels3DPreview.firstPerson?.keyMove(context, "panLeft", -1, 0)) return true;
                game.Levels3DPreview.controls.screenSpacePanning = false;
                game.Levels3DPreview.GameCamera.lock = false;
            },
            onUp: () => {
                game.Levels3DPreview.firstPerson?.keyRelease("panLeft");
                game.Levels3DPreview.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
            },
        });

        game.keybindings.register("levels-3d-preview", "panRight", {
            name: game.i18n.localize("levels3dpreview.keybindings.panRight"),
            editable: [{ key: "KeyD" }],
            precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
            onDown: (context) => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                if (game.Levels3DPreview.firstPerson?.keyMove(context, "panRight", 1, 0)) return true;
                game.Levels3DPreview.controls.screenSpacePanning = false;
                game.Levels3DPreview.GameCamera.lock = false;
            },
            onUp: () => {
                game.Levels3DPreview.firstPerson?.keyRelease("panRight");
                game.Levels3DPreview.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
            },
        });

        const consumeIn3D = (context, action) => {
            if (!game.Levels3DPreview?._active || !context) return false;
            const KeyboardManager = foundry.helpers.interaction.KeyboardManager;
            let matching;
            try {
                matching = KeyboardManager._getMatchingActions?.(context) ?? game.keybindings.activeKeys.get(context.key) ?? [];
            } catch (e) {
                matching = game.keybindings.activeKeys.get(context.key) ?? [];
            }
            const own = matching.filter((a) => a.namespace === "levels-3d-preview");
            return own.length ? own[own.length - 1].action === action : true;
        };

        game.keybindings.register("levels-3d-preview", "pingcamera", {
            name: game.i18n.localize("levels3dpreview.keybindings.pingcamera"),
            editable: [{ key: "KeyQ", modifiers: [SHIFT] }],
            onDown: (context) => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return false;
                game.Levels3DPreview.helpers.focusCameraToCursor();
                return consumeIn3D(context, "pingcamera");
            },
        });

        let pingPicker = null;

        game.keybindings.register("levels-3d-preview", "ping", {
            name: game.i18n.localize("levels3dpreview.keybindings.ping"),
            editable: [{ key: "KeyE", modifiers: [SHIFT] }],
            onDown: (context) => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return false;
                pingPicker = new TacticalPingPicker();
                return consumeIn3D(context, "ping");
            },
            onUp: (context) => {
                if (!pingPicker) return false;
                const type = pingPicker?.close() ?? null;
                pingPicker = null;
                game.Levels3DPreview.helpers._ping(type);
                return consumeIn3D(context, "ping");
            },
        });

        game.keybindings.register("levels-3d-preview", "freeMode", {
            name: game.i18n.localize("levels3dpreview.keybindings.freeMode"),
            hint: game.i18n.localize("levels3dpreview.keybindings.freeModeHint"),
            editable: [{ key: "KeyF" }],
            onDown: (context) => {
                game.Levels3DPreview.interactionManager.isFreeMode = true;
                return consumeIn3D(context, "freeMode");
            },
            onUp: (context) => {
                const entity3D = game.Levels3DPreview.interactionManager.draggable?.userData?.entity3D;
                if (entity3D?.template && !game.Levels3DPreview.interactionManager.forceFree) entity3D.wasFreeMode = false;
                game.Levels3DPreview.interactionManager.isFreeMode = false;
                game.Levels3DPreview.interactionManager.forceFree = false;
                return consumeIn3D(context, "freeMode");
            },
        });

        game.keybindings.register("levels-3d-preview", "scale", {
            name: game.i18n.localize("levels3dpreview.keybindings.scale"),
            editable: [{ key: "KeyS" }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview.transformControls.setMode("scale");
                //game.Levels3DPreview.transformControls.showY = false;
            },
        });

        game.keybindings.register("levels-3d-preview", "translate", {
            name: game.i18n.localize("levels3dpreview.keybindings.translate"),
            editable: [{ key: "KeyT" }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview.transformControls.setMode("translate");
                //game.Levels3DPreview.transformControls.showY = true;
            },
        });

        game.keybindings.register("levels-3d-preview", "rotate", {
            name: game.i18n.localize("levels3dpreview.keybindings.rotate"),
            editable: [{ key: "KeyR" }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview.transformControls.setMode("rotate");
                //game.Levels3DPreview.transformControls.showY = true;
            },
        });

        game.keybindings.register("levels-3d-preview", "toggleGizmo", {
            name: game.i18n.localize("levels3dpreview.keybindings.toggleGizmo"),
            editable: [{ key: "KeyG" }],
            onDown: () => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
                game.Levels3DPreview.interactionManager.toggleGizmo();
            },
        });

        game.keybindings.register("levels-3d-preview", "toggleMode", {
            name: game.i18n.localize("levels3dpreview.keybindings.toggleMode"),
            editable: [{ key: "KeyQ" }],
            onDown: (context) => {
                if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return false;
                if (canvas.activeLayer?.options?.objectClass?.embeddedName !== "Tile" || canvas.tokens?._draggedToken) return false;
                const updates = [];
                for (let placeable of canvas.activeLayer.controlled) {
                    const modes = ["fit", "stretch", "tile"];
                    const mode = placeable.document.getFlag("levels-3d-preview", "fillType") ?? "fit";
                    const index = modes.indexOf(mode);
                    if (index === -1) continue;
                    const next = modes[(index + 1) % modes.length];
                    const update = {
                        _id: placeable.id,
                        flags: {
                            "levels-3d-preview": {
                                fillType: next,
                            },
                        },
                    };
                    updates.push(update);
                }
                canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
                return consumeIn3D(context, "toggleMode");
            },
            onUp: () => {},
        });

        game.keybindings.register("levels-3d-preview", "toggleSelect", {
            name: game.i18n.localize("levels3dpreview.keybindings.toggleSelect"),
            editable: [{ key: "KeyF" }],
            onDown: (context) => {
                game.Levels3DPreview.interactionManager._groupSelect = true;
                return consumeIn3D(context, "toggleSelect");
            },
            onUp: (context) => {
                if (!game.Levels3DPreview.interactionManager.groupSelectHandler._isSelecting) game.Levels3DPreview.interactionManager._groupSelect = false;
                return consumeIn3D(context, "toggleSelect");
            },
        });
    });

    //TOURS
    Hooks.on("ready", () => {
        RegisterTours();
    });
}
