import * as THREE from "three";
import { BaseParticleEffect } from "./BaseParticleEffect.js";

const DOWN = new THREE.Vector3(0, -1, 0);

function toVector3(value) {
    if (value?.isVector3) return value.clone();
    if (Array.isArray(value)) return new THREE.Vector3(...value);
    return new THREE.Vector3(value.x, value.y, value.z);
}

export class BaseDirectionalEffect extends BaseParticleEffect {
    constructor(...args) {
        super(...args);
        this.lookAtTarget = this.inferLookAt();
        this._dist = null;
        this._speed = null;
        this.isTemplate = true;
    }

    static get DEFAULT_CONE() {
        return Math.PI / 9;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: this.constructor.DEFAULT_SCALE,
            emitterSize: this.constructor.DEFAULT_EMITTER_SIZE,
        };
    }

    get isLight() {
        return this.to instanceof foundry.canvas.placeables.AmbientLight;
    }

    get sizeFactor() {
        const reference = this.constructor.DEFAULT_SCALE * 0.2 * Math.sqrt(canvas.scene.dimensions.size / 100);
        return Math.clamp(Math.sqrt(this.params.scale.start / reference), 0.5, 2);
    }

    inferLookAt() {
        const object = this.to;
        const shape = this.params.cone;
        if (shape) {
            this._target = toVector3(shape.origin);
            const target = toVector3(shape.target);
            this._coneEmitterAngle = shape.angle ?? 0;
            this._emitterRadius = shape.radius ?? 0;
            this._objectRadius = shape.length ?? this._target.distanceTo(target);
            return target;
        }
        if (object instanceof foundry.canvas.placeables.AmbientLight) {
            const light3d = game.Levels3DPreview.lights.sceneLights[object.id];
            this._target = light3d.mesh.getWorldPosition(new THREE.Vector3());
            this._emitterRadius = this.params.emitterSize;
            this._coneEmitterAngle = light3d.light3d.angle ?? Math.PI / 3;
            this._objectRadius = light3d.light3d.distance;
            return light3d.light3d.target?.position.clone() ?? null;
        } else if (object instanceof foundry.canvas.placeables.MeasuredTemplate) {
            const template3d = game.Levels3DPreview.templates[object.id];
            this._target = template3d._effectOrigin.getWorldPosition(new THREE.Vector3());
            this._objectRadius = template3d._effectLength * 0.7;
            this._emitterRadius = template3d._effectRadius;
            this._coneEmitterAngle = template3d._baseShape === "cone" ? template3d._effectAngle * 0.5 : 0;
            return template3d._effectTarget.getWorldPosition(new THREE.Vector3());
        } else {
            this._coneEmitterAngle = this.params.coneAngle || this.constructor.DEFAULT_CONE;
            this._objectRadius = this._origin.distanceTo(this._target);
            this._emitterRadius = this.params.emitterSize;
            const tempTarget = this._target.clone();
            this._target = this._origin;
            this._origin = tempTarget;
            return this._origin;
        }
    }

    get cone() {
        if (this._cone) return this._cone;
        const apex = this._target.clone();
        const axis = this.lookAtTarget ? this.lookAtTarget.clone().sub(apex) : new THREE.Vector3();
        if (axis.lengthSq() < 1e-8) axis.copy(DOWN);
        axis.normalize();
        const length = Math.max(this._objectRadius || 0, 0.05);
        const angle = Math.clamp(this._coneEmitterAngle || 0, 0, 1.3);
        const radius = Math.max(this._emitterRadius ?? 0, 0);
        return (this._cone = { apex, axis, length, angle, radius, end: radius + length * Math.tan(angle) });
    }

    widthAt(t) {
        const cone = this.cone;
        return cone.radius + cone.length * t * Math.tan(cone.angle);
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
