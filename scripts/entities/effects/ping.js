import { mergeBufferGeometries } from "../../lib/BufferGeometryUtils.js";
import * as THREE from "../../lib/three.module.js";
import { radialGradientShaderMaterial, coneFadeGradientShaderMaterial, radialRingGradientShaderMaterial } from "../../shaders/shaderMaterials.js";

const CONFIG = {
    ANIMATION_TIME: 1.5,
    CORE_SIZE_TIME: 0.1,
    RING_START_SCALE: 5,
    RING_ENTER_TIME: 0.25,
    RING_DURATION: 0.25,
    RING_OPACITY: 0.9,
};

export class Ping {
    constructor(position, color, scale = 1) {
        const sound = game.settings.get("levels-3d-preview", "pingsound");
        if (sound) foundry.audio.AudioHelper.play({ src: sound, volume: game.settings.get("core", "globalInterfaceVolume") });
        this.position = position;
        this.scale = scale;
        this._currentTime = 0;
        this.core = coreMesh.clone(true);
        this.ring = ringMesh.clone();
        this.setColor(new THREE.Color(color));
        this.ping = new THREE.Group();
        this.ping.add(this.core);
        this.ping.add(this.ring);
        this.ping.scale.set(0, 0, 0);
        this.ring.scale.set(CONFIG.RING_START_SCALE, CONFIG.RING_START_SCALE, CONFIG.RING_START_SCALE);
        this.ring.material.uniforms.opacity.value = 0;
        this.ping.position.set(position.x, position.y, position.z);
        this.scene.add(this.ping);
        this.pings.add(this);
    }

    get scene() {
        return game.Levels3DPreview.scene;
    }

    get pings() {
        return game.Levels3DPreview.pings;
    }

    setColor(color) {
        if (!color) return;
        this.core.children[0].material = this.core.children[0].material.clone();
        this.core.children[1].material = this.core.children[1].material.clone();
        this.ring.material = this.ring.material.clone();
        this.core.children[0].material.uniforms.curvecolor.value = color;
        this.core.children[1].material.uniforms.curvecolor.value = color;
        this.ring.material.uniforms.curvecolor.value = color;
    }

    update(delta) {
        this._currentTime += delta;
        if (this._currentTime > CONFIG.ANIMATION_TIME) {
            this.ping.visible = false;
            this.pings.delete(this);
            this.scene.remove(this.ping);
        }
        if (this._currentTime <= CONFIG.CORE_SIZE_TIME) {
            const scale = (this._currentTime / CONFIG.CORE_SIZE_TIME) * this.scale;
            this.ping.scale.set(scale, scale, scale);
        }
        if (this._currentTime >= CONFIG.ANIMATION_TIME - CONFIG.CORE_SIZE_TIME) {
            const scale = ((CONFIG.ANIMATION_TIME - this._currentTime) / CONFIG.CORE_SIZE_TIME) * this.scale;
            this.ping.scale.set(scale, scale, scale);
        }
        if (this._currentTime >= CONFIG.RING_ENTER_TIME && this._currentTime <= CONFIG.RING_ENTER_TIME + CONFIG.RING_DURATION) {
            const current = (this._currentTime - CONFIG.RING_ENTER_TIME) / CONFIG.RING_DURATION;
            const scale = CONFIG.RING_START_SCALE * (1 - current);
            this.ring.scale.set(scale, scale, scale);
            this.ring.material.uniforms.opacity.value = CONFIG.RING_OPACITY * (current * 0.8);
        }
        if (this._currentTime > CONFIG.RING_ENTER_TIME + CONFIG.RING_DURATION) {
            this.ring.material.uniforms.opacity.value = 0;
        }
    }
}

const pingSize = 0.1;
const pingHeight = 0.5;

const base = new THREE.CylinderGeometry(pingSize, pingSize, 0.01, 32);
const top = new THREE.ConeGeometry(pingSize / 10, pingHeight * 1.5, 32);
top.translate(0, (pingHeight * 1.5) / 2, 0);
const baseMaterial = radialGradientShaderMaterial.clone();
baseMaterial.uniforms.curvecolor.value = new THREE.Color(0x00ff00);
baseMaterial.uniforms.gridSize.value = pingSize * 2;
baseMaterial.uniforms.reverseGradient.value = false;
baseMaterial.uniforms.glow.value = true;

const baseMesh = new THREE.Mesh(base, baseMaterial);

baseMesh.scale.set(0.5, 1, 0.5);

const topMaterial = coneFadeGradientShaderMaterial.clone();
topMaterial.uniforms.curvecolor.value = new THREE.Color(0x00ff00);
topMaterial.uniforms.height.value = pingHeight;
topMaterial.uniforms.radius.value = pingSize;
topMaterial.uniforms.opacity.value = 0.5;

const topMesh = new THREE.Mesh(top, topMaterial);

const coreMesh = new THREE.Group();

coreMesh.add(baseMesh);
coreMesh.add(topMesh);

const ring = new THREE.RingGeometry(pingSize / 2, pingSize * 2, 32);
ring.rotateX(-Math.PI / 2);
ring.translate(0, 0.01, 0);
const ringMaterial = radialRingGradientShaderMaterial.clone();
ringMaterial.uniforms.curvecolor.value = new THREE.Color(0x00ff00);
ringMaterial.uniforms.innerRadius.value = pingSize / 2;
ringMaterial.uniforms.outerRadius.value = pingSize * 2;
ringMaterial.uniforms.maxAlphaRadius.value = pingSize * 1.5;
ringMaterial.uniforms.reverseGradient.value = true;

const ringMesh = new THREE.Mesh(ring, ringMaterial);
