import * as THREE from "three";
import { registerEffects } from "../registry.js";
import { RayParticle } from "../base/RayParticle.js";
import { createLayer, glow, sparks, flash, ORDER } from "../layers/index.js";
import { Beam, Bolt, addPrimitive, updatePrimitives, groundGlow, spriteQuad } from "../primitives/index.js";
import { useColorsIfDefault } from "./kit.js";

const ORIGIN = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CHAINS = new Map();
const FORWARD = new THREE.Vector3(0, 0, 1);
const DEFAULT_RUNE = "modules/levels-3d-preview/assets/particles/magiccircles/magic_circle_03.webp";

export class EnergyRay extends RayParticle {
    get charge() {
        return 0.12;
    }

    get fadeTime() {
        return 0.22;
    }

    get customSprite() {
        return this.params.sprite !== this.defaultSettings.sprite ? this.params.sprite : null;
    }

    async createEmitter() {
        const path = this.animationPath;
        const start = path.points[0];
        this.emitter = new THREE.Group();
        this.emitter.position.copy(start);
        this.curve = new THREE.CatmullRomCurve3(path.points.map((p) => p.clone().sub(start)), false, "chordal");
        this.vector = this.curve.points.at(-1).clone();
        this.length = this.vector.length();
        this.direction = this.vector.clone().normalize();
        this.impactGroup = new THREE.Group();
        this.impactGroup.position.copy(this.vector);
        this.emitter.add(this.impactGroup);
        this.ground = this._targetBottom.clone().sub(start).sub(this.vector);
        this.beams = [];
        this.arrival = this.charge + 1 / this._speed;
        this.total = Math.max(this.charge + this._duration, this.arrival + 0.15);
        await this.build();
    }

    addBeam(options) {
        const beam = addPrimitive(this, new Beam({ start: ORIGIN, end: this.vector, segments: this.params.arc ? 48 : 24, frequency: this.length / this.params.scale.start, ...options }));
        if (this.params.arc) {
            beam.curve = this.curve;
            beam.rebuild = function () {
                for (let i = 0; i <= this.segments; i++) this.curve.getPointAt(i / this.segments, this.points[i]);
                this.setLines([{ points: this.points }]);
            };
        }
        beam.baseWidth = beam.width;
        beam.baseOpacity = beam.opacity;
        beam.head = 0;
        this.beams.push(beam);
        return beam;
    }

    flow(spec = {}) {
        const s = this.params.scale.start;
        const life = 0.35;
        return createLayer(this, {
            sprite: "emberssmall",
            mode: "stretched",
            stretch: 0.03,
            world: false,
            life,
            size: [s * 0.08, s * 0.16],
            speed: [this.length / life, (this.length / life) * 1.1],
            rate: this.params.rate.particles * 2,
            direction: this.direction,
            shape: { type: "cone", radius: s * 0.12, angle: 0.01 },
            color: [
                [0, "white", 0],
                [0.15, "spark", 1],
                [0.85, "glow", 0.8],
                [1, "end", 0],
            ],
            delay: this.arrival,
            order: ORDER.sparks,
            ...spec,
        });
    }

    async build() {
        const s = this.params.scale.start;
        const { start: alpha } = this.params.alpha;
        const p = this.palette;
        this.addBeam({ core: p.core, glow: p.glow, width: s * 0.35, coreWidth: 0.4, glowPower: 1.5, noise: 0.35, scroll: 4, opacity: alpha, intensity: 1.1 });
        this.addBeam({ core: p.glow, glow: p.start, width: s * 1.1, coreWidth: 0.15, glowPower: 2.2, noise: 0.75, scroll: 2.5, opacity: 0.8 * alpha, wobble: s * 0.03 });
        const helix = { radius: s * 0.22 + this.params.emitterSize, turns: 1 / (s * 4), speed: 14 };
        this.addBeam({ core: p.spark, glow: p.end, width: s * 0.12, coreWidth: 0.4, noise: 0.5, opacity: 0.8 * alpha, helix: { ...helix, phase: 0 } });
        this.addBeam({ core: p.spark, glow: p.end, width: s * 0.12, coreWidth: 0.4, noise: 0.5, opacity: 0.8 * alpha, helix: { ...helix, phase: Math.PI } });
        await this.add(...this.originLayers(), this.flow({ sprite: this.params.sprite, force: this.userForce }));
        await this.addTo(this.impactGroup, ...this.impactLayers());
        this.addGlows();
    }

