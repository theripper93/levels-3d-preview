import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 

export class Wall3D {
    constructor(wall,parent){
        this.wall = wall;
        this.type = "Wall";
        this._parent = parent;
        this.top = wall.data.flags.wallHeight?.wallHeightTop ?? 10;
        this.externalWall = wall.data.flags.betterroofs?.externalWall ?? false;
        if(this.externalWall) this.top++;
        this.bottom = wall.data.flags.wallHeight?.wallHeightBottom ?? 0;
        this.vec1 = Ruler3D.posCanvasTo3d({x: wall.data.c[0],y: wall.data.c[1], z: this.top});
        this.vec2 = Ruler3D.posCanvasTo3d({x: wall.data.c[2],y: wall.data.c[3], z: this.bottom});
        this.center = Ruler3D.posCanvasTo3d({x: wall.center.x,y: wall.center.y,z: (this.top+this.bottom)/2});
        this.p1 = new THREE.Vector2(wall.data.c[0],wall.data.c[1]);
        this.p2 = new THREE.Vector2(wall.data.c[2],wall.data.c[3]);
        this.distance = this.p1.distanceTo(this.p2)/factor;
        this.angle = -Math.atan2(this.p2.y - this.p1.y, this.p2.x - this.p1.x)-Math.PI/2;
        this.stretchTex = wall.document.getFlag("levels-3d-preview","stretchTex");
        this.repeats = this.stretchTex ? 1 : this.distance / (this.vec1.y - this.vec2.y);
        if(this.repeats < 1){
            this.repeats = 1;
        }
        if(!this.bottom > this._parent.level) return;
        this.texture = wall.document.getFlag("levels-3d-preview","wallTexture");
        this.opacity = wall.document.getFlag("levels-3d-preview","wallOpacity") ?? 1;
        if(this.wall.data.door && this.wall.data.ds === 1) this.opacity = this.opacity/2;
        this.alwaysVisible = wall.document.getFlag("levels-3d-preview","alwaysVisible");
        this.tint = wall.document.getFlag("levels-3d-preview","wallTint");
        this.color = this.texture ? this.tint ?? "#ffffff" : this.tint ?? wall.children[1]._fillStyle.color;
        this.depth = wall.document.getFlag("levels-3d-preview","wallDepth")/factor || 0.03;
        this.distance += wall.document.getFlag("levels-3d-preview","joinWall") ? this.depth : 0;

        this.init();

    }

    async init(){
        const geometry = new THREE.BoxGeometry(
            this.depth,
            this.vec1.y - this.vec2.y,
            this.distance
        )
        const texture = this.texture ? await this._parent.helpers.loadTexture(this.texture) : null;
        if(texture){
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(this.repeats,1);
        }
        let material;
        const materialId = `${this.color}${this.opacity}${this.texture}${this.isVisible}`
        if(this._parent.helpers.materialCache[materialId]){
            material = this._parent.helpers.materialCache[materialId];  
        }else{
            material = new THREE.MeshPhongMaterial({
                color: this.color,
                transparent: this.opacity < 1,
                opacity: this.opacity,
                visible: this.isVisible,
                map: texture,
            });
            this._parent.helpers.materialCache[materialId] = material;
        }
        material.castShadow = true;
        material.receiveShadow = true;
        this.mesh = new THREE.Mesh(geometry, material);
        if(this.wall.data.door){
        this.mesh.userData.hitbox = this.mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        }
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.position.set(this.center.x,this.center.y,this.center.z);
        this.mesh.rotation.set(0,this.angle,0);
        this._parent.scene.add(this.mesh);
    }

    get isVisible(){
        if(!this.tint && !this.texture) return true;
        if(this.alwaysVisible) return true;
        if(this.wall.data.sense === 0) return false;
        return true;
    }

    _onClickLeft(e) {
        if(!this.wall.doorControl.visible) return;
        e.data = {
            originalEvent: e,
          }
        this.wall.doorControl._onMouseDown(e);
      }
  
      _onClickRight(e) {
        if(!this.wall.doorControl.visible) return;
          e.data = {
            originalEvent: e,
          }
        this.wall.doorControl._onRightDown(e);
      }
  
      _onClickLeft2(e) {}
  
      _onClickRight2(e) {}

    destroy(){
        this._parent.scene.remove(this.mesh);
        delete this._parent.walls[this.wall.id];
        delete this._parent.doors[this.wall.id];
    }
}

Hooks.on("updateWall", (wall) => {
    if(game.Levels3DPreview?._active && wall.object){
        game.Levels3DPreview.walls[wall.id]?.destroy();
        game.Levels3DPreview.createWall(wall.object);
    }
})

Hooks.on("createWall", (wall) => {
    if(game.Levels3DPreview?._active && wall.object) game.Levels3DPreview.createWall(wall.object);
})
  
Hooks.on("deleteWall", (wall) => {
if(game.Levels3DPreview?._active) game.Levels3DPreview.walls[wall.id]?.destroy();
})