import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import { getQuality } from "../quality.js";

const displayColor = new THREE.Color();

class BudgetedValue {
    constructor(source, scale) {
        this.type = "value";
        this.source = source;
        this.scale = scale;
    }

    startGen(memory) {
        return this.source.startGen(memory);
    }

    genValue(memory, t) {
        return this.source.genValue(memory, t) * this.scale;
    }

    toJSON() {
        return this.source.toJSON();
    }

    clone() {
        return new BudgetedValue(this.source.clone(), this.scale);
    }
}

function budget(generator) {
    const scale = getQuality().particleScale;
    if (scale === 1 || !generator || generator instanceof BudgetedValue) return generator;
    return new BudgetedValue(generator, scale);
}

export class ParticleSystem extends QUARKS.ParticleSystem {
    get emissionOverTime() {
        return this._emissionOverTime;
    }

    set emissionOverTime(generator) {
        this._emissionOverTime = budget(generator);
    }

    get emissionOverDistance() {
        return this._emissionOverDistance;
    }

    set emissionOverDistance(generator) {
        this._emissionOverDistance = budget(generator);
    }

    get emissionBursts() {
        return this._emissionBursts;
    }

    set emissionBursts(bursts) {
        this._emissionBursts = bursts.map((burst) => ({ ...burst, count: budget(typeof burst.count === "number" ? new QUARKS.ConstantValue(burst.count) : burst.count) }));
    }
}

export class LegacyNoise {
    constructor(frequency, power) {
        this.type = "LegacyNoise";
        this.frequency = frequency;
        this.power = power;
        this.generator = new SimplexNoise();
        this.duration = 0;
        this.temp = new THREE.Vector3();
    }

    initialize(particle) {
        particle.startTime = this.duration;
    }

    update(particle, delta) {
        const { frequency, generator } = this;
        const t = particle.age > 0 ? particle.life / particle.age : 0;
        this.temp.set(generator.noise(particle.startTime * frequency.x, t * frequency.x), generator.noise(particle.startTime * frequency.y + 100.25, t * frequency.y + 100.154), generator.noise(particle.startTime * frequency.z + 200.89, t * frequency.z + 200.1)).multiply(this.power);
        particle.position.addScaledVector(this.temp, delta);
    }

    frameUpdate(delta) {
        this.duration += delta;
    }

    toJSON() {
        return { type: this.type, frequency: this.frequency.toArray(), power: this.power.toArray() };
    }

    clone() {
        return new LegacyNoise(this.frequency.clone(), this.power.clone());
    }

    reset() {}
}

export function legacyGradient(segments) {
    const color = [];
    const alpha = [];
    const addKey = (value, t) => {
        if (color.length && color.at(-1)[1] === t) {
            color.pop();
            alpha.pop();
        }
        color.push([new THREE.Vector3(value.x, value.y, value.z), t]);
        alpha.push([value.w, t]);
    };
    segments.forEach(([range, start], i) => {
        addKey(range.a, start);
        addKey(range.b, segments[i + 1]?.[1] ?? 1);
    });
    return new QUARKS.Gradient(color, alpha);
}

export const colorToVec4 = (color, alpha, overdrive = 1) => {
    displayColor.copy(color).convertLinearToSRGB();
    return new THREE.Vector4(displayColor.r * overdrive, displayColor.g * overdrive, displayColor.b * overdrive, alpha);
};

export function toValue(spec) {
    if (typeof spec === "number") return new QUARKS.ConstantValue(spec);
    if (Array.isArray(spec)) return new QUARKS.IntervalValue(spec[0], spec[1]);
    return spec;
}

export const CURVES = {
    shrink: [1, 0.95, 0.75, 0],
    fade: [1, 0.9, 0.5, 0],
    grow: [0.5, 0.55, 0.95, 1],
    swell: [0.2, 0.9, 1, 1],
    pop: [0, 1.4, 1, 0.9],
    pulse: [0, 1, 1, 0],
    hold: [1, 1, 1, 1],
};

export function toCurve(spec) {
    const points = typeof spec === "string" ? CURVES[spec] : spec;
    if (!Array.isArray(points)) return points;
    return new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(...points), 0]]);
}
