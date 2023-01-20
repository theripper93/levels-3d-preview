import * as THREE from "../lib/three.module.js";
import { MersenneTwister } from "../lib/mersenneTwister.js";
import { noiseShaders } from "../shaders/noise.js";
import { SimplexNoise, Perlin, FractionalBrownianMotion } from "../lib/noiseFunctions.js";
import { Ruler3D } from "../systems/ruler3d.js";
import { factor } from "../main.js";
import { DynaMesh } from "../helpers/dynaMesh.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "../lib/three-mesh-bvh.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class Tile3D {
    constructor(tile, parent) {
        this.tile = tile;
        this.placeable = tile;
        this._parent = parent;
        this.isOverhead = this.tile.document.overhead;
        this.isAnimated = false;
        this.draggable = true;
        this.embeddedName = "Tile";
        this.bottom = tile.document.flags?.levels?.rangeBottom ?? canvas.primary.background.elevation;
        this.shaders = [];
        this.center2d = {
            x: this.tile.document.x + Math.abs(this.tile.document.width) / 2,
            y: this.tile.document.y + Math.abs(this.tile.document.height) / 2,
        };
        this.center = Ruler3D.posCanvasTo3d({ x: this.center2d.x, y: this.center2d.y, z: this.bottom });
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
        this.initRandom();
    }

    async load() {
        if (this.gtflPath || this.dynaMesh != "default") {
            if (this.mergedMatrix) await this.initMerged();
            else this.fillType === "stretch" || this.fillType === "fit" ? await this.initModel() : await this.initInstanced();
        } else {
            await this.init();
        }
        if(this._destroyed) return;
        this.initShaders();
        this.setShading();
        this.setSides();
        this.setMRT();
        this._loaded = true;
        this.elevation3d = this.mesh.position.y;
        this.setHidden();
        this.updateControls();
        setTimeout(() => {
            this.updateControls();
        }, 150);
        if (this.tile.controlled) this._parent.interactionManager.setControlledGroup(this);
        setTimeout(() => {
            this.setUpDoors();
            this.setupDoor();
        }, 100);
        game.Levels3DPreview.outline?.toggleControlled(this.mesh, this.tile.controlled);
        this.sendToWorker();
        return this;
    }

    sendToWorker() { 
        if ((!this.sight && !this.hasTags) || !this._parent?.workers?.enabled) return;
        this.mesh.traverse((o) => { 
            o.updateMatrix();
        });
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

    get hudCenter() {}

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

    getFlags() {
        this.gtflPath = this.tile.document.getFlag("levels-3d-preview", "model3d");
        this.mapgen = this.tile.document.getFlag("levels-3d-preview", "mapgen");
        this.enableAnim = this.tile.document.getFlag("levels-3d-preview", "enableAnim") ?? true;
        this.animIndex = this.tile.document.getFlag("levels-3d-preview", "animIndex") ?? 0;
        this.animSpeed = this.tile.document.getFlag("levels-3d-preview", "animSpeed") ?? 1;
        this.color = this.tile.document.getFlag("levels-3d-preview", "color") ?? "#ffffff";
        this.enableGravity = this.tile.document.getFlag("levels-3d-preview", "enableGravity") ?? "none";
        this.shading = this.tile.document.getFlag("levels-3d-preview", "shading") ?? "default";
        this.shader = this.tile.document.getFlag("levels-3d-preview", "shader") ?? "none";
        this.flipY = this.tile.document.getFlag("levels-3d-preview", "flipY") ?? false;
        this.shaders = this.tile.document.getFlag("levels-3d-preview", "shaders") ?? {};
        this.dynaMesh = this.tile.document.getFlag("levels-3d-preview", "dynaMesh") ?? "default";
        this.dynaMeshResolution = this.tile.document.getFlag("levels-3d-preview", "dynaMeshResolution") ?? 1;
        this.sightMeshComplexity = this.tile.document.getFlag("levels-3d-preview", "sightMeshComplexity") ?? 1;
        this.roughness = this.tile.document.getFlag("levels-3d-preview", "roughness") ?? -0.01;
        this.metalness = this.tile.document.getFlag("levels-3d-preview", "metalness") ?? -0.01;
        this.transparency = this.tile.document.getFlag("levels-3d-preview", "transparency") ?? -0.01;
        this.sides = this.tile.document.getFlag("levels-3d-preview", "sides") ?? "default";
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
        this.sight = this.tile.document.getFlag("levels-3d-preview", "sight") ?? true;
        this.tiltX = this.tile.document.getFlag("levels-3d-preview", "tiltX") ?? 0;
        this.tiltX = Math.toRadians(this.tiltX);
        this.tiltZ = this.tile.document.getFlag("levels-3d-preview", "tiltZ") ?? 0;
        this.tiltZ = Math.toRadians(this.tiltZ);
        this.autoCenter = this.tile.document.getFlag("levels-3d-preview", "autoCenter") ?? false;
        this.autoGround = this.tile.document.getFlag("levels-3d-preview", "autoGround") ?? false;
        this.textureRepeat = this.tile.document.getFlag("levels-3d-preview", "textureRepeat") ?? 1;
        this.repeatTexture = this.textureRepeat > 1;
        this.wasFreeMode = this.tile.document.getFlag("levels-3d-preview", "wasFreeMode") ?? false;
        this.doorType = this.tile.document.getFlag("levels-3d-preview", "doorType") ?? 0;
        this.doorState = this.tile.document.getFlag("levels-3d-preview", "doorState") ?? 0;
        this.mergedMatrix = this.tile.document.getFlag("levels-3d-preview", "mergedMatrix") ?? null;
        this.originalDimensions = this.tile.document.getFlag("levels-3d-preview", "originalDimensions") ?? null;
        this.isDoor = this.doorType != 0;
        this.isSecret = this.doorType == 2;
        this.isOpen = this.doorState == 1;
        this.isLocked = this.doorState == 2;
        if (this.isOpen) {
            this.collision = false;
            this.sight = false;
        }
    }

    setUpDoors() {
        const doors = {};
        this.mesh.traverse((child) => {
            if (child.isMesh && child?.userData?.isDoor && child?.userData?.doorId) {
                doors[child?.userData?.doorId] = child;
                child.userData.doorMaterialData = {
                    transparent: true,
                    opacity: 0.4,
                    alphaTest: 0,
                    depthWrite: false,
                    format: THREE.RGBAFormat,
                    needsUpdate: true,
                };
                child.userData.originalMaterial = {
                    transparent: child.material.transparent,
                    opacity: child.material.opacity,
                    alphaTest: child.material.alphaTest,
                    depthWrite: child.material.depthWrite,
                    format: child.material.format,
                    needsUpdate: true,
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
        this.setDoorsMaterials();
    }

    setDoorsMaterials() {
        const modelDoorsStates = this.tile.document.getFlag("levels-3d-preview", "modelDoors") || {};
        for (let doorId in this._doors) {
            let isOpen = this._doors[doorId].userData?.isOpen == 1;
            isOpen = modelDoorsStates[doorId]?.ds !== undefined ? modelDoorsStates[doorId].ds == 1 : isOpen;
            const door = this._doors[doorId];
            const originalMaterial = door.userData.originalMaterial;
            const doorMaterialData = door.userData.doorMaterialData;
            let matToApply = isOpen ? doorMaterialData : originalMaterial;
            for (let [k, v] of Object.entries(matToApply)) {
                door.material[k] = v;
                door.userData.sight = isOpen ? false : this.sight;
                door.userData.collision = isOpen ? false : this.collision;
                const sightMesh = door.userData.sightMesh;
                if (sightMesh) {
                    sightMesh.userData.sight = door.userData.sight;
                    sightMesh.userData.collision = door.userData.collision;
                }
            }
        }
        this.sendToWorker();
        this._parent.interactionManager?.generateSightCollisions();
        this._parent.interactionManager?.buildCollisionGeos();
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
    }

    setupDoor() {
        if (!this.isDoor) return;

        this._parent.interactionManager?.generateSightCollisions();
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
        }
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
                  transparent: this.opacity < 1,
                  opacity: this.opacity,
                  visible: !this.tile.document.hidden,
                  map: texture,
                  side: THREE.DoubleSide,
                  roughness: 1,
                  metalness: 0,
                  transparent: this._parent._fullTransparency,
                  alphaTest: this._parent._fullTransparency ? 0.01 : 0.99,
              });
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

    async initModel() {
        const stretch = this.fillType === "stretch";
        const model = await this.getModel();
        const { textureOrMat, isPBR } = await this.getTextureOrMat();
        if (this.displacementMap) {
            const tex = await this._parent.helpers.loadTexture(this.displacementMap);
            this.displacementMap = this.getDisplacementData(tex.image);
            this.applyDisplacement(model.scene);
        }
        const object = game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter);
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = Math.max(box.max.y - box.min.y, 0.00001);
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
                const wDiff = (this.tile.document.width - Math.round(scale * mWidth * factor)) / 2;
                const hDiff = (this.tile.document.height - Math.round(scale * mHeight * factor)) / 2;
                this.tile.document.update({
                    flags: {
                        "levels-3d-preview": {
                            depth: Math.round(depth * factor),
                            fillType: "stretch",
                        },
                    },
                    width: Math.round(scale * mWidth * factor),
                    height: Math.round(scale * mHeight * factor),
                    x: this.tile.document.x + wDiff,
                    y: this.tile.document.y + hDiff,
                });
                this.tile.document.setFlag("levels-3d-preview", "depth");
            }
        }
        //end migration
        object.scale.set(this.width / mWidth, this.depth / mDepth, this.height / mHeight);

        const color = new THREE.Color(this.color);
        this._processModel(object, textureOrMat, isPBR, color);
        this.applyNoise(object);

        if (model.object.animations.length > 0 && this.enableAnim) {
            if (!model.object.animations[this.animIndex]) {
                console.error("Animation index out of bounds", this.tile);
            } else {
                this.isAnimated = true;
                this.mixer = new THREE.AnimationMixer(model.scene);
                this.mixer.timeScale = this.animSpeed;
                this.mixer.clipAction(model.object.animations[this.animIndex]).play();
            }
        }

        const container = new THREE.Group();
        this.mesh = container;
        this.sightMesh = this._parent.helpers.getSightMesh(object, this.sightMeshComplexity);
        this.sightMesh.visible = false;
        this.sightMesh.userData.noShaders = true;
        this.sightMesh.traverse((child) => {
            if (child.isMesh) {
                child.userData.noShaders = true;
            }
        });
        container.add(this.sightMesh);
        container.add(object);
        container.position.set(this.center.x, this.center.y, this.center.z);
        container.rotation.set(this.tiltX, -this.angle * this.rotSign, this.tiltZ);
        container.userData.hitbox = container;
        container.userData.interactive = true;
        container.userData.entity3D = this;
        this.mesh.userData.draggable = true;
        if (this._destroyed) return;
        container.traverse((child) => {
            if (child.geometry) child.geometry.computeBoundsTree();
        });
        this._parent.scene.add(container);
        this.initBoundingBox();
    }

    async initInstanced() {
        this.isGravity = this.enableGravity !== "none";
        if (this.isGravity) this._parent.interactionManager.forceSightCollisions();
        if (this.displacementMap) {
            const tex = await this._parent.helpers.loadTexture(this.displacementMap);
            this.displacementMap = this.getDisplacementData(tex.image);
        }
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
                const instancedMesh = new THREE.InstancedMesh(child.geometry, child.material, count);
                const positionsArray = new Float32Array(count);
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
                        if (this.enableGravity !== "none") {
                            const realTarget = dummy.position.clone();
                            realTarget.add(new THREE.Vector3(-this.width / 2 + gridX / 2 + this.center.x, 0 + this.center.y, -this.height / 2 + gridZ / 2 + this.center.z));
                            realTarget.y = this.center.y;
                            const rcTarget = realTarget.clone();
                            rcTarget.y -= 10;
                            const collision = raycaster.computeSightCollisionFrom3DPositions(realTarget, rcTarget, "collision", false, false, false, true);

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
                        if (this.randomColor) {
                            //const color = child.material.color.clone();
                            const color = new THREE.Color(this.color);
                            const hsl = color.getHSL({});
                            hsl.l /= randomColor;
                            color.setHSL(hsl.h, hsl.s, hsl.l);
                            instancedMesh.setColorAt(j, color);
                        }
                        instancedMesh.setMatrixAt(j, dummy.matrix);
                        i++;
                        j++;
                    }
                }
                instancedMesh.geometry.setAttribute("shader_instance_position", new THREE.InstancedBufferAttribute(positionsArray, 1, false));
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
                child.castShadow = true;
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
        this.instancedBBSize = new THREE.Vector3(avgWidth / 2, avgDepth / 2, avgHeight / 2);

        for (const obj of objectsToInstanciate) {
            const instancedMesh = new THREE.InstancedMesh(obj.geometry, obj.material, count);
            const positionsArray = new Float32Array(count);

            for (let i = 0; i < count; i++) {
                const matrix = mergedMatrix[i];
                object.scale.copy(new THREE.Vector3((matrix.width * baseScale.x) / mWidth, (matrix.depth * baseScale.y) / mDepth, (matrix.height * baseScale.z) / mHeight));
                const newSize = new THREE.Box3().setFromObject(object);
                const newWidth = newSize.max.x - newSize.min.x;
                const newHeight = newSize.max.z - newSize.min.z;
                const newDepth = newSize.max.y - newSize.min.y;
                object.rotation.copy(new THREE.Euler(Math.toRadians(matrix.tiltX), Math.toRadians(-matrix.rotation), Math.toRadians(matrix.tiltZ)));
                object.position.copy(new THREE.Vector3(matrix.x + newWidth / 2, matrix.z, matrix.y + newHeight / 2));
                obj.getWorldPosition(dummy.position);
                obj.getWorldQuaternion(dummy.quaternion);
                obj.getWorldScale(dummy.scale);
                object.scale.copy(baseScale);
                object.position.copy(basePosition);
                object.rotation.copy(baseRotation);
                dummy.updateMatrix();
                const world = new THREE.Vector3();
                dummy.getWorldPosition(world);
                positionsArray[i] = world.y;
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.setColorAt(i, new THREE.Color(matrix.color ?? "#ffffff"));
            }

            instancedMesh.geometry.setAttribute("shader_instance_position", new THREE.InstancedBufferAttribute(positionsArray, 1, false));
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.geometry.computeBoundsTree();
            instancedMesh.castShadow = true;
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
            const dynamesh = new DynaMesh(this.dynaMesh, { text: this.gtflPath, width: this.width, height: this.height, depth: this.depth, resolution: this.dynaMeshResolution });
            const mesh = await dynamesh.create();
            return {
                scene: mesh,
                object: mesh,
                model: mesh,
            };
        }

        const filePath = this.gtflPath;
        const extension = filePath.split(".").pop().toLowerCase();
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
        const errText = game.i18n.localize("levels3dpreview.errors.filenotsupported") + "(" + extension + "): " + filePath + " Tile: " + this.tile.id;
        console.error(errText);
        ui.notifications.error(errText);
        const obj = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        obj.geometry.computeBoundingBox();
        return { scene: obj, model: obj, object: obj };
    }

    async getTextureOrMat(texture, options = {}) {
        if (!texture) texture = this.imageTexture;
        let textureOrMat = null;
        let isPBR = null;
        if (!texture) return { textureOrMat, isPBR };
        textureOrMat = await this._parent.helpers.autodetectTextureOrMaterial(texture, { noCache: this.flipY || this.repeatTexture !== 1, doubleSided: this.doubleSided, ...options });
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
            if (this.color) mat.color.set(mat.color.multiply(color));
            if (this.color && mat.emissiveMap) mat.emissive = color;
            if (textureOrMat && !isPBR) mat.map = textureOrMat;
            mat.needsUpdate = true;
        };
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.geometry.computeBoundsTree();

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
        tex.repeat.set(this.textureRepeat, this.textureRepeat);
        return;
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
                if (this.metalness >= 0) child.material.metalness = this.metalness;
                if (this.roughness >= 0) child.material.roughness = this.roughness;
                if (this.transparency >= 0) {
                    child.material.transparent = true;
                    child.material.opacity = this.transparency;
                }
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
        if (!this.mesh.parent) return;
        const controls = this._parent.transformControls;
        const gizmoEnabled = this._parent.interactionManager._gizmoEnabled;
        if (!gizmoEnabled) {
            return controls.detach();
        }
        if (this.tile.controlled && !this.tile.document.locked) controls.attach(this._parent.controlledGroup);
        if (!canvas.activeLayer?.controlled?.length) controls.detach();
    }

    updateFromTransform() {
        const controls = this._parent.transformControls;
        controls.detach();
        this.updatePositionFrom3D(true);
    }

    processRotation(update, tile) {
        const worldRotation = new THREE.Euler().setFromQuaternion(this.mesh.getWorldQuaternion(new THREE.Quaternion()));

        /*if(Math.abs(worldRotation.x) === Math.PI && Math.abs(worldRotation.z) === Math.PI){
            worldRotation.y = (Math.PI + (worldRotation.y))*Math.sign(worldRotation.x);
            worldRotation.x = 0;
            worldRotation.z = 0;
        }*/

        const currentTiltX = worldRotation.x;
        const currentTiltZ = worldRotation.z;
        const currentTiltY = worldRotation.y;

        let newTiltX = Math.round(Math.toDegrees(currentTiltX % (Math.PI * 2)));
        let newTiltZ = Math.round(Math.toDegrees(currentTiltZ % (Math.PI * 2)));
        let newTiltY = Math.round(Math.toDegrees((-currentTiltY * this.rotSign) % (Math.PI * 2)));

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
        const scale = this.mesh.getWorldScale(new THREE.Vector3());
        const scaleX = scale.x;
        const scaleZ = scale.z;
        const scaleY = scale.y;
        const newWidth = this.tile.document.width * scaleX;
        const newHeight = this.tile.document.height * scaleZ;
        const newDepth = this.depth * factor * scaleY;
        const x = (update.x ?? this.tile.document.x) - (newWidth - this.tile.document.width) / 2;
        const z = (update.y ?? this.tile.document.y) - (newHeight - this.tile.document.height) / 2;
        update.x = Math.round(x);
        update.y = Math.round(z);
        update.width = newWidth;
        update.height = newHeight;
        update.flags["levels-3d-preview"].depth = Math.round(newDepth);
    }

    toggleBoundingBox() {
        if (!game.user.isGM || this._parent.outline._enabled) return;
        const isTileControlled = this.tile.controlled;
        if (this.controlled === isTileControlled) return;
        this.controlled = isTileControlled;
        if (isTileControlled) {
            this.mesh.add(this.controlledBox);
        } else {
            this.mesh.remove(this.controlledBox);
        }
    }

    setHidden() {
        if (!game.user.isGM) return;
        const hidden = this.tile.document.hidden;
        if (hidden) {
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.material.transparent = true;
                    child.material.opacity *= 0.5;
                    child.material.alphaTest = 0;
                    child.material.depthWrite = false;
                    child.material.format = THREE.RGBAFormat;
                    child.material.needsUpdate = true;
                }
            });
        }
    }

    updateVisibility(time) {
        if (!this.mesh) return;
        this.toggleBoundingBox();
        this.mesh.visible = !this.tile.document.hidden || game.user.isGM;
        if (this.sightMesh) this.sightMesh.visible = this._parent.ClipNavigation.wireframe;
        if (game.Levels3DPreview.mirrorLevelsVisibility && this.tile.document.overhead && this.tile.mesh) {
            this.mesh.visible = this.tile.occluded || !this.tile.mesh?.visible ? false : this.tile.visible;
        }
    }

    async updatePositionFrom3D(transform = false) {
        this.skipMoveAnimation = true;
        const worldPosition = this.mesh.getWorldPosition(new THREE.Vector3());
        const x3d = worldPosition.x;
        const y3d = worldPosition.y;
        const z3d = worldPosition.z;
        const x = x3d * factor - this.tile.document.width / 2;
        const y = z3d * factor - this.tile.document.height / 2;
        const z = (y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size;
        const useSnapped = Ruler3D.useSnapped() && !transform;
        const snapped = canvas.grid.getSnappedPosition(x, y);
        let { rangeTop, rangeBottom } = CONFIG.Levels.helpers.getRangeForDocument(this.tile.document);
        if (!rangeBottom || rangeBottom == -Infinity) rangeBottom = 0;
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        const deltas = {
            x: dest.x - this.tile.document.x,
            y: dest.y - this.tile.document.y,
            elevation: dest.elevation - rangeBottom,
        };
        let updates = [];
        let tile = this.tile;
        let tileFlags = CONFIG.Levels.helpers.getRangeForDocument(tile.document) || {};
        if (!tileFlags.rangeBottom || tileFlags.rangeBottom == -Infinity) tileFlags.rangeBottom = 0;
        const update = {
            _id: tile.id,
            x: tile.document.x + deltas.x,
            y: tile.document.y + deltas.y,
            flags: {
                "levels-3d-preview": {
                    wasFreeMode: this.wasFreeMode,
                },
                levels: {
                    rangeBottom: tileFlags.rangeBottom + deltas.elevation,
                },
            },
        };
        this.processScale(update, tile);
        this.processRotation(update, tile);
        updates.push(update);
        const resp = await canvas.scene.updateEmbeddedDocuments("Tile", updates);
        if (!resp?.length) this._parent.interactionManager.setControlledGroup();
        return true;
    }

    initShaders() {
        this._parent.shaderHandler.applyShader(this.mesh, this, this.shaders);
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
                const count = positionAttributes.count;
                const maxX = c.geometry.boundingBox.max.x;
                const minX = c.geometry.boundingBox.min.x;
                const maxZ = c.geometry.boundingBox.max.z;
                const minZ = c.geometry.boundingBox.min.z;
                const minY = c.geometry.boundingBox.min.y;
                for (let i = 0; i < count; i++) {
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
            if(c.computeSmartUVs) c.computeSmartUVs();
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
        var canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;

        var context = canvas.getContext("2d");
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

    destroy() {
        this._destroyed = true;
        delete this._parent.tiles[this.tile.id];
        this._parent.workers.removeMesh(this.tile.id);
        if (!this.mesh) return;
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

    _onClickLeft(e) {
        const oT = e.originalIntersect?.userData;
        if (oT?.isDoor && canvas.activeLayer.options.objectClass.embeddedName === "Token" && !(oT?.isSecret && !game.user.isGM)) {
            if (this.isToFar(e.originalIntersect)) ui.notifications.error(game.i18n.localize("levels3dpreview.errors.toofarfromdoor"));
            else this._parent.socket.executeAsGM("toggleDoor", this.tile.id, canvas.scene.id, game.user.id, oT.doorId);
        }

        if (canvas.activeLayer.options.objectClass.embeddedName === "Token" && this.isDoor && !(this.isSecret && !game.user.isGM)) {
            if (this.isToFar()) ui.notifications.error(game.i18n.localize("levels3dpreview.errors.toofarfromdoor"));
            else this._parent.socket.executeAsGM("toggleDoor", this.tile.id, canvas.scene.id, game.user.id);
        }
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") {
            const point = Ruler3D.pos3DToCanvas(e.position3D);
            if (this.tile.document.checkClick) this.tile.document.checkClick(point, "click");
        } else {
            const event = {
                stopPropagation: () => {},
                data: {
                    originalEvent: e,
                },
            };
            this.tile._onClickLeft(event);
        }
    }

    _setDoorState() {}

    _onClickLeft2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") {
            const point = Ruler3D.pos3DToCanvas(e.position3D);
            if (this.tile.document.checkClick) this.tile.document.checkClick(point, "dblclick");
        } else {
            const event = {
                stopPropagation: () => {},
                data: {
                    originalEvent: e,
                },
            };
            this.tile._onClickLeft(event);
            this.tile._onClickLeft2(event);
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
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
        this.tile._onClickRight(event);
    }

    _onClickRight2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
        this.tile._onClickRight2(event);
    }

    _onHoverIn(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
        this.placeable._onHoverIn(event);
        this._parent.setCursor("pointer");
    }

    _onHoverOut(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "Tile") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
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
        return { scene: object, model: object, object: object };
    }

    static setHooks() {
        Hooks.on("updateTile", (tile, updates) => {
            if (game.Levels3DPreview?._active && tile.object && isDoorUpdate(updates)) {
                game.Levels3DPreview.tiles[tile.id]?.setDoorsMaterials();
                return;
            }
            if (game.Levels3DPreview?._active && tile.object && !isAnimOnly(updates)) {
                const hasGravity = (tile.getFlag("levels-3d-preview", "enableGravity") ?? "none") !== "none";
                const hadGravity = game.Levels3DPreview.tiles[tile.id]?.isGravity;
                if (hasGravity && hadGravity) return recomputeGravityDebounced();
                game.Levels3DPreview.tiles[tile.id]?.destroy();
                const newTile = new Tile3D(tile.object, game.Levels3DPreview);
                game.Levels3DPreview.tiles[tile.id] = newTile;
                newTile.load().then(() => {
                    if ("x" in updates || "y" in updates || hasFlag(updates)) {
                        recomputeGravityDebounced();
                    }
                });

                function hasFlag(updates) {
                    if (updates?.flags?.levels?.rangeBottom !== undefined) return true;
                    if (updates?.flags?.levels?.rangeTop !== undefined) return true;
                }
            }

            function isDoorUpdate(updates) {
                if (updates.flags && updates.flags["levels-3d-preview"] && updates.flags["levels-3d-preview"].modelDoors) return true;
            }

            function isAnimOnly(updates) {
                if (!updates.flags) return false;
                if (!updates.flags["levels-3d-preview"]) return false;
                if (Object.values(updates.flags["levels-3d-preview"]).length !== 1) return false;
                if (updates.flags["levels-3d-preview"].paused !== undefined) return true;
                return false;
            }
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
                        flags: {
                            levels: {
                                rangeBottom: pos.z,
                            },
                        },
                    };
                    mergeObject(td, data3d);
                });
            }
        });

        Hooks.on("renderTileHUD", (hud) => {
            if (!game.Levels3DPreview?._active) return;

            const tile3d = game.Levels3DPreview.tiles[hud.object.id];
            const isMerged = !!tile3d.mergedMatrix;

            if (!isMerged && canvas.tiles.controlled.length > 1) {
                const mergeButton = $(`<div class="control-icon" data-action="merge-tiles"><i class="fas fa-object-group" title="Merge Tiles"></i></div>`);

                mergeButton.on("click", (e) => {
                    e.stopPropagation();
                    autoMergeTiles(canvas.tiles.controlled, false);
                });
                hud.element.find(`div[data-action="locked"]`).before(mergeButton);
            } else if (isMerged) {
                const unmergeButton = $(`<div class="control-icon" data-action="unmerge-tiles"><i class="fas fa-object-ungroup" title="Unmerge Tiles"></i></div>`);

                unmergeButton.on("click", (e) => {
                    e.stopPropagation();
                    unmergeTiles(canvas.tiles.controlled);
                });
                hud.element.find(`div[data-action="locked"]`).before(unmergeButton);
            }

            if (!tile3d?.isAnimated) return;

            const images = {
                pause: "fa-play",
                play: "fa-pause",
            };

            const isPaused = tile3d.isPaused;

            const controlButton = $(`
    <div class="control-icon" data-action="play-pause-3d">
        <i class="fas ${isPaused ? images.pause : images.play}" title="Overhead Tile"></i>
    </div>
    `);

            controlButton.on("click", (e) => {
                e.stopPropagation();
                hud.object.document.setFlag("levels-3d-preview", "paused", !hud.object.document.getFlag("levels-3d-preview", "paused"));
                controlButton.find("i").toggleClass(`${images.play} ${images.pause}`);
            });

            hud.element.find(`div[data-action="locked"]`).before(controlButton);
        });

        Hooks.on("controlTile", (tile, controlled) => {
            if (!game.Levels3DPreview?._active || !game.user.isGM) return;
            Object.values(game.Levels3DPreview.tiles).forEach((tile3d) => {
                tile3d.updateControls();
            });
        });
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
        const newTile = new Tile3D(tile3d.placeable, game.Levels3DPreview);
        await newTile.load();
        game.Levels3DPreview.tiles[tile3d.placeable.id] = newTile;
    }
    game.Levels3DPreview.interactionManager.setControlledGroup();
}

