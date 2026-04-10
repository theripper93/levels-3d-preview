import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { DiagonalStripesMaterial } from "../shaders/regionMaterial.js";
import { Shape3D } from "./shape3d.js";

export class Region3D extends THREE.Object3D {
    constructor(region, hidden = false) {
        super();
        this.isFog = false;
        this.region = region;
        this.top = Number.isFinite(this.region.elevation.top) ?
            this.region.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
        this.bottom = Number.isFinite(this.region.elevation.bottom) ?
            this.region.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
        this.height = this.top !== this.bottom ? this.top - this.bottom : 0.001;
        const extrudeRegion = (region.shapes?.length > 1) || region.restriction.enabled;
        this.material = new DiagonalStripesMaterial({ color: region.color.css });
        this.material.side = this.height < 0.01 ? THREE.FrontSide : THREE.DoubleSide;
        if (extrudeRegion) {
            this.drawExtrude();
        } else {
            this.drawShapes();
        }
        if (!hidden) this.addToScene();
    }
    #bottom = 0;
    #height = 0.01;
    
    set height(value) {
        this.#height = value;
    }

    get height() {
        const alwaysFlat = game.settings.get("levels-3d-preview", "regionsAlwaysFlat");
        if (alwaysFlat) return 0.01;
        return this.#height;
    }

    set bottom(value) {
        this.#bottom = value;
    }

    get bottom() {
        const alwaysFlat = game.settings.get("levels-3d-preview", "regionsAlwaysFlat");
        if (alwaysFlat) return 0;
        return this.#bottom;
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

    testPoint(point) {
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

    static #regions = new Map();
    
    static get regions() {
        return Region3D.#regions;
    }

    static handle(region, hidden) {
        if (region.document) region = region.document
        if (this.regions.has(region)) {
            return this.update(region, hidden);
        }
        return this.create(region, hidden);
    }

    static update(region, hidden) {
        this.regions.get(region).destroy();
        return this.create(region, hidden);
    }

    static create(region, hidden) {
        const region3d = new Region3D(region, hidden);
        this.regions.set(region, region3d);
        return region3d;
    }

    static destroy(region) {
        if (this.regions.has(region)) {
            this.regions.get(region).destroy();
            this.regions.delete(region);
        }
    }

    static clear() {
        this.regions.forEach((region) => region.destroy());
        this.#regions = new Map();
    }

    static updateVisibility() {
        this.regions.forEach((region) => region.updateVisibility());
    }


    static checkInFog(point) {
        for (const [key, region] of Array.from(this.regions)) {
            if (!region.isFog) continue;
            if (region.testPoint(point)) return true;
        }
        return false;
    }

    static async fromPreview(shape3d) {

        const shape = shape3d.shape;

        if (shape3d.tool === "light") {
            const elevation = shape3d.origin.y * factor / canvas.scene.dimensions.distancePixels + 0.1;
            const lightData = {
                config: {
                    dim: shape.radius / canvas.scene.dimensions.distancePixels,
                    bright: shape.radius / (2 * canvas.scene.dimensions.distancePixels),
                    color: null,
                },
                x: shape.x,
                y: shape.y,
                elevation: elevation * 2,
                shape: shape,
            };
            const lights = await canvas.scene.createEmbeddedDocuments("AmbientLight", [lightData]);
            shape3d.destroy();
            return lights;
        }
        
        if (shape3d.tool === "sound") {
            const elevation = shape3d.origin.y * factor / canvas.scene.dimensions.distancePixels + 0.1;
            const soundData = {
                radius: shape.radius / canvas.scene.dimensions.distancePixels,
                x: shape.x,
                y: shape.y,
                elevation: elevation * 2,
            };
            const sounds = await canvas.scene.createEmbeddedDocuments("AmbientSound", [soundData]);
            sounds[0].sheet.render(true);
            shape3d.destroy();
            return sounds;
        }
        
        if (shape3d.tool === "tile") {
            let elevation = shape3d.origin.y * factor / canvas.scene.dimensions.distancePixels + 0.1;
            const width = shape.width;
            const height = shape.height;
            const depth = shape3d.height * factor;
            let x = shape.x + shape.width / 2;
            let y = shape.y + shape.height / 2;
            if (width < 0) x += width;
            if (height < 0) y += height;
            if (depth < 0) elevation += depth / (2 * canvas.scene.dimensions.distancePixels);
            else elevation -= depth / (2 * canvas.scene.dimensions.distancePixels);

            const tileData = {
                width: Math.abs(width),
                height: Math.abs(height),
                texture: {
                    src: "modules/levels-3d-preview/assets/blank.webp",
                },
                x: x,
                y: y,
                elevation: elevation,
                flags: {
                    "levels-3d-preview": {
                        dynaMesh: "box",
                        autoGround: true,
                        depth: Math.abs(depth),
                    },
                },
            };
            const tiles = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
            shape3d.destroy();
            return tiles;
        }

        const selectedRegion = Shape3D.getSelectedRegion();
        if (selectedRegion) {
            const document = await selectedRegion.document.update({
                shapes: [
                    ...selectedRegion.document.shapes,
                    shape
                ]
            });
            shape3d.destroy();
            return document;
        }

        const document = await canvas.scene.createEmbeddedDocuments("Region", [{
            name: "3DCanvas",
            color: shape3d.color,
            elevation: {
                bottom: shape3d.elevationBottom * factor / canvas.scene.dimensions.distancePixels,
                top: shape3d.elevationTop * factor / canvas.scene.dimensions.distancePixels
            },
            shapes: [shape],
        }])?.[0];

        shape3d.destroy();
        return document;
    }

    static setHooks() {
        // Hooks.on("createRegion", (region) => {
        //     if (!game.Levels3DPreview?._active || !region.object) return;
        //     Region3D.handle(region);
        // });

        // Hooks.on("updateRegion", (region) => {
        //     if (!game.Levels3DPreview?._active || !region.object) return;
        //     Region3D.handle(region);
        // });

        // Hooks.on("deleteRegion", (region) => {
        //     if (!game.Levels3DPreview?._active) return;
        //     Region3D.destroy(region);
        // });

        // Hooks.on("refreshAmbientLight", (light) => {
        //     if (!game.Levels3DPreview?._active) return;
        //     const region = {
        //         elevation: {
        //             bottom: light.document.elevation,
        //             top: light.document.elevation + 10,
        //         },
        //         shapes: [light.document.shape],
        //     }
        //     Region3D.handle(region);
        // });

        Hooks.on("drawRegion", (region) => {
            if (!game.Levels3DPreview?._active || !region.object) return;
            Region3D.handle(region);
        });

        Hooks.on("refreshRegion", (region) => {
            if (!game.Levels3DPreview?._active) return;
            Region3D.handle(region);
        });

        Hooks.on("destroyRegion", (region) => {
            if (!game.Levels3DPreview?._active) return;
            Region3D.destroy(region.document);
        });
    }
}