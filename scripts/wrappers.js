Hooks.once('ready', async function() {
    if(game.version > 9)libWrapper.register("levels-3d-preview", "ClientKeybindings.prototype._handleMovement", _handleMovement, "MIXED")
    else libWrapper.register("levels-3d-preview", "KeyboardManager.prototype._handleMovement", _handleMovement, "MIXED")
    libWrapper.register("levels-3d-preview", "TokenHUD.prototype.setPosition", setPosition, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.refresh", reDraw, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.drawBars", drawBars, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.drawEffects", drawEffects, "WRAPPER");
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype._onMovementFrame", Token3DSetPosition, "WRAPPER");
    libWrapper.register("levels-3d-preview", "TokenLayer.prototype.cycleTokens", cycleTokens, "WRAPPER");
    libWrapper.register("levels-3d-preview", "Canvas.prototype.animatePan", animatePan, "WRAPPER");
    libWrapper.register("levels-3d-preview", "SightLayer.prototype.commitFog", updateFog, "WRAPPER");

    if(game.system.id === "dnd5e") libWrapper.register("levels-3d-preview", "game.dnd5e.canvas.AbilityTemplate.prototype.drawPreview", drawPreview, "MIXED")
    
    function updateFog(wrapped, ...args){
        wrapped(...args);
        if(game.Levels3DPreview._active && game.Levels3DPreview.fogExploration){
            game.Levels3DPreview.fogExploration.needsUpdate = true;
        }
    }

    async function drawEffects(wrapped, ...args){
        await wrapped(...args);
        if(game.Levels3DPreview._active && game.Levels3DPreview.tokens[this.id]) game.Levels3DPreview.tokens[this.id].drawEffects()
    }

    function drawBars(wrapped, ...args){
        wrapped(...args)
        if(game.Levels3DPreview._active && game.Levels3DPreview.tokens[this.id]) game.Levels3DPreview.tokens[this.id].drawBars()
    }

    function drawPreview(wrapped, ...args){
        if(game.Levels3DPreview?._active){
        game.Levels3DPreview.Classes.Template3D.drawPreview(this)
        }else return wrapped(...args)
    }

    function reDraw(wrapped,...args){
        wrapped(...args)
        try{
        game.Levels3DPreview?._active && game.Levels3DPreview.tokens[this.id]?.reDraw()
        }catch(e){}
    }

    function _handleMovement(wrapped,...args){
        const layer = args[1];
        if(!game.Levels3DPreview?._active || !canvas.tokens.controlled[0]) return wrapped(...args);

        const positions = handleArrowKeys(this.moveKeys)
        if(!positions) return
        let dx = positions.x
        let dy = positions.y
        layer.moveMany({dx, dy, rotate: false});
    }

    function handleArrowKeys(directions){
        const camera = game.Levels3DPreview.camera.position.clone();
        const target = game.Levels3DPreview.tokens[_token?.id];
        if(!target) return undefined
        const p2 = {
            x: camera.x,
            y: camera.z
        }
        const p1 = {
            x: target.mesh.position.x,
            y: target.mesh.position.z
        }
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)+Math.PI;
        let dx = 0;
        let dy = 0;
    
        // Assign movement offsets
        if ( directions.has("left") ) dx -= 1;
        if ( directions.has("up") ) dy -= 1;
        if ( directions.has("right") ) dx += 1;
        if ( directions.has("down") ) dy += 1;

        // Calculate movement vector
        const d1 = {
            x: 0,
            y: 0
        }
        const d2 = {
            x: dx,
            y: dy,
        }
        const dAngle = Math.atan2(d2.y - d1.y, d2.x - d1.x)+Math.PI;
        const fAngle = (dAngle + angle)%(Math.PI*2);
        const nX = Math.round(Math.sin(fAngle));
        const nY = Math.round(-Math.cos(fAngle));
        return {x: nX, y: nY}
        
    }

    function setPosition(wrapped,...args){
        wrapped(...args);
        if(game.Levels3DPreview?._active && game.Levels3DPreview.tokens[this.object.id]){
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
          const token3D = game.Levels3DPreview.tokens[this.id];
          if(token3D && token3D.fallbackAnimation){
              token3D.isAnimating = false;
              token3D.setPosition();
          }
        }
    }

    function cycleTokens(wrapped,...args){
        if(!game.Levels3DPreview?._active || game.Levels3DPreview.CONFIG.autoPan) return wrapped(...args);
        const next = wrapped(...args);
        game.Levels3DPreview.setCameraToControlled(next);
    }

    async function animatePan(wrapped,...args){
        if(game.Levels3DPreview?._active && game.Levels3DPreview.CONFIG.autoPan){
            const x = args[0].x;
            const y = args[0].y;
            const token = canvas.tokens.placeables.find(t => t.center?.x == x && t.center?.y == y);
            if(token){
                game.Levels3DPreview.setCameraToControlled(token);
            }
        }
        return wrapped(...args);
    }
});