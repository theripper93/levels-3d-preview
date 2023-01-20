import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { SelectionBox } from '../lib/SelectionBox.js';
import { SelectionHelper } from '../lib/SelectionHelper.js';

export class GroupSelectHandler {
    constructor(parent){
        this._parent = parent;
        this.element = $(`<div id="levels-3d-preview-select-box"></div>`);
        this._selectedIds = {};
        this.init();
    }

    get camera(){
        return this._parent.camera;
    }
    get scene(){
        return this._parent.scene;
    }
    get renderer(){
        return this._parent.renderer;
    }
    get controls(){
        return this._parent.controls;
    }
    get activeLayerEntity(){
        return canvas.activeLayer?.options?.objectClass?.embeddedName;
    }


    get mousePos(){
        return this._parent.interactionManager.mousemove;
    }

    init(){
        $("#levels-3d-preview-select-box").remove();
        this._selectionBox = new SelectionBox(this.camera, this.scene);
        //this._selectionHelper = new SelectionHelper(this.renderer, 'selection-helper');
    }

    startSelect(event){
        if(event.which !== 1){
            this._prevSelected = canvas.activeLayer.placeables.map(placeable => placeable.id);
        }else{
            this._prevSelected = [];
            canvas.activeLayer.releaseAll();
        }
        this.controls.enabled = false;
        this._isSelecting = true;
        this._selectedIds = {};
        $("body").append(this.element);
        this._selectionBox.startPoint.set(this.mousePos.x, this.mousePos.y, 0.5);
        this.element.css({
            position: 'absolute',
            top: event.clientY,
            left: event.clientX,
            height: 0,
            width: 0,
        })
        this.elementPosition = {
            top: event.clientY,
            left: event.clientX,
        }
    }

    updateSelect(event){
        if(!this._isSelecting) return;
        this._selectionBox.endPoint.set(this.mousePos.x, this.mousePos.y, 0.5);

        this._selected = this._selectionBox.select();

        this.element.css({
            height: event.clientY - this.elementPosition?.top ?? 0,
            width: event.clientX - this.elementPosition?.left ?? 0,
        })
        this._selectedIds = {};
        this._selected.forEach(entity => {
            entity.traverseAncestors(ancestor => {
                const entity3D = ancestor?.userData?.entity3D;
                if(entity3D && entity3D?.placeable?.document?.documentName === this.activeLayerEntity){
                    this._selectedIds[entity3D.placeable.id] = true;
                }
            })

        })

        this.updateCanvasSelection();
    }

    updateCanvasSelection(){
        canvas.activeLayer.placeables.forEach(placeable => {
            if(this._selectedIds[placeable.id] && !placeable.controlled){
                placeable.control({releaseOthers: false});
            }else if(!this._selectedIds[placeable.id] && placeable.controlled && !this._prevSelected.includes(placeable.id)){
                placeable.release();
            }
        })
    }

    endSelect(event){
        this._isSelecting = false;
        this.controls.enabled = true;
        this._parent.interactionManager._groupSelect = false
        $("#levels-3d-preview-select-box").remove();
        //handle selection
    }
}