import * as THREE from "three";
import { factor } from "../main.js";
import { posCanvasTo3d, pos3DToCanvas, unitsToPixels } from "../helpers/coords3d.js";
import * as coords3d from "../helpers/coords3d.js";
import { PlacementPreview3D } from "../systems/placementPreview3d.js";
import { GroupSelectHandler } from "./GroupSelectHandler.js";
import { TileCreationQueue } from "./TileCreationQueue.js";
import { computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { acceleratedRaycast } from "../three/acceleratedRaycast.js";
import { Note3D } from "../entities/note3d.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const DRAG_START_THRESHOLD_PX = 6;
const DOUBLE_CLICK_WINDOW_MS = 250;

function getSenseTypes() {
    return CONST.EDGE_SENSE_TYPES ?? CONST.WALL_SENSE_TYPES;
}

/**
 * Drop the cached collider clones of a tile so they are rebuilt on the next collision generation.
 */
export function invalidateTileColliders(tile3d) {
    if (tile3d) delete tile3d._taggedColliders;
}

/**
 * Get (or lazily create) a detached clone of a tagged child of a tile, used for raycasting.
 * Clones are cached per tile so collision generation does not re-clone every call; the world matrix
 * and geometry are re-synced from the source on every lookup so moving/animated parts (doors) stay correct.
 * The cache is rebuilt when the tile's `_collidersVersion` changes (undefined unless set elsewhere).
 */
function getTaggedColliderClone(tile3d, source) {
    let cache = tile3d._taggedColliders;
    if (!cache || cache.version !== tile3d._collidersVersion) {
        cache = tile3d._taggedColliders = { version: tile3d._collidersVersion, clones: new Map() };
    }
    let clone = cache.clones.get(source);
    if (!clone) {
        const ud = source.userData;
        source.userData = {};
        clone = source.clone(false);
        source.userData = ud;
        clone.userData = ud;
        cache.clones.set(source, clone);
    } else {
        if (source.geometry && clone.geometry !== source.geometry) clone.geometry = source.geometry;
        clone.userData = source.userData;
    }
    clone.matrixWorld.copy(source.matrixWorld);
    return clone;
}

export class InteractionManager {
    constructor(levels3dPreview) {
        this._draggable = null;
        this._parent = levels3dPreview;
        this._panKeys = {};
        this._gizmoEnabled = true;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.near = 0.1;
        //this.raycaster.firstHitOnly = true;
        this.sightRaycaster = new THREE.Raycaster();
        this.sightRaycaster.firstHitOnly = true;
        this._sightCollisions = {};
        this.mouse = new THREE.Vector2();
        this.mousemove = new THREE.Vector2();
        this.controls = levels3dPreview.controls;
        this.camera = levels3dPreview.camera;
        this.domElement = levels3dPreview.renderer.domElement;
        this.placementPreview = new PlacementPreview3D(levels3dPreview);
        this._tokenDrag = null;
        this._freeRuler = null;
        levels3dPreview.placementPreview = this.placementPreview;
        this.factor = levels3dPreview.factor;
        this.clicks = 0;
        this.lcTime = 0;
        this.controls.enableRotate = !this.isCameraLocked;
        this.forceSightCollisions = this.generateSightCollisions.bind(this);
        this.generateSightCollisions = foundry.utils.debounce(this.generateSightCollisions.bind(this), 100);
        this._downId = null;
        this.tileCreationQueue = new TileCreationQueue();
        //this.updateHoverObj = foundry.utils.debounce(this.updateHoverObj.bind(this), 100);
    }

    get scene() {
        return this._parent.scene;
    }

    get elevationTick() {
        return canvas.dimensions.size / canvas.dimensions.distance / this.factor;
    }

    get cursorPositionTo2D() {
        return {
            x: (this._currentMousePosition.x ?? 0) * factor,
            y: (this._currentMousePosition.y ?? 0) * factor,
        };
    }

    get activeLayerEntity() {
        return canvas.activeLayer?.options?.objectClass?.embeddedName;
    }

    generateSightCollisions(p0, p1) {
        const tileQuadtree = [];
        const wallsQuadtree = [];
        if (p0 && p1 && p0.x == p1.x && p0.y == p1.y) {
            p0 = null;
            p1 = null;
        }
        if (p0 && p1) {
            const rectX = Math.min(p0.x, p1.x);
            const rectY = Math.min(p0.y, p1.y);
            const rectW = Math.abs(p1.x - p0.x);
            const rectH = Math.abs(p1.y - p0.y);
            const rect = new PIXI.Rectangle(rectX, rectY, rectW, rectH);
            const wallsQuadtreeSet = canvas.walls.quadtree.getObjects(rect);
            const tileQuadtreeSet = canvas.tiles.quadtree.getObjects(rect);
            wallsQuadtreeSet.forEach((w) => wallsQuadtree.push(this._parent.walls[w.id]));
            tileQuadtreeSet.forEach((t) => tileQuadtree.push(this._parent.tiles[t.id]));
        }
        const collisionObjects = [];
        const sightObjects = [];
        const cameraObjects = [];
        const tiles = tileQuadtree.length ? tileQuadtree : Object.values(this._parent.tiles);
        const walls = wallsQuadtree.length ? wallsQuadtree : Object.values(this._parent.walls);
        for (let tile of tiles) {
            if (!tile || tile?.document?.hidden /*!tile?.mesh?.visible**/) continue;
            const mesh = tile.sightMesh ?? tile.mesh;
            if(!mesh) continue;
            if (tile.hasTags) {
                mesh.traverse((o) => {
                    const ud = o?.userData;
                    if (!ud?.collision && !ud?.sight && !ud?.cameraCollision) return;
                    const clone = getTaggedColliderClone(tile, o);
                    if (ud.collision) collisionObjects.push(clone);
                    if (ud.sight) sightObjects.push(clone);
                    if (ud.cameraCollision) cameraObjects.push(clone);
                });
            } else {
                if (tile.collision) collisionObjects.push(mesh);
                if (tile.sight) sightObjects.push(mesh);
                if (tile.cameraCollision) cameraObjects.push(mesh);
            }
        }
        for (let wall of walls) {
            if (!wall?.placeable) continue;
            if (wall.placeable.isDoor && wall.placeable.document.ds === CONST.WALL_DOOR_STATES.OPEN) continue;
            if (!wall.mesh?.visible && wall.isDisabledVisible === true) continue;
            // NONE and LIMITED do not block. PROXIMITY/DISTANCE depend on the source distance, which a static
            // collision list cannot express, so they are approximated as always blocking.
            const SENSE_TYPES = getSenseTypes();
            const sightType = wall.placeable.document.sight;
            if (sightType === SENSE_TYPES.NORMAL || sightType === SENSE_TYPES.PROXIMITY || sightType === SENSE_TYPES.DISTANCE) sightObjects.push(wall.mesh);
            if (wall.placeable.document.move === SENSE_TYPES.NORMAL) collisionObjects.push(wall.mesh);
        }
        if (this._parent.board) {
            sightObjects.push(this._parent.board);
            collisionObjects.push(this._parent.board);
        }

        this._sightCollisions = {
            move: collisionObjects,
            sight: sightObjects,
            camera: cameraObjects,
        };
        //if (!p0 && !p1) canvas.tokens.controlled.forEach((t) => t.updateSource());
    }

    computeSightCollision(v1, v2, type = "move", elongate = false, useDistance = true, useClipping = false, returnAll = false) {
        const origin = posCanvasTo3d(v1);
        const target = posCanvasTo3d(v2);
        return this.computeSightCollisionFrom3DPositions(origin, target, type, elongate, useDistance, useClipping, returnAll);
    }

    computeSightCollisionFrom3DPositions(origin, target, type, elongate, useDistance = true, useClipping = false, returnAll = false) {
        const rectp0 = { x: origin.x * factor, y: origin.z * factor };
        const rectp1 = { x: target.x * factor, y: target.z * factor };
        const direction = target.clone().sub(origin).normalize();
        const distance = useDistance ? origin.distanceTo(target) : Infinity;
        this.sightRaycaster.far = distance ?? Infinity;
        this.sightRaycaster.firstHitOnly = !useClipping;
        this.sightRaycaster.set(origin, direction);
        this.forceSightCollisions(rectp0, rectp1);
        let collisions = this.sightRaycaster.intersectObjects(this._sightCollisions[type] ?? this._sightCollisions["move"], true);
        if (!collisions.length) return false;
        if (useClipping && !returnAll) {
            collisions = collisions.filter((c) => c.point.y < (game.Levels3DPreview.BuildPanel._clipHeight ?? Infinity));
            if (!collisions.length) return false;
        }
        if (returnAll) return collisions;
        const collision = collisions[0];
        if (collision.distance > distance) return false;
        if (elongate) {
            return collision.point.add(direction.multiplyScalar(0.025));
        }
        return collision.point;
    }

    inMesh(point, mesh) {
        if (!mesh.geometry) mesh = mesh.children[0];
        const side = mesh.material.side;
        mesh.material.side = THREE.DoubleSide;
        const prevVisiblity = mesh.visible;
        mesh.visible = true;
        const origin = new THREE.Vector3(0, 0, 0);
        const direction = point.clone().sub(origin).normalize();
        const rcFar = this.raycaster.far;
        const rcFH = this.sightRaycaster.firstHitOnly;
        this.sightRaycaster.far = point.distanceTo(origin);
        this.sightRaycaster.set(origin, direction);
        this.sightRaycaster.firstHitOnly = false;
        const collisions = this.sightRaycaster.intersectObject(mesh, false);
        this.sightRaycaster.far = rcFar;
        this.sightRaycaster.firstHitOnly = rcFH;
        mesh.material.side = side;
        mesh.visible = prevVisiblity;
        if (collisions.length % 2 === 0) return false;
        return true;
    }

    activateListeners() {
        this.domElement.addEventListener("mousedown", this._onMouseDown.bind(this), false);
        //this.domElement.addEventListener("mousedown", this._onEnableRuler.bind(this), false);
        this.domElement.addEventListener("mouseup", this._onMouseUp.bind(this), false);
        this.domElement.addEventListener("pointerup", this._onPointerUp.bind(this), false);
        this.domElement.addEventListener("mousemove", this._onMouseMove.bind(this), false);
        this.domElement.addEventListener("wheel", this._onWheel.bind(this), false);
        this.domElement.addEventListener("drop", this._onDrop.bind(this));
        document.addEventListener("keydown", this._onKeyDown.bind(this));
        document.addEventListener("keyup", this._onKeyUp.bind(this));
        //add keydown event
    }

    initGroupSelect() {
        this.groupSelectHandler = new GroupSelectHandler(this._parent);
    }

    initTransformControls() {
        const ts = this._parent.transformControls;
        const snapSize = canvas.scene.dimensions.size / factor / 2;
        ts.setTranslationSnap(snapSize);
        ts.setRotationSnap(Math.PI / 4);
        ts.setScaleSnap(snapSize);
        ts.addEventListener("mouseUp", this._onTransformEnd.bind(this));
        ts.addEventListener("mouseDown", this._onTransformStart.bind(this));
    }

    _cacheKeybinds() {
        const panDown = game.keybindings.get("levels-3d-preview", "panDown");
        const panUp = game.keybindings.get("levels-3d-preview", "panUp");
        const panLeft = game.keybindings.get("levels-3d-preview", "panLeft");
        const panRight = game.keybindings.get("levels-3d-preview", "panRight");
        this._panKeys = {
            panDown: panDown.map((k) => k.key),
            panUp: panUp.map((k) => k.key),
            panLeft: panLeft.map((k) => k.key),
            panRight: panRight.map((k) => k.key),
        };
    }

    get allowedRulerDrag() {
        return ["Region", "MeasuredTemplate", "AmbientLight", "Tile", "AmbientSound"];
    }

    _onTransformStart(event) {
        this.controls.enabled = false;
        this.preventSelect = true;
        if (this.isCtrl) {
            const tilesToCreate = [];
            for (let tile of canvas.activeLayer?.controlled) {
                tilesToCreate.push(tile.document.toObject());
            }
            canvas.scene.createEmbeddedDocuments("Tile", tilesToCreate);
        }
    }

    _onTransformEnd() {
        this.controls.enabled = true;
        this.preventSelect = false;
        const object3d = this._parent.controlledGroup; //.userData.entity3D;
        if (!object3d) return;
        for (let child of object3d.children) {
            child.userData.entity3D.updateFromTransform();
        }
        //object3d.updateFromTransform();
    }

    setControlledGroup() {
        this.clearControlledGroup();
        if (!this.controlledGroupSetPosition()) return;
        const controlledGroup = this._parent.controlledGroup;
        const controls = this._parent.transformControls;
        if (this._gizmoEnabled) controls.attach(controlledGroup);
        for (let placeable of canvas.activeLayer?.controlled) {
            const tile3d = this._parent.tiles[placeable.id];
            if (!tile3d?.mesh) continue;
            const mesh = tile3d.mesh;
            canvas.activeLayer.controlled.length == 1 && mesh.rotation ? controlledGroup.rotation.copy(mesh.rotation) : controlledGroup.rotation.set(0, 0, 0);
            controlledGroup.attach(mesh);
        }
    }

    clearControlledGroup() {
        this.controls.enabled = true;
        this.preventSelect = false;
        const controlledGroup = this._parent.controlledGroup;
        while (controlledGroup.children.length) {
            const tile3d = controlledGroup.children[0].userData.entity3D;
            if (!tile3d) continue;
            this.removeFromcontrolledGroup(tile3d);
        }
        controlledGroup.rotation.set(0, 0, 0);
        controlledGroup.scale.set(1, 1, 1);
    }

    removeFromcontrolledGroup(object3d) {
        const mesh = object3d.mesh;
        this._parent.scene.attach(mesh);
    }

    controlledGroupSetPosition() {
        if (!canvas?.activeLayer?.controlled?.length) return false;
        const controlledGroup = this._parent.controlledGroup;
        let maxX = -Infinity,
            maxY = -Infinity,
            maxZ = -Infinity,
            minX = Infinity,
            minY = Infinity,
            minZ = Infinity;
        let count = 0;

        for (let placeable of canvas.activeLayer?.controlled) {
            const tile3d = this._parent.tiles[placeable.id];
            if (!tile3d) continue;
            const pos = tile3d.mesh?.position ?? tile3d.center;
            if (!pos) continue;
            count++;
            maxX = Math.max(maxX, pos.x);
            maxY = Math.max(maxY, pos.y);
            maxZ = Math.max(maxZ, pos.z);
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            minZ = Math.min(minZ, pos.z);
        }

        if (!count) return false;
        const center = new THREE.Vector3((maxX + minX) / 2, (maxY + minY) / 2, (maxZ + minZ) / 2);
        controlledGroup.position.copy(center);
        return true;
    }

    toggleGizmo() {
        this._gizmoEnabled = !this._gizmoEnabled;
        if (!this._gizmoEnabled) {
            this._parent.transformControls.detach();
        } else {
            if (canvas.activeLayer?.options.objectClass.name !== "Tile") return;
            Object.values(game.Levels3DPreview.tiles).forEach((tile3d) => {
                tile3d.updateControls();
            });
        }
    }

    isRulerDrag(event, intersectData) {
        if (ui.controls.tool.name == "ruler") return true;
        if (this.activeLayerEntity === "Tile" && (ui.controls.tool.name === "tile" || ui.controls.tool.name === "tile3dPolygon")) return true;
        if (this.currentHover?.embeddedName === this.activeLayerEntity) return false;
        if (this.isNoSelectDrag()) return false;
        if (ui.controls.tool.name === "select" && ui.controls.tool.name != "ruler") return false;
        if (!ui.controls.isRuler && !this.allowedRulerDrag.some((a) => a === this.activeLayerEntity)) return false;
        if (!this.mouseIntersection3DCollision({ x: event.clientX, y: event.clientY })?.length) return false;
        if (this.activeLayerEntity === "Tile" && ui.controls.tool.name != "tile") return false;
        return true;
    }

    isNoSelectDrag() {
        const currentControl = ui.controls.controls[ui.controls.control.name].tools.select
        if (!currentControl) return false;
        return this.currentHover?.embeddedName === this.activeLayerEntity;
    }

    _onEnableRuler(event) {
        if (event.which === 1) {
            const rulerObj = new THREE.Object3D();
            rulerObj.userData = {
                entity3D: {
                    updatePositionFrom3D: () => {
                        return true;
                    },
                    mesh: rulerObj,
                    elevation3d: 0,
                },
            };
            rulerObj.parent = rulerObj.userData.entity3D.mesh;
            if (this._gizmoEnabled && this.activeLayerEntity === "Tile") {
                this.clearControlledGroup();
                canvas.tiles.releaseAll();
            }
            this.toggleControls(false);
            const position = this.mouseIntersection3DCollision({ x: event.clientX, y: event.clientY });
            const intersectPos = position[0].point;
            rulerObj.position.set(intersectPos.x, intersectPos.y, intersectPos.z);
            this.draggable = rulerObj;
        } else if (event.which === 3 && this.draggable) {
            this.placementPreview.template = null;
            this.draggable = null;
        }
    }

    async _onDrop(event, dataTransfer = null) {
        if (!game.Levels3DPreview._active) return;
        event.preventDefault();
        // Try to extract the data
        let data = dataTransfer;
        if (!dataTransfer) {
            try {
                data = JSON.parse(event.dataTransfer.getData("text/plain"));
            } catch (err) {
                return false;
            }
        }
        try {
            const coord3d = data.coord3d ? pos3DToCanvas(data.coord3d) : this.screen3DtoCanvas2DWithCollision(event);
            data.x = coord3d.x;
            data.y = coord3d.y;
            data.elevation = coord3d.z;
            data.flags ??= {};

            const dropFunction = this._parent.CONFIG.INTERACTIONS.dropFunctions[data.type];

            if (!dropFunction) return ui.notifications.error(game.i18n.localize("levels3dpreview.errors.notarget"));

            const placeable = await dropFunction.bind(this)(event, data);
            if (placeable) placeable[0]?.object?.control({ releaseOthers: true });
        } catch (e) {
            console.error(e);
            ui.notifications.error(game.i18n.localize("levels3dpreview.errors.notarget"));
        }
    }

    get canDragStart() {
        if (!this.altControls) return false;
        if (ui.controls.tool.name !== "select") return false;
        if (this.activeLayerEntity === "Tile") {
            return this._gizmoEnabled;
        } else {
            return this.currentHover?.embeddedName !== this.activeLayerEntity;
        }
    }

    _onMouseDown(event) {
        if (this._parent.CONFIG.UI.windows.HeightmapPainter?.isPainting || ((this._parent.CONFIG.UI.windows.AssetBrowser?._hasSelected || this._parent.CONFIG.UI.windows.EffectBrowser?._hasSelected) && event.shiftKey)) {
            return canvas.tiles.releaseAll();
        }
        if (this._tokenDrag) return this._onTokenDragMouseDown(event);
        if (this._freeRuler) return this._onFreeRulerMouseDown(event);
        if (this._groupSelect && this.activeLayerEntity != "Region") return this.groupSelectHandler.startSelect(event);
        if (this.preventSelect) return;
        const downId = foundry.utils.randomID();
        this._downId = downId;
        const currentMousePos = { x: this.mousemove.x, y: this.mousemove.y };
        const groupSelectCandidate = !event.shiftKey && !event.ctrlKey && !event.altKey && event.which === 1 && this.canDragStart;
        if (groupSelectCandidate) {
            setTimeout(() => {
                const moveDelta = Math.abs(currentMousePos.x - this.mousemove.x) + Math.abs(currentMousePos.y - this.mousemove.y);
                if (this._downId !== downId || !this._leftDown || moveDelta < 0.03) return;
                this._downId = null;

                this._groupSelect = true;
                return this.groupSelectHandler.startSelect(event);
            }, 150);
        }
        if (event.which === 1 && canvas.tokens?.active) {
            setTimeout(() => {
                if (this.draggable || this._downId !== downId || !this._leftDown || (this.controls.mouseButtons.LEFT && this._upCameraPosition && this._downCameraPosition.distanceTo(this._upCameraPosition) > 0.01)) return;
                const moveDelta = Math.abs(currentMousePos.x - this.mousemove.x) + Math.abs(currentMousePos.y - this.mousemove.y);
                if (moveDelta > 0.1) return;
                this._downId = null;
                this._onMouseMove(null, true);
                if (event.shiftKey) {
                    game.Levels3DPreview.helpers.focusCameraToCursor();
                } else {
                    game.Levels3DPreview.helpers._ping();
                }
            }, foundry.canvas.interaction.MouseInteractionManager.LONG_PRESS_DURATION_MS + 250);
        }
        this._parent.stopCameraAnimation();
        this._downCameraPosition = this._parent.camera.position.clone();
        if (event.which === 1 && event.ctrlKey) canvas.activeLayer?.releaseAll();
        this.mousedown = true;
        if (event.which === 1) this._leftDown = true;
        if (event.which === 3) this._rightDown = true;
        this.mousePosition = { x: event.clientX, y: event.clientY };
        if (event.which !== 1 && event.which !== 3) return;
        this._onMouseMove(event, true);
        const intersectData = this.findMouseIntersect(event);
        const intersect = intersectData?.object;
        if (this._leftDown && this.activeLayerEntity === "Note" && ui.controls.tool.name === "journal") return Note3D.newNote(intersectData.point);
        if (this.isRulerDrag(event, intersectData)) this.toggleControls(false);
        if (!intersect || event.ctrlKey) return;
        if (intersect.userData?.entity3D?.embeddedName === this.activeLayerEntity && !(this._gizmoEnabled && this.activeLayerEntity === "Tile")) this.toggleControls(false);
        // A previous double click whose second mouseup never reached the canvas would leave clicks stuck: start over
        if (this.clicks >= 2 && !this.draggable) this.clicks = 0;
        this.clicks++;
        this._clickPressId = null;
        event.entity = intersect.userData.entity3D;
        event.intersectData = intersectData;
        event.intersect = intersect;
        event.position3D = intersectData.point;
        event.originalIntersect = intersectData?.originalObject;
        this.prevEventData = this.eventData ?? null;
        this.eventData = {
            entity: event.entity,
            position3D: event.position3D,
            intersect: event.intersect,
            originalIntersect: event.originalIntersect,
            intersectData: intersectData.intersectData,
        };
        if (event.which === 3 && (ui.controls.tool.name === "tile3dPolygon" || ui.controls.tool.name === "polygon")) {
            this.addWaypoint();
        } else {
            if (this.clicks === 1) {
                // The single click is dispatched on mouseup; here we only decide whether this press becomes a drag.
                // The drag starts either once the pointer moves past a small threshold (see _onMouseMove) or
                // if the button is still held after 250ms.
                const pressId = foundry.utils.randomID();
                this._clickPressId = pressId;
                this._clickButton = event.which;
                this._pendingDrag = null;
                if (event.which === 1) {
                    // Group select candidates keep the timer-only behaviour so the group select timer can take over
                    if (!groupSelectCandidate) this._pendingDrag = { id: pressId, event, intersectData, x: event.clientX, y: event.clientY };
                    setTimeout(() => {
                        if (this._clickPressId !== pressId || this._dragAttemptedPress === pressId) return;
                        this._pendingDrag = null;
                        if (!this.mousedown || this.clicks !== 1 || this.draggable) return;
                        this._dragAttemptedPress = pressId;
                        this.startDrag(event, intersectData);
                    }, 250);
                }
            } else {
                if (this.draggable) return this.cancelDrag();
                else event.which === 1 ? (this._triggerLeft2 = true) : (this._triggerRight2 = true);
                this.toggleControls(true);
            }
        }
    }

    set clicks(val) {
        this._clicks = val;
        if (val === 0) {
            this._triggerLeft = false;
            this._triggerRight = false;
            this._triggerLeft2 = false;
            this._triggerRight2 = false;
            this.prevEventData = null;
            this.eventData = null;
        }
    }

    get clicks() {
        return this._clicks;
    }

    get hasCameraMoved() {
        if (!this._downCameraPosition || !this._upCameraPosition) return false;
        return this._downCameraPosition.distanceTo(this._upCameraPosition) > 0.1;
    }

    _onMouseUp(event) {
        if (this._groupSelect) return this.groupSelectHandler.endSelect(event);
        if (this._tokenDrag) return this._onTokenDragMouseUp(event);
        if (this._freeRuler) return this._onFreeRulerMouseUp(event);
        if (event.which === 1) this._leftDown = false;
        if (event.which === 3) this._rightDown = false;
        if (!this._leftDown && !this._rightDown) this.toggleControls(true);
        this._upCameraPosition = this._parent.camera.position.clone();
        event.entity = this.eventData?.entity;
        event.intersect = this.eventData?.intersect;
        event.position3D = this.eventData?.position3D;
        event.originalIntersect = this.eventData?.originalIntersect;
        this._pendingDrag = null;
        const wasDragging = !!this.draggable;
        this.mousedown = false;
        if (!wasDragging) this._dispatchClicks(event);
        if (event.which !== 1) return;
        if (this.draggable) {
            // A drag started on movement can be released before the render loop computed a drag target
            if (!this.currentDragTarget) this.dragObject();
            if (!this.currentDragTarget) this.currentDragTarget = (this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable).position.clone();
            this.forceDraggablePosition(event);
            const entity3D = this.draggable?.userData?.entity3D;
            this.draggable.position.copy(this.currentDragTarget);
            this.placementPreview.placeShape();
            if (ui.controls.tool.name === "tile3dPolygon") {
                this.placementPreview.addSegment();
                this.placementPreview.createTile();
            } else {
                if (!entity3D.updatePositionFrom3D(event)) this.cancelDrag();
            }
            this.draggable = null;
            this.clicks = 0;
        }
        this.toggleControls(true, true);
    }

    /**
     * Dispatch click events on mouseup. The first click is dispatched immediately; a second mousedown within
     * DOUBLE_CLICK_WINDOW_MS of the first mouseup is a double click, dispatched on its mouseup
     * (like core Foundry, clickLeft fires before clickLeft2).
     */
    _dispatchClicks(event) {
        if (!this.clicks) return;
        if ((this.prevEventData && this.prevEventData.entity !== this.eventData?.entity) || this.hasCameraMoved) {
            this.clicks = 0;
            return;
        }
        if (this.clicks === 1) {
            // Close the double click window if no second press arrives in time
            const pressId = this._clickPressId;
            setTimeout(() => {
                if (this._clickPressId === pressId && this.clicks === 1) this.clicks = 0;
            }, DOUBLE_CLICK_WINDOW_MS);
            // Not a click press, a different button, held long enough to become a drag, or already dispatched
            if (!pressId || event.which !== this._clickButton || this._dragAttemptedPress === pressId || this._clickDispatchedPress === pressId) return;
            this._clickDispatchedPress = pressId;
            if (event.which === 1) this._onClickLeft(event);
            else if (event.which === 3) this._onClickRight(event);
            return;
        }
        if (this._triggerLeft2 && event.which === 1) this._onClickLeft2(event);
        else if (this._triggerRight2 && event.which === 3) this._onClickRight2(event);
        else return;
        this.clicks = 0;
    }

    updateHoverObj() {
        this._hoverobj = this._parent.scene.children.filter(this._collisionFilter);
    }

    updateHoverObjNoDebounce() {
        this._hoverobj = this._parent.scene.children.filter(this._collisionFilter);
    }

    _onMouseMove(event, force = false) {
        if (!this._canMouseMove && !force) return;
        this._canMouseMove = false;
        if (event) {
            this.domMousePosition = { x: event.clientX, y: event.clientY };
            this.mousemove.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mousemove.y = -(event.clientY / window.innerHeight) * 2 + 1;
            if (this._tokenDrag) this._tokenDrag.manualPoint = null;
            if (this._pendingDrag) this._checkPendingDrag(event);
        }
        if (this.draggable) return;
        this.updateHoverObj();
        const intersect = this.getHoverObject();
        if (intersect) this._mouseHoverIntersect = intersect;
        const object = intersect?.object;
        //Handle placeable hover event
        if (!event) return;
        if (intersect?.point) {
            this.canvas2dMousePosition = pos3DToCanvas(intersect.point);
            canvas.mousePosition = this.canvas2dMousePosition;
            this.canvas3dMousePosition = intersect.point;
        }
        if (object && object?.userData?.entity3D?.placeable) {
            if (this.currentHover?.placeable?.id !== object?.userData?.entity3D?.placeable?.id) this.currentHover?._onHoverOut(event);
            if (this.currentHover !== object.userData.entity3D) {
                this.currentHover = object.userData.entity3D;
                this.currentHover._onHoverIn(event);
            }
        } else {
            this.currentHover?._onHoverOut(event);
            this.currentHover = null;
        }
        if (canvas.activeLayer?.hover && this.currentHover?.placeable?.id !== canvas.activeLayer?.hover?.id) {
            try {
                canvas.activeLayer?.hover._onHoverOut(event);
            } catch (e) {}
        }

        if (game.user.hasPermission("SHOW_CURSOR")) {
            this.broadcastCursorPosition(intersect?.point);
        }

        if (this._groupSelect) this.groupSelectHandler.updateSelect(event);
    }

    /**
     * Start a pending drag as soon as the pointer has moved far enough from where the button was pressed,
     * instead of waiting for the 250ms hold timer.
     */
    _checkPendingDrag(event) {
        const pending = this._pendingDrag;
        if (this._clickPressId !== pending.id || !this.mousedown || this.clicks !== 1 || this.draggable || this._groupSelect) {
            this._pendingDrag = null;
            return;
        }
        if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_START_THRESHOLD_PX) return;
        this._pendingDrag = null;
        this._dragAttemptedPress = pending.id;
        this.startDrag(pending.event, pending.intersectData);
    }

    _clippingFilter(i) {
        const camera = game.Levels3DPreview.camera;
        let entity3D = i.object?.userData?.entity3D;
        if (!entity3D)
            i.object.traverseAncestors((parent) => {
                if (parent.userData.entity3D && !entity3D) entity3D = parent.userData.entity3D;
            });
        const isClippingShader = entity3D?.shaders?.clipping?.enabled && canvas.tokens?.controlled?.length;
        if (!i.object.material?.clippingPlanes && camera.near === 0.01 && !isClippingShader) return true;
        const distToCamera = i.point.distanceTo(camera.position);
        if (distToCamera < camera.near) return false;
        if (!i.object.material?.clippingPlanes && !isClippingShader) return true;
        if (isClippingShader) {
            const t3d = game.Levels3DPreview.tokens[canvas.tokens.controlled[0].id];
            const tY = t3d.mesh?.position?.y;
            const yConstant = tY + entity3D.shaders.clipping.heightOffset / factor;
            return yConstant > i.point.y;
        } else {
            return i.object.material?.clippingPlanes[0].constant > i.point.y;
        }
    }

    getHoverObject() {
        if (!this._hoverobj || !this._hoverobj.length) this._hoverobj = this._parent.scene.children.filter(this._collisionFilter);
        this.raycaster.setFromCamera(this.mousemove, this.camera);
        let intersects = this.raycaster.intersectObjects(this._hoverobj, true).filter(this._clippingFilter);
        if (intersects.length) intersects = intersects.filter((i) => !i.object?.userData?.ignoreHover);
        if (!intersects.length) return null;
        let parentInt;
        if (!intersects[0].object.userData.entity3D)
            intersects[0].object.traverseAncestors((parent) => {
                if (parent.userData.entity3D && !parentInt) parentInt = parent;
            });
        return {
            object: parentInt ?? intersects[0].object,
            point: intersects[0].point,
            intersect: intersects[0],
        };
    }

    _collisionFilter(object) {
        const _this = game.Levels3DPreview.interactionManager;
        if (object.userData.ignoreHover) return false;
        if (!canvas.activeLayer) return true;
        if (object.userData?.entity3D && _this.activeLayerEntity !== object.userData?.entity3D?.embeddedName && object.userData?.entity3D?.embeddedName !== "Note" && object.userData?.entity3D?.embeddedName !== "Tile") return false;
        if (object.userData?.entity3D && _this.activeLayerEntity !== "Tile" && object.userData?.entity3D?.embeddedName === "Tile" && !object.userData?.entity3D?.collision) return false;
        if (!object.visible) return false;
        return true;
    }

    _onWheel(event) {
        this._parent.stopCameraAnimation();
        if (this._tokenDrag) return this._onTokenDragWheel(event);
        if (this._freeRuler) return this._onFreeRulerWheel(event);
        if (this.draggable) {
            const delta = Math.sign(event.deltaY);
            const entity3D = this.draggable.userData.entity3D;
            const isTemplate = !!entity3D.template;
            const changeElevation = () => {
                this.forceFree = true;
                entity3D.wasFreeMode = true;
                let elevationDiff = canvas.scene.dimensions.distance;
                if (event.shiftKey) elevationDiff = canvas.scene.dimensions.distance / 5;
                if (event.ctrlKey && !isTemplate) elevationDiff = canvas.scene.dimensions.distance / 50;
                entity3D.elevation3d += -delta * this.elevationTick * elevationDiff;
                if (game.settings.get("levels-3d-preview", "preventNegative") && entity3D.elevation3d < unitsToPixels(canvas.primary.background.elevation)) {
                    entity3D.elevation3d = unitsToPixels(canvas.primary.background.elevation);
                }
            };
            if (isTemplate) {
                if (event.altKey) entity3D.onTilt(delta);
                else if (event.ctrlKey) changeElevation();
                else entity3D.onRotate(delta);
            } else {
                changeElevation();
            }
        }
        if (canvas.regions._placementContext) {
            event.delta = event.deltaY;
            canvas.regions._onMouseWheel(event);
            return;
        }
        const isSpecialKey = this.tiltX || this.tiltZ || this.scaleWidth || this.scaleHeight || this.scaleGap || this.scaleScale || this.scale;
        const dBig = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 60 : 45;
        let snap = event.shiftKey ? dBig : 15;
        const delta = Math.sign(event.deltaY) * snap;
        if (!this.draggable && event.ctrlKey && !isSpecialKey && !event.altKey && canvas.activeLayer?.controlled.length) {
            canvas.activeLayer?.rotateMany({ delta, snap });
        }
        if (!this.draggable && isSpecialKey && event.ctrlKey && canvas.activeLayer?.controlled.length) {
            let updates = [];
            const multi = Math.sign(event.deltaY) < 0 ? 1.1 : 0.9;
            const gridS = -Math.sign(event.deltaY) * canvas.grid.size;
            for (let placeable of canvas.activeLayer?.controlled) {
                const width = placeable.document.width;
                const height = placeable.document.height;
                const gap = placeable.document.getFlag("levels-3d-preview", "gap") ?? 0;
                const tileScale = placeable.document.getFlag("levels-3d-preview", "tileScale") ?? 1;
                const isTiled = placeable.document.getFlag("levels-3d-preview", "fillType") === "tile";
                const tiltX = placeable.document.getFlag("levels-3d-preview", "tiltX") ?? 0;
                const tiltZ = placeable.document.getFlag("levels-3d-preview", "tiltZ") ?? 0;
                const newWidth = isTiled ? width + gridS - ((width + gridS) % gridS) : width * multi;
                const newHeight = isTiled ? height + gridS - ((height + gridS) % gridS) : height * multi;
                const newTiltX = tiltX + delta;
                const newTiltZ = tiltZ + delta * -1;
                const update = {
                    _id: placeable.id,
                    width: this.scaleHeight ? width : newWidth,
                    height: this.scaleWidth ? height : newHeight,
                    x: isTiled ? placeable.document.x : placeable.document.x - (newWidth - width) / 2,
                    y: isTiled ? placeable.document.y : placeable.document.y - (newHeight - height) / 2,
                    flags: {
                        "levels-3d-preview": {
                            gap: this.scaleGap ? gap + gridS / factor / 5 : gap,
                            tileScale: Math.max(0.00001, this.scaleScale ? tileScale * multi : tileScale),
                            tiltX: this.tiltX ? newTiltX : tiltX,
                            tiltZ: this.tiltZ ? newTiltZ : tiltZ,
                        },
                    },
                };
                if (!this.scale && !this.scaleHeight && !this.scaleWidth) {
                    update.width = width;
                    update.height = height;
                    update.x = placeable.document.x;
                    update.y = placeable.document.y;
                }
                updates.push(update);
            }
            canvas.scene.updateEmbeddedDocuments(this.activeLayerEntity, updates);
        }
    }

    startDrag(event, intersectData) {
        if (ui.controls.tool.name === "ruler" && CONFIG.Canvas.rulerClass.canMeasure) return this.startFreeRuler(event, intersectData);
        if (this.isRulerDrag(event, intersectData)) return this._onEnableRuler(event);
        const entity = event.entity;
        if (!entity || entity.isCaptured) return this.abortDrag();
        if (this._gizmoEnabled && this.activeLayerEntity === "Tile") return this.abortDrag();
        let intersect = event.intersect;
        const placeable = entity.placeable;
        if (!placeable?.controlled && placeable) placeable.control({ releaseOthers: true });
        if (canvas.activeLayer?.controlled.some((p) => p?.document?.locked)) return this.abortDrag();
        const isOwner = game.user.isGM || placeable?.isOwner || placeable?.document?.isOwner;
        if (!isOwner) return this.abortDrag();
        if (!entity.draggable || entity.mesh.userData?.entity3D?.embeddedName !== this.activeLayerEntity) return this.abortDrag();
        if (entity.mesh.userData?.entity3D?.embeddedName == "Tile") {
            this.setControlledGroup();
            if (!entity.mesh?.userData?.isTransformControls) {
                intersect = this._parent.controlledGroup;
            }
        }
        if (entity.token) {
            if (!this.startTokenDrag(entity, event, intersect)) return this.abortDrag();
            return;
        }
        entity.isAnimating = false;
        entity.setPosition?.();
        this.draggable = intersect;
        const target = intersect.userData?.isHitbox ? intersect.parent : intersect;
        const base = this._dragSurfaceIntersect(this.isFreeMode || this.forceFree)?.point;
        if (base && target?.position) this._dragOffset = new THREE.Vector3(target.position.x - base.x, 0, target.position.z - base.z);
        this.toggleControls(false);
    }

    _dragSurfaceIntersect(isFree) {
        const geometries = this._collisionGeometries ?? [];
        this.raycaster.setFromCamera(this.mousemove, this.camera);
        let intersects = this.raycaster.intersectObjects(geometries.length && !isFree ? geometries : [this.dragplane], true).filter(this._clippingFilter);
        if (!intersects?.length) intersects = this.raycaster.intersectObjects([this.dragplane], true);
        return intersects[0] ?? null;
    }

    abortDrag() {
        this.draggable = null;
        this.clicks = 0;
        this.toggleControls(true, true);
    }

    _onClickLeft(event) {
        if (ui.controls.isRuler || this.draggable) return;
        const entity = event.entity;
        if ((entity?.tile && canvas.activeLayer?.options.objectClass.name !== "Tile" && !entity?.isDoor && !event?.originalIntersect?.userData?.isDoor) || !entity) {
            if (this._downCameraPosition.distanceTo(this._upCameraPosition) < 0.01 && game.settings.get("core", "leftClickRelease")) canvas.activeLayer?.releaseAll();
        }
        if (entity?.placeable?.document?.locked) return;
        if (!entity) return;
        const intersect = event.intersect;
        this.handleTriggerHappy(entity);
        entity._onClickLeft(event);
        if (event.altKey || !this.mousedown || !(entity.isOwner || game.user.isGM)) {
            this.toggleControls(true, true);
        }
    }

    _onClickRight(event) {
        const entity = event.entity;
        if (!entity) return;
        const intersect = event.intersect;
        if (entity.type === "Wall") {
            entity._onClickRight(event);
            return this.toggleControls(true);
        }
        if (this.draggable) return this.cancelDrag();
        else (entity.isOwner || game.user.isGM) && entity._onClickRight(event);
        this.toggleControls(true);
    }

    _onClickLeft2(event) {
        const entity = event.entity;
        if (!entity) return;
        if (entity?.placeable?.document?.locked) return;
        entity._onClickLeft2(event);
    }

    _onClickRight2(event) {
        const entity = event.entity;
        if ((entity?.tile && canvas.activeLayer?.options.objectClass.name !== "Tile" && !entity?.isDoor && !event?.originalIntersect?.userData?.isDoor) || !entity) {
            if (this._downCameraPosition.distanceTo(this._upCameraPosition) < 0.01) game.Levels3DPreview.GameCamera.moveCameraToCursor();
        }
        if (!entity) return;
        entity._onClickRight2(event);
    }

    _onKeyDown(event) {
        if (event.key === "Escape" && this._freeRuler) this.endFreeRuler();
        if (event.ctrlKey) {
            this.isCtrl = true;
            this.controls.enableZoom = false;
        }
    }

    _onKeyUp(event) {
        // Ignore releases of other keys while Control is still held
        if (event.key !== "Control" && event.ctrlKey) return;
        this.isCtrl = false;
        if (!this.draggable) this.controls.enableZoom = true;
    }

    getObstructingTiles() {
        const obstructing = new Map();
        const boxCenter = new THREE.Vector3(0, 0, 0);
        const selectedToken = this._parent.tokens[canvas.tokens.controlled[0]?.id];
        if (!selectedToken) return obstructing;
        const position = selectedToken.head;
        const cameraTokenDistance = this._parent.camera.position.distanceTo(position);
        const cameraTokenMidPoint = new THREE.Vector3().addVectors(this._parent.camera.position, position).divideScalar(2);
        const cameraTokenSphere = new THREE.Sphere(cameraTokenMidPoint, cameraTokenDistance / 2);
        const collisions = this.computeSightCollisionFrom3DPositions(position, this._parent.camera.position, "sight", false, true, false, true) || [];
        const collisionSpheres = [];
        for (const collision of collisions) {
            let tile3d = collision.object.userData.entity3D;
            if (!tile3d)
                collision.object.traverseAncestors((parent) => {
                    if (parent.userData.entity3D && !tile3d) tile3d = parent.userData.entity3D;
                });
            if (!tile3d.shaders?.clipping?.diameter) continue;
            const collisionSphere = new THREE.Sphere(collision.point, 10);
            collisionSpheres.push(collisionSphere);
            obstructing.set(tile3d, new THREE.Vector4(collision.point.x, collision.point.y, collision.point.z, 1));
        }
        const tiles = Object.values(this._parent.tiles);
        if (!collisionSpheres.length) return obstructing;
        for (const tile of tiles) {
            if (obstructing.has(tile)) continue;
            const tileBox = tile._worldBoundingBox;
            if (!cameraTokenSphere.intersectsBox(tileBox)) continue;
            tileBox.getCenter(boxCenter);
            const boxSphereIntersect = collisionSpheres.reduce((prev, curr) => (prev.center.distanceTo(boxCenter) < curr.center.distanceTo(boxCenter) ? prev : curr));
            if (boxSphereIntersect) obstructing.set(tile, new THREE.Vector4(boxSphereIntersect.center.x, boxSphereIntersect.center.y, boxSphereIntersect.center.z, 1));
        }

        return obstructing;
    }

    findCameraLookatDistance() {
        const screenCenter = new THREE.Vector2(-0.1, +0.1);
        this.raycaster.setFromCamera(screenCenter, this.camera);
        let targets = this._sightCollisions?.sight;
        if (!targets?.length) targets = [this._parent.board, this._parent.table].filter(Boolean);
        const intersects = this.raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            return intersects[0].distance;
        } else {
            return 10;
        }
    }

    findMouseIntersect(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        let intersectTargets = [];
        for (let child of this.scene.children.concat(this._parent.controlledGroup.children)) {
            if (this.activeLayerEntity !== child.userData?.entity3D?.embeddedName && child.userData?.entity3D?.embeddedName !== "Wall" && child.userData?.entity3D?.embeddedName !== "Tile" && child.userData?.entity3D?.embeddedName !== "Note") continue;
            if (!child.visible) continue;
            if (this.activeLayerEntity !== "Tile" && child.userData?.entity3D?.embeddedName === "Tile" && !child.userData?.entity3D?.collision && !child.userData?.entity3D?.isDoor) continue;
            if (child.userData?.hitbox && child.userData.interactive) intersectTargets.push(child.userData.hitbox);
        }

        const board = this._parent.board;
        if (board) intersectTargets.push(board);
        const buildPlane = this._parent.grid?.secondaryGrid;
        if (buildPlane) intersectTargets.push(buildPlane);
        const table = this._parent.table;
        if (table) intersectTargets.push(table);
        const intersects0 = this.raycaster.intersectObjects(intersectTargets, true);
        const intersects1 = intersects0.filter(this._clippingFilter);
        const intersects = intersects1.filter((i) => !i?.object?.userData?.noIntersect);
            // .filter(this._clippingFilter)
            // .filter((i) => !i?.object?.userData?.noIntersect);
        const originalObject = intersects.length > 0 ? intersects[0].object : null;
        if (!intersects.length) return null;
        for (let int of intersects) {
            let actualObject;
            if (int.object.userData.ignoreIntersect) continue;
            if (!int.object.userData.entity3D)
                int.object.traverseAncestors((parent) => {
                    if (parent.userData.entity3D && !actualObject) actualObject = parent;
                });
            int.object = actualObject ?? int.object;
        }
        let intersect = intersects.find((i) => i.object?.userData?.entity3D?.token) ?? intersects[0];
        const controlledGroup = this._parent.controlledGroup;
        if (intersect?.object?.parent === controlledGroup) intersect.object = controlledGroup;
        return {
            object: intersect?.object,
            point: intersect?.point,
            originalObject: originalObject,
            intersectData: intersect,
        };
    }

    set draggable(object) {
        this._lockTemplateElevation = false;
        this._draggable = object;
        this._dragOffset = null;
        const center = this._parent.canvasCenter;
        if (object) {
            this.currentDragTarget = null;
            this.buildCollisionGeos();
            this.forceFree = object.userData.entity3D.wasFreeMode;
            this._dragOriginY = (object.userData.isHitbox ? object.parent : object).position.y;
            this.dragplane.position.set(center.x, object.userData.entity3D.mesh.position.y, center.z);
        } else {
            this.forceFree = false;
            this._dragOriginY = undefined;
            this.dragplane.position.set(center.x, -99999999, center.z);
        }
        if (this.placementPreview) this.placementPreview.object = object?.userData?.entity3D?.token ? null : object;
    }

    get draggable() {
        return this._draggable;
    }

    buildCollisionGeos(dId) {
        const draggableId = this.draggable?.userData?.entity3D?.token?.id ?? dId;
        const collisionObjects = Object.values(this._parent.tokens)
            .filter((t) => t.collisionPlane && t.token.id != draggableId)
            .map((t) => t.model);
        let collisionGeometries = collisionObjects;
        const cgIds = this._parent.controlledGroup.children.map((c) => c.userData.entity3D.placeable.id);
        for (let tile of Object.values(this._parent.tiles)) {
            if (!tile?.mesh?.visible) continue;
            if (cgIds.includes(tile.placeable.id)) continue;
            if (tile.hasTags) {
                tile.mesh.traverse((o) => {
                    if (o?.userData?.collision) collisionGeometries.push(getTaggedColliderClone(tile, o));
                });
            } else {
                if (!tile.collision && draggableId) continue;
                collisionGeometries.push(tile.mesh);
            }
        }
        for (let wall of Object.values(this._parent.walls)) {
            if (wall.placeable.isDoor && wall.placeable.document.ds === CONST.WALL_DOOR_STATES.OPEN && this.draggable) continue;
            if (!wall.mesh.visible) continue;
            collisionGeometries.push(wall.mesh);
        }
        const board = this._parent.board;
        if (board) collisionGeometries.push(board);
        const buildPlane = this._parent.grid?.secondaryGrid;
        if (buildPlane) collisionGeometries.push(buildPlane);
        const table = this._parent.table;
        if (table) collisionGeometries.push(table);
        collisionGeometries = collisionGeometries.filter((g) => g);
        this._collisionGeometries = collisionGeometries;
    }

    toggleControls(toggle, reset = false) {
        this.controls.enableRotate = !this.isCameraLocked && toggle;
        this.controls.enableZoom = toggle;
        if (reset) this.draggable = undefined;
    }

    get isCameraLocked() {
        return false;
    }

    screen3DtoCanvas2D(screenPosition) {
        screenPosition.x = (screenPosition.x / window.innerWidth) * 2 - 1;
        screenPosition.y = -(screenPosition.y / window.innerHeight) * 2 + 1;
        screenPosition = new THREE.Vector2(screenPosition.x, screenPosition.y);
        this.raycaster.setFromCamera(screenPosition, this.camera);
        const intersects = this.raycaster.intersectObjects([this.dragplane], true);
        return intersects.length > 0 ? pos3DToCanvas(intersects[0].point) : undefined;
    }

    screen3DtoCanvas2DWithCollision(event) {
        const intersect = this.findMouseIntersect(event);
        const pos = intersect ? pos3DToCanvas(intersect.point) : undefined;
        return pos;
    }

    mouseIntersection3DCollision(screenPosition, build = true, dId = undefined) {
        if (build || !this._collisionGeometries || !this._collisionGeometries.length) this.buildCollisionGeos(dId);
        let collisionGeometries = this._collisionGeometries;
        if (screenPosition) {
            this.mousemove.x = (screenPosition.x / window.innerWidth) * 2 - 1;
            this.mousemove.y = -(screenPosition.y / window.innerHeight) * 2 + 1;
        }
        this.raycaster.setFromCamera(this.mousemove, this.camera);
        const intersects = this.raycaster.intersectObjects(collisionGeometries, true);
        return intersects;
    }

    mousePostionToWorld() {
        this.raycaster.setFromCamera(this.mousemove, this.camera);
        const intersects = this.raycaster.intersectObjects([this.dragplane], true);
        if (intersects.length > 0) {
            return intersects[0].point;
        } else {
            return new THREE.Vector3(0, 0, 0);
        }
    }

    dragObject() {
        if (this._tokenDrag) return this.updateTokenDrag();
        if (this._freeRuler) return this.updateFreeRuler();
        if (!this.draggable) return;
        if (this.groupSelectHandler._isSelecting) this.groupSelectHandler.endSelect();
        const target = this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable;
        const isFree = this.isFreeMode || this.forceFree || (this.draggable.userData.entity3D.template && this.draggable.userData.entity3D.wasFreeMode);
        this.draggable.userData.entity3D.wasFreeMode = isFree;
        const center = this._parent.canvasCenter;
        if (this.draggable.userData.entity3D.mesh.position.y < 0) {
            this.dragplane.position.set(center.x, this.draggable.userData.entity3D.mesh.position.y, center.z);
        }

        const intersect = this._dragSurfaceIntersect(isFree);
        if (intersect) {
            const entity3D = this.draggable.userData.entity3D;
            if (this._parent.CONFIG.UI.windows.RoomBuilder && ui.controls.tool.name == "tile") {
                intersect.point.y = this.placementPreview.origin?.y ?? this._dragOriginY ?? intersect.point.y;
            }
            const offset = this._dragOffset;
            this.currentDragTarget = new THREE.Vector3(intersect.point.x + (offset?.x ?? 0), !isFree ? intersect.point.y : entity3D.elevation3d, intersect.point.z + (offset?.z ?? 0));
            const distance = target.position.distanceTo(this.currentDragTarget);
            let lerpFactor = 1 / (1 + distance * 20);
            if (lerpFactor < 0.1) lerpFactor = 0.1;
            this.canvas2dMousePosition = pos3DToCanvas(this.currentDragTarget);
            canvas.mousePosition = this.canvas2dMousePosition;
            this.canvas3dMousePosition = this.currentDragTarget.clone();
            target.position.lerp(this.currentDragTarget, lerpFactor);
            if (!isFree) {
                entity3D.elevation3d = intersect.point.y;
                this.dragplane.position.set(center.x, intersect.point.y, center.z);
            }
            if (entity3D.template) entity3D.onMove();
            this.updateDragMeasure();
        }
    }

    forceDraggablePosition(event) {
        const target = this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable;
        target.position.copy(this.currentDragTarget);
        this.updateDragMeasure();
    }

    updateDragMeasure() {
        if (this.placementPreview.active) this.placementPreview.update();
    }

    addWaypoint() {
        const drag = this._tokenDrag;
        if (drag) {
            if (!drag.token.ruler || !this.canvas2dMousePosition) return false;
            drag.token._addDragWaypoint(this.canvas2dMousePosition, { snap: !game.keyboard.isModifierActive("Shift") });
            return true;
        }
        if (this.placementPreview.active) return this.placementPreview.addSegment();
        return false;
    }

    removeWaypoint() {
        const drag = this._tokenDrag;
        if (drag) {
            if (drag.token.ruler) drag.token._removeDragWaypoint();
            else drag.token._triggerDragLeftCancel();
            return true;
        }
        if (this._freeRuler) {
            const ruler = canvas.controls.ruler;
            ruler._removeDragWaypoint();
            if (!ruler.active) this.endFreeRuler();
            return true;
        }
        if (this.placementPreview.active) return this.placementPreview.removeSegment();
        return false;
    }

    cancelDrag(force = false) {
        if (this._tokenDrag) return this.cancelTokenDrag();
        if (this._freeRuler) return this.endFreeRuler();
        if (!this.draggable) return;
        const entity3D = this.draggable.userData.entity3D;
        entity3D.dragCanceled = true;
        this.draggable = undefined;
        this.placementPreview.cancel();
        if (entity3D.template) Hooks.call("updateMeasuredTemplate", entity3D.template.document, { x: entity3D.template.document.x });
        if (entity3D.tile) Hooks.call("updateTile", entity3D.tile.document, { x: entity3D.tile.document.x });
        this.clicks = 0;
    }

    isTokenDragFree(token) {
        if (this.isFreeMode || this.forceFree) return true;
        const document = token?.document;
        if (!document) return false;
        if (document.movementAction === "fly") return true;
        if (document.flags?.["levels-3d-preview"]?.forceFlyingMode) return true;
        const statuses = Array.from(document.actor?.statuses ?? []);
        return statuses.some((s) => s.includes("fly"));
    }

    _setCanvasPointer(x, y, elevation, point3d = null) {
        const position = new THREE.Vector3(x, y, elevation);
        position.elevation = elevation;
        this.canvas2dMousePosition = position;
        canvas.mousePosition = position;
        this.canvas3dMousePosition = point3d ?? posCanvasTo3d(position);
    }

    _createSyntheticPointerEvent(type, target, { button = 0, buttons = 0, shiftKey = false, altKey = false, ctrlKey = false, metaKey = false, screen = null } = {}) {
        const eventSystem = canvas.app.renderer.events;
        const event = eventSystem.rootBoundary.createPointerEvent(eventSystem.pointer, type, target);
        event.defaultPrevented = false;
        event.path = null;
        event.button = button;
        event.buttons = buttons;
        event.shiftKey = shiftKey;
        event.altKey = altKey;
        event.ctrlKey = ctrlKey;
        event.metaKey = metaKey;
        event.timeStamp = performance.now();
        if (screen) {
            for (const point of [event.global, event.client, event.screen, event.page]) point?.set(screen.x, screen.y);
        }
        const interactionManager = this;
        event.getLocalPosition = function (displayObject, point) {
            const position = interactionManager.canvas2dMousePosition;
            const out = point ?? new PIXI.Point();
            out.x = position?.x ?? 0;
            out.y = position?.y ?? 0;
            return out;
        };
        return event;
    }

    _freeSyntheticPointerEvent(event) {
        delete event.getLocalPosition;
        canvas.app.renderer.events.rootBoundary.freeEvent(event);
    }

    _beginCoreTokenDrag(token, { shiftKey = false, altKey = false } = {}) {
        const MouseInteractionManager = foundry.canvas.interaction.MouseInteractionManager;
        const mim = token.mouseInteractionManager;
        const states = mim.states;
        if (mim.state > states.HOVER) mim.cancel();
        if (mim.state < states.HOVER) mim.state = states.HOVER;
        mim.lcTime = 0;
        mim.dragTime = 0;
        const source = token.document._source;
        const center = token.document.getCenterPoint(source);
        this._setCanvasPointer(center.x, center.y, source.elevation);
        const screen = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const resistance = (mim.options?.dragResistance || MouseInteractionManager.DEFAULT_DRAG_RESISTANCE_PX) + 1;
        const drag = this._tokenDrag;
        drag.dispatching = true;
        try {
            const down = this._createSyntheticPointerEvent("pointerdown", token, { button: 0, buttons: 1, altKey, screen });
            down.interactionData = mim.interactionData;
            try {
                mim.handleEvent(down);
            } finally {
                this._freeSyntheticPointerEvent(down);
            }
            if (mim.state === states.GRABBED) {
                const move = this._createSyntheticPointerEvent("pointermove", token, { button: -1, buttons: 1, shiftKey, altKey, screen: { x: screen.x + resistance, y: screen.y } });
                move.interactionData = mim.interactionData;
                try {
                    mim.layer.emit("pointermove", move);
                } finally {
                    this._freeSyntheticPointerEvent(move);
                }
            }
        } finally {
            drag.dispatching = false;
        }
        if (canvas.tokens._draggedToken === token && mim.state === states.DRAG) return true;
        clearTimeout(MouseInteractionManager.longPressTimeout);
        if (mim.state > states.HOVER) {
            mim.interactionData.cancelled = true;
            mim.cancel();
        }
        return false;
    }

    _resolveToken3D(target) {
        if (!target) return null;
        if (typeof target === "string") return this._parent.tokens[target] ?? null;
        if (target instanceof foundry.canvas.placeables.Token) return this._parent.tokens[target.id] ?? null;
        if (target.token && target.mesh) return target;
        return this._parent.tokens[target.id ?? target.document?.id] ?? null;
    }

    startTokenDrag(target, { shiftKey = false, altKey = false } = {}, dragObject = null) {
        if (this._tokenDrag || this._freeRuler) return false;
        const token3d = this._resolveToken3D(target);
        const token = token3d?.token;
        if (!token || token.isPreview || token.destroyed || token3d.isCaptured || !token.mouseInteractionManager) return false;
        if (!canvas.tokens?.active || game.activeTool !== "select" || canvas.tokens._draggedToken) return false;
        if (!token.controlled) token.control({ releaseOthers: true });
        this._tokenDrag = { token, token3d, ghosts: new Set(), dispatching: false, released: false, manualPoint: null, lastKey: null };
        let started = false;
        try {
            started = this._beginCoreTokenDrag(token, { shiftKey: !!shiftKey, altKey: !!altKey });
        } catch (e) {
            console.error(e);
        }
        if (!started) {
            this._tokenDrag = null;
            return false;
        }
        token3d.isAnimating = false;
        token3d.setPosition?.();
        this.draggable = dragObject ?? token3d.mesh;
        this.toggleControls(false);
        const contexts = token.mouseInteractionManager.interactionData.contexts ?? {};
        for (const id of Object.keys(contexts)) {
            const ghostOwner = this._parent.tokens[id];
            if (!ghostOwner?.createDragGhost?.()) continue;
            this._tokenDrag.ghosts.add(ghostOwner);
        }
        this.updateTokenDrag();
        return true;
    }

    _raycastTokenDrag(drag, context) {
        const free = this.isTokenDragFree(drag.token);
        drag.token3d.wasFreeMode = free;
        const center = this._parent.canvasCenter;
        this.raycaster.setFromCamera(this.mousemove, this.camera);
        if (free) {
            this.dragplane.updateMatrixWorld();
            return this.raycaster.intersectObjects([this.dragplane], true)[0]?.point ?? null;
        }
        const collisionGeometries = this._collisionGeometries ?? [];
        let intersects = collisionGeometries.length ? this.raycaster.intersectObjects(collisionGeometries, true).filter(this._clippingFilter) : [];
        if (!intersects.length) intersects = this.raycaster.intersectObjects([this.dragplane], true);
        const point = intersects[0]?.point;
        if (!point) return null;
        this.dragplane.position.set(center.x, point.y, center.z);
        return point;
    }

    updateTokenDrag(point = null) {
        const drag = this._tokenDrag;
        if (!drag) return false;
        const token = drag.token;
        if (token.destroyed || canvas.tokens?._draggedToken !== token) {
            this.onCoreDragEnd(token);
            return false;
        }
        if (point) drag.manualPoint = point;
        const contexts = token.mouseInteractionManager.interactionData.contexts ?? {};
        const context = contexts[token.document.id];
        let point3d;
        if (drag.manualPoint) {
            const p = drag.manualPoint;
            point3d = p.elevation !== undefined ? posCanvasTo3d({ x: p.x, y: p.y, z: p.elevation }) : new THREE.Vector3(p.x, p.y, p.z);
            drag.token3d.wasFreeMode = this.isTokenDragFree(token);
        } else {
            point3d = this._raycastTokenDrag(drag, context);
        }
        if (point3d) {
            const position = pos3DToCanvas(point3d);
            this.canvas2dMousePosition = position;
            canvas.mousePosition = position;
            this.canvas3dMousePosition = point3d;
            const snap = !game.keyboard.isModifierActive("Shift");
            const key = [position.x, position.y, position.z, snap, this.isTokenDragFree(token)].join("|");
            if (key !== drag.lastKey) {
                drag.lastKey = key;
                drag.dispatching = true;
                try {
                    token._updateDragDestination({ x: position.x, y: position.y }, { snap });
                } finally {
                    drag.dispatching = false;
                }
            }
        }
        for (const ghostOwner of drag.ghosts) {
            const destination = contexts[ghostOwner.token?.document?.id]?.destination;
            if (destination) ghostOwner.updateDragGhost(destination);
        }
        return true;
    }

    dropTokenDrag({ ctrlKey = false, metaKey = false } = {}) {
        const drag = this._tokenDrag;
        if (!drag) return false;
        const token = drag.token;
        if (token.destroyed || canvas.tokens?._draggedToken !== token) {
            this.onCoreDragEnd(token);
            return false;
        }
        if (token._shouldPreventDragLeftDrop({ ctrlKey, metaKey })) {
            drag.released = true;
            token.mouseInteractionManager.interactionData.released = true;
            return false;
        }
        token._triggerDragLeftDrop();
        if (this._tokenDrag === drag) this.onCoreDragEnd(token);
        return true;
    }

    cancelTokenDrag() {
        const drag = this._tokenDrag;
        if (!drag) return false;
        const token = drag.token;
        if (!token.destroyed && canvas.tokens?._draggedToken === token) token._triggerDragLeftCancel();
        if (this._tokenDrag === drag) this.onCoreDragEnd(token);
        return true;
    }

    onCoreDragEnd(token) {
        const drag = this._tokenDrag;
        if (!drag || (token && drag.token !== token)) return;
        this._tokenDrag = null;
        for (const ghostOwner of drag.ghosts) ghostOwner.destroyDragGhost?.();
        drag.token3d.destroyDragGhost?.();
        if (this.draggable?.userData?.entity3D?.token) this.draggable = null;
        this.clicks = 0;
        this._pendingDrag = null;
        this.toggleControls(true);
    }

    _onTokenDragMouseDown(event) {
        const drag = this._tokenDrag;
        this._parent.stopCameraAnimation();
        this.mousedown = true;
        if (event.which === 1) this._leftDown = true;
        if (event.which === 3) this._rightDown = true;
        this.mousePosition = { x: event.clientX, y: event.clientY };
        const token = drag.token;
        if (event.which === 3) {
            if (token.ruler) token._removeDragWaypoint();
            else token._triggerDragLeftCancel();
            return;
        }
        if (event.which !== 1 || !drag.released) return;
        this.updateTokenDrag();
        if (event.ctrlKey || event.metaKey) {
            if (token.ruler && this.canvas2dMousePosition) token._addDragWaypoint(this.canvas2dMousePosition, { snap: !event.shiftKey });
            return;
        }
        drag.released = false;
        this.dropTokenDrag();
    }

    _onPointerUp(event) {
        if (!this._tokenDrag) return;
        this._onTokenDragMouseUp(event);
        if (this._tokenDrag) event.preventDefault();
    }

    _onTokenDragMouseUp(event) {
        const drag = this._tokenDrag;
        if (event.which === 1) this._leftDown = false;
        if (event.which === 3) this._rightDown = false;
        this.mousedown = this._leftDown || this._rightDown;
        this._upCameraPosition = this._parent.camera.position.clone();
        this._pendingDrag = null;
        if (event.type !== "pointerup" || event.which !== 1 || drag.released) return;
        this.updateTokenDrag();
        this.dropTokenDrag({ ctrlKey: event.ctrlKey, metaKey: event.metaKey });
    }

    _onTokenDragWheel(event) {
        const drag = this._tokenDrag;
        const delta = Math.sign(event.deltaY);
        if (!delta) return;
        this.forceFree = true;
        drag.token3d.wasFreeMode = true;
        drag.token._changeDragElevation(-delta, { precise: event.shiftKey });
    }

    startFreeRuler(event, intersectData) {
        const ruler = canvas.controls?.ruler;
        if (!ruler || this._tokenDrag || this._freeRuler) return this.abortDrag();
        const start = intersectData?.point ? pos3DToCanvas(intersectData.point) : this.canvas2dMousePosition;
        if (!start) return this.abortDrag();
        const current = this.canvas2dMousePosition ?? start;
        const interactionData = { origin: { x: start.x, y: start.y }, destination: { x: current.x, y: current.y }, ruler: true, cancelled: false, released: false };
        const pointer = this.canvas2dMousePosition;
        this._setCanvasPointer(start.x, start.y, start.z ?? 0, intersectData?.point ?? null);
        ruler._onDragStart({ interactionData, shiftKey: !!event.shiftKey, altKey: !!event.altKey, ctrlKey: !!event.ctrlKey, metaKey: !!event.metaKey });
        if (pointer) {
            this.canvas2dMousePosition = pointer;
            canvas.mousePosition = pointer;
        }
        this._freeRuler = { interactionData, released: false, lastKey: null };
        this.clicks = 0;
        this.toggleControls(false);
        return true;
    }

    updateFreeRuler() {
        const freeRuler = this._freeRuler;
        const ruler = canvas.controls?.ruler;
        if (!ruler?.active) return this.endFreeRuler();
        const position = this.canvas2dMousePosition;
        if (!position) return;
        const shiftKey = game.keyboard.isModifierActive("Shift");
        const key = [position.x, position.y, position.z, shiftKey, !!(this.isFreeMode || this.forceFree)].join("|");
        if (key === freeRuler.lastKey) return;
        freeRuler.lastKey = key;
        freeRuler.interactionData.destination = { x: position.x, y: position.y };
        ruler._onMouseMove({ interactionData: freeRuler.interactionData, shiftKey });
    }

    endFreeRuler() {
        if (!this._freeRuler) return;
        this._freeRuler = null;
        this.forceFree = false;
        const ruler = canvas.controls?.ruler;
        if (ruler?.active) ruler.reset();
        this.clicks = 0;
        this.toggleControls(true);
    }

    _onFreeRulerMouseDown(event) {
        const freeRuler = this._freeRuler;
        const ruler = canvas.controls.ruler;
        this.mousedown = true;
        if (event.which === 1) this._leftDown = true;
        if (event.which === 3) this._rightDown = true;
        if (event.which === 3) {
            ruler._removeDragWaypoint();
            if (!ruler.active) this.endFreeRuler();
            return;
        }
        if (event.which !== 1) return;
        if (event.ctrlKey || event.metaKey) {
            if (this.canvas2dMousePosition) ruler._addDragWaypoint(this.canvas2dMousePosition, { snap: !event.shiftKey });
            return;
        }
        if (freeRuler.released) this.endFreeRuler();
    }

    _onFreeRulerMouseUp(event) {
        const freeRuler = this._freeRuler;
        if (event.which === 1) this._leftDown = false;
        if (event.which === 3) this._rightDown = false;
        this.mousedown = this._leftDown || this._rightDown;
        this._pendingDrag = null;
        if (event.which !== 1 || freeRuler.released) return;
        if (event.ctrlKey || event.metaKey) {
            freeRuler.released = true;
            freeRuler.interactionData.released = true;
            return;
        }
        this.endFreeRuler();
    }

    _onFreeRulerWheel(event) {
        const delta = Math.sign(event.deltaY);
        if (!delta) return;
        this.forceFree = true;
        canvas.controls.ruler._changeDragElevation(-delta, { precise: event.shiftKey });
    }

    broadcastCursorPosition(pos3d) {
        const sc = game.user.hasPermission("SHOW_CURSOR");
        if (!sc) return;
        const position = { x: pos3d?.x, y: pos3d?.y, z: pos3d?.z };
        this._currentMousePosition = position;
        // Throttle network broadcasts to one every 100ms, with a trailing call for the latest position
        const now = Date.now();
        const elapsed = now - (this._lastCursorBroadcast ?? 0);
        if (elapsed >= 100) {
            clearTimeout(this._cursorBroadcastTimeout);
            this._cursorBroadcastTimeout = null;
            this._emitCursorPosition(position);
        } else if (!this._cursorBroadcastTimeout) {
            this._cursorBroadcastTimeout = setTimeout(() => {
                this._cursorBroadcastTimeout = null;
                this._emitCursorPosition(this._currentMousePosition);
            }, 100 - elapsed);
        }
    }

    _emitCursorPosition(position) {
        this._lastCursorBroadcast = Date.now();
        game.user.broadcastActivity({
            cursor: { x: JSON.stringify(position ?? {}), y: 0 },
        });
    }

    handleTriggerHappy(entity) {
        if (!entity) return;
        if (!entity.token || !game.triggers) return;
        const downTriggers = game.triggers._getTriggersFromTokens(game.triggers.triggers, [entity.token], "click");
        game.triggers._executeTriggers(downTriggers);
    }

    _getKeybindingDisplay(action) {
        const binding = game.keybindings.get("levels-3d-preview", action)?.[0];
        if (!binding?.key) return "-";
        const KeyboardManager = foundry.helpers.interaction.KeyboardManager;
        const key = KeyboardManager.getKeycodeDisplayString?.(binding.key) ?? binding.key.replace("Key", "");
        return [...(binding.modifiers ?? []), key].join(" + ");
    }

    showControlReference() {
        const tileKeybindings = ["translate", "rotate", "scale", "toggleGizmo"];
        const tileReference = "levels3dpreview.tileEditor.controlsReference";
        const movementReference = "levels3dpreview.controls.movementReference";

        let controlsReference = `
    <h2>${game.i18n.localize(`${tileReference}.title`)}</h2>
    `;
        for (const key of tileKeybindings) {
            controlsReference += `<p><strong>${game.i18n.localize(`${tileReference}.${key}`)}</strong>: ${this._getKeybindingDisplay(key)}</p>`;
        }
        controlsReference += `<p>${game.i18n.localize(`${tileReference}.nogizmo`)}</p>`;
        controlsReference += `<p>${game.i18n.localize(`${tileReference}.clone`)}</p>`;

        controlsReference += `<h2>${game.i18n.localize(`${movementReference}.title`)}</h2>`;
        const movementControls = [
            ["addWaypoint", game.i18n.localize(`${movementReference}.addWaypointKeys`)],
            ["removeWaypoint", `${game.i18n.localize(`${movementReference}.removeWaypointKeys`)} / ${this._getKeybindingDisplay("removeWaypoint")}`],
            ["elevation", game.i18n.localize(`${movementReference}.elevationKeys`)],
            ["hidden", game.i18n.localize(`${movementReference}.hiddenKeys`)],
            ["freeMode", this._getKeybindingDisplay("freeMode")],
        ];
        for (const [key, keys] of movementControls) {
            controlsReference += `<p><strong>${game.i18n.localize(`${movementReference}.${key}`)}</strong>: ${keys}</p>`;
        }

        ChatMessage.create({
            content: controlsReference,
            whisper: [game.user.id],
            flavor: game.i18n.localize(`${tileReference}.title`),
            flags: {
                core: {
                    canPopout: true,
                },
            },
        });
    }

    async removeWASDBindings() {
        foundry.applications.api.DialogV2.confirm({
            title: game.i18n.localize(`levels3dpreview.keybindings.dialog.title`),
            content: game.i18n.localize(`levels3dpreview.keybindings.dialog.content`),
        }).then(async res => {
            if (!res) return game.settings.set("levels-3d-preview", "removeKeybindingsPrompt", true);
            await game.keybindings.set(
                "core",
                "panUp",
                game.keybindings.get("core", "panUp").filter((b) => b.key != "KeyW" && b.key != "ArrowUp" && b.key != "Numpad8"),
            );
            await game.keybindings.set(
                "core",
                "panDown",
                game.keybindings.get("core", "panDown").filter((b) => b.key != "KeyS" && b.key != "ArrowDown" && b.key != "Numpad2"),
            );
            await game.keybindings.set(
                "core",
                "panLeft",
                game.keybindings.get("core", "panLeft").filter((b) => b.key != "KeyA" && b.key != "ArrowLeft" && b.key != "Numpad4"),
            );
            await game.keybindings.set(
                "core",
                "panRight",
                game.keybindings.get("core", "panRight").filter((b) => b.key != "KeyD" && b.key != "ArrowRight" && b.key != "Numpad6"),
            );
            await game.settings.set("levels-3d-preview", "removeKeybindingsPrompt", true);
        });
    }

    static setHooks() {
        Hooks.on("updateTile", () => {
            if (game.Levels3DPreview?._active) {
                game.Levels3DPreview?.interactionManager?.generateSightCollisions();
            }
        });

        Hooks.on("createTile", () => {
            if (game.Levels3DPreview?._active && game.Levels3DPreview?.object3dSight) {
                game.Levels3DPreview?.interactionManager?.generateSightCollisions();
            }
        });

        Hooks.on("deleteTile", () => {
            if (game.Levels3DPreview?._active) {
                game.Levels3DPreview?.interactionManager?.generateSightCollisions();
            }
        });

        Hooks.on("updateWall", () => {
            if (game.Levels3DPreview?._active) {
                game.Levels3DPreview?.interactionManager?.generateSightCollisions();
            }
        });

        Hooks.on("createWall", () => {
            if (game.Levels3DPreview?._active) {
                game.Levels3DPreview?.interactionManager?.generateSightCollisions();
            }
        });

        Hooks.on("deleteWall", () => {
            if (game.Levels3DPreview?._active) {
                game.Levels3DPreview?.interactionManager?.generateSightCollisions();
            }
        });

        Hooks.on("3DCanvasSceneReady", () => {
            if (game.Levels3DPreview?._active) {
                game.Levels3DPreview?.interactionManager?.generateSightCollisions();
                canvas.visibility.refresh();
            }
        });

        Hooks.on("renderSceneControls", () => {
            if (game.Levels3DPreview?._active) {
                game.Levels3DPreview?.interactionManager?.updateHoverObjNoDebounce();
            }
        });
    }
}

