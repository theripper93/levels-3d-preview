import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { factor } from "../../main.js";
import { registerEffects } from "../registry.js";
import { ParticleSystem } from "../base/quarks.js";
import { BurstEffect } from "../base/BurstEffect.js";
import { createLayer, flash, sparks, smokePuff, groundRing, embers, ORDER } from "../layers/index.js";
import { Beam, Bolt, ShockRing, Strip, addPrimitive, updatePrimitives, groundGlow, scorch, shockwave, spriteQuad } from "../primitives/index.js";
import { useColorsIfDefault } from "./kit.js";

const UP = new THREE.Vector3(0, 1, 0);
const ROCKS = ["modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_4.glb", "modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_3.glb"];
const DEFAULT_SIGN = "modules/levels-3d-preview/assets/particles/magiccircles/magic_circle_01.webp";
const SUMMON_CIRCLE = "modules/levels-3d-preview/assets/particles/magiccircles/magic_circle_07.webp";

export class StagedBurst extends BurstEffect {
    get customSprite() {
        return this.params.sprite !== this.defaultSettings.sprite ? this.params.sprite : null;
    }

    get ground() {
        return this._targetBottom.y - this.emitter.position.y + this.params.scale.start * 0.02;
    }

    orbit(speed, axis = UP) {
        return new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(speed), axis);
    }

    beam(options) {
        const beam = addPrimitive(this, new Beam(options));
        beam.baseWidth = beam.width;
        beam.baseOpacity = beam.opacity;
        return beam;
    }

    ring({ position = new THREE.Vector3(), ...options }, delay = 0) {
        const lifted = position.clone().setY(position.y + Math.max(this.params.scale.start * 0.06, 0.01));
        this.at(delay, () => addPrimitive(this, new ShockRing({ position: lifted, intensity: 1.4, ...options })));
    }

    animate(delta) {
        this.stage?.(this._age, delta);
        updatePrimitives(this, delta);
        super.animate(delta);
    }
}

export class FireExplosion extends StagedBurst {
    async build() {
        const s = this.params.scale.start;
        const radius = Math.max(this.params.emitterSize, s * 0.1);
        const speed = this.params.force / 30;
        const count = this.params.rate.particles;
        const sprite = this.customSprite ?? "fire";
        const ground = this.ground;
        this._duration = Math.max(this._duration, 0.5);
        await this.add(
            flash(this, { size: s * 3 }),
            createLayer(this, {
                sprite,
                burst: count * 2,
                life: [this.params.life.min * 2, this.params.life.max * 2],
                size: [s, s * 1.6],
                speed: [speed * 0.3, speed],
                rotation: true,
                spin: [-1, 1],
                shape: { type: "sphere", radius },
                force: this.userForce,
                speedOverLife: [1, 0.4, 0.2, 0.1],
                sizeOverLife: "swell",
                color: [
                    [0, "core", this.params.alpha.start],
                    [0.12, "start", this.params.alpha.start],
                    [0.45, "end", 0.8 * this.params.alpha.end],
                    [1, "edge", 0],
                ],
            }),
            sparks(this, { burst: count, shape: { type: "sphere", radius: s * 0.1 }, speed: [speed, speed * 3] }),
            smokePuff(this, { rate: 0, burst: Math.ceil(count / 3), delay: 0.08, shape: { type: "sphere", radius } }),
            groundRing(this, { position: [0, ground, 0] }),
        );
        const floor = new THREE.Vector3(0, ground, 0);
        groundGlow(this, { position: floor, size: s * 5, depth: s * 3, color: this.palette.glow, life: 0.9, fadeIn: 0.03, fadeOut: 0.7 });
        scorch(this, { position: floor, size: s * 2.6, depth: s * 0.8 });
        shockwave(this, { position: new THREE.Vector3(0, s * 0.2, 0), size: s * 5 });
        this.emitLight({ intensity: 12, distance: s * 12, duration: 0.5, curve: "flash" });
        this.shake(0.35, 0.35);
    }
}

export class EarthExplosion extends StagedBurst {
    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 4,
        };
    }

    get anchor() {
        return this._targetBottom;
    }

    async rockLayer(path, count, s) {
        if (!game.modules.get("canvas3dcompendium")?.active) return null;
        try {
            const mesh = await this.getMesh(path);
            const system = new ParticleSystem({
                duration: 0.1,
                looping: false,
                instancingGeometry: mesh.geometry,
                startLife: new QUARKS.IntervalValue(this.params.life.min * 2 + 0.6, this.params.life.max * 2 + 0.9),
                startSpeed: new QUARKS.IntervalValue(s * 2, s * 5),
                startSize: new QUARKS.IntervalValue(s * 0.08, s * 0.25),
                startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
                startRotation: new QUARKS.EulerGenerator(new QUARKS.IntervalValue(-Math.PI, Math.PI), new QUARKS.IntervalValue(0, Math.PI * 2), new QUARKS.ConstantValue(0)),
                worldSpace: true,
                emissionBursts: [{ time: 0, count, cycle: 1, interval: 0.01, probability: 1 }],
                shape: new QUARKS.ConeEmitter({ radius: s * 0.3, angle: Math.PI / 5 }),
                material: mesh.material,
                renderOrder: ORDER.body,
                renderMode: QUARKS.RenderMode.Mesh,
                behaviors: [new QUARKS.ApplyForce(new THREE.Vector3(0, -1, 0), new QUARKS.ConstantValue(s * 12)), new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 1, 1, 0), 0]])), new QUARKS.ApplyCollision({ resolve: (position, normal) => position.y <= this.emitter.position.y && !!normal.set(0, 1, 0) }, 0.3)],
            });
            system.emitter.rotation.x = -Math.PI / 2;
            return system;
        } catch {
            return null;
        }
    }

    async build() {
        useColorsIfDefault(this, "#c9a477", "#6b5038");
        const s = this.params.scale.start;
        const count = this.params.rate.particles;
        const ground = s * 0.02;
        this._duration = Math.max(this._duration, 0.6);
        await this.add(
            flash(this, { sprite: "scorch_03", size: s * 1.6, life: 0.16, position: [0, s * 0.2, 0], color: ["core", "start", 0.6, 0] }),
            ...ROCKS.map((path) => this.rockLayer(path, Math.ceil(count * 1.5), s)),
            createLayer(this, { sprite: "debris_2x2", blend: "normal", burst: count * 3, life: [0.6, 1.2], size: [s * 0.04, s * 0.12], speed: [s * 2, s * 6], rotation: true, spin: [-8, 8], shape: { type: "cone", radius: s * 0.3, angle: Math.PI / 4 }, aim: "up", gravity: s * 14, collide: this.emitter.position.y, bounce: 0.3, color: [[0, "ash", 1], [0.85, "smoke", 1], [1, "smoke", 0]], soft: false }),
            createLayer(this, { sprite: "dirt", blend: "normal", burst: Math.ceil(count / 2), life: [0.5, 0.9], size: [s * 0.5, s * 0.9], speed: [s * 1.5, s * 3], rotation: true, shape: { type: "cone", radius: s * 0.2, angle: Math.PI / 6 }, aim: "up", gravity: s * 8, sizeOverLife: "grow", color: [[0, "ash", 0], [0.1, "ash", 1], [0.7, "smoke", 0.8], [1, "smoke", 0]] }),
            smokePuff(this, { rate: 0, burst: Math.ceil(count * 0.8), life: [1.4, 2.4], size: [s * 0.6, s * 1.1], speed: [s * 0.8, s * 1.6], shape: { type: "circle", radius: s * 0.4 }, aim: "up", speedOverLife: [1, 0.3, 0.1, 0.05], force: [0, s * 0.15, 0], position: [0, ground, 0], color: [[0, "ash", 0], [0.15, "ash", 0.55], [0.6, "smoke", 0.3], [1, "smoke", 0]] }),
            groundRing(this, { sprite: "smoke_10", blend: "normal", size: s * 4, life: 0.9, position: [0, ground, 0], color: [[0, "ash", 0.6], [1, "smoke", 0]] }),
        );
        scorch(this, { position: new THREE.Vector3(0, ground, 0), size: s * 3, depth: s, opacity: 0.85, life: 8 });
        this.shake(0.55, 0.45);
    }
}

