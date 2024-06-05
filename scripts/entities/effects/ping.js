import {loadTextFont} from "../../helpers/dynaMesh.js";
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
    constructor(position, color, scale = 1, specialPing = null) {
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
        if (specialPing) {
            this.core.children[1].visible = false;
            this.ping.add(SPECIAL_PINGS[specialPing].sprite);
            this.setColor(SPECIAL_PINGS[specialPing].color);
        }
        this.ping.scale.set(0, 0, 0);
        this.ring.scale.set(CONFIG.RING_START_SCALE, CONFIG.RING_START_SCALE, CONFIG.RING_START_SCALE);
        this.ring.material.uniforms.opacity.value = 0;
        this.ping.position.set(position.x, position.y, position.z);
        this.scene.add(this.ping);
        this.pings.add(this);
        this.core.traverse((child) => {
            if(!child.isMesh) return;
            child.userData.noIntersect = true;
            child.userData.ignoreHover = true;
            child.userData.ignoreIntersect = true;
            child.userData.interactive = false;
        });
        this.ring.traverse((child) => {
            if(!child.isMesh) return;
            child.userData.noIntersect = true;
            child.userData.ignoreHover = true;
            child.userData.ignoreIntersect = true;
            child.userData.interactive = false;
        });
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


const SPECIAL_PINGS = {
    "question": {
        text: "?",
        texture: "modules/levels-3d-preview/assets/pings/question.webp",
        color: new THREE.Color("yellow"),
        cssColor: "yellow",
    },
    "exclamation": {
        text: "!",
        texture: "modules/levels-3d-preview/assets/pings/exclamation.webp",
        color: new THREE.Color("red"),
        cssColor: "red",
    },
    "location": {
        text: "↓",
        texture: "modules/levels-3d-preview/assets/pings/arrow-down.webp",
        color: new THREE.Color("dodgerblue"),
        cssColor: "dodgerblue",
    },
    "target": {
        text: "⇥",
        texture: "modules/levels-3d-preview/assets/pings/target.webp",
        color: new THREE.Color("green"),
        cssColor: "green",
    },
}

const SPECIAL_PING_SCALE = pingSize * 2;

async function getSpecialPingSprite(ping) {
    const specialPing = SPECIAL_PINGS[ping];
    if (!specialPing) return null;
    if (specialPing.sprite) return specialPing.sprite.clone();
    const texture = await new THREE.TextureLoader().load(specialPing.texture);
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        color: specialPing.color,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(SPECIAL_PING_SCALE, SPECIAL_PING_SCALE, SPECIAL_PING_SCALE);
    sprite.position.set(0, SPECIAL_PING_SCALE * 0.6, 0);
    specialPing.sprite = sprite;
    return sprite;
}

Object.keys(SPECIAL_PINGS).forEach((ping) => {
    getSpecialPingSprite(ping);
});

export class TacticalPingPicker {
    constructor () {
        this.render();
        this.pingType = null;
    }
    
    render() {
        let html = "";

        //draw an svg circle sectors

        const sectorsCount = Object.keys(SPECIAL_PINGS).length;
        const SP_KEYS = Object.keys(SPECIAL_PINGS);
        const sectorSize = 360 / sectorsCount;
        for (let i = 0; i < sectorsCount; i++) {
            const specialPing = SPECIAL_PINGS[SP_KEYS[i]];
            const startAngle = i * sectorSize;
            const endAngle = (i + 1) * sectorSize;

            // Convert angles to radians
            const startRadians = (startAngle - 90) * (Math.PI / 180);
            const endRadians = (endAngle - 90) * (Math.PI / 180);

            // Calculate the x and y coordinates for the start and end points
            const x1 = 50 + 50 * Math.cos(startRadians);
            const y1 = 50 + 50 * Math.sin(startRadians);
            const x2 = 50 + 50 * Math.cos(endRadians);
            const y2 = 50 + 50 * Math.sin(endRadians);

            // Create the path for the sector
            const largeArcFlag = sectorSize > 180 ? 1 : 0;
            const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
            // Add the path to the SVG
            html += `<path data-type="${SP_KEYS[i]}" d="${pathData}" fill="${specialPing.cssColor}" stroke="" stroke-width="2"></path>`;

            //add text centered on the path
            const text = document.createElement("text");
            text.setAttribute("x", `${(x1 + x2) / 2}`);
            text.setAttribute("y", `${(y1 + y2) / 2}`);
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("dominant-baseline", "middle");
            text.innerHTML = specialPing.text;
            html += `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2}" text-anchor="middle" dominant-baseline="middle">${specialPing.text}</text>`;
        }

        //const svg = `<svg width="200" height="200" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`;

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "200");
        svg.setAttribute("height", "200");
        svg.setAttribute("viewBox", "0 0 100 100");

        svg.innerHTML = html;

        const tacticalPickerContainer = document.createElement("div");
        tacticalPickerContainer.id = "tactical-ping-picker";
        tacticalPickerContainer.appendChild(svg);

        const defaultPing = document.createElement("div");
        defaultPing.classList.add("basic-ping");
        defaultPing.addEventListener("mouseenter", (e) => {
            const type = e.target.getAttribute("data-type");
            this.pingType = null;
        });

        defaultPing.addEventListener("mouseleave", (e) => {
            this.pingType = null;
        });

        tacticalPickerContainer.appendChild(defaultPing);

        tacticalPickerContainer.style.left = `${game.Levels3DPreview.interactionManager.domMousePosition.x - window.innerWidth * 0.05}px`;
        tacticalPickerContainer.style.top = `${game.Levels3DPreview.interactionManager.domMousePosition.y - window.innerWidth * 0.05}px`;

        tacticalPickerContainer.querySelectorAll("path").forEach((path) => {
            path.addEventListener("mouseenter", (e) => {
                const type = e.target.getAttribute("data-type");
                this.pingType = type;
            });

            path.addEventListener("mouseleave", (e) => {
                this.pingType = null;
            });
        });
        
        this.element = tacticalPickerContainer;

        document.body.appendChild(tacticalPickerContainer);
    
    }

    close() {
        document.querySelectorAll("#tactical-ping-picker").forEach((t) => t.remove());
        return this.pingType;
    }
}