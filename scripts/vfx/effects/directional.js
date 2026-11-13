import * as THREE from "three";
import { registerEffects, PARTICLE_SYSTEMS } from "../registry.js";
import { ORDER, flame } from "../layers/index.js";
import { BaseDirectionalEffect } from "../base/BaseDirectionalEffect.js";
import { Particle3D } from "../api.js";
import { Strip, Beam, Bolt, addPrimitive, updatePrimitives } from "../primitives/index.js";
import { ProjectedDecal, Distortion, capabilities } from "../render/index.js";
import { sustained, ConeVolume, Footprint, Disc, groundBelow } from "./sustain.js";

const UP = new THREE.Vector3(0, 1, 0);
const point = new THREE.Vector3();

export class ConeEffect extends BaseDirectionalEffect {
    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    get travel() {
        return 0.6;
    }

    get intensity() {
        return Math.max(this.params.presetIntensity ?? 1, 0);
    }

    async createEmitter() {
        const { apex, axis, length, end } = this.cone;
        this._handles = [];
        this.emitter = new THREE.Group();
        this.emitter.position.copy(apex);
        this.emitter.lookAt(point.copy(apex).add(axis));
        this.emitter.updateMatrixWorld(true);
        this.L = length;
        this.D = Math.max(end * 2, length * 0.12);
        this.k = Math.clamp(Math.sqrt((length * this.D) / 0.09), 0.5, 2.5) * this.intensity;
        this.s = this.sizeFactor;
        this.speed = length / this.travel;
        this.ground = this.createGround();
        if (this.params.cone && !this.ground.vertical) {
            const ground = this.ground.group.getWorldPosition(new THREE.Vector3());
            this.emitter.position.y += Math.max(end * 0.45 - (apex.y - ground.y), 0);
            this.emitter.updateMatrixWorld(true);
            this.ground.group.position.copy(this.emitter.worldToLocal(ground));
        }
        await this.build();
        if (!this.isLight) this.addConeLight();
    }

    createGround() {
        const { apex, axis, length } = this.cone;
        const horizontal = new THREE.Vector3(axis.x, 0, axis.z);
        const flat = horizontal.length();
        const tip = apex.clone().addScaledVector(axis, length);
        const probe = flat < 0.5 ? apex : tip;
        const groundY = groundBelow(probe.clone().addScaledVector(UP, 0.02), Math.min(apex.y, tip.y));
        const drop = apex.y - groundY;
        const reach = axis.y < -0.05 ? Math.min(length, drop / -axis.y) : length;
        const group = new THREE.Group();
        group.position.set(apex.x, groundY, apex.z);
        if (flat > 1e-4) group.rotation.y = Math.atan2(horizontal.x, horizontal.z);
        this.emitter.attach(group);
        const t = reach / length;
        const vertical = flat < 0.5;
        const footprint = {
            group,
            vertical,
            reach,
            length: reach * Math.max(flat, 0.0001),
            near: this.cone.radius,
            far: this.widthAt(t),
            center: new THREE.Vector3(0, 0, reach * flat * (vertical ? 1 : 0.55)),
            airborne: drop > length * 0.6 && !vertical,
        };
        return footprint;
    }

    groundShape(from = 0.15) {
        const g = this.ground;
        if (g.vertical) return new Disc({ radius: Math.max(g.far, 0.02), height: 0.004 });
        return new Footprint({ length: g.length, near: g.near, far: g.far, from });
    }

    flow(spec) {
        const { from = 0, to = 0.1, flatten = 1, ...rest } = spec;
        const narrow = this.cone.end < Math.max(this.cone.radius * 1.5, this.L * 0.06);
        if (narrow && Array.isArray(rest.sizeOverLife)) rest.sizeOverLife = rest.sizeOverLife.map((v) => 0.6 + v * 0.4);
        return sustained(this, { speed: this.speed, life: [this.travel * 0.85, this.travel * 1.1], shape: new ConeVolume({ length: this.L, angle: this.cone.angle, radius: this.cone.radius, from, to, flatten }), fade: this.travel, ...rest });
    }

