import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { Ruler3D } from "../systems/ruler3d.js";
import { SimplexNoise } from "../lib/noiseFunctions.js";

export class Light3D {
    constructor(light, parent, isToken) {
        this.light = light;
        this._parent = parent;
        this.isToken = isToken;
        this._useHelper = game.user.isGM && game.settings.get("levels-3d-preview", "lightHelpers");
        this.animationFn = () => {};
        if (!this.isToken) {
            this.embeddedName = this.light.document.documentName;
            this.draggable = true;
            this.placeable = this.light;
        }
        this.init();
    }

    init() {
        this.noise = new SimplexNoise();
        this.light3d = this.angle != 360 ? new THREE.SpotLight() : new THREE.PointLight();
        this.isPointLight = this.angle == 360;
        this.mesh = new THREE.Group();
        const shadowRes = game.settings.get("levels-3d-preview", "shadowQuality");
        this.light3d.shadow.bias = -0.035;
        this.light3d.shadow.camera.near = 0.001;
        this.light3d.shadow.mapSize.width = 256 * shadowRes;
        this.light3d.shadow.mapSize.height = 256 * shadowRes;
        this.refresh();
        if (!this.isToken) {
            this.mesh.add(this.light3d);
            this._parent.scene.add(this.mesh);
            if (game.user.isGM) this.createHandle();
        }
    }

    get useHelper() { 
        return this._useHelper && !this.isToken;
    }

