import * as THREE from "../../lib/three.module.js";
import {factor} from "../../main.js";
import { Token3D } from "../token3d.js";

const RING_THINNESS = 0.0025;

const rangeRing1 = new THREE.TorusGeometry(1, RING_THINNESS, 8, 64);
const rangeRing2 = new THREE.TorusGeometry(1, RING_THINNESS / 3, 8, 64);
rangeRing1.rotateX(Math.PI / 2);
rangeRing2.rotateX(Math.PI / 2);

const materials = {};

export class RangeRingEffect {
    constructor(token, range, color = "#ffffff") {
        this.token3D = token instanceof Token3D ? token : game.Levels3DPreview.tokens[token.id];
        const distance = canvas.scene.grid.distance;
        const size = canvas.grid.size;
        const normalizedFactor = ((size / factor)) / distance;
        this.scale = range * normalizedFactor;
        this.material1 = materials[color] ?? (materials[color] = new THREE.MeshBasicMaterial({color}));
        this.material2 = this.material1.clone();
        this.material2.depthWrite = false;
        this.material2.depthTest = false;
        this.init();
    }

    async init() {
        this.effect = new THREE.Group();
        this.effect.scale.set(0, 0, 0);
        const ring1 = new THREE.Mesh(rangeRing1, this.material1);
        const ring2 = new THREE.Mesh(rangeRing2, this.material2);
        ring2.renderOrder = 1e20;

        this.effect.add(ring1);
        this.effect.add(ring2);
        
        this.token3D.mesh.add(this.effect);

        this.animate();
    }

    async animate() {
        const scaleInAnimation = [
            {
                parent: this.effect.scale,
                attribute: "x",
                to: this.scale,
            },
            {
                parent: this.effect.scale,
                attribute: "y",
                to: this.scale,
            },
            {
                parent: this.effect.scale,
                attribute: "z",
                to: this.scale,
            },
        ];
        CanvasAnimation.animate(scaleInAnimation, { duration: 500, easing: "easeOutCircle" });
    }

    remove() { 
        this.effect.removeFromParent();
    }
}