export class Lightning extends StagedBurst {
    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.85,
            emitterSize: 1,
        };
    }

    get anchor() {
        return this._targetBottom;
    }

    async build() {
        useColorsIfDefault(this, "#9fd4ff", "#4f7dff");
        const s = this.params.scale.start;
        const p = this.palette;
        const height = s * 10 + 1;
        const ground = s * 0.02;
        this._duration = Math.max(this._duration, 0.5);
        const top = new THREE.Vector3((Math.random() - 0.5) * height * 0.3, height, (Math.random() - 0.5) * height * 0.3);
        const bottom = new THREE.Vector3(0, ground, 0);
        this.bolt = addPrimitive(this, new Bolt({ start: top, end: bottom, depth: 6, jitter: 0.2, branches: 6, branchLength: 0.3, core: p.white, glow: p.glow, width: s * 1.3, coreWidth: 0.1, glowPower: 4, head: 0, soft: s * 0.3 }));
        const rate = this.params.rate.particles;
        await this.add(
            flash(this, { sprite: "emberssmall", size: s * 4, life: 0.25, color: ["white", "glow", 0.9, 0] }),
            flash(this, { sprite: "star_09", size: s * 2.4, life: 0.15, position: [0, s * 0.3, 0] }),
            groundRing(this, { size: s * 5, life: 0.4, position: [0, ground, 0], color: ["white", "glow", 0.9, 0] }),
            sparks(this, { burst: rate * 2, shape: { type: "hemisphere", radius: s * 0.1 }, speed: [s * 3, s * 9], size: [s * 0.04, s * 0.09], aim: "up", collide: this.emitter.position.y, bounce: 0.4 }),
            createLayer(this, { sprite: "spark_arc", burst: [{ count: 3 }, { count: 3, time: 0.12 }, { count: 2, time: 0.25 }], life: 0.1, size: [s * 1.2, s * 2], rotation: true, shape: { type: "circle", radius: s * 0.6 }, aim: "up", position: [0, s * 0.3, 0], color: ["white", "glow", 1, 0], order: ORDER.sparks }),
            smokePuff(this, { rate: 0, burst: 5, delay: 0.1, life: [0.9, 1.4], size: [s * 0.5, s * 0.8], shape: { type: "circle", radius: s * 0.3 }, aim: "up", position: [0, ground, 0] }),
        );
        groundGlow(this, { position: bottom, size: s * 6, depth: s * 3, color: p.glow, life: 0.8, fadeIn: 0.02, fadeOut: 0.6 });
        scorch(this, { position: bottom, size: s * 2.4, depth: s * 0.8, opacity: 0.8 });
        this.emitLight({ intensity: 20, distance: Math.min(s * 16, 3), duration: 0.45, curve: [1, 0.3, 0.8, 0] });
        this.shake(0.4, 0.3);
    }

    stage(t) {
        const head = Math.min(1.05, t / 0.06);
        const fade = Math.clamp((t - 0.28) / 0.17, 0, 1);
        const flicker = t < 0.3 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 90)) : 1;
        this.bolt.head = head;
        this.bolt.intensity = flicker;
        this.bolt.opacity = 1 - fade;
        if (!this._restruck && t > 0.13) {
            this._restruck = true;
            this.bolt.strike();
        }
    }
}

export class SlashParticle extends StagedBurst {
    autoSize() {
        const token = [this.to, this.from].find((t) => t instanceof foundry.canvas.placeables.Token);
        if (!token) return;
        const size = Math.max(token.document.width, token.document.height) * (canvas.grid.size / factor);
        this.params.emitterSize = 0.7 * size;
        if (!this.params.autoSize) return;
        this.params.scale.start = 0.35 * size;
    }

    get anchor() {
        return this.to instanceof foundry.canvas.placeables.Token && !this.params.impactPoint ? this._originalCenter : this._target;
    }

