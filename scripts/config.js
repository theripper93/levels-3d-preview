import * as THREE from "./lib/three.module.js";

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

      game.settings.register("levels-3d-preview", "miniCanvas", {
        name: "Enable Canvas Popout",
        hint: "Pop out the 2d canvas into a separate window when the 3D mode is activated",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
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

Hooks.once('ready', async function() {

    libWrapper.register("levels-3d-preview", "KeyboardManager.prototype._handleMovement", _handleMovement, "MIXED")
    libWrapper.register("levels-3d-preview", "TokenHUD.prototype.setPosition", setPosition, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.refresh", reDraw, "WRAPPER")
    libWrapper.register("levels-3d-preview", "Token.prototype._onMovementFrame", Token3DSetPosition, "WRAPPER");

    function reDraw(wrapped,...args){
        wrapped(...args)
        try{
        game.Levels3DPreview?._active && game.Levels3DPreview.tokenIndex[this.id]?.reDraw()
        }catch(e){}
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
            $("body").append(this.element);
        }else{
            $("#hud").append(this.element);
        }
    }

    function Token3DSetPosition(wrapped,...args){
        wrapped(...args);
        if(game.Levels3DPreview?._active){
          const token3D = game.Levels3DPreview.tokenIndex[this.id];
          if(token3D && token3D.fallbackAnimation){
              token3D.isAnimating = false;
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
        "renderTable": {
            "type": "checkbox",
            "label": "Display Table",
            "default": false,
            "notes": "Render the table in the 3D view."
        },
        "tableTex" : {
            type: "filepicker",
            label: "Table Texture",
            placeholder: "Table Texture",
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
        "enableRuler": {
            type: "checkbox",
            label: "Enable Ruler",
            default: true,
        },
        "enableAxis": {
            type: "checkbox",
            label: "Enable Axis",
        },
        "sceneTint": {
            type: "color",
            label: "Scene Tint",
            default: "#ffc494",
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
            default: 3.4,
            min: 1,
            max: 10,
            step: 0.1,
        },
        "sunIntensity": {
            type: "range",
            label: "Sun Intensity",
            default: 3,
            min: 0.1,
            max: 10,
            step: 0.1,
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
        "wallFloorAlpha": {
            type: "range",
            label: "Wall/Floor Alpha",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.1,
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
        "imageTexture":{
            type: "filepicker",
            label: "Texture",

        },
        "material": {
            type: "select",
            label: "Material",
            default: "none",
            options: {
                "none": "Default",
                "plastic": "Plastic",
                "wood": "Wood",
                "glass": "Glass",
            }
        },
        "color": {
            type: "color",
            label: "Color",
            default: "#ffa95c",
            notes: "Material and Color will work only on some models, usually the grey/untextured ones."
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
                "x": "X",
                "z": "Z",
                "y": "Y",
            },
            default: "y",
            notes: "The axis to use when the original token rotation changes. If the original file was in STL format this will usually be Z, otherwise Y",
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
            notes: "Some models require the selection indicator to be rotated, enable as necessary. (usually files converted from STL)",
            default: false,
        },
        "offsetX": {
            type: "number",
            label: "Offset X",
            default: 0,
        },
        "offsetY": {
            type: "number",
            label: "Offset Y",
            default: 0,
        },
        "offsetZ": {
            type: "number",
            label: "Offset Z",
            default: 0,
        },
        "scale": {
            type: "number",
            label: "Scale",
            step: 0.00001,
            default: 1,
        },
    })
})