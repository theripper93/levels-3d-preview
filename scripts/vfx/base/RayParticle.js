import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { factor } from "../../main.js";
import { ParticleEngine } from "../engine.js";
import { ParticleSystem, LegacyNoise, colorToVec4 } from "./quarks.js";
import { BaseParticleEffect } from "./BaseParticleEffect.js";

export class RayParticle extends BaseParticleEffect {
    constructor(from, to, params) {
        super(from, to, params);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (Math.max(this.params.speed, 40) / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this._duration = Math.max(this.params.duration, this.params.life.max);
        this.isRay = true;
    }

    static get IMPACT() {
        return "contactspark";
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.3,
            emitterSize: 1,
        };
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const mainBeamData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(Math.max(this.params.life.max, this.params.duration)),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),

                followLocalOrigin: true,
            },

            emissionOverDistance: new QUARKS.ConstantValue(1),

            shape: this._meshSurface ?? new QUARKS.PointEmitter({ radius: this.params.emitterSize }),
            material: await this.getBasicMaterial(),
            renderOrder: 20,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const sphereData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1),
            startSpeed: new QUARKS.ConstantValue(0.1),
            startSize: new QUARKS.ConstantValue(this.params.scale.start * 0.5),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, 2 * Math.PI),
            worldSpace: true,
            prewarm: true,
            speedFactor: 5,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),

                followLocalOrigin: true,
            },
            followLocalOrigin: true,

            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles),

            shape: this._meshSurface ?? new QUARKS.SphereEmitter({ radius: this.params.emitterSize }),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const mainBeam = new ParticleSystem(mainBeamData);

        mainBeam.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainBeam.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        mainBeam.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity * 10, this.params.push.dy), new QUARKS.ConstantValue(1)));

        const subBeamData = { ...mainBeamData };
        subBeamData.startSize = new QUARKS.ConstantValue(this.params.scale.start * 0.4);
        subBeamData.shape = new QUARKS.PointEmitter();
        subBeamData.emissionOverTime = new QUARKS.ConstantValue(0.1);
        subBeamData.material = await this.getBasicMaterial(null, THREE.NormalBlending);
        subBeamData.renderOrder = 10;

        const subBeam1 = new ParticleSystem(subBeamData);
        const subBeam2 = new ParticleSystem(subBeamData);
        const subBeam3 = new ParticleSystem(subBeamData);
        const subBeam4 = new ParticleSystem(subBeamData);

        [subBeam1, subBeam2, subBeam3, subBeam4].forEach((subBeam) => {
            subBeam.addBehavior(new LegacyNoise(new THREE.Vector3(1, 1, 1), new THREE.Vector3(5, 5, 5)));
            subBeam.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        });

        const subBeamDist = Math.max(0.001, this.params.emitterSize) * this.params.scale.start * 8;

        subBeam1.emitter.position.set(subBeamDist, 0, 0);
        subBeam2.emitter.position.set(-subBeamDist, 0, 0);
        subBeam3.emitter.position.set(0, 0, subBeamDist);
        subBeam4.emitter.position.set(0, 0, -subBeamDist);

        const subBeamGroup = new THREE.Group();
        subBeamGroup.add(subBeam1.emitter);
        subBeamGroup.add(subBeam2.emitter);
        subBeamGroup.add(subBeam3.emitter);
        subBeamGroup.add(subBeam4.emitter);

        subBeamGroup.rotation.x = Math.PI / 2;

        this.subBeamGroup = subBeamGroup;

        const tip = new ParticleSystem(sphereData);

        this.tip = tip;

        tip.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        tip.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0.3), colorToVec4(this.params.color.end[0], 0))));
        tip.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity * 10, this.params.push.dy), new QUARKS.ConstantValue(1)));

        this.emitter.add(mainBeam.emitter);
        this.emitter.add(tip.emitter);
        this.emitter.add(subBeamGroup);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(mainBeam, subBeam1, subBeam2, subBeam3, subBeam4, tip);
    }

    animate(delta) {
        super.animate(delta);
        this._duration -= delta;
        if (this.subBeamGroup && this._currentSpeed < 1) {
            this.subBeamGroup.rotation.y += delta * 20;
        }
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
            return;
        }
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1) {
            this.tip.emissionOverTime = new QUARKS.ConstantValue(this.params.rate.particles / 10);
        }
        if (this._currentSpeed > 1 && this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            return;
        }
        if (this._duration > 0 && this._currentSpeed <= 1) {
            const point = this.params.rotateTowards ? this._origin : this.animationPath.getPointAt(this._currentSpeed);
            this.emitter.lookAt(point);
            this.emitter.position.copy(point);
        }
    }
}
