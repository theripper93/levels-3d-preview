import { TransformControls as ThreeTransformControls } from "three/addons/controls/TransformControls.js";

const PICKER_AXIS_SCALE = { X: [1, 0.5, 0.5], Y: [0.5, 1, 0.5], Z: [0.5, 0.5, 1] };
const MIN_SCALE_FACTOR = 0.001;

export class TransformControls extends ThreeTransformControls {
    constructor(camera, domElement) {
        super(camera, domElement);
        const gizmo = this._gizmo;
        for (const mode of ["translate", "scale"]) {
            gizmo.picker[mode].children.forEach((child) => {
                const scale = PICKER_AXIS_SCALE[child.name];
                if (scale) child.geometry.scale(...scale);
            });
        }
        gizmo.gizmo.scale.children.filter((child) => child.name === "XYZ").forEach((child) => child.geometry.scale(2, 2, 2));
        this.getHelper().traverse((child) => (child.userData.ignoreHover = true));
    }

    pointerMove(pointer) {
        super.pointerMove(pointer);
        if (this.mode !== "scale" || !this.dragging || !this.object) return;
        this.object.scale.max(this._scaleStart.clone().multiplyScalar(MIN_SCALE_FACTOR));
    }
}
