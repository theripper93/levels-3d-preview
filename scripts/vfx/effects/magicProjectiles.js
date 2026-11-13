import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { factor } from "../../main.js";
import { ParticleEngine } from "../engine.js";
import { registerEffects } from "../registry.js";
import { ATLASES } from "../atlas.js";
import { getTextureMaterial } from "../materials.js";
import { ProjectileParticle } from "../base/ProjectileParticle.js";
import { createLayer, flash, glow, ribbon, embers, sparks, smokePuff, ORDER } from "../layers/index.js";
import { SOOT, effectLightIntensity, groundMark, launchGroup, ballisticPath, useColorsIfDefault, loadRock, rockLayer, stopEmitting } from "./kit.js";

const UP = new THREE.Vector3(0, 1, 0);
const ROCKS = ["modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_4.glb", "modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_3.glb"];

export class MagicProjectileBase extends ProjectileParticle {
    static get LIGHT() {
        return 1;
    }

    static get LOFT() {
        return 0;
    }

    createAnimationPath() {
        if (!ballisticPath(this, this.constructor.LOFT)) super.createAnimationPath();
    }

    addLight() {
        const s = this.params.scale.start;
        if (!this.constructor.LIGHT) return;
        this.emitLight({ intensity: effectLightIntensity(this.constructor.LIGHT), distance: s * 5, curve: "steady", progress: () => 0 });
    }

    get coreSprite() {
        return this.params.sprite;
    }

    async build() {
        const s = this.params.scale.start;
        this.emitter.lookAt(this.animationPath.getPointAt(0.02));
        this._launch = launchGroup(this, s * 0.15);
        await this.addTo(this._launch, this.launchLayers(s));
        await this.add(this.bodyLayers(s));
    }

    launchLayers(s) {
        return [
            flash(this, { sprite: "star_06", size: s * 1.6, life: 0.14, color: [[0, "white", 0.9, 1.4], [0.4, "core", 0.7], [1, "glow", 0]] }),
            glow(this, { sprite: "emberssmall", size: s * 1.4, life: 0.25, rate: 0, burst: 1, sizeOverLife: "pop", color: ["glow", "end", 0.5, 0] }),
            sparks(this, { burst: 4, size: [s * 0.04, s * 0.08], speed: [s * 1, s * 3], life: [0.2, 0.4], gravity: s * 2, shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 4 } }),
        ];
    }

    bodyLayers(s) {
        return [];
    }
}

export class MagicProjectile extends MagicProjectileBase {
    launchLayers(s) {
        return super.launchLayers(s).slice(0, 2);
    }

    bodyLayers(s) {
        const { min, max } = this.params.life;
        const { start: alpha, end: alphaEnd } = this.params.alpha;
        const per = this.params.rate.particles;
        const sprite = this.params.sprite;
        const force = this.userForce;
        const radius = Math.max(0.0001, this.params.emitterSize);
        const color = ["start", "end", alpha, alphaEnd];
        return [
            ribbon(this, { sprite, size: s * 0.25, life: [min, max], perDistance: per * 5, force, color, sizeOverLife: "shrink" }),
            createLayer(this, { sprite, life: [min * 3, max * 3], size: s * 0.12, speed: s * 0.35, perDistance: per * 50, force, shape: { type: "cone", radius, angle: Math.PI / 2 }, color, sizeOverLife: "shrink", order: ORDER.sparks }),
        ];
    }
}

