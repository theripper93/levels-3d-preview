import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { sleep } from "../helpers/utils.js";
import { Light3D } from "./light3d.js";
import { TokenAnimationHandler } from "../handlers/tokenAnimationHandler.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "../lib/three-mesh-bvh.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class Token3D {
    constructor(tokenDocument, parent) {
        this.token = tokenDocument;
        this.type = "Token";
        this.embeddedName = "Token";
        this.placeable = tokenDocument;
        this._shaderSize = Math.max(this.token.document.width, this.token.document.height);
        this.isOwner = this.token.isOwner;
        this._parent = parent;
        this.isBase = game.settings.get("levels-3d-preview", "baseStyle") !== "image";
        this.baseMode = game.settings.get("levels-3d-preview", "baseStyle");
        this.reticule = parent.models.reticule.clone();
        this.color = this.getColor();
        this.factor = factor;
        this.dispositionColor = this.getDispColor();
        this.targetSize = 0.1;
        this.baseDepth = 0.008 * (canvas.grid.size / 100);
        this.elevation3d = 0;
        this.materialsCache = {};
        this._effectsCache = {};
        this.proneHandler = {};
        this.combatColor = new THREE.Color("#005eff");
        this._loaded = false;
        this.getFlags();
        this._baseColor = new THREE.Color(this.baseColor);
        this.forceDrawBars = this.drawBars;
        this.drawBars = debounce(this.drawBars, 100);
        this.animationHandler = new TokenAnimationHandler(this);
    }

    getFlags() {
        this.gtflPath = this.token.document.getFlag("levels-3d-preview", "model3d") ?? "";
        this.solidBaseMode = this.token.document.getFlag("levels-3d-preview", "solidBaseMode");
        this.baseColor = this.token.document.getFlag("levels-3d-preview", "baseColor") || game.settings.get("levels-3d-preview", "solidBaseColor");
        if (!this.solidBaseMode || this.solidBaseMode === "default") this.solidBaseMode = game.settings.get("levels-3d-preview", "solidBaseMode");
        this.disableBase = this.token.document.getFlag("levels-3d-preview", "disableBase");
        this.autoCenter = this.token.document.getFlag("levels-3d-preview", "autoCenter") ?? true;
        this.shaders = this.token.document.getFlag("levels-3d-preview", "shaders") ?? {};
        this.rotationX = Math.toRadians(this.token.document.getFlag("levels-3d-preview", "rotationX") ?? 0);
        this.rotationY = Math.toRadians(this.token.document.getFlag("levels-3d-preview", "rotationY") ?? 0);
        this.rotationZ = Math.toRadians(this.token.document.getFlag("levels-3d-preview", "rotationZ") ?? 0);
        this.offsetX = this.token.document.getFlag("levels-3d-preview", "offsetX") ?? 0;
        this.offsetY = this.token.document.getFlag("levels-3d-preview", "offsetY") ?? 0;
        //this.offsetY += this.solidBaseMode === "ontop" ? this.baseDepth*factor : 0;
        this.rotateIndicator = game.settings.get("levels-3d-preview", "rotateIndicator"); //!this.token.document.lockRotation;
        this.offsetZ = this.token.document.getFlag("levels-3d-preview", "offsetZ") ?? 0;
        this.scale = this.token.document.getFlag("levels-3d-preview", "scale") ?? 1;
        this.enableAnim = this.token.document.getFlag("levels-3d-preview", "enableAnim") ?? true;
        this.animIndex = this.token.document.getFlag("levels-3d-preview", "animIndex") ?? 0;
        this.animSpeed = this.token.document.getFlag("levels-3d-preview", "animSpeed") ?? 1;
        this.interactive = true;
        this.draggable = true;
        this.color = this.token.document.getFlag("levels-3d-preview", "color") ?? "#ffffff";
        this.material = this.token.document.getFlag("levels-3d-preview", "material") ?? "";
        this.imageTexture = this.token.document.getFlag("levels-3d-preview", "imageTexture") ?? "";
        this.collisionPlane = true;
        this.faceCameraOption = this.token.document.getFlag("levels-3d-preview", "faceCamera") ?? "0";
        this.stem = this.token.document.getFlag("levels-3d-preview", "stem") ?? false;
        this.standupFace = game.settings.get("levels-3d-preview", "standupFace");
        this.wasFreeMode = this.token.document.getFlag("levels-3d-preview", "wasFreeMode") ?? false;
        this.removeBase = this.token.document.getFlag("levels-3d-preview", "removeBase") ?? true;
        if (this.faceCameraOption !== "0") this.standupFace = this.faceCameraOption == "1" ? true : false;
        this.enableReticule = game.settings.get("levels-3d-preview", "enableReticule");
    }

    async load() {
        if (!this.gtflPath && !this.imageTexture) this.imageTexture = this.token.document.texture.src;
        this.texture = await this._parent.helpers.loadTexture(this.imageTexture); //this.loadTexture();
        const token3d = this.gtflPath || this.imageTexture ? await this.loadModel() : this.draw();
        if (this.token.document.light.bright !== 0 || this.token.document.light.dim) this.loadLight();
        this._loaded = true;
        this.initShaders();
        this.animationHandler.init();
        return token3d;
    }
    //remove
    async loadTexture() {
        if (!this.imageTexture) return null;
        const extension = this.imageTexture.split(".").pop();
        const isVideo = extension == "mp4" || extension == "webm" || extension == "ogg" || extension == "mov" || extension == "apng";
        if (isVideo) {
            let video;
            let videoTexture;
            video = $(`<video id="video" loop crossOrigin="anonymous" autoplay="true" muted="muted" playsinline style="display:none;height:auto;width:auto;">
        <source src="${this.imageTexture}"
          type='video/${extension};'>
      </video>`);
            $("body").append(video);
            await resolveMetadata(video[0]);
            videoTexture = new THREE.VideoTexture(video[0]);
            videoTexture.format = THREE.RGBAFormat;
            this.isVideo = true;
            return videoTexture;
        } else {
            return await new THREE.TextureLoader().loadAsync(this.imageTexture);
        }

        function resolveMetadata(video) {
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    resolve(video);
                };
            });
        }
    }

    async getModel() {
        if (!this.gtflPath) {
            const texture = this.texture;
            texture.encoding = THREE.sRGBEncoding;
            const geometry = new THREE.PlaneGeometry((texture.image?.width || texture.image?.videoWidth || 1) / 1000, (texture.image?.height || texture.image?.videoHeight || 1) / 1000);
            const material = new THREE.MeshBasicMaterial();
            const standupModel = new THREE.Mesh(geometry, material);
            standupModel.userData.standupModel = true;
            const object = new THREE.Group();
            object.add(standupModel);
            this.standUp = true;
            this.standUpMesh = object;
            return {
                object: object,
                scene: object,
                model: object,
            };
        }
        const filePath = this.gtflPath;
        const extension = filePath.split(".").pop().toLowerCase();
        const model = await game.Levels3DPreview.helpers.loadModel(this.gtflPath);
        if (model) return model;
        //make 1x1 cube
        const errText = game.i18n.localize("levels3dpreview.errors.filenotsupported") + "(" + extension + "): " + filePath + " Token: " + this.token.document.name;
        console.error(errText);
        ui.notifications.error(errText);
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial();
        const object = new THREE.Mesh(geometry, material);
        this.standUp = true;
        return {
            object: object,
            scene: object,
            model: object,
        };
    }

    removeBaseAndReposition(object) {
        let model = object?.scene;
        if (!model) return;
        let base, eyeL, eyeR;
        model.traverse((child) => {
            if (child.name === "base") {
                base = child;
            }
            if (child.name === "eyeL" && !eyeL) {
                eyeL = child;
            }
            if (child.name === "eyeR" && !eyeR) {
                eyeR = child;
            }
        });
        if (!base) return;
        eyeL?.removeFromParent();
        eyeR?.removeFromParent();
        const groundOffset = object?.object?.asset?.extras?.heroForge?.groundOffset ?? 0;
        base?.removeFromParent();
        model.children.forEach((c) => {
            c.position.y += groundOffset;
        });
    }

    async loadModel() {
        //Load Model
        const loaded = await this.getModel();
        const object = loaded.object;
        const scene = loaded.scene;
        const model = loaded.model;
        if (this.removeBase) {
            this.removeBaseAndReposition(loaded);
            //this.removeBaseAndReposition(object);
        }

        await this.setMaterial(model);
        //Apply rotation
        model.rotation.set(this.rotationX + model.rotation._x, this.rotationY + model.rotation._y, this.rotationZ + model.rotation._z);
        //Calculate scale
        const originalSize = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
        const maxSize = Math.max(originalSize.x, originalSize.y, originalSize.z);
        const targetScale = Math.min(this.token.w, this.token.h) / this.factor;
        const scaleFactor = targetScale / maxSize;
        const scale = this.scale * scaleFactor;
        this.hasGeometry = model.geometry ? true : false;
        model.scale.set(scale, scale, scale);
        //Define hitbox and set offset parameters
        let box = new THREE.Box3().setFromObject(scene);
        let center = box.getCenter(new THREE.Vector3());
        const updatedSize = box.getSize(new THREE.Vector3());
        this.isModel = true;
        let centerOffset = {
            x: this.offsetX / factor + (this.autoCenter ? -center.x : 0),
            y: this.offsetY / factor + 0,
            z: this.offsetZ / factor + (this.autoCenter ? -center.z : 0),
        };

        if (this.standUp) {
            centerOffset.y += updatedSize.y / 2;
        }
        this.mixerAnimations = [];
        if (object.animations.length > 0 && this.enableAnim) {
            this.mixerAnimations = object.animations;
            if (!object.animations[this.animIndex]) {
                console.error("Animation index out of bounds", this.token);
            } else {
                this.mixer = new THREE.AnimationMixer(scene);
                this.mixer.timeScale = this.animSpeed;
                object.animations.forEach((anim) => {
                    this.mixer.clipAction(anim);
                });
                this.mixer._actions[this.animIndex].play();
            }
        }
        model.position.set(centerOffset.x, centerOffset.y, centerOffset.z);
        model.traverse((child) => {
            if (child.isMesh && !this.standUp) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (this.collisionPlane) child.geometry.computeBoundsTree();
            }
        });
        model.userData.draggable = true;
        model.userData.name = this.gtflPath;
        this.model = model;
        const bbBox = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        this.bb = {
            width: bbBox.x,
            height: bbBox.z,
            depth: bbBox.y,
        };
        const pivot = new THREE.Group();
        pivot.add(model);
        //create hitbox
        const height = box.max.y - box.min.y;
        const width = box.max.x - box.min.x;
        const depth = box.max.z - box.min.z;
        const maxDim = Math.max(height, width, depth);
        const hitbox = new THREE.Mesh(
            new THREE.BoxGeometry(width || maxDim, height || maxDim, depth || maxDim),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                wireframe: true,
                transparent: true,
                opacity: 1,
                visible: this._parent.debugMode,
            }),
        );
        hitbox.position.set(0, center.y + centerOffset.y, 0);

        this.hitbox = hitbox;
        this.hitbox.geometry.computeBoundingBox();
        this._size = this.hitbox.geometry.boundingBox.getSize(new THREE.Vector3());

        this.mesh = pivot;
        this.adjust = {
            x: this.offsetX / factor,
            y: this.offsetY / factor,
            z: this.offsetZ / factor,
        };
        this.mesh.userData.hitbox = this.mesh;
        this.mesh.userData.draggable = this.draggable;
        this.mesh.userData.interactive = this.interactive;
        this.mesh.userData.isHitbox = false;
        this.mesh.userData.entity3D = this;
        this.mesh.userData.documentName = this.token.document.documentName;
        this.targetContainer = new THREE.Group();
        this.mesh.add(this.targetContainer);
        this.effectsContainer = new THREE.Group();
        this.mesh.add(this.effectsContainer);
        this.border = new THREE.Group();
        this.mesh.add(this.border);
        //this.setUpProne();
        this.drawBorder();
        this.drawName();
        this.drawBars();
        this.reDraw();
        this.setPosition();
        return this;
    }

    async setMaterial(model) {
        let materialType = this.material;
        if ((!this.material || this.material === "none") && !this.standUp) return;
        if (materialType === "pbr") return await this.loadPBRMat(model);

        if (materialType.includes("preset-")) {
            const material = this._parent.presetMaterialHandler.get(materialType);
            material.color = new THREE.Color(this.color);
            if (model.children?.length) {
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.material = material;
                    }
                });
            }
            return;
        }
        //model.geometry.uvsNeedUpdate = true;
        //model.geometry.buffersNeedUpdate = true;
        let roughness = 0;
        let metalness = 0;
        let color = new THREE.Color(this.color);
        switch (materialType) {
            case "basic":
                break;
            case "metal":
                roughness = 0.5;
                metalness = 0.8;
                break;
            case "plastic":
                roughness = 0.6;
                break;
            case "wood":
                roughness = 1;
                break;
        }

        if (materialType === "texcol") {
            if (model.material) {
                if (this.color) model.material.color = new THREE.Color(this.color);
                model.material.map = this.texture;
            }
            if (model.children?.length) {
                model.traverse((child) => {
                    if (child.isMesh) {
                        if (this.color) child.material.color = new THREE.Color(this.color);
                        child.material.map = this.texture;
                    }
                });
            }
            return;
        }

        const matData = {
            color: color,
            roughness: roughness,
            side: !this.gtflPath ? THREE.DoubleSide : THREE.FrontSide,
            metalness: metalness,
            map: this.texture, //new THREE.TextureLoader().load(this.imageTexture) : null,
            //depthWrite: this.texture && !this.gtflPath ? false : true,
            transparent: this._parent._fullTransparency,
            alphaTest: this._parent._fullTransparency ? 0.01 : 0.99,
        };

        const material = materialType === "basic" ? new THREE.MeshBasicMaterial(matData) : new THREE.MeshStandardMaterial(matData);
        if (model.material) {
            model.material = material;
        }
        if (model.children?.length) {
            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = material;
                }
            });
        }
    }

    async loadPBRMat(model) {
        const material = await this._parent.helpers.getPBRMat(this.imageTexture);
        if (model.material) {
            model.material = material;
        }
        if (model.children?.length) {
            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = material;
                }
            });
        }
    }

    loadLight() {
        this.light = new Light3D(this.token, this._parent, true);
        this.light.light3d.position.set(0, this.d / 2, 0);
        this.mesh.add(this.light.light3d);
        this.setPosition();
    }

    draw() {
        const token = this.token;
        const f = this.factor;
        const w = token.w / f;
        const h = token.h / f;
        const d = ((token.losHeight - token.document.elevation) * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
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

    updatePositionFrom3D(e) {
        this.skipMoveAnimation = true;
        const useSnapped = canvas.scene.grid.type && !e.shiftKey;
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * this.factor - this.token.w / 2;
        const y = z3d * this.factor - this.token.h / 2;
        const z = Math.round(((y3d * this.factor * canvas.dimensions.distance) / canvas.dimensions.size) * 100) / 100;
        const snapped = canvas.grid.getSnappedPosition(x, y);
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        if (!game.user.isGM) {
            if (game.paused) return false;
            const center = canvas.grid.getCenter(x, y);
            const geometryCollisions = game.Levels3DPreview?.object3dSight;
            let collides;
            if (geometryCollisions) {
                const tokenHeight = this.token.losHeight - this.token.document.elevation;
                collides = CONFIG.Levels.API.testCollision(
                    {
                        x: this.token.center.x,
                        y: this.token.center.y,
                        z: this.token.losHeight,
                    },
                    {
                        x: dest.x + this.token.document.width * canvas.grid.size * 0.5,
                        y: dest.y + this.token.document.height * canvas.grid.size * 0.5,
                        z: dest.elevation + tokenHeight,
                    },
                    "collision",
                );
            } else {
                collides = this.token.checkCollision({ x: center[0], y: center[1] });
            }
            if (collides) {
                ui.notifications.error("ERROR.TokenCollide", { localize: true });
                return false;
            }
        }
        const deltas = {
            x: dest.x - this.token.document.x,
            y: dest.y - this.token.document.y,
            elevation: dest.elevation - this.token.document.elevation,
        };
        let updates = [];
        for (let token of canvas.tokens.controlled) {
            updates.push({
                _id: token.id,
                x: token.document.x + deltas.x,
                y: token.document.y + deltas.y,
                elevation: Math.round((token.document.elevation + deltas.elevation) * 1000) / 1000,
                flags: {
                    "levels-3d-preview": {
                        wasFreeMode: !!this.wasFreeMode,
                    },
                },
            });
        }
        canvas.scene.updateEmbeddedDocuments("Token", updates);
        return true;
    }

    _old_setPosition(lerp = false, forcePosition) {
        const currentPosition = {
            x: Math.round(this.mesh.position.x * 1000) / 1000,
            y: Math.round(this.mesh.position.y * 1000) / 1000,
            z: Math.round(this.mesh.position.z * 1000) / 1000,
        };
        const currentRotation = {
            x: Math.round(this.mesh.rotation._x * 1000) / 1000,
            y: Math.round(this.mesh.rotation._y * 1000) / 1000,
            z: Math.round(this.mesh.rotation._z * 1000) / 1000,
        };
        const mesh = this.mesh;
        const token = this.token;
        const tokenCenter = {
            x: (forcePosition?.x ?? token.document.x) + token.w / 2,
            y: (forcePosition?.y ?? token.document.y) + token.h / 2,
        };
        if (!mesh) return;
        const f = this.factor;
        const x = tokenCenter.x / f;
        const z = tokenCenter.y / f;
        let y;
        if (this.isModel) {
            y = (token.document.elevation * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
        } else {
            y = ((token.document.elevation + (token.losHeight - token.document.elevation) / 2) * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
        }

        if (!lerp) mesh.position.set(x, y, z);
        else mesh.position.lerp(new THREE.Vector3(x, y, z), lerp);
        const rotations = {
            x: 0,
            y: -Math.toRadians(token.document.rotation),
            z: 0,
        };
        let toLerp = rotations;
        if (!lerp) mesh.rotation.set(rotations.x, rotations.y, rotations.z);
        else {
            toLerp = new THREE.Quaternion().setFromEuler(mesh.rotation);
            toLerp.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler().setFromVector3(rotations)), 0.1);
            mesh.rotation.setFromQuaternion(toLerp);
        }
        this.elevation3d = y;
        if (this.border && !this.rotateIndicator) {
            this.border.rotation.set(-toLerp.x, -toLerp.y, -toLerp.z);
        }
        if (this.light && this.token.document.light.angle != 360) {
            const rotationy = rotations.y;
            const distance = 1;
            const lx = Math.sin(rotationy) * distance + x;
            const ly = y + this.d / 2;
            const lz = Math.cos(rotationy) * distance + z;
            this.light.light3d.target.position.set(lx, ly, lz);
            this.light.light3d.target.updateMatrixWorld();
        }
        if (currentPosition.x === x && currentPosition.y === y && currentPosition.z === z && currentRotation.x === Math.round(rotations.x * 1000) / 1000 && currentRotation.y === Math.round(rotations.y * 1000) / 1000 && currentRotation.z === Math.round(rotations.z * 1000) / 1000) {
            return false;
        } else {
            return true;
        }
    }

    setPosition(lerp = false, forcePosition) {
        const currentPosition = {
            x: Math.round(this.mesh.position.x * 1000) / 1000,
            y: Math.round(this.mesh.position.y * 1000) / 1000,
            z: Math.round(this.mesh.position.z * 1000) / 1000,
        };
        const currentRotation = {
            x: Math.round(this.mesh.rotation._x * 1000) / 1000,
            y: Math.round(this.mesh.rotation._y * 1000) / 1000,
            z: Math.round(this.mesh.rotation._z * 1000) / 1000,
        };
        const mesh = this.mesh;
        const token = this.token;
        const tokenCenter = {
            x: (forcePosition?.x ?? token.document.x) + token.w / 2,
            y: (forcePosition?.y ?? token.document.y) + token.h / 2,
        };
        if (!mesh) return;
        const f = this.factor;
        const x = tokenCenter.x / f;
        const z = tokenCenter.y / f;
        let y;
        if (this.isModel) {
            y = (token.document.elevation * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
        } else {
            y = ((token.document.elevation + (token.losHeight - token.document.elevation) / 2) * canvas.scene.dimensions.size) / canvas.dimensions.distance / f;
        }

        this.setPositionFrom2D();

        if (!lerp) mesh.position.y = y;
        else {
            const newPos = mesh.position.clone().lerp(new THREE.Vector3(x, y, z), lerp);
            mesh.position.y = newPos.y;
        }
        const rotations = {
            x: 0,
            y: -Math.toRadians(token.document.rotation),
            z: 0,
        };
        let toLerp = rotations;
        if (!lerp) mesh.rotation.set(rotations.x, rotations.y, rotations.z);
        else {
            toLerp = new THREE.Quaternion().setFromEuler(mesh.rotation);
            toLerp.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler().setFromVector3(rotations)), 0.1);
            mesh.rotation.setFromQuaternion(toLerp);
        }
        this.elevation3d = y;
        if (this.border && !this.rotateIndicator) {
            this.border.rotation.set(-toLerp.x, -toLerp.y, -toLerp.z);
        }
        if (this.light && this.token.document.light.angle != 360) {
            const rotationy = rotations.y;
            const distance = 1;
            const lx = Math.sin(rotationy) * distance + x;
            const ly = y + this.d / 2;
            const lz = Math.cos(rotationy) * distance + z;
            this.light.light3d.target.position.set(lx, ly, lz);
            this.light.light3d.target.updateMatrixWorld();
        }
        if (currentPosition.x === x && currentPosition.y === y && currentPosition.z === z && currentRotation.x === Math.round(rotations.x * 1000) / 1000 && currentRotation.y === Math.round(rotations.y * 1000) / 1000 && currentRotation.z === Math.round(rotations.z * 1000) / 1000) {
            return false;
        } else {
            return true;
        }
    }

    setPositionFrom2D() {
        const tokenCenter = this.token.center;
        if (!this.mesh) return;
        const f = this.factor;
        const x = tokenCenter.x / f;
        const z = tokenCenter.y / f;
        this.mesh.position.x = x;
        this.mesh.position.z = z;
    }

    reDraw() {
        this.drawTargets();
        this.drawEffects();
        this.refreshBorder();
        this.setReticule();
    }

    updateAnimation() {
        if (!this.mixer) return;
        const currAction = this.mixer._actions.find((a) => a.isRunning());
        this.animIndex = this.token.document.getFlag("levels-3d-preview", "animIndex") ?? 0;
        const newAction = this.mixer._actions.find((a) => a._clip.uuid == this.mixerAnimations[this.animIndex].uuid);
        for (let act of this.mixer._actions) {
            if (act != newAction && act != currAction) {
                act.stop();
                act.enabled = false;
            }
        }
        if (this.mixerAnimations.length > 0 && this.enableAnim) {
            if (!this.mixerAnimations[this.animIndex]) {
                console.error("Animation index out of bounds", this.token);
            } else {
                newAction.enabled = true;
                currAction.crossFadeTo(newAction, 0.3).play(); //this.mixer.clipAction( this.mixerAnimations[this.animIndex] ).play();
            }
        }
    }

    drawTargets() {
        //remove old targets
        this.reticule.visible = this.token.isTargeted;
        if (!this.targetContainer) return;
        this.updateTargetTexture();
        if (this.isBase && game.settings.get("levels-3d-preview", "hideTarget")) return;
        this.targetContainer.children.forEach((child) => {
            this.targetContainer.remove(child);
        });
        this.targetSize = Math.min(this.h, this.w, this.d) * 0.3;
        this.targetSize = Math.min(Math.max(this.targetSize, 0.02), 0.05);
        let positionOffset = this.targetSize;
        const targetModel = this._parent.models.target;
        for (let target of Array.from(this.token.targeted)) {
            if (target.id === game.user.id && this.enableReticule) continue;
            const color = target.color;
            const position = {
                x: 0,
                y: this.d + this.targetSize + positionOffset,
                z: 0,
            };
            const mesh = targetModel.clone();
            mesh.children[0].material = new THREE.MeshPhongMaterial({ color: color, emissive: color, emissiveIntensity: 0.8 });
            mesh.scale.set(this.targetSize / 100, this.targetSize / 100, this.targetSize / 100);
            mesh.position.set(position.x, position.y, position.z);
            this.targetContainer.add(mesh);
            positionOffset += this.targetSize * 2.5;
        }
    }

    setReticule() {
        this.enableReticule ? this.mesh.add(this.reticule) : this.mesh.remove(this.reticule);
        const scale = Math.max(this.h, this.w, this.d) * 0.8;
        this.reticule.scale.set(scale, scale, scale);
        this.reticule.scale.multiplyScalar(1.2);
        this.reticule.position.y = this.d / 2;
        this.reticule.userData.ignoreHover = true;
        this.reticule.userData.interactive = false;
        this.reticule.userData.noIntersect = true;
    }

    get isTokenProne() {
        const token = this.token;
        switch (game.system.id) {
            case "pf2e":
                return token.actor?.hasCondition("prone") ?? false;
            case "pf1":
                return token.actor?.effects.some((e) => e.getFlag("core", "statusId") === "pf1_prone") ?? false;
            // D35E: no prone condition?
        }
        // dnd5e, dnd4e, sfrpg, dsa5, cyberpunk2020, shadowrun5e, swade, wfrp4e, ...
        return token.actor?.effects.some((e) => e.getFlag("core", "statusId")?.toLowerCase()?.includes("prone")) ?? false;
    }

    updateHiden() {
        if (!game.user.isGM && this.token.document.hidden) return;
        if (!this.originalMatData) {
            this.originalMatData = {};
            this.model.traverse((child) => {
                if (child.isMesh) {
                    this.originalMatData[child.material.uuid] = {
                        transparent: child.material.transparent,
                        opacity: child.material.opacity,
                        format: child.material.format,
                        alphaTest: child.material.alphaTest,
                        depthWrite: child.material.depthWrite,
                    };
                }
            });
        }
        const hidden = this.token.document.hidden || this.hasClone;
        if (this._hidden === hidden) return;
        this._hidden = this.token.document.hidden || this.hasClone;
        this.model.traverse((child) => {
            if (child.isMesh) {
                if (hidden) {
                    child.material.transparent = true;
                    child.material.opacity = 0.5;
                    child.material.alphaTest = 0;
                    child.material.depthWrite = false;
                    child.material.format = THREE.RGBAFormat;
                    child.material.needsUpdate = true;
                } else {
                    const originalData = this.originalMatData[child.material.uuid];
                    child.material.transparent = originalData.transparent;
                    child.material.opacity = originalData.opacity;
                    child.material.alphaTest = originalData.alphaTest;
                    child.material.depthWrite = originalData.depthWrite;
                    child.material.format = originalData.format;
                    child.material.needsUpdate = true;
                }
            }
        });
    }

    drawEffects() {
        //remove old effects
        if (!this.effectsContainer) return;
        this.updateHiden();
        const oldProne = this.isProne ? true : false;
        this.isProne = this.token?.actor?.effects.some((e) => e.getFlag("core", "statusId") === CONFIG.specialStatusEffects.DEFEATED) || this.isTokenProne ? true : false;
        if (oldProne !== this.isProne) this.toggleProne();
        const tokenEffects = this.token.document.effects;
        const actorEffects = this.token.actor?.temporaryEffects || [];
        const effects = tokenEffects.concat(actorEffects).map((e) => e.icon ?? e);
        if (effects.length === this.effectsContainer.children.length) return;
        const toRemove = this.effectsContainer.children.filter((child) => !effects.includes(child.userData.effect));
        toRemove.forEach((child) => {
            child.userData.targetPosition = new THREE.Vector3(0, 0, 0);
            child.userData.initialPosition = child.position.clone();
            child.userData.delta = 0;
        });
        //this.effectsContainer.remove(...toRemove)
        let effectsize = this.h / 5;
        effectsize = Math.min(Math.max(effectsize, 0.02), 0.05) * (canvas.grid.size / 100);

        const radiusSubdivision = (Math.PI * 2) / effects.length;
        let currentRadius = 0;
        const currentEffects = this.effectsContainer.children.map((child) => child.userData.effect);
        for (let effect of effects) {
            const position = {
                x: Math.sin(currentRadius) * (this.h / 2),
                y: this.d + effectsize * 0.5,
                z: Math.cos(currentRadius) * (this.h / 2),
            };
            const mesh = this._getEffectMesh(effect, effectsize);
            mesh.userData.delta = 0;
            mesh.userData.effect = effect;
            mesh.userData.targetPosition = new THREE.Vector3(position.x, position.y, position.z); //mesh.position.set(position.x, position.y, position.z);
            mesh.userData.initialPosition = mesh.position.clone();

            this.effectsContainer.add(mesh);
            currentRadius += radiusSubdivision;
        }
    }

    rotateEffects(delta) {
        if (!this.effectsContainer || !this.effectsContainer?.children?.length) return;
        const speed = delta / 8;
        this.effectsContainer.rotation.y += speed;
        this.effectsContainer.children.forEach((c) => {
            c.rotation.x -= speed / 2;
            if (c.userData.delta < 1) {
                c.userData.delta += delta;
                c.position.lerp(c.userData.targetPosition, c.userData.delta);
                if (delta > 1) c.position.set(c.userData.targetPosition.x, c.userData.targetPosition.y, c.userData.targetPosition.z);
                if (c.userData.targetPosition.y == 0 && c.position.y <= this.baseDepth) c.removeFromParent();
            }
        });
    }

    _getEffectMesh(effect, effectsize) {
        if (this._effectsCache[effect]) return this._effectsCache[effect];
        const effectBaseMesh = game.Levels3DPreview.models.effect.clone();
        effectBaseMesh.scale.multiplyScalar(effectsize);
        const mesh = effectBaseMesh;
        mesh.traverse((child) => {
            if (child.isMesh && child.material.name == "effect") child.material = this._getEffectMaterial(effect);
        });
        mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        this._effectsCache[effect] = mesh;
        return mesh;
    }

    _getEffectMaterial(effect) {
        const cachedEffect = this._parent.effectsCache[effect];
        if (cachedEffect) return cachedEffect;
        const material = new THREE.MeshBasicMaterial({
            map: new THREE.TextureLoader().load(effect),
        });
        this._parent.effectsCache[effect] = material;
        return material;
    }

    drawBorder() {
        this.border.children.forEach((child) => {
            this.border.remove(child);
        });

        if (this.disableBase) return this.setUpProne(true);

        this._setupBorderMaterials();

        this._parent.helpers.getBase().then((resp) => {
            const base = resp.model;
            const scaleFactor = resp.scale;
            const showDisp = resp.showDisp;
            if (showDisp) {
                this.baseColor = this.dispositionColor;
            }
            const box = new THREE.Box3().setFromObject(base);
            const sphere = box.getBoundingSphere(new THREE.Sphere());
            const maxDimension = sphere.radius * 2; //Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
            const maxComputed = (Math.max(this.token.document.width, this.token.document.height) * canvas.grid.size) / factor;
            const scale = (maxComputed * Math.SQRT2) / maxDimension;
            base.scale.multiplyScalar(scale * scaleFactor);
            base.position.set(0, 0, 0);
            const offsetMesh = base.children.find((child) => child.name == "base");
            base.traverse((child) => {
                if (child.isMesh) {
                    if (child == offsetMesh) {
                        if ((child.material.color.r = 1 && child.material.color.g == 1 && child.material.color.b == 1)) {
                            child.material.color = new THREE.Color(this.baseColor);
                        }
                    } else {
                        child.material.color = new THREE.Color(this.baseColor);
                    }
                }
            });
            const offsetBox = new THREE.Box3().setFromObject(offsetMesh);
            const offset = offsetBox.max.y;
            if (this.solidBaseMode === "ontop") {
                this.model.position.y += offset * scale * scaleFactor;
            }
            const hlMeshes = [];
            const hlrMeshes = [];
            base.traverse((child) => {
                if (child.material?.name == "highlight") hlMeshes.push(child);
                if (child.material?.name == "highlight_ring") hlrMeshes.push(child);
            });
            this.border.userData.highlight = hlMeshes;
            this.border.userData.highlight_ring = hlrMeshes;
            this.border.add(base);
            this.refreshBorder();
            this.setUpProne(true);
        });

        this.addStem();
    }

    _setupBorderMaterials() {
        const mat1 = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.8,
            roughness: 0.4,
        });
        const mat2 = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this.baseColor), //0x1c1c1c,
            roughness: 0.4,
            normalMap: this._parent.textures.indicator.normal,
            normalScale: new THREE.Vector2(0.2, 0.2),
        });
        const mat3 = mat1.clone();
        //const mat4 = mat1.clone();
        const mat4 = new THREE.MeshStandardMaterial({
            emissiveIntensity: 0.8,
        });
        mat3.emissive = this.combatColor;
        mat3.color = this.combatColor;

        this.materialsCache = {
            base: mat2,
            highlight: mat1,
            combat: mat3,
            targeted: mat4,
        };
    }

    addStem() {
        const baseRadius = (Math.SQRT2 * ((Math.max(this.token.document.width, this.token.document.height) * canvas.grid.size) / factor)) / 2;
        if (!this.isBase || !this.stem) return;
        let w = baseRadius * 1.02;
        let h = baseRadius * 1.02;
        const radius = Math.min(w, h) * 0.03;
        const height = new THREE.Box3().setFromObject(this.model).min.y * 2;
        const stemMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, height, 64),
            new THREE.MeshStandardMaterial({
                color: this.color,
                transparent: true,
                opacity: 0.5,
                roughness: 0,
                metalness: 1,
            }),
        );
        stemMesh.position.set(0, height / 2, 0);
        stemMesh.castShadow = true;
        stemMesh.receiveShadow = true;
        this.stem = stemMesh;
        this.border.add(stemMesh);
    }

    updateTargetTexture() {
        if (!this.isBase) return;
        const targeted = this.enableReticule ? Array.from(this.token.targeted).filter((t) => t.id !== game.user.id) : Array.from(this.token.targeted);
        const colors = targeted.map((t) => t.color);
        const colorstring = colors.join("");
        if (!colors.length) return;
        let text;
        if (!this._parent.targetTextures[colorstring]) {
            let g = new PIXI.Graphics();
            for (let i = 0; i < colors.length; i++) {
                g.beginFill(colors[i].replace("#", "0x"));
                g.drawRect(i, 0, 1, 1);
            }
            const base64 = canvas.app.renderer.extract.base64(g);
            text = new THREE.TextureLoader().load(base64, (t) => {
                t.magFilter = THREE.NearestFilter;
                t.minFilter = THREE.NearestFilter;
                t.needsUpdate = true;
            });
            this._parent.targetTextures[colorstring] = text;
        } else {
            text = this._parent.targetTextures[colorstring];
        }
        this._targetMap = text;
    }

    refreshBorder() {
        if (!this.border) return;
        const isInactive = !this.token.controlled && !this.token._hover;
        const color = isInactive ? this.baseColor : this.token.border?._lineStyle?.color;
        const combatColor = this.combatColor;
        const isActiveCombatant = game.combat?.current?.tokenId === this.token.id && game.settings.get("levels-3d-preview", "highlightCombat");
        const threeColor = isInactive && isActiveCombatant ? this.combatColor : new THREE.Color(color);
        const highlightMaterial = this.border.userData.highlight;
        const highlight_ringMaterial = this.border.userData.highlight_ring;
        const isEmissive = !(isInactive && !isActiveCombatant);
        if (highlightMaterial?.length) {
            highlightMaterial.forEach((m) => {
                m.material.color = threeColor;
                m.material.emissive = isEmissive ? threeColor : new THREE.Color(0, 0, 0);
                m.material.emissiveIntensity = isEmissive ? 0.8 : 0;
            });
        }

        if (highlight_ringMaterial?.length) {
            highlight_ringMaterial.forEach((m) => {
                m.material.color = isActiveCombatant ? combatColor : new THREE.Color(color);
                if (this.token.targeted.size) {
                    m.material.color = new THREE.Color(1, 1, 1);
                    m.material.emissiveMap = this._targetMap;
                    m.material.map = this._targetMap;
                    m.material.emissiveIntensity = 0.8;
                    m.material.needsUpdate = true;
                } else {
                    m.material.emissiveMap = null;
                    m.material.map = null;
                    m.material.color = threeColor;
                    m.material.emissive = isEmissive ? threeColor : new THREE.Color(0, 0, 0);
                    m.material.emissiveIntensity = isEmissive ? 0.8 : 0;
                    m.material.needsUpdate = true;
                }
            });
        }
    }

    async drawName() {
        const name = this.token._drawNameplate();
        name.width *= 2;
        name.height *= 2;
        const container = new PIXI.Container();
        container.addChild(name);
        const base64 = canvas.app.renderer.extract.base64(container);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: await new THREE.TextureLoader().loadAsync(base64),
            transparent: true,
            alphaTest: 0.1,
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.center.set(0.5, 0.5);
        this.mesh.remove(this.nameplate);
        this.nameplate = sprite;
        this.nameplate.userData.ignoreIntersect = true;
        this.nameplate.userData.ignoreHover = true;
        const width = (0.5 * name.width) / this.factor;
        const height = (0.5 * name.height) / this.factor;
        this.nameplate.scale.set(width, height, 1);
        this.nameplate.position.set(0, this.d + height / 2 + 0.042, 0);
        this.mesh.add(this.nameplate);
    }

    async drawBars() {
        if (!this.token?.bars || !this.token?.bars?.visible) return;
        const bar1 = this.token.bars["bar1"].clone();
        const bar2 = this.token.bars["bar2"].clone();
        const container = new PIXI.Container();
        container.addChild(bar1);
        container.addChild(bar2);
        bar2.position.set(0, bar1.height + 3);
        const base64 = canvas.app.renderer.extract.base64(container);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: await new THREE.TextureLoader().loadAsync(base64),
            transparent: true,
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.center.set(0.5, 0.5);
        this.mesh.remove(this.bars);
        this.bars = sprite;
        this.bars.userData.ignoreIntersect = true;
        this.bars.userData.ignoreHover = true;
        const width = container.width / this.factor;
        const height = container.height / this.factor;
        this.bars.scale.set(width, height, 1);
        this.bars.position.set(0, this.d - height + 0.037, 0);
        this.mesh.add(this.bars);
    }

    setUpProne() {
        if (this.proneHandler.proneInit) return;
        this.proneHandler = {};
        this.proneHandler.proneInit = true;
        this.proneHandler.originalPosition = this.model.position.clone();
        this.proneHandler.originalRotation = this.model.rotation.clone();
        this.proneHandler.originalScale = this.model.scale.clone();
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const dimensions = box.getSize(new THREE.Vector3());
        const offsetY = this.gtflPath && this.gtflPath.includes("[HeroForge]") ? center.y / 2 : 0;

        const targetRotation = this.model.rotation.clone();

        const targetPosition = this.model.position.clone();

        targetPosition.y = targetPosition.y - box.min.y;

        if (isFlat(this.standUp)) {
            targetRotation.x = -Math.PI / 2;
            targetPosition.y = targetPosition.y - dimensions.y / 2 + 0.02;
        } else if (isBird(dimensions, center)) {
            targetRotation.z = -Math.PI;
            targetPosition.y += dimensions.y + center.y;
        } else if (isCrab(dimensions)) {
            targetRotation.z = -Math.PI;
            targetPosition.y += dimensions.y;
        } else if (isDog(dimensions)) {
            targetRotation.z = -Math.PI / 2;
            targetPosition.x -= dimensions.y / 2;
            targetPosition.y += dimensions.x / 2;
        } else if (isHuman(dimensions)) {
            targetRotation.x = -Math.PI / 2;
            targetPosition.z += dimensions.y / 2;
            targetPosition.y += dimensions.z / 2;
        }

        targetPosition.y -= offsetY;

        function isBird(box, center) {
            return isCrab(box) && center.y > box.y;
        }
        function isCrab(box) {
            return box.y < box.x && box.y < box.z;
        }
        function isDog(box) {
            return box.y > box.x && (box.x < box.z / 1.5 || box.z < box.x / 1.5);
        }
        function isFlat(box) {
            return box;
        }
        function isHuman(box) {
            return true;
        }

        this.proneHandler.targetPosition = targetPosition;
        this.proneHandler.targetRotation = targetRotation;
        if (this.isProne) {
            this.model.position.copy(this.proneHandler.targetPosition);
            this.model.rotation.copy(this.proneHandler.targetRotation);
            if (this.stem) this.stem.visible = !this.isProne;
        }
    }

    toggleProne() {
        if (!this.proneHandler.targetPosition) {
            this.setUpProne();
        }
        this.animateProne = true;
        this.proneHandler.currentDelta = 0;
        this.proneHandler.currentTarget = {};
        if (this.isProne) {
            this.proneHandler.currentTarget.position = this.proneHandler.targetPosition;
            this.proneHandler.currentTarget.rotation = this.proneHandler.targetRotation;
        } else {
            this.proneHandler.currentTarget.position = this.proneHandler.originalPosition;
            this.proneHandler.currentTarget.rotation = this.proneHandler.originalRotation;
        }
        if (this.stem) this.stem.visible = !this.isProne;
    }

    updateProne(delta) {
        this.animationHandler.animate(delta);
        if (!this.proneHandler || !this.animateProne || !this.proneHandler.currentTarget) return;
        this.proneHandler.currentDelta += delta;
        this.model.position.lerp(this.proneHandler.currentTarget.position, this.proneHandler.currentDelta);
        const oRotationV3 = new THREE.Vector3(this.proneHandler.currentTarget.rotation.x, this.proneHandler.currentTarget.rotation.y, this.proneHandler.currentTarget.rotation.z);
        const mRotationV3 = new THREE.Vector3(this.model.rotation.x, this.model.rotation.y, this.model.rotation.z);
        mRotationV3.lerp(oRotationV3, this.proneHandler.currentDelta);
        this.model.rotation.set(mRotationV3.x, mRotationV3.y, mRotationV3.z);
        if (this.proneHandler.currentDelta >= 1) {
            this.animateProne = false;
            this.model.position.set(this.proneHandler.currentTarget.position.x, this.proneHandler.currentTarget.position.y, this.proneHandler.currentTarget.position.z);
            this.model.rotation.set(this.proneHandler.currentTarget.rotation.x, this.proneHandler.currentTarget.rotation.y, this.proneHandler.currentTarget.rotation.z);
        }
    }

    faceCamera() {
        if (!this.model?.children[0]) return;
        const camera = this._parent.camera;
        const vector = new THREE.Vector3(0, this._parent.camera.position.y >= Number.EPSILON ? -1 : 1, 0);
        vector.applyQuaternion(camera.quaternion);
        const modelRotation = Math.abs(this.mesh.rotation.x) == Math.PI ? Math.sign(this.mesh.rotation.x) * (Math.PI + this.mesh.rotation.y) : this.mesh.rotation.y;
        const angle = Math.atan2(vector.x, vector.z) - modelRotation;
        if (this.isProne) {
            this.model.children[0].rotation.y = 0;
            this.model.children[0].rotation.z = angle;
        } else {
            this.model.children[0].rotation.z = 0;
            this.model.children[0].rotation.y = angle;
        }
    }

    updateVisibility() {
        if (!this._loaded || !this.mesh || !this.nameplate) return;
        this.mesh.visible = this.alwaysVisible || this.token.visible;
        this.nameplate.visible = this.token.nameplate?.visible;
        if (this.bars) this.bars.visible = this.token?.bars?.visible;
    }

    getColor() {
        const hasPlayerOwner = this.token.actor?.hasPlayerOwner;
        if (!hasPlayerOwner) return 0xf2ff00;
        for (let [userId, permLevel] of Object.entries(this.token.actor.ownership)) {
            if (permLevel < 3) continue;
            const user = game.users.get(userId);
            if (!user || user.isGM) continue;
            return user.color;
        }
        return 0xf2ff00;
    }

    getDispColor() {
        const disposition = this.token.document.disposition;
        let disp = "NEUTRAL";
        for (const [k, v] of Object.entries(CONST.TOKEN_DISPOSITIONS)) {
            if (v === disposition) {
                disp = k;
            }
        }
        const color = CONFIG.Canvas.dispositionColors[disp];
        return new THREE.Color(color);
    }

    _onClickLeft(e) {
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
        this.token._onClickLeft(event);
    }

    _onClickRight(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.token._onClickRight(event);
    }

    _onClickLeft2(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.token._onClickLeft2(event);
    }

    _onClickRight2(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.token._onClickRight2(event);
    }

    _onHoverIn(e) {
        if (this.hasClone) return;
        this.placeable._onHoverIn(e);
        this._parent.setCursor("pointer");
    }

    _onHoverOut(e) {
        if (this.hasClone) return;
        this.placeable._onHoverOut(e);
        this._parent.setCursor("auto");
    }

    destroy() {
        this._parent.scene.remove(this.mesh);
        this._destroyed = true;
        delete this._parent.tokens[this.id];
    }

    refresh() {
        this.destroy();
        this._parent.addToken(this.token);
    }

    initShaders() {
        this._parent.shaderHandler.applyShader(this.model, this, this.shaders);
    }

    get h() {
        return this._size.z;
    }

    get w() {
        return this._size.x;
    }

    get d() {
        return this._size.y;
    }

    get headFast() {
        return {
            x: this.mesh.position.x,
            y: this.mesh.position.y + this.d,
            z: this.mesh.position.z,
        };
    }

    get head() {
        return new THREE.Vector3(this.mesh.position.x, this.mesh.position.y + this.d, this.mesh.position.z);
    }

    get mid() {
        return new THREE.Vector3(this.mesh.position.x, this.mesh.position.y + this.d / 2, this.mesh.position.z);
    }

    get radius() {
        return Math.min(this.token.document.width / factor, this.token.document.height / factor) / 2.1;
    }

    static setHooks() {
        Hooks.on("updateToken", (tokenDocument, updates) => {
            if (!game.Levels3DPreview._active) return;
            const token = tokenDocument.object;
            const wasFreeUpdated = updates?.flags && updates?.flags["levels-3d-preview"] && updates?.flags["levels-3d-preview"].wasFreeMode !== undefined;
            const animChanged = updates?.flags && updates?.flags["levels-3d-preview"] && updates?.flags["levels-3d-preview"].animIndex !== undefined;
            const onlyAnim = animChanged === true && Object.values(updates?.flags["levels-3d-preview"]).length === 1;
            if (animChanged) {
                game.Levels3DPreview.tokens[token.id]?.updateAnimation();
            }
            if ((updates?.flags && updates?.flags["levels-3d-preview"] && !wasFreeUpdated && !onlyAnim) || "light" in updates || "width" in updates || "height" in updates || "texture" in updates) {
                game.Levels3DPreview.tokens[token.id]?.refresh();
            }
            if ("x" in updates || "y" in updates || "elevation" in updates || "rotation" in updates) {
                const token3d = game.Levels3DPreview.tokens[token.id];
                if (!token3d) return;
                if (!updates.x && !updates.y && !updates.elevation && updates.rotation) return token3d.setPosition();
                const prevPos = {
                    x: token3d.token.x,
                    y: token3d.token.y,
                };
                const x = updates.x ?? token.document.x;
                const y = updates.y ?? token.document.y;
                let dist = token3d.dragCanceled ? canvas.dimensions.size * 2 + 1 : Math.sqrt(Math.pow(x - prevPos.x, 2) + Math.pow(y - prevPos.y, 2));
                dist = updates.elevation !== undefined && dist === 0 ? canvas.dimensions.size * 2 + 1 : dist;
                if (dist == 0 || dist < canvas.dimensions.size * 2) return (token3d.fallbackAnimation = true);
                token3d.fallbackAnimation = false;
                token3d.dragCanceled = false;
                const larpFactor = canvas.dimensions.size / (dist * 2);
                let exitLerp = false;
                setTimeout(() => {
                    exitLerp = true;
                }, 4000);
                token3d.isAnimating = false;
                setTimeout(async () => {
                    token3d.isAnimating = true;

                    const elevation = updates.elevation ?? token.document.elevation;
                    while (token3d.isAnimating && !exitLerp && token3d.setPosition(larpFactor, { x, y, elevation })) {
                        await sleep(1000 / 60);
                    }
                    if (exitLerp) token3d.setPosition(false, { x, y, elevation });
                    token3d.isAnimating = false;
                }, 200);
            }
        });

        Hooks.on("targetToken", (user, token) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.tokens[token.id]?.reDraw();
        });

        Hooks.on("updateToken", (token) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.tokens[token.id]?.drawEffects();
        });

        Hooks.on("createToken", (tokenDocument) => {
            if (game.Levels3DPreview?._active && tokenDocument.object) game.Levels3DPreview.addToken(tokenDocument.object);
        });

        Hooks.on("deleteToken", (tokenDocument) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.tokens[tokenDocument.id]?.destroy();
        });

        Hooks.on("updateCombat", () => {
            if (game.Levels3DPreview?._active) {
                for (let token of Object.values(game.Levels3DPreview.tokens)) {
                    token.refreshBorder();
                }
            }
        });

        Hooks.on("pasteToken", (copy, data) => {
            if (game.Levels3DPreview?._active) {
                const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
                data.forEach((td) => (td.elevation = pos.z));
            }
        });

        Hooks.on("renderTokenHUD", (hud) => {
            if (!game.Levels3DPreview?._active) return;
            const token3d = game.Levels3DPreview.tokens[hud.object.id];
            const tokenAnimations = game.Levels3DPreview.CONFIG.tokenAnimations;
            const height = hud.element.find(`div[data-action="effects"]`).height();
            let taMenuHtml = `<div class="control-icon" data-action="3d-animations">
    <i class="fas fa-magic" title="${game.i18n.localize(`levels3dpreview.tokenAnimations.title`)}" data-action="3d-animations"></i>
    <div class="status-effects" style="transform: translateY(${height}px);" >`;

            const shaders = token3d.shaders;

            for (const [shaderId, shader] of Object.entries(game.Levels3DPreview.shaderHandler.shaderLib)) {
                if (shaderId == "defaults") continue;
                const $item = $(shader.icon);
                $item.css({
                    "font-size": "20px",
                    "text-align": "center",
                    "line-height": "24px",
                });
                $item.toggleClass("active", shaders[shaderId]?.enabled ? true : false);
                $item.addClass("effect-control");
                $item.attr("data-shader-id", shaderId);
                $item.attr("data-tooltip", game.i18n.localize(`levels3dpreview.shaders.${shaderId}.name`));
                taMenuHtml += $item[0].outerHTML;
            }

            const itemsCount = (Object.values(game.Levels3DPreview.shaderHandler.shaderLib).length - 1) % 4;
            for (let i = 0; i < itemsCount; i++) {
                taMenuHtml += `<hr>`;
            }

            for (let anim of Object.values(tokenAnimations)) {
                if (anim.icon.includes(".")) {
                    taMenuHtml += `<img class="effect-control" src="${anim.icon}" data-tooltip="${anim.name}" data-anim-id="${anim.id}">`;
                } else {
                    taMenuHtml += `<i class="${anim.icon ?? "fas fa-magic"} effect-control" data-tooltip="${anim.name}" data-anim-id="${anim.id}"></i>`;
                }
            }
            if (token3d.mixerAnimations?.length > 1) {
                const currentAnim = token3d.animIndex;
                for (let i = 0; i < token3d.mixerAnimations.length; i++) {
                    const modelAnim = token3d.mixerAnimations[i];
                    const name = modelAnim.name || "A";
                    const firstLetter = name.charAt(0).toUpperCase();
                    taMenuHtml += `<i class="effect-control${i === currentAnim ? " active" : ""}" style="line-height: 24px;" data-tooltip="${modelAnim.name}" data-anim-index="${i}">${firstLetter}</i>`;
                }
            }

            taMenuHtml += `</div></div>`;
            const $taMenu = $(taMenuHtml);
            $taMenu.on("click", (e) => {
                e.preventDefault();
                if (e.target.dataset.action !== "3d-animations") return;
                const $statusEffects = $taMenu.find(".status-effects");
                $taMenu.toggleClass("active");
                $statusEffects.toggleClass("active");
            });
            $taMenu.on("click", ".effect-control", (e) => {
                const $effectControl = $(e.currentTarget);
                const animId = $effectControl.data("animId");
                const animIndex = $effectControl.data("animIndex");
                const shaderId = $effectControl.data("shaderId");
                if (shaderId) {
                    hud.object.document.setFlag("levels-3d-preview", `shaders.${shaderId}.enabled`, !$effectControl.hasClass("active"));
                    $effectControl.toggleClass("active");
                } else if (animId) {
                    game.Levels3DPreview.playTokenAnimation(hud.object.id, animId);
                } else {
                    $taMenu.find(".effect-control").removeClass("active");
                    $effectControl.addClass("active");
                    hud.object.document.setFlag("levels-3d-preview", "animIndex", animIndex);
                }
            });
            hud.element.find(`div[data-action="effects"]`).after($taMenu);
        });
    }
}
