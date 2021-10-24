Hooks.once('init', function() {

    game.settings.register("levels-3d-preview", "selectedImage", {
        name: "Selection Highlight Image",
        hint: "The image to display when selecting a token.",
        scope: "world",
        config: true,
        type: String,
        default: "",
        filePicker: "imagevideo",
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

Hooks.once('ready', async function() {

    libWrapper.register("levels-3d-preview", "KeyboardManager.prototype._handleMovement", _handleMovement, "MIXED")
    libWrapper.register("levels-3d-preview", "TokenHUD.prototype.setPosition", setPosition, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.refresh", reDraw, "WRAPPER")
    libWrapper.register("levels-3d-preview", "Token.prototype._onMovementFrame", Token3DSetPosition, "WRAPPER");

    function reDraw(wrapped,...args){
        wrapped(...args)
        game.Levels3DPreview?._active && game.Levels3DPreview.tokenIndex[this.id]?.reDraw()
    }

    function _handleMovement(wrapped,...args){
        const e = args[0];
        const layer = args[1];
        if(e.altKey && layer.name == "TokenLayer"){
            const directions = this._moveKeys
            const elevDiff = directions.has("up") ? 1 : directions.has("down") ? -1 : 0;
            let updates = [];
            canvas.tokens.controlled.forEach(t => {
                updates.push({_id: t.id, elevation: t.data.elevation + elevDiff});
            })
            canvas.scene.updateEmbeddedDocuments("Token", updates);
        }else{
            return wrapped(...args);
        }
    }

    function setPosition(wrapped,...args){
        wrapped(...args);
        if(game.Levels3DPreview?._active && game.Levels3DPreview.tokenIndex[this.object.id]){
            const elementWidth = $(this.element).width();
            const elementHeight = $(this.element).height();
            const mousex = game.Levels3DPreview.mousePosition.x;
            const mousey = game.Levels3DPreview.mousePosition.y;
            const hud = $("#hud")
            const hudLeft = hud.offset().left;
            const hudTop = hud.offset().top;
            $(this.element).css({
                left: mousex - elementWidth / 2 - hudLeft,
                top: mousey - elementHeight / 2 - hudTop,
            })
        }
    }

    function Token3DSetPosition(wrapped,...args){
        wrapped(...args);
        if(game.Levels3DPreview?._active){
          const token3D = game.Levels3DPreview.tokenIndex[this.id];
          if(token3D && token3D.fallbackAnimation){
              token3D.setPosition();
          }
        }
    }
});

Hooks.on("canvasReady", () => {
    game.Levels3DPreview?.close();
})

Hooks.on("getSceneControlButtons", (buttons)=>{
    buttons.find(b => b.name === "levels")?.tools?.push({
        "name": "preview3d",
        "title": "Show/Hide 3D Preview",
        "icon": "fas fa-cube",
        toggle: true,
        active: game.Levels3DPreview?._active,
        onClick: () => {
            game.Levels3DPreview.toggle();
        }
    })
    if(canvas?.scene?.getFlag("levels-3d-preview","enablePlayers") && !game?.user?.isGM){
        buttons.find(b => b.name === "token")?.tools?.push({
            "name": "preview3d",
            "title": "Show/Hide 3D Preview",
            "icon": "fas fa-cube",
            toggle: true,
            active: game.Levels3DPreview?._active,
            onClick: () => {
                game.Levels3DPreview.toggle();
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
        "renderBackground": {
            "type": "checkbox",
            "label": "Display Background",
            "default": true,
            "notes": "Display the background image of the scene as a board."
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
            label: "Show Lighting Debug",
            default: false,
        },
        "showSceneWalls": {
            type: "checkbox",
            label: "Show Scene Walls",
            default: true,
        },
        "showSceneFloors": {
            type: "checkbox",
            label: "Show Scene Floors/Polygons",
            default: true,
        },
        "renderSceneLights": {
            type: "checkbox",
            label: "Render Scene Lights",
            default: true,
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
        "draggable": {
            type: "checkbox",
            label: "Draggable",
            default: true,
        },
        "enableAnim": {
            type: "checkbox",
            label: "Enable Animation (if present)",
            default: true,
        },
        "animIndex":{
            type: "number",
            label: "Animation Index",
            default: 0,
        },
        "animSpeed":{
            type: "range",
            label: "Animation Speed",
            default: 1,
            min: 0,
            max: 10,
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
        "rotationX" : {
            type: "range",
            label: "Rotation X",
            default: 0,
            min: 0,
            max: 360,
            step: 1,
        },
        "rotationY" : {
            type: "range",
            label: "Rotation Y",
            default: 0,
            min: 0,
            max: 360,
            step: 1,
        },
        "rotationZ" : {
            type: "range",
            label: "Rotation Z",
            default: 0,
            min: 0,
            max: 360,
            step: 1,
        },
        "rotateBase": {
            type: "checkbox",
            label: "Fix Base Rotation",
            notes: "Some models require the selection indicator to be rotated, enable as necessary.",
            default: false,
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
            step: 0.01,
        },
    })
})