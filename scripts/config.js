Hooks.once('init', async function() {

});

Hooks.once('ready', async function() {

});


Hooks.on("getSceneControlButtons", (buttons)=>{
    buttons.find(b => b.name === "levels")?.tools?.push({
        "name": "preview3d",
        "title": "Show/Hide 3D Preview",
        "icon": "fas fa-cube",
        toggle: true,
        active: $("#levels3d").length > 0,
        onClick: () => {
            const isEnabled = $("#levels3d").length > 0;
            if (isEnabled) {
                $("#levels3d").remove();
                $("#board").show();
            }else{
                game.Levels3DPreview.build3Dscene();
                document.body.appendChild(game.Levels3DPreview.renderer.domElement);
                $("#board").hide();
            }
        }
    })
    if(canvas?.scene?.getFlag("levels-3d-preview","enablePlayers") && !game?.user?.isGM){
        buttons.find(b => b.name === "token")?.tools?.push({
            "name": "preview3d",
            "title": "Show/Hide 3D Preview",
            "icon": "fas fa-cube",
            toggle: true,
            active: $("#levels3d").length > 0,
            onClick: () => {
                const isEnabled = $("#levels3d").length > 0;
                if (isEnabled) {
                    $("#levels3d").remove();
                    $("#board").show();
                }else{
                    game.Levels3DPreview.build3Dscene();
                    document.body.appendChild(game.Levels3DPreview.renderer.domElement);
                    $("#board").hide();
                }
            }
        })
    }
})

Hooks.on("renderSceneConfig", (app,html)=>{

    injectConfig.inject(app,html,{
        "moduleId": "levels-3d-preview",
        "inject" : `input[name="backgroundColor"]`,
        "header": {
            type: "custom",
            html: `<h3 class="form-header"><i class="fas fa-cube"></i> Levels - 3D Preview</h3><p class="notes">Configure Levels - 3D preview settings for this scene.</p>`
        },
        "enablePlayers":{
            "type": "checkbox",
            "label": "Enable for Players",
            "default": false,
            "notes": "Allow players to open the 3D view for this scene, all walls, floors and tokens will be revealed."
        },
        "skybox" : {
            type: "filepicker",
            label: "Skybox Image",
            placeholder: "Skybox Image",
            notes: `The file needs to be in the same folder of 6 total files, files must contain "_ft", "_bk", "_up", "_dn", "_rt", "_lf".`,
        },
        "enableGrid": {
            type: "checkbox",
            label: "Enable Grid",
        },
        "enableAxis": {
            type: "checkbox",
            label: "Enable Axis",
        },
        "sceneTint": {
            type: "color",
            label: "Scene Tint",
            default: "#ffa95c",
        },
        "sunPosition": {
            type: "range",
            label: "Sun Position",
            default: 35,
            min: 0,
            max: 360,
        },
        "sunDistance": {
            type: "range",
            label: "Sun Distance",
            default: 10,
            min: 0,
            max: 100,
        },
        "showSun": {
            type: "checkbox",
            label: "Show Sun",
            default: false,
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
            label: "3D Model",
        },
        "rotationAxis" : {
            type: "select",
            label: "Rotation Axis",
            options: {
                "z": "Z",
                "x": "X",
                "y": "Y",
            }
        },
        "mirrorX" : {
            type: "checkbox",
            label: "Mirror X",
        },
        "mirrorY" : {
            type: "checkbox",
            label: "Mirror Y",
        },
        "mirrorZ" : {
            type: "checkbox",
            label: "Mirror Z",
        },
        "offsetX": {
            type: "number",
            label: "Offset X",
        },
        "offsetY": {
            type: "number",
            label: "Offset Y",
        },
        "offsetZ": {
            type: "number",
            label: "Offset Z",
        },
        "scale": {
            type: "number",
            label: "Scale",
        },
    })
})