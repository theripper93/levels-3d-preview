import * as THREE from "three";
import { registerEffects } from "../registry.js";
import { ORDER } from "../layers/index.js";
import { BasePresetEffect } from "../base/BasePresetEffect.js";
import { BasicCustomParticle } from "../base/BasicCustomParticle.js";
import { sustained, Disc, PullToAxis, groundBelow } from "./sustain.js";
import { flameRig, animateFlame, orbit, ringGlow, groundGlow } from "./rigs.js";

export function surfaceOr(effect, shape) {
    return effect.onSurface ? undefined : shape;
}

export class TorchParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.3;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async build() {
        const s = this.params.scale.start;
        await flameRig(this, { size: s * 1.5, radius: Math.clamp(this.params.emitterSize, s * 0.1, s * 0.4), rate: this.intensity, height: 1.2, smoke: 0.7, decal: 0 });
    }

    animate(delta) {
        animateFlame(this);
        super.animate(delta);
    }
}

export class FireParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async build() {
        const s = this.params.scale.start;
        await flameRig(this, { size: s * 0.9, radius: Math.max(this.params.emitterSize, s * 0.15), rate: this.intensity * 1.5, height: 1.2, smoke: 1.3, embers: 2 });
    }

    animate(delta) {
        animateFlame(this);
        super.animate(delta);
    }
}

export class MagicCircleParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.3);
        const I = this.intensity;
        await this.add(
            sustained(this, {
                sprite: "magic_circle_08",
                mode: "horizontal",
                world: false,
                duration: 6,
                prewarm: true,
                life: 6,
                rate: 1 / 3,
                size: R * 2.3,
                rotation: true,
                spin: 0.25,
                position: [0, 0.003, 0],
                color: [
                    [0, "start", 0],
                    [0.25, "start", 0.7],
                    [0.75, "end", 0.7],
                    [1, "end", 0],
                ],
                soft: false,
                order: ORDER.ground,
            }),
            ringGlow(this, R, {
                size: R * 2.25,
                color: [
                    [0, "core", 0],
                    [0.5, "start", 0.6],
                    [1, "end", 0],
                ],
            }),
            sustained(this, {
                sprite: "trace_01",
                mode: "stretched",
                stretch: 0.25,
                world: false,
                life: [0.8, 1.4],
                size: [s * 0.08, s * 0.14],
                speed: [R * 0.4, R * 0.8],
                rate: Math.clamp(R * 60, 6, 40) * I,
                shape: surfaceOr(this, new Disc({ radius: R, thickness: 0.06 })),
                color: [
                    [0, "core", 0],
                    [0.2, "start", 0.9],
                    [0.7, "end", 0.6],
                    [1, "end", 0],
                ],
                order: ORDER.glow,
            }),
            sustained(this, {
                sprite: "emberssmall",
                world: false,
                life: [1.2, 2],
                size: [s * 0.03, s * 0.06],
                speed: [R * 0.15, R * 0.35],
                rate: Math.clamp(R * 30, 3, 20) * I,
                shape: surfaceOr(this, new Disc({ radius: R, thickness: 1 })),
                turbulence: { scale: R, strength: R * 0.3, speed: 1 },
                color: [
                    [0, "spark", 0],
                    [0.2, "spark", 1],
                    [1, "end", 0],
                ],
                sizeOverLife: "pulse",
                order: ORDER.sparks,
            }),
        );
        groundGlow(this, { size: R * 2.4, opacity: 0.45, falloff: 1, maxDrop: R + 0.2 });
    }
}

