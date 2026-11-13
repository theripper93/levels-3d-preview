import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { PARTICLE_SYSTEMS } from "./registry.js";
import { getQuality } from "./quality.js";
import { preloadMaterials } from "./materials.js";
import { ParticleSystem } from "./base/quarks.js";

const vfxCache = {};
const activeLights = new Set();

const WARM_MODES = [QUARKS.RenderMode.BillBoard, QUARKS.RenderMode.StretchedBillBoard, QUARKS.RenderMode.HorizontalBillBoard];
const WARM_TILES = [
    { uTileCount: 1, vTileCount: 1, blendTiles: false },
    { uTileCount: 2, vTileCount: 2, blendTiles: false },
    { uTileCount: 2, vTileCount: 2, blendTiles: true },
];

export class ParticleEngine {
    constructor(_parent) {
        this._parent = _parent;
        this.effects = new Set();
        this.toCleanup = new Set();
        this.system = new QUARKS.BatchedParticleRenderer();
        this.loader = new QUARKS.QuarksLoader(new THREE.LoadingManager());
        this.loader.setCrossOrigin("");
        this.depthTexture = null;
        this.softFade = 0;
        this.warmGroup = new THREE.Group();
        this.warmSystems = [];
        this.pendingTextures = [];
        this.init();
    }

    get scene() {
        return this._parent.scene;
    }

    init() {
        activeLights.clear();
        this.scene.add(this.system);
        this.scene.add(this.warmGroup);
        this.warmUp(false);
        preloadMaterials().then((materials) => this.pendingTextures.push(...materials.map(({ material }) => material.map)));
    }

    move() {
        activeLights.clear();
        this.scene.add(this.system);
        this.scene.add(this.warmGroup);
    }

    destroy() {
        this.stopAll();
    }

    warmUp(softParticles) {
        const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
        map.needsUpdate = true;
        const material = new THREE.MeshBasicMaterial({ map, blending: THREE.AdditiveBlending, transparent: true, side: THREE.DoubleSide });
        const warm = (settings) => {
            const system = new ParticleSystem({ material, looping: true, emissionOverTime: new QUARKS.ConstantValue(0), softParticles, softNearFade: 0, softFarFade: this.softFade, ...settings });
            this.warmGroup.add(system.emitter);
            this.system.addSystem(system);
            this.warmSystems.push(system);
        };
        for (const renderMode of WARM_MODES) for (const tiles of WARM_TILES) warm({ renderMode, ...tiles });
        if (!softParticles) warm({ renderMode: QUARKS.RenderMode.Trail });
    }

    setDepthTexture(texture, fadeDistance = (0.5 * canvas.grid.size) / this._parent.factor) {
        const hadDepth = !!this.depthTexture;
        this.depthTexture = texture ?? null;
        this.softFade = fadeDistance;
        if (!this.depthTexture) {
            for (const system of this.system.systemToBatchIndex.keys()) if (system.softParticles) system.softParticles = false;
        } else if (!hadDepth) {
            this.warmUp(true);
        }
        this.system.setDepthTexture(this.depthTexture);
    }

    get softParticles() {
        return !!this.depthTexture && getQuality().softParticles;
    }

    async effect(from, to, params) {
        if (!getQuality().enabled) return;
        to = to instanceof Array ? to : [to];
        if (!from) from = [null];
        from = from instanceof Array ? from : [from];
        const repeats = params.repeats || 1;
        const delay = params.delay || 0;
        const startAfter = params.startAfter || 0;
        const tokenAnimation = params.tokenAnimation;
        for (let repeat = 0; repeat < repeats; repeat++) {
            for (let origin of from) {
                if (tokenAnimation?.from && tokenAnimation.from.options.start) this.playTokenAnimation(tokenAnimation.from, origin);
                for (let target of to) {
                    if (tokenAnimation?.to && tokenAnimation.to.options.start) this.playTokenAnimation(tokenAnimation.to, target);
                    this.sleep(startAfter).then(async () => {
                        const particleClass = PARTICLE_SYSTEMS.getParticleClass(params.type);
                        const projectileEmitter = new particleClass(origin, target, params);
                        await projectileEmitter.init();
                        this.scene.add(projectileEmitter.emitter);
                        projectileEmitter.particleSystems.forEach((s) => this.system.addSystem(s));
                        this.effects.add(projectileEmitter);
                    });
                }
                await this.sleep(delay);
            }
        }
    }

