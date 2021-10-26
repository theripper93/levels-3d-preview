import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 

export class Ruler3D {
    constructor(parent){
        this._parent = parent;
        this.color = new THREE.Color(game.user.color);
        const hsl = {}
        this.color.getHSL(hsl);
        this.lineColor = new THREE.Color().setHSL(hsl.h,hsl.s,hsl.l - 0.2);
        this.textColor = new THREE.Color(canvas.scene.data.gridColor ?? 0x000000);
        this.origin = new THREE.Vector3(0,0,0);
        this.target = new THREE.Vector3(0,0,0);
        this.sphereRadius = 0.008;
        this.lineRadius = 0.003;
        this.init();
    }

    init(){
        this.sphere1 = new THREE.Mesh(
            new THREE.SphereGeometry(this.sphereRadius, 16, 16),
            new THREE.MeshBasicMaterial({
                color: this.color,
                transparent: true,
                opacity: 0.5,
            })
        );
        this.sphere2 = this.sphere1.clone();
        this.textElement = $(`<div id="levels3d-ruler-text"></div>`);
        $("body").append(this.textElement);
    }

    addMarkers(){
        this._parent.scene.add(this.sphere1);
        this._parent.scene.add(this.sphere2);
    }

    set object(value){
        if(!value){
            this._object = null;
            this._parent.scene.remove(this.line);
            this.sphere1.material.visible = false;
            this.sphere2.material.visible = false;
            this.textElement.hide();
        }else{
            const target = value.userData.isHitbox ? value.parent : value;
            this._object = target;
            this.origin = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
            this.sphere1.material.visible = true;
            this.sphere2.material.visible = true;
            this.textElement.show();
        }

        this.updateVisibility();
    }

    set origin(position){
        this._origin = position;
        this.updateVisibility();
        if(!this.line) return;
        this.update();
    }

    updateVisibility(){}

    update(){
        if(!this._object || !this._origin) return;
        this._parent.scene.remove(this.line);
        //draw ruler
        const geometry = new THREE.TubeGeometry(
            new THREE.LineCurve3(this._origin, this._object.position),
            1,
            this.lineRadius,
            8,
        );
        this.line = new THREE.Mesh(
            geometry,
            new THREE.MeshToonMaterial({
                color: this.lineColor,
                transparent: true,
                opacity: 0.8,
            })
        );
        this.sphere1.position.copy(this._origin);
        this.sphere2.position.copy(this._object.position);
        //draw floating text
        const text = `${((this._object.position.distanceTo(this._origin)*factor)/canvas.scene.dimensions.size*canvas.scene.dimensions.distance).toFixed(1)} ${canvas.scene.data.gridUnits}.`;
        this.textElement.text(text);
        //get mid point of ruler
        const midPoint = new THREE.Vector3(this._origin.x + (this._object.position.x - this._origin.x)/2, this._origin.y + (this._object.position.y - this._origin.y)/2, this._origin.z + (this._object.position.z - this._origin.z)/2);
        Ruler3D.centerElement(this.textElement,midPoint);
        this._parent.scene.add(this.line);
    }

    static position3dtoScreen(position){
        const camera = game.Levels3DPreview.camera;
        const vector = new THREE.Vector3(position.x, position.y, position.z);
        const widthHalf = game.Levels3DPreview.renderer.getContext().canvas.width*0.5/devicePixelRatio , heightHalf = game.Levels3DPreview.renderer.getContext().canvas.height*0.5/devicePixelRatio;
        vector.project(camera);
        vector.x = ( vector.x * widthHalf ) + widthHalf;
        vector.y = - ( vector.y * heightHalf ) + heightHalf;
        return vector;
    }

    static centerElement(element,position){
        const centerPosition = Ruler3D.position3dtoScreen(position);
        const elementWidth = $(element).width();
        const elementHeight = $(element).height();
        $(element).css({
            left: centerPosition.x -elementWidth/2 + "px",
            top: centerPosition.y -elementHeight/2 + "px"
        });
    }
}