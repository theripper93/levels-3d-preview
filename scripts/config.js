Hooks.once('init', function() {


    game.settings.register("levels-3d-preview", "baseStyle", {
        name: game.i18n.localize("levels3dpreview.settings.baseStyle.name"),
        hint: game.i18n.localize("levels3dpreview.settings.baseStyle.hint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            "image": game.i18n.localize("levels3dpreview.settings.baseStyle.options.image"),
            "solid": game.i18n.localize("levels3dpreview.settings.baseStyle.options.solid"),
            "solidindicator": game.i18n.localize("levels3dpreview.settings.baseStyle.options.solidindicator"),
          },
        default: "solidindicator",
    });

    game.settings.register("levels-3d-preview", "solidBaseMode", {
        name: game.i18n.localize("levels3dpreview.settings.solidBaseMode.name"),
        hint: game.i18n.localize("levels3dpreview.settings.solidBaseMode.hint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            "merge": game.i18n.localize("levels3dpreview.settings.solidBaseMode.options.merge"),
            "ontop": game.i18n.localize("levels3dpreview.settings.solidBaseMode.options.ontop"),
          },
        default: "merge",
    });

    game.settings.register("levels-3d-preview", "solidBaseColor", {
        name: game.i18n.localize("levels3dpreview.settings.solidBaseColor.name"),
        hint: game.i18n.localize("levels3dpreview.settings.solidBaseColor.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "#2b2b2b",
      });

      game.settings.register("levels-3d-preview", "highlightCombat", {
        name: game.i18n.localize("levels3dpreview.settings.highlightCombat.name"),
        hint: game.i18n.localize("levels3dpreview.settings.highlightCombat.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
      });

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

      game.settings.register("levels-3d-preview", "hideTarget", {
        name: game.i18n.localize("levels3dpreview.settings.hideTarget.name"),
        hint: game.i18n.localize("levels3dpreview.settings.hideTarget.hint"),
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

      game.settings.register("levels-3d-preview", "gridMode", {
        name: game.i18n.localize("levels3dpreview.settings.gridMode.name"),
        hint: game.i18n.localize("levels3dpreview.settings.gridMode.hint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            "fast": game.i18n.localize("levels3dpreview.settings.gridMode.options.fast"),
            "mirror": game.i18n.localize("levels3dpreview.settings.gridMode.options.mirror"),
          },
        default: "fast",
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
          },
        default: 4,
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
        "tab": {
            "name": "levels-3d-preview",
            "label": "3D Canvas",
            "icon": "fas fa-cube",
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
        "enableFogOfWar": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableFogOfWar.label"),
            default: false,
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
        "sunIntensity": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.sunIntensity.label"),
            default: 0.7,
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
    }

    injectConfig.inject(app,html,data);
    if(canvas.scene.id !== app.object.id) return;
    html.on("change", "input", (e)=>{
        if(!game.Levels3DPreview._active) return;
        const sunPosition = html.find("input[name='flags.levels-3d-preview.sunPosition']")[0].value;
        const sunDistance = 10;
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
                "basic": game.i18n.localize("levels3dpreview.flags.material.options.basic"),
                "texcol": game.i18n.localize("levels3dpreview.flags.material.options.texcol"),
                "plastic": game.i18n.localize("levels3dpreview.flags.material.options.plastic"),
                "wood": game.i18n.localize("levels3dpreview.flags.material.options.wood"),
                "metal": game.i18n.localize("levels3dpreview.flags.material.options.metal"),
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
        "tab" : {
            "name": "levels-3d-preview",
            "label": "3D",
            "icon": "fas fa-cube",
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
        "isFog": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.isFog.label"),
            notes: game.i18n.localize("levels3dpreview.flags.isFog.notes"),
            default: false,
        },
    })
})

Hooks.on("renderAmbientLightConfig", (app,html)=>{
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
    })
})

//KEYBINDINGS
Hooks.on("init", () => {
    const {SHIFT, CONTROL, ALT} = KeyboardManager.MODIFIER_KEYS;
    game.keybindings.register("levels-3d-preview", "resetView", {
        name: game.i18n.localize("levels3dpreview.keybindings.resetView"),
        editable: [
          {key: "KeyR", modifiers: [ SHIFT ]}
        ],
        onDown: () => {if(game.Levels3DPreview._active) game.Levels3DPreview.resetCamera()},
    });

    game.keybindings.register("levels-3d-preview", "topdownView", {
        name: game.i18n.localize("levels3dpreview.keybindings.topdownView"),
        editable: [
          {key: "KeyT", modifiers: [ SHIFT ]}
        ],
        onDown: () => {if(game.Levels3DPreview._active) game.Levels3DPreview.resetCamera(true)},
    });

    game.keybindings.register("levels-3d-preview", "cameraToToken", {
        name: game.i18n.localize("levels3dpreview.keybindings.cameraToToken"),
        editable: [
          {key: "KeyX", modifiers: [ SHIFT ]}
        ],
        onDown: () => {if(game.Levels3DPreview._active) game.Levels3DPreview.setCameraToControlled()},
    });

    game.keybindings.register("levels-3d-preview", "freeMode", {
        name: game.i18n.localize("levels3dpreview.keybindings.freeMode"),
        editable: [
          {key: "KeyF"}
        ],
        onDown: () => {game.Levels3DPreview.interactionManager.isFreeMode = true},
        onUp: () => {game.Levels3DPreview.interactionManager.isFreeMode = false},
    });

})