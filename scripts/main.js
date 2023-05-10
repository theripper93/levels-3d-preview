import * as THREE from "./lib/three.module.js";
import { OrbitControls } from "./lib/OrbitControls.js";
import { GameCamera } from "./handlers/GameCamera.js";
import { TransformControls } from "./lib/TransformControls.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { Token3D } from "./entities/token3d.js";
import { Ruler3D } from "./systems/ruler3d.js";
import { Light3D } from "./entities/light3d.js";
import { Wall3D } from "./entities/wall3d.js";
import { initSharing, setSharingHooks } from "./apps/sharing.js";
import { Tile3D, recomputeGravity, autoMergeTiles, unmergeTiles, splitToChunks, extractPointsFromDrawing, extrudeWalls } from "./entities/tile3d.js";
import { Note3D } from "./entities/note3d.js";
import { Grid3D } from "./systems/grid3d.js";
import { RangeFinder } from "./systems/rangeFinder.js";
import { Template3D } from "./entities/template3d.js";
import { Cursors3D } from "./systems/cursors.js";
import { FBXLoader } from "./lib/FBXLoader.js";
import { GlobalIllumination } from "./systems/globalIllumination.js";
import { InteractionManager, dropFunctions } from "./handlers/interactionManager.js";
import initTemplateEffects from "./shaders/templateEffects.js";
import { Helpers } from "./helpers/helpers.js";
import { WeatherSystem } from "./systems/weatherSystem.js";
import { EXRLoader } from "./lib/EXRLoader.js";
import { EffectComposer } from "./lib/EffectComposer.js";
import { RenderPass } from "./lib/RenderPass.js";
import { UnrealBloomPass } from "./lib/UnrealBloomPass.js";
import { Fog, injectFoWShaders } from "./systems/Fog.js";
import { Exporter } from "./helpers/exporter.js";
import { turnStartMarker } from "./systems/turnStartMarker.js";
import { ParticleEngine } from "./systems/particleSystem.js";
import { Particle3D } from "./systems/particleSystem.js";
import { defaultTokenAnimations } from "./handlers/tokenAnimationHandler.js";
import { ClipNavigation, CLIP_NAVIGATION_BUTTONS } from "./apps/clipNavigation.js";
import { presetMaterials, PresetMaterialHandler, populateScene } from "./helpers/presetMaterials.js";
import { FXAAShader } from "./lib/FXAA.js";
import { SMAAPass } from "./lib/SMAAPass.js";
import { ShaderPass } from "./lib/ShaderPass.js";
import { OutlineHandler } from "./handlers/OutlineHandler.js";
import { ShaderHandler, shaders } from "./shaders/ShaderLib.js";
import { DecalGeometry } from "./lib/DecalGeometry.js";
import { WorkerHandler } from "./helpers/workers.js";
import { miniCanvas } from "./apps/minicanvas.js";
import { throttle, sleep } from "./helpers/utils.js";
import { BokehPass } from "./lib/BokehPass.js";
import { Ping } from "./entities/effects/ping.js";
import {injectThreeModifications} from "./threejsmodifications.js";
import {ActiveEffectEffect} from "./entities/effects/activeEffect.js";
import {RangeRingEffect} from "./entities/effects/rangeRing.js";
import {CutsceneEngine} from "./systems/cutsceneEngine.js";
import { ImprovedNoise } from "./lib/imporovedNoise.js";
import {registerWrappers} from "./wrappers.js";
import {ProceduralVines} from "./helpers/ProceduralVines.js";
import {PARTICLE_SYSTEMS} from "./systems/particleSystem.js";
import {registerConfigs} from "./settings/config.js";
import {registerSettings} from "./settings/settingsConfig.js";

export const factor = 1000;
injectFoWShaders(THREE);
injectThreeModifications(THREE);

registerConfigs();
registerSettings();
registerWrappers();
Light3D.setHooks();
Note3D.setHooks();
Token3D.setHooks();
Wall3D.setHooks();
Tile3D.setHooks();
Template3D.setHooks();
RangeFinder.setHooks();
InteractionManager.setHooks();
GlobalIllumination.setHooks();
ClipNavigation.setHooks();
setSharingHooks();

globalThis.Particle3D = Particle3D;

Hooks.once("ready", () => {
    try {
        game.Levels3DPreview = new Levels3DPreview();
        Object.defineProperty(game, "canvas3D", {
            get: () => game.Levels3DPreview,
        });
    } catch (e) {
        ui.notifications.error(game.i18n.localize("levels3dpreview.errors.initfailed"));
        console.error(game.i18n.localize("levels3dpreview.errors.initfailed"), e);
    }
    Hooks.callAll("3DCanvasInit", game.Levels3DPreview);
    game.Levels3DPreview.cacheModels();
    if (!game.settings.get("levels-3d-preview", "removeKeybindingsPrompt")) game.Levels3DPreview.interactionManager.removeWASDBindings();
    Hooks.callAll("3DCanvasReady", game.Levels3DPreview);

    const navHooks = ["updateTile", "createTile", "deleteTile", "updateWall", "createWall", "deleteWall"];
    navHooks.forEach((h) => {
        Hooks.on(h, () => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.ClipNavigation?.update();
        });
    });

    Hooks.on("updateScene", () => {
        if (game.Levels3DPreview?._active) game.Levels3DPreview.ClipNavigation?.render(true);
    });
});