export const dropFunctions = {
    Tile: async function (event, data) {
        const isBillboard = data.params?.dynaMesh?.includes("billboard");
        if (!game.Levels3DPreview.helpers.is3DModel(data.texture.src) && !isBillboard) return dropImage.bind(this)(event, data);
        canvas.tiles.activate();
        const { grid, normal, rotation, pos } = data.assetBrowser ?? {};
        data.flags["levels-3d-preview"] = {
            model3d: data.texture.src,
            autoGround: true,
            autoCenter: !!pos,
            ...(data.params || {}),
        };
        let depth, width, height;
        if (isBillboard) {
            data.flags["levels-3d-preview"].model3d = "";
            data.flags["levels-3d-preview"].imageTexture = data.texture.src;
            depth = width = height = canvas.grid.size * (canvas.grid.size / data.tileSize);
        } else {
            const object3d = await this._parent.helpers.loadModel(data.texture.src);
            const modelBB = new THREE.Box3().setFromObject(object3d.model);
            const widthFactor = modelBB.max.x - modelBB.min.x;
            const heightFactor = modelBB.max.z - modelBB.min.z;
            depth = (modelBB.max.y - modelBB.min.y) * canvas.grid.size * (canvas.grid.size / data.tileSize);
            width = canvas.grid.size * (canvas.grid.size / data.tileSize) * widthFactor;
            height = canvas.grid.size * (canvas.grid.size / data.tileSize) * heightFactor;
        }

        data.rotation = rotation ?? 0;
        data.flags["levels-3d-preview"].depth = depth || 0.05;
        if (normal) {
            const dummy = new THREE.Object3D();
            dummy.lookAt(normal.x, normal.y, normal.z);
            dummy.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
            data.flags["levels-3d-preview"].tiltX = Math.toDegrees(dummy.rotation.x);
            data.flags["levels-3d-preview"].tiltZ = Math.toDegrees(dummy.rotation.z);
            data.rotation = Math.toDegrees(dummy.rotation.y);
            data.flags["levels-3d-preview"].autoCenter = true;
        }

        const useSnapped = grid ?? coords3d.useSnapped();
        let snapped;
        if (useSnapped) {
            snapped = canvas.grid.getSnappedPoint({x: data.x, y: data.y}, {mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER});
        }
        return await canvas.scene.createEmbeddedDocuments("Tile", [
            {
                x: Math.round(snapped ? snapped.x : data.x),
                y: Math.round(snapped ? snapped.y : data.y),
                width: Math.round(width),
                height: Math.round(height),
                elevation: data.elevation,
                texture: { src: "modules/levels-3d-preview/assets/blank.webp" },
                flags: data.flags,
                rotation: data.rotation,
            },
        ]);
    },
    Actor: async function (event, data) {
        canvas.tokens.activate();

        Hooks.once("preCreateToken", (token) => {
            token.updateSource({ elevation: Math.trunc(data.elevation * 100) / 100, flags: data.flags });
        });
        return await canvas.tokens._onDropActorData(event, data);
    },
    JournalEntry: async function (event, data) {
        canvas.notes.activate();

        const noteDocument = await fromUuid(data.uuid);
        const entryId = noteDocument.id;
        const pageId = null;
        canvas.scene.createEmbeddedDocuments("Note", [{ ...data, entryId, pageId }]);
        return;
    },
    JournalEntryPage: async function (event, data) {
        canvas.notes.activate();

        const noteDocument = await fromUuid(data.uuid);
        const entryId = noteDocument.parent.id;
        const pageId = noteDocument.id;
        canvas.scene.createEmbeddedDocuments("Note", [{ ...data, entryId, pageId }]);
        return;
    },
};

