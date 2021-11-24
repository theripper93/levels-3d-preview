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
import { EXRLoader } from "https://threejs.org/examples/jsm/loaders/EXRLoader.js";
import { compressSync } from "./lib/fflate.module.js";
export const factor = 1000;

let drcLoader


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
    this.isLevels = game.modules.get("levels")?.active;
    this.camera;
    this._animateCameraTarget = {}
    this.scene;
    this.renderer;
    this.factor = factor;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode")
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
    this.animationMixers = [];
    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();
    this.dracoDecode = new drcLoader();
    this.dracoDecode.setDecoderConfig({ type: 'js' });
    this.dracoDecode.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    this.loader.setDRACOLoader(this.dracoDecode);
    this.FBXLoader = new FBXLoader();
    this._active = false;
    this.tokenAnimationQueue = [];
    this._cameraSet = false;
    this.helpers = new Helpers();
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
    this.renderer.antialias = false;
    this.resolutionMulti = game.settings.get("levels-3d-preview", "resolution")*window.devicePixelRatio;
    this.renderer.setPixelRatio(this.resolutionMulti);
    this.renderer.alpha = true;
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

  initEnvMap(){
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    new EXRLoader()
        .setDataType(THREE.UnsignedByteType)
        .load(
            "modules/levels-3d-preview/assets/shudu_lake_4k.exr",
            function (texture) {
                let exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
                let exrBackground = exrCubeRenderTarget.texture;
                let newEnvMap = exrCubeRenderTarget ? exrCubeRenderTarget.texture : null;
                game.Levels3DPreview.envMap = newEnvMap;
            }
        );
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
    //this.scene.environment = this.envMap;
    this._active = true;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode")
    this.level = this.isLevels ? parseFloat($(_levels.UI?.element)?.find(".level-item.active").find(".level-bottom").val()) ?? Infinity : Infinity;
    if (isNaN(this.level)) this.level = Infinity;
    this.showSun = this.debugMode;
    const drawFloors = canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") ?? true;
    const drawWalls = canvas.scene.getFlag("levels-3d-preview", "showSceneWalls") ?? true;
    const drawLights = canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") ?? true;
    const renderBackground = canvas.scene.getFlag("levels-3d-preview", "renderBackground") ?? true;
    const renderTable = canvas.scene.getFlag("levels-3d-preview", "renderTable") ?? false;
    this.standUpFaceCamera = game.settings.get("levels-3d-preview", "standupFace") ?? true;
    const enableFog = canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false;
    const fogColor = canvas.scene.getFlag("levels-3d-preview", "fogColor") ?? "#000000";
    const fogDistance = (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) / this.factor;
    drawFloors && this.isLevels && this.createFloors(this.level);
    drawWalls && this.createWalls(this.level);
    drawLights && this.createSceneLights();
    this.createTemplates();
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
      if(enableFog) this.scene.fog = new THREE.Fog(fogColor, 1, fogDistance);
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
    const material = new THREE.MeshLambertMaterial({
      map: texture,
      roughness: 1,
    });
    material.toneMapped = false;
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.castShadow = true;
    plane.position.set(center.x, center.y-depth/2-0.00001, center.z);
    plane.rotation.x = -Math.PI / 2;
    this.board = plane;
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
    const sceneSize = Math.max(canvas.scene.dimensions.width, canvas.scene.dimensions.height)/100;
    const size = sceneSize < 80 ? 80 : sceneSize;
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
    _this.controls.update();
    _this.renderer.render(_this.scene, _this.camera);
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
      const size = Math.max(token3D.w, token3D.h, token3D.d)*8;
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


//Draco Loader

( function () {

	const _taskCache = new WeakMap();

	class DRACOLoader extends THREE.Loader {

		constructor( manager ) {

			super( manager );
			this.decoderPath = '';
			this.decoderConfig = {};
			this.decoderBinary = null;
			this.decoderPending = null;
			this.workerLimit = 4;
			this.workerPool = [];
			this.workerNextTaskID = 1;
			this.workerSourceURL = '';
			this.defaultAttributeIDs = {
				position: 'POSITION',
				normal: 'NORMAL',
				color: 'COLOR',
				uv: 'TEX_COORD'
			};
			this.defaultAttributeTypes = {
				position: 'Float32Array',
				normal: 'Float32Array',
				color: 'Float32Array',
				uv: 'Float32Array'
			};

		}

		setDecoderPath( path ) {

			this.decoderPath = path;
			return this;

		}

		setDecoderConfig( config ) {

			this.decoderConfig = config;
			return this;

		}

		setWorkerLimit( workerLimit ) {

			this.workerLimit = workerLimit;
			return this;

		}

		load( url, onLoad, onProgress, onError ) {

			const loader = new THREE.FileLoader( this.manager );
			loader.setPath( this.path );
			loader.setResponseType( 'arraybuffer' );
			loader.setRequestHeader( this.requestHeader );
			loader.setWithCredentials( this.withCredentials );
			loader.load( url, buffer => {

				const taskConfig = {
					attributeIDs: this.defaultAttributeIDs,
					attributeTypes: this.defaultAttributeTypes,
					useUniqueIDs: false
				};
				this.decodeGeometry( buffer, taskConfig ).then( onLoad ).catch( onError );

			}, onProgress, onError );

		}
		/** @deprecated Kept for backward-compatibility with previous DRACOLoader versions. */


		decodeDracoFile( buffer, callback, attributeIDs, attributeTypes ) {

			const taskConfig = {
				attributeIDs: attributeIDs || this.defaultAttributeIDs,
				attributeTypes: attributeTypes || this.defaultAttributeTypes,
				useUniqueIDs: !! attributeIDs
			};
			this.decodeGeometry( buffer, taskConfig ).then( callback );

		}

		decodeGeometry( buffer, taskConfig ) {

			// TODO: For backward-compatibility, support 'attributeTypes' objects containing
			// references (rather than names) to typed array constructors. These must be
			// serialized before sending them to the worker.
			for ( const attribute in taskConfig.attributeTypes ) {

				const type = taskConfig.attributeTypes[ attribute ];

				if ( type.BYTES_PER_ELEMENT !== undefined ) {

					taskConfig.attributeTypes[ attribute ] = type.name;

				}

			} //


			const taskKey = JSON.stringify( taskConfig ); // Check for an existing task using this buffer. A transferred buffer cannot be transferred
			// again from this thread.

			if ( _taskCache.has( buffer ) ) {

				const cachedTask = _taskCache.get( buffer );

				if ( cachedTask.key === taskKey ) {

					return cachedTask.promise;

				} else if ( buffer.byteLength === 0 ) {

					// Technically, it would be possible to wait for the previous task to complete,
					// transfer the buffer back, and decode again with the second configuration. That
					// is complex, and I don't know of any reason to decode a Draco buffer twice in
					// different ways, so this is left unimplemented.
					throw new Error( 'THREE.DRACOLoader: Unable to re-decode a buffer with different ' + 'settings. Buffer has already been transferred.' );

				}

			} //


			let worker;
			const taskID = this.workerNextTaskID ++;
			const taskCost = buffer.byteLength; // Obtain a worker and assign a task, and construct a geometry instance
			// when the task completes.

			const geometryPending = this._getWorker( taskID, taskCost ).then( _worker => {

				worker = _worker;
				return new Promise( ( resolve, reject ) => {

					worker._callbacks[ taskID ] = {
						resolve,
						reject
					};
					worker.postMessage( {
						type: 'decode',
						id: taskID,
						taskConfig,
						buffer
					}, [ buffer ] ); // this.debug();

				} );

			} ).then( message => this._createGeometry( message.geometry ) ); // Remove task from the task list.
			// Note: replaced '.finally()' with '.catch().then()' block - iOS 11 support (#19416)


			geometryPending.catch( () => true ).then( () => {

				if ( worker && taskID ) {

					this._releaseTask( worker, taskID ); // this.debug();

				}

			} ); // Cache the task result.

			_taskCache.set( buffer, {
				key: taskKey,
				promise: geometryPending
			} );

			return geometryPending;

		}

		_createGeometry( geometryData ) {

			const geometry = new THREE.BufferGeometry();

			if ( geometryData.index ) {

				geometry.setIndex( new THREE.BufferAttribute( geometryData.index.array, 1 ) );

			}

			for ( let i = 0; i < geometryData.attributes.length; i ++ ) {

				const attribute = geometryData.attributes[ i ];
				const name = attribute.name;
				const array = attribute.array;
				const itemSize = attribute.itemSize;
				geometry.setAttribute( name, new THREE.BufferAttribute( array, itemSize ) );

			}

			return geometry;

		}

		_loadLibrary( url, responseType ) {

			const loader = new THREE.FileLoader( this.manager );
			loader.setPath( this.decoderPath );
			loader.setResponseType( responseType );
			loader.setWithCredentials( this.withCredentials );
			return new Promise( ( resolve, reject ) => {

				loader.load( url, resolve, undefined, reject );

			} );

		}

		preload() {

			this._initDecoder();

			return this;

		}

		_initDecoder() {

			if ( this.decoderPending ) return this.decoderPending;
			const useJS = typeof WebAssembly !== 'object' || this.decoderConfig.type === 'js';
			const librariesPending = [];

			if ( useJS ) {

				librariesPending.push( this._loadLibrary( 'draco_decoder.js', 'text' ) );

			} else {

				librariesPending.push( this._loadLibrary( 'draco_wasm_wrapper.js', 'text' ) );
				librariesPending.push( this._loadLibrary( 'draco_decoder.wasm', 'arraybuffer' ) );

			}

			this.decoderPending = Promise.all( librariesPending ).then( libraries => {

				const jsContent = libraries[ 0 ];

				if ( ! useJS ) {

					this.decoderConfig.wasmBinary = libraries[ 1 ];

				}

				const fn = DRACOWorker.toString();
				const body = [ '/* draco decoder */', jsContent, '', '/* worker */', fn.substring( fn.indexOf( '{' ) + 1, fn.lastIndexOf( '}' ) ) ].join( '\n' );
				this.workerSourceURL = URL.createObjectURL( new Blob( [ body ] ) );

			} );
			return this.decoderPending;

		}

		_getWorker( taskID, taskCost ) {

			return this._initDecoder().then( () => {

				if ( this.workerPool.length < this.workerLimit ) {

					const worker = new Worker( this.workerSourceURL );
					worker._callbacks = {};
					worker._taskCosts = {};
					worker._taskLoad = 0;
					worker.postMessage( {
						type: 'init',
						decoderConfig: this.decoderConfig
					} );

					worker.onmessage = function ( e ) {

						const message = e.data;

						switch ( message.type ) {

							case 'decode':
								worker._callbacks[ message.id ].resolve( message );

								break;

							case 'error':
								worker._callbacks[ message.id ].reject( message );

								break;

							default:
								console.error( 'THREE.DRACOLoader: Unexpected message, "' + message.type + '"' );

						}

					};

					this.workerPool.push( worker );

				} else {

					this.workerPool.sort( function ( a, b ) {

						return a._taskLoad > b._taskLoad ? - 1 : 1;

					} );

				}

				const worker = this.workerPool[ this.workerPool.length - 1 ];
				worker._taskCosts[ taskID ] = taskCost;
				worker._taskLoad += taskCost;
				return worker;

			} );

		}

		_releaseTask( worker, taskID ) {

			worker._taskLoad -= worker._taskCosts[ taskID ];
			delete worker._callbacks[ taskID ];
			delete worker._taskCosts[ taskID ];

		}

		debug() {

			console.log( 'Task load: ', this.workerPool.map( worker => worker._taskLoad ) );

		}

		dispose() {

			for ( let i = 0; i < this.workerPool.length; ++ i ) {

				this.workerPool[ i ].terminate();

			}

			this.workerPool.length = 0;
			return this;

		}

	}
	/* WEB WORKER */


	function DRACOWorker() {

		let decoderConfig;
		let decoderPending;

		onmessage = function ( e ) {

			const message = e.data;

			switch ( message.type ) {

				case 'init':
					decoderConfig = message.decoderConfig;
					decoderPending = new Promise( function ( resolve
						/*, reject*/
					) {

						decoderConfig.onModuleLoaded = function ( draco ) {

							// Module is Promise-like. Wrap before resolving to avoid loop.
							resolve( {
								draco: draco
							} );

						};

						DracoDecoderModule( decoderConfig ); // eslint-disable-line no-undef

					} );
					break;

				case 'decode':
					const buffer = message.buffer;
					const taskConfig = message.taskConfig;
					decoderPending.then( module => {

						const draco = module.draco;
						const decoder = new draco.Decoder();
						const decoderBuffer = new draco.DecoderBuffer();
						decoderBuffer.Init( new Int8Array( buffer ), buffer.byteLength );

						try {

							const geometry = decodeGeometry( draco, decoder, decoderBuffer, taskConfig );
							const buffers = geometry.attributes.map( attr => attr.array.buffer );
							if ( geometry.index ) buffers.push( geometry.index.array.buffer );
							self.postMessage( {
								type: 'decode',
								id: message.id,
								geometry
							}, buffers );

						} catch ( error ) {

							console.error( error );
							self.postMessage( {
								type: 'error',
								id: message.id,
								error: error.message
							} );

						} finally {

							draco.destroy( decoderBuffer );
							draco.destroy( decoder );

						}

					} );
					break;

			}

		};

		function decodeGeometry( draco, decoder, decoderBuffer, taskConfig ) {

			const attributeIDs = taskConfig.attributeIDs;
			const attributeTypes = taskConfig.attributeTypes;
			let dracoGeometry;
			let decodingStatus;
			const geometryType = decoder.GetEncodedGeometryType( decoderBuffer );

			if ( geometryType === draco.TRIANGULAR_MESH ) {

				dracoGeometry = new draco.Mesh();
				decodingStatus = decoder.DecodeBufferToMesh( decoderBuffer, dracoGeometry );

			} else if ( geometryType === draco.POINT_CLOUD ) {

				dracoGeometry = new draco.PointCloud();
				decodingStatus = decoder.DecodeBufferToPointCloud( decoderBuffer, dracoGeometry );

			} else {

				throw new Error( 'THREE.DRACOLoader: Unexpected geometry type.' );

			}

			if ( ! decodingStatus.ok() || dracoGeometry.ptr === 0 ) {

				throw new Error( 'THREE.DRACOLoader: Decoding failed: ' + decodingStatus.error_msg() );

			}

			const geometry = {
				index: null,
				attributes: []
			}; // Gather all vertex attributes.

			for ( const attributeName in attributeIDs ) {

				const attributeType = self[ attributeTypes[ attributeName ] ];
				let attribute;
				let attributeID; // A Draco file may be created with default vertex attributes, whose attribute IDs
				// are mapped 1:1 from their semantic name (POSITION, NORMAL, ...). Alternatively,
				// a Draco file may contain a custom set of attributes, identified by known unique
				// IDs. glTF files always do the latter, and `.drc` files typically do the former.

				if ( taskConfig.useUniqueIDs ) {

					attributeID = attributeIDs[ attributeName ];
					attribute = decoder.GetAttributeByUniqueId( dracoGeometry, attributeID );

				} else {

					attributeID = decoder.GetAttributeId( dracoGeometry, draco[ attributeIDs[ attributeName ] ] );
					if ( attributeID === - 1 ) continue;
					attribute = decoder.GetAttribute( dracoGeometry, attributeID );

				}

				geometry.attributes.push( decodeAttribute( draco, decoder, dracoGeometry, attributeName, attributeType, attribute ) );

			} // Add index.


			if ( geometryType === draco.TRIANGULAR_MESH ) {

				geometry.index = decodeIndex( draco, decoder, dracoGeometry );

			}

			draco.destroy( dracoGeometry );
			return geometry;

		}

		function decodeIndex( draco, decoder, dracoGeometry ) {

			const numFaces = dracoGeometry.num_faces();
			const numIndices = numFaces * 3;
			const byteLength = numIndices * 4;

			const ptr = draco._malloc( byteLength );

			decoder.GetTrianglesUInt32Array( dracoGeometry, byteLength, ptr );
			const index = new Uint32Array( draco.HEAPF32.buffer, ptr, numIndices ).slice();

			draco._free( ptr );

			return {
				array: index,
				itemSize: 1
			};

		}

		function decodeAttribute( draco, decoder, dracoGeometry, attributeName, attributeType, attribute ) {

			const numComponents = attribute.num_components();
			const numPoints = dracoGeometry.num_points();
			const numValues = numPoints * numComponents;
			const byteLength = numValues * attributeType.BYTES_PER_ELEMENT;
			const dataType = getDracoDataType( draco, attributeType );

			const ptr = draco._malloc( byteLength );

			decoder.GetAttributeDataArrayForAllPoints( dracoGeometry, attribute, dataType, byteLength, ptr );
			const array = new attributeType( draco.HEAPF32.buffer, ptr, numValues ).slice();

			draco._free( ptr );

			return {
				name: attributeName,
				array: array,
				itemSize: numComponents
			};

		}

		function getDracoDataType( draco, attributeType ) {

			switch ( attributeType ) {

				case Float32Array:
					return draco.DT_FLOAT32;

				case Int8Array:
					return draco.DT_INT8;

				case Int16Array:
					return draco.DT_INT16;

				case Int32Array:
					return draco.DT_INT32;

				case Uint8Array:
					return draco.DT_UINT8;

				case Uint16Array:
					return draco.DT_UINT16;

				case Uint32Array:
					return draco.DT_UINT32;

			}

		}

	}

	drcLoader = DRACOLoader;

} )();