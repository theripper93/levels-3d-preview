import * as THREE from "three";
import { factor } from "../main.js";
import * as coords3d from "../helpers/coords3d.js";
import { flameSeed, flameTime, setLightFlicker } from "../vfx/light/noise.js";
import { getLightAnimation, sampleColor, sampleIntensity, sampleRadius, sampleRevolve } from "../vfx/light/animations.js";
import { LightEffects } from "../vfx/light/lightEffects.js";

export class Light3D {
    constructor(light, parent, isToken) {
        this.light = light;
        this._parent = parent;
        this.isToken = isToken;
        this._useHelper = game.user.isGM && game.settings.get("levels-3d-preview", "lightHelpers");
        this.animation = null;
        this.flicker = 1;
        this.refreshDebounced = foundry.utils.debounce(this.refresh.bind(this), 100);
        if (!this.isToken) {
            this.embeddedName = this.light.document.documentName;
            this.draggable = true;
            this.placeable = this.light;
        }
        this.init();
    }

    init() {
        this.lightFx = this.isToken ? null : new LightEffects(this);
        this.light3d = this.angle != 360 ? new THREE.SpotLight(0xffffff, 0.0001, 0.0001, 1, 1, 2) : new THREE.PointLight();
        this._parent.lightWarmup.add(this.light3d);
        this.isPointLight = this.angle == 360;
        this.mesh = new THREE.Group();
        const shadowRes = game.settings.get("levels-3d-preview", "shadowQuality");
        this.light3d.shadow.bias = -0.035;
        this.light3d.shadow.camera.near = 0.001;
        this.light3d.shadow.mapSize.width = 256 * shadowRes;
        this.light3d.shadow.mapSize.height = 256 * shadowRes;
        this.light3d.penumbra = 1;
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
        if (this.useHelper && this.lightHelper) this.lightHelper.visible = canvas.lighting.active && !this.light.document.hidden;
        if (!this.dragHandle.visible) return;
        this.dragHandle.userData.sprite.material.map = this.light.document.hidden ? this._parent.textures.lightOff : this._parent.textures.lightOn;
        this.dragHandle.userData.sprite.material.color.set(this.light.document.hidden ? "#ff0000" : "#ffffff");
        if(this.light.document.hidden && this.light.document.flags?.["levels-3d-preview"]?.visibleWhenDisabled) this.dragHandle.userData.sprite.material.color.set("#00ff00");
        this.dragHandle.userData.sphere.material.color.set(this.color || "#ffffff");
    }

