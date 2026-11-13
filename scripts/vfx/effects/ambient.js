import * as THREE from "three";
import { registerEffects } from "../registry.js";
import { ORDER, flame } from "../layers/index.js";
import { BasePresetEffect } from "../base/BasePresetEffect.js";
import { sustained, Disc } from "./sustain.js";
import { flameRig, animateFlame, orbit, ringGlow, groundGlow } from "./rigs.js";
import { surfaceOr } from "./presets.js";

const FORWARD = new THREE.Vector3(0, 0, 1);
const worldPosition = new THREE.Vector3();

class FlamePreset extends BasePresetEffect {
    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    get rig() {
        return {};
    }

    async build() {
        const s = this.params.scale.start;
        const { size = 1, radius = 0.1, maxRadius = 0.4, ...rig } = this.rig;
        await flameRig(this, { size: s * size, radius: Math.clamp(this.params.emitterSize, s * radius, s * maxRadius), rate: this.intensity, ...rig });
        await this.extras?.(s);
    }

    animate(delta) {
        animateFlame(this);
        super.animate(delta);
    }
}

export class CandleParticle extends FlamePreset {
    static get DEFAULT_SCALE() {
        return 0.15;
    }

    get rig() {
        return { size: 1.2, radius: 0.05, maxRadius: 0.1, rate: 0.6 * this.intensity, height: 0.8, smoke: 0.25, embers: 0, haze: 0, decal: 0, tongues: 0.8 };
    }
}

export class LanternParticle extends FlamePreset {
    static get DEFAULT_SCALE() {
        return 0.2;
    }

    get rig() {
        return { size: 1, radius: 0.05, maxRadius: 0.15, rate: 0.7 * this.intensity, height: 0.7, smoke: 0, embers: 0, haze: 0, decal: 0, glow: 1.6 };
    }
}

export class BrazierParticle extends FlamePreset {
    static get DEFAULT_SCALE() {
        return 0.8;
    }

    get rig() {
        return { size: 0.8, radius: 0.25, maxRadius: 0.5, rate: 1.2 * this.intensity, height: 1.1, smoke: 1, embers: 1.6, decal: 0.6 };
    }
}

export class CampfireParticle extends FlamePreset {
    static get DEFAULT_SCALE() {
        return 1.2;
    }

    get rig() {
        return { size: 0.75, radius: 0.3, maxRadius: 0.6, rate: 1.6 * this.intensity, height: 1.2, smoke: 1.6, embers: 2.5, decal: 1 };
    }

    async extras(s) {
        await this.add(
            sustained(this, {
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.03,
                duration: 1.2,
                loop: true,
                life: [0.6, 1.2],
                size: [s * 0.02, s * 0.04],
                speed: [s * 0.8, s * 1.6],
                burst: [{ time: 0, count: 6, probability: Math.min(1, 0.35 * this.intensity) }],
                shape: surfaceOr(this, { type: "cone", radius: s * 0.15, angle: Math.PI / 5 }),
                aim: "up",
                gravity: s * 1.5,
                color: [
                    [0, "white", 1],
                    [0.2, "spark", 1],
                    [1, "end", 0],
                ],
                order: ORDER.sparks,
            }),
        );
    }
}

export class ForgeParticle extends FlamePreset {
    static get DEFAULT_SCALE() {
        return 0.8;
    }

    get rig() {
        return { size: 0.6, radius: 0.4, maxRadius: 0.8, rate: 1.4 * this.intensity, height: 0.7, smoke: 0.8, embers: 1, haze: 1.6, decal: 1, tongues: 0.6 };
    }