export class BlackDart extends MagicProjectileBase {
    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 0.01,
        };
    }

    static get LIGHT() {
        return 0.5;
    }

    bodyLayers(s) {
        const { min, max } = this.params.life;
        const alpha = this.params.alpha.start;
        const force = this.userForce;
        return [
            ribbon(this, { size: s * 0.3, life: [min, max], perDistance: this.params.rate.particles * 5, force, color: [[0, "glow", alpha], [0.5, "end", 0.6 * alpha], [1, "edge", 0]] }),
            ribbon(this, { blend: "normal", lit: false, size: s * 0.14, life: [min * 0.8, max * 0.8], perDistance: this.params.rate.particles * 5, force, color: [[0, "black", 0.9], [1, "black", 0]], order: 7 }),
            createLayer(this, { sprite: "smoke", blend: "normal", lit: false, perDistance: this.params.rate.particles * 2, life: [max, max * 2], size: [s * 0.15, s * 0.3], speed: [s * 0.05, s * 0.2], rotation: true, spin: [-1, 1], shape: { type: "sphere", radius: s * 0.08 }, sizeOverLife: "grow", force, color: [[0, "black", 0], [0.2, "black", 0.55], [1, "smoke", 0]] }),
            embers(this, { rate: 0, perDistance: this.params.rate.particles * 3, life: [max, max * 2], size: [s * 0.03, s * 0.06], speed: [s * 0.1, s * 0.3], shape: { type: "sphere", radius: s * 0.12 }, aim: 0, force, color: [[0, "glow", 0], [0.2, "glow", 1], [1, "end", 0]] }),
        ];
    }

    launchLayers(s) {
        return [...super.launchLayers(s), smokePuff(this, { rate: 0, burst: 3, lit: false, life: [0.4, 0.7], size: [s * 0.25, s * 0.4], speed: s * 0.3, color: [[0, "black", 0], [0.2, "black", 0.5], [1, "smoke", 0]] })];
    }
}

export class MagicArrow extends MagicProjectileBase {
    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 0.01,
        };
    }

    async build() {
        const s = this.params.scale.start;
        const arrow = await this.getMesh("modules/levels-3d-preview/assets/particles/models/arrow_particle.glb");
        arrow.scale.setScalar(s);
        arrow.material.blending = THREE.AdditiveBlending;
        arrow.material.transparent = true;
        arrow.material.depthWrite = false;
        this._arrow = arrow;
        this._persistObjects.push(arrow);
        this.emitter.add(arrow);
        await super.build();
    }

    bodyLayers(s) {
        const { min, max } = this.params.life;
        const alpha = this.params.alpha.start;
        return [
            ribbon(this, { size: s * 0.12, life: [min, max], perDistance: this.params.rate.particles * 5, color: [[0, "core", alpha], [0.4, "glow", 0.7 * alpha], [1, "end", 0]] }),
            ribbon(this, { size: s * 0.3, life: [min * 0.6, max * 0.6], perDistance: this.params.rate.particles * 4, color: [[0, "glow", 0.35 * alpha], [1, "end", 0]] }),
            createLayer(this, { sprite: "star_04", perDistance: this.params.rate.particles * 4, life: [max, max * 2], size: [s * 0.08, s * 0.16], speed: [s * 0.05, s * 0.2], rotation: true, shape: { type: "sphere", radius: s * 0.08 }, sizeOverLife: "shrink", color: [[0, "white", 1, 1.4], [0.3, "spark", 0.9], [1, "end", 0]], order: 8 }),
        ];
    }

    animate(delta) {
        this._arrow.rotation.z += delta * 10;
        this._arrow.material.color.lerpColors(this.palette.core, this.palette.end, Math.min(1, this._currentSpeed));
        super.animate(delta);
    }
}

export class RunicShot extends MagicProjectileBase {
    constructor(from, to, params) {
        super(from, to, params);
        const frontPos = this._origin.clone().sub(this._target).normalize().multiplyScalar(-this.tokenRadius);
        this._origin.add(frontPos);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (this.params.speed / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this._charge = Math.max(this.params.duration, 0.45);
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.0001,
        };
    }

    get tokenRadius() {
        if (!(this.from instanceof foundry.canvas.placeables.Token)) return 0;
        return ((Math.max(this.from.document.width, this.from.document.height) / 2) * canvas.grid.size) / factor;
    }

    get runeSprite() {
        return this.params.sprite === this.defaultSettings.sprite ? ATLASES.magic_circle_08.src : this.params.sprite;
    }

