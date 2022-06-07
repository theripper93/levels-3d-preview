import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../entities/ruler3d.js";

export class GameCamera{

    constructor(camera,controls, _parent){
        this.camera = camera;
        this.controls = controls;
        this._parent = _parent;
        this.enabled = true;
        this.CONSTS = {
            MINDIST: 0.2,
            MAXDIST: 2,
            MINGROUND: 0.5,
        }
        this.init();
    }

    getY(origin){
        origin = origin ?? this.camera.position;
        const target = origin.clone();
        target.y = -1000000;
        const collision = this._parent.interactionManager.computeSightCollisionFrom3DPositions(origin, target, "collision");
        return origin.y - (collision?.y ?? 0);
    }

    get gCTargets(){
        return this._parent._animateCameraTarget;
    }

    init(){
        this.setInitalParams();
        this.controls.addEventListener('change', this.onChange.bind(this));
    }

    setInitalParams(){
        this.controls.minPolarAngle = Math.PI/4;
        this.controls.maxPolarAngle = Math.PI/4;
        this.controls.minDistance = this.CONSTS.MINDIST;
        this.controls.maxDistance = this.CONSTS.MAXDIST;
        this.controls.screenSpacePanning = false;
        this.controls.keyPanSpeed = 35;
    }

    onChange(){
        if(!this.enabled) return;
        this.setClipping();
        this.setHeight();
    }

    update(delta){
        if(!this.enabled) return;
        this.detectTargetPosition();
        if(this.cameraLockTarget && this.controls.target.distanceTo(this.cameraLockTarget.head) > 0.1) {
            this._parent.setCameraToControlled(this.cameraLockTarget)
        }
        this.controls.screenSpacePanning = false;
        if(this.yTarget){
            const newYPos = this.camera.position.clone();
            newYPos.y = this.yTarget;
            const lerpTarget = this.camera.position.clone().lerp(newYPos, 0.04);
            this.camera.position.y = lerpTarget.y;
            if(this.yTarget - this.camera.position.y < 0.00001){
                this.yTarget = null;
            }
        }
        if(this.camera.near != this._nearTarget){
            this.camera.near += Math.max((this._nearTarget - this.camera.near)/20,Math.sign((this._nearTarget - this.camera.near))*0.01);
            if(Math.abs(this.camera.near - this._nearTarget) < 0.01){
                this.camera.near = this._nearTarget;
            }
        }


    }

    setHeight(){
        const cameraCollisionDist = this.getY();
        if(cameraCollisionDist < this.CONSTS.MINDIST){
            this.controls.maxDistance = Math.max(this.CONSTS.MAXDIST, this.camera.position.y + cameraCollisionDist);
            this.yTarget = this.camera.position.y + cameraCollisionDist;
            if(this.gCTargets.cameraPosition){
                this.gCTargets.cameraPosition.y = this.yTarget;
                this.yTarget = null;
            }
        }else{
            this.yTarget = null;
        }
    }

    setClipping(){
        if(!this.cameraLockTarget || this.cameraLockTarget.head.distanceTo(this.camera.lookAt) > this.CONSTS.MINGROUND){
            this._nearTarget = 0.01;
            return;
        }
        const collisionTarget = this.cameraLockTarget.mid
        const collision = this._parent.interactionManager.computeSightCollisionFrom3DPositions(collisionTarget, this.camera.position, "sight");
        if(collision){
            const distance = this.controls.getDistance();
            const collDistance = collision.distanceTo(this.camera.position);
            if(collDistance > 0){
                this._nearTarget = collDistance+0.02;
            }
        }else{
            this._nearTarget = 0.01;
        }
    }

    setTarget(target){}

    detectTargetPosition(){
        let tokenId;
        if(game.combat?.started){
            tokenId = game.combat.current?.tokenId
        }else{
            tokenId = canvas.tokens.controlled[0]?.id;
        }
        if(!tokenId){
            tokenId = game.user?.character?.getActiveTokens()[0]?.id;
        }
        const token3D = this._parent.tokens[tokenId];
        this.cameraLockTarget = token3D.hasClone ?? token3D;
    }

}