    onGround(spec) {
        return sustained(this, { world: true, shape: this.groundShape(spec.from), fade: 0.8, ...spec });
    }

    async groundLayers(...layers) {
        if (this.ground.airborne) return [];
        const systems = await this.addTo(this.ground.group, ...layers);
        if (this.ground.vertical) for (const system of systems) system.emitter.position.z += this.ground.center.z;
        return systems;
    }

    addDecal(options) {
        if (!capabilities.decals || this.ground.airborne) return null;
        const decal = new ProjectedDecal({ depth: Math.max(this.D, 0.1), falloff: 1.4, life: Infinity, fadeIn: 0.4, ...options });
        this.ground.group.add(decal);
        this._handles.push(decal);
        return decal;
    }

    groundGlow(color, opacity) {
        const g = this.ground;
        const count = g.vertical ? 1 : 3;
        for (let i = 0; i < count; i++) {
            const t = g.vertical ? 1 : 0.3 + i * 0.3;
            const z = g.vertical ? g.center.z : g.length * t;
            this.addDecal({ position: new THREE.Vector3(0, 0, z), size: Math.max(this.widthAt((g.reach / this.L) * t) * 2.6, this.D * 0.4), color, opacity });
        }
    }

    addHaze(strength = 0.015) {
        if (!capabilities.distortion) return;
        const haze = new Distortion({ position: new THREE.Vector3(0, 0, this.L * 0.5), size: Math.max(this.D, this.L * 0.4), strength, life: Infinity, fadeIn: 0.3 });
        this.emitter.add(haze);
        this._handles.push(haze);
    }

    leaveScorch(color, opacity, blending = "multiply") {
        if (!this.from || !capabilities.decals || this.ground.airborne) return;
        const g = this.ground;
        g.group.updateMatrixWorld(true);
        const position = g.group.localToWorld(g.center.clone());
        const size = Math.max(g.far * 2.2, this.D * 0.6);
        game.Levels3DPreview.scene.add(new ProjectedDecal({ position, size, depth: Math.max(this.D, 0.1), rotation: g.group.rotation.y, color, opacity, blending, falloff: 1.1, life: 6, fadeIn: 0.1, fadeOut: 3 }));
    }

    addConeLight(options = {}) {
        this.coneLight = this.emitLight({ intensity: 6 * Math.min(this.intensity, 1.5), distance: this.L * 1.5, curve: "steady", duration: Infinity, position: new THREE.Vector3(0, 0, this.L * 0.4), ...options });
    }

    get envelope() {
        return Math.min(1, this._age / 0.25);
    }

    animate(delta) {
        updatePrimitives(this, delta);
        this.update?.(delta);
        super.animate(delta);
    }

    releaseLights() {
        super.releaseLights();
        this._handles?.forEach((handle) => handle.end(0.4));
        this._primitives?.forEach((primitive) => (primitive.visible = false));
        if (this.ended && !this._scorched) {
            this._scorched = true;
            this.onScorch?.();
        }
    }

    dispose() {
        super.dispose();
        this._handles?.forEach((handle) => handle.dispose());
        this._handles = [];
    }
}

export class DirectionalBreathParticle extends ConeEffect {
    static get DEFAULT_SCALE() {
        return 2;
    }

    get travel() {
        return Math.clamp(this.cone.length * 1.2, 0.45, 0.9);
    }

