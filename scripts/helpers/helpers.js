import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';

export class Helpers{

    static async loadTexture(texturePath){
        if(!texturePath) return null;
        const extension = texturePath.split('.').pop();
        const isVideo = extension == "mp4" || extension == "webm" || extension == "ogg" || extension == "mov" || extension == "apng";
        if(isVideo){
        let video;
        let videoTexture
          video = $(`<video id="video" loop crossOrigin="anonymous" autoplay="true" muted="muted" playsinline style="display:none;height:auto;width:auto;">
          <source src="${texturePath}"
            type='video/${extension};'>
        </video>`)
        game.Levels3DPreview.videoTextureContinaer.append(video);
        await resolveMetadata(video[0]);
        videoTexture = new THREE.VideoTexture(video[0]);
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

}