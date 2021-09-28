Hooks.once('init', async function() {

});

Hooks.once('ready', async function() {

});


Hooks.on("getSceneControlButtons", (buttons)=>{
    buttons.find(b => b.name === "levels").tools.push({
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
})