    async extras(s) {
        await this.add(
            sustained(this, {
                sprite: "emberssmall",
                mode: "stretched",
                stretch: 0.04,
                duration: 0.9,
                loop: true,
                life: [0.4, 0.9],
                size: [s * 0.025, s * 0.05],
                speed: [s * 1.5, s * 3],
                burst: [
                    { time: 0, count: 14, probability: Math.min(1, 0.4 * this.intensity) },
                    { time: 0.45, count: 8, probability: Math.min(1, 0.3 * this.intensity) },
                ],
                shape: surfaceOr(this, { type: "cone", radius: s * 0.1, angle: Math.PI / 3 }),
                aim: "up",
                gravity: s * 6,
                color: [
                    [0, "white", 1],
                    [0.2, "spark", 1],
                    [0.7, "end", 0.8],
                    [1, "edge", 0],
                ],
                order: ORDER.sparks,
            }),
            sustained(this, {
                sprite: "emberssmall",
                world: false,
                life: 0.8,
                rate: 4,
                size: [s * 0.9, s * 1.1],
                position: [0, s * 0.1, 0],
                color: [
                    [0, "glow", 0],
                    [0.5, "glow", 0.35],
                    [1, "glow", 0],
                ],
                order: ORDER.smoke,
            }),
        );
    }
}

export class SteamParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.6;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.clamp(this.params.emitterSize, s * 0.05, s * 0.6);
        await this.add(
            sustained(this, {
                sprite: "smoke9x9",
                blend: "normal",
                life: [1.4, 2.2],
                size: [s * 0.25, s * 0.4],
                speed: [s * 0.5, s * 0.8],
                rotation: true,
                spin: [-0.6, 0.6],
                rate: 9 * this.intensity,
                shape: surfaceOr(this, { type: "cone", radius: Math.max(R, 0.001), angle: Math.PI / 14 }),
                aim: "up",
                speedOverLife: [1, 0.6, 0.35, 0.25],
                turbulence: { scale: s, strength: s * 0.15, speed: 0.6 },
                color: [
                    [0, "start", 0],
                    [0.12, "start", 0.5],
                    [0.6, "end", 0.25],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.4, 0.9, 1.4, 1.9],
                order: ORDER.smoke,
                wind: 0.8,
                fade: 1,
            }),
        );
    }
}

export class WaterfallMistParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.3);
        const k = Math.clamp(R / (s * 0.3), 1, 3) * this.intensity;
        await this.add(
            sustained(this, {
                sprite: "smoke9x9",
                blend: "normal",
                life: [2, 3.2],
                size: [s * 0.35, s * 0.6],
                speed: [s * 0.08, s * 0.2],
                rotation: true,
                spin: [-0.4, 0.4],
                rate: 6 * k,
                shape: surfaceOr(this, new Disc({ radius: R, height: s * 0.05 })),
                force: [0, s * 0.04, 0],
                turbulence: { scale: s, strength: s * 0.1, speed: 0.4 },
                color: [
                    [0, "start", 0],
                    [0.2, "start", 0.4],
                    [0.7, "end", 0.25],
                    [1, "end", 0],
                ],
                sizeOverLife: [0.6, 1, 1.3, 1.6],
                order: ORDER.smoke,
                wind: 0.8,
                fade: 1.2,
            }),
            sustained(this, {
                sprite: "emberssmall",
                life: [0.5, 0.9],
                size: [s * 0.01, s * 0.02],
                speed: [s * 0.4, s * 0.8],
                rate: 25 * k,
                shape: surfaceOr(this, new Disc({ radius: R * 0.8, height: s * 0.02 })),
                gravity: s * 2,
                color: [
                    [0, "white", 0],
                    [0.1, "white", 0.7],
                    [1, "start", 0],
                ],
                order: ORDER.sparks,
            }),
        );
    }
}

export class FirefliesParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.05;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async build() {
        const s = Math.clamp(this.params.scale.start, 0.004, 0.012);
        const R = Math.max(this.params.emitterSize, s * 4);
        const rate = Math.clamp(R * 12, 1, 10) * this.intensity;
        const flight = () => ({ life: [4, 7], speed: s * 0.2, shape: surfaceOr(this, new Disc({ radius: R, height: Math.max(R * 0.4, s * 4) })), turbulence: { scale: R, strength: s * 1.5, speed: 0.3 }, fade: 1 });
        await this.add(
            sustained(this, {
                ...flight(),
                sprite: "emberssmall",
                size: [s, s * 1.5],
                rate,
                color: [
                    [0, "spark", 0],
                    [0.1, "spark", 1],
                    [0.25, "spark", 0.1],
                    [0.4, "spark", 1],
                    [0.55, "spark", 0.15],
                    [0.75, "spark", 1],
                    [1, "spark", 0],
                ],
                order: ORDER.sparks,
            }),
            sustained(this, {
                ...flight(),
                sprite: "emberssmall",
                size: [s * 2.5, s * 3.5],
                rate: rate * 0.6,
                color: [
                    [0, "glow", 0],
                    [0.15, "glow", 0.35],
                    [0.3, "glow", 0.05],
                    [0.5, "glow", 0.35],
                    [0.7, "glow", 0.05],
                    [0.85, "glow", 0.3],
                    [1, "glow", 0],
                ],
                order: ORDER.glow,
            }),
        );
    }
}

