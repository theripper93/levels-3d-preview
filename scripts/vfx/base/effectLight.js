import { Color, Object3D } from "three";
import { getQuality } from "../quality.js";
import { toCurve } from "./quarks.js";
import { allocateEffectLights, fadeEffectLight, registerEffectLight, unregisterEffectLight, updateGlow } from "../light/allocator.js";

const REDUCED_MOTION_INTENSITY = 0.35;

const LIGHT_CURVES = {
    pulse: [0, 1, 1, 0],
    flash: [1, 0.35, 0.1, 0],
    steady: [1, 1, 1, 1],
};

const curveMemory = [];

export class EffectLight {
    constructor(effect, { color = effect.palette.light, intensity = 10, distance = 5, decay = 2, duration = 0.3, delay = 0, curve = "pulse", progress = null, position = null, parent = effect.emitter, glow = true } = {}) {
        this.light = null;
        this.alive = getQuality().maxEffectLights > 0 && !!parent;
        if (!this.alive) return;
        this.intensity = intensity * (getQuality().reduceMotion && curve !== "steady" ? REDUCED_MOTION_INTENSITY : 1);
        this.duration = duration;
        this.delay = delay;
        this.progress = progress;
        this.curve = toCurve(LIGHT_CURVES[curve] ?? curve);
        this.age = 0;
        this.value = 0;
        this.score = 0;
        this.color = new Color().copy(color);
        this.distance = distance;
        this.decay = decay;
        this.glow = glow;
        this.decal = null;
        this.anchor = new Object3D();
        if (position) this.anchor.position.copy(position);
        parent.add(this.anchor);
        registerEffectLight(this);
    }

    update(delta) {
        if (!this.alive) return;
        this.age += delta;
        const t = this.progress ? this.progress() : (this.age - this.delay) / this.duration;
        if (t >= 1 && Number.isFinite(this.duration)) return this.release();
        this.value = t < 0 ? 0 : this.intensity * Math.max(0, this.curve.genValue(curveMemory, Math.min(t, 1)));
        allocateEffectLights();
        fadeEffectLight(this, delta);
        updateGlow(this);
    }

    release() {
        if (!this.alive) return;
        this.alive = false;
        unregisterEffectLight(this);
        this.anchor.removeFromParent();
    }
}
