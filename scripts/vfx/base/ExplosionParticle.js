import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { ParticleSystem, colorToVec4 } from "./quarks.js";
import { BaseParticleEffect } from "./BaseParticleEffect.js";

export class ExplosionParticle extends BaseParticleEffect {
    constructor(from, to, params) {
        super(from, to, params);
        this.isExplosion = true;
    }

    static get TARGET_SIZED() {
        return true;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.35,
            emitterSize: 4,
        };
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const mainExplosionData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.force / 30),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            worldSpace: true,
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true,
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles * 5),

            shape: this._meshSurface ?? new QUARKS.SphereEmitter({ radius: this.params.emitterSize }),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const innerFlashData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.force / 9),
            startSize: new QUARKS.IntervalValue(this.params.scale.start / 5, this.params.scale.start / 10),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
            },
            emissionOverTime: new QUARKS.ConstantValue(0),
            emissionBursts: [
                {
                    time: 0,
                    count: this.params.rate.particles * 5,
                    cycle: 1,
                    interval: 0.01,
                    probability: 1,
                },
            ],

            shape: this._meshSurface ?? new QUARKS.SphereEmitter({ radius: this.params.emitterSize / 4 }),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png"),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const innerGlowData = { ...innerFlashData };
        innerGlowData.startSpeed = new QUARKS.ConstantValue(this.params.force / 5);
        innerGlowData.startSize = new QUARKS.IntervalValue(this.params.scale.start / 10, this.params.scale.start / 20);
        innerGlowData.renderMode = QUARKS.RenderMode.BillBoard;

        const turbulence = new THREE.Vector3(1, 1, 1).multiplyScalar(this.params.emitterSize);

        const mainExplosion = new ParticleSystem(mainExplosionData);

        mainExplosion.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainExplosion.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        mainExplosion.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity / (this.params.mass / 100), this.params.push.dy), new QUARKS.ConstantValue(1)));
        mainExplosion.addBehavior(new QUARKS.RotationOverLife(new QUARKS.IntervalValue(0, 0.5 * Math.PI), true));

        const innerFlash = new ParticleSystem(innerFlashData);
        innerFlash.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        innerFlash.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, -1), new QUARKS.ConstantValue(1)));
        const innerGlow = new ParticleSystem(innerGlowData);
        innerGlow.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));

        this.emitter.add(mainExplosion.emitter);
        this.emitter.add(innerFlash.emitter);
        this.emitter.add(innerGlow.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(mainExplosion);
        this.particleSystems.push(innerFlash);
        this.particleSystems.push(innerGlow);
    }

    animate(delta) {
        super.animate(delta);
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}
