import * as THREE from "three";
import { frame } from "../render/frame.js";
import { compileForComposer } from "../render/pipeline.js";
import { DisplayReferredColor } from "../render/outputPass.js";
import { OUTLINE_LAYER, OUTLINE_ORDER, createOutlineMaterials, createProxy, isOutlineSource } from "../render/outlineShell.js";

const OUTLINE_LAYERS = [
    { width: 1.5, opacity: 1, boost: 1.15 },
    { width: 2.5, opacity: 0.35, boost: 1 },
    { width: 3.5, opacity: 0.12, boost: 1 },
];
const DISPLAY_LIMIT = 0.97;

export class OutlineHandler {
    constructor(_parent) {
        this.parent = _parent;
        this._enabled = game.settings.get("levels-3d-preview", "outline");
        this.controlledOutline = new Map();
        this.hoveredOutline = new Map();
        if (this._enabled) this.init();
    }

    get active() {
        return this._enabled && !!(this.controlledOutline.size || this.hoveredOutline.size);
    }

    get renderer() {
        return this.parent.renderer;
    }

    get scene() {
        return this.parent.scene;
    }

    get camera() {
        return this.parent.camera;
    }

    get composer() {
        return this.parent.composer;
    }

    getDispositionColor(disposition) {
        const disp = Object.entries(CONST.TOKEN_DISPOSITIONS).find((entry) => entry[1] === disposition);
        return CONFIG.Canvas.dispositionColors[disp?.[0]] || CONFIG.Canvas.dispositionColors.NEUTRAL;
    }

    init() {
        this.resolution = { value: new THREE.Vector2(1, 1) };
        this.materials = createOutlineMaterials(this.resolution, OUTLINE_LAYERS);
        this.root = new THREE.Group();
        this.root.matrixAutoUpdate = false;
        this.root.matrixWorldAutoUpdate = false;
        this.root.renderOrder = OUTLINE_ORDER;
        this.root.layers.set(OUTLINE_LAYER);
        this.displayColor = new DisplayReferredColor();
        this.scratchColor = new THREE.Color();
        this.exposure = { toneMappingExposure: 1 };
        this.camera.layers.enable(OUTLINE_LAYER);
    }

    createProxies(source, colors) {
        return this.materials.map((material, index) => createProxy(source, material, OUTLINE_ORDER + index, colors[index]));
    }

    warmUp() {
        if (!this._enabled) return;
        const models = Object.values(this.parent.tokens).map((t) => t.model).filter(Boolean);
        const dummy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        const group = new THREE.Group();
        for (const object of [dummy, ...models]) object.traverse((child) => isOutlineSource(child) && group.add(...this.createProxies(child, [])));
        try {
            compileForComposer(this.parent, group, this.camera, this.scene);
        } finally {
            dummy.geometry.dispose();
            dummy.material.dispose();
        }
    }

    addOutline(outlines, object, color) {
        const entry = { object, color: new THREE.Color().setHex(color, THREE.NoColorSpace), colors: OUTLINE_LAYERS.map(() => new THREE.Color()), items: [] };
        object.traverse((source) => {
            if (!isOutlineSource(source)) return;
            const proxies = this.createProxies(source, [null, ...entry.colors]);
            entry.items.push({ source, proxies });
            this.root.add(...proxies);
        });
        outlines.set(object, entry);
    }

    removeOutline(outlines, object) {
        const entry = outlines.get(object);
        if (!entry) return;
        for (const item of entry.items) for (const proxy of item.proxies) proxy.removeFromParent();
        outlines.delete(object);
    }

    toggleControlled(object, controlled) {
        if (!this._enabled) return;
        if (!controlled) return this.removeOutline(this.controlledOutline, object);
        if (!this.controlledOutline.has(object)) this.addOutline(this.controlledOutline, object, CONFIG.Canvas.dispositionColors.CONTROLLED);
    }

    toggleHovered(object, hovered, disposition) {
        if (!this._enabled) return;
        if (!hovered) return this.removeOutline(this.hoveredOutline, object);
        const color = this.getDispositionColor(disposition);
        const entry = this.hoveredOutline.get(object);
        if (entry) entry.color.setHex(color, THREE.NoColorSpace);
        else this.addOutline(this.hoveredOutline, object, color);
    }

    clearAllOutlines() {
        for (const outlines of [this.controlledOutline, this.hoveredOutline]) for (const object of [...outlines.keys()]) this.removeOutline(outlines, object);
    }