export class VortexParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 2);
        const I = this.intensity;
        const rate = Math.clamp(R * 120, 10, 60) * I;
        const puff = Math.min(R, s * 10);
        this.applyLightOffset(0.1);
        const swirl = (spec) => ({
            world: false,
            life: [1.2, 2],
            speed: [R * 0.3, R * 0.6],
            shape: surfaceOr(this, new Disc({ radius: R * 0.7, thickness: 0.5 })),
            force: [0, R * 0.25, 0],
            behaviors: [orbit([2.5, 3.5]), new PullToAxis(-0.25)],
            ...spec,
        });
        await this.add(
            sustained(
                this,
                swirl({
                    sprite: "emberssmall",
                    mode: "trail",
                    length: 40,
                    size: s,
                    rate: rate * 0.5,
                    color: [
                        [0, "core", 0],
                        [0.1, "start", 1],
                        [0.6, "end", 0.6],
                        [1, "end", 0],
                    ],
                    sizeOverLife: "shrink",
                    order: ORDER.body,
                }),
            ),
            sustained(
                this,
                swirl({
                    sprite: "emberssmall",
                    size: [s * 1.2, s * 2],
                    rate,
                    color: [
                        [0, "start", 0],
                        [0.15, "start", 0.8],
                        [0.7, "end", 0.4],
                        [1, "end", 0],
                    ],
                    sizeOverLife: "shrink",
                    order: ORDER.glow,
                }),
            ),
            sustained(this, {
                sprite: "twirl",
                mode: "horizontal",
                world: false,
                duration: 2,
                prewarm: true,
                life: 1.6,
                rate: 2.5,
                size: [R * 1.6, R * 2.2],
                rotation: true,
                spin: 4,
                position: [0, 0.005, 0],
                color: [
                    [0, "start", 0],
                    [0.4, "start", 0.45],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.6, 0.9, 1.05, 1.15],
                soft: false,
                order: ORDER.ground,
            }),
            sustained(this, {
                sprite: "smoke9x9",
                blend: "normal",
                world: false,
                life: [1, 1.6],
                size: [puff * 0.4, puff * 0.7],
                speed: R * 0.1,
                rotation: true,
                spin: [-2, 2],
                rate: 4 * I,
                shape: surfaceOr(this, new Disc({ radius: R * 0.8, thickness: 0.4 })),
                behaviors: [orbit(2.5)],
                color: [
                    [0, "smoke", 0],
                    [0.3, "ash", 0.25],
                    [1, "ash", 0],
                ],
                sizeOverLife: "grow",
                order: ORDER.smoke,
            }),
        );
    }
}

export class SparksParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async build() {
        const s = this.params.scale.start;
        const ground = Math.min(await this.getCollision(0), this.emitter.position.y);
        const probability = Math.min(1, 0.3 * this.intensity);
        const bursts = (count) => [0, 0.2].map((time) => ({ time, count, cycle: 1, interval: 0.01, probability }));
        await this.add(
            sustained(this, {
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.05,
                lengthFactor: 0.3,
                duration: 0.4,
                loop: true,
                life: [1.2, 2],
                size: [s * 0.35, s * 0.6],
                speed: [s * 3, s * 6],
                burst: bursts(6),
                shape: surfaceOr(this, { type: "cone", radius: Math.max(this.params.emitterSize, 0.001), angle: Math.PI / 3 }),
                aim: "up",
                gravity: s * 20,
                collide: ground,
                bounce: 0.45,
                color: [
                    [0, "white", 1],
                    [0.1, "spark", 1],
                    [0.5, "end", 0.9],
                    [1, "edge", 0],
                ],
                sizeOverLife: "shrink",
                order: ORDER.sparks,
            }),
            sustained(this, {
                sprite: "star_06",
                world: false,
                duration: 0.4,
                loop: true,
                life: 0.12,
                size: [s * 1.2, s * 2],
                rotation: true,
                burst: bursts(1),
                color: ["white", "start", 0.9, 0],
                sizeOverLife: "pop",
                order: ORDER.glow,
            }),
        );
    }
}