export class PortalParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.3);
        const I = this.intensity;
        const ring = new THREE.Group();
        ring.position.y = R * 1.1;
        this.emitter.add(ring);
        this._ring = ring;
        await this.addTo(
            ring,
            sustained(this, {
                sprite: "twirl",
                mode: "vertical",
                world: false,
                duration: 2,
                prewarm: true,
                life: 2,
                rate: 2,
                size: [R * 2, R * 2.3],
                rotation: true,
                spin: -3,
                color: [
                    [0, "start", 0],
                    [0.4, "start", 0.7],
                    [1, "end", 0],
                ],
                order: ORDER.body,
            }),
            sustained(this, {
                sprite: "spiral_4",
                mode: "vertical",
                world: false,
                duration: 3,
                prewarm: true,
                life: 3,
                rate: 1,
                size: R * 1.9,
                rotation: true,
                spin: 1.5,
                color: [
                    [0, "core", 0],
                    [0.5, "core", 0.5],
                    [1, "end", 0],
                ],
                order: ORDER.glow,
            }),
            sustained(this, {
                sprite: "emberssmall",
                world: false,
                life: 0.6,
                rate: 6,
                size: R * 1.2,
                color: [
                    [0, "glow", 0],
                    [0.5, "glow", 0.45],
                    [1, "glow", 0],
                ],
                order: ORDER.smoke,
            }),
            sustained(this, {
                sprite: "emberssmall",
                mode: "trail",
                length: 30,
                world: false,
                life: [0.8, 1.2],
                size: s * 0.04,
                rate: Math.clamp(R * 60, 10, 40) * I,
                shape: { type: "donut", radius: R, thickness: 0.2, donutRadius: R * 0.05 },
                behaviors: [orbit([-3, -2], FORWARD)],
                color: [
                    [0, "core", 0],
                    [0.2, "core", 1],
                    [1, "end", 0],
                ],
                order: ORDER.sparks,
            }),
        );
        groundGlow(this, { size: R * 2.5, opacity: 0.4, maxDrop: R * 2 });
    }

    animate(delta) {
        if (this._ring) {
            const camera = game.Levels3DPreview.camera.position;
            const position = this._ring.getWorldPosition(worldPosition);
            this._ring.rotation.y = Math.atan2(camera.x - position.x, camera.z - position.z) - this.emitter.rotation.y;
        }
        super.animate(delta);
    }
}

class AuraParticle extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 0.5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    get radius() {
        return Math.max(this.params.emitterSize * 0.7, this.params.scale.start * 0.3);
    }

    get rate() {
        return Math.clamp(this.radius * 400, 20, 60) * this.intensity;
    }

    get size() {
        return Math.max(this.radius * 4, this.params.scale.start);
    }

    rim(spec) {
        return sustained(this, { world: false, shape: surfaceOr(this, new Disc({ radius: this.radius, thickness: 0.25 })), ...spec });
    }
}

