import { BaseParticleEffect } from "./BaseParticleEffect.js";

export class BurstEffect extends BaseParticleEffect {
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

    animate(delta) {
        super.animate(delta);
        this._duration -= delta;
        if (this._duration <= 0) this.onEnd();
    }
}
