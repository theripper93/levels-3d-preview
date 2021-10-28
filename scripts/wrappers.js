
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
            $(this.element).css({
                "transform-origin": "center",
            });
        }else{
            $("#hud").append(this.element);
            $(this.element).css({
                "transform-origin": "top left",
            });
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