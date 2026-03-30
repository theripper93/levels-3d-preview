import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { DiagonalStripesMaterial } from "../shaders/regionMaterial.js";
import { Shape3D } from "./shape3d.js";

export class Region3D extends THREE.Object3D {
    constructor(region, hidden = false) {
        super();
        this.isFog = false;
        if (region.document) region = region.document;
        this.region = region;
        this.top = Number.isFinite(this.region.elevation.top) ?
            this.region.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
        this.bottom = Number.isFinite(this.region.elevation.bottom) ?
            this.region.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
        this.height = this.top !== this.bottom ? this.top - this.bottom : 0.001;
        const extrudeRegion = !region.isSingleShape || region.restriction.enabled;
        this.material = new DiagonalStripesMaterial({ color: region.color.css });
        this.material.side = this.height < 0.01 ? THREE.FrontSide : THREE.DoubleSide;
        if (extrudeRegion) {
            this.drawExtrude();
        } else {
            this.drawShapes();
        }
        if (!hidden) this.addToScene();
    }

    addToScene() {
        game.Levels3DPreview.scene.add(this);
    }

    destroy() {
        game.Levels3DPreview.scene.remove(this);
    }

    updateVisibility() {
        for (const shape of this.children) {
            shape.updateVisibility();
        }
    }

    containsPoint(point) {
        for (const shape of this.children) {
            if (shape.containsPoint(point)) return true;
        }
        return false;
    }

    drawShapes() {
        for (const shape of this.region.shapes) {
            const shape3d = Shape3D.create({ shape, material: this.material });
            this.add(shape3d);
        }
    }

    drawExtrude() {
        const geometry = Shape3D.extrudeGeometry(this.region.polygonTree, { depth: this.height });
        geometry.translate(0, this.bottom, 0);
        const material = this.material ?? new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const mesh = new THREE.Mesh(geometry, material);
        this.add(mesh);
    }

    static #regions = {};
    
    static get regions() {
        return Region3D.#regions;
    }

    static handle(region) {
        if (region.id in this.regions) {
            return this.update(region);
        }
        return this.create(region);
    }

    static update(region) {
        this.regions[region.id].destroy();
        return this.create(region);
    }

    static create(region) {
        const region3d = new Region3D(region);
        this.regions[region.id] = region3d;
        return region3d;
    }

    static destroy(region) {
        if (region.id in this.regions) {
            this.regions[region.id].destroy();
            delete this.regions[region.id];
        }
    }

    static clear() {
        for (const region of Object.values(this.regions)) {
            region.destroy();
        }
        this.#regions = {};
    }

    static updateVisibility() {
        for (const region of Object.values(this.regions)) {
            region.updateVisibility();
        }
    }

    static checkInFog(point) {
        for (const region of Object.values(this.regions)) {
            if (!region.isFog) continue;
            if (region.containsPoint(point)) return true;
        }
        return false;
    }

    static setHooks() {
        Hooks.on("createRegion", (region) => {
            if (!game.Levels3DPreview?._active || !region.object) return;
            Region3D.handle(region);
        });

        Hooks.on("updateRegion", (region) => {
            if (!game.Levels3DPreview?._active || !region.object) return;
            Region3D.handle(region);
        });

        Hooks.on("deleteRegion", (region) => {
            if (!game.Levels3DPreview?._active) return;
            Region3D.destroy(region);
        });
    }
}