export class HolyLightParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.3);
        const I = this.intensity;
        this.applyLightOffset(0.09);
        await this.add(
            sustained(this, {
                sprite: "trace_06",
                mode: "vertical",
                world: false,
                life: [1.2, 2],
                size: [s * 0.5, s * 0.9],
                speed: s * 0.15,
                rate: Math.clamp(R * 40, 4, 24) * I,
                shape: surfaceOr(this, new Disc({ radius: R, thickness: 0.5 })),
                position: [0, s * 0.2, 0],
                color: [
                    [0, "core", 0],
                    [0.3, "start", 0.55],
                    [0.7, "end", 0.35],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.6, 1, 1, 0.9],
                order: ORDER.glow,
            }),
            sustained(this, {
                sprite: "emberssmall",
                mode: "trail",
                length: 30,
                world: false,
                life: [1.5, 2],
                size: s * 0.05,
                speed: s * 0.2,
                rate: 3 * I,
                shape: surfaceOr(this, new Disc({ radius: R, thickness: 0.1 })),
                behaviors: [orbit(1.4)],
                color: [
                    [0, "core", 0],
                    [0.2, "start", 1],
                    [1, "end", 0],
                ],
                order: ORDER.glow,
            }),
            sustained(this, {
                sprite: "star",
                world: false,
                life: [1, 1.8],
                size: [s * 0.08, s * 0.16],
                speed: [s * 0.2, s * 0.5],
                rotation: true,
                rate: Math.clamp(R * 30, 4, 16) * I,
                shape: surfaceOr(this, new Disc({ radius: R, thickness: 1, height: s * 0.3 })),
                color: [
                    [0, "white", 0],
                    [0.3, "core", 1],
                    [1, "end", 0],
                ],
                sizeOverLife: "pulse",
                order: ORDER.sparks,
            }),
            ringGlow(this, R, {
                color: [
                    [0, "core", 0],
                    [0.5, "start", 0.55],
                    [1, "end", 0],
                ],
            }),
        );
        groundGlow(this, { size: R * 2.6, opacity: 0.5, falloff: 1.2, maxDrop: R + 0.2 });
    }
}

export class GhostlyParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.3);
        const I = this.intensity;
        this.applyLightOffset(0.09);
        await this.add(
            sustained(this, {
                sprite: "flame_wisp",
                world: false,
                life: [1.6, 2.4],
                size: [s * 0.3, s * 0.5],
                speed: s * 0.12,
                rotation: true,
                spin: [-0.8, 0.8],
                rate: Math.clamp(R * 40, 4, 20) * I,
                shape: surfaceOr(this, new Disc({ radius: R * 0.8, thickness: 1, height: s * 0.2 })),
                behaviors: [orbit(0.4)],
                turbulence: { scale: s, strength: s * 0.3, speed: 0.6 },
                color: [
                    [0, "start", 0],
                    [0.3, "start", 0.4],
                    [0.7, "end", 0.25],
                    [1, "end", 0],
                ],
                sizeOverLife: "grow",
                order: ORDER.body,
            }),
            sustained(this, {
                sprite: "emberssmall",
                mode: "trail",
                length: 45,
                world: false,
                life: [1.5, 2.2],
                size: s * 0.06,
                speed: s * 0.25,
                rate: Math.clamp(R * 15, 2, 8) * I,
                shape: surfaceOr(this, new Disc({ radius: R * 0.8, thickness: 1 })),
                behaviors: [orbit([0.6, 1.2])],
                color: [
                    [0, "core", 0],
                    [0.2, "core", 0.8],
                    [1, "end", 0],
                ],
                order: ORDER.glow,
            }),
            sustained(this, {
                sprite: "smoke9x9",
                mode: "horizontal",
                world: false,
                duration: 3,
                prewarm: true,
                life: [2.5, 3.5],
                size: [R * 0.8, R * 1.2],
                rotation: true,
                spin: [-0.3, 0.3],
                rate: 1.5,
                shape: surfaceOr(this, new Disc({ radius: R * 0.5 })),
                position: [0, 0.006, 0],
                color: [
                    [0, "start", 0],
                    [0.5, "start", 0.12],
                    [1, "end", 0],
                ],
                soft: false,
                order: ORDER.ground,
            }),
        );
    }
}

