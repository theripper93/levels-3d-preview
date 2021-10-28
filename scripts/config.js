Hooks.once('init', function() {

    game.settings.register("levels-3d-preview", "selectedImage", {
        name: game.i18n.localize("levels3dpreview.settings.selectedImage.name"),
        hint: game.i18n.localize("levels3dpreview.settings.selectedImage.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
        filePicker: "imagevideo",
      });

      game.settings.register("levels-3d-preview", "standupFace", {
        name: game.i18n.localize("levels3dpreview.settings.standupFace.name"),
        hint: game.i18n.localize("levels3dpreview.settings.standupFace.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
      });

      game.settings.register("levels-3d-preview", "preventNegative", {
        name: game.i18n.localize("levels3dpreview.settings.preventNegative.name"),
        hint: game.i18n.localize("levels3dpreview.settings.preventNegative.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
      });

      game.settings.register("levels-3d-preview", "miniCanvas", {
        name: game.i18n.localize("levels3dpreview.settings.miniCanvas.name"),
        hint: game.i18n.localize("levels3dpreview.settings.miniCanvas.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
      });

      game.settings.register("levels-3d-preview", "disableLighting", {
        name: game.i18n.localize("levels3dpreview.settings.disableLighting.name"),
        hint: game.i18n.localize("levels3dpreview.settings.disableLighting.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
      });

      game.settings.register("levels-3d-preview", "debugMode", {
        name: game.i18n.localize("levels3dpreview.settings.debugMode.name"),
        hint: game.i18n.localize("levels3dpreview.settings.debugMode.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: (sett) => {
            game.Levels3DPreview.debugMode = sett;
        }
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

});


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

//add listener on shift+r to reload the scene
document.addEventListener('keypress', (e) => {
    if (e.key.toLowerCase() === 'r' && e.shiftKey) {
        if(game.Levels3DPreview._active) game.Levels3DPreview.controls.reset()
    }
});


Hooks.on("getSceneControlButtons", (buttons)=>{
    buttons.find(b => b.name === "token")?.tools?.push(
    {
        "name": "preview3d",
        "title": game.i18n.localize("levels3dpreview.controls.preview3d"),
        "icon": "fas fa-cube",
        toggle: true,
        visible: canvas?.scene?.getFlag("levels-3d-preview","enablePlayers") || game.user.isGM,
        active: game.Levels3DPreview?._active,
        onClick: () => {
            game.Levels3DPreview.toggle();
        },
    },
    {
        "name": "miniCanvas",
        "title": game.i18n.localize("levels3dpreview.controls.miniCanvas"),
        "icon": "fas fa-sign-out-alt",
        toggle: true,
        visible: canvas?.scene?.getFlag("levels-3d-preview","enablePlayers") || game.user.isGM,
        active: Object.values(ui.windows)?.find(w => w.id === "miniCanvas") ? true : false,
        onClick: () => {
            if(!game.Levels3DPreview?._active) {
                $(`li[data-tool="miniCanvas"]`).toggleClass("active", false);
                ui.controls.controls.find(c=>c.name=="token").tools.find(t=>t.name == "miniCanvas").active = false;
                return ui.notifications.warn(game.i18n.localize("levels3dpreview.errors.3dnotactive"))
            }
            miniCanvas.toggle();
        }
    });
})

Hooks.on("renderSceneConfig", (app,html)=>{

    injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "inject" : `input[name="backgroundColor"]`,
        "header": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-cube"></i> ${game.i18n.localize("levels3dpreview.sceneConfigTitle.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.sceneConfigTitle.notes")}</p>`
        },
        "enablePlayers":{
            "type": "checkbox",
            "label": game.i18n.localize("levels3dpreview.flags.enablePlayers.label"),
            "default": false,
            "notes": game.i18n.localize("levels3dpreview.flags.enablePlayers.notes")
        },
        "auto3d": {
            "type": "checkbox",
            "label": game.i18n.localize("levels3dpreview.flags.auto3d.label"),
            "default": false,
        },
        "skybox" : {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.skybox.label"),
            placeholder: game.i18n.localize("levels3dpreview.flags.skybox.placeholder"),
            notes: game.i18n.localize("levels3dpreview.flags.skybox.notes"),
        },
        "renderTable": {
            "type": "checkbox",
            "label": game.i18n.localize("levels3dpreview.flags.renderTable.label"),
            "default": false,
            "notes": game.i18n.localize("levels3dpreview.flags.renderTable.notes")
        },
        "tableTex" : {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.tableTex.label"),
            placeholder: "Table Texture",
        },
        "renderBackground": {
            "type": "checkbox",
            "label": game.i18n.localize("levels3dpreview.flags.renderBackground.label"),
            "default": true,
            "notes": game.i18n.localize("levels3dpreview.flags.renderBackground.notes")
        },
        "enableGrid": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableGrid.label"),
            default: true,
        },
        "enableRuler": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableRuler.label"),
            default: true,
        },
        "sceneTint": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.sceneTint.label"),
            default: "#ffc494",
        },
        "timeSync": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.timeSync.label"),
            default: "off",
            options: {
                "off": game.i18n.localize("levels3dpreview.flags.timeSync.options.off"),
                "time": game.i18n.localize("levels3dpreview.flags.timeSync.options.time"),
                "darkness": game.i18n.localize("levels3dpreview.flags.timeSync.options.darkness")
            }
        },
        "sunPosition": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.sunPosition.label"),
            default: 35,
            min: 0,
            max: 180,
        },
        "sunDistance": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.sunDistance.label"),
            default: 3.4,
            min: 1,
            max: 10,
            step: 0.1,
        },
        "sunIntensity": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.sunIntensity.label"),
            default: 3,
            min: 0.1,
            max: 10,
            step: 0.1,
        },
        "showSceneWalls": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.showSceneWalls.label"),
            default: true,
        },
        "showSceneFloors": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.showSceneFloors.label"),
            default: true,
        },
        "wallFloorAlpha": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.wallFloorAlpha.label"),
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.1,
        },
        "renderSceneLights": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.renderSceneLights.label"),
            default: false,
        }
    })
    html.on("change", "input", (e)=>{
        if(!game.Levels3DPreview._active) return;
        const sunPosition = html.find("input[name='flags.levels-3d-preview.sunPosition']")[0].value;
        const sunDistance = html.find("input[name='flags.levels-3d-preview.sunDistance']")[0].value;
        const sunIntensity = html.find("input[name='flags.levels-3d-preview.sunIntensity']")[0].value;
        const sceneTint = html.find("input[name='flags.levels-3d-preview.sceneTint']")[0].value;
        console.log(sunPosition,sunDistance,sunIntensity,sceneTint);
        game.Levels3DPreview.sunlight = {
            color: sceneTint,
            angle: Math.toRadians(sunPosition),
            distance: sunDistance,
            intensity: sunIntensity,
            animate: true,
        }
    })
})