export const recomputeGravityDebounced = debounce(recomputeGravity, 100);

export async function mergeTiles(tileDocuments) {
    const sameSource = tileDocuments.every((td) => td.data.flags["levels-3d-preview"]?.model3d === tileDocuments[0].data.flags["levels-3d-preview"]?.model3d);
    if (!sameSource) return ui.notifications.error("Tiles must have the same source to be merged");
    const baseData = tileDocuments[0].toObject();
    const instancesMatrix = [];
    const minXYZ = { x: Infinity, y: Infinity, z: Infinity };
    const maxXYZ = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let td of tileDocuments) {
        minXYZ.x = Math.min(minXYZ.x, td.x);
        minXYZ.y = Math.min(minXYZ.y, td.y);
        maxXYZ.x = Math.max(maxXYZ.x, td.x + td.width);
        maxXYZ.y = Math.max(maxXYZ.y, td.y + td.height);
        minXYZ.z = Math.min(minXYZ.z, td.flags.levels.rangeBottom);
        maxXYZ.z = Math.max(maxXYZ.z, td.flags.levels.rangeBottom + td.flags["levels-3d-preview"].depth);
    }
    baseData.x = minXYZ.x;
    baseData.y = minXYZ.y;
    baseData.width = maxXYZ.x - minXYZ.x;
    baseData.height = maxXYZ.y - minXYZ.y;
    baseData.flags.levels.rangeBottom = minXYZ.z;
    baseData.flags["levels-3d-preview"].depth = maxXYZ.z - minXYZ.z;

    for (let td of tileDocuments) {
        instancesMatrix.push({
            width: td.width / factor,
            height: td.height / factor,
            depth: td.flags["levels-3d-preview"].depth / factor,
            x: (td.x - minXYZ.x) / factor,
            y: (td.y - minXYZ.y) / factor,
            z: Ruler3D.unitsToPixels(td.flags.levels.rangeBottom - minXYZ.z),
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
    const mergeTargets = {};
    let mergedCount = 0;
    for (const tile of tiles) {
        if (skipControlled && tile.controlled) continue;
        const tile3d = game.Levels3DPreview.tiles[tile.id];
        const isDoor = tile3d?.isDoor || Object.values(tile3d?._doors || {}).length > 0;
        if (isDoor) continue;
        const repeatTile = tile.document.flags["levels-3d-preview"]?.mergedMatrix || tile.document.getFlag("levels-3d-preview", "fillType") === "tile";
        if (repeatTile) continue;
        const model3d = tile.data.flags["levels-3d-preview"]?.model3d;
        const texture = tile.data.flags["levels-3d-preview"]?.imageTexture;
        const dynaMesh = tile.data.flags["levels-3d-preview"]?.dynaMesh;
        const key = `${model3d}-${texture}-${dynaMesh}`;
        if (!model3d && (dynaMesh === "default" || !dynaMesh)) continue;
        if (!mergeTargets[key]) mergeTargets[key] = [];
        mergeTargets[key].push(tile.document);
    }

    Object.values(mergeTargets).forEach((tileDocumentArray) => mergedCount += tileDocumentArray.length - 1);

    Dialog.confirm({
        title: game.i18n.localize("levels3dpreview.mergeTiles.title"),
        content: game.i18n.localize("levels3dpreview.mergeTiles.content").replace("%count%", mergedCount),
        yes: async () => {
            await merge();
        },
        no: () => {},
        defaultYes: false,
    });

    async function merge() {
        let mergedFinal = 0;
        for (const tileDocumentArray of Object.values(mergeTargets)) {
            if (tileDocumentArray.length < 2) continue;
            mergedFinal ++;
            await mergeTiles(tileDocumentArray);
        }
        if (mergedCount) ui.notifications.info(`Merged ${mergedCount} tiles into ${mergedFinal} tiles.`);
    }
}

export async function unmergeTile(tile) {
    const instancesMatrix = tile.flags["levels-3d-preview"].mergedMatrix;
    const newTiles = [];
    const originalX = tile.x;
    const originalY = tile.y;
    const originalZ = tile.flags.levels.rangeBottom;
    for (const instance of instancesMatrix) {
        const newTileData = tile.toObject();
        delete newTileData.flags["levels-3d-preview"].mergedMatrix;
        delete newTileData.flags["levels-3d-preview"].originalDimensions;
        newTileData.width = instance.width * factor;
        newTileData.height = instance.height * factor;
        newTileData.x = (instance.x * factor) + originalX;
        newTileData.y = instance.y * factor + originalY;
        newTileData.flags.levels.rangeBottom = instance.z * factor / (canvas.scene.dimensions.size / canvas.scene.dimensions.distance) + originalZ;
        newTileData.flags["levels-3d-preview"].depth = instance.depth * factor;
        newTileData.flags["levels-3d-preview"].color = instance.color;
        newTileData.rotation = instance.rotation;
        newTileData.flags["levels-3d-preview"].tiltX = instance.tiltX;
        newTileData.flags["levels-3d-preview"].tiltZ = instance.tiltZ;
        newTiles.push(newTileData);
    }
    await canvas.scene.createEmbeddedDocuments("Tile", newTiles);
    await tile.delete();
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
    await unmerge();
    async function unmerge() {
        for (const tileDocument of unmergeTargets) {
            await unmergeTile(tileDocument);
        }
        ui.notifications.info(`Unmerged ${unmergeTargets.length} tiles into ${count} tiles`);
    }
}