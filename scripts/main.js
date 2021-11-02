import * as THREE from "./lib/three.module.js";
import { OrbitControls } from "./lib/OrbitControls.js";
import { ConvexGeometry } from "./lib/ConvexGeometry.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import {Token3D} from "./entities/token3d.js";
import { Ruler3D } from "./entities/ruler3d.js";
import { Light3D } from "./entities/light3d.js";
import { Wall3D } from "./entities/wall3d.js";
import { Tile3D } from "./entities/tile3d.js";
import { FBXLoader } from './lib/FBXLoader.js';
import { GlobalIllumination } from "./helpers/globalIllumination.js";
import { InteractionManager } from "./helpers/interactionManager.js";
import { Helpers } from "./helpers/helpers.js";

export const factor = 1000;

Hooks.once("ready", () => {
  game.Levels3DPreview = new Levels3DPreview();
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
    this.isLevels = game.modules.get("levels")?.active;
    this.camera;
    this.scene;
    this.renderer;
    this.factor = factor;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode")
    this.tokens = {};
    this.lights = {
      sceneLights : {}
    };
    this.walls = {};
    this.doors = {};
    this.tiles = {};
    this.animationMixers = [];
    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();
    this.FBXLoader = new FBXLoader();
    this._active = false;
    this.tokenAnimationQueue = [];
    this._cameraSet = false;
    this.helpers = Helpers;
    $("body").append(`<div id="video-texture-container" style="position: absolute; top: 0; left: 0;display: none;"></div>`);
    this.videoTextureContinaer = $("#video-texture-container");
    this.init3d();

  }

  init3d() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
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
    this.renderer.antialias = true;
    this.resolutionMulti = game.settings.get("levels-3d-preview", "resolution")*window.devicePixelRatio;
    this.renderer.setPixelRatio(this.resolutionMulti);
    this.renderer.alpha = true;
    //set dom element id
    this.renderer.domElement.id = "levels3d";
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.ruler = new Ruler3D(this);
    this.interactionManager = new InteractionManager(this);
    this.interactionManager.activateListeners();
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
    this._active = true;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode")
    this.level = this.isLevels ? parseFloat($(_levels.UI?.element)?.find(".level-item.active").find(".level-top").val()) ?? Infinity : Infinity;
    if (isNaN(this.level)) this.level = Infinity;
    this.showSun = this.debugMode;
    const drawFloors = canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") ?? true;
    const drawWalls = canvas.scene.getFlag("levels-3d-preview", "showSceneWalls") ?? true;
    const drawLights = canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") ?? true;
    const renderBackground = canvas.scene.getFlag("levels-3d-preview", "renderBackground") ?? true;
    const renderTable = canvas.scene.getFlag("levels-3d-preview", "renderTable") ?? false;
    this.standUpFaceCamera = game.settings.get("levels-3d-preview", "standupFace") ?? true;
    drawFloors && this.isLevels && this.createFloors(this.level);
    drawWalls && this.createWalls(this.level);
    drawLights && this.createSceneLights();
    renderBackground && this.createBoard();
    renderTable && this.createTable();
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
      this.scene.add(gridHelper);
    }
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
    this.lights.globalIllumination = new GlobalIllumination(this);
    this.makeSkybox();
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

  async createBoard(){
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
    const material = new THREE.MeshPhysicalMaterial({
      map: texture,
    });
    material.toneMapped = false;
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.castShadow = true;
    plane.position.set(center.x, center.y-depth/2-0.00001, center.z);
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);

  }

  async createTable(){
    //make a plane and apply a texture
    const width = canvas.scene.dimensions.width / this.factor;
    const height = canvas.scene.dimensions.height / this.factor;
    const center = this.canvasCenter;
    const depth = Math.max(width, height) / 10;
    const texture = await this.helpers.loadTexture(canvas.scene.getFlag("levels-3d-preview", "tableTex"));
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({
      map: texture,
    });
    material.toneMapped = false;
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.position.set(center.x, center.y-(depth/2+0.011), center.z);
    plane.rotation.x = -Math.PI / 2;
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

  createFloors(level){
    for (let tile of canvas.foreground.placeables.concat(canvas.background.placeables)) {
      this.createTile(tile);

      if(!this.debugMode) continue;
      if (!tile.roomPoly) continue;
      const top = tile.document.getFlag("levels", "rangeTop") ?? undefined;
      const bottom =
        tile.document.getFlag("levels", "rangeBottom") ?? undefined;
      if (bottom > level) continue;
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
      this.createWall(wall);
    }
  }

  createWall(wall){
    this.walls[wall.id] = new Wall3D(wall, this)
    if(wall.data.door) this.doors[wall.id] = this.walls[wall.id];
  }

  makeSkybox() {
    const size = 80;
    const rootImage = canvas.scene.getFlag("levels-3d-preview", "skybox") ?? "";
    if (!rootImage) return;
    const imagesSuffix = ["_ft", "_bk", "_up", "_dn", "_rt", "_lf"];
    let currSuffix;
    for (let suffix of imagesSuffix) {
      if (rootImage.includes(suffix)) {
        currSuffix = suffix;
        break;
      }
    }
    let materialArray = [];
    for (let suffix of imagesSuffix) {
      materialArray.push(
        new THREE.MeshBasicMaterial({
          map: new THREE.TextureLoader().load(
            rootImage.replace(currSuffix, suffix)
          ),
          side: THREE.BackSide,
        })
      );
    }
    const skyboxGeometry = new THREE.BoxGeometry(size, size, size);
    const skybox = new THREE.Mesh(skyboxGeometry, materialArray);
    const center = this.canvasCenter;
    skybox.position.set(center.x, center.y, center.z);
    this.scene.add(skybox);
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
    const delta = _this.clock.getDelta();
    Object.values(_this.tokens).forEach((token) => {
      token.updateVisibility();
      if(token.mixer){
        token.mixer.update(delta);
      }
      if(token.standUp && _this.standUpFaceCamera){
        token.faceCamera();
      }
    });
    _this.centerTokenHUD();
    _this.resizeCanvasToDisplaySize(_this);
    _this.controls.update();
    _this.renderer.render(_this.scene, _this.camera);
  }

  resetCamera(topdown = false) {
    const center = this.canvasCenter;
    this.controls.reset();
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxDistance = 20;
    this.controls.minDistance = 0.1;
    this.controls.target.set(center.x, center.y, center.z);
    topdown ? this.camera.position.set(center.x, center.y + 4, center.z) : this.camera.position.set(center.x*1.5, center.y + 1, center.z*2);
    this.camera.lookAt(center);
    this.controls.update();
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
    else $("#board").hide();
  }

  close(){
    this._active = false;
    $("#levels3d").remove();
    Object.values(ui.windows)?.find(w => w.id === "miniCanvas")?.close(true);
    $("#board").show();
    this.clear3Dscene();
  }
}