async function dropImage(event, data) {
    const size = canvas.grid.size * data.tileSize;
    data.flags["levels-3d-preview"] = {
        imageTexture: data.texture.src,
        dynaMesh: "decal",
        castShadow: false,
        shaders: data.shaderData,
        transparency: 0.99,
        collision: false,
        sight: false,
        depth: 1,
    };
    data.width = size;
    data.height = size;
    // data.depth = 1; // size;
    data.elevation += canvas.scene.dimensions.distance * 2;
    // data.x -= size / 2;
    // data.y -= size / 2;
    data.texture.src = "modules/levels-3d-preview/assets/blank.webp";

    let isToken = false;
    if (game.modules.get("token-attacher")?.active) {
        game.Levels3DPreview.interactionManager._onMouseMove(event, true);
        isToken = game.Levels3DPreview.interactionManager.currentHover?.token;
        if (isToken) {
            data.x = isToken.center.x - size / 2;
            data.y = isToken.center.y - size / 2;
            data.elevation = isToken.document.elevation + 1;
        }
    }
    return await canvas.scene.createEmbeddedDocuments("Tile", [data]).then((tiles) => {
        if (isToken) tokenAttacher.attachElementToToken(tiles[0].object, game.Levels3DPreview.interactionManager.currentHover?.token);
        else canvas.tiles.activate();
    });
}
