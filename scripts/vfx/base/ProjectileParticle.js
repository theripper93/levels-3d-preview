import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { factor } from "../../main.js";
import { ParticleEngine } from "../engine.js";
import { ParticleSystem, colorToVec4 } from "./quarks.js";
import { BaseParticleEffect } from "./BaseParticleEffect.js";

export class ProjectileParticle extends BaseParticleEffect {
    constructor(from, to, params) {
        super(from, to, params);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (this.params.speed / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this.isProjectile = true;
        this._effectDelay = 0;
        this._initialEffectDelay = 0.00001;
    }

    static get IMPACT() {
        return "contactspark";
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1.6,
            emitterSize: 0.1,
        };
    }

    addLight() {
        this.emitLight({ distance: Math.min(5, 1.5 * (this.params.scale?.start ?? 1)), progress:() => 0.5 * (this._currentSpeed + (1 - this._effectDelay / this._initialEffectDelay)) });
    }

    async createSprite() {
        const tex = await game.Levels3DPreview.helpers.loadTexture(this.params.sprite);
        if (tex.image?.currentTime) tex.image.currentTime = 0;
        const material = new THREE.SpriteMaterial({
            map: tex,
            color: 0xffffff,
            blending: THREE.AdditiveBlending,
            fog: true,
        });
        return new THREE.Sprite(material);
    }

    get anchor() {
        return this._origin;
    }

    async build() {
        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start * 0.5 * 0.5),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            worldSpace: true,
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),

                followLocalOrigin: true,
            },

            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),

            shape: this._meshSurface ?? new QUARKS.PointEmitter({ radius: Math.max(0.01, this.params.emitterSize) }),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const sphereData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min * 0.1, this.params.life.max * 0.1),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start * 0.4),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            worldSpace: true,
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),

                followLocalOrigin: true,
            },
            followLocalOrigin: true,

            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),

            shape: this._meshSurface ?? new QUARKS.SphereEmitter({ radius: this.params.emitterSize }),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const embersData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min * 3, this.params.life.max * 3),
            startSpeed: new QUARKS.ConstantValue(0.05),
            startSize: new QUARKS.ConstantValue(this.params.scale.start * 0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            worldSpace: true,
            prewarm: false,

            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 50),

            shape: this._meshSurface ?? new QUARKS.ConeEmitter({ radius: this.params.emitterSize, angle: Math.PI / 2 }),
            material: await this.getBasicMaterial(),
            renderOrder: 20,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const turbulence = new THREE.Vector3(10, 10, 10);

        const trail = new ParticleSystem(trailData);

        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), 0]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        trail.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity * 10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        trail.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence, turbulence));

        const tip = new ParticleSystem(sphereData);

        tip.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), 0]])));
        tip.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        tip.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity * 10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        tip.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence, turbulence));

        const embers = new ParticleSystem(embersData);

        embers.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), 0]])));
        embers.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        embers.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity * 10, this.params.push.dy), new QUARKS.ConstantValue(1)));

        this.emitter.add(trail.emitter);
        this.emitter.add(tip.emitter);
        this.emitter.add(embers.emitter);
        this.particleSystems.push(trail, tip, embers);
    }

    animate(delta) {
        super.animate(delta);
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1) {
            this._playOnEnd = true;
            this.onEnd();
            return;
        }
        const point = this.animationPath.getPointAt(this._currentSpeed);
        this.emitter.lookAt(point);
        this.emitter.position.copy(point);
    }
}
