import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 
import {sleep} from '../main.js';
import { Light3D } from "./light3d.js";
import { TokenAnimationHandler } from "../helpers/tokenAnimationHandler.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from '../lib/three-mesh-bvh.js';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class Token3D {
    constructor(tokenDocument, parent) {
      this.token = tokenDocument;
      this.type = "Token";
      this.embeddedName = "Token";
      this.placeable = tokenDocument;
      this.isOwner = this.token.isOwner;
      this._parent = parent;
      this.isBase = game.settings.get("levels-3d-preview", "baseStyle") !== "image";
      this.baseMode = game.settings.get("levels-3d-preview", "baseStyle");
      this.color = this.getColor();
      this.factor = factor;
      this.targetSize = 0.1;
      this.baseDepth = 0.008*(canvas.grid.size/100);
      this.elevation3d = 0;
      this.materialsCache = {};
      this._effectsCache = {};  
      this.proneHandler = {};
      this.combatColor = new THREE.Color("#005eff");
      this._loaded = false;
      this.getFlags();
      this.drawBars = debounce(this.drawBars, 100);
      this.animationHandler = new TokenAnimationHandler(this);
    }
  
    getFlags() {
      this.gtflPath = this.token.document.getFlag(
        "levels-3d-preview",
        "model3d"
      );
      this.solidBaseMode = this.token.document.getFlag("levels-3d-preview","solidBaseMode")
      this.baseColor =  this.token.document.getFlag("levels-3d-preview","baseColor") || game.settings.get("levels-3d-preview", "solidBaseColor")
      if(!this.solidBaseMode || this.solidBaseMode === "default") this.solidBaseMode = game.settings.get("levels-3d-preview", "solidBaseMode");
      this.autoCenter = this.token.document.getFlag("levels-3d-preview","autoCenter") ?? true;
      this.rotationX = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationX") ?? 0);
      this.rotationY = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationY") ?? 0);
      this.rotationZ = Math.toRadians(this.token.document.getFlag("levels-3d-preview","rotationZ") ?? 0);
      this.offsetX =
      this.token.document.getFlag("levels-3d-preview", "offsetX") ?? 0;
      this.offsetY =
      this.token.document.getFlag("levels-3d-preview", "offsetY") ?? 0;
      this.offsetY += this.solidBaseMode === "ontop" ? this.baseDepth*factor : 0;
      this.offsetZ =
      this.token.document.getFlag("levels-3d-preview", "offsetZ") ?? 0;
      this.scale =
      this.token.document.getFlag("levels-3d-preview", "scale") ?? 1;
      this.enableAnim = this.token.document.getFlag("levels-3d-preview", "enableAnim") ?? true;
      this.animIndex = this.token.document.getFlag("levels-3d-preview", "animIndex") ?? 0;
      this.animSpeed = this.token.document.getFlag("levels-3d-preview", "animSpeed") ?? 1;
      this.interactive = (this.token.document.getFlag("levels-3d-preview", "draggable") ?? true);
      if(!this.interactive || this.token.document.getFlag("levels-3d-preview", "disableBase")) this.isBase = false;
      this.draggable = true;
      this.selectedImage = game.settings.get("levels-3d-preview", "selectedImage") ?? "";
      this.color = this.token.document.getFlag("levels-3d-preview", "color") ?? "#ffffff";
      this.material = this.token.document.getFlag("levels-3d-preview", "material") ?? "";
      this.imageTexture = this.token.document.getFlag("levels-3d-preview", "imageTexture") ?? "";
      this.alwaysVisible = this.token.document.getFlag("levels-3d-preview", "alwaysVisible") ?? false;
      this.collisionPlane = true;
      this.colorizeIndicator = game.settings.get("levels-3d-preview", "colorizeInidcator");
      this.rotateIndicator = game.settings.get("levels-3d-preview", "rotateIndicator");
      this.faceCameraOption = this.token.document.getFlag("levels-3d-preview", "faceCamera") ?? "0";
      this.stem = this.token.document.getFlag("levels-3d-preview", "stem") ?? false;
      this.standupFace = game.settings.get("levels-3d-preview", "standupFace");
      this.wasFreeMode = this.token.document.getFlag("levels-3d-preview", "wasFreeMode") ?? false;
      this.removeBase = this.token.document.getFlag("levels-3d-preview", "removeBase") ?? false;
      if(this.faceCameraOption !== "0") this.standupFace = this.faceCameraOption == "1" ? true : false;
    }
  
    async load() {
      if(!this.gtflPath && !this.imageTexture) this.imageTexture = this.token.data.img;
      this.texture = await this._parent.helpers.loadTexture(this.imageTexture)//this.loadTexture();
      const token3d = this.gtflPath || this.imageTexture ? await this.loadModel() : this.draw();
      if(this.token.data.light.bright !== 0 || this.token.data.light.dim) this.loadLight();
      this._loaded = true;
      this.animationHandler.init();
      return token3d;
    }