    arc(radius, sweep) {
        const points = [];
        for (let i = 0; i <= 40; i++) {
            const a = sweep / 2 - (sweep * i) / 40;
            const r = radius * (1 - 0.08 * Math.sin((Math.PI * i) / 40));
            points.push(new THREE.Vector3(Math.cos(a) * r - radius * 0.85, Math.sin(a) * r, 0));
        }
        return points;
    }

    async build() {
        const s = this.params.scale.start;
        const p = this.palette;
        const radius = Math.max(this.params.emitterSize * 1.4, s * 0.8);
        const toward = this._origin ? this._origin.clone().sub(this._target).setY(0).normalize() : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        this._duration = Math.max(this._duration, 0.65);
        this.swing = new THREE.Group();
        const view = game.Levels3DPreview.camera.position.clone().sub(this.anchor).normalize();
        this.swing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toward.clone().lerp(view, 0.85).lerp(UP, 0.1).normalize());
        this.swing.rotateZ((Math.random() > 0.5 ? Math.PI : 0) + Math.sign(Math.random() - 0.5) * (Math.PI / 4 + (Math.random() - 0.5) * 0.6));
        this.swing.position.copy(toward).multiplyScalar(radius * 0.15);
        this.emitter.add(this.swing);
        const points = this.arc(radius * 1.5, Math.PI * 0.62);
        const widths = (t) => Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.6;
        const strokes = [
            { core: p.black, glow: p.black, blending: "normal", width: radius * 0.5, coreWidth: 0.5, glowPower: 1.4, opacity: 0.4, renderOrder: 5 },
            { core: p.glow, glow: p.mid, width: radius * 0.55, coreWidth: 0.12, glowPower: 1.6, noise: 0.7, opacity: 0.9, renderOrder: 6 },
            { core: p.white, glow: p.core, width: radius * 0.2, coreWidth: 0.55, glowPower: 1, intensity: 2, renderOrder: 7 },
        ];
        this.strokes = strokes.map((options) => {
            const stroke = addPrimitive(this, new Strip({ noise: 0.35, scroll: 6, frequency: 6, head: 0, tail: 0.8, taper: 1, ...options }), this.swing);
            stroke.baseOpacity = stroke.opacity;
            stroke.baseWidth = stroke.width;
            return stroke.setLines([{ points, widths }]);
        });
        const hit = points[Math.floor(points.length * 0.5)].clone().applyQuaternion(this.swing.quaternion).add(this.swing.position);
        const tangent = points[24].clone().sub(points[18]).applyQuaternion(this.swing.quaternion).normalize();
        await this.add(
            flash(this, { sprite: "star_07", size: s * 2.4, life: 0.2, delay: 0.08, position: hit }),
            flash(this, { sprite: "emberssmall", size: s * 3, life: 0.3, delay: 0.08, position: hit, color: ["glow", "start", 0.6, 0] }),
            sparks(this, { burst: this.params.rate.particles * 2, delay: 0.08, direction: tangent.lerp(UP, 0.25), position: hit, size: [s * 0.04, s * 0.09], speed: [s * 3, s * 8], life: [0.25, 0.55], shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 4 } }),
        );
        this.shake(0.2, 0.2);
    }

    stage(t) {
        const head = Math.min(1.08, (t / 0.16) ** 0.8);
        const fade = Math.clamp((t - 0.22) / 0.38, 0, 1);
        for (const stroke of this.strokes) {
            stroke.head = head;
            stroke.tail = 0.8 + fade * 0.35;
            stroke.opacity = stroke.baseOpacity * (1 - fade) ** 1.5;
            stroke.width = stroke.baseWidth * (1 - fade * 0.5);
        }
    }
}

export class MagicBurst extends StagedBurst {
    async build() {
        const s = this.params.scale.start;
        const rate = this.params.rate.particles;
        const radius = Math.max(this.params.emitterSize * 0.1, s * 0.3);
        this._duration = Math.max(this._duration, 0.5);
        await this.add(
            flash(this, { sprite: "magic_05", size: s * 3.2, life: 0.22 }),
            flash(this, { sprite: "light_03", size: s * 2.4, life: 0.35, color: ["glow", "start", 0.8, 0] }),
            createLayer(this, { sprite: "flame2x2", burst: rate * 4, life: [this.params.life.min * 2 + 0.3, this.params.life.max * 2 + 0.4], size: [s * 0.35, s * 0.7], speed: [s * 1.2, s * 2.5], rotation: true, spin: [-2, 2], shape: { type: "sphere", radius }, speedOverLife: [1, 0.3, 0.1, 0], sizeOverLife: "shrink", force: this.userForce, world: false, behaviors: [this.orbit(5)], color: [[0, "core", 0], [0.1, "glow", this.params.alpha.start], [0.6, "start", 0.7], [1, "end", 0]] }),
            createLayer(this, { sprite: "spiral_5", mode: "horizontal", world: false, burst: 1, life: 0.6, size: s * 4, rotation: true, spin: 2, color: ["glow", "end", 0.8, 0], sizeOverLife: [0.2, 0.8, 1, 1.05], order: ORDER.glow }),
            createLayer(this, { sprite: "star", burst: rate * 2, life: [0.6, 1.1], size: [s * 0.08, s * 0.18], speed: [s * 1.5, s * 4], rotation: true, shape: { type: "sphere", radius: s * 0.2 }, speedOverLife: [1, 0.25, 0.1, 0.05], force: [0, s * 0.4, 0], color: [[0, "white", 1], [0.4, "spark", 1], [1, "end", 0]], sizeOverLife: "shrink", order: ORDER.sparks }),
            embers(this, { rate: 0, burst: rate, delay: 0.1, life: [0.8, 1.4], shape: { type: "sphere", radius: s * 0.5 } }),
        );
        groundGlow(this, { position: new THREE.Vector3(0, this.ground, 0), size: s * 4.5, depth: s * 4, life: 0.8, fadeIn: 0.03, fadeOut: 0.6 });
        this.emitLight({ intensity: 10, distance: s * 10, duration: 0.5, curve: "flash" });
    }
}

