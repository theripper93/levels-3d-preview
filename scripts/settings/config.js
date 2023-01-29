import { toggleAdvancedSettings, injectAdvancedToggle, hideParams } from '../helpers/helpers.js';
import { ShaderConfig } from '../shaders/ShaderLib.js';
import { RegisterTours } from '../tours/tours.js';
import { MapGen } from '../apps/mapgen.js';
import { promptForTour } from '../tours/toursHelpers.js';

Hooks.on("getSceneControlButtons", (buttons)=>{
    buttons.find(b => b.name === "token")?.tools?.push(
    {
        "name": "preview3d",
        "title": game.i18n.localize("levels3dpreview.controls.preview3d"),
        "icon": "fas fa-cube",
        button: true,
        visible: canvas?.scene?.getFlag("levels-3d-preview","enablePlayers") || game.user.isGM,
        onClick: () => {
            game.Levels3DPreview.toggle();
        },
    },
    {
        "name": "miniCanvas",
        "title": game.i18n.localize("levels3dpreview.controls.miniCanvas"),
        "icon": "fas fa-sign-out-alt",
        button: true,
        visible: !game.settings.get("levels-3d-preview", "sharedContext") && (canvas?.scene?.getFlag("levels-3d-preview","enablePlayers") || game.user.isGM),
        onClick: () => {
            if(!game.Levels3DPreview?._active) {
                return ui.notifications.warn(game.i18n.localize("levels3dpreview.errors.3dnotactive"))
            }
            miniCanvas.toggle();
        }
    });
    buttons.find(b => b.name === "tiles")?.tools?.push(
        {
            "name": "controlsRef",
            "title": game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.title`),
            "icon": "fas fa-gamepad",
            button: true,
            visible: game.Levels3DPreview?._active,
            onClick: () => {
                game.Levels3DPreview.interactionManager.showControlReference()
            },
        });
    if(game.Levels3DPreview?._active && game.user.isGM) buttons.find(b => b.name === "tiles").tools.find(t => t.name === "browse").onClick = () => { game.Levels3DPreview.open3DFilePicker() }
})

Hooks.on("renderSceneConfig", (app,html)=>{

    const data = {
        moduleId: "levels-3d-preview",
        tab: {
            name: "levels-3d-preview",
            label: "3D Canvas",
            icon: "fas fa-cube",
        },
        header1: {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-cube"></i> ${game.i18n.localize("levels3dpreview.settings.headers.basics.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.basics.notes")}</p><div>`,
        },
        enablePlayers: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enablePlayers.label"),
            default: false,
            notes: game.i18n.localize("levels3dpreview.flags.enablePlayers.notes"),
        },
        auto3d: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.auto3d.label"),
            default: false,
        },
        object3dSight: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.object3dSight.label"),
            default: false,
        },
        enableGameCamera: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableGameCamera.label"),
            notes: game.i18n.localize("levels3dpreview.flags.enableGameCamera.notes"),
            default: true,
        },
        enableFogOfWar: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableFogOfWar.label"),
            //notes: game.i18n.localize("levels3dpreview.flags.enableFogOfWar.notes"),
            default: false,
        },
        maxElevation: {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.maxElevation.label"),
            notes: game.i18n.localize("levels3dpreview.flags.maxElevation.notes"),
            default: 100000,
        },
        enableRuler: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableRuler.label"),
            default: true,
        },
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
                <p class="notes">${game.i18n.localize("levels3dpreview.flags.initialview.notes")}</p>
            </div>
            
            `,
        },
        header2: {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-cloud-sun"></i> ${game.i18n.localize("levels3dpreview.settings.headers.environment.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.environment.notes")}</p><div>`,
        },
        exr: {
            type: "filepicker.any",
            fpTypes: [".exr", ".jpeg", ".jpg", ".png", ".webp"],
            label: game.i18n.localize("levels3dpreview.flags.exr.label"),
            placeholder: game.i18n.localize("levels3dpreview.flags.exr.placeholder"),
            notes: game.i18n.localize("levels3dpreview.flags.exr.notes"),
            default: game.modules.get("canvas3dcompendium") ? "modules/canvas3dcompendium/assets/Beautiful-Sky/2K/Sky_LowPoly_01_Day_a.webp" : "modules/levels-3d-preview/assets/skybox/venice_sunrise_1k.exr",
        },
        skybox: {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.skybox.label"),
            placeholder: game.i18n.localize("levels3dpreview.flags.skybox.placeholder"),
            notes: game.i18n.localize("levels3dpreview.flags.skybox.notes"),
            default: game.modules.get("canvas3dcompendium") ? "" : "modules/levels-3d-preview/assets/skybox/humble/humble_bk.jpg",
        },
        renderBackground: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.renderBackground.label"),
            default: true,
            notes: game.i18n.localize("levels3dpreview.flags.renderBackground.notes"),
        },
        bloom: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.bloom.label"),
            default: false,
        },
        bloomThreshold: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.bloomThreshold.label"),
            min: 0,
            max: 1,
            step: 0.01,
            default: 0,
        },
        bloomStrength: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.bloomStrength.label"),
            min: 0,
            max: 1,
            step: 0.01,
            default: 0.4,
        },
        bloomRadius: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.bloomRadius.label"),
            min: 0,
            max: 1,
            step: 0.01,
            default: 0.4,
        },
        filter: {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.filter.label"),
            default: "none",
            options: {
                none: game.i18n.localize("levels3dpreview.flags.filter.options.none"),
                grayscale: game.i18n.localize("levels3dpreview.flags.filter.options.grayscale"),
                sepia: game.i18n.localize("levels3dpreview.flags.filter.options.sepia"),
                invert: game.i18n.localize("levels3dpreview.flags.filter.options.invert"),
                contrast: game.i18n.localize("levels3dpreview.flags.filter.options.contrast"),
                brightness: game.i18n.localize("levels3dpreview.flags.filter.options.brightness"),
                "hue-rotate": game.i18n.localize("levels3dpreview.flags.filter.options.hue"),
                saturate: game.i18n.localize("levels3dpreview.flags.filter.options.saturate"),
                custom: game.i18n.localize("levels3dpreview.flags.filter.options.custom"),
            },
        },
        filterStrength: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.filterStrength.label"),
            min: 0,
            max: 2,
            step: 0.01,
            default: 1,
        },
        filterCustom: {
            type: "text",
            label: game.i18n.localize("levels3dpreview.flags.filterCustom.label"),
            placeholder: game.i18n.localize("levels3dpreview.flags.filterCustom.placeholder"),
            default: "",
        },
        renderTable: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.renderTable.label"),
            default: false,
            notes: game.i18n.localize("levels3dpreview.flags.renderTable.notes"),
        },
        tableTex: {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.tableTex.label"),
            placeholder: "Table Texture",
        },
        enableFog: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableFog.label"),
            default: false,
        },
        fogColor: {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.fogColor.label"),
            default: "#000000",
        },
        fogDistance: {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.fogDistance.label"),
            default: 3000,
        },
        header3: {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fas fa-lightbulb"></i> ${game.i18n.localize("levels3dpreview.settings.headers.lighting.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.lighting.notes")}</p><div>`,
        },
        sceneTint: {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.sceneTint.label"),
            default: "#ffffff",
        },
        timeSync: {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.timeSync.label"),
            default: "off",
            options: {
                off: game.i18n.localize("levels3dpreview.flags.timeSync.options.off"),
                time: game.i18n.localize("levels3dpreview.flags.timeSync.options.time"),
                darkness: game.i18n.localize("levels3dpreview.flags.timeSync.options.darkness"),
                both: game.i18n.localize("levels3dpreview.flags.timeSync.options.both"),
            },
        },
        sunPosition: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.sunPosition.label"),
            default: 9,
            min: 0,
            max: 24,
        },
        exposure: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.exposure.label"),
            //notes: game.i18n.localize("levels3dpreview.flags.exposure.notes"),
            default: 1,
            min: 0.01,
            max: 2,
            step: 0.01,
        },
        sunDistance: {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.sunDistance.label"),
            default: 10,
        },
        sunTilt: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.sunTilt.label"),
            default: 0,
            min: -1,
            max: 1,
            step: 0.01,
        },
        shadowBias: {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.shadowBias.label"),
            notes: game.i18n.localize("levels3dpreview.flags.shadowBias.notes"),
            default: -0.00018,
            step: 0.000001,
        },
        header4: {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-cloud-showers-heavy"></i> ${game.i18n.localize("levels3dpreview.settings.headers.particles.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.particles.notes")}</p><div>`,
        },
        particlePreset2: {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.particlePreset.label1"),
            default: "none",
            options: {
                none: game.i18n.localize("levels3dpreview.flags.particlePreset.options.none"),
                rain: game.i18n.localize("levels3dpreview.flags.particlePreset.options.rain"),
                heavyrain: game.i18n.localize("levels3dpreview.flags.particlePreset.options.heavyrain"),
                snow: game.i18n.localize("levels3dpreview.flags.particlePreset.options.snow"),
                hail: game.i18n.localize("levels3dpreview.flags.particlePreset.options.hail"),
                leaves: game.i18n.localize("levels3dpreview.flags.particlePreset.options.leaves"),
                embers: game.i18n.localize("levels3dpreview.flags.particlePreset.options.embers"),
                mysteriouslights: game.i18n.localize("levels3dpreview.flags.particlePreset.options.mysteriouslights"),
                stars: game.i18n.localize("levels3dpreview.flags.particlePreset.options.stars"),
                starfall: game.i18n.localize("levels3dpreview.flags.particlePreset.options.starfall"),
                dust: game.i18n.localize("levels3dpreview.flags.particlePreset.options.dust"),
                smoke: game.i18n.localize("levels3dpreview.flags.particlePreset.options.smoke"),
                toxic: game.i18n.localize("levels3dpreview.flags.particlePreset.options.toxic"),
            },
        },
        particlePreset: {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.particlePreset.label2"),
            default: "none",
            options: {
                none: game.i18n.localize("levels3dpreview.flags.particlePreset.options.none"),
                rain: game.i18n.localize("levels3dpreview.flags.particlePreset.options.rain"),
                heavyrain: game.i18n.localize("levels3dpreview.flags.particlePreset.options.heavyrain"),
                snow: game.i18n.localize("levels3dpreview.flags.particlePreset.options.snow"),
                hail: game.i18n.localize("levels3dpreview.flags.particlePreset.options.hail"),
                leaves: game.i18n.localize("levels3dpreview.flags.particlePreset.options.leaves"),
                embers: game.i18n.localize("levels3dpreview.flags.particlePreset.options.embers"),
                mysteriouslights: game.i18n.localize("levels3dpreview.flags.particlePreset.options.mysteriouslights"),
                stars: game.i18n.localize("levels3dpreview.flags.particlePreset.options.stars"),
                starfall: game.i18n.localize("levels3dpreview.flags.particlePreset.options.starfall"),
                dust: game.i18n.localize("levels3dpreview.flags.particlePreset.options.dust"),
                smoke: game.i18n.localize("levels3dpreview.flags.particlePreset.options.smoke"),
                toxic: game.i18n.localize("levels3dpreview.flags.particlePreset.options.toxic"),
                custom: game.i18n.localize("levels3dpreview.flags.particlePreset.options.custom"),
            },
        },
        partGroupStart: {
            type: "custom",
            html: `<div id="part-group">`,
        },
        particleTexture: {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.particleTexture.label"),
            default: "",
        },
        particleDensity: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleDensity.label"),
            default: 100,
            min: 1,
            max: 1000,
            step: 1,
        },
        particleDirection: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleDirection.label"),
            default: 90,
            min: 0,
            max: 360,
            step: 1,
        },
        particleSize: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleSize.label"),
            default: 20,
            min: 1,
            max: 10000,
            step: 1,
        },
        particleColor: {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.particleColor.label"),
            default: "#ffc494",
        },
        particleOpacity: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleOpacity.label"),
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.01,
        },
        particleSpeed: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleSpeed.label"),
            default: 5,
            min: 0,
            max: 10,
            step: 0.1,
        },
        particleRotationspeed: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleRotationspeed.label"),
            default: 0,
            min: -10,
            max: 10,
            step: 0.1,
        },
        particleVelocity: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleVelocity.label"),
            default: 1,
            min: 0,
            max: 10,
            step: 0.1,
        },
        particleRandomRotation: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.particleRandomRotation.label"),
            default: false,
        },
        particleRandomScale: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.particleRandomScale.label"),
            default: true,
        },
        particleBlend: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.particleBlend.label"),
            default: false,
        },
        partGroupEnd: {
            type: "custom",
            html: `</div>`,
        },
        header5: {
            type: "custom",
            html: `<div id="levels3dpreview-visibility"><h3 class="form-header"><i class="fas fa-eye"></i> ${game.i18n.localize("levels3dpreview.settings.headers.visibility.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.visibility.notes")}</p></div>`,
        },
        showSceneWalls: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.showSceneWalls.label"),
            default: true,
        },
        showSceneDoors: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.showSceneDoors.label"),
            default: true,
        },
        showSceneFloors: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.showSceneFloors.label"),
            default: true,
        },
        renderSceneLights: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.renderSceneLights.label"),
            default: true,
        },
        mirrorLevels: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.mirrorLevels.label"),
            default: false,
        },
    };

    const injected = injectConfig.inject(app,html,data);
    html.on("change", `select[name="flags.levels-3d-preview.particlePreset"]`, (e) => {
        const value = e.target.value;
        if (value === "custom") {
            html.find(`#part-group`).slideDown(100);
        } else {
            html.find(`#part-group`).slideUp(100);
        }
    })
    html.find(`select[name="flags.levels-3d-preview.particlePreset"]`).trigger("change");

    const advancedSettings = ["mirrorLevels","sunDistance", "sunTilt", "renderTable", "tableTex", "enableGameCamera", "maxElevation","enableRuler","lockCamera","skybox","enableFog","fogColor","fogDistance","sceneTint","timeSync","shadowBias","showSceneWalls","showSceneDoors","showSceneFloors","renderSceneLights"];
    const other = [html.find("#levels3dpreview-visibility")];
    const bloomFlags = ["bloomThreshold","bloomStrength","bloomRadius"];
    const filterFlags = ["filterStrength", "filterCustom"];
    hideParams(app, html, `input[name="flags.levels-3d-preview.bloom"]`, bloomFlags, false);
    hideParams(app, html, `select[name="flags.levels-3d-preview.filter"]`, filterFlags, "none");
    
    injectAdvancedToggle(app,html,advancedSettings, injected, other);

    if(canvas.scene.id !== app.object.id) return;
    html.on("change", "input", (e)=>{
        if(!game.Levels3DPreview._active) return;
        const sunPosition = html.find("input[name='flags.levels-3d-preview.sunPosition']")[0].value;
        const sunDistance = html.find("input[name='flags.levels-3d-preview.sunDistance']")[0].value;
        const sceneTint = html.find("input[name='flags.levels-3d-preview.sceneTint']")[0].value;
        const exposure = html.find("input[name='flags.levels-3d-preview.exposure']")[0].value;
        const sunTilt = html.find("input[name='flags.levels-3d-preview.sunTilt']")[0].value;
        game.Levels3DPreview.lights.globalIllumination.setTarget(
            {
                color: sceneTint,
                time: sunPosition,
                distance: sunDistance,
                exposure: exposure,
                tilt: sunTilt,
            }
        )
    })
    html.on("click", "#clear-3d-view", (e)=>{
        e.preventDefault();
        canvas.scene.update({"flags.levels-3d-preview.-=initialPosition": null}, {render: false});
    })
    html.on("click", "#capture-3d-view", (e)=>{
        e.preventDefault();
        canvas.scene.update({"flags.levels-3d-preview.initialPosition": {
            target: game.Levels3DPreview.controls.target.clone(),
            position: game.Levels3DPreview.camera.position.clone(),
        }}, {render: false});
    })
})

