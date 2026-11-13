import * as THREE from "three";
import { registerEffects } from "../registry.js";
import { BurstEffect } from "../base/BurstEffect.js";
import { createLayer, flash, glow, sparks, smokePuff, debris, groundRing } from "../layers/index.js";
import { SOOT, effectLightIntensity, groundMark } from "./kit.js";

const UP = new THREE.Vector3(0, 1, 0);

class ImpactEffect extends BurstEffect {
    get bounce() {
        return this.params.direction ? this.params.direction.clone().negate().lerp(UP, 0.45).normalize() : UP;
    }

    async groundOffset() {
        return Math.min(0, (await this.getCollision()) - this._target.y);
    }
}

export class ContactSpark extends ImpactEffect {
    async build() {
        if (this.params.subtle) return this.buildSubtle();
        const s = this.params.scale.start;
        this._duration = Math.max(this._duration, 0.4);
        await this.add(
            flash(this, { sprite: "star_06", size: s * 2.6, life: 0.16, color: [[0, "white", 1, 2], [0.4, "core", 0.9, 1.5], [1, "glow", 0]] }),
            glow(this, { sprite: "emberssmall", size: s * 1.8, life: 0.22, rate: 0, burst: 1, sizeOverLife: "pop", color: ["glow", "end", 0.6, 0] }),
            createLayer(this, { sprite: "toon_spark_burst", frames: "animate", world: false, life: 0.24, size: s * 1.5, burst: 1, rotation: true, color: [[0, "white", 1, 1.6], [0.5, "spark", 0.9], [1, "end", 0]] }),
            sparks(this, {
                direction: this.bounce,
                burst: 18,
                size: [s * 0.12, s * 0.22],
                speed: [s * 2, s * 5],
                stretch: 0.12,
                shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 3.5 },
                color: [[0, "white", 1, 2], [0.25, "spark", 1, 1.5], [0.7, "end", 0.8], [1, "edge", 0]],
            }),
            smokePuff(this, { rate: 0, burst: 2, life: [0.5, 0.8], size: [s * 0.3, s * 0.5], speed: s * 0.2, color: [[0, "smoke", 0], [0.2, "smoke", 0.35], [1, "ash", 0]] }),
        );
        this.emitLight({ intensity: effectLightIntensity(1), distance: s * 5, duration: 0.18, curve: "flash" });
    }

    async buildSubtle() {
        const s = this.params.scale.start;
        this._duration = Math.max(this._duration, 0.3);
        await this.add(
            flash(this, { sprite: "star_06", size: s * 1.1, life: 0.12, color: [[0, "white", 0.6, 1.2], [0.4, "core", 0.5], [1, "glow", 0]] }),
            glow(this, { sprite: "emberssmall", size: s * 1.2, life: 0.2, rate: 0, burst: 1, sizeOverLife: "pop", color: ["glow", "end", 0.45, 0] }),
            sparks(this, { direction: this.bounce, burst: 4, size: [s * 0.05, s * 0.09], speed: [s * 1, s * 2.5], life: [0.15, 0.3], stretch: 0.04, shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 4 }, color: [[0, "spark", 0.8], [0.6, "end", 0.5], [1, "edge", 0]] }),
        );
        this.emitLight({ intensity: effectLightIntensity(0.4), distance: s * 3, duration: 0.12, curve: "flash" });
    }
}