    async build() {
        const { D, k, s } = this;
        await this.add(
            this.flow({
                sprite: "smoke",
                frames: "animate",
                mode: "stretched",
                stretch: 0.5 / this.speed,
                lengthFactor: 0.8,
                life: [this.travel * 0.8, this.travel * 1.05],
                size: [D * 0.6 * s, D * 0.85 * s],
                rate: 45 * k,
                force: [0, D * 0.6, 0],
                color: [
                    [0, "white", 0],
                    [0.06, "end", 0.9],
                    [0.35, "start", 0.75],
                    [0.75, "start", 0.3],
                    [1, "start", 0],
                ],
                sizeOverLife: [0.15, 0.5, 0.85, 1],
                order: ORDER.body,
            }),
            this.flow({
                sprite: "smoke",
                frames: "animate",
                blend: "normal",
                lit: false,
                mode: "stretched",
                stretch: 0.5 / this.speed,
                lengthFactor: 0.8,
                life: [this.travel * 0.8, this.travel * 1.05],
                size: [D * 0.7 * s, D * 1 * s],
                rate: 18 * k,
                force: [0, D * 0.6, 0],
                color: [
                    [0, "start", 0],
                    [0.2, "start", 0.3],
                    [0.7, "start", 0.15],
                    [1, "start", 0],
                ],
                sizeOverLife: [0.15, 0.5, 0.85, 1.05],
                order: ORDER.smoke + 1,
            }),
            this.flow({
                sprite: "fire",
                life: [this.travel * 0.6, this.travel * 0.8],
                size: [D * 0.4 * s, D * 0.55 * s],
                rotation: true,
                spin: [-3, 3],
                rate: 30 * k,
                to: 0.05,
                color: [
                    [0, "core", 0],
                    [0.1, "core", 0.6],
                    [0.5, "start", 0.45],
                    [1, "start", 0],
                ],
                sizeOverLife: [0.1, 0.4, 0.8, 1],
                order: ORDER.glow,
            }),
            this.flow({
                sprite: "smoke9x9",
                blend: "normal",
                life: [this.travel * 1.4, this.travel * 2],
                size: [D * 0.8 * s, D * 1.2 * s],
                rotation: true,
                spin: [-0.6, 0.6],
                rate: 6 * k,
                from: 0.4,
                to: 0.8,
                speed: this.speed * 0.4,
                force: [0, D * 0.8, 0],
                color: [
                    [0, "black", 0],
                    [0.3, "black", 0.3],
                    [1, "smoke", 0],
                ],
                sizeOverLife: [0.6, 0.9, 1.2, 1.5],
                order: ORDER.smoke,
            }),
            this.flow({
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.05,
                life: [this.travel * 0.9, this.travel * 1.6],
                size: [D * 0.04 * s, D * 0.08 * s],
                speed: [this.speed * 0.9, this.speed * 1.4],
                rate: 18 * k,
                force: [0, D * 0.8, 0],
                turbulence: { scale: D, strength: D * 2, speed: 1 },
                color: [
                    [0, "white", 1],
                    [0.2, "spark", 1],
                    [0.7, "end", 0.8],
                    [1, "edge", 0],
                ],
                order: ORDER.sparks,
            }),
        );
        await this.groundLayers(
            ...flame(this, { size: D * 0.3 * s, lift: D * 0.25, rate: 0.8 * k, core: 0, make: (effect, spec) => this.onGround(spec) }),
            this.onGround({
                sprite: "emberssmall",
                life: [0.8, 1.6],
                size: [D * 0.02 * s, D * 0.045 * s],
                speed: D * 0.5,
                rate: 12 * k,
                turbulence: { scale: D, strength: D, speed: 1 },
                color: [
                    [0, "spark", 0],
                    [0.2, "spark", 1],
                    [1, "edge", 0],
                ],
                sizeOverLife: "shrink",
                order: ORDER.sparks,
            }),
        );
        this.groundGlow(this.palette.light, 0.55);
        this.addHaze();
    }

    update() {
        if (this.coneLight) this.coneLight.intensity = 6 * Math.min(this.intensity, 1.5) * this.envelope * (0.75 + 0.25 * Math.random());
    }

    onScorch() {
        this.leaveScorch("#1a1410", 0.7);
    }
}

export class DirectionalFrostParticle extends ConeEffect {
    static get DEFAULT_SCALE() {
        return 3;
    }

    get travel() {
        return Math.clamp(this.cone.length * 1.5, 0.55, 1.1);
    }

