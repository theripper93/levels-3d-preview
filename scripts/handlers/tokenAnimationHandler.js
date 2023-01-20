import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 
import { sleep } from "../helpers/utils.js";

export class TokenAnimationHandler{

    constructor(token3d){
        this.token3d = token3d;
        this.animations = game.Levels3DPreview.CONFIG.tokenAnimations;
        this._currentDelta = 0;
        this._animationStep = 0;
        this._totalSteps = 0;
        this._currentAnimationObject = null;
        this._currentAnimation = null;
        this._currentStepAnimation = null;
        this._isAnimating = false;
    }

    init(){
        this.box3 = new THREE.Box3().setFromObject(this.token3d.model);
        this.size = this.box3.getSize(new THREE.Vector3());
        this.center = this.box3.getCenter(new THREE.Vector3());
        this._ready = true;
    }

    get model(){
        return this.token3d.model;
    }

    get position(){
        return this.model.position.clone();
    }

    get scale(){
        return this.model.scale.clone();
    }

    get rotation(){
        return this.model.rotation.clone();
    }

    get initialState(){
        return {
            position: this.token3d.isProne ? this.token3d.proneHandler.targetPosition : this.token3d.proneHandler.originalPosition,
            rotation: this.token3d.isProne ? this.token3d.proneHandler.targetRotation : this.token3d.proneHandler.originalRotation,
            scale: this.token3d.proneHandler.originalScale,
        }
    }

    get startingState(){
        return {
            position: this.position,
            rotation: this.rotation,
            scale: this.scale,
        }
    }

    playAnimation(animationId, options = {}){
        this.reset();
        if(!this.animations[animationId]) return;
        this._currentAnimation = [...this.animations[animationId].animation];
        this._currentAnimationObject = this.animations[animationId];
        if(this.token3d.isProne && !this._currentAnimationObject.allowProne) return;
        const initialState = this.initialState;
        this._currentAnimation.push({
            position: ()=>{ return initialState.position },
            rotation: ()=>{ return initialState.rotation },
            scale: ()=>{ return initialState.scale },
            time: options.resetTime ?? this._currentAnimationObject.resetTime,
        });
        if(options.repeats > 1){
            const currentAnimCopy = [...this._currentAnimation];
            for(let i = 0; i < (options.repeats-1); i++){
                this._currentAnimation = [...currentAnimCopy, ...this._currentAnimation];
            }
        }
        this._currentAnimationStartingState = this.startingState;
        this._totalSteps = this._currentAnimation.length;
        this.precomputeStep();
        this._isAnimating = true;
        
    }

    animate(delta){
        if(!this._isAnimating || !this._ready) return;

        this._currentDelta += delta/(this._currentStepAnimation.time/1000);
        if(this._currentDelta > 1) return this.advanceStage();

        const initial = this._currentAnimationStartingState
        //Position
        if(this._currentStepAnimation.position && !this.areV3Equal(this.model.position, this._currentStepAnimation.position)) this.model.position.lerp(this._currentStepAnimation.position, this._currentDelta);
        
        //Rotation
        if(this._currentStepAnimation.rotation && !this.areV3Equal(this.model.rotation, this._currentStepAnimation.rotation)){
            const initialRotation = new THREE.Vector3(initial.rotation.x, initial.rotation.y, initial.rotation.z);
            const targetRotation = new THREE.Vector3(this._currentStepAnimation.rotation.x, this._currentStepAnimation.rotation.y, this._currentStepAnimation.rotation.z);
            initialRotation.lerp(targetRotation, this._currentDelta);
            this.model.rotation.set(initialRotation.x, initialRotation.y, initialRotation.z);
        } 
        
        //Scale
        if(this._currentStepAnimation.scale && !this.areV3Equal(this.model.scale, this._currentStepAnimation.scale)) this.model.scale.lerp(this._currentStepAnimation.scale, this._currentDelta);
        
    }

    areV3Equal(v1, v2){
        return v1.x === v2.x && v1.y === v2.y && v1.z === v2.z;
    }