export class HitPuff extends ImpactEffect {
    async build() {
        const s = this.params.scale.start;
        const subtle = this.params.subtle;
        this._duration = Math.max(this._duration, 0.4);
        await this.add(
            flash(this, { sprite: "star_08", size: s * (subtle ? 0.7 : 1.1), life: 0.1, color: ["white", "spark", subtle ? 0.4 : 0.7, 0] }),
            smokePuff(this, { direction: this.bounce, rate: 0, burst: subtle ? 3 : 4, life: [0.5, 0.9], size: [s * 0.25, s * 0.45], speed: [s * 0.4, s * 0.9], speedOverLife: [1, 0.3, 0.1, 0], force: [0, s * 0.2, 0], shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 4 }, color: [[0, "ash", 0], [0.15, "ash", 0.45], [1, "ash", 0]] }),
            debris(this, { direction: this.bounce, aim: undefined, burst: subtle ? 3 : 6, size: [s * 0.04, s * 0.08], speed: [s * 1, s * 2.5], life: [0.4, 0.7], gravity: s * 12, color: [[0, "ash", 1], [0.7, "ash", 1], [1, "ash", 0]] }),
            subtle ? null : sparks(this, { direction: this.bounce, burst: 5, size: [s * 0.05, s * 0.1], speed: [s * 1.5, s * 3], life: [0.15, 0.3] }),
        );
    }
}

export class IceShatter extends ImpactEffect {
    async build() {
        const s = this.params.scale.start;
        const ground = await this.groundOffset();
        this._duration = Math.max(this._duration, 0.6);
        await this.add(
            flash(this, { sprite: "star_08", size: s * 2.4, life: 0.16, color: [[0, "white", 1, 1.6], [0.5, "core", 0.8], [1, "glow", 0]] }),
            debris(this, {
                aim: undefined,
                direction: this.bounce,
                burst: 16,
                blend: "add",
                size: [s * 0.06, s * 0.16],
                speed: [s * 1.5, s * 4.5],
                life: [0.6, 1.1],
                gravity: s * 10,
                shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 2.5 },
                collide: this._target.y + ground,
                bounce: 0.35,
                color: [[0, "white", 1, 1.4], [0.3, "core", 0.95], [0.8, "glow", 0.7], [1, "glow", 0]],
            }),
            createLayer(this, { sprite: "star", burst: 10, life: [0.4, 0.8], size: [s * 0.08, s * 0.16], speed: [s * 0.5, s * 1.6], shape: { type: "sphere", radius: s * 0.15 }, gravity: s * 0.6, rotation: true, color: [[0, "white", 0], [0.2, "white", 1, 1.4], [1, "core", 0]] }),
            smokePuff(this, { rate: 0, burst: 5, life: [0.8, 1.3], size: [s * 0.35, s * 0.6], speed: s * 0.35, force: [0, -s * 0.1, 0], shape: { type: "sphere", radius: s * 0.15 }, lit: false, color: [[0, "core", 0], [0.15, "core", 0.35], [1, "glow", 0]] }),
            groundRing(this, { sprite: "spiral_19", size: s * 2.2, life: 0.6, position: [0, ground + s * 0.02, 0], color: ["core", "glow", 0.7, 0] }),
        );
        this.emitLight({ intensity: effectLightIntensity(1.2), distance: s * 5, duration: 0.3, curve: "flash" });
        groundMark(this, { position: this._target.clone().setY(this._target.y + ground), size: s * 1.6, color: this.palette.core, blending: "additive", opacity: 0.5, life: 2 });
        this.shake(0.15, 0.2);
    }
}

export class Splash extends ImpactEffect {
    async build() {
        const s = this.params.scale.start;
        const ground = await this.groundOffset();
        const floor = this._target.y + ground;
        this._duration = Math.max(this._duration, 0.6);
        await this.add(this.splashLayers(s, ground, floor));
        groundMark(this, { position: this._target.clone().setY(floor), size: s * 1.8, color: this.palette.edge, blending: "normal", opacity: 0.6, life: 5 });
        this.emitLight({ intensity: effectLightIntensity(0.6), distance: s * 4, duration: 0.3, curve: "flash" });
    }

