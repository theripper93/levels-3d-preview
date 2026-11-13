import * as THREE from "three";
import { createLayer } from "../layers/index.js";
import { wind } from "../weather/wind.js";

const down = new THREE.Vector3();

export class EndFade {
    constructor(time = 0.6) {
        this.type = "EndFade";
        this.time = time;
        this.level = 1;
        this.system = null;
    }

    initialize(particle, system) {
        this.system = system;
    }

    update(particle) {
        if (this.level >= 1) return;
        particle.color.w *= this.level;
        if (this.level <= 0) particle.age = particle.life;
    }

    frameUpdate(delta) {
        if (this.system?.markForDestroy) this.level = Math.max(0, this.level - delta / this.time);
    }

    reset() {}

    clone() {
        return new EndFade(this.time);
    }

    toJSON() {
        return { type: this.type, time: this.time };
    }
}

export class Drift {
    constructor(vector, scale = 1) {
        this.type = "Drift";
        this.vector = vector;
        this.scale = scale;
    }

    initialize() {}

    update(particle, delta) {
        particle.position.addScaledVector(this.vector, delta * this.scale * Math.min(1, (particle.age / particle.life) * 2));
    }

    frameUpdate() {}

    reset() {}

    clone() {
        return new Drift(this.vector, this.scale);
    }

    toJSON() {
        return { type: this.type, scale: this.scale };
    }
}

export class PullToAxis {
    constructor(strength) {
        this.type = "PullToAxis";
        this.strength = strength;
    }

    initialize() {}

    update(particle, delta) {
        const k = Math.max(0, 1 - this.strength * delta);
        particle.position.x *= k;
        particle.position.z *= k;
    }

    frameUpdate() {}

    reset() {}

    clone() {
        return new PullToAxis(this.strength);
    }

    toJSON() {
        return { type: this.type, strength: this.strength };
    }
}

export class ConeVolume {
    constructor({ length, angle = 0, radius = 0, from = 0, to = 1, flatten = 1 }) {
        this.type = "ConeVolume";
        this.length = length;
        this.angle = angle;
        this.radius = radius;
        this.from = from;
        this.to = to;
        this.flatten = flatten;
    }

    initialize(particle) {
        const t = this.from + (this.to - this.from) * Math.random();
        const u = Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const x = Math.cos(theta);
        const y = Math.sin(theta) * this.flatten;
        const spread = Math.tan(this.angle) * u;
        const z = t * this.length;
        const offset = this.radius * u + spread * z;
        particle.position.set(x * offset, y * offset, z);
        particle.velocity.set(x * spread, y * spread, 1).normalize().multiplyScalar(particle.startSpeed);
    }

    update() {}

    clone() {
        return new ConeVolume(this);
    }

    toJSON() {
        return { type: this.type };
    }
}

export class Footprint {
    constructor({ length, near, far, from = 0, to = 1 }) {
        this.type = "Footprint";
        this.length = length;
        this.near = near;
        this.far = far;
        this.from = from;
        this.to = to;
    }

    initialize(particle) {
        const t = this.from + (this.to - this.from) * Math.sqrt(Math.random());
        const half = this.near + (this.far - this.near) * t;
        particle.position.set((Math.random() * 2 - 1) * half, 0, t * this.length);
        particle.velocity.set(0, particle.startSpeed, 0);
    }

    update() {}

    clone() {
        return new Footprint(this);
    }

    toJSON() {
        return { type: this.type };
    }
}

export class Disc {
    constructor({ radius, thickness = 1, height = 0 }) {
        this.type = "Disc";
        this.radius = radius;
        this.thickness = thickness;
        this.height = height;
    }

    initialize(particle) {
        const r = this.radius * Math.sqrt(THREE.MathUtils.lerp((1 - this.thickness) ** 2, 1, Math.random()));
        const theta = Math.random() * Math.PI * 2;
        particle.position.set(Math.cos(theta) * r, Math.random() * this.height, Math.sin(theta) * r);
        particle.velocity.set(0, particle.startSpeed, 0);
    }

    update() {}

    clone() {
        return new Disc(this);
    }

    toJSON() {
        return { type: this.type };
    }
}

export function endSpec(effect, spec) {
    const extra = [new EndFade(spec.fade ?? 0.6)];
    if (spec.wind && spec.world !== false && effect.windVector) extra.push(new Drift(effect.windVector, spec.wind));
    return { follow: false, soft: spec.blend === "normal", ...spec, behaviors: [...(spec.behaviors ?? []), ...extra] };
}

export function sustained(effect, spec) {
    return createLayer(effect, endSpec(effect, spec));
}

export function groundBelow(point, fallback = point.y) {
    const interaction = game.Levels3DPreview.interactionManager;
    try {
        down.copy(point);
        down.y -= 99999;
        const collision = interaction.computeSightCollisionFrom3DPositions(point.clone(), down.clone(), "move", false, false, false, true);
        return collision?.[0]?.point?.y ?? fallback;
    } catch (e) {
        return fallback;
    }
}

export function isOutdoors(position) {
    const shelter = game.Levels3DPreview.weather?.shelter;
    try {
        return !shelter?.isSheltered?.(position.x, position.z, position.y);
    } catch (e) {
        return true;
    }
}

export function readWind(position, target) {
    if (!wind?.vector || !isOutdoors(position)) return target.set(0, 0, 0);
    return target.copy(wind.vector).multiplyScalar(wind.gustAt?.() ?? 1);
}

export function renderFx() {
    return game.Levels3DPreview.vfx?.render;
}
