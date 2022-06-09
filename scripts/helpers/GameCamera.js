import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../entities/ruler3d.js";

export class GameCamera{

    constructor(camera,controls, _parent){
        this.camera = camera;
        this.controls = controls;
        this._parent = _parent;
        this.collisionPoint = 0;
        this.enabled = game.settings.get("levels-3d-preview", "enableGameCamera");
        this._currentZoomDist = 1;
        this.maxDistTarget = 1;
        this.lock = true;
        this.CONFIG = {};
        this.CONSTS = {
            MINDIST: 0.2,
            MAXDIST: 1,
            MINGROUND: 1,
        }
        this.controls.addEventListener('change', this.onChange.bind(this));
    }

    getY(origin){
        origin = origin ?? this.camera.position;
        origin = origin.clone();
        origin.y += 1;
        const target = origin.clone();
        target.y = -1000000;
        const collision = this._parent.interactionManager.computeSightCollisionFrom3DPositions(origin, target, "collision");
        return {
            cameraToGround: origin.y - 1 - (collision?.y ?? 0),
            collisionPoint: collision?.y ?? 0,
        }
    }

    set currentZoomDist(v){
        this._currentZoomDist = v;
        this.skipHeight = true;
    }

    get currentZoomDist(){
        return this._currentZoomDist;
    }

    get gCTargets(){
        return this._parent._animateCameraTarget;
    }

    init(){
        if(!this.enabled) return;
        this.setInitalParams();
        this.enabled = this.CONFIG.defaultGm;
    }

    setInitalParams(){
        this.CONFIG = {
            minPolarAngle : Math.toRadians(game.settings.get("levels-3d-preview", "gameCameraMinAngle")),
            maxPolarAngle : Math.toRadians(game.settings.get("levels-3d-preview", "gameCameraMaxAngle")),
            clipping: game.settings.get("levels-3d-preview", "gameCameraClipping"),
            defaultGm: game.settings.get("levels-3d-preview", "gameCameraDefaultGm"),
        }

        this.controls.minPolarAngle = this.CONFIG.minPolarAngle;
        this.controls.maxPolarAngle = this.CONFIG.maxPolarAngle;
        this.controls.minDistance = this.CONSTS.MINDIST;
        this.controls.maxDistance = this.CONSTS.MAXDIST;
        this.controls.screenSpacePanning = false;
        const squares = Math.max(canvas.scene.dimensions.sceneWidth, canvas.scene.dimensions.sceneHeight)/canvas.scene.dimensions.size;
        this.CONSTS.MAXDIST = Math.sqrt(squares/100)+1;
    }

    setRegularCameraParams(){
        this.controls.minPolarAngle = 0
        this.controls.maxPolarAngle = Math.PI;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 20;
    }

    toggle(){
        this.enabled = !this.enabled;
        this.enabled ? this.init() : this.setRegularCameraParams();
    }

    onChange(){
        if(!this.enabled) return;
        this.setClipping();
        this.setHeight();
    }

    update(delta){
        if(!this.enabled) return;
        this.controls.minPolarAngle = this.CONFIG.minPolarAngle;
        this.controls.maxPolarAngle = this.CONFIG.maxPolarAngle;
        if(this.lock) {
            this.detectTargetPosition();
        }else{
            this.cameraLockTarget = null;
        }
        if(this.cameraLockTarget && this.controls.target.distanceTo(this.cameraLockTarget.head) > 0.1) {
            this._parent.setCameraToControlled(this.cameraLockTarget)
        }
        this.controls.screenSpacePanning = false;
        if(this.maxDistTarget && Math.abs(this.maxDistTarget - this.controls.maxDistance) < 0.2){
            this.maxDistTarget = null;
        }
        if(this.maxDistTarget){
            const sign = this.maxDistTarget > this.controls.maxDistance ? 1 : -1;
            this.controls.maxDistance += sign * 0.03;

        }
        if(this.tYTarget && Math.abs(this.tYTarget - this.controls.target.y) < 0.2){
            this.tYTarget = null;
        }
        if(this.tYTarget){
            const sign = this.tYTarget > this.controls.target.y ? 1 : -1;
            this.controls.target.y += sign * 0.03;
        }

        if(this.yTarget && Math.abs(this.yTarget - this.camera.position.y) < 0.2){
            this.yTarget = null;
        }
        if(this.yTarget){
            const sign = this.yTarget > this.camera.position.y ? 1 : -1;
            this.camera.position.y += sign * 0.03;
        }

        if(this.camera.near != this._nearTarget){
            this.camera.near += Math.max((this._nearTarget - this.camera.near)/20,Math.sign((this._nearTarget - this.camera.near))*0.01);
            if(Math.abs(this.camera.near - this._nearTarget) < 0.01){
                this.camera.near = this._nearTarget;
            }
        }
    }

    setHeight(){
        if(this.skipHeight){
            this.skipHeight = false;
            return;
        }
        const {cameraToGround, collisionPoint} = this.getY();
        this.collisionPoint = collisionPoint;
        const maxGroundToCamera = this.CONSTS.MAXDIST
        const currentDist = this.currentZoomDist;
        const maxFinalDist = collisionPoint + maxGroundToCamera + this.controls.target.y;
        const finalDist = collisionPoint + currentDist + this.controls.target.y
        this.yTarget = Math.min(maxFinalDist, finalDist);
        const newMaxDist = Math.max(this.CONSTS.MAXDIST, this.yTarget-this.controls.target.y);
        if(Math.abs(this.maxDistTarget - newMaxDist) > 0.01){
            this.maxDistTarget = newMaxDist;
        }
        if(this.yTarget && this.gCTargets.cameraPosition){
            this.gCTargets.cameraPosition.y = this.yTarget;
            this.yTarget = null;
        }

    }

    setClipping(){
        if(!this.CONFIG.clipping || !this.enabled) return this._nearTarget = 0.01;

        if(!this.cameraLockTarget || this.cameraLockTarget.head.distanceTo(this.camera.lookAt) > this.CONSTS.MINGROUND){
            this._nearTarget = 0.01;
            return;
        }
        const collisionTarget = this.cameraLockTarget.mid
        const collision = this._parent.interactionManager.computeSightCollisionFrom3DPositions(collisionTarget, this.camera.position, "sight");
        if(collision){
            const collDistance = collision.distanceTo(this.camera.position);
            if(collDistance > 0){
                this._nearTarget = collDistance+0.02;
            }
        }else{
            this._nearTarget = 0.01;
        }
    }

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
        this.cameraLockTarget = token3D?.hasClone ?? token3D;
    }

}