    async build() {
        const { D, k, s } = this;
        await this.add(
            this.flow({
                sprite: "smoke9x9",
                life: [this.travel * 0.9, this.travel * 1.2],
                size: [D * 0.8 * s, D * 1.15 * s],
                rotation: true,
                spin: [-1, 1],
                rate: 45 * k,
                color: [
                    [0, "white", 0],
                    [0.08, "white", 0.75],
                    [0.4, "core", 0.5],
                    [1, "start", 0],
                ],
                sizeOverLife: [0.15, 0.5, 0.9, 1.1],
                order: ORDER.body,
            }),
            this.flow({
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.12,
                life: [this.travel * 0.7, this.travel],
                size: [D * 0.04 * s, D * 0.07 * s],
                speed: [this.speed * 1, this.speed * 1.4],
                rate: 30 * k,
                color: [
                    [0, "white", 0],
                    [0.1, "white", 1],
                    [0.6, "core", 0.8],
                    [1, "start", 0],
                ],
                order: ORDER.sparks,
            }),
            this.flow({
                sprite: "star_04",
                life: [this.travel * 0.9, this.travel * 1.3],
                size: [D * 0.05 * s, D * 0.11 * s],
                rotation: true,
                spin: [-4, 4],
                rate: 20 * k,
                speed: this.speed * 0.8,
                color: [
                    [0, "white", 0],
                    [0.15, "white", 1],
                    [0.7, "core", 0.8],
                    [1, "start", 0],
                ],
                sizeOverLife: "pulse",
                order: ORDER.sparks,
            }),
        );
        await this.groundLayers(
            this.onGround({
                sprite: "smoke9x9",
                mode: "horizontal",
                blend: "normal",
                life: [1.6, 2.4],
                size: [D * 0.5 * s, D * 0.8 * s],
                speed: 0.002,
                rotation: true,
                spin: [-0.3, 0.3],
                rate: 6 * k,
                position: [0, 0.005, 0],
                color: [
                    [0, "core", 0],
                    [0.3, "core", 0.3],
                    [1, "start", 0],
                ],
                sizeOverLife: "grow",
                lit: true,
                soft: false,
                order: ORDER.ground,
            }),
            this.onGround({
                sprite: "star_06",
                mode: "horizontal",
                life: [1.2, 2.2],
                size: [D * 0.08 * s, D * 0.16 * s],
                speed: 0.001,
                rotation: true,
                rate: 10 * k,
                color: [
                    [0, "white", 0],
                    [0.1, "white", 0.9],
                    [1, "core", 0],
                ],
                soft: false,
                order: ORDER.ground,
            }),
        );
        this.groundGlow(this.palette.core, 0.4);
    }

    onScorch() {
        this.leaveScorch(this.palette.core, 0.45, "additive");
    }
}

export class DirectionalPoisonParticle extends ConeEffect {
    static get DEFAULT_SCALE() {
        return 4;
    }

    static get DEFAULT_CONE() {
        return Math.PI / 7;
    }

    get travel() {
        return Math.clamp(this.cone.length * 2.5, 0.9, 1.8);
    }

    async build() {
        const { D, k, s } = this;
        await this.add(
            this.flow({
                sprite: "smoke9x9",
                blend: "normal",
                life: [this.travel * 0.9, this.travel * 1.2],
                size: [D * 0.8 * s, D * 1.2 * s],
                rotation: true,
                spin: [-0.8, 0.8],
                rate: 22 * k,
                force: [0, -D * 0.1, 0],
                turbulence: { scale: D, strength: D * 0.5, speed: 0.5 },
                color: [
                    [0, "start", 0],
                    [0.12, "start", 0.55],
                    [0.6, "end", 0.4],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.2, 0.6, 1, 1.25],
                order: ORDER.smoke,
            }),
            this.flow({
                sprite: "smoke9x9",
                life: [this.travel * 0.7, this.travel],
                size: [D * 0.6 * s, D * 0.9 * s],
                rotation: true,
                spin: [-1, 1],
                rate: 12 * k,
                color: [
                    [0, "glow", 0],
                    [0.2, "glow", 0.22],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.2, 0.6, 1, 1.2],
                order: ORDER.body,
            }),
            this.flow({
                sprite: "emberssmall",
                life: [this.travel * 0.8, this.travel * 1.3],
                size: [D * 0.03 * s, D * 0.07 * s],
                speed: this.speed * 0.8,
                rate: 16 * k,
                turbulence: { scale: D, strength: D * 1.5, speed: 1 },
                color: [
                    [0, "spark", 0],
                    [0.2, "spark", 1],
                    [1, "glow", 0],
                ],
                sizeOverLife: "pulse",
                order: ORDER.sparks,
            }),
        );
        await this.groundLayers(
            this.onGround({
                sprite: "smoke9x9",
                blend: "normal",
                life: [2, 3],
                size: [D * 0.5 * s, D * 0.8 * s],
                speed: D * 0.05,
                rotation: true,
                spin: [-0.3, 0.3],
                rate: 7 * k,
                position: [0, 0.01, 0],
                color: [
                    [0, "end", 0],
                    [0.3, "end", 0.4],
                    [1, "start", 0],
                ],
                sizeOverLife: "grow",
                order: ORDER.smoke,
                fade: 1.2,
            }),
        );
        this.groundGlow(this.palette.glow, 0.3);
    }

