import * as THREE from "three";
import { factor } from "../../main.js";
import { ParticleEngine } from "../engine.js";
import { BaseParticleEffect } from "./BaseParticleEffect.js";

export class Object3DParticle extends BaseParticleEffect {
    constructor(from, to, params) {
        super(from, to, params);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (this.params.speed / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this.isSprite = true;
        this.sprite = true;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        };
    }

    async createEmitter() {
        this.emitter = await this.createSprite();
        const scale = this.params.scale.start ? this.params.scale.start : this.params.scale.end;
        this.emitter.scale.set(scale, scale, scale);
        this.emitter.traverse((child) => {
            if (child.type === "ParticleEmitter") {
                this.particleSystems.push(child.system);
            }
        });
    }

    async createSprite() {
        if (game.Levels3DPreview.helpers.is3DModel(this.params.sprite)) {
            this.isModel = true;
            const model = (await game.Levels3DPreview.helpers.loadModel(this.params.sprite))?.model ?? new THREE.Group();
            const color = new THREE.Color(this.params.color.start[0] ?? 0xffffff);
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.material.color.multiply(color);
                    if (child.material.emissiveIntensity && child.material.emissive) child.material.emissive.multiply(color);
                }
            });
            const box = new THREE.Box3().setFromObject(model);
            model.position.sub(box.getCenter(new THREE.Vector3()));
            model.position.y = -box.min.y;
            model.rotation.copy(this._rotation);
            const group = new THREE.Group();
            group.add(model);
            group.up = this._up;
            return group;
        } else if (game.Levels3DPreview.particleSystem.isVFX(this.params.sprite)) {
            const model = (await game.Levels3DPreview.particleSystem.loadVFX(this.params.sprite)) ?? new THREE.Group();
            model.rotation.copy(this._rotation);
            const group = new THREE.Group();
            group.add(model);
            group.up = this._up;
            return group;
        }
        const tex = await game.Levels3DPreview.helpers.loadTexture(this.params.sprite);
        if (tex.image?.currentTime) tex.image.currentTime = 0;
        const material = new THREE.SpriteMaterial({
            map: tex,
            color: this.params.single ? this.params.color.start : 0xffffff,
            blending: this.params.single ? THREE.NormalBlending : THREE.AdditiveBlending,
            fog: true,
        });
        return new THREE.Sprite(material);
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

        const point = this.params.rotateTowards ? this._origin : this.animationPath.getPointAt(this._currentSpeed);

        this.emitter.position.copy(point);
        if (this.isModel) {
            this.emitter.lookAt(this.params.rotateTowards ? this.animationPath.getPointAt(this._currentSpeed) : this._target);
        }
    }
}