    originLayers() {
        const s = this.params.scale.start;
        return [
            glow(this, { sprite: "emberssmall", size: s * 1.4, rate: 30, life: 0.2, color: ["glow", "start", 0.6, 0] }),
            createLayer(this, { sprite: "emberssmall", world: false, burst: 14, life: this.charge + 0.05, size: [s * 0.08, s * 0.14], speed: -s * 9, shape: { type: "sphere", radius: s * 1.1 }, color: ["spark", "glow", 1, 0.6], order: ORDER.sparks }),
            flash(this, { sprite: "star_06", size: s * 2.2, life: 0.18, delay: this.charge }),
        ];
    }

    impactLayers() {
        const s = this.params.scale.start;
        const back = this.direction.clone().negate().lerp(new THREE.Vector3(0, 1, 0), 0.4);
        return [
            glow(this, { sprite: "emberssmall", size: s * 1.8, rate: 30, life: 0.2, color: ["glow", "start", 0.7, 0], delay: this.arrival }),
            glow(this, { sprite: "star_06", size: s * 1.6, rate: 14, life: 0.12, rotation: true, color: ["white", "core", 0.6, 0], delay: this.arrival }),
            sparks(this, { burst: undefined, rate: this.params.rate.particles * 2, direction: back, size: [s * 0.05, s * 0.1], speed: [s * 2, s * 5], force: this.userForce, delay: this.arrival }),
        ];
    }

    addGlows() {
        const s = this.params.scale.start;
        const hold = this.total - this.arrival + this.fadeTime;
        this.at(this.arrival, () => groundGlow(this, { parent: this.impactGroup, position: this.ground, size: s * 3.5, depth: s * 2, color: this.palette.glow, opacity: 0.9, life: hold, fadeIn: 0.08, fadeOut: this.fadeTime + 0.15 }));
        this.emitLight({ parent: this.impactGroup, intensity: 8, distance: s * 10, duration: hold, delay: this.arrival, curve: [1, 0.9, 0.85, 0] });
    }

    beamWidth(beam, t) {
        return beam.baseWidth * (1 + 0.08 * Math.sin(t * 47 + beam.phase));
    }

    animate(delta) {
        this._time += delta;
        const t = this._time;
        const progress = Math.clamp((t - this.charge) * this._speed, 0, 1);
        const fade = Math.clamp((t - this.total) / this.fadeTime, 0, 1);
        this._currentSpeed = progress;
        for (const beam of this.beams) {
            beam.head = t < this.charge ? 0 : progress * 1.04;
            beam.opacity = beam.baseOpacity * (1 - fade);
            beam.width = this.beamWidth(beam, t) * (1 - fade * 0.7);
        }
        updatePrimitives(this, delta);
        this.updateRay?.(t, progress, fade, delta);
        if (fade >= 1) this.onEnd();
    }
}

