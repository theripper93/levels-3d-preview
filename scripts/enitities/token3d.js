import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 

export class Token3D {
    constructor(tokenDocument, parent) {
      this.token = tokenDocument;
      this._parent = parent;
      this.color = this.getColor();
      this.factor = factor;
      this.targetSize = 0.1;
      this.elevation3d = 0;
      this.getFlags();
    }
  
    getFlags() {
      this.gtflPath = this.token.document.getFlag(
        "levels-3d-preview",
        "model3d"
      );
      this.rotationAxis =
      this.token.document.getFlag("levels-3d-preview", "rotationAxis") ??
        "y";
      this.rotationX = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationX") ?? 0);
      this.rotationY = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationY") ?? 0);
      this.rotationZ = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationZ") ?? 0);
      this.rotateBase = (this.token.document.getFlag("levels-3d-preview","rotateBase") ?? false) ? Math.PI/2 : 0;
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
      this.selectedImage = game.settings.get("levels-3d-preview", "selectedImage") ?? "";
      this.color = this.token.document.getFlag("levels-3d-preview", "color") ?? "#ffffff";
      this.material = this.token.document.getFlag("levels-3d-preview", "material") ?? "";
      this.imageTexture = this.token.document.getFlag("levels-3d-preview", "imageTexture") ?? "";
    }
  
    async load() {
      return this.gtflPath || this.imageTexture ? await this.loadModel() : this.draw();
    }

    async getModel(){
      if(!this.gtflPath){
        //make plane
        const texture = await new THREE.TextureLoader().loadAsync(this.imageTexture);
        const geometry = new THREE.PlaneGeometry(texture.image.width/1000, texture.image.height/1000);
        const material = new THREE.MeshBasicMaterial();
        const object = new THREE.Mesh(geometry, material);
        return {
          object: object,
          scene: object,
          model: object,
        }
      }
      const filePath = this.gtflPath;
      const extension = filePath.split(".").pop();
      if(extension == "gltf"){
        const object = await game.Levels3DPreview.loader.loadAsync(this.gtflPath)
        return {
          object: object,
          scene: object.scene,
          model: object.scene.children[0],
        }
        };
      if(extension == "fbx") {
        const object = await game.Levels3DPreview.FBXLoader.loadAsync(this.gtflPath)
        return {
          object: object,
          scene: object,
          model: object,
        }
         };
    }
  
