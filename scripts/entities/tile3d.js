import * as THREE from "three";
import { MersenneTwister } from "../lib/mersenneTwister.js";
import { SimplexNoise, Perlin, FractionalBrownianMotion } from "../lib/noiseFunctions.js";
import * as coords3d from "../helpers/coords3d.js";
import { factor } from "../main.js";
import { DynaMesh } from "../helpers/dynaMesh.js";
import { queueBoundsTree } from "../helpers/boundsQueue.js";
import { elevationFloor } from "../helpers/elevationFloor.js";
import { computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { acceleratedRaycast } from "../three/acceleratedRaycast.js";
import { getMergedMeshFromInstanced, meshesToSingleMesh } from "../helpers/geometryUtils.js";
import { Socket } from "../lib/socket.js";
import { applyLegacyUv, applyLegacyUvMatrix } from "../three/legacyUv.js";
import { injectTileBakeButton } from "../helpers/modelBaker.js";
import { markReceivers } from "../vfx/surface/receivers.js";
import { ScatterField, scatterDefaults } from "../scatter/scatterField.js";
import { buildDoubleDoor } from "../helpers/doubleDoor.js";
import { knownShaders } from "../shaders/ShaderLib.js";
import { getQuality } from "../vfx/quality.js";
import { TileFrame, tileFrameState, tileSnapActive } from "./effects/tileFrame.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const DOOR_ANIMATION_EASING = "easeInOutCosine";

class TileUpdateQueue {
    constructor() {
        this._queue = [];
        this.processQueue = foundry.utils.debounce(this.processQueue.bind(this), 100);
    }

    add(data) {
        this._queue.push(data);
        this.processQueue();
    }

    processQueue() {
        canvas.scene.updateEmbeddedDocuments("Tile", this._queue);
        this._queue = [];
    }
}

const tileUpdateQueue = new TileUpdateQueue();

const materialTints = new WeakMap();
const materialSurfaces = new WeakMap();

// Aggregates tile load errors so a scene with many missing assets shows a single notification
// instead of one toast per tile. Per-tile details are still logged with console.error.
const tileLoadErrors = new Set();
const flushTileLoadErrors = foundry.utils.debounce(() => {
    if (!tileLoadErrors.size) return;
    const messages = Array.from(tileLoadErrors);
    tileLoadErrors.clear();
    const MAX_SHOWN = 5;
    let text = messages.slice(0, MAX_SHOWN).join(" | ");
    if (messages.length > MAX_SHOWN) text += ` | ...and ${messages.length - MAX_SHOWN} more (see console for details).`;
    const header = messages.length > 1 ? `3D Canvas: ${messages.length} tile errors: ` : "";
    ui.notifications.error(header + text);
}, 1000);

function notifyTileLoadError(message) {
    tileLoadErrors.add(message);
    flushTileLoadErrors();
}

export class Tile3D {
    constructor(tile, parent, fromUpdate = false, displacementCanvas = null) {
        this.tile = tile;
        this.placeable = tile;
        this.document = tile.document;
        this._parent = parent;
        this.fromUpdate = fromUpdate;
        this.isOverhead = true;
        this.isAnimated = false;
        this.draggable = true;
        this.displacementCanvas = displacementCanvas;
        this.embeddedName = "Tile";
        this.bottom = tile.document.elevation;
        this.shaders = [];
        this.renderFlags = new foundry.canvas.interaction.RenderFlags(this.constructor.RENDER_FLAGS, { object: this, priority: "OBJECTS" });
        this._sizeScale = new THREE.Vector3(1, 1, 1);
        this._hiddenMaterials = new Map();
        this.center2d = {
            x: this.x + Math.abs(this.tile.document.width) / 2,
            y: this.y + Math.abs(this.tile.document.height) / 2,
        };
        this.center = coords3d.posCanvasTo3d({ x: this.center2d.x, y: this.center2d.y, z: this.bottom });
        this.texture = this.tile.document.texture.src;
        this.opacity = this.tile.document.alpha;
        this.width = Math.abs(this.tile.document.width / factor);
        this.height = Math.abs(this.tile.document.height / factor);
        this.color = this.tile.document.tint ?? 0xffffff;
        this.angle = Math.toRadians(this.tile.document.rotation);
        this.mirrorX = this.tile.document.width < 0;
        this.mirrorY = this.tile.document.height < 0;
        this.rotSign = ((this.tile.document.width / Math.abs(this.tile.document.width)) * this.tile.document.height) / Math.abs(this.tile.document.height);
        this.getFlags();
        this.particleData = this.getParticleData();
        this.onAnimation = this.setupAnimationFunction();
        game.Levels3DPreview.particleSystem.stop(this.particleEffectId);
        this.initRandom();
    }

    get x() {
        return this.tile.document.x - this.anchorX * this.tile.document.width;
    }

    get y() {
        return this.tile.document.y - this.anchorY * this.tile.document.height;
    }

    get anchorX() {
        return this.tile.document.shape.anchorX;
    }

    get anchorY() {
        return this.tile.document.shape.anchorY;
    }

    get anchorOffsetX() {
        return this.anchorX * this.tile.document.width;
    }

    get anchorOffsetY() {
        return this.anchorY * this.tile.document.height;
    }

    async load() {
        try {
            await this.preloadShaderTextures();
            if (this.scatterData) {
                await this.initScatter();
            } else if (this.gtflPath || this.dynaMesh != "default") {
                if (this.mergedMatrix) await this.initMerged();
                else this.fillType === "stretch" || this.fillType === "fit" ? await this.initModel() : await this.initInstanced();
            } else {
                await this.init();
            }
            if (this._destroyed) {
                this.mesh?.removeFromParent();
                return;
            }

            this._baseSize = { width: this.width, height: this.height, depth: this.depth };
            this.applyDoorClip();
            this.computeWorldBoundingBox();
            this.setTransmissionIor();
            this.setRepeat();
            this.initShaders();
            this.setShading();
            this.setSides();
            this.setMRT();
            this.setVertexColors();
            this.setPathTraced();
            markReceivers(this.mesh, this);
            this._loaded = true;
            this._onLoaded?.();
            if (this.mapMakerMesh?.k === "terrain") this._parent.scatter?.surfacesChanged?.();
            this.elevation3d = this.mesh.position.y;
            this.setHidden();
            this.sendToWorker();
            this.updateControls();
            setTimeout(() => {
                this.updateControls();
            }, 150);
            if (this.tile.controlled) this._parent.interactionManager.setControlledGroup(this);
            this._parent.lightWarmup?.warmObject(this.mesh);
            this.popIn();
            setTimeout(() => {
                this.setUpDoors();
                this.setupDoor(true);
            }, 100);
            game.Levels3DPreview.outline?.toggleControlled(this.mesh, this.tile.controlled);
            if (this.particleData.type != "none") this.initParticle();
            if (this.onAnimation && this.mesh.children[0]) this.onAnimation = this.onAnimation.bind(this.mesh.children[0]);
            return this;
        } catch (e) {
            const errText = `Failed to load 3D Tile ${this.document.id}. You can manually delete this tile with the console command 'canvas.tiles.get("${this.document.id}").document.delete()'`;
            notifyTileLoadError(errText);
            console.error(errText, e);
            this._loaded = true;
            return this;
        }
    }

    applyDoorClip() {
        const clip = this.tile.document.getFlag("levels-3d-preview", "doorClip");
        if (!Array.isArray(clip) || !this.mesh) return;
        const [x0, x1, y1, y0] = clip;
        const planes = [];
        if (Number.isFinite(x0)) planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0 / factor));
        if (Number.isFinite(x1)) planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1 / factor));
        if (Number.isFinite(y1)) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), y1 / factor));
        if (Number.isFinite(y0)) planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0 / factor));
        if (!planes.length) return;
        const matrix = new THREE.Matrix4().compose(this.mesh.position, this.mesh.quaternion, new THREE.Vector3(1, 1, 1));
        planes.forEach((plane) => plane.applyMatrix4(matrix));
        const clipped = (material) => Object.assign(material.clone(), { clippingPlanes: planes, doorClip: planes });
        this.mesh.traverse((child) => {
            if (!child.isMesh || child.userData.noShaders) return;
            child.material = Array.isArray(child.material) ? child.material.map(clipped) : clipped(child.material);
        });
    }

    get isTerrain() {
        return this.dynaMesh == "box" && this.displacementMap;
    }

    async popIn() {
        if ((this.fromUpdate && !this.isTerrain) || !this._parent._ready) return;
        if (this.dynaMesh != "default") {
            this.mesh.scale.set(1, 0.0001, 1);
            const animation = [
                {
                    parent: this.mesh.scale,
                    attribute: "y",
                    to: 1,
                },
            ];
            foundry.canvas.animation.CanvasAnimation.animate(animation, { duration: 350, easing: "easeOutCircle" });
        } else {
            this.mesh.scale.set(0.0001, 0.0001, 0.0001);
            const animation = [
                {
                    parent: this.mesh.scale,
                    attribute: "x",
                    to: 1,
                },
                {
                    parent: this.mesh.scale,
                    attribute: "y",
                    to: 1,
                },
                {
                    parent: this.mesh.scale,
                    attribute: "z",
                    to: 1,
                },
            ];
            foundry.canvas.animation.CanvasAnimation.animate(animation, { duration: 350, easing: "easeOutCircle" });
        }
    }

    async popOut() {
        if (this.dynaMesh != "default") {
            const animation = [
                {
                    parent: this.mesh.scale,
                    attribute: "y",
                    to: 0,
                },
            ];
            await foundry.canvas.animation.CanvasAnimation.animate(animation, { duration: 75, easing: "easeOutCircle" });
        } else {
            const animation = [
                {
                    parent: this.mesh.scale,
                    attribute: "x",
                    to: 0,
                },
                {
                    parent: this.mesh.scale,
                    attribute: "y",
                    to: 0,
                },
                {
                    parent: this.mesh.scale,
                    attribute: "z",
                    to: 0,
                },
            ];
            await foundry.canvas.animation.CanvasAnimation.animate(animation, { duration: 150, easing: "easeOutCircle" });
        }
    }

    getMergedGeometry() {
        if (this._mergedGeometry) return this._mergedGeometry;
        const mergedMesh = meshesToSingleMesh([this.mesh.children[0]]);
        this._mergedGeometry = mergedMesh.geometry;
        return this._mergedGeometry;
    }

    sendToWorker() {
        if (this.scatterField) return this.scatterField.sendToWorker();
        let dontSend = false;
        const scene = this._parent.scene;
        const currentParent = this.mesh.parent;
        const currentPosition = this.mesh.position.clone();
        const worldPosition = this.mesh.getWorldPosition(new THREE.Vector3());
        if ((!this.sight && !this.hasTags) || this.dynaMesh == "decal" || !this._parent?.workers?.enabled) dontSend = true;
        if (!this.sight && this._parent?.workers?.enabled) return this._parent.workers.removeMesh(this.tile.id);
        if (dontSend) return;
        if (currentParent !== scene) scene.add(this.mesh);
        this.mesh.position.copy(worldPosition);
        if (this.sightMesh) this.sightMesh.name = "sightMesh";
        this.mesh.traverse((o) => {
            o.updateMatrix();
            o.updateMatrixWorld();
        });
        this.mesh.updateMatrixWorld();
        const mesh = this.mesh;
        const json = mesh.toJSONClean();
        const data = {
            type: "add",
            meshJSON: json,
            id: this.tile.id,
            sight: this.sight,
            hasTags: this.hasTags,
            isDoor: this.isDoor,
            isOpen: this.isOpen,
        };
        this._parent.workers.addMesh(data);
        this.mesh.position.copy(currentPosition);
        currentParent?.add(this.mesh);
    }

    get particleEffectId() {
        return "Tile." + this.document.id;
    }

    initParticle() {
        if (!getQuality().enabled) return;
        if (this.document.hidden && !this.document.getFlag("levels-3d-preview", "enableParticleHidden")) return;
        const size = (Math.max(this.width, this.height) * factor) / canvas.grid.size;
        const particleData = this.particleData;
        this.particleEffect = new Particle3D(particleData.type);
        this.particleEffect
            .name(this.particleEffectId)
            .sprite(particleData.sprite)
            .scale(particleData.scale)
            .color(particleData.color.split(","), particleData.color2 ? particleData.color2.split(",") : undefined)
            .duration(Infinity)
            .presetIntensity(particleData.presetIntensity)
            .emitterSize(size)
            .meshSurface()
            .to(this.placeable);
        this.particleEffect.start(false);
    }

    getParticleData() {
        return {
            type: this.document.getFlag("levels-3d-preview", "ParticleType") ?? "none",
            sprite: this.document.getFlag("levels-3d-preview", "ParticleSprite") ?? "",
            emitterScale: 1,
            scale: this.document.getFlag("levels-3d-preview", "ParticleScale") ?? 1,
            color: this.document.getFlag("levels-3d-preview", "ParticleColor") ?? "#ffffff",
            color2: this.document.getFlag("levels-3d-preview", "ParticleColor2") ?? "#ffffff",
            presetIntensity: this.document.getFlag("levels-3d-preview", "ParticleIntensity") ?? 1,
        };
    }

    setupAnimationFunction() {
        const functionText = this.onAnimation;
        if (!functionText) return null;
        try {
            const fn = new Function("delta", "tile3d", functionText);
            return fn;
        } catch (error) {
            console.error("Error in animation function", functionText);
            return null;
        }
    }

    initRandom() {
        let seed = "";
        for (let c of this.randomSeed) {
            seed += c.charCodeAt().toString();
        }
        seed = parseInt(seed);
        this.marsenne = new MersenneTwister(seed);
        this.simplex = new SimplexNoise(this.marsenne);
        this.perlin = new Perlin(this.marsenne);
        this.noiseFn = this.simplex.noise.bind(this.simplex);
        switch (this.noiseType) {
            case "simplex":
                this.noiseFn = this.simplex.noise.bind(this.simplex);
                break;
            case "perlin":
                this.noiseFn = this.perlin.get.bind(this.perlin);
                break;
        }
    }

    get hudCenter() { }

    get pseudoRandom() {
        return this.marsenne.random() + 0.5;
    }

    get rawPseudoRandom() {
        return this.marsenne.random();
    }

    get paused() {
        return (this.tile.document.flags && this.tile.document.flags["levels-3d-preview"]?.paused) ?? false;
    }

    get scene() {
        return this._parent.scene;
    }

    get hudPosition() {
        return this.center;
    }

    get hasAnimations() {
        return !!this.mixer || !!this._animationModelReference?.object?.animations?.length;
    }

    getFlags() {
        this.gtflPath = this.tile.document.getFlag("levels-3d-preview", "model3d");
        this.mapgen = this.tile.document.getFlag("levels-3d-preview", "mapgen");
        this.mapMakerMesh = this.tile.document.getFlag("levels-3d-preview", "mapMakerMesh");
        const scatter = this.tile.document.getFlag("levels-3d-preview", "scatter");
        this.scatterData = scatter?.set || scatter?.items ? scatterDefaults(scatter) : null;
        this.enableAnim = this.tile.document.getFlag("levels-3d-preview", "enableAnim") ?? true;
        this.animIndex = this.tile.document.getFlag("levels-3d-preview", "animIndex") ?? 0;
        this.animSpeed = this.tile.document.getFlag("levels-3d-preview", "animSpeed") ?? 1;
        this.animationOnce = this.tile.document.getFlag("levels-3d-preview", "animationOnce") ?? false;
        this.color = this.tile.document.getFlag("levels-3d-preview", "color") ?? "#ffffff";
        this.enableGravity = this.tile.document.getFlag("levels-3d-preview", "enableGravity") ?? "none";
        this.shading = this.tile.document.getFlag("levels-3d-preview", "shading") ?? "default";
        this.shader = this.tile.document.getFlag("levels-3d-preview", "shader") ?? "none";
        this.flipY = this.tile.document.getFlag("levels-3d-preview", "flipY") ?? false;
        this.shaders = this.readShaders();

        this.dynaMesh = this.tile.document.getFlag("levels-3d-preview", "dynaMesh") ?? "default";
        this.isInteractiveDynaMesh = !!interactiveDynamesh[this.dynaMesh];
        if (this.tile.document.getFlag("levels-3d-preview", "gmOnlyInteractive") && !game.user.isGM) this.isInteractiveDynaMesh = false;
        if (this.dynaMesh === "decal") this.isGravity = true;
        this.font = this.tile.document.getFlag("levels-3d-preview", "font") ?? "";
        this.dynaMeshResolution = this.tile.document.getFlag("levels-3d-preview", "dynaMeshResolution") ?? 1;
        this.sightMeshComplexity = this.tile.document.getFlag("levels-3d-preview", "sightMeshComplexity") ?? 1;
        this.roughness = this.tile.document.getFlag("levels-3d-preview", "roughness") ?? -0.01;
        this.metalness = this.tile.document.getFlag("levels-3d-preview", "metalness") ?? -0.01;
        this.transparency = this.tile.document.getFlag("levels-3d-preview", "transparency") ?? -0.01;
        this.alphaClip = this.tile.document.getFlag("levels-3d-preview", "alphaClip") ?? -0.01;
        this.sides = this.tile.document.getFlag("levels-3d-preview", "sides") ?? "default";
        this.castShadow = this.tile.document.getFlag("levels-3d-preview", "castShadow") ?? true;
        this.noiseParams = {
            scale: this.tile.document.getFlag("levels-3d-preview", "noiseScale") ?? 1,
            height: this.tile.document.getFlag("levels-3d-preview", "noiseHeight") ?? 1,
            persistence: this.tile.document.getFlag("levels-3d-preview", "noisePersistence") ?? 0.5,
            octaves: this.tile.document.getFlag("levels-3d-preview", "noiseOctaves") ?? 1,
            lacunarity: this.tile.document.getFlag("levels-3d-preview", "noiseLacunarity") ?? 2,
            exponent: this.tile.document.getFlag("levels-3d-preview", "noiseExponent") ?? 1,
            flattening: 1 - (this.tile.document.getFlag("levels-3d-preview", "noiseFlattening") ?? 0),
        };
        this.noiseType = this.tile.document.getFlag("levels-3d-preview", "noiseType") ?? "none";
        this.noiseScale = this.tile.document.getFlag("levels-3d-preview", "noiseScale") ?? 1;
        this.imageTexture = this.tile.document.getFlag("levels-3d-preview", "imageTexture") ?? "";
        this.displacementMap = this.tile.document.getFlag("levels-3d-preview", "displacementMap") ?? "";
        this.invertDisplacementMap = this.tile.document.getFlag("levels-3d-preview", "invertDisplacementMap") ?? false;
        this.displacementIntensity = this.tile.document.getFlag("levels-3d-preview", "displacementIntensity") ?? 1;
        this.displacementMatrix = this.tile.document.getFlag("levels-3d-preview", "displacementMatrix") ?? "0,0,1,1";
        if (this.displacementCanvas) this.displacementMatrix = "0,0,1,1";
        this.fillType = this.tile.document.getFlag("levels-3d-preview", "fillType") ?? "stretch";
        this.scale = this.tile.document.getFlag("levels-3d-preview", "tileScale") ?? 1;
        this.yScale = this.tile.document.getFlag("levels-3d-preview", "yScale") ?? 1;
        this.depth = this.tile.document.getFlag("levels-3d-preview", "depth") / factor;
        this.randomRotation = this.tile.document.getFlag("levels-3d-preview", "randomRotation") ?? false;
        this.randomScale = this.tile.document.getFlag("levels-3d-preview", "randomScale") ?? false;
        this.randomDepth = this.tile.document.getFlag("levels-3d-preview", "randomDepth") ?? false;
        this.randomPosition = this.tile.document.getFlag("levels-3d-preview", "randomPosition") ?? false;
        this.gap = this.tile.document.getFlag("levels-3d-preview", "gap") ?? 0;
        if (this.gap < 0) this.gap = 0;
        this.randomSeed = this.tile.document.getFlag("levels-3d-preview", "randomSeed") || this.tile.id;
        this.randomSeed = this.randomSeed.substring(0, 7);
        this.randomColor = this.tile.document.getFlag("levels-3d-preview", "randomColor") ?? false;
        this.collision = this.tile.document.getFlag("levels-3d-preview", "collision") ?? true;
        this.cameraCollision = this.tile.document.getFlag("levels-3d-preview", "cameraCollision") ?? false;
        this.sight = this.tile.document.getFlag("levels-3d-preview", "sight") ?? true;        this.tiltX = this.tile.document.getFlag("levels-3d-preview", "tiltX") ?? 0;
        this.tiltX = Math.toRadians(this.tiltX);
        this.tiltZ = this.tile.document.getFlag("levels-3d-preview", "tiltZ") ?? 0;
        this.tiltZ = Math.toRadians(this.tiltZ);
        this.offset = new THREE.Vector3(...Object.values(this.tile.document.getFlag("levels-3d-preview", "offset") ?? { x: 0, y: 0, z: 0 })).divideScalar(factor);
        this.maxInstances = this.tile.document.getFlag("levels-3d-preview", "maxInstances") ?? 0;
        this.autoCenter = this.tile.document.getFlag("levels-3d-preview", "autoCenter") ?? false;
        this.autoGround = this.tile.document.getFlag("levels-3d-preview", "autoGround") ?? false;
        this.textureRepeat = this.tile.document.getFlag("levels-3d-preview", "textureRepeat") ?? 1;
        this.repeatTexture = this.textureRepeat > 1;
        this.wasFreeMode = this.tile.document.getFlag("levels-3d-preview", "wasFreeMode") ?? false;
        this.doorStyle = parseInt(this.tile.document.getFlag("levels-3d-preview", "doorStyle") ?? 0);
        this.doorAnimateAngle = Math.toRadians(parseInt(this.tile.document.getFlag("levels-3d-preview", "doorAnimateAngle") ?? 90));
        this.doorSlidePercent = parseInt(this.tile.document.getFlag("levels-3d-preview", "doorSlidePercent") ?? 50);
        this.doorGrabTokens = this.tile.document.getFlag("levels-3d-preview", "doorGrabTokens") ?? false;
        this.doorType = this.tile.document.getFlag("levels-3d-preview", "doorType") ?? 0;
        this.doorState = parseInt(this.tile.document.getFlag("levels-3d-preview", "doorState") ?? 0);
        this.doorDouble = this.doorType != 0 && !!this.tile.document.getFlag("levels-3d-preview", "doorDouble");
        this.linkWithDoorState = this.doorStyle === 4;
        if (this.linkWithDoorState) {
            this.animIndex = this.doorState;
        }
        this.doorAnimationDuration = this.tile.document.getFlag("levels-3d-preview", "doorAnimationDuration") ?? 400;
        this.mergedMatrix = this.tile.document.getFlag("levels-3d-preview", "mergedMatrix") ?? null;
        this.originalDimensions = this.tile.document.getFlag("levels-3d-preview", "originalDimensions") ?? null;
        this.highlightOnHover = this.tile.document.getFlag("levels-3d-preview", "highlightOnHover") ?? false;
        if (this.isInteractiveDynaMesh) this.highlightOnHover = true;
        const enableAnimationScripts = canvas.scene.getFlag("levels-3d-preview", "enableAnimationScripts") ?? true;
        this.onAnimation = enableAnimationScripts ? this.tile.document.getFlag("levels-3d-preview", "onAnimation") ?? "" : "";
        this.isDoor = this.doorType != 0;
        this.isSecret = this.doorType == 2;
        this.isOpen = this.doorState == 1;
        this.isLocked = this.doorState == 2;
        if (this.isOpen && this.doorStyle == 0) {
            this.collision = false;
            this.sight = false;
        }
    }

    readShaders() {
        const shaders = knownShaders(foundry.utils.deepClone(this.tile.document.getFlag("levels-3d-preview", "shaders") ?? {}));
        if (this.mapMakerMesh?.k !== "terrain") return shaders;
        return { ...shaders, grid: { heightCulling: 1, showBounds: false, ...shaders.grid, normalCulling: shaders.grid?.normalCulling || 0.85, enabled: true } };
    }

    setUpDoors(init = false) {
        const doors = {};
        this.mesh.traverse((child) => {
            if (child.isMesh && child?.userData?.isDoor && child?.userData?.doorId && !child?.userData?.noShaders) {
                doors[child?.userData?.doorId] = child;
                const doorAngle = child.userData.doorAnimateAngle ?? this.doorAnimateAngle;
                child.userData.doorMaterialData = {
                    transparent: true,
                    opacity: 0.4,
                    alphaTest: 0,
                    depthWrite: false,
                    format: THREE.RGBAFormat,
                    needsUpdate: true,
                    angle: child.rotation.y + doorAngle,
                };
                child.userData.originalMaterial = {
                    transparent: child.material.transparent,
                    opacity: child.material.opacity,
                    alphaTest: child.material.alphaTest,
                    depthWrite: child.material.depthWrite,
                    format: child.material.format,
                    needsUpdate: true,
                    angle: child.rotation.y,
                };
            }
        });
        if (this.sightMesh) {
            this.sightMesh.traverse((child) => {
                if (child.isMesh && child?.userData?.isDoor && child?.userData?.doorId) {
                    doors[child?.userData?.doorId].userData.sightMesh = child;
                }
            });
        }
        this._doors = doors;
        this.setDoorsMaterials(true);
    }

    setDoorsMaterials(sendToWorker = false) {
        const modelDoorsStates = this.tile.document.getFlag("levels-3d-preview", "modelDoors") || {};
        let res;
        const fillerPromise = new Promise((r) => {
            res = r;
        });
        const promises = [fillerPromise];
        for (let doorId in this._doors) {
            let isOpen = this._doors[doorId].userData?.isOpen == 1;
            isOpen = modelDoorsStates[doorId]?.ds !== undefined ? modelDoorsStates[doorId].ds == 1 : isOpen;
            const door = this._doors[doorId];
            const originalMaterial = door.userData.originalMaterial;
            const doorMaterialData = door.userData.doorMaterialData;
            let matToApply = isOpen ? doorMaterialData : originalMaterial;
            const doorStyle = door.userData.doorStyle ?? this.doorStyle;
            switch (doorStyle) {
                case 0:
                    for (let [k, v] of Object.entries(matToApply)) {
                        door.material[k] = v;
                    }
                    door.userData.isOpen = isOpen;
                    door.userData.sight = isOpen ? false : this.sight;
                    door.userData.collision = isOpen ? false : this.collision;
                    break;
                case 1:
                    const animation = [
                        {
                            parent: door.rotation,
                            attribute: "y",
                            to: matToApply.angle,
                        },
                    ];
                    const sightMesh = door.userData.sightMesh;
                    if (sightMesh) {
                        sightMesh.rotation.y = matToApply.angle;
                    }
                    const p = foundry.canvas.animation.CanvasAnimation.animate(animation, { duration: this.doorAnimationDuration, easing: DOOR_ANIMATION_EASING });
                    promises.push(p);
                    break;
                case 2:
                    const slideAngle = this.doorAnimateAngle;
                    const amount = (Math.max(this.tile.document.height, this.tile.document.width) / factor) * (this.doorSlidePercent / 100);
                    const xComponent = Math.cos(slideAngle) * amount;
                    const zComponent = Math.sin(slideAngle) * amount;
                    const animation2 = [
                        {
                            parent: door.position,
                            attribute: "x",
                            to: this.isOpen ? this.originalPosition.x + xComponent : this.originalPosition.x,
                        },
                        {
                            parent: door.position,
                            attribute: "z",
                            to: this.isOpen ? this.originalPosition.z + zComponent : this.originalPosition.z,
                        },
                    ];
                    const sightMesh2 = door.userData.sightMesh;
                    if (sightMesh2) {
                        sightMesh2.position.x = this.isOpen ? this.originalPosition.x + xComponent : this.originalPosition.x;
                        sightMesh2.position.z = this.isOpen ? this.originalPosition.z + zComponent : this.originalPosition.z;
                    }
                    const p2 = foundry.canvas.animation.CanvasAnimation.animate(animation2, { duration: this.doorAnimationDuration, easing: DOOR_ANIMATION_EASING });
                    promises.push(p2);
                    break;
                case 3:
                    const amount2 = this.depth * (this.doorSlidePercent / 100);
                    const yComponent = amount2;
                    const animation3 = [
                        {
                            parent: this.mesh.children[0].position,
                            attribute: "y",
                            to: this.isOpen ? this.originalPosition.y + yComponent : this.originalPosition.y,
                        },
                    ];
                    const sightMesh3 = door.userData.sightMesh;
                    if (sightMesh3) {
                        sightMesh3.position.y = this.isOpen ? this.originalPosition.y + yComponent : this.originalPosition.y;
                    }
                    const p3 = foundry.canvas.animation.CanvasAnimation.animate(animation3, { duration: this.doorAnimationDuration, easing: DOOR_ANIMATION_EASING });
                    promises.push(p3);
                    break;
            }
            const sightMesh = door.userData.sightMesh;
            if (sightMesh) {
                sightMesh.userData.sight = door.userData.sight;
                sightMesh.userData.collision = door.userData.collision;
            }
        }
        Promise.all(promises).then(() => {
            if (sendToWorker) this.sendToWorker();
            this._parent.interactionManager?.generateSightCollisions();
            this._parent.interactionManager?.buildCollisionGeos();
            canvas.perception.update(
                {
                    initializeLighting: true,
                    initializeSounds: true,
                    initializeVision: true,
                    refreshLighting: true,
                    refreshSounds: true,
                    refreshOcclusion: true,
                    refreshVision: true,
                },
                true,
            );
        });
        res();
    }

    setupDoor(firstRender = false) {
        this.doorState = parseInt(this.tile.document.getFlag("levels-3d-preview", "doorState") ?? 0);
        if (this.linkWithDoorState) {
            this.animIndex = this.doorState;
        }
        this.sight = this.tile.document.getFlag("levels-3d-preview", "sight") ?? true;
        this.collision = this.tile.document.getFlag("levels-3d-preview", "collision") ?? true;
        this.isSecret = this.doorType == 2;
        this.isOpen = this.doorState == 1;
        this.isLocked = this.doorState == 2;
        this.isDoor = this.doorType != 0;
        if (!this.isDoor) return;
        if (!firstRender && this.originalAngle === undefined) return;
        if (this.isOpen && this.doorStyle == 0) {
            this.collision = false;
            this.sight = false;
        }
        if (this.isOpen && (this.doorStyle == 4 || this.doorStyle == 5)) {
            this.sight = false;
            this.collision = false;
        }
        let promise;
        if (firstRender) {
            this.originalDoorMaterials = {};
            this.originalAngle = this.mesh.children[0].rotation.y;
            this.originalPosition = this.mesh.children[0].position.clone();
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    this.originalDoorMaterials[child.uuid] = {
                        transparent: child.material.transparent,
                        opacity: child.material.opacity,
                        alphaTest: child.material.alphaTest,
                        depthWrite: child.material.depthWrite,
                        format: child.material.format,
                        needsUpdate: true,
                    };
                }
            });
        }
        const tokens = firstRender ? [] : this.getGrabTokens();
        if (!firstRender)
            tokens.forEach((t) => {
                t.isCaptured = true;
                this.mesh.children[0].attach(t.mesh);
            });

        const sightMesh = this.doorDouble ? null : this.sightMesh;

        switch (this.doorStyle) {
            case 0:
                if (this.isOpen) {
                    this.mesh.traverse((child) => {
                        if (child.isMesh) {
                            child.material.transparent = true;
                            child.material.opacity = 0.4;
                            child.material.alphaTest = 0;
                            child.material.depthWrite = false;
                            child.material.format = THREE.RGBAFormat;
                            child.material.needsUpdate = true;
                        }
                    });
                } else {
                    this.mesh.traverse((child) => {
                        if (child.isMesh) {
                            const mat = this.originalDoorMaterials[child.uuid];
                            for (let [k, v] of Object.entries(mat)) {
                                child.material[k] = v;
                            }
                        }
                    });
                }
                break;
            case 1:
                const animation = [
                    {
                        parent: this.mesh.children[0].rotation,
                        attribute: "y",
                        to: this.isOpen ? this.originalAngle + this.doorAnimateAngle : this.originalAngle,
                    },
                ];
                if (!firstRender) promise = foundry.canvas.animation.CanvasAnimation.animate(animation, { duration: this.doorAnimationDuration, easing: DOOR_ANIMATION_EASING });
                else this.mesh.children[0].rotation.y = this.isOpen ? this.originalAngle + this.doorAnimateAngle : this.originalAngle;
                if (sightMesh) {
                    sightMesh.rotation.y = this.isOpen ? this.originalAngle + this.doorAnimateAngle : this.originalAngle;
                }
                break;
            case 2:
                const slideAngle = this.doorAnimateAngle;
                const amount = (Math.max(this.tile.document.height, this.doorDouble ? this.tile.document.width / 2 : this.tile.document.width) / factor) * (this.doorSlidePercent / 100);
                const xComponent = this.doorDouble ? -Math.abs(Math.cos(slideAngle) * amount) : Math.cos(slideAngle) * amount;
                const zComponent = Math.sin(slideAngle) * amount;
                const animation2 = [
                    {
                        parent: this.mesh.children[0].position,
                        attribute: "x",
                        to: this.isOpen ? this.originalPosition.x + xComponent : this.originalPosition.x,
                    },
                    {
                        parent: this.mesh.children[0].position,
                        attribute: "z",
                        to: this.isOpen ? this.originalPosition.z + zComponent : this.originalPosition.z,
                    },
                ];
                if (!firstRender) promise = foundry.canvas.animation.CanvasAnimation.animate(animation2, { duration: this.doorAnimationDuration, easing: DOOR_ANIMATION_EASING });
                else {
                    this.mesh.children[0].position.x = this.isOpen ? this.originalPosition.x + xComponent : this.originalPosition.x;
                    this.mesh.children[0].position.z = this.isOpen ? this.originalPosition.z + zComponent : this.originalPosition.z;
                }
                if (sightMesh) {
                    sightMesh.position.x = this.isOpen ? this.originalPosition.x + xComponent : this.originalPosition.x;
                    sightMesh.position.z = this.isOpen ? this.originalPosition.z + zComponent : this.originalPosition.z;
                }
                break;
            case 3:
                const amount2 = this.depth * (this.doorSlidePercent / 100);
                const yComponent = amount2;
                const animation3 = [
                    {
                        parent: this.mesh.children[0].position,
                        attribute: "y",
                        to: this.isOpen ? this.originalPosition.y + yComponent : this.originalPosition.y,
                    },
                ];
                if (!firstRender) promise = foundry.canvas.animation.CanvasAnimation.animate(animation3, { duration: this.doorAnimationDuration, easing: DOOR_ANIMATION_EASING });
                else {
                    this.mesh.children[0].position.y = this.isOpen ? this.originalPosition.y + yComponent : this.originalPosition.y;
                }
                if (sightMesh) {
                    sightMesh.position.y = this.isOpen ? this.originalPosition.y + yComponent : this.originalPosition.y;
                }
                break;
        }
        const finalizeDoor = () => {
            tokens.forEach((t) => {
                this._parent.scene.attach(t.mesh);
                t.forceUpdatePositionFrom3D().then(() => {
                    t.isCaptured = false;
                });
            });
            this._parent.interactionManager?.generateSightCollisions();
            canvas.perception.update(
                {
                    initializeLighting: true,
                    initializeSounds: true,
                    initializeVision: true,
                    refreshLighting: true,
                    refreshSounds: true,
                    refreshOcclusion: true,
                    refreshVision: true,
                },
                true,
            );
            if (!firstRender) this.sendToWorker();
        };

        if (promise)
            promise.then(() => {
                finalizeDoor();
            });
        else finalizeDoor();
    }

    getGrabHitbox() {
        /*
        this.originalAngle = this.mesh.children[0].rotation.y;
            this.originalPosition = this.mesh.children[0].position.clone();
        */
        const box = this.controlledBox.clone();

        const positionDelta = this.mesh.children[0].position.clone().sub(this.originalPosition);
        const rotationDelta = this.mesh.children[0].rotation.y - this.originalAngle;

        this.mesh.add(box);

        box.position.add(positionDelta);
        box.rotation.y += rotationDelta;
        box.scale.multiplyScalar(1.1);

        box.updateMatrixWorld();

        this._parent.scene.attach(box);

        box.updateMatrixWorld();

        const box3 = new THREE.Box3().setFromObject(box);

        this._parent.scene.remove(box);

        return box3;
    }

    getGrabTokens() {
        const toGrab = [];
        if (!this.doorGrabTokens) return toGrab;
        const tileHitbox = this.getGrabHitbox();
        const tokens = Object.values(this._parent.tokens);
        for (const token of tokens) {
            const tokenHitbox = token.getWorldBoundingBox();
            if (tileHitbox.intersectsBox(tokenHitbox)) toGrab.push(token);
        }
        return toGrab;
    }

    async init() {
        const pbr = this._parent.helpers.isPBR(this.texture);
        const { textureOrMat, isPBR } = await this.getTextureOrMat(this.texture);
        const texture = textureOrMat;
        const geometry = new THREE.PlaneGeometry(this.width, this.height);
        const material = isPBR
            ? textureOrMat
            : new THREE.MeshStandardMaterial({
                color: this.color,
                opacity: this.opacity,
                visible: !this.tile.document.hidden,
                map: texture,
                side: THREE.DoubleSide,
                roughness: 1,
                metalness: 0,
                transparent: false,
                alphaTest: 0.99,
            });
        this._planePBR = !!isPBR;
        if (!isPBR) materialTints.set(material.color, { base: new THREE.Color(0xffffff), count: 1 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.center.x, this.center.y, this.center.z);
        this.mesh.rotation.set(-Math.PI / 2 + (this.mirrorY ? Math.PI : 0), this.mirrorX ? Math.PI : 0, -this.angle * this.rotSign);
        //this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.hitbox = this.mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        if (this._destroyed) return;
        this._parent.scene.add(this.mesh);
        this.isPlane = true;
        this.initBoundingBox();
    }

    async initScatter() {
        this.hasTags = true;
        if (!(this.depth > 0)) this.depth = 0.001;
        this.scatterField = new ScatterField(this);
        this.mesh = this.scatterField.container;
        this.sightMesh = this.scatterField.proxies;
        this.mesh.position.set(this.center.x, this.center.y, this.center.z);
        this.mesh.rotation.set(0, -this.angle * this.rotSign, 0);
        Object.assign(this.mesh.userData, { hitbox: this.mesh, interactive: true, entity3D: this });
        if (this._destroyed) return;
        this._parent.scene.add(this.mesh);
        this.initBoundingBox();
        this.scatterField.schedule();
    }

    async initModel() {
        const container = new THREE.Group();
        const stretch = this.fillType === "stretch";
        const model = await this.getModel();
        const { textureOrMat, isPBR } = await this.getTextureOrMat();
        if (this.displacementMap) {
            if (this.displacementCanvas) this.displacementMap = this.getDisplacementData(this.displacementCanvas);
            else {
                const tex = await this._parent.helpers.loadTexture(this.displacementMap);
                this.displacementMap = this.getDisplacementData(tex.image);
            }
            this.applyDisplacement(model.scene);
        }
        const object = this.dynamesh === "decal" ? model.scene : game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter);
        this._attachModel = object.children[0];
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = Math.max(box.max.x - box.min.x, 0.00001);
        const mHeight = Math.max(box.max.z - box.min.z, 0.00001);
        const mDepth = Math.max(box.max.y - box.min.y, 0.00001);
        const minSide = Math.max(1, Math.round(canvas.grid.size / 10));
        //migration

        if (!this.depth) {
            if (stretch) {
                let yScale = this.width > this.height ? this.width / mDepth : this.height / mDepth;
                yScale *= this.yScale;
                const depth = mDepth * yScale;
                this.depth = Math.round(depth * factor) / factor;
                this.tile.document.setFlag("levels-3d-preview", "depth", Math.round(depth * factor));
            } else {
                const largest = Math.max(mWidth, mHeight, mDepth);
                let scale = 1;
                if (largest === mWidth) {
                    scale = this.width / mWidth;
                } else if (largest === mHeight) {
                    scale = this.height / mHeight;
                } else {
                    scale = Math.min(this.width, this.height) / mDepth;
                }
                const depth = mDepth * this.yScale * scale; //*2
                this.depth = Math.round(depth * factor) / factor;
                const fitWidth = Math.max(Math.round(scale * mWidth * factor), minSide);
                const fitHeight = Math.max(Math.round(scale * mHeight * factor), minSide);
                const wDiff = (this.tile.document.width - fitWidth) / 2;
                const hDiff = (this.tile.document.height - fitHeight) / 2;
                this.tile.document.update({
                    flags: {
                        "levels-3d-preview": {
                            depth: Math.round(depth * factor),
                            fillType: "stretch",
                        },
                    },
                    width: fitWidth,
                    height: fitHeight,
                    x: this.x + wDiff,
                    y: this.y + hDiff,
                });
                this.tile.document.setFlag("levels-3d-preview", "depth");
            }
        }
        //end migration

        if (this.dynaMesh === "decal") {
            const decalGeo = object.children[0].geometry;
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 32), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
            cone.userData.noShaders = true;
            container.add(cone);
            this._decalCone = cone;
            this._decal = object;
            const center = this.center;
            decalGeo.translate(-center.x, -center.y + 0.005, -center.z);
            object.traverse((child) => {
                if (child.isMesh) {
                    child.material.polygonOffset = true;
                    child.material.polygonOffsetFactor = -1;
                }
            });
            decalGeo.rotateX(-this.tiltX);
            decalGeo.rotateY(this.angle * this.rotSign);
            decalGeo.rotateZ(-this.tiltZ);
        } else {
            object.scale.set((this.doorDouble ? this.width / 2 : this.width) / mWidth, this.depth / mDepth, this.height / mHeight);
        }

        const color = new THREE.Color(this.color);
        this._processModel(object, textureOrMat, isPBR, color);
        this.applyNoise(object);
        object.children.forEach((child) => {
            child.position.add(this.offset.clone().divide(object.scale));
        });

        const doorHinge = this.doorDouble ? -0.5 : parseFloat(this.tile.document.getFlag("levels-3d-preview", "doorHinge") ?? 0) || 0;
        if (this.doorDouble) object.position.x -= this.width / 4;
        if (doorHinge) {
            const shift = doorHinge * (this.doorDouble ? this.width / 2 : this.width);
            object.position.x += shift;
            object.children.forEach((child) => (child.position.x -= shift / object.scale.x));
        }

        this._animationModelReference = model;
        this.setupAnimations();

        this.mesh = container;
        this.sightMesh = this._parent.helpers.getSightMesh(object, this.sightMeshComplexity);
        const doubleDoor = this.doorDouble ? buildDoubleDoor(object, this.sightMesh) : null;
        if (doubleDoor) this.sightMesh = doubleDoor.sight;
        this.sightMesh.visible = false;
        this.sightMesh.userData.noShaders = true;
        this.sightMesh.traverse((child) => {
            if (child.isMesh) {
                child.userData.noShaders = true;
            }
        });
        container.add(object);
        container.add(this.sightMesh);
        if (doubleDoor) container.add(doubleDoor.mirror);
        container.position.set(this.center.x, this.center.y, this.center.z);
        container.rotation.set(this.tiltX, -this.angle * this.rotSign, this.tiltZ);

        container.userData.hitbox = container;
        container.userData.interactive = true;
        container.userData.entity3D = this;
        this.mesh.userData.draggable = true;
        if (this._destroyed) return;
        queueBoundsTree(container);
        this._parent.scene.add(container);
        this.initBoundingBox();
    }

    setupAnimations() {
        const model = this._animationModelReference;

        if (!model) return;

        this.animIndex = this.linkWithDoorState ? this.doorState : parseInt(this.tile.document.getFlag("levels-3d-preview", "animIndex") ?? 0);

        const useReversed = this.tile.document.getFlag("levels-3d-preview", "doorStyle") == 5;

        if (model.object.animations.length > 0 && this.enableAnim) {
            //Clamp animation index
            if (this.animIndex > model.object.animations.length - 1) this.animIndex = model.object.animations.length - 1;
            if (!model.object.animations[this.animIndex]) {
                console.error("Animation index out of bounds", this.tile);
            } else {
                this.isAnimated = true;
                const wasMixer = !!this.mixer;
                this.mixer = this.mixer ?? new THREE.AnimationMixer(model.scene);
                if (!wasMixer && this.sight) this.mixer.addEventListener("finished", () => { this.sendToWorker(); });
                this.mixer.timeScale = this.animSpeed;
                const previousClipAction = this._currentClipAction;
                const clipAction = this.mixer.clipAction(model.object.animations[this.animIndex]);
                clipAction.setLoop(this.animationOnce ? THREE.LoopOnce : THREE.LoopRepeat);
                clipAction.clampWhenFinished = this.animationOnce;
                this._currentClipAction = clipAction;
                clipAction.time = 0;

                if (!useReversed) {
                    clipAction.reset();
                    if (previousClipAction) clipAction.crossFadeFrom(previousClipAction, 0.5, false);
                    clipAction.play();
                } else {
                    const forwards = this.doorState == 1;
                    clipAction.reset();

                    if (!previousClipAction) {
                        clipAction.time = forwards ? clipAction._clip.duration * this.mixer.timeScale - 0.01 : 0;
                        clipAction.play();
                        setTimeout(() => {
                            clipAction.halt(0);
                            if (this.sight) this.sendToWorker();
                        }, 1)
                        return;
                    }

                    if (forwards) clipAction.play();
                    else {
                        clipAction.setLoop(THREE.LoopPingPong);
                        clipAction.time = clipAction._clip.duration * this.mixer.timeScale;
                        setTimeout(() => {
                            clipAction.halt(0);
                            if (this.sight) this.sendToWorker();
                        }, (clipAction._clip.duration * this.mixer.timeScale - 0.1) * 1000);
                        clipAction.play();
                    }
                }
            }
        }
    }

    async initInstanced() {
        this.isGravity = this.enableGravity !== "none";
        if (this.isGravity) this._parent.interactionManager.forceSightCollisions();
        if (this.displacementMap) {
            const tex = await this._parent.helpers.loadTexture(this.displacementMap);
            this.displacementMap = this.getDisplacementData(tex.image);
        }
        this._instances = [];
        const model = await this.getModel();
        const raycaster = this._parent.interactionManager;
        this.isInstanced = true;
        const { textureOrMat, isPBR } = await this.getTextureOrMat();
        const object = game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter); //model.scene
        this.applyNoise(object);
        const box = new THREE.Box3().setFromObject(object);
        const gap = (this.gap * canvas.grid.size) / factor;
        const grid = (canvas.grid.size * this.scale) / factor + gap;
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        const rows = Math.round((this.height + gap / 2) / grid) || 1;
        const cols = Math.round((this.width + gap / 2) / grid) || 1;
        let count = rows * cols;
        const maxInstances = this.maxInstances || count;
        const useCulling = !!this.maxInstances;
        this.count = count;
        const realWidth = grid * cols;
        const realHeight = grid * rows;
        this.realHeight = realHeight;
        this.realWidth = realWidth;
        const container = new THREE.Group();
        const gridX = realWidth / cols;
        const gridZ = realHeight / rows;
        const max = Math.max(mWidth, mHeight);
        const scaleFit = (grid - gap) / max;
        this.scaleFit = scaleFit;
        const color = new THREE.Color(this.color);
        const dummy = new THREE.Object3D();
        const maxZ = this.height - mHeight * scaleFit * 1.5;
        const maxX = this.width - mWidth * scaleFit * 1.5;
        let randomData = [];

        let finalCount = count;
        for (let z = 0; z < rows; z++) {
            for (let x = 0; x < cols; x++) {
                const posx = x * gridX;
                const posz = z * gridZ;
                //Random Data
                const randomX = this.randomPosition ? (this.pseudoRandom - 0.5) * maxX : 0;
                const randomZ = this.randomPosition ? (this.pseudoRandom - 0.5) * maxZ : 0;
                const offsetx = -gap / 2 + randomX; //gap//(mWidth*scaleFit-gridX)/2;
                const offsetz = -gap / 2 + randomZ; //gap//(mHeight*scaleFit-gridZ)/2;
                const finalX = this.randomPosition ? offsetx : posx + offsetx;
                const finalZ = this.randomPosition ? offsetz : posz + offsetz;
                const randomColor = this.randomColor ? this.pseudoRandom : 0;
                const randomRotation = this.randomRotation ? this.pseudoRandom * Math.PI * 2 : 0;
                const randomDepth = this.randomDepth ? this.pseudoRandom : 1;
                const randomScale = this.randomScale ? this.pseudoRandom : 1;
                const displacementRandom = this.displacementMap ? this.pseudoRandom - 0.5 : 0;
                ///////////////////////////////////////////////////////////
                const randomFrag = { randomColor, randomRotation, randomDepth, randomScale, offsetx, offsetz };
                if (this.displacementMap) {
                    const keep = this.getPixel(this.displacementMap, finalX / realWidth, finalZ / realHeight).r / 255 < displacementRandom;
                    if (!keep) {
                        finalCount--;
                        randomData.push(null);
                        continue;
                    }
                }
                randomData.push(randomFrag);
            }
        }

        count = finalCount;

        this._processModel(object, textureOrMat, isPBR, color);
        object.scale.set(scaleFit, scaleFit, scaleFit);
        const instBoxSize = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
        this.instancedBBSize = instBoxSize;
        const baseScale = object.scale.clone();
        object.traverse((child) => {
            if (child.isMesh) {
                //generate instanceed
                const instancedMesh = new THREE.InstancedMesh(child.geometry, child.material, maxInstances);
                const positionsArray = new Float32Array(maxInstances);
                const depthArray = new Float32Array(maxInstances);
                const instanceData = [];
                this._instances.push({ mesh: instancedMesh, data: instanceData });
                instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                let i = 0;
                let j = 0;
                for (let z = 0; z < rows; z++) {
                    for (let x = 0; x < cols; x++) {
                        if (!randomData[i]) {
                            i++;
                            continue;
                        }
                        const { randomColor, randomRotation, randomDepth, randomScale, offsetx, offsetz } = randomData[i];
                        const newScale = baseScale.clone().multiplyScalar(randomScale);
                        newScale.y *= this.yScale * randomDepth;
                        object.scale.copy(newScale);
                        child.getWorldPosition(dummy.position);
                        child.getWorldQuaternion(dummy.quaternion);
                        child.getWorldScale(dummy.scale);
                        object.scale.copy(baseScale);
                        if (this.randomPosition) {
                            dummy.position.set(dummy.position.x + offsetx, dummy.position.y, dummy.position.z + offsetz);
                        } else {
                            dummy.position.set(dummy.position.x + x * gridX + offsetx, dummy.position.y, dummy.position.z + z * gridZ + offsetz);
                        }
                        //dummy.scale.set(randomScale*child.scale.x*scaleFit,randomDepth*randomScale*child.scale.y*scaleFit*this.yScale,randomScale*child.scale.z*scaleFit);
                        dummy.rotation.set(dummy.rotation.x, dummy.rotation.y + randomRotation, dummy.rotation.z);
                        positionsArray[j] = -999999999999999;
                        depthArray[j] = 0;
                        if (this.enableGravity !== "none") {
                            const realTarget = dummy.position.clone();
                            realTarget.add(new THREE.Vector3(-this.width / 2 + gridX / 2 + this.center.x, 0 + this.center.y, -this.height / 2 + gridZ / 2 + this.center.z));
                            realTarget.y = this.center.y;
                            const rcTarget = realTarget.clone();
                            rcTarget.y -= 10;
                            const collision = raycaster.computeSightCollisionFrom3DPositions(realTarget, rcTarget, "move", false, false, false, true);

                            if (collision) {
                                positionsArray[j] = collision[0].point.y;
                                dummy.position.y -= collision[0].distance + 0.01;
                                if (this.enableGravity === "gravityRotation") {
                                    dummy.rotation.set(collision[0].face.normal.x, collision[0].face.normal.y, collision[0].face.normal.z);
                                    dummy.rotateOnAxis(collision[0].face.normal, randomRotation);
                                }
                            }
                        }

                        dummy.updateMatrix();
                        let color;
                        if (this.randomColor) {
                            //const color = child.material.color.clone();
                            color = new THREE.Color(this.color);
                            const hsl = color.getHSL({});
                            hsl.l /= randomColor;
                            color.setHSL(hsl.h, hsl.s, hsl.l);
                        }
                        if (useCulling) {
                            const world = dummy.getWorldPosition(new THREE.Vector3());
                            //world.sub(new THREE.Vector3(-this.width / 2 + gridX / 2, 0, -this.height / 2 + gridZ / 2)).sub(this.center)
                            instanceData.push({ worldPosition: world, matrix: dummy.matrix.clone(), color: color ?? "#ffffff", bottom: positionsArray[j], depth: depthArray[j] });
                        }

                        if (j > maxInstances) {
                            i++;
                            j++;
                            continue;
                        }
                        if (color) instancedMesh.setColorAt(j, color);
                        instancedMesh.setMatrixAt(j, dummy.matrix);
                        i++;
                        j++;
                    }
                }
                instancedMesh.geometry.setAttribute("shader_instance_position", new THREE.InstancedBufferAttribute(positionsArray, 1, false));
                instancedMesh.geometry.setAttribute("shader_instance_depth", new THREE.InstancedBufferAttribute(depthArray, 1, false));
                instancedMesh.instanceMatrix.needsUpdate = true;
                if (this.randomColor) instancedMesh.instanceColor.needsUpdate = true;
                instancedMesh.position.set(-this.width / 2 + gridX / 2, 0, -this.height / 2 + gridZ / 2);
                instancedMesh.geometry.computeBoundsTree();
                container.add(instancedMesh);
            }
        });
        this.mesh = container;
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = this.castShadow;
                child.receiveShadow = true;
                child.geometry.computeBoundsTree();
            }
        });
        this.mesh.position.set(this.center.x, this.center.y, this.center.z);
        this.mesh.rotation.set(this.tiltX, -this.angle * this.rotSign, this.tiltZ);
        this.mesh.userData.hitbox = this.mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        if (this._destroyed) return;
        this._parent.scene.add(this.mesh);

        this.initBoundingBox(mDepth * scaleFit);
    }

    async initMerged() {
        this._instances = [];
        const model = await this.getModel();
        const mergedMatrix = this.mergedMatrix;
        const count = mergedMatrix.length;
        const maxInstances = this.maxInstances || count;
        const useCulling = !!this.maxInstances;

        this.isInstanced = true;
        const color = new THREE.Color(this.color);
        const { textureOrMat, isPBR } = await this.getTextureOrMat();
        const object = game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter); //model.scene
        this.applyNoise(object);
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        this.count = count;
        this._processModel(object, textureOrMat, isPBR, color);

        const baseScale = object.scale.clone();
        const baseRotation = object.rotation.clone();
        const basePosition = object.position.clone();
        const container = new THREE.Group();

        const objectsToInstanciate = [];
        object.traverse((child) => {
            if (child.isMesh) {
                objectsToInstanciate.push(child);
            }
        });

        const dummy = new THREE.Object3D();

        const avgWidth = mergedMatrix.reduce((a, b) => a + b.width, 0) / count;
        const avgHeight = mergedMatrix.reduce((a, b) => a + b.height, 0) / count;
        const avgDepth = mergedMatrix.reduce((a, b) => a + b.depth, 0) / count;
        this.instancedBBSize = new THREE.Vector3(avgWidth, avgDepth, avgHeight);

        for (const obj of objectsToInstanciate) {
            if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
            const objBB = obj.geometry.boundingBox;
            const geoSizeY = objBB.max.y - objBB.min.y;
            const instancedMesh = new THREE.InstancedMesh(obj.geometry, obj.material, maxInstances);
            const positionsArray = new Float32Array(maxInstances);
            const depthArray = new Float32Array(maxInstances);

            const instanceData = [];

            this._instances.push({ mesh: instancedMesh, data: instanceData });

            for (let i = 0; i < count; i++) {
                const matrix = mergedMatrix[i];
                object.scale.copy(new THREE.Vector3((matrix.width * baseScale.x) / mWidth, (matrix.depth * baseScale.y) / mDepth, (matrix.height * baseScale.z) / mHeight));
                const newSize = new THREE.Box3().setFromObject(object);
                const newWidth = newSize.max.x - newSize.min.x;
                const newHeight = newSize.max.z - newSize.min.z;
                const newDepth = newSize.max.y - newSize.min.y;
                object.rotation.copy(new THREE.Euler(Math.toRadians(matrix.tiltX), Math.toRadians(-matrix.rotation), Math.toRadians(matrix.tiltZ)));
                object.position.copy(new THREE.Vector3(matrix.x + newWidth / 2, matrix.z, matrix.y + newHeight / 2));
                const size = new THREE.Box3().setFromObject(object);
                const bottom = new THREE.Vector3(0, size.min.y, 0);
                obj.getWorldPosition(dummy.position);
                obj.getWorldQuaternion(dummy.quaternion);
                obj.getWorldScale(dummy.scale);
                object.scale.copy(baseScale);
                object.position.copy(basePosition);
                object.rotation.copy(baseRotation);
                dummy.updateMatrix();
                const world = new THREE.Vector3();
                dummy.getWorldPosition(world);
                if (useCulling) instanceData.push({ worldPosition: world, matrix: dummy.matrix.clone(), color: matrix.color ?? "#ffffff", bottom: bottom.y, depth: size.max.y - size.min.y });

                if (count > maxInstances) continue;
                positionsArray[i] = bottom.y;
                depthArray[i] = size.max.y - size.min.y;
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.setColorAt(i, new THREE.Color(matrix.color ?? "#ffffff"));
            }

            instancedMesh.geometry.setAttribute("shader_instance_position", new THREE.InstancedBufferAttribute(positionsArray, 1, false));
            instancedMesh.geometry.setAttribute("shader_instance_depth", new THREE.InstancedBufferAttribute(depthArray, 1, false));
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.geometry.computeBoundsTree();
            instancedMesh.castShadow = this.castShadow;
            instancedMesh.receiveShadow = true;
            instancedMesh.position.set(-this.width / 2, 0, -this.height / 2);
            instancedMesh.scale.set(this.width / this.originalDimensions.width, this.depth / this.originalDimensions.depth, this.height / this.originalDimensions.height);
            container.add(instancedMesh);
        }
        this.mesh = container;

        this.mesh.position.set(this.center.x, this.center.y, this.center.z);
        this.mesh.rotation.set(this.tiltX, -this.angle * this.rotSign, this.tiltZ);

        this.mesh.userData.hitbox = this.mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        if (this._destroyed) return;
        this._parent.scene.add(this.mesh);
        this.scaleFit = 1;
        this.initBoundingBox(baseScale.y * mDepth);
    }

    updateInstancedCulling() {
        if (!this.maxInstances || !this._instances) return;
        for (const instance of this._instances) {
            const mesh = instance.mesh;
            const data = instance.data;
            const dLength = data.length;
            for (let i = 0; i < dLength; i++) {
                data[i].distSquared = Math.round(data[i].worldPosition.distanceToSquared(this._parent.camera.position));
            }

            data.sort((a, b) => a.distSquared - b.distSquared);
            let currentInstanceIndex = 0;
            const positionsArray = new Float32Array(this.maxInstances);
            const depthArray = new Float32Array(this.maxInstances);
            for (let i = 0; i < data.length; i++) {
                if (currentInstanceIndex >= this.maxInstances) break;
                const d = data[i];
                mesh.setMatrixAt(currentInstanceIndex, d.matrix);
                mesh.setColorAt(currentInstanceIndex, new THREE.Color(d.color));
                positionsArray[currentInstanceIndex] = d.bottom;
                depthArray[currentInstanceIndex] = d.depth;
                currentInstanceIndex++;
            }
            mesh.geometry.setAttribute("shader_instance_position", new THREE.InstancedBufferAttribute(positionsArray, 1, false));
            mesh.geometry.setAttribute("shader_instance_depth", new THREE.InstancedBufferAttribute(depthArray, 1, false));
            mesh.instanceMatrix.needsUpdate = true;
            //mesh.instanceColor.needsUpdate = true;
            mesh.geometry.attributes.shader_instance_position.needsUpdate = true;
            mesh.geometry.attributes.shader_instance_depth.needsUpdate = true;
        }
    }

    async _initMerged() {
        const model = await this.getModel();
        const mergedMatrix = this.mergedMatrix;

        this.isInstanced = true;
        const color = new THREE.Color(this.color);
        const { textureOrMat, isPBR } = await this.getTextureOrMat();
        const object = game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter); //model.scene
        this.applyNoise(object);
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        const count = mergedMatrix.length;
        this.count = count;
        this._processModel(object, textureOrMat, isPBR, color);

        const baseScale = object.scale.clone();
        const baseRotation = object.rotation.clone();
        const basePosition = object.position.clone();
        const container = new THREE.Group();

        const objectsToInstanciate = [];
        object.traverse((child) => {
            if (child.isMesh) {
                objectsToInstanciate.push(child);
            }
        });

        const dummy = new THREE.Object3D();

        const avgWidth = mergedMatrix.reduce((a, b) => a + b.width, 0) / count;
        const avgHeight = mergedMatrix.reduce((a, b) => a + b.height, 0) / count;
        const avgDepth = mergedMatrix.reduce((a, b) => a + b.depth, 0) / count;
        this.instancedBBSize = new THREE.Vector3(avgWidth, avgDepth, avgHeight);

        for (const obj of objectsToInstanciate) {
            if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
            const objBB = obj.geometry.boundingBox;
            const geoSizeY = objBB.max.y - objBB.min.y;
            const instancedMesh = new THREE.InstancedMesh(obj.geometry, obj.material, count);
            const positionsArray = new Float32Array(count);
            const depthArray = new Float32Array(count);

            for (let i = 0; i < count; i++) {
                const matrix = mergedMatrix[i];
                object.scale.copy(new THREE.Vector3((matrix.width * baseScale.x) / mWidth, (matrix.depth * baseScale.y) / mDepth, (matrix.height * baseScale.z) / mHeight));
                const newSize = new THREE.Box3().setFromObject(object);
                const newWidth = newSize.max.x - newSize.min.x;
                const newHeight = newSize.max.z - newSize.min.z;
                const newDepth = newSize.max.y - newSize.min.y;
                object.rotation.copy(new THREE.Euler(Math.toRadians(matrix.tiltX), Math.toRadians(-matrix.rotation), Math.toRadians(matrix.tiltZ)));
                object.position.copy(new THREE.Vector3(matrix.x + newWidth / 2, matrix.z, matrix.y + newHeight / 2));
                const size = new THREE.Box3().setFromObject(object);
                const bottom = new THREE.Vector3(0, size.min.y, 0);
                obj.getWorldPosition(dummy.position);
                obj.getWorldQuaternion(dummy.quaternion);
                obj.getWorldScale(dummy.scale);
                object.scale.copy(baseScale);
                object.position.copy(basePosition);
                object.rotation.copy(baseRotation);
                dummy.updateMatrix();
                const world = new THREE.Vector3();
                dummy.getWorldPosition(world);
                positionsArray[i] = bottom.y;
                depthArray[i] = size.max.y - size.min.y;
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.setColorAt(i, new THREE.Color(matrix.color ?? "#ffffff"));
            }

            instancedMesh.geometry.setAttribute("shader_instance_position", new THREE.InstancedBufferAttribute(positionsArray, 1, false));
            instancedMesh.geometry.setAttribute("shader_instance_depth", new THREE.InstancedBufferAttribute(depthArray, 1, false));
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.geometry.computeBoundsTree();
            instancedMesh.castShadow = this.castShadow;
            instancedMesh.receiveShadow = true;
            instancedMesh.position.set(-this.width / 2, 0, -this.height / 2);
            instancedMesh.scale.set(this.width / this.originalDimensions.width, this.depth / this.originalDimensions.depth, this.height / this.originalDimensions.height);
            container.add(instancedMesh);
        }
        this.mesh = container;

        this.mesh.position.set(this.center.x, this.center.y, this.center.z);
        this.mesh.rotation.set(this.tiltX, -this.angle * this.rotSign, this.tiltZ);

        this.mesh.userData.hitbox = this.mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        if (this._destroyed) return;
        this._parent.scene.add(this.mesh);
        this.scaleFit = 1;
        this.initBoundingBox(baseScale.y * mDepth);
    }
    async getModel() {
        const isMapgen = this.dynaMesh === "mapGen" && this.mapgen;
        if (this.dynaMesh != "default" && !isMapgen) {
            let decalData = {};
            if (this.dynaMesh === "decal") {
                const position = new THREE.Vector3(this.center.x, this.center.y, this.center.z);
                const target3d = new THREE.Group();
                //const targetp = position.clone();
                const raycastTarget = new THREE.Object3D();
                raycastTarget.position.y = -999999;
                target3d.add(raycastTarget);
                target3d.rotation.set(this.tiltX, -this.angle * this.rotSign, this.tiltZ);
                const targetp = raycastTarget.getWorldPosition(new THREE.Vector3());
                //targetp.y -= 999999;
                const intersects = this._parent.interactionManager.computeSightCollisionFrom3DPositions(position, targetp, "move", false, false, false, true);
                if (!intersects[0]) {
                    this.dynaMesh = "box";
                } else {
                    const intersect = intersects[0];
                    const rotation = new THREE.Matrix4();
                    rotation.lookAt(position, intersect.point, new THREE.Vector3(0, 1, 0));
                    const euler = new THREE.Euler().setFromRotationMatrix(rotation);
                    const dummy = new THREE.Object3D();
                    dummy.rotation.copy(euler);
                    dummy.updateMatrix();
                    dummy.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -this.angle * this.rotSign);
                    dummy.updateMatrix();
                    let mesh = intersect.object;
                    if (mesh.isInstancedMesh) mesh = getMergedMeshFromInstanced(mesh);
                    decalData = { mesh: mesh, position: intersect.point, rotation: dummy.rotation };
                }
            }
            const dynamesh = new DynaMesh(this.dynaMesh, { font: this.font, image: this.imageTexture, text: this.gtflPath, width: this.width, height: this.height, depth: this.depth, resolution: this.dynaMeshResolution, decalData, data: this.mapMakerMesh });
            if (this.dynaMesh == "paper") this.pathTraced = true;
            const mesh = await dynamesh.create();
            return {
                scene: mesh,
                object: mesh,
                model: mesh,
            };
        }
        const filePath = this.gtflPath;
        const extension = filePath?.split(".")?.pop()?.toLowerCase();
        const model = isMapgen ? await this.computeMapGen() : await game.Levels3DPreview.helpers.loadModel(this.gtflPath);
        if (model) {
            game.Levels3DPreview.helpers.groundModel(model.model, this.autoGround, this.autoCenter);
            let hasTags = false;
            model.model.traverse((child) => {
                if (child?.userData?.sight !== undefined || child?.userData?.collision !== undefined || child?.userData?.cameraCollision !== undefined || child?.userData?.isDoor !== undefined) {
                    hasTags = true;
                }
            });
            this.hasTags = hasTags;
            if (this.hasTags) {
                model.model.traverse((child) => {
                    if (child?.userData?.sight === undefined) {
                        child.userData.sight = this.sight;
                    }
                    if (child?.userData?.collision === undefined) {
                        child.userData.collision = this.collision;
                    }
                    if (child?.userData?.cameraCollision === undefined) {
                        child.userData.cameraCollision = this.cameraCollision;
                    }
                });
            }
            return model;
        }
        //make 1x1 cube
        const errText = isMapgen ?
            game.i18n.localize("levels3dpreview.errors.nomapgencells") + " Tile: " + this.tile.id :
            game.i18n.localize("levels3dpreview.errors.filenotsupported") + "(" + extension + "): " + filePath + " Tile: " + this.tile.id;
        console.error(errText);
        notifyTileLoadError(errText);
        const obj = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        obj.geometry.computeBoundingBox();
        return { scene: obj, model: obj, object: obj };
    }

    async getTextureOrMat(texture, options = {}) {
        if (!texture) texture = this.imageTexture;
        let textureOrMat = null;
        let isPBR = null;
        if (!texture) return { textureOrMat, isPBR };
        textureOrMat = await this._parent.helpers.autodetectTextureOrMaterial(texture, { getMatClone: true, noCache: this.flipY, doubleSided: this.doubleSided, ...options });
        isPBR = this._parent.helpers.isPBR(texture);
        if (isPBR) {
            Object.values(textureOrMat).forEach((v) => this.setTexture(v));
        } else {
            this.setTexture(textureOrMat);
        }
        if (textureOrMat) return { textureOrMat, isPBR };
        return { textureOrMat, isPBR };
    }

    _processModel(object, textureOrMat, isPBR, color) {
        const setMaterial = (mat) => {
            if (this.color) {
                const tint = materialTints.get(mat.color) ?? { base: mat.color.clone(), count: 0 };
                tint.count++;
                materialTints.set(mat.color, tint);
                mat.color.set(mat.color.multiply(color));
            }
            if (this.color && mat.emissiveMap) mat.emissive = color;
            if (textureOrMat && !isPBR) mat.map = textureOrMat;
            mat.needsUpdate = true;
        };
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = this.castShadow;
                child.receiveShadow = true;
                try {
                    child.geometry.computeBoundsTree();
                } catch (e) {
                    console.error("Failed to compute bounds tree for tile: " + this.tile.id + " Error: " + e);
                }

                if (child.material instanceof Array) {
                    for (let i = 0; i < child.material.length; i++) {
                        if (isPBR) child.material[i] = textureOrMat;
                        setMaterial(child.material[i]);
                    }
                } else {
                    if (isPBR) child.material = textureOrMat;
                    setMaterial(child.material);
                }
            }
        });
    }

    setTexture(tex) {
        if (this.flipY && tex?.image) {
            tex.flipY = false;
        }
        if (!this.repeatTexture || !tex?.image) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        //tex.repeat.set(this.textureRepeat, this.textureRepeat);
        return;
    }

    setRepeat() {
        const uvMatrix = new THREE.Matrix3().set(this.textureRepeat, 0, 0, 0, this.textureRepeat, 0, 0, 0, 1);
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                const materials = child.material instanceof Array ? child.material : [child.material];
                materials.forEach((m) => applyLegacyUvMatrix(m, uvMatrix));
            }
        });
    }

    computeWorldBoundingBox() {
        const boundingBox = this.controlledBox?.geometry?.boundingBox;
        if (!boundingBox) return (this._worldBoundingBox = new THREE.Box3());
        const worldBoundingBox = new THREE.BoxGeometry(boundingBox.max.x - boundingBox.min.x, boundingBox.max.y - boundingBox.min.y, boundingBox.max.z - boundingBox.min.z);
        const hasParent = this.controlledBox.parent;
        this.mesh.add(this.controlledBox);
        this.controlledBox.updateMatrixWorld();
        worldBoundingBox.applyMatrix4(this.controlledBox.matrixWorld);
        worldBoundingBox.computeBoundingBox();
        this._worldBoundingBox = worldBoundingBox.boundingBox;
        if (!hasParent) this.mesh.remove(this.controlledBox);
    }

    setTransmissionIor() {
        const ior = this.tile.document.getFlag("levels-3d-preview", "ior") ?? -0.01;
        const transmission = this.tile.document.getFlag("levels-3d-preview", "transmission") ?? -0.01;
        if (ior === -0.01 || transmission === -0.01) return;
        const convertToPhysical = (mat) => {
            const newMat = new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                transmission: 1,
                opacity: 1,
                metalness: 0,
                roughness: 0,
                ior: 1.5,
                thickness: 0.01,
                specularIntensity: 1,
                specularColor: 0xffffff,
                envMapIntensity: 1,
                lightIntensity: 1,
                exposure: 1,
            });
            newMat.map = mat.map;
            newMat.color = mat.color;
            newMat.emissive = mat.emissive;
            newMat.roughness = mat.roughness;
            newMat.metalness = mat.metalness;

            newMat.ior = ior;
            newMat.transmission = transmission;
            newMat.specularIntensity = 1;
            return newMat;
        };

        this.mesh.traverse((child) => {
            if (child.isMesh) {
                if (child.material instanceof Array) {
                    for (let i = 0; i < child.material.length; i++) {
                        child.material[i] = convertToPhysical(child.material[i]);
                    }
                } else {
                    child.material = convertToPhysical(child.material);
                }
            }
        });
    }

    updateMapMakerTerrain() {
        const data = this.tile.document.getFlag("levels-3d-preview", "mapMakerMesh");
        if (data?.k !== "terrain" || this.mapMakerMesh?.k !== "terrain") return false;
        let state = null;
        this.mesh?.traverse((child) => (state ??= child.mapMakerTerrain ?? null));
        if (!state?.update(data)) return false;
        this.mapMakerMesh = data;
        this._terrainWorkerSync ??= foundry.utils.debounce(() => {
            if (!this.mesh) return;
            this.sendToWorker();
            if (this._parent._tableFloor !== elevationFloor()) this._parent.createTable();
        }, 500);
        state._queue.then(this._terrainWorkerSync);
        return true;
    }

    updateScatter() {
        const scatter = this.tile.document.getFlag("levels-3d-preview", "scatter");
        if (!this.scatterField || !(scatter?.set || scatter?.items)) return false;
        this.scatterData = scatterDefaults(scatter);
        this.scatterField.dataChanged();
        return true;
    }

    setShading() {
        if (this.shading == "default") return;
        const flatShading = this.shading == "flat";
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                if (child.material instanceof Array) {
                    child.material.forEach((m) => (m.flatShading = flatShading));
                } else {
                    child.material.flatShading = flatShading;
                }
            }
        });
    }

    setSides() {
        if (this.sides == "default") return;
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                if (child.material instanceof Array) {
                    child.material.forEach((m) => (m.side = THREE[this.sides]));
                } else {
                    child.material.side = THREE[this.sides];
                }
            }
        });
    }

    setMRT() {
        this.mesh.traverse((child) => {
            if (child.isMesh && !(child.material instanceof Array)) {
                if (!materialSurfaces.has(child.material)) materialSurfaces.set(child.material, { roughness: child.material.roughness, metalness: child.material.metalness });
                if (this.metalness >= 0) child.material.metalness = this.metalness;
                if (this.roughness >= 0) child.material.roughness = this.roughness;
                if (this.transparency >= 0 && this.transparency < 1) {
                    child.material.transparent = true;
                    child.material.opacity = this.transparency;
                    child.material.alphaTest = 0.01;
                }
                if (this.alphaClip >= 0) {
                    child.material.alphaTest = this.alphaClip;
                }
            }
        });
    }

    setPathTraced() {
        if (this.pathTraced) {
            const customBlendMap = "#ifdef USE_MAP\n\tvec4 texelColor = texture2D( map, vMapUv );\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, texelColor.rgb, texelColor.a);\n#endif";
            this.mesh.traverse((child) => {
                if (child.isMesh && !(child.material instanceof Array)) {
                    child.material.onBeforeCompile = (shader) => {
                        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", customBlendMap);
                    };
                }
            });
        }
    }

    setVertexColors() {
        this.mesh.traverse((child) => {
            if (child.isMesh && !(child.material instanceof Array) && child.geometry.attributes.color) {
                child.material.vertexColors = true;
            }
        });
    }

    initBoundingBox(depth) {
        let box;
        if (this.fillType === "tile" || this.mergedMatrix) {
            //const sizeBox = new THREE.Box3().setFromObject(obj);
            const v1 = new THREE.Vector3(0, 0, 0);
            const v2 = new THREE.Vector3(this.width, depth * this.scaleFit * this.yScale, this.height);
            box = new THREE.Box3(v1, v2);
        } else {
            box = new THREE.Box3().setFromObject(this.mesh);
        }
        const c = new THREE.Color();
        c.set(CONFIG.Canvas.dispositionColors.CONTROLLED);
        if (isNaN(this.depth)) this.depth = box.max.z - box.min.z;
        this.bb = {
            width: this.tile.document.width / factor,
            depth: this.fillType === "tile" || this.mergedMatrix ? depth : box.max.y - box.min.y, //this.depth,
            height: this.tile.document.height / factor,
        };
        const cube = new THREE.Mesh(new THREE.BoxGeometry(this.tile.document.width / factor, this.fillType === "tile" ? depth : this.depth, this.tile.document.height / factor), new THREE.MeshBasicMaterial({ color: c, wireframe: true }));
        cube.position.set(0, this.fillType === "tile" ? depth / 2 : this.depth / 2, 0);
        if (this.isPlane) cube.rotation.set(-Math.PI / 2, 0, 0);
        cube.geometry.computeBoundingBox();
        this.controlledBox = cube;
    }

    updateControls() {
        if (!this.mesh?.parent) return;
        const controls = this._parent.transformControls;
        const gizmoEnabled = this._parent.interactionManager._gizmoEnabled;
        if (!gizmoEnabled) {
            return controls.detach();
        }
        if (this.tile.controlled && !this.tile.document.locked) controls.attach(this._parent.controlledGroup);
        if (!canvas.activeLayer?.controlled?.length) controls.detach();
    }

    updateFromTransform(snap = false) {
        const controls = this._parent.transformControls;
        controls.detach();
        this.updatePositionFrom3D(!snap);
    }

    processRotation(update, tile) {
        const worldRotation = new THREE.Euler().setFromQuaternion(this.mesh.getWorldQuaternion(new THREE.Quaternion()));

        const currentTiltX = worldRotation.x;
        const currentTiltZ = worldRotation.z;
        const currentTiltY = worldRotation.y;

        let newTiltX = Math.round(Math.toDegrees(currentTiltX % (Math.PI * 2)));
        let newTiltZ = Math.round(Math.toDegrees(currentTiltZ % (Math.PI * 2)));
        let newTiltY = Math.round(Math.toDegrees((-currentTiltY * this.rotSign + 0) % (Math.PI * 2)));

        if (newTiltX === -180 && newTiltZ === -180 && newTiltY === 0) {
            newTiltX = 0;
            newTiltZ = 0;
            newTiltY += 180;
        }

        update.rotation = newTiltY;
        update.flags["levels-3d-preview"].tiltX = newTiltX;
        update.flags["levels-3d-preview"].tiltZ = newTiltZ;
    }

    processScale(update, tile) {
        const scale = this.mesh.getWorldScale(new THREE.Vector3()).divide(this._sizeScale);
        const scaleX = scale.x;
        const scaleZ = scale.z;
        const scaleY = scale.y;
        const newWidth = this.tile.document.width * scaleX;
        const newHeight = this.tile.document.height * scaleZ;
        const newDepth = this.depth * factor * scaleY;
        const x = (update.x ?? this.x) - (0.5 - this.anchorX) * (newWidth - this.tile.document.width);
        const z = (update.y ?? this.y) - (0.5 - this.anchorY) * (newHeight - this.tile.document.height);

        update.x = Math.round(x);
        update.y = Math.round(z);
        update.width = newWidth;
        update.height = newHeight;
        update.flags["levels-3d-preview"].depth = Math.round(newDepth);
    }

    toggleBoundingBox() {
        const state = tileFrameState(this);
        if (!state && !this.frame3d) return;
        (this.frame3d ??= new TileFrame(this)).update(state);
    }

    setHidden() {
        if (!game.user.isGM || !this.tile.document.hidden) return;
        this.forEachRenderMaterial((material) => {
            if (this._hiddenMaterials.has(material)) return;
            const { transparent, opacity, alphaTest, depthWrite, format } = material;
            this._hiddenMaterials.set(material, { transparent, opacity, alphaTest, depthWrite, format });
            Object.assign(material, { transparent: true, opacity: opacity * 0.5, alphaTest: 0, depthWrite: false, format: THREE.RGBAFormat });
            material.needsUpdate = true;
        });
    }

    restoreHidden() {
        for (const [material, state] of this._hiddenMaterials) {
            Object.assign(material, state);
            material.needsUpdate = true;
        }
        this._hiddenMaterials.clear();
    }

    forEachRenderMesh(fn) {
        const skip = new Set([this.controlledBox, this.sightMesh, this._decalCone].filter(Boolean));
        const visit = (object) => {
            if (skip.has(object)) return;
            if (object.isMesh) fn(object);
            object.children.forEach(visit);
        };
        visit(this.mesh);
    }

    forEachRenderMaterial(fn) {
        const seen = new Set();
        this.forEachRenderMesh((mesh) => {
            for (const material of [mesh.material].flat()) {
                if (!material || seen.has(material)) continue;
                seen.add(material);
                fn(material, mesh);
            }
        });
    }

    _onAnimationLoop(delta) {
        this.updateVisibility(delta);
        this.scatterField?.update();
        if (this.onAnimation) {
            try {
                this.onAnimation(delta);
            } catch (e) {
                console.error(e);
            }
        }
    }

    updateVisibility(time) {
        if (!this.mesh) return;
        this.updateInstancedCulling();
        this.toggleBoundingBox();
        this.mesh.visible = !this.tile.document.hidden || game.user.isGM;
        if (this.sightMesh) this.sightMesh.visible = false;
        if (this._decalCone) this._decalCone.visible = !!canvas?.tiles?.active;
        if (game.Levels3DPreview.mirrorLevelsVisibility && this.tile.mesh && !this.tile._preview) {
            this.mesh.visible = !this.tile.mesh?.visible ? false : this.tile.visible;
        }
        if (this._parent.hiddenTiles?.has(this.tile.document.id)) this.mesh.visible = false;
    }

    async updatePositionFrom3D(transform = false) {
        this.skipMoveAnimation = true;
        const worldPosition = this.mesh.getWorldPosition(new THREE.Vector3());
        const x3d = worldPosition.x;
        const y3d = worldPosition.y;
        const z3d = worldPosition.z;
        const x = x3d * factor + this.tile.document.width * (this.tile.document.texture.anchorX - 0.5);
        const y = z3d * factor + this.tile.document.height * (this.tile.document.texture.anchorY - 0.5);
        const z = (y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size;
        const useSnapped = tileSnapActive() && !transform;
        const snapped = canvas.tiles.getSnappedPoint({ x, y });
        const elevation = this.tile.document.elevation;
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        const deltas = {
            x: dest.x - this.tile.document.x,
            y: dest.y - this.tile.document.y,
            elevation: dest.elevation - elevation,
        };
        let updates = [];
        let tile = this.tile;
        const update = {
            _id: tile.id,
            x: tile.document.x + deltas.x,
            y: tile.document.y + deltas.y,
            elevation: elevation + deltas.elevation,
            flags: {
                "levels-3d-preview": {
                    wasFreeMode: this.wasFreeMode,
                },
            },
        };
        this.processScale(update, tile);
        this.processRotation(update, tile);

        tileUpdateQueue.add(update);
        return true;
    }

    initShaders() {
        this._parent.shaderHandler.applyShader(this.mesh, this, this.shaders);
    }

    async preloadShaderTextures() {
        await this._parent.shaderHandler.preloadTextures(this.shaders);
    }

    getNoise(x, y) {
        return FractionalBrownianMotion(x, y, this.noiseFn, this.noiseParams);
    }

    applyDisplacement(model) {
        if (!this.displacementMap) return;
        model.traverse((c) => {
            if (c.isMesh) {
                c.geometry = c.geometry.clone();
                const positionAttributes = c.geometry.getAttribute("position");
                //const uvAttributes = c.geometry.getAttribute("uv");
                //const normals = c.geometry.getAttribute("normal");
                const count = positionAttributes.count;
                const maxX = c.geometry.boundingBox.max.x;
                const minX = c.geometry.boundingBox.min.x;
                const maxZ = c.geometry.boundingBox.max.z;
                const minZ = c.geometry.boundingBox.min.z;
                const minY = c.geometry.boundingBox.min.y;
                for (let i = 0; i < count; i++) {
                    /*const normal = new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i));
                    const d = 1 - this.getPixel(this.displacementMap, uvAttributes.getX(i), uvAttributes.getY(i)).r / 255;
                    const position = new THREE.Vector3(positionAttributes.getX(i), positionAttributes.getY(i), positionAttributes.getZ(i));
                    const disp = normal.multiplyScalar(d * this.displacementIntensity);
                    position.add(disp);
                    positionAttributes.setX(i, position.x);
                    positionAttributes.setY(i, position.y);
                    positionAttributes.setZ(i, position.z);
                    continue;*/

                    const x = positionAttributes.getX(i);
                    const z = positionAttributes.getZ(i);
                    //if(x===maxX || x===minX || z===maxZ || z===minZ) continue;
                    const xPercent = (x - minX) / (maxX - minX);
                    const zPercent = (z - minZ) / (maxZ - minZ);
                    const displacement = 1 - this.getPixel(this.displacementMap, xPercent, zPercent).r / 255;
                    let y = positionAttributes.getY(i);
                    if (y <= minY) continue;
                    if (minY < 0) y -= minY;
                    y *= displacement * this.displacementIntensity; // += displacement * this.noiseParams.height;
                    if (minY < 0) y += minY;
                    positionAttributes.setY(i, y);
                }
                c.geometry.computeVertexNormals();
                c.geometry.normalizeNormals();
                c.geometry.computeTangents();
                c.geometry.attributes.position.needsUpdate = true;
                c.geometry.attributes.normal.needsUpdate = true;
            }
            if (c.computeSmartUVs) c.computeSmartUVs();
        });
    }

    applyNoise(model) {
        if (this.noiseType === "none") return;
        model.traverse((c) => {
            if (c.isMesh) {
                c.geometry = c.geometry.clone();
                const positionAttributes = c.geometry.getAttribute("position");
                const count = positionAttributes.count;
                for (let i = 0; i < count; i++) {
                    let x = positionAttributes.getX(i);
                    let y = positionAttributes.getY(i);
                    let z = positionAttributes.getZ(i);
                    y += this.getNoise(x, z);
                    positionAttributes.setY(i, y);
                }
                c.geometry.computeVertexNormals();
                c.geometry.normalizeNormals();
                c.geometry.computeTangents();
                c.geometry.computeBoundingBox();
                c.geometry.attributes.position.needsUpdate = true;
                c.geometry.attributes.normal.needsUpdate = true;
            }
        });
    }

    getDisplacementData(image) {
        if (!image) return false;
        if (game.Levels3DPreview._heightmapCache[image?.src]) return game.Levels3DPreview._heightmapCache[image.src];
        if (image == this.displacementCanvas) return this.displacementCanvas.getContext("2d").getImageData(0, 0, this.displacementCanvas.width, this.displacementCanvas.height);
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const imagedata = context.getImageData(0, 0, image.width, image.height);
        game.Levels3DPreview._heightmapCache[image.src] = imagedata;
        return imagedata;
    }

    get heightmapMatrix() {
        if (this._heightmapMatrix) return this._heightmapMatrix;
        try {
            const string = this.displacementMatrix;
            const matrix = string.split(",").map((s) => parseFloat(s));
            this._heightmapMatrix = {
                offsetX: matrix[0] || 0,
                offsetY: matrix[1] || 0,
                scaleX: matrix[2] || 1,
                scaleY: matrix[3] || 1,
            };
            return this._heightmapMatrix;
        } catch (error) {
            console.error("Error parsing heightmap matrix", error);
            return {
                offsetX: 0,
                offsetY: 0,
                scaleX: 1,
                scaleY: 1,
            };
        }
    }

    getPixel(imagedata, x, y) {
        const matrix = this.heightmapMatrix;
        x *= imagedata.width / matrix.scaleX;
        y *= imagedata.height / matrix.scaleY;
        x = parseInt(x + matrix.offsetX * imagedata.width);
        y = parseInt(y + matrix.offsetY * imagedata.height);
        x = x % imagedata.width;
        y = y % imagedata.height;
        var position = (x + imagedata.width * y) * 4,
            data = imagedata.data;
        if (this.invertDisplacementMap) {
            return { r: 255 - data[position], g: 255 - data[position + 1], b: 255 - data[position + 2], a: 255 - data[position + 3] };
        } else {
            return { r: data[position], g: data[position + 1], b: data[position + 2], a: data[position + 3] };
        }
    }

    async destroy(isUpdate = false) {
        this._destroyed = true;
        this.renderFlags.clear();
        delete this._parent.tiles[this.tile.id];
        if (!isUpdate) this._parent.workers.removeMesh(this.tile.id);
        this.scatterField?.dispose();
        this.frame3d?.destroy();
        if (!this.mesh) return;
        if (!isUpdate) await this.popOut();
        this.mesh.removeFromParent();
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.dispose?.();
                child.geometry?.dispose?.();
            }
        });
    }

    isToFar(mesh) {
        mesh = mesh ?? this.mesh;
        if (game.user.isGM) return false;
        const maxDist = (canvas.dimensions.size * 3) / factor;
        let minDist = Infinity;
        for (let token of canvas.tokens.controlled) {
            const token3d = this._parent.tokens[token.id];
            if (!token3d) continue;
            const dist = token3d.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(mesh.getWorldPosition(new THREE.Vector3()));
            if (dist < minDist) minDist = dist;
        }
        return minDist > maxDist;
    }

    triggerMATT(e, type) {
        if (this.tile.document.checkClick) {
            const point = e?.position3D ? coords3d.pos3DToCanvas(e.position3D) : game.Levels3DPreview.interactionManager.canvas3dMousePosition;
            const t = this.tile.document.checkClick(point, type);
            if (t) this.tile.document.trigger(t.args);
        }
    }

    callInteractiveSocket(eventId) {
        if (!this.isInteractiveDynaMesh) return;
        const isFn = interactiveDynamesh[this.dynaMesh][eventId];
        if (!isFn) return;
        const firstGm = game.users.find((u) => u.isGM && u.active);
        if (!firstGm) return ui.notifications.error(game.i18n.localize("levels3dpreview.errors.nogm"));
        Socket.executeInteractiveDynamesh({ users: [firstGm.id], uuid: this.document.uuid, eventId });
    }

    checkPuzzleLock() {
        if (!CONFIG.PuzzleLocks) return true;
        if (CONFIG.PuzzleLocks.isLocked(this.document)) {
            CONFIG.PuzzleLocks.unlock(this.document.uuid);
            return false;
        }
        return true;
    }

    _onClickLeft(e) {
        const oT = e.originalIntersect?.userData;
        const doorInSight = this.doorInSight();
        if (doorInSight && oT?.isDoor && canvas.activeLayer.options.objectClass.embeddedName === "Token" && !(oT?.isSecret && !game.user.isGM)) {
            if (this.isToFar(e.originalIntersect)) ui.notifications.error(game.i18n.localize("levels3dpreview.errors.toofarfromdoor"));
            else if (game.paused && !game.user.isGM) ui.notifications.warn("GAME.PausedWarning", { localize: true });
            else Socket.toggleDoor({ tileId: this.tile.id, sceneId: canvas.scene.id, userId: game.user.id, subDoorId: oT.doorId });
        }

        if (doorInSight && canvas.activeLayer.options.objectClass.embeddedName === "Token" && this.isDoor && !(this.isSecret && !game.user.isGM)) {
            if (this.isToFar()) ui.notifications.error(game.i18n.localize("levels3dpreview.errors.toofarfromdoor"));
            else if (game.paused && !game.user.isGM) ui.notifications.warn("GAME.PausedWarning", { localize: true });
            else {
                if (this.checkPuzzleLock()) Socket.toggleDoor({ tileId: this.tile.id, sceneId: canvas.scene.id, userId: game.user.id });
            }
        }
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") {
            this.callInteractiveSocket("clickLeft");
            this.triggerMATT(e, "click");
        } else {
            this.tile._onClickLeft(e);
        }
    }

    _setDoorState() { }

    _onClickLeft2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") {
            this.callInteractiveSocket("clickLeft2");
            this.triggerMATT(e, "dblclick");
        } else {
            this.tile._onClickLeft(e);
            this.tile._onClickLeft2(e);
        }
    }

    _onClickRight(e) {
        const oT = e.originalIntersect?.userData;
        if (canvas.activeLayer.options.objectClass.embeddedName === "Token" && game.user.isGM) {
            if (oT?.isDoor) {
                const subDoorId = oT.doorId;
                const ds = this.tile.document.getFlag("levels-3d-preview", `modelDoors.${subDoorId}`)?.ds ?? 0;
                const isLocked = ds == 2;

                if (isLocked) this.tile.document.setFlag("levels-3d-preview", `modelDoors.${subDoorId}.ds`, 0);
                else this.tile.document.setFlag("levels-3d-preview", `modelDoors.${subDoorId}.ds`, 2);
            }
            if (this.isDoor) {
                if (this.isLocked) this.tile.document.setFlag("levels-3d-preview", "doorState", 0);
                else this.tile.document.setFlag("levels-3d-preview", "doorState", 2);
            }
        }
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") {
            this.callInteractiveSocket("clickRight");
            this.triggerMATT(e, "rightclick");
            return;
        }
        const event = e;
        this.tile._onClickRight(event);
    }

    _onClickRight2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") {
            this.callInteractiveSocket("clickRight2");
            this.triggerMATT(e, "dblrightclick");
            return;
        }
        const event = e;
        this.tile._onClickRight2(event);
    }

    doorInSight() {
        if (!canvas.visibility?.tokenVision) return true;
        const point = this._parent.interactionManager?._mouseHoverIntersect?.intersect?.point;
        if (!point) return true;
        const sources = canvas.effects.visionSources.filter((source) => source.active);
        if (!sources.length) return game.user.isGM;
        const lights = canvas.effects.lightSources.filter((light) => light.active);
        const x = point.x * factor;
        const y = point.z * factor;
        const t = canvas.dimensions.size / 4;
        return [[x, y], [x - t, y], [x + t, y], [x, y - t], [x, y + t]].some(([px, py]) => sources.some((source) => source.shape?.contains(px, py) || (source.los?.contains(px, py) && lights.some((light) => light.shape?.contains(px, py)))));
    }

    get isDoorHover() {
        const isGM = game.user.isGM;
        const MATTPointer = this.tile.document.flags["monks-active-tiles"]?.pointer;
        const isHoverable = this.isDoor || this.highlightOnHover || MATTPointer;
        if (isGM && isHoverable) return true;
        if (!isGM && isHoverable && !this.isSecret) return true;
        return false;
    }
    //hoverin
    _onHoverIn(e) {
        if (!canvas.activeLayer) return;
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") {
            this.triggerMATT(e, "hoverin");
            if (this.isDoorHover && this.doorInSight()) {
                game.Levels3DPreview.outline.toggleHovered(this.mesh, true, 1);
                this._parent.setCursor("pointer");
            }
            return;
        }
        const event = e;
        this.placeable._onHoverIn(event);
        this._parent.setCursor("pointer");
    }

    _onHoverOut(e) {
        if (!canvas.activeLayer) return;
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") {
            this.triggerMATT(e, "hoverout");
            if (this.isDoorHover) {
                game.Levels3DPreview.outline.toggleHovered(this.mesh, false, 1);
            }
        }
        const event = e;
        this.placeable._onHoverOut(event);
        this._parent.setCursor("auto");
    }

    getMeshStats() {
        let vertices = 0;
        let faces = 0;
        let meshes = 0;
        let instances = this.count || "-";
        let status = "green";
        this.mesh.traverse((child) => {
            if (child.isMesh && !child.userData.noShaders) {
                meshes++;
                vertices += child.geometry.attributes.position.count;
                faces += child.geometry.index.count / 3;
            }
        });

        if (vertices > 100000) status = "yellow";
        if (meshes > 10) status = "yellow";
        if (instances > 1000) status = "yellow";
        if (vertices > 1000000) status = "red";
        if (meshes > 50) status = "red";
        if (instances > 10000) status = "red";

        return { vertices, faces, meshes, instances, status, merged: !!this.mergedMatrix };
    }

    async getMapGenMat(matData) {
        const bevelSize = parseFloat(this.mapgen.bevel);
        let textureOrMat = null;
        let isPBR = null;
        if (!matData.texture.src) return null;
        textureOrMat = await this._parent.helpers.autodetectTextureOrMaterial(matData.texture.src);
        isPBR = this._parent.helpers.isPBR(matData.texture.src);
        let mat;

        if (!textureOrMat) return null;
        if (isPBR) mat = textureOrMat.clone();
        else mat = new THREE.MeshStandardMaterial({ map: textureOrMat });

        mat.color = new THREE.Color(matData.texture.tint || 0xffffff);
        mat.userData.bevelSize = bevelSize;
        mat.userData.tex_repeat = matData.texture.repeat ?? 1;
        mat.roughness = matData.roughness ?? 1;
        mat.metalness = matData.metalness ?? 0;
        mat.emissiveIntensity = matData.emissive ?? 0;
        if (matData.emissive) {
            mat.emissiveColor = new THREE.Color(matData.texture.tint || 0xffffff);
            mat.emissiveMap = mat.map;
        }
        mat.opacity = matData.opacity ?? 1;
        mat.transparent = matData.opacity < 1;
        mat.customProgramCacheKey = () => {
            return "mapgen_shader";
        };
        mat.onBeforeCompile = (shader) => {
            applyLegacyUv(shader);
            shader.uniforms.bevelSize = { value: bevelSize };
            shader.uniforms.tex_repeat = { value: matData.texture.repeat ?? 1 };
            shader.vertexShader = "attribute float shader_cell_size;\nuniform float tex_repeat;\nuniform float bevelSize;\nattribute float shader_random_rotation;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
            #ifdef USE_UV
            vUv *= tex_repeat;
            if(normal.y < 0.5){
                vUv.y = vUv.y*shader_cell_size;
            }
            //rotate UVs
            float angle = shader_random_rotation;
            float s = sin(angle);
            float c = cos(angle);
            vec2 c_uv = vUv;
            vUv.x = c_uv.x * c - c_uv.y * s;
            vUv.y = c_uv.x * s + c_uv.y * c;
            #endif
            if(transformed.y < 1.0 && transformed.y > 0.5){
                transformed.y = transformed.y + (bevelSize - bevelSize/shader_cell_size);
            }
            if(transformed.y < 0.5 && transformed.y > 0.0){
                transformed.y = transformed.y - (bevelSize - bevelSize/shader_cell_size);
            }
            `,
            );
        };
        return mat;
    }

    async computeMapGen() {
        if (canvas.scene.grid.type > 1) return await this.computeMapGenHex();
        const mapgen = this.mapgen;
        const materials = {};
        const bevel = parseFloat(mapgen.bevel);
        const mesh = new THREE.Group();
        for (let matData of mapgen.materials) {
            if (!matData.materialId || !matData?.texture?.src) continue;
            const mat = await this.getMapGenMat(matData);
            if (mat) materials[matData.materialId] = mat;
        }
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, 1);
        shape.lineTo(1, 1);
        shape.lineTo(1, 0);
        shape.lineTo(0, 0);

        const extrudeSettings = {
            steps: 1,
            depth: 1 - bevel * 2,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelOffset: -bevel,
            bevelSegments: 1,
        };

        const baseGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        baseGeometry.rotateX(-Math.PI / 2);
        baseGeometry.translate(0, +bevel, 0);

        const cellsByMaterial = {};
        Object.keys(materials).forEach((key) => (cellsByMaterial[key] = []));
        const rows = mapgen.rows;
        const cols = mapgen.columns;
        const dummy = new THREE.Object3D();
        let minElevation = 0;
        let maxElevation = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = mapgen.cells[r][c];
                cell.col = c;
                cell.row = r;
                if (parseFloat(cell.elevation) <= 0) continue;
                if (!cellsByMaterial[cell.materialId]) continue;
                cellsByMaterial[cell.materialId].push(cell);
                if (parseFloat(cell.elevation) < minElevation) minElevation = parseFloat(cell.elevation);
                if (parseFloat(cell.elevation) > maxElevation) maxElevation = parseFloat(cell.elevation);
            }
        }

        this.count = 0;

        for (const [matId, cells] of Object.entries(cellsByMaterial)) {
            const mat = materials[matId];
            const cellCount = cells.length;
            this.count += cellCount;
            if (!mat || !cellCount) continue;
            const cellSizeArray = new Float32Array(cellCount);
            const matData = mapgen.materials.find((m) => m.materialId === matId);
            const randomRotationArray = new Float32Array(cellCount);
            const instancedMesh = new THREE.InstancedMesh(baseGeometry.clone(), mat, cellCount);
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            for (let i = 0; i < cellCount; i++) {
                const cell = cells[i];
                const x = cell.col * 1;
                const y = cell.row * 1;
                dummy.position.set(x, 0, y);
                dummy.scale.set(1, parseFloat(cell.elevation), 1);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
                cellSizeArray[i] = parseFloat(cell.elevation);
                randomRotationArray[i] = matData.texture.rotate ? this.rawPseudoRandom * Math.PI * 2 : 0;
            }
            instancedMesh.geometry.setAttribute("shader_cell_size", new THREE.InstancedBufferAttribute(cellSizeArray, 1, false));
            instancedMesh.geometry.setAttribute("shader_random_rotation", new THREE.InstancedBufferAttribute(randomRotationArray, 1, false));
            mesh.add(instancedMesh);
        }
        const depth = maxElevation - minElevation;
        const bb = new THREE.Mesh(new THREE.BoxGeometry(cols, depth, rows), new THREE.MeshBasicMaterial({ wireframe: true, color: 0x000000 }));
        bb.visible = false;
        bb.position.set(cols / 2, +depth / 2, rows / 2 - 1);
        bb.userData.collision = false;
        bb.userData.cameraCollision = false;
        bb.userData.sight = false;
        bb.userData.ignoreHover = true;
        bb.userData.noIntersect = true;
        bb.userData.noShaders = true;
        mesh.add(bb);
        const object = new THREE.Group();
        mesh.position.set(-cols / 2, 0, -rows / 2 + 1);
        object.add(mesh);
        if (this.count <= 0) return;
        return { scene: object, model: object, object: object };
    }

    async computeMapGenHex() {
        const mapgen = this.mapgen;
        const materials = {};
        const bevel = parseFloat(mapgen.bevel);
        const mesh = new THREE.Group();
        for (let matData of mapgen.materials) {
            if (!matData.materialId || !matData?.texture?.src) continue;
            const mat = await this.getMapGenMat(matData);
            if (mat) materials[matData.materialId] = mat;
        }
        const h = 2;
        const w = Math.sqrt(3);
        const flatTop = canvas.scene.grid.type > 3;
        const shape = new THREE.Shape();
        if (flatTop) {
            shape.moveTo(0, w / 2);
            shape.lineTo(h / 4, 0);
            shape.lineTo((h * 3) / 4, 0);
            shape.lineTo(h, w / 2);
            shape.lineTo((h * 3) / 4, w);
            shape.lineTo(h / 4, w);
        } else {
            shape.moveTo(0, h / 4);
            shape.lineTo(w / 2, 0);
            shape.lineTo(w, h / 4);
            shape.lineTo(w, (h * 3) / 4);
            shape.lineTo(w / 2, h);
            shape.lineTo(0, (h * 3) / 4);
        }

        const extrudeSettings = {
            steps: 1,
            depth: 1 - bevel * 2,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelOffset: -bevel,
            bevelSegments: 1,
        };

        const baseGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        baseGeometry.rotateX(-Math.PI / 2);
        baseGeometry.translate(0, +bevel, 0);

        const cellsByMaterial = {};
        Object.keys(materials).forEach((key) => (cellsByMaterial[key] = []));
        const rows = mapgen.rows;
        const cols = mapgen.columns;
        const dummy = new THREE.Object3D();
        let minElevation = 0;
        let maxElevation = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = mapgen.cells[r][c];
                cell.col = c;
                cell.row = r;
                if (parseFloat(cell.elevation) <= 0) continue;
                if (!cellsByMaterial[cell.materialId]) continue;
                cellsByMaterial[cell.materialId].push(cell);
                if (parseFloat(cell.elevation) < minElevation) minElevation = parseFloat(cell.elevation);
                if (parseFloat(cell.elevation) > maxElevation) maxElevation = parseFloat(cell.elevation);
            }
        }

        this.count = 0;

        for (const [matId, cells] of Object.entries(cellsByMaterial)) {
            const mat = materials[matId];
            const cellCount = cells.length;
            this.count += cellCount;
            if (!mat || !cellCount) continue;
            const cellSizeArray = new Float32Array(cellCount);
            const matData = mapgen.materials.find((m) => m.materialId === matId);
            const randomRotationArray = new Float32Array(cellCount);
            const instancedMesh = new THREE.InstancedMesh(baseGeometry.clone(), mat, cellCount);
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            for (let i = 0; i < cellCount; i++) {
                const cell = cells[i];
                let x, y;
                if (flatTop) {
                    x = (cell.col * h * 3) / 4;
                    y = cell.row * w + ((cell.col % 2) * w) / 2;
                } else {
                    x = cell.col * w;
                    y = (cell.row * h * 3) / 4;
                    const isOdd = cell.row % 2;
                    if (isOdd) x += w / 2;
                }
                dummy.position.set(x, 0, y);
                dummy.scale.set(1, parseFloat(cell.elevation), 1);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
                cellSizeArray[i] = parseFloat(cell.elevation);
                randomRotationArray[i] = matData.texture.rotate ? this.rawPseudoRandom * Math.PI * 2 : 0;
            }
            instancedMesh.geometry.setAttribute("shader_cell_size", new THREE.InstancedBufferAttribute(cellSizeArray, 1, false));
            instancedMesh.geometry.setAttribute("shader_random_rotation", new THREE.InstancedBufferAttribute(randomRotationArray, 1, false));
            mesh.add(instancedMesh);
        }
        const depth = maxElevation - minElevation;
        const bbW = flatTop ? (cols * h * 3) / 4 + (h * 1) / 4 : cols * w + w / 2;
        const bbH = flatTop ? rows * w + w / 2 : (rows * h * 3) / 4 + (h * 1) / 4;
        const bb = new THREE.Mesh(new THREE.BoxGeometry(bbW, depth, bbH), new THREE.MeshBasicMaterial({ wireframe: true, color: 0x000000 }));
        bb.visible = false;
        if (flatTop) {
            bb.position.set(bbW / 2, +depth / 2, bbH / 2 - w);
        } else {
            bb.position.set(bbW / 2, +depth / 2, bbH / 2 - h);
        }
        bb.userData.collision = false;
        bb.userData.cameraCollision = false;
        bb.userData.sight = false;
        bb.userData.ignoreHover = true;
        bb.userData.noIntersect = true;
        bb.userData.noShaders = true;
        mesh.add(bb);
        const object = new THREE.Group();
        mesh.position.set(-bbW / 2 + (flatTop ? 0 : 0), 0, -bbH / 2 + (flatTop ? w : h));
        object.add(mesh);
        if (this.count <= 0) return;
        return { scene: object, model: object, object: object };
    }

    static RENDER_FLAGS = {
        redraw: {},
        refreshState: {},
        refreshTransform: { propagate: ["refreshPosition", "refreshRotation", "refreshSize"], alias: true },
        refreshPosition: {},
        refreshElevation: { propagate: ["refreshPosition"] },
        refreshRotation: {},
        refreshSize: { propagate: ["refreshPosition"] },
        refreshHidden: {},
        refreshMaterial: {},
        refreshShadows: {},
        refreshShaders: {},
        refreshCollision: {},
        refreshParticles: {},
        refreshAnimation: {},
        refreshDoor: {},
        refreshModelDoors: {},
        refreshMapMaker: {},
        refreshScatter: {},
    };

    static CORE_RENDER_KEYS = {
        x: "refreshPosition",
        y: "refreshPosition",
        elevation: "refreshElevation",
        "shape.anchorX": "refreshPosition",
        "shape.anchorY": "refreshPosition",
        rotation: "refreshRotation",
        width: "refreshSize",
        height: "refreshSize",
        hidden: "refreshHidden",
        alpha: "refreshMaterial",
        "texture.tint": "refreshState",
        locked: "refreshState",
        sort: "refreshState",
    };

    static FLAG_RENDER_KEYS = {
        tiltX: "refreshRotation",
        tiltZ: "refreshRotation",
        depth: "refreshSize",
        color: "refreshMaterial",
        roughness: "refreshMaterial",
        metalness: "refreshMaterial",
        castShadow: "refreshShadows",
        shaders: "refreshShaders",
        collision: "refreshCollision",
        cameraCollision: "refreshCollision",
        sight: "refreshCollision",
        ParticleType: "refreshParticles",
        ParticleSprite: "refreshParticles",
        ParticleScale: "refreshParticles",
        ParticleColor: "refreshParticles",
        ParticleColor2: "refreshParticles",
        ParticleIntensity: "refreshParticles",
        enableParticleHidden: "refreshParticles",
        paused: "refreshAnimation",
        animIndex: "refreshAnimation",
        animSpeed: "refreshAnimation",
        animationOnce: "refreshAnimation",
        doorState: "refreshDoor",
        modelDoors: "refreshModelDoors",
        mapMakerMesh: "refreshMapMaker",
        scatter: "refreshScatter",
        wasFreeMode: "refreshState",
    };

    static STATE_FLAG_SCOPES = new Set(["monks-active-tiles"]);

    static getRenderFlags(changes) {
        const flags = {};
        for (const key of Object.keys(foundry.utils.flattenObject(changes))) {
            const flag = Tile3D.getRenderFlag(key);
            if (flag) flags[flag] = true;
        }
        return flags;
    }

    static getRenderFlag(key) {
        const path = key.split(".").map((part) => part.replace(/^(-=|==)/, ""));
        if (path[0] === "_id" || path[0] === "_stats") return null;
        if (path[0] !== "flags") return Tile3D.CORE_RENDER_KEYS[path.slice(0, 2).join(".")] ?? Tile3D.CORE_RENDER_KEYS[path[0]] ?? "redraw";
        if (path[1] === "levels-3d-preview") return Tile3D.FLAG_RENDER_KEYS[path[2]] ?? "redraw";
        return Tile3D.STATE_FLAG_SCOPES.has(path[1]) ? "refreshState" : "redraw";
    }

    static redrawTile(document, moved = false) {
        const parent = game.Levels3DPreview;
        const current = parent.tiles[document.id];
        const hasGravity = (document.getFlag("levels-3d-preview", "enableGravity") ?? "none") !== "none";
        if (hasGravity && current?.isGravity) return recomputeGravityDebounced();
        current?.destroy(true);
        if (!document.object) return void delete parent.tiles[document.id];
        const tile3d = new Tile3D(document.object, parent, true);
        parent.tiles[document.id] = tile3d;
        tile3d.load().then(() => {
            if (moved) recomputeGravityDebounced();
        });
    }

    applyRenderFlags() {
        if (!this.renderFlags.size) return;
        const flags = this.renderFlags.clear();
        if (this._destroyed || this._parent.tiles[this.document.id] !== this || !game.Levels3DPreview?._active) return;
        const moved = !!(flags.refreshPosition || flags.refreshRotation || flags.refreshSize);
        try {
            if (flags.redraw || !this.canRefresh(flags)) return Tile3D.redrawTile(this.document, moved);
            this.refresh(flags, moved);
        } catch (e) {
            console.error(`3D Canvas: partial refresh failed for Tile ${this.document.id}, rebuilding`, e);
            Tile3D.redrawTile(this.document, moved);
        }
    }

    get hasDoors() {
        return this.isDoor || !foundry.utils.isEmpty(this._doors ?? {});
    }

    canRefresh(flags) {
        if (!this._loaded || !this.mesh) return false;
        if (this.scatterField) return Object.keys(flags).every((flag) => flag === "refreshScatter" || flag === "refreshState");
        const moved = flags.refreshPosition || flags.refreshRotation || flags.refreshSize;
        if (moved && !this.canTransform()) return false;
        if (flags.refreshSize && !this.canResize()) return false;
        if ((flags.refreshMaterial || flags.refreshHidden) && this.hasDoors) return false;
        if (flags.refreshMaterial && !this.canRefreshMaterial()) return false;
        if (flags.refreshCollision && (this.hasTags || !foundry.utils.isEmpty(this._doors ?? {}))) return false;
        if (flags.refreshShaders && !this.canRefreshShaders()) return false;
        return true;
    }

    canTransform() {
        const flags = this.document.flags["levels-3d-preview"] ?? {};
        if (this.isGravity || flags.dynaMesh === "decal" || this._decal || this.mapMakerMesh?.k === "terrain" || flags.doorClip) return false;
        return Math.sign(this.document.width) === (this.mirrorX ? -1 : 1) && Math.sign(this.document.height) === (this.mirrorY ? -1 : 1);
    }

    canResize() {
        const depth = this.document.getFlag("levels-3d-preview", "depth") / factor;
        if (!this._baseSize?.width || !this._baseSize?.height) return false;
        if (this.isPlane) return true;
        if (!(depth > 0) || !(this._baseSize.depth > 0)) return false;
        if (this.dynaMesh !== "default" || !this.gtflPath || this.fillType !== "stretch" || this.mergedMatrix || this.isInstanced || this.hasDoors) return false;
        if (this.displacementMap || this.noiseType !== "none" || this.offset.lengthSq() > 0) return false;
        return !Object.values(this.shaders ?? {}).some((shader) => shader?.enabled);
    }

    canRefreshMaterial() {
        const color = this.document.getFlag("levels-3d-preview", "color") ?? "#ffffff";
        const roughness = this.document.getFlag("levels-3d-preview", "roughness") ?? -0.01;
        const metalness = this.document.getFlag("levels-3d-preview", "metalness") ?? -0.01;
        let valid = true;
        if (color !== this.color) {
            if (this.isInstanced && this.randomColor && !this.mergedMatrix) return false;
            this.forEachRenderMaterial((material) => (valid &&= !material.color || materialTints.has(material.color)));
        }
        if (roughness !== this.roughness || metalness !== this.metalness) {
            this.forEachRenderMesh((mesh) => (valid &&= !Array.isArray(mesh.material) && materialSurfaces.has(mesh.material)));
        }
        return valid;
    }

    canRefreshShaders() {
        const handler = this._parent.shaderHandler;
        const next = this.readShaders();
        if (!game.settings.get("levels-3d-preview", "enableShaders")) handler.disablePerformanceHeavyShaders(next);
        const enabled = (shaders) => Object.keys(shaders).filter((id) => shaders[id]?.enabled).sort().join();
        if (enabled(next) !== enabled(this.shaders) || handler.blankTextureKey(next) !== handler.blankTextureKey(this.shaders)) return false;
        return Object.keys(next).every((id) => {
            const config = handler.shaderLib[id];
            return !next[id]?.enabled || !(config?.onApply || config?.onCompile || config?.cacheKey);
        });
    }

    refresh(flags, moved) {
        if (flags.refreshMapMaker && !this.updateMapMakerTerrain()) return Tile3D.redrawTile(this.document, moved);
        if (flags.refreshScatter && !this.updateScatter()) return Tile3D.redrawTile(this.document, moved);
        if (flags.refreshSize) this.refreshSize();
        if (moved) this.refreshTransform();
        if (flags.refreshCollision) this.refreshCollision();
        if (flags.refreshShadows) this.refreshShadows();
        if (flags.refreshMaterial || flags.refreshHidden) {
            this.restoreHidden();
            if (flags.refreshMaterial) this.refreshMaterial();
            this.setHidden();
        }
        if (flags.refreshShaders) this.refreshShaders();
        if (flags.refreshAnimation) this.refreshAnimation();
        if (flags.refreshDoor) this.refreshDoor();
        if (flags.refreshModelDoors) this.setDoorsMaterials(true);
        if (flags.refreshParticles || ((moved || flags.refreshHidden) && this.particleData.type != "none")) this.refreshParticles();
        if (flags.refreshState) this.wasFreeMode = this.document.getFlag("levels-3d-preview", "wasFreeMode") ?? false;
        if (moved || flags.refreshCollision) this.sendToWorker();
        if (moved || flags.refreshCollision || flags.refreshHidden) this.refreshInteraction();
        if (flags.refreshElevation || flags.refreshMaterial || flags.refreshHidden || flags.refreshShadows || flags.refreshShaders) this.invalidateBatches();
        if (moved && Object.values(this._parent.tiles).some((tile3d) => tile3d.isGravity)) recomputeGravityDebounced();
        if (moved && this.tile.controlled) this._parent.interactionManager.setControlledGroup();
        this.updateControls();
    }

    refreshSize() {
        const document = this.document;
        this.width = Math.abs(document.width / factor);
        this.height = Math.abs(document.height / factor);
        const base = this._baseSize;
        if (this.isPlane) this._sizeScale.set(this.width / base.width, this.height / base.height, 1);
        else {
            this.depth = document.getFlag("levels-3d-preview", "depth") / factor;
            this._sizeScale.set(this.width / base.width, this.depth / base.depth, this.height / base.height);
        }
        this.mesh.scale.copy(this._sizeScale);
        if (this.bb) Object.assign(this.bb, { width: document.width / factor, height: document.height / factor, depth: this.isPlane ? this.bb.depth : this.depth });
    }

    refreshTransform() {
        const document = this.document;
        const mesh = this.mesh;
        this.bottom = document.elevation;
        this.angle = Math.toRadians(document.rotation);
        this.tiltX = Math.toRadians(document.getFlag("levels-3d-preview", "tiltX") ?? 0);
        this.tiltZ = Math.toRadians(document.getFlag("levels-3d-preview", "tiltZ") ?? 0);
        this.center2d = { x: this.x + Math.abs(document.width) / 2, y: this.y + Math.abs(document.height) / 2 };
        this.center = coords3d.posCanvasTo3d({ x: this.center2d.x, y: this.center2d.y, z: this.bottom });
        if (mesh.parent === this._parent.controlledGroup) this._parent.scene.add(mesh);
        mesh.position.set(this.center.x, this.center.y, this.center.z);
        if (this.isPlane) mesh.rotation.set(-Math.PI / 2 + (this.mirrorY ? Math.PI : 0), this.mirrorX ? Math.PI : 0, -this.angle * this.rotSign);
        else mesh.rotation.set(this.tiltX, -this.angle * this.rotSign, this.tiltZ);
        mesh.updateMatrixWorld(true);
        this.elevation3d = mesh.position.y;
        this.computeWorldBoundingBox();
    }

    refreshCollision() {
        const flag = (key, fallback) => this.document.getFlag("levels-3d-preview", key) ?? fallback;
        this.sight = flag("sight", true);
        this.collision = flag("collision", true);
        this.cameraCollision = flag("cameraCollision", false);
        if (this.isDoor && this.isOpen && [0, 4, 5].includes(this.doorStyle)) {
            this.sight = false;
            this.collision = false;
        }
    }

    refreshShadows() {
        this.castShadow = this.document.getFlag("levels-3d-preview", "castShadow") ?? true;
        if (this.isPlane) return;
        this.forEachRenderMesh((mesh) => (mesh.castShadow = this.castShadow));
    }

    refreshMaterial() {
        const flag = (key, fallback) => this.document.getFlag("levels-3d-preview", key) ?? fallback;
        const color = flag("color", "#ffffff");
        if (color !== this.color) {
            this.color = color;
            const tint = new THREE.Color(color);
            this.forEachRenderMaterial((material) => {
                const entry = material.color && materialTints.get(material.color);
                if (!entry) return;
                material.color.copy(entry.base);
                for (let i = 0; i < entry.count; i++) material.color.multiply(tint);
                if (color && material.emissiveMap) material.emissive = tint;
            });
        }
        this.roughness = flag("roughness", -0.01);
        this.metalness = flag("metalness", -0.01);
        this.forEachRenderMesh((mesh) => {
            const base = !Array.isArray(mesh.material) && materialSurfaces.get(mesh.material);
            if (!base) return;
            mesh.material.roughness = this.roughness >= 0 ? this.roughness : base.roughness;
            mesh.material.metalness = this.metalness >= 0 ? this.metalness : base.metalness;
        });
        this.opacity = this.document.alpha;
        if (this.isPlane && !this._planePBR && !(this.transparency >= 0 && this.transparency < 1)) this.mesh.material.opacity = this.opacity;
    }

    refreshShaders() {
        const handler = this._parent.shaderHandler;
        const next = this.readShaders();
        for (const id of Object.keys(this.shaders)) delete this.shaders[id];
        Object.assign(this.shaders, next);
        if (!game.settings.get("levels-3d-preview", "enableShaders")) handler.disablePerformanceHeavyShaders(this.shaders);
        for (const shader of handler.shaders) if (shader.entity3D === this) handler.setUniforms(shader, this.shaders);
        this.preloadShaderTextures();
    }

    refreshAnimation() {
        this.animSpeed = this.document.getFlag("levels-3d-preview", "animSpeed") ?? 1;
        this.animationOnce = this.document.getFlag("levels-3d-preview", "animationOnce") ?? false;
        this.setupAnimations();
    }

    refreshDoor() {
        this.setupDoor();
        if (this.doorStyle == 4 || this.doorStyle == 5) this.setupAnimations();
    }

    refreshParticles() {
        game.Levels3DPreview.particleSystem.stop(this.particleEffectId);
        this.particleEffect = null;
        this.particleData = this.getParticleData();
        if (this.particleData.type != "none") this.initParticle();
    }

    refreshInteraction() {
        const interactionManager = this._parent.interactionManager;
        if (!interactionManager) return;
        interactionManager._candidateCache = interactionManager._rayMemo = null;
        interactionManager.sightOccluders?.entries.clear();
        interactionManager.generateSightCollisions();
    }

    invalidateBatches() {
        const { kitBatcher, shadowBatcher } = this._parent;
        const id = this.document.id;
        kitBatcher?.splitter.drop(id);
        kitBatcher?.stale.add(this);
        const record = shadowBatcher?.records.get(id);
        if (record) record.stale = true;
    }

    static setHooks() {
        Hooks.on("updateTile", (tile, updates) => {
            if (!game.Levels3DPreview?._active || tile.parent !== game.scenes.viewed) return;
            const tile3d = game.Levels3DPreview.tiles[tile.id];
            if (!tile3d) return Tile3D.redrawTile(tile);
            tile3d.renderFlags.set(Tile3D.getRenderFlags(updates));
        });

        Hooks.on("createTile", (tile) => {
            if (game.Levels3DPreview?._active && tile.object) game.Levels3DPreview.createTile(tile.object);
        });

        Hooks.on("deleteTile", (tile) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.tiles[tile.id]?.destroy();
        });

        Hooks.on("pasteTile", (copy, data) => {
            if (game.Levels3DPreview?._active) {
                const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
                data.forEach((td) => {
                    const data3d = {
                        elevation: pos.z,
                    };
                    foundry.utils.mergeObject(td, data3d);
                });
            }
        });

        Hooks.on("renderTileHUD", (hud) => {
            if (!game.Levels3DPreview?._active) return;

            const tile3d = game.Levels3DPreview.tiles[hud.object.id];
            const isMerged = !!tile3d.mergedMatrix;
            const lockedButton = hud.element.querySelector(`[data-action="locked"]`);
            if (!isMerged && canvas.tiles.controlled.length > 1) {
                const mergeButton = document.createElement("button");
                mergeButton.className = "control-icon";
                mergeButton.dataset.action = "merge-tiles";
                mergeButton.innerHTML = `<i class="fas fa-object-group" title="Merge Tiles"></i>`;

                mergeButton.addEventListener("click", (e) => {
                    e.stopPropagation();
                    autoMergeTiles(canvas.tiles.controlled, false);
                });
                lockedButton.parentNode.insertBefore(mergeButton, lockedButton);
            } else if (isMerged) {
                const unmergeButton = document.createElement("button");
                unmergeButton.className = "control-icon";
                unmergeButton.dataset.action = "unmerge-tiles";
                unmergeButton.innerHTML = `<i class="fas fa-object-ungroup" title="Unmerge Tiles"></i>`;

                unmergeButton.addEventListener("click", (e) => {
                    e.stopPropagation();
                    unmergeTiles(canvas.tiles.controlled);
                });
                lockedButton.parentNode.insertBefore(unmergeButton, lockedButton);
            }

            const attachButton = document.createElement("button");
            attachButton.className = "control-icon";
            attachButton.dataset.action = "attach-tile";
            attachButton.innerHTML = `<i class="fas fa-link" title="Attach Tile to Token"></i>`;
            attachButton.addEventListener("click", (e) => {
                e.stopPropagation();
                attachTileToToken(hud.object, _token);
            });
            lockedButton.parentNode.insertBefore(attachButton, lockedButton);
            injectTileBakeButton(lockedButton);

            if (!tile3d?.isAnimated) return;

            const images = {
                pause: "fa-play",
                play: "fa-pause",
            };

            const isPaused = tile3d.paused;
            const titles = {
                pause: game.i18n.localize("levels3dpreview.tileHud.playAnimation"),
                play: game.i18n.localize("levels3dpreview.tileHud.pauseAnimation"),
            };

            const controlButton = document.createElement("button");
            controlButton.className = "control-icon";
            controlButton.dataset.action = "play-pause-3d";
            controlButton.innerHTML = `<i class="fas ${isPaused ? images.pause : images.play}" title="${isPaused ? titles.pause : titles.play}"></i>`;

            controlButton.addEventListener("click", (e) => {
                e.stopPropagation();
                const nowPaused = !hud.object.document.getFlag("levels-3d-preview", "paused");
                hud.object.document.setFlag("levels-3d-preview", "paused", nowPaused);
                const icon = controlButton.querySelector("i");
                icon.classList.toggle(images.play);
                icon.classList.toggle(images.pause);
                icon.title = nowPaused ? titles.pause : titles.play;
            });

            lockedButton.parentNode.insertBefore(controlButton, lockedButton);
        });

        Hooks.on("controlTile", (tile, controlled) => {
            if (!game.Levels3DPreview?._active || !game.user.isGM) return;
            Object.values(game.Levels3DPreview.tiles).forEach((tile3d) => {
                tile3d.updateControls();
            });
        });
    }

    static executeInteractiveDynamesh({ uuid, eventId }) {
        const tile = fromUuidSync(uuid);
        if (!tile) return;
        const tile3d = game.Levels3DPreview.tiles[tile.id];
        if (!tile3d) return;
        interactiveDynamesh[tile3d.dynaMesh][eventId].bind(tile3d)();
    }
}

export async function recomputeGravity() {
    const _parent = game.Levels3DPreview;
    const tiles = Object.values(_parent.tiles)
        .sort((a, b) => {
            return a.bottom - b.bottom;
        })
        .reverse();
    for (let tile3d of tiles) {
        const gravity = tile3d.isGravity;
        if (!gravity) continue;
        tile3d?.destroy();
    }
    for (let tile3d of tiles) {
        const gravity = tile3d.isGravity;
        if (!gravity) continue;
        const newTile = new Tile3D(tile3d.placeable, game.Levels3DPreview, true);
        await newTile.load();
        game.Levels3DPreview.tiles[tile3d.placeable.id] = newTile;
    }
    game.Levels3DPreview.interactionManager.setControlledGroup();
}

export const recomputeGravityDebounced = foundry.utils.debounce(recomputeGravity, 100);

export async function mergeTiles(tileDocuments) {
    const sameSource = tileDocuments.every((td) => td.flags["levels-3d-preview"]?.model3d === tileDocuments[0].flags["levels-3d-preview"]?.model3d);
    if (!sameSource) return ui.notifications.error("Tiles must have the same source to be merged");
    const baseData = tileDocuments[0].toObject();
    const instancesMatrix = [];
    const minXYZ = { x: Infinity, y: Infinity, z: Infinity };
    const maxXYZ = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let td of tileDocuments) {
        const tileX = td.x - td.width * td.texture.anchorX;
        const tileY = td.y - td.height * td.texture.anchorY;
        minXYZ.x = Math.min(minXYZ.x, tileX);
        minXYZ.y = Math.min(minXYZ.y, tileY);
        maxXYZ.x = Math.max(maxXYZ.x, tileX + td.width);
        maxXYZ.y = Math.max(maxXYZ.y, tileY + td.height);
        minXYZ.z = Math.min(minXYZ.z, td.elevation);
        maxXYZ.z = Math.max(maxXYZ.z, td.elevation + td.flags["levels-3d-preview"].depth);
    }
    baseData.x = minXYZ.x;
    baseData.y = minXYZ.y;
    baseData.width = maxXYZ.x - minXYZ.x;
    baseData.height = maxXYZ.y - minXYZ.y;
    baseData.texture ??= {};
    baseData.texture.anchorX = 0;
    baseData.texture.anchorY = 0;
    baseData.elevation = minXYZ.z;
    baseData.flags["levels-3d-preview"].depth = maxXYZ.z - minXYZ.z;

    for (let td of tileDocuments) {
        instancesMatrix.push({
            width: td.width / factor,
            height: td.height / factor,
            depth: td.flags["levels-3d-preview"].depth / factor,
            anchorX: td.texture.anchorX,
            anchorY: td.texture.anchorY,
            x: (td.x - td.width * td.texture.anchorX - minXYZ.x) / factor,
            y: (td.y - td.height * td.texture.anchorY - minXYZ.y) / factor,
            z: coords3d.unitsToPixels(td.elevation - minXYZ.z),
            color: td.flags["levels-3d-preview"].color ?? "#ffffff",
            rotation: td.rotation ?? 0,
            tiltX: td.flags["levels-3d-preview"].tiltX ?? 0,
            tiltZ: td.flags["levels-3d-preview"].tiltZ ?? 0,
        });
    }

    baseData.flags["levels-3d-preview"].mergedMatrix = instancesMatrix;
    baseData.flags["levels-3d-preview"].tiltX = 0;
    baseData.flags["levels-3d-preview"].tiltZ = 0;
    baseData.flags["levels-3d-preview"].color = "#ffffff";
    baseData.flags["levels-3d-preview"].originalDimensions = {
        width: baseData.width / factor,
        height: baseData.height / factor,
        depth: baseData.flags["levels-3d-preview"].depth / factor,
    };
    baseData.rotation = 0;

    await canvas.scene.createEmbeddedDocuments("Tile", [baseData]);
    await canvas.scene.deleteEmbeddedDocuments(
        "Tile",
        tileDocuments.map((td) => td.id),
    );
}

export async function autoMergeTiles(tiles = canvas.tiles.placeables, skipControlled = true) {
    const occlusionIdGroups = {
        noOcclusionId: [],
    };

    for (const tile of tiles) {
        const occlusionId = tile.document.flags?.betterroofs?.occlusionLinkId;
        if (occlusionId) {
            if (!occlusionIdGroups[occlusionId]) occlusionIdGroups[occlusionId] = [];
            occlusionIdGroups[occlusionId].push(tile);
        } else {
            occlusionIdGroups["noOcclusionId"].push(tile);
        }
    }

    for (const [oId, group] of Object.entries(occlusionIdGroups)) {
        mergeTileGroup(group, oId);
    }

    function mergeTileGroup(tileGroup, occlusionId) {
        const mergeTargets = {};
        let mergedCount = 0;
        for (const tile of tileGroup) {
            if (skipControlled && tile.controlled) continue;
            const tile3d = game.Levels3DPreview.tiles[tile.id];
            const isDoor = tile3d?.isDoor || Object.values(tile3d?._doors || {}).length > 0;
            if (isDoor) continue;
            const repeatTile = tile.document.flags["levels-3d-preview"]?.mergedMatrix || tile.document.getFlag("levels-3d-preview", "fillType") === "tile";
            if (repeatTile) continue;
            const model3d = tile.document.flags["levels-3d-preview"]?.model3d;
            const texture = tile.document.flags["levels-3d-preview"]?.imageTexture;
            const dynaMesh = tile.document.flags["levels-3d-preview"]?.dynaMesh;
            const heightmap = tile.document.flags["levels-3d-preview"]?.displacementMap;
            if (dynaMesh === "decal" || dynaMesh === "mapMaker") continue;
            if (heightmap) continue;
            const key = `${model3d}-${texture}-${dynaMesh}`;
            if (!model3d && (dynaMesh === "default" || !dynaMesh)) continue;
            if (!mergeTargets[key]) mergeTargets[key] = [];
            mergeTargets[key].push(tile.document);
        }

        Object.values(mergeTargets).forEach((tileDocumentArray) => (mergedCount += tileDocumentArray.length - 1));

        const occlusionIdText = occlusionId == "noOcclusionId" ? "" : game.i18n.localize("levels3dpreview.mergeTiles.occlusionGroup") + occlusionId;

        foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("levels3dpreview.mergeTiles.title") + occlusionIdText },
            content: game.i18n.localize(skipControlled ? "levels3dpreview.mergeTiles.content" : "levels3dpreview.mergeTiles.contentSelected").replace("%count%", mergedCount),
            defaultYes: false,
        }).then(async res => {
            if (res) await merge();
        });

        async function merge() {
            let mergedFinal = 0;
            for (const tileDocumentArray of Object.values(mergeTargets)) {
                if (tileDocumentArray.length < 2) continue;
                mergedFinal++;
                await mergeTiles(tileDocumentArray);
            }
            if (mergedCount) ui.notifications.info(`Merged ${mergedCount} tiles into ${mergedFinal} tiles.`);
        }
    }
}

function getUnmergedTileData(tile) {
    const instancesMatrix = tile.flags["levels-3d-preview"].mergedMatrix;
    const newTiles = [];
    const originalX = tile.x - tile.width * (tile.texture.anchorX ?? 0);
    const originalY = tile.y - tile.height * (tile.texture.anchorY ?? 0);
    const originalZ = tile.elevation;
    for (const instance of instancesMatrix) {
        const anchorX = instance.anchorX ?? 0;
        const anchorY = instance.anchorY ?? 0;
        const newTileData = tile.toObject();
        delete newTileData._id;
        delete newTileData.flags["levels-3d-preview"].mergedMatrix;
        delete newTileData.flags["levels-3d-preview"].originalDimensions;
        newTileData.width = instance.width * factor;
        newTileData.height = instance.height * factor;
        newTileData.x = (instance.x + instance.width * anchorX) * factor + originalX;
        newTileData.y = (instance.y + instance.height * anchorY) * factor + originalY;
        newTileData.texture.anchorX = anchorX;
        newTileData.texture.anchorY = anchorY;
        newTileData.elevation = (instance.z * factor) / (canvas.scene.dimensions.size / canvas.scene.dimensions.distance) + originalZ;
        newTileData.flags["levels-3d-preview"].depth = instance.depth * factor;
        newTileData.flags["levels-3d-preview"].color = instance.color;
        newTileData.rotation = instance.rotation;
        newTileData.flags["levels-3d-preview"].tiltX = instance.tiltX;
        newTileData.flags["levels-3d-preview"].tiltZ = instance.tiltZ;
        newTiles.push(newTileData);
    }
    return newTiles;
}

async function unmergeTileDocuments(tileDocuments) {
    const newTiles = tileDocuments.flatMap(getUnmergedTileData);
    const created = await canvas.scene.createEmbeddedDocuments("Tile", newTiles);
    if (created.length !== newTiles.length) {
        await canvas.scene.deleteEmbeddedDocuments(
            "Tile",
            created.map((td) => td.id),
        );
        ui.notifications.error(game.i18n.localize("levels3dpreview.mergeTiles.unmergeFailed"));
        return false;
    }
    await canvas.scene.deleteEmbeddedDocuments(
        "Tile",
        tileDocuments.map((td) => td.id),
    );
    return true;
}

export async function unmergeTile(tile) {
    return unmergeTileDocuments([tile]);
}

export async function unmergeTiles(tiles = canvas.tiles.placeables) {
    const unmergeTargets = [];
    let count = 0;
    for (const tile of tiles) {
        if (tile.document.flags["levels-3d-preview"]?.mergedMatrix) {
            unmergeTargets.push(tile.document);
            count += tile.document.flags["levels-3d-preview"].mergedMatrix.length;
        }
    }
    if (!unmergeTargets.length) return;
    if (await unmergeTileDocuments(unmergeTargets)) ui.notifications.info(`Unmerged ${unmergeTargets.length} tiles into ${count} tiles`);
}

export async function splitToChunks(tileDocument, splitX, splitY) {
    const displacementMatrix = tileDocument.flags["levels-3d-preview"].displacementMatrix;
    const components = displacementMatrix.split(",").map((c) => parseFloat(c));
    const offsetX = components[0];
    const offsetY = components[1];
    const scaleX = components[2];
    const scaleY = components[3];
    const newScaleX = scaleX * splitX;
    const newScaleY = scaleY * splitY;
    const width = tileDocument.width;
    const height = tileDocument.height;
    const chunkWidth = width / splitX;
    const chunkHeight = height / splitY;
    const newTiles = [];
    for (let x = 0; x < splitX; x++) {
        for (let y = 0; y < splitY; y++) {
            const newTileData = tileDocument.toObject();
            newTileData.width = chunkWidth;
            newTileData.height = chunkHeight;
            newTileData.x = tileDocument.x + x * chunkWidth;
            newTileData.y = tileDocument.y + y * chunkHeight;

            newTileData.flags["levels-3d-preview"].displacementMatrix = `${offsetX + x * (1 / newScaleX)},${offsetY + y * (1 / newScaleY)},${newScaleX},${newScaleY}`;

            newTiles.push(newTileData);
        }
    }
    await canvas.scene.createEmbeddedDocuments("Tile", newTiles);
    await tileDocument.delete();
}

export function extractPointsFromDrawing() {
    game.Levels3DPreview.toggle();
    canvas.drawings.activate();
    canvas.tiles.placeables.forEach((t) => (t.visible = false));
    canvas.tokens.placeables.forEach((t) => (t.visible = false));
    ui.notifications.info("Please create a polygon drawing to extract points from");
    Hooks.once("renderSceneControls", () => {
        setTimeout(() => {
            document.querySelector(`li[data-tool="polygon"]`).click();
        }, 500);
    });
    Hooks.once("createDrawing", async (drawing) => {
        if (drawing.shape.type != "p") return ui.notifications.error("Please create a polygon drawing to extract points from");
        const points = drawing.shape.points;
        let maxX = 0,
            maxY = 0;
        for (let i = 0; i < points.length; i += 2) {
            if (points[i] > maxX) maxX = points[i];
            if (points[i + 1] > maxY) maxY = points[i + 1];
        }
        const tileData = {
            x: drawing.x,
            y: drawing.y,
            texture: {
                src: "modules/levels-3d-preview/assets/blank.webp",
            },
            width: maxX,
            height: maxY,
            flags: {
                "levels-3d-preview": {
                    dynaMesh: "polygonbevel",
                    model3d: points.join(","),
                    depth: 10,
                    autoGround: true,
                },
            },
        };
        const tile = (await canvas.scene.createEmbeddedDocuments("Tile", [tileData]))[0];
        canvas.tiles.placeables.forEach((t) => (t.visible = true));
        canvas.tokens.placeables.forEach((t) => (t.visible = true));
        canvas.tiles.activate();
        tile.object.control();
        game.Levels3DPreview.toggle();
    });
}

export async function extrudeWalls(walls) {
    const confirm = foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("levels3dpreview.extrudeWalls.title") },
        content: game.i18n.localize("levels3dpreview.extrudeWalls.content"),
    });

    if (!(await confirm)) return false;

    walls = walls ?? (canvas.walls.controlled.length ? canvas.walls.controlled : canvas.walls.placeables);

    const tilesToCreate = [];

    const wallGroups = {};

    for (const wall of walls) {
        const top = wall.document.flags["wall-height"]?.top ?? canvas.scene.dimensions.distance * 2;
        const bottom = wall.document.flags["wall-height"]?.bottom ?? 0;
        const key = `${top}-${bottom}`;
        if (!wallGroups[key]) wallGroups[key] = [];
        wallGroups[key].push(wall);
    }

    for (const [key, wallGroup] of Object.entries(wallGroups)) {
        const [top, bottom] = key.split("-").map((v) => parseFloat(v));
        const tiles = extrudeWallGroup(wallGroup, top, bottom);
        tilesToCreate.push(...tiles);
    }

    const tiles = await canvas.scene.createEmbeddedDocuments("Tile", tilesToCreate);

    ui.notifications.info(`Extruded ${walls.length} walls to ${tiles.length} tiles`);

    return tiles;
}

function extrudeWallGroup(walls, top, bottom) {
    const tilesToCreate = [];

    const segments = walls
        .filter((w) => !w.isDoor)
        .map((w) => {
            return { x0: w.document.c[0], y0: w.document.c[1], x1: w.document.c[2], y1: w.document.c[3] };
        });

    const polygons = [];

    while (segments.length) {
        const polygon = [];
        const start = segments.shift();
        polygon.push(start);
        let current = start;
        while (true) {
            const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
            const next = segments.find((s) => dist({ x: s.x0, y: s.y0 }, { x: current.x1, y: current.y1 }) < 10);
            if (!next) break;
            polygon.push(next);
            segments.splice(segments.indexOf(next), 1);
            current = next;
        }
        polygons.push(polygon);
    }

    let finalPolygons = polygons;
    let lastCount = 0;
    let currentCount = polygons.length;

    while (currentCount !== lastCount) {
        finalPolygons = joinPolygons(finalPolygons);
        lastCount = currentCount;
        currentCount = finalPolygons.length;
    }

    for (const polygon of finalPolygons) {
        const topLeft = { x: polygon[0].x0, y: polygon[0].y0 };
        const bottomRight = { x: polygon[0].x0, y: polygon[0].y0 };
        for (const segment of polygon) {
            if (segment.x0 < topLeft.x) topLeft.x = segment.x0;
            if (segment.y0 < topLeft.y) topLeft.y = segment.y0;
            if (segment.x1 > bottomRight.x) bottomRight.x = segment.x1;
            if (segment.y1 > bottomRight.y) bottomRight.y = segment.y1;
        }
        const width = bottomRight.x - topLeft.x;
        const height = bottomRight.y - topLeft.y;
        const pointsShifted = polygon.map((s) => {
            return { x0: s.x0 - topLeft.x, y0: s.y0 - topLeft.y, x1: s.x1 - topLeft.x, y1: s.y1 - topLeft.y };
        });

        const points = [];
        for (const segment of pointsShifted) {
            points.push(segment.x0, segment.y0, segment.x1, segment.y1);
        }

        const tileData = {
            x: topLeft.x,
            y: topLeft.y,
            width: width,
            height: height,
            texture: {
                src: "modules/levels-3d-preview/assets/blank.webp",
            },
            elevation: bottom,
            flags: {
                "levels-3d-preview": {
                    dynaMesh: "polygonbevelsolidify",
                    model3d: "10#" + points.join(","),
                    depth: ((top - bottom) / canvas.scene.dimensions.distance) * canvas.dimensions.size,
                    autoGround: true,
                },
            },
        };

        tilesToCreate.push(tileData);
    }

    return tilesToCreate;
}

function joinPolygons(polygons) {
    const finalPolygons = [];

    while (polygons.length) {
        const polygon = [];
        const start = polygons.shift();
        polygon.push(...start);
        let current = start;
        while (true) {
            const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
            const next = polygons.find((s) => dist({ x: s[0].x0, y: s[0].y0 }, { x: current[current.length - 1].x1, y: current[current.length - 1].y1 }) < 10);
            if (!next) break;
            polygon.push(...next);
            polygons.splice(polygons.indexOf(next), 1);
            current = next;
        }
        finalPolygons.push(polygon);
    }

    return finalPolygons;
}

function witchOfAgnesi(x, a) {
    return (8 * a * a * a) / (x * x + 4 * a * a);
}

export async function attachTileToToken(tile, token) {
    const tile3d = game.Levels3DPreview.tiles[tile.id];
    const token3d = game.Levels3DPreview.tokens[token.id];
    const model = tile3d._attachModel;
    token3d.model.attach(model);
    model.updateMatrixWorld(true);
    model.updateMatrix();
    const src = tile3d.gtflPath;
    const matrix = model.matrix.toArray();
    const tokenAttachemnts = token.document.getFlag("levels-3d-preview", "attachments") ?? [];
    tokenAttachemnts.push({ src, matrix, hidden: false });
    await token.document.setFlag("levels-3d-preview", "attachments", tokenAttachemnts);
    await canvas.scene.deleteEmbeddedDocuments("Tile", [tile.id]);
    ui.notifications.info(game.i18n.localize("levels3dpreview.flags.attachments.info").replace("%s", src) + token.document.name);
}

const interactiveDynamesh = {
    counter: {
        clickLeft: function () {
            const val = parseInt(this.gtflPath);
            if (!Number.isNumeric(val)) return this.document.setFlag("levels-3d-preview", "model3d", 0);
            const newValString = (val + 1).toString();
            this.document.setFlag("levels-3d-preview", "model3d", newValString);
        },
        clickRight: function () {
            const val = parseInt(this.gtflPath);
            if (!Number.isNumeric(val)) return this.document.setFlag("levels-3d-preview", "model3d", 0);
            const newValString = (val - 1).toString();
            this.document.setFlag("levels-3d-preview", "model3d", newValString);
        },
    },
    counterradial: {
        clickLeft: function () {
            const [max, value] = this.gtflPath.split("|");
            const maxVal = parseInt(max || 6);
            const val = Math.min(parseInt(value ?? maxVal) + 1, maxVal);
            this.document.setFlag("levels-3d-preview", "model3d", `${maxVal}|${val}`);
        },
        clickRight: function () {
            const [max, value] = this.gtflPath.split("|");
            const maxVal = parseInt(max || 6);
            const val = Math.max(parseInt(value ?? maxVal) - 1, 0);
            this.document.setFlag("levels-3d-preview", "model3d", `${maxVal}|${val}`);
        },
    },
};