Hooks.on("renderTokenConfig", (app,html)=>{
    const dmSelect = {}
    game.Levels3DPreview.CONFIG.presetMaterials.forEach(m => { dmSelect["preset-"+m.id] = m.name || game.i18n.localize(`levels3dpreview.flags.material.options.presets.${m.id}`) })


    const injected = injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "tab" : {
            "name": "levels-3d-preview",
            "label": "3D",
            "icon": "fas fa-cube",
        },
        "model3d" : {
            type: "filepicker.any",
            fpTypes: [".gltf", ".GLTF", ".glb", ".GLB", ".fbx", ".FBX"],
            label: game.i18n.localize("levels3dpreview.flags.model3d.label"),
        },
        "imageTexture":{
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.imageTexture.label"),

        },
        "material": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.material.label"),
            default: "none",
            options: {
                "none": game.i18n.localize("levels3dpreview.flags.material.options.none"),
                "preOptStart": {
                    optgroup: {
                        start: true,
                        label: game.i18n.localize("levels3dpreview.flags.material.options.optgroup.presets"),
                    }
                },
                ...dmSelect,
                "preOptEnd": { optgroup: {} },
                "advOptStart": {
                    optgroup: {
                        start: true,
                        label: game.i18n.localize("levels3dpreview.flags.material.options.optgroup.advanced"),
                    }
                },
                "basic": game.i18n.localize("levels3dpreview.flags.material.options.basic"),
                "texcol": game.i18n.localize("levels3dpreview.flags.material.options.texcol"),
                "plastic": game.i18n.localize("levels3dpreview.flags.material.options.plastic"),
                "wood": game.i18n.localize("levels3dpreview.flags.material.options.wood"),
                "metal": game.i18n.localize("levels3dpreview.flags.material.options.metal"),
                "pbr": game.i18n.localize("levels3dpreview.flags.material.options.pbr"),
                "advOptEnd": { optgroup: {} },
            }
        },
        "color": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.color.label"),
            default: "#ffffff",
            notes: game.i18n.localize("levels3dpreview.flags.color.notes")
        },
        "baseColor": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.baseColor.label"),
            default: "",
        },
        "disableBase": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.disableBase.label"),
            default: false,
        },
        "removeBase": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.removeBase.label"),
            notes: game.i18n.localize("levels3dpreview.flags.removeBase.notes"),
            default: true,
        },
        "solidBaseMode": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.solidBaseMode.label"),
            default: "default",
            options: {
                "default": game.i18n.localize("levels3dpreview.flags.solidBaseMode.options.default"),
                "merge": game.i18n.localize("levels3dpreview.flags.solidBaseMode.options.merge"),
                "ontop": game.i18n.localize("levels3dpreview.flags.solidBaseMode.options.ontop"),
            }
        },
        "stem": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.stem.label"),
            default: false,
        },
        "enableAnim": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableAnim.label"),
            default: true,
        },
        "animIndex":{
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.animIndex.label"),
            default: 0,
        },
        "animSpeed":{
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.animSpeed.label"),
            default: 1,
            min: 0,
            max: 10,
            step: 0.1,
        },
        "faceCamera": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.faceCamera.label"),
            default: 0,
            options: {
                0: game.i18n.localize("levels3dpreview.flags.faceCamera.options.default"),
                1: game.i18n.localize("levels3dpreview.flags.faceCamera.options.face"),
                2: game.i18n.localize("levels3dpreview.flags.faceCamera.options.noface"),
            }
        },
        "autoCenter": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.autoCenter.label"),
            default: true,
        },
        "rotationX" : {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.rotationX.label"),
            default: 0,
            min: 0,
            max: 360,
            step: 1,
        },
        "rotationY" : {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.rotationY.label"),
            default: 0,
            min: 0,
            max: 360,
            step: 1,
        },
        "rotationZ" : {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.rotationZ.label"),
            default: 0,
            min: 0,
            max: 360,
            step: 1,
        },
        "offsetX": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.offsetX.label"),
            default: 0,
        },
        "offsetY": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.offsetY.label"),
            default: 0,
        },
        "offsetZ": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.offsetZ.label"),
            default: 0,
        },
        "scale": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.scale.label"),
            step: 0.00001,
            default: 1,
        },
        "header1": {
            type: "custom",
            html: `<h3 class="form-header" id="shader-config"><i class="fas fa-magic"></i> ${game.i18n.localize("levels3dpreview.flags.shader.header")}</h3><div>`
        },
    }, app.token)

    const advancedSettings = ["imageTexture","baseColor","disableBase","removeBase","solidBaseMode","animIndex","animSpeed","faceCamera","autoCenter","rotationX","rotationY","rotationZ","offsetX","offsetY","offsetZ"];
    ShaderConfig.injectButton(app, html, html.find(`#shader-config`));
    injectAdvancedToggle(app,html,advancedSettings, injected);
})