    createHandle() {
        const texture = this._parent.textures.lightOn;
        const size = (canvas.scene.dimensions.size * 0.5) / factor / 2;
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: new THREE.Color("white"), transparent: true, depthWrite: false, opacity: 0.5 });
        const lightSphere = new THREE.Mesh(geometry, material);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.8 }));
        sprite.scale.set(size * 1.5, size * 1.5, size * 1.5);
        const mesh = new THREE.Group();
        mesh.add(lightSphere);
        mesh.add(sprite);
        this.mesh.userData.hitbox = mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        mesh.userData.entity3D = this;
        mesh.userData.isHitbox = true;
        mesh.userData.sprite = sprite;
        mesh.userData.sphere = lightSphere;
        this.dragHandle = mesh;
        this.mesh.add(mesh);
    }

    updateHandle() {
        if (!this.dragHandle) return;
        this.dragHandle.visible = canvas.lighting.active;
        if(this.useHelper) this.lightHelper.visible = canvas.lighting.active && !this.light.document.hidden;
        if (!this.dragHandle.visible) return;
        this.dragHandle.userData.sprite.material.map = this.light.document.hidden ? this._parent.textures.lightOff : this._parent.textures.lightOn;
        this.dragHandle.userData.sprite.material.color.set(this.light.document.hidden ? "#ff0000" : "#ffffff");
        this.dragHandle.userData.sphere.material.color.set(this.color || "#ffffff");
    }

    updatePositionFrom3D(e) {
        this.skipMoveAnimation = true;
        const useSnapped = Ruler3D.useSnapped();
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor;
        const y = z3d * factor;
        const z = Math.round(((y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size) * 100) / 100;
        const snapped = canvas.grid.getSnappedPosition(x, y);
        const { rangeTop, rangeBottom } = CONFIG.Levels.helpers.getRangeForDocument(this.light.document);
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        const deltas = {
            x: dest.x - this.light.document.x,
            y: dest.y - this.light.document.y,
            elevation: dest.elevation - rangeBottom,
        };
        let updates = [];
        for (let light of canvas.activeLayer.controlled.length ? canvas.activeLayer.controlled : [this.light]) {
            const lightFlags = CONFIG.Levels.helpers.getRangeForDocument(light.document);
            updates.push({
                _id: light.id,
                x: light.document.x + deltas.x,
                y: light.document.y + deltas.y,
                flags: {
                    "levels-3d-preview": {
                        wasFreeMode: this.wasFreeMode,
                    },
                    levels: {
                        rangeBottom: Math.round((lightFlags.rangeBottom + deltas.elevation) * 1000) / 1000,
                        rangeTop: Math.round((lightFlags.rangeBottom + deltas.elevation) * 1000) / 1000,
                    },
                },
            });
        }
        canvas.scene.updateEmbeddedDocuments("AmbientLight", updates);
        return true;
    }

    refresh() {
        const light = this.light;
        const tilt = Math.toRadians(light.document.getFlag("levels-3d-preview", "tilt") ?? 0);
        this.particleData = this.getParticleData();
        this.animColors = {
            color1: new THREE.Color(this.particleData.color),
            color2: new THREE.Color(this.particleData.color2),
        };
        if (this.dragHandle) {
            this.dragHandle.position.set(0, 0, 0);
        }
        if (light.document.getFlag("levels-3d-preview", "castShadow") && game.settings.get("levels-3d-preview", "shadowQuality") > 0) {
            this.light3d.shadow.autoUpdate = true;
            this.light3d.castShadow = true;
        }
        let top = light.document.flags.levels?.rangeTop ?? 1;
        let bottom = light.document.flags.levels?.rangeBottom ?? 1;
        const z = ((top + bottom) * canvas.scene.dimensions.size) / canvas.scene.dimensions.distance / 2;
        this.z = (top + bottom) / 2;
        const color = this.color || "#ffffff";
        const radius = (Math.max(this.dim, this.bright) * (canvas.scene.dimensions.size / canvas.scene.dimensions.distance)) / factor;
        const alpha = this.alpha * 9;
        const decay = (this.dim / (this.bright + 10)) * 2;
        const position = {
            x: light.document.x / factor,
            y: z / factor,
            z: light.document.y / factor,
        };
        if (!this.isToken) {
            this.mesh.position.set(position.x, position.y, position.z);
        }
        this.light3d.position.set(0,0,0);
        this.light3d.color.set(color);
        this.light3d.distance = radius;
        this.light3d.decay = decay;
        this.light3d.intensity = alpha;
        this.light3d.shadow.camera.far = radius;
        this.light3d.shadow.camera.near = 0.02;
        this.initialLightParams = {
            color: color,
            radius: radius,
            decay: decay,
            intensity: alpha,
        };
        if (this.angle != 360) {
            if(!this.light3d.target) this.light3d.target = new THREE.Object3D();
            this.light3d.angle = Math.toRadians(this.angle) / 2;
            const group = new THREE.Group();
            const sphere = new THREE.Object3D();
            group.add(sphere);
            sphere.position.set(1, 0, 0);
            group.rotateOnAxis(new THREE.Vector3(0, 0, 1), tilt);
            group.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.toRadians(- this.rotation - 90));
            this.light3d.target.position.copy(sphere.getWorldPosition(new THREE.Vector3()));
            this.light3d.target.position.add(new THREE.Vector3(position.x, position.y, position.z));
            this.light3d.target.updateMatrixWorld();
        }
        //this.light3d.visible = !this.light.document.hidden && radius != 0;
        if (this.light.document.hidden || radius == 0) {
            this.light3d.distance = 0;
            this.light3d.decay = 9999999;
            this.light3d.intensity = 0;
        }
        this.animationFn = (lightAnimations[this.animationType] ?? lightAnimations.none).bind(this);
        if (this.useHelper) {            
            this.mesh.remove(this.lightHelper);
            this.lightHelper?.dispose();
            this.lightHelper = this.angle != 360 ? new THREE.SpotLightHelper(this.light3d) : new THREE.PointLightHelper(this.light3d, radius);
            this.mesh.add(this.lightHelper);
            this.lightHelper.update();
            this.lightHelper.matrix = this.light3d.matrix;
            if (this.angle === 360) this.lightHelper.geometry = new THREE.SphereGeometry(radius, 8, 8);
            else this.lightHelper.cone.lookAt(this.light3d.target.position)
        }
        if (this.light.document.getFlag("levels-3d-preview", "enableParticle")) this.initParticle();
    }

    update(delta) {
        this.animationFn(delta);
    }

    destroy() {
        this._parent.scene.remove(this.mesh);
        if (this.particleEffectId) Particle3D.stop(this.particleEffectId);
        this.lightHelper?.dispose();
    }

    initParticle() {
        if (!game.settings.get("levels-3d-preview", "enableEffects")) return;
        if (this.particleEffectId) Particle3D.stop(this.particleEffectId);
        if (this.light.document.hidden && !this.light.document.getFlag("levels-3d-preview", "enableParticleHidden")) return;
        const particleData = this.particleData;
        this.particleEffect = new Particle3D("e");
        this.particleEffect
            .sprite(particleData.sprite)
            .scale(particleData.scale)
            .color(particleData.color.split(","), particleData.color2 ? particleData.color2.split(",") : undefined)
            .force(particleData.force)
            .gravity(particleData.gravity)
            .life(particleData.life)
            .rate(particleData.count, particleData.emitTime)
            .duration(Infinity)
            .mass(particleData.mass)
            .alpha(particleData.alphaStart, particleData.alphaEnd)
            .emitterSize(((Math.max(this.dim, this.bright) + 0.1) / canvas.scene.dimensions.distance) * Math.max(particleData.emitterScale, 0.000001))
            .push(particleData.push.dx, particleData.push.dy, particleData.push.dz)
            .to({ x: this.light.center.x, y: this.light.center.y, z: this.z });
        this.particleEffectId = this.particleEffect.start(false);
    }

    getParticleData() {
        return {
            sprite: this.light.document.getFlag("levels-3d-preview", "ParticleSprite") ?? "",
            emitterScale: this.light.document.getFlag("levels-3d-preview", "ParticleEmitterSizeMultiplier") ?? 1,
            scale: this.light.document.getFlag("levels-3d-preview", "ParticleScale") ?? 1,
            color: this.light.document.getFlag("levels-3d-preview", "ParticleColor") ?? "#ffffff",
            color2: this.light.document.getFlag("levels-3d-preview", "ParticleColor2") ?? "#ffffff",
            force: this.light.document.getFlag("levels-3d-preview", "ParticleForce") ?? 0,
            gravity: this.light.document.getFlag("levels-3d-preview", "ParticleGravity") ?? 1,
            life: this.light.document.getFlag("levels-3d-preview", "ParticleLife") ?? 1000,
            count: this.light.document.getFlag("levels-3d-preview", "ParticleCount") ?? 5,
            emitTime: this.light.document.getFlag("levels-3d-preview", "ParticleEmitTime") ?? 1,
            mass: this.light.document.getFlag("levels-3d-preview", "ParticleMass") ?? 1000,
            alphaStart: this.light.document.getFlag("levels-3d-preview", "ParticleAlphaStart") ?? 0,
            alphaEnd: this.light.document.getFlag("levels-3d-preview", "ParticleAlphaEnd") ?? 1,
            push: {
                dx: this.light.document.getFlag("levels-3d-preview", "ParticlePushX") ?? 0,
                dy: this.light.document.getFlag("levels-3d-preview", "ParticlePushY") ?? 0,
                dz: this.light.document.getFlag("levels-3d-preview", "ParticlePushZ") ?? 0,
            },
        };
    }

    _onClickLeft(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
        this.light._onClickLeft(event);
    }

    _onClickLeft2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
        this.light._onClickLeft2(event);
    }

    _onClickRight(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
        this.light._onClickRight(event);
    }

    _onClickRight2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            },
        };
        this.light._onClickRight2(event);
    }

    _onHoverIn(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        this.placeable._onHoverIn(e);
    }

    _onHoverOut(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        this.placeable._onHoverOut(e);
    }

    get lightData() {
        return this.light.document.light ?? this.light.document.config;
    }

    get dim() {
        return this.lightData.dim ?? this.light.document.dimLight;
    }

    get bright() {
        return this.lightData.bright ?? this.light.document.brightLight;
    }

    get alpha() {
        return this.lightData.alpha ?? this.light.document.lightAlpha;
    }

    get color() {
        return this.lightData.color ?? this.light.document.lightColor;
    }

    get angle() {
        return this.lightData.angle ?? this.light.document.lightAngle;
    }

    get rotation() {
        return this.lightData.rotation ?? this.light.document.rotation;
    }

    get animationIntensity() {
        return this.lightData.animation.intensity / 5;
    }

    get animationSpeed() {
        return this.lightData.animation.speed / 5;
    }

    get animationType() {
        return this.lightData.animation.type;
    }

    static setHooks() {
        Hooks.on("updateAmbientLight", (lightDocument) => {
            if (game.Levels3DPreview?._active) {
                const light3d = game.Levels3DPreview.lights.sceneLights[lightDocument.id];
                if (!light3d) return;
                const isDocumentPoint = lightDocument.config.angle === 360;
                const isLightPoint = light3d.isPointLight;
                if (isDocumentPoint !== isLightPoint) { 
                    light3d.destroy();
                    game.Levels3DPreview.addLight(lightDocument.object);
                    return;
                }
                game.Levels3DPreview.lights.sceneLights[lightDocument.id]?.refresh();
            }
        });

        Hooks.on("createAmbientLight", (lightDocument) => {
            if (game.Levels3DPreview?._active && lightDocument.object) game.Levels3DPreview.addLight(lightDocument.object);
        });

        Hooks.on("deleteAmbientLight", (lightDocument) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.lights.sceneLights[lightDocument.id]?.destroy();
        });

        Hooks.on("pasteAmbientLight", (copy, data) => {
            if (game.Levels3DPreview?._active) {
                const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
                data.forEach((ld) => {
                    if (ld.flags?.levels?.rangeBottom === undefined) ld.flags.levels = {rangeBottom: 0, rangeTop: 0};
                    ld.flags.levels.rangeBottom = pos.z;
                    ld.flags.levels.rangeTop = pos.z;
                });
            }
        });
    }
}

const lightAnimations = {
    none: () => {},
    flame: function torch(time) {
        const f = 0.0015;
        const random = 0.5 + (this.noise.noise(f * time * this.animationSpeed, 0) + this.animationIntensity) * 0.25;
        this.light3d.distance = this.initialLightParams.radius * random;
        this.light3d.intensity = this.initialLightParams.intensity * random;
    },
    pulse: function pulse(time) {
        const modulation = 1 + Math.sin((time / 500) * this.animationSpeed) * 0.5;
        const modIntensity = modulation * this.animationIntensity + (1 - this.animationIntensity) / 2;
        this.light3d.distance = this.initialLightParams.radius * modIntensity;
    },
    chroma: function chroma(time) {
        const baseColor = this.animColors.color1.clone();
        if (this.animationIntensity > 1) {
            baseColor.lerpHSL(this.animColors.color2, (Math.sin((time / 500) * this.animationSpeed) + 1) / 2);
        } else {
            baseColor.lerp(this.animColors.color2, (Math.sin((time / 500) * this.animationSpeed) + 1) / 2);
        }

        this.light3d.color = baseColor;
    },
};
