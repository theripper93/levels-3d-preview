import * as THREE from "../../lib/three.module.js";
import {radialDomeFadeShaderMaterial} from "../../shaders/shaderMaterials.js";
import { factor } from "../../main.js";

const domeGeometry = new THREE.SphereGeometry(1, 32, 32, 0, Math.PI);
domeGeometry.scale(1, 1, 0.4);     
const domeMaterial = radialDomeFadeShaderMaterial.clone()//new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, side: THREE.DoubleSide });
domeMaterial.uniforms.opacity.value = 1;
        
export class ActiveEffectEffect {
    constructor (token3D, src) {
        this.token3D = token3D;
        const tokenScale = Math.max(token3D.token.document.width, token3D.token.document.height);
        this.scale = (tokenScale * canvas.grid.size * 0.5) / factor;
        this.src = src;
        this.init();
    }

    async init() {
        const texture = await game.Levels3DPreview.helpers.loadTexture(this.src);
        const material = domeMaterial.clone();
        material.uniforms.map.value = texture;
        const dome1 = new THREE.Mesh(domeGeometry, material);
        dome1.position.set(0, 0, 1);
        const dome2 = dome1.clone();
        dome2.position.set(1, 0, 0);
        const dome3 = dome1.clone();
        dome3.position.set(0, 0, -1);
        const dome4 = dome1.clone();
        dome4.position.set(-1, 0, 0);
        dome2.rotation.y = Math.PI / 2;
        dome3.rotation.y = Math.PI;
        dome4.rotation.y = -Math.PI / 2;

        this.effect = new THREE.Group();
        this.effect.position.y = this.token3D.d / 2;

        this.effect.add(dome1);
        this.effect.add(dome2);
        this.effect.add(dome3);
        this.effect.add(dome4);
        this.effect.scale.set(0, 0, 0);
        this.token3D.mesh.add(this.effect);

        this.animate();
    }

    async animate() {
        const ROTATION_DEG = Math.PI;
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
        const scaleOutAnimation = [
            {
                parent: this.effect.scale,
                attribute: "x",
                to: 0,
            },
            {
                parent: this.effect.scale,
                attribute: "y",
                to: 0,
            },
            {
                parent: this.effect.scale,
                attribute: "z",
                to: 0,
            },
            {
                parent: this.effect.rotation,
                attribute: "y",
                to: ROTATION_DEG + ROTATION_DEG / 3,
            },
        ];

        const rotateAnimation = [
            {
                parent: this.effect.rotation,
                attribute: "y",
                to: ROTATION_DEG,
            },
        ];
        CanvasAnimation.animate(scaleInAnimation, { duration: 500, easing: "easeOutCircle" });
        await CanvasAnimation.animate(rotateAnimation, {duration: 2000});
        await CanvasAnimation.animate(scaleOutAnimation, {duration: 500});
        this.effect.removeFromParent();
    }
}