//remove 
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
        const geometry = new THREE.PlaneGeometry((texture.image?.width || texture.image?.videoWidth || 1)/1000, (texture.image?.height || texture.image?.videoHeight || 1)/1000);
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
      const model = await game.Levels3DPreview.helpers.loadModel(this.gtflPath);
      if(model) return model;
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
      if(this.removeBase){
        removeBaseAndReposition(object);
        removeBaseAndReposition(scene);
        removeBaseAndReposition(model);
      }
      function removeBaseAndReposition(object){
        let base = object.children?.find(c => c.name === "base");
        if(!base) return;
        object.remove(base);
      }
      await this.setMaterial(model);
      //Apply rotation
      model.rotation.set(
        this.rotationX + model.rotation._x,
        this.rotationY + model.rotation._y,
        this.rotationZ + model.rotation._z
      );
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
        x: this.offsetX/factor + (this.autoCenter ? -center.x : 0),
        y: this.offsetY/factor + 0,
        z: this.offsetZ/factor + (this.autoCenter ? -center.z : 0),
      }

      if(this.standUp) {
        centerOffset.y += updatedSize.y/2;
      }

      if(object.animations.length > 0 && this.enableAnim) {
        if(!object.animations[this.animIndex]) {
          console.error("Animation index out of bounds", this.token);
        }else{
          this.mixer = new THREE.AnimationMixer( scene );
          this.mixer.timeScale = this.animSpeed;
          this.mixer.clipAction( object.animations[this.animIndex] ).play();
        }
      }
      model.position.set(centerOffset.x, centerOffset.y, centerOffset.z);
      model.traverse((child) => {
        if (child.isMesh && !this.standUp) {
          child.castShadow = true;
          child.receiveShadow = true;
          if(this.collisionPlane) child.geometry.computeBoundsTree();
        }
      });
      model.userData.draggable = true;
      model.userData.name = this.gtflPath;
      this.model = model;
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
      hitbox.position.set(0, center.y+centerOffset.y, 0);

      this.hitbox = hitbox;
      this.hitbox.geometry.computeBoundingBox();
      this._size = this.hitbox.geometry.boundingBox.getSize(new THREE.Vector3());

      this.mesh = pivot;
      this.adjust = {
        x: this.offsetX/factor,
        y: this.offsetY/factor,
        z: this.offsetZ/factor,
      };
      this.mesh.userData.hitbox = this.mesh;
      this.mesh.userData.draggable = this.draggable;
      this.mesh.userData.interactive = this.interactive;
      this.mesh.userData.isHitbox = false;
      this.mesh.userData.entity3D = this;
      this.mesh.userData.documentName = this.token.document.documentName
      this.targetContainer = new THREE.Group();
      this.mesh.add(this.targetContainer);
      this.effectsContainer = new THREE.Group();
      this.mesh.add(this.effectsContainer);
      this.border = new THREE.Group();
      this.mesh.add(this.border);
      this.drawBorder();
      this.drawName();
      this.drawBars();
      this.reDraw();
      this.setPosition();
      this.setUpProne();
      return this;
    }

    async setMaterial(model){
      let materialType = this.material;
      if((!this.material || this.material === "none") && !this.standUp) return;
      if(materialType === "pbr") return await this.loadPBRMat(model);
      //model.geometry.uvsNeedUpdate = true;
      //model.geometry.buffersNeedUpdate = true;
      let roughness = 0;
      let metalness = 0;
      let color = new THREE.Color(this.color);
      switch(materialType){
        case "basic":
          break;
        case "metal":
          roughness = 0.5;
          metalness = 0.8;
          break;
        case "plastic":
          roughness = 0.6;
          break;
        case "wood":
          roughness = 1;
          break;
      }

      if(materialType === "texcol"){
        if(model.material){
          if(this.color) model.material.color = new THREE.Color(this.color);
          model.material.map = this.texture;
        }
        if(model.children?.length){
          model.traverse((child) => {
            if(child.isMesh){
                if(this.color) child.material.color = new THREE.Color(this.color);
                child.material.map = this.texture;
            }
          });
        }
        return;
      }

      const matData = {
        color: color,
        roughness: roughness,
        side: !this.gtflPath ? THREE.DoubleSide : THREE.FrontSide,
        metalness: metalness,
        map: this.texture,//new THREE.TextureLoader().load(this.imageTexture) : null,
        //depthWrite: this.texture && !this.gtflPath ? false : true,
        alphaTest: 0.99,
      }
      const material = materialType === "basic" ? new THREE.MeshBasicMaterial(matData) : new THREE.MeshStandardMaterial(matData);
      if(model.material){
        model.material = material;
      }
      if(model.children?.length){
        model.traverse((child) => {
          if(child.isMesh){
              child.material = material;
          }
        });
      }



    }

    async loadPBRMat(model){
      const material = await this._parent.helpers.getPBRMat(this.imageTexture)
      if(model.material){
        model.material = material;
      }
      if(model.children?.length){
        model.traverse((child) => {
          if(child.isMesh){
              child.material = material;
          }
        });
      }
    }

    loadLight(){
      this.light = new Light3D(this.token, this._parent, true);
      this.light.light3d.position.set(0,this.d/2,0);
      this.mesh.add(this.light.light3d);
      this.setPosition();
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
      const z = Math.round(((y3d * this.factor * canvas.dimensions.distance)/(canvas.dimensions.size))*100)/100;
        const snapped = canvas.grid.getSnappedPosition(x, y);
      const dest = {
        x: useSnapped ? snapped.x : x,
        y: useSnapped ? snapped.y : y,
        elevation: z,
      }
      if ( !game.user.isGM ) {
        if(game.paused) return false;
        const center = canvas.grid.getCenter(x,y);
        const geometryCollisions = game.Levels3DPreview?.object3dSight;
        let collides;
        if(geometryCollisions){
          const tokenHeight = this.token.losHeight - this.token.data.elevation;
          collides = _levels.testCollision({
            x: this.token.center.x,
            y: this.token.center.y,
            z: this.token.losHeight,
          },{
            x: dest.x,
            y: dest.y,
            z: dest.elevation+tokenHeight,
          }, "collision")
        }else{
          collides = this.token.checkCollision({x:center[0], y:center[1]});
        }
        if ( collides ) {
          ui.notifications.error("ERROR.TokenCollide", {localize: true});
          return false
        }
      }
      const deltas = {
        x: dest.x - this.token.data.x,
        y: dest.y - this.token.data.y,
        elevation: dest.elevation - this.token.data.elevation,
      }
      let updates = [];
      for(let token of canvas.tokens.controlled){
        updates.push({
          _id: token.id,
          x: token.data.x + deltas.x,
          y: token.data.y + deltas.y,
          elevation: Math.round((token.data.elevation + deltas.elevation)*1000)/1000,
          flags: {
            "levels-3d-preview": {
              wasFreeMode: this.wasFreeMode
            }
          }
        })
      }
      canvas.scene.updateEmbeddedDocuments("Token", updates)
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
        x: 0,
        y: -Math.toRadians(token.data.rotation),
        z: 0,
      };
      let toLerp = rotations;
      if(!lerp)mesh.rotation.set(rotations.x,rotations.y,rotations.z);
      else {
        toLerp = new THREE.Quaternion().setFromEuler(mesh.rotation);
        toLerp.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler().setFromVector3(rotations)), 0.10);
        mesh.rotation.setFromQuaternion(toLerp);
      }
      this.elevation3d = y;
      if(this.border && !this.rotateIndicator){
        this.border.rotation.set(
          - toLerp.x,
          - toLerp.y,
          - toLerp.z,
        );
      }
      if(this.light && this.token.data.light.angle != 360){
        const rotationy = rotations.y;
        const distance = 1
        const lx = Math.sin(rotationy) * distance + x;
        const ly = y + this.d/2;
        const lz = Math.cos(rotationy) * distance + z;
        this.light.light3d.target.position.set(lx,ly,lz);
        this.light.light3d.target.updateMatrixWorld();
      }
      if(currentPosition.x === x && currentPosition.y === y && currentPosition.z === z && currentRotation.x === Math.round(rotations.x*1000)/1000 && currentRotation.y === Math.round(rotations.y*1000)/1000 && currentRotation.z === Math.round(rotations.z*1000)/1000){
        return false;
      }else{
        return true;
      }
      
    }

    reDraw(){
      this.drawTargets();
      this.drawEffects();
      this.refreshBorder();
    }

    drawTargets(){
      //remove old targets
      if(!this.targetContainer) return;
      this.updateTargetTexture();
      if(this.isBase && game.settings.get("levels-3d-preview", "hideTarget")) return;
      this.targetContainer.children.forEach(child => {
        this.targetContainer.remove(child);
      });
      this.targetSize = Math.min(this.h, this.w, this.d)*0.3;
      this.targetSize = Math.min(Math.max(this.targetSize, 0.02), 0.05)
      let positionOffset = this.targetSize;
      const targetModel = this._parent.models.target;
      for(let target of Array.from(this.token.targeted)){
        const color = target.color;
        const position = {
          x: 0,
          y: this.d+this.targetSize+positionOffset,
          z: 0,
        }
        const mesh = targetModel.clone();
        mesh.children[0].material = new THREE.MeshPhongMaterial({ color: color, emissive: color, emissiveIntensity: 0.8 });
        mesh.scale.set(this.targetSize/100,this.targetSize/100,this.targetSize/100);
        mesh.position.set(position.x, position.y, position.z);
        this.targetContainer.add(mesh);
        positionOffset += this.targetSize*2.5;
      }

    }

    get isTokenProne(){
      const token = this.token;
      switch (game.system.id) {
        case "pf2e":
          return token.actor?.hasCondition("prone") ?? false;
        case "pf1":
          return token.actor?.effects.some(e => e.getFlag("core", "statusId") === "pf1_prone") ?? false;
        // D35E: no prone condition?
      }
      // dnd5e, dnd4e, sfrpg, dsa5, cyberpunk2020, shadowrun5e, swade, wfrp4e, ...
      return token.actor?.effects.some(e => e.getFlag("core", "statusId") === "prone") ?? false;
    }

    updateHiden(){
      if(!game.user.isGM) return;
      if(!this.originalMatData){
        this.originalMatData = {}
        this.model.traverse(child => {
          if(child.isMesh){
            this.originalMatData[child.material.uuid] = {
              transparent: child.material.transparent,
              opacity: child.material.opacity,
              format: child.material.format,
              alphaTest: child.material.alphaTest,
            }
          }
        })
      }
      if(this._hidden === this.token.data.hidden) return;
      this._hidden = this.token.data.hidden;
      const hidden = this.token.data.hidden;
      this.model.traverse(child => {
        if(child.isMesh){
          if(hidden){
            child.material.transparent = true;
            child.material.opacity = 0.5;
            child.material.alphaTest = 0;
            child.material.format = THREE.RGBAFormat
            child.material.needsUpdate = true;
          }else{
            const originalData = this.originalMatData[child.material.uuid];
            child.material.transparent = originalData.transparent;
            child.material.opacity = originalData.opacity;
            child.material.alphaTest = originalData.alphaTest;
            child.material.format = originalData.format; 
            child.material.needsUpdate = true;
          }

        }
      })
    }

    drawEffects(){
      //remove old effects
      if(!this.effectsContainer) return;
      this.updateHiden();
      const oldProne = this.isProne ? true : false;
      this.isProne = this.token?.actor?.effects?.find(e => e.getFlag("core", "statusId") === CONFIG.Combat.defeatedStatusId) || this.isTokenProne ? true : false;
      if(oldProne !== this.isProne) this.toggleProne();
      const tokenEffects = this.token.data.effects;
      const actorEffects = this.token.actor?.temporaryEffects || [];
      const effects = tokenEffects.concat(actorEffects).map(e => e.data?.icon);
      if(effects.length === this.effectsContainer.children.length) return;
      const toRemove = this.effectsContainer.children.filter(child => !effects.includes(child.userData.effect));
      toRemove.forEach(child => {
        child.userData.targetPosition = new THREE.Vector3(0,0,0);
        child.userData.initialPosition = child.position.clone();
        child.userData.delta = 0;
      })
      //this.effectsContainer.remove(...toRemove)
      let effectsize = this.h/5;
      effectsize = Math.min(Math.max(effectsize, 0.02), 0.05)*(canvas.grid.size/100);

      const radiusSubdivision = (Math.PI*2)/effects.length;
      let currentRadius = 0;
      const currentEffects = this.effectsContainer.children.map(child => child.userData.effect);      for(let effect of effects){


        const position = {
          x: Math.sin(currentRadius)*(this.h/2),
          y: this.d+effectsize*0.5,
          z: Math.cos(currentRadius)*(this.h/2),
        }
        const mesh = this._getEffectMesh(effect, effectsize);
        mesh.userData.delta = 0;
        mesh.userData.effect = effect;
        mesh.userData.targetPosition = new THREE.Vector3(position.x,position.y,position.z) //mesh.position.set(position.x, position.y, position.z);
        mesh.userData.initialPosition = mesh.position.clone();

        this.effectsContainer.add(mesh);
        currentRadius += radiusSubdivision;
      }


    }

    rotateEffects(delta){
      if(!this.effectsContainer || !this.effectsContainer?.children?.length) return;
      const speed = delta/8
      this.effectsContainer.rotation.y += speed;
      this.effectsContainer.children.forEach(c => {
        c.rotation.x-=speed/2
        if(c.userData.delta < 1) {
          c.userData.delta += delta;
          c.position.lerp(c.userData.targetPosition, c.userData.delta);
          console.log(delta, c.userData.delta)
        }else{
          if(c.position.y <= 0.01) c.removeFromParent();
        }
      })
    }
    _getEffectMesh(effect,effectsize){
      if(this._effectsCache[effect]) return this._effectsCache[effect];
      const effectBaseMesh = game.Levels3DPreview.models.effect.clone();
      effectBaseMesh.scale.multiplyScalar(effectsize);
      const mesh = effectBaseMesh;
      mesh.traverse(child => {
        if(child.isMesh && child.material.name == "effect") child.material = this._getEffectMaterial(effect);
      })
      mesh.rotation.set(Math.random()*Math.PI*2,Math.random()*Math.PI*2,Math.random()*Math.PI*2);
      this._effectsCache[effect] = mesh;
      return mesh;
    }

    _getEffectMaterial(effect){
      const cachedEffect = this._parent.effectsCache[effect];
      if(cachedEffect) return cachedEffect;
      const material = new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load(effect),
        metalness: 0.5,
        roughness: 0.5,
      });
      this._parent.effectsCache[effect] = material;
      return material;
    }

    drawBorder(){
      this.border.children.forEach(child => {
        this.border.remove(child);
      });
      const baseRadius = Math.max(this.token.w, this.token.h);
      const slant = 0.005*(canvas.grid.size/100);
      let width = (baseRadius*1.02)/this.factor;
      width -= ((width*Math.SQRT2)/5)/2;
      let height = (baseRadius*1.02)/this.factor;
      height -= ((height*Math.SQRT2)/5)/2;
      const depth = this.isBase ? this.baseDepth : 0.000001;
      const cubesize = Math.max(width, height)/6;
      let mesh,indicatorMesh,highlightMesh;
      if(!this.isBase){
      const geometry = new THREE.BoxGeometry(width, depth , height);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        visible: false,
        opacity: 1,
        transparent: true,
        map: this.selectedImage ? new THREE.TextureLoader().load(this.selectedImage) : null,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0,0.001,0);
      }else{
        const geometry = new THREE.CylinderGeometry(width/2-slant, height/2, depth, 64);
        const mat1 = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 0.8,
          roughness: 0.4,
        });
        const mat2 = new THREE.MeshStandardMaterial({
          color: new THREE.Color(this.baseColor),//0x1c1c1c,
          roughness: 0.4,
          normalMap: this._parent.textures.indicator.normal,
          normalScale: new THREE.Vector2(0.2,0.2),
        });
        const mat3 = mat1.clone();
        //const mat4 = mat1.clone();
        const mat4 = new THREE.MeshStandardMaterial({
          emissiveIntensity: 0.8,
        });
        mat3.emissive = this.combatColor;
        mat3.color = this.combatColor;
        const userColor = new THREE.Color(game.user.color); 
        //mat4.color = userColor;
        const highlightGeometry = new THREE.TorusGeometry((width/2-slant)*0.85,(width/2-slant)*0.03, 8, 64)//new THREE.ExtrudeGeometry(arcShape, extrudeSettings);
        highlightMesh = new THREE.Mesh(highlightGeometry, mat1);
        highlightMesh.rotation.x = -Math.PI/2;
        highlightMesh.rotation.z = Math.PI/2;
        highlightMesh.position.set(0,depth+0.0001,0);
        highlightMesh.scale.set(1,1,0.1);

        mesh = new THREE.Mesh(geometry, [mat1, mat2, mat2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if(this.baseMode === "solidindicator"){
          const indicatorGeometry = new THREE.BoxGeometry(cubesize, depth-0.00001 , cubesize);
          indicatorMesh = new THREE.Mesh(indicatorGeometry, [mat2, mat1, mat2, mat2, mat1, mat2]);
          indicatorMesh.position.set(0,depth/2,(width-slant*2)/2.2);
          indicatorMesh.rotation.set(0,Math.PI/4,0);
          indicatorMesh.castShadow = true;
          indicatorMesh.receiveShadow = true;
        }
        mesh.position.set(0,depth/2,0);
        this.materialsCache = {
          base: mat2,
          highlight: mat1,
          combat: mat3,
          targeted: mat4,
        }
      }
      this.border.add(mesh);
      this.addStem(Math.min(width,height));
      if(indicatorMesh) this.border.add(indicatorMesh);
      if(highlightMesh)this.border.add(highlightMesh);

    }

    addStem(radius){
      if(!this.isBase || !this.stem) return;
      radius*=0.03;
      const height = new THREE.Box3().setFromObject(this.model).min.y*2;
      const stemMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 64), new THREE.MeshStandardMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.5,
        roughness: 0,
        metalness: 1,

      }));
      stemMesh.position.set(0,height/2,0);
      stemMesh.castShadow = true;
      stemMesh.receiveShadow = true;
      this.stem = stemMesh;
      this.border.add(stemMesh);
    }

    updateTargetTexture(){
      if(!this.isBase) return;
      const colors = Array.from(this.token.targeted).map(t => t.color);
      const colorstring = colors.join("");
      if(!colors.length) return;
      let text
      if(!this._parent.targetTextures[colorstring]){
        let g = new PIXI.Graphics();
      for(let i = 0; i < colors.length; i++){
        g.beginFill(colors[i].replace("#", "0x"));
        g.drawRect(i,0,1,1);
      }
      const base64 = canvas.app.renderer.extract.base64(g);
      text = new THREE.TextureLoader().load(base64,(t) => {t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true;});
      this._parent.targetTextures[colorstring] = text;  
      }else{
        text = this._parent.targetTextures[colorstring];
      }
      this.materialsCache.targeted.map = text;
      this.materialsCache.targeted.emissiveMap = text;

    }

    refreshBorder(){
      if(!this.border) return;
      if(!this.isBase){
        const color = this.token.border?._lineStyle?.color ?? 0xffffff;
        const visible = this.token.border?.height ? true : false;
        this.border.children.forEach(child => {
          child.material.color = this.colorizeIndicator ? new THREE.Color(color) : new THREE.Color(color);
          child.material.visible = visible;
        });
      }else{
        const color = this.token.border?._lineStyle?.color ?? 0xffffff;
        const isInactive = !color
        const isActiveCombatant = game.combat?.current?.tokenId === this.token.id && game.settings.get("levels-3d-preview", "highlightCombat");
        const threeColor = isInactive && isActiveCombatant ? new THREE.Color(this.combatColor) : new THREE.Color(color);
        const material = this.border.children[0].material[0];
        material.color = threeColor;
        material.emissive = threeColor;
        if(this.border.children[2])this.border.children[2].material = isActiveCombatant ? this.materialsCache.combat : this.materialsCache.highlight;
        if(this.token.targeted.size && this.border.children[2]){
          this.border.children[2].material = this.materialsCache.targeted;
        }
      }

    }

    drawName(){
      if(this.nameplate) this.mesh.remove(this.nameplate);
      const name = this.token._drawNameplate();
      const container = new PIXI.Container();
      container.addChild(name);
      const base64 = canvas.app.renderer.extract.base64(container);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: new THREE.TextureLoader().load(base64),
        alphaTest: this._parent.fogExploration ? 0.8 : 0.001,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.center.set(0.5,0.5);
      this.nameplate = sprite;
      const width = name.width/this.factor;
      const height = name.height/this.factor;
      this.nameplate.scale.set(width,height,1);
      this.nameplate.position.set(0, this.d + height/2 + 0.042, 0);
      this.mesh.add(this.nameplate);
    }

    async drawBars(){
      //this.mesh.remove(this.bars);
      if(!this.token?.hud?.bars || !this.token?.hud?.bars?.visible) return;
      const bar1 = this.token.hud.bars["bar1"].clone();
      const bar2 = this.token.hud.bars["bar2"].clone();
      const container = new PIXI.Container();
      container.addChild(bar1);
      container.addChild(bar2);
      bar2.position.set(0, bar1.height+3);
      const base64 = canvas.app.renderer.extract.base64(container);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: await new THREE.TextureLoader().loadAsync(base64),
        alphaTest: this._parent.fogExploration ? 0.8 : 0.001,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.center.set(0.5,0.5);
      this.mesh.remove(this.bars);
      this.bars = sprite;
      const width = container.width/this.factor;
      const height = container.height/this.factor;
      this.bars.scale.set(width,height,1);
      this.bars.position.set(0, this.d -height + 0.037, 0);
      this.mesh.add(this.bars);
    }

    setUpProne(){
      if(this.proneHandler.proneInit) return;
      this.proneHandler = {};
      this.proneHandler.proneInit = true;
      this.proneHandler.originalPosition = this.model.position.clone();
      this.proneHandler.originalRotation = this.model.rotation.clone();
      this.proneHandler.originalScale = this.model.scale.clone();
      const offsetY = this.solidBaseMode === "ontop" ? 0 : this.baseDepth;
      const box = new THREE.Box3().setFromObject(this.model)
      const center = box.getCenter(new THREE.Vector3());
      const dimensions = box.getSize(new THREE.Vector3());

      const targetRotation = this.model.rotation.clone();

      const targetPosition = this.model.position.clone();

      targetPosition.y = targetPosition.y - box.min.y;

      if(isBird(dimensions, center)){
        targetRotation.z = -Math.PI;
        targetPosition.y += dimensions.y + center.y;
      }else if(isCrab(dimensions)){
        targetRotation.z = -Math.PI;
        targetPosition.y += dimensions.y;
      }else if(isDog(dimensions)){
        targetRotation.z = -Math.PI/2;
        targetPosition.x -= dimensions.y/2;
        targetPosition.y += dimensions.x/2;

      }else if(isFlat(this.standUp)){
        targetRotation.x = -Math.PI/2;
        targetPosition.y = targetPosition.y - dimensions.y/2 + 0.009;
      }else if(isHuman(dimensions)){
        targetRotation.x = -Math.PI/2;
        targetPosition.z += dimensions.y/2;
        targetPosition.y += dimensions.z/2;
      }

      targetPosition.y -= offsetY;

      function isBird(box,center){
        return isCrab(box) && center.y > box.y;
      }
      function isCrab(box){
        return box.y < box.x && box.y < box.z
      }
      function isDog(box){
        return box.y > box.x && (box.x < box.z/1.5 || box.z < box.x/1.5)
      }
      function isFlat(box){
        return box
      }
      function isHuman(box){
        return true;
      }

      this.proneHandler.targetPosition = targetPosition;
      this.proneHandler.targetRotation = targetRotation;
      if(this.isProne){
        this.model.position.copy(this.proneHandler.targetPosition);
        this.model.rotation.copy(this.proneHandler.targetRotation);
        if(this.stem) this.stem.visible = !this.isProne;
      }
    }

    toggleProne(){
      if(!this.proneHandler.targetPosition){
        this.setUpProne();
      }
      this.animateProne = true;
      this.proneHandler.currentDelta = 0;
      this.proneHandler.currentTarget = {}
      if(this.isProne){
        this.proneHandler.currentTarget.position = this.proneHandler.targetPosition
        this.proneHandler.currentTarget.rotation = this.proneHandler.targetRotation
      }else{
        this.proneHandler.currentTarget.position = this.proneHandler.originalPosition
        this.proneHandler.currentTarget.rotation = this.proneHandler.originalRotation
      }
      if(this.stem) this.stem.visible = !this.isProne;
    }

    updateProne(delta){
      this.animationHandler.animate(delta);
      if(!this.proneHandler || !this.animateProne || !this.proneHandler.currentTarget) return;
      this.proneHandler.currentDelta += delta;
      this.model.position.lerp(this.proneHandler.currentTarget.position, this.proneHandler.currentDelta);
      const oRotationV3 = new THREE.Vector3(this.proneHandler.currentTarget.rotation.x, this.proneHandler.currentTarget.rotation.y, this.proneHandler.currentTarget.rotation.z);
      const mRotationV3 = new THREE.Vector3(this.model.rotation.x, this.model.rotation.y, this.model.rotation.z);
      mRotationV3.lerp(oRotationV3, this.proneHandler.currentDelta);
      this.model.rotation.set(mRotationV3.x, mRotationV3.y, mRotationV3.z);
      if(this.proneHandler.currentDelta >= 1){
        this.animateProne = false;
        this.model.position.set(this.proneHandler.currentTarget.position.x, this.proneHandler.currentTarget.position.y, this.proneHandler.currentTarget.position.z);
        this.model.rotation.set(this.proneHandler.currentTarget.rotation.x, this.proneHandler.currentTarget.rotation.y, this.proneHandler.currentTarget.rotation.z);
      }
    }

    faceCamera(){
      const camera = this._parent.camera;
      const vector = new THREE.Vector3(0, -1, 0);
      vector.applyQuaternion(camera.quaternion);
      const angle = Math.atan2(vector.x, vector.z);
      this.mesh.rotation.set(this.mesh.rotation._x, angle, this.mesh.rotation._z);
      if(this.standUp && this.standupFace) {
        this.border.rotation.set(
        0,
        -angle - (this.rotateIndicator ? Math.toRadians(this.token.data.rotation) : 0),
        0,
      )
    }
    }

    updateVisibility(){
      if(!this._loaded || !this.mesh || !this.nameplate) return;
      this.mesh.visible = this.alwaysVisible || this.token.visible;
      this.nameplate.visible = this.token.hud?.nameplate?.visible;
      if(this.bars)this.bars.visible = this.token?.hud?.bars?.visible;
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
        stopPropagation: () => {},
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

    _onHoverIn(e) {
      this.placeable._onHoverIn(e);
    }

    _onHoverOut(e) {
      this.placeable._onHoverOut(e);
    }

    destroy(){
      this._parent.scene.remove(this.mesh);
      delete this._parent.tokens[this.id]
    }

    refresh(){
      this.destroy();
      this._parent.addToken(this.token);
    }

    get h(){
      return this._size.z
    }

    get w(){
      return this._size.x;
    }

    get d(){
      return this._size.y;
    }

    get head(){
      return new THREE.Vector3(
        this.mesh.position.x,
        this.mesh.position.y + this.d,
        this.mesh.position.z
      )
    }
  }


  //HOOKS

  Hooks.on("updateToken", (token, updates) => {
    if(!game.Levels3DPreview._active) return;
    const wasFreeUpdated = updates?.flags && updates?.flags["levels-3d-preview"] && updates?.flags["levels-3d-preview"].wasFreeMode !== undefined;
    if(
      (updates?.flags && updates?.flags["levels-3d-preview"] && !wasFreeUpdated) ||
      "light" in updates ||
      "width" in updates ||
      "height" in updates ||
      "img" in updates
      ){
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

  Hooks.on("targetToken", (user,token) => {
    if(game.Levels3DPreview?._active) game.Levels3DPreview.tokens[token.id]?.reDraw();
  })

  Hooks.on("updateToken", (token) => {
    if(game.Levels3DPreview?._active) game.Levels3DPreview.tokens[token.id]?.drawEffects();
  })
  
  Hooks.on("createToken", (tokenDocument) => {
    if(game.Levels3DPreview?._active && tokenDocument.object) game.Levels3DPreview.addToken(tokenDocument.object);
  })
  
  Hooks.on("deleteToken", (tokenDocument) => {
    if(game.Levels3DPreview?._active) game.Levels3DPreview.tokens[tokenDocument.id]?.destroy();
  })

  Hooks.on("updateCombat", () => {
    if(game.Levels3DPreview?._active) {
      for(let token of Object.values(game.Levels3DPreview.tokens)){
        token.refreshBorder();
      }
    }
  })

  Hooks.on("pasteToken", (copy, data) => {
    if(game.Levels3DPreview?._active) {
    const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
    data.forEach(td => td.elevation=pos.z)
    }
  })

  Hooks.on("renderTokenHUD", (hud) => {
    if(!game.Levels3DPreview?._active) return
    const tokenAnimations = game.Levels3DPreview.CONFIG.tokenAnimations
    const height = hud.element.find(`div[data-action="effects"]`).height()
    let taMenuHtml = `<div class="control-icon" data-action="3d-animations">
    <i class="fas fa-magic" title="${game.i18n.localize(`levels3dpreview.tokenAnimations.title`)}" data-action="3d-animations"></i>
    <div class="status-effects" style="transform: translateY(${height}px);" >`
    for(let anim of Object.values(tokenAnimations)){
      if(anim.icon.includes(".")){
        taMenuHtml+= `<img class="effect-control" src="${anim.icon}" title="${anim.name}" data-anim-id="${anim.id}"></i>`
      }else{
        taMenuHtml+= `<i class="${anim.icon ?? "fas fa-magic"} effect-control" title="${anim.name}" data-anim-id="${anim.id}"></i>`
      }
          
    }
    taMenuHtml+=`</div></div>`
    const $taMenu = $(taMenuHtml);
    $taMenu.on("click", (e) => {
      e.preventDefault();
      if(e.target.dataset.action !== "3d-animations") return
      const $statusEffects = $taMenu.find(".status-effects");
      $taMenu.toggleClass("active");
      $statusEffects.toggleClass("active");
    })
    $taMenu.on("click", ".effect-control", (e) => {
      const $effectControl = $(e.currentTarget);
      const animId = $effectControl.data("animId");
      game.Levels3DPreview.playTokenAnimation(hud.object.id, animId);
    })
    hud.element.find(`div[data-action="effects"]`).after($taMenu);
  })