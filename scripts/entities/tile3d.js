import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 

export class Tile3D {
    constructor(tile,parent){
        this.tile = tile;
        this._parent = parent;
        this.isOverhead = this.tile.data.overhead;
        this.bottom = this.isOverhead ? tile.data.flags.levels?.rangeBottom ?? 0 : 0;
        this.zIndex = this.tile.data.z
        this.bottom+=this.zIndex/100;
        this.center2d = {
            x: this.tile.data.x + this.tile.data.width/2,
            y: this.tile.data.y + this.tile.data.height/2
        }
        this.center = Ruler3D.posCanvasTo3d({x: this.center2d.x,y: this.center2d.y,z: this.bottom});
        this.texture = this.tile.data.img
        this.opacity = this.tile.data.alpha
        this.width = this.tile.data.width/factor;
        this.height = this.tile.data.height/factor;
        this.color = this.tile.data.tint ?? 0xffffff;
        this.angle = Math.toRadians(this.tile.data.rotation);
        this.init();
    }

    async init(){
        const texture = this.texture ? await this._parent.helpers.loadTexture(this.texture) : null;
        const geometry = new THREE.PlaneGeometry(this.width, this.height);
        const material = new THREE.MeshPhongMaterial({
            color: this.color,
            transparent: true,
            opacity: this.opacity,
            visible: !this.tile.data.hidden,
            map: texture,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        material.castShadow = true;
        material.receiveShadow = true;
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.center.x,this.center.y,this.center.z);
        this.mesh.rotation.set(-Math.PI/2,0,-this.angle);
        this._parent.scene.add(this.mesh);
    }

    destroy(){
        this._parent.scene.remove(this.mesh);
        delete this._parent.tiles[this.tile.id];
    }
}

Hooks.on("updateTile", (tile) => {
    if(game.Levels3DPreview?._active && tile.object){
        game.Levels3DPreview.tiles[tile.id]?.destroy();
        game.Levels3DPreview.createTile(tile.object);
    }
})

Hooks.on("createTile", (tile) => {
    if(game.Levels3DPreview?._active && tile.object) game.Levels3DPreview.createTile(tile.object);
})
  
Hooks.on("deleteTile", (tile) => {
if(game.Levels3DPreview?._active) game.Levels3DPreview.tiles[tile.id]?.destroy();
})