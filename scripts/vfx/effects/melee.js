import * as THREE from "three";
import { registerEffects } from "../registry.js";
import { ProjectileParticle } from "../base/ProjectileParticle.js";
import { Object3DParticle } from "../base/Object3DParticle.js";
import { createLayer, ribbon } from "../layers/index.js";
import { Strip, addPrimitive, updatePrimitives } from "../primitives/index.js";
import { stopEmitting } from "./kit.js";

const FALLBACK_MODEL = "modules/levels-3d-preview/assets/particles/models/javelin_particle.glb";
const TRAIL_TIME = 0.16;

function easeOutBack(t) {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function phase(t, from, to) {
    return Math.clamp((t - from) / (to - from), 0, 1);
}

class MeleeStrike extends ProjectileParticle {
    constructor(...args) {
        super(...args);
        this.params.rotateTowards = true;
        this._total = Math.clamp(1 / this._speed / this.constructor.HIT, 0.4, 1.5);
    }

    static get IMPACT_SCALE() {
        return 0.7;
    }

    static get HIT() {
        return 0.45;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        };
    }

    addLight() {}

    get modelPath() {
        return game.Levels3DPreview.helpers.is3DModel(this.params.sprite) ? this.params.sprite : FALLBACK_MODEL;
    }

    async createEmitter() {
        const s = this.params.scale.start;
        const mesh = await this.getMesh(this.modelPath, false);
        mesh.scale.setScalar(s * 1.4);
        const model = new THREE.Group().add(mesh);
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        if (size.z > size.y * 1.5) model.rotation.x = -Math.PI / 2;
        const box = new THREE.Box3().setFromObject(model);
        if (box.min.y < -box.max.y * 0.5) model.position.y = -box.min.y - (box.max.y - box.min.y) * 0.15;
        this._length = box.max.y + model.position.y;
        this._weapon = new THREE.Group();
        this._weapon.add(model);
        this._pivot = new THREE.Group();
        this._pivot.add(this._weapon);
        this.emitter = new THREE.Group();
        this.emitter.add(this._pivot);
        this.emitter.position.copy(this.strikeOrigin);
        this.emitter.lookAt(this._target);
        this.pose(0);
        const tip = new THREE.Group();
        tip.position.y = this._length * 0.92;
        const middle = new THREE.Group();
        middle.position.y = this._length * 0.55;
        this._weapon.add(tip, middle);
        this._tipAnchor = tip;
        this._trails = await this.addTo(tip, this.tipLayers(s));
        await this.addTo(middle, this.edgeLayers(s));
        const alpha = this.params.alpha.start;
        const scene = game.Levels3DPreview.scene;
        this._arcs = [
            { anchor: tip, history: [], strip: addPrimitive(this, new Strip({ core: this.palette.core, glow: this.palette.start, width: s * 0.22, opacity: alpha, intensity: 1.4, noise: 0.25, scroll: 3, frequency: 3, coreWidth: 0.35, taper: 1 }), scene) },
            { anchor: middle, history: [], strip: addPrimitive(this, new Strip({ core: this.palette.glow, glow: this.palette.end, width: this.sweepWidth, opacity: 0.35 * alpha, noise: 0.5, scroll: 2, frequency: 2, coreWidth: 0.1, glowPower: 1.2, taper: 1 }), scene) },
        ];
    }

    updateArcs(fade) {
        for (const arc of this._arcs) {
            arc.history.push({ point: arc.anchor.getWorldPosition(new THREE.Vector3()), age: this._age });
            while (arc.history.length > 2 && this._age - arc.history[0].age > TRAIL_TIME) arc.history.shift();
            const visible = arc.history.length > 2 && fade > 0.01;
            arc.strip.visible = visible;
            if (!visible) continue;
            const points = new THREE.CatmullRomCurve3(arc.history.map((h) => h.point)).getPoints(arc.history.length * 4);
            arc.strip.setLines([{ points, widths: (t) => t }]);
            arc.strip.uniforms.uOpacity.value = arc.strip.opacity * fade;
        }
    }

    get strikeOrigin() {
        return this._origin;
    }

    get sweepWidth() {
        return this._length * 0.9;
    }

    tipLayers(s) {
        return [
            createLayer(this, { sprite: "emberssmall", rate: Math.min(this.params.rate.particles, 15) * 0.6, life: [0.2, 0.45], size: [s * 0.03, s * 0.06], speed: [s * 0.2, s * 0.6], shape: { type: "sphere", radius: s * 0.04 }, gravity: s * 2, sizeOverLife: "shrink", color: [[0, "white", 1, 1.4], [0.4, "spark", 0.9], [1, "end", 0]], order: 8 }),
        ];
    }

    edgeLayers(s) {
        return [];
    }

    pose(t) {}

    get impactPoint() {
        if (this._dist <= this._length * 1.5) return this._target;
        return this._tipAnchor.getWorldPosition(new THREE.Vector3());
    }

    hit() {
        this._hit = true;
        this._playOnEnd = true;
        this.onEnd();
        this.ended = false;
        this.shake(0.12, 0.15);
        stopEmitting(this._trails);
    }

    animate(delta) {
        const t = Math.min(1, this._age / this._total);
        const appear = easeOutBack(phase(this._age, 0, 0.12));
        const vanish = 1 - easeInOut(phase(t, 0.72, 1));
        this._pivot.scale.setScalar(Math.max(0.001, appear * vanish));
        this.pose(t);
        updatePrimitives(this, delta);
        this.updateArcs(vanish);
        if (!this._hit && t >= this.constructor.HIT) this.hit();
        if (t >= 1) this.ended = true;
    }
}

