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
      }

      _onMouseDown(event){
        this.mousedown = true;
        this.mousePosition = { x: event.clientX, y: event.clientY };
        if(event.which !== 1 && event.which !== 3) return;
        if(event.ctrlKey || event.shiftKey) return;
        const intersect = this.findMouseIntersect(event);
        if(!intersect) return;
        this.controls.enableRotate = false;
        this.controls.enableZoom = false;
        this.clicks++;
        const token3d = intersect.userData.token3D
        if (this.clicks === 1) {
          setTimeout(() => {
            if(this.clicks !== 1) return this.clicks = 0;
            if(event.which === 1){
              token3d._onClickLeft(event);
              if(event.altKey || !this.mousedown){
                this.draggable = undefined;
                this.controls.enableRotate = true; 
                this.controls.enableZoom = true;
                return this.clicks = 0;
                }
              token3d.isAnimating = false;
              token3d.setPosition()
              this.draggable = intersect;
              this.controls.enableRotate = false;
              this.controls.enableZoom = false;
            }else{
              if(this.draggable) this.cancelDrag();
              else token3d._onClickRight(event);
              this.controls.enableRotate = true;
              this.controls.enableZoom = true;
            }
            this.clicks = 0;
          }, 150);
        }else{
          this.clicks = 0;
          if(this.draggable) this.cancelDrag();
          else event.which === 1 ? token3d._onClickLeft2(event) : token3d._onClickRight2(event);
          this.controls.enableRotate = true;
          this.controls.enableZoom = true;
        }
      }

      _onMouseUp(event){
        this.mousedown = false;
        if(event.which !== 1) return;
        if(this.draggable){
          if(!this.draggable.userData.token3D.updatePositionFrom3D(event)) this.cancelDrag();
        }
        this.draggable = undefined;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
      }

      _onMouseMove(event){
        this.mousemove.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mousemove.y = -(event.clientY / window.innerHeight) * 2 + 1;
      }

      _onWheel(event){
        const delta = event.deltaY;
        if(!this.draggable) return;
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
      }
}