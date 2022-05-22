Hooks.once('ready', async function() {
    libWrapper.register("levels-3d-preview", "ClientKeybindings.prototype._handleMovement", _handleMovement, "MIXED");
    libWrapper.register("levels-3d-preview", "TokenHUD.prototype.setPosition", TokenHUDsetPosition, "WRAPPER")
    libWrapper.register("levels-3d-preview", "TileHUD.prototype.setPosition", TileHUDsetPosition, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.refresh", reDraw, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.drawBars", drawBars, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.drawEffects", drawEffects, "WRAPPER");
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype._onMovementFrame", Token3DSetPosition, "WRAPPER");
    libWrapper.register("levels-3d-preview", "TokenLayer.prototype.cycleTokens", cycleTokens, "WRAPPER");
    libWrapper.register("levels-3d-preview", "Canvas.prototype.animatePan", animatePan, "WRAPPER");
    libWrapper.register("levels-3d-preview", "SightLayer.prototype.commitFog", updateFog, "WRAPPER");
    libWrapper.register("levels-3d-preview", "PlaceablesLayer.prototype.pasteObjects", pasteObjects, "WRAPPER");
    libWrapper.register("levels-3d-preview", "ClockwiseSweepPolygon.prototype._compute", _computePolygon, "WRAPPER");
    libWrapper.register("levels-3d-preview", "Scenes.prototype.preload", preload3D, "OVERRIDE");
    

    if(game.system.id === "dnd5e") libWrapper.register("levels-3d-preview", "game.dnd5e.canvas.AbilityTemplate.prototype.drawPreview", drawPreview, "MIXED")
    
    function _computePolygon(wrapped, ...args){
        
        wrapped(...args);
        if(!game.Levels3DPreview?._active){
            const object3dSight = canvas.scene.getFlag("levels-3d-preview", "object3dSight") ?? false;
            if(object3dSight){
                this.points = [0,0,0,0,0,0,0,0]
            }
            return
        }
        if(!game.Levels3DPreview?.object3dSight || !canvas.scene.data.fogExploration) return;
        const polygonPoints = [];
        const aMax = this.config.aMax
        const aMin = this.config.aMin
        const radius = Math.max(this.config.radius, this.config.radius2);
        const nPoints = this.config.angle*0.5;
        const origin = this.origin
        const factor = game.Levels3DPreview.factor

        if(this.config.hasLimitedAngle) polygonPoints.push(origin.x, origin.y);

        const z = origin.b ?? 0;

        for (let i = 0, n = this.config.hasLimitedAngle ? nPoints + 1 : nPoints; i < n; i++){
            const a = aMin + (aMax - aMin) * (i / nPoints);
            const x = origin.x + radius * Math.cos(a)
            const y = origin.y + radius * Math.sin(a)

            const collision = game.Levels3DPreview.interactionManager.computeSightCollision({x: origin.x, y: origin.y, z: z}, {x: x, y: y, z: z});
            if(collision){
                polygonPoints.push(collision.x*factor, collision.z*factor);
            }else{
                polygonPoints.push(x,y);
            }
        }

        if(this.config.hasLimitedAngle) polygonPoints.push(origin.x, origin.y);
        this.points = polygonPoints;
    }


    async function preload3D(sceneId, push=false) {
        if ( push ) return game.socket.emit('preloadScene', sceneId, () => this.preload(sceneId));
        let scene = this.get(sceneId);
        const promises = [];
    
        // Preload sounds
        if ( scene.playlistSound?.data.path ) promises.push(AudioHelper.preloadSound(scene.playlistSound.data.path));
        else if ( scene.playlist?.playbackOrder.length ) {
          const first = scene.playlist.sounds.get(scene.playlist.playbackOrder[0]);
          if ( first ) promises.push(AudioHelper.preloadSound(first.data.path))
        }
    
        // Preload textures without expiring current ones
        promises.push(TextureLoader.loadSceneTextures(scene, {expireCache: false}));
        const models3D = scene.tokens.map(t=>t.getFlag("levels-3d-preview","model3d")).filter(m=>m)
        for(let model of models3D) {
            promises.push(game.Levels3DPreview.helpers.preloadModel(model));
        }
        return Promise.all(promises);

    }

    function pasteObjects(wrapped,...args){
        if(!game.Levels3DPreview?._active) return wrapped(...args);
        const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
        args[0].x = pos.x;
        args[0].y = pos.y;
        return wrapped(...args);
    }

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

        if(!directions.size) return

        const cPos = game.Levels3DPreview.camera.position
        const cTar = game.Levels3DPreview.controls.target

        const angle = Math.atan2(cTar.z - cPos.z, cTar.x - cPos.x);

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
        const dAngle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
        const fAngle = dAngle + angle - Math.PI;
        const nX = Math.round(Math.sin(fAngle));
        const nY = Math.round(-Math.cos(fAngle));
        return {x: nX, y: nY}
        
    }

    function TokenHUDsetPosition(wrapped,...args){
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

    function TileHUDsetPosition(wrapped,...args){
        wrapped(...args);
        if(game.Levels3DPreview?._active && game.Levels3DPreview.tiles[this.object.id]){
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