export class FlameAuraParticle extends AuraParticle {
    async build() {
        const s = this.size;
        const R = this.radius;
        await this.add(
            ...flame(this, { size: s * 0.6, lift: s * 0.5, rate: this.rate / 18, core: 0, world: true, wind: 0.2, make: (effect, spec) => this.rim(spec) }),
            this.rim({
                sprite: "emberssmall",
                world: true,
                life: [1, 1.6],
                size: [s * 0.02, s * 0.04],
                speed: [s * 0.4, s * 0.8],
                rate: this.rate * 0.4,
                turbulence: { scale: s, strength: s, speed: 1 },
                color: [
                    [0, "spark", 0],
                    [0.2, "spark", 1],
                    [1, "edge", 0],
                ],
                order: ORDER.sparks,
                wind: 0.5,
            }),
            ringGlow(this, R, {
                color: [
                    [0, "start", 0],
                    [0.5, "start", 0.5],
                    [1, "end", 0],
                ],
            }),
        );
        groundGlow(this, { size: R * 2.6, opacity: 0.5, maxDrop: R + 0.2 });
    }
}

export class FrostAuraParticle extends AuraParticle {
    async build() {
        const s = this.size;
        const R = this.radius;
        await this.add(
            this.rim({
                sprite: "smoke9x9",
                mode: "horizontal",
                life: [2, 3],
                size: [s * 0.4, s * 0.6],
                rotation: true,
                spin: [-0.3, 0.3],
                rate: this.rate * 0.25,
                position: [0, 0.004, 0],
                color: [
                    [0, "core", 0],
                    [0.3, "core", 0.3],
                    [1, "start", 0],
                ],
                order: ORDER.ground,
                fade: 1,
            }),
            this.rim({
                sprite: "star_04",
                life: [1.2, 2],
                size: [s * 0.04, s * 0.08],
                speed: s * 0.15,
                rotation: true,
                spin: [-2, 2],
                rate: this.rate * 0.6,
                behaviors: [orbit(0.6)],
                color: [
                    [0, "white", 0],
                    [0.2, "white", 1],
                    [1, "core", 0],
                ],
                sizeOverLife: "pulse",
                order: ORDER.sparks,
            }),
            this.rim({
                sprite: "emberssmall",
                life: [1.5, 2.5],
                size: [s * 0.015, s * 0.03],
                speed: s * 0.1,
                rate: this.rate * 0.5,
                gravity: -s * 0.05,
                turbulence: { scale: s, strength: s * 0.3, speed: 0.5 },
                color: [
                    [0, "white", 0],
                    [0.2, "white", 0.9],
                    [1, "start", 0],
                ],
                order: ORDER.sparks,
            }),
            ringGlow(this, R, {
                color: [
                    [0, "core", 0],
                    [0.5, "core", 0.45],
                    [1, "start", 0],
                ],
            }),
        );
        groundGlow(this, { size: R * 2.6, color: this.palette.core, opacity: 0.35, maxDrop: R + 0.2 });
    }
}

export class HolyAuraParticle extends AuraParticle {
    async build() {
        const s = this.size;
        const R = this.radius;
        await this.add(
            this.rim({
                sprite: "trace_06",
                mode: "vertical",
                life: [1, 1.6],
                size: [s * 0.3, s * 0.5],
                speed: s * 0.2,
                rate: this.rate * 0.5,
                position: [0, s * 0.15, 0],
                color: [
                    [0, "core", 0],
                    [0.3, "core", 0.6],
                    [1, "start", 0],
                ],
                sizeOverLife: [0.6, 1, 1, 0.8],
                order: ORDER.glow,
            }),
            this.rim({
                sprite: "star",
                life: [1, 1.6],
                size: [s * 0.04, s * 0.08],
                speed: [s * 0.2, s * 0.4],
                rotation: true,
                rate: this.rate * 0.5,
                color: [
                    [0, "white", 0],
                    [0.3, "white", 1],
                    [1, "core", 0],
                ],
                sizeOverLife: "pulse",
                order: ORDER.sparks,
            }),
            ringGlow(this, R, {
                color: [
                    [0, "core", 0],
                    [0.5, "start", 0.6],
                    [1, "end", 0],
                ],
            }),
        );
        groundGlow(this, { size: R * 2.6, opacity: 0.55, maxDrop: R + 0.2 });
    }
}