    async build() {
        const s = this.params.scale.start;
        await super.build();
        const source = await getTextureMaterial(this.runeSprite, THREE.AdditiveBlending, this);
        const material = source.clone();
        material.color.copy(this.palette.glow);
        material.depthWrite = false;
        material.opacity = 0;
        this._rune = this.addMesh(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material), this._launch);
        this._runeGlow = this.addMesh(new THREE.Mesh(this._rune.geometry.clone(), material.clone()), this._launch);
        this._runeGlow.material.color.copy(this.palette.core);
        this._runeSize = s * 1.3;
        if (source.map?.image?.duration) this._charge = Math.max(source.map.image.duration * 0.9, 0.2);
        this._runeLife = this._charge + 0.5;
        this._chargeSystems = await this.addTo(this._launch, this.chargeLayers(s));
    }

    chargeLayers(s) {
        const delay = this._charge;
        return [
            flash(this, { sprite: "star_06", delay, size: s * 2, life: 0.16, color: [[0, "white", 1, 1.5], [0.4, "core", 0.8], [1, "glow", 0]] }),
            sparks(this, { delay, burst: 4, size: [s * 0.05, s * 0.1], speed: [s * 1.5, s * 4], shape: { type: "cone", radius: s * 0.3, angle: Math.PI / 5 } }),
            createLayer(this, { sprite: "emberssmall", world: false, rate: 15, life: 0.35, size: [s * 0.04, s * 0.08], speed: [-s * 2.4, -s * 1.6], shape: { type: "circle", radius: s * 0.65 }, color: [[0, "spark", 0], [0.3, "spark", 1, 1.4], [1, "core", 0.6]], sizeOverLife: "shrink", order: 8 }),
            glow(this, { sprite: "emberssmall", size: s * 0.9, life: 0.2, rate: 12, color: ["core", "glow", 0.5, 0] }),
        ];
    }

    launchLayers(s) {
        return [];
    }

    bodyLayers(s) {
        const { min, max } = this.params.life;
        const alpha = this.params.alpha.start;
        const force = this.userForce;
        return [
            ribbon(this, { sprite: "emberssmall", size: s * 0.25, life: [min, max], perDistance: this.params.rate.particles * 5, force, color: [[0, "core", alpha], [0.4, "glow", 0.8 * alpha], [1, "end", 0]] }),
            createLayer(this, { sprite: "spiral", perDistance: this.params.rate.particles * 0.6, life: [max * 0.8, max * 1.4], size: [s * 0.3, s * 0.5], rotation: true, spin: [-3, 3], sizeOverLife: "shrink", color: [[0, "core", 0.8 * alpha], [1, "end", 0]] }),
            embers(this, { rate: 0, perDistance: this.params.rate.particles * 5, life: [min * 2, max * 3], size: [s * 0.04, s * 0.08], speed: [s * 0.1, s * 0.4], shape: { type: "sphere", radius: s * 0.15 }, aim: 0, force }),
        ];
    }

    updateRune() {
        const t = this._age;
        const appear = Math.min(1, t / 0.18);
        const fade = Math.clamp((this._runeLife - t) / 0.4, 0, 1);
        const pulse = t < this._charge ? 1 : 1 + 0.25 * Math.min(1, (t - this._charge) / 0.15);
        const size = this._runeSize * (0.3 + 0.7 * (1 - Math.pow(1 - appear, 3))) * pulse;
        this._rune.scale.setScalar(size);
        this._rune.rotation.z = t * 1.5;
        this._rune.material.opacity = appear * fade * this.params.alpha.start;
        this._runeGlow.scale.setScalar(size * 0.92);
        this._runeGlow.rotation.z = -t * 2.2;
        this._runeGlow.material.opacity = 0.45 * appear * fade * (0.7 + 0.3 * Math.sin(t * 20));
        if (!this._fired && t >= this._charge) {
            this._fired = true;
            stopEmitting(this._chargeSystems);
        }
    }

    animate(delta) {
        this.updateRune();
        if (this._age < this._charge) return;
        super.animate(delta);
    }

    onEnd() {
        if (this.ended || this._finishing) return;
        super.onEnd();
        if (this._age < this._runeLife) this.ended = false;
        this._finishing = true;
    }

    tick(delta) {
        super.tick(delta);
        if (this._finishing && this._age >= this._runeLife) this.ended = true;
    }
}

export class Fireball extends MagicProjectileBase {
    static get IMPACT() {
        return "explosion";
    }

