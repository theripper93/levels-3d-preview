Hooks.once('init', function() {

    game.settings.register("levels-3d-preview", "selectedImage", {
        name: game.i18n.localize("levels3dpreview.settings.selectedImage.name"),
        hint: game.i18n.localize("levels3dpreview.settings.selectedImage.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "modules/levels-3d-preview/assets/indicator.webp",
        filePicker: "imagevideo",
      });

      game.settings.register("levels-3d-preview", "colorizeInidcator", {
        name: game.i18n.localize("levels3dpreview.settings.colorizeInidcator.name"),
        hint: game.i18n.localize("levels3dpreview.settings.colorizeInidcator.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
      });

      game.settings.register("levels-3d-preview", "rotateIndicator", {
        name: game.i18n.localize("levels3dpreview.settings.rotateIndicator.name"),
        hint: game.i18n.localize("levels3dpreview.settings.rotateIndicator.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
      });

      game.settings.register("levels-3d-preview", "templateSyle", {
        name: game.i18n.localize("levels3dpreview.settings.templateSyle.name"),
        hint: game.i18n.localize("levels3dpreview.settings.templateSyle.hint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            "wireframe": game.i18n.localize("levels3dpreview.settings.templateSyle.options.wireframe"),
            "solid": game.i18n.localize("levels3dpreview.settings.templateSyle.options.solid"),
          },
        default: "wireframe",
      });

      game.settings.register("levels-3d-preview", "autoPan", {
        name: game.i18n.localize("levels3dpreview.settings.autoPan.name"),
        hint: game.i18n.localize("levels3dpreview.settings.autoPan.hint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            "none": game.i18n.localize("levels3dpreview.settings.autoPan.options.none"),
            "player": game.i18n.localize("levels3dpreview.settings.autoPan.options.player"),
            "all": game.i18n.localize("levels3dpreview.settings.autoPan.options.all"),
          },
        default: "none",
        onChange: value => { game.Levels3DPreview.setAutopan(value) }
      });

      game.settings.register("levels-3d-preview", "conservativeHitbox", {
        name: game.i18n.localize("levels3dpreview.settings.conservativeHitbox.name"),
        hint: game.i18n.localize("levels3dpreview.settings.conservativeHitbox.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
      });

      game.settings.register("levels-3d-preview", "screenspacepanning", {
        name: game.i18n.localize("levels3dpreview.settings.screenspacepanning.name"),
        hint: game.i18n.localize("levels3dpreview.settings.screenspacepanning.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
      });

      game.settings.register("levels-3d-preview", "camerafocuszoom", {
        name: game.i18n.localize("levels3dpreview.settings.camerafocuszoom.name"),
        hint: game.i18n.localize("levels3dpreview.settings.camerafocuszoom.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
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

      game.settings.register("levels-3d-preview", "globalCollision", {
        name: game.i18n.localize("levels3dpreview.settings.globalCollision.name"),
        hint: game.i18n.localize("levels3dpreview.settings.globalCollision.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
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

      game.settings.register("levels-3d-preview", "resolution", {
        name: game.i18n.localize("levels3dpreview.settings.resolution.name"),
        hint: game.i18n.localize("levels3dpreview.settings.resolution.hint"),
        scope: "client",
        config: true,
        type: Number,
        choices: {
            1: game.i18n.localize("levels3dpreview.settings.resolution.options.full"),
            0.5: game.i18n.localize("levels3dpreview.settings.resolution.options.half"),
            0.25: game.i18n.localize("levels3dpreview.settings.resolution.options.quarter"),
          },
        default: 1,
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
        if(game.Levels3DPreview._active) game.Levels3DPreview.resetCamera()
    }else if(e.key.toLowerCase() === 't' && e.shiftKey){
        if(game.Levels3DPreview._active) game.Levels3DPreview.resetCamera(true)
    }else if(e.key.toLowerCase() === 'x' && e.shiftKey){
        if(game.Levels3DPreview._active) game.Levels3DPreview.setCameraToControlled()
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

    const data = {
        "moduleId": "levels-3d-preview",
        "header": {
            type: "custom",
            html: game.version < 9 ? `<h3 class="form-header" id="canvas-3d-toggle"><i class="fas fa-cube"></i> ${game.i18n.localize("levels3dpreview.sceneConfigTitle.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.sceneConfigTitle.notes")}</p><div id="3d-canvas">` : ""
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
        "enableFog": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableFog.label"),
            default: false,
        },
        "fogColor": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.fogColor.label"),
            default: "#000000",
        },
        "fogDistance": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.fogDistance.label"),
            default: 3000,
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
            default: 1,
            min: 0,
            max: 2,
            step: 0.01,
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
        "renderSceneLights": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.renderSceneLights.label"),
            default: false,
        },
        "footer": {
            type: "custom",
            html: `</div>`
        },
    }
    if(game.version > 9){
        data.tab = {
            "name": "levels-3d-preview",
            "label": "3D Canvas",
            "icon": "fas fa-cube",
        }
    }else{
        data.inject = `input[name="backgroundColor"]`
    }

    injectConfig.inject(app,html,data)
    if(game.version < 9){
        html.find("#3d-canvas").toggle();
        html.on("click", "#canvas-3d-toggle", (e)=>{
            html.find("#3d-canvas").slideToggle(200);
        });
    }
    if(canvas.scene.id !== app.object.id) return;
    html.on("change", "input", (e)=>{
        if(!game.Levels3DPreview._active) return;
        const sunPosition = html.find("input[name='flags.levels-3d-preview.sunPosition']")[0].value;
        const sunDistance = html.find("input[name='flags.levels-3d-preview.sunDistance']")[0].value;
        const sunIntensity = html.find("input[name='flags.levels-3d-preview.sunIntensity']")[0].value;
        const sceneTint = html.find("input[name='flags.levels-3d-preview.sceneTint']")[0].value;
        game.Levels3DPreview.lights.globalIllumination.sunlight = {
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
                "basic": game.i18n.localize("levels3dpreview.flags.material.options.basic"),
                "plastic": game.i18n.localize("levels3dpreview.flags.material.options.plastic"),
                "wood": game.i18n.localize("levels3dpreview.flags.material.options.wood"),
                "glass": game.i18n.localize("levels3dpreview.flags.material.options.glass"),
            }
        },
        "color": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.color.label"),
            default: "#ffffff",
            notes: game.i18n.localize("levels3dpreview.flags.color.notes")
        },
        "draggable": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.draggable.label"),
            default: true,
        },
        "collisionPlane": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.collisionPlane.label"),
            default: false,
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
    }, app.token)
})

Hooks.on("renderWallConfig", (app,html)=>{
    injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "wallTexture": {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.imageTexture.label"),
        },
        "wallTint": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.color.label"),
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
        "isFog": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.isFog.label"),
            notes: game.i18n.localize("levels3dpreview.flags.isFog.notes"),
            default: false,
        },
    })
})

/*Hooks.on("renderAmbientLightConfig", (app,html)=>{
    injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "tab" : {
            "name": "levels-3d-preview",
            "label": "3D",
            "icon": "fas fa-cube",
        },
        "castShadow": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.castShadow.label"),
            default: false,
            notes: game.i18n.localize("levels3dpreview.flags.castShadow.notes"),
        },
        "elevation": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.elevation.label"),
            default: 0,
            step: 0.001,
        }

    })
})*/