    onScorch() {
        this.leaveScorch(this.palette.glow, 0.35, "additive");
    }
}

export class DirectionalShockParticle extends ConeEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    get travel() {
        return 0.25;
    }

    async build() {
        const { D, k, s, L } = this;
        const p = this.palette;
        const chains = Math.clamp(Math.round(2 + k), 2, 5);
        this.chains = [];
        for (let i = 0; i < chains; i++) {
            const options = { core: p.white, glow: p.glow, width: Math.max(D * 0.12, 0.012) * s, coreWidth: 0.12, glowPower: 4, head: 1, depth: 4, jitter: 0.28, branches: 1, branchLength: 0.25 };
            const first = addPrimitive(this, new Bolt({ start: new THREE.Vector3(), end: new THREE.Vector3(0, 0, L * 0.5), ...options }));
            const second = addPrimitive(this, new Bolt({ start: new THREE.Vector3(0, 0, L * 0.5), end: new THREE.Vector3(0, 0, L), ...options, width: options.width * 0.75 }));
            this.chains.push({ first, second, timer: Math.random() * 0.1 });
        }
        await this.add(
            this.flow({
                sprite: "spark_arc",
                life: [0.08, 0.16],
                size: [D * 0.25 * s, D * 0.45 * s],
                speed: 0,
                rotation: true,
                rate: 40 * k,
                to: 1,
                color: [
                    [0, "white", 1],
                    [0.4, "core", 0.9],
                    [1, "start", 0],
                ],
                order: ORDER.glow,
                fade: 0.1,
            }),
            this.flow({
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.04,
                life: [0.2, 0.45],
                size: [D * 0.03 * s, D * 0.06 * s],
                speed: [this.speed * 0.5, this.speed * 1.2],
                rate: 24 * k,
                to: 1,
                gravity: D * 6,
                color: [
                    [0, "white", 1],
                    [0.3, "core", 1],
                    [1, "start", 0],
                ],
                order: ORDER.sparks,
                fade: 0.2,
            }),
            sustained(this, {
                sprite: "emberssmall",
                world: false,
                life: [0.08, 0.16],
                size: [D * 0.5 * s, D * 0.8 * s],
                rate: 14,
                color: [
                    [0, "core", 0.7],
                    [1, "start", 0],
                ],
                order: ORDER.glow,
                fade: 0.1,
            }),
        );
        await this.groundLayers(
            this.onGround({
                sprite: "spark_arc",
                mode: "horizontal",
                life: [0.08, 0.18],
                size: [D * 0.15 * s, D * 0.3 * s],
                rotation: true,
                rate: 12 * k,
                position: [0, 0.004, 0],
                color: [
                    [0, "white", 1],
                    [1, "start", 0],
                ],
                soft: false,
                order: ORDER.ground,
                fade: 0.1,
            }),
        );
        this.groundGlow(this.palette.glow, 0.35);
    }

    randomPoint(target, from, to) {
        const t = from + (to - from) * Math.random();
        const width = this.widthAt(t) * Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        return target.set(Math.cos(theta) * width, Math.sin(theta) * width, t * this.L);
    }

    update(delta) {
        const envelope = this.envelope;
        for (const chain of this.chains) {
            chain.timer -= delta;
            if (chain.timer > 0) continue;
            chain.timer = 0.05 + Math.random() * 0.1;
            const visible = Math.random() < 0.8;
            chain.first.visible = chain.second.visible = visible;
            if (!visible) continue;
            const middle = this.randomPoint(chain.second.start, 0.3, 0.6);
            chain.first.setEnds(this.randomPoint(chain.first.start, 0, 0.08), middle).strike();
            chain.second.setEnds(middle, this.randomPoint(chain.second.end, 0.75, 1)).strike();
            chain.first.opacity = chain.second.opacity = envelope * (0.6 + Math.random() * 0.4);
        }
        if (this.coneLight) this.coneLight.intensity = 6 * Math.min(this.intensity, 1.5) * envelope * (0.4 + Math.random() * 0.8);
    }
}

