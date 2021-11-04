import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';

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
      video.src = texturePath;
      video.loop = true;
      video.muted = true;
      video.load(); // must call after setting/changing source
      video.play();	
      let videoImage = document.createElement( 'canvas' );
      videoImage.width = 480;
      videoImage.height = 204;

      let videoImageContext = videoImage.getContext( '2d' );
      // background color if no video present
      videoImageContext.fillStyle = '#000000';
      videoImageContext.fillRect( 0, 0, videoImage.width, videoImage.height );
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
          model: object.scene.children[0],
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

}