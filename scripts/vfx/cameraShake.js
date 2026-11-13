import * as THREE from "three";
import { factor } from "../main.js";
import { getQuality } from "./quality.js";

const ANGULAR_AMPLITUDE = 0.006;
const FALLOFF_CELLS = 30;
const FREQUENCIES = [37, 53, 29];

class CameraShake {
    constructor() {
        this.shakes = [];
        this.saved = new THREE.Vector3();
        this.offset = new THREE.Vector3();
        this.time = 0;
        this.applied = false;
    }

    shake(strength = 0.5, duration = 0.4, position = null) {
        const quality = getQuality();
        if (!quality.enabled || quality.reduceMotion || strength <= 0 || duration <= 0) return;
        this.shakes.push({ strength, duration, age: 0, position: position?.clone() ?? null });
    }

    amplitude(camera, delta) {
        const falloffDistance = (FALLOFF_CELLS * canvas.grid.size) / factor;
        let amplitude = 0;
        for (const shake of this.shakes) {
            shake.age += delta;
            const remaining = 1 - shake.age / shake.duration;
            if (remaining <= 0) continue;
            const distance = shake.position ? camera.position.distanceTo(shake.position) / falloffDistance : 0;
            amplitude += (shake.strength * remaining * remaining) / (1 + distance * distance);
        }
        this.shakes = this.shakes.filter((shake) => shake.age < shake.duration);
        return Math.min(amplitude, 1.5);
    }

    apply(camera, delta, target = null) {
        if (!this.shakes.length) return;
        const amplitude = this.amplitude(camera, delta);
        if (amplitude <= 0) return;
        this.time += delta;
        const reach = (target ? camera.position.distanceTo(target) : 1) * ANGULAR_AMPLITUDE * amplitude;
        this.offset.set(Math.sin(this.time * FREQUENCIES[0]), Math.sin(this.time * FREQUENCIES[1] + 1.7), Math.sin(this.time * FREQUENCIES[2] + 4.1) * 0.5).multiplyScalar(reach);
        this.saved.copy(camera.position);
        camera.position.add(this.offset.applyQuaternion(camera.quaternion));
        camera.updateMatrixWorld();
        this.applied = true;
    }

    restore(camera) {
        if (!this.applied) return;
        camera.position.copy(this.saved);
        camera.updateMatrixWorld();
        this.applied = false;
    }

    clear() {
        this.shakes = [];
    }
}

export const cameraShake = new CameraShake();

export function shake(strength, duration, position) {
    cameraShake.shake(strength, duration, position);
}
