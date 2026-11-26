import { Region3D } from "./entities/region3d.js";
import { Shape3D } from "./entities/shape3d.js";
import { getSetting } from "./settings/settingsConfig.js";
import * as THREE from "three";
import { applyShaderToRegion } from "./shaders/templateEffects.js";
import { pos3DToCanvas, centerElement } from "./helpers/coords3d.js";
import { registerFrameRateDisplay } from "./helpers/frameRate.js";
import { movementFloor } from "./helpers/elevationFloor.js";
import { testMoveCollision, walkStep, setMoveAction } from "./handlers/moveWalk.js";
import { registerAnimationSourceThrottle } from "./handlers/animationSourceThrottle.js";
import { registerRulerPathfinding } from "./systems/rulerPathfinding.js";

export function registerWrappers() {
    Object.defineProperty(foundry.canvas.placeables.Token.prototype, "object3d", {
        get: function () {
            return game.Levels3DPreview.tokens[this.id];
        },
    });

    Hooks.once("ready", async function () {
        //Register Core Wrappers
        registerFrameRateDisplay();

        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.TokenLayer.prototype.moveMany", moveMany, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.TokenLayer.prototype._prepareKeyboardMovementUpdates", prepareKeyboardMovementUpdates, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.TilesLayer.prototype.moveMany", moveManyTiles, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.groups.InterfaceCanvasGroup.prototype.createScrollingText", showBouncingText, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.TokenLayer.prototype.cycleTokens", cycleTokens, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.Canvas.prototype.animatePan", animatePan, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.perception.FogManager.prototype.save", updateFog, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.PlaceablesLayer.prototype.pasteObjects", pasteObjects, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.geometry.ClockwiseSweepPolygon.prototype._compute", computePolygonDispatch, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.documents.collections.Scenes.prototype.preload", preload3D, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.sources.PointLightSource.prototype._updateGeometry", lightGeometry, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.sources.PointVisionSource.prototype._updateGeometry", lightGeometry, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.groups.EffectsCanvasGroup.prototype.activateAnimation", activateLightAnimation, "MIXED");
        registerAnimationSourceThrottle();
        libWrapper.register("levels-3d-preview", "canvas.app.renderer.events.pointer.getLocalPosition", pointerPositionWrapper, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.layers.ControlsLayer.prototype.handlePing", HandlePing, "WRAPPER");
        libWrapper.register("levels-3d-preview", "canvas.regions.placeRegion", placeRegion, "MIXED");
        Hooks.on("preCreateRegion", applyPlacedRegionElevation);
        libWrapper.register("levels-3d-preview", "foundry.documents.Scene.prototype.testSurfaceCollision", sceneTestSurfaceCollision, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.documents.TokenDocument.prototype.getVisibilityTestPoints", getVisibilityTestPoints, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.documents.TokenDocument.prototype.getVisionOrigin", getVisionOrigin, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.geometry.ClockwiseSweepPolygon.prototype.contains", containsWrapper, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.perception.DetectionMode._testCollision", _testCollisionWrapped, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.placeables.Token.prototype._getDragWaypointPosition", getDragWaypointPosition, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.placeables.Token.prototype._finalizeDragLeft", finalizeDragLeft, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.placeables.Token.prototype._onDragLeftMove", onDragLeftMove, "MIXED");
        libWrapper.register("levels-3d-preview", "foundry.canvas.placeables.Token.prototype._prepareDragLeftDropUpdates", prepareDragLeftDropUpdates, "WRAPPER");
        libWrapper.register("levels-3d-preview", "foundry.canvas.placeables.Token.prototype._getMovementCollisionTestConfiguration", movementCollisionConfiguration, "WRAPPER");
        registerRulerPathfinding();
        for (const hook of ["canvasTearDown", "createTile", "updateTile", "deleteTile", "3DCanvasSceneReady", "3DCanvasBakeComplete"]) Hooks.on(hook, clearDragFloor);
        Hooks.on("updateSetting", (setting) => {
            if (setting.key === "levels-3d-preview.preventNegative") clearDragFloor();
        });

        if (game[game.system.id]?.canvas?.AbilityTemplate?.prototype?.drawPreview) libWrapper.register("levels-3d-preview", `game.${game.system.id}.canvas.AbilityTemplate.prototype.drawPreview`, placeTemplate, "MIXED");

        let testTarget;
        let testSource = null;
        function _testCollisionWrapped(wrapped, ...args) {
            const previousTarget = testTarget;
            const previousSource = testSource;
            testTarget = args[1];
            testSource = args[0];
            try {
                return wrapped(...args);
            } finally {
                testTarget = previousTarget;
                testSource = previousSource;
            }
        }

        function containsWrapper(wrapped, ...args) {
            const originalResult = wrapped(...args);
            
            if (originalResult || !game.Levels3DPreview?._active || !game.Levels3DPreview.object3dSight || !testTarget) return originalResult;
            if (this.config.type !== "sight" && this.config.type !== "move") return originalResult;
            if (this.config.source instanceof foundry.canvas.sources.GlobalLightSource) return originalResult;

            testTarget = null;
            return true;
        }

        function getVisionOrigin(wrapped, ...args) {
            const visionOrigin = wrapped(...args);
            const token3d = game.Levels3DPreview?._active ? this.object?.object3d : null;
            
            if (token3d) visionOrigin.elevation = token3d.losHeight;
            return visionOrigin;
        }

        function getVisibilityTestPoints(wrapped, ...args) {
            const testPoints = [];
            const tokenVisibility = getSetting("tokenVisibility");
            if (tokenVisibility === "off") return wrapped(...args);
            const token3d = game.Levels3DPreview?._active ? this.object?.object3d : null;

            if (!token3d) return wrapped(...args);

            const { visibleHeight: tokenHeight, document: { elevation, width, height } } = token3d;
            const gridSize = canvas.grid.size;
            const center = token3d.documentCenter;
            const origin = {
                x: center.x - width * gridSize / 2,
                y: center.y - height * gridSize / 2,
            };

            if (tokenVisibility !== "dynamic") {
                const tokenW = width * gridSize;
                const tokenH = height * gridSize;
                // Center point
                testPoints.push({ x: center.x, y: center.y, elevation: (elevation + tokenHeight / 2) });
                // Bottom square
                testPoints.push({ x: origin.x, y: origin.y, elevation: elevation });
                testPoints.push({ x: origin.x, y: origin.y + tokenH, elevation: elevation });
                testPoints.push({ x: origin.x + tokenW, y: origin.y, elevation: elevation });
                testPoints.push({ x: origin.x + tokenW, y: origin.y + tokenH, elevation: elevation });
                // Top square
                testPoints.push({ x: origin.x, y: origin.y, elevation: elevation + tokenHeight });
                testPoints.push({ x: origin.x, y: origin.y + tokenH, elevation: elevation + tokenHeight });
                testPoints.push({ x: origin.x + tokenW, y: origin.y, elevation: elevation + tokenHeight });
                testPoints.push({ x: origin.x + tokenW, y: origin.y + tokenH, elevation: elevation + tokenHeight });

                return testPoints;
            }

            for (let w = 0; w <= width; w++) {
                for (let h = 0; h <= height; h++) {
                    // Bottom square
                    testPoints.push({
                        x: origin.x + w * gridSize,
                        y: origin.y + h * gridSize,
                        elevation: elevation,
                    });
                    // Top square
                    testPoints.push({
                        x: origin.x + w * gridSize,
                        y: origin.y + h * gridSize,
                        elevation: elevation + tokenHeight,
                    });
                }
            }
            // Center points
            const centerPoints = Math.max(tokenHeight / canvas.dimensions.distance, 1);
            for (let d = 0; d < centerPoints; d++) {
                testPoints.push({
                    x: center.x,
                    y: center.y,
                    elevation: (elevation + tokenHeight / 2) + d * canvas.dimensions.distance,
                });
            }

            return testPoints;
        }

        async function HandlePing(wrapped, ...args) {
            if (!game.Levels3DPreview?._active) return wrapped(...args);
            const [user, position, options] = args;
            if (!canvas.ready || canvas.scene?.id !== options.scene || !position) return wrapped(...args);
            const token = canvas.tokens.placeables.find((t) => t.center.x == position.x && t.center.y == position.y);
            if (!token) return wrapped(...args);
            const color = user.color.css;
            const size = Math.max(token.document.width, token.document.height);
            const mesh = game.Levels3DPreview.tokens[token.id]?.mesh;
            if (!mesh) return wrapped(...args);
            const pos3d = mesh.position.clone();
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
            const position = game.Levels3DPreview?._active ? game.Levels3DPreview.interactionManager?.canvas2dMousePosition : null;
            if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return wrapped(...args);
            const out = args[1] ?? new PIXI.Point();
            out.x = position.x;
            out.y = position.y;
            out.z = position.z;
            out.elevation = position.elevation ?? position.z;
            return out;
        }

        function getDragWaypointPosition(wrapped, current, changes, options = {}) {
            const result = wrapped(current, changes, options);
            const interactionManager = game.Levels3DPreview?.interactionManager;
            const draggedToken = canvas.tokens?._draggedToken;
            if (!game.Levels3DPreview?._active || !interactionManager?._tokenDrag || !draggedToken || !result) return result;
            if (_dragFloor?.drag !== interactionManager._tokenDrag) _dragFloor = { drag: interactionManager._tokenDrag, floor: movementFloor() };
            const floor = _dragFloor.floor;
            if (changes?.elevation !== undefined) {
                interactionManager.forceFree = true;
                if (result.elevation < floor) result.elevation = floor;
                return result;
            }
            if (interactionManager.isTokenDragFree(this)) return result;
            const cursorElevation = interactionManager.canvas2dMousePosition?.z;
            if (!Number.isFinite(cursorElevation)) return result;
            let elevation = cursorElevation;
            if (this !== draggedToken) elevation = this.document._source.elevation + (cursorElevation - draggedToken.document._source.elevation);
            elevation = Math.max(elevation, floor);
            result.elevation = Math.round(elevation * 10) / 10;
            return result;
        }

        let _dragFloor = null;
        function clearDragFloor() {
            _dragFloor = null;
        }

        function movementCollisionConfiguration(wrapped, segment, ...args) {
            setMoveAction(segment?.action, segment);
            return wrapped(segment, ...args);
        }

        function finalizeDragLeft(wrapped, ...args) {
            clearDragFloor();
            const result = wrapped(...args);
            try {
                game.Levels3DPreview?.interactionManager?.onCoreDragEnd?.(this);
            } catch (e) {
                console.error(e);
            }
            return result;
        }

        function onDragLeftMove(wrapped, ...args) {
            const drag = game.Levels3DPreview?._active ? game.Levels3DPreview.interactionManager?._tokenDrag : null;
            if (drag && !drag.dispatching) return;
            return wrapped(...args);
        }

        function prepareDragLeftDropUpdates(wrapped, ...args) {
            const result = wrapped(...args);
            try {
                const interactionManager = game.Levels3DPreview?._active ? game.Levels3DPreview.interactionManager : null;
                const [updates, options] = result ?? [];
                if (!interactionManager?._tokenDrag || !Array.isArray(updates)) return result;
                const free = !!(interactionManager.isFreeMode || interactionManager.forceFree);
                for (const update of updates) {
                    if (options?.movement?.[update._id]?.planned) continue;
                    const document = this.layer.get(update._id)?.document;
                    if (!document) continue;
                    const token3d = game.Levels3DPreview.tokens[update._id];
                    if (token3d) token3d.wasFreeMode = free;
                    if ((document.getFlag("levels-3d-preview", "wasFreeMode") ?? false) === free) continue;
                    foundry.utils.setProperty(update, "flags.levels-3d-preview.wasFreeMode", free);
                }
            } catch (e) {
                console.error(e);
            }
            return result;
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
            const color = textData?.fill ? foundry.utils.Color.from(textData.fill).css : "white";
            bouncingText.style.color = color;
            bouncingText.style.fontSize = textData.fontSize + "px";

            centerElement(bouncingText, token3D.head);
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
            const stashWalls = () => {
                if (this.config?.type === "light") this._l3dWallPoints = this.points.slice();
            };
            if (useMultithreading) {
                _computePolygonMultithreaded.bind(this)(() => (wrapped(...args), stashWalls()), ...args);
            } else {
                _computePolygon.bind(this)(() => (wrapped(...args), stashWalls()), ...args);
            }
        }

        function getSourceElevation(source) {
            if (source?.object?.b !== undefined) return source.object.b;
            const object3d = source?.object?.object3d;
            if (object3d) return object3d.losHeight;
            // if (object3d) return object3d.visionSourceElevation;
            return source.elevation ?? 0;
        }

        function pendingPoints(origin) {
            const x = Math.round(origin?.x ?? 0);
            const y = Math.round(origin?.y ?? 0);
            return [x, y - 1, x + 1, y - 1, x + 1, y + 1, x, y + 1];
        }

        function _computePolygonMultithreaded(wrapped, ...args) {
            wrapped(...args);
            if (!game.Levels3DPreview?._ready || !game.Levels3DPreview?._active || !game.Levels3DPreview?.workers?._visionReady) {
                const object3dSight = canvas.scene.getFlag("levels-3d-preview", "object3dSight") ?? false;
                if (object3dSight) {
                    this.points = pendingPoints(this.origin);
                }
                return;
            }
            if (!game.Levels3DPreview?.object3dSight || !game.Levels3DPreview?.fogExploration || !this.config?.source?.object || this.config.source.object instanceof foundry.documents.Scene || this.config.type === "universal") return;
            const id = this.config.type + "." + this.config.source.object.id;
            const worker = game.Levels3DPreview.workers;
            worker.computeCounts[id] = (worker.computeCounts[id] ?? 0) + 1;
            this.points = pendingPoints(this.origin);
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
            const requestKey = JSON.stringify(message.config);
            if (lastComputed && worker.lastRequests[id] === requestKey) return;
            worker.lastRequests[id] = requestKey;
            worker.requestWorkerRaycast(message, (points) => {
                this.points = points;
                if (worker.lastRequests[id] !== requestKey) return;
                const object = this.config.source.object;
                const reinitialize = () => {
                    object.updatedByWorker = true;
                    if (object.initializeSources) object.initializeSources();
                    if (object.initializeLightSource) object.initializeLightSource();
                };
                if (!object.animationContexts?.size) reinitialize();
            });
        }

        function _computePolygon(wrapped, ...args) {
            wrapped(...args);
            if (!game.Levels3DPreview?._ready || !game.Levels3DPreview?._active) {
                const object3dSight = canvas.scene.getFlag("levels-3d-preview", "object3dSight") ?? false;
                if (object3dSight) {
                    this.points = pendingPoints(this.origin);
                }
                return;
            }
            if (!game.Levels3DPreview?.object3dSight || !game.Levels3DPreview?.fogExploration || this.config.source.object instanceof foundry.documents.Scene || this.config.type === "universal") return;
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

        function lightGeometry(wrapped) {
            if (!game.Levels3DPreview?._active || canvas.stage.renderable) return wrapped();
            const { x, y } = this.shape.origin;
            const r = Math.max(this.shape.config.radius ?? 0, 1);
            const square = new PIXI.Polygon([x - r, y - r, x + r, y - r, x + r, y + r, x - r, y + r]);
            this._geometry = new foundry.canvas.geometry.PolygonMesher(square, { x, y, radius: r, normalize: true }).triangulate(this._geometry);
            const bounds = new PIXI.Rectangle(-1, -1, 2, 2);
            if (this._geometry.bounds) this._geometry.bounds.copyFrom(bounds);
            else this._geometry.bounds = bounds;
        }

        function activateLightAnimation(wrapped, ...args) {
            if (!game.Levels3DPreview?._active || canvas.stage.renderable) return wrapped(...args);
            this.deactivateAnimation();
        }

        async function preload3D(wrapped, ...args) {
            const coreResult = wrapped(...args);
            const scene = this.get(args[0]);
            const helpers = game.Levels3DPreview?.helpers;
            if (!scene || !helpers?.preloadModel) return coreResult;
            const models3D = scene.tokens.map((t) => t.getFlag("levels-3d-preview", "model3d")).filter((m) => m);
            const tiles3D = scene.tiles.map((t) => t.getFlag("levels-3d-preview", "model3d")).filter((m) => m);
            const modelPromises = [];
            for (let model of models3D.concat(tiles3D)) {
                modelPromises.push(helpers.preloadModel(model).catch((e) => console.warn("3D Canvas: Failed to preload model", model, e)));
            }
            return Promise.all([coreResult, ...modelPromises]);
        }

        async function pasteObjects(wrapped, ...args) {
            if (!game.Levels3DPreview?._active) return await wrapped(...args);
            const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
            args[0].x = pos.x;
            args[0].y = pos.y;
            return await wrapped(...args);
        }

        function updateFog(wrapped, ...args) {
            const result = wrapped(...args);
            if (game.Levels3DPreview._active && game.Levels3DPreview.fogExploration) {
                game.Levels3DPreview.fogExploration.needsUpdate = true;
            }
            return result;
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

        function moveMany(wrapped, ...args) {
            const options = args[0] ?? {};
            if (!game.Levels3DPreview?._active || options.rotate || (!options.dx && !options.dy)) return wrapped(...args);
            const { x: dx, y: dy } = handleArrowKeys({ dx: options.dx ?? 0, dy: options.dy ?? 0 });
            const result = wrapped({ ...options, dx: dx || 0, dy: dy || 0 }, ...args.slice(1));
            game.Levels3DPreview.firstPerson?.watchMove(result, dx || 0, dy || 0);
            return result;
        }

        function prepareKeyboardMovementUpdates(wrapped, objects, dx, dy, dz, ...rest) {
            const result = wrapped(objects, dx, dy, dz, ...rest);
            try {
                if (!dz) game.Levels3DPreview?.firstPerson?.addFacing(result);
                const interactionManager = game.Levels3DPreview?._active ? game.Levels3DPreview.interactionManager : null;
                if (!interactionManager || dz || (!dx && !dy)) return result;
                const movement = result?.[1]?.movement;
                if (!movement) return result;
                const floor = movementFloor();
                for (const token of objects ?? []) {
                    const waypoint = movement[token.id]?.waypoints?.[0];
                    const token3d = game.Levels3DPreview.tokens[token.id];
                    if (!waypoint || !token3d) continue;
                    if (token3d.wasFreeMode || interactionManager.isTokenDragFree(token)) continue;
                    const center = token.document.getCenterPoint(waypoint);
                    const start = token.document.getCenterPoint(token.document._source);
                    const step = walkStep({ x: start.x, y: start.y, z: token.document.elevation }, { x: center.x, y: center.y, z: token.document.elevation });
                    if (step?.blocked) continue;
                    const walked = step?.elevation ?? null;
                    const from = { x: center.x, y: center.y, z: token3d.baseLosHeight ?? token.document.elevation };
                    const collision = walked === null ? interactionManager.computeSightCollision(from, { x: center.x, y: center.y, z: -100000 }, "move") : null;
                    if (walked === null && !collision) continue;
                    const elevation = walked ?? pos3DToCanvas(collision).elevation;
                    if (!Number.isFinite(elevation)) continue;
                    waypoint.elevation = Math.max(Math.round(elevation * 100) / 100, floor);
                }
            } catch (e) {
                console.error(e);
            }
            return result;
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
                if (token || dest instanceof foundry.documents.TokenDocument) {
                    game.Levels3DPreview.setCameraToControlled(token ?? dest);
                } else if (tile || dest instanceof foundry.documents.TileDocument) {
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
            const height = getRegionShapeHeight(region.shapes[0]);
            if (!region.elevation.top) region.elevation.top = region.elevation.bottom + height;
            wrapped(...args);
            _templateContext.onFinish = this._finishPlacement.bind(this);
            canvas.regions.placeRegion(region, {});
        }

        function getRegionShapeHeight(shape) {
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
            return height / canvas.scene.dimensions.distancePixels;
        }

        const _placedRegionElevations = [];
        const matchesPlacedShape = (shape, placed) => shape.type === placed.type && shape.x === placed.x && shape.y === placed.y;

        function recordPlacedRegionElevation({ document }) {
            const { bottom, top } = document._source.elevation;
            if (!Number.isFinite(bottom) || !Number.isFinite(top)) return;
            const { type, x, y } = document._source.shapes.at(-1);
            _placedRegionElevations.push({ type, x, y, bottom, top });
            if (_placedRegionElevations.length > 20) _placedRegionElevations.shift();
        }

        function applyPlacedRegionElevation(document, data, options, userId) {
            if (userId !== game.user.id || !_placedRegionElevations.length) return;
            const matches = _placedRegionElevations.filter((placed) => document._source.shapes.some((shape) => matchesPlacedShape(shape, placed)));
            if (!matches.length) return;
            for (const match of matches) _placedRegionElevations.splice(_placedRegionElevations.indexOf(match), 1);
            const { bottom, top } = document._source.elevation;
            if (bottom !== null || top !== null) return;
            document.updateSource({ elevation: { bottom: Math.min(...matches.map((m) => m.bottom)), top: Math.max(...matches.map((m) => m.top)) } });
        }

        async function placeRegion(wrapped, ...args) {
            if (!game.Levels3DPreview?._active) return wrapped(...args);
            const options = args[1] ?? {};
            const preConfirm = options.preConfirm;
            args[1] = {
                ...options,
                preConfirm: (context) => {
                    recordPlacedRegionElevation(context);
                    return preConfirm?.(context);
                },
            };
            const originalOn = canvas.stage.on;
            const toRemove = [];
            let appliedShader = false;
            let rightPress = null;
            let height = undefined;
            const placement = {
                offset: 0,
                surface: undefined,
                sync() {
                    const document = canvas.regions._placementContext?.preview?.document;
                    if (!document || placement.surface === undefined) return;
                    const elevation = document.elevation;
                    height ??= elevation.top - elevation.bottom;
                    if (!Number.isFinite(height)) height = getRegionShapeHeight(document.shapes[0]);
                    if (!Number.isFinite(height)) return;
                    let bottom = placement.surface + placement.offset;
                    const isNotCube = document.shapes[0].type !== "rectangle";
                    if (isNotCube) bottom -= height / 2;
                    if (bottom != elevation.bottom) {
                        document.updateSource({ elevation: { bottom, top: bottom + height } });
                        canvas.regions._placementContext.preview.renderFlags?.set({ refreshShapes: true });
                    }
                },
            };
            const interactionManager = game.Levels3DPreview.interactionManager;
            interactionManager._regionPlacement = placement;
            ui.notifications.info("levels3dpreview.controls.tips.regionPlacement", { localize: true });
            canvas.stage.on = (eventName, handler) => {
                function listener(event) {
                    event.getLocalPosition = (obj) => canvas.app.renderer.events.pointer.getLocalPosition(obj) ?? {x: 0, y: 0, z: 0};
                    event.data = {};
                    event.data.getLocalPosition = (obj) => canvas.app.renderer.events.pointer.getLocalPosition(obj) ?? {x: 0, y: 0, z: 0};
                    handler(event);
                    if (!canvas.regions._placementContext?.preview?.document) return;
                    const surface = canvas.app.renderer.events.pointer.getLocalPosition(canvas.stage)?.z;
                    if (surface === undefined) return;
                    placement.surface = surface;
                    placement.sync();
                    if (!appliedShader) {
                        applyShaderToRegion(canvas.regions._placementContext.preview?.document);
                        appliedShader = true;
                    }
                }
                const element = game.Levels3DPreview.renderer.domElement;
                const listen = (type, callback) => {
                    element.addEventListener(type, callback);
                    toRemove.push([type, callback]);
                };
                if (eventName !== "pointerdown") return listen(eventName, listener);
                listen(eventName, (event) => event.button === 0 && listener(event));
                listen("mousedown", (event) => {
                    if (event.button === 2) rightPress = { x: event.clientX, y: event.clientY, camera: game.Levels3DPreview.camera.position.clone() };
                });
                listen("mouseup", (event) => {
                    const press = rightPress;
                    if (event.button !== 2 || !press) return;
                    rightPress = null;
                    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5 || press.camera.distanceTo(game.Levels3DPreview.camera.position) > 0.01;
                    if (!moved) listener(event);
                });
            }
            try {
                return await wrapped(...args);
            } finally {
                if (interactionManager._regionPlacement === placement) interactionManager._regionPlacement = null;
                canvas.stage.on = originalOn;
                for (const [key, value] of toRemove) {
                    game.Levels3DPreview?.renderer?.domElement?.removeEventListener(key, value);
                }
                const onFinish = _templateContext.onFinish;
                _templateContext.onFinish = null;
                if (onFinish) onFinish({});
            }
        }

        function testDoorSight(origin, destination, wall) {
            const ownMesh = game.Levels3DPreview.walls[wall?.id]?.mesh;
            const hits = game.Levels3DPreview.interactionManager.computeSightCollision(origin, destination, "sight", false, true, false, true);
            if (!hits) return false;
            return hits.some((hit) => {
                for (let object = hit.object; object; object = object.parent) if (object === ownMesh) return false;
                return true;
            });
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
            const type = options.type === "sight" ? "sight" : "move";
            if (options.mode === "any") {
                const collisionCore = wrapped(...args);
                if (collisionCore || options.tMin >= options.tMax) return collisionCore;
                if (type === "move") return !!testMoveCollision(origin, destination);
                const interactionManager = game.Levels3DPreview.interactionManager;
                const door = interactionManager.visibilityThrottle?.currentObject;
                if (door instanceof foundry.canvas.containers.DoorControl) return testDoorSight(origin, destination, door.wall);
                return interactionManager.sightOccluders.test(origin, destination, testSource?.sourceId);
            }
            // Distance in canvas pixel space between the origin and an ElevatedPoint-like {x, y, elevation}
            const distancePixels = canvas.dimensions.distancePixels ?? (canvas.dimensions.size / canvas.dimensions.distance);
            const originVec = new THREE.Vector3(origin.x, origin.y, (origin.z ?? 0) * distancePixels);
            const distanceFromOrigin = (p) => originVec.distanceTo(new THREE.Vector3(p.x, p.y, (p.elevation ?? 0) * distancePixels));
            const toElevatedPoint = (point3d) => {
                const p = pos3DToCanvas(point3d);
                return { x: p.x, y: p.y, elevation: p.elevation };
            };
            if (options.mode === "all") {
                const collisionCore = wrapped(...args);
                const moveHit = type === "move" ? testMoveCollision(origin, destination) : null;
                const hits3d = type === "move" ? (moveHit ? [{ point: moveHit }] : []) : game.Levels3DPreview.interactionManager.computeSightCollision(origin, destination, type, false, true, false, true) || [];
                if (!Array.isArray(collisionCore) || !hits3d.length) return collisionCore;
                const collisions = [...collisionCore];
                for (const hit of hits3d) {
                    if (hit?.point) collisions.push(toElevatedPoint(hit.point));
                }
                collisions.sort((a, b) => distanceFromOrigin(a) - distanceFromOrigin(b));
                return collisions;
            }
            if (options.mode === "closest") {
                const collisionCore = wrapped(...args);
                const collision3d = type === "move" ? testMoveCollision(origin, destination) : game.Levels3DPreview.interactionManager.computeSightCollision(origin, destination, type, false, true, false, false);
                if (!collision3d) return collisionCore;
                const point3d = toElevatedPoint(collision3d);
                if (!collisionCore) return point3d;
                if (distanceFromOrigin(collisionCore) <= distanceFromOrigin(point3d)) return collisionCore;
                return point3d;
            }
            return wrapped(...args);
        }
    });
}
