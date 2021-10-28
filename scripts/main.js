import * as THREE from "./lib/three.module.js";
import { OrbitControls } from "./lib/OrbitControls.js";
import { ConvexGeometry } from "./lib/ConvexGeometry.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import {Token3D} from "./entities/token3d.js";
import { Ruler3D } from "./entities/ruler3d.js";
import { Light3D } from "./entities/light3d.js";
import { FBXLoader } from './lib/FBXLoader.js';
import { GlobalIllumination } from "./globalillumination.js";

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
    this.tokenIndex = {};
    this.lights = {
      sceneLights : {}
    };
    this.animationMixers = [];
    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();
    this.FBXLoader = new FBXLoader();
    this.clicks = 0;
    this.lcTime = 0;
    this._active = false;
    this.tokenAnimationQueue = [];
    this._cameraSet = false;
    this.init3d();
    this.ruler = new Ruler3D(this);
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
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.alpha = true;
    //set dom element id
    this.renderer.domElement.id = "levels3d";
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.activateListeners();
  }

  get canvasCenter() {
    return {
      x: canvas.dimensions.width / 2 / this.factor,
      y: 0,
      z: canvas.dimensions.height / 2 / this.factor,
    };
  }

  activateListeners() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.mousemove = new THREE.Vector2();
    this.draggable = undefined;
    const elevationTick = (canvas.dimensions.size/canvas.dimensions.distance)/this.factor;

    this.renderer.domElement.addEventListener("mousedown", (event) => {
      this.mousedown = true;
      this.mousePosition = { x: event.clientX, y: event.clientY };
      if(event.which !== 1 && event.which !== 3) return;
      if(event.ctrlKey || event.shiftKey) return;
      const intersect = this.findMouseIntersect(event);
      if(!intersect) return;
      this.controls.enableRotate = false;
      this.controls.enableZoom = false;
      this.clicks++;
      const token3d = intersect.userData.token3D
      if (this.clicks === 1) {
        setTimeout(() => {
          if(this.clicks !== 1) return this.clicks = 0;
          if(event.which === 1){
            token3d._onClickLeft(event);
            if(event.altKey || !this.mousedown){
              this.draggable = undefined;
              this.controls.enableRotate = true; 
              this.controls.enableZoom = true;
              return this.clicks = 0;
              }
            token3d.isAnimating = false;
            token3d.setPosition()
            this.draggable = intersect;
            this.controls.enableRotate = false;
            this.controls.enableZoom = false;
          }else{
            if(this.draggable) this.cancelDrag();
            else token3d._onClickRight(event);
            this.controls.enableRotate = true;
            this.controls.enableZoom = true;
          }
          this.clicks = 0;
        }, 150);
      }else{
        this.clicks = 0;
        if(this.draggable) this.cancelDrag();
        else event.which === 1 ? token3d._onClickLeft2(event) : token3d._onClickRight2(event);
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
      }

    })
    this.renderer.domElement.addEventListener("mouseup", (event) => {
      this.mousedown = false;
      if(event.which !== 1) return;
      if(this.draggable){
        if(!this.draggable.userData.token3D.updatePositionFrom3D(event)) this.cancelDrag();
      }
      this.draggable = undefined;
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
    })
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.mousemove.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mousemove.y = -(event.clientY / window.innerHeight) * 2 + 1;
    })
    //add wheel event
    this.renderer.domElement.addEventListener("wheel", (event) => {
      const delta = event.deltaY;
      if(!this.draggable) return;
      const token3d = this.draggable.userData.token3D;
      let elevationDiff = 5;
      if(event.shiftKey) elevationDiff = 1;
      if(event.ctrlKey) elevationDiff = 0.1;
      //change y position
      if(delta > 0){
        token3d.elevation3d -= elevationTick*elevationDiff;
      }else{
        token3d.elevation3d += elevationTick*elevationDiff;
      }
      if(game.settings.get("levels-3d-preview", "preventNegative") && token3d.elevation3d < 0){
        token3d.elevation3d = 0;
      }
    })
  }

  findMouseIntersect(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const groupchilderen = [];
    this.scene.children.forEach((child) => {if(child.children.length) child.children.forEach((c) => groupchilderen.push(c))});
    const intersects = this.raycaster.intersectObjects(groupchilderen.concat(this.scene.children), true);
    if (intersects.length > 0) {
      for(let intersect of intersects){
        if(intersect.object.userData.draggable){
          return intersect.object;
        }
      }
    }
    return false;
  }

  set draggable(object){
    this._draggable = object;
    if(this.ruler && (canvas.scene.getFlag("levels-3d-preview", "enableRuler") ?? true)) this.ruler.object = object;
  }

  get draggable(){
    return this._draggable;
  }

  dragObject(){
    if(!this.draggable) return;
    this.raycaster.setFromCamera(this.mousemove, this.camera);
    const intersects = this.raycaster.intersectObjects([this.dragplane], true);
    if (intersects.length > 0) {
      const token3d = this.draggable.userData.token3D;
      const target = this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable;
      target.position.lerp(new THREE.Vector3(intersects[0].point.x, token3d.elevation3d, intersects[0].point.z), 0.10);
      this.ruler.update();
    }
  }

  cancelDrag(){
    if(!this.draggable) return;
    const token3d = this.draggable.userData.token3D;
    token3d.dragCanceled = true;
    this.draggable = undefined;
    token3d.token.document.update({x: token3d.token.data.x+0.0001})
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
  }

  build3Dscene() {
    this.clear3Dscene();
    this._active = true;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode")
    let level = this.isLevels ? parseFloat($(_levels.UI?.element)?.find(".level-item.active").find(".level-top").val()) ?? Infinity : Infinity;
    if (isNaN(level)) level = Infinity;
    this.showSun = this.debugMode;
    const drawFloors = canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") ?? true;
    const drawWalls = canvas.scene.getFlag("levels-3d-preview", "showSceneWalls") ?? true;
    const drawLights = canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") ?? true;
    const renderBackground = canvas.scene.getFlag("levels-3d-preview", "renderBackground") ?? true;
    const renderTable = canvas.scene.getFlag("levels-3d-preview", "renderTable") ?? false;
    this.standUpFaceCamera = game.settings.get("levels-3d-preview", "standupFace") ?? true;
    drawFloors && this.isLevels && this.createFloors(level);
    drawWalls && this.isLevels && this.createWalls(level);
    drawLights && this.isLevels && this.createSceneLights();
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
      gridHelper.position.set(size/2, 0, size/2);
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = canvas.scene.data.gridAlpha;
      this.scene.add(gridHelper);
    }
    //add raycasting plane

    this.dragplane = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false })
    );
    this.dragplane.position.set(size/2, 0, size/2);
    this.dragplane.userData.isFloor = true;
    this.dragplane.rotation.x = -Math.PI / 2;
    this.scene.add(this.dragplane);
    this.lights.globalIllumination = new GlobalIllumination(this);
    //this.createLights(size);
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
      this.tokenIndex[token.id] = token3d;
    });
  }

  createBoard(){
    //make a plane and apply a texture
    const width = canvas.scene.dimensions.sceneWidth / this.factor;
    const height = canvas.scene.dimensions.sceneHeight / this.factor;
    const center = this.canvasCenter;
    const depth = 0.02
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({
      map: new THREE.TextureLoader().load(canvas.scene.data.img,(t) => {
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        t.minFilter = THREE.NearestMipMapLinearFilter;
      }),
    });
    material.toneMapped = false;
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.castShadow = true;
    plane.position.set(center.x, center.y-depth/2-0.00001, center.z);
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);

  }

  createTable(){
    //make a plane and apply a texture
    const width = canvas.scene.dimensions.width / this.factor;
    const height = canvas.scene.dimensions.height / this.factor;
    const center = this.canvasCenter;
    const depth = Math.max(width, height) / 10;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({
      map: new THREE.TextureLoader().load(canvas.scene.getFlag("levels-3d-preview", "tableTex"),),
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
    for (let tile of canvas.foreground.placeables) {
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

  createWalls(level) {
    for (let wall of canvas.walls.placeables) {
      const top = wall.data.flags.wallHeight?.wallHeightTop ?? undefined;
      const bottom = wall.data.flags.wallHeight?.wallHeightBottom ?? undefined;
      if (bottom > level) continue;
      if (top !== undefined && bottom !== undefined)
        this.scene.add(
          this.createWall(
            wall.data.c,
            top,
            bottom,
            wall.children[1]._fillStyle.color
          )
        );
    }
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

  createWall(c, top, bottom, color) {
    const alpha = canvas.scene.getFlag("levels-3d-preview", "wallFloorAlpha") ?? 0.5;
    try {
      const f = this.factor;
      top *= canvas.scene.dimensions.size / canvas.dimensions.distance / f;
      bottom *= canvas.scene.dimensions.size / canvas.dimensions.distance / f;
      // geometry
      let points = [];
      points.push(new THREE.Vector3(c[0] / f, c[1] / f, -bottom));
      points.push(new THREE.Vector3(c[2] / f, c[3] / f, -bottom));
      points.push(new THREE.Vector3(c[2] / f, c[3] / f, -top));
      points.push(new THREE.Vector3(c[0] / f, c[1] / f, -top));
      points.push(new THREE.Vector3(c[0] / f, c[1] / f, -bottom)); // close the loop
      var geometry = new ConvexGeometry(points);
      // material
      geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshMatcapMaterial({
        color: color,
        opacity: alpha,
        transparent: true,
      });

      // line
      return new THREE.Mesh(geometry, material);
    } catch (e) {
      console.warn("Convex Geometry failed for wall: ", c, top, bottom, color);
      return new THREE.Mesh();
    }
  }

  clear3Dscene() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
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
    const token3D = this.tokenIndex[hud.object.id];
    if(!token3D) return;
    const center = token3D.mesh.position.clone();
    center.y += token3D.hitbox.geometry.boundingBox.max.y;
    Ruler3D.centerElement(hud.element, center);
  }

  animation(time) {
    const _this = game.Levels3DPreview;
    if(!_this._active) return;
    _this.dragObject();
    const delta = _this.clock.getDelta();
    Object.values(_this.tokenIndex).forEach((token) => {
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
    this.controls.dampingFactor = 0.25;
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