export class StarBurst extends StagedBurst {
    async build() {
        const s = this.params.scale.start;
        const size = Math.max(this.params.emitterSize, s * 2);
        const rate = this.params.rate.particles;
        this._duration = Math.max(this._duration, 0.6);
        await this.add(
            createLayer(this, { sprite: "star_07", world: false, burst: 1, life: 0.7, size: size * 1.4, spin: 0.6, color: [[0, "white", 1], [0.3, "glow", 0.9], [1, "start", 0]], sizeOverLife: [0, 1.2, 1, 0.4], order: ORDER.glow }),
            createLayer(this, { sprite: "star_06", world: false, burst: 1, life: 0.45, size: size, rotation: Math.PI / 4, spin: -0.8, color: ["white", "glow", 0.8, 0], sizeOverLife: "pop", order: ORDER.glow }),
            flash(this, { sprite: "emberssmall", size: size * 1.2, life: 0.4, color: ["glow", "start", 0.7, 0] }),
            createLayer(this, { sprite: "star_08", burst: rate * 3, life: [0.7, 1.2], size: [s * 0.15, s * 0.3], speed: [size * 0.8, size * 1.6], rotation: true, spin: [-3, 3], shape: { type: "circle", radius: s * 0.05 }, aim: "up", speedOverLife: [1, 0.2, 0.05, 0], world: false, behaviors: [this.orbit(1.5)], color: [[0, "white", 1], [0.3, "spark", 1], [1, "end", 0]], sizeOverLife: "shrink", order: ORDER.sparks }),
            createLayer(this, { sprite: "star", burst: rate * 2, delay: 0.1, life: [0.8, 1.5], size: [s * 0.06, s * 0.16], rotation: true, shape: { type: "sphere", radius: size * 0.5 }, force: [0, s * 0.2, 0], color: [[0, "white", 0], [0.2, "spark", 1], [0.5, "glow", 0.3], [0.7, "spark", 1], [1, "end", 0]], order: ORDER.sparks }),
        );
        groundGlow(this, { position: new THREE.Vector3(0, this.ground, 0), size: size * 2, depth: size * 1.5, life: 0.9, fadeIn: 0.05, fadeOut: 0.6 });
        this.emitLight({ intensity: 10, distance: s * 10, duration: 0.6, curve: "flash" });
    }
}

export class CastingSign extends StagedBurst {
    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.85,
            emitterSize: 4,
            preferSource: true,
        };
    }

    get anchor() {
        return this._originBottom ?? this._targetBottom;
    }

    async build() {
        const s = this.params.scale.start;
        const sign = await spriteQuad(this, this.customSprite ?? DEFAULT_SIGN, { horizontal: true, color: this.palette.glow });
        const videoDuration = sign.material.map?.image?.duration;
        this.animated = !!videoDuration;
        if (videoDuration) this._duration = videoDuration;
        else {
            this._duration = Math.max(this._duration, 0.9);
            sign.material.color.copy(this.palette.start).lerp(this.palette.white, 0.25);
        }
        sign.position.y = Math.max(s * 0.08, 0.012);
        sign.scale.setScalar(0.0001);
        this.sign = sign;
        this.signSize = s;
        this.total = this._duration;
        const rate = this.params.rate.particles;
        await this.add(
            createLayer(this, { sprite: "emberssmall", rate: rate * 2, life: [0.5, 1], size: [s * 0.02, s * 0.05], speed: [s * 0.2, s * 0.6], shape: { type: "circle", radius: s * 0.45 }, aim: "up", force: [0, s * 0.6, 0], color: [[0, "spark", 0], [0.2, "spark", 1], [1, "glow", 0]], sizeOverLife: "shrink", order: ORDER.sparks }),
            groundRing(this, { sprite: "circle_02", size: s * 1.2, life: 0.45, position: [0, s * 0.04, 0], sizeOverLife: [0.6, 1, 1, 1.05], color: ["white", "glow", 0.8, 0] }),
        );
        groundGlow(this, { position: new THREE.Vector3(0, s * 0.02, 0), size: s * 1.5, depth: s * 1.2, color: this.palette.glow, opacity: 0.8, life: this._duration, fadeIn: Math.min(0.2, this._duration * 0.3), fadeOut: Math.min(0.3, this._duration * 0.4) });
        this.emitLight({ intensity: 5, distance: s * 6, duration: this._duration, curve: [0, 1, 1, 0] });
    }

    stage(t, delta) {
        const p = Math.min(1, t / this.total);
        const size = this.animated ? 1 : p < 0.12 ? 1.5 * (1 - (1 - p / 0.12) ** 3) : p < 0.85 ? 1.5 : 1.5 * (1 - (p - 0.85) / 0.15) ** 2;
        this.sign.scale.setScalar(Math.max(0.0001, this.signSize * size));
        this.sign.rotateZ(delta * this.params.speed * 0.15);
        this.sign.material.opacity = this.animated ? 1 : 0.85 + 0.15 * Math.sin(t * 8);
    }
}

export class JB2AExplosion extends StagedBurst {
    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 4,
        };
    }

    get lit() {
        return true;
    }

    async build() {
        const s = this.params.scale.start;
        if (!this.customSprite) {
            await this.add(createLayer(this, { sprite: "toon_spike_burst", frames: "animate", world: false, burst: 1, life: 0.5, size: s, rotation: true, color: ["white", "glow", 1, 0.6] }));
            this._duration = Math.max(this._duration, 0.5);
        } else {
            const material = await this.getBasicMaterial(null, THREE.AdditiveBlending);
            const videoDuration = material.map?.image?.duration;
            if (videoDuration) this._duration = videoDuration;
            const system = new ParticleSystem({
                duration: 1,
                looping: false,
                startLife: new QUARKS.ConstantValue(this._duration),
                startSpeed: new QUARKS.ConstantValue(0),
                startSize: new QUARKS.ConstantValue(s),
                startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
                startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
                worldSpace: false,
                emissionBursts: [{ time: 0.01, count: 1, cycle: 1, interval: 0, probability: 1 }],
                shape: new QUARKS.PointEmitter(),
                material,
                renderOrder: ORDER.body,
                renderMode: QUARKS.RenderMode.BillBoard,
            });
            await this.add(system);
        }
        if (!this.lit) return;
        groundGlow(this, { position: new THREE.Vector3(0, this.ground, 0), size: s * 1.4, depth: s, color: this.palette.glow, opacity: 0.8, life: Math.max(0.5, this._duration * 0.7), fadeIn: 0.05, fadeOut: 0.4 });
        this.emitLight({ duration: Math.max(0.3, this._duration * 0.6), intensity: 10, distance: s * 4, curve: "flash" });
        this.shake(0.25, 0.25);
    }
}

