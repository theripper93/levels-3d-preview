import { OrbitControls as ThreeOrbitControls } from "three/addons/controls/OrbitControls.js";

export class OrbitControls extends ThreeOrbitControls {
    update(deltaTime = null) {
        this._lastTargetPosition.copy(this.target);
        return super.update(deltaTime);
    }

    _getZoomScale() {
        return Math.pow(0.95, this.zoomSpeed);
    }

    _customWheelEvent(event) {
        const custom = super._customWheelEvent(event);
        custom.ctrlKey = event.ctrlKey;
        custom.shiftKey = event.shiftKey;
        custom.altKey = event.altKey;
        return custom;
    }

    _handleMouseWheel(event) {
        if (canvas.regions._placementContext && (event.ctrlKey || event.shiftKey || event.altKey)) return;
        const tactical = game.Levels3DPreview.tacticalCamera;
        if (tactical?.engaged) return tactical.onWheel(event);
        super._handleMouseWheel(event);
    }

    _handleKeyDown(event) {
        const L = game.Levels3DPreview;
        if (this.enablePan === false || !L._active || !L.hasFocus || L.tacticalCamera?.engaged) return;
        if (canvas.tokens?.active && canvas.tokens.controlled.length) return;
        if (canvas.drawings?.controlled.some((drawing) => drawing._onkeydown)) return;
        if (Hooks.call("3DCanvasKeyPan", event) === false) return;
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
        if (needsUpdate) this.update();
    }
}
