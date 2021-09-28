import * as THREE from "./three.module.js";
import { OrbitControls } from "./OrbitControls.js";
import { ConvexGeometry } from "./ConvexGeometry.js";

Hooks.on("canvasReady", () => {
  game.Levels3DPreview = new Levels3DPreview();
});

Hooks.on("updateToken", (token, updates) => {
  if (!game.user.isGM) return;
  if (
    $("#levels3d").length > 0 &&
    ("x" in updates || "y" in updates || "elevation" in updates)
  ) {
    game.Levels3DPreview.updateToken(token.object);
  }
});

Hooks.on("levelsUiChangeLevel", ()=>{
  if (!game.user.isGM || $("#levels3d").length == 0) return;
  game.Levels3DPreview.build3Dscene();
})

class Levels3DPreview {
  constructor() {
    this.camera;
    this.scene;
    this.renderer;
    this.factor = 1000;
    this.tokenIndex = {};
    this.init3d();
  }

  init3d() {
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
    //set dom element id
    this.renderer.domElement.id = "levels3d";
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  }

  build3Dscene() {
    this.clear3Dscene();
    const level = parseFloat($(_levels.UI.element).find(".level-item.active").find(".level-top").val()) ?? -Infinity;
    for (let tile of canvas.foreground.placeables) {
      if (!tile.roomPoly) continue;
      const top = tile.document.getFlag("levels", "rangeTop") ?? undefined;
      const bottom = tile.document.getFlag("levels", "rangeTop") ?? undefined;
      if(bottom > level) continue;
      //if(top !== undefined) this.scene.add(this.createFloor(tile.roomPoly.points, top));
      if (bottom !== undefined)
        this.scene.add(this.createFloor(tile.roomPoly.points, bottom));
    }
    for (let wall of canvas.walls.placeables) {
      const top = wall.data.flags.wallHeight?.wallHeightTop ?? undefined;
      const bottom = wall.data.flags.wallHeight?.wallHeightBottom ?? undefined;
      if(bottom > level) continue;
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
      this.scene.add(this.createToken(token));
    }
    this.scene.add(new THREE.AxesHelper(3));
    const size =
      (Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
        this.factor) *
      2;
    const divisions =
      (Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
        canvas.scene.dimensions.size) *
      2;

    const gridHelper = new THREE.GridHelper(
      size,
      divisions,
      0x424242,
      0x424242
    );
    gridHelper.colorGrid = 0x424242;
    this.scene.add(gridHelper);
  }

  createFloor(points, z) {
    let shape = new THREE.Shape();
    const f = this.factor;
    z *= (-1 * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
    console.log(z);
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
  }

  createToken(token) {
    const f = this.factor;
    const w = token.w / f;
    const h = token.h / f;
    const d =
      ((token.losHeight - token.data.elevation) *
        canvas.scene.dimensions.size) /
      canvas.dimensions.distance /
      f;
    const x = token.center.x / f;
    const z = token.center.y / f;
    const y =
      ((token.data.elevation + (token.losHeight - token.data.elevation) / 2) *
        canvas.scene.dimensions.size) /
      canvas.dimensions.distance /
      f;
    //create a box
    const color = token.actor?.hasPlayerOwner ? 0xff00f7 : 0xf2ff00;
    const geometry = new THREE.BoxGeometry(w, d, h);
    const material = new THREE.MeshMatcapMaterial({
      color: color,
      opacity: 0.5,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.tokenId = token.id;
    this.tokenIndex[token.id] = mesh;
    return mesh;
  }

  updateToken(token) {
    const mesh = this.tokenIndex[token.id];
    if (!mesh) return;
    const f = this.factor;
    const x = token.center.x / f;
    const z = token.center.y / f;
    const y =
      ((token.data.elevation + (token.losHeight - token.data.elevation) / 2) *
        canvas.scene.dimensions.size) /
      canvas.dimensions.distance /
      f;
    mesh.position.set(x, y, z);
  }

  clear3Dscene() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
  }

  animation(time) {
    const _this = game.Levels3DPreview;
    _this.controls.update();
    _this.renderer.render(_this.scene, _this.camera);
  }
}
