import * as THREE from "./three.module.js";
import { OrbitControls } from "./OrbitControls.js";

Hooks.on("canvasReady", () => {
  game.Levels3DPreview = new Levels3DPreview();
});

$(document).on("keydown", (e) => {
  //when pressing the escape key, the game will be closed
  if (e.keyCode == 27) {
    $("#tjsrenderer").remove();
    $("#board").show();
  }
});

$(document).on("keydown", (e) => {
  //when pressing the space key, the game will be closed
  if (e.keyCode == 32) {
    game.Levels3DPreview.build3Dscene();
    document.body.appendChild(game.Levels3DPreview.renderer.domElement);
    $("#board").hide();
  }
});

class Levels3DPreview {
  constructor() {
    this.camera;
    this.scene;
    this.renderer;
    this.factor = 1000;
    this.init3d();
  }

  init3d() {
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
    this.camera.position.set(2, 2, 4).setLength(40);
    this.camera.zoom = 1;
    /*this.camera.position.x = canvas.scene.dimensions.width/this.factor/2;
    this.camera.position.y = canvas.scene.dimensions.height/this.factor/2;
    this.camera.position.z = 5;
    this.camera.lookAt(new THREE.Vector3(this.camera.position.x, this.camera.position.y, 0));*/
    this.camera.updateProjectionMatrix();

    this.scene = new THREE.Scene();
    let geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    this.material = new THREE.MeshNormalMaterial();

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setAnimationLoop(this.animation);
    //set dom element id
    this.renderer.domElement.id = "levels3d";
    this.controls = new OrbitControls( this.camera, this.renderer.domElement );
    /*this.controls.screenSpacePanning = false;*/
    //this.controls.target = new THREE.Vector3(canvas.scene.dimensions.width/this.factor, canvas.scene.dimensions.height/this.factor, 0);
    /*this.controls.rotateSpeed = 1;
    this.controls.update();*/
  }

  build3Dscene() {
    this.clear3Dscene();
    for(let tile of canvas.foreground.placeables){
        if(!tile.roomPoly) continue;
        const top = tile.document.getFlag("levels", "rangeTop") ?? undefined;
        const bottom = tile.document.getFlag("levels", "rangeTop") ?? undefined;
        //if(top !== undefined) this.scene.add(this.createFloor(tile.roomPoly.points, top));
        if(bottom !== undefined) this.scene.add(this.createFloor(tile.roomPoly.points, bottom));
    }
    for(let wall of canvas.walls.placeables){
        const top = wall.data.flags["wall-height"]?.wallHeightTop ?? undefined;
        const bottom = wall.data.flags["wall-height"]?.wallHeightBottom ?? undefined;
        if(top !== undefined) this.scene.add(this.createWall(wall.data.c, top));
        if(bottom !== undefined) this.scene.add(this.createWall(wall.data.c, bottom));
    }
    this.scene.add(new THREE.AxesHelper(3));
    //this.scene.add(this.mesh);
  }

  createFloor(points, z) {
    let shape = new THREE.Shape();
    const f = this.factor;
    z*=canvas.scene.dimensions.size/5/f
    console.log(z);
    shape.moveTo(points[0]/f, points[1]/f);
    for (let i = 2; i < points.length; i+=2) {
        shape.lineTo(points[i]/f, points[i+1]/f);
    }

    const geometry = new THREE.ShapeGeometry( shape );
    geometry.translate(0, 0, z);
    const material = new THREE.MeshMatcapMaterial( { color: 0x00ff00 } );
    return new THREE.Mesh( geometry, material ) ;
  }

  createWall(c,z){

  }

  clear3Dscene() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
  }

  animation(time) {
    const _this = game.Levels3DPreview;
    _this.mesh.rotation.x = time / 2000;
    _this.mesh.rotation.y = time / 1000;
    /*for(let child of _this.scene.children){
        child.rotation.x = time / 2000;
        child.rotation.y = time / 1000;
    }*/
    _this.controls.update();
    _this.renderer.render(_this.scene, _this.camera);
  }
}