    splashLayers(s, ground, floor) {
        return [
            glow(this, { sprite: "emberssmall", size: s * 1.6, life: 0.25, rate: 0, burst: 1, sizeOverLife: "pop", color: ["glow", "end", 0.7, 0] }),
            createLayer(this, { sprite: "splash_2x2", blend: "normal", lit: false, world: false, burst: 3, life: [0.3, 0.45], size: [s * 0.9, s * 1.3], rotation: true, sizeOverLife: [0.3, 1, 1.15, 1.2], color: [[0, "start", 1], [0.6, "mid", 0.85], [1, "end", 0]] }),
            createLayer(this, {
                sprite: "emberssmall",
                blend: "normal",
                lit: false,
                mode: "stretched",
                stretch: 0.05,
                direction: this.bounce,
                burst: 22,
                life: [0.5, 0.9],
                size: [s * 0.05, s * 0.11],
                speed: [s * 1.5, s * 4],
                gravity: s * 12,
                shape: { type: "cone", radius: s * 0.1, angle: Math.PI / 2.4 },
                collide: floor,
                bounce: 0.1,
                color: [[0, "start", 1], [0.7, "mid", 0.9], [1, "end", 0]],
            }),
            createLayer(this, { sprite: "splash_2x2", blend: "normal", lit: false, mode: "horizontal", world: false, burst: 1, delay: 0.1, life: 2.6, size: s * 1.5, rotation: true, position: [0, ground + s * 0.01, 0], sizeOverLife: [0.4, 1, 1.05, 1.08], color: [[0, "start", 0.9], [0.7, "edge", 0.7], [1, "edge", 0]], soft: false, order: 1 }),
            smokePuff(this, { rate: 0, burst: 4, delay: 0.15, life: [1, 1.6], size: [s * 0.3, s * 0.5], speed: s * 0.15, position: [0, ground + s * 0.05, 0], shape: { type: "circle", radius: s * 0.4 }, aim: "up", lit: false, color: [[0, "light", 0], [0.2, "light", 0.2], [1, "smoke", 0]] }),
        ];
    }
}

export class FlaskShatter extends Splash {
    splashLayers(s, ground, floor) {
        return [
            ...super.splashLayers(s, ground, floor),
            flash(this, { sprite: "star_08", size: s * 1.6, life: 0.12, color: ["white", "core", 0.9, 0] }),
            debris(this, { aim: undefined, direction: this.bounce, blend: "add", burst: 12, size: [s * 0.04, s * 0.09], speed: [s * 2, s * 4], life: [0.5, 0.9], gravity: s * 12, collide: floor, bounce: 0.3, color: [[0, "white", 0.9, 1.5], [0.8, "white", 0.6], [1, "white", 0]] }),
        ];
    }
}

export class RockImpact extends ImpactEffect {
    async build() {
        const s = this.params.scale.start;
        const ground = await this.groundOffset();
        const floor = this._target.y + ground;
        this._duration = Math.max(this._duration, 0.8);
        await this.add(
            createLayer(this, { sprite: "dirt", blend: "normal", direction: UP, burst: 6, life: [0.5, 0.8], size: [s * 0.5, s * 0.9], speed: [s * 0.8, s * 1.6], rotation: true, gravity: s * 4, sizeOverLife: "grow", shape: { type: "cone", radius: s * 0.2, angle: Math.PI / 4 }, color: [[0, "ash", 1], [0.7, "smoke", 0.9], [1, "smoke", 0]] }),
            debris(this, { burst: 18, size: [s * 0.08, s * 0.2], speed: [s * 1.5, s * 4], life: [0.7, 1.2], collide: floor, bounce: 0.3, shape: { type: "cone", radius: s * 0.3, angle: Math.PI / 3 }, color: [[0, "ash", 1], [0.8, "smoke", 1], [1, "smoke", 0]] }),
            smokePuff(this, { rate: 0, burst: 10, life: [1.4, 2.4], size: [s * 0.6, s * 1.1], speed: [s * 0.8, s * 1.4], speedOverLife: [1, 0.2, 0.05, 0], force: [0, s * 0.1, 0], position: [0, ground + s * 0.1, 0], shape: { type: "circle", radius: s * 0.3 }, aim: "up", color: [[0, "ash", 0], [0.1, "ash", 0.6], [0.6, "smoke", 0.35], [1, "smoke", 0]] }),
            groundRing(this, { sprite: "smoke_10", blend: "normal", size: s * 3.2, life: 0.9, position: [0, ground + s * 0.03, 0], sizeOverLife: [0.2, 0.9, 1, 1.05], color: [[0, "ash", 0.6], [1, "smoke", 0]] }),
        );
        groundMark(this, { position: this._target.clone().setY(floor), size: s * 1.6, opacity: 0.5, life: 6 });
        this.shake(0.45, 0.35);
    }
}

