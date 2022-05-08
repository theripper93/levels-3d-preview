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
        visible: canvas?.scene?.getFlag("levels-3d-preview","enablePlayers") || game.user.isGM,
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
        "moduleId": "levels-3d-preview",
        "tab": {
            "name": "levels-3d-preview",
            "label": "3D Canvas",
            "icon": "fas fa-cube",
        },
        "header1": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-cube"></i> ${game.i18n.localize("levels3dpreview.settings.headers.basics.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.basics.notes")}</p><div>`
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
        "initialposition": {
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
            
            `
        },
        "lockCamera": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.lockCamera.label"),
            default: "off",
            options: {
                "off": game.i18n.localize("levels3dpreview.flags.lockCamera.options.off"),
                "players": game.i18n.localize("levels3dpreview.flags.lockCamera.options.players"),
                "all": game.i18n.localize("levels3dpreview.flags.lockCamera.options.all")
            }
        },
        "header2": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-cloud-sun"></i> ${game.i18n.localize("levels3dpreview.settings.headers.environment.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.environment.notes")}</p><div>`
        },
        "skybox" : {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.skybox.label"),
            placeholder: game.i18n.localize("levels3dpreview.flags.skybox.placeholder"),
            notes: game.i18n.localize("levels3dpreview.flags.skybox.notes"),
        },
        "exr" : {
            type: "filepicker.folder",
            fpTypes: [".exr"],
            label: game.i18n.localize("levels3dpreview.flags.exr.label"),
            placeholder: game.i18n.localize("levels3dpreview.flags.exr.placeholder"),
            notes: game.i18n.localize("levels3dpreview.flags.exr.notes"),
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
        "header3": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fas fa-lightbulb"></i> ${game.i18n.localize("levels3dpreview.settings.headers.lighting.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.lighting.notes")}</p><div>`
        },
        "enableFogOfWar": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.enableFogOfWar.label"),
            default: false,
        },
        /*"bakeLights": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.bakeLights.label"),
            notes: game.i18n.localize("levels3dpreview.flags.bakeLights.notes"),
            default: false,
        },*/
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
        "shadowBias": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.shadowBias.label"),
            notes: game.i18n.localize("levels3dpreview.flags.shadowBias.notes"),
            default: -0.035,
            step: 0.000001,
        },
        "header4": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-cloud-showers-heavy"></i> ${game.i18n.localize("levels3dpreview.settings.headers.particles.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.particles.notes")}</p><div>`
        },
        "particlePreset2": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.particlePreset.label1"),
            default: "none",
            options: {
                "none": game.i18n.localize("levels3dpreview.flags.particlePreset.options.none"),
                "rain": game.i18n.localize("levels3dpreview.flags.particlePreset.options.rain"),
                "heavyrain": game.i18n.localize("levels3dpreview.flags.particlePreset.options.heavyrain"),
                "snow": game.i18n.localize("levels3dpreview.flags.particlePreset.options.snow"),
                "hail": game.i18n.localize("levels3dpreview.flags.particlePreset.options.hail"),
                "leaves": game.i18n.localize("levels3dpreview.flags.particlePreset.options.leaves"),
                "embers": game.i18n.localize("levels3dpreview.flags.particlePreset.options.embers"),
                "mysteriouslights": game.i18n.localize("levels3dpreview.flags.particlePreset.options.mysteriouslights"),
                "stars": game.i18n.localize("levels3dpreview.flags.particlePreset.options.stars"),
                "starfall": game.i18n.localize("levels3dpreview.flags.particlePreset.options.starfall"),
                "dust": game.i18n.localize("levels3dpreview.flags.particlePreset.options.dust"),
                "smoke": game.i18n.localize("levels3dpreview.flags.particlePreset.options.smoke"),
                "toxic": game.i18n.localize("levels3dpreview.flags.particlePreset.options.toxic"),
            }
        },
        "particlePreset": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.particlePreset.label2"),
            default: "none",
            options: {
                "none": game.i18n.localize("levels3dpreview.flags.particlePreset.options.none"),
                "rain": game.i18n.localize("levels3dpreview.flags.particlePreset.options.rain"),
                "heavyrain": game.i18n.localize("levels3dpreview.flags.particlePreset.options.heavyrain"),
                "snow": game.i18n.localize("levels3dpreview.flags.particlePreset.options.snow"),
                "hail": game.i18n.localize("levels3dpreview.flags.particlePreset.options.hail"),
                "leaves": game.i18n.localize("levels3dpreview.flags.particlePreset.options.leaves"),
                "embers": game.i18n.localize("levels3dpreview.flags.particlePreset.options.embers"),
                "mysteriouslights": game.i18n.localize("levels3dpreview.flags.particlePreset.options.mysteriouslights"),
                "stars": game.i18n.localize("levels3dpreview.flags.particlePreset.options.stars"),
                "starfall": game.i18n.localize("levels3dpreview.flags.particlePreset.options.starfall"),
                "dust": game.i18n.localize("levels3dpreview.flags.particlePreset.options.dust"),
                "smoke": game.i18n.localize("levels3dpreview.flags.particlePreset.options.smoke"),
                "toxic": game.i18n.localize("levels3dpreview.flags.particlePreset.options.toxic"),
                "custom": game.i18n.localize("levels3dpreview.flags.particlePreset.options.custom"),
            }
        },
        "partGroupStart": {
            type: "custom",
            html: `<div id="part-group">`
        },
        "particleTexture": {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.particleTexture.label"),
            default: "",
        },
        "particleDensity": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleDensity.label"),
            default: 100,
            min: 1,
            max: 1000,
            step: 1,
        },
        "particleDirection": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleDirection.label"),
            default: 90,
            min: 0,
            max: 360,
            step: 1,
        },
        "particleSize": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleSize.label"),
            default: 20,
            min: 1,
            max: 100,
            step: 1,
        },
        "particleColor": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.particleColor.label"),
            default: "#ffc494",
        },
        "particleOpacity": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleOpacity.label"),
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.01,
        },
        "particleSpeed": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleSpeed.label"),
            default: 5,
            min: 0,
            max: 10,
            step: 0.1,
        },
        "particleRotationspeed": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleRotationspeed.label"),
            default: 0,
            min: -10,
            max: 10,
            step: 0.1,
        },
        "particleVelocity": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.particleVelocity.label"),
            default: 1,
            min: 0,
            max: 10,
            step: 0.1,
        },
        "particleRandomRotation": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.particleRandomRotation.label"),
            default: false,
        },
        "particleRandomScale": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.particleRandomScale.label"),
            default: true,
        },
        "particleBlend": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.particleBlend.label"),
            default: false,
        },
        "partGroupEnd": {
            type: "custom",
            html: `</div>`
        },
        "header5": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-eye"></i> ${game.i18n.localize("levels3dpreview.settings.headers.visibility.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.settings.headers.visibility.notes")}</p><div>`
        },
        "showSceneWalls": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.showSceneWalls.label"),
            default: true,
        },
        "showSceneDoors": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.showSceneDoors.label"),
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
            default: true,
        },
        "mirrorLevels": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.mirrorLevels.label"),
            default: false,
        }
    }

    injectConfig.inject(app,html,data);
    html.on("change", `select[name="flags.levels-3d-preview.particlePreset"]`, (e) => {
        const value = e.target.value;
        if (value === "custom") {
            html.find(`#part-group`).slideDown(100);
        } else {
            html.find(`#part-group`).slideUp(100);
        }
    })
    html.find(`select[name="flags.levels-3d-preview.particlePreset"]`).trigger("change");
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
                "pbr": game.i18n.localize("levels3dpreview.flags.material.options.pbr"),
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
    }, app.token)
})

