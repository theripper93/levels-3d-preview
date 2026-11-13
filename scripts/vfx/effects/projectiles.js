import * as THREE from "three";
import { registerEffects } from "../registry.js";
import { ProjectileParticle } from "../base/ProjectileParticle.js";
import { createLayer, flash, glow, ribbon, sparks, smokePuff } from "../layers/index.js";
import { effectLightIntensity, launchGroup, ballisticPath, useColorsIfDefault, loadRock } from "./kit.js";

const MODELS = "modules/levels-3d-preview/assets/particles/models";
const ROCK = "modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_4.glb";
const tipStart = new THREE.Vector3();
const tipNow = new THREE.Vector3();
const wobbleAxis = new THREE.Vector3(1, 0, 0);
const wobbleRotation = new THREE.Quaternion();

export class PhysicalProjectile extends ProjectileParticle {
    static get MODEL() {
        return `${MODELS}/arrow_particle_color.glb`;
    }

    static get SPIN() {
        return 10;
    }

    static get LOFT() {
        return 0.06;
    }

    static get STICKS() {
        return true;
    }

    static get MODEL_SCALE() {
        return 1;
    }

    static get IMPACT() {
        return "hitpuff";
    }

    static get IMPACT_SCALE() {
        return 0.6;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        };
    }

    addLight() {}

    createAnimationPath() {
        if (!ballisticPath(this, this.constructor.LOFT)) super.createAnimationPath();
    }

    async build() {
        const s = this.params.scale.start;
        const modelScale = s * this.modelScale;
        const model = await this.getMesh(this.modelPath, false);
        model.scale.setScalar(modelScale);
        this._model = model;
        this._tip = new THREE.Vector3(0, 0, new THREE.Box3().setFromObject(model).max.z / modelScale);
        if (this.constructor.STICKS) this._persistObjects.push(model);
        this.emitter.add(model);
        this.emitter.lookAt(this.animationPath.getPointAt(0.02));
        await this.add(this.trailLayers(s));
        this._launch = launchGroup(this, s * 0.2);
        await this.addTo(this._launch, this.launchLayers(s));
    }

    get modelPath() {
        return this.constructor.MODEL;
    }

    get modelScale() {
        return this.constructor.MODEL_SCALE;
    }

    trailLayers(s) {
        const { min, max } = this.params.life;
        const alpha = this.params.alpha.start;
        return [
            ribbon(this, { size: s * 0.05, life: [min * 0.6, max * 0.6], perDistance: this.params.rate.particles * 5, color: [[0, "white", 0.55 * alpha], [0.3, "start", 0.35 * alpha], [1, "end", 0]] }),
            ribbon(this, { sprite: "trace_04_rotated", blend: "normal", size: s * 0.12, life: [max * 0.8, max * 1.4], perDistance: this.params.rate.particles * 3, color: [[0, "ash", 0], [0.15, "ash", 0.18 * alpha], [1, "ash", 0]] }),
        ];
    }

    launchLayers(s) {
        return [smokePuff(this, { rate: 0, burst: 2, life: [0.4, 0.7], size: [s * 0.15, s * 0.3], speed: [s * 0.2, s * 0.5], speedOverLife: [1, 0.2, 0.1, 0], shape: { type: "cone", radius: s * 0.02, angle: Math.PI / 6 }, color: [[0, "ash", 0], [0.2, "ash", 0.25], [1, "ash", 0]] })];
    }

    onEnd() {
        if (this._wobble || this.ended) return;
        super.onEnd();
        const objects = this._persistObjects.filter((object) => object.parent && object.parent !== this.emitter);
        if (!objects.length) return;
        this.ended = false;
        this._wobble = { age: 0, objects: objects.map((object) => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone() })) };
    }

    updateWobble(delta) {
        const wobble = this._wobble;
        wobble.age += delta;
        const angle = 0.22 * Math.exp(-wobble.age * 7) * Math.sin(wobble.age * 45);
        wobbleRotation.setFromAxisAngle(wobbleAxis, angle);
        for (const { object, position, quaternion } of wobble.objects) {
            tipStart.copy(this._tip).multiply(object.scale).applyQuaternion(quaternion);
            object.quaternion.copy(quaternion).multiply(wobbleRotation);
            tipNow.copy(this._tip).multiply(object.scale).applyQuaternion(object.quaternion);
            object.position.copy(position).add(tipStart).sub(tipNow);
        }
        if (wobble.age < 0.7) return;
        for (const { object, position, quaternion } of wobble.objects) {
            object.position.copy(position);
            object.quaternion.copy(quaternion);
        }
        this.ended = true;
    }

    animate(delta) {
        if (this._wobble) return this.updateWobble(delta);
        this._model.rotation.z += delta * this.constructor.SPIN;
        super.animate(delta);
    }
}