    update() {
        if (!this.active) {
            if (this.root?.parent) this.root.removeFromParent();
            return;
        }
        if (this.root.parent !== this.scene) this.scene.add(this.root);
        this.renderer.getDrawingBufferSize(this.resolution.value);
        const mask = this.camera.layers.mask;
        for (const outlines of [this.controlledOutline, this.hoveredOutline]) for (const entry of outlines.values()) this.updateEntry(entry, mask);
    }

    updateEntry(entry, mask) {
        const shown = isShownIn(entry.object, this.scene);
        if (shown) this.updateColors(entry);
        for (const { source, proxies } of entry.items) {
            const visible = shown && (source.layers.mask & mask) !== 0 && isShownWithin(source, entry.object);
            for (const proxy of proxies) proxy.visible = visible;
        }
    }

    updateColors(entry) {
        OUTLINE_LAYERS.forEach((layer, index) => this.toSceneColor(this.scratchColor.copy(entry.color).multiplyScalar(layer.boost), entry.colors[index]));
    }

    toSceneColor(display, target) {
        display.r = Math.min(display.r, DISPLAY_LIMIT);
        display.g = Math.min(display.g, DISPLAY_LIMIT);
        display.b = Math.min(display.b, DISPLAY_LIMIT);
        display.convertSRGBToLinear();
        this.exposure.toneMappingExposure = frame.exposure;
        this.displayColor.wrap(display, this.exposure).getRGB(target);
    }

    destroy() {
        if (!this._enabled) return;
        this.clearAllOutlines();
        this.root.removeFromParent();
        for (const material of this.materials) material.dispose();
    }

    static setHooks() {
        setOutlineHooks();
    }
}

function isShownIn(object, scene) {
    let current = object;
    while (current) {
        if (!current.visible) return false;
        if (current === scene) return true;
        current = current.parent;
    }
    return false;
}

function isShownWithin(object, root) {
    let current = object;
    while (current && current !== root) {
        if (!current.visible) return false;
        current = current.parent;
    }
    return current === root;
}

function setOutlineHooks() {

    Hooks.on("controlTile", (tile, controlled) => {
        if (!game.Levels3DPreview?._active || !canvas.tiles.active) return;
        const object3D = game.Levels3DPreview.tiles[tile.id]?.mesh;
        if (object3D) game.Levels3DPreview.outline.toggleControlled(object3D, controlled);
    });

    Hooks.on("refreshTile", (tile) => {
        if (!game.Levels3DPreview?._active || !canvas.tiles.active) return;
        const object3D = game.Levels3DPreview.tiles[tile.id]?.mesh;
        if (object3D) game.Levels3DPreview.outline.toggleHovered(object3D, tile.hover && !tile.controlled, 1);
    });

    Hooks.on("hoverTile", (tile, hovered) => {
        if (!game.Levels3DPreview?._active) return;
        const tile3d = game.Levels3DPreview.tiles[tile.id];
        if(!tile3d) return;
        const isDoor = tile3d?.data?.isDoor;
        const isSecret = tile3d?.data?.isSecret;
        const tilesActive = canvas.tiles.active;
        if (!isDoor && !tilesActive) return;
        if(!game.user.isGM && isSecret) return;
        const object3D = game.Levels3DPreview.tiles[tile.id]?.mesh;
        if (object3D) game.Levels3DPreview.outline.toggleHovered(object3D, hovered && !tile.controlled, 1);
    });

    Hooks.on("deactivateTilesLayer", () => {
        if (!game.Levels3DPreview?._active) return;
        setTimeout(() => {
            game.Levels3DPreview.outline.clearAllOutlines();
        }, 100);
    });

    Hooks.on("activateTilesLayer", () => {
        if (!game.Levels3DPreview?._active) return;
        setTimeout(() => {
            game.Levels3DPreview.outline.clearAllOutlines();
        }, 100);
    });

    Hooks.on("deactivateTokensLayer", () => {
        if (!game.Levels3DPreview?._active) return;
        setTimeout(() => {
            game.Levels3DPreview.outline.clearAllOutlines();
        }, 100);
    });

    Hooks.on("activateTokensLayer", () => {
        if (!game.Levels3DPreview?._active) return;
        setTimeout(() => {
            game.Levels3DPreview.outline.clearAllOutlines();
        }, 100);
    });
}
