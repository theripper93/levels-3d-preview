import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../systems/ruler3d.js";

export class GameCamera{

    constructor(camera,controls, _parent){
        this.camera = camera;
        this.controls = controls;
        this._parent = _parent;
        this.collisionPoint = 0;
        this._currentZoomDist = null;
        this.maxDistTarget = 1;
        this._setHeightTries = 0;
        this.lock = true;
        this.topDown = false;
        this.CONFIG = {};
        this.CONSTS = {
            MINDIST: 0.2,
            MAXDIST: 1,
            MINGROUND: 1,
        }
        this.controls.addEventListener('change', this.onChange.bind(this));
        this.onChangeFreeCamera = debounce(this.onChangeFreeCamera.bind(this), 100)
        this.setControlPreset();
    }

    getY(){
        const origin = new THREE.Vector3(this.toFixedFloat(this.camera.position.x,2), this.toFixedFloat(this.camera.position.y,2),this.toFixedFloat(this.camera.position.z,2))//this.camera.position;
        origin.y += 0.2;
        const target = origin.clone();
        target.y = -1000000;
        //const gridCenter = canvas.grid.getCenter(origin.x*factor,origin.z*factor);

        const collision = this._parent.interactionManager.computeSightCollisionFrom3DPositions(origin, target, "camera", false, false, true);
        let targetCollision = null;
        if(!this.lock){
            targetCollision = this._parent.interactionManager.computeSightCollisionFrom3DPositions(origin, this.controls.target, "camera", false, false, true);
        }
        if(collision){
            collision.y = Math.ceil(collision.y/(canvas.grid.size/factor))*(canvas.grid.size/factor);
        }
        return {
            cameraToGround: origin.y - 0.2 - (collision?.y ?? 0),
            collisionPoint: collision?.y ?? 0,
            groundCollision: collision,
            targetCollision: targetCollision ?? null,
        }
    }

    set currentZoomDist(v){
        this._currentZoomDist = v;
        this.skipHeight = true;
    }

    get currentZoomDist(){
        if(this._currentZoomDist == null){
            this._currentZoomDist = this.camera.position.y - (this.controls.target.y + this.collisionPoint)
        }
        return this._currentZoomDist;
    }

    get gCTargets(){
        return this._parent._animateCameraTarget;
    }

    init(){
        this._enabledRequirements = game.settings.get("levels-3d-preview", "enableGameCamera") && (canvas.scene.getFlag("levels-3d-preview", "enableGameCamera") ?? true);
        this.enabled = this._enabledRequirements
        if(!this._enabledRequirements) return this.setRegularCameraParams();
        this.setInitalParams()
        this.computeBounds();
        if(game.user.isGM && !game.settings.get("levels-3d-preview", "gameCameraDefaultGm")) this.toggle();
    }

    computeBounds(){
        const dimensions = canvas.scene.dimensions;
        const minBounds = new THREE.Vector3((dimensions.sceneX)/factor,-100000,(dimensions.sceneY)/factor);
        const maxBounds = new THREE.Vector3((dimensions.sceneWidth+dimensions.sceneX)/factor,100000,(dimensions.sceneHeight+dimensions.sceneY)/factor);
        const box = new THREE.Box3(minBounds, maxBounds);
        this._bounds = box;
    }

    toggleTopDown(){
        this.topDown = !this.topDown;
        if(this.topDown){
            this.CONFIG.minPolarAngle = this.CONFIG.minPolarAngleTopDown;
            this.CONFIG.maxPolarAngle = this.CONFIG.maxPolarAngleTopDown;
        }else{
            this.CONFIG.minPolarAngle = this.CONFIG.minPolarAngleRegular;
            this.CONFIG.maxPolarAngle = this.CONFIG.maxPolarAngleRegular;
        }
    }

    setInitalParams(){
        this.CONFIG = {
            minPolarAngle : Math.toRadians(game.settings.get("levels-3d-preview", "gameCameraMinAngle") ?? 45),
            maxPolarAngle : Math.toRadians(game.settings.get("levels-3d-preview", "gameCameraMaxAngle") ?? 45),
            minPolarAngleRegular : Math.toRadians(game.settings.get("levels-3d-preview", "gameCameraMinAngle") ?? 45),
            maxPolarAngleRegular : Math.toRadians(game.settings.get("levels-3d-preview", "gameCameraMaxAngle") ?? 45),
            minPolarAngleTopDown : 0.1,
            maxPolarAngleTopDown : 0.1,
            clipping: game.settings.get("levels-3d-preview", "gameCameraClipping"),
        }
        if(!this.CONFIG.clipping) this.camera.near = 0.1;
        this.autoReLock = game.settings.get("levels-3d-preview", "gameCameraAutoLock");
        this.controls.minPolarAngle = this.CONFIG.minPolarAngle;
        this.controls.maxPolarAngle = this.CONFIG.maxPolarAngle;
        this.controls.minDistance = this.CONSTS.MINDIST;
        this.controls.maxDistance = this.CONSTS.MAXDIST;
        this.controls.screenSpacePanning = false;
        const squares = Math.max(canvas.scene.dimensions.sceneWidth, canvas.scene.dimensions.sceneHeight)/canvas.scene.dimensions.size;
        this.CONSTS.MAXDIST = Math.sqrt(squares/100)*0.7+1;
    }

    setRegularCameraParams(){
        this.controls.minPolarAngle = 0
        this.controls.maxPolarAngle = Math.PI;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 20;
        this.controls.screenSpacePanning = game.settings.get("levels-3d-preview", "screenspacepanning");
    }

