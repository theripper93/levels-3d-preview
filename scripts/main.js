import * as THREE from "./lib/three.module.js";
import { OrbitControls } from "./lib/OrbitControls.js";
import { GameCamera } from "./helpers/GameCamera.js";
import { TransformControls } from "./lib/TransformControls.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import {Token3D} from "./entities/token3d.js";
import { Ruler3D } from "./entities/ruler3d.js";
import { Light3D } from "./entities/light3d.js";
import { Wall3D } from "./entities/wall3d.js";
import { Tile3D } from "./entities/tile3d.js";
import { Note3D } from "./entities/note3d.js";
import { Grid3D } from "./entities/grid3d.js";
import { RangeFinder } from "./entities/rangeFinder.js";
import { Template3D } from "./entities/template3d.js";
import { Cursors3D } from "./entities/cursors.js";
import { FBXLoader } from './lib/FBXLoader.js';
import { GlobalIllumination } from "./helpers/globalIllumination.js";
import { InteractionManager } from "./helpers/interactionManager.js";
import * as PIXI from "./helpers/pixilayer.js";
import { Helpers } from "./helpers/helpers.js";
import { WeatherSystem } from "./helpers/weatherSystem.js";
import { EXRLoader } from "./lib/EXRLoader.js";
import { EffectComposer } from './lib/EffectComposer.js';
import { RenderPass } from './lib/RenderPass.js';
import { Fog } from "./helpers/Fog.js";
import { Exporter } from "./helpers/exporter.js";
import { turnStartMarker } from "./helpers/turnStartMarker.js";
import { ParticleSystem } from "./helpers/particleSystem.js";
import { Particle3D } from "./helpers/particleSystem.js";
import { defaultTokenAnimations } from "./helpers/tokenAnimationHandler.js";
import { ClipNavigation } from "./clipNavigation.js";
import { presetMaterials, PresetMaterialHandler, populateScene } from "./helpers/presetMaterials.js";

export const factor = 1000;

globalThis.Particle3D = Particle3D;

Hooks.once("ready", () => {
  game.Levels3DPreview = new Levels3DPreview();
  Hooks.callAll("3DCanvasInit", game.Levels3DPreview);
  game.Levels3DPreview.cacheModels();
  if(!game.settings.get("levels-3d-preview", "removeKeybindingsPrompt")) game.Levels3DPreview.interactionManager.removeWASDBindings()
  Hooks.callAll("3DCanvasReady", game.Levels3DPreview);

  const navHooks = ["updateTile", "createTile", "deleteTile", "updateWall", "createWall", "deleteWall"]
  navHooks.forEach((h)=>{
    Hooks.on(h, () => {
      if (game.Levels3DPreview?._active) game.Levels3DPreview.ClipNavigation?.update();
    });
  });

  Hooks.on("updateScene", () => {
    if (game.Levels3DPreview?._active) game.Levels3DPreview.ClipNavigation?.render(true);
  })

})

Hooks.once("socketlib.ready", () => {
  
});

Hooks.on("canvasReady", async () => {
  do{
    await sleep(100);
    if(!game.Levels3DPreview || !game.Levels3DPreview?._init) continue;
    if(game.threeportrait && !game.threeportrait._dataReady) continue;
    game.Levels3DPreview._cameraSet = false;
    game.Levels3DPreview.close();
    game.Levels3DPreview.controls.reset();
    const enablePlayers = canvas.scene.getFlag("levels-3d-preview", "enablePlayers");
    const isGM = game.user.isGM;
    if(canvas.scene.getFlag("levels-3d-preview", "auto3d") && (enablePlayers || isGM)){
      game.Levels3DPreview.open();
    }
  }while(!game.Levels3DPreview || !game.Levels3DPreview?._init)

});

