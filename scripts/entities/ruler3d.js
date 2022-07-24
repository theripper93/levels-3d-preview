import * as THREE from "../lib/three.module.js";
import { Template3D } from "./template3d.js";
import {factor} from '../main.js'; 

export class Ruler3D {
    constructor(parent){
        this._parent = parent;
        this.color = new THREE.Color(game.user.color);
        const hsl = {}
        this.color.getHSL(hsl);
        this.lineColor = new THREE.Color().setHSL(hsl.h,hsl.s,hsl.l - 0.2);
        this.textColor = new THREE.Color(canvas.scene.grid.color ?? 0x000000);
        this.origin = new THREE.Vector3(0,0,0);
        this.target = new THREE.Vector3(0,0,0);
        this.sphereRadius = 0.008;
        this.lineRadius = 0.003;
        this.init();
    }

    get allowedRulerDrag(){
        return game.Levels3DPreview.interactionManager.allowedRulerDrag
      }

    drawTemplate(){
        if(ui.controls.activeTool === "select" || !this.allowedRulerDrag.some(a => a=== canvas.activeLayer.options.objectClass.embeddedName)) return;
        if(this.template?.isPreview) return;
        if(this.allowedRulerDrag.some(a => a=== this._object?.userData?.entity3D?.placeable?.document?.documentName)) return;
        this.template?.destroy();
        const template = new Template3D({t:ui.controls.activeTool},this._origin,this._object.position);
        this.template = template;
    }

    placeTemplate(){
        if(!this.template) return;
        this.template.fromPreview();
        this.template = null;
    }

    init(){
        this.sphere1 = new THREE.Mesh(
            new THREE.SphereGeometry(this.sphereRadius, 16, 16),
            new THREE.MeshBasicMaterial({
                color: this.color,
                transparent: true,
                opacity: 0.5,
                visible: false,
            })
        );
        this.sphere2 = this.sphere1.clone();
        this.baseSphere1 = this.sphere1.clone();
        this.baseSphere2 = this.sphere2.clone();
        this.textElement = $(`<div id="levels3d-ruler-text"></div>`);
        $("body").append(this.textElement);
    }

    addMarkers(){
        this._parent.scene.add(this.sphere1);
        this._parent.scene.add(this.sphere2);
        this._parent.scene.add(this.baseSphere1);
        this._parent.scene.add(this.baseSphere2);
    }

    set object(value){
        if(!value){
            this._object = null;
            this._parent.scene.remove(this.line);
            this.sphere1.material.visible = false;
            this.sphere2.material.visible = false;
            this.baseSphere1.material.visible = false;
            this.baseSphere2.material.visible = false;
            this.template?.destroy();
            this.textElement.hide();
        }else{
            const target = value.userData.isHitbox ? value.parent : value;
            this._object = target;
            this.origin = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
            this.sphere1.material.visible = true;
            this.sphere2.material.visible = true;
            this.baseSphere1.material.visible = true;
            this.baseSphere2.material.visible = true;
            this.textElement.show();
        }

        this.updateVisibility();
    }

    set origin(position){
        this._origin = position;
        this.token = game.Levels3DPreview?.interactionManager?.draggable?.userData?.entity3D?.token
        this.updateVisibility();
        if(!this.line) return;
        this.update();
    }

    updateVisibility(){}

    update(){
        if(!this._object || !this._origin) return;
        const targetPos = Ruler3D.useSnapped() ? Ruler3D.snapped3DPosition(this._object.position) : this._object.position;
        this._parent.scene.remove(this.line);
        const distance = Ruler3D.measureDistance(this._origin,targetPos);
        //draw ruler
        let curve
        let midcurve
        if(this.template?.isPreview){
            midcurve = this._origin.clone().lerp(targetPos,0.8)//new THREE.Vector3(this._origin.x + (targetPos.x - this._origin.x)/2, this._origin.y + (targetPos.y - this._origin.y)/2, this._origin.z + (targetPos.z - this._origin.z)/2);
            midcurve.y+= 2;
            const bezCtrlg = midcurve.clone();
            curve = new THREE.QuadraticBezierCurve3(this._origin,bezCtrlg , targetPos);
            midcurve = curve.getPoint(0.5);
        }else{
            curve = new THREE.LineCurve3(this._origin, targetPos)
        }
        const geometry = new THREE.TubeGeometry(
            curve,
            this.template?.isPreview ? 64 : 1,
            this.lineRadius,
            8,
        );
        this.line = new THREE.Mesh(
            geometry,
            new THREE.MeshToonMaterial({
                color: this.getColor(distance),
                transparent: true,
                opacity: 0.8,
            })
        );
        this.sphere1.position.copy(this._origin);
        this.sphere2.position.copy(targetPos);
        this.baseSphere1.position.copy(this._origin);
        this.baseSphere2.position.copy(targetPos);
        this.baseSphere1.position.y = 0;
        this.baseSphere2.position.y = 0;
        //draw floating text
        const text = `${distance} ${canvas.scene.grid.units}.`;
        this.textElement.text(text);
        //get mid point of ruler
        const midPoint = this.template?.isPreview ? midcurve : new THREE.Vector3(this._origin.x + (targetPos.x - this._origin.x)/2, this._origin.y + (targetPos.y - this._origin.y)/2, this._origin.z + (targetPos.z - this._origin.z)/2);
        Ruler3D.centerElement(this.textElement,midPoint);
        this._parent.scene.add(this.line);
        this.drawTemplate();
    }