Hooks.on("renderTileConfig", (app,html)=>{
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
        "color": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.tint.label"),
            default: "#ffffff",
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
        "yScale": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.yScale.label"),
            default: 1,
            step: 0.000001,
        },
        "header1": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-th"></i> ${game.i18n.localize("levels3dpreview.flags.tiling.label")}</h3><div>`
        },
        "fillType": {
            type: "select",
            label: game.i18n.localize("levels3dpreview.flags.fillType.label"),
            default: "fit",
            options: {
                "fit": game.i18n.localize("levels3dpreview.flags.fillType.options.fit"),
                "stretch": game.i18n.localize("levels3dpreview.flags.fillType.options.stretch"),
                "tile": game.i18n.localize("levels3dpreview.flags.fillType.options.tile"),
            }
        },
        "tileScale": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.tileScale.label"),
            step: 0.00001,
            default: 1,
        },
        "gap": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.gap.label"),
            units: game.i18n.localize("levels3dpreview.units.gu"),
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
        }
    })
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
        "partHeader": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-fire"></i> ${game.i18n.localize("levels3dpreview.flags.lightParticleEffect.header.title")}</h3><p class="notes">${game.i18n.localize("levels3dpreview.flags.lightParticleEffect.header.notes")}</p><div>`
        },
        "enableParticle": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.enableParticle.label"),
            default: false,
        },
        "enableParticleHidden": {
            type: "checkbox",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.enableParticleHidden.label"),
            default: false,
        },
        "ParticleSprite": {
            type: "filepicker",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleSprite.label"),
            default: "modules/levels-3d-preview/assets/particles/emberssmall.png",
        },
        "ParticleScale": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleScale.label"),
            units: game.i18n.localize("levels3dpreview.units.gu"),
            default: 1,
            step: 0.000001,
        },
        "ParticleAlphaStart": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleAlphaStart.label"),
            default: 0,
            min: 0,
            max: 1,
            step: 0.01,
        },
        "ParticleAlphaEnd": {
            type: "range",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleAlphaEnd.label"),
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
        },
        "ParticleLife": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleLife.label"),
            units: game.i18n.localize("levels3dpreview.units.ms"),
            default: 1000,
            step: 0.000001,
        },
        "ParticleCount": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleCount.label"),
            default: 5,
            step: 0.000001,
        },
        "ParticleEmitTime": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleEmitTime.label"),
            units: game.i18n.localize("levels3dpreview.units.ms"),
            default: 1,
            step: 0.000001,
        },
        "ParticleForce": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleForce.label"),
            default: 0,
            step: 0.000001,
        },
        "ParticlePushX": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticlePushX.label"),
            default: 0,
            step: 0.000001,
        },
        "ParticlePushY": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticlePushY.label"),
            default: 0,
            step: 0.000001,
        },
        "ParticlePushZ": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticlePushZ.label"),
            default: 0,
            step: 0.000001,
        },
        "ParticleGravity": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleGravity.label"),
            default: 1,
            step: 0.000001,
        },
        "ParticleMass": {
            type: "number",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleMass.label"),
            default: 1000,
            step: 0.000001,
        },
        "ParticleColor": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleColor.label"),
            default: "#ffffff",
        },
        "ParticleColor2": {
            type: "color",
            label: game.i18n.localize("levels3dpreview.flags.lightParticleEffect.ParticleColor2.label"),
            default: "#ffffff",
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

    game.keybindings.register("levels-3d-preview", "pingcamera", {
        name: game.i18n.localize("levels3dpreview.keybindings.pingcamera"),
        editable: [
          {key: "KeyQ", modifiers: [ SHIFT ]}
        ],
        onDown: () => {if(game.Levels3DPreview._active) game.Levels3DPreview.helpers.focusCameraToCursor()},
    });
    game.keybindings.register("levels-3d-preview", "ping", {
        name: game.i18n.localize("levels3dpreview.keybindings.ping"),
        editable: [
          {key: "KeyE", modifiers: [ SHIFT ]}
        ],
        onDown: () => {if(game.Levels3DPreview._active) game.Levels3DPreview.helpers._ping()},
    });

    game.keybindings.register("levels-3d-preview", "freeMode", {
        name: game.i18n.localize("levels3dpreview.keybindings.freeMode"),
        editable: [
          {key: "KeyF"}
        ],
        onDown: () => {game.Levels3DPreview.interactionManager.isFreeMode = true},
        onUp: () => {game.Levels3DPreview.interactionManager.isFreeMode = false},
    });

    game.keybindings.register("levels-3d-preview", "scale", {
        name: game.i18n.localize("levels3dpreview.keybindings.scale"),
        editable: [
          {key: "KeyS", modifiers: [ CONTROL ]}
        ],
        onDown: () => {game.Levels3DPreview.interactionManager.scale = true},
        onUp: () => {game.Levels3DPreview.interactionManager.scale = false},
    });

    game.keybindings.register("levels-3d-preview", "scaleWidth", {
        name: game.i18n.localize("levels3dpreview.keybindings.scaleWidth"),
        editable: [
          {key: "KeyQ", modifiers: [ CONTROL ]}
        ],
        onDown: () => {game.Levels3DPreview.interactionManager.scaleWidth = true},
        onUp: () => {game.Levels3DPreview.interactionManager.scaleWidth = false},
    });

    game.keybindings.register("levels-3d-preview", "scaleHeight", {
        name: game.i18n.localize("levels3dpreview.keybindings.scaleHeight"),
        editable: [
          {key: "KeyW", modifiers: [ CONTROL ]}
        ],
        onDown: () => {game.Levels3DPreview.interactionManager.scaleHeight = true},
        onUp: () => {game.Levels3DPreview.interactionManager.scaleHeight = false},
    });

    game.keybindings.register("levels-3d-preview", "scaleGap", {
        name: game.i18n.localize("levels3dpreview.keybindings.scaleGap"),
        editable: [
          {key: "KeyE", modifiers: [ CONTROL ]}
        ],
        onDown: () => {game.Levels3DPreview.interactionManager.scaleGap = true},
        onUp: () => {game.Levels3DPreview.interactionManager.scaleGap = false},
    });

    game.keybindings.register("levels-3d-preview", "scaleScale", {
        name: game.i18n.localize("levels3dpreview.keybindings.scaleScale"),
        editable: [
          {key: "KeyR", modifiers: [ CONTROL ]}
        ],
        onDown: () => {game.Levels3DPreview.interactionManager.scaleScale = true},
        onUp: () => {game.Levels3DPreview.interactionManager.scaleScale = false},
    });

    game.keybindings.register("levels-3d-preview", "toggleMode", {
        name: game.i18n.localize("levels3dpreview.keybindings.toggleMode"),
        editable: [
          {key: "KeyT", modifiers: [ CONTROL ]}
        ],
        onDown: () => {
            const updates = [];
            for(let placeable of canvas.activeLayer.controlled){
                const modes = ["fit", "stretch", "tile"]
                const mode = placeable.document.getFlag("levels-3d-preview", "fillType") ?? "fit";
                const index = modes.indexOf(mode);
                if(index === -1) continue;
                const next = modes[(index + 1) % modes.length];
                const update = {
                    _id: placeable.id,
                    flags: {
                        "levels-3d-preview": {
                            fillType: next,
                        }
                    }
                };
                updates.push(update);
            }
            canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName,updates);
        },
        onUp: () => {},
    });

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