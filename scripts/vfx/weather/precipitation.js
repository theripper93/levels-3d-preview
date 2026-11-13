import * as THREE from "three";
import { createPrecipitationMaterial, createImpactMaterial, HEIGHT_RATIO, SPEED_STEPS } from "./shaders.js";
import { getAtlas } from "./atlas.js";

export const MAX_INSTANCES = 65536;
const BOUNCE_HEIGHT = 0.3;
const LOD_FADE_COMPENSATION = 2;

let sharedArrays = null;

function random(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function getSharedArrays() {
    if (sharedArrays) return sharedArrays;
    const next = random(1337);
    const seeds = new Float32Array(MAX_INSTANCES * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = next();
    sharedArrays = {
        position: new Float32Array(12),
        corner: new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]),
        seed: seeds,
        index: new Uint16Array([0, 1, 2, 0, 2, 3]),
    };
    return sharedArrays;
}

function createGeometry() {
    const arrays = getSharedArrays();
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(arrays.index, 1));
    geometry.setAttribute("position", new THREE.BufferAttribute(arrays.position, 3));
    geometry.setAttribute("corner", new THREE.BufferAttribute(arrays.corner, 2));
    geometry.setAttribute("seed", new THREE.InstancedBufferAttribute(arrays.seed, 4));
    geometry.instanceCount = 0;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    return geometry;
}

function createMesh(material, renderOrder) {
    const mesh = new THREE.Mesh(createGeometry(), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.matrixAutoUpdate = false;
    mesh.userData.ignoreHover = true;
    mesh.userData.noIntersect = true;
    mesh.raycast = () => {};
    mesh.visible = false;
    return mesh;
}

function instanceCount(count, amount, scale, factor = 1) {
    return Math.min(Math.round(count * Math.max(amount, 0) * scale * factor), MAX_INSTANCES);
}

export class PrecipitationLayer {
    constructor(layer, shared, seedShift) {
        this.key = layer.key;
        this.offset = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.material = createPrecipitationMaterial(shared);
        this.material.uniforms.uSeedShift.value = seedShift;
        this.mesh = createMesh(this.material, 10);
        this.impact = null;
        this.impactMaterial = null;
        this.setTextures(layer.textures);
        this.layer = layer;
    }

    setTextures(textures) {
        const key = textures.join(",");
        if (key === this.textureKey) return;
        this.textureKey = key;
        this.atlas = getAtlas(textures);
        const uniforms = this.material.uniforms;
        uniforms.uMap.value = this.atlas.texture;
        uniforms.uTiles.value.set(this.atlas.cols, this.atlas.rows);
        uniforms.uTileCount.value = this.atlas.count;
    }

    ensureImpact(shared) {
        if (this.impact) return this.impact;
        this.impactMaterial = createImpactMaterial(shared);
        this.impactMaterial.uniforms.uSeedShift.value = this.material.uniforms.uSeedShift.value + 0.5;
        this.impact = createMesh(this.impactMaterial, 9);
        this.mesh.parent?.add(this.impact);
        return this.impact;
    }

    apply(layer, { squareSize, quality, shared }) {
        this.layer = layer;
        this.setTextures(layer.textures);
        const u = this.material.uniforms;
        u.uColors.value.forEach((color, index) => color.copy(layer.colors[index % layer.colors.length]));
        u.uColorCount.value = layer.colors.length;
        u.uSize.value = layer.size * squareSize;
        u.uSizeVariation.value = layer.sizeVariation;
        u.uStretch.value = layer.stretch * squareSize;
        u.uSway.value = layer.sway * squareSize;
        u.uSwayFrequency.value = layer.swayFrequency;
        u.uSpin.value = layer.spin;
        u.uRandomRotation.value = layer.randomRotation;
        u.uRotation.value = layer.rotation;
        u.uFlip.value = layer.flip;
        u.uTwinkle.value = layer.twinkle;
        u.uSpeedVariation.value = layer.speedVariation;
        u.uOpacity.value = layer.opacity * Math.min(layer.amount * 2, 1);
        u.uGround.value = layer.ground;
        u.uBand.value = layer.band * squareSize;
        u.uLift.value = layer.offset * squareSize;
        u.uShelter.value = layer.shelter;
        u.uLit.value = layer.lit;
        u.uDesaturate.value = layer.desaturate;
        u.uAdditive.value = layer.additive;
        this.mesh.geometry.instanceCount = instanceCount(layer.count, layer.amount, quality.particleScale, LOD_FADE_COMPENSATION);
        this.mesh.visible = this.mesh.geometry.instanceCount > 0;
        if (layer.impact) {
            const impact = this.ensureImpact(shared);
            const iu = this.impactMaterial.uniforms;
            const bounce = layer.impact.kind === "bounce";
            iu.uSize.value = layer.impact.size * squareSize;
            iu.uBounce.value = bounce ? BOUNCE_HEIGHT * squareSize : 0;
            iu.uRate.value = bounce ? 1.4 : 2.2;
            iu.uOpacity.value = layer.opacity * Math.min(layer.amount * 2, 1);
            impact.geometry.instanceCount = instanceCount(layer.impact.count, layer.amount, quality.particleScale);
        } else if (this.impact) this.impact.geometry.instanceCount = 0;
    }

    update(delta, { wind, gust, squareSize, wrap }) {
        const layer = this.layer;
        this.velocity.set(wind.vector.x * gust * layer.windFactor + layer.drift * squareSize, -layer.fall * squareSize, wind.vector.z * gust * layer.windFactor);
        this.offset.addScaledVector(this.velocity, delta);
        this.offset.set(wrapValue(this.offset.x, wrap), wrapValue(this.offset.y, wrap * HEIGHT_RATIO), wrapValue(this.offset.z, wrap));
        this.material.uniforms.uOffset.value.copy(this.offset);
        this.material.uniforms.uVelocity.value.copy(this.velocity);
        this.atlas.update();
        if (this.impact) this.impact.visible = this.impact.geometry.instanceCount > 0;
    }

    addTo(parent) {
        parent.add(this.mesh);
        if (this.impact) parent.add(this.impact);
    }

    dispose() {
        for (const mesh of [this.mesh, this.impact]) {
            if (!mesh) continue;
            mesh.removeFromParent();
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }
}

function wrapValue(value, wrap) {
    return value - Math.floor(value / wrap) * wrap;
}

export function wrapDistance(base, maxLevel) {
    return SPEED_STEPS * base * Math.pow(2, maxLevel);
}
