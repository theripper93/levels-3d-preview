import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 
import {sleep} from '../main.js';

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
        this._totalSteps = this._currentAnimation.length;
        this.precomputeStep();
        this._isAnimating = true;
        
    }

    animate(delta){
        if(!this._isAnimating || !this._ready) return;

        this._currentDelta += delta/(this._currentStepAnimation.time/1000);
        if(this._currentDelta > 1) return this.advanceStage();

        //Position
        if(this._currentStepAnimation.position && !this.areV3Equal(this.model.position, this._currentStepAnimation.position)) this.model.position.lerp(this._currentStepAnimation.position, this._currentDelta);
        
        //Rotation
        if(this._currentStepAnimation.rotation && !this.areV3Equal(this.model.rotation, this._currentStepAnimation.rotation)){
            const currentRotation = new THREE.Vector3(this.model.rotation.x, this.model.rotation.y, this.model.rotation.z);
            const targetRotation = this._currentStepAnimation.rotation;
            currentRotation.lerp(targetRotation, this._currentDelta);
            this.model.rotation.set(currentRotation.x, currentRotation.y, currentRotation.z);
        } 
        
        //Scale
        if(this._currentStepAnimation.scale && !this.areV3Equal(this.model.scale, this._currentStepAnimation.scale)) this.model.scale.lerp(this._currentStepAnimation.scale, this._currentDelta);
        
    }

    areV3Equal(v1, v2){
        return v1.x === v2.x && v1.y === v2.y && v1.z === v2.z;
    }

    precomputeStep(){
        const step = this._currentAnimation[this._animationStep];
        const position = step.position(this.box3, this.size, this.center, {position: this.position, rotation: this.rotation});
        const rotation = step.rotation(this.box3, this.size, this.center, {position: this.position, rotation: this.rotation});
        const scale = step.scale(this.box3, this.size, this.center, {position: this.position, rotation: this.rotation});
        const time = step.time ?? 1000;
        this._currentStepAnimation = { position, rotation, scale, time };
    }

    advanceStage(){
        this.forceStage();
        this._animationStep++;
        if(this._animationStep >= this._totalSteps) return this.reset();
        this.precomputeStep();
        this.modRotation();
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
        name: "Twirl",
        resetTime: 300,
        animation: [
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {
                    const rotation = initialData.rotation;
                    rotation.y+=Math.PI*2;
                    rotation.x-=Math.PI/10;
                    return rotation
                },
                scale: (box3, size, center, initialData) => {},
                time: 1000,
            }
        ]
    },
    "sample": {
        id: "sample",
        name: "Sample",
        animation: [
            {
                position: (box3, size, center, initialData) => {},
                rotation: (box3, size, center, initialData) => {},
                scale: (box3, size, center, initialData) => {},
                time: 1000,
            }
        ]
    }
}