export class DirectionalWaveParticle extends ConeEffect {
    static get DEFAULT_SCALE() {
        return 6;
    }

    static get DEFAULT_CONE() {
        return Math.PI / 6;
    }

    get travel() {
        return Math.clamp(this.cone.length * 1.6, 0.6, 1.2);
    }

    async build() {
        const { D, k, s } = this;
        const p = this.palette;
        const count = 4;
        this.arcs = [];
        for (let i = 0; i < count; i++) {
            const arc = addPrimitive(this, new Strip({ core: p.core, glow: p.start, width: 0.02, coreWidth: 0.2, glowPower: 1.6, noise: 0.6, scroll: 1.5, frequency: 6 }));
            arc.points = Array.from({ length: 17 }, () => new THREE.Vector3());
            this.arcs.push({ arc, phase: i / count });
        }
        await this.add(
            this.flow({
                sprite: "smoke9x9",
                life: [this.travel * 0.9, this.travel * 1.1],
                size: [D * 0.6 * s, D * 0.9 * s],
                rotation: true,
                spin: [-0.5, 0.5],
                rate: 10 * k,
                color: [
                    [0, "start", 0],
                    [0.3, "start", 0.12],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.2, 0.6, 1, 1.2],
                order: ORDER.smoke,
            }),
            this.flow({
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.06,
                life: [this.travel * 0.8, this.travel],
                size: [D * 0.03 * s, D * 0.05 * s],
                rate: 20 * k,
                color: [
                    [0, "core", 0],
                    [0.2, "core", 0.9],
                    [1, "end", 0],
                ],
                order: ORDER.sparks,
            }),
        );
        await this.groundLayers(
            this.onGround({
                sprite: "dust",
                blend: "normal",
                life: [0.8, 1.4],
                size: [D * 0.2 * s, D * 0.35 * s],
                speed: D * 0.3,
                rotation: true,
                rate: 8 * k,
                color: [
                    [0, "ash", 0],
                    [0.2, "ash", 0.18],
                    [1, "ash", 0],
                ],
                sizeOverLife: "grow",
                order: ORDER.smoke,
            }),
        );
        this.groundGlow(this.palette.glow, 0.25);
        this.update();
    }

    update() {
        const time = this._age / this.travel;
        const envelope = this.envelope;
        const { angle, radius } = this.cone;
        for (const { arc, phase } of this.arcs) {
            const t = (time + phase) % 1;
            const distance = t * this.L;
            const width = radius + distance * Math.tan(angle);
            arc.points.forEach((p, i) => {
                const u = (i / (arc.points.length - 1)) * 2 - 1;
                p.set(u * width, 0, distance * Math.cos(u * angle) + radius * 0.2 * (1 - u * u));
            });
            arc.setLines([{ points: arc.points, widths: (u) => Math.sin(Math.PI * u) }]);
            arc.width = Math.max(this.D * 0.18 * t, 0.01) * this.s;
            arc.opacity = Math.sin(Math.PI * t) * envelope * 0.9;
        }
    }
}

export class DirectionalLaserParticle extends ConeEffect {
    static get DEFAULT_SCALE() {
        return 0.5;
    }

    static get DEFAULT_CONE() {
        return 0;
    }

    get travel() {
        return 0.4;
    }

