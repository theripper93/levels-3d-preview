export function warpgateWrappers() {
    if (!game.modules.get("warpgate")?.active) return;
    
    libWrapper.register("levels-3d-preview", "warpgate.abstract.Crosshairs.prototype.activatePreviewListeners",
        function (wrapped, ...args) {
            wrapped(...args);
            game.Levels3DPreview?._active && game.Levels3DPreview.CONFIG.entityClass.Template3D.drawPreview(this, false).then((response) => {
                this.cancelled = !response;
                if (response) this.document.updateSource({...response});
                this.clearHandlers();
            });
        },
        "WRAPPER"
    );
    
}


game.Levels3DPreview?._active && game.Levels3DPreview.CONFIG.entityClass.Template3D.drawPreview(templateData, false).then((response) => {
    if (response) { 
        doSomethingWithData()
    } else {
        cancel()
    }
});