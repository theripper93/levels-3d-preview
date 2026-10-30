import { OrbitControls as ThreeOrbitControls } from "three/addons/controls/OrbitControls.js";

export class OrbitControls extends ThreeOrbitControls {
    update(deltaTime = null) {
        this._lastTargetPosition.copy(this.target);
        return super.update(deltaTime);
    }

    _getZoomScale() {
        return Math.pow(0.95, this.zoomSpeed);
    }

    _handleMouseDownPan(event) {
        super._handleMouseDownPan(event);
        const oldCameraPos = this.object.position.clone();
        setTimeout(() => {
            if (oldCameraPos.distanceTo(this.object.position) > 0.01) game.Levels3DPreview.GameCamera.lock = false;
        }, 100);
    }

    _handleMouseWheel(event) {
        if (canvas.regions._placementContext) return;
        super._handleMouseWheel(event);
        const GameCamera = game.Levels3DPreview.GameCamera;
        GameCamera.yTarget = null;
        GameCamera.currentZoomDist = this.object.position.y - (this.target.y + GameCamera.collisionPoint);
    }

    _handleKeyDown(event) {
        const L = game.Levels3DPreview;
        if (this.enablePan === false || !L._active || !L.hasFocus) return;
        const { panUp, panDown, panLeft, panRight } = L.interactionManager._panKeys;
        let needsUpdate = false;
        if (panUp.includes(event.code)) {
            this._pan(0, this.keyPanSpeed);
            needsUpdate = true;
        }
        if (panDown.includes(event.code)) {
            this._pan(0, -this.keyPanSpeed);
            needsUpdate = true;
        }
        if (panLeft.includes(event.code)) {
            this._pan(this.keyPanSpeed, 0);
            needsUpdate = true;
        }
        if (panRight.includes(event.code)) {
            this._pan(-this.keyPanSpeed, 0);
            needsUpdate = true;
        }
        if (needsUpdate) {
            L.GameCamera.lock = false;
            this.update();
        }
    }
}
