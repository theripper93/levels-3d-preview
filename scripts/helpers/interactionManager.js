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
        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;
        this.mouse = new THREE.Vector2();
        this.mousemove = new THREE.Vector2();
        this.controls = levels3dPreview.controls;
        this.camera = levels3dPreview.camera;
        this.domElement = levels3dPreview.renderer.domElement;
        this.ruler = levels3dPreview.ruler;
        this.factor = levels3dPreview.factor;
        this.clicks = 0;
        this.lcTime = 0;
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

    activateListeners() {
        this.domElement.addEventListener("mousedown", this._onMouseDown.bind(this), false);
        this.domElement.addEventListener("mousedown", this._onEnableRuler.bind(this), false);
        this.domElement.addEventListener("mouseup", this._onMouseUp.bind(this), false);
        this.domElement.addEventListener("mousemove", this._onMouseMove.bind(this), false);
        this.domElement.addEventListener("wheel", this._onWheel.bind(this), false);
        this.domElement.addEventListener("drop", this._onDrop.bind(this))
        document.addEventListener("keydown", this._onKeyDown.bind(this));
        document.addEventListener("keyup", this._onKeyUp.bind(this));
        //add keydown event

      }

      _onEnableRuler(event){
        if(!ui.controls.isRuler && !canvas.templates._active) return
        if(ui.controls.activeTool === "select") return
        const intersectData = this.findMouseIntersect(event);
        if(intersectData?.object?.userData?.entity3D?.embeddedName == "MeasuredTemplate") return
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
          const position = this.mouseIntersection3DCollision({x:event.clientX, y: event.clientY})
          if(!position.length) return
          this.toggleControls(false);
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
          }
        }
        if(data.type !== "Actor") return false
        Hooks.once("preCreateToken", (token)=>{
          token.data.update({elevation: data.elevation.toFixed(2), flags: data.flags})
        })
        return canvas.tokens._onDropActorData(event, data);
      }

    _onMouseDown(event){
      this._parent.stopCameraAnimation();
      this.mousedown = true;
      this.mousePosition = { x: event.clientX, y: event.clientY };
      if(event.which !== 1 && event.which !== 3) return;
      //if(event.shiftKey) return;
      const intersectData = this.findMouseIntersect(event);
      const intersect = intersectData?.object;
      if(!intersect){
        if(event.which === 1 && event.ctrlKey) canvas.tokens.releaseAll();
         return;
      }
      if(event.ctrlKey) return;
      if(intersect.userData?.entity3D?.embeddedName !== "Tile")this.toggleControls(false);
      this.clicks++;
      event.entity = intersect.userData.entity3D
      event.intersect = intersect;
      event.position3D = intersectData.point;
      if (this.clicks === 1) {
        setTimeout(() => {
          if(this.clicks !== 1) return this.clicks = 0;
          if(event.which === 1){
            this._onClickLeft(event);
          }else{
            this._onClickRight(event);
          }
          this.clicks = 0;
        }, 250);
      }else{
        this.clicks = 0;
        if(this.draggable) return this.cancelDrag();
        else event.which === 1 ? this._onClickLeft2(event) : this._onClickRight2(event);
        this.toggleControls(true);
      }
    }

    _onMouseUp(event){
      this.mousedown = false;
      if(event.which !== 1) return;
      if(this.draggable){
        this.ruler.placeTemplate();
        if(!this.draggable?.userData.entity3D.updatePositionFrom3D(event)) this.cancelDrag();
        this.draggable = null;
      }
      this.toggleControls(true, true);
    }

    _onMouseMove(event){
      this.mousemove.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mousemove.y = -(event.clientY / window.innerHeight) * 2 + 1;
      const intersect = this.getHoverObject();
      const object = intersect?.object;
      //Handle placeable hover event
      if(intersect?.point){
        this.canvas2dMousePosition = Ruler3D.pos3DToCanvas(intersect.point)
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

    getHoverObject(){
      if(!this._hoverobj || !this._hoverobj.length || this._prevSceneChildrenCount !== this.scene.children.length) this._hoverobj = this._parent.scene.children.filter(this._collisionFilter);
      this._prevSceneChildrenCount = this._parent.scene.children.length;
      this.raycaster.setFromCamera(this.mousemove, this.camera);
      const intersects = this.raycaster.intersectObjects(this._hoverobj, true)
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
      return true;
    }

    _onWheel(event){
      this._parent.stopCameraAnimation();
      if(this.draggable){
        const delta = Math.sign(event.deltaY);
        const entity3D = this.draggable.userData.entity3D;
        if(entity3D.template){
          entity3D.onRotate(delta);
        }
        let elevationDiff = 5;
        if(event.shiftKey) elevationDiff = 1;
        if(event.ctrlKey) elevationDiff = 0.1;
        entity3D.elevation3d += -delta*this.elevationTick*elevationDiff;
        if(game.settings.get("levels-3d-preview", "preventNegative") && entity3D.elevation3d < 0){
          entity3D.elevation3d = 0;
        }
      }
      if(!this.draggable && event.ctrlKey && canvas.tokens.controlled.length){
        const dBig = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 60 : 45;
        let snap = event.shiftKey ? dBig : 15;
        const delta = Math.sign(event.deltaY)*snap;
        canvas.tokens.rotateMany({delta,snap});
      }

    }

    _onClickLeft(event){
      if(ui.controls.isRuler) return
      const entity = event.entity;
      const intersect = event.intersect;
      this.handleTriggerHappy(entity);
      entity._onClickLeft(event);
      if(event.altKey || !this.mousedown || !entity.isOwner){
        this.toggleControls(true, true);
        return this.clicks = 0;
      }
      entity.isAnimating = false;
      entity.setPosition();
      if(!entity.draggable) return this.toggleControls(true, true);
      this.draggable = intersect;
      this.toggleControls(false);
    }

    _onClickRight(event){
      const entity = event.entity;
      const intersect = event.intersect;
      if(entity.type === "Wall") {
        entity._onClickRight(event);
        return this.toggleControls(true);
      }
      if(this.draggable) return this.cancelDrag();
      else entity.isOwner && entity._onClickRight(event);
      this.toggleControls(true);
    }

    _onClickLeft2(event){
      const entity = event.entity;
      const intersect = event.intersect;
      entity._onClickLeft2(event)
    }

    _onClickRight2(event){
      const entity = event.entity;
      const intersect = event.intersect;
      entity._onClickRight2(event)
    }

    _onKeyDown(event){
      if(event.ctrlKey){
        this.controls.enableZoom = false
      }
    }

    _onKeyUp(event){
      if(!this.draggable) this.controls.enableZoom = true
    }
  
    findMouseIntersect(event) {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      let intersectTargets = []
      for(let child of this.scene.children){
        if(canvas.activeLayer.options.objectClass.embeddedName !== child.userData?.entity3D?.embeddedName && child.userData?.entity3D?.embeddedName !== "Wall" && child.userData?.entity3D?.embeddedName !== "Tile") continue;
        if(child.userData?.hitbox && child.userData.interactive) intersectTargets.push(child.userData.hitbox);
      }
      const intersects = this.raycaster.intersectObjects(intersectTargets,true);
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
        this.dragplane.position.set(center.x, object.userData.entity3D.mesh.position.y, center.z);
      }else{
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
        collisionGeometries.push(tile.mesh);
      }
      for(let wall of Object.values(this._parent.walls)){
        if(wall.placeable.isDoor && wall.placeable.data.ds === CONST.WALL_DOOR_STATES.OPEN && this.draggable) continue;
        collisionGeometries.push(wall.mesh);
      }
      const board = this._parent.board;
      if(board) collisionGeometries.push(board);
      const table = this._parent.table;
      if(table) collisionGeometries.push(table);
      collisionGeometries = collisionGeometries.filter(g => g);
      this._collisionGeometries = collisionGeometries;
    }

    toggleControls(toggle, reset = false){
      this.controls.enableRotate = toggle;
      this.controls.enableZoom = toggle;
      if(reset) this.draggable = undefined;
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
      const isFree = this.isFreeMode

      const center = this._parent.canvasCenter;
      if(this.draggable.userData.entity3D.mesh.position.y < 0){
      this.dragplane.position.set(center.x, this.draggable.userData.entity3D.mesh.position.y, center.z);
      }

      this.raycaster.setFromCamera(this.mousemove, this.camera);
      let intersects = this.raycaster.intersectObjects(collisionGeometries.length && !isFree ? collisionGeometries : [this.dragplane], true);
      if(!intersects.length) intersects = this.raycaster.intersectObjects([this.dragplane], true);

      if (intersects.length > 0) {
        const entity3D = this.draggable.userData.entity3D;
        const distance = target.position.distanceTo(intersects[0].point);
        let lerpFactor = 1/(1+distance*20);
        if(lerpFactor < 0.1) lerpFactor = 0.1;
        target.position.lerp(new THREE.Vector3(intersects[0].point.x, !isFree ? intersects[0].point.y : entity3D.elevation3d, intersects[0].point.z), lerpFactor);
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
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      setTimeout(() => {
        this.toggleControls(true);
      }, 150);
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
}