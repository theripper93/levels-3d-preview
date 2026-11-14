import * as THREE from "three";
import { createHeightMaterial } from "./shaders.js";

const MODULE_ID = "levels-3d-preview";
const MAX_RESOLUTION = 1024;
const TEXELS_PER_SQUARE = 6;
const MARGIN = 0.05;
const DEBOUNCE = 1000;
const ZONE_FLAG = "weatherZone";

const zoneMaterial = new THREE.ShaderMaterial({
    vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "void main() { gl_FragColor = vec4(0.0, 0.0, 1.0, 0.0); }",
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
});

export class ShelterMap {
    constructor(parent, uniforms) {
        this._parent = parent;
        this.uniforms = uniforms;
        this.material = createHeightMaterial(0);
        this.camera = new THREE.OrthographicCamera();
        this.camera.layers.set(0);
        this.pixels = null;
        this.target = null;
        this.dirty = true;
        this.ready = false;
        this.invalidate = foundry.utils.debounce(() => (this.dirty = true), DEBOUNCE);
        this.setup();
    }

    setup() {
        const dimensions = canvas.scene.dimensions;
        const factor = game.Levels3DPreview.factor;
        const square = dimensions.size / factor;
        this.rect = new THREE.Vector4(dimensions.sceneX / factor, dimensions.sceneY / factor, dimensions.sceneWidth / factor, dimensions.sceneHeight / factor);
        const longest = Math.max(this.rect.z, this.rect.w);
        const resolution = Math.min(MAX_RESOLUTION, THREE.MathUtils.ceilPowerOfTwo(Math.ceil((longest / square) * TEXELS_PER_SQUARE)));
        this.width = Math.max(16, Math.round((resolution * this.rect.z) / longest));
        this.height = Math.max(16, Math.round((resolution * this.rect.w) / longest));
        this.target = new THREE.WebGLRenderTarget(this.width, this.height, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
        this.target.texture.colorSpace = THREE.NoColorSpace;
        this.pixels = new Uint8Array(this.width * this.height * 4);
        this.uniforms.uShelterMap.value = this.target.texture;
        this.uniforms.uShelterRect.value.set(this.rect.x, this.rect.y, 1 / this.rect.z, 1 / this.rect.w);
        this.uniforms.uTexel.value = this.rect.z / this.width;
    }

    get roots() {
        const L = this._parent;
        const roots = new Set([L.board, L.table]);
        for (const tile of Object.values(L.tiles ?? {})) {
            if (tile?.mesh && !tile.tile?.hidden && !tile.document?.hidden) roots.add(tile.mesh);
        }
        roots.delete(undefined);
        roots.delete(null);
        return roots;
    }

    get tilesLoaded() {
        return Object.values(this._parent.tiles ?? {}).every((tile) => tile?.mesh);
    }

    heightRange(roots) {
        const box = new THREE.Box3();
        const bounds = new THREE.Box3();
        for (const root of roots) {
            if (root === this._parent.table) continue;
            bounds.setFromObject(root);
            if (!bounds.isEmpty()) box.union(bounds);
        }
        if (box.isEmpty()) return { min: -MARGIN, max: 1 };
        return { min: box.min.y - MARGIN, max: Math.max(box.max.y, box.min.y + 0.1) + MARGIN };
    }

    zoneScene() {
        const factor = this._parent.factor;
        const scene = new THREE.Scene();
        for (const region of canvas.scene.regions) {
            if (!region.behaviors.some((behavior) => behavior.type === "suppressWeather" && !behavior.disabled) && region.getFlag(MODULE_ID, ZONE_FLAG) !== "shelter") continue;
            for (const polygon of region.polygons ?? []) {
                const points = [];
                for (let i = 0; i < polygon.points.length; i += 2) points.push(new THREE.Vector2(polygon.points[i] / factor, polygon.points[i + 1] / factor));
                const geometry = new THREE.ShapeGeometry(new THREE.Shape(points)).rotateX(Math.PI / 2);
                scene.add(new THREE.Mesh(geometry, zoneMaterial));
            }
        }
        return scene;
    }

    update() {
        if (!this.dirty || !this.tilesLoaded) return;
        this.dirty = false;
        this.render();
    }

    render() {
        const L = this._parent;
        const scene = L.scene;
        const renderer = L.renderer;
        const roots = this.roots;
        const { min, max } = this.heightRange(roots);
        const camera = this.camera;
        camera.left = this.rect.x;
        camera.right = this.rect.x + this.rect.z;
        camera.top = -this.rect.y;
        camera.bottom = -(this.rect.y + this.rect.w);
        camera.near = 0.001;
        camera.far = max - min + 1;
        camera.position.set(0, max + 0.5, 0);
        camera.up.set(0, 0, -1);
        camera.lookAt(0, min, 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        this.material.uniforms.uCameraY.value = camera.position.y;
        this.material.uniforms.uRange.value.set(min, max - min);
        this.uniforms.uShelterY.value.set(min, max - min);

        const hidden = [];
        for (const child of scene.children) {
            const keep = roots.has(child);
            if (child.visible !== keep) {
                hidden.push([child, child.visible]);
                child.visible = keep;
            }
        }
        const state = {
            target: renderer.getRenderTarget(),
            background: scene.background,
            fog: scene.fog,
            override: scene.overrideMaterial,
            autoClear: renderer.autoClear,
            shadows: renderer.shadowMap.autoUpdate,
            clearColor: renderer.getClearColor(new THREE.Color()),
            clearAlpha: renderer.getClearAlpha(),
        };
        scene.background = null;
        scene.fog = null;
        scene.overrideMaterial = this.material;
        renderer.shadowMap.autoUpdate = false;
        renderer.autoClear = true;
        renderer.setClearColor(0x000000, 0);
        renderer.setRenderTarget(this.target);
        renderer.clear();
        renderer.render(scene, camera);
        const zones = this.zoneScene();
        if (zones.children.length) {
            renderer.autoClear = false;
            renderer.render(zones, camera);
            zones.children.forEach((mesh) => mesh.geometry.dispose());
        }
        renderer.readRenderTargetPixels(this.target, 0, 0, this.width, this.height, this.pixels);
        renderer.setRenderTarget(state.target);
        renderer.setClearColor(state.clearColor, state.clearAlpha);
        renderer.autoClear = state.autoClear;
        renderer.shadowMap.autoUpdate = state.shadows;
        scene.overrideMaterial = state.override;
        scene.fog = state.fog;
        scene.background = state.background;
        for (const [child, visible] of hidden) child.visible = visible;
        this.ready = true;
    }

    sample(x, z) {
        if (!this.ready) return null;
        const u = Math.clamp((x - this.rect.x) / this.rect.z, 0, 1);
        const v = Math.clamp((z - this.rect.y) / this.rect.w, 0, 1);
        const px = Math.min(Math.floor(u * this.width), this.width - 1);
        const py = Math.min(Math.floor((1 - v) * this.height), this.height - 1);
        const index = (py * this.width + px) * 4;
        return this.pixels.subarray(index, index + 4);
    }

    heightAt(x, z) {
        const texel = this.sample(x, z);
        if (!texel || !texel[3]) return 0;
        const range = this.uniforms.uShelterY.value;
        return range.x + ((texel[0] * 256 + texel[1]) / 65535) * range.y;
    }

    isSheltered(x, z, y) {
        return this.heightAt(x, z) > y + 0.001 || (this.sample(x, z)?.[2] ?? 0) > 127;
    }

    dispose() {
        this.target?.dispose();
        this.material.dispose();
    }
}