Hooks.on("renderTileConfig", (app,html)=>{
    if(html.find(`a[data-tab="levels-3d-preview"]>`).length) return;
    let meshStats
    try {
        meshStats = game.Levels3DPreview.tiles[app.object.id]?.getMeshStats();
    } catch (e) {}
    
    const injected = injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "tab" : {
            "name": "levels-3d-preview",
            "label": "3D",
            "icon": "fas fa-cube",
        },
        "meshstats": {
            type: "custom",
            html: meshStats ? `<p style="text-align: center; color: ${meshStats.status}">${game.i18n.localize("levels3dpreview.flags.meshStats").replace("%v%", meshStats.vertices).replace("%t%", meshStats.faces).replace("%m%", meshStats.meshes).replace("%i%", meshStats.instances)}</p><hr>` : ""
        },
        "model3d" : {
            type: "filepicker.any",
            fpTypes: [".gltf", ".GLTF", ".glb", ".GLB", ".fbx", ".FBX"],
            label: game.i18n.localize("levels3dpreview.flags.model3d.label"),
        },
        "dynaMesh": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.dynaMesh.label"),
            default: "default",
            options: {
                "default": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.default"),
                "box": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.box"),
                "sphere": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.sphere"),
                "dome": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.dome"),
                "cylinder": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.cylinder"),
                "tube": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.tube"),
                "cone": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.cone"),
                "billboard": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.billboard"),
                "billboard2": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.billboard2"),
                "text": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.text"),
                "mapGen": game.i18n.localize("levels3dpreview.flags.dynaMesh.options.mapGen"),
            }
        },
        "dynaMeshResolution": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.dynaMeshResolution.label"),
            default: 1,
            min: 0.1,
            max: 10,
            step: 0.1,
        },
        "imageTexture":{
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.imageTexture.label"),

        },
        "textureRepeat": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.textureRepeat.label"),
            default: 1,
            min: 1,
            max: 128,
            step: 1,
        },
        "flipY": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.flipY.label"),
            default: false,
        },
        "displacementMap":{
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.displacementMap.label"),
        },
        "invertDisplacementMap": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.invertDisplacementMap.label"),
        },
        "displacementIntensity": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.displacementIntensity.label"),
            default: 1,
        },
        "displacementMatrix": {
            type: "text",
            label: game.i18n.localize("levels3dpreview.flags.displacementMatrix.label"),
            default: "0,0,1,1",
        },
        "color": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.tint.label"),
            default: "#ffffff",
        },
        "roughness": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.roughness.label"),
            default: -0.01,
            min: -0.01,
            max: 1,
            step: 0.01,
        },
        "metalness": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.metalness.label"),
            default: -0.01,
            min: -0.01,
            max: 1,
            step: 0.01,
        },
        "transparency": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.transparency.label"),
            default: -0.01,
            min: -0.01,
            max: 1,
            step: 0.01,
        },
        "shading": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.shading.label"),
            default: "default",
            options: {
                "default": game.i18n.localize("levels3dpreview.flags.shading.options.default"),
                "flat": game.i18n.localize("levels3dpreview.flags.shading.options.flat"),
                "smooth": game.i18n.localize("levels3dpreview.flags.shading.options.smooth"),
            }
        },
        "sides": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.sides.label"),
            default: "default",
            options: {
                "default": game.i18n.localize("levels3dpreview.flags.sides.options.default"),
                "FrontSide": game.i18n.localize("levels3dpreview.flags.sides.options.FrontSide"),
                "BackSide": game.i18n.localize("levels3dpreview.flags.sides.options.BackSide"),
                "DoubleSide": game.i18n.localize("levels3dpreview.flags.sides.options.DoubleSide"),
            }
        },
        "autoCenter": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.autoCenter.label"),
            default: false,
        },
        "autoGround": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.autoGround.label"),
            default: false,
        },
        "enableAnim": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableAnim.label"),
            default: true,
        },
        "animIndex":{
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.animIndex.label"),
            default: 0,
        },
        "animSpeed":{
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.animSpeed.label"),
            default: 1,
            min: 0,
            max: 10,
            step: 0.1,
        },
        "paused": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.paused.label"),
            default: false,
        },
        "tiltX": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.tiltX.label"),  
            default: 0,
            step: "any",
        },
        "tiltZ": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.tiltZ.label"),
            default: 0,
            step: "any",
        },
        "depth": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.depth.label"),
            default: 100,
            step: 0.000001,
        },
        "randomSeed": {
            type: "text",
            label: game.i18n.localize("levels3dpreview.flags.randomSeed.label"),
            default: app.object.id.substring(0,7),
        },
        "header4": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-eye"></i> ${game.i18n.localize("levels3dpreview.flags.tsight.header")}</h3><div>`
        },
        "collision": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.tcollision.label"),
            default: true,
        },
        "sight": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.tsight.label"),
            default: true,
        },
        "cameraCollision": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.tcameraCollision.label"),
            default: false,
        },
        "sightMeshComplexity": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.sightMeshComplexity.label"),
            default: 1,
            min: 0.1,
            max: 1,
            step: 0.1,
        },
        "doorType": {
            type: "select",
            label: game.i18n.localize("WALLS.Door"),
            default: 0,
            options: {
                0: game.i18n.localize("levels3dpreview.flags.doorType.options.none"),
                1: game.i18n.localize("levels3dpreview.flags.doorType.options.door"),
                2: game.i18n.localize("levels3dpreview.flags.doorType.options.secret"),
            }
        },
        "doorState": {
            type: "select",
            label: game.i18n.localize("WALLS.DoorState"),
            default: 0,
            options: {
                0: game.i18n.localize("levels3dpreview.flags.doorState.options.closed"),
                1: game.i18n.localize("levels3dpreview.flags.doorState.options.open"),
                2: game.i18n.localize("levels3dpreview.flags.doorState.options.locked"),
            }
        },
        "header3": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-th"></i> ${game.i18n.localize("levels3dpreview.flags.fillType.header")}</h3><div>`
        },
        "fillType": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.fillType.label"),
            default: "stretch",
            options: {
                "stretch": game.i18n.localize("levels3dpreview.flags.fillType.options.stretch"),
                "tile": game.i18n.localize("levels3dpreview.flags.fillType.options.tile"),
            }
        },
        "enableGravity": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.enableGravity.label"),
            default: "none",
            options: {
                "none": game.i18n.localize("levels3dpreview.flags.enableGravity.options.none"),
                "gravity": game.i18n.localize("levels3dpreview.flags.enableGravity.options.gravity"),
                "gravityRotation": game.i18n.localize("levels3dpreview.flags.enableGravity.options.gravityRotation"),
            }
        },
        "tileScale": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.tileScale.label"),
            step: 0.00001,
            default: 1,
        },
        "yScale": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.yScale.label"),
            default: 1,
            step: 0.000001,
        },
        "gap": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.gap.label"),
            units: game.i18n.localize("levels3dpreview.units.gs"),
            default: 0,
            step: 0.00001,
        },
        "randomRotation":{
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.randomRotation.label"),
            default: false,
        },
        "randomScale":{
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.randomScale.label"),
            default: false,
        },
        "randomDepth": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.randomDepth.label"),
            default: false,
        },
        "randomPosition": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.randomPosition.label"),
            default: false,
        },
        "randomColor": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.randomColor.label"),
            default: false,
        },
        "header1": {
            type: "custom",
            html: `<h3 class="form-header" id="shader-config"><i class="fas fa-magic"></i> ${game.i18n.localize("levels3dpreview.flags.shader.header")}</h3><div>`
        },
        "header2": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-mountain"></i></i> ${game.i18n.localize("levels3dpreview.flags.noise.header")}</h3><div>`
        },
        "noiseType": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.noise.label"),
            default: "none",
            options: {
                "none": game.i18n.localize("levels3dpreview.flags.noise.options.none"),
                "simplex": game.i18n.localize("levels3dpreview.flags.noise.options.simplex"),
                "perlin": game.i18n.localize("levels3dpreview.flags.noise.options.perlin"),
            }
        },
        "noiseScale": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.noiseScale.label"),
            default: 1,
        },
        "noiseHeight": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.noiseHeight.label"),
            default: 1,
            step: 0.1,
            min: 0.1,
            max: 20,
        },
        "noisePersistence": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.noisePersistence.label"),
            default: 0.5,
            step: 0.1,
            min: 0.1,
            max: 1,
        },
        "noiseOctaves": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.noiseOctaves.label"),
            default: 1,
            step: 1,
            min: 1,
            max: 20,
        },
        "noiseLacunarity": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.noiseLacunarity.label"),
            default: 1,
            step: 0.1,
            min: 0.1,
            max: 4,
        },
        "noiseFlattening": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.noiseFlattening.label"),
            default: 0,
            step: 0.1,
            min: 0,
            max: 1,
        },
        "noiseExponent": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.noiseExponent.label"),
            default: 2,
            step: 0.1,
            min: 0.1,
            max: 10,
        }


    })

    if (meshStats?.merged) { 
        const fillTypeSelect = html.find(`select[name="flags.levels-3d-preview.fillType"]`);
        fillTypeSelect[0].disabled = true;
        const firstOption = fillTypeSelect.find("option")[0];
        firstOption.innerText = game.i18n.localize("levels3dpreview.flags.fillType.options.merged");
    }

    const advancedSettings = ["displacementIntensity", "displacementMatrix", "dynaMeshResolution", "roughness", "metalness", "transparency", "sightMeshComplexity", "invertDisplacementMap", "sides", "flipY", "shading", "displacementMap", "autoCenter", "enableAnim", "animSpeed", "animIndex", "paused", "tiltX", "tiltZ", "randomSeed", "autoGround", "depth"];

    injectAdvancedToggle(app,html,advancedSettings, injected);

    html.find(`input[name="flags.levels-3d-preview.randomSeed"]`).prop("maxlength", 7);
    const tilingFlags = ["tileScale", "yScale","gap", "randomRotation", "randomScale", "randomDepth", "randomPosition", "randomColor", "enableGravity"];
    const terrainFlags = ["noiseScale", "noiseHeight", "noisePersistence", "noiseOctaves", "noiseLacunarity", "noiseExponent", "noiseFlattening"];
    hideParams(app, html, `select[name="flags.levels-3d-preview.fillType"]`, tilingFlags, "stretch");
    hideParams(app, html, `select[name="flags.levels-3d-preview.noiseType"]`, terrainFlags, "none");

    ShaderConfig.injectButton(app, html, html.find(`#shader-config`));

    const mapGenBtn = $(`<button type="button" title="Configure Map Generator">
    <i class="fas fa-cog" style="margin: 0;"></i>
    </button>`);

    const dMLabel = html.find(`label[for="dynaMesh"]`);
    const dMSelect = html.find(`select[name="flags.levels-3d-preview.dynaMesh"]`);
    const dMFF = $(`<div class="form-fields"></div>`);
    dMFF.append(dMSelect);
    dMFF.append(mapGenBtn);
    dMLabel.after(dMFF);
    dMSelect.on("change", (e) => {
        mapGenBtn.toggle(dMSelect.val() === "mapGen");
    });
    dMSelect.trigger("change");
    mapGenBtn.on("click", (e) => {
        new MapGen(app.object).render(true);
    });

    app.setPosition({height: "auto"});
})