export class FairyParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.05;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = Math.max(this.params.scale.start, 0.004);
        const R = Math.max(this.params.emitterSize, 0.03);
        const I = this.intensity;
        const rate = Math.clamp(R * 25, 2, 12) * I;
        const flight = () => ({ world: false, life: [3, 4.5], shape: surfaceOr(this, { type: "sphere", radius: R }), noise: [[0.1, 0.1, 0.1], [0.1, 0.03, 0.1]], behaviors: [orbit([0.8, 1.2])] });
        await this.add(
            sustained(this, {
                ...flight(),
                sprite: "emberssmall",
                mode: "trail",
                length: 20,
                size: s,
                rate,
                color: [
                    [0, "core", 0],
                    [0.1, "start", 0.9],
                    [0.7, "end", 0.6],
                    [1, "end", 0],
                ],
                order: ORDER.glow,
            }),
            sustained(this, {
                ...flight(),
                sprite: "stars",
                size: [s * 1.2, s * 2],
                rotation: true,
                spin: [-2, 2],
                rate,
                color: [
                    [0, "white", 0],
                    [0.15, "core", 1],
                    [0.8, "start", 0.8],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.6, 1.1, 0.7, 1],
                order: ORDER.sparks,
            }),
            sustained(this, {
                sprite: "emberssmall",
                life: [0.8, 1.4],
                size: [s * 0.5, s],
                speed: s,
                rate: rate * 1.5,
                shape: surfaceOr(this, { type: "sphere", radius: R }),
                gravity: s * 3,
                color: [
                    [0, "spark", 0],
                    [0.2, "spark", 1],
                    [1, "end", 0],
                ],
                sizeOverLife: "pulse",
                order: ORDER.sparks,
            }),
        );
    }
}

export class SmokeCloudParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.15);
        const I = this.intensity;
        const rate = Math.clamp((R / (s * 0.25)) ** 2 * 1.5, 2, 14) * I;
        const puff = {
            sprite: "smoke9x9",
            blend: "normal",
            duration: 4,
            prewarm: true,
            rotation: true,
            spin: [-0.25, 0.25],
            shape: surfaceOr(this, new Disc({ radius: R, height: s * 0.25 })),
            turbulence: { scale: s, strength: s * 0.08, speed: 0.3 },
            force: [0, s * 0.03, 0],
            wind: 0.7,
            fade: 1.2,
            order: ORDER.smoke,
        };
        await this.add(
            sustained(this, {
                ...puff,
                life: [4, 6],
                size: [s * 0.45, s * 0.75],
                speed: s * 0.02,
                rate,
                color: [
                    [0, "start", 0],
                    [0.12, "start", 0.55],
                    [0.6, "end", 0.45],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.7, 0.9, 1.1, 1.25],
            }),
            sustained(this, {
                ...puff,
                life: [3, 4.5],
                size: [s * 0.3, s * 0.5],
                speed: s * 0.03,
                rate: rate * 0.7,
                position: [0, s * 0.12, 0],
                color: [
                    [0, "end", 0],
                    [0.15, "end", 0.5],
                    [1, "start", 0],
                ],
                sizeOverLife: [0.6, 0.9, 1.1, 1.3],
            }),
        );
    }
}

export class MysteriousLightsParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.3;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.5);
        const I = this.intensity;
        this.applyLightOffset(0.1);
        const drift = () => ({ world: false, shape: surfaceOr(this, new Disc({ radius: R, height: Math.max(s * 0.6, R * 0.3) })), turbulence: { scale: R, strength: s * 0.25, speed: 0.4 }, behaviors: [orbit(0.08)] });
        await this.add(
            sustained(this, {
                ...drift(),
                sprite: "emberssmall",
                life: [4, 7],
                size: [s * 0.35, s * 0.55],
                speed: s * 0.03,
                rate: Math.clamp(R * 5, 0.6, 5) * I,
                color: [
                    [0, "start", 0],
                    [0.2, "start", 0.9],
                    [0.5, "core", 1],
                    [0.8, "end", 0.8],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.5, 1.1, 0.8, 1],
                order: ORDER.glow,
                fade: 1,
            }),
            sustained(this, {
                ...drift(),
                sprite: "emberssmall",
                mode: "trail",
                length: 40,
                life: [3, 5],
                size: s * 0.05,
                speed: s * 0.05,
                rate: Math.clamp(R * 3, 0.4, 3) * I,
                color: [
                    [0, "start", 0],
                    [0.3, "core", 0.6],
                    [1, "end", 0],
                ],
                order: ORDER.sparks,
                fade: 1,
            }),
        );
    }
}