    static get IMPACT_SCALE() {
        return 0.8;
    }

    static get LIGHT() {
        return 1.6;
    }

    get coreSprite() {
        return this.params.sprite === this.defaultSettings.sprite ? "fire" : this.params.sprite;
    }

    bodyLayers(s) {
        const { max } = this.params.life;
        const alpha = this.params.alpha.start;
        const per = this.params.rate.particles;
        return [
            glow(this, { sprite: "emberssmall", size: s * 0.45, life: 0.08, rate: 40, color: [[0, "white", alpha, 1.3], [1, "core", 0]] }),
            createLayer(this, { sprite: this.coreSprite, world: false, rate: 40, life: [0.12, 0.2], size: [s * 0.5, s * 0.75], rotation: true, spin: [-4, 4], shape: { type: "sphere", radius: s * 0.08 }, sizeOverLife: "swell", color: [[0, "core", alpha], [0.4, "start", 0.9 * alpha], [1, "end", 0]] }),
            glow(this, { sprite: "emberssmall", size: s * 1.5, life: 0.1, rate: 16, color: ["start", "end", 0.35 * alpha, 0] }),
            createLayer(this, { sprite: this.coreSprite, perDistance: per * 4, life: [max * 0.6, max * 1.1], size: [s * 0.35, s * 0.6], speed: [s * 0.05, s * 0.2], rotation: true, spin: [-2, 2], shape: { type: "sphere", radius: s * 0.1 }, force: [0, s * 0.6, 0], sizeOverLife: [0.8, 1, 0.6, 0.1], color: [[0, "core", alpha], [0.25, "start", 0.85 * alpha], [0.7, "end", 0.4], [1, "edge", 0]] }),
            smokePuff(this, { rate: 0, perDistance: per * 1.5, life: [0.8, 1.4], size: [s * 0.3, s * 0.55], speed: s * 0.1, delay: 0.05, shape: { type: "sphere", radius: s * 0.12 }, force: [0, s * 0.4, 0], color: SOOT }),
            embers(this, { rate: 0, perDistance: per * 4, life: [0.4, 0.9], size: [s * 0.03, s * 0.07], speed: [s * 0.3, s * 1], shape: { type: "sphere", radius: s * 0.15 }, aim: 0, gravity: -s * 0.5 }),
        ];
    }

    launchLayers(s) {
        return [...super.launchLayers(s), smokePuff(this, { rate: 0, burst: 4, life: [0.6, 1], size: [s * 0.25, s * 0.45], speed: [s * 0.3, s * 0.7], speedOverLife: [1, 0.2, 0.1, 0], shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 4 }, color: SOOT })];
    }
}

export class IceLance extends MagicProjectileBase {
    constructor(...args) {
        super(...args);
        useColorsIfDefault(this, "#c8f4ff", "#3d8bff");
    }

    static get IMPACT() {
        return "iceshatter";
    }

    static get IMPACT_SCALE() {
        return 0.9;
    }

    static get LIGHT() {
        return 0.8;
    }

    async build() {
        const s = this.params.scale.start;
        const geometry = new THREE.OctahedronGeometry(1, 0);
        geometry.scale(0.16, 0.16, 1);
        const outer = new THREE.MeshBasicMaterial({ color: this.palette.end.clone().lerp(this.palette.start, 0.35), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 * this.params.alpha.start, fog: true });
        const inner = outer.clone();
        inner.color.copy(this.palette.core);
        this._crystal = new THREE.Group();
        this.addMesh(new THREE.Mesh(geometry, outer), this._crystal).scale.setScalar(s * 0.45);
        this.addMesh(new THREE.Mesh(geometry.clone(), inner), this._crystal).scale.set(s * 0.22, s * 0.22, s * 0.4);
        this._crystal.children[1].position.z = s * 0.06;
        this.emitter.add(this._crystal);
        await super.build();
    }

