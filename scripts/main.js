import * as THREE from "./lib/three.module.js";
import { OrbitControls } from "./lib/OrbitControls.js";
import { ConvexGeometry } from "./lib/ConvexGeometry.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import {Token3D} from "./entities/token3d.js";
import { Ruler3D } from "./entities/ruler3d.js";
import { Light3D } from "./entities/light3d.js";
import { Wall3D } from "./entities/wall3d.js";
import { Tile3D } from "./entities/tile3d.js";
import { Template3D } from "./entities/template3d.js";
import { Cursors3D } from "./entities/cursors.js";
import { FBXLoader } from './lib/FBXLoader.js';
import { GlobalIllumination } from "./helpers/globalIllumination.js";
import { InteractionManager } from "./helpers/interactionManager.js";
import * as PIXI from "./helpers/pixilayer.js";
import { Helpers } from "./helpers/helpers.js";
import { WeatherSystem } from "./helpers/weatherSystem.js";
import { EXRLoader } from "https://threejs.org/examples/jsm/loaders/EXRLoader.js";
import { compressSync } from "./lib/fflate.module.js";
import { EffectComposer } from './lib/EffectComposer.js';
import { RenderPass } from './lib/RenderPass.js';
import { ShaderPass } from './lib/ShaderPass.js';
import { Fog } from "./helpers/Fog.js";
import { Exporter } from "./helpers/exporter.js";
export const factor = 1000;

Hooks.once("ready", () => {
  game.Levels3DPreview = new Levels3DPreview();
  game.Levels3DPreview.cacheModels();
  Hooks.callAll("3DCanvasReady", game.Levels3DPreview);
})

Hooks.on("canvasReady", async () => {
  do{
    await sleep(100);
    if(!game.Levels3DPreview) continue;
    game.Levels3DPreview._cameraSet = false;
    game.Levels3DPreview.close();
    game.Levels3DPreview.controls.reset();
    const enablePlayers = canvas.scene.getFlag("levels-3d-preview", "enablePlayers");
    const isGM = game.user.isGM;
    if(canvas.scene.getFlag("levels-3d-preview", "auto3d") && (enablePlayers || isGM)){
      game.Levels3DPreview.open();
    }
  }while(!game.Levels3DPreview)


});