    precomputeStep(){
        const step = this._currentAnimation[this._animationStep];
        const position = step.position(this.box3, this.size, this.center, {position: this.position, rotation: this.rotation, scale: this.scale}, this.initialState);
        const rotation = step.rotation(this.box3, this.size, this.center, {position: this.position, rotation: this.rotation, scale: this.scale}, this.initialState);
        const scale = step.scale(this.box3, this.size, this.center, {position: this.position, rotation: this.rotation, scale: this.scale}, this.initialState);
        const time = step.time ?? 1000;
        this._currentStepAnimation = { position, rotation, scale, time };
    }

    advanceStage(){
        this.forceStage();
        this.modRotation();
        this._animationStep++;
        if(this._animationStep >= this._totalSteps) return this.reset();
        this._currentAnimationStartingState = this.startingState;
        this.precomputeStep();
        this._currentDelta = 0;
    }

    forceStage(){
        this._currentStepAnimation.position && this.model.position.copy(this._currentStepAnimation.position);
        this._currentStepAnimation.rotation && this.model.rotation.set(this._currentStepAnimation.rotation.x, this._currentStepAnimation.rotation.y, this._currentStepAnimation.rotation.z);
        this._currentStepAnimation.scale && this.model.scale.copy(this._currentStepAnimation.scale);
    }

    modRotation(){
        const currentRotation = new THREE.Vector3(this.model.rotation.x, this.model.rotation.y, this.model.rotation.z);
        this.model.rotation.set(currentRotation.x%(2*Math.PI), currentRotation.y%(2*Math.PI), currentRotation.z%(2*Math.PI));
    }

    reset(){

        const initialState = this.initialState;
        this.model.position.copy(initialState.position);
        this.model.rotation.set(initialState.rotation.x, initialState.rotation.y, initialState.rotation.z);
        this.model.scale.copy(initialState.scale);

        this._currentDelta = 0;
        this._animationStep = 0;
        this._currentAnimationObject = null;
        this._currentAnimation = null;
        this._currentStepAnimation = null;
        this._isAnimating = false;
    }

}