export class Arrow extends PhysicalProjectile {}

export class Bolt extends PhysicalProjectile {
    static get MODEL() {
        return `${MODELS}/bolt_particle.glb`;
    }

    static get LOFT() {
        return 0.03;
    }
}

export class Javelin extends PhysicalProjectile {
    static get MODEL() {
        return `${MODELS}/javelin_particle.glb`;
    }

    static get SPIN() {
        return 4;
    }

    static get LOFT() {
        return 0.1;
    }

    static get IMPACT_SCALE() {
        return 0.9;
    }
}

export class ThrownDagger extends PhysicalProjectile {
    static get MODEL() {
        return `${MODELS}/javelin_particle.glb`;
    }

    static get MODEL_SCALE() {
        return 0.4;
    }

    static get LOFT() {
        return 0.05;
    }

    static get IMPACT_SCALE() {
        return 0.5;
    }

    get customModel() {
        return this.params.sprite !== this.defaultSettings.sprite && game.Levels3DPreview.helpers.is3DModel(this.params.sprite);
    }

    get modelPath() {
        return this.customModel ? this.params.sprite : super.modelPath;
    }

    get modelScale() {
        return this.customModel ? 1 : super.modelScale;
    }

    async build() {
        await super.build();
        this._tumble = new THREE.Group();
        this.emitter.add(this._tumble);
        this._tumble.add(this._model);
    }

    trailLayers(s) {
        return [
            ...super.trailLayers(s),
            createLayer(this, { sprite: "star_04", world: false, rate: 3, life: 0.12, size: s * 0.35, rotation: true, sizeOverLife: "pulse", position: [0, 0, s * 0.1], color: ["white", "spark", 0.7, 0] }),
        ];
    }

    animate(delta) {
        if (!this._wobble && !this.ended) this._tumble.rotation.x += delta * 18;
        super.animate(delta);
    }

    onEnd() {
        if (!this._wobble && !this.ended) this._tumble.rotation.x = 0;
        super.onEnd();
    }
}

export class Bullet extends PhysicalProjectile {
    static get MODEL() {
        return `${MODELS}/bullet.glb`;
    }

    static get STICKS() {
        return false;
    }

    static get LOFT() {
        return 0;
    }

    static get SPIN() {
        return 30;
    }

    static get IMPACT() {
        return "contactspark";
    }

    static get IMPACT_SCALE() {
        return 0.5;
    }

    addLight() {
        const s = this.params.scale.start;
        this.emitLight({ intensity: effectLightIntensity(1.5), distance: s * 5, duration: 0.09, curve: "flash", parent: this._launch });
    }

    trailLayers(s) {
        const { min, max } = this.params.life;
        return [
            ribbon(this, { size: s * 0.05, life: [min * 0.5, max * 0.5], perDistance: this.params.rate.particles * 5, color: [[0, "white", this.params.alpha.start, 1.5], [0.3, "spark", 0.8], [1, "end", 0]] }),
            glow(this, { size: s * 0.25, life: 0.05, rate: 30, color: ["spark", "end", 0.6, 0] }),
        ];
    }

    launchLayers(s) {
        return muzzleLayers(this, s);
    }
}