export class SunburstParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 3);
        const core = Math.min(R, s * 10);
        const I = this.intensity;
        await this.add(
            sustained(this, {
                sprite: "trace_06_rotated",
                mode: "stretched",
                stretch: 0.6,
                world: false,
                life: [0.9, 1.4],
                size: [s * 0.6, s],
                speed: [R * 0.5, R * 0.9],
                rate: Math.clamp(R * 60, 10, 40) * I,
                shape: surfaceOr(this, { type: "sphere", radius: s * 0.1 }),
                color: [
                    [0, "core", 0],
                    [0.15, "core", 0.9],
                    [0.5, "start", 0.6],
                    [1, "end", 0],
                ],
                order: ORDER.glow,
            }),
            sustained(this, {
                sprite: "spiral_4",
                world: false,
                duration: 4,
                prewarm: true,
                life: 4,
                rate: 0.5,
                size: R * 1.4,
                rotation: true,
                spin: 0.25,
                color: [
                    [0, "start", 0],
                    [0.5, "start", 0.3],
                    [1, "end", 0],
                ],
                soft: false,
                order: ORDER.smoke,
            }),
            sustained(this, {
                sprite: "star_09",
                world: false,
                life: 0.8,
                rate: 4,
                size: [core * 0.5, core * 0.6],
                rotation: true,
                color: [
                    [0, "core", 0],
                    [0.5, "core", 0.7],
                    [1, "start", 0],
                ],
                soft: false,
                order: ORDER.glow,
            }),
        );
    }
}

export class TeslaParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.6);
        const I = this.intensity;
        const arc = (sprite, rate) =>
            sustained(this, {
                sprite,
                mode: "stretched",
                stretch: 0.04,
                world: false,
                life: [0.12, 0.22],
                size: [s * 0.7, s * 1.3],
                speed: [R * 2, R * 4],
                rate: rate * I,
                shape: surfaceOr(this, { type: "sphere", radius: s * 0.1 }),
                color: [
                    [0, "white", 1],
                    [0.3, "core", 1],
                    [1, "start", 0],
                ],
                order: ORDER.glow,
                fade: 0.2,
            });
        await this.add(
            arc("spark_05_rotated", 16),
            arc("spark_06_rotated", 10),
            sustained(this, {
                sprite: "spark_arc",
                world: false,
                life: [0.1, 0.18],
                size: [s * 1, s * 1.8],
                rotation: true,
                rate: 18 * I,
                shape: surfaceOr(this, { type: "sphere", radius: R * 0.4 }),
                color: [
                    [0, "white", 1],
                    [1, "start", 0],
                ],
                order: ORDER.glow,
                fade: 0.2,
            }),
            sustained(this, {
                sprite: "emberssmall",
                world: false,
                life: [0.1, 0.2],
                size: [s * 0.8, s * 1.4],
                rate: 12,
                color: [
                    [0, "core", 0.6],
                    [1, "start", 0],
                ],
                order: ORDER.glow,
                fade: 0.2,
            }),
            sustained(this, {
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.05,
                life: [0.3, 0.6],
                size: [s * 0.04, s * 0.08],
                speed: [R, R * 2.5],
                rate: 8 * I,
                shape: surfaceOr(this, { type: "sphere", radius: s * 0.2 }),
                gravity: R * 4,
                color: [
                    [0, "white", 1],
                    [1, "start", 0],
                ],
                order: ORDER.sparks,
                fade: 0.2,
            }),
        );
    }
}

