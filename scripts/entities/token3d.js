import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 
import {sleep} from '../main.js';

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
      this.alwaysVisible = this.token.document.getFlag("levels-3d-preview", "alwaysVisible") ?? false;
    }
  
    async load() {
      if(!this.gtflPath && !this.imageTexture) this.imageTexture = this.token.data.img;
      this.texture = await this.loadTexture();
      return this.gtflPath || this.imageTexture ? await this.loadModel() : this.draw();
    }

    async loadTexture(){
      if(!this.imageTexture) return null;
      const extension = this.imageTexture.split('.').pop();
      const isVideo = extension == "mp4" || extension == "webm" || extension == "ogg" || extension == "mov" || extension == "apng";
      if(isVideo){
      let video;
      let videoTexture
        video = $(`<video id="video" loop crossOrigin="anonymous" autoplay="true" muted="muted" playsinline style="display:none;height:auto;width:auto;">
        <source src="${this.imageTexture}"
          type='video/${extension};'>
      </video>`)
      $("body").append(video);
      await resolveMetadata(video[0]);
      videoTexture = new THREE.VideoTexture(video[0]);
      videoTexture.format = THREE.RGBAFormat;
      this.isVideo = true;
      return videoTexture;
      }else{
        return await new THREE.TextureLoader().loadAsync(this.imageTexture);
      }

      function resolveMetadata(video) {
        return new Promise(resolve => {
          video.onloadedmetadata = () => {
            resolve(video);
          };
        });
      }
    }

    async getModel(){
      if(!this.gtflPath){
        const texture = this.texture;
        const geometry = new THREE.PlaneGeometry((texture.image.width || texture.image.videoWidth)/1000, (texture.image.height || texture.image.videoHeight)/1000);
        const material = new THREE.MeshBasicMaterial();
        const object = new THREE.Mesh(geometry, material);
        this.standUp=true;
        return {
          object: object,
          scene: object,
          model: object,
        }
      }
      const filePath = this.gtflPath;
      const extension = filePath.split(".").pop().toLowerCase();
      if(extension == "gltf" || extension == "glb"){
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
      //make 1x1 cube
      const errText = game.i18n.localize("levels3dpreview.errors.filenotsupported") + "(" + extension +"): " + filePath + " Token: " + this.token.data.name
      console.error(errText);
      ui.notifications.error(errText);
      const geometry = new THREE.BoxGeometry(1,1,1);
      const material = new THREE.MeshBasicMaterial();
      const object = new THREE.Mesh(geometry, material);
      this.standUp=true;
      return {
        object: object,
        scene: object,
        model: object,
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
      const updatedSize = box.getSize( new THREE.Vector3() );
      this.isModel = true;
      let centerOffset = {
        x: this.offsetX/factor + (this.rotationAxis == "x" ? 0 : -center.x),
        y: this.offsetY/factor + (this.rotationAxis == "y" ? 0 : -center.y),
        z: this.offsetZ/factor + (this.rotationAxis == "z" ? 0 : -center.z),
      }

      if(this.standUp) {
        centerOffset[this.rotationAxis] += updatedSize[this.rotationAxis]/2;
      }

      if(object.animations.length > 0 && this.enableAnim) {
        this.mixer = new THREE.AnimationMixer( scene );
        this.mixer.timeScale = this.animSpeed;
        this.mixer.clipAction( object.animations[this.animIndex] ).play();
      }
      model.position.set(centerOffset.x, centerOffset.y, centerOffset.z);
      model.traverse((child) => {
        if (child.isMesh && !this.standUp) {
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
          visible: this._parent.debugMode,
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
      this.mesh.userData.hitbox = hitbox
      this.mesh.userData.draggable = this.draggable
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
        model.material = new THREE.MeshPhongMaterial({
          color: color,
          shininess: roughness*100,
          transparent: true,//opacity != 1 || !this.gtflPath,
          opacity: opacity,
          side: !this.gtflPath ? THREE.DoubleSide : THREE.FrontSide,
          map: this.texture//new THREE.TextureLoader().load(this.imageTexture) : null,
        });
        model.material.toneMapped = false;

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
      const dest = {
        x: useSnapped ? snapped.x : x,
        y: useSnapped ? snapped.y : y,
        elevation: z,
      }
      if ( !game.user.isGM ) {
        const center = canvas.grid.getCenter(x,y);
        let collides = this.token.checkCollision({x:center[0], y:center[1]});
        if ( collides ) {
          ui.notifications.error("ERROR.TokenCollide", {localize: true});
          return false
        }
      }

      this.token.document.update({
        x: dest.x,
        y: dest.y,
        elevation: dest.elevation,
      });
      return true;
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

    faceCamera(){
      const camera = this._parent.camera;
      const vector = new THREE.Vector3(0, -1, 0);
      vector.applyQuaternion(camera.quaternion);
      const angle = Math.atan2(vector.x, vector.z);
      const rotation = Math.round(angle * 180 / Math.PI);
      //this.rotationAxis = "z";
      this.mesh.rotation.set(this.mesh.rotation._x, angle, this.mesh.rotation._z);
    }

    updateVisibility(){
      this.mesh.visible = this.alwaysVisible || this.token.visible;
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
      delete this._parent.tokens[this.id]
    }

    refresh(){
      this.destroy();
      this._parent.addToken(this.token);
    }
  }


  //HOOKS

  Hooks.on("updateToken", (token, updates) => {
    if(!game.Levels3DPreview._active) return;
    if(updates?.flags && updates?.flags["levels-3d-preview"]){
      game.Levels3DPreview.tokens[token.id]?.refresh();
    }
    if ("x" in updates || "y" in updates || "elevation" in updates || "rotation" in updates) {
      const token3d = game.Levels3DPreview.tokens[token.id];
      if(!token3d) return;
      if(!updates.x && !updates.y && !updates.elevation && updates.rotation) return token3d.setPosition();
      const prevPos = {
        x: token3d.token.x,
        y: token3d.token.y
      }
      const x = updates.x ?? token.data.x;
      const y = updates.y ?? token.data.y;
      let dist = token3d.dragCanceled ? canvas.dimensions.size*2+1 : Math.sqrt(Math.pow(x - prevPos.x, 2) + Math.pow(y - prevPos.y, 2));
      dist = (updates.elevation !== undefined) && (dist === 0) ? canvas.dimensions.size*2+1 : dist;
      if(dist == 0 || dist < canvas.dimensions.size*2) return token3d.fallbackAnimation = true;
      token3d.fallbackAnimation = false;
      token3d.dragCanceled = false;
      const larpFactor = canvas.dimensions.size/(dist*2);
      let exitLerp = false;
      setTimeout(() => {
        exitLerp = true;
      }, 4000);
      token3d.isAnimating = false;
      setTimeout(async () => {
        token3d.isAnimating = true;
  
        const elevation = updates.elevation ?? token.data.elevation;
        while(token3d.isAnimating && !exitLerp && token3d.setPosition(larpFactor, {x,y,elevation})){
          await sleep(1000/60);
        };
        if(exitLerp)token3d.setPosition(false, {x,y,elevation})
        token3d.isAnimating = false;
      },200);
  
    }
  });

  Hooks.on("createToken", (tokenDocument) => {
    if(game.Levels3DPreview?._active && tokenDocument.object) game.Levels3DPreview.addToken(tokenDocument.object);
  })
  
  Hooks.on("deleteToken", (tokenDocument) => {
    if(game.Levels3DPreview?._active) game.Levels3DPreview.tokens[tokenDocument.id]?.destroy();
  })

  /*Hooks.on("controlToken", async (token) => {
    if(game.Levels3DPreview?._active){
      const token3d = game.Levels3DPreview.tokens[token.id];
      if(token3d) {
        const targetPosition = token3d.mesh.position.clone();
        const currentPosition = game.Levels3DPreview.controls.target.clone();
        let currentLarp = 0;
        while(currentLarp < 1){
          currentLarp += 0.04;
          const animTargetPos = currentPosition.lerp(targetPosition, currentLarp);
          game.Levels3DPreview.controls.target.set(animTargetPos.x, animTargetPos.y, animTargetPos.z);
          game.Levels3DPreview.controls.update();
          await sleep(1000/60);
        }
      }
    }
  })*/