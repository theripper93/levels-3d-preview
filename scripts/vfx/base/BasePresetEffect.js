import * as THREE from "three";
import { BaseParticleEffect } from "./BaseParticleEffect.js";
import { readWind, renderFx, groundBelow } from "../effects/sustain.js";

const worldPosition = new THREE.Vector3();

export class BasePresetEffect extends BaseParticleEffect {
    constructor(...args) {
        super(...args);
        if (this._originalPosition) this._target = this._originalPosition;
        if (this.params.onCenter && this._originalCenter) this._target = this._originalCenter;
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isPreset = true;
        this.windVector = new THREE.Vector3();
        this._handles = [];
        this._envAge = Infinity;
    }

    static get TARGET_SIZED() {
        return true;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: this.constructor.DEFAULT_SCALE,
            emitterSize: this.constructor.DEFAULT_EMITTER_SIZE * 0.5,
        };
    }

    get intensity() {
        return Math.max(this.params.presetIntensity ?? 1, 0);
    }

    get glowAlpha() {
        return Math.min(1, 1 / Math.sqrt(this.intensity));
    }

    get onSurface() {
        return !!this._meshSurface;
    }

    applyLightOffset(offset) {
        if (!this.params.applyPresetLightOffset) return;
        const position = this.emitter.position;
        const ground = groundBelow(position.clone().setY(position.y + 0.01), 0);
        position.y = Math.max(position.y - offset, Math.min(ground, position.y));
    }

    addHandle(handle, parent = this.emitter) {
        if (!handle) return null;
        parent.add(handle);
        this._handles.push(handle);
        return handle;
    }

    addDecal(options, parent) {
        const R = renderFx();
        if (!R?.capabilities?.decals) return null;
        return this.addHandle(new R.ProjectedDecal(options), parent);
    }

    addHaze(options, parent) {
        const R = renderFx();
        if (!R?.capabilities?.distortion) return null;
        return this.addHandle(new R.Distortion({ strength: 0.015, frequency: 4, ...options }), parent);
    }

    refreshEnvironment() {
        readWind(this.emitter.getWorldPosition(worldPosition), this.windVector);
    }

    tick(delta) {
        this._envAge += delta;
        if (this._envAge > 0.5) {
            this._envAge = 0;
            this.refreshEnvironment();
        }
        super.tick(delta);
    }

    releaseLights() {
        super.releaseLights();
        this._handles?.forEach((handle) => handle.end(0.6));
    }

    dispose() {
        super.dispose();
        this._handles.forEach((handle) => handle.dispose());
        this._handles = [];
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
