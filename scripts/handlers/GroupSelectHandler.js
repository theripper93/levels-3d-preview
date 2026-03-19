import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { SelectionBox } from "../lib/SelectionBox.js";

export class GroupSelectHandler {
    constructor(parent) {
        this._parent = parent;
        const div = document.createElement("div");
        div.id = "levels-3d-preview-select-box";
        this.element = div;
        this._selectedIds = {};
        this.init();
    }

    get camera() {
        return this._parent.camera;
    }
    get scene() {
        return this._parent.scene;
    }
    get renderer() {
        return this._parent.renderer;
    }
    get controls() {
        return this._parent.controls;
    }
    get activeLayerEntity() {
        return canvas.activeLayer?.options?.objectClass?.embeddedName;
    }

    get mousePos() {
        return this._parent.interactionManager.mousemove;
    }

    init() {
        document.querySelector("#canvas-container")?.remove();
        this._selectionBox = new SelectionBox(this.camera, this.scene);
    }

    startSelect(event) {
        if (event.which !== 1) {
            this._prevSelected = canvas.activeLayer.placeables.map((placeable) => placeable.id);
        } else {
            this._prevSelected = [];
            canvas.activeLayer.releaseAll();
        }
        this.controls.enabled = false;
        this._isSelecting = true;
        this._selectedIds = {};
        document.body.append(this.element);
        const mouseP = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        this._selectionBox.startPoint.set(mouseP.x, mouseP.y, 0.5);
        this.element.style.cssText = `
            position: absolute;
            top: ${event.clientY}px;
            left: ${event.clientX}px;
            height: 0;
            width: 0;
        `;
        this.elementPosition = {
            top: event.clientY,
            left: event.clientX,
        };
    }

    updateSelect(event) {
        if (!this._isSelecting) return;
        this._selectionBox.endPoint.set(this.mousePos.x, this.mousePos.y, 0.5);

        this._selected = this._selectionBox.select();
        for (const [uuid, ids] of Object.entries(this._selectionBox.instances)) { 
            if(!ids.length) continue;
            const object = this.scene.getObjectByProperty("uuid", uuid);
            if (!object || this._selected.includes(object)) continue;
            this._selected.push(object);
        }

        const elLeft = Math.min(this.elementPosition?.left ?? 0, event.clientX);
        const elTop = Math.min(this.elementPosition?.top ?? 0, event.clientY);
        const elWidth = Math.abs((this.elementPosition?.left ?? 0) - event.clientX);
        const elHeight = Math.abs((this.elementPosition?.top ?? 0) - event.clientY);

        this.element.style.cssText = `
            height: ${elHeight}px;
            width: ${elWidth}px;
            top: ${elTop}px;
            left: ${elLeft}px;
        `;
        this._selectedIds = {};
        this._selected.forEach((entity) => {
            this.processEntity(entity);
            entity.traverseAncestors(this.processEntity.bind(this));
        });

        this.updateCanvasSelection();
    }

    processEntity(entity) { 
        const entity3D = entity?.userData?.entity3D;
        if (entity3D && entity3D?.placeable?.document?.documentName === this.activeLayerEntity && !entity3D?.placeable?.document?.locked) {
            this._selectedIds[entity3D.placeable.id] = true;
        }
    }

    updateCanvasSelection() {
        canvas.activeLayer.placeables.forEach((placeable) => {
            if (this._selectedIds[placeable.id] && !placeable.controlled) {
                placeable.control({ releaseOthers: false });
            } else if (!this._selectedIds[placeable.id] && placeable.controlled && !this._prevSelected.includes(placeable.id)) {
                placeable.release();
            }
        });
    }

    endSelect(event) {
        this._isSelecting = false;
        this.controls.enabled = true;
        this._parent.interactionManager._groupSelect = false;
        document.querySelector("#levels-3d-preview-select-box").remove();
        //handle selection
    }
}
