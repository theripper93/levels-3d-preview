import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';

export class InteractionManager {
    constructor(levels3dPreview){
        this._draggable = null;
        this._parent = levels3dPreview;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.mousemove = new THREE.Vector2();
        this.controls = levels3dPreview.controls;
        this.camera = levels3dPreview.camera;
        this.domElement = levels3dPreview.renderer.domElement;
        this.ruler = levels3dPreview.ruler;
        this.factor = levels3dPreview.factor;
        this.clicks = 0;
        this.lcTime = 0;
        this.elevationTick = (canvas.dimensions.size/canvas.dimensions.distance)/this.factor;
    }

    get scene(){
      return this._parent.scene;
    }

    get cursorPositionTo2D(){
      return {
        x: (this._currentMousePosition.x ?? 0) * factor,
        y: (this._currentMousePosition.y ?? 0) * factor
      }
    }

    activateListeners() {
        this.domElement.addEventListener("mousedown", this._onMouseDown.bind(this), false);
        this.domElement.addEventListener("mouseup", this._onMouseUp.bind(this), false);
        this.domElement.addEventListener("mousemove", this._onMouseMove.bind(this), false);
        this.domElement.addEventListener("wheel", this._onWheel.bind(this), false);
        document.addEventListener("keydown", this._onKeyDown.bind(this));
        document.addEventListener("keyup", this._onKeyUp.bind(this));
        //add keydown event

      }

    _onMouseDown(event){
      this.mousedown = true;
      this.mousePosition = { x: event.clientX, y: event.clientY };
      if(event.which !== 1 && event.which !== 3) return;
      //if(event.shiftKey) return;
      const intersect = this.findMouseIntersect(event);
      if(!intersect){
        if(event.which === 1 && event.ctrlKey) canvas.tokens.releaseAll();
         return;
      }
      if(event.ctrlKey) return;
      this.toggleControls(false);
      this.clicks++;
      event.entity = intersect.userData.entity3D
      event.intersect = intersect;
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
        if(!this.draggable.userData.entity3D.updatePositionFrom3D(event)) this.cancelDrag();
      }
      this.toggleControls(true, true);
    }

    _onMouseMove(event){
      this.mousemove.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mousemove.y = -(event.clientY / window.innerHeight) * 2 + 1;
      if(!this.positionBroadcasted && game.user.hasPermission("SHOW_CURSOR")){
        this.positionBroadcasted = true;
        this.broadcastCursorPosition();
        setTimeout(() => {
          this.positionBroadcasted = false;
        }, 60);
      }

    }

    _onWheel(event){
      if(this.draggable){
        const delta = event.deltaY;
        const entity3D = this.draggable.userData.entity3D;
        let elevationDiff = 5;
        if(event.shiftKey) elevationDiff = 1;
        if(event.ctrlKey) elevationDiff = 0.1;
        //change y position
        if(delta > 0){
          entity3D.elevation3d -= this.elevationTick*elevationDiff;
        }else{
          entity3D.elevation3d += this.elevationTick*elevationDiff;
        }
        if(game.settings.get("levels-3d-preview", "preventNegative") && entity3D.elevation3d < 0){
          entity3D.elevation3d = 0;
        }
      }
      if(!this.draggable && event.ctrlKey && canvas.tokens.controlled.length){
        const delta = event.deltaY/20;
        canvas.tokens.rotateMany({delta})
      }

    }

    _onClickLeft(event){
      const entity = event.entity;
      const intersect = event.intersect;
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
        if(child.userData?.hitbox && child.userData.interactive) intersectTargets.push(child.userData.hitbox);
      }
      const intersects = this.raycaster.intersectObjects(intersectTargets, true);
      return intersects[0]?.object;
    }
  
    set draggable(object){
      this._draggable = object;
      const center = this._parent.canvasCenter;
      if(object){
        this.dragplane.position.set(center.x, object.userData.entity3D.mesh.position.y, center.z);
      }else{
        this.dragplane.position.set(center.x, 0, center.z);
      }
      if(this.ruler && (canvas.scene.getFlag("levels-3d-preview", "enableRuler") ?? true)) this.ruler.object = object;
    }
  
    get draggable(){
      return this._draggable;
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
      return intersects.length > 0 ? this.ruler.pos3DToCanvas(intersects[0].point) : undefined;
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
      const target = this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable;
      this.raycaster.setFromCamera(this.mousemove, this.camera);
      const intersects = this.raycaster.intersectObjects([this.dragplane], true);
      let intersects2 = [];
      if(canvas.scene.getFlag("levels-3d-preview", "enableCollision") && !keyboard._downKeys.has("f") && !keyboard._downKeys.has("F")){
      const collisionObjects = Object.values(this._parent.tokens).filter(t => t.collisionPlane).map(t => t.model);
      let collisionGeometries = [];
      for(let collObj of collisionObjects){
        collObj.traverse(child => {
          if(child.geometry) collisionGeometries.push(child);
                })
      }
      for(let tile of Object.values(this._parent.tiles)){
        collisionGeometries.push(tile.mesh);
      }
      const board = this._parent.board;
      if(board) collisionGeometries.push(board);
      const offset = canvas.scene.getFlag("levels-3d-preview", "enableCollision") == 1 ? target?.userData?.entity3D?.d ?? 1 : 100;
      let targetPos = new THREE.Vector3(target.position.x, target.position.y+offset, target.position.z);
      this.raycaster.set(targetPos, new THREE.Vector3(0, -1, 0));
      intersects2 = this.raycaster.intersectObjects(collisionGeometries, true);
      const center = this._parent.canvasCenter;
      this.dragplane.position.set(center.x, this.draggable.userData.entity3D.mesh.position.y, center.z);
      }
      if (intersects.length > 0) {
        const entity3D = this.draggable.userData.entity3D;
        target.position.lerp(new THREE.Vector3(intersects[0].point.x, intersects2[0] ? intersects2[0].point.y : entity3D.elevation3d, intersects[0].point.z), 0.10);
        this.ruler.update();
      }
    }
  
    cancelDrag(){
      if(!this.draggable) return;
      const entity3D = this.draggable.userData.entity3D;
      entity3D.dragCanceled = true;
      this.draggable = undefined;
      Hooks.call("updateToken", entity3D.token.document, {x: entity3D.token.data.x});
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      setTimeout(() => {
        this.toggleControls(true);
      }, 150);
    }

    broadcastCursorPosition(){
      const sc = game.user.hasPermission("SHOW_CURSOR");
      if ( !sc ) return;
          const pos3d = game.Levels3DPreview.interactionManager.mousePostionToWorld();
          const position = {x: pos3d?.x, y: pos3d?.z}
          this._currentMousePosition = position
      game.user.broadcastActivity({
        cursor: position,
      });
    }
}