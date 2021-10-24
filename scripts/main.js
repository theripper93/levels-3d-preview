import * as THREE from "./lib/three.module.js";
import { OrbitControls } from "./lib/OrbitControls.js";
import { ConvexGeometry } from "./lib/ConvexGeometry.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import {Token3D} from "./enitities/token3d.js";
import { FBXLoader } from './lib/FBXLoader.js'

export const factor = 1000;

Hooks.on("canvasReady", () => {
  game.Levels3DPreview = new Levels3DPreview();
});

Hooks.on("updateToken", (token, updates) => {
  if(!game.Levels3DPreview._active) return;
  if(updates?.flags && updates?.flags["levels-3d-preview"]){
    game.Levels3DPreview.tokenIndex[token.id]?.refresh();
  }
  if ("x" in updates || "y" in updates || "elevation" in updates || "rotation" in updates) {
    const token3d = game.Levels3DPreview.tokenIndex[token.id];
    if(!token3d) return;
    if(!updates.x && !updates.y && !updates.elevation && updates.rotation) return token3d.setPosition();
    const prevPos = {
      x: token3d.token.x,
      y: token3d.token.y
    }
    const x = updates.x ?? token.data.x;
    const y = updates.y ?? token.data.y;
    let dist = Math.sqrt(Math.pow(x - prevPos.x, 2) + Math.pow(y - prevPos.y, 2));
    dist = updates.elevation && dist === 0 ? 0.1 : dist;
    if(dist == 0 || dist < canvas.dimensions.size*2) return token3d.fallbackAnimation = true;
    token3d.fallbackAnimation = false;
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
        console.log("setting positon")
        await sleep(1000/60);
      };
      if(exitLerp)token3d.setPosition(false, {x,y,elevation})
      token3d.isAnimating = false;
    },200);

  }
});

Hooks.on("createToken", (tokenDocument) => {
  if(game.Levels3DPreview?._active && tokenDocument.object) game.Levels3DPreview.addToken(tokenDocument.object);
})

Hooks.on("deleteToken", (tokenDocument) => {
  if(game.Levels3DPreview?._active) game.Levels3DPreview.tokenIndex[tokenDocument.id]?.destroy();
})

