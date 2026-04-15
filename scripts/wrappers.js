import { Region3D } from "./entities/region3d.js";
import { Shape3D } from "./entities/shape3d.js";
import * as THREE from "./lib/three.module.js";

export function registerWrappers() {

    Object.defineProperty(foundry.canvas.placeables.Token.prototype, "object3d", {
        get: function () {
            return game.Levels3DPreview.tokens[this.id];
        },
    });

    Hooks.once("ready", async function () {

        //Register Core Wrappers

        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.TokenLayer.prototype.moveMany", moveMany, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.TilesLayer.prototype.moveMany", moveManyTiles, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.groups.InterfaceCanvasGroup.prototype.createScrollingText", showBouncingText, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.TokenLayer.prototype.cycleTokens", cycleTokens, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.Canvas.prototype.animatePan", animatePan, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.perception.FogManager.prototype.save", updateFog, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.PlaceablesLayer.prototype.pasteObjects", pasteObjects, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.geometry.ClockwiseSweepPolygon.prototype._compute", computePolygonDispatch, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.documents.collections.Scenes.prototype.preload", preload3D, "OVERRIDE");
        libWrapper.register("levels-3d-preview", "canvas.app.renderer.events.pointer.getLocalPosition", pointerPositionWrapper, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.ControlsLayer.prototype.handlePing", HandlePing, "WRAPPER");
        libWrapper.register("levels-3d-preview", "canvas.regions.placeRegion", placeRegion, "MIXED");
        libWrapper.register("levels-3d-preview", "Scene.prototype.testSurfaceCollision", sceneTestSurfaceCollision, "MIXED");
        //game.Levels3DPreview.raycastWorker = raycastWorker;

        if (game[game.system.id]?.canvas?.AbilityTemplate?.prototype?.drawPreview) libWrapper.register("levels-3d-preview", `game.${game.system.id}.canvas.AbilityTemplate.prototype.drawPreview`, placeTemplate, "MIXED");

        // if (CONFIG.MeasuredTemplate.objectClass.prototype.drawPreview) libWrapper.register("levels-3d-preview", "CONFIG.MeasuredTemplate.objectClass.prototype.drawPreview", drawPreview, "MIXED");
        // if (CONFIG.Region.objectClass.prototype.draw) libWrapper.register("levels-3d-preview", "CONFIG.Region.objectClass.prototype.draw", drawPreview, "MIXED");

        // if (foundry.canvas.layers.TemplateLayer.prototype._createPreview) libWrapper.register("levels-3d-preview", "foundry.canvas.layers.TemplateLayer.prototype._createPreview", drawPreviewTemplateLayer, "MIXED");
        // if (foundry.canvas.layers.RegionLayer.prototype._createPreview) libWrapper.register("levels-3d-preview", "foundry.canvas.layers.RegionLayer.prototype._createPreview", drawPreviewTemplateLayer, "MIXED");

        async function HandlePing(wrapped, ...args) {
            if (!game.Levels3DPreview?._active) return wrapped(...args);
            const [user, position, options] = args;
            if (!canvas.ready || canvas.scene?.id !== options.scene || !position) return wrapped(...args);
            const token = canvas.tokens.placeables.find((t) => t.center.x == position.x && t.center.y == position.y);
            if (!token) return wrapped(...args);
            const color = user.color.css;
            const size = Math.max(token.document.width, token.document.height);
            const pos3d = game.Levels3DPreview.tokens[token.id].mesh.position.clone();
            if (options.pull && game.user == user) {
                if (game.Levels3DPreview.interactionManager.isCameraLocked) return;
                const cameraPosition = game.Levels3DPreview.camera.position.clone();
                const cameraLookat = pos3d.clone();
                game.Levels3DPreview.helpers.focusCameraToPosition(cameraPosition, cameraLookat);
            }
            game.Levels3DPreview.helpers.dispatchPing({ position: pos3d, color: color, size: size });
            return wrapped(...args);
        }

        function pointerPositionWrapper(wrapped, ...args) {
            if (game.Levels3DPreview?._active) return game.canvas3D.interactionManager.canvas2dMousePosition;
            return wrapped(...args);
        }

        async function showBouncingText(wrapped, ...args) {
            wrapped(...args);
            if (!game.Levels3DPreview?._active || game.settings.get("core", "scrollingStatusText") !== true || !this.visible) return null;
            const tokenId = canvas.tokens.placeables.find((t) => t.center.x == args[0].x && t.center.y == args[0].y)?.id;
            const token3D = game.Levels3DPreview.tokens[tokenId];
            if (!token3D) return null;
            const divContainer = document.createElement("div");
            divContainer.innerHTML = `<div id="levels3d-ruler-text" data-tokenid="${tokenId}">${args[1]}</div>`;
            const bouncingText = divContainer.firstElementChild;
            document.body.appendChild(bouncingText);
            const textData = args[2];
            const duration = Math.max(600, textData.duration ?? 2000);
            const color = textData?.fill ? PIXI.utils.hex2string(textData.fill) : "white";
            bouncingText.style.color = color;
            bouncingText.style.fontSize = textData.fontSize + "px";

            game.Levels3DPreview.helpers.ruler3d.centerElement(bouncingText, token3D.head);
            bouncingText.classList.add("scrolling-text");
            bouncingText.style.transition = `opacity 0.4s ease-in-out ${duration / 1000}s, transform ${duration / 1000}s ease-out`;

            let translationTransform = "";
            if (textData) textData.direction ??= CONST.TEXT_ANCHOR_POINTS.TOP;
            if (textData?.direction <= CONST.TEXT_ANCHOR_POINTS.TOP) {
                translationTransform = `translateY(${textData?.direction == CONST.TEXT_ANCHOR_POINTS.BOTTOM ? "+" : "-"}${textData.distance ?? 100}%)`;
            } else {
                translationTransform = `translateX(${textData?.direction == CONST.TEXT_ANCHOR_POINTS.RIGHT ? "+" : "-"}${textData.distance ?? 100}%)`;
            }

            //scale in
            bouncingText.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], {
                duration: 200,
                easing: "ease-out",
                fill: "forwards",
            }).onfinish = () => {
                bouncingText.animate([{ transform: "translate(0, 0)" }, { transform: translationTransform }], {
                    duration: duration - 600,
                    easing: "ease-in-out",
                    fill: "forwards",
                }).onfinish = () => {
                    bouncingText.animate([{ opacity: 1 }, { opacity: 0 }], {
                        duration: 400,
                        easing: "ease-in-out",
                        fill: "forwards",
                    }).onfinish = () => bouncingText.remove();
                };
            };
        }

        function computePolygonDispatch(wrapped, ...args) {
            const useMultithreading = game.Levels3DPreview?.CONFIG?.useMultithreading;
            if (useMultithreading) {
                _computePolygonMultithreaded.bind(this)(wrapped, ...args);
            } else {
                _computePolygon.bind(this)(wrapped, ...args);
            }
        }

        function getSourceElevation(source) {
            if (source?.object?.b !== undefined) return source.object.b;
            const object3d = source?.object?.object3d;
            if (object3d) return object3d.visionSourceElevation;
            return source.elevation ?? 0;
        }

        function _computePolygonMultithreaded(wrapped, ...args) {
            wrapped(...args);
            if (!game.Levels3DPreview?._ready || !game.Levels3DPreview?._active || !game.Levels3DPreview?.workers?._visionReady) {
                const object3dSight = canvas.scene.getFlag("levels-3d-preview", "object3dSight") ?? false;
                if (object3dSight) {
                    this.points = [0, -1, 1, -1, 1, 1, 0, 1];
                }
                return;
            }
            if (!game.Levels3DPreview?.object3dSight || !game.Levels3DPreview?.fogExploration || !this.config?.source?.object || this.config.source.object instanceof Scene || this.config.type === "universal") return;
            const id = this.config.type + "." + this.config.source.object.id;
            const worker = game.Levels3DPreview.workers;
            this.points = [0, -1, 1, -1, 1, 1, 0, 1];
            const lastComputed = worker.getLastComputed(id);
            if (lastComputed) this.points = lastComputed;
            const lastRaycast = worker.getLastRaycast(id);
            if (lastRaycast) {
                this.points = lastRaycast;
            }

            if (this.config.source.object.updatedByWorker) {
                this.config.source.object.updatedByWorker = false;
                return;
            }

            const message = {
                type: "raycast",
                config: {
                    rotation: this.config.rotation,
                    angle: this.config.angle,
                    hasLimitedAngle: this.config.hasLimitedAngle,
                    radius: this.config.radius,
                    z: (getSourceElevation(this.config.source) * (canvas.scene.dimensions.size / canvas.scene.dimensions.distance)) / game.Levels3DPreview.factor,
                    origin: {
                        x: this.origin.x,
                        y: this.origin.y,
                    },
                },
                id: id,
            };
            worker.requestWorkerRaycast(message, (points) => {
                this.points = points;
                if (!lastRaycast) {
                    this.config.source.object.updatedByWorker = true;
                    if (this.config.source.object.initializeSources) this.config.source.object.initializeSources();
                    if (this.config.source.object.initializeLightSource) this.config.source.object.initializeLightSource();
                }
            });
        }

        function _computePolygon(wrapped, ...args) {
            wrapped(...args);
            if (!game.Levels3DPreview?._ready || !game.Levels3DPreview?._active) {
                const object3dSight = canvas.scene.getFlag("levels-3d-preview", "object3dSight") ?? false;
                if (object3dSight) {
                    this.points = [0, -1, 1, -1, 1, 1, 0, 1];
                }
                return;
            }
            if (!game.Levels3DPreview?.object3dSight || !game.Levels3DPreview?.fogExploration || this.config.source.object instanceof Scene || this.config.type === "universal") return;
            const splits = 8;
            const timeoutLimit = splits * 64;
            const polygonPoints = [];
            const aMin = Math.normalizeRadians(Math.toRadians(this.config.rotation + 90 - this.config.angle / 2));
            const aMax = aMin + (this.config.hasLimitedAngle ? Math.toRadians(this.config.angle) : Math.PI * 2);
            const radius = this.config.radius;
            const nPoints = Math.ceil((this.config.angle * 0.25) / splits) * splits;
            const origin = this.origin;
            const factor = game.Levels3DPreview.factor;
            const splitAngle = nPoints / splits;
            const computeFull = this.config.source._polygon3DCache?.currentSplit === undefined || Date.now() - (this.config.source._polygon3DCache?.computeTime ?? 0) > timeoutLimit;
            const currentSplit = this.config.source._polygon3DCache?.currentSplit ?? 0;
            const splitStart = computeFull ? 0 : currentSplit * splitAngle;
            const splitEnd = computeFull ? nPoints : splitStart + splitAngle;



            const z = this.config.source?.object?.b ?? 0;
            const perfStart = Date.now();
            for (let i = splitStart, n = this.config.hasLimitedAngle ? splitEnd + 1 : splitEnd; i < n; i++) {
                const a = aMin + (aMax - aMin) * (i / nPoints);
                const x = origin.x + radius * Math.cos(a);
                const y = origin.y + radius * Math.sin(a);
                const collision = game.Levels3DPreview.interactionManager.computeSightCollision({ x: origin.x, y: origin.y, z: z }, { x: x, y: y, z: z }, "sight", true);
                if (collision) {
                    polygonPoints.push(Math.round(collision.x * factor), Math.round(collision.z * factor));
                } else {
                    polygonPoints.push(Math.round(x), Math.round(y));
                }
            }

            if (currentSplit === splits - 1) {
                const finalPoints = [];
                Object.values(this.config.source._polygon3DCache.pointsCache).forEach((points) => {
                    finalPoints.push(...points);
                });
                finalPoints.push(...polygonPoints);
                if (this.config.hasLimitedAngle) finalPoints.push(origin.x, origin.y);
                this.config.source._polygon3DCache = {
                    pointsCache: {},
                    currentSplit: 0,
                    points: finalPoints,
                    computeTime: Date.now(),
                    complete: true,
                    cacheId: foundry.utils.randomID(20),
                };
            } else if (computeFull) {
                if (this.config.hasLimitedAngle) polygonPoints.push(origin.x, origin.y);
                this.config.source._polygon3DCache = {
                    pointsCache: {},
                    currentSplit: 0,
                    points: polygonPoints,
                    computeTime: Date.now(),
                    complete: true,
                    cacheId: foundry.utils.randomID(20),
                };
            } else {
                (this.config.source._polygon3DCache.currentSplit = currentSplit + 1), (this.config.source._polygon3DCache.pointsCache[currentSplit] = polygonPoints);
                this.config.source._polygon3DCache.complete = false;
            }
            this.points = this.config.source._polygon3DCache.points;
            //console.log(`compute polygon ${Date.now() - perfStart}ms`, nPoints);
        }

        async function preload3D(sceneId, push = false) {
            if (push) return game.socket.emit("preloadScene", sceneId, () => this.preload(sceneId));
            let scene = this.get(sceneId);
            const promises = [];

            // Preload sounds
            if (scene.playlistSound?.document.path) promises.push(foundry.audio.AudioHelper.preloadSound(scene.playlistSound.document.path));
            else if (scene.playlist?.playbackOrder.length) {
                const first = scene.playlist.sounds.get(scene.playlist.playbackOrder[0]);
                if (first) promises.push(foundry.audio.AudioHelper.preloadSound(first.document.path));
            }

            // Preload textures without expiring current ones
            promises.push(TextureLoader.loadSceneTextures(scene, { expireCache: false }));
            const models3D = scene.tokens.map((t) => t.getFlag("levels-3d-preview", "model3d")).filter((m) => m);
            const tiles3D = scene.tiles.map((t) => t.getFlag("levels-3d-preview", "model3d")).filter((m) => m);

            for (let model of models3D.concat(tiles3D)) {
                promises.push(game.Levels3DPreview.helpers.preloadModel(model));
            }
            return Promise.all(promises);
        }

        async function pasteObjects(wrapped, ...args) {
            if (!game.Levels3DPreview?._active) return await wrapped(...args);
            const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
            args[0].x = pos.x;
            args[0].y = pos.y;
            return await wrapped(...args);
        }

        function updateFog(wrapped, ...args) {
            wrapped(...args);
            if (game.Levels3DPreview._active && game.Levels3DPreview.fogExploration) {
                game.Levels3DPreview.fogExploration.needsUpdate = true;
            }
        }

        function drawPreview(wrapped, ...args) {
            if (game.Levels3DPreview?._active) {
                return game.Levels3DPreview.Classes.Template3D.drawPreview(this);
            } else return wrapped(...args);
        }

        function drawPreviewTemplateLayer(wrapped, ...args) {
            if (game.Levels3DPreview?._active) {
                return game.Levels3DPreview.Classes.Template3D.drawPreview(args[0], true);
            } else return wrapped(...args);
        }

        async function moveMany(wrapped, ...args) {
            if (!game.Levels3DPreview?._active || args[0].rotate) return wrapped(...args);
                let {dx, dy, dz, rotate, ids, includeLocked} = args[0];
                if ( ![-1, 0, 1].includes(dx) ) throw new Error("Invalid argument: dx must be -1, 0, or 1");
                if ( ![-1, 0, 1].includes(dy) ) throw new Error("Invalid argument: dy must be -1, 0, or 1");
                if ( ![-1, 0, 1].includes(dz) ) throw new Error("Invalid argument: dz must be -1, 0, or 1");
                if ( !dx && !dy && !dz ) return [];
                if ( game.paused && !game.user.isGM ) {
                ui.notifications.warn("GAME.PausedWarning", {localize: true});
                return [];
            }

            // Identify the objects requested for movement
            const objects = this._getMovableObjects(ids, includeLocked);
            if ( !objects.length ) return objects;

            // Conceal any active HUD
            this.hud?.close();
            let [updateData, updateOptions={}] = this._prepareKeyboardMovementUpdates(objects, dx, dy, dz);
            const positions = handleArrowKeys({dx,dy,dz});

            if (!positions) return;
            dx = positions.x;
            dy = positions.y;

            if (game.Levels3DPreview?.object3dSight) {
                for (const token of objects) {
                    const oldPos = {
                        x: token.center.x,
                        y: token.center.y,
                        z: token.losHeight ?? token.document.elevation,
                    };
                    const newPos = {
                        x: oldPos.x + dx * canvas.grid.size,
                        y: oldPos.y + dy * canvas.grid.size,
                        z: token.losHeight ?? token.document.elevation,
                    };
                    const collision = game.Levels3DPreview.interactionManager.computeSightCollision(oldPos, newPos, "collision");
                    if (collision) {
                        dx = 0;
                        dy = 0;
                    }
                }
            }
            for (const token of objects) {
                const oldPos = {
                    x: token.center.x,
                    y: token.center.y,
                    z: token.losHeight ?? token.document.elevation,
                };
                const newPos = {
                    x: oldPos.x + dx * canvas.grid.size,
                    y: oldPos.y + dy * canvas.grid.size,
                    z: token.losHeight ?? token.document.elevation,
                };
                const collisionPos = {
                    x: newPos.x,
                    y: newPos.y,
                    z: -100000,
                };
                const collision = token.document.getFlag("levels-3d-preview", "wasFreeMode") ? null : game.Levels3DPreview.interactionManager.computeSightCollision(newPos, collisionPos, "collision");
                let targetElevation = token.document.elevation;
                if (collision) {
                    let point2d = game.Levels3DPreview.helpers.ruler3d.pos3DToCanvas(collision);
                    targetElevation = point2d.z.toFixed(2);
                }
                const movementCollision = game.Levels3DPreview.interactionManager.computeSightCollision(oldPos, newPos, "collision");

                if (!movementCollision){
                    const waypoint = updateOptions.movement[token.id].waypoints[0];
                    waypoint.x = token.document.x + dx * canvas.grid.size;
                    waypoint.y = token.document.y + dy * canvas.grid.size;
                    waypoint.elevation = parseFloat(targetElevation);
                }else{
                    delete updateOptions.movement[token.id];
                    updateData = updateData.filter(e => e._id !== token.id);
                }
            
                await canvas.scene.updateEmbeddedDocuments(this.constructor.documentName, updateData, updateOptions);
            }
            return objects;
        }

        async function moveManyTiles(wrapped, ...args) {
            // TODO: Investigate move tiles in 3D with WASD
            if (game.Levels3DPreview?._active) return [];
            // if (game.Levels3DPreview?._active && game.Levels3DPreview.interactionManager._gizmoEnabled) return [];
            return wrapped(...args);
        }

        function handleArrowKeys(originalDeltas) {

            const {dx, dy} = originalDeltas;

            const cPos = game.Levels3DPreview.camera.position;
            const cTar = game.Levels3DPreview.controls.target;

            const angle = Math.atan2(cTar.z - cPos.z, cTar.x - cPos.x);

            // Calculate movement vector
            const d1 = {
                x: 0,
                y: 0,
            };
            const d2 = {
                x: dx,
                y: dy,
            };
            const dAngle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
            const fAngle = dAngle + angle - Math.PI;
            const nX = Math.round(Math.sin(fAngle));
            const nY = Math.round(-Math.cos(fAngle));
            return { x: nX, y: nY };
        }

        function cycleTokens(wrapped, ...args) {
            if (!game.Levels3DPreview?._active || game.Levels3DPreview.CONFIG.autoPan) return wrapped(...args);
            const next = wrapped(...args);
            game.Levels3DPreview.setCameraToControlled(next);
        }

        async function animatePan(wrapped, ...args) {
            if (game.Levels3DPreview?._active && game.Levels3DPreview.CONFIG.autoPan) {
                if (canvas.regions._placementContext) return;
                const x = args[0].x;
                const y = args[0].y;
                const dest = args[0].dest;
                const token = canvas.tokens.placeables.find((t) => t.center?.x == x && t.center?.y == y);
                const tile = canvas.tiles.placeables.find((t) => t.center?.x == x && t.center?.y == y);
                if (token || dest instanceof TokenDocument) {
                    game.Levels3DPreview.setCameraToControlled(token ?? dest);
                } else if (tile || dest instanceof TileDocument) {
                    game.Levels3DPreview.helpers.animateCamera(tile ?? dest);
                } else {
                    game.Levels3DPreview.helpers.animateCamera({ x: x, y: y });
                }
            }
            return wrapped(...args);
        }

        const _templateContext = { onFinish: null };
        async function placeTemplate(wrapped, ...args) {
            if (!game.Levels3DPreview?._active) return wrapped(...args);
            const template = this.document;
            const region = foundry.documents.BaseRegion._migrateMeasuredTemplateData(template);
            region.elevation.bottom /= canvas.scene.dimensions.distancePixels;
            const shape = region.shapes[0];
            let height;
            switch (shape.type) {
                case "rectangle":
                    height = shape.width;
                    break;
                case "circle":
                    height = shape.radius * 2;
                    break;
                case "ellipse":
                    height = shape.radiusX * 2;
                    break;
                case "line":
                    height = shape.width;
                    break;
                case "ring":
                    height = shape.outerWidth;
                    break;
                case "emanation":
                    height = shape.base.width * canvas.dimensions.size + shape.radius * 2;
                    break;
                case "cone":
                    const angleRad = shape.angle * (Math.PI / 180);
                    switch (shape.curvature) {
                        case "flat":
                            height = shape.radius * Math.tan(angleRad / 2) * 2;
                            break;
                        case "round":
                            height = shape.radius * Math.sin(angleRad / 2) * 2;
                            break;
                        case "semicircle":
                            const coneHeight = shape.radius / (1 + Math.tan(angleRad / 2));
                            height = shape.radius - coneHeight * 2;
                            break;
                    }
                    break;
            }
            height /= canvas.scene.dimensions.distancePixels;
            if (!region.elevation.top) region.elevation.top = region.elevation.bottom + height;
            wrapped(...args);
            _templateContext.onFinish = this._finishPlacement.bind(this);
            canvas.regions.placeRegion(region, {});
        }

        async function placeRegion(wrapped, ...args) {
            if (!game.Levels3DPreview?._active) return wrapped(...args);
            const originalOn = canvas.stage.on;
            const toRemove = {};
            canvas.stage.on = (eventName, handler) => {
                let height = undefined;
                function listener(event) {
                    event.getLocalPosition = (obj) => canvas.app.renderer.events.pointer.getLocalPosition(obj) ?? {x: 0, y: 0, z: 0};
                    event.data = {};
                    event.data.getLocalPosition = (obj) => canvas.app.renderer.events.pointer.getLocalPosition(obj) ?? {x: 0, y: 0, z: 0};
                    handler(event);
                    if (!canvas.regions._placementContext?.preview?.document) return;
                    const document = canvas.regions._placementContext.preview.document;
                    const elevation = document.elevation;
                    height ??= elevation.top - elevation.bottom;
                    let bottom = canvas.app.renderer.events.pointer.getLocalPosition()?.z;
                    if (bottom === undefined) return;
                    const isNotCube = document.shapes[0].shape !== "rectangle";
                    if (isNotCube) bottom -= height / 2;
                    if (bottom != elevation.bottom) {
                        canvas.regions._placementContext.preview?.document?.updateSource({ elevation: { bottom, top: bottom + height } });
                    }
                }
                game.Levels3DPreview.renderer.domElement.addEventListener(eventName, listener);
                toRemove[eventName] = listener;
            }
            const result = await wrapped(...args);
            for (const [key, value] of Object.entries(toRemove)) {
                game.Levels3DPreview.renderer.domElement.removeEventListener(key, value);
            }
            if (_templateContext.onFinish) {
                _templateContext.onFinish({});
                _templateContext.onFinish = null;
            }
            canvas.stage.on = originalOn;
            return result;
        }

        function sceneTestSurfaceCollision(wrapped, ...args) {
            const [ origin2d, destination2d, options ] = args;
            const origin = {
                x: origin2d.x,
                y: origin2d.y,
                z: origin2d.elevation,
            }
            const destination = {
                x: destination2d.x,
                y: destination2d.y,
                z: destination2d.elevation,
            }
            if (!canvas?.scene?.flags["levels-3d-preview"]?.object3dSight) return wrapped(...args);
            if (!game.Levels3DPreview?._active) return wrapped(...args);
            if (!["move", "sight"].includes(options.type)) return wrapped(...args);
            const type = options.type === "sight" ? "sight" : "collision";
            if (options.mode === "any") {
                const collisionCore = wrapped(...args);
                const collision3d = !!game.Levels3DPreview.interactionManager.computeSightCollision(origin, destination, type);
                return collisionCore || collision3d;
            }
            if (options.mode === "all") {
                const collisions = [];
                collisions.push(...game.Levels3DPreview.interactionManager.computeSightCollision(origin, destination, type, false, true, false, true));
                collisions.push(...wrapped(...args));
                collisions.sort()
                return collisions;
            }
            if (options.mode === "closest") {
                const collisionCore = wrapped(...args);
                const collision3d = game.Levels3DPreview.interactionManager.computeSightCollision(origin, destination, type, false, true, false, false);
                if (!collision3d && !collisionCore) return false;
                if (!collision3d) return collisionCore;
                if (!collisionCore) return collision3d;
                const destinationCore = new THREE.Vector3(collisionCore.point.x, collisionCore.point.y, collisionCore.point.z);
                const destination3d = new THREE.Vector3(collision3d.x, collision3d.y, collision3d.z);
                if (origin.distanceTo(destinationCore) < origin.distanceTo(destination3d)) return collisionCore;
                return collision3d;
            }
            return wrapped(...args);
        }
    });
}