export class JB2AExplosionNoLight extends JB2AExplosion {
    get lit() {
        return false;
    }
}

export class SkyPillar extends StagedBurst {
    get anchor() {
        return this._targetBottom;
    }

    async build() {
        useColorsIfDefault(this, "#fff4c2", "#ffc23a");
        const s = this.params.scale.start;
        const p = this.palette;
        const rate = this.params.rate.particles;
        const height = s * 14 + 1;
        const floor = new THREE.Vector3(0, s * 0.02, 0);
        this._duration = Math.max(this._duration, 1.6);
        this.total = this._duration;
        const column = { start: new THREE.Vector3(0, height, 0), end: floor, segments: 8, head: 0, soft: s * 0.6 };
        this.pillars = [
            this.beam({ ...column, core: p.white, glow: p.core, width: s * 0.6, coreWidth: 0.35, glowPower: 1.4, noise: 0.35, scroll: -3, frequency: height / s / 2, opacity: 0.85 }),
            this.beam({ ...column, core: p.glow, glow: p.start, width: s * 2.2, coreWidth: 0.08, glowPower: 2.6, noise: 0.8, scroll: -1.5, frequency: height / s / 3, opacity: 0.45 }),
        ];
        const hit = { delay: 0.12 };
        await this.add(
            flash(this, { sprite: "emberssmall", size: s * 5, life: 0.4, position: [0, s * 0.3, 0], color: ["white", "glow", 0.8, 0], ...hit }),
            groundRing(this, { size: s * 6, life: 0.6, position: floor, color: ["white", "glow", 0.9, 0], ...hit }),
            sparks(this, { burst: rate * 2, shape: { type: "hemisphere", radius: s * 0.2 }, aim: "up", speed: [s * 2, s * 6], size: [s * 0.04, s * 0.09], ...hit }),
            embers(this, { rate: rate * 2, life: [1, 1.8], size: [s * 0.05, s * 0.1], speed: [s * 0.5, s * 1.5], shape: { type: "circle", radius: s * 0.9 }, force: [0, s * 1.2, 0], ...hit }),
        );
        this.ring({ position: floor, radius: s * 3.5, life: 0.6, width: s * 0.3, core: p.white, glow: p.glow }, 0.12);
        groundGlow(this, { position: floor, size: s * 5, depth: s * 3, life: this.total, fadeIn: 0.15, fadeOut: 0.5 });
        this.emitLight({ intensity: 9, distance: s * 12, duration: this.total, delay: 0.1, curve: [1, 0.7, 0.7, 0] });
        this.at(0.12, () => this.shake(0.25, 0.3));
    }

    stage(t) {
        const head = Math.min(1.02, t / 0.12);
        const fade = Math.clamp((t - this.total + 0.5) / 0.5, 0, 1);
        for (const beam of this.pillars) {
            beam.head = head;
            beam.width = beam.baseWidth * (1 - fade * 0.85) * (1 + 0.05 * Math.sin(t * 31));
            beam.opacity = beam.baseOpacity * (1 - fade);
        }
    }
}

export class IceNova extends StagedBurst {
    async build() {
        useColorsIfDefault(this, "#d8f6ff", "#4aa8ff");
        const s = this.params.scale.start;
        const p = this.palette;
        const rate = this.params.rate.particles;
        const floor = new THREE.Vector3(0, this.ground, 0);
        this._duration = Math.max(this._duration, 1.2);
        await this.add(
            flash(this, { size: s * 3 }),
            flash(this, { sprite: "emberssmall", size: s * 5, life: 0.35, color: ["white", "glow", 0.8, 0] }),
            createLayer(this, { sprite: "star_04", burst: rate * 3, life: [0.5, 0.9], size: [s * 0.15, s * 0.35], speed: [s * 4, s * 8], rotation: true, spin: [-8, 8], shape: { type: "circle", radius: s * 0.2 }, aim: "up", position: [0, floor.y + s * 0.15, 0], speedOverLife: [1, 0.3, 0.1, 0.05], gravity: s * 2, color: [[0, "white", 1], [0.5, "glow", 1], [1, "end", 0]], order: ORDER.sparks }),
            sparks(this, { burst: rate * 2, shape: { type: "circle", radius: s * 0.2 }, aim: "up", position: [0, floor.y + s * 0.1, 0], speed: [s * 5, s * 10], gravity: s * 2, color: [[0, "white", 1], [0.4, "core", 1], [1, "glow", 0]] }),
            smokePuff(this, { burst: Math.ceil(rate * 1.5), rate: 0, life: [1.2, 2], size: [s * 0.6, s * 1.1], speed: [s * 2, s * 4], shape: { type: "circle", radius: s * 0.3 }, aim: "up", position: [0, floor.y + s * 0.1, 0], speedOverLife: [1, 0.2, 0.05, 0], force: [0, s * 0.1, 0], color: [[0, "core", 0], [0.15, "core", 0.5], [1, "glow", 0]] }),
            groundRing(this, { size: s * 7, life: 0.6, position: floor, color: ["white", "glow", 0.9, 0] }),
        );
        this.ring({ position: floor, radius: s * 3.5, life: 0.5, width: s * 0.35, core: p.white, glow: p.glow });
        groundGlow(this, { position: floor, size: s * 7, depth: s * 3, life: 0.8, fadeIn: 0.03, fadeOut: 0.6 });
        groundGlow(this, { position: floor, size: s * 6, depth: s * 2, color: p.core, blending: "normal", opacity: 0.6, falloff: 1.4, life: 5, fadeIn: 0.25, fadeOut: 3 });
        shockwave(this, { position: new THREE.Vector3(0, floor.y + s * 0.2, 0), size: s * 7 });
        this.emitLight({ intensity: 10, distance: s * 12, duration: 0.6, curve: "flash" });
        this.shake(0.3, 0.3);
    }
}

