import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { ParticleSystem, colorToVec4 } from "./quarks.js";
import { BaseParticleEffect } from "./BaseParticleEffect.js";

export class BasicCustomParticle extends BaseParticleEffect {
    constructor(from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const mainExplosionData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.force / 10),
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

        const mainExplosion = new ParticleSystem(mainExplosionData);

        mainExplosion.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainExplosion.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        mainExplosion.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity, this.params.push.dy), new QUARKS.ConstantValue(1)));

        this.emitter.add(mainExplosion.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(mainExplosion);
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
