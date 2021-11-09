import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';
import { Ruler3D } from "../entities/ruler3d.js";

export class PIXIContainer{
    constructor(){
        this.object = new THREE.Group();
        this._position = new THREE.Vector3();
        this._rotation = 0;
    }

    addChild(child){
        this.object.add(child.object);
    }

    removeChild(child){
        this.object.remove(child.object);
    }

    removeChildren(){
        this.object.remove(...this.object.children);
    }

    addToScene(){
        game.Levels3DPreview.scene.add(this.object);
    }

    destroy(){
        this.object.remove(...this.object.children);
        this.object.parent.remove(this.object);
    }

    anchor = {
        set: ()=>{}
    }

    position = {
        set: (x,y,z = 0) => {
            debugger;
            this.position.x = x;
            this.position.y = y;
            this.position.z = z;
            this._position.set(x,y,z);
            const pos3D = posPIXItoTHREE({x,y,z});
            this.object.position.set(pos3D.x,pos3D.y,pos3D.z);
        },
        x:0,
        y:0,
        z:0,
    }

    pivot = {
        set: (x,y) => {
            return;
            this.pivot.x = x;
            this.pivot.y = y;
            this.object.pivot.set(x,y);
        },
        x:0,
        y:0,
    }

    set rotation(r){
        this.object.rotation.set(0,0,r);
        this._rotation = r;
    }

    get rotation(){
        return this._rotation;
    }

    get position3D(){
        return this.object.position;
    }

    set alpha(a){
        this.object.children.traverse(child => {
            if(child.userData.pixi){
                child.userData.pixi._alphaMultipler = a;
                child.userData.pixi.alpha = child.userData.pixi._alpha;
            }
        });
        this._alpha = a;
    }

    get alpha(){
        return this._alpha;
    }
}

export class PIXISprite{
    constructor(texture){
        this.object = new THREE.Mesh(
            new THREE.PlaneGeometry(1,1),
            new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
            })
        );
        this._position = new THREE.Vector3();
        this.object.userData.pixi = this;
        this._alphaMultipler = 1;
    }

    static async from(texture){
        texture = await game.Levels3DPreview.helpers.loadTexture(texture)
        return new PIXISprite(texture);
    }

    addToScene(){
        game.Levels3DPreview.scene.add(this.object);
    }

    destroy(){
        this.object.remove(...this.object.children);
        this.object.parent.remove(this.object);
    }

    set texture(texture){
        game.Levels3DPreview.helpers.loadTexture(texture).then(texture => {
            this.object.material.map = texture;
            this._texture = texture;
        })
    }

    anchor = {
        set: ()=>{}
    }

    position = {
        set: (x,y,z = 0) => {
            this.position.x = x;
            this.position.y = y;
            this.position.z = z;
            this._position.set(x,y,z);
            const pos3D = posPIXItoTHREE({x,y,z});
            this.object.position.set(pos3D.x,pos3D.y,pos3D.z);
        },
        x:0,
        y:0,
        z:0,
    }

    scale = {
        set: (x,y,z = 1) => {
            this.scale.x = x;
            this.scale.y = y;
            this.scale.z = z;
            this.object.scale.set(x,y,z);
        },
        x:1,
        y:1,
        z:1,
    }

    set rotation(r){
        this.object.rotation.set(0,0,r);
        this._rotation = r;
    }

    get rotation(){
        return this._rotation;
    }

    get position3D(){
        return this.object.position;
    }

    set alpha(a){
        this.object.material.opacity = a*this._alphaMultipler;
        this._alpha = a;
    }

    get alpha(){
        return this._alpha;
    }
}

function posPIXItoTHREE(pos){
    return Ruler3D.posCanvasTo3d(pos)
}

function posTHREEToPIXI(pos){
    return Ruler3D.pos3DToCanvas(pos)
}