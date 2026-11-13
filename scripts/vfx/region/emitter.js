import * as THREE from "three";
import { BasePresetEffect } from "../base/BasePresetEffect.js";
import { createLayer, flame, ORDER } from "../layers/index.js";
import { getQuality } from "../quality.js";

const DENSITY = 6;
const MAX_RATE = 160;
const CAST_BOOST = 2.5;
const ATTEMPTS = 8;
const VOLUMES = ["circle", "cone"];
const sample = new THREE.Vector3();

class RegionShape {
    constructor(emitter) {
        this.type = "regionFill";
        this.emitter = emitter;
        this.reveal = Infinity;
    }

    initialize(particle) {
        this.emitter.samplePoint(particle.position, this.reveal);
        particle.velocity.set(this.emitter.drift, particle.startSpeed, 0);
    }

    update() {}

    toJSON() {
        return { type: this.type };
    }

    clone() {
        return new RegionShape(this.emitter);
    }
}

class RegionFill extends BasePresetEffect {
    async build() {
        this.layers = await this.add(this.params.flame ? flame(this, this.params.flame) : createLayer(this, this.params.layer));
        this.rates = this.layers.map((layer) => layer.emissionOverTime.value);
    }
}

export class RegionEmitter {
    constructor(effect) {
        this.effect = effect;
        const { region3d, field, fx } = effect;
        const spec = fx.theme.particles;
        const quality = getQuality();
        this.shape = new RegionShape(this);
        this.drift = spec.drift ?? 0;
        const raised = region3d.height > 0.02;
        const types = region3d.region.shapes.map((shape) => shape.type);
        this.volume = raised && !spec.ground && region3d.children.every((child) => child.containsPoint) && types.every((type) => VOLUMES.includes(type));
        this.low = raised && types.every((type) => type === "circle") ? (region3d.bottom + region3d.top) / 2 : region3d.bottom;
        this.high = raised && !spec.ground ? region3d.top : this.low;
        this.anchor = new THREE.Vector3((field.bounds.minX + field.bounds.maxX) / 2, this.low, (field.bounds.minZ + field.bounds.maxZ) / 2);
        this.rate = Math.min(MAX_RATE * quality.particleScale, Math.max(1, spec.rate * field.area * DENSITY * quality.particleScale * fx.intensity));
        const custom = fx.colors !== fx.theme.colors;
        const colors = custom ? fx.colors : spec.colors;
        const [start, end] = spec.flame ? [...colors].reverse() : colors;
        const alpha = spec.alpha ?? (spec.blend === "add" ? 1 : 0.45);
        this.params = {
            type: "regionfill",
            id: `regionFx.${region3d.region.id}`,
            duration: Infinity,
            color: { start: [start], end: [end] },
            scale: { start: spec.size[1], end: 0 },
            flame: spec.flame ? { size: spec.size[1], lift: spec.rise, rate: this.rate / 18, life: spec.life[1], core: 0, shape: this.shape } : null,
            layer: {
                sprite: spec.sprite,
                blend: spec.blend,
                life: spec.life,
                size: spec.size,
                speed: spec.rise,
                rate: this.rate,
                rotation: spec.upright ? 0 : true,
                spin: spec.upright ? undefined : [-0.4, 0.4],
                shape: this.shape,
                color: [[0, "start", 0], [0.2, "start", alpha], [0.7, "end", alpha * 0.7], [1, "end", 0]],
                sizeOverLife: spec.blend === "add" ? "fade" : "swell",
                order: spec.blend === "add" ? ORDER.glow : ORDER.smoke,
            },
        };
    }

    samplePoint(target, reveal) {
        const { field, origin } = this.effect;
        for (let i = 0; i < ATTEMPTS; i++) {
            if (!field.randomPoint(sample)) break;
            if (Math.hypot(sample.x - origin.x, sample.z - origin.z) > reveal && i < ATTEMPTS - 1) continue;
            sample.y = this.low + Math.random() * (this.high - this.low);
            if (this.volume && i < ATTEMPTS - 1 && !this.effect.region3d.testPoint(sample)) continue;
            return target.copy(sample).sub(this.anchor);
        }
        return target.set(0, 0, 0);
    }

    async start() {
        const engine = game.Levels3DPreview.particleSystem;
        if (!getQuality().enabled || !engine?.system) return;
        const fill = new RegionFill(null, this.anchor.clone(), this.params);
        await fill.init();
        if (this.stopped) return fill.dispose();
        engine.scene.add(fill.emitter);
        fill.particleSystems.forEach((system) => engine.system.addSystem(system));
        engine.effects.add(fill);
        this.fill = fill;
    }

    update(state) {
        const fill = this.fill;
        if (!fill?.layers) return;
        this.shape.reveal = state.y < 1 ? state.y * 1.2 * this.effect.reach : Infinity;
        const surge = state.w / Math.max(this.effect.fx.intensity, 0.01);
        const level = (1 + (surge - 1) * CAST_BOOST) * state.x;
        fill.layers.forEach((layer, i) => (layer.emissionOverTime.value = fill.rates[i] * level));
    }

    stop() {
        this.stopped = true;
        const engine = game.Levels3DPreview.particleSystem;
        if (this.fill && engine?.effects.has(this.fill)) engine.disposeEffect(this.fill);
        this.fill = null;
    }

    dispose() {
        this.stop();
    }
}
