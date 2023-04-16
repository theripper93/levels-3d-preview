import * as THREE from "../lib/three.module.js";

export class CutsceneEngine{
    constructor (parent) {
        this._parent = parent;
        this._isPlaying = false;
        this.cutscene = null;
        this._gameCameraPrevState = null;
    }

    get isPlaying() { 
        return this._isPlaying;
    }

    get camera() {
        return this._parent.camera;
    }

    get controls() {
        return this._parent.controls;
    }

    get scene() {
        return this._parent.scene;
    }

    getCutsceneData(index) {
        const flag = canvas.scene.getFlag("levels-3d-preview", "cutscenes") ?? [];
        if (!flag[index]) return null;
        return flag[index];
    }

    getCutsceneDataByName(name) { 
        const flag = canvas.scene.getFlag("levels-3d-preview", "cutscenes") ?? [];
        for(let i = 0; i < flag.length; i++) {
            if(flag[i].name == name) return flag[i];
        }
        return null;
    }

    playCutscene(cutsceneId, userIds) {
        this._parent.socket.executeForEveryone("playCutscene", {
            userIds,
            sceneId: canvas.scene.id,
            cutsceneId,
        });
    }

    play(index) {
        const data = typeof index == "number" ? this.getCutsceneData(index) : this.getCutsceneDataByName(index);
        if (!data) return ui.notifications.error("Cutscene not found");
        this._gameCameraPrevState = this._parent.GameCamera.enabled;
        if(this._gameCameraPrevState) this._parent.GameCamera.toggle();
        this.cutscene = new Cutscene(data, this.camera, this.controls);
        this._isPlaying = true;
    }

    stop() { 
        this._isPlaying = false;
        this.cutscene = null;
        if (this._gameCameraPrevState) this._parent.GameCamera.toggle();
        this._gameCameraPrevState = null;
    }

    update(delta) { 
        delta*= 1000;
        if (!this._isPlaying) return;
        if (this.cutscene.advanceTime(delta)) {
            this.stop();
        } else if (this.cutscene.currentKeyframe) {
            this.camera.position.copy(this.cutscene.currentKeyframe.currentPosition);
            this.controls.target.copy(this.cutscene.currentKeyframe.currentTarget);
        }
    }
}


class Cutscene{
    constructor (data, camera, controls) {
        this.canvasEl = document.querySelector("#levels3d");
        this.startCameraPosition = camera.position.clone();
        this.startControlsTarget = controls.target.clone();
        this.keyframes = data.keyframes;
        this.initializeKeyframes();
        this.fadeInOutDuration = this.keyframes[0]._time / 2;
        this._currentKeyframe = -1;
        this._fadeToBlack = this.fadeInOutDuration;
        this._fadeFromBlack = this.fadeInOutDuration;
        this._isFadingIn = true;
        this.canvasEl.style.transition = `backdrop-filter ${this.fadeInOutDuration / 1000}s ease-in-out`;
    }

    get currentKeyframe() { 
        return this.keyframes[this._currentKeyframe];
    }

    initializeKeyframes() {
        const keyframes = [];
        let prevKeyframe = -1;
        for(let i = 0; i < this.keyframes.length; i++) {
            const keyframe = this.keyframes[i];
            const initialPosition = this.keyframes[prevKeyframe]?.position ?? keyframe.position;
            const initialTarget = this.keyframes[prevKeyframe]?.target ?? keyframe.target;
            prevKeyframe = i;
            const isLast = i == this.keyframes.length - 1;
            const isFirst = i == 0;
            keyframes.push(new CutsceneKeyframe(keyframe, initialPosition, initialTarget, isLast, isFirst ));
        }
        this.keyframes = keyframes;
    }

    advanceTime(delta) {
        if (this._fadeToBlack >= 0) { 
            this.canvasEl.style.backdropFilter = `brightness(0)`;
            this._fadeToBlack -= delta;
            return false;
        }
        const currentKeyframe = this.keyframes[this._currentKeyframe];
        if (this._fadeFromBlack >= 0) {
            this._currentKeyframe = 0;
            this.canvasEl.style.backdropFilter = `brightness(1)`;
            this._fadeFromBlack -= delta;
            return false;
        }
        if(currentKeyframe.advanceTime(delta)) {
            this._currentKeyframe++;
            if (this._currentKeyframe >= this.keyframes.length) {
                this.onEnd();
                return true;
            }
        }
        return false;
    }

    onEnd() {
        this.canvasEl.style.backdropFilter = "";
        this.canvasEl.style.transition = "";
    }
}

class CutsceneKeyframe{
    constructor (data, initialPosition, initialTarget, isLast, isFirst) {
        this.canvasEl = document.querySelector("#levels3d");
        this.animationTime = 0;
        this.isLast = isLast;
        this.isFirst = isFirst;
        this.holdTime = 0;
        this.keyframes = [];
        this.hold = data.hold * 1000;
        this._time = data.time * 1000;
        this.time = this.isFirst ? 0 : data.time * 1000;
        this.easing = data.easing;
        this.transition = data.transition;
        this.isJumpTransition = this.transition == "fade";
        if (this.isJumpTransition) this.canvasEl.style.transition = `backdrop-filter ${this._time / 2000}s ease-in-out`;
        this.finalPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
        this.finalTarget = new THREE.Vector3(data.target.x, data.target.y, data.target.z);
        this.initialPosition = new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z);
        this.initialTarget = new THREE.Vector3(initialTarget.x, initialTarget.y, initialTarget.z);
        this.currentPosition = this.initialPosition.clone();
        this.currentTarget = this.initialTarget.clone();
        this.easingFunction = easingFunctions[this.easing];

    }

    advanceTime(delta) {
        if (this.animationTime < this.time) {
            this.animationTime += delta;
            if(this.isJumpTransition && this.animationTime <= this._time / 2) {
                this.canvasEl.style.backdropFilter = `brightness(0)`;
                return false;
            }
            this.updateVectors();
            if (this.isJumpTransition && this.animationTime > this._time / 2) {
                this.canvasEl.style.backdropFilter = `brightness(1)`;
                return false;
            }
            return false;
        }
        this.holdTime += delta;
        return this.holdTime >= this.hold;
    }

    updateVectors() {
        if (this.isJumpTransition) {
            this.currentPosition.copy(this.finalPosition);
            this.currentTarget.copy(this.finalTarget);
            return;
        }
        const factor = this.easingFunction(Math.min(1,this.animationTime / this.time));
        this.currentPosition.lerpVectors(this.initialPosition, this.finalPosition, factor);
        this.currentTarget.lerpVectors(this.initialTarget, this.finalTarget, factor);
    }
}

const easingFunctions = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInOutCubic: (t) => t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
};