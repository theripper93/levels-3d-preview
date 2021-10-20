import * as THREE from "./three.module.js";
import { OrbitControls } from "./OrbitControls.js";
import { ConvexGeometry } from "./ConvexGeometry.js";
import { GLTFLoader } from "./GLTFLoader.js";

const factor = 1000;

Hooks.on("canvasReady", () => {
  game.Levels3DPreview = new Levels3DPreview();
});

Hooks.on("updateToken", (token, updates) => {
  if (
    $("#levels3d").length > 0 &&
    ("x" in updates ||
      "y" in updates ||
      "elevation" in updates ||
      "rotation" in updates)
  ) {
    game.Levels3DPreview.tokenIndex[token.id]?.setPosition();
  }
});

Hooks.on("levelsUiChangeLevel", () => {
  if (!game.user.isGM || $("#levels3d").length == 0) return;
  game.Levels3DPreview.build3Dscene();
});

class Levels3DPreview {
  constructor() {
    this.camera;
    this.scene;
    this.renderer;
    this.factor = factor;
    this.tokenIndex = {};
    this.loader = new GLTFLoader();
    this.init3d();
  }

  init3d() {
    const center = this.canvasCenter;
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      1000
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
    this.controls.minDistance = 1;
    this.controls.target.set(center.x, center.y, center.z);
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
    let level =
      parseFloat(
        $(_levels.UI?.element)
          ?.find(".level-item.active")
          .find(".level-top")
          .val()
      ) ?? Infinity;
    if (isNaN(level)) level = Infinity;
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
    for (let token of canvas.tokens.placeables) {
      new Token3D(token).load().then((token3d) => {
        this.scene.add(token3d.mesh);
        this.tokenIndex[token.id] = token3d;
      });
      /*this.tokenIndex[token.id] = new Token3D(token)
      this.scene.add(this.tokenIndex[token.id].mesh);*/
    }
    if (canvas.scene.getFlag("levels-3d-preview", "enableAxis")) this.scene.add(new THREE.AxesHelper(3));

    const size =
      (Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
        this.factor) *
      2;
    const divisions =
      (Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
        canvas.scene.dimensions.size) *
      2;
    if (canvas.scene.getFlag("levels-3d-preview", "enableGrid")) {
      const gridHelper = new THREE.GridHelper(
        size,
        divisions,
        0x424242,
        0x424242
      );
      gridHelper.colorGrid = 0x424242;
      this.scene.add(gridHelper);
    }
    this.createLights(size);
    this.makeSkybox();
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
    const showSun = canvas.scene.getFlag("levels-3d-preview", "showSun") ?? false;
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
    _this.resizeCanvasToDisplaySize(_this);
    _this.controls.update();
    _this.renderer.render(_this.scene, _this.camera);
  }
}

class Token3D {
  constructor(tokenDocument) {
    this.token = tokenDocument;
    this.color = this.getColor();
    this.factor = factor;
    this.gtflPath = tokenDocument.document.getFlag(
      "levels-3d-preview",
      "model3d"
    );
    this.rotationAxis =
      tokenDocument.document.getFlag("levels-3d-preview", "rotationAxis") ??
      "z";
    this.mirrorX = tokenDocument.document.getFlag(
      "levels-3d-preview",
      "mirrorX"
    )
      ? Math.PI
      : 0;
    this.mirrorY = tokenDocument.document.getFlag(
      "levels-3d-preview",
      "mirrorY"
    )
      ? Math.PI
      : 0;
    this.mirrorZ = tokenDocument.document.getFlag(
      "levels-3d-preview",
      "mirrorZ"
    )
      ? Math.PI
      : 0;
    this.offsetX =
      tokenDocument.document.getFlag("levels-3d-preview", "offsetX") ?? 0;
    this.offsetY =
      tokenDocument.document.getFlag("levels-3d-preview", "offsetY") ?? 0;
    this.offsetZ =
      tokenDocument.document.getFlag("levels-3d-preview", "offsetZ") ?? 0;
    this.scale =
      tokenDocument.document.getFlag("levels-3d-preview", "scale") ?? 1;
  }

  async load() {
    return this.gtflPath ? await this.loadModel() : this.draw();
  }

  async loadModel() {
    const gltf = await game.Levels3DPreview.loader.loadAsync(this.gtflPath);
    const model = gltf.scene.children[0];
    const scale = this.scale * 0.1;
    model.scale.set(scale, scale, scale);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.mesh = model;
    this.setPosition();
    return this;
  }

  draw() {
    const token = this.token;
    const f = this.factor;
    const w = token.w / f;
    const h = token.h / f;
    const d =
      ((token.losHeight - token.data.elevation) *
        canvas.scene.dimensions.size) /
      canvas.dimensions.distance /
      f;
    //create a box
    const color = this.color;
    const geometry = new THREE.BoxGeometry(w, d, h);
    const material = new THREE.MeshMatcapMaterial({
      color: color,
      opacity: 0.5,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.tokenId = token.id;
    this.mesh = mesh;
    this.setPosition();
    return this;
  }

  setPosition() {
    const mesh = this.mesh;
    const token = this.token;
    if (!mesh) return;
    const f = this.factor;
    const x = token.center.x / f;
    const z = token.center.y / f;
    const y =
      ((token.data.elevation + (token.losHeight - token.data.elevation) / 2) *
        canvas.scene.dimensions.size) /
      canvas.dimensions.distance /
      f;
    mesh.position.set(
      x + this.offsetX / f,
      y + this.offsetY / f,
      z + this.offsetZ / f
    );
    const rotations = {
      x:
        this.rotationAxis === "x"
          ? Math.toRadians(token.data.rotation)
          : mesh.rotation._x,
      y:
        this.rotationAxis === "y"
          ? Math.toRadians(token.data.rotation)
          : mesh.rotation._y,
      z:
        this.rotationAxis === "z"
          ? Math.toRadians(token.data.rotation)
          : mesh.rotation._z,
    };
    mesh.rotation.set(
      rotations.x + this.mirrorX,
      rotations.y + this.mirrorY,
      rotations.z + this.mirrorZ
    );
  }

  getColor() {
    const hasPlayerOwner = this.token.actor?.hasPlayerOwner;
    if (!hasPlayerOwner) return 0xf2ff00;
    for (let [userId, permLevel] of Object.entries(
      this.token.actor.data.permission
    )) {
      if (permLevel < 3) continue;
      const user = game.users.get(userId);
      if (!user || user.isGM) continue;
      return user.data.color;
    }
    return 0xf2ff00;
  }
}
