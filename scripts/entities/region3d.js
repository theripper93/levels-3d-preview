import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { DiagonalStripesMaterial } from "../shaders/regionMaterial.js";
import { Shape3D } from "./shape3d.js";
import { ObscureVisionConfig, ObscureVisionRegionBehaviorType } from "../apps/obscureVisionRegionBehavior.js";

export class Region3D extends THREE.Object3D {
    constructor(region, hidden = false) {
        super();
        this.isFog = region.behaviors.some((b) => b.type === "levels-3d-preview.obscureVision" && b.disabled === false);
        this.region = region;
        this.top = Number.isFinite(this.region.elevation.top) ?
            this.region.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
        this.bottom = Number.isFinite(this.region.elevation.bottom) ?
            this.region.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
        this.height = this.top !== this.bottom ? this.top - this.bottom : 0.001;
        const extrudeRegion = (region.shapes?.length > 1) || region.restriction.enabled;
        // this.material = new DiagonalStripesMaterial({ color: region.color.css });
        // this.material.side = this.height < 0.01 ? THREE.FrontSide : THREE.DoubleSide;
        if (extrudeRegion) {
            this.drawExtrude();
        } else {
            this.drawShapes();
        }
        if (this.region?.object?.isVisible === false) return;
        if (hidden) return;
        this.addToScene();
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

    get embeddedName() {
        return "Region";
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

    applyHitbox() {
        for (const shape of this.children) {
            for (const shapeMesh of shape.children) {
                shapeMesh.userData.entity3D = this;
                shapeMesh.userData.noIntersect = false;
            }
        }
        this.userData.hitbox = this;
        this.userData.interactive = true;
        this.userData.entity3D = this;
        this.userData.isHitbox = true;
    }

    drawShapes() {
        for (const shape of this.region.shapes) {
            const shape3d = Shape3D.create({ shape, region: this.region });
            this.add(shape3d);
        }
        this.applyHitbox();
    }

    drawExtrude() {
        const geometry = Shape3D.extrudeGeometry(this.region.polygonTree, { depth: this.height });
        geometry.translate(0, this.bottom, 0);
        const material = new DiagonalStripesMaterial({ color: this.region.color.css, scale: 30 });
        material.side = this.height <= 0.01 ? THREE.FrontSide : THREE.BackSide;
        const mesh = new THREE.Mesh(geometry, material);
        this.add(mesh);
    }

    _onClickLeft(e) {
        this.region?.object?._onClickLeft(e);
    }

    _onClickLeft2(e) {
        this.region?.object?._onClickLeft2(e);
    }

    _onClickRight(e) {
        this.region?.object?._onClickRight(e);
    }

    _onClickRight2(e) {
        this.region?.object?._onClickRight2(e);
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
            const defaults = foundry.applications.sheets.palette.AmbientLightPalette.createData;
            const elevation = shape3d.origin.y * factor / canvas.scene.dimensions.distancePixels + 0.1;
            const lightData = foundry.utils.mergeObject(defaults, {
                config: {
                    dim: shape.radius / canvas.scene.dimensions.distancePixels,
                    bright: shape.radius / (2 * canvas.scene.dimensions.distancePixels),
                },
                x: shape.x,
                y: shape.y,
                elevation: elevation * 2,
            });
            const lights = await canvas.scene.createEmbeddedDocuments("AmbientLight", [lightData]);
            shape3d.destroy();
            return lights;
        }
        
        if (shape3d.tool === "sound") {
            const defaults = foundry.applications.sheets.palette.AmbientSoundPalette.createData;
            const elevation = shape3d.origin.y * factor / canvas.scene.dimensions.distancePixels + 0.1;
            const soundData = foundry.utils.mergeObject(defaults, {
                radius: shape.radius / canvas.scene.dimensions.distancePixels,
                x: shape.x,
                y: shape.y,
                elevation: elevation * 2,
            });
            const sounds = await canvas.scene.createEmbeddedDocuments("AmbientSound", [soundData]);
            sounds[0].sheet.render(true);
            shape3d.destroy();
            return sounds;
        }
        
        if (shape3d.tool === "tile") {
            let elevation = shape3d.origin.y * factor / canvas.scene.dimensions.distancePixels + 0.1;
            const width = shape3d.width * factor;
            const height = shape3d.depth * factor;
            const depth = shape3d.height * factor;
            let x = shape3d.origin.x * factor;
            let y = shape3d.origin.z * factor;
            if (width < 0) x += width;
            if (height < 0) y += height;
            if (depth < 0) elevation += depth / (2 * canvas.scene.dimensions.distancePixels);
            else elevation -= depth / (2 * canvas.scene.dimensions.distancePixels);

            const defaults = foundry.applications.sheets.palette.TilePalette.createData;
            const tileData = foundry.utils.mergeObject(defaults, {
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
            });
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

        const defaults = foundry.applications.sheets.palette.RegionPalette.createData;
        const document = await canvas.scene.createEmbeddedDocuments("Region", [
            foundry.utils.mergeObject(defaults, {
                name: "3DCanvas",
                color: shape3d.color,
                elevation: {
                    bottom: shape3d.elevationBottom * factor / canvas.scene.dimensions.distancePixels,
                    top: shape3d.elevationTop * factor / canvas.scene.dimensions.distancePixels
                },
                shapes: [shape],
            })
        ])?.[0];

        shape3d.destroy();
        return document;
    }

    static setHooks() {
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

Hooks.once('init', () => {
    const behaviorKey = "levels-3d-preview.obscureVision";
    Object.assign(CONFIG.RegionBehavior.dataModels, { [behaviorKey]: ObscureVisionRegionBehaviorType });
    Object.assign(CONFIG.RegionBehavior.typeIcons, { [behaviorKey]: "fas fa-eye-slash" });
    foundry.applications.apps.DocumentSheetConfig.registerSheet(RegionBehavior, "levels-3d-preview", ObscureVisionConfig, {
        types: ["obscureVision"],
        label: "Obscure Vision",
    });
});