Hooks.on("renderWallConfig", (app,html)=>{
    injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "tab" : {
            "name": "levels-3d-preview",
            "label": "3D",
            "icon": "fas fa-cube",
            "width": 1,
        },
        "wallTexture": {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.imageTexture.label"),
        },
        "wallSidesTexture": {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.wallSidesTexture.label"),
        },
        "wallTint": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.color.label"),
            default: "#ffffff",
        },
        "wallSidesTint": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.wallSidesTint.label"),
            default: "#ffffff",
        },
        "stretchTex": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.stretchTex.label"),
        },
        "wallOpacity": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.wallOpacity.label"),
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
        },
        "wallDepth": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.wallDepth.label"),
            default: 30,
        },
        "roughness": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.roughness.label"),
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
        },
        "metalness": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.metalness.label"),
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
        },
        "alwaysVisible": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.alwaysVisible.label"),
            default: false,
        },
        "joinWall": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.joinWall.label"),
            default: false,
        }
    })
})

Hooks.on("renderMeasuredTemplateConfig", (app,html)=>{
    injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "tab" : {
            "name": "levels-3d-preview",
            "label": "3D",
            "icon": "fas fa-cube",
        },
        "isFog": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.isFog.label"),
            notes: game.i18n.localize("levels3dpreview.flags.isFog.notes"),
            default: false,
        },
    })
    ShaderConfig.injectButton(app, html, html.find(`input[name="flags.levels-3d-preview.isFog"]`).closest(".form-group"));
})