export class Thunderwave extends StagedBurst {
    async build() {
        useColorsIfDefault(this, "#d6ecff", "#5d7dff");
        const s = this.params.scale.start;
        const p = this.palette;
        const rate = this.params.rate.particles;
        const floor = new THREE.Vector3(0, this.ground, 0);
        this._duration = Math.max(this._duration, 1);
        await this.add(
            flash(this, { sprite: "emberssmall", size: s * 6, life: 0.3, color: ["white", "glow", 0.9, 0] }),
            createLayer(this, { sprite: "dirt", blend: "normal", burst: rate * 2, life: [0.6, 1.1], size: [s * 0.4, s * 0.8], speed: [s * 3, s * 6], rotation: true, spin: [-2, 2], shape: { type: "circle", radius: s * 0.3 }, aim: "up", position: [0, floor.y + s * 0.05, 0], speedOverLife: [1, 0.25, 0.08, 0], sizeOverLife: "grow", color: [[0, "ash", 0], [0.1, "ash", 0.7], [1, "smoke", 0]], order: ORDER.smoke }),
            createLayer(this, { sprite: "spark_arc", burst: [{ count: 4 }, { count: 3, time: 0.1 }], life: 0.12, size: [s * 1, s * 1.8], rotation: true, shape: { type: "sphere", radius: s * 1.2 }, color: ["white", "glow", 1, 0], order: ORDER.sparks }),
            sparks(this, { burst: rate * 2, shape: { type: "sphere", radius: s * 0.3 }, speed: [s * 4, s * 9], gravity: s * 3 }),
            groundRing(this, { sprite: "smoke_10", blend: "normal", size: s * 7, life: 0.8, position: floor, color: [[0, "ash", 0.6], [1, "smoke", 0]] }),
        );
        this.ring({ position: floor, radius: s * 4.5, life: 0.45, width: s * 0.45, core: p.white, glow: p.glow });
        this.ring({ position: new THREE.Vector3(0, floor.y + s * 0.5, 0), radius: s * 3.5, life: 0.4, width: s * 0.25, core: p.white, glow: p.glow }, 0.06);
        this.ring({ position: new THREE.Vector3(0, floor.y + s * 1, 0), radius: s * 2.5, life: 0.35, width: s * 0.15, core: p.white, glow: p.glow }, 0.12);
        groundGlow(this, { position: floor, size: s * 8, depth: s * 4, life: 0.6, fadeIn: 0.02, fadeOut: 0.5 });
        shockwave(this, { position: new THREE.Vector3(0, floor.y + s * 0.3, 0), size: s * 9, strength: 0.1, life: 0.5 });
        this.emitLight({ intensity: 14, distance: s * 14, duration: 0.4, curve: "flash" });
        this.shake(0.6, 0.45);
    }
}

export class HealBurst extends StagedBurst {
    get anchor() {
        return this._targetBottom;
    }

    async build() {
        useColorsIfDefault(this, "#6dff8a", "#fff08a");
        const s = this.params.scale.start;
        const p = this.palette;
        const rate = this.params.rate.particles;
        const floor = new THREE.Vector3(0, Math.max(s * 0.08, 0.012), 0);
        this._duration = Math.max(this._duration, 1.5);
        this.total = this._duration;
        this.column = this.beam({ start: new THREE.Vector3(0, s * 3, 0), end: floor, segments: 6, soft: s * 0.6, core: p.glow, glow: p.start, width: s * 1.6, coreWidth: 0.02, glowPower: 3, noise: 0.9, scroll: -1.5, frequency: 2, opacity: 0, taper: 1 });
        await this.add(
            flash(this, { sprite: "emberssmall", size: s * 4, life: 0.6, position: [0, s * 0.8, 0], color: ["white", "glow", 0.5, 0] }),
            createLayer(this, { sprite: "spiral_5", mode: "horizontal", world: false, burst: 1, life: 1, size: s * 4, rotation: true, spin: 1.5, position: floor, color: [[0, "glow", 0], [0.2, "glow", 0.7], [1, "end", 0]], sizeOverLife: [0.3, 0.8, 1, 1.05], order: ORDER.ground }),
            createLayer(this, { sprite: "emberssmall", world: false, burst: [{ count: rate * 2 }, { count: rate, time: 0.3 }], life: [1, 1.6], size: [s * 0.04, s * 0.09], speed: [s * 0.4, s * 1], shape: { type: "circle", radius: s * 0.7 }, aim: "up", force: [0, s * 1, 0], behaviors: [this.orbit(2)], color: [[0, "white", 0], [0.15, "spark", 1], [0.7, "glow", 0.8], [1, "end", 0]], sizeOverLife: "shrink", order: ORDER.sparks }),
            createLayer(this, { sprite: "star", burst: rate, delay: 0.15, life: [0.8, 1.3], size: [s * 0.08, s * 0.16], rotation: true, shape: { type: "sphere", radius: s * 0.8 }, position: [0, s * 0.8, 0], force: [0, s * 0.4, 0], color: [[0, "white", 0], [0.3, "white", 1], [0.6, "spark", 0.4], [0.8, "white", 1], [1, "end", 0]], order: ORDER.sparks }),
        );
        groundGlow(this, { position: floor, size: s * 4, depth: s * 3, life: this.total, fadeIn: 0.2, fadeOut: 0.8 });
        this.emitLight({ intensity: 6, distance: s * 8, duration: this.total, position: new THREE.Vector3(0, s, 0), curve: "pulse" });
    }

    stage(t) {
        const k = t / this.total;
        this.column.opacity = 0.4 * Math.sin(Math.PI * Math.min(1, k * 1.1));
        this.column.width = this.column.baseWidth * (0.7 + 0.3 * k);
    }
}

export class Smite extends StagedBurst {
    get anchor() {
        return this._targetBottom;
    }

