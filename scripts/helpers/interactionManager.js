import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../entities/ruler3d.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from '../lib/three-mesh-bvh.js';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class InteractionManager {
    constructor(levels3dPreview){
        this._draggable = null;
        this._parent = levels3dPreview;
        this._panKeys = {};
        this._gizmoEnabled = true;
        this.raycaster = new THREE.Raycaster();
        //this.raycaster.firstHitOnly = true;
        this.sightRaycaster = new THREE.Raycaster();
        this.sightRaycaster.firstHitOnly = true;
        this._sightCollisions = [];
        this.mouse = new THREE.Vector2();
        this.mousemove = new THREE.Vector2();
        this.controls = levels3dPreview.controls;
        this.camera = levels3dPreview.camera;
        this.domElement = levels3dPreview.renderer.domElement;
        this.ruler = levels3dPreview.ruler;
        this.factor = levels3dPreview.factor;
        this.clicks = 0;
        this.lcTime = 0;
        this.controls.enableRotate = !this.isCameraLocked
        this.generateSightCollisions = debounce(this.generateSightCollisions.bind(this), 100);
        this.updateHoverObj = debounce(this.updateHoverObj.bind(this), 100);
    }

    get scene(){
      return this._parent.scene;
    }

    get elevationTick(){
      return (canvas.dimensions.size/canvas.dimensions.distance)/this.factor
    }

    get cursorPositionTo2D(){
      return {
        x: (this._currentMousePosition.x ?? 0) * factor,
        y: (this._currentMousePosition.y ?? 0) * factor
      }
    }

    generateSightCollisions(){
      const collisionObjects = [];
      for(let tile of Object.values(this._parent.tiles)){
        if(!tile.collision) continue;
        if(tile.mesh?.visible) collisionObjects.push(tile.mesh);
      }
      for(let wall of Object.values(this._parent.walls)){
        if(wall.placeable.isDoor && wall.placeable.data.ds === CONST.WALL_DOOR_STATES.OPEN) continue;
        if(!wall.mesh?.visible) continue;
        collisionObjects.push(wall.mesh);
      }
      this._sightCollisions = collisionObjects;
    }

    computeSightCollision(v1,v2){
      const origin = Ruler3D.posCanvasTo3d(v1);
      const target = Ruler3D.posCanvasTo3d(v2);
      return this.computeSightCollisionFrom3DPositions(origin, target);
    }

    computeSightCollisionFrom3DPositions(origin,target){
      const direction = target.clone().sub(origin).normalize();
      const distance = origin.distanceTo(target);
      this.sightRaycaster.set(origin, direction);
      const collisions = this.sightRaycaster.intersectObjects(this._sightCollisions, true);
      if(!collisions.length) return false;
      const collision = collisions[0];
      if(collision.distance > distance) return false;
      return collision.point;
    }

    activateListeners() {
        this.domElement.addEventListener("mousedown", this._onMouseDown.bind(this), false);
        //this.domElement.addEventListener("mousedown", this._onEnableRuler.bind(this), false);
        this.domElement.addEventListener("mouseup", this._onMouseUp.bind(this), false);
        this.domElement.addEventListener("mousemove", this._onMouseMove.bind(this), false);
        this.domElement.addEventListener("wheel", this._onWheel.bind(this), false);
        this.domElement.addEventListener("drop", this._onDrop.bind(this))
        document.addEventListener("keydown", this._onKeyDown.bind(this));
        document.addEventListener("keyup", this._onKeyUp.bind(this));
        //add keydown event

      }

    initTransformControls(){
      const ts = this._parent.transformControls;
      const snapSize = canvas.scene.dimensions.size/factor/2;
      ts.setTranslationSnap(snapSize);
      ts.setRotationSnap(Math.PI/4);
      ts.setScaleSnap(snapSize);
      ts.addEventListener("mouseUp", this._onTransformEnd.bind(this));
      ts.addEventListener("mouseDown", this._onTransformStart.bind(this));
    }

      get allowedRulerDrag(){
        return [
          "MeasuredTemplate",
          "AmbientLight",
        ]
      }

      _onTransformStart(event){
        this.controls.enabled = false;
        this.preventSelect = true;
        if(this.isCtrl){
          const object3d = event.target.object.userData.entity3D;
          if(!object3d) return;
          const objData = object3d.placeable.document.data;
          setTimeout(()=>{canvas.scene.createEmbeddedDocuments(object3d.placeable.document.documentName, [objData]);}) 
        }
      }

      _onTransformEnd(event){
        this.controls.enabled = true;
        this.preventSelect = false;
        const object3d = event.target.object.userData.entity3D;
        if(!object3d) return;
        object3d.updateFromTransform();
      }

      toggleGizmo(){
        this._gizmoEnabled = !this._gizmoEnabled;
        if(!this._gizmoEnabled){ this._parent.transformControls.detach();}
        else{
          if(canvas.activeLayer.options.objectClass.name !== "Tile") return;
          Object.values(game.Levels3DPreview.tiles).forEach(tile3d => { tile3d.updateControls() })
        }
      }

      isRulerDrag(event, intersectData){
        if(ui.controls.activeTool === "select") return false
        if(!ui.controls.isRuler && !this.allowedRulerDrag.some(a => a=== canvas.activeLayer.options.objectClass.embeddedName) ) return false
        if(!this.mouseIntersection3DCollision({x:event.clientX, y: event.clientY})?.length) return false
        if(this.allowedRulerDrag.some(a => a=== intersectData?.object?.userData?.entity3D?.embeddedName)) return false
        return true;
      }

      _onEnableRuler(event){
        if(event.which === 1){
          const rulerObj = new THREE.Object3D()
          rulerObj.userData = {
              entity3D: {
                updatePositionFrom3D : () => {return true},
                mesh: rulerObj,
                elevation3d: 0
              }
            }
          rulerObj.parent = rulerObj.userData.entity3D.mesh
          this.toggleControls(false);
          const position = this.mouseIntersection3DCollision({x:event.clientX, y: event.clientY});
          const intersectPos = position[0].point
          rulerObj.position.set(intersectPos.x, intersectPos.y, intersectPos.z)
          this.draggable = rulerObj
        }else if(event.which === 3 && this.draggable){
          this.ruler.template?.destroy();
          this.ruler.template = null;
          this.draggable = null;
        }
      }

      _onDrop(event) {
        if(!game.Levels3DPreview._active) return;
        event.preventDefault();
    
        // Try to extract the data
        let data;
        try {
          data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }
        catch (err) {
          return false;
        }
        const coord3d = this.screen3DtoCanvas2DWithCollision({x:event.clientX, y: event.clientY})
        data.x = coord3d.x
        data.y = coord3d.y
        data.elevation = coord3d.z
        data.flags = {
          levels: {
            rangeBottom: coord3d.z
          },
          betterroofs: {
            brMode: 2,
          }
        }
        if(data.type === "Actor"){
          Hooks.once("preCreateToken", (token)=>{
            token.data.update({elevation: Math.trunc(data.elevation*100)/100, flags: data.flags})
          })
          return canvas.tokens._onDropActorData(event, data);
        }
        data.flags["levels-3d-preview"] = {
          model3d: data.img
        }
        if(data.type === "Tile"){
          const useSnapped = Ruler3D.useSnapped();
          const size = canvas.grid.size*(canvas.grid.size/data.tileSize);
          let snapped;
          if(useSnapped){
            snapped = canvas.grid.getSnappedPosition(data.x - size/2,data.y - size/2)
          }
          canvas.scene.createEmbeddedDocuments("Tile", [{
            x: snapped ? snapped.x : data.x - size/2,
            y: snapped ? snapped.y : data.y - size/2,
            width: size,
            height: size,
            img: "modules/levels-3d-preview/assets/blank.webp",
            overhead: canvas.activeLayer.name !== "BackgroundLayer",
            flags: data.flags,
          }])
        }
      }

    _onMouseDown(event){
      if(this.preventSelect) return;
      this._parent.stopCameraAnimation();
      this._downCameraPosition = this._parent.camera.position.clone();
      if(event.which === 1 && event.ctrlKey) canvas.activeLayer.releaseAll();
      this.mousedown = true;
      if(event.which === 1) this._leftDown = true;
      if(event.which === 3) this._rightDown = true;
      this.mousePosition = { x: event.clientX, y: event.clientY };
      if(event.which !== 1 && event.which !== 3) return;
      //if(event.shiftKey) return;
      const intersectData = this.findMouseIntersect(event);
      const intersect = intersectData?.object;
      if(this.isRulerDrag(event, intersectData)) this.toggleControls(false);
      if(!intersect || event.ctrlKey) return;
      if(intersect.userData?.entity3D?.embeddedName === canvas.activeLayer.options.objectClass.embeddedName)this.toggleControls(false);
      this.clicks++;
      event.entity = intersect.userData.entity3D
      event.intersect = intersect;
      event.position3D = intersectData.point;
      this.prevEventData = this.eventData ?? null;
      this.eventData = {
        entity: event.entity,
        position3D: event.position3D,
        intersect: event.intersect,
      }
      if (this.clicks === 1) {
        setTimeout(() => {
          if(event.which === 1){
            this.mousedown ? this.startDrag(event, intersectData) : this._triggerLeft = true;
          }else{
            this._triggerRight = true;
          }
        }, 250);
      }else{
        if(this.draggable) return this.cancelDrag();
        else event.which === 1 ? this._triggerLeft2 = true : this._triggerRight2 = true;
        this.toggleControls(true);
      }
    }

    set clicks(val){
      this._clicks = val;
      if(val === 0){
        this._triggerLeft = false;
        this._triggerRight = false;
        this._triggerLeft2 = false;
        this._triggerRight2 = false;
        this.prevEventData = null;
        this.eventData = null;
      }
    }

    get clicks(){
      return this._clicks;
    }

    _onMouseUp(event){
      if(event.which === 1) this._leftDown = false;
      if(event.which === 3) this._rightDown = false;
      if(!this._leftDown && !this._rightDown) this.toggleControls(true);
      this._upCameraPosition = this._parent.camera.position.clone();
      event.entity = this.eventData?.entity;
      event.intersect = this.eventData?.intersect;
      event.position3D = this.eventData?.position3D;
      setTimeout(() => {
      if(this.prevEventData && this.prevEventData.entity !== this.eventData.entity) return this.clicks = 0;
      if(this._triggerLeft2) this._onClickLeft2(event);
      else if(this._triggerLeft) this._onClickLeft(event);
      if(this._triggerRight2) this._onClickRight2(event);
      else if(this._triggerRight) this._onClickRight(event);
      if(this._triggerLeft || this._triggerRight || this._triggerLeft2 || this._triggerRight2) this.clicks = 0;
      }, 250);
      this.mousedown = false;
      if(event.which !== 1) return;
      if(this.draggable){
        this.draggable.position.copy(this.currentDragTarget);
        this.ruler.placeTemplate();
        if(!this.draggable?.userData.entity3D.updatePositionFrom3D(event)) this.cancelDrag();
        this.draggable = null;
        this.clicks = 0;
      }
      this.toggleControls(true, true);
    }

    updateHoverObj(){
      this._hoverobj = this._parent.scene.children.filter(this._collisionFilter);
    }

    updateHoverObjNoDebounce(){
      this._hoverobj = this._parent.scene.children.filter(this._collisionFilter);
    }

    _onMouseMove(event){
      this.mousemove.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mousemove.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.updateHoverObj();
      const intersect = this.getHoverObject();
      const object = intersect?.object;
      //Handle placeable hover event
      if(intersect?.point){
        this.canvas2dMousePosition = Ruler3D.pos3DToCanvas(intersect.point)
        this.canvas3dMousePosition = intersect.point
      }
      if(object && object?.userData?.entity3D?.placeable){
        if(this.currentHover?.placeable?.id !== object?.userData?.entity3D?.placeable?.id) this.currentHover?._onHoverOut(event);
        if(this.currentHover !== object.userData.entity3D){
          this.currentHover = object.userData.entity3D
          this.currentHover._onHoverIn(event);
        }
      }else{
        this.currentHover?._onHoverOut(event);
        this.currentHover = null;
      }

      if(game.user.hasPermission("SHOW_CURSOR")){
        this.broadcastCursorPosition(intersect?.point);
      }

    }

    _clippingFilter(i){
      if(!i.object.material?.clippingPlanes) return true;
      return i.object.material?.clippingPlanes[0].constant > i.point.y
    }

    getHoverObject(){
      if(!this._hoverobj || !this._hoverobj.length) this._hoverobj = this._parent.scene.children.filter(this._collisionFilter);
      this.raycaster.setFromCamera(this.mousemove, this.camera);
      const intersects = this.raycaster.intersectObjects(this._hoverobj, true).filter(this._clippingFilter);
      if(!intersects.length) return null;
      let parentInt
      if(!intersects[0].object.userData.entity3D && !intersects[0].object.userData.ignoreHover) intersects[0].object.traverseAncestors(parent => {
        if(parent.userData.entity3D && !parentInt) parentInt = parent;
      });
      return {
        object: parentInt ?? intersects[0].object,
        point: intersects[0].point
      }
    }

    _collisionFilter(object){
      if(object.userData.ignoreHover) return false;
      if(!canvas.activeLayer) return true;
      if(canvas.activeLayer.options.objectClass.embeddedName !== object.userData?.entity3D?.embeddedName && object.userData?.entity3D?.embeddedName !== "Note" && object.userData?.entity3D?.embeddedName !== "Tile") return false;
      if(canvas.activeLayer.options.objectClass.embeddedName !== "Tile" && object.userData?.entity3D?.embeddedName === "Tile" && !object.userData?.entity3D?.collision) return false
      if(!object.visible) return false;
      return true;
    }

    _onWheel(event){
      this._parent.stopCameraAnimation();
      if(this.draggable){
        const delta = Math.sign(event.deltaY);
        const entity3D = this.draggable.userData.entity3D;
        if(entity3D.template){
          entity3D.onRotate(delta);
        }else{
          this.forceFree = true;
          entity3D.wasFreeMode = true;
        }
        let elevationDiff = canvas.scene.dimensions.distance;
        if(event.shiftKey) elevationDiff = canvas.scene.dimensions.distance/5;
        if(event.ctrlKey) elevationDiff = canvas.scene.dimensions.distance/50;
        entity3D.elevation3d += -delta*this.elevationTick*elevationDiff;
        if(game.settings.get("levels-3d-preview", "preventNegative") && entity3D.elevation3d < 0){
          entity3D.elevation3d = 0;
        }
      }
      const isSpecialKey = this.tiltX || this.tiltZ || this.scaleWidth || this.scaleHeight || this.scaleGap || this.scaleScale || this.scale;
      const dBig = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 60 : 45;
      let snap = event.shiftKey ? dBig : 15;
      const delta = Math.sign(event.deltaY)*snap;
      if(!this.draggable && event.ctrlKey && !isSpecialKey && !event.altKey && canvas.activeLayer.controlled.length){
        canvas.activeLayer.rotateMany({delta,snap});
      }
      if(!this.draggable && (isSpecialKey) && event.ctrlKey && canvas.activeLayer.controlled.length){
        let updates = [];
        const multi = Math.sign(event.deltaY) < 0 ? 1.1 : 0.9;
        const gridS = -Math.sign(event.deltaY)*canvas.grid.size;
        for(let placeable of canvas.activeLayer.controlled){
          const width = placeable.data.width;
          const height = placeable.data.height;
          const gap = placeable.document.getFlag("levels-3d-preview", "gap") ?? 0;
          const tileScale = placeable.document.getFlag("levels-3d-preview", "tileScale") ?? 1;
          const isTiled = placeable.document.getFlag("levels-3d-preview", "fillType") === "tile";
          const tiltX = placeable.document.getFlag("levels-3d-preview", "tiltX") ?? 0;
          const tiltZ = placeable.document.getFlag("levels-3d-preview", "tiltZ") ?? 0;
          const newWidth = isTiled ? (width+gridS)-(width+gridS)%gridS : width*multi;
          const newHeight = isTiled ? (height+gridS)-(height+gridS)%gridS : height*multi;
          const newTiltX = tiltX+delta;
          const newTiltZ = tiltZ+delta*(-1);
          const update = {
            _id: placeable.id,
            width: this.scaleHeight ? width : newWidth,
            height: this.scaleWidth ? height : newHeight,
            x: isTiled ? placeable.data.x : placeable.data.x - (newWidth - width)/2,
            y: isTiled ? placeable.data.y : placeable.data.y - (newHeight - height)/2,
            flags: {
              "levels-3d-preview": {
                gap: this.scaleGap ? gap+(gridS/factor)/5 : gap,
                tileScale: Math.max(0.00001, this.scaleScale ? tileScale*multi : tileScale),
                tiltX: this.tiltX ? newTiltX : tiltX,
                tiltZ: this.tiltZ ? newTiltZ : tiltZ
              }
            }
          }
          if(!this.scale && !this.scaleHeight && !this.scaleWidth){
            update.width = width;
            update.height = height;
            update.x = placeable.data.x;
            update.y = placeable.data.y;
          }
          updates.push(update);
        }
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName,updates);
      }

    }

    startDrag(event, intersectData){
      if(this.isRulerDrag(event, intersectData)) return this._onEnableRuler(event);
      const entity = event.entity;
      if(!entity) return this.abortDrag();
      const intersect = event.intersect;
      const placeable = entity.placeable;
      if(placeable?.data?.locked) return this.abortDrag();
      if(!placeable?.isOwner && !game.user.isGM) return this.abortDrag();
      if(!entity.draggable || entity.mesh.userData?.entity3D?.embeddedName !== canvas.activeLayer.options.objectClass.embeddedName) return this.abortDrag();
      if(!placeable._controlled) placeable.control({releaseOthers: true});
      entity.isAnimating = false;
      entity.setPosition?.();
      this.draggable = intersect;
      this.toggleControls(false);
    }

    abortDrag(){
      this.draggable = null;
      this.clicks = 0;
      this.toggleControls(true, true);
    }

    _onClickLeft(event){
      if(ui.controls.isRuler || this.draggable) return;
      const entity = event.entity;
      if((entity?.tile && canvas.activeLayer.options.objectClass.name !== "Tile") || !entity){
        if(this._downCameraPosition.distanceTo(this._upCameraPosition)<0.01) canvas.activeLayer.releaseAll();
      }
      if(!entity) return
      const intersect = event.intersect;
      this.handleTriggerHappy(entity);
      entity._onClickLeft(event);
      if(event.altKey || !this.mousedown || !(entity.isOwner || game.user.isGM)){
        this.toggleControls(true, true);
      }      
    }

    _onClickRight(event){
      const entity = event.entity;
      if(!entity) return;
      const intersect = event.intersect;
      if(entity.type === "Wall") {
        entity._onClickRight(event);
        return this.toggleControls(true);
      }
      if(this.draggable) return this.cancelDrag();
      else (entity.isOwner || game.user.isGM) && entity._onClickRight(event);
      this.toggleControls(true);
    }

    _onClickLeft2(event){
      const entity = event.entity;
      if(!entity) return;
      const intersect = event.intersect;
      entity._onClickLeft2(event)
    }

    _onClickRight2(event){
      const entity = event.entity;
      if(!entity) return;
      const intersect = event.intersect;
      entity._onClickRight2(event)
    }

    _onKeyDown(event){
      if(event.ctrlKey){
        this.isCtrl = true;
        this.controls.enableZoom = false
      }
    }

    _onKeyUp(event){
      this.isCtrl = false;
      if(!this.draggable) this.controls.enableZoom = true
    }
  
    findMouseIntersect(event) {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      let intersectTargets = []
      for(let child of this.scene.children){
        if(canvas.activeLayer.options.objectClass.embeddedName !== child.userData?.entity3D?.embeddedName && child.userData?.entity3D?.embeddedName !== "Wall" && child.userData?.entity3D?.embeddedName !== "Tile"  && child.userData?.entity3D?.embeddedName !== "Note") continue;
        if(!child.visible) continue;
        if(canvas.activeLayer.options.objectClass.embeddedName !== "Tile" && child.userData?.entity3D?.embeddedName === "Tile" && !child.userData?.entity3D?.collision) continue;
        if(child.userData?.hitbox && child.userData.interactive) intersectTargets.push(child.userData.hitbox);
      }

      const board = this._parent.board;
      if(board) intersectTargets.push(board);
      const buildPlane = this._parent.grid.secondaryGrid
      if(buildPlane) intersectTargets.push(buildPlane);
      const table = this._parent.table;
      if(table) intersectTargets.push(table);

      const intersects = this.raycaster.intersectObjects(intersectTargets,true).filter(this._clippingFilter);
      if(!intersects.length) return null;
      let parentInt
      if(!intersects[0].object.userData.entity3D) intersects[0].object.traverseAncestors(parent => {
        if(parent.userData.entity3D && !parentInt) parentInt = parent;
      });
      if(parentInt) return {
        object: parentInt,
        point: intersects[0].point
      };
      return {
        object: intersects[0]?.object,
        point: intersects[0]?.point
      };
    }
  
    set draggable(object){
      this._draggable = object;
      const center = this._parent.canvasCenter;
      if(object){
        this.buildCollisionGeos();
        this.forceFree = object.userData.entity3D.wasFreeMode
        this.dragplane.position.set(center.x, object.userData.entity3D.mesh.position.y, center.z);
      }else{
        this.forceFree = false;
        this.dragplane.position.set(center.x, 0, center.z);
      }
      if(this.ruler && (canvas.scene.getFlag("levels-3d-preview", "enableRuler") ?? true)) this.ruler.object = object;
    }
  
    get draggable(){
      return this._draggable;
    }

    buildCollisionGeos(){
      const draggableId = this.draggable?.userData?.entity3D?.token?.id;
      const collisionObjects = Object.values(this._parent.tokens).filter(t => t.collisionPlane && t.token.id != draggableId).map(t => t.model);
      let collisionGeometries = collisionObjects;
      for(let tile of Object.values(this._parent.tiles)){
        if(!tile.collision && draggableId) continue;
        if(this.draggable?.userData?.entity3D?.tile?.id === tile.tile.id) continue;
        if(tile.mesh.visible)collisionGeometries.push(tile.mesh);
      }
      for(let wall of Object.values(this._parent.walls)){
        if(wall.placeable.isDoor && wall.placeable.data.ds === CONST.WALL_DOOR_STATES.OPEN && this.draggable) continue;
        if(!wall.mesh.visible) continue;
        collisionGeometries.push(wall.mesh);
      }
      const board = this._parent.board;
      if(board) collisionGeometries.push(board);
      const buildPlane = this._parent.grid.secondaryGrid
      if(buildPlane) collisionGeometries.push(buildPlane);
      const table = this._parent.table;
      if(table) collisionGeometries.push(table);
      collisionGeometries = collisionGeometries.filter(g => g);
      this._collisionGeometries = collisionGeometries;
    }

    toggleControls(toggle, reset = false){
      this.controls.enableRotate = !this.isCameraLocked && toggle;
      this.controls.enableZoom = toggle;
      if(reset) this.draggable = undefined;
    }

    get isCameraLocked(){
      const cameraLock = canvas.scene.getFlag("levels-3d-preview", "lockCamera");
      if(cameraLock === "all") return true;
      if(cameraLock === "players") return !game.user.isGM;
      return false;
    }

    screen3DtoCanvas2D(screenPosition){
      screenPosition.x = (screenPosition.x / window.innerWidth) * 2 - 1;
      screenPosition.y = -(screenPosition.y / window.innerHeight) * 2 + 1;
      screenPosition = new THREE.Vector2(screenPosition.x, screenPosition.y);
      this.raycaster.setFromCamera(screenPosition, this.camera);
      const intersects = this.raycaster.intersectObjects([this.dragplane], true);
      return intersects.length > 0 ? Ruler3D.pos3DToCanvas(intersects[0].point) : undefined;
    }

    screen3DtoCanvas2DWithCollision(screenPosition){
      const intersects = this.mouseIntersection3DCollision(screenPosition)
      const pos = intersects.length > 0 ? Ruler3D.pos3DToCanvas(intersects[0].point) : undefined;
      return pos;
    }

    mouseIntersection3DCollision(screenPosition, build = true){
      if(build || !this._collisionGeometries || !this._collisionGeometries.length) this.buildCollisionGeos();
      let collisionGeometries = this._collisionGeometries;
      if(screenPosition){
        this.mousemove.x = (screenPosition.x / window.innerWidth) * 2 - 1;
        this.mousemove.y = -(screenPosition.y / window.innerHeight) * 2 + 1;
      }
      this.raycaster.setFromCamera(this.mousemove, this.camera);
      const intersects = this.raycaster.intersectObjects(collisionGeometries, true)
      return intersects
    }

    mousePostionToWorld(){
      this.raycaster.setFromCamera(this.mousemove, this.camera);
      const intersects = this.raycaster.intersectObjects([this.dragplane], true);
      if (intersects.length > 0) {
        return intersects[0].point;
      }else{

        return new THREE.Vector3(0, 0, 0);
      }
    }
  
    dragObject(){
      if(!this.draggable) return;

      const collisionGeometries = this._collisionGeometries;
      const target = this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable;
      const isFree = this.isFreeMode || this.forceFree
      this.draggable.userData.entity3D.wasFreeMode = isFree;
      const center = this._parent.canvasCenter;
      if(this.draggable.userData.entity3D.mesh.position.y < 0){
      this.dragplane.position.set(center.x, this.draggable.userData.entity3D.mesh.position.y, center.z);
      }

      this.raycaster.setFromCamera(this.mousemove, this.camera);
      let intersects = this.raycaster.intersectObjects(collisionGeometries.length && !isFree ? collisionGeometries : [this.dragplane], true).filter(this._clippingFilter);
      if(!intersects.length) intersects = this.raycaster.intersectObjects([this.dragplane], true);

      if (intersects.length > 0) {
        const entity3D = this.draggable.userData.entity3D;
        const distance = target.position.distanceTo(intersects[0].point);
        let lerpFactor = 1/(1+distance*20);
        if(lerpFactor < 0.1) lerpFactor = 0.1;
        this.currentDragTarget = new THREE.Vector3(intersects[0].point.x, !isFree ? intersects[0].point.y : entity3D.elevation3d, intersects[0].point.z)
        target.position.lerp(this.currentDragTarget, lerpFactor);
        if(!isFree){
          entity3D.elevation3d = intersects[0].point.y;
          this.dragplane.position.set(center.x, intersects[0].point.y, center.z);
        }
        if(entity3D.template) entity3D.onMove();
        this.ruler.update();
      }
    }
  
    cancelDrag(){
      if(!this.draggable) return;
      const entity3D = this.draggable.userData.entity3D;
      entity3D.dragCanceled = true;
      this.draggable = undefined;
      if(entity3D.token)Hooks.call("updateToken", entity3D.token.document, {x: entity3D.token.data.x});
      if(entity3D.template)Hooks.call("updateMeasuredTemplate", entity3D.template.document, {x: entity3D.template.data.x});
      if(entity3D.tile) Hooks.call("updateTile", entity3D.tile.document, {x: entity3D.tile.data.x});
    }

    broadcastCursorPosition(pos3d){
      const sc = game.user.hasPermission("SHOW_CURSOR");
      if ( !sc ) return;
          //const pos3d = game.Levels3DPreview.interactionManager.mousePostionToWorld();
          //const position = {x: pos3d?.x, y: pos3d?.z}
          const position = {x: pos3d?.x, y: pos3d?.y, z: pos3d?.z}
          const positionToString = JSON.stringify(position);
          this._currentMousePosition = position
      game.user.broadcastActivity({
        cursor: {x: positionToString,y:0},
      });
    }

    handleTriggerHappy(entity){
      if(!entity) return;
      if(!entity.token || !game.triggers) return;
      const downTriggers = game.triggers._getTriggersFromTokens(game.triggers.triggers, [entity.token], "click");
      game.triggers._executeTriggers(downTriggers);
    }
    
    showControlReference(){
      const keybindings = ["translate", "rotate", "scale","toggleGizmo", "toggleMode" ]
      const kbObj = {}
      keybindings.forEach(key => {
        kbObj[key] = game.keybindings.get("levels-3d-preview", key)[0];
        kbObj[key].key = kbObj[key].key.replace("Key", "");
      })
    
      let controlsReference = `
    <h2>${game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.title`)}</h2>
    `
    for(let [k,v] of Object.entries(kbObj)){
      const mods = v.modifiers.length = v.modifiers.join("+");
      controlsReference += `<p><strong>${game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.${k}`)}</strong>: ${mods + (v.modifiers.length ? " + " : "") + v.key}</p>`
    }
    
    //controlsReference += `<p>${game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.wheel`)}</p>`
    
    ChatMessage.create({
      content: controlsReference,
      whisper: [game.user.id],
      flavor: game.i18n.localize(`levels3dpreview.tileEditor.controlsReference.title`),
      flags: {
        core: {
          canPopout: true
        }
      }
    })
    
    }

    async removeWASDBindings(){

      Dialog.confirm({
        title: game.i18n.localize(`levels3dpreview.keybindings.dialog.title`),
        content: game.i18n.localize(`levels3dpreview.keybindings.dialog.content`),
        yes: async () => {
          await game.keybindings.set("core","panUp",game.keybindings.get("core", "panUp").filter(b => b.key != "KeyW" && b.key != "ArrowUp" && b.key != "Numpad8"));
          await game.keybindings.set("core","panDown",game.keybindings.get("core", "panDown").filter(b => b.key != "KeyS" && b.key != "ArrowDown" && b.key != "Numpad2"));
          await game.keybindings.set("core","panLeft",game.keybindings.get("core", "panLeft").filter(b => b.key != "KeyA" && b.key != "ArrowLeft" && b.key != "Numpad4"));
          await game.keybindings.set("core","panRight",game.keybindings.get("core", "panRight").filter(b => b.key != "KeyD" && b.key != "ArrowRight" && b.key != "Numpad6"));
          await game.settings.set("levels-3d-preview", "removeKeybindingsPrompt", true);
        },
        no: () => {
          game.settings.set("levels-3d-preview", "removeKeybindingsPrompt", true);
        },
      })
    }
}