    async loadModel() {

      //Load Model
      const loaded = await this.getModel();
      const object = loaded.object;
      const scene = loaded.scene;
      const model = loaded.model;
      if(model.geometry) this.setMaterial(model);
      //Calculate scale
      const originalSize = new THREE.Box3().setFromObject( scene ).getSize( new THREE.Vector3() );
      const maxSize = Math.max(originalSize.x, originalSize.y, originalSize.z);
      const targetScale = Math.min(this.token.w, this.token.h) / this.factor;
      const scaleFactor = targetScale / maxSize;
      const scale = this.scale * scaleFactor;
      this.hasGeometry = model.geometry ? true : false;
      model.scale.set(scale, scale, scale);
      //Define hitbox and set offset parameters
      let box = new THREE.Box3().setFromObject( scene );
      let center = box.getCenter( new THREE.Vector3() );
      this.isModel = true;
      let centerOffset = {
        x: this.offsetX/factor + (this.rotationAxis == "x" ? 0 : -center.x),
        y: this.offsetY/factor + (this.rotationAxis == "y" ? 0 : -center.y),
        z: this.offsetZ/factor + (this.rotationAxis == "z" ? 0 : -center.z),
      }

      if(object.animations.length > 0 && this.enableAnim) {
        this.mixer = new THREE.AnimationMixer( scene );
        this.mixer.timeScale = this.animSpeed;
        this.mixer.clipAction( object.animations[this.animIndex] ).play();
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
      const maxDim = Math.max(height, width, depth);
      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(width || maxDim, height || maxDim, depth || maxDim),
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
      this.adjust = {
        x: this.offsetX/factor,
        y: this.offsetY/factor,
        z: this.offsetZ/factor,
      };
      this.initialRotation = {
        x: 0,//model.rotation._x,
        y: 0,//model.rotation._y,
        z: 0,//model.rotation._z,
      }
      this.mesh.userData.draggable = true;
      this.mesh.userData.name = this.gtflPath;
      this.targetContainer = new THREE.Group();
      this.mesh.add(this.targetContainer);
      this.border = new THREE.Group();
      this.mesh.add(this.border);
      this.drawBorder();
      this.drawTargets();
      this.setPosition();
      return this;
    }

    setMaterial(model){
      let materialType = this.material;
      model.geometry.uvsNeedUpdate = true;
      model.geometry.buffersNeedUpdate = true;
      let roughness = 0;
      let opacity = 1;
      let color = new THREE.Color(this.color);
      switch(materialType){
        case "glass":
          roughness = 0.3;
          opacity = 0.8;
          break;
        case "plastic":
          roughness = 0.6;
          break;
        case "wood":
          roughness = 1;
          break;
      }
      model.material = new THREE.MeshPhysicalMaterial({
        color: color,
        roughness: roughness,
        transparent: opacity != 1 || !this.gtflPath,
        opacity: opacity,
        side: !this.gtflPath ? THREE.DoubleSide : THREE.FrontSide,
        map: this.imageTexture ? new THREE.TextureLoader().load(this.imageTexture) : null,
      });
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
      this.skipMoveAnimation = true;
        const useSnapped = canvas.scene.data.gridType && !e.shiftKey;
      const x3d = this.mesh.position.x;
      const y3d = this.mesh.position.y;
      const z3d = this.mesh.position.z;
      const x = x3d * this.factor-this.token.w/2;
      const y = z3d * this.factor - this.token.h/2;
      const z = Math.round((y3d * this.factor * canvas.dimensions.distance)/(canvas.dimensions.size));
        const snapped = canvas.grid.getSnappedPosition(x, y);
      this.token.document.update({
        x: useSnapped ? snapped.x : x,
        y: useSnapped ? snapped.y : y,
        elevation: z,
      });
    }
  
    setPosition(lerp = false, forcePosition) {
      const currentPosition = {
        x: Math.round(this.mesh.position.x*1000)/1000,
        y: Math.round(this.mesh.position.y*1000)/1000,
        z: Math.round(this.mesh.position.z*1000)/1000,
      };
      const currentRotation = {
        x: Math.round(this.mesh.rotation._x*1000)/1000,
        y: Math.round(this.mesh.rotation._y*1000)/1000,
        z: Math.round(this.mesh.rotation._z*1000)/1000,
      };
      const mesh = this.mesh;
      const token = this.token;
      const tokenCenter = {
        x: (forcePosition?.x ?? token.data.x) + token.w / 2,
        y: (forcePosition?.y ?? token.data.y) + token.h / 2,
      }
      if (!mesh) return;
      const f = this.factor;
      const x = tokenCenter.x / f;
      const z = tokenCenter.y / f;
      let y
      if(this.isModel){
        y =
        ((token.data.elevation) * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
      }else{
        y = ((token.data.elevation + (token.losHeight - token.data.elevation) / 2) * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
      }
      
      if(!lerp)mesh.position.set(x,y,z)
      else mesh.position.lerp(new THREE.Vector3(x, y, z), lerp);
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
      const rx = rotations.x + this.initialRotation?.x ?? 0
      const ry = rotations.y + this.initialRotation?.y ?? 0
      const rz = rotations.z + this.initialRotation?.z ?? 0
      let toLerp
      if(!lerp)mesh.rotation.set(rx, ry, rz);
      else {
        toLerp = new THREE.Vector3(mesh.rotation._x, mesh.rotation._y, mesh.rotation._z);
        toLerp.lerp(new THREE.Vector3(rx, ry, rz), 0.10);
        mesh.rotation.set(toLerp.x, toLerp.y, toLerp.z);
      }
      this.elevation3d = y;
      if(this.border){
        this.border.rotation.set(
          - rotations.x -this.rotateBase + this.rotationX,
          - rotations.y + this.rotationY,
          0 + this.rotationZ, //?????????????????
        );
      }
      console.log(currentPosition, x,y,z)
      if(currentPosition.x === x && currentPosition.y === y && currentPosition.z === z && currentRotation.x === Math.round(rx*1000)/1000 && currentRotation.y === Math.round(ry*1000)/1000 && currentRotation.z === Math.round(rz*1000)/1000){
        return false;
      }else{
        return true;
      }
      
    }

    reDraw(){
      this.drawTargets();
      this.refreshBorder();
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

    drawBorder(){
      this.border.children.forEach(child => {
        this.border.remove(child);
      });
      const width = (this.token.w*1.02)/this.factor;
      const height = (this.token.h*1.02)/this.factor;
      const depth = 0.000001;
      const geometry = new THREE.BoxGeometry(width, depth , height);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        visible: false,
        opacity: 1,
        transparent: true,
        map: this.selectedImage ? new THREE.TextureLoader().load(this.selectedImage) : null,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0,0,0);
      this.border.add(mesh);


    }

    refreshBorder(){
      if(!this.border) return;
      const color = this.token.border._lineStyle?.color ?? 0xffffff;
      const visible = this.token.border.height ? true : false;
      this.border.children.forEach(child => {
        child.material.color = this.selectedImage ? new THREE.Color(0xffffff) : new THREE.Color(color);
        child.material.visible = visible;
      });
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