export class Swing extends MeleeStrike {
    async createEmitter() {
        this._roll = -Math.PI / 2 + Math.random() * Math.PI;
        await super.createEmitter();
    }

    get strikeOrigin() {
        const forward = this._target.clone().sub(this._origin);
        return this._origin.clone().addScaledVector(forward, Math.min(0.3, (this.params.scale.start * 0.5) / Math.max(forward.length(), 0.0001)));
    }

    pose(t) {
        this._pivot.rotation.z = this._roll;
        const windup = easeInOut(phase(t, 0.1, 0.3));
        const strike = easeInOut(phase(t, 0.3, 0.55));
        const settle = easeInOut(phase(t, 0.55, 0.75));
        this._weapon.rotation.x = -Math.PI * 0.3 - windup * Math.PI * 0.15 + strike * Math.PI * 0.95 + settle * Math.PI * 0.05;
    }
}

export class Thrust extends MeleeStrike {
    static get HIT() {
        return 0.42;
    }

    async createEmitter() {
        await super.createEmitter();
        this._weapon.rotation.x = Math.PI / 2;
        this._pivot.rotation.z = Math.random() * Math.PI * 2;
        const angle = Math.random() * Math.PI * 2;
        this._offset = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(this.params.scale.start * 0.15);
        this._reach = Math.max(0, this._dist - this._length * 0.9);
    }

    get sweepWidth() {
        return this.params.scale.start * 0.12;
    }

    edgeLayers(s) {
        return [
            ...super.edgeLayers(s),
            createLayer(this, { sprite: "trace_06", mode: "stretched", stretch: 0.02 / Math.max(s, 0.01), world: false, aim: "up", duration: this._total, burst: { time: this.constructor.HIT * this._total * 0.85, count: 5 }, life: [0.12, 0.2], size: [s * 0.05, s * 0.09], speed: [s * 4, s * 7], shape: { type: "cone", radius: s * 0.12, angle: 0.01 }, color: [[0, "white", 0.9, 1.4], [0.5, "core", 0.6], [1, "end", 0]], order: 8 }),
        ];
    }

    pose(t) {
        if (!this._offset) return;
        const back = easeInOut(phase(t, 0.1, 0.3));
        const thrust = 1 - Math.pow(1 - phase(t, 0.3, 0.45), 3);
        const retract = easeInOut(phase(t, 0.55, 0.85));
        const z = -this._length * 0.35 * back + (this._length * 0.35 + this._reach * 0.6) * thrust - this._reach * 0.45 * retract;
        this._pivot.position.copy(this._offset).setZ(z);
    }
}

export class ThrustSwing {
    constructor(...args) {
        return new (Math.random() > 0.5 ? Thrust : Swing)(...args);
    }
}

export class ObjectParticle extends Object3DParticle {
    static get IMPACT() {
        return "hitpuff";
    }

    static get IMPACT_SCALE() {
        return 0.8;
    }

    async createEmitter() {
        await super.createEmitter();
        const inner = this.emitter;
        this.emitter = new THREE.Group();
        this.emitter.up.copy(inner.up);
        inner.up.set(0, 1, 0);
        this.emitter.add(inner);
        this.emitter.position.copy(this._origin);
        if (this.params.rotateTowards || this.isModel) return;
        const s = this.params.scale.start || this.params.scale.end;
        await this.add(ribbon(this, { size: s * 0.3, life: [0.15, 0.3], perDistance: this.params.rate.particles * 5, color: [[0, "white", 0.35], [0.3, "start", 0.25], [1, "end", 0]] }));
    }

    onEnd() {
        if (this.ended) return;
        if (!this.params.rotateTowards) this.playImpact(this.emitter.position.clone());
        super.onEnd();
    }
}

registerEffects("sprites", {
    sprite: ObjectParticle,
    swing: Swing,
    thrust: Thrust,
    thrustswing: ThrustSwing,
});