Hooks.on("levelsUiChangeLevel", () => {
  if (!game.user.isGM || $("#levels3d").length == 0) return;
  game.Levels3DPreview.build3Dscene();
});

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Levels3DPreview {
  constructor() {
    this.THREE = THREE;
    this.isLevels = game.modules.get("levels")?.active;
    this.fpsKillSwitch = 1;
    this.camera;
    this._animateCameraTarget = {}
    this.scene;
    this.renderer;
    this.factor = factor;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode")
    this.CONFIG = {
      autoPan: false,
    }
    this.setAutopan();
    this.tokens = {};
    this.lights = {
      sceneLights : {}
    };
    this.utils = {
      PIXI : PIXI,
    }
    this.walls = {};
    this.doors = {};
    this.tiles = {};
    this.templates = {};
    this.models = {
      target : new THREE.Mesh(new THREE.SphereGeometry(0.1,32,32))
    };
    this.textures = {
      template: new THREE.TextureLoader().load("icons/svg/explosion.svg"),
      indicator: {
        //aoRM: new THREE.TextureLoader().load("modules/levels-3d-preview/assets/DefaultMaterial_occlusionRoughnessMetallic.png"),
        normal: new THREE.TextureLoader().load("modules/levels-3d-preview/assets/DefaultMaterial_normal.webp", (texture) => {
          texture.repeat = new THREE.Vector2(4,4);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
        }),
      }
    };
    this.effectsCache = {};
    this.targetTextures = {};
    this.Classes = {
      "Template3D" : Template3D,
    }
    this.animationMixers = [];
    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();
    this.FBXLoader = new FBXLoader();
    this._active = false;
    this.tokenAnimationQueue = [];
    this._cameraSet = false;
    this.helpers = new Helpers();
    this.exporter = new Exporter(this);
    $("body").append(`<div id="video-texture-container" style="position: absolute; top: 0; left: 0;display: none;"></div>`);
    this.videoTextureContinaer = $("#video-texture-container");
    this.init3d();

  }

  init3d() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      10000000
    );
    this.camera.position.set(8, 2, 8).setLength(8);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();

    this.scene = new THREE.Scene();
    this.material = new THREE.MeshNormalMaterial();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setAnimationLoop(this.animation);
    this.renderer.shadowMap.enabled = true;
    //this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.antialias = true;

    this.resolutionMulti = game.settings.get("levels-3d-preview", "resolution")*window.devicePixelRatio;
    this.renderer.setPixelRatio(this.resolutionMulti);
    this.renderer.alpha = true;

    //composer
    this.composer = new EffectComposer( this.renderer );

    //set dom element id
    this.renderer.domElement.id = "levels3d";
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.ruler = new Ruler3D(this);
    this.interactionManager = new InteractionManager(this);
    this.interactionManager.activateListeners();
    this.cursors = new Cursors3D(this);
    //this.initEnvMap();
  }

  async cacheModels(){
    this.models.target = await (await this.helpers.loadModel("modules/levels-3d-preview/assets/targetIndicator.fbx")).model;
    this.models.target.children[0].material = new THREE.MeshBasicMaterial();
  }

  get canvasCenter() {
    return {
      x: canvas.dimensions.width / 2 / this.factor,
      y: 0,
      z: canvas.dimensions.height / 2 / this.factor,
    };
  }

  build3Dscene() {
    this.clear3Dscene();
    this.scene = new THREE.Scene();
    this.composer.removePass(this.renderPass);
    this.renderPass = new RenderPass( this.scene, this.camera );
    this.composer.addPass( this.renderPass );
    if(this.fogExploration) {
      this.fogExploration.dispose();
      this.fogExploration = null;
    }
    if(canvas.scene.getFlag("levels-3d-preview", "enableFogOfWar")) this.fogExploration = new Fog(this);

    //this.scene.environment = this.envMap;
    this._active = true;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode")
    this.level = this.isLevels ? parseFloat($(_levels.UI?.element)?.find(".level-item.active").find(".level-bottom").val()) ?? Infinity : Infinity;
    if (isNaN(this.level)) this.level = Infinity;
    this.showSun = this.debugMode;
    this.createTemplates();
    const drawFloors = canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") ?? true;
    const drawWalls = canvas.scene.getFlag("levels-3d-preview", "showSceneWalls") ?? true;
    const drawLights = canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") ?? true;
    this.standUpFaceCamera = game.settings.get("levels-3d-preview", "standupFace") ?? true;
    const enableFog = canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false;
    const fogColor = canvas.scene.getFlag("levels-3d-preview", "fogColor") ?? "#000000";
    const fogDistance = (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) / this.factor;
    drawFloors && this.isLevels && this.createFloors(this.level);
    drawWalls && this.createWalls(this.level);
    drawLights && this.createSceneLights();
    this.createBoard();
    this.createTable();
    for (let token of canvas.tokens.placeables) {
      this.addToken(token);
    }
    if (this.debugMode) this.scene.add(new THREE.AxesHelper(3));

    const size =
      (Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
        this.factor)
      ;
    const divisions =
      (Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
        canvas.scene.dimensions.size)
      ;
    if (canvas.scene.getFlag("levels-3d-preview", "enableGrid")) {
      const gridMode = game.settings.get("levels-3d-preview", "gridMode");
      if(gridMode === "fast"){
        const gridColor = canvas.scene.data.gridColor ?? 0x424242;
        const gridHelper = new THREE.GridHelper(
          size,
          divisions,
          gridColor,
          gridColor
        );
        gridHelper.colorGrid = gridColor;
        gridHelper.position.set(size/2, 0.01, size/2);
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = canvas.scene.data.gridAlpha;
        gridHelper.userData.ignoreHover = true;
        this.scene.add(gridHelper);
      }else{
        this.createGrid();
      }
    }
    if(enableFog) this.scene.fog = new THREE.Fog(fogColor, 1, fogDistance);
    //add raycasting plane

    const dragplane = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false })
    );
    dragplane.position.set(size/2, 0, size/2);
    dragplane.userData.isFloor = true;
    dragplane.rotation.x = -Math.PI / 2;
    this.scene.add(dragplane);
    this.interactionManager.dragplane = dragplane;
    this.makeSkybox();
    const useParticles = canvas.scene.getFlag("levels-3d-preview", "particlePreset") ?? "none";
    this.weather = new WeatherSystem(this);
    this.lights.globalIllumination = new GlobalIllumination(this);
    this.ruler.addMarkers();
    if(!this._cameraSet){
      this.resetCamera()
      this._cameraSet = true;
    }
  }

  addToken(token) {
    new Token3D(token,this).load().then((token3d) => {
      this.scene.add(token3d.mesh);
      this.tokens[token.id] = token3d;
    });
  }

  async createGrid(){
      const base64 = canvas.app.renderer.extract.base64(canvas.grid.grid)
      const texture = await new THREE.TextureLoader().load(base64);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(canvas.grid.width/factor, canvas.grid.height/factor),
        new THREE.MeshBasicMaterial({ map: texture, transparent:true })
      );
      plane.rotateX(-Math.PI / 2);
      plane.position.set((canvas.grid.width/factor)/2 + canvas.grid.grid._localBounds.minX/factor, 0.01, (canvas.grid.height/factor)/2 + canvas.grid.grid._localBounds.minY/factor);
      this.scene.add(plane);
  }

  async createBoard(){
    this.scene.remove(this.board);
    if(!(canvas.scene.getFlag("levels-3d-preview", "renderBackground") ?? true)) return;
    //make a plane and apply a texture
    const width = canvas.scene.dimensions.sceneWidth / this.factor;
    const height = canvas.scene.dimensions.sceneHeight / this.factor;
    const center = this.canvasCenter;
    const depth = 0.02;
    const texture = await this.helpers.loadTexture(canvas.scene.data.img);
    if(texture){
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.NearestMipMapLinearFilter;
    }
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      metalness: 1,
    });
    material.toneMapped = false;
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.castShadow = true;
    const offsetX = canvas.dimensions.shiftX / this.factor;
    const offsetY = canvas.dimensions.shiftY / this.factor;
    plane.position.set(center.x+offsetX, center.y-depth/2-0.00001, center.z+offsetY);
    plane.rotation.x = -Math.PI / 2;
    this.board = plane;
    plane.userData.isBackground = true;
    this.scene.add(plane);

  }

  async createTable(){
    this.scene.remove(this.table);
    if(!(canvas.scene.getFlag("levels-3d-preview", "renderTable") ?? false)) return;
    //make a plane and apply a texture
    const width = canvas.scene.dimensions.width / this.factor;
    const height = canvas.scene.dimensions.height / this.factor;
    const center = this.canvasCenter;
    const depth = Math.max(width, height) / 10;
    const texture = await this.helpers.loadTexture(canvas.scene.getFlag("levels-3d-preview", "tableTex"));
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      metalness: 1,
    });
    material.toneMapped = false;
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.position.set(center.x, center.y-(depth/2+0.011), center.z);
    plane.rotation.x = -Math.PI / 2;
    this.table = plane;
    this.scene.add(plane);

  }

  createSceneLights(){
    if(game.settings.get("levels-3d-preview", "disableLighting")) return;
    for(let light of canvas.lighting.placeables){
      this.addLight(light);
    }
  }

  addLight(light){
    this.lights.sceneLights[light.id]?.destroy();
    const light3d = new Light3D(light, this);
    this.lights.sceneLights[light.id] = light3d;
  }

  createFloors(){
    for (let tile of canvas.background.placeables.concat(canvas.foreground.placeables)) {
      if(this.isLevels){
        const bottom = tile.data.flags.levels?.rangeBottom ?? -Infinity;
        if(bottom > this.level) continue;
      }
      this.createTile(tile);

      if(!this.debugMode) continue;
      if (!tile.roomPoly) continue;
      const top = tile.document.getFlag("levels", "rangeTop") ?? undefined;
      const bottom =
        tile.document.getFlag("levels", "rangeBottom") ?? undefined;
      if (bottom > this.level) continue;
      if (top !== undefined)
        this.scene.add(this.createFloor(tile.roomPoly.points, top));
      if (bottom !== undefined)
        this.scene.add(this.createFloor(tile.roomPoly.points, bottom));
    }
  }

  createTile(tile){
    if(this.debugMode) return;
    this.tiles[tile.id] = new Tile3D(tile, this);
  }

  createWalls() {
    for (let wall of canvas.walls.placeables) {
      if(this.isLevels){
        const bottom = wall.data.flags.wallHeight?.wallHeightBottom ?? -Infinity;
        if(bottom > this.level) continue;
      }
      this.createWall(wall);
    }
  }

  createWall(wall){
    this.walls[wall.id] = new Wall3D(wall, this)
    if(wall.data.door) this.doors[wall.id] = this.walls[wall.id];
  }

  createTemplates(){
    for(let template of canvas.templates.placeables){
      this.createTemplate(template);
    }
  }

  createTemplate(template){
    this.templates[template.id] = new Template3D(template);
  }

  makeSkybox() {
    this.scene.background = null;
    this.scene.environment = null;
    this.isEXR = false;
    this.scene.remove(this.skybox);
    const sceneSize = Math.max(canvas.scene.dimensions.width, canvas.scene.dimensions.height)/100;
    const size = sceneSize < 80 ? 80 : sceneSize;
    this.renderer.outputEncoding = THREE.LinearEncoding
    this.renderer.toneMapping = THREE.NoToneMapping;
    const rootImage = canvas.scene.getFlag("levels-3d-preview", "skybox") ?? "";
    if(rootImage.toLowerCase().endsWith(".exr")) return this.loadEXR(rootImage);
    if (!rootImage) return;
    const imagesSuffix = ["_ft", "_bk", "_up", "_dn", "_rt", "_lf"];
    let currSuffix;
    for (let suffix of imagesSuffix) {
      if (rootImage.includes(suffix)) {
        currSuffix = suffix;
        break;
      }
    }
    let textureArray = [];
    let materialArray = [];
    for (let suffix of imagesSuffix) {
      textureArray.push(rootImage.replace(currSuffix, suffix))
      materialArray.push(
        new THREE.MeshBasicMaterial({
          map: new THREE.TextureLoader().load(
            rootImage.replace(currSuffix, suffix)
          , ),
          side: THREE.BackSide,
        })
      );
    }
    const skyboxGeometry = new THREE.BoxGeometry(size, size, size);
    const skybox = new THREE.Mesh(skyboxGeometry, materialArray);
    const center = this.canvasCenter;
    skybox.position.set(center.x, center.y, center.z);
    this.scene.add(skybox);
    this.skybox = skybox;
    const loader = new THREE.CubeTextureLoader();    
    const textureCube = loader.load( textureArray );
    this.scene.environment = textureCube;
  }

  loadEXR(rootImage){
    this.isEXR = true;
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const _this = this;
    new EXRLoader()
        .setDataType(THREE.UnsignedByteType)
        .load(
          rootImage,
            function (texture) {
                let exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
                let newEnvMap = exrCubeRenderTarget ? exrCubeRenderTarget.texture : null;
                _this.scene.environment = newEnvMap;
                _this.scene.background = newEnvMap;

            }
        );
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        //this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  createFloor(points, z) {
    const alpha = canvas.scene.getFlag("levels-3d-preview", "wallFloorAlpha") ?? 0.5;
    let shape = new THREE.Shape();
    const f = this.factor;
    z *= (-1 * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
    shape.moveTo(points[0] / f, points[1] / f);
    for (let i = 2; i < points.length; i += 2) {
      shape.lineTo(points[i] / f, points[i + 1] / f);
    }

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.translate(0, 0, z);
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshMatcapMaterial({
      color: 0x00ff00,
      opacity: alpha,
      transparent: true,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  }

  clear3Dscene() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.tokens = {};
    this.walls = {};
    this.doors = {};
    this.lights.sceneLights = {};
    this.tiles = {};
    this.cursors.clear();
  }

  resizeCanvasToDisplaySize(_this) {
    const canvas = _this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      _this.renderer.setSize(width, height, false);
      _this.camera.aspect = width / height;
      _this.camera.updateProjectionMatrix();
    }
  }

  centerTokenHUD(){
    const hud = canvas.hud.token;
    if(!hud.object || !this._active) return;
    const token3D = this.tokens[hud.object.id];
    if(!token3D) return;
    const center = token3D.mesh.position.clone();
    center.y += token3D.hitbox.geometry.boundingBox.max.y;
    Ruler3D.centerElement(hud.element, center);
  }

  animation(time) {
    const _this = game.Levels3DPreview;
    if(!_this._active) return;
    _this.interactionManager.dragObject();
    _this.cursors.update();
    const delta = _this.clock.getDelta();
    Object.values(_this.tokens).forEach((token) => {
      token.updateVisibility();
      if(token.mixer){
        token.mixer.update(delta);
      }
      if(token.standUp && token.standupFace){
        token.faceCamera();
      }
    });

    _this.checkInFog();
    _this.animateCamera(delta);
    _this.centerTokenHUD();
    _this.resizeCanvasToDisplaySize(_this);
    _this.weather?.update();
    _this.controls.update();
    //_this.renderer.render(_this.scene, _this.camera);
    _this.fogExploration?.update();
    _this.composer.render(time);
  }

  checkInFog(){
    let inFog = false;
    for(let template of Object.values(this.templates)){
      if(template.pointInFogmesh(this.camera.position)){
        inFog = true;
        break;
      }
    }
    this.scene.visible = !inFog;
  }

  setAutopan(value){
    if(!value) value = game.settings.get("levels-3d-preview", "autoPan");
    switch(value){
      case "none":
        return this.CONFIG.autoPan = false;
      case "player":
        return this.CONFIG.autoPan = !game.user.isGM;
      case "all":
        return this.CONFIG.autoPan = true;
    }
  }

  animateCamera(delta){
    if(this._animateCameraTarget.cameraPosition !== undefined && this._animateCameraTarget.cameraLookat !== undefined){
      const targetPos = this._animateCameraTarget.cameraPosition.clone();
      const targetLookat = this._animateCameraTarget.cameraLookat.clone();
      const currentLookat = this._animateCameraTarget.currentLookat ?? this.controls.target.clone();
      const lerpLookat = currentLookat.lerp(targetLookat, 0.1);
      this._animateCameraTarget.currentLookat = lerpLookat.clone();
      this.camera.position.lerp(targetPos, this._animateCameraTarget.speed ?? 0.04);
      this.controls.target.set(lerpLookat.x, lerpLookat.y, lerpLookat.z);
      if(this.camera.position.distanceTo(targetPos) < 0.01 && lerpLookat.distanceTo(targetLookat) < 0.01){
        this.controls.target.set(targetLookat.x, targetLookat.y, targetLookat.z);
        this._animateCameraTarget = {
          cameraPosition: undefined,
          cameraLookat: undefined,
          currentLookat: undefined,
        };
      }
    }
  }

  stopCameraAnimation(){
    this._animateCameraTarget = {
      cameraPosition: undefined,
      cameraLookat: undefined,
      currentLookat: undefined,
    };
  }

  resetCamera(topdown = false) {
    const center = this.canvasCenter;
    this.controls.reset();
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxDistance = 20;
    this.controls.minDistance = 0.1;
    this.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
    this.controls.target.set(center.x, center.y, center.z);
    topdown ? this.camera.position.set(center.x, center.y + 4, center.z) : this.camera.position.set(center.x*1.5, center.y + 1, center.z*2);
    this.camera.lookAt(center);
    this.controls.update();
  }

  setCameraToControlled(token){
    const zoom = game.settings.get("levels-3d-preview", "camerafocuszoom")
    const cToken = token ?? _token;
    if(!cToken) return;
    const token3D = this.tokens[cToken.id];
    if(!token3D) return;
    //this.controls.target.set(token3D.mesh.position.x, token3D.mesh.position.y, token3D.mesh.position.z);
    if(zoom){
      const size = Math.max(token3D.w, token3D.h, token3D.d, 0.6)*2;
      const rotation = token3D.mesh.rotation.y-Math.PI/2;
      const offset = new THREE.Vector3(-size*Math.cos(rotation), size, size*Math.sin(rotation));
      offset.add(token3D.mesh.position);
      this._animateCameraTarget.cameraPosition = offset;
      //this.camera.position.copy(offset);

    }
    const targetLookat = new THREE.Vector3(token3D.mesh.position.x, token3D.mesh.position.y, token3D.mesh.position.z);
    this._animateCameraTarget.cameraLookat = targetLookat;
    //this.camera.lookAt(targetLookat);
    //this.controls.update();
  }

  toggle(force){
    if(force !== undefined){
      force ? this.open() : this.close();
      return;
    }
    if(this._active){
      this.close();
    }else{
      this.open();
    }
  }

  open() {
    if(this._active) return;
    this.build3Dscene();
    document.body.appendChild(this.renderer.domElement);
    if(game.settings.get("levels-3d-preview", "miniCanvas")) new miniCanvas().render(true);
    else {
      $("#board").hide();
      canvas.stage.renderable = false;
    }
  }

  close(){
    this._active = false;
    $("#levels3d").remove();
    Object.values(ui.windows)?.find(w => w.id === "miniCanvas")?.close(true);
    $("#board").show();
    canvas.stage.renderable = true;
    this.clear3Dscene();
  }

  reload(){
    if(!this._active) return;
   this._cameraSet = false;
   this.close();
   this.open();
  }
}