Hooks.on("renderTokenConfig", (app,html)=>{
    injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "tab" : {
            "name": "levels-3d-preview",
            "label": "3D",
            "icon": "fas fa-cube",
        },
        "model3d" : {
            type: "filepicker.folder",
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
                "plastic": game.i18n.localize("levels3dpreview.flags.material.options.plastic"),
                "wood": game.i18n.localize("levels3dpreview.flags.material.options.wood"),
                "glass": game.i18n.localize("levels3dpreview.flags.material.options.glass"),
            }
        },
        "color": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.color.label"),
            default: "#ffa95c",
            notes: game.i18n.localize("levels3dpreview.flags.color.notes")
        },
        "draggable": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.draggable.label"),
            default: true,
        },
        "alwaysVisible": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.alwaysVisible.label"),
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
        },
        "rotationAxis" : {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.rotationAxis.label"),
            options: {
                "x": game.i18n.localize("levels3dpreview.flags.rotationAxis.options.x"),
                "y": game.i18n.localize("levels3dpreview.flags.rotationAxis.options.y"),
                "z": game.i18n.localize("levels3dpreview.flags.rotationAxis.options.z"),
            },
            default: "y",
            notes: game.i18n.localize("levels3dpreview.flags.rotationAxis.notes"),
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
        "rotateBase": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.rotateBase.label"),
            notes: game.i18n.localize("levels3dpreview.flags.rotateBase.notes"),
            default: false,
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
    })
})