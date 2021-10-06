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
    const enablePlayers = app.object.getFlag("levels-3d-preview","enablePlayers")
    const formhtml = `
    <h3 class="form-header"><i class="fas fa-cube"></i> Levels - 3D Preview</h3>
    <p class="notes">Configure Levels - 3D preview settings for this scene.</p>
    <div class="form-group">
        <label>Enable for Players</label>
        <input type="checkbox" name="flags.levels-3d-preview.enablePlayers" ${enablePlayers ? "checked" : ""}>
        <p class="notes">Allow players to open the 3D view for this scene, all walls, floors and tokens will be revealed.</p>
    </div>
    `
    $($(html).find("h3")[1]).before(formhtml)
})