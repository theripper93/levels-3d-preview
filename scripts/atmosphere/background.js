import * as THREE from "three";
import { frame } from "../render/frame.js";

const ACES_INPUT = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777);
const ACES_OUTPUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const scratch = new THREE.Vector3();

function rrtAndOdtFit(value) {
    return (value * (value + 0.0245786) - 0.000090537) / (value * (0.983729 * value + 0.432951) + 0.238081);
}

export function toneMappedBackground(source, target) {
    scratch.set(source.r, source.g, source.b).multiplyScalar(frame.exposure / 0.6).applyMatrix3(ACES_INPUT);
    scratch.set(rrtAndOdtFit(scratch.x), rrtAndOdtFit(scratch.y), rrtAndOdtFit(scratch.z)).applyMatrix3(ACES_OUTPUT);
    return target.setRGB(Math.clamp(scratch.x, 0, 1), Math.clamp(scratch.y, 0, 1), Math.clamp(scratch.z, 0, 1));
}