    bodyLayers(s) {
        const { min, max } = this.params.life;
        const alpha = this.params.alpha.start;
        const per = this.params.rate.particles;
        return [
            glow(this, { sprite: "emberssmall", size: s * 0.9, life: 0.1, rate: 20, color: ["end", "end", 0.5 * alpha, 0] }),
            ribbon(this, { size: s * 0.12, life: [min, max], perDistance: per * 5, color: [[0, "core", alpha], [0.3, "start", 0.8 * alpha], [1, "end", 0]] }),
            ribbon(this, { size: s * 0.35, life: [min * 0.7, max * 0.7], perDistance: per * 4, color: [[0, "end", 0.45 * alpha], [1, "end", 0]] }),
            smokePuff(this, { perDistance: per * 2.5, rate: 0, lit: false, life: [max * 1.5, max * 3], size: [s * 0.15, s * 0.3], speed: [s * 0.02, s * 0.1], force: [0, -s * 0.15, 0], shape: { type: "sphere", radius: s * 0.06 }, color: [[0, "core", 0], [0.2, "core", 0.3], [1, "glow", 0]] }),
            createLayer(this, { sprite: "star", perDistance: per * 4, life: [max, max * 2.5], size: [s * 0.05, s * 0.12], speed: [s * 0.05, s * 0.2], rotation: true, gravity: s * 0.4, shape: { type: "sphere", radius: s * 0.1 }, sizeOverLife: "shrink", color: [[0, "white", 1, 1.4], [0.4, "core", 0.9], [1, "glow", 0]], order: 8 }),
        ];
    }

    launchLayers(s) {
        return [...super.launchLayers(s), smokePuff(this, { rate: 0, burst: 3, lit: false, life: [0.6, 1], size: [s * 0.3, s * 0.45], speed: s * 0.25, color: [[0, "core", 0], [0.2, "core", 0.3], [1, "glow", 0]] })];
    }

    animate(delta) {
        this._crystal.rotation.z += delta * 3;
        super.animate(delta);
    }
}

export class AcidGlob extends MagicProjectileBase {
    constructor(...args) {
        super(...args);
        useColorsIfDefault(this, "#b6ff3a", "#3f9a00");
    }

    static get IMPACT() {
        return "splash";
    }

    static get LOFT() {
        return 0.18;
    }

    static get LIGHT() {
        return 0.5;
    }

    bodyLayers(s) {
        const { max } = this.params.life;
        const alpha = this.params.alpha.start;
        const per = this.params.rate.particles;
        return [
            createLayer(this, { sprite: "emberssmall", blend: "normal", lit: false, world: false, rate: 30, life: 0.15, size: [s * 0.6, s * 0.8], shape: { type: "sphere", radius: s * 0.05 }, sizeOverLife: "pulse", color: [[0, "start", 0.9 * alpha], [1, "end", 0.6 * alpha]], order: 5 }),
            glow(this, { sprite: "emberssmall", size: s * 1.3, life: 0.12, rate: 16, color: ["glow", "end", 0.4 * alpha, 0] }),
            ribbon(this, { size: s * 0.3, life: [0.2, 0.35], perDistance: per * 5, color: [[0, "start", 0.7 * alpha], [1, "end", 0]] }),
            glow(this, { sprite: "emberssmall", size: s * 0.25, life: 0.1, rate: 20, position: [s * 0.05, s * 0.06, 0], color: ["white", "core", 0.7, 0] }),
            createLayer(this, { sprite: "emberssmall", blend: "normal", lit: false, perDistance: per * 5, life: [0.5, 0.9], size: [s * 0.06, s * 0.13], speed: [s * 0.05, s * 0.2], gravity: s * 6, shape: { type: "sphere", radius: s * 0.12 }, color: [[0, "start", 1], [0.8, "end", 0.9], [1, "end", 0]], order: 5 }),
            smokePuff(this, { rate: 0, perDistance: per * 1.5, lit: false, life: [max * 1.5, max * 3], size: [s * 0.15, s * 0.3], speed: s * 0.1, force: [0, s * 0.3, 0], shape: { type: "sphere", radius: s * 0.1 }, color: [[0, "light", 0], [0.2, "light", 0.2], [1, "smoke", 0]] }),
        ];
    }
}

