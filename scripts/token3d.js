import * as THREE from "./three.module.js";
import {factor} from './main.js'; 

export class Token3D {
    constructor(tokenDocument, parent) {
      this.token = tokenDocument;
      this._parent = parent;
      this.color = this.getColor();
      this.factor = factor;
      this.targetSize = 0.1;
      this.getFlags();
    }
  
    getFlags() {
      this.gtflPath = this.token.document.getFlag(
        "levels-3d-preview",
        "model3d"
      );
      this.rotationAxis =
      this.token.document.getFlag("levels-3d-preview", "rotationAxis") ??
        "z";
      this.rotationX = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationX") ?? 0);
      this.rotationY = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationY") ?? 0);
      this.rotationZ = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationZ") ?? 0);
      this.offsetX =
      this.token.document.getFlag("levels-3d-preview", "offsetX") ?? 0;
      this.offsetY =
      this.token.document.getFlag("levels-3d-preview", "offsetY") ?? 0;
      this.offsetZ =
      this.token.document.getFlag("levels-3d-preview", "offsetZ") ?? 0;
      this.scale =
      this.token.document.getFlag("levels-3d-preview", "scale") ?? 1;
      this.enableAnim = this.token.document.getFlag("levels-3d-preview", "enableAnim") ?? true;
      this.animIndex = this.token.document.getFlag("levels-3d-preview", "animIndex") ?? 0;
      this.animSpeed = this.token.document.getFlag("levels-3d-preview", "animSpeed") ?? 1;
      this.draggable = (this.token.document.getFlag("levels-3d-preview", "draggable") ?? true) && this.token.isOwner;
    }
  
    async load() {
      return this.gtflPath ? await this.loadModel() : this.draw();
    }
  
