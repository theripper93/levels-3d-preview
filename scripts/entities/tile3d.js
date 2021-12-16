import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 

export class Tile3D {
    constructor(tile,parent){
        this.tile = tile;
        this._parent = parent;
        this.isOverhead = this.tile.data.overhead;
        this.bottom = tile.data.flags.levels?.rangeBottom ?? 0;
        this.index = canvas.background.placeables.indexOf(this.tile) ?? canvas.foreground.placeables.indexOf(this.tile) ?? 0;
        this.zIndex = 0 + this.index;
        this.bottom+=this.zIndex/1000;
        this.center2d = {
            x: this.tile.data.x + Math.abs(this.tile.data.width)/2,
            y: this.tile.data.y + Math.abs(this.tile.data.height)/2
        }
        this.center = Ruler3D.posCanvasTo3d({x: this.center2d.x,y: this.center2d.y,z: this.bottom});
        this.texture = this.tile.data.img
        this.opacity = this.tile.data.alpha
        this.width = Math.abs(this.tile.data.width/factor);
        this.height = Math.abs(this.tile.data.height/factor);
        this.color = this.tile.data.tint ?? 0xffffff;
        this.angle = Math.toRadians(this.tile.data.rotation);
        this.mirrorX = this.tile.data.width < 0
        this.mirrorY = this.tile.data.height < 0
        this.rotSign = this.tile.data.width/Math.abs(this.tile.data.width)*this.tile.data.height/Math.abs(this.tile.data.height)
        this.init();
    }

    async init(){
        const texture = this.texture ? await this._parent.helpers.loadTexture(this.texture) : null;
        const geometry = new THREE.PlaneGeometry(this.width, this.height);
        const material = new THREE.MeshStandardMaterial({
            color: this.color,
            //transparent: true,
            opacity: this.opacity,
            visible: !this.tile.data.hidden,
            map: texture,
            side: THREE.DoubleSide,
            roughness : 1,
            metalness : 1,
            //depthWrite: false,
            alphaTest: 0.99,
        });
        material.toneMapped = THREE.NoToneMapping;
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.center.x,this.center.y,this.center.z);
        this.mesh.rotation.set(-Math.PI/2 + (this.mirrorY ? Math.PI : 0),this.mirrorX ? Math.PI : 0,-this.angle*this.rotSign);
        //this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
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