Hooks.on("updateTile", () => {
  if(game.Levels3DPreview?._active){
    game.Levels3DPreview?.interactionManager?.generateSightCollisions();
  }
})

Hooks.on("createTile", () => {
  if(game.Levels3DPreview?._active && game.Levels3DPreview?.object3dSight){
    game.Levels3DPreview?.interactionManager?.generateSightCollisions();
  }
})

Hooks.on("deleteTile", () => {
  if(game.Levels3DPreview?._active){
    game.Levels3DPreview?.interactionManager?.generateSightCollisions();
  }
})

Hooks.on("updateWall", () => {
  if(game.Levels3DPreview?._active){
    game.Levels3DPreview?.interactionManager?.generateSightCollisions();
  }
})

Hooks.on("createWall", () => {
  if(game.Levels3DPreview?._active){
    game.Levels3DPreview?.interactionManager?.generateSightCollisions();
  }
})

Hooks.on("deleteWall", () => {
  if(game.Levels3DPreview?._active){
    game.Levels3DPreview?.interactionManager?.generateSightCollisions();
  }
})

Hooks.on("3DCanvasSceneReady", () => {
  if(game.Levels3DPreview?._active){
    game.Levels3DPreview?.interactionManager?.generateSightCollisions();
    canvas.sight.refresh();
  }
})

Hooks.on("renderSceneControls", ()=>{
  if(game.Levels3DPreview?._active){
    game.Levels3DPreview?.interactionManager?.updateHoverObjNoDebounce();
  }
})