    playTokenAnimation(animationData, tokenIds) {
        tokenIds instanceof Array || (tokenIds = [tokenIds]);
        tokenIds = tokenIds.map((id) => id.id ?? id);
        game.Levels3DPreview.helpers.playTokenAnimationSocket({ tokenIds: tokenIds, animationId: animationData.id, options: animationData.options });
    }

    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    update(delta) {
        if (delta > 500) return;
        if (this.pendingTextures.length) this.pendingTextures.splice(0).forEach((texture) => this._parent.renderer.initTexture(texture));
        if (this.system) {
            this.system.update(delta);
            this.effects.forEach((effect) => {
                effect.tick(delta);
                if (effect.ended) {
                    this.disposeEffect(effect);
                }
            });
            this.toCleanup.forEach((effect) => {
                this.cleanUpEffect(effect);
            });
        }
    }

    stop(id) {
        if (id === "all") return this.stopAll();
        let effect = [];
        this.effects.forEach((e) => {
            if (e.params.id === id || e.params.name === id) effect.push(e);
        });
        effect.forEach((e) => {
            this.disposeEffect(e);
        });
    }

    stopAll() {
        this.effects.forEach((effect) => {
            this.disposeEffect(effect, true);
        });
        this.effects.clear();
        this.toCleanup.forEach((effect) => this.removeEffect(effect));
        this.toCleanup.clear();
    }

    disposeEffect(effect, force = false) {
        this.effects.delete(effect);
        effect.particleSystems.forEach((s) => {
            s.autoDestroy = true;
            s.looping = false;
            s.duration = 0;
            s.markForDestroy = true;
            s.paused = false;
        });
        effect.releaseLights();
        if (force) {
            this.removeEffect(effect);
        } else {
            this.toCleanup.add(effect);
        }
        this.cleanUpBatches();
    }

    cleanUpEffect(effect) {
        if (effect.particleSystems.every((s) => s.particleNum === 0)) {
            this.removeEffect(effect);
            this.toCleanup.delete(effect);
        }
    }

    removeEffect(effect) {
        ParticleEngine.disposeLights(effect.emitter);
        this.scene.remove(effect.emitter);
        effect.dispose();
    }

    cleanUpBatches() {
        const batches = this.system.batches;
        const kept = batches.filter((batch) => batch.systems.size > 0);
        if (kept.length === batches.length) return;
        for (const batch of batches) {
            if (batch.systems.size > 0) continue;
            batch.removeFromParent();
            batch.dispose();
            batch.material.dispose();
        }
        for (const [system, index] of this.system.systemToBatchIndex) this.system.systemToBatchIndex.set(system, kept.indexOf(batches[index]));
        this.system.batches = kept;
    }

    isVFX(urlOrId) {
        return vfxCache[urlOrId] !== undefined || urlOrId.endsWith(".json");
    }

    async loadVFX(urlOrId) {
        if (vfxCache[urlOrId]) {
            return await this.getClone(urlOrId);
        } else {
            vfxCache[urlOrId] = await foundry.utils.fetchJsonWithTimeout(urlOrId);
            return await this.getClone(urlOrId);
        }
    }

    getClone(urlOrId) {
        return new Promise(async (resolve, reject) => {
            this.loader.parse(vfxCache[urlOrId], (vfx) => {
                resolve(vfx);
            });
        });
    }

    static createLight() {
        if (activeLights.size >= getQuality().maxEffectLights) return null;
        const lightWarmup = game.Levels3DPreview.lightWarmup;
        let light = lightWarmup.acquireEffectLight();
        if (!light) {
            light = new THREE.PointLight();
            lightWarmup.add(light);
        }
        activeLights.add(light);
        return light;
    }

    static releaseLight(light) {
        activeLights.delete(light);
        const lightWarmup = game.Levels3DPreview.lightWarmup;
        if (light.userData.pooled) return lightWarmup.releaseEffectLight(light);
        lightWarmup.remove(light);
        light.removeFromParent();
        light.dispose();
    }

    static disposeLights(object3d) {
        if (!object3d) return;
        const lights = [];
        object3d.traverse((child) => {
            if (child.isPointLight) {
                lights.push(child);
            }
        });

        for (let light of lights) ParticleEngine.releaseLight(light);
    }

    async resolveSocket(from, to, params) {
        if (canvas.scene.id !== params.scene || !game.Levels3DPreview._active) return;
        if (from) {
            const fromObjects = [];
            for (let f of from) fromObjects.push(typeof f == "string" ? (await fromUuid(f)) ?? f : f);
            from = fromObjects.map((f) => f._object ?? f);
        }
        if (to) {
            const toObjects = [];
            for (let t of to) toObjects.push(typeof t == "string" ? (await fromUuid(t)) ?? t : t);
            to = toObjects.map((t) => t._object ?? t);
        }
        this.effect(from, to, params);
    }

    static getScale() {
        return canvas.scene.dimensions.size / 100;
    }
}