export class RunicRay extends EnergyRay {
    get charge() {
        return 0.3;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.0001,
        };
    }

    async build() {
        const s = this.params.scale.start;
        const p = this.palette;
        this.rune = await spriteQuad(this, this.customSprite ?? DEFAULT_RUNE, { color: p.glow });
        const videoDuration = this.rune.material.map?.image?.duration;
        if (videoDuration) this._duration = videoDuration;
        this.rune.renderOrder = ORDER.glow;
        this.rune.position.copy(this.direction).multiplyScalar(s * 0.6);
        this.rune.quaternion.setFromUnitVectors(FORWARD, this.direction);
        this.rune.scale.setScalar(0.0001);
        this.addBeam({ core: p.white, glow: p.core, width: s * 0.22, coreWidth: 0.5, glowPower: 1.5, noise: 0.3, scroll: 5, opacity: this.params.alpha.start, intensity: 1.3 });
        this.addBeam({ core: p.glow, glow: p.start, width: s * 0.7, coreWidth: 0.1, glowPower: 2.5, noise: 0.8, scroll: 3, frequency: (this.length / s) * 2, opacity: 0.75 * this.params.alpha.start });
        await this.add(
            glow(this, { sprite: "emberssmall", size: s * 1.2, rate: 20, life: 0.25, color: ["glow", "start", 0.5, 0] }),
            this.flow({ sprite: "spiral", mode: "billboard", life: 0.5, size: [s * 0.25, s * 0.35], speed: this.length / 0.5, rate: 8, rotation: true, spin: [-3, 3], color: [[0, "glow", 0], [0.15, "glow", 0.9], [0.85, "start", 0.7], [1, "end", 0]] }),
            this.flow({ sprite: "spark_arc", mode: "billboard", life: 0.3, size: [s * 0.3, s * 0.5], rate: this.params.rate.particles, rotation: true, shape: { type: "cone", radius: s * 0.2, angle: 0.02 } }),
        );
        await this.addTo(this.impactGroup, ...this.impactLayers());
        this.addGlows();
    }

    updateRay(t, progress, fade) {
        const s = this.params.scale.start;
        const grow = Math.clamp(t / 0.2, 0, 1);
        const pulse = 1 + 0.06 * Math.sin(t * 9);
        this.rune.scale.setScalar(Math.max(0.0001, s * 1.25 * (1 - (1 - grow) ** 3) * pulse * (1 - fade)));
        this.rune.rotateZ(0.02 + (t < this.charge ? 0.08 : 0.03));
        this.rune.material.opacity = (0.6 + 0.4 * Math.min(1, t / 0.15)) * (1 - fade);
    }
}

export class VoidRay extends EnergyRay {
    async build() {
        const s = this.params.scale.start;
        const p = this.palette;
        const alpha = this.params.alpha.start;
        this.addBeam({ core: p.glow, glow: p.start, width: s * 1.15, coreWidth: 0.1, glowPower: 1.6, noise: 0.8, scroll: -2.5, opacity: alpha, wobble: s * 0.05 });
        this.addBeam({ core: p.black, glow: p.black, width: s * 0.38, coreWidth: 0.55, glowPower: 2.5, noise: 0.6, scroll: -4, blending: "normal", opacity: 0.7 * alpha, renderOrder: 7 });
        const helix = { radius: s * 0.24, turns: 1 / (s * 3), speed: -10 };
        this.addBeam({ core: p.spark, glow: p.glow, width: s * 0.08, coreWidth: 0.5, noise: 0.6, opacity: 0.6 * alpha, renderOrder: 8, helix: { ...helix, phase: 0 } });
        this.addBeam({ core: p.spark, glow: p.glow, width: s * 0.08, coreWidth: 0.5, noise: 0.6, opacity: 0.6 * alpha, renderOrder: 8, helix: { ...helix, phase: Math.PI } });
        await this.add(
            glow(this, { sprite: "emberssmall", size: s * 1.4, rate: 30, life: 0.2, color: ["glow", "start", 0.5, 0] }),
            createLayer(this, { sprite: "emberssmall", world: false, burst: 14, life: this.charge + 0.05, size: [s * 0.08, s * 0.14], speed: -s * 9, shape: { type: "sphere", radius: s * 1.1 }, color: ["edge", "black", 1, 0.6], order: ORDER.sparks }),
            this.flow({ sprite: "smoke", blend: "normal", mode: "billboard", life: 0.6, size: [s * 0.35, s * 0.6], speed: this.length / 0.6, rate: 12, rotation: true, spin: [-2, 2], shape: { type: "cone", radius: s * 0.25, angle: 0.03 }, color: [[0, "black", 0], [0.2, "black", 0.55], [0.8, "smoke", 0.35], [1, "smoke", 0]], order: ORDER.smoke }),
        );
        await this.addTo(
            this.impactGroup,
            glow(this, { sprite: "magic_04", blend: "normal", size: s * 1.6, rate: 10, life: 0.3, rotation: true, color: ["black", "edge", 0.6, 0], delay: this.arrival, order: ORDER.body }),
            glow(this, { sprite: "emberssmall", size: s * 1.8, rate: 24, life: 0.2, color: ["glow", "start", 0.6, 0], delay: this.arrival }),
            sparks(this, { burst: undefined, rate: this.params.rate.particles, direction: this.direction.clone().negate().lerp(new THREE.Vector3(0, 1, 0), 0.4), size: [s * 0.05, s * 0.1], speed: [s * 2, s * 4], color: [[0, "spark", 1], [0.6, "edge", 0.8], [1, "black", 0]], force: this.userForce, delay: this.arrival }),
        );
        this.addGlows();
    }
}

