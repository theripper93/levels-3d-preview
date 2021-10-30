import * as THREE from "./lib/three.module.js";

export class InteractionManager {
    constructor(levels3dPreview){
        this._draggable = null;
        this._parent = levels3dPreview;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.mousemove = new THREE.Vector2();
        this.controls = levels3dPreview.controls;
        this.camera = levels3dPreview.camera;
        this.scene = levels3dPreview.scene;
        this.domElement = levels3dPreview.renderer.domElement;
        this.ruler = levels3dPreview.ruler;
        this.factor = levels3dPreview.factor;
        this.clicks = 0;
        this.lcTime = 0;
        this.elevationTick = (canvas.dimensions.size/canvas.dimensions.distance)/this.factor;
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
      event.entity = intersect.userData.token3D
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
        if(!this.draggable.userData.token3D.updatePositionFrom3D(event)) this.cancelDrag();
      }
      this.toggleControls(true, true);
    }

    _onMouseMove(event){
      this.mousemove.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mousemove.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    _onWheel(event){
      if(this.draggable){
        const delta = event.deltaY;
        const token3d = this.draggable.userData.token3D;
        let elevationDiff = 5;
        if(event.shiftKey) elevationDiff = 1;
        if(event.ctrlKey) elevationDiff = 0.1;
        //change y position
        if(delta > 0){
          token3d.elevation3d -= this.elevationTick*elevationDiff;
        }else{
          token3d.elevation3d += this.elevationTick*elevationDiff;
        }
        if(game.settings.get("levels-3d-preview", "preventNegative") && token3d.elevation3d < 0){
          token3d.elevation3d = 0;
        }
      }
      if(!this.draggable && event.ctrlKey && canvas.tokens.controlled.length){
        const delta = event.deltaY/20;
        console.log(delta)
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
      this.draggable = intersect;
      this.toggleControls(false);
    }

    _onClickRight(event){
      const entity = event.entity;
      const intersect = event.intersect;
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
        if(child.userData?.hitbox && child.userData.draggable) intersectTargets.push(child.userData.hitbox);
      }
      const intersects = this.raycaster.intersectObjects(intersectTargets, true);
      return intersects[0]?.object;
    }
  
    set draggable(object){
      this._draggable = object;
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
  
    dragObject(){
      if(!this.draggable) return;
      this.raycaster.setFromCamera(this.mousemove, this.camera);
      const intersects = this.raycaster.intersectObjects([this.dragplane], true);
      if (intersects.length > 0) {
        const token3d = this.draggable.userData.token3D;
        const target = this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable;
        target.position.lerp(new THREE.Vector3(intersects[0].point.x, token3d.elevation3d, intersects[0].point.z), 0.10);
        this.ruler.update();
      }
    }
  
    cancelDrag(){
      if(!this.draggable) return;
      const token3d = this.draggable.userData.token3D;
      token3d.dragCanceled = true;
      this.draggable = undefined;
      token3d.token.document.update({x: token3d.token.data.x+0.0001})
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      setTimeout(() => {
        this.toggleControls(true);
      }, 150);
    }
}