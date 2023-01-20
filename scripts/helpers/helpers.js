import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../systems/ruler3d.js";
import { mergeVertices } from "../lib/BufferGeometryUtils.js";
import { setPerformancePreset, injectPresetButtons } from "../settings/performancePresets.js";
import {SimplifyModifier} from "../lib/Simplify.js";
import { showSceneReport, showPerformanceDialog } from "../settings/performanceReport.js";

const simplify = new SimplifyModifier();

const sightMeshMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
});

export class Helpers {
  constructor() {
    this.textureCache = {};
    this.materialCache = {};
    this.modelCache = {};
    this.baseCache = {};
    this.envCache = {};
    this._loading = {};
    this.ruler3d = Ruler3D;
    this.setPerformancePreset = setPerformancePreset;
    this.injectPresetButtons = injectPresetButtons;
    this.showPerformanceDialog = showPerformanceDialog;
  }

  async loadTexture(texturePath, options = {}) {
    if (!texturePath) return null;
    if (this.textureCache[texturePath] && !options.noCache) return this.textureCache[texturePath];
    const texture = await this.getTexture(texturePath);
    texture.encoding = options.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textureCache[texturePath] = texture;
    if(!options.noCache) THREE.Cache.remove(texturePath);
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

  wait(ms){
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  async getModel(modelPath) {
    const filePath = modelPath;
    while (this._loading[filePath] || Object.keys(this._loading).length > 0) {
      await this.wait(100);
    }
    if(this.modelCache[modelPath]) return this.getClone(modelPath);
    this._loading[filePath] = true;
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
    if(!output) {
      this.modelCache[modelPath] = null;
      delete this._loading[filePath];
      return null
    };
    let isSkinned = false;
    output.model.traverse((child) => { if(child instanceof THREE.SkinnedMesh) isSkinned = true; });
    this.simplifyGeometry(output.model);
    if(isSkinned) {
      delete this._loading[filePath];
      return output;
    }
    this.modelCache[modelPath] = output;
    THREE.Cache.remove(filePath);
    delete this._loading[filePath];
    return this.getClone(modelPath);
  }

  simplifyGeometry(model, tol = 1e-4){
    let originalVertices = 0;
    let finalVertices = 0;

    model.traverse((child) => {
      if(child.isMesh){
        const count = child.geometry.attributes.position.count;
        originalVertices += count;
        const newGeo = mergeVertices(child.geometry, tol);
        finalVertices += newGeo.attributes.position.count;
        child.geometry = newGeo
      }
    })

    console.log(`3D Canvas | Simplified Geometry Vertices: ${originalVertices} -> ${finalVertices}`);
  }

  getSightMesh(mesh, complexity = 1) {
    const sightMesh = this.deepCloneRecursive(mesh);
    if(complexity == 1) {
      sightMesh.traverse((child) => {
        if(child.isMesh){
          child.material = sightMeshMaterial;
        }
      });
      return sightMesh;
    }
    let originalVerts = 0;
    let finalVerts = 0;
    sightMesh.traverse((child) => {
      if(child.isMesh){
        originalVerts += child.geometry.attributes.position.count;
        //child.geometry = mergeVertices(child.geometry, 0.1 * (1 / complexity));
        child.geometry = simplify.modify(child.geometry, Math.floor(child.geometry.attributes.position.count*(1-complexity)));
        child.material = sightMeshMaterial;
        child.geometry.computeBoundsTree();
        finalVerts += child.geometry.attributes.position.count;
      }
    })
    console.log(`3D Canvas | Created Sight Mesh: ${originalVerts} -> ${finalVerts}`);
    return sightMesh;
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
      side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    };
    for (let [k, v] of Object.entries(textures)) {
      if (!v.image) delete textures[k];
      if (v.image) {
        v.wrapS = THREE.RepeatWrapping;
        v.wrapT = THREE.RepeatWrapping;
      }
    }
    if(textures.emissiveMap) {
      textures.emissive = new THREE.Color(1, 1, 1);
    }
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
  }

  fitToBox(mesh, box, options = {}){
    const boxSize = box.getSize(new THREE.Vector3());
    const boxCenter = box.getCenter(new THREE.Vector3());
    const meshSize = new THREE.Box3().setFromObject(mesh).getSize( new THREE.Vector3() );
    const meshCenter = new THREE.Box3().setFromObject(mesh).getCenter( new THREE.Vector3() );
    const scale = Math.min(boxSize.x / meshSize.x, boxSize.y / meshSize.y, boxSize.z / meshSize.z);
    const position = new THREE.Vector3().subVectors(meshCenter, boxCenter);
    mesh.position.copy(position);
    mesh.scale.set(scale, scale, scale);
    mesh.position.add(boxCenter);
    return mesh;
  }
  
  is3DModel(filename){
    filename = filename.toLowerCase();
    return filename.endsWith(".fbx") || filename.endsWith(".glb") || filename.endsWith(".gltf");
  }

  isPBR(path) {
    if (!path) return false;
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

  showSceneReport() {
    return showSceneReport();
  }
}


export function toggleAdvancedSettings(app, html, settings, other){
  for(let setting of settings){
    html.find(`[name="flags.levels-3d-preview.${setting}"]`).closest(".form-group").toggle();
  }
  other.forEach(o => {
    o.toggle();
  })
  app.setPosition({height: "auto"});
}

export function injectAdvancedToggle(app, html, settings, injected, other = []){
  const alwaysShowAdvanced = game.settings.get("levels-3d-preview", "showAdvanced");
  if(alwaysShowAdvanced) return;
  const toggleAdvanced = $(`<div class="form-group"><a id="levels-3d-preview-advanced" style="color: var(--color-text-hyperlink); text-align: center; font-weight: bolder; text-decoration: underline;">${game.i18n.localize("levels3dpreview.settings.showAdvanced.show")}</a></div>`);
  (injected.find(".form-group").last().length ? injected.find(".form-group").last() : $(injected[injected.length-1])).after(toggleAdvanced);
  toggleAdvanced.click(() => {
    toggleAdvancedSettings(app, html, settings, other);
    toggleAdvanced.find("a").text(toggleAdvanced.find("a").text() === game.i18n.localize("levels3dpreview.settings.showAdvanced.show") ? game.i18n.localize("levels3dpreview.settings.showAdvanced.hide") : game.i18n.localize("levels3dpreview.settings.showAdvanced.show"));
  });
  toggleAdvancedSettings(app, html, settings, other);
}

export function hideParams(app, html, element, flags, hide){
  html.on("change", element, (e) => {
    const value = typeof hide == "boolean" ? e.target.checked : e.target.value;
    if (value === hide) {
      flags.forEach(flag => {
            html.find(`[name="flags.levels-3d-preview.${flag}"]`).closest(".form-group").hide();
        })
    } else {
      flags.forEach(flag => {
            html.find(`[name="flags.levels-3d-preview.${flag}"]`).closest(".form-group").show();
        })
    }
    app.setPosition({height: "auto"});
})
html.find(element).trigger("change");
}

export const tTypes = [
  "Color",
  "Roughness",
  "Metalness",
  "AmbientOcclusion",
  "NormalGL",
  "Emissive",
]