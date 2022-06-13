Hooks.once('ready', async function() {
    libWrapper.register("levels-3d-preview", "ClientKeybindings.prototype._handleMovement", _handleMovement, "MIXED");
    libWrapper.register("levels-3d-preview", "TokenHUD.prototype.setPosition", TokenHUDsetPosition, "WRAPPER")
    libWrapper.register("levels-3d-preview", "TileHUD.prototype.setPosition", TileHUDsetPosition, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.refresh", reDraw, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.drawBars", drawBars, "WRAPPER")
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype.drawEffects", drawEffects, "WRAPPER");
    libWrapper.register("levels-3d-preview", "ObjectHUD.prototype.createScrollingText", showBouncingText, "WRAPPER");
    libWrapper.register("levels-3d-preview", "CONFIG.Token.objectClass.prototype._onMovementFrame", Token3DSetPosition, "WRAPPER");
    libWrapper.register("levels-3d-preview", "TokenLayer.prototype.cycleTokens", cycleTokens, "WRAPPER");
    libWrapper.register("levels-3d-preview", "Canvas.prototype.animatePan", animatePan, "WRAPPER");
    libWrapper.register("levels-3d-preview", "SightLayer.prototype.commitFog", updateFog, "WRAPPER");
    libWrapper.register("levels-3d-preview", "PlaceablesLayer.prototype.pasteObjects", pasteObjects, "WRAPPER");
    libWrapper.register("levels-3d-preview", "ClockwiseSweepPolygon.prototype._compute", _computePolygon, "WRAPPER");
    libWrapper.register("levels-3d-preview", "Scenes.prototype.preload", preload3D, "OVERRIDE");
    
    

    if(game.system.id === "dnd5e") libWrapper.register("levels-3d-preview", "game.dnd5e.canvas.AbilityTemplate.prototype.drawPreview", drawPreview, "MIXED")
    
    async function showBouncingText(wrapped, ...args) {
        wrapped(...args);
        if ( !game.Levels3DPreview?._active || game.settings.get("core", "scrollingStatusText") !== true || !this.visible ) return null;
        const token3D = game.Levels3DPreview.tokens[this.object.id];
        if(!token3D) return null;
        const bouncingText = $(`<div id="levels3d-ruler-text" data-tokenid="${this.object.id}">${args[0]}</div>`);
        $("body").append(bouncingText);
        const textData = args[1];
        const color = textData?.fill ? PIXI.utils.hex2string(textData.fill) : "white";
        bouncingText.css({
            "color": color,
            "font-size": textData.fontSize+"px",
        });
        game.Levels3DPreview.helpers.ruler3d.centerElement(bouncingText, token3D.head);
        bouncingText.addClass("scrolling-text")
        bouncingText.css({
            transform: `translateY(${textData?.direction == 1 ? "+" : "-"}100%)`
        })
        setTimeout(() => { bouncingText.remove() }, 2500);
    }

    function _computePolygon(wrapped, ...args){
        
        wrapped(...args);
        if(!game.Levels3DPreview?._active){
            const object3dSight = canvas.scene.getFlag("levels-3d-preview", "enableFogOfWar") ?? false;
            if(object3dSight){
                this.points = [0,0,0,0,0,0,0,0]
            }
            return
        }
        if(!game.Levels3DPreview?.object3dSight || !game.Levels3DPreview?.fogExploration) return;
        const splits = 8;
        const timeoutLimit = splits*64;
        const polygonPoints = [];
        const aMax = this.config.aMax
        const aMin = this.config.aMin
        const radius = Math.max(this.config.radius, this.config.radius2);
        const nPoints = Math.ceil((this.config.angle*0.25)/splits) * splits;
        const origin = this.origin
        const factor = game.Levels3DPreview.factor
        const splitAngle = nPoints/splits;
        const computeFull = this.config.source._polygon3DCache?.currentSplit === undefined || (Date.now() - (this.config.source._polygon3DCache?.computeTime ?? 0)) > timeoutLimit;
        const currentSplit = this.config.source._polygon3DCache?.currentSplit ?? 0;
        const splitStart = computeFull ? 0 : currentSplit*splitAngle;
        const splitEnd = computeFull ? nPoints : splitStart + splitAngle;

        if(currentSplit === 0 && this.config.source._polygon3DCache?.cacheId){
            const id = this.config.source._polygon3DCache.cacheId;
            setTimeout(() => {
                if(this.config.source._polygon3DCache?.cacheId === id && !this.config.source._polygon3DCache?.complete){
                    if(!canvas.loading)this.config.source.object.updateSource();
                }
            }, timeoutLimit+16);
        }

        const z = origin.b ?? 0;

        for (let i = splitStart, n = this.config.hasLimitedAngle ? splitEnd + 1 : splitEnd; i < n; i++){
            const a = aMin + (aMax - aMin) * (i / nPoints);
            const x = origin.x + radius * Math.cos(a)
            const y = origin.y + radius * Math.sin(a)

            const collision = game.Levels3DPreview.interactionManager.computeSightCollision({x: origin.x, y: origin.y, z: z}, {x: x, y: y, z: z}, "sight", true);
            if(collision){
                polygonPoints.push(collision.x*factor, collision.z*factor);
            }else{
                polygonPoints.push(x,y);
            }
        }

        if(currentSplit === splits - 1){
            const finalPoints = [];
            Object.values(this.config.source._polygon3DCache.pointsCache).forEach(points => {
                finalPoints.push(...points);
            })
            finalPoints.push(...polygonPoints);
            if(this.config.hasLimitedAngle) finalPoints.push(origin.x, origin.y);
            this.config.source._polygon3DCache = {
                pointsCache : {},
                currentSplit: 0,
                points: finalPoints,
                computeTime: Date.now(),
                complete: true,
                cacheId : randomID(20),
            }
        }else if(computeFull){
            if(this.config.hasLimitedAngle) polygonPoints.push(origin.x, origin.y);
            this.config.source._polygon3DCache = {
                pointsCache : {},
                currentSplit: 0,
                points: polygonPoints,
                computeTime: Date.now(),
                complete: true,
                cacheId : randomID(20),
            }
        }else{
            this.config.source._polygon3DCache.currentSplit = currentSplit + 1,
            this.config.source._polygon3DCache.pointsCache[currentSplit] = polygonPoints
            this.config.source._polygon3DCache.complete = false
        }
        this.points = this.config.source._polygon3DCache.points;
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
        const factor = game.Levels3DPreview.factor
        if(canvas.activeLayer.options.objectClass.embeddedName == "Token" && game.Levels3DPreview?.object3dSight){
            for(let token of canvas.tokens.controlled){
                const oldPos = {
                    x: token.center.x,
                    y: token.center.y,
                    z: token.losHeight,
                }
                const newPos = {
                    x: oldPos.x + dx*canvas.grid.size,
                    y: oldPos.y + dy*canvas.grid.size,
                    z: token.losHeight,
                }
                const collision = game.Levels3DPreview.interactionManager.computeSightCollision(oldPos, newPos, "collision");
                if(collision){
                    dx = 0;
                    dy = 0;
                    return layer.moveMany({dx, dy, rotate: false});
                }
            }
        }
        if(canvas.activeLayer.options.objectClass.embeddedName == "Token"){
            let updates = []
            for(let token of canvas.tokens.controlled){
                const oldPos = {
                    x: token.center.x,
                    y: token.center.y,
                    z: token.losHeight,
                }
                const newPos = {
                    x: oldPos.x + dx*canvas.grid.size,
                    y: oldPos.y + dy*canvas.grid.size,
                    z: token.losHeight,
                }
                const collisionPos = {
                    x: newPos.x,
                    y: newPos.y,
                    z: -100000 ,
                }
                const collision = game.Levels3DPreview.interactionManager.computeSightCollision(newPos, collisionPos, "collision");
                let targetElevation = token.data.elevation
                if(collision){
                    point2d = game.Levels3DPreview.helpers.ruler3d.pos3DToCanvas(collision)
                    targetElevation = point2d.z.toFixed(2)
                }
                updates.push({
                    _id: token.id,
                    x: token.data.x + dx*canvas.grid.size,
                    y: token.data.y + dy*canvas.grid.size,
                    elevation: targetElevation,
                })
            }
            canvas.scene.updateEmbeddedDocuments("Token", updates)
        }else{
            layer.moveMany({dx, dy, rotate: false});
        }
    }

    function handleArrowKeys(directions){

        if(!directions.size || (!game.user.isGM && game.paused)) return

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
          if(token3D){
              token3D.setPositionFrom2D();
          }
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