export class MagicSphereParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 3);
        const I = this.intensity;
        const ring = (size, rate) => ({
            sprite: "emberssmall",
            mode: "trail",
            length: 60,
            follow: true,
            life: [1.6, 2.4],
            size,
            rate: rate * I,
            shape: surfaceOr(this, { type: "donut", radius: R, thickness: 0.05, donutRadius: 0.001 }),
            color: [
                [0, "core", 0],
                [0.1, "start", 1],
                [0.6, "end", 0.7],
                [1, "end", 0],
            ],
            order: ORDER.glow,
        });
        const systems = await this.add(
            sustained(this, ring(s, 6)),
            sustained(this, ring(s * 0.5, 4)),
            sustained(this, {
                sprite: "light_03",
                world: false,
                duration: 2,
                prewarm: true,
                life: 2,
                rate: 1.5,
                size: R * 2.4,
                color: [
                    [0, "start", 0],
                    [0.5, "start", 0.18],
                    [1, "end", 0],
                ],
                soft: false,
                order: ORDER.smoke,
            }),
            sustained(this, {
                sprite: "emberssmall",
                world: false,
                life: [1, 1.6],
                size: [s * 0.3, s * 0.5],
                rate: 10 * I,
                shape: surfaceOr(this, { type: "sphere", radius: R, thickness: 0.05 }),
                behaviors: [orbit([1, 2])],
                color: [
                    [0, "spark", 0],
                    [0.3, "spark", 1],
                    [1, "end", 0],
                ],
                sizeOverLife: "pulse",
                order: ORDER.sparks,
            }),
        );
        this._donut1 = systems[0].emitter;
        this._donut2 = systems[1].emitter;
        this._donut2.rotation.y = Math.PI / 2;
    }

    animate(delta) {
        const deltaSpeed = delta * 2;
        if (this._donut1) {
            this._donut1.rotation.x += deltaSpeed;
            this._donut1.rotation.z += deltaSpeed;
            this._donut2.rotation.x -= deltaSpeed * 0.8;
            this._donut2.rotation.z += deltaSpeed * 1.2;
        }
        return super.animate(delta);
    }
}

class GroundFog extends BasePresetEffect {
    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    get fogSpec() {
        return {};
    }

    async build() {
        const s = this.params.scale.start;
        const { size = 0.6, sprite = "smoke9x9", mode = "horizontal", alpha = 0.35, height = 0.05 } = this.fogSpec;
        const R = Math.max(this.params.emitterSize, s * 0.4);
        const I = this.intensity;
        const ground = groundBelow(this.emitter.position.clone().add(new THREE.Vector3(0, 0.01, 0)), this.emitter.position.y);
        const drop = Math.min(Math.max(this.emitter.position.y - ground, 0), R);
        const count = Math.clamp((R / (s * size * 0.45)) ** 2, 6, 40) * I;
        await this.add(
            sustained(this, {
                sprite,
                mode,
                blend: "normal",
                world: false,
                duration: 8,
                prewarm: true,
                life: [6, 9],
                size: [s * size, s * size * 1.5],
                speed: s * 0.01,
                rotation: true,
                spin: [-0.12, 0.12],
                rate: count / 7.5,
                shape: surfaceOr(this, new Disc({ radius: R, height: s * height })),
                position: [0, -drop + s * 0.02, 0],
                behaviors: [orbit(0.03)],
                turbulence: { scale: s, strength: s * 0.02, speed: 0.2 },
                color: [
                    [0, "start", 0],
                    [0.25, "start", alpha],
                    [0.75, "end", alpha],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.8, 0.95, 1.05, 1.2],
                order: ORDER.smoke,
                fade: 1.5,
            }),
            sustained(this, {
                sprite: "mist_01",
                blend: "normal",
                world: false,
                duration: 8,
                prewarm: true,
                life: [5, 8],
                size: [s * size * 1.2, s * size * 1.8],
                rate: (count / 7.5) * 0.4,
                shape: surfaceOr(this, new Disc({ radius: R, height: s * height * 2 })),
                position: [0, -drop + s * 0.04, 0],
                behaviors: [orbit(0.05)],
                color: [
                    [0, "start", 0],
                    [0.3, "start", alpha * 0.8],
                    [0.7, "end", alpha * 0.8],
                    [1, "end", 0],
                ],
                order: ORDER.smoke,
                fade: 1.5,
            }),
        );
    }
}

export class MistParticle extends GroundFog {
    static get DEFAULT_SCALE() {
        return 5;
    }

    get fogSpec() {
        return { size: 0.35, mode: "horizontal", alpha: 0.32, height: 0.02 };
    }
}