export class Meteor extends MagicProjectileBase {
    constructor(from, to, params) {
        super(from, to, params);
        this._target = this._targetBottom.clone();
        const height = Math.max(this._dist * 0.9, (canvas.grid.size * 8) / factor);
        const away = this._origin.clone().sub(this._target).setY(0);
        if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
        this._origin = this._target.clone().addScaledVector(away.normalize(), height * 0.45).addScaledVector(UP, height);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (this.params.speed / this._dist / (factor / 100)) * ParticleEngine.getScale() * 0.8;
    }

    static get IMPACT() {
        return "meteorimpact";
    }

    static get IMPACT_SCALE() {
        return 1.4;
    }

    static get LIGHT() {
        return 2;
    }

    get coreSprite() {
        return this.params.sprite === this.defaultSettings.sprite ? "fire" : this.params.sprite;
    }

    async build() {
        const s = this.params.scale.start;
        this._warning = groundMark(this, { position: this._target, size: s * 2.2, color: this.palette.start, blending: "additive", opacity: 0.6, life: 1 / Math.max(this._speed, 0.1) + 0.3 });
        const rock = await loadRock(this, ROCKS[0]);
        if (rock) {
            rock.material.color.copy(this.palette.light);
            const mesh = new THREE.Mesh(rock.geometry, rock.material);
            mesh.scale.setScalar(s * 0.22);
            this._rock = mesh;
            this.emitter.add(mesh);
        }
        await super.build();
    }

    launchLayers(s) {
        return [];
    }

    bodyLayers(s) {
        const alpha = this.params.alpha.start;
        const per = this.params.rate.particles;
        return [
            glow(this, { sprite: "emberssmall", size: s * 1.4, life: 0.08, rate: 40, color: [[0, "white", alpha, 1.3], [1, "core", 0]], order: 7 }),
            createLayer(this, { sprite: this.coreSprite, world: false, rate: 60, life: [0.12, 0.2], size: [s * 1.3, s * 1.8], rotation: true, spin: [-4, 4], shape: { type: "sphere", radius: s * 0.15 }, sizeOverLife: "swell", color: [[0, "core", alpha], [0.4, "start", 0.9 * alpha], [1, "end", 0]] }),
            glow(this, { sprite: "emberssmall", size: s * 2.6, life: 0.1, rate: 16, color: ["start", "end", 0.35 * alpha, 0] }),
            createLayer(this, { sprite: this.coreSprite, perDistance: per * 3, life: [0.5, 0.9], size: [s * 0.6, s * 1], speed: [s * 0.05, s * 0.2], rotation: true, spin: [-2, 2], shape: { type: "sphere", radius: s * 0.15 }, sizeOverLife: [0.8, 1, 0.6, 0.1], color: [[0, "core", alpha], [0.25, "start", 0.85 * alpha], [0.7, "end", 0.4], [1, "edge", 0]] }),
            smokePuff(this, { rate: 0, perDistance: per * 1.2, life: [1.4, 2.4], size: [s * 0.6, s * 1.1], speed: s * 0.1, delay: 0.05, shape: { type: "sphere", radius: s * 0.2 }, force: [0, s * 0.2, 0], color: SOOT }),
            sparks(this, { burst: undefined, rate: 0, perDistance: per * 3, life: [0.4, 0.9], size: [s * 0.04, s * 0.09], speed: [s * 0.5, s * 2], shape: { type: "sphere", radius: s * 0.2 }, gravity: s * 2 }),
        ];
    }

    animate(delta) {
        if (this._rock) {
            this._rock.rotation.x += delta * 4;
            this._rock.rotation.y += delta * 2.5;
        }
        super.animate(delta);
    }

    dispose() {
        super.dispose();
        this._rockMaterials?.forEach((material) => material.dispose());
    }
}

export class MissileVolley extends MagicProjectileBase {
    constructor(...args) {
        super(...args);
        useColorsIfDefault(this, "#d6b8ff", "#7a3cff");
        this._count = Math.clamp(Math.round(this.params.rate.particles / 3), 2, 9);
    }

    static get IMPACT_SCALE() {
        return 0.6;
    }

    static get LIGHT() {
        return 0;
    }

