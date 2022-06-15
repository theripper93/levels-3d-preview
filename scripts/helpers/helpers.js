import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../entities/ruler3d.js";

export class Helpers {
  constructor() {
    this.textureCache = {};
    this.materialCache = {};
    this.modelCache = {};
    this.baseCache = {};
    this.envCache = {};
    this.ruler3d = Ruler3D;
  }

  async loadTexture(texturePath, options = {}) {
    if (!texturePath) return null;
    if (this.textureCache[texturePath] && !options.noCache) return this.textureCache[texturePath];
    const texture = await this.getTexture(texturePath);
    texture.encoding = options.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
    this.textureCache[texturePath] = texture;
    return texture;
  }

  async getTexture(texturePath) {
    const extension = texturePath.split(".").pop();
    const isVideo =
      extension == "mp4" ||
      extension == "webm" ||
      extension == "ogg" ||
      extension == "mov" ||
      extension == "apng";
    if (isVideo) {
      let video;
      video = document.createElement("video");
      video.crossOrigin = "anonymous";
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
    } else {
      let texture;
      try {
        texture = await new THREE.TextureLoader().loadAsync(texturePath);
      } catch (e) {
        return new THREE.Texture();
      }
      return texture;
    }

    function resolveMetadata(video) {
      return new Promise((resolve) => {
        video.onloadedmetadata = () => {
          resolve(video);
        };
      });
    }
  }

  async loadModel(modelPath) {
    if (!modelPath) return null;
    const model = await this.getModel(modelPath);
    if (!model) return null;
    return model;
  }

  preloadModel(modelPath) {
    return new Promise((resolve, reject) => {
      this.loadModel(modelPath).then((data) => {
        resolve(data);
      })
    });
  }  

  async getBase(path){
    let scale = 1;
    let showDisp = false;
    if(!path){
      const sett = game.settings.get("levels-3d-preview", "baseStyle");
      const bData = game.Levels3DPreview.CONFIG.tokenBase.find(b => b?.id == sett) ?? game.Levels3DPreview.CONFIG.tokenBase[0];
      path = bData.path;
      scale = bData.scale ?? 1;
      showDisp = bData.showDisp ?? false;
    }
      const data = await this.loadModel(path);
      const model = data.model;
      return {model, scale, showDisp};

  }

  async getModel(modelPath) {
    const filePath = modelPath;
    if(this.modelCache[modelPath]) return this.getClone(modelPath);
    const extension = filePath.split(".").pop().toLowerCase();
    let output;
    try {
      if (extension == "gltf" || extension == "glb" || extension.startsWith("[heroforge]")) {
        const object = await game.Levels3DPreview.loader.loadAsync(filePath);
        output = {
          object: object,
          scene: object.scene,
          model: object.scene,
          isGltf: true,
        };
      }else if (extension == "fbx") {
        const object = await game.Levels3DPreview.FBXLoader.loadAsync(filePath);
        output = {
          object: object,
          scene: object,
          model: object,
          isGltf: false,
        };
      }else{
        output = null;
      }
    } catch (e) {
      output = null;
    }
    this.modelCache[modelPath] = output;
    return this.getClone(modelPath);
  }

  getClone(filePath){
    const cached = this.modelCache[filePath];
    const clonedModel = this.deepCloneRecursive(cached.model);
    return {
      object: cached.isGltf ? cached.object : clonedModel,
      scene: clonedModel,
      model: clonedModel,
      isGltf: cached.isGltf,
    }
  }

  deepCloneRecursive(object3d) {
    const clone = object3d.isMesh ? this.cloneMesh(object3d) : object3d.clone(false);
    object3d.children.forEach((child) => {
      clone.add(this.deepCloneRecursive(child));
    })
    return clone;

  }

  cloneMesh(mesh){
    const clone = mesh.clone(false);
    clone.material = this.cloneMaterial(mesh.material);
    return clone;
  }

  cloneMaterial(material) {
    if(!material) return null;
    if(material instanceof Array){
      return material.map(m => this.cloneMaterial(m));
    }else{
      const materialClone = material.clone();
      return materialClone;
    }
  }