export class ShadowAuraParticle extends AuraParticle {
    async build() {
        const s = this.size;
        const R = this.radius;
        await this.add(
            this.rim({
                sprite: "smoke9x9",
                blend: "normal",
                lit: false,
                world: true,
                life: [1.2, 2],
                size: [s * 0.3, s * 0.5],
                speed: s * 0.2,
                rotation: true,
                spin: [-0.8, 0.8],
                rate: this.rate * 0.6,
                turbulence: { scale: s, strength: s * 0.2, speed: 0.5 },
                color: [
                    [0, "black", 0],
                    [0.2, "black", 0.6],
                    [1, "smoke", 0],
                ],
                sizeOverLife: "grow",
                order: ORDER.smoke,
                wind: 0.4,
            }),
            this.rim({
                sprite: "flame_wisp",
                world: true,
                life: [0.8, 1.2],
                size: [s * 0.2, s * 0.35],
                speed: s * 0.25,
                rotation: true,
                spin: [-1, 1],
                rate: this.rate * 0.4,
                color: [
                    [0, "start", 0],
                    [0.3, "start", 0.45],
                    [1, "end", 0],
                ],
                order: ORDER.body,
            }),
            this.rim({
                sprite: "emberssmall",
                life: [1.2, 2],
                size: [s * 0.02, s * 0.04],
                speed: s * 0.3,
                rate: this.rate * 0.3,
                behaviors: [orbit(-0.8)],
                color: [
                    [0, "glow", 0],
                    [0.2, "glow", 1],
                    [1, "start", 0],
                ],
                order: ORDER.sparks,
            }),
        );
        groundGlow(this, { size: R * 2.8, color: "#000000", blending: "multiply", opacity: 0.7, maxDrop: R + 0.2 });
    }
}

export class ShieldAuraParticle extends AuraParticle {
    async build() {
        const s = this.params.scale.start;
        const R = Math.max(this.params.emitterSize, s * 0.6);
        const shell = { type: "hemisphere", radius: R, thickness: 0 };
        await this.add(
            sustained(this, {
                sprite: "emberssmall",
                world: false,
                duration: 2,
                prewarm: true,
                life: 2,
                size: [R * 0.5, R * 0.7],
                rate: Math.clamp(R * 120, 20, 60) * this.intensity,
                shape: surfaceOr(this, shell),
                aim: "up",
                behaviors: [orbit(0.4)],
                color: [
                    [0, "start", 0],
                    [0.5, "start", 0.3],
                    [1, "end", 0],
                ],
                order: ORDER.smoke,
            }),
            sustained(this, {
                sprite: "spark_arc",
                world: false,
                life: [0.15, 0.3],
                size: [R * 0.25, R * 0.4],
                rotation: true,
                rate: 6 * this.intensity,
                shape: surfaceOr(this, shell),
                aim: "up",
                color: [
                    [0, "white", 0.9],
                    [1, "core", 0],
                ],
                order: ORDER.glow,
                fade: 0.2,
            }),
            sustained(this, {
                sprite: "emberssmall",
                mode: "trail",
                length: 30,
                world: false,
                life: [1.4, 2],
                size: s * 0.03,
                rate: 8 * this.intensity,
                shape: surfaceOr(this, shell),
                aim: "up",
                behaviors: [orbit([1, 1.6])],
                color: [
                    [0, "core", 0],
                    [0.2, "core", 0.9],
                    [1, "start", 0],
                ],
                order: ORDER.sparks,
            }),
            ringGlow(this, R, {
                color: [
                    [0, "core", 0],
                    [0.5, "start", 0.7],
                    [1, "end", 0],
                ],
            }),
        );
    }
}

registerEffects(
    "presets",
    {
        candle: CandleParticle,
        lantern: LanternParticle,
        brazier: BrazierParticle,
        campfire: CampfireParticle,
        forge: ForgeParticle,
        steam: SteamParticle,
        waterfallmist: WaterfallMistParticle,
        fireflies: FirefliesParticle,
        portal: PortalParticle,
        auraflame: FlameAuraParticle,
        aurafrost: FrostAuraParticle,
        auraholy: HolyAuraParticle,
        aurashadow: ShadowAuraParticle,
        aurashield: ShieldAuraParticle,
    },
    { token: true, tile: true },
);