    async build() {
        useColorsIfDefault(this, "#ffe27a", "#ff9a1f");
        const s = this.params.scale.start;
        const p = this.palette;
        const rate = this.params.rate.particles;
        const floor = new THREE.Vector3(0, s * 0.02, 0);
        this._duration = Math.max(this._duration, 0.9);
        const column = { start: new THREE.Vector3(0, s * 9, 0), end: floor, segments: 6, head: 0, soft: s * 0.5 };
        this.blades = [
            this.beam({ ...column, core: p.white, glow: p.core, width: s * 0.5, coreWidth: 0.45, glowPower: 1.2, noise: 0.2, scroll: -6, intensity: 1.5 }),
            this.beam({ ...column, core: p.glow, glow: p.start, width: s * 1.6, coreWidth: 0.1, glowPower: 2.4, noise: 0.7, scroll: -3, opacity: 0.7 }),
        ];
        const hit = { delay: 0.07 };
        await this.add(
            flash(this, { sprite: "star_09", size: s * 3, position: [0, s * 0.3, 0], ...hit }),
            flash(this, { sprite: "emberssmall", size: s * 5, life: 0.35, position: [0, s * 0.3, 0], color: ["white", "glow", 0.8, 0], ...hit }),
            groundRing(this, { size: s * 5, life: 0.5, position: floor, color: ["white", "glow", 0.9, 0], ...hit }),
            sparks(this, { burst: rate * 2, shape: { type: "hemisphere", radius: s * 0.15 }, aim: "up", speed: [s * 3, s * 8], collide: this.emitter.position.y, bounce: 0.35, ...hit }),
            embers(this, { rate: 0, burst: rate, life: [0.8, 1.4], shape: { type: "circle", radius: s * 0.6 }, delay: 0.12 }),
        );
        this.ring({ position: floor, radius: s * 2.8, life: 0.45, width: s * 0.3, core: p.white, glow: p.glow }, 0.07);
        groundGlow(this, { position: floor, size: s * 5, depth: s * 3, life: 0.8, fadeIn: 0.05, fadeOut: 0.6 });
        scorch(this, { position: floor, size: s * 2, depth: s * 0.8, opacity: 0.5, life: 4 });
        this.emitLight({ intensity: 14, distance: s * 12, duration: 0.6, delay: 0.05, curve: "flash" });
        this.at(0.07, () => this.shake(0.4, 0.3));
    }

    stage(t) {
        const head = Math.min(1.02, t / 0.07);
        const fade = Math.clamp((t - 0.2) / 0.25, 0, 1);
        for (const blade of this.blades) {
            blade.head = head;
            blade.tail = 1 - fade;
            blade.width = blade.baseWidth * (1 - fade * 0.6);
        }
    }
}

export class Teleport extends StagedBurst {
    get anchor() {
        return this._targetBottom;
    }

    async build() {
        useColorsIfDefault(this, "#c9b6ff", "#6a3dff");
        const s = this.params.scale.start;
        const p = this.palette;
        const rate = this.params.rate.particles;
        const floor = new THREE.Vector3(0, s * 0.02, 0);
        const pop = 0.6;
        this._duration = Math.max(this._duration, 1.1);
        this.pop = pop;
        this.column = this.beam({ start: floor, end: new THREE.Vector3(0, s * 4, 0), segments: 6, soft: s * 0.5, core: p.white, glow: p.glow, width: s * 1.6, coreWidth: 0.25, glowPower: 1.8, noise: 0.6, scroll: 4, frequency: 3, opacity: 0 });
        const middle = [0, s * 1.2, 0];
        await this.add(
            createLayer(this, { sprite: "emberssmall", world: false, burst: [{ count: rate }, { count: rate, time: 0.15 }, { count: rate, time: 0.3 }], life: 0.3, size: [s * 0.05, s * 0.1], speed: -s * 4, shape: { type: "sphere", radius: s * 1.2 }, position: middle, color: ["spark", "glow", 1, 0.6], order: ORDER.sparks }),
            createLayer(this, { sprite: "twirl_01", world: false, burst: [{ count: 6 }, { count: 6, time: 0.2 }], life: [0.5, 0.7], size: [s * 0.6, s], rotation: true, spin: [4, 7], shape: { type: "circle", radius: s * 0.6 }, aim: "up", force: [0, s * 2, 0], behaviors: [this.orbit(6)], color: [[0, "glow", 0], [0.3, "glow", 0.7], [1, "end", 0]], order: ORDER.glow }),
            flash(this, { sprite: "star_07", size: s * 3, life: 0.2, position: middle, delay: pop }),
            flash(this, { sprite: "emberssmall", size: s * 5, life: 0.4, position: middle, color: ["white", "glow", 0.8, 0], delay: pop }),
            sparks(this, { burst: rate * 2, shape: { type: "sphere", radius: s * 0.3 }, position: middle, speed: [s * 3, s * 7], gravity: s * 2, delay: pop }),
            smokePuff(this, { burst: 6, rate: 0, life: [0.8, 1.2], size: [s * 0.5, s * 0.9], shape: { type: "circle", radius: s * 0.5 }, aim: "up", position: floor, color: [[0, "edge", 0], [0.2, "edge", 0.4], [1, "smoke", 0]], delay: pop }),
        );
        this.ring({ position: floor, radius: s * 2.5, life: 0.4, width: s * 0.25, core: p.white, glow: p.glow }, pop);
        groundGlow(this, { position: floor, size: s * 3, depth: s * 3, pattern: "ring", width: 0.2, life: pop + 0.5, fadeIn: 0.2, fadeOut: 0.4 });
        this.emitLight({ intensity: 8, distance: s * 8, duration: pop + 0.4, position: new THREE.Vector3(0, s, 0), curve: [0.3, 0.6, 1, 0] });
    }

    stage(t) {
        const k = Math.min(1, t / this.pop);
        const after = Math.clamp((t - this.pop) / 0.15, 0, 1);
        this.column.opacity = k * (1 - after);
        this.column.width = this.column.baseWidth * (1 - k * 0.85) * (1 + after * 3);
        this.column.intensity = 1 + k;
    }
}

export class Summon extends StagedBurst {
    get anchor() {
        return this._targetBottom;
    }