export function muzzleLayers(effect, s, strength = 1) {
    return [
        createLayer(effect, { sprite: "muzzle_rotated", mode: "stretched", stretch: 0.0001, lengthFactor: 0, world: false, burst: 2, speed: s * 0.01, life: 0.07, size: [s * 0.45 * strength, s * 0.65 * strength], color: [[0, "white", 1, 1.5], [0.5, "spark", 0.9], [1, "start", 0]], sizeOverLife: [0.6, 1, 1, 0.8], position: [0, 0, s * 0.25 * strength] }),
        flash(effect, { sprite: "star_06", size: s * 1.1 * strength, life: 0.07, color: ["white", "spark", 1, 0] }),
        sparks(effect, { burst: 6 * strength, size: [s * 0.03, s * 0.06], speed: [s * 2, s * 5], life: [0.1, 0.25], gravity: s * 4, shape: { type: "cone", radius: s * 0.02, angle: Math.PI / 7 } }),
        smokePuff(effect, { rate: 0, burst: 3 * strength, life: [0.7, 1.2], size: [s * 0.2, s * 0.4], speed: [s * 0.3, s * 0.9], speedOverLife: [1, 0.2, 0.1, 0], force: [0, s * 0.15, 0], shape: { type: "cone", radius: s * 0.03, angle: Math.PI / 5 }, color: [[0, "ash", 0], [0.15, "ash", 0.4], [1, "ash", 0]] }),
    ];
}

export class Shotgun extends ProjectileParticle {
    constructor(...args) {
        super(...args);
        this._duration = this.params.life.max;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.2,
            emitterSize: 0,
        };
    }

    static get IMPACT_SCALE() {
        return 2.5;
    }

    addLight() {
        const s = this.params.scale.start;
        this.emitLight({ intensity: effectLightIntensity(1.5), distance: s * 10, duration: 0.12, curve: "flash" });
    }

    async createEmitter() {
        const s = this.params.scale.start;
        this.emitter = new THREE.Group();
        this.emitter.position.copy(this._origin);
        this.emitter.lookAt(this._target);
        const reach = this._dist / Math.max(this.params.life.max, 0.05);
        await this.add(
            createLayer(this, {
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.04 / Math.max(s, 0.01),
                world: false,
                burst: this.params.rate.particles,
                life: [this.params.life.min, this.params.life.max],
                speed: [reach * 0.8, reach * 1.1],
                size: [s * 0.25, s * 0.4],
                shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 14 },
                color: [[0, "white", 1, 1.6], [0.35, "spark", 1], [0.8, "end", 0.8], [1, "end", 0]],
                order: 8,
            }),
            ...muzzleLayers(this, s * 2.5, 1.6),
        );
    }

    animate(delta) {
        this._time += delta;
        this._duration -= delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1 || this._duration < 0) {
            this._playOnEnd = true;
            this.onEnd();
        }
    }
}

export class ThrownObject extends ProjectileParticle {
    static get LOFT() {
        return 0.25;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        };
    }

    addLight() {}

    createAnimationPath() {
        if (!ballisticPath(this, this.constructor.LOFT)) super.createAnimationPath();
    }

    async build() {
        this._body = new THREE.Group();
        this.emitter.add(this._body);
        this.emitter.lookAt(this.animationPath.getPointAt(0.02));
        await this.addTo(launchGroup(this, this.params.scale.start * 0.2), this.launchLayers(this.params.scale.start));
    }

    launchLayers(s) {
        return [];
    }

    animate(delta) {
        this._body.rotation.x += delta * 7;
        this._body.rotation.y += delta * 3;
        super.animate(delta);
    }
}

export class Flask extends ThrownObject {
    constructor(...args) {
        super(...args);
        useColorsIfDefault(this, "#ff4f7a", "#a0003a");
    }

    static get IMPACT() {
        return "flaskshatter";
    }

    static get IMPACT_SCALE() {
        return 0.9;
    }

    static get LOFT() {
        return 0.3;
    }