    toggle(){
        this.enabled = !this.enabled;
        this.enabled ? this.setInitalParams() : this.setRegularCameraParams();
    }

    onChange(){
        if(!this.enabled) {
            this.onChangeFreeCamera();
        }else{
            $("#clip-navigation-lock").toggleClass("clip-navigation-enabled", this.lock);
            this.setClipping();
            this.setHeight();
            this.keepInBounds();
        }
    }

    onChangeFreeCamera(){
        if(!this._parent._active) return;
        const target = this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3))
        const collision = this._parent.interactionManager.computeSightCollisionFrom3DPositions(this.camera.position, target, "sight");
        if(collision){
            this.controls.target = collision;
        }else{
            this.controls.target = target;
        }

    }

    keepInBounds(){
        if(!this.enabled || !this._bounds) return;
        if(!this._bounds.containsPoint(this.camera.position)){
            const clampedPoint = new THREE.Vector3();
            this._bounds.clampPoint(this.camera.position, clampedPoint);
            const offset = this.camera.position.clone().sub(clampedPoint).multiplyScalar(-1);
            this.camera.position.add(offset);
            this.controls.target.add(offset);
        }

    }

    update(delta){
        if(!this.enabled) return;
        this.controls.minPolarAngle = this.CONFIG.minPolarAngle;
        this.controls.maxPolarAngle = this.CONFIG.maxPolarAngle;
        this.controls.screenSpacePanning = false;
        this._lastTarget = this._detectedTarget;
        this._detectedTarget = this.detectTargetPosition();
        if(this._lastTarget != this._detectedTarget && this.autoReLock) this.lock = true;
        if(this.lock) {
            this.cameraLockTarget = this._detectedTarget?.hasClone ?? this._detectedTarget;
        }else{
            this.cameraLockTarget = null;
        }
        if(this.cameraLockTarget && this.controls.target.distanceTo(this.cameraLockTarget.head) > 0.1) {
            this._parent.setCameraToControlled(this.cameraLockTarget)
        }

        if(this.areValClose(this.controls.maxDistance, this.maxDistTarget, 0.1)) this.maxDistTarget = null;
        if(this.areValClose(this.camera.position.y, this.yTarget, 0.1)) this.yTarget = null;
        if(this.areValClose(this.controls.target.y, this.tYTarget?.y, 0.1)) this.yTarget = null;

        if(this.maxDistTarget){
            this.controls.maxDistance = this.lerp(this.controls.maxDistance, this.maxDistTarget, 0.5);
        }
        if(this.yTarget){
            this.camera.position.y = this.lerp(this.camera.position.y, this.yTarget, 0.03);
        }
        if(this.tYTarget){
            this.controls.target.lerp(this.tYTarget,0.03)
        }

        if(this._nearTarget && this.camera.near != this._nearTarget){
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
        this._lastTargetPoint = this.controls.target.clone();

        const {cameraToGround, collisionPoint, groundCollision, targetCollision} = this.getY();
        this._lastCameraPosition = this.camera.position.clone();

        if(cameraToGround < this.CONSTS.MINDIST){
            this.yTarget = collisionPoint + this.CONSTS.MINDIST + this.currentZoomDist;
        }else{// if(cameraToGround > this.CONSTS.MAXDIST){
            this.yTarget = Math.min(collisionPoint + this.CONSTS.MAXDIST, collisionPoint + this.currentZoomDist)//collisionPoint - this.CONSTS.MAXDIST + this.currentZoomDist;
        }

        if(!this.lock && groundCollision && targetCollision){
            targetCollision.y = Math.max(targetCollision.y, collisionPoint);
            const newyt = this.controls.target.clone()
            newyt.y = targetCollision.y;
            this.tYTarget = newyt//targetCollision;
        }else{
            this.tYTarget = null;
        }
        if(this.yTarget < this.controls.target.y) {
            this.yTarget = null;
            return;
        }
        const targetCam = this.camera.position.clone();
        targetCam.y = this.yTarget;
        const newMaxDist = Math.max(this.CONSTS.MAXDIST, targetCam.distanceTo(this.controls.target));
        this.maxDistTarget = newMaxDist;
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
            const tokenplaceable = canvas.tokens.get(game.combat.current?.tokenId)
            tokenId = tokenplaceable?.visible || tokenplaceable?.isOwner ? tokenplaceable?.id : null;
        }else{
            tokenId = canvas.tokens.controlled[0]?.id;
        }
        if(!tokenId){
            tokenId = game.user?.character?.getActiveTokens()[0]?.id;
        }
        const token3D = this._parent.tokens[tokenId];
        return token3D//token3D?.hasClone ?? token3D;
    }

    lerp(v1, v2, alpha) {
        alpha = alpha < 0 ? 0 : alpha;
        alpha = alpha > 1 ? 1 : alpha;
        return v1 + (v2 - v1) * alpha;
    }

    toFixedFloat(v,n){
        const pow = Math.pow(10,n);
        return Math.floor(v*pow)/pow;
        return parseFloat(v.toFixed(n));
    }

    areValClose(v1, v2, n){
        return Math.abs(v1-v2) < n;
    }

    areEqual(v1, v2){
        return Math.abs(v1-v2) < 0.1;//Number.EPSILON;
    }

    setControlPreset(){
        if(game.settings.get("levels-3d-preview", "altCameraControls")){
            this.controls.mouseButtons = {
                LEFT: undefined,
                MIDDLE: THREE.MOUSE.ROTATE,
                RIGHT: THREE.MOUSE.PAN
            }
        }else{
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN
            }
        }
    }

}