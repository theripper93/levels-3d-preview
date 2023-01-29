import * as THREE from "../lib/three.module.js";
import { OutlinePass } from "../lib/OutlinePass.js";

export class OutlineHandler{
    constructor(_parent){
        this.parent = _parent;
        this._enabled = game.settings.get("levels-3d-preview", "outline");
        if(this._enabled) this.init();
    }

    get renderer(){
        return this.parent.renderer;
    }

    get scene(){
        return this.parent.scene;
    }

    get camera(){
        return this.parent.camera;
    }

    get composer(){
        return this.parent.composer;
    }

    getDispositionColor(disposition){
        const disp = Object.entries(CONST.TOKEN_DISPOSITIONS).find(entry => entry[1] === disposition);
        return CONFIG.Canvas.dispositionColors[disp[0]] || CONFIG.Canvas.dispositionColors.NEUTRAL;
    }

    init(){
        this.controlledOutline = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.scene, this.camera);
        this.composer.addPass(this.controlledOutline);
        this.hoveredOutline = new OutlinePass(this.renderer.getSize(new THREE.Vector2()), this.scene, this.camera);
        this.composer.addPass(this.hoveredOutline);
    }

    toggleControlled(object, controlled){
        if(!this._enabled) return;
        if (controlled) {
            if(this.controlledOutline.selectedObjects.includes(object)) return;
            this.controlledOutline.visibleEdgeColor.set(CONFIG.Canvas.dispositionColors.CONTROLLED);
            this.controlledOutline.hiddenEdgeColor.set(CONFIG.Canvas.dispositionColors.CONTROLLED);
            this.controlledOutline.selectedObjects.push(object);
        } else {
            if(!this.controlledOutline.selectedObjects.includes(object)) return;
            this.controlledOutline.selectedObjects.splice(this.controlledOutline.selectedObjects.indexOf(object), 1);
        }
    }

    toggleHovered(object, hovered, disposition){
        if(!this._enabled) return;
        if (hovered) {
            if(this.hoveredOutline.selectedObjects.includes(object)) return;
            this.hoveredOutline.visibleEdgeColor.set(this.getDispositionColor(disposition));
            this.hoveredOutline.hiddenEdgeColor.set(this.getDispositionColor(disposition));
            this.hoveredOutline.selectedObjects.push(object);
        } else {
            if(!this.hoveredOutline.selectedObjects.includes(object)) return;
            this.hoveredOutline.selectedObjects.splice(this.hoveredOutline.selectedObjects.indexOf(object), 1);
        }
    }

    clearAllOutlines() {
        this.controlledOutline.selectedObjects = [];
        this.hoveredOutline.selectedObjects = [];
    }

    static setHooks(){
        setOutlineHooks();
    }
}

function setOutlineHooks(){

    Hooks.on("controlToken", (token, controlled) => {
        if (!game.Levels3DPreview?._active || !canvas.tokens.active) return;
        const object3D = game.Levels3DPreview.tokens[token.id]?.model;
        if(object3D) game.Levels3DPreview.outline.toggleControlled(object3D, controlled);
    })

    Hooks.on("refreshToken", (token) => {
        if (!game.Levels3DPreview?._active || !canvas.tokens.active) return;
        const object3D = game.Levels3DPreview.tokens[token.id]?.model;
        if(object3D) game.Levels3DPreview.outline.toggleHovered(object3D, token.hover && !token.controlled, token?.document?.disposition);
    });

    Hooks.on("hoverToken", (token, hovered) => {
        if (!game.Levels3DPreview?._active || !canvas.tokens.active) return;
        const object3D = game.Levels3DPreview.tokens[token.id]?.model;
        if (object3D) game.Levels3DPreview.outline.toggleHovered(object3D, hovered && !token.controlled, token?.document?.disposition);
    });

    Hooks.on("controlTile", (tile, controlled) => {
        if (!game.Levels3DPreview?._active || !canvas.tiles.active) return;
        const object3D = game.Levels3DPreview.tiles[tile.id]?.mesh;
        if(object3D) game.Levels3DPreview.outline.toggleControlled(object3D, controlled);
    })

    Hooks.on("refreshTile", (tile) => {
        if (!game.Levels3DPreview?._active || !canvas.tiles.active) return;
        const object3D = game.Levels3DPreview.tiles[tile.id]?.mesh;
        if(object3D) game.Levels3DPreview.outline.toggleHovered(object3D, tile.hover && !tile.controlled, 1);
    })

    Hooks.on("hoverTile", (tile, hovered) => { 
        if (!game.Levels3DPreview?._active || !canvas.tiles.active) return;
        const object3D = game.Levels3DPreview.tiles[tile.id]?.mesh;
        if(object3D) game.Levels3DPreview.outline.toggleHovered(object3D, hovered && !tile.controlled, 1);
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