    async build() {
        const s = this.params.scale.start;
        this._launch = launchGroup(this, s * 0.15);
        await this.addTo(this._launch, this.launchLayers(s));
        const forward = this._target.clone().sub(this._origin).normalize();
        const side = new THREE.Vector3().crossVectors(forward, UP).normalize();
        this._darts = [];
        for (let i = 0; i < this._count; i++) {
            const spread = this._count === 1 ? 0 : (i / (this._count - 1)) * 2 - 1;
            const lift = 0.15 + Math.random() * 0.35;
            const end = this._target.clone().add(new THREE.Vector3((Math.random() - 0.5) * s * 0.4, (Math.random() - 0.5) * s * 0.4, (Math.random() - 0.5) * s * 0.4));
            const c1 = this._origin.clone().addScaledVector(forward, this._dist * 0.15).addScaledVector(side, spread * this._dist * 0.35).addScaledVector(UP, lift * this._dist);
            const c2 = end.clone().addScaledVector(forward, -this._dist * 0.35).addScaledVector(side, spread * this._dist * 0.1).addScaledVector(UP, lift * this._dist * 0.3);
            const group = this.addMesh(new THREE.Group(), game.Levels3DPreview.scene);
            group.position.copy(this._origin);
            const path = new THREE.CubicBezierCurve3(this._origin.clone(), c1, c2, end);
            const systems = await this.addTo(group, this.dartLayers(s));
            this._darts.push({ group, path, systems, delay: i * 0.07 + Math.random() * 0.04, speed: (this._speed * (0.85 + Math.random() * 0.3)) / 1.3, done: false });
        }
        const lead = this._darts[Math.floor(this._count / 2)];
        this.emitLight({ intensity: effectLightIntensity(0.8), distance: s * 5, curve: "steady", progress: () => 0, parent: lead.group });
    }

    dartLayers(s) {
        const { min, max } = this.params.life;
        const alpha = this.params.alpha.start;
        return [
            glow(this, { sprite: this.params.sprite, size: s * 0.3, life: 0.08, rate: 30, color: ["core", "glow", alpha, 0] }),
            glow(this, { sprite: "emberssmall", size: s * 0.7, life: 0.1, rate: 14, color: ["glow", "end", 0.35 * alpha, 0] }),
            ribbon(this, { size: s * 0.16, life: [min, max], perDistance: this.params.rate.particles * 4, color: [[0, "core", alpha], [0.4, "glow", 0.7 * alpha], [1, "end", 0]] }),
            embers(this, { rate: 0, perDistance: this.params.rate.particles * 2, life: [max, max * 2], size: [s * 0.03, s * 0.06], speed: [s * 0.05, s * 0.2], shape: { type: "sphere", radius: s * 0.06 }, aim: 0, force: [0, 0, 0] }),
        ];
    }

    animate(delta) {
        this._time += delta;
        let remaining = 0;
        for (const dart of this._darts) {
            if (dart.done) continue;
            const t = (this._time - dart.delay) * dart.speed;
            if (t <= 0) {
                remaining++;
                continue;
            }
            if (t >= 1) {
                dart.done = true;
                dart.group.position.copy(dart.path.getPoint(1));
                stopEmitting(dart.systems);
                this.dartImpact(dart.group.position);
                continue;
            }
            remaining++;
            dart.group.position.copy(dart.path.getPoint(t));
            dart.group.lookAt(dart.path.getPoint(Math.min(1, t + 0.02)));
        }
        if (remaining) return;
        this.emitter.position.copy(this._target);
        this._impacted = true;
        this._playOnEnd = true;
        this.onEnd();
    }

    dartImpact(point) {
        const impact = this.params.impact ?? true;
        if (!impact || this.params.onEnd?.length) return;
        const type = typeof impact === "string" ? impact : this.constructor.IMPACT;
        const scale = this.params.scale.start * this.constructor.IMPACT_SCALE;
        const direction = point.clone().sub(this._origin).normalize();
        game.Levels3DPreview.particleSystem.effect(null, point.clone(), { type, id: this.params.id, scene: this.params.scene, color: { start: [...this.params.color.start], end: [...this.params.color.end] }, scale: { start: scale, end: 0 }, direction });
    }
}