Hooks.on("levelsUiChangeLevel", () => {
  if (!game.user.isGM || $("#levels3d").length == 0) return;
  //game.Levels3DPreview.build3Dscene();
});

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Levels3DPreview {
  constructor() {
    THREE.Cache.enabled = true;
    this.THREE = THREE;
    this.populateScene = populateScene;
    this._errCount = 0;
    this.socket = socketlib.registerModule("levels-3d-preview");
    this.socket.register("Particle3D", this.particleSocket);
    this.socket.register("Particle3DStop", this.Particle3DStop);
    this.socket.register("toggleDoor", this.toggleDoor);
    this.isLevels = game.modules.get("levels")?.active;
    this.fpsKillSwitch = 1;
    this.camera;
    this._animateCameraTarget = {};
    this.scene;
    this.renderer;
    this.factor = factor;
    this.ClipNavigation = null;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode");
    this.CONFIG = {
      entityClass: {
        RangeFinder,
      },
      autoPan: false,
      tokenAnimations: defaultTokenAnimations,
      skybox: {
        sky: "modules/levels-3d-preview/assets/skybox/humble/humble_bk.jpg",
        exr: "modules/levels-3d-preview/assets/skybox/venice_sunrise_1k.exr",
      },
      presetMaterials: presetMaterials,
      tokenBase: [
        {
          id: "roundDoubleRing",
          path: "modules/levels-3d-preview/assets/tokenBases/roundDoubleRing.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.roundDoubleRing`),
          scale: 0.8,
        },
        {
          id: "sharp",
          path: "modules/levels-3d-preview/assets/tokenBases/baseSharp.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.sharp`),
          scale: 0.9,
        },
        {
          id: "sharpIndicator",
          path: "modules/levels-3d-preview/assets/tokenBases/baseSharpIndicator.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.sharpIndicator`),
          scale: 0.9,
        },
        {
          id: "rounded",
          path: "modules/levels-3d-preview/assets/tokenBases/baseRounded.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.rounded`),
          scale: 0.9,
        },
        {
          id: "ringHollow",
          path: "modules/levels-3d-preview/assets/tokenBases/ringHollow.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.ringHollow`),
          scale: 0.7,
          showDisp: true,
        },
        {
          id: "jb2around1Indicator",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2around1Indicator.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2around1Indicator`),
          scale: 0.9,
        },
        {
          id: "jb2around1",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2around1.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2around1`),
          scale: 0.9,
        },
        {
          id: "jb2around2Indicator",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2around2Indicator.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2around2Indicator`),
          scale: 0.9,
        },
        {
          id: "jb2around2",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2around2.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2around2`),
          scale: 0.9,
        },
        {
          id: "jb2ahex1Indicator",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2ahex1Indicator.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2ahex1Indicator`),
          scale: 1.2,
        },
        {
          id: "jb2ahex1",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2ahex1.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2ahex1`),
          scale: 1.2,
        },
        {
          id: "jb2ahex2Indicator",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2ahex2Indicator.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2ahex2Indicator`),
          scale: 1.2,
        },
        {
          id: "jb2ahex2",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2ahex2.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2ahex2`),
          scale: 1.2,
        },
        {
          id: "jb2asquare1Indicator",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2asquare1Indicator.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2asquare1Indicator`),
          scale: 0.9,
        },
        {
          id: "jb2asquare1",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2asquare1.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2asquare1`),
          scale: 0.9,
        },
        {
          id: "jb2asquare2Indicator",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2asquare2Indicator.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2asquare2Indicator`),
          scale: 0.9,
        },
        {
          id: "jb2asquare2",
          path: "modules/levels-3d-preview/assets/tokenBases/JB2A/jb2asquare2.glb",
          name: game.i18n.localize(`levels3dpreview.baseStyles.jb2asquare2`),
          scale: 0.9,
        },
      ]
    };
    for (let [k, v] of Object.entries(this.CONFIG.tokenAnimations)) {
      v.name = game.i18n.localize(`levels3dpreview.tokenAnimations.${k}`);
    }
    this.setAutopan();
    this.tokens = {};
    this.rangeFinders = [];
    this.loadingTokens = {};
    this.lights = {
      sceneLights: {},
    };
    this.utils = {
      PIXI: PIXI,
    };
    this.walls = {};
    this.doors = {};
    this.tiles = {};
    this.templates = {};
    this.notes = {};
    this.models = {
      target: new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 32)),
    };
    this.textures = {
      template: new THREE.TextureLoader().load("icons/svg/explosion.svg"),
      lightOn: new THREE.TextureLoader().load("icons/svg/light.svg"),
      lightOff: new THREE.TextureLoader().load("icons/svg/light-off.svg"),
      indicator: {
        //aoRM: new THREE.TextureLoader().load("modules/levels-3d-preview/assets/DefaultMaterial_occlusionRoughnessMetallic.png"),
        normal: new THREE.TextureLoader().load(
          "modules/levels-3d-preview/assets/DefaultMaterial_normal.webp",
          (texture) => {
            texture.repeat = new THREE.Vector2(4, 4);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
          }
        ),
      },
    };
    this.effectsCache = {};
    this.targetTextures = {};
    this.Classes = {
      Template3D: Template3D,
    };
    this.animationMixers = [];
    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();
    this.FBXLoader = new FBXLoader();
    this._active = false;
    this._ready = false;
    this.tokenAnimationQueue = [];
    this._cameraSet = false;
    this.helpers = new Helpers();
    this.socket.register("socketCamera", this.helpers.socketCamera);
    this.socket.register("syncClipNavigator", this.helpers.syncClipNavigator);
    this.socket.register(
      "playTokenAnimationSocket",
      this.helpers.playTokenAnimationSocket
    );
    this.exporter = new Exporter(this);
    $("body").append(
      `<div id="video-texture-container" style="position: absolute; top: 0; left: 0;display: none;"></div>`
    );
    this.videoTextureContinaer = $("#video-texture-container");
    this.init3d();
  }

  get hasFocus(){
    return document.activeElement.classList.contains("vtt")
  }

  init3d() {
    this._sharedContext = game.settings.get("levels-3d-preview", "sharedContext")
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      100
    );
    this.camera.position.set(8, 2, 8).setLength(8);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();

    this.scene = new THREE.Scene();
    this.material = new THREE.MeshNormalMaterial();

    this.renderer = this._sharedContext ? new THREE.WebGLRenderer({ antialias: true, context: canvas.app.renderer.context.gl }) : new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setAnimationLoop(this.animation.bind(this));
    if(this._sharedContext) canvas.app.renderer.options.antialias = true;
    this.renderer.shadowMap.enabled = true;
    //this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.antialias = true;

    this.resolutionMulti =
      game.settings.get("levels-3d-preview", "resolution") *
      window.devicePixelRatio;
    this.renderer.setPixelRatio(this.resolutionMulti);
    this.renderer.alpha = true;
    this.renderer.setClearColor(0x999999, 1);
    //composer

    let target
    if(this.renderer.capabilities.isWebGL2){
      target = new THREE.WebGLMultisampleRenderTarget(window.innerWidth, window.innerHeight, {
        format: THREE.RGBAFormat,
        encoding: THREE.sRGBEncoding,
      })
      target.samples = 8
    }

    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(this.resolutionMulti);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    //set dom element id
    this.renderer.domElement.id = "levels3d";
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.listenToKeyEvents(document);
    this.controls.keyPanSpeed = 35;
    game.settings.get("levels-3d-preview", "cameralockzero") &&
      this.controls.addEventListener("change", this._onCameraChange.bind(this));
    this.ruler = new Ruler3D(this);
    this.interactionManager = new InteractionManager(this);
    this.interactionManager.activateListeners();
    this.cursors = new Cursors3D(this);


    this.GameCamera = new GameCamera(this.camera, this.controls, this);
    //clipping
    this.renderer.localClippingEnabled = true;


  }

  async cacheModels() {
    this.presetMaterialHandler = new PresetMaterialHandler(this.CONFIG.presetMaterials);
    this.models.target = await (
      await this.helpers.loadModel(
        "modules/levels-3d-preview/assets/targetIndicator.fbx"
      )
    ).model;
    this.models.target.children[0].material = new THREE.MeshBasicMaterial();
    this.models.effect = await (
      await this.helpers.loadModel(
        "modules/levels-3d-preview/assets/effect.glb"
      )
    ).model
    const box3 = new THREE.Box3().setFromObject(this.models.effect);
    //scale model to make it 1x1x1
    this.models.effect.scale.multiplyScalar(
      1 / Math.max(box3.max.x - box3.min.x, box3.max.y - box3.min.y, box3.max.z - box3.min.z)
    );
    this._init = true;
  }

  get canvasCenter() {
    return {
      x: canvas.dimensions.width / 2 / this.factor,
      y: 0,
      z: canvas.dimensions.height / 2 / this.factor,
    };
  }

  initPS() {
    this.particleSystem?.destroy();
    this.particleSystem = new ParticleSystem(this);
  }

  build3Dscene() {
    this._ready = false;
    this._lightsOk = !canvas.scene.getFlag("levels-3d-preview", "bakeLights");
    this.clear3Dscene();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(
      canvas.scene.data.backgroundColor ?? 0xffffff
    );
    this.rangeFinderMode = game.settings.get("levels-3d-preview", "rangeFinder");
    this.composer.removePass(this.renderPass);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    if (this.fogExploration) {
      this.fogExploration.dispose();
      this.fogExploration = null;
    }
    if (canvas.scene.data.tokenVision && canvas.scene.getFlag("levels-3d-preview", "enableFogOfWar"))
      this.fogExploration = new Fog(this);
    this.composer.render();
    this._active = true;
    this.particleSystem?.destroy();
    if (this.particleSystem) {
      this.particleSystem._parent = this;
      this.particleSystem.move();
    } else {
      this.particleSystem = new ParticleSystem(this);
    }
    this.transformControls?.dispose();
    this.transformControls = new TransformControls(
      this.camera,
      this.renderer.domElement
    );
    this.controlledGroup = new THREE.Group();
    this.controlledGroup.userData = {
      entity3D: {
        updatePositionFrom3D : () => {
          game.Levels3DPreview.interactionManager._onTransformEnd();
        },
        mesh: this.controlledGroup,
        elevation3d: 0,
        isTransformControls: true,
        draggable: true,
        embeddedName: "Tile",
        _onClickLeft: (e) => { return this.controlledGroup.children[0]?.userData.entity3D._onClickLeft(e) },
        _onClickRight: (e) => { return this.controlledGroup.children[0]?.userData.entity3D._onClickRight(e) },
        _onClickLeft2: (e) => { return this.controlledGroup.children[0]?.userData.entity3D._onClickLeft2(e) },
        _onClickRight2: (e) => { return this.controlledGroup.children[0]?.userData.entity3D._onClickRight2(e) },
      }
    }
    this.scene.add(this.controlledGroup);
    this.scene.add(this.transformControls);
    this.interactionManager.initTransformControls();
    this.object3dSight =
      canvas.scene.getFlag("levels-3d-preview", "object3dSight") ?? false;
    this.mirrorLevelsVisibility =
      canvas.scene.getFlag("levels-3d-preview", "mirrorLevels") ?? false;
    this.debugMode = game.settings.get("levels-3d-preview", "debugMode");
    this.level = Infinity; //this.isLevels ? parseFloat($(_levels.UI?.element)?.find(".level-item.active").find(".level-bottom").val()) ?? Infinity : Infinity;
    if (isNaN(this.level)) this.level = Infinity;
    this.showSun = this.debugMode;
    this.createTemplates();
    const drawFloors =
      canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") ?? true;
    const drawWalls =
      canvas.scene.getFlag("levels-3d-preview", "showSceneWalls") ?? true;
    const drawLights =
      canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") ?? true;
    this.standUpFaceCamera =
      game.settings.get("levels-3d-preview", "standupFace") ?? true;
    const enableFog =
      canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false;
    const fogColor =
      canvas.scene.getFlag("levels-3d-preview", "fogColor") ?? "#000000";
    const fogDistance =
      (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) /
      this.factor;
    this.isLevels && this.createFloors(this.level);
    this.createWalls(this.level);
    this.createSceneLights();
    this.createNotes();
    this.createBoard();
    this.createTable();
    for (let token of canvas.tokens.placeables) {
      this.addToken(token);
    }
    if (this.debugMode) this.scene.add(new THREE.AxesHelper(3));

    this.grid = new Grid3D(this);

    const size =
      Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
      this.factor;

    if (enableFog) this.scene.fog = new THREE.Fog(fogColor, 1, fogDistance);
    //add raycasting plane

    const dragplane = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false })
    );
    dragplane.position.set(size / 2, 0, size / 2);
    dragplane.userData.isFloor = true;
    dragplane.rotation.x = -Math.PI / 2;
    this.scene.add(dragplane);
    this.interactionManager.dragplane = dragplane;
    this.makeSkybox();
    //this.weather = new WeatherSystem(this);
    this.lights.globalIllumination = new GlobalIllumination(this);
    this.ruler.addMarkers();
    const useTurnMarker = game.settings.get("levels-3d-preview", "startMarker");
    if (useTurnMarker) this.turnStartMarker = new turnStartMarker(this);
    if (!this._cameraSet) {
      this.resetCamera();
      this._cameraSet = true;
    }
    this.GameCamera.init();
    this.lights.globalIllumination.setSunlightFromFlags(false);
    this.interactionManager._cacheKeybinds();
    if(this.GameCamera.enabled) this.interactionManager.showIntro()
  }

  addToken(token) {
    if (!this._ready) {
      this.loadingTokens[token.id] = new Token3D(token, this);
      this.loadingTokens[token.id].load().then((token3d) => {
        this.tokens[token.id] = this.loadingTokens[token.id];
        this.scene.add(token3d.mesh);
      });
    } else {
      new Token3D(token, this).load().then((token3d) => {
        this.tokens[token.id] = token3d;
        this.scene.add(token3d.mesh);
      });
    }
  }

  async createBoard() {
    this.scene.remove(this.board);
    if (
      !(canvas.scene.getFlag("levels-3d-preview", "renderBackground") ?? true)
    )
      return;
    //make a plane and apply a texture
    const width = canvas.scene.dimensions.sceneWidth / this.factor;
    const height = canvas.scene.dimensions.sceneHeight / this.factor;
    const center = this.canvasCenter;
    const depth = 0.02;
    const texture = await this.helpers.loadTexture(canvas.scene.data.img);
    if (texture) {
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
    const offsetX = -canvas.dimensions.shiftX / this.factor;
    const offsetY = -canvas.dimensions.shiftY / this.factor;
    plane.position.set(
      center.x + offsetX,
      center.y - depth / 2 - 0.00001,
      center.z + offsetY
    );
    plane.rotation.x = -Math.PI / 2;
    this.board = plane;
    plane.userData.isBackground = true;
    this.scene.add(plane);
  }

  async createTable() {
    this.scene.remove(this.table);
    if (
      !(canvas.scene.getFlag("levels-3d-preview", "renderTable") ?? false) ||
      !canvas.scene.getFlag("levels-3d-preview", "tableTex")
    )
      return;
    //make a plane and apply a texture
    const width = canvas.scene.dimensions.width / this.factor;
    const height = canvas.scene.dimensions.height / this.factor;
    const center = this.canvasCenter;
    const depth = Math.max(width, height) / 10;
    const textureMat = await this.helpers.autodetectTextureOrMaterial(
      canvas.scene.getFlag("levels-3d-preview", "tableTex")
    );
    const geometry = new THREE.BoxGeometry(width, height, depth);
    let uvAttribute = geometry.attributes.uv;

    for (let i = 0; i < uvAttribute.count; i++) {
      let u = uvAttribute.getX(i);
      let v = uvAttribute.getY(i);
      u *=
        Math.round(
          canvas.scene.dimensions.width / canvas.scene.dimensions.size
        ) / 10;
      v *=
        Math.round(
          canvas.scene.dimensions.height / canvas.scene.dimensions.size
        ) / 10;
      uvAttribute.setXY(i, u, v);
    }
    if (textureMat.image) {
      textureMat.wrapS = THREE.RepeatWrapping;
      textureMat.wrapT = THREE.RepeatWrapping;
    }
    const material = textureMat.image
      ? new THREE.MeshStandardMaterial({
          map: textureMat,
          roughness: 1,
          metalness: 1,
        })
      : textureMat;
    material.toneMapped = false;
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true;
    plane.position.set(center.x, center.y - (depth / 2 + 0.011), center.z);
    plane.rotation.x = -Math.PI / 2;
    this.table = plane;
    this.scene.add(plane);
  }

  createSceneLights() {
    if (game.settings.get("levels-3d-preview", "disableLighting")) return;
    for (let light of canvas.lighting.placeables) {
      this.addLight(light);
    }
  }

  addLight(light) {
    this.lights.sceneLights[light.id]?.destroy();
    if (
      canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") === false
    )
      return;
    const light3d = new Light3D(light, this);
    this.lights.sceneLights[light.id] = light3d;
  }

  createFloors() {
    for (let tile of canvas.background.placeables.concat(
      canvas.foreground.placeables
    )) {
      if (this.isLevels) {
        const bottom = tile.data.flags.levels?.rangeBottom ?? -Infinity;
        if (bottom > this.level) continue;
      }
      this.createTile(tile);

      if (!this.debugMode) continue;
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

  createTile(tile) {
    if (
      this.debugMode ||
      canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") === false
    )
      return;
    if (!this._ready) {
      this.loadingTiles[tile.id] = new Tile3D(tile, this);
      this.loadingTiles[tile.id].load().then((tile3d) => {
        this.tiles[tile.id] = this.loadingTiles[tile.id];
      });
    } else {
      this.tiles[tile.id] = new Tile3D(tile, this);
      this.tiles[tile.id].load();
    }
  }

  createWalls() {
    for (let wall of canvas.walls.placeables) {
      if (this.isLevels) {
        const bottom =
          wall.data.flags.wallHeight?.wallHeightBottom ?? -Infinity;
        if (bottom > this.level) continue;
      }
      this.createWall(wall);
    }
  }

  createWall(wall) {
    const isDoor = wall.isDoor;
    if (
      canvas.scene.getFlag("levels-3d-preview", "showSceneWalls") === false &&
      !isDoor
    )
      return;
    if (
      canvas.scene.getFlag("levels-3d-preview", "showSceneDoors") === false &&
      isDoor
    )
      return;
    this.walls[wall.id] = new Wall3D(wall, this);
    if (wall.data.door) this.doors[wall.id] = this.walls[wall.id];
  }

  createTemplates() {
    for (let template of canvas.templates.placeables) {
      this.createTemplate(template);
    }
  }

  createTemplate(template) {
    this.templates[template.id] = new Template3D(template);
  }

  createNotes() {
    for (let note of canvas.notes.placeables) {
      this.createNote(note);
    }
  }

  createNote(note) {
    this.notes[note.id] = new Note3D(note);
  }

  makeSkybox() {
    this.scene.background = new THREE.Color(
      canvas.scene.data.backgroundColor ?? 0xffffff
    );
    this.scene.environment = null;
    this.isEXR = false;
    this.scene.remove(this.skybox);
    const sceneSize =
      Math.max(canvas.scene.dimensions.width, canvas.scene.dimensions.height) /
      100;
    const size = sceneSize < 80 ? 80 : sceneSize;
    this.renderer.outputEncoding = THREE.LinearEncoding;
    this.renderer.toneMapping = THREE.NoToneMapping;
    const rootImage =
      canvas.scene.getFlag("levels-3d-preview", "skybox") ??
      this.CONFIG.skybox.sky;
    const exr =
      canvas.scene.getFlag("levels-3d-preview", "exr") ??
      this.CONFIG.skybox.exr;
    if (exr) this.loadEXR(exr);
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
      textureArray.push(rootImage.replace(currSuffix, suffix));
      materialArray.push(
        new THREE.MeshBasicMaterial({
          map: new THREE.TextureLoader().load(
            rootImage.replace(currSuffix, suffix)
          ),
          side: THREE.BackSide,
        })
      );
    }
    /*const skyboxGeometry = new THREE.BoxGeometry(size, size, size);
    const skybox = new THREE.Mesh(skyboxGeometry, materialArray);
    const center = this.canvasCenter;
    skybox.position.set(center.x, center.y, center.z);
    this.scene.add(skybox);
    this.skybox = skybox;*/
    const loader = new THREE.CubeTextureLoader();
    const textureCube = loader.load(textureArray);
    this.scene.background = textureCube;
    if (!exr) this.scene.environment = textureCube;
  }

  loadEXR(rootImage) {
    this.isEXR = true;
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const _this = this;
    new EXRLoader()
      .setDataType(THREE.UnsignedByteType)
      .load(rootImage, function (texture) {
        let exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
        let newEnvMap = exrCubeRenderTarget
          ? exrCubeRenderTarget.texture
          : null;
        _this.scene.environment = newEnvMap;
        if(_this.scene.background instanceof THREE.Color) _this.scene.background = newEnvMap;
      });
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    //this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  createFloor(points, z) {
    const alpha =
      canvas.scene.getFlag("levels-3d-preview", "wallFloorAlpha") ?? 0.5;
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
    this.scene.traverse((child) => {
      if (child.isMesh) {
        child.dispose?.();
      }
    });
    while (this.scene.children.length > 0) {
      this.scene.children[0].dispose?.();
      this.scene.remove(this.scene.children[0]);
    }
    this.tokens = {};
    this.rangeFinders = [];
    this.loadingTokens = {};
    this.loadingTiles = {};
    this.walls = {};
    this.doors = {};
    this.lights.sceneLights = {};
    this.tiles = {};
    this.notes = {};
    this.templates = {};
    this.cursors.clear();
  }

  resizeCanvasToDisplaySize() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.composer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  centerHUD() {
    if (!this._active) return;
    let hud = canvas.hud.token;
    if (hud.object) {
      const token3D = this.tokens[hud.object.id];
      if (!token3D) return;
      const center = token3D.mesh.position.clone();
      center.y += token3D.hitbox.geometry.boundingBox.max.y;
      Ruler3D.centerElement(hud.element, center);
    }
    hud = canvas.hud.tile;
    if (hud.object) {
      const tile3D = this.tiles[hud.object.id];
      if (!tile3D || !tile3D.mesh) return;
      const center = tile3D.mesh.position.clone();
      Ruler3D.centerElement(hud.element, center);
    }
  }

  allignChatBubbles() {
    const bubbles = $(".chat-bubble");
    bubbles.each((index, bubble) => {
      const token3D = this.tokens[bubble.dataset.tokenId];
      const center = token3D.head;
      center.y += 0.03;
      //center.y += token3D.hitbox.geometry.boundingBox.max.y * 2;
      $("body").append(bubble);
      $(bubble).css({
        "transform-origin": "bottom center",
      });
      Ruler3D.centerElement(bubble, center, true);
    });
  }

  animation(time) {
    try {
      if (!this._active) return;
      if (!this._ready) return this._onProgress();
      if(this._sharedContext){
        canvas.app.renderer.reset()
        this.renderer.resetState();
      }
      this.interactionManager.dragObject();
      this.cursors.update();
      const delta = this.clock.getDelta();
      this.grid?.updateGrid();
      Object.values(this.tokens).forEach((token) => {
        if(token){
          token.updateVisibility();
          token.updateProne(delta);
          token.rotateEffects(delta);
          if (token.mixer) {
            token.mixer.update(delta);
          }
          if (token.standUp && token.standupFace) {
            token.faceCamera();
          }
        }
      });
      Object.values(this.tiles).forEach((tile) => {
        tile.updateVisibility();
        if (tile.mixer && !tile.paused) {
          tile.mixer.update(delta);
        }
      });
      if (this.mirrorLevelsVisibility) {
        Object.values(this.walls).forEach((wall) => {
          wall.updateVisibility();
        });
      }
      Object.values(this.lights.sceneLights).forEach((light) => {
        light.updateHandle();
      });
      Object.values(this.notes).forEach((note) => {
        note.updateVisibility();
      });
      this.rangeFinders.forEach((rangeFinder) => {
        rangeFinder.updateText();
      })
      this.particleSystem.update(delta);
      this.checkInFog();
      this.animateCamera(delta);
      this.centerHUD();
      document.querySelectorAll("#levels3d-ruler-text.scrolling-text").forEach(e => {
        const t3d = this.tokens[e.dataset.tokenid];
        if(t3d) this.helpers.ruler3d.centerElement(e, t3d.head);
      })
      this.allignChatBubbles();
      this.resizeCanvasToDisplaySize(this);
      this.weather?.update(delta);
      this.GameCamera.update(delta);
      this.controls.update();
      this.fogExploration?.update();
      this.composer.render(time)
      if(this._sharedContext){
        canvas.app.renderer.reset()
        this.renderer.resetState();
      }
    } catch (error) {
      this._errCount++;
      console.error("3D Canvas: An Error Occured in the Rendering Loop", error);
      if(this._errCount > 200){
        this._errCount = 0;
        ui.notifications.error(game.i18n.localize("levels3dpreview.errors.critical"));
        this.reload();
      }
    }
  }

  checkInFog() {
    let inFog = false;
    for (let template of Object.values(this.templates)) {
      if (template.pointInFogmesh(this.camera.position)) {
        inFog = true;
        break;
      }
    }
    this.scene.visible = !inFog;
  }

  _onCameraChange() {
    const centerPosition = this.controls.target.clone();
    centerPosition.y = 0;
    const groundPosition = this.camera.position.clone();
    groundPosition.y = 0;
    const d = centerPosition.distanceTo(groundPosition);

    const origin = new THREE.Vector2(this.controls.target.y, 0);
    const remote = new THREE.Vector2(0, d);
    const angleRadians = Math.atan2(remote.y - origin.y, remote.x - origin.x);
    this.controls.maxPolarAngle = angleRadians;
  }

  setAutopan(value) {
    if (!value) value = game.settings.get("levels-3d-preview", "autoPan");
    switch (value) {
      case "none":
        return (this.CONFIG.autoPan = false);
      case "player":
        return (this.CONFIG.autoPan = !game.user.isGM);
      case "all":
        return (this.CONFIG.autoPan = true);
    }
  }

  animateCamera(delta) {

    if (this._animateCameraTarget.cameraPosition !== undefined) {
      const targetPos = this._animateCameraTarget.cameraPosition.clone();
      this.camera.position.lerp(targetPos,this._animateCameraTarget.speed ?? 0.04);
      if(this.camera.position.distanceTo(targetPos) < 0.001){
        this._animateCameraTarget.cameraPosition = undefined;
      }
    }
    if(this._animateCameraTarget.cameraLookat !== undefined){
      const targetLookat = this._animateCameraTarget.cameraLookat.clone();
      const currentLookat =
        this._animateCameraTarget.currentLookat ?? this.controls.target.clone();
      const lerpLookat = currentLookat.lerp(targetLookat, (this._animateCameraTarget.speed ?? 0.04)+0.001);
      this._animateCameraTarget.currentLookat = lerpLookat.clone();

      this.controls.target.set(lerpLookat.x, lerpLookat.y, lerpLookat.z);
      if (
        lerpLookat.distanceTo(targetLookat) < 0.00001
      ) {
        this.controls.target.set(
          targetLookat.x,
          targetLookat.y,
          targetLookat.z
        );
        this._animateCameraTarget.cameraLookat = undefined;
        this._animateCameraTarget.currentLookat = undefined;
      }
    }
  }

  stopCameraAnimation() {
    this._animateCameraTarget = {
      cameraPosition: undefined,
      cameraLookat: undefined,
      currentLookat: undefined,
    };
  }

  resetCamera(topdown = false) {

    const center = this.canvasCenter;
    this.controls.reset();
    if(!this.GameCamera.enabled){
      this.controls.maxDistance = 20;
      this.controls.minDistance = 0.1;
      this.controls.screenSpacePanning = game.settings.get(
        "levels-3d-preview",
        "screenspacepanning"
      );
    }
    this.controls.enableDamping = game.settings.get(
      "levels-3d-preview",
      "enabledamping"
    ); //true;
    this.controls.dampingFactor = 0.07;

    this.controls.target.set(center.x, center.y, center.z);
    const loaded = topdown ? false : this.loadInitialCameraPosition();
    if (!loaded) {
      this.camera.lookAt(center);
      this.camera.position.set(center.x * 1.5, center.y + 1, center.z * 2);
    }
    if (topdown) this.camera.position.set(center.x, center.y + 4, center.z);
    this.controls.update();
  }

  loadInitialCameraPosition() {
    const initialPos = canvas.scene.getFlag(
      "levels-3d-preview",
      "initialPosition"
    );
    if (!initialPos) return false;
    this.camera.position.set(
      initialPos.position.x,
      initialPos.position.y,
      initialPos.position.z
    );
    this.controls.target.set(
      initialPos.target.x,
      initialPos.target.y,
      initialPos.target.z
    );
    this.camera.lookAt(initialPos.target);
    return true;
  }

  setCameraToControlled(token) {
    let cToken,token3D
    if(!(token instanceof Token3D) && !token?.userData?.original){
      cToken = token ?? canvas.tokens.controlled[0];
      if(!cToken && !game.user.isGM){
        cToken = canvas.tokens.placeables.find(t => t.isOwner);
      }
      if (!cToken) return;
      if(cToken.isOwner) cToken.control();
      this.ClipNavigation.setToClosest(cToken.data.elevation);
      token3D = this.tokens[cToken.id];
      if (!token3D) return;
    }else{
      token3D = token;
      cToken = token3D.token;
    }


    let oldCameraData

    if(this._animateCameraTarget.cameraLookat){
      oldCameraData = {
        cameraPosition: this.camera.position.clone(),
        cameraLookat: this.controls.target.clone(),
      }
      this.camera.position.copy(this._animateCameraTarget.cameraPosition);
      this.controls.target.copy(this._animateCameraTarget.cameraLookat);
      this.camera.lookAt(this._animateCameraTarget.cameraLookat);
    }

    const targetLookat = token3D.head.clone();
    this._animateCameraTarget.cameraLookat = targetLookat;

    const cameraPosition = this.camera.position.clone();
    const diff = this.controls.target.clone().sub(targetLookat.clone())
    let targetPosition = cameraPosition.sub(diff);

    const headPoint = token3D.head;
    let collision
    if(!this.GameCamera.enabled){
      collision =
      this.interactionManager.computeSightCollisionFrom3DPositions(
        headPoint,
        targetPosition
      );
    }

    if (collision && targetPosition.y < (this.ClipNavigation._clipHeight ?? Infinity)) {
      const collisionPoint = new THREE.Vector3(
        collision.x,
        collision.y,
        collision.z
      );
      collisionPoint.lerp(headPoint, 0.1);
      targetPosition = collisionPoint;
    }

    this._animateCameraTarget.cameraPosition = targetPosition;

    if(oldCameraData){
      this.camera.position.copy(oldCameraData.cameraPosition);
      this.controls.target.copy(oldCameraData.cameraLookat);
      this.camera.lookAt(oldCameraData.cameraLookat);
    }

  }

  _onProgress() {
    const tokenArray = Object.values(this.loadingTokens);
    const tileArray = Object.values(this.loadingTiles);
    const total = tokenArray.length + tileArray.length;
    const loaded =
      tokenArray.filter((token) => token._loaded).length +
      tileArray.filter((tile) => tile._loaded).length;
    let progress = total === 0 ? 100 : Math.round((loaded / total) * 100);
    if (total === loaded) {
      this._ready = true;
      this.loadingTokens = {};
      this.loadingTiles = {};
      this._onReady();
      Hooks.callAll("3DCanvasSceneReady", game.Levels3DPreview);
    }
    SceneNavigation.displayProgressBar({
      label: game.i18n.localize("levels3dpreview.controls.loading"),
      pct: progress,
    });
  }

  _onReady(){
    this.ClipNavigation = new ClipNavigation().render(true);
    this.weather = new WeatherSystem(this);
    canvas.sight.refresh();
    canvas.perception.schedule({
      lighting: { initialize: true /* calls updateSource on each light source */, refresh: true },
      sight: { initialize: true /* calls updateSource on each token */, refresh: true /* you probably to refesh sight as well */, forceUpdateFog: true /* not sure if you need this */ },
    });    
  }

  toggle(force) {
    if (force !== undefined) {
      force ? this.open() : this.close();
      return;
    }
    if (this._active) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this._active) return;
    if(this._sharedContext){
      canvas.app.renderer.reset()
      this.renderer.resetState();
    }
    this.build3Dscene();
    document.body.appendChild(this.renderer.domElement);
    if(this._sharedContext){
      canvas.stage.renderable = false;
    }else{
      document.body.appendChild(this.renderer.domElement);
      if (game.settings.get("levels-3d-preview", "miniCanvas"))
        new miniCanvas().render(true);
      else {
        $("#board").hide();
        canvas.stage.renderable = false;
      }
    }

  }

  close() {
    this._active = false;
    this.ClipNavigation?.close();
    $("#levels3d").remove();
    Object.values(ui.windows)
      ?.find((w) => w.id === "miniCanvas")
      ?.close(true);
    $("#board").show();
    canvas.stage.renderable = true;
    this.clear3Dscene();
    if(this._sharedContext){
      canvas.app.renderer.reset()
      this.renderer.resetState();
    }
  }

  reload() {
    if (!this._active) return;
    this._cameraSet = false;
    this.close();
    setTimeout(() => this.open(), 300);
  }

  open3DFilePicker() {
    const fp = new FilePicker({
      type: "folder",
      tileSize: true,
    });
    fp.extensions = [".glb", ".GLB", ".gltf", ".GLTF", ".fbx", ".FBX"];
    fp.render(true);
  }

  playTokenAnimation(tokenIds, animationId, options = {}) {
    tokenIds instanceof Array || (tokenIds = [tokenIds]);
    tokenIds = tokenIds.map((id) => id.id ?? id);
    this.socket.executeForEveryone("playTokenAnimationSocket", {
      tokenIds,
      animationId,
      options,
    });
  }

  particleSocket(...args) {
    game.Levels3DPreview.particleSystem.resolveSocket(...args);
  }
  Particle3DStop(...args) {
    game.Levels3DPreview.particleSystem.stop(...args);
  }

  toggleDoor(tileId, sceneId, userId){
    const user = game.users.get(userId);
    if ( !user.can("WALL_DOORS")) return;
    if ( game.paused && !game.user.isGM ) return ui.notifications.warn("GAME.PausedWarning", {localize: true});
    const scene = game.scenes.get(sceneId);
    if(!scene) return;
    const tile = scene.tiles.get(tileId);
    if(!tile) return;
    const ds = tile.getFlag("levels-3d-preview", "doorState") ?? 0
    const isLocked = ds == 2;

    if(isLocked) return AudioHelper.play({src: CONFIG.sounds.lock});
    tile.setFlag("levels-3d-preview", "doorState", ds == 0 ? "1" : "0");
  }

  setCursor(cursor) {
    this.renderer.domElement.style.cursor = cursor;
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
  if("fogExploration" in updates || "tokenVision" in updates){
    game.Levels3DPreview.reload();
    return
  }
  const flags = updates.flags ? updates.flags["levels-3d-preview"] : undefined;
  if(!flags) return;
  if("object3dSight" in flags){
    canvas.draw();
    return 
  }
  if(//do reload
    "enableGrid" in flags ||
    "enableFog" in flags ||
    "fogColor" in flags ||
    "fogDistance" in flags ||
    "showSceneWalls" in flags ||
    "showSceneFloors" in flags ||
    "renderSceneLights" in flags ||
    "skybox" in flags ||
    "exr" in flags ||
    "mirrorLevels" in flags ||
    "gridAlpha" in updates ||
    "gridColor" in updates ||
    "enableFogOfWar" in flags
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

Hooks.on("updateCombat", ()=>{
  if(!game.Levels3DPreview?._active || !game.Levels3DPreview.turnStartMarker) return;
  game.Levels3DPreview.turnStartMarker.update();
})
Hooks.on("createCombat", ()=>{
  if(!game.Levels3DPreview?._active || !game.Levels3DPreview.turnStartMarker) return;
  game.Levels3DPreview.turnStartMarker.update();
})
Hooks.on("deleteCombat", ()=>{
  if(!game.Levels3DPreview?._active || !game.Levels3DPreview.turnStartMarker) return;
  game.Levels3DPreview.turnStartMarker.update();
})

Hooks.on("collapseSidebar", () => {
  if (game.Levels3DPreview?._active) game.Levels3DPreview.ClipNavigation.render(true);
})

Hooks.on("controlTile", (tile, control) => {
  if (!game.Levels3DPreview?._active) return
  const tile3d = game.Levels3DPreview.tiles[tile.id];
  if(!tile3d) return;
  game.Levels3DPreview.interactionManager.setControlledGroup(tile3d,control);
})

$(document).on("keyup", (event) => {
  if(event.key != "Shift" || !game.Levels3DPreview?._active) return;
  const ts = game.Levels3DPreview.transformControls;
  const snapSize = canvas.scene.dimensions.size/factor/2;
  ts.setTranslationSnap(snapSize);
  ts.setRotationSnap(Math.PI/4);
  ts.setScaleSnap(snapSize);
})

$(document).on("keydown", (event) => {
  if(event.key != "Shift" || !game.Levels3DPreview?._active) return;
  const ts = game.Levels3DPreview.transformControls;
  ts.setTranslationSnap(undefined);
  ts.setRotationSnap(undefined);
  ts.setScaleSnap(undefined);
})

//javascript:(function(){var script=document.createElement('script');script.onload=function(){var stats=new Stats();document.body.appendChild(stats.dom);requestAnimationFrame(function loop(){stats.update();requestAnimationFrame(loop)});};script.src='//mrdoob.github.io/stats.js/build/stats.min.js';document.head.appendChild(script);})()