export class FrostRay extends EnergyRay {
    async build() {
        useColorsIfDefault(this, "#9fe8ff", "#2f6dff");
        const s = this.params.scale.start;
        const p = this.palette;
        const alpha = this.params.alpha.start;
        this.addBeam({ core: p.white, glow: p.core, width: s * 0.3, coreWidth: 0.45, glowPower: 1.4, noise: 0.3, scroll: 3, opacity: alpha, intensity: 1.2 });
        this.addBeam({ core: p.glow, glow: p.end, width: s * 1.2, coreWidth: 0.12, glowPower: 2.4, noise: 0.85, scroll: 1.2, frequency: (this.length / s) * 2, opacity: 0.7 * alpha });
        const helix = { radius: s * 0.18, turns: 1 / (s * 2.5), speed: 6 };
        this.addBeam({ core: p.white, glow: p.end, width: s * 0.07, coreWidth: 0.5, noise: 0.4, opacity: 0.7 * alpha, helix: { ...helix, phase: 0 } });
        this.addBeam({ core: p.white, glow: p.end, width: s * 0.07, coreWidth: 0.5, noise: 0.4, opacity: 0.7 * alpha, helix: { ...helix, phase: Math.PI } });
        await this.add(
            ...this.originLayers(),
            this.flow({ sprite: "star_04", mode: "billboard", life: 0.5, size: [s * 0.1, s * 0.22], speed: this.length / 0.5, rate: this.params.rate.particles, rotation: true, spin: [-4, 4], shape: { type: "cone", radius: s * 0.3, angle: 0.02 }, color: [[0, "white", 0], [0.15, "white", 1], [0.8, "glow", 0.8], [1, "end", 0]] }),
            this.flow({ sprite: "smoke", blend: "normal", mode: "billboard", life: 0.9, size: [s * 0.4, s * 0.7], speed: (this.length / 0.9) * 0.6, rate: 10, rotation: true, spin: [-1, 1], shape: { type: "cone", radius: s * 0.3, angle: 0.05 }, color: [[0, "core", 0], [0.2, "core", 0.3], [1, "glow", 0]], order: ORDER.smoke }),
        );
        await this.addTo(
            this.impactGroup,
            ...this.impactLayers(),
            createLayer(this, { sprite: "star_04", rate: this.params.rate.particles, life: [0.4, 0.8], size: [s * 0.08, s * 0.18], speed: [s, s * 3], rotation: true, spin: [-6, 6], shape: { type: "sphere", radius: s * 0.15 }, gravity: s * 4, color: [[0, "white", 1], [0.6, "glow", 0.9], [1, "end", 0]], delay: this.arrival, order: ORDER.sparks }),
            createLayer(this, { sprite: "smoke", blend: "normal", rate: 8, life: [1, 1.6], size: [s * 0.6, s], speed: s * 0.3, rotation: true, shape: { type: "sphere", radius: s * 0.3 }, force: [0, -s * 0.1, 0], color: [[0, "core", 0], [0.2, "core", 0.35], [1, "glow", 0]], delay: this.arrival, order: ORDER.smoke }),
        );
        this.addGlows();
        this.at(this.arrival, () => groundGlow(this, { parent: this.impactGroup, position: this.ground, size: s * 3, depth: s * 2, color: p.core, blending: "normal", opacity: 0.8, falloff: 1.5, life: this.total - this.arrival + 4, fadeIn: 0.4, fadeOut: 2.5 }));
    }
}