class Levels3DPreview {
    constructor() {
        this.materialProgramCache = {};
        THREE.Cache.enabled = true;
        this.THREE = THREE;
        this.populateScene = populateScene;
        this._errCount = 0;
        this.raycasterCache = {};
        this._heightmapCache = {};
        this._fullTransparency = game.settings.get("levels-3d-preview", "fullTransparency");
        this.socket = socketlib.registerModule("levels-3d-preview");
        this.socket.register("Particle3D", this.particleSocket);
        this.socket.register("Particle3DStop", this.Particle3DStop);
        this.socket.register("toggleDoor", this.toggleDoor);
        this.isLevels = game.modules.get("levels")?.active;
        this.fpsKillSwitch = 1;
        this.camera;
        this.firstPersonMode = false;
        this._animateCameraTarget = {};
        this.scene;
        this.renderer;
        this.factor = factor;
        this.ClipNavigation = null;
        this.workers = new WorkerHandler();
        initSharing(this);
        this.debugMode = game.settings.get("levels-3d-preview", "debugMode");
        this.CONFIG = {
            PARTICLE_SYSTEMS,
            useMultithreading: true,
            entityClass: {
                RangeFinder,
                Template3D,
                Ruler3D,
                Light3D,
                Wall3D,
                Token3D,
                Note3D,
                Grid3D,
                Cursors3D,
                Particle3D,
                ParticleEngine,
                turnStartMarker,
                Tile3D,
                Ping,
                ActiveEffectEffect,
                RangeRingEffect,
                CutsceneEngine,
                ProceduralVines,
            },
            INTERACTIONS: {
                dropFunctions,
            },
            THREEUTILS: {
                DecalGeometry,
            },
            LOADERS: {
                GLTFLoader,
            },
            shaders: {
                ShaderHandler,
                shaders,
            },
            UI: {
                BUILD_PANEL: {
                    FORCE_AUTOHIDE_OFF: false,
                },
                CLIP_NAVIGATION: {
                    BUTTONS: CLIP_NAVIGATION_BUTTONS,
                },
                windows: {},
            },
            RULER: {
                RULER_SIZE: 0.002,
            },
            PADDING_PRESETS: {
                matpaper: { texture: "modules/canvas3dcompendium/assets/Materials/Paper003/Paper003_NormalGL.webp", color: "#341f0f", repeat: 1 },
                matwood: { texture: "modules/canvas3dcompendium/assets/Materials/_Stylized2/Wood_05/Wood_05_NormalGL.webp", color: "#ffffff", repeat: 0.5 },
                matcloth: { texture: "modules/canvas3dcompendium/assets/Materials/Fabric023/Fabric023_NormalGL.webp", color: "#ffffff", repeat: 1 },
                matblueprint: { texture: "modules/canvas3dcompendium/assets/Materials/_Stylized2/Glass_02/Glass_02_NormalGL.webp", color: "#ffffff", repeat: 1 },
            },
            autoPan: false,
            tokenAnimations: defaultTokenAnimations,
            skybox: {
                sky: "modules/levels-3d-preview/assets/skybox/humble/humble_bk.jpg",
                exr: "modules/levels-3d-preview/assets/skybox/venice_sunrise_1k.exr",
            },
            bokeh: {
                off: null,
                low: {
                    focus: 1.0,
                    aperture: 0.0025,
                    maxblur: 0.002,
                },
                medium: {
                    focus: 1.0,
                    aperture: 0.0035,
                    maxblur: 0.005,
                },
                high: {
                    focus: 1.0,
                    aperture: 0.0025,
                    maxblur: 0.003,
                },
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
            ],
            models: {
                targetIndicator: "modules/levels-3d-preview/assets/targetIndicator.glb",
                effect: "modules/levels-3d-preview/assets/effect.glb",
            },
            textures: {
                reticule: "modules/levels-3d-preview/assets/animatedreticule.webm",
            },
        };
        this.UTILS = {
            autoMergeTiles,
            unmergeTiles,
            debouncedReload: debounce(this.reload.bind(this), 300),
            throttle,
            splitToChunks,
            extractPointsFromDrawing,
            extrudeWalls,
            TEXTURES: {
                BLANK: new THREE.TextureLoader().load("modules/levels-3d-preview/assets/blankTex.jpg"),
            },
            NOISE: {
                ImprovedNoise,
            }
        };

        Hooks.callAll("3DCanvasConfig", this.CONFIG);
        for (let [k, v] of Object.entries(this.CONFIG.tokenAnimations)) {
            v.name = game.i18n.localize(`levels3dpreview.tokenAnimations.${k}`);
        }
        initTemplateEffects();
        this.setAutopan();
        this.tokens = {};
        this.rangeFinders = [];
        this.loadingTokens = {};
        this.lights = {
            sceneLights: {},
            lightCache: {
                point: [],
                spot: [],
            },
            _lightIndex: 0,
        };
        this.walls = {};
        this.doors = {};
        this.tiles = {};
        this.templates = {};
        this.notes = {};
        this.pings = new Set();
        this.models = {
            target: new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 32)),
        };
        this.textures = {
            template: new THREE.TextureLoader().load("icons/svg/explosion.svg"),
            lightOn: new THREE.TextureLoader().load("icons/svg/light.svg"),
            lightOff: new THREE.TextureLoader().load("icons/svg/light-off.svg"),
            indicator: {
                //aoRM: new THREE.TextureLoader().load("modules/levels-3d-preview/assets/DefaultMaterial_occlusionRoughnessMetallic.png"),
                normal: new THREE.TextureLoader().load("modules/levels-3d-preview/assets/DefaultMaterial_normal.webp", (texture) => {
                    texture.repeat = new THREE.Vector2(4, 4);
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                }),
            },
        };
        this.effectsCache = {};
        this.targetTextures = {};
        this.Classes = {
            Template3D: Template3D,
        };
        this.animationMixers = [];
        this.clock = new THREE.Clock();
        this.loader = new this.CONFIG.LOADERS.GLTFLoader();
        this.FBXLoader = new FBXLoader();
        this._active = false;
        this._ready = false;
        this.tokenAnimationQueue = [];
        this._cameraSet = false;
        this.helpers = new Helpers();
        OutlineHandler.setHooks();
        this.socket.register("socketCamera", this.helpers.socketCamera);
        this.socket.register("syncClipNavigator", this.helpers.syncClipNavigator);
        this.socket.register("playTokenAnimationSocket", this.helpers.playTokenAnimationSocket);
        this.socket.register("dispatchPing", this.helpers.dispatchPing);
        this.socket.register("playCutscene", this.cutsceneSocket)
        this.exporter = new Exporter(this);
        this.init3d();
    }

    get hasFocus() {
        return document.activeElement.classList.contains("vtt");
    }

    init3d() {
        this._sharedContext = game.settings.get("levels-3d-preview", "sharedContext");
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 100);
        this.camera.position.set(8, 2, 8).setLength(8);
        this.camera.zoom = 1;
        this.camera.updateProjectionMatrix();

        this.scene = new THREE.Scene();
        this.material = new THREE.MeshNormalMaterial();

        this.renderer = this._sharedContext ? new THREE.WebGLRenderer({ context: canvas.app.renderer.context.gl }) : new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setAnimationLoop(this.animation.bind(this));
        this.renderer.shadowMap.enabled = true;
        this.renderer.outputEncoding = THREE.sRGBEncoding;

        const pixelRatio = game.settings.get("core", "pixelRatioResolutionScaling") ? window.devicePixelRatio : 1;

        this.resolutionMulti = pixelRatio * game.settings.get("levels-3d-preview", "resolutionMultiplier"); //game.settings.get("levels-3d-preview", "resolution") *

        this.renderer.setPixelRatio(this.resolutionMulti);
        this.renderer.alpha = false;
        this.renderer.setClearColor(0x999999, 1);
        this.renderer.shadowMap.type = game.settings.get("levels-3d-preview", "softShadows") ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

        this.renderer.debug.checkShaderErrors = true;

        //composer

        let target;
        if (this.renderer.capabilities.isWebGL2) {
            target = new THREE.WebGLMultisampleRenderTarget(window.innerWidth, window.innerHeight, {
                //use WebGLRenderTarget for 150
                format: THREE.RGBAFormat,
                encoding: THREE.sRGBEncoding,
            });
            target.samples = 8;
        }

        this.composer = new EffectComposer(this.renderer, target);
        this.composer.setPixelRatio(this.resolutionMulti);
        this.composer.setSize(window.innerWidth, window.innerHeight);
        //set dom element id
        this.renderer.domElement.id = "levels3d";
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.listenToKeyEvents(document);
        this.controls.keyPanSpeed = 35;
        game.settings.get("levels-3d-preview", "cameralockzero") && this.controls.addEventListener("change", this._onCameraChange.bind(this));
        this.ruler = new Ruler3D(this);
        this.interactionManager = new InteractionManager(this);
        this.interactionManager.activateListeners();
        this.cursors = new Cursors3D(this);
        this.cutsceneEngine = new CutsceneEngine(this);

        this.GameCamera = new GameCamera(this.camera, this.controls, this);
        //clipping
        this.renderer.localClippingEnabled = true;

    }
    
    async cacheModels() {
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();
        this.presetMaterialHandler = new PresetMaterialHandler(this.CONFIG.presetMaterials);
        this.models.target = await (await this.helpers.loadModel(this.CONFIG.models.targetIndicator)).model;
        this.models.target.children[0].material = new THREE.MeshBasicMaterial();
        this.models.effect = await (await this.helpers.loadModel(this.CONFIG.models.effect)).model;
        const box3 = new THREE.Box3().setFromObject(this.models.effect);
        //scale model to make it 1x1x1
        this.models.effect.scale.multiplyScalar(1 / Math.max(box3.max.x - box3.min.x, box3.max.y - box3.min.y, box3.max.z - box3.min.z));
        //load targeting reticule
        const tex = await this.helpers.loadTexture(this.CONFIG.textures.reticule);
        const reticule = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: tex,
                alphaTest: 0.9,
                color: game.user.color,
                depthWrite: false,
                depthTest: false,
            }),
        );
        //set reticule to be always in front of camera
        reticule.renderOrder = 1e20;

        this.models.reticule = reticule;
        this._init = true;
    }

    get canvasCenter() {
        return new THREE.Vector3(canvas.dimensions.width / 2 / this.factor, 0, canvas.dimensions.height / 2 / this.factor);
    }

    initPS() {
        this.particleSystem?.destroy();
        this.particleSystem = new ParticleEngine(this);
    }

    cacheLights(cacheSize) {
        this.lights.lightCache.point = [];
        this.lights.lightCache.spot = [];

        cacheSize = cacheSize ?? game.settings.get("levels-3d-preview", "lightCacheSize");
        
        if (!game.user.isGM) cacheSize = Math.min(cacheSize, 4)
        
        for (let i = 0; i < cacheSize; i++) {
            const pointLight = new THREE.PointLight(0xffffff, 0.0001, 0.0001, 2);
            pointLight.position.set(-100, -100, -100);
            this.lights.lightCache.point.push(pointLight);
            this.scene.add(pointLight);
        }

        for (let i = 0; i < cacheSize / 2; i++) {
            const spotLight = new THREE.SpotLight(0xffffff, 0.0001, 0.0001, 0.5, 0.5, 2);
            spotLight.position.set(-100, -100, -100);
            this.lights.lightCache.spot.push(spotLight);
            this.scene.add(spotLight);
        }
    }

    build3Dscene() {
        $(".levels-3d-preview-loading-screen").fadeIn(300);
        this._fullTransparency = game.settings.get("levels-3d-preview", "fullTransparency");
        this._ready = false;
        this._isFirstFrame = true;
        this._finalizingLoad = false;
        this._envReady = false;
        this._lightsOk = !canvas.scene.getFlag("levels-3d-preview", "bakeLights");
        this.firstPersonMode = false;
        this._prevCameraPos = null;
        this.clear3Dscene();
        this.shaderHandler = new ShaderHandler(this);
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(canvas.scene.backgroundColor ?? 0xffffff);
        this.rangeFinderMode = game.settings.get("levels-3d-preview", "rangeFinder");
        this.composer.removePass(this.renderPass);
        this.composer.removePass(this.bloomPass);
        this.composer.removePass(this.bokeh);
        this.bokeh = null;
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
        this.outline = new OutlineHandler(this);
        this.initAA();
        if (canvas.scene.getFlag("levels-3d-preview", "bloom")) {
            this.bloomPass = this.bloomPass ?? new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
            this.bloomPass.threshold = canvas.scene.getFlag("levels-3d-preview", "bloomThreshold") ?? 0;
            this.bloomPass.strength = canvas.scene.getFlag("levels-3d-preview", "bloomStrength") ?? 0.4;
            this.bloomPass.radius = canvas.scene.getFlag("levels-3d-preview", "bloomRadius") ?? 0.4;
            this.composer.addPass(this.bloomPass);
        }
        if (this.fogExploration) {
            this.fogExploration.destroy();
            this.fogExploration = null;
        }
        if (canvas.scene.tokenVision && (canvas.scene.getFlag("levels-3d-preview", "enableFogOfWar") ?? true)) this.fogExploration = new Fog(this);
        try {
            //this.composer.render();
        } catch {}
        const dofblur = this.CONFIG.bokeh[game.settings.get("levels-3d-preview", "dofblur")];
        if (dofblur) {
            this.bokeh = new BokehPass(this.scene, this.camera, dofblur);
            this.composer.addPass(this.bokeh);
        }
        this._active = true;
        this.particleSystem?.destroy();
        if (this.particleSystem) {
            this.particleSystem._parent = this;
            this.particleSystem.move();
        } else {
            this.particleSystem = new ParticleEngine(this);
        }
        this.transformControls?.dispose();
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.size = 1.4;
        this.controlledGroup = new THREE.Group();
        this.controlledGroup.userData = {
            entity3D: {
                updatePositionFrom3D: () => {
                    game.Levels3DPreview.interactionManager._onTransformEnd();
                },
                mesh: this.controlledGroup,
                elevation3d: 0,
                isTransformControls: true,
                draggable: true,
                embeddedName: "Tile",
                _onClickLeft: (e) => {
                    return this.controlledGroup.children[0]?.userData.entity3D._onClickLeft(e);
                },
                _onClickRight: (e) => {
                    return this.controlledGroup.children[0]?.userData.entity3D._onClickRight(e);
                },
                _onClickLeft2: (e) => {
                    return this.controlledGroup.children[0]?.userData.entity3D._onClickLeft2(e);
                },
                _onClickRight2: (e) => {
                    return this.controlledGroup.children[0]?.userData.entity3D._onClickRight2(e);
                },
            },
        };
        this.scene.add(this.controlledGroup);
        this.scene.add(this.transformControls);
        this.interactionManager.initTransformControls();
        this.object3dSight = canvas.scene.getFlag("levels-3d-preview", "object3dSight") ?? false;
        this.mirrorLevelsVisibility = canvas.scene.getFlag("levels-3d-preview", "mirrorLevels") ?? false;
        this.debugMode = game.settings.get("levels-3d-preview", "debugMode");
        if (this.debugMode) {
            this.scene.overrideMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                wireframe: true,
                transparent: true,
            });
        }
        this.level = Infinity; //this.isLevels ? parseFloat($(CONFIG.Levels.UI?.element)?.find(".level-item.active").find(".level-bottom").val()) ?? Infinity : Infinity;
        if (isNaN(this.level)) this.level = Infinity;
        this.showSun = this.debugMode;
        this.createTemplates();
        const drawFloors = canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") ?? true;
        const drawLights = canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") ?? true;
        this.standUpFaceCamera = game.settings.get("levels-3d-preview", "standupFace") ?? true;
        const enableFog = canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false;
        const fogColor = canvas.scene.getFlag("levels-3d-preview", "fogColor") ?? "#000000";
        const fogDistance = (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) / this.factor;
        this.isLevels && this.createFloors(this.level);
        this.createWalls(this.level);
        this.createSceneLights();
        this.createNotes();
        this.createBoard();
        this.createTable();
        this.cacheLights();
        for (let token of canvas.tokens.placeables) {
            this.addToken(token);
        }
        if (this.debugMode) this.scene.add(new THREE.AxesHelper(3));

        this.grid = new Grid3D(this);

        const size = Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) / this.factor;

        if (enableFog) {
            this.scene.fog = new THREE.Fog(fogColor, 1, fogDistance);
            this.camera.far = fogDistance;
        } else {
            this.camera.far = 100;
        }
        //add raycasting plane

        const dragplane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false }));
        dragplane.position.set(size / 2, 0, size / 2);
        dragplane.userData.isFloor = true;
        dragplane.rotation.x = -Math.PI / 2;
        this.scene.add(dragplane);
        this.interactionManager.dragplane = dragplane;
        this.makeSkybox(enableFog);
        //this.weather = new WeatherSystem(this);
        this.lights.globalIllumination = new GlobalIllumination(this);
        const useTurnMarker = game.settings.get("levels-3d-preview", "startMarker");
        if (useTurnMarker) this.turnStartMarker = new turnStartMarker(this);
        if (!this._cameraSet) {
            this.resetCamera();
            this._cameraSet = true;
        }
        this.GameCamera.init();
        this.interactionManager._cacheKeybinds();
        this.interactionManager.initGroupSelect();
    }

    setFog() {
        const enableFog = canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false;
        const fogColor = canvas.scene.getFlag("levels-3d-preview", "fogColor") ?? "#000000";
        const fogDistance = (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) / this.factor;
        this.scene.background = enableFog ? new THREE.Color(fogColor) : new THREE.Color(canvas.scene.backgroundColor ?? 0xffffff);
        if (enableFog) {
            this.scene.fog = new THREE.Fog(fogColor, 1, fogDistance);
            this.camera.far = fogDistance;
        } else {
            this.scene.background = this._sceneBackground;
            this.scene.fog = null;
            this.camera.far = 100;
        }
    }

    initAA() {
        this.aaType = game.settings.get("levels-3d-preview", "antialiasing");

        const antialiasing = {
            fxaa: () => {
                const aa = new ShaderPass(FXAAShader);
                const pixelRatio = this.renderer.getPixelRatio();
                aa.material.uniforms["resolution"].value.x = 1 / (window.innerWidth * pixelRatio);
                aa.material.uniforms["resolution"].value.y = 1 / (window.innerHeight * pixelRatio);
                return aa;
            },
            smaa: () => {
                const pixelRatio = this.renderer.getPixelRatio();
                const aa = new SMAAPass(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
                return aa;
            },
        };

        this.composer.removePass(this.aaShader);
        if (this.aaType == "none") return;
        this.aaShader = antialiasing[this.aaType]();
        this.composer.addPass(this.aaShader);
    }

    setBloom() {
        if (!canvas.scene.getFlag("levels-3d-preview", "bloom")) return;
        this.bloomPass.threshold = canvas.scene.getFlag("levels-3d-preview", "bloomThreshold") ?? 0;
        this.bloomPass.strength = canvas.scene.getFlag("levels-3d-preview", "bloomStrength") ?? 0.4;
        this.bloomPass.radius = canvas.scene.getFlag("levels-3d-preview", "bloomRadius") ?? 0.4;
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
        if (!(canvas.scene.getFlag("levels-3d-preview", "renderBackground") ?? true)) return;
        //make a plane and apply a texture
        const width = canvas.scene.dimensions.sceneWidth / this.factor;
        const height = canvas.scene.dimensions.sceneHeight / this.factor;
        const center = this.canvasCenter;
        const depth = 0.02;
        const texture = await this.helpers.loadTexture(canvas.scene.background.src, { linear: false });
        if (texture) {
            texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        }
        const geometry = new THREE.BoxGeometry(width, depth, height);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 1,
            metalness: 0,
        });
        const plane = new THREE.Mesh(geometry, material);
        plane.receiveShadow = true;
        plane.castShadow = true;
        const offsetX = -canvas.scene.background.offsetX / this.factor;
        const offsetY = -canvas.scene.background.offsetY / this.factor;
        plane.position.set(center.x + offsetX, center.y - depth / 2 - 0.00001 + Ruler3D.unitsToPixels(canvas.primary.background.elevation), center.z + offsetY);
        //plane.rotation.x = -Math.PI / 2;
        this.board = plane;
        plane.userData.isBackground = true;
        if (canvas.scene.grid.type > 0)
            this.shaderHandler.applyShader(
                this.board,
                {
                    bb: { depth: height, width: width, height: depth },
                    mesh: this.board,
                },
                { grid: { enabled: true } },
            );
        this.scene.add(plane);
    }

    async createTable() {
        this.scene.remove(this.table);
        const tableOption = canvas.scene.getFlag("levels-3d-preview", "renderTable") ?? game.settings.get("levels-3d-preview", "paddingAppearance");
        const tableTex = canvas.scene.getFlag("levels-3d-preview", "tableTex") ?? "";
        if (tableOption == "none" || !tableOption) return;
        //make a plane and apply a texture
        const isMat = tableOption.includes("mat")
        const width = isMat ? 1000 : canvas.scene.dimensions.width / this.factor;
        const height = isMat ? 1000 : canvas.scene.dimensions.height / this.factor;
        const center = this.canvasCenter;
        const depth = isMat ? 0.1 : Math.max(width, height) / 10;
        const preset = this.CONFIG.PADDING_PRESETS[tableOption] ?? {};
        const textureMat = await this.helpers.autodetectTextureOrMaterial(preset.texture ?? tableTex);
        const geometry = new THREE.BoxGeometry(width, depth, height);
        let uvAttribute = geometry.attributes.uv;
        const repeat = preset.repeat ?? 1;
        for (let i = 0; i < uvAttribute.count; i++) {
            let u = uvAttribute.getX(i);
            let v = uvAttribute.getY(i);
            u *= repeat * Math.round((width / canvas.scene.dimensions.size) * this.factor) / 10;
            v *= repeat * Math.round((height / canvas.scene.dimensions.size) * this.factor) / 10;
            uvAttribute.setXY(i, u, v);
        }
        if (textureMat.image) {
            textureMat.wrapS = THREE.RepeatWrapping;
            textureMat.wrapT = THREE.RepeatWrapping;
        }
        const material = textureMat.isTexture
            ? new THREE.MeshStandardMaterial({
                  map: textureMat,
                  roughness: 1,
                  metalness: 0,
              })
            : textureMat;
        const color = preset.color ?? canvas.scene.getFlag("levels-3d-preview", "tableColor") ?? "#341f0f";
        material.color = new THREE.Color(color);
        const plane = new THREE.Mesh(geometry, material);
        plane.receiveShadow = true;
        plane.position.set(center.x, center.y - (depth / 2 + 0.011) + Ruler3D.unitsToPixels(canvas.primary.background.elevation), center.z);
        this.table = plane;
        this.table.renderOrder = -1e20;
        this.table.material.polygonOffset = true;
        this.table.material.polygonOffsetFactor = 10;
        if (canvas.scene.grid.type > 0)
            this.shaderHandler.applyShader(
                this.table,
                {
                    bb: { depth: height, width: width, height: depth },
                    mesh: this.table,
                },
                { grid: { enabled: true, showBounds:true } },
            );
        this.scene.add(plane);
    }

    createSceneLights() {
        for (let light of canvas.lighting.placeables) {
            this.addLight(light);
        }
    }

    addLight(light) {
        this.lights.sceneLights[light.id]?.destroy();
        if (!(canvas.scene.getFlag("levels-3d-preview", "renderSceneLights") ?? true)) return;
        const light3d = new Light3D(light, this);
        this.lights.sceneLights[light.id] = light3d;
    }

    createFloors() {
        for (let tile of canvas.tiles.placeables) {
            if (this.isLevels) {
                const bottom = tile.document.flags.levels?.rangeBottom ?? -Infinity;
                if (bottom > this.level) continue;
            }
            this.createTile(tile);

            if (!this.debugMode) continue;
            if (!tile.roomPoly) continue;
            const top = tile.document.getFlag("levels", "rangeTop") ?? undefined;
            const bottom = tile.document.getFlag("levels", "rangeBottom") ?? undefined;
            if (bottom > this.level) continue;
            if (top !== undefined) this.scene.add(this.createFloor(tile.roomPoly.points, top));
            if (bottom !== undefined) this.scene.add(this.createFloor(tile.roomPoly.points, bottom));
        }
    }

    createTile(tile) {
        if (this.debugMode || canvas.scene.getFlag("levels-3d-preview", "showSceneFloors") === false) return;
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
                const bottom = wall.document.flags.wallHeight?.wallHeightBottom ?? -Infinity;
                if (bottom > this.level) continue;
            }
            this.createWall(wall);
        }
    }

    createWall(wall) {
        this.walls[wall.id] = new Wall3D(wall, this);
        if (wall.document.door) this.doors[wall.id] = this.walls[wall.id];
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

    setExposure() {
        const timeSync = canvas.scene.getFlag("levels-3d-preview", "timeSync") ?? "off";
        if (timeSync == "off" || timeSync == "time") {
            const exposure = canvas.scene.getFlag("levels-3d-preview", "exposure") ?? 1;
            this.renderer.toneMappingExposure = exposure;
        }
    }

    makeSkybox(enableFog) {
        this.setExposure();
        try {
            this.scene.background?.dispose?.();
            this.scene.environment?.dispose?.();
            this.scene.userData.envRt?.dispose?.();
            this.scene.background = enableFog ? this.scene.fog.color : new THREE.Color(canvas.scene.backgroundColor ?? 0xffffff);
            this.scene.environment = null;
            this.isEXR = false;
            this.scene.remove(this.skybox);
            const sceneSize = Math.max(canvas.scene.dimensions.width, canvas.scene.dimensions.height) / 100;
            const size = sceneSize < 80 ? 80 : sceneSize;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            const rootImage = canvas.scene.getFlag("levels-3d-preview", "skybox") ?? this.CONFIG.skybox.sky;
            const exr = canvas.scene.getFlag("levels-3d-preview", "exr") ?? this.CONFIG.skybox.exr;
            if (exr) this.loadEXR(exr, enableFog);
            if (!rootImage && !exr) this._envReady = true;
            if (!rootImage) {
                return;
            }
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
                        map: new THREE.TextureLoader().load(rootImage.replace(currSuffix, suffix)),
                        side: THREE.BackSide,
                    }),
                );
            }
            const loader = new THREE.CubeTextureLoader();
            const textureCube = loader.load(textureArray);
            textureCube.encoding = THREE.sRGBEncoding;
            if (!enableFog) this.scene.background = textureCube;
            this._sceneBackground = textureCube;
            if (!exr) {
                this.scene.environment = textureCube;
                this._envReady = true;
            }
        } catch (e) {
            ui.notifications.error("Error loading skybox");
            this._envReady = true;
        }
    }

    loadEXR(rootImage, enableFog) {
        this.isEXR = true;
        const _this = this;
        if (rootImage.toLowerCase().endsWith(".exr")) {
            new EXRLoader().setDataType(THREE.FloatType).load(rootImage, onLoaded);
        } else {
            this.helpers.loadTexture(rootImage).then(onLoaded);
            //new THREE.TextureLoader().load(rootImage, onLoaded);
        }

        function onLoaded(texture) {
            try {
                let exrCubeRenderTarget = _this.pmremGenerator.fromEquirectangular(texture);
                let newEnvMap = exrCubeRenderTarget ? exrCubeRenderTarget.texture : null;
                _this.scene.environment = newEnvMap;
                let background;
                if (_this.scene.background instanceof THREE.Color && !enableFog) {
                    const rt = new THREE.WebGLCubeRenderTarget(Math.min(1 << (31 - Math.clz32(texture.image.width)), _this.renderer.capabilities.maxTextureSize));
                    rt.fromEquirectangularTexture(_this.renderer, texture);
                    background = rt.texture;
                    _this.scene.background = background;
                    _this._sceneBackground = background;
                    _this.scene.userData.envRt = rt;
                }
                _this._envReady = true;
            } catch (error) {
                ui.notifications.error(`Error loading Skybox ${rootImage}`);
                _this._envReady = true;
            }
        }
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
        this.workers.clearMeshes();
        this.scene.background?.dispose?.();
        this.scene.environment?.dispose?.();
        this.scene.userData.envRt?.dispose?.();
        Object.values(this.tiles).forEach((tile) => {
            tile?.destroy();
        });
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
        this.lights._lightIndex = 0;
        this.tiles = {};
        this.notes = {};
        this.templates = {};
        this.cursors.clear();
    }

    resizeCanvasToDisplaySize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.composer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        if (this.aaType == "fxaa") {
            const pixelRatio = this.renderer.getPixelRatio();
            this.aaShader.material.uniforms["resolution"].value.x = 1 / (width * pixelRatio);
            this.aaShader.material.uniforms["resolution"].value.y = 1 / (height * pixelRatio);
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
            hud.element[0].style.height = "auto";
            const tile3D = this.tiles[hud.object.id];
            if (!tile3D || !tile3D.mesh) return;
            const center = tile3D.center;
            Ruler3D.centerElement(hud.element, center);
        }
    }

    allignChatBubbles() {
        const bubbles = document.querySelectorAll(".chat-bubble");
        bubbles.forEach((bubble) => {
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

    getSoundFrequency() {
        const sound = Array.from(game.audio.playing.values())[0];
        if (sound && sound == this._sound && this._analyser) {
            this._analyser.node.getByteFrequencyData(this._analyser.data);
            let bass = 0,
                mid = 0;
            const length = this._analyser.data.length;
            for (let i = 0; i < length; i++) {
                if (i < 20) {
                    bass += this._analyser.data[i];
                } else if (i < 40) {
                    mid += this._analyser.data[i];
                }
            }
            bass /= 20;
            mid /= 20;
            //return new THREE.Vector3(1 + mid/255,1 + bass/255,1 + mid/255);
            return new THREE.Vector3(1 + bass / 255, 1 + mid / 255, 1 + bass / 255);
            //return new THREE.Vector3(1 + bass/255,1 + mid/255,1 + treble/255);
        }
        this._sound = sound;
        if (!sound) return new THREE.Vector3(1, 1, 1);
        const {
            container: { sourceNode },
            context,
            id,
        } = sound;
        const analyserNode = new AnalyserNode(context, { fftSize: 4096 });
        sourceNode.connect(analyserNode);
        this._analyser = {
            node: analyserNode,
            data: new Uint8Array(40),
        };
        return new THREE.Vector3(1, 1, 1);
    }

    toggleFirstPerson() {
        if (!this.firstPersonMode && !canvas.tokens.controlled.length) return;

        if (!this.firstPersonMode) {
            this._prevGameCameraState = this.GameCamera.enabled;
            this._prevCameraPos = {
                camera: this.camera.position.clone(),
                controls: this.controls.target.clone(),
            };
        } else {
            if (this._prevCameraPos) {
                this.camera.position.copy(this._prevCameraPos.camera);
                this.controls.target.copy(this._prevCameraPos.controls);
            }
            if (this._prevGameCameraState === true) this.GameCamera.toggle();
            delete this._prevCameraPos;
            delete this._prevGameCameraState;
        }
        this.firstPersonMode = !this.firstPersonMode;
        this.camera.near = this.firstPersonMode ? 0.05 : 0.01;
        if (this.GameCamera.enabled && this.firstPersonMode) this.GameCamera.toggle();
    }

    animation(time) {
        try {
            if (!this._active) return;
            if (!this._ready) return this._onProgress();
            if (this._sharedContext) {
                //canvas.app.renderer.reset();
                this.renderer.resetState();
            }
            if (this.fogExploration) {
                const shaderCount = Object.values(this.materialProgramCache).length;
                if (shaderCount != this.fogExploration._shaderCount) {
                    this.fogExploration._shaderCount = shaderCount;
                    this.fogExploration.updateShaders();
                }
            }
            if (this.bokeh) {
                const dist = this.interactionManager.findCameraLookatDistance();
                this.bokeh.uniforms.focus.value = dist;
            }
            this.grid?.updateGrid();
            const tokensArray = Object.values(this.tokens);
            const length = Math.max(tokensArray.length, 100);
            const tokenPositionsArray = [new THREE.Vector4(0, 0, 0, tokensArray.length)];
            const emptyVec = new THREE.Vector4();
            for (let i = 1; i < length; i++) {
                const pos = tokensArray[i - 1]?.mesh?.position;
                if (!pos) {
                    tokenPositionsArray[i] = emptyVec;
                    continue;
                }
                tokenPositionsArray[i] = new THREE.Vector4(pos.x, pos.y, pos.z, tokensArray[i - 1]._shaderSize);
            }
            const sound = this.getSoundFrequency();
            this.shaderHandler.updateShaders(time, tokenPositionsArray, sound);
            this.interactionManager._canMouseMove = true;
            this.interactionManager.dragObject();
            this.cursors.update();
            const delta = this.clock.getDelta();
            if (this.models?.reticule?.material) this.models.reticule.material.rotation += delta * 0.05;
            tokensArray.forEach((token) => {
                if (token) {
                    token.updateVisibility();
                    token.updateProne(delta);
                    token.rotateEffects(delta);
                    token.light?.update(time);
                    if (token.mixer) {
                        token.mixer.update(delta);
                    }
                    if (token.standUp && token.standupFace) {
                        token.faceCamera();
                    }
                }
            });
            Object.values(this.tiles).forEach((tile) => {
                if (tile) {
                    tile.updateVisibility(time);
                    if (tile.mixer && !tile.paused) {
                        tile.mixer.update(delta);
                    }
                }
            });
            if (this.mirrorLevelsVisibility) {
                Object.values(this.walls).forEach((wall) => {
                    wall.updateVisibility();
                });
            }
            Object.values(this.lights.sceneLights).forEach((light) => {
                light.updateHandle();
                light.update(time);
            });
            Object.values(this.notes).forEach((note) => {
                note.updateVisibility();
            });
            this.rangeFinders.forEach((rangeFinder) => {
                rangeFinder.updateText();
            });
            this.particleSystem.update(delta);
            this.cutsceneEngine.update(delta);
            this.checkInFog();
            this.animateCamera(delta);
            this.centerHUD();
            document.querySelectorAll("#levels3d-ruler-text.scrolling-text").forEach((e) => {
                const t3d = this.tokens[e.dataset.tokenid];
                if (t3d) this.helpers.ruler3d.centerElement(e, t3d.head);
            });
            this.allignChatBubbles();
            this.lights?.globalIllumination?.update(delta);
            this.weather?.update(delta);
            this.GameCamera.update(delta);
            this.pings.forEach((ping) => {
                ping.update(delta);
            });
            this.controls.update();
            if (this.firstPersonMode) {
                let controlled = canvas.tokens.controlled[0];
                if (!controlled && _token?.scene == canvas.scene) {
                    _token.control({ releaseOthers: true });
                    controlled = _token;
                }
                if (controlled) {
                    updateTokenRotationCameraThrottle(controlled);
                    const token3d = this.tokens[controlled.id];
                    if (token3d) {
                        const pos = token3d.headFast;
                        this.camera.position.set(pos.x, pos.y, pos.z);
                    }
                }
            }
            this.recoverCamera();
            //this.fogExploration?.update();
            const visibilityCache = {};
            if (this.outline._enabled)
                this.scene.traverse((o) => {
                    visibilityCache[o.uuid] = o.visible;
                });
            this.composer.render(time);
            if (this._firstFrame) {
                this._firstFrame = false;
                this.resizeCanvasToDisplaySize()
                recomputeGravity();
                Object.values(this.tokens).forEach((token) => {
                    token.forceDrawBars();
                    token.drawName();
                });
                setTimeout(() => {
                    Object.values(this.tokens).forEach((token) => {
                        token.forceDrawBars();
                        token.drawName();
                    });
                }, 100);
            }
            if (this._sharedContext) {
                canvas.app.renderer.reset();
                //this.renderer.resetState();
            }
            if (this.outline._enabled)
                this.scene.traverse((o) => {
                    o.visible = visibilityCache[o.uuid];
                });
        } catch (error) {
            this._errCount++;
            console.error("3D Canvas: An Error Occured in the Rendering Loop", error);
            if (this._errCount > 200) {
                this._errCount = 0;
                ui.notifications.error(game.i18n.localize("levels3dpreview.errors.critical"));
                this.reload();
            }
        }
    }

    recoverCamera() {
        const cameraControlsValues = [this.camera.position.x, this.camera.position.y, this.camera.position.z, this.controls.target.x, this.controls.target.y, this.controls.target.z];
        if (cameraControlsValues.some((v) => isNaN(v))) {
            ui.notifications.error("3D Canvas | Camera Error: Camera position or target is NaN. Resetting camera.");
            this.resetCamera();
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
        centerPosition.y = Ruler3D.unitsToPixels(canvas.primary.background.elevation);
        const groundPosition = this.camera.position.clone();
        groundPosition.y = Ruler3D.unitsToPixels(canvas.primary.background.elevation);
        const d = centerPosition.distanceTo(groundPosition);

        const origin = new THREE.Vector2(this.controls.target.y - 0.05, 0);
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
        if (this.firstPersonMode) return;
        if (this._animateCameraTarget.cameraPosition !== undefined) {
            const targetPos = this._animateCameraTarget.cameraPosition.clone();
            this.camera.position.lerp(targetPos, this._animateCameraTarget.speed ?? 0.04);
            if (this.camera.position.distanceTo(targetPos) < 0.001) {
                this._animateCameraTarget.cameraPosition = undefined;
            }
        }
        if (this._animateCameraTarget.cameraLookat !== undefined) {
            const targetLookat = this._animateCameraTarget.cameraLookat.clone();
            const currentLookat = this._animateCameraTarget.currentLookat ?? this.controls.target.clone();
            const lerpLookat = currentLookat.lerp(targetLookat, (this._animateCameraTarget.speed ?? 0.04) + 0.001);
            this._animateCameraTarget.currentLookat = lerpLookat.clone();

            this.controls.target.set(lerpLookat.x, lerpLookat.y, lerpLookat.z);
            if (lerpLookat.distanceTo(targetLookat) < 0.00001) {
                this.controls.target.set(targetLookat.x, targetLookat.y, targetLookat.z);
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
        this.stopCameraAnimation();
        this.controls.reset();
        if (!this.GameCamera.enabled) {
            this.controls.maxDistance = 20;
            this.controls.minDistance = 0.1;
            this.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
        }
        this.controls.enableDamping = game.settings.get("levels-3d-preview", "enabledamping"); //true;
        this.controls.dampingFactor = 0.1;

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
        const initialPos = canvas.scene.getFlag("levels-3d-preview", "initialPosition");
        if (!initialPos) return false;
        this.camera.position.set(initialPos.position.x, initialPos.position.y, initialPos.position.z);
        this.controls.target.set(initialPos.target.x, initialPos.target.y, initialPos.target.z);
        this.camera.lookAt(initialPos.target);
        if (!!initialPos.firstPersonMode && !canvas.tokens.controlled[0]) canvas.tokens.ownedTokens[0]?.control();
        if (!!initialPos.firstPersonMode !== this.firstPersonMode) this.toggleFirstPerson();
        return true;
    }

    setCameraToControlled(token) {
        let cToken, token3D;
        if (!(token instanceof Token3D) && !token?.userData?.original) {
            cToken = token ?? canvas.tokens.controlled[0];
            if (!cToken && !game.user.isGM) {
                cToken = canvas.tokens.placeables.find((t) => t.isOwner);
            }
            if (!cToken) return;
            if (cToken.isOwner) cToken.control();
            this.ClipNavigation.setToClosest(cToken.document.elevation);
            token3D = this.tokens[cToken.id];
            if (!token3D) return;
        } else {
            token3D = token;
            cToken = token3D.token;
        }

        let oldCameraData;

        if (this._animateCameraTarget.cameraLookat) {
            oldCameraData = {
                cameraPosition: this.camera.position.clone(),
                cameraLookat: this.controls.target.clone(),
            };
            if (this._animateCameraTarget.cameraPosition && this._animateCameraTarget.cameraLookat && this._animateCameraTarget.cameraLookat) {
                this.camera.position.copy(this._animateCameraTarget.cameraPosition);
                this.controls.target.copy(this._animateCameraTarget.cameraLookat);
                this.camera.lookAt(this._animateCameraTarget.cameraLookat);
            }
        }

        const targetLookat = token3D.head.clone();
        this._animateCameraTarget.cameraLookat = targetLookat;

        const cameraPosition = this.camera.position.clone();
        const diff = this.controls.target.clone().sub(targetLookat.clone());
        let targetPosition = cameraPosition.sub(diff);

        const headPoint = token3D.head;
        let collision;
        if (!this.GameCamera.enabled) {
            collision = this.interactionManager.computeSightCollisionFrom3DPositions(headPoint, targetPosition);
        }

        if (collision && targetPosition.y < (this.ClipNavigation._clipHeight ?? Infinity)) {
            const collisionPoint = new THREE.Vector3(collision.x, collision.y, collision.z);
            collisionPoint.lerp(headPoint, 0.1);
            targetPosition = collisionPoint;
        }

        this._animateCameraTarget.cameraPosition = targetPosition;

        if (oldCameraData) {
            this.camera.position.copy(oldCameraData.cameraPosition);
            this.controls.target.copy(oldCameraData.cameraLookat);
            this.camera.lookAt(oldCameraData.cameraLookat);
        }
    }

    _onProgress() {
        const tokenArray = Object.values(this.loadingTokens);
        const tileArray = Object.values(this.loadingTiles);
        const total = tokenArray.length + tileArray.length;
        const loaded = tokenArray.filter((token) => token._loaded).length + tileArray.filter((tile) => tile._loaded).length;
        let progress = total === 0 ? 100 : Math.round((loaded / total) * 100);
        if (!this._finalizingLoad) {
            if (total === loaded) this._progressText = game.i18n.localize("levels3dpreview.controls.loading.env");
            else this._progressText = game.i18n.localize("levels3dpreview.controls.loading.load");
        }
        if (total === loaded && this._envReady) {
            if (!this._finalizingLoad) {
                this._finalizingLoad = true;
                this._progressText = game.i18n.localize("levels3dpreview.controls.loading.gravity");
                this.interactionManager.forceSightCollisions();
                this._progressText = game.i18n.localize("levels3dpreview.controls.loading.shaders");
                this.renderer.compile(this.scene, this.camera);
                this._ready = true;
                this._firstFrame = true;
                this.loadingTokens = {};
                this.loadingTiles = {};
                this._onReady();
                setTimeout(() => {
                    Object.values(this.tokens).forEach((token) => {
                        token.forceDrawBars();
                        token.drawName();
                    });
                }, 10);
                setTimeout(() => {
                    Object.values(this.tokens).forEach((token) => {
                        token.forceDrawBars();
                        token.drawName();
                    });
                }, 200);
            }
        }
        this.setProgressBar(this._progressText, progress);
    }

    setProgressBar(label, progress) {
        $("#levels-3d-preview-loading-bar").show();
        $("#close-loading-screen").css("display", "none");
        const progressBar = $("#levels-3d-preview-loading-bar-inner");
        const labelText = $("#levels-3d-preview-loading-bar-text");
        progressBar.css("width", `${progress}%`);
        labelText.text(label);
    }

    _onReady() {
        if (game.settings.get("levels-3d-preview", "loadingShown")) {
            $(".levels-3d-preview-loading-screen").fadeOut(200, () => {
                $("#levels-3d-preview-loading-bar-inner").css("width", `0%`);
            });
        } else {
            this.CONFIG.UI.BUILD_PANEL.FORCE_AUTOHIDE_OFF = true;
            Hooks.once("renderClipNavigation", () => {
                const isClipNav = $("#clip-navigation-controls").length > 0;
                setTimeout(
                    () => {
                        const $qm = $("#clip-navigation-controls").length ? $("#clip-navigation-controls") : $("#build-panel");
                        $("#levels-3d-preview-loading-bar-text").html(game.i18n.localize("levels3dpreview.controls.loadingScreen.loadingdone"));
                        const $arrow = $('<i id="clip-navigation-higlight-arrow" class="fas fa-arrow-right"></i>').css({
                            right: window.innerWidth - $qm.offset().left + 20,
                            top: `calc(${$qm.offset().top + $qm.height() / 2}px - 2rem)`,
                        });
                        $("body").append($arrow);
                        $("#close-loading-screen").css("display", "flex");
                        ui.notifications.info(game.i18n.localize("levels3dpreview.controls.loadingScreen.loadingarrow"));
                    },
                    isClipNav ? 0 : 1000,
                );
            });
            game.settings.set("levels-3d-preview", "loadingShown", true);
        }
        this.ClipNavigation = new ClipNavigation();
        this.ClipNavigation.render(true);
        this.weather = new WeatherSystem(this);

        canvas.perception.update(
            {
                forceUpdateFog: true,
                initializeLighting: true,
                initializeSounds: true,
                initializeVision: true,
                refreshLighting: true,
                refreshSounds: true,
                refreshTiles: true,
                refreshVision: true,
            },
            true,
        );

        this.setFilters(true);
        setTimeout(() => {
            this.helpers.showSceneReport();
        }, 1000);
        Hooks.callAll("3DCanvasSceneReady", game.Levels3DPreview);
    }

    setFilters(set) {
        const filter = canvas.scene.getFlag("levels-3d-preview", "filter") ?? "none";
        if (set && filter != "none") {
            let filterStrength = canvas.scene.getFlag("levels-3d-preview", "filterStrength");
            const filterCustom = canvas.scene.getFlag("levels-3d-preview", "filterCustom");
            let filterValue = "";
            if (filter == "custom" && filterCustom) {
                filterValue = filterCustom;
            } else {
                if (filter == "hue-rotate") filterStrength = `${filterStrength * 180}deg`;
                filterValue = `${filter}(${filterStrength})`;
            }
            if (this._sharedContext) {
                $("#board").css("filter", filterValue);
            } else {
                $("#levels3d").css("filter", filterValue);
            }
        } else {
            $("#board").css({ filter: "" });
            $("#levels3d").css({ filter: "" });
        }
    }

    toggle(force) {
        Hooks.callAll("3DCanvasToggleMode", force ?? !this._active);
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
        this.setFilters(true);
        if (this._sharedContext) {
            //canvas.app.renderer.reset();
            this.renderer.resetState();
        }
        this.build3Dscene();
        document.body.appendChild(this.renderer.domElement);
        $("#hud").addClass("levels-3d-preview-hud");
        if (this._sharedContext) {
            canvas.stage.renderable = false;
        } else {
            document.body.appendChild(this.renderer.domElement);
            if (game.settings.get("levels-3d-preview", "miniCanvas")) new miniCanvas().render(true);
            else {
                $("#board").hide();
                canvas.stage.renderable = false;
            }
        }
    }

    close() {
        $(".levels-3d-preview-loading-screen").hide();
        this.setFilters(false);
        this._active = false;
        this.ClipNavigation?.close();
        $("#hud").removeClass("levels-3d-preview-hud");
        $("#levels3d").remove();
        $(".rangefinder").remove();
        Object.values(ui.windows)
            ?.find((w) => w.id === "miniCanvas")
            ?.close(true);
        $("#board").show();
        canvas.stage.renderable = true;
        this.clear3Dscene();
        if (this._sharedContext) {
            this.renderer.resetState();
            canvas.app.renderer.reset();
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
            type: "any",
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

    cutsceneSocket({userIds, sceneId, cutsceneId}) {
        if(canvas.scene.id !== sceneId || (userIds?.length && !userIds.includes(game.user.id))) return;
        game.Levels3DPreview.cutsceneEngine.play(cutsceneId)
    }

    particleSocket(...args) {
        game.Levels3DPreview.particleSystem.resolveSocket(...args);
    }
    
    Particle3DStop(...args) {
        game.Levels3DPreview.particleSystem.stop(...args);
    }

    toggleDoor(tileId, sceneId, userId, subDoorId) {
        const user = game.users.get(userId);
        if (!user.can("WALL_DOORS")) return;
        if (game.paused && !game.user.isGM) return ui.notifications.warn("GAME.PausedWarning", { localize: true });
        const scene = game.scenes.get(sceneId);
        if (!scene) return;
        const tile = scene.tiles.get(tileId);
        if (!tile) return;
        if (subDoorId) {
            const ds = tile.getFlag("levels-3d-preview", `modelDoors.${subDoorId}`)?.ds ?? 0;
            const isLocked = ds == 2;

            if (isLocked) return AudioHelper.play({ src: CONFIG.sounds.lock });
            tile.setFlag("levels-3d-preview", `modelDoors.${subDoorId}.ds`, ds == 0 ? "1" : "0");
        } else {
            const ds = tile.getFlag("levels-3d-preview", "doorState") ?? 0;
            const isLocked = ds == 2;

            if (isLocked) return AudioHelper.play({ src: CONFIG.sounds.lock });
            tile.setFlag("levels-3d-preview", "doorState", ds == 0 ? "1" : "0");
        }
    }

    setCursor(cursor) {
        this.renderer.domElement.style.cursor = cursor;
        return;
        if (this._sharedContext) {
            $("body")[0].style.cursor = cursor;
        } else {
            this.renderer.domElement.style.cursor = cursor;
        }
    }
}

Hooks.on("canvasReady", async () => {
    do {
        await sleep(100);
        if (!game.Levels3DPreview || !game.Levels3DPreview?._init) continue;
        if (game.threeportrait && !game.threeportrait._dataReady) continue;
        game.Levels3DPreview._cameraSet = false;
        game.Levels3DPreview.close();
        game.Levels3DPreview.controls.reset();
        const enablePlayers = canvas.scene.getFlag("levels-3d-preview", "enablePlayers");
        const isGM = game.user.isGM;
        if (canvas.scene.getFlag("levels-3d-preview", "auto3d") && (enablePlayers || isGM)) {
            game.Levels3DPreview.open();
        }
    } while (!game.Levels3DPreview || !game.Levels3DPreview?._init);
});

Hooks.on("sightRefresh", () => {
    if (game.Levels3DPreview?._active && game.Levels3DPreview.fogExploration) {
        game.Levels3DPreview.fogExploration.debouncedUpdate(true);
    }
});

Hooks.on("updateScene", (scene, updates) => {
    if (!game.Levels3DPreview?._active || scene.id !== canvas.scene.id) return;
    if ("img" in updates) game.Levels3DPreview.createBoard();
    if ("fogExploration" in updates || "tokenVision" in updates) {
        game.Levels3DPreview.reload();
        return;
    }
    const flags = updates.flags ? updates.flags["levels-3d-preview"] : undefined;
    if (!flags) return;
    if ("object3dSight" in flags) {
        canvas.draw();
        return;
    }
    if(        "enableFog" in flags ||
    "fogColor" in flags ||
    "fogDistance" in flags) game.Levels3DPreview.setFog();
    game.Levels3DPreview.grid.setVisibility();
    if (
        //do reload
        "enableGrid" in flags ||
        "showSceneWalls" in flags ||
        "showSceneFloors" in flags ||
        "renderSceneLights" in flags ||
        "mirrorLevels" in flags ||
        "grid" in updates ||
        "enableFogOfWar" in flags ||
        "bloom" in flags
    ) {
        game.Levels3DPreview.reload();
        return;
    }
    for (let key of Object.keys(flags)) {
        if (key.includes("particle")) {
            game.Levels3DPreview.weather.reload();
            break;
        }
    }
    if ("exr" in flags || "skybox" in flags) game.Levels3DPreview.makeSkybox(canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false);
    if ("filter" in flags || "filterStrength" in flags || "filterCustom" in flags) {
        game.Levels3DPreview.setFilters(true);
    }
    game.Levels3DPreview.setBloom();
    if ("exposure" in flags) game.Levels3DPreview.setExposure();
    if ("renderBackground" in flags && !("img" in updates)) game.Levels3DPreview.createBoard();
    if ("renderTable" in flags || "tableTex" in flags || "tableColor" in flags) game.Levels3DPreview.createTable();
});

Hooks.on("updateCombat", () => {
    if (!game.Levels3DPreview?._active || !game.Levels3DPreview.turnStartMarker) return;
    game.Levels3DPreview.turnStartMarker.update();
});
Hooks.on("createCombat", () => {
    if (!game.Levels3DPreview?._active || !game.Levels3DPreview.turnStartMarker) return;
    game.Levels3DPreview.turnStartMarker.update();
});
Hooks.on("deleteCombat", () => {
    if (!game.Levels3DPreview?._active || !game.Levels3DPreview.turnStartMarker) return;
    game.Levels3DPreview.turnStartMarker.update();
});

Hooks.on("collapseSidebar", () => {
    if (game.Levels3DPreview?._active) game.Levels3DPreview.ClipNavigation.render(true);
});

Hooks.on("controlTile", (tile, control) => {
    if (!game.Levels3DPreview?._active) return;
    const tile3d = game.Levels3DPreview.tiles[tile.id];
    if (!tile3d) return;
    game.Levels3DPreview.interactionManager.setControlledGroup(tile3d, control);
});

$(document).on("keyup", (event) => {
    if (event.key != "Shift" || !game.Levels3DPreview?._active) return;
    const ts = game.Levels3DPreview.transformControls;
    const snapSize = canvas.scene.dimensions.size / factor / 2;
    ts.setTranslationSnap(snapSize);
    ts.setRotationSnap(Math.PI / 4);
    ts.setScaleSnap(snapSize);
});

$(document).on("keydown", (event) => {
    if (event.key != "Shift" || !game.Levels3DPreview?._active) return;
    const ts = game.Levels3DPreview.transformControls;
    ts.setTranslationSnap(undefined);
    ts.setRotationSnap(undefined);
    ts.setScaleSnap(undefined);
});

Hooks.on("preUpdateToken", (token, updates) => {
    if (game.Levels3DPreview?._active && "elevation" in updates) {
        const maxElevation = canvas.scene.getFlag("levels-3d-preview", "maxElevation") ?? 100000;
        if (updates.elevation > maxElevation) {
            ui.notifications.error("levels3dpreview.errors.overmaxelevation", { localize: true });
            return false;
        }
    }
});

Hooks.on("ready", async () => {
    const html = await renderTemplate("modules/levels-3d-preview/templates/loadingScreen.hbs", { isGM: game.user.isGM });
    const div = $(`<div class="levels-3d-preview-loading-screen">${html}</div>`);
    div.on("click", "#close-loading-screen", () => { 
        game.Levels3DPreview.CONFIG.UI.CLIP_NAVIGATION.BUTTONS.find((b) => (b.id === "clip-navigation-controls")).callback();
    });
    div.hide();
    $("#ui-top").after(div);
});

window.addEventListener("resize", () => {
    if (game.Levels3DPreview?._active) {
        game.Levels3DPreview.resizeCanvasToDisplaySize();
        const miniCanvas = Object.values(ui.windows)?.find(w => w.id === "miniCanvas")
        setTimeout(() => {
            if (miniCanvas) miniCanvas.resize()
        }, 100)
        setTimeout(() => game.Levels3DPreview?.resizeCanvasToDisplaySize(), 250);
    }
});

function updateTokenRotationCamera(token) {
    const cPos = game.Levels3DPreview.camera.position;
    const cTar = game.Levels3DPreview.controls.target;

    const angle = Math.atan2(cTar.z - cPos.z, cTar.x - cPos.x);
    token.document.update({ rotation: Math.toDegrees(angle - 90) });
}

const updateTokenRotationCameraThrottle = throttle(updateTokenRotationCamera, 500);

//javascript:(function(){var script=document.createElement('script');script.onload=function(){var stats=new Stats();document.body.appendChild(stats.dom);requestAnimationFrame(function loop(){stats.update();requestAnimationFrame(loop)});};script.src='//mrdoob.github.io/stats.js/build/stats.min.js';document.head.appendChild(script);})()