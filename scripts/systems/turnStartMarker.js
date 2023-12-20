import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from "../main.js";
import {radialGradientShaderMaterial} from "../shaders/shaderMaterials.js";
import { createTargetGeometry } from "../entities/effects/target.js";

export class turnStartMarker {
    constructor(parent) {
        this._parent = parent;
        this.init();
        this.update();
    }

    _init() {
        const sphereGeometry = new THREE.CylinderGeometry((0.5 * canvas.dimensions.size) / factor, (0.5 * canvas.dimensions.size) / factor, 0.0007, 32);
        const sphereMaterial = radialGradientShaderMaterial.clone();//new THREE.MeshBasicMaterial({ color: game.user.color, blending: THREE.MultiplyBlending });
        sphereMaterial.uniforms.curvecolor.value = new THREE.Color(game.user.color);
        sphereMaterial.uniforms.gridSize.value = (1 * canvas.dimensions.size) / factor;
        sphereMaterial.uniforms.reverseGradient.value = true;
        this.mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        //this.mesh.rotation.set(Math.PI / 2, 0, 0);
        this.scene.add(this.mesh);
    }

    init() {
        const sphereGeometry = createTargetGeometry((0.5 * canvas.dimensions.size) / factor, 1)//new THREE.CylinderGeometry((0.5 * canvas.dimensions.size) / factor, (0.5 * canvas.dimensions.size) / factor, 0.0007, 32);
        const sphereMaterial = radialGradientShaderMaterial.clone();//new THREE.MeshBasicMaterial({ color: game.user.color, blending: THREE.MultiplyBlending });
        sphereMaterial.uniforms.curvecolor.value = game.Levels3DPreview.CONFIG.COLORS.COMBAT//new THREE.Color(game.user.color);
        sphereMaterial.uniforms.gridSize.value = (1 * canvas.dimensions.size) / factor;
        sphereMaterial.uniforms.reverseGradient.value = true;
        this.mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        //this.mesh.rotation.set(Math.PI / 2, 0, 0);
        this.scene.add(this.mesh);
    }

    update() {
        this.mesh.visible = this.visible;
        if (!this.mesh) return;
        if (!this.token) return;
        const token = this.token;
        const tokenPos = Ruler3D.posCanvasTo3d({ x: token.center.x, y: token.center.y, z: token.document.elevation });
        this.mesh.position.set(tokenPos.x, tokenPos.y, tokenPos.z);
        const size = Math.min(token.document.width, token.document.height);
        this.mesh.scale.set(size, size, size);
    }

    get token() {
        if (!game.combat?.current?.tokenId) return null;
        if (this._token?.id === game.combat?.current?.tokenId) return this._token;
        this._token = canvas.tokens.get(game.combat.current.tokenId);
        return this._token;
    }

    get visible() {
        if (!this.token?.isOwner) return false;
        return game.combat?.started ? true : false;
    }

    get scene() {
        return this._parent.scene;
    }
}