Hooks.on("renderNoteConfig", (app,html)=>{
    injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "inject": 'input[name="icon.custom"]',
        "model3d" : {
            type: "filepicker.any",
            fpTypes: [".gltf", ".GLTF", ".glb", ".GLB", ".fbx", ".FBX"],
            label: game.i18n.localize("levels3dpreview.flags.model3d.label"),
        },
        "rotation": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.rotation.label"),
            default: 0,
            min: 0,
            max: 360,
            step: 1,
        }
    })
})

Hooks.on("renderAmbientLightConfig", (app,html)=>{
    injectConfig.inject(app, html, {
        moduleId: "levels-3d-preview",
        tab: {
            name: "levels-3d-preview",
            label: "3D",
            icon: "fas fa-cube",
        },
        castShadow: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.castShadow.label"),
            default: false,
            notes: game.i18n.localize("levels3dpreview.flags.castShadow.notes"),
        },
        tilt: {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.tilt.label"),
            default: 0,
            min: -90,
            max: 90,
            step: 1,
        },
        partHeader: {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-fire"></i> ${game.i18n.localize("levels3dpreview.flags.lightParticleEffect.header.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.flags.lightParticleEffect.header.notes")}</p><div>`,
        },
        enableParticle: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.enableParticle.label"),
            default: false,
        },
        enableParticleHidden: {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.enableParticleHidden.label"),
            default: false,
        },
        ParticleSprite: {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleSprite.label"),
            default: "modules/levels-3d-preview/assets/particles/emberssmall.png",
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
            default: 1,
            step: 0.000001,
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
    });
})