Hooks.on("levelsUiChangeLevel", () => {
  if (!game.user.isGM || $("#levels3d").length == 0) return;
  game.Levels3DPreview.build3Dscene();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Levels3DPreview {
  constructor() {
    this.camera;
    this.scene;
    this.renderer;
    this.factor = factor;
    this.tokenIndex = {};
    this.animationMixers = [];
    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();
    this.FBXLoader = new FBXLoader();
    this.clicks = 0;
    this.lcTime = 0;
    this._active = false;
    this.tokenAnimationQueue = [];
    this.init3d();
  }

  init3d() {
    const center = this.canvasCenter;
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
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 2.3;
    this.renderer.shadowMap.enabled = true;

    //set dom element id
    this.renderer.domElement.id = "levels3d";
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.25;
    this.controls.maxDistance = 20;
    this.controls.minDistance = 0.1;
    this.controls.target.set(center.x, center.y, center.z);

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
            token3d._onClickRight(event);
          }
          this.clicks = 0;
        }, 150);
      }else{
        this.clicks = 0;
        event.which === 1 ? token3d._onClickLeft2(event) : token3d._onClickRight2(event);
      }

    })
    this.renderer.domElement.addEventListener("mouseup", (event) => {
      this.mousedown = false;
      if(event.which !== 1) return;
      if(this.draggable){
        this.draggable.userData.token3D.updatePositionFrom3D(event);
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
      //change y position
      if(delta > 0){
        token3d.elevation3d -= elevationTick*5;
      }else{
        token3d.elevation3d += elevationTick*5;
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

  dragObject(){
    if(!this.draggable) return;
    this.raycaster.setFromCamera(this.mousemove, this.camera);
    const intersects = this.raycaster.intersectObjects([this.dragplane], true);
    if (intersects.length > 0) {
      const token3d = this.draggable.userData.token3D;
      const target = this.draggable.userData.isHitbox ? this.draggable.parent : this.draggable;
      target.position.lerp(new THREE.Vector3(intersects[0].point.x, token3d.elevation3d, intersects[0].point.z), 0.10);
    }
  }

  build3Dscene() {
    this.clear3Dscene();
    this._active = true;
    let level = parseFloat($(_levels.UI?.element)?.find(".level-item.active").find(".level-top").val()) ?? Infinity;
    if (isNaN(level)) level = Infinity;
    this.showSun = canvas.scene.getFlag("levels-3d-preview", "showSun") ?? false;
    const drawFloors = canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") ?? true;
    const drawWalls = canvas.scene.getFlag("levels-3d-preview", "showSceneWalls") ?? true;
    const drawLights = canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") ?? true;
    const renderBackground = canvas.scene.getFlag("levels-3d-preview", "renderBackground") ?? true;
    const renderTable = canvas.scene.getFlag("levels-3d-preview", "renderTable") ?? false;
    drawFloors && this.createFloors(level);
    drawWalls && this.createWalls(level);
    drawLights && this.createSceneLights();
    renderBackground && this.createBoard();
    renderTable && this.createTable();
    for (let token of canvas.tokens.placeables) {
      this.addToken(token);
    }
    if (canvas.scene.getFlag("levels-3d-preview", "enableAxis")) this.scene.add(new THREE.AxesHelper(3));

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
    this.createLights(size);
    this.makeSkybox();
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
    const geometry = new THREE.BoxGeometry(width, height, 0.01);
    const material = new THREE.MeshLambertMaterial({
      map: new THREE.TextureLoader().load(canvas.scene.data.img),
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.castShadow = true;
    plane.position.set(center.x, center.y-0.01, center.z);
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);

  }

  createTable(){
    //make a plane and apply a texture
    const width = canvas.scene.dimensions.width / this.factor;
    const height = canvas.scene.dimensions.height / this.factor;
    const center = this.canvasCenter;
    const geometry = new THREE.BoxGeometry(width, height, 1);
    const material = new THREE.MeshLambertMaterial({
      map: new THREE.TextureLoader().load(canvas.scene.getFlag("levels-3d-preview", "tableTex")),
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.position.set(center.x, center.y-0.511, center.z);
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);

  }

  createSceneLights(){
    for(let light of canvas.lighting.placeables){
      const top = light.document.getFlag("levels", "rangeTop");
      const bottom = light.document.getFlag("levels", "rangeBottom");
      if(top === null || bottom === null) continue;
      const z = (top+bottom)*canvas.scene.dimensions.size/canvas.scene.dimensions.distance/2;
      const color = light.data.tintColor || "#ffffff";
      const radius = Math.max(light.data.dim, light.data.bright)*canvas.scene.dimensions.size/canvas.scene.dimensions.distance/this.factor;
      const alpha = light.data.tintAlpha*100;
      const pointLight = new THREE.PointLight(color, alpha, radius, 2);
      pointLight.castShadow = true;
      pointLight.shadow.bias = -0.0001;
      pointLight.shadow.mapSize.width = 1024*4;
      pointLight.shadow.mapSize.height = 1024*4;
      const position = {
        x: light.data.x/this.factor,
        y: z/this.factor,
        z: light.data.y/this.factor,
      }
      pointLight.position.set(position.x, position.y, position.z);
      this.scene.add(pointLight);
      if(!this.showSun) continue;
      //make sphere
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 32, 32),
        new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.5,
        })
      );
      sphere.position.set(position.x, position.y, position.z);
      this.scene.add(sphere);
    }
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

  createLights(size) {
    this.lights = {}
    const light = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    //light.position.set(10, 0, 0);
    this.scene.add(light);
    this.lights.hemiLight = light;
    const spotLight = new THREE.SpotLight(0xffa95c, 4);
    spotLight.castShadow = true;
    spotLight.shadow.bias = -0.0001;
    spotLight.shadow.mapSize.width = 1024*4;
    spotLight.shadow.mapSize.height = 1024*4;
    //spotLight.position.set(10, size / 4, size / 4);
    this.scene.add(spotLight);
    this.lights.spotLight = spotLight;
    const sunlightSphere = new THREE.SphereGeometry(size / 10, 16, 16);
    const sunlight = new THREE.Mesh(sunlightSphere, new THREE.MeshBasicMaterial({ color: 0xffa95c }));
    //sunlight.position.set(10, size / 4, size / 4);
    this.scene.add(sunlight);
    this.lights.sunlight = sunlight;
    const color = canvas.scene.getFlag("levels-3d-preview", "sceneTint") ?? 0xffa95c;
    const distance = canvas.scene.getFlag("levels-3d-preview", "sunDistance") ?? 10;
    const angle = Math.toRadians(canvas.scene.getFlag("levels-3d-preview", "sunPosition") ?? 30);
    const showSun = this.showSun
    this.sunlight = {color, distance, angle, showSun};
  }

  set sunlight(data){
    const center = this.canvasCenter;
    const color = data.color;
    const distance = data.distance;
    const angle = data.angle;
    const showSun = data.showSun;

    //generate position form angle
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const z = 0;
    this.lights.sunlight.position.set(x+center.x, y, z+center.z);
    this.lights.hemiLight.position.set(x+center.x, y, z+center.z);
    this.lights.spotLight.position.set(x+center.x, y, z+center.z);
    //set colors
    this.lights.spotLight.color.set(color);
    this.lights.sunlight.material.color.set(color);
    this.lights.sunlight.visible = showSun;

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
      opacity: 0.5,
      transparent: true,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  }

  createWall(c, top, bottom, color) {
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
        opacity: 0.5,
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

  animation(time) {
    const _this = game.Levels3DPreview;
    _this.dragObject();
    const delta = _this.clock.getDelta();
    Object.values(_this.tokenIndex).forEach((token) => {
      if(token.mixer){
        token.mixer.update(delta);
      }
    });
    _this.resizeCanvasToDisplaySize(_this);
    _this.controls.update();
    _this.renderer.render(_this.scene, _this.camera);
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
    new miniCanvas().render(true);
  }

  close(){
    this._active = false;
    $("#levels3d").remove();
    Object.values(ui.windows)?.find(w => w.id === "miniCanvas")?.close(true);
    $("#board").show();
    this.clear3Dscene();
  }
}