    async loadModel() {
      this.isModel = true;
      const gltf = await game.Levels3DPreview.loader.loadAsync(this.gtflPath);
      const model = gltf.scene.children[0];
      const scale = this.scale * 0.1;
      let centerOffset
      model.scale.set(scale, scale, scale);
      let center
      let box
      if(gltf.animations.length > 0 && this.enableAnim) {
        this.mixer = new THREE.AnimationMixer( gltf.scene );
        this.mixer.timeScale = this.animSpeed;
        this.mixer.clipAction( gltf.animations[this.animIndex] ).play();
      }
        this.rotationX += Math.PI / 2;
        box = new THREE.Box3().setFromObject( gltf.scene );
        center = box.getCenter( new THREE.Vector3() );
        centerOffset = {
            x: this.offsetX/factor + (this.rotationAxis == "x" ? 0 : -center.x),
            y: this.offsetY/factor + (this.rotationAxis == "y" ? 0 : -center.y),
            z: this.offsetZ/factor + (this.rotationAxis == "z" ? 0 : -center.z),
          }
        model.position.set(centerOffset.x, centerOffset.y, centerOffset.z);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
        model.userData.draggable = true;
        model.userData.name = this.gtflPath;
        const pivot = new THREE.Group();
        pivot.add(model);
        //create hitbox
        const height = box.max.y - box.min.y;
        const width = box.max.x - box.min.x;
        const depth = box.max.z - box.min.z;
        const hitbox = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 1,
            visible: true,
          })
        );
        hitbox.position.set(center.x+centerOffset.x, center.y+centerOffset.y, center.z+centerOffset.z);
        hitbox.userData.draggable = this.draggable;
        hitbox.userData.isHitbox = true;
        hitbox.userData.token3D = this;
        this.hitbox = hitbox;
        pivot.add(hitbox);
        this.mesh = pivot;
      //}
      this.adjust = {
        x: this.offsetX/factor,
        y: this.offsetY/factor,
        z: this.offsetZ/factor,
      };
      this.initialRotation = {
        x: model.rotation._x,
        y: model.rotation._y,
        z: model.rotation._z,
      }
      this.mesh.userData.draggable = true;
      this.mesh.userData.name = this.gtflPath;
      this.setPosition();
      this.targetContainer = new THREE.Group();
      this.mesh.add(this.targetContainer);
      this.drawTargets();
      console.log(this.hitbox)
      return this;
    }
  
    draw() {
      const token = this.token;
      const f = this.factor;
      const w = token.w / f;
      const h = token.h / f;
      const d =
        ((token.losHeight - token.data.elevation) *
          canvas.scene.dimensions.size) /
        canvas.dimensions.distance /
        f;
      //create a box
      const color = this.color;
      const geometry = new THREE.BoxGeometry(w, d, h);
      const material = new THREE.MeshMatcapMaterial({
        color: color,
        opacity: 0.5,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.tokenId = token.id;
      this.mesh = mesh;
      this.setPosition();
      return this;
    }
  
    updatePositionFrom3D(e){
        const useSnapped = canvas.scene.data.gridType && !e.shiftKey;
      const x3d = this.mesh.position.x;
      const y3d = this.mesh.position.y;
      const z3d = this.mesh.position.z;
      const x = x3d * this.factor-this.token.w/2;
      const y = z3d * this.factor - this.token.h/2;
        const snapped = canvas.grid.getSnappedPosition(x, y);
      this.token.document.update({
        x: useSnapped ? snapped.x : x,
        y: useSnapped ? snapped.y : y,
      });
    }
  
    setPosition() {
      const mesh = this.mesh;
      const token = this.token;
      if (!mesh) return;
      const f = this.factor;
      const x = token.center.x / f;
      const z = token.center.y / f;
      let y
      if(this.isModel){
        y =
        ((token.data.elevation) * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
      }else{
        y = ((token.data.elevation + (token.losHeight - token.data.elevation) / 2) * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
      }
      
        mesh.position.set(
        x,
        y,
        z
      );
      const rotations = {
        x:
          this.rotationAxis === "x"
            ? -Math.toRadians(token.data.rotation)
            : 0,
        y:
          this.rotationAxis === "y"
            ? -Math.toRadians(token.data.rotation)
            : 0,
        z:
          this.rotationAxis === "z"
            ? -Math.toRadians(token.data.rotation)
            : 0,
      };
      rotations.x += this.rotationX;
      rotations.y += this.rotationY;
      rotations.z += this.rotationZ;
      mesh.rotation.set(
        rotations.x + this.initialRotation?.x ?? 0,
        rotations.y + this.initialRotation?.y ?? 0,
        rotations.z + this.initialRotation?.z ?? 0,
      );
    }

    drawTargets(){
      //remove old targets
      if(!this.targetContainer) return;
      this.targetContainer.children.forEach(child => {
        this.targetContainer.remove(child);
      });
      this.hitbox.geometry.computeBoundingBox();
      const hitboxSize = this.hitbox.geometry.boundingBox.getSize(new THREE.Vector3());
      this.targetSize = Math.min(hitboxSize.x, hitboxSize.y, hitboxSize.z)*0.3;
      let positionOffset = this.targetSize*2.5;
      for(let target of Array.from(this.token.targeted)){
        const color = target.color;
        const position = {
          x: this.rotationAxis === "x" ? hitboxSize.x+this.targetSize+positionOffset : 0,
          y: this.rotationAxis === "y" ? hitboxSize.y+this.targetSize+positionOffset : 0,
          z: this.rotationAxis === "z" ? hitboxSize.z+this.targetSize+positionOffset : 0,
        }
        const geometry = new THREE.SphereGeometry(this.targetSize, 16, 16);
        const material = new THREE.MeshBasicMaterial({
          color: color,
          //wireframe: true,
          transparent: true,
          opacity: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        this.targetContainer.add(mesh);
        positionOffset += this.targetSize*2.5;
      }

    }
  
    getColor() {
      const hasPlayerOwner = this.token.actor?.hasPlayerOwner;
      if (!hasPlayerOwner) return 0xf2ff00;
      for (let [userId, permLevel] of Object.entries(
        this.token.actor.data.permission
      )) {
        if (permLevel < 3) continue;
        const user = game.users.get(userId);
        if (!user || user.isGM) continue;
        return user.data.color;
      }
      return 0xf2ff00;
    }

    _onClickLeft(e) {
      const event = {
        data: {
          originalEvent: e,
        }
      }
      this.token._onClickLeft(event);
    }

    _onClickRight(e) {
      const event = {
        data: {
          originalEvent: e,
        }
      }
      this.token._onClickRight(event);
    }

    _onClickLeft2(e) {
      const event = {
        data: {
          originalEvent: e,
        }
      }
      this.token._onClickLeft2(event);
    }

    _onClickRight2(e) {
      const event = {
        data: {
          originalEvent: e,
        }
      }
      this.token._onClickRight2(event);
    }

    destroy(){
      this._parent.scene.remove(this.mesh);
      delete this._parent.tokenIndex[this.id]
    }

    refresh(){
      this.destroy();
      this._parent.addToken(this.token);
    }
  }
  