export class Mist2Particle extends GroundFog {
    static get DEFAULT_SCALE() {
        return 1;
    }

    get fogSpec() {
        return { size: 0.8, sprite: "smoke9x9", mode: "billboard", alpha: 0.28, height: 0.12 };
    }
}

export class GravityWellParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.6);
        const I = this.intensity;
        this.applyLightOffset(0.09);
        const inflow = () => ({ world: false, shape: surfaceOr(this, new Disc({ radius: R, thickness: 0.35, height: s * 0.1 })), behaviors: [orbit([1.5, 2.5]), new PullToAxis(1.2)] });
        await this.add(
            sustained(this, {
                ...inflow(),
                sprite: "emberssmall",
                mode: "trail",
                length: 30,
                life: [1.4, 2],
                size: s * 0.08,
                rate: Math.clamp(R * 40, 6, 30) * I,
                color: [
                    [0, "start", 0],
                    [0.3, "start", 0.9],
                    [0.9, "core", 1],
                    [1, "white", 0],
                ],
                order: ORDER.glow,
            }),
            sustained(this, {
                ...inflow(),
                sprite: "smoke9x9",
                blend: "normal",
                life: [1.6, 2.2],
                size: [s * 0.4, s * 0.7],
                rotation: true,
                spin: [-1.5, -0.5],
                rate: Math.clamp(R * 20, 4, 14) * I,
                color: [
                    [0, "smoke", 0],
                    [0.4, "smoke", 0.45],
                    [1, "black", 0],
                ],
                sizeOverLife: "shrink",
                order: ORDER.smoke,
            }),
            sustained(this, {
                sprite: "twirl",
                mode: "horizontal",
                world: false,
                duration: 2,
                prewarm: true,
                life: 2,
                rate: 2,
                size: [R * 1.5, R * 1.9],
                rotation: true,
                spin: -2.5,
                position: [0, 0.005, 0],
                color: [
                    [0, "start", 0],
                    [0.5, "end", 0.5],
                    [1, "end", 0],
                ],
                sizeOverLife: [1.2, 1, 0.8, 0.6],
                soft: false,
                order: ORDER.ground,
            }),
            sustained(this, {
                sprite: "emberssmall",
                blend: "normal",
                world: false,
                life: 0.6,
                rate: 6,
                size: s * 0.7,
                position: [0, s * 0.25, 0],
                color: [
                    [0, "black", 0.85],
                    [1, "black", 0.85],
                ],
                lit: false,
                soft: false,
                order: ORDER.body,
            }),
            sustained(this, {
                sprite: "circle_01",
                world: false,
                life: 0.6,
                rate: 5,
                size: s * 0.9,
                position: [0, s * 0.25, 0],
                color: [
                    [0, "start", 0],
                    [0.5, "start", 0.8],
                    [1, "end", 0],
                ],
                soft: false,
                order: ORDER.glow,
            }),
        );
    }
}

export class JSONParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = await game.Levels3DPreview.particleSystem.loadVFX(this.params.sprite);
        this.emitter.position.copy(this._target);
        this.emitter.scale.multiplyScalar(this.params.scale.start);
        this.emitter.traverse((child) => {
            if (child.type === "ParticleEmitter") {
                this.particleSystems.push(child.system);
            }
        });
    }
}

registerEffects("presets", { custom: BasicCustomParticle });

registerEffects(
    "presets",
    {
        torch: TorchParticle,
        fire: FireParticle,
        magiccircle: MagicCircleParticle,
        sparks: SparksParticle,
        holy: HolyLightParticle,
        ghostly: GhostlyParticle,
        smokecloud: SmokeCloudParticle,
        mysteriouslights: MysteriousLightsParticle,
        sunburst: SunburstParticle,
        tesla: TeslaParticle,
        mist: MistParticle,
        mist2: Mist2Particle,
        gravitywell: GravityWellParticle,
    },
    { token: true, tile: true },
);

registerEffects(
    "presets",
    {
        vortex: VortexParticle,
        fairy: FairyParticle,
        magicsphere: MagicSphereParticle,
    },
    { token: true },
);

registerEffects("presets", { json: JSONParticle });