export class Disintegrate extends EnergyRay {
    get charge() {
        return 0.25;
    }

    async build() {
        useColorsIfDefault(this, "#7dff3a", "#1f9e00");
        const s = this.params.scale.start;
        const p = this.palette;
        const alpha = this.params.alpha.start;
        this.addBeam({ core: p.white, glow: p.core, width: s * 0.14, coreWidth: 0.6, glowPower: 1, noise: 0.15, scroll: 8, opacity: alpha, intensity: 1.6 });
        this.addBeam({ core: p.glow, glow: p.start, width: s * 0.6, coreWidth: 0.1, glowPower: 2.8, noise: 0.9, scroll: 6, frequency: (this.length / s) * 3, opacity: 0.8 * alpha, wobble: s * 0.02, waves: 6, waveSpeed: 30 });
        await this.add(...this.originLayers(), this.flow({ life: 0.25, size: [s * 0.04, s * 0.08], stretch: 0.05, rate: this.params.rate.particles * 3, shape: { type: "cone", radius: s * 0.08, angle: 0.01 } }));
        const rise = { speed: [s * 0.3, s * 0.9], shape: { type: "sphere", radius: s * 0.35 }, turbulence: { scale: s, strength: s * 2, speed: 2 }, delay: this.arrival };
        await this.addTo(
            this.impactGroup,
            ...this.impactLayers(),
            createLayer(this, { sprite: "dust", blend: "normal", rate: this.params.rate.particles * 2, life: [0.8, 1.4], size: [s * 0.1, s * 0.22], rotation: true, spin: [-3, 3], force: [0, s * 1.5, 0], color: [[0, "black", 0], [0.1, "smoke", 1], [0.7, "edge", 0.8], [1, "black", 0]], order: ORDER.body, ...rise }),
            createLayer(this, { sprite: "emberssmall", rate: this.params.rate.particles * 2, life: [0.6, 1.2], size: [s * 0.04, s * 0.09], force: [0, s * 2, 0], color: [[0, "white", 0], [0.15, "spark", 1], [1, "glow", 0]], order: ORDER.sparks, ...rise }),
        );
        this.addGlows();
    }
}

export class Tether extends EnergyRay {
    static get IMPACT() {
        return null;
    }

    get defaultSettings() {
        return { ...super.defaultSettings, duration: 6 };
    }

    get charge() {
        return 0.2;
    }

    get fadeTime() {
        return 0.5;
    }

    async build() {
        const s = this.params.scale.start;
        const p = this.palette;
        const alpha = this.params.alpha.start;
        this.addBeam({ core: p.core, glow: p.glow, width: s * 0.18, coreWidth: 0.5, glowPower: 1.3, noise: 0.5, scroll: 1.5, opacity: alpha, wobble: s * 0.05, waves: 1.5, waveSpeed: 3 });
        this.addBeam({ core: p.glow, glow: p.start, width: s * 0.7, coreWidth: 0.1, glowPower: 2.4, noise: 0.85, scroll: 0.8, frequency: (this.length / s) * 1.5, opacity: 0.55 * alpha, wobble: s * 0.08, waves: 1, waveSpeed: 2 });
        this.addBeam({ core: p.spark, glow: p.end, width: s * 0.05, coreWidth: 0.5, noise: 0.5, scroll: 3, opacity: 0.6 * alpha, wobble: s * 0.12, waves: 2.5, waveSpeed: 5 });
        const endGlow = () => glow(this, { sprite: "emberssmall", size: s * 1.1, rate: 12, life: 0.4, color: [[0, "glow", 0], [0.4, "glow", 0.45], [1, "start", 0]] });
        await this.add(endGlow());
        await this.addTo(this.impactGroup, endGlow());
        this.emitLight({ parent: this.impactGroup, intensity: 4, distance: s * 6, duration: this.total + this.fadeTime, curve: [0, 1, 1, 0] });
    }

    tokenPoint(token, height) {
        const token3d = token instanceof foundry.canvas.placeables.Token && game.Levels3DPreview.tokens[token.id];
        if (!token3d) return null;
        return token3d.mesh.position.clone().setY(token3d.mesh.position.y + token3d.d * height);
    }

