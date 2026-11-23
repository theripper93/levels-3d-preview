import * as THREE from "three";
import { getQuality } from "../vfx/quality.js";

const PREPASS_VERTICES = 65536;
const PIXEL_BOUND_PIXELS = 4000000;
const HIGH_TIERS = new Set(["high", "ultra"]);
const _size = new THREE.Vector2();
const materials = new Map();
const emptyGeometry = new THREE.BufferGeometry();

function depthMaterial(side) {
    let material = materials.get(side);
    if (!material) {
        material = new THREE.MeshBasicMaterial({ side, colorWrite: false, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 1 });
        materials.set(side, material);
    }
    return material;
}

export function prepassAllowed(renderer) {
    if (HIGH_TIERS.has(getQuality().tier)) return true;
    const size = renderer.getDrawingBufferSize(_size);
    return size.x * size.y >= PIXEL_BOUND_PIXELS;
}

export function wantsPrepass(batch) {
    const material = batch.mesh.material;
    if (batch.vertices < PREPASS_VERTICES || batch.mesh.sortObjects || batch.mesh.perObjectFrustumCulled) return false;
    if (material.transparent || material.alphaTest > 0 || material.alphaHash || material.alphaToCoverage || material.alphaMap || material.transmission > 0) return false;
    if (!material.visible || !material.depthWrite || !material.depthTest || !material.colorWrite || material.depthFunc !== THREE.LessEqualDepth) return false;
    if (material._userOnBeforeCompile || material.displacementMap || material.clippingPlanes?.length || material.wireframe) return false;
    return true;
}

export class BatchPrepass extends THREE.Mesh {
    constructor(source) {
        super(emptyGeometry, depthMaterial(source.material.side === THREE.BackSide ? THREE.BackSide : THREE.FrontSide));
        this.source = source;
        this.active = true;
        this.isBatchedMesh = true;
        this.frustumCulled = false;
        this.matrixAutoUpdate = false;
        this.matrixWorldAutoUpdate = false;
        this.matrixWorld = source.matrixWorld;
        this.layers = source.layers;
        this.renderOrder = source.renderOrder - 0.5;
        this.userData.kitBatch = true;
    }

    get geometry() {
        return this.source?.geometry ?? emptyGeometry;
    }

    set geometry(value) {}

    get visible() {
        return !!this.source && this.active && this.source.visible;
    }

    set visible(value) {}

    get _multiDrawStarts() {
        return this.source._multiDrawStarts;
    }

    get _multiDrawCounts() {
        return this.source._multiDrawCounts;
    }

    get _multiDrawCount() {
        return this.source._multiDrawCount;
    }

    get _matricesTexture() {
        return this.source._matricesTexture;
    }

    get _indirectTexture() {
        return this.source._indirectTexture;
    }

    get _colorsTexture() {
        return this.source._colorsTexture;
    }

    onBeforeRender(renderer, scene, camera, geometry, material, group) {
        const source = this.source;
        source.onBeforeRender(renderer, scene, camera, source.geometry, source.material, group);
    }

    raycast() {}
}
