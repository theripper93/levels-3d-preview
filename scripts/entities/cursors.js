import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 

export class Cursors3D{
    constructor(parent){
        this._parent = parent;
        this._cursors = {};
        this.radius = 0.007;
    }

    get scene(){
        return this._parent.scene;
    }

    update(){
        const cursors = canvas.controls._cursors

        for(let [k,v] of Object.entries(cursors)){
            this.updateCursor(k, v);
        }

    }

    updateCursor(uId, cursor){
        
        if(!this._cursors[uId]){
            this.createCursor(uId, cursor);
        }
        this.updateCursorPosition(uId, cursor);
    }

    createCursor(uId, cursor){
        const color = game.users.get(uId).color;
        const geometry = new THREE.SphereGeometry(this.radius, 16, 16);
        const material = new THREE.MeshBasicMaterial({color: color});
        const mesh = new THREE.Mesh(geometry, material);
        this.scene.add(mesh);
        this._cursors[uId] = mesh;
        this.updateCursorPosition(uId, cursor);
    }

    updateCursorPosition(uId, cursor){
        const target = JSON.parse(cursor.target.x);
        if(!target.x && !target.z){
            this._cursors[uId].visible = false;
            return;
        }
        this._cursors[uId].visible = true;
        this._cursors[uId].position.lerp(new THREE.Vector3(target.x, target.y, target.z), 0.1);
    }

    clear(){
        this._cursors = {};
    }
}