export class EarthProjectile extends ProjectileParticle {
    constructor(...args) {
        super(...args);
        this._origin = this._originBottom;
        this._target = this._targetBottom;
        this._dist = this._origin.distanceTo(this._target);
        useColorsIfDefault(this, "#9a8468", "#5e4a36");
    }

    static get IMPACT() {
        return "rockimpact";
    }

    static get IMPACT_SCALE() {
        return 0.8;
    }

    addLight() {}

    async build() {
        const s = this.params.scale.start;
        const per = this.params.rate.particles;
        const rocks = await Promise.all(ROCKS.map((path) => loadRock(this, path)));
        const sizeCurve = new QUARKS.PiecewiseBezier([
            [new QUARKS.Bezier(0, 1.2, 1.4, 1.3), 0],
            [new QUARKS.Bezier(1.3, 1.3, 1.2, 1), 0.2],
            [new QUARKS.Bezier(1, 0.8, 0.2, 0), 0.75],
        ]);
        const rockSpec = { perDistance: per * 4, life: [0.6, 1.1], size: [s * 0.1, s * 0.22], shape: { type: "circle", radius: s * 0.25 }, aim: "up", speed: [s * 0.05, s * 0.2], sizeOverLife: sizeCurve, position: [0, -s * 0.03, 0], color: [[0, "white", 1], [1, "white", 1]], soft: false, order: 4 };
        await this.add(
            rockLayer(this, rocks[0], rockSpec),
            rockLayer(this, rocks[1] ?? rocks[0], { ...rockSpec, perDistance: per * 3, size: [s * 0.08, s * 0.16] }),
            createLayer(this, { sprite: "dirt", blend: "normal", perDistance: per * 5, life: [0.4, 0.8], size: [s * 0.5, s * 0.9], speed: [s * 0.6, s * 1.2], rotation: true, aim: "up", gravity: s * 5, shape: { type: "cone", radius: s * 0.2, angle: Math.PI / 6 }, sizeOverLife: "grow", color: [[0, "ash", 1], [0.7, "smoke", 0.8], [1, "smoke", 0]] }),
            createLayer(this, { sprite: "debris_2x2", blend: "normal", perDistance: per * 3, life: [0.5, 0.9], size: [s * 0.03, s * 0.07], speed: [s * 1, s * 2.4], rotation: true, spin: [-6, 6], aim: "up", gravity: s * 9, shape: { type: "cone", radius: s * 0.2, angle: Math.PI / 4 }, color: [[0, "ash", 1], [0.8, "smoke", 1], [1, "smoke", 0]], soft: false }),
            smokePuff(this, { rate: 0, perDistance: per * 4, life: [1, 1.8], size: [s * 0.6, s * 1.1], speed: [s * 0.1, s * 0.3], position: [0, s * 0.05, 0], shape: { type: "circle", radius: s * 0.3 }, aim: "up", force: [0, s * 0.1, 0], color: [[0, "ash", 0], [0.15, "ash", 0.65], [1, "smoke", 0]] }),
        );
        await this.addTo(launchGroup(this), smokePuff(this, { rate: 0, burst: 6, life: [0.8, 1.4], size: [s * 0.4, s * 0.7], speed: [s * 0.3, s * 0.6], speedOverLife: [1, 0.2, 0.1, 0], shape: { type: "circle", radius: s * 0.3 }, aim: "up", color: [[0, "ash", 0], [0.15, "ash", 0.5], [1, "smoke", 0]] }));
    }

    animate(delta) {
        super.animate(delta);
        this.emitter.rotation.set(0, 0, 0);
    }

    dispose() {
        super.dispose();
        this._rockMaterials?.forEach((material) => material.dispose());
    }
}

registerEffects("projectiles", {
    projectile: MagicProjectile,
    earthprojectile: EarthProjectile,
    blackdart: BlackDart,
    runicshot: RunicShot,
    magicarrow: MagicArrow,
    fireball: Fireball,
    icelance: IceLance,
    acidglob: AcidGlob,
    missilevolley: MissileVolley,
    meteor: Meteor,
});