    getColor(distance){
       let color
        if(this.token && game.modules.get("drag-ruler")?.active && dragRuler?.getColorForDistanceAndToken){
            color = dragRuler?.getColorForDistanceAndToken(distance, this.token)
        }
        return color ?? this.color;
    }

    static position3dtoScreen(position){
        const camera = game.Levels3DPreview.camera;
        const vector = new THREE.Vector3(position.x, position.y, position.z);
        const widthHalf = game.Levels3DPreview.renderer.getContext().canvas.width*0.5/game.Levels3DPreview.resolutionMulti , heightHalf = game.Levels3DPreview.renderer.getContext().canvas.height*0.5/game.Levels3DPreview.resolutionMulti;
        vector.project(camera);
        vector.x = ( vector.x * widthHalf ) + widthHalf;
        vector.y = - ( vector.y * heightHalf ) + heightHalf;
        return vector;
    }

    static centerElement(element,position, ontop = false){
        //get distance between element and camera
        const $element = $(element);
        let cachedFontSize = $element.data("cached-size");
        if(!cachedFontSize){
            cachedFontSize = parseFloat(window.getComputedStyle($element[0], null).getPropertyValue('font-size'))
            $element.data("cached-size", cachedFontSize);
        }
        
        const dist = game.Levels3DPreview.camera.position.distanceTo(position);
        const scale = Math.max(0.5, 1.2/dist)/game.Levels3DPreview.resolutionMulti;
        if($element[0].id == 'levels3d-ruler-text'){
            $element.css({
                "font-size": cachedFontSize*scale + "px"
            })
        }else{
            $element.css({
                transform: `scale(${scale})`
            })
        }
        const centerPosition = Ruler3D.position3dtoScreen(position);
        const elementWidth = $element.width();
        const elementHeight = ontop ? $element.height()*2 : $element.height();
        $element.css({
            left: centerPosition.x -elementWidth/2 + "px",
            top: centerPosition.y -elementHeight/2 + "px",
        });
    }

    static posCanvasTo3d(position){
        return new THREE.Vector3(
            position.x/factor,
            (position.z*canvas.scene.dimensions.size)/(canvas.scene.dimensions.distance*factor),
            position.y/factor    
        );
    }

    static unitsToPixels(units){
        return (units*canvas.scene.dimensions.size)/(canvas.scene.dimensions.distance*factor)
    }

    static pixelsToUnits(pixels){
        return (pixels*canvas.scene.dimensions.distance*factor)/canvas.scene.dimensions.size
    }

    static pos3DToCanvas(position){
        return new THREE.Vector3(
            position.x*factor,
            position.z*factor,
            (position.y*factor/canvas.scene.dimensions.size)*(canvas.scene.dimensions.distance),
        );
    }

    static useSnapped(){
        const isGrid = canvas.scene.grid.type ? true : false;
        const isShift = keyboard.downKeys.has("ShiftLeft") || keyboard.downKeys.has("ShiftRight");
        if(!isGrid) return false;
        if(isGrid && !isShift) return true;
        return false;
    }

    static snapped3DPosition(position){
        const canvasPosition = Ruler3D.pos3DToCanvas(position);
        const snappedCenterPos = canvas.grid.getCenter(canvasPosition.x,canvasPosition.y);
        const snappedPos = {
            x: snappedCenterPos[0],
            y: snappedCenterPos[1],
            z: canvasPosition.z
        }
        return Ruler3D.posCanvasTo3d(snappedPos);
    }

    static measureDistance(position1,position2){
        if(Math.round(position1.y*1000)/1000 !== Math.round(position2.y*1000)/1000 || !Ruler3D.useSnapped()) return ((position1.distanceTo(position2)*factor)/canvas.scene.dimensions.size*canvas.scene.dimensions.distance).toFixed(1);
        const pos1Canvas = Ruler3D.pos3DToCanvas(position1);
        const pos2Canvas = Ruler3D.pos3DToCanvas(position2);
        const ray = new Ray({
            x: Math.round(pos1Canvas.x),
            y: Math.round(pos1Canvas.y),
        },
        {
            x: Math.round(pos2Canvas.x),
            y: Math.round(pos2Canvas.y),
        })
        return canvas.grid.measureDistances([{ ray }], {gridSpaces: true,})[0].toFixed(1);
    }

    static measureMinTokenDistance(origin,target){
        const square = (canvas.scene.dimensions.size/factor)
        const halfSquare = square/2;
        const generatePoints = (token) => {
            const tokenHeight = (token.token.losHeight-token.token.document.elevation)/canvas.scene.dimensions.distance;
            const tokenPositions = [];
            const tokenStart = token.mesh.position.clone();
            tokenStart.x += -token.token.document.width*halfSquare+halfSquare
            tokenStart.y += halfSquare
            tokenStart.z += -token.token.document.height*halfSquare+halfSquare

            for(let i = 0; i < token.token.document.width; i++){
                for(let j = 0; j < token.token.document.height; j++){
                    for(let k = 0; k < tokenHeight; k++){
                        const position = new THREE.Vector3(
                            tokenStart.x + i*square,
                            tokenStart.y + k*square,
                            tokenStart.z + j*square
                        );
                        tokenPositions.push(position);
                    }
                }
            }
            return tokenPositions;
        }
        const measurements = [];
        const originPoints = generatePoints(origin);
        const targetPoints = generatePoints(target);
        for(const oPoint of originPoints){
            for(const tPoint of targetPoints){
                const distance = Ruler3D.measureDistance(oPoint,tPoint);
                measurements.push(distance);
            }
        }
        return Math.min(...measurements);
    }
}