    async updatePositionFrom3D(e) {
        this.skipMoveAnimation = true;
        const useSnapped = coords3d.useSnapped();
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor;
        const y = z3d * factor;
        const z = Math.round(((y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size) * 100) / 100;
        const snapped = canvas.grid.getSnappedPoint({x, y}, {mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER, resolution: 2});
        const elevation = this.light.document.elevation;
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        const deltas = {
            x: dest.x - this.light.document.x,
            y: dest.y - this.light.document.y,
            elevation: dest.elevation - elevation,
        };
        let updates = [];
        for (let light of canvas.activeLayer.controlled.length ? canvas.activeLayer.controlled : [this.light]) {
            const lightElevation = light.document.elevation;
            updates.push({
                _id: light.id,
                x: light.document.x + deltas.x,
                y: light.document.y + deltas.y,
                elevation: Math.round((lightElevation + deltas.elevation) * 1000) / 1000,
                flags: {
                    "levels-3d-preview": {
                        wasFreeMode: this.wasFreeMode,
                    },
                    levels: {
                        rangeTop: Math.round((lightElevation + deltas.elevation) * 1000) / 1000,
                    },
                },
            });
        }
        const res = await canvas.scene.updateEmbeddedDocuments("AmbientLight", updates);
        if (!res.length) this.refresh();
        return true;
    }

    refresh() {
        const light = this.light.hasPreview ? this.light._preview : this.light;
        const tilt = Math.toRadians(light.document.getFlag("levels-3d-preview", "tilt") ?? 0);
        this.particleData = this.getParticleData();
        const enableParticle = !!light.document.getFlag("levels-3d-preview", "enableParticle");
        const particleSignature = JSON.stringify([
            this.particleData,
            enableParticle,
            light.document.hidden,
            light.document.getFlag("levels-3d-preview", "enableParticleHidden") ?? false,
            light.document.x,
            light.document.y,
            light.document.elevation,
            this.dim,
            this.bright,
        ]);
        const particleChanged = particleSignature !== this._particleSignature;
        this._particleSignature = particleSignature;
        if (particleChanged) game.Levels3DPreview.particleSystem.stop(this.particleEffectId);
        this.animColors = {
            color1: new THREE.Color(this.particleData.color),
            color2: new THREE.Color(this.particleData.color2),
            legacy: this.particleData.color !== this.particleData.color2,
        };
        if (this.dragHandle) {
            this.dragHandle.position.set(0, 0, 0);
        }
        const castShadow = !!light.document.getFlag("levels-3d-preview", "castShadow") && game.settings.get("levels-3d-preview", "shadowQuality") > 0;
        if (castShadow && this.isEmitting) this.light3d.shadow.autoUpdate = true;
        if (castShadow !== this.light3d.castShadow) {
            this.light3d.castShadow = castShadow;
            this._parent.lightWarmup.add(this.light3d);
        }
        const params = Light3D.computeParams({
            x: light.document.x,
            y: light.document.y,
            elevation: light.document.elevation,
            rangeTop: light.document.flags.levels?.rangeTop ?? 1,
            dim: this.dim,
            bright: this.bright,
            alpha: this.alpha,
            color: this.color,
        });
        this.z = params.z;
        const { color, radius, decay, position } = params;
        const alpha = params.intensity;
        if (!this.isToken) {
            this.mesh.position.set(position.x, position.y, position.z);
        }
        this.light3d.position.set(0, 0, 0);
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
            if (!this.light3d.target) this.light3d.target = new THREE.Object3D();
            this.light3d.angle = Math.toRadians(this.angle) / 2;
            const group = new THREE.Group();
            const sphere = new THREE.Object3D();
            group.add(sphere);
            sphere.position.set(1, 0, 0);
            group.rotateOnAxis(new THREE.Vector3(0, 0, 1), tilt);
            group.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.toRadians(-this.rotation - 90));
            this.light3d.target.position.copy(sphere.getWorldPosition(new THREE.Vector3()));
            this.light3d.target.position.add(new THREE.Vector3(position.x, position.y, position.z));
            this.light3d.target.updateMatrixWorld();
            this.spotOffset = (this.spotOffset ?? new THREE.Vector3()).copy(this.light3d.target.position).sub(this.mesh.position);
        }
        this.animation = getLightAnimation(this.animationType);
        this.flameSeed = flameSeed(this.particleEffectId);
        (this.baseColor ??= new THREE.Color()).set(color);
        this.lightFx?.refresh(light.document);
        if (this.useHelper) {
            this.mesh.remove(this.lightHelper);
            this.lightHelper?.dispose();
            this.lightHelper = this.angle != 360 ? new THREE.SpotLightHelper(this.light3d) : new THREE.PointLightHelper(this.light3d, radius);
            this.mesh.add(this.lightHelper);
            this.lightHelper.update();
            this.lightHelper.matrix = this.light3d.matrix;
            if (this.angle === 360) this.lightHelper.geometry = new THREE.SphereGeometry(radius, 8, 8);
            else this.lightHelper.cone.lookAt(this.light3d.target.position);
            this.lightHelper.userData.ignoreHover = true;
            this.lightHelper.userData.interactive = false;
            this.lightHelper.traverse((o) => {
                o.userData.ignoreHover = true;
                o.userData.interactive = false;
            });
        }
        if (particleChanged && enableParticle) this.initParticle();
    }

    static computeParams({ x, y, elevation, rangeTop, dim, bright, alpha, color }) {
        const { size, distance } = canvas.scene.dimensions;
        const z = ((rangeTop + elevation) * size) / distance / 2;
        return {
            z: (rangeTop + elevation) / 2,
            color: color || "#ffffff",
            radius: (Math.max(dim, bright) * (size / distance)) / factor,
            intensity: alpha * 9,
            decay: (dim / (bright + 10)) * 2,
            position: { x: x / factor, y: z / factor, z: y / factor },
        };
    }

    get isEmitting() {
        return (this.light.emitsLight && !this.light.document.hidden) || !!this.light.document.flags?.["levels-3d-preview"]?.visibleWhenDisabled;
    }

    update() {
        const base = this.initialLightParams;
        const animation = this.animation;
        this.flicker = 1;
        if (animation) {
            const time = flameTime();
            const speed = this.lightData.animation.reverse ? -this.animationSpeed : this.animationSpeed;
            this.flicker = sampleIntensity(animation, this.flameSeed, time, speed, this.animationIntensity);
            this.light3d.distance = base.radius * sampleRadius(animation, this.flicker);
            if (animation.legacyChroma && this.animColors.legacy) this.animateLegacyChroma(time, speed);
            else if (animation.hue || animation.hueSwing) sampleColor(animation, this.light3d.color, this.baseColor, this.flameSeed, time, speed);
            if (animation.revolve && !this.isPointLight && !this.isToken) this.revolve(sampleRevolve(animation, time, speed));
        }
        this.light3d.intensity = base.intensity * this.flicker;
        if (!this.isToken) setLightFlicker(this.particleEffectId, this.flicker);
        const emitting = this.isEmitting;
        this.lightFx?.update(this.flicker, emitting);
        const shadow = this.light3d.shadow;
        if (emitting) {
            if (this.light3d.castShadow) shadow.autoUpdate = true;
            return;
        }
        this.light3d.intensity = 0;
        shadow.autoUpdate = false;
        shadow.needsUpdate = false;
    }

    animateLegacyChroma(time, speed) {
        const { color1, color2 } = this.animColors;
        const t = (Math.sin(time * 2 * speed) + 1) / 2;
        if (this.animationIntensity > 1) this.light3d.color.copy(color1).lerpHSL(color2, t);
        else this.light3d.color.copy(color1).lerp(color2, t);
    }

    revolve(angle) {
        const target = this.light3d.target;
        target.position.copy(this.spotOffset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).add(this.mesh.position);
        target.updateMatrixWorld();
    }

    destroy() {
        this.lightFx?.dispose();
        if (!this.isToken) setLightFlicker(this.particleEffectId, null);
        this._parent.lightWarmup.remove(this.light3d);
        this.light3d.removeFromParent();
        this.light3d.dispose();
        this._parent.scene.remove(this.mesh);
        if (this.particleEffectId) Particle3D.stop(this.particleEffectId);
        this.lightHelper?.dispose();
        if (this.dragHandle) {
            const { sphere, sprite } = this.dragHandle.userData;
            sphere?.geometry?.dispose();
            sphere?.material?.dispose();
            sprite?.material?.dispose();
            this.dragHandle = null;
        }
    }

    get particleEffectId() {
        return "Light." + this.light.id;
    }

    initParticle() {
        if (!game.settings.get("levels-3d-preview", "enableEffects")) return;
        if (this.light.document.hidden && !this.light.document.getFlag("levels-3d-preview", "enableParticleHidden")) return;
        const particleData = this.particleData;
        const L = game.Levels3DPreview;
        if (!L.CONFIG.PARTICLE_SYSTEMS.getParticleClass(particleData.type) && !L.particleSystem.isVFX(particleData.type)) return;
        this.particleEffect = new Particle3D(particleData.type);
        this.particleEffect
            .name(this.particleEffectId)
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
            .presetIntensity(particleData.presetIntensity)
            .applyPresetLightOffset(true)
            .to(this.placeable);
        this.particleEffect.start(false);
    }

    getParticleData() {
        const light = this.light.hasPreview ? this.light._preview : this.light;
        return {
            type: light.document.getFlag("levels-3d-preview", "ParticleType") ?? "custom",
            sprite: light.document.getFlag("levels-3d-preview", "ParticleSprite") ?? "",
            emitterScale: light.document.getFlag("levels-3d-preview", "ParticleEmitterSizeMultiplier") ?? 1,
            scale: light.document.getFlag("levels-3d-preview", "ParticleScale") ?? 1,
            color: light.document.getFlag("levels-3d-preview", "ParticleColor") ?? "#ffffff",
            color2: light.document.getFlag("levels-3d-preview", "ParticleColor2") ?? "#ffffff",
            force: light.document.getFlag("levels-3d-preview", "ParticleForce") ?? 0,
            gravity: light.document.getFlag("levels-3d-preview", "ParticleGravity") ?? 1,
            life: light.document.getFlag("levels-3d-preview", "ParticleLife") ?? 1000,
            count: light.document.getFlag("levels-3d-preview", "ParticleCount") ?? 5,
            emitTime: light.document.getFlag("levels-3d-preview", "ParticleEmitTime") ?? 1,
            mass: light.document.getFlag("levels-3d-preview", "ParticleMass") ?? 1000,
            alphaStart: light.document.getFlag("levels-3d-preview", "ParticleAlphaStart") ?? 0,
            alphaEnd: light.document.getFlag("levels-3d-preview", "ParticleAlphaEnd") ?? 1,
            push: {
                dx: light.document.getFlag("levels-3d-preview", "ParticlePushX") ?? 0,
                dy: light.document.getFlag("levels-3d-preview", "ParticlePushY") ?? 0,
                dz: light.document.getFlag("levels-3d-preview", "ParticlePushZ") ?? 0,
            },
            presetIntensity: light.document.getFlag("levels-3d-preview", "ParticleIntensity") ?? 1,
        };
    }

    _onClickLeft(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = e;
        this.light._onClickLeft(event);
    }

    _onClickLeft2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = e;
        this.light._onClickLeft2(event);
    }

    _onClickRight(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = e;
        this.light._onClickRight(event);
    }

    _onClickRight2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = e;
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
        return this.lightData.color?.toString() ?? this.light.document.lightColor;
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
        function refreshOrUpdate(lightDocument) {
            if (game.Levels3DPreview?._active) {
                const light3d = game.Levels3DPreview.lights.sceneLights[lightDocument.id];
                if (!light3d) return;
                const isDocumentPoint = lightDocument.config.angle === 360;
                const isLightPoint = light3d.isPointLight;
                if (isDocumentPoint !== isLightPoint) {
                    light3d.destroy();
                    game.Levels3DPreview.addLight(lightDocument.object ?? lightDocument);
                    return;
                }
                game.Levels3DPreview.lights.sceneLights[lightDocument.id]?.refreshDebounced();
            }
        }

        Hooks.on("updateAmbientLight", refreshOrUpdate);

        Hooks.on("refreshAmbientLight", refreshOrUpdate);

        Hooks.on("createAmbientLight", (lightDocument) => {
            if (game.Levels3DPreview?._active && lightDocument.object) game.Levels3DPreview.addLight(lightDocument.object);
        });

        Hooks.on("deleteAmbientLight", (lightDocument) => {
            if (!game.Levels3DPreview?._active) return;
            game.Levels3DPreview.lights.sceneLights[lightDocument.id]?.destroy();
            delete game.Levels3DPreview.lights.sceneLights[lightDocument.id];
        });

        Hooks.on("pasteAmbientLight", (copy, data) => {
            if (game.Levels3DPreview?._active) {
                const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
                if (!pos) return;
                data.forEach((ld) => {
                    ld.elevation = pos.z;
                    foundry.utils.setProperty(ld, "flags.levels.rangeTop", pos.z);
                });
            }
        });
    }
}
