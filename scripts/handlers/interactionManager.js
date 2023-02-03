import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { Ruler3D } from "../systems/ruler3d.js";
import { GroupSelectHandler } from "./GroupSelectHandler.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "../lib/three-mesh-bvh.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

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
        this.ruler = levels3dPreview.ruler;
        this.factor = levels3dPreview.factor;
        this.clicks = 0;
        this.lcTime = 0;
        this.controls.enableRotate = !this.isCameraLocked;
        this.forceSightCollisions = this.generateSightCollisions.bind(this);
        this.generateSightCollisions = debounce(this.generateSightCollisions.bind(this), 100);
        //this.updateHoverObj = debounce(this.updateHoverObj.bind(this), 100);
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
            if (!tile?.mesh?.visible) continue;
            const mesh = tile.sightMesh ?? tile.mesh;
            if (tile.hasTags) {
                mesh.traverse((o) => {
                    const ud = o?.userData;
                    o.userData = {};
                    const clone = o.clone(false);
                    clone.userData = ud;
                    o.userData = ud;
                    if (o?.userData?.collision) collisionObjects.push(clone);
                    if (o?.userData?.sight) sightObjects.push(clone);
                    if (o?.userData?.cameraCollision) cameraObjects.push(clone);
                });
            } else {
                if (tile.collision) collisionObjects.push(mesh);
                if (tile.sight) sightObjects.push(mesh);
                if (tile.cameraCollision) cameraObjects.push(mesh);
            }
        }
        for (let wall of walls) {
            if (wall.placeable.isDoor && wall.placeable.document.ds === CONST.WALL_DOOR_STATES.OPEN) continue;
            if (!wall.mesh?.visible && wall.isDisabledVisible === true) continue;
            if (wall.placeable.document.sight >= 10) sightObjects.push(wall.mesh);
            if (wall.placeable.document.move > 0) collisionObjects.push(wall.mesh);
        }
        if (this._parent.board) {
            sightObjects.push(this._parent.board);
            collisionObjects.push(this._parent.board);
        }

        this._sightCollisions = {
            collision: collisionObjects,
            sight: sightObjects,
            camera: cameraObjects,
        };
        if (!p0 && !p1) canvas.tokens.controlled.forEach((t) => t.updateSource());
    }

    computeSightCollision(v1, v2, type = "collision", elongate = false) {
        const origin = Ruler3D.posCanvasTo3d(v1);
        const target = Ruler3D.posCanvasTo3d(v2);
        return this.computeSightCollisionFrom3DPositions(origin, target, type, elongate);
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
        //if(!this._sightCollisions[type] && !this._sightCollisions["collision"])  this.forceSightCollisions(rectp0,rectp1);
        let collisions = this.sightRaycaster.intersectObjects(this._sightCollisions[type] ?? this._sightCollisions["collision"], true);
        if (!collisions.length) return false;
        if (useClipping && !returnAll) {
            collisions = collisions.filter((c) => c.point.y < (game.Levels3DPreview.ClipNavigation._clipHeight ?? Infinity));
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
        if (collisions.length % 2 === 0) return false;
        return true;
    }

    activateListeners() {
        this.domElement.addEventListener("mousedown", this._onMouseDown.bind(this), false);
        //this.domElement.addEventListener("mousedown", this._onEnableRuler.bind(this), false);
        this.domElement.addEventListener("mouseup", this._onMouseUp.bind(this), false);
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
        return ["MeasuredTemplate", "AmbientLight", "Tile"];
    }

    _onTransformStart(event) {
        this.controls.enabled = false;
        this.preventSelect = true;
        if (this.isCtrl) {
            const tilesToCreate = [];
            for (let tile of canvas.activeLayer.controlled) {
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
        for (let placeable of canvas.activeLayer.controlled) {
            const tile3d = this._parent.tiles[placeable.id];
            if (!tile3d) continue;
            const mesh = tile3d.mesh;
            const offsetPos = mesh.position.clone().sub(controlledGroup.position);
            mesh.position.copy(offsetPos);
            controlledGroup.add(mesh);
        }
    }

    clearControlledGroup() {
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
        const controlledGroup = this._parent.controlledGroup;
        const mesh = object3d.mesh;
        const offset = mesh.position.clone().sub(controlledGroup.position.clone().multiplyScalar(-1));
        mesh.position.copy(offset);
        this._parent.scene.add(mesh);
    }

    controlledGroupSetPosition() {
        if (!canvas?.activeLayer?.controlled?.length) return false;
        const controlledGroup = this._parent.controlledGroup;
        let maxX,
            maxY,
            maxZ,
            minX,
            minY,
            minZ = 0;

        for (let placeable of canvas.activeLayer.controlled) {
            const tile3d = this._parent.tiles[placeable.id];
            if (!tile3d) continue;
            const pos = tile3d.mesh.position;
            if (!maxX || pos.x > maxX) maxX = pos.x;
            if (!maxY || pos.y > maxY) maxY = pos.y;
            if (!maxZ || pos.z > maxZ) maxZ = pos.z;
            if (!minX || pos.x < minX) minX = pos.x;
            if (!minY || pos.y < minY) minY = pos.y;
            if (!minZ || pos.z < minZ) minZ = pos.z;
        }

        const center = new THREE.Vector3((maxX + minX) / 2, (maxY + minY) / 2, (maxZ + minZ) / 2);
        controlledGroup.position.copy(center);
        return true;
    }

    toggleGizmo() {
        this._gizmoEnabled = !this._gizmoEnabled;
        if (!this._gizmoEnabled) {
            this._parent.transformControls.detach();
        } else {
            if (canvas.activeLayer.options.objectClass.name !== "Tile") return;
            Object.values(game.Levels3DPreview.tiles).forEach((tile3d) => {
                tile3d.updateControls();
            });
        }
    }

    isRulerDrag(event, intersectData) {
        if (ui.controls.activeTool == "ruler") return true;
        if (this.activeLayerEntity === "Tile" && ui.controls.activeTool === "tile") return true;
        if (this.currentHover?.embeddedName === this.activeLayerEntity) return false;
        if (this.isNoSelectDrag()) return false;
        if (ui.controls.control.activeTool === "select" && ui.controls.activeTool != "ruler") return false;
        if (!ui.controls.isRuler && !this.allowedRulerDrag.some((a) => a === this.activeLayerEntity)) return false;
        if (!this.mouseIntersection3DCollision({ x: event.clientX, y: event.clientY })?.length) return false;
        if (this.activeLayerEntity === "Tile" && ui.controls.control.activeTool != "tile") return false;
        return true;
    }

    isNoSelectDrag() {
        const currentControl = ui.controls.controls.find((c) => c.name === ui.controls.activeControl).tools.find((t) => (t.name = "select"));
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
            this.toggleControls(false);
            const position = this.mouseIntersection3DCollision({ x: event.clientX, y: event.clientY });
            const intersectPos = position[0].point;
            rulerObj.position.set(intersectPos.x, intersectPos.y, intersectPos.z);
            this.draggable = rulerObj;
        } else if (event.which === 3 && this.draggable) {
            //this.ruler.template?.destroy();
            this.ruler.template = null;
            this.draggable = null;
        }
    }

    async _onDrop(event, snap = null, normal = null, dataTransfer = null, setRotation = 0, autoCenter = false) {
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
            const coord3d = data.coord3d ? Ruler3D.pos3DToCanvas(data.coord3d) : this.screen3DtoCanvas2DWithCollision(event);
            data.x = coord3d.x;
            data.y = coord3d.y;
            data.elevation = coord3d.z;
            data.flags = {
                levels: {
                    rangeBottom: coord3d.z,
                },
            };

            let entityLayer = canvas.activeLayer;
            if (data.type === "Actor") entityLayer = canvas.tokens;
            if (data.type === "JournalEntry" || data.type === "JournalEntryPage") entityLayer = canvas.notes;
            if (data.type === "Tile") entityLayer = canvas.tiles;
            if (entityLayer !== canvas.activeLayer) entityLayer.activate();

            if (data.type === "Actor") {
                Hooks.once("preCreateToken", (token) => {
                    token.updateSource({ elevation: Math.trunc(data.elevation * 100) / 100, flags: data.flags });
                });
                return canvas.tokens._onDropActorData(event, data);
            }

            if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
                const noteDocument = await fromUuid(data.uuid);
                const entryId = data.type === "JournalEntryPage" ? noteDocument.parent.id : noteDocument.id;
                const pageId = data.type === "JournalEntryPage" ? noteDocument.id : null;
                canvas.scene.createEmbeddedDocuments("Note", [{ ...data, entryId, pageId }]);
                return;
            }

            data.flags["levels-3d-preview"] = {
                model3d: data.texture.src,
                autoGround: true,
                autoCenter: autoCenter,
                ...(data.params || {})
            };
            if (data.type === "Tile") {
                const object3d = await this._parent.helpers.loadModel(data.texture.src);
                const modelBB = new THREE.Box3().setFromObject(object3d.model);
                const widthFactor = modelBB.max.x - modelBB.min.x;
                const heightFactor = modelBB.max.z - modelBB.min.z;
                let depth = modelBB.max.y - modelBB.min.y;
                let width = canvas.grid.size * (canvas.grid.size / data.tileSize) * widthFactor;
                let height = canvas.grid.size * (canvas.grid.size / data.tileSize) * heightFactor;

                data.flags["levels-3d-preview"].depth = depth ? canvas.grid.size * (canvas.grid.size / data.tileSize) * depth : 0.05;
                if (normal) {
                    const dummy = new THREE.Object3D();
                    dummy.lookAt(normal);
                    dummy.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                    data.flags["levels-3d-preview"].tiltX = Math.toDegrees(dummy.rotation.x);
                    data.flags["levels-3d-preview"].tiltZ = Math.toDegrees(dummy.rotation.z);
                    data.rotation = Math.toDegrees(dummy.rotation.y);
                    data.flags["levels-3d-preview"].autoCenter = true;
                }
                data.rotation = setRotation;

                const useSnapped = snap ?? Ruler3D.useSnapped();
                let snapped;
                if (useSnapped) {
                    snapped = canvas.grid.getSnappedPosition(data.x - width / 2, data.y - height / 2);
                }
                canvas.scene.createEmbeddedDocuments("Tile", [
                    {
                        x: snapped ? snapped.x : data.x - width / 2,
                        y: snapped ? snapped.y : data.y - height / 2,
                        width: width,
                        height: height,
                        img: "modules/levels-3d-preview/assets/blank.webp",
                        overhead: canvas.activeLayer.name !== "BackgroundLayer",
                        flags: data.flags,
                        rotation: data.rotation,
                    },
                ]);
            }
        } catch (e) {
            console.error(e);
            ui.notifications.error(game.i18n.localize("levels3dpreview.errors.notarget"));
        }
    }

    _onMouseDown(event) {
        if (this._groupSelect && this.activeLayerEntity != "MeasuredTemplate") return this.groupSelectHandler.startSelect(event);
        if (this.preventSelect) return;
        this._parent.stopCameraAnimation();
        this._downCameraPosition = this._parent.camera.position.clone();
        if (event.which === 1 && event.ctrlKey) canvas.activeLayer.releaseAll();
        this.mousedown = true;
        if (event.which === 1) this._leftDown = true;
        if (event.which === 3) this._rightDown = true;
        this.mousePosition = { x: event.clientX, y: event.clientY };
        if (event.which !== 1 && event.which !== 3) return;
        this._onMouseMove(event, true);
        const intersectData = this.findMouseIntersect(event);
        const intersect = intersectData?.object;
        if (this.isRulerDrag(event, intersectData)) this.toggleControls(false);
        if (!intersect || event.ctrlKey) return;
        if (intersect.userData?.entity3D?.embeddedName === this.activeLayerEntity && !(this._gizmoEnabled && this.activeLayerEntity === "Tile")) this.toggleControls(false);
        this.clicks++;
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
        if (this.clicks === 1) {
            setTimeout(() => {
                if (event.which === 1) {
                    this.mousedown ? this.startDrag(event, intersectData) : (this._triggerLeft = true);
                } else {
                    this._triggerRight = true;
                }
            }, 250);
        } else {
            if (this.draggable) return this.cancelDrag();
            else event.which === 1 ? (this._triggerLeft2 = true) : (this._triggerRight2 = true);
            this.toggleControls(true);
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
        if (event.which === 1) this._leftDown = false;
        if (event.which === 3) this._rightDown = false;
        if (!this._leftDown && !this._rightDown) this.toggleControls(true);
        this._upCameraPosition = this._parent.camera.position.clone();
        event.entity = this.eventData?.entity;
        event.intersect = this.eventData?.intersect;
        event.position3D = this.eventData?.position3D;
        event.originalIntersect = this.eventData?.originalIntersect;
        setTimeout(() => {
            if ((this.prevEventData && this.prevEventData.entity !== this.eventData.entity) || this.hasCameraMoved) return (this.clicks = 0);
            if (this._triggerLeft2) {
                this._onClickLeft2(event);
                this._onClickLeft(event);
            } else if (this._triggerLeft) this._onClickLeft(event);
            if (this._triggerRight2) this._onClickRight2(event);
            else if (this._triggerRight) this._onClickRight(event);
            if (this._triggerLeft || this._triggerRight || this._triggerLeft2 || this._triggerRight2) this.clicks = 0;
        }, 250);
        this.mousedown = false;
        if (event.which !== 1) return;
        if (this.draggable) {
            this.draggable.position.copy(this.currentDragTarget);
            this.ruler.placeTemplate();
            const entity3D = this.draggable?.userData?.entity3D;
            if (!entity3D.updatePositionFrom3D(event)) this.cancelDrag();
            if (entity3D.token) {
                entity3D.setPosition(false, true);
            }
            this.draggable = null;
            this.clicks = 0;
        }
        this.toggleControls(true, true);
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
        this.mousemove.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mousemove.y = -(event.clientY / window.innerHeight) * 2 + 1;
        if (this.draggable) return;
        this.updateHoverObj();
        const intersect = this.getHoverObject();
        if(intersect) this._mouseHoverIntersect = intersect;
        const object = intersect?.object;
        //Handle placeable hover event
        if (intersect?.point) {
            this.canvas2dMousePosition = Ruler3D.pos3DToCanvas(intersect.point);
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

        if (game.user.hasPermission("SHOW_CURSOR")) {
            this.broadcastCursorPosition(intersect?.point);
        }

        if (this._groupSelect) this.groupSelectHandler.updateSelect(event);
    }

    _clippingFilter(i) {
        const camera = game.Levels3DPreview.camera;
        if (!i.object.material?.clippingPlanes && camera.near === 0.01) return true;
        const distToCamera = i.point.distanceTo(camera.position);
        if (distToCamera < camera.near) return false;
        if (!i.object.material?.clippingPlanes) return true;
        return i.object.material?.clippingPlanes[0].constant > i.point.y;
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
        if (this.draggable) {
            const delta = Math.sign(event.deltaY);
            const entity3D = this.draggable.userData.entity3D;
            if (entity3D.template) {
                if (this.isFreeMode) {
                    this.forceFree = true;
                    entity3D.wasFreeMode = true;
                }
                if (!entity3D.wasFreeMode) entity3D.onRotate(delta);
            } else {
                this.forceFree = true;
                entity3D.wasFreeMode = true;
            }
            let elevationDiff = canvas.scene.dimensions.distance;
            if (event.shiftKey) elevationDiff = canvas.scene.dimensions.distance / 5;
            if (event.ctrlKey) elevationDiff = canvas.scene.dimensions.distance / 50;
            entity3D.elevation3d += -delta * this.elevationTick * elevationDiff;
            if (game.settings.get("levels-3d-preview", "preventNegative") && entity3D.elevation3d < Ruler3D.unitsToPixels(canvas.primary.background.elevation)) {
                entity3D.elevation3d = Ruler3D.unitsToPixels(canvas.primary.background.elevation);
            }
        }
        const isSpecialKey = this.tiltX || this.tiltZ || this.scaleWidth || this.scaleHeight || this.scaleGap || this.scaleScale || this.scale;
        const dBig = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 60 : 45;
        let snap = event.shiftKey ? dBig : 15;
        const delta = Math.sign(event.deltaY) * snap;
        if (!this.draggable && event.ctrlKey && !isSpecialKey && !event.altKey && canvas.activeLayer.controlled.length) {
            canvas.activeLayer.rotateMany({ delta, snap });
        }
        if (!this.draggable && isSpecialKey && event.ctrlKey && canvas.activeLayer.controlled.length) {
            let updates = [];
            const multi = Math.sign(event.deltaY) < 0 ? 1.1 : 0.9;
            const gridS = -Math.sign(event.deltaY) * canvas.grid.size;
            for (let placeable of canvas.activeLayer.controlled) {
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
        if (this.isRulerDrag(event, intersectData)) return this._onEnableRuler(event);
        const entity = event.entity;
        if (!entity) return this.abortDrag();
        if (this._gizmoEnabled && this.activeLayerEntity === "Tile") return this.abortDrag();
        let intersect = event.intersect;
        const placeable = entity.placeable;
        if (!placeable?.controlled && placeable) placeable.control({ releaseOthers: true });
        if (canvas.activeLayer.controlled.some((p) => p?.document?.locked)) return this.abortDrag();
        if (!placeable?.isOwner && !game.user.isGM) return this.abortDrag();
        if (!entity.draggable || entity.mesh.userData?.entity3D?.embeddedName !== this.activeLayerEntity) return this.abortDrag();
        if (entity.mesh.userData?.entity3D?.embeddedName == "Tile") {
            this.setControlledGroup();
            if (!entity.mesh?.userData?.isTransformControls) {
                intersect = this._parent.controlledGroup;
            }
        }
        entity.isAnimating = false;
        entity.setPosition?.();
        this.draggable = intersect;
        this.toggleControls(false);
    }

    abortDrag() {
        this.draggable = null;
        this.clicks = 0;
        this.toggleControls(true, true);
    }

    _onClickLeft(event) {
        if (ui.controls.isRuler || this.draggable) return;
        const entity = event.entity;
        if ((entity?.tile && canvas.activeLayer.options.objectClass.name !== "Tile" && !entity?.isDoor && !event?.originalIntersect?.userData?.isDoor) || !entity) {
            if (this._downCameraPosition.distanceTo(this._upCameraPosition) < 0.01 && game.settings.get("core", "leftClickRelease")) canvas.activeLayer.releaseAll();
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
        const intersect = event.intersect;
        entity._onClickLeft2(event);
    }

    _onClickRight2(event) {
        const entity = event.entity;
        if (!entity) return;
        const intersect = event.intersect;
        entity._onClickRight2(event);
    }

    _onKeyDown(event) {
        if (event.ctrlKey) {
            this.isCtrl = true;
            this.controls.enableZoom = false;
        }
    }

    _onKeyUp(event) {
        this.isCtrl = false;
        if (!this.draggable) this.controls.enableZoom = true;
    }

    findCameraLookatDistance() {
        const screenCenter = new THREE.Vector2(-0.1, +0.1);
        this.raycaster.setFromCamera(screenCenter, this.camera);
        const targets = [];
        this.scene.traverse((c) => { 
            if(c.visible && !c.material?.transparent) targets.push(c);
        });
        const intersects = this.raycaster.intersectObjects(targets);//this._sightCollisions.sight, true);
        if (intersects.length > 0) {
            return intersects[0].distance
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
        const intersects = this.raycaster
            .intersectObjects(intersectTargets, true)
            .filter(this._clippingFilter)
            .filter((i) => !i?.object?.userData?.noIntersect);
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
        this._draggable = object;
        const center = this._parent.canvasCenter;
        if (object) {
            this.buildCollisionGeos();
            this.forceFree = object.userData.entity3D.wasFreeMode;
            this.dragplane.position.set(center.x, object.userData.entity3D.mesh.position.y, center.z);
            this.makeClone();
            this.ruler.cacheSpeedProvider(object?.userData?.entity3D?.token);
        } else {
            this.forceFree = false;
            this.dragplane.position.set(center.x, -99999999, center.z);
            this.removeClone();
        }
        if (this.ruler && (canvas.scene.getFlag("levels-3d-preview", "enableRuler") ?? true)) this.ruler.object = object;
    }

    get draggable() {
        return this._draggable;
    }

    makeClone() {
        const entity3D = this.draggable?.userData?.entity3D;
        if (!entity3D?.token) return;
        const userDataCache = {};
        entity3D.mesh.traverse((child) => {
            if (child.userData) {
                userDataCache[child.uuid] = child.userData;
                child.userData = {};
            }
        });
        this.clone = entity3D.mesh.clone();
        this.clone.userData.original = entity3D;
        this.clone.head = entity3D.head;
        this.clone.mid = entity3D.mid;
        entity3D.mesh.traverse((child) => {
            if (child.userData) {
                child.userData = userDataCache[child.uuid];
            }
        });
        entity3D.hasClone = this.clone;
        entity3D.updateHiden();
        this._parent.scene.add(this.clone);
    }

    removeClone() {
        if (this.clone) {
            const entity3D = this.clone.userData.original;
            this._parent.scene.remove(this.clone);
            entity3D.hasClone = null;
            entity3D.updateHiden();
            this.clone = null;
        }
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
                    const ud = o?.userData;
                    o.userData = {};
                    const clone = o.clone(false);
                    clone.userData = ud;
                    o.userData = ud;
                    if (o?.userData?.collision) collisionGeometries.push(clone);
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
        return intersects.length > 0 ? Ruler3D.pos3DToCanvas(intersects[0].point) : undefined;
    }

    screen3DtoCanvas2DWithCollision(event) {
        const intersect = this.findMouseIntersect(event);
        const pos = intersect ? Ruler3D.pos3DToCanvas(intersect.point) : undefined;
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
        if (!this.draggable) return;
        const collisionGeometries = this._collisionGeometries;
        const token = this.draggable.userData?.entity3D?.token;
        const isFlying = token && token?.document?.hasStatusEffect("fly");
        const target = this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable;
        const isFree = this.isFreeMode || this.forceFree || isFlying || (this.draggable.userData.entity3D.template && this.draggable.userData.entity3D.wasFreeMode);
        this.draggable.userData.entity3D.wasFreeMode = isFree;
        const center = this._parent.canvasCenter;
        if (this.draggable.userData.entity3D.mesh.position.y < 0) {
            this.dragplane.position.set(center.x, this.draggable.userData.entity3D.mesh.position.y, center.z);
        }

        this.raycaster.setFromCamera(this.mousemove, this.camera);
        let intersects = this.raycaster.intersectObjects(collisionGeometries.length && !isFree ? collisionGeometries : [this.dragplane], true).filter(this._clippingFilter);
        if (!intersects.length) intersects = this.raycaster.intersectObjects([this.dragplane], true);

        if (intersects.length > 0) {
            const entity3D = this.draggable.userData.entity3D;
            const distance = target.position.distanceTo(intersects[0].point);
            let lerpFactor = 1 / (1 + distance * 20);
            if (lerpFactor < 0.1) lerpFactor = 0.1;
            this.currentDragTarget = new THREE.Vector3(intersects[0].point.x, !isFree ? intersects[0].point.y : entity3D.elevation3d, intersects[0].point.z);
            target.position.lerp(this.currentDragTarget, lerpFactor);
            if (!isFree) {
                entity3D.elevation3d = intersects[0].point.y;
                this.dragplane.position.set(center.x, intersects[0].point.y, center.z);
            }
            if (entity3D.template) entity3D.onMove();
            this.ruler.update();
        }
    }

    cancelDrag() {
        if (!this.draggable) return;
        const entity3D = this.draggable.userData.entity3D;
        entity3D.dragCanceled = true;
        this.draggable = undefined;
        this.ruler.template = undefined;
        if (entity3D.token) Hooks.call("updateToken", entity3D.token.document, { x: entity3D.token.document.x });
        if (entity3D.template) Hooks.call("updateMeasuredTemplate", entity3D.template.document, { x: entity3D.template.document.x });
        if (entity3D.tile) Hooks.call("updateTile", entity3D.tile.document, { x: entity3D.tile.document.x });
        this.clicks = 0;
    }

    broadcastCursorPosition(pos3d) {
        const sc = game.user.hasPermission("SHOW_CURSOR");
        if (!sc) return;
        const position = { x: pos3d?.x, y: pos3d?.y, z: pos3d?.z };
        const positionToString = JSON.stringify(position);
        this._currentMousePosition = position;
        game.user.broadcastActivity({
            cursor: { x: positionToString, y: 0 },
        });
    }

    handleTriggerHappy(entity) {
        if (!entity) return;
        if (!entity.token || !game.triggers) return;
        const downTriggers = game.triggers._getTriggersFromTokens(game.triggers.triggers, [entity.token], "click");
        game.triggers._executeTriggers(downTriggers);
    }

    showControlReference() {
        const keybindings = ["translate", "rotate", "scale", "toggleGizmo", "toggleMode"];
        const kbObj = {};
        keybindings.forEach((key) => {
            kbObj[key] = game.keybindings.get("levels-3d-preview", key)[0];
            kbObj[key].key = kbObj[key].key.replace("Key", "");
        });

        let controlsReference = `
    <h2>${game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.title`)}</h2>
    `;
        for (let [k, v] of Object.entries(kbObj)) {
            const mods = (v.modifiers.length = v.modifiers.join("+"));
            controlsReference += `<p><strong>${game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.${k}`)}</strong>: ${mods + (v.modifiers.length ? " + " : "") + v.key}</p>`;
        }
        controlsReference += `<p>${game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.clone`)}</p>`;
        controlsReference += `<p>${game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.select`)}</p>`;

        //controlsReference += `<p>${game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.wheel`)}</p>`

        ChatMessage.create({
            content: controlsReference,
            whisper: [game.user.id],
            flavor: game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.title`),
            flags: {
                core: {
                    canPopout: true,
                },
            },
        });
    }

    async removeWASDBindings() {
        Dialog.confirm({
            title: game.i18n.localize(`levels3dpreview.keybindings.dialog.title`),
            content: game.i18n.localize(`levels3dpreview.keybindings.dialog.content`),
            yes: async () => {
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
            },
            no: () => {
                game.settings.set("levels-3d-preview", "removeKeybindingsPrompt", true);
            },
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
                canvas.effects.visibility.refresh();
            }
        });

        Hooks.on("renderSceneControls", () => {
            if (game.Levels3DPreview?._active) {
                game.Levels3DPreview?.interactionManager?.updateHoverObjNoDebounce();
            }
        });
    }
}