  async getPBRMat(texturePath, options = {}) {
    if (this.materialCache[texturePath] && !options.noCache) return this.materialCache[texturePath];
    let path = texturePath;
    const folder = path.split("/").slice(0, -1).join("/");
    const extension = path.split(".").pop();
    path = path.replace("." + extension, "");
    const tTypes = [
      "Color",
      "Roughness",
      "Metalness",
      "AmbientOcclusion",
      "NormalGL",
      "Emissive",
    ];
    tTypes.forEach((t) => {
      path = path.replace(t, "");
    });
    const tPaths = tTypes.map((t) => {
      return path + t + "." + extension;
    });
    const textures = {
      map: await this.loadTexture(tPaths[0],options),
      roughnessMap: await this.loadTexture(tPaths[1],options),
      metalnessMap: await this.loadTexture(tPaths[2],options),
      aoMap: await this.loadTexture(tPaths[3],options),
      normalMap: await this.loadTexture(tPaths[4],options),
      emissiveMap: await this.loadTexture(tPaths[5],options),
    };
    for (let [k, v] of Object.entries(textures)) {
      if (!v.image) delete textures[k];
      if (v.image) {
        v.wrapS = THREE.RepeatWrapping;
        v.wrapT = THREE.RepeatWrapping;
      }
    }
    if(textures.emissiveMap) textures.emissive = new THREE.Color(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ ...textures });
    this.materialCache[texturePath] = material;
    return material;
  }

  async autodetectTextureOrMaterial(path, options = {}) {
    return this.isPBR(path)
      ? await this.getPBRMat(path,options)
      : await this.loadTexture(path,options);
  }

  groundModel(object, autoground = false,autocenter = false){
    const box = new THREE.Box3().setFromObject(object);
    const width = box.max.x - box.min.x;
    const height = box.max.z - box.min.z;
    const minY = box.min.y;
    if(autoground){
      object.position.y -= minY;
    }
    if(autocenter){
      object.position.x -= box.min.x;
      object.position.z -= box.min.z;
      object.position.x -= width / 2;
      object.position.z -= height / 2;
    }
    const group = new THREE.Group();
    group.add(object);
    return group;
    /*object.traverse((child) => {
      if (child.isMesh) {
        child.position.y -= minY;
      }
    })*/
    return object;
  }
  
  is3DModel(filename){
    filename = filename.toLowerCase();
    return filename.endsWith(".fbx") || filename.endsWith(".glb") || filename.endsWith(".gltf");
  }

  isPBR(path) {
    if (!path) return false;
    const tTypes = [
      "Color",
      "Roughness",
      "Metalness",
      "AmbientOcclusion",
      "NormalGL",
      "Emissive",
    ];
    return tTypes.some((t) => {
      return path.includes(t);
    });
  }

  animateCamera(target, options = {}) {
    if(game.Levels3DPreview.interactionManager.isCameraLocked) return;
    const speed = options.speed || 0.04;
    const rotation = options.rotation || 0;
    const distance = (options.distance || 3000) / factor;
    const topdown = options.topdown || false;
    const cameraParams = {};
    let token3D;
    if (game.Levels3DPreview.tokens[target.id])
      token3D = game.Levels3DPreview.tokens[target.id];

    if (token3D) {
      const size = Math.max(token3D.w, token3D.h, token3D.d) * 8;
      const rotation = token3D.mesh.rotation.y - Math.PI / 2;
      const offset = new THREE.Vector3(
        -size * Math.cos(rotation),
        size,
        size * Math.sin(rotation)
      );
      offset.add(token3D.mesh.position);
      cameraParams.cameraPosition = offset;
      const targetLookat = new THREE.Vector3(
        token3D.mesh.position.x,
        token3D.mesh.position.y,
        token3D.mesh.position.z
      );
      cameraParams.cameraLookat = targetLookat;
    } else {
      const targetPosition = Ruler3D.posCanvasTo3d(target);
      if (topdown) {
        cameraParams.cameraPosition = new THREE.Vector3(
          targetPosition.x,
          targetPosition.y + distance,
          targetPosition.z
        );
        cameraParams.cameraLookat = new THREE.Vector3(
          targetPosition.x,
          targetPosition.y,
          targetPosition.z
        );
        cameraParams.speed = speed;
      } else {
        const offset = new THREE.Vector3(
          -distance * Math.cos(rotation),
          distance,
          distance * Math.sin(rotation)
        );
        offset.add(targetPosition);
        cameraParams.cameraPosition = offset;
        const targetLookat = new THREE.Vector3(
          targetPosition.x,
          targetPosition.y,
          targetPosition.z
        );
        cameraParams.cameraLookat = targetLookat;
        cameraParams.speed = speed;
      }
    }

    game.Levels3DPreview._animateCameraTarget.cameraPosition =
      cameraParams.cameraPosition;
    game.Levels3DPreview._animateCameraTarget.cameraLookat =
      cameraParams.cameraLookat;
    game.Levels3DPreview._animateCameraTarget.speed = cameraParams.speed;
  }

  focusCameraToCursor(speed = 0.04) {
    if(game.Levels3DPreview.interactionManager.isCameraLocked) return;
    const cameraPosition = game.Levels3DPreview.camera.position.clone();
    const cameraLookat =
      game.Levels3DPreview.interactionManager.canvas3dMousePosition.clone();
    this.focusCameraToPosition(cameraPosition, cameraLookat);
    this._ping();
  }

  _ping() {
    if (!game.user.isGM && !game.settings.get("levels-3d-preview", "canping"))
      return ui.notifications.error(
        game.i18n.localize("levels3dpreview.errors.canping")
      );
    const highPos =
      game.Levels3DPreview.interactionManager.canvas2dMousePosition.clone();
    highPos.z = 500;
    new Particle3D("r")
      .from(highPos)
      .to(game.Levels3DPreview.interactionManager.canvas2dMousePosition)
      .sprite("modules/levels-3d-preview/assets/particles/trace_07.png")
      .color(game.user.color)
      .scale(3, 3)
      .life(1000)
      .rate(100, 1)
      .alpha(0.2, 0)
      .start();
  }

  focusCameraToPosition(cameraPosition, cameraLookat, speed = 0.04) {
    if(game.Levels3DPreview.interactionManager.isCameraLocked) return;
    if (
      !game.user.isGM &&
      !game.settings.get("levels-3d-preview", "canpingpan")
    )
      return ui.notifications.error(
        game.i18n.localize("levels3dpreview.errors.canpingpan")
      );
    game.Levels3DPreview.socket.executeForEveryone("socketCamera", {
      cameraPosition,
      cameraLookat,
      speed,
    });
  }

  playTokenAnimationSocket(params){
    let {tokenIds, animationId, options} = params
    if(!game.Levels3DPreview?._active) return;
    for(let id of tokenIds){
      const token = game.Levels3DPreview.tokens[id];
      if(token){
        token.animationHandler.playAnimation(animationId, options);
      }
    }
  }

  socketCamera(params) {
    params.cameraPosition = new THREE.Vector3(
      params.cameraPosition.x,
      params.cameraPosition.y,
      params.cameraPosition.z
    );
    params.cameraLookat = new THREE.Vector3(
      params.cameraLookat.x,
      params.cameraLookat.y,
      params.cameraLookat.z
    );
    game.Levels3DPreview._animateCameraTarget.cameraPosition =
      params.cameraPosition;
    game.Levels3DPreview._animateCameraTarget.cameraLookat =
      params.cameraLookat;
    game.Levels3DPreview._animateCameraTarget.speed = params.speed ?? 0.04;
  }

  syncClipNavigator(range){
    game.Levels3DPreview.ClipNavigation.set(range);
  }
}


