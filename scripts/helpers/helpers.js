import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../entities/ruler3d.js";
import { ParticleSystem } from "./particleSystem.js";

export class Helpers{

    constructor(){
      this.textureCache = {};
      this.materialCache = {};
    }

    async loadTexture(texturePath){
      if(!texturePath) return null;
      if(this.textureCache[texturePath]) return this.textureCache[texturePath];
      const texture = await this.getTexture(texturePath);
      this.textureCache[texturePath] = texture;
      return texture;
    }

    async getTexture(texturePath){
      const extension = texturePath.split('.').pop();
      const isVideo = extension == "mp4" || extension == "webm" || extension == "ogg" || extension == "mov" || extension == "apng";
      if(isVideo){
      let video;
      video = document.createElement( 'video' );
      video.crossOrigin="anonymous";
      video.src = texturePath;
      video.loop = true;
      video.muted = true;
      video.load();
      video.play();	

      await resolveMetadata(video);
      let videoTexture = new THREE.VideoTexture(video);
      videoTexture.format = THREE.RGBAFormat;
      this.isVideo = true;
      return videoTexture;
      }else{
        let texture;
        try{
          texture = await new THREE.TextureLoader().loadAsync(texturePath);
        }catch(e){
          console.error(e);
          return new THREE.Texture();
        }
        return texture;
      }

      function resolveMetadata(video) {
        return new Promise(resolve => {
          video.onloadedmetadata = () => {
            resolve(video);
          };
        });
      }
    }

    async loadModel(modelPath){
      if(!modelPath) return null;
      const model = await this.getModel(modelPath);
      if(!model) return null;
      return model;
    }

    async getModel(modelPath){
      const filePath = modelPath;
      const extension = filePath.split(".").pop().toLowerCase();
      if(extension == "gltf" || extension == "glb"){
        const object = await game.Levels3DPreview.loader.loadAsync(filePath)
        return {
          object: object,
          scene: object.scene,
          model: object.scene,
        }
        };
      if(extension == "fbx") {
        const object = await game.Levels3DPreview.FBXLoader.loadAsync(filePath)
        return {
          object: object,
          scene: object,
          model: object,
        }
         };
      return null;
    }

    animateCamera(target,options = {}){
      const speed = options.speed || 0.04;
      const rotation = options.rotation || 0;
      const distance = (options.distance || 3000)/factor;
      const topdown = options.topdown || false;
      const cameraParams = {}
      let token3D
      if(game.Levels3DPreview.tokens[target.id]) token3D = game.Levels3DPreview.tokens[target.id];

      if(token3D){
        const size = Math.max(token3D.w, token3D.h, token3D.d)*8;
        const rotation = token3D.mesh.rotation.y-Math.PI/2;
        const offset = new THREE.Vector3(-size*Math.cos(rotation), size, size*Math.sin(rotation));
        offset.add(token3D.mesh.position);
        cameraParams.cameraPosition = offset;
        const targetLookat = new THREE.Vector3(token3D.mesh.position.x, token3D.mesh.position.y, token3D.mesh.position.z);
        cameraParams.cameraLookat = targetLookat;
      }else{
        const targetPosition = Ruler3D.posCanvasTo3d(target)
        if(topdown){
          cameraParams.cameraPosition = new THREE.Vector3(targetPosition.x, targetPosition.y+distance, targetPosition.z);
          cameraParams.cameraLookat = new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z);
          cameraParams.speed = speed;
        }else{
          const offset = new THREE.Vector3(-distance*Math.cos(rotation), distance, distance*Math.sin(rotation));
          offset.add(targetPosition);
          cameraParams.cameraPosition = offset;
          const targetLookat = new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z);
          cameraParams.cameraLookat = targetLookat;
          cameraParams.speed = speed;
        }

      }

      game.Levels3DPreview._animateCameraTarget.cameraPosition = cameraParams.cameraPosition;
      game.Levels3DPreview._animateCameraTarget.cameraLookat = cameraParams.cameraLookat;
      game.Levels3DPreview._animateCameraTarget.speed = cameraParams.speed;


    }

    focusCameraToCursor(speed = 0.04){
      const cameraPosition = game.Levels3DPreview.camera.position.clone();
      const cameraLookat = game.Levels3DPreview.interactionManager.canvas3dMousePosition.clone();
      this.focusCameraToPosition(cameraPosition, cameraLookat);
      this._ping();
    }

    _ping(){
      if(!game.user.isGM && !game.settings.get("levels-3d-preview", "canping")) return ui.notifications.error(game.i18n.localize("levels3dpreview.errors.canping"));
      const highPos = game.Levels3DPreview.interactionManager.canvas2dMousePosition.clone();
      highPos.z = 500;
      new Particle3D("r")
          .from(highPos)
          .to(game.Levels3DPreview.interactionManager.canvas2dMousePosition)
          .sprite("modules/levels-3d-preview/assets/particles/trace_07.png")
          .color(game.user.color)
          .scale(3,3)
          .life(1000)
          .rate(100,1)
          .alpha(0.2,0)
        .start()
    }

    focusCameraToPosition(cameraPosition, cameraLookat, speed = 0.04){
      if(!game.user.isGM && !game.settings.get("levels-3d-preview", "canpingpan")) return ui.notifications.error(game.i18n.localize("levels3dpreview.errors.canpingpan"));
      game.Levels3DPreview.socket.executeForEveryone(
        "socketCamera",
        {cameraPosition, cameraLookat, speed}
      );
    }

    socketCamera(params){
      params.cameraPosition = new THREE.Vector3(params.cameraPosition.x, params.cameraPosition.y, params.cameraPosition.z);
      params.cameraLookat = new THREE.Vector3(params.cameraLookat.x, params.cameraLookat.y, params.cameraLookat.z);
      game.Levels3DPreview._animateCameraTarget.cameraPosition = params.cameraPosition;
      game.Levels3DPreview._animateCameraTarget.cameraLookat = params.cameraLookat;
      game.Levels3DPreview._animateCameraTarget.speed = params.speed ?? 0.04;
    }

}