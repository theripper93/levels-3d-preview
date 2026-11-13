import * as THREE from "three";

export const WIND_MAX_SPEED = 9;

class Wind {
    constructor() {
        this.vector = new THREE.Vector3();
        this.direction = 0;
        this.speed = 0;
        this.strength = 0;
        this.gustiness = 0;
        this.time = 0;
    }

    set(direction = 0, strength = 0, gustiness = 0, squareSize = 0.1) {
        const radians = THREE.MathUtils.degToRad(direction);
        this.direction = direction;
        this.strength = strength;
        this.gustiness = gustiness;
        this.speed = strength * WIND_MAX_SPEED * squareSize;
        this.vector.set(Math.sin(radians), 0, -Math.cos(radians)).multiplyScalar(this.speed);
        return this;
    }

    gustAt(time = this.time) {
        if (!this.gustiness) return 1;
        const wave = Math.sin(time * 0.37) * 0.5 + Math.sin(time * 0.83 + 1.7) * 0.3 + Math.sin(time * 1.91 + 4.1) * 0.2;
        return Math.max(0, 1 + wave * this.gustiness);
    }
}

export const wind = new Wind();