Hooks.on("sightRefresh", () => {
  if(game.Levels3DPreview?._active && game.Levels3DPreview.fogExploration){
    game.Levels3DPreview.fogExploration.debouncedUpdate(true);
  }
})

Hooks.on("updateScene", (scene,updates) => {
  if(!game.Levels3DPreview?._active || scene.id !== canvas.scene.id) return;
  if("img" in updates) game.Levels3DPreview.createBoard();
  const flags = updates.flags ? updates.flags["levels-3d-preview"] : undefined;
  if(!flags) return;
  if(//do reload
    "enableGrid"  in flags ||
    "enableFogOfWar" in flags ||
    "enableFog" in flags ||
    "fogColor" in flags ||
    "fogDistance" in flags ||
    "showSceneWalls" in flags ||
    "showSceneFloors" in flags ||
    "renderSceneLights" in flags ||
    "skybox" in flags
  ){
    game.Levels3DPreview.reload();
    return
  }
  for(let key of Object.keys(flags)){
    if(key.includes("particle")){
      game.Levels3DPreview.weather.reload();
      break;
    }
  }
  if("renderBackground" in flags && !("img" in updates)) game.Levels3DPreview.createBoard();
  if("renderTable" in flags || "tableTex" in flags) game.Levels3DPreview.createTable();

})

javascript:(function(){var script=document.createElement('script');script.onload=function(){var stats=new Stats();document.body.appendChild(stats.dom);requestAnimationFrame(function loop(){stats.update();requestAnimationFrame(loop)});};script.src='//mrdoob.github.io/stats.js/build/stats.min.js';document.head.appendChild(script);})()