    async build() {
        const { L, s } = this;
        const p = this.palette;
        const width = Math.max(this.cone.radius * 2, 0.012 * s);
        this.end = new THREE.Vector3(0, 0, L);
        this.glowBeam = addPrimitive(this, new Beam({ start: new THREE.Vector3(), end: this.end, core: p.core, glow: p.start, width: width * 3, coreWidth: 0.08, glowPower: 3, noise: 0.5, scroll: 6, frequency: L * 12, wobble: 0 }));
        this.coreBeam = addPrimitive(this, new Beam({ start: new THREE.Vector3(), end: this.end, core: p.white, glow: p.core, width, coreWidth: 0.35, glowPower: 2, noise: 0.2, scroll: 10, frequency: L * 20 }));
        this.sweep = this.cone.angle > 0.05;
        const systems = await this.add(
            sustained(this, {
                sprite: "emberssmall",
                world: false,
                life: 0.2,
                size: [width * 6, width * 8],
                rate: 15,
                color: [
                    [0, "core", 0.8],
                    [1, "start", 0],
                ],
                order: ORDER.glow,
                fade: 0.1,
            }),
            sustained(this, {
                sprite: "star_09",
                world: false,
                life: 0.15,
                size: [width * 8, width * 12],
                rotation: true,
                rate: 12,
                color: [
                    [0, "white", 0.9],
                    [1, "start", 0],
                ],
                order: ORDER.glow,
                fade: 0.1,
            }),
            sustained(this, {
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.05,
                life: [0.2, 0.5],
                size: [width * 0.6, width * 1.2],
                speed: [L * 0.6, L * 1.4],
                rate: 25 * this.intensity,
                shape: { type: "sphere", radius: width },
                gravity: L * 4,
                color: [
                    [0, "white", 1],
                    [0.3, "core", 1],
                    [1, "start", 0],
                ],
                order: ORDER.sparks,
                fade: 0.2,
            }),
            !this.sweep &&
                this.flow({
                    sprite: "emberssmall",
                    life: [0.3, 0.6],
                    size: [width * 1.5, width * 3],
                    speed: 0,
                    rate: 20 * this.intensity,
                    to: 1,
                    color: [
                        [0, "core", 0],
                        [0.3, "core", 0.6],
                        [1, "start", 0],
                    ],
                    sizeOverLife: "pulse",
                    order: ORDER.sparks,
                }),
        );
        this.impactSystems = systems.slice(1, 3);
        for (const system of this.impactSystems) system.emitter.position.copy(this.end);
    }

    update() {
        const envelope = this.envelope;
        if (this.sweep) {
            const angle = this.cone.angle * Math.sin(this._age * 1.6);
            this.end.set(Math.sin(angle) * this.L, 0, Math.cos(angle) * this.L);
            for (const system of this.impactSystems) system.emitter.position.copy(this.end);
        }
        const flicker = 0.85 + Math.random() * 0.15;
        this.glowBeam.setEnds(this.glowBeam.start, this.end).opacity = envelope * 0.8 * flicker;
        this.coreBeam.setEnds(this.coreBeam.start, this.end).opacity = envelope * flicker;
        this.glowBeam.head = this.coreBeam.head = Math.min(1, this._age / 0.15);
    }
}

export function playDirectional(type, { origin, target, angle = 0, radius = 0, length, color, scale = 1, duration = Infinity, intensity = 1, name } = {}) {
    const effectClass = PARTICLE_SYSTEMS.TEMPLATE_PARTICLE_SYSTEMS[type];
    if (!effectClass) return null;
    const particle = new Particle3D(type).to(origin.clone()).scale(effectClass.DEFAULT_SCALE * scale).duration(duration).presetIntensity(intensity);
    if (color) particle.color(...color);
    if (name) particle.name(name);
    particle.params.cone = { origin: origin.toArray(), target: target.toArray(), angle, radius, length };
    return particle.start(false);
}

registerEffects("directional", {
    directionalfire: DirectionalBreathParticle,
    directionalshock: DirectionalShockParticle,
    directionalpoison: DirectionalPoisonParticle,
    directionalwave: DirectionalWaveParticle,
    directionalfrost: DirectionalFrostParticle,
    directionallaser: DirectionalLaserParticle,
});