Hooks.on("updateTile", (tile, updates) => {
    const mapGenForm = Object.values(ui.windows).find(w => w instanceof MapGen);
    if (mapGenForm && mapGenForm.document === tile) mapGenForm.saveGridAndRefresh();
})

//KEYBINDINGS
Hooks.on("init", () => {
    const { SHIFT, CONTROL, ALT } = KeyboardManager.MODIFIER_KEYS;
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

    game.keybindings.register("levels-3d-preview", "lockcamera", {
        name: game.i18n.localize("levels3dpreview.keybindings.lockcamera"),
        editable: [{ key: "Space" }],
        onDown: () => {
            if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
            game.Levels3DPreview.GameCamera.lock = !game.Levels3DPreview.GameCamera.lock;
            $("#clip-navigation-lock").toggleClass("clip-navigation-enabled", game.Levels3DPreview.GameCamera.lock);
        },
    });
    //toggleFirstPerson
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
        onDown: () => {
            if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
            game.Levels3DPreview.controls.screenSpacePanning = false;
            game.Levels3DPreview.GameCamera.lock = false;
        },
        onUp: () => {
            game.Levels3DPreview.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
        },
    });

    game.keybindings.register("levels-3d-preview", "panDown", {
        name: game.i18n.localize("levels3dpreview.keybindings.panDown"),
        editable: [{ key: "KeyS" }],
        onDown: () => {
            if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
            game.Levels3DPreview.controls.screenSpacePanning = false;
            game.Levels3DPreview.GameCamera.lock = false;
        },
        onUp: () => {
            game.Levels3DPreview.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
        },
    });

    game.keybindings.register("levels-3d-preview", "panLeft", {
        name: game.i18n.localize("levels3dpreview.keybindings.panLeft"),
        editable: [{ key: "KeyA" }],
        onDown: () => {
            if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
            game.Levels3DPreview.controls.screenSpacePanning = false;
            game.Levels3DPreview.GameCamera.lock = false;
        },
        onUp: () => {
            game.Levels3DPreview.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
        },
    });

    game.keybindings.register("levels-3d-preview", "panRight", {
        name: game.i18n.localize("levels3dpreview.keybindings.panRight"),
        editable: [{ key: "KeyD" }],
        onDown: () => {
            if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
            game.Levels3DPreview.controls.screenSpacePanning = false;
            game.Levels3DPreview.GameCamera.lock = false;
        },
        onUp: () => {
            game.Levels3DPreview.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
        },
    });

    game.keybindings.register("levels-3d-preview", "pingcamera", {
        name: game.i18n.localize("levels3dpreview.keybindings.pingcamera"),
        editable: [{ key: "KeyQ", modifiers: [SHIFT] }],
        onDown: () => {
            if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
            game.Levels3DPreview.helpers.focusCameraToCursor();
        },
    });
    game.keybindings.register("levels-3d-preview", "ping", {
        name: game.i18n.localize("levels3dpreview.keybindings.ping"),
        editable: [{ key: "KeyE", modifiers: [SHIFT] }],
        onDown: () => {
            if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
            game.Levels3DPreview.helpers._ping();
        },
    });

    game.keybindings.register("levels-3d-preview", "freeMode", {
        name: game.i18n.localize("levels3dpreview.keybindings.freeMode"),
        editable: [{ key: "KeyF" }],
        onDown: () => {
            game.Levels3DPreview.interactionManager.isFreeMode = true;
        },
        onUp: () => {
            const entity3D = game.Levels3DPreview.interactionManager.draggable?.userData?.entity3D;
            if (entity3D?.template && !game.Levels3DPreview.interactionManager.forceFree) entity3D.wasFreeMode = false;
            game.Levels3DPreview.interactionManager.isFreeMode = false;
            game.Levels3DPreview.interactionManager.forceFree = false;
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
        onDown: () => {
            if (!game.Levels3DPreview._active || !game.Levels3DPreview.hasFocus) return;
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
        },
        onUp: () => {},
    });

    game.keybindings.register("levels-3d-preview", "toggleSelect", {
        name: game.i18n.localize("levels3dpreview.keybindings.toggleSelect"),
        editable: [{ key: "KeyF" }],
        onDown: () => {
            game.Levels3DPreview.interactionManager._groupSelect = true;
        },
        onUp: () => {
            if (!game.Levels3DPreview.interactionManager.groupSelectHandler._isSelecting) game.Levels3DPreview.interactionManager._groupSelect = false;
        },
    });
})

//TOURS
Hooks.on("ready", () => {
    RegisterTours();
})



//Auto Resize

window.addEventListener('resize', ()=>{
    const levels3d = game.Levels3DPreview
    if(!levels3d) return
    levels3d.camera.aspect = window.innerWidth / window.innerHeight
    levels3d.camera.updateProjectionMatrix()
    levels3d.renderer.setSize(window.innerWidth, window.innerHeight)
    const miniCanvas = Object.values(ui.windows)?.find(w => w.id === "miniCanvas")
    setTimeout(()=>{
    if(miniCanvas) miniCanvas.resize()
    },100)
}, false)