export const defaultTokenAnimations = {
    "twirl": {
        id: "twirl",
        icon: "icons/svg/explosion.svg",
        resetTime: 200,
        particleDelay: 500,
        animation: [
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.y+=Math.PI*2;
                    rotation.x-=Math.PI/14;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 300,
            },
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {},
                scale: (box3, size, center, initialData) => {},
                time: 100,
            },
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.x+=2*Math.PI/10;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 100,
            }
        ]
    },
    "slash": {
        id: "slash",
        icon: "icons/svg/sword.svg",
        resetTime: 200,
        animation: [
            {
                position: (box3, size, center, initialData) => {
                    const move = Math.max(size.z,size.x) * 0.2;
                    const position = initialData.position;
                    position.z += move;
                    return position;
                },
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.y-=Math.PI/7;
                    rotation.x+=Math.PI/7;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 300,
            }
        ]
    },
    "swipe": {
        id: "swipe",
        icon: "icons/svg/stoned.svg",
        resetTime: 200,
        animation: [
            {
                position: (box3, size, center, initialData) => {
                    const move = Math.max(size.z,size.x) * 0.2;
                    const position = initialData.position;
                    position.z -= move;
                    return position;
                },
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.y-=Math.PI/3;
                    rotation.x-=Math.PI/7;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 350,
            },
            {
                position: (box3, size, center, initialData) => {
                    const move = Math.max(size.z,size.x) * 0.2;
                    const position = initialData.position;
                    position.z += move*2;
                    return position;
                },
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.y+=Math.PI*0.8;
                    rotation.x+=Math.PI/4;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 200,
            }
        ]
    },
    "charge": {
        id: "charge",
        icon: "icons/svg/thrust.svg",
        resetTime: 200,
        animation: [
            {
                position: (box3, size, center, initialData) => {
                    const move = Math.max(size.z,size.x) * 0.2;
                    const position = initialData.position;
                    position.z -= move;
                    return position;
                },
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.y-=Math.PI/8;
                    rotation.x-=Math.PI/5;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 1300,
            },
            {
                position: (box3, size, center, initialData) => {
                    const move = Math.max(size.z,size.x) * 0.2;
                    const position = initialData.position;
                    position.z += move*6;
                    return position;
                },
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.x+=Math.PI*0.4;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 300,
            }
        ]
    },
    "bow": {
        id: "bow",
        icon: "icons/svg/target.svg",
        resetTime: 200,
        animation: [
            {
                position: (box3, size, center, initialData) => {
                    const move = Math.max(size.z,size.x) * 0.2;
                    const position = initialData.position;
                    position.z -= move;
                    return position;
                },
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.x-=Math.PI/9;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 500,
            }
        ]
    },
    "buff": {
        id: "buff",
        icon: "icons/svg/pill.svg",
        resetTime: 200,
        allowProne: true,
        animation: [
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {},
                scale: (box3, size, center, initialData) => {
                    const scale = initialData.scale;
                    scale.x *= 1.1;
                    scale.y *= 1.1;
                    scale.z *= 1.1;
                    return scale;
                },
                time: 300,
            },
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {},
                scale: (box3, size, center, initialData) => {
                    const scale = initialData.scale;
                    scale.x *= 1.2;
                    scale.y *= 1.2;
                    scale.z *= 1.2;
                    return scale;
                },
                time: 300,
            },
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {},
                scale: (box3, size, center, initialData) => {
                    const scale = initialData.scale;
                    scale.x *= 1.5;
                    scale.y *= 1.5;
                    scale.z *= 1.5;
                    return scale;
                },
                time: 500,
            }
        ]
    },
    "debuff": {
        id: "debuff",
        icon: "icons/svg/poison.svg",
        resetTime: 200,
        allowProne: true,
        animation: [
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {},
                scale: (box3, size, center, initialData) => {
                    const scale = initialData.scale;
                    scale.x /= 1.1;
                    scale.y /= 1.1;
                    scale.z /= 1.1;
                    return scale;
                },
                time: 300,
            },
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {},
                scale: (box3, size, center, initialData) => {
                    const scale = initialData.scale;
                    scale.x /= 1.2;
                    scale.y /= 1.2;
                    scale.z /= 1.2;
                    return scale;
                },
                time: 300,
            },
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {},
                scale: (box3, size, center, initialData) => {
                    const scale = initialData.scale;
                    scale.x /= 1.5;
                    scale.y /= 1.5;
                    scale.z /= 1.5;
                    return scale;
                },
                time: 500,
            }
        ]
    },
    "breath": {
        id: "breath",
        icon: "icons/svg/acid.svg",
        resetTime: 200,
        animation: [
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.y+=Math.PI/3;
                    rotation.x-=Math.PI/12;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 2000,
            },
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.y-=2*(Math.PI/3);
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 4000,
            }
        ]
    },
    "shake": {
        id: "shake",
        icon: "icons/svg/ice-aura.svg",
        resetTime: 200,
        allowProne: true,
        get animation() {
            const count = 20;
            const animation = [];
            for (let i = 0; i < count; i++) {
                animation.push({
                    position: (box3, size, center, initialData, initalState) => {
                        const move = Math.max(size.z,size.x) * 0.1;
                        const position = initialData.position;
                        const initial = initalState.position;
                        position.x = initial.x + Math.random()*move*(Math.random() > 0.5 ? 1 : -1);
                        position.z = initial.z + Math.random()*move*(Math.random() > 0.5 ? 1 : -1);

                        return position;
                    },
                    rotation: (box3, size, center, initialData) => {},
                    scale: (box3, size, center, initialData) => {},
                    time: 10,
                });
            }
            return animation;
        }

    },
    "knockback": {
        id: "knockback",
        icon: "icons/svg/falling.svg",
        resetTime: 200,
        animation: [
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.x-=Math.PI/4;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 100,
            }
        ]
    },
}