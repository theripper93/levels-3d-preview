import * as THREE from "../lib/three.module.js";
import { Shape3D } from "./shape3d.js";

export class Region3D extends THREE.Object3D {
    constructor(region, hidden = false) {
        super();
        this.isFog = false;
        if (region.document) region = region.document;
        this.region = region;
        const extrudeRegion = !region.isSingleShape || region.restriction.enabled; 
        for (const shape of region.shapes) {
            const extrude = extrudeRegion || shape.gridBased;
            const shape3d = Shape3D.create({ shape, extrude });
            this.add(shape3d);
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