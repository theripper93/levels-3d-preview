import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../entities/ruler3d.js";

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
        return await new THREE.TextureLoader().loadAsync(texturePath);
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

}