export function toggleAdvancedSettings(app, html, settings){
  for(let setting of settings){
    html.find(`[name="flags.levels-3d-preview.${setting}"]`).closest(".form-group").toggle();
  }
  app.setPosition({height: "auto"});
}

export function injectAdvancedToggle(app, html, settings, injected){
  const alwaysShowAdvanced = game.settings.get("levels-3d-preview", "showAdvanced");
  if(alwaysShowAdvanced) return;
  const toggleAdvanced = $(`<div class="form-group"><a style="text-align: center; font-weight: bolder; text-decoration: underline;">${game.i18n.localize("levels3dpreview.settings.showAdvanced.show")}</a></div>`);
  (injected.find(".form-group").last().length ? injected.find(".form-group").last() : $(injected[injected.length-1])).after(toggleAdvanced);
  toggleAdvanced.click(() => {
    toggleAdvancedSettings(app, html, settings)
    toggleAdvanced.find("a").text(toggleAdvanced.find("a").text() === game.i18n.localize("levels3dpreview.settings.showAdvanced.show") ? game.i18n.localize("levels3dpreview.settings.showAdvanced.hide") : game.i18n.localize("levels3dpreview.settings.showAdvanced.show"));
  });
  for(let setting of settings){
    html.find(`[name="flags.levels-3d-preview.${setting}"]`).closest(".form-group").toggle();
  }
}