    async build() {
        await super.build();
        const s = this.params.scale.start;
        const alpha = this.params.alpha.start;
        const per = this.params.rate.particles;
        await this.addTo(
            this._body,
            createLayer(this, { sprite: "emberssmall", blend: "normal", lit: false, world: false, rate: 30, life: 0.12, size: s * 0.5, color: [[0, "start", 0.95 * alpha], [1, "mid", 0.9 * alpha]], order: 5 }),
            createLayer(this, { sprite: "emberssmall", world: false, rate: 20, life: 0.12, size: s * 0.9, color: ["glow", "end", 0.35 * alpha, 0], order: 6 }),
            createLayer(this, { sprite: "emberssmall", world: false, rate: 30, life: 0.08, size: s * 0.14, position: [s * 0.1, s * 0.1, 0], color: ["white", "white", 0.9, 0.5], order: 7 }),
            createLayer(this, { sprite: "star_04", world: false, rate: 4, life: 0.2, size: s * 0.3, position: [-s * 0.06, s * 0.08, 0], sizeOverLife: "pulse", color: ["white", "core", 0.8, 0], order: 7 }),
        );
        await this.add(
            createLayer(this, { sprite: "emberssmall", blend: "normal", lit: false, perDistance: per * 1.5, life: [0.4, 0.7], size: [s * 0.03, s * 0.06], speed: [s * 0.05, s * 0.2], gravity: s * 6, shape: { type: "sphere", radius: s * 0.08 }, color: [[0, "start", 1], [1, "end", 0]] }),
            smokePuff(this, { rate: 0, perDistance: per, lit: false, life: [0.5, 0.9], size: [s * 0.1, s * 0.2], speed: s * 0.05, shape: { type: "sphere", radius: s * 0.05 }, color: [[0, "light", 0], [0.2, "light", 0.2], [1, "glow", 0]] }),
        );
    }
}

export class Boulder extends ThrownObject {
    constructor(...args) {
        super(...args);
        useColorsIfDefault(this, "#9a8468", "#5e4a36");
    }

    static get IMPACT() {
        return "rockimpact";
    }

    static get IMPACT_SCALE() {
        return 1.3;
    }

    async build() {
        await super.build();
        const s = this.params.scale.start;
        const per = this.params.rate.particles;
        const rock = await loadRock(this, ROCK);
        if (rock) {
            rock.material.color.copy(this.palette.light);
            const mesh = new THREE.Mesh(rock.geometry, rock.material);
            mesh.scale.setScalar(s * 0.35);
            this._rock = mesh;
            this._body.add(mesh);
        } else {
            await this.addTo(this._body, createLayer(this, { sprite: "toon_blob", blend: "normal", world: false, rate: 30, life: 0.1, size: s * 0.6, color: [[0, "ash", 1], [1, "ash", 1]] }));
        }
        await this.add(
            smokePuff(this, { rate: 0, perDistance: per * 1.2, life: [0.8, 1.4], size: [s * 0.25, s * 0.45], speed: s * 0.05, shape: { type: "sphere", radius: s * 0.15 }, color: [[0, "ash", 0], [0.15, "ash", 0.35], [1, "smoke", 0]] }),
            createLayer(this, { sprite: "debris_2x2", blend: "normal", perDistance: per * 2, life: [0.5, 0.9], size: [s * 0.03, s * 0.07], speed: [s * 0.1, s * 0.3], rotation: true, spin: [-6, 6], gravity: s * 9, shape: { type: "sphere", radius: s * 0.15 }, color: [[0, "ash", 1], [0.8, "smoke", 1], [1, "smoke", 0]], soft: false }),
        );
    }

    launchLayers(s) {
        return [smokePuff(this, { rate: 0, burst: 5, life: [0.8, 1.2], size: [s * 0.3, s * 0.5], speed: [s * 0.3, s * 0.7], speedOverLife: [1, 0.2, 0.1, 0], shape: { type: "cone", radius: s * 0.1, angle: Math.PI / 4 }, color: [[0, "ash", 0], [0.15, "ash", 0.45], [1, "smoke", 0]] })];
    }

    dispose() {
        super.dispose();
        this._rockMaterials?.forEach((material) => material.dispose());
    }
}

registerEffects("projectiles", {
    arrow: Arrow,
    bolt: Bolt,
    javelin: Javelin,
    bullet: Bullet,
    shotgun: Shotgun,
    dagger: ThrownDagger,
    flask: Flask,
    boulder: Boulder,
});