    updateRay() {
        const start = this.tokenPoint(this.from, 0.6);
        const end = this.tokenPoint(this.to, 0.5);
        if (start) this.emitter.position.copy(start);
        if (end) this.vector.copy(end).sub(this.emitter.position);
        this.impactGroup.position.copy(this.vector);
        for (const beam of this.beams) beam.setEnds(ORIGIN, this.vector);
    }
}

export class ChainLightning extends RayParticle {
    constructor(from, to, params) {
        super(from, to, params);
        const now = performance.now();
        for (const [id, chain] of CHAINS) if (now - chain.time > 2000) CHAINS.delete(id);
        let chain = CHAINS.get(this.params.id);
        if (!chain || now - chain.time > 300) CHAINS.set(this.params.id, (chain = { time: now, points: [] }));
        chain.points.push(this._target.clone());
        this.hop = chain.points.length - 1;
        if (this.hop) this._origin = chain.points.at(-2).clone();
    }

    async createEmitter() {
        useColorsIfDefault(this, "#a8d8ff", "#5a6cff");
        const s = this.params.scale.start;
        const p = this.palette;
        this.emitter = new THREE.Group();
        this.emitter.position.copy(this._origin);
        const vector = this._target.clone().sub(this._origin);
        this.delay = this.hop * 0.14;
        this.strike = this.delay + 0.35;
        this.bolt = addPrimitive(this, new Bolt({ start: ORIGIN, end: vector, depth: 5, jitter: 0.22, branches: 3, branchLength: 0.25, core: p.white, glow: p.glow, width: s * 0.9, coreWidth: 0.12, glowPower: 3.5, head: 0 }));
        this.impactGroup = this.addMesh(new THREE.Group());
        this.impactGroup.position.copy(vector);
        const back = vector.clone().negate().normalize().lerp(UP, 0.5);
        const at = { delay: this.delay + 0.05 };
        await this.add(flash(this, { sprite: "emberssmall", size: s * 1.6, life: 0.2, color: ["white", "glow", 0.7, 0], ...at }));
        await this.addTo(
            this.impactGroup,
            flash(this, { sprite: "star_09", size: s * 2.4, life: 0.16, ...at }),
            flash(this, { sprite: "emberssmall", size: s * 2.4, life: 0.3, color: ["white", "glow", 0.7, 0], ...at }),
            sparks(this, { burst: this.params.rate.particles, direction: back, size: [s * 0.03, s * 0.07], speed: [s * 2, s * 6], ...at }),
            createLayer(this, { sprite: "spark_arc", burst: [{ count: 2 }, { count: 2, time: 0.1 }], life: 0.08, size: [s * 0.8, s * 1.3], rotation: true, shape: { type: "sphere", radius: s * 0.3 }, color: ["white", "glow", 1, 0], order: ORDER.sparks, ...at }),
        );
        this.emitLight({ parent: this.impactGroup, intensity: 10, distance: s * 8, duration: 0.4, delay: this.delay, curve: [1, 0.3, 0.8, 0] });
    }

    animate(delta) {
        this._time += delta;
        const t = this._time - this.delay;
        const fade = Math.clamp((this._time - this.strike) / 0.2, 0, 1);
        this.bolt.head = t < 0 ? 0 : Math.min(1.05, t / 0.05);
        this.bolt.intensity = 0.6 + 0.4 * Math.abs(Math.sin(this._time * 70));
        this.bolt.opacity = 1 - fade;
        const flicker = Math.floor(t / 0.07);
        if (t > 0 && flicker !== this.flicker) {
            if (this.flicker !== undefined) this.bolt.strike();
            this.flicker = flicker;
        }
        if (this.bolt.head >= 1) this._currentSpeed = 1;
        updatePrimitives(this, delta);
        if (fade >= 1) this.onEnd();
    }
}

registerEffects("rays", {
    ray: EnergyRay,
    runicray: RunicRay,
    voidray: VoidRay,
    frostray: FrostRay,
    disintegrate: Disintegrate,
    tether: Tether,
    chainlightning: ChainLightning,
});