    async build() {
        useColorsIfDefault(this, "#e08cff", "#7a2bff");
        const s = this.params.scale.start;
        const p = this.palette;
        const rate = this.params.rate.particles;
        const floor = new THREE.Vector3(0, Math.max(s * 0.08, 0.012), 0);
        const rise = 0.9;
        this._duration = Math.max(this._duration, 2);
        this.total = this._duration;
        this.rise = rise;
        this.circle = await spriteQuad(this, this.customSprite ?? SUMMON_CIRCLE, { horizontal: true, color: p.glow });
        this.circle.position.copy(floor);
        this.circle.scale.setScalar(0.0001);
        this.circleSize = s * 3;
        this.pillar = this.beam({ start: floor, end: new THREE.Vector3(0, s * 6, 0), segments: 6, soft: s * 0.5, core: p.white, glow: p.glow, width: s * 1.8, coreWidth: 0.2, glowPower: 2, noise: 0.7, scroll: 3, frequency: 3, head: 0, tail: 1, taper: 1 });
        await this.add(
            createLayer(this, { sprite: "emberssmall", rate: rate * 2, life: [0.8, 1.4], size: [s * 0.03, s * 0.07], speed: [s * 0.3, s * 0.8], shape: { type: "circle", radius: s * 1.3 }, aim: "up", force: [0, s * 1.2, 0], color: [[0, "spark", 0], [0.2, "spark", 1], [1, "glow", 0]], order: ORDER.sparks }),
            flash(this, { sprite: "emberssmall", size: s * 6, life: 0.5, position: [0, s, 0], color: ["white", "glow", 0.8, 0], delay: rise }),
            smokePuff(this, { burst: Math.ceil(rate * 1.2), rate: 0, life: [1.2, 2], size: [s * 0.8, s * 1.4], speed: [s * 1.5, s * 3], shape: { type: "circle", radius: s * 0.6 }, aim: "up", position: floor, speedOverLife: [1, 0.2, 0.05, 0], force: [0, s * 0.3, 0], color: [[0, "edge", 0], [0.15, "edge", 0.55], [0.6, "smoke", 0.35], [1, "smoke", 0]], delay: rise }),
            sparks(this, { burst: rate * 2, shape: { type: "circle", radius: s * 0.5 }, aim: "up", position: floor, speed: [s * 3, s * 7], delay: rise }),
        );
        this.ring({ position: floor, radius: s * 3, life: 0.5, width: s * 0.3, core: p.white, glow: p.glow }, rise);
        groundGlow(this, { position: floor, size: s * 4, depth: s * 3, life: this.total, fadeIn: 0.3, fadeOut: 0.6 });
        this.emitLight({ intensity: 8, distance: s * 10, duration: this.total, position: new THREE.Vector3(0, s, 0), curve: [0.3, 1, 0.6, 0] });
        this.at(rise, () => this.shake(0.3, 0.3));
    }

    stage(t, delta) {
        const grow = Math.min(1, t / 0.4);
        const fade = Math.clamp((t - this.total + 0.5) / 0.5, 0, 1);
        this.circle.scale.setScalar(Math.max(0.0001, this.circleSize * (1 - (1 - grow) ** 3) * (1 - fade * 0.3)));
        this.circle.rotateZ(delta * (t < this.rise ? 1.5 : 0.6));
        this.circle.material.opacity = (0.6 + 0.4 * Math.min(1, t / this.rise)) * (1 - fade);
        const burst = Math.clamp((t - this.rise) / 0.25, 0, 1);
        this.pillar.head = burst * 1.02;
        this.pillar.opacity = burst * (1 - Math.clamp((t - this.rise - 0.25) / 0.5, 0, 1));
    }
}

export class ShatterBurst extends StagedBurst {
    get anchor() {
        return this.to instanceof foundry.canvas.placeables.Token && !this.params.impactPoint ? this._originalCenter : this._target;
    }

    async build() {
        useColorsIfDefault(this, "#eef4ff", "#8fa8ff");
        const s = this.params.scale.start;
        const p = this.palette;
        const rate = this.params.rate.particles;
        this._duration = Math.max(this._duration, 0.9);
        await this.add(
            flash(this, { sprite: "star_09", size: s * 2.5, life: 0.12 }),
            flash(this, { sprite: "emberssmall", size: s * 4, life: 0.3, color: ["white", "glow", 0.7, 0] }),
            createLayer(this, { sprite: "star_04", burst: rate * 3, life: [0.6, 1.1], size: [s * 0.12, s * 0.28], speed: [s * 3, s * 7], rotation: true, spin: [-10, 10], shape: { type: "sphere", radius: s * 0.2 }, gravity: s * 6, collide: this._targetBottom.y, bounce: 0.3, speedOverLife: [1, 0.6, 0.4, 0.3], color: [[0, "white", 1], [0.6, "core", 1], [1, "glow", 0]], order: ORDER.sparks }),
            sparks(this, { burst: rate * 2, shape: { type: "sphere", radius: s * 0.2 }, speed: [s * 4, s * 9], color: [[0, "white", 1], [0.5, "core", 1], [1, "glow", 0]] }),
        );
        for (let i = 0; i < 3; i++) {
            const normal = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            this.ring({ position: new THREE.Vector3(0, -Math.max(s * 0.06, 0.01), 0), radius: s * (1.8 - i * 0.3), life: 0.35, width: s * 0.15, normal, soft: s * 0.3, core: p.white, glow: p.glow }, i * 0.06);
        }
        shockwave(this, { position: new THREE.Vector3(), size: s * 6, strength: 0.1, life: 0.45 });
        this.emitLight({ intensity: 10, distance: s * 10, duration: 0.35, curve: "flash" });
        this.shake(0.45, 0.3);
    }
}

registerEffects("explosions", {
    explosion: FireExplosion,
    earthexplosion: EarthExplosion,
    slash: SlashParticle,
    magicburst: MagicBurst,
    jb2aexplosion: JB2AExplosion,
    jb2aexplosionnolight: JB2AExplosionNoLight,
    castingsign: CastingSign,
    lightning: Lightning,
    starburst: StarBurst,
    skypillar: SkyPillar,
    icenova: IceNova,
    thunderwave: Thunderwave,
    healburst: HealBurst,
    smite: Smite,
    teleport: Teleport,
    summon: Summon,
    shatter: ShatterBurst,
});