export class MeteorImpact extends ImpactEffect {
    async build() {
        const s = this.params.scale.start;
        const ground = await this.groundOffset();
        const floor = this._target.y + ground;
        const sprite = this.params.sprite === this.defaultSettings.sprite ? "fire" : this.params.sprite;
        this._duration = Math.max(this._duration, 1.2);
        await this.add(
            flash(this, { size: s * 4.5, life: 0.2 }),
            createLayer(this, {
                sprite,
                burst: 26,
                life: [0.5, 0.9],
                size: [s * 0.9, s * 1.5],
                speed: [s * 1, s * 2.6],
                rotation: true,
                spin: [-1, 1],
                direction: UP,
                shape: { type: "hemisphere", radius: s * 0.3 },
                speedOverLife: [1, 0.4, 0.2, 0.1],
                sizeOverLife: "swell",
                color: [[0, "core", 1], [0.12, "start", 1], [0.45, "end", 0.8], [1, "edge", 0]],
            }),
            sparks(this, { direction: UP, burst: 40, size: [s * 0.08, s * 0.16], speed: [s * 3, s * 8], life: [0.5, 1.1], shape: { type: "cone", radius: s * 0.2, angle: Math.PI / 2.6 } }),
            debris(this, { burst: 22, size: [s * 0.1, s * 0.24], speed: [s * 2, s * 5], life: [0.9, 1.4], collide: floor, bounce: 0.25, shape: { type: "cone", radius: s * 0.3, angle: Math.PI / 3 }, color: [[0, "spark", 1], [0.25, "smoke", 1], [0.9, "smoke", 1], [1, "smoke", 0]] }),
            smokePuff(this, { rate: 0, burst: 14, delay: 0.1, life: [2, 3.2], size: [s * 1, s * 1.8], speed: [s * 0.6, s * 1.4], speedOverLife: [1, 0.3, 0.1, 0], force: [0, s * 0.4, 0], position: [0, ground + s * 0.15, 0], shape: { type: "hemisphere", radius: s * 0.5 }, aim: "up", color: SOOT }),
            smokePuff(this, { rate: 0, burst: 12, life: [1.2, 2], size: [s * 0.6, s * 1.1], speed: [s * 2, s * 3], speedOverLife: [1, 0.15, 0.05, 0], position: [0, ground + s * 0.08, 0], shape: { type: "circle", radius: s * 0.4 }, color: [[0, "ash", 0], [0.08, "ash", 0.6], [1, "smoke", 0]] }),
            groundRing(this, { size: s * 5, life: 0.6, position: [0, ground + s * 0.03, 0] }),
        );
        groundMark(this, { position: this._target.clone().setY(floor), size: s * 2.6, color: this.palette.core, blending: "additive", opacity: 0.8, life: 2.5 });
        groundMark(this, { position: this._target.clone().setY(floor), size: s * 2.8, opacity: 0.8, life: 10 });
        this.emitLight({ intensity: effectLightIntensity(3), distance: s * 10, duration: 0.8, curve: "flash" });
        this.shake(0.9, 0.6);
    }
}

registerEffects("explosions", {
    contactspark: ContactSpark,
    hitpuff: HitPuff,
    iceshatter: IceShatter,
    splash: Splash,
    flaskshatter: FlaskShatter,
    rockimpact: RockImpact,
    meteorimpact: MeteorImpact,
});
