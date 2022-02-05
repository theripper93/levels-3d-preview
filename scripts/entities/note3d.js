import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 

export class Note3D {
    constructor(note){
        this.note = note;
        this.embeddedName = note.document.documentName
        this.placeable = note;
        this.bottom = note.data.flags.levels?.rangeBottom ?? 0;
        this._parent = game.Levels3DPreview
        this.mesh = new THREE.Group();
        this.draw()
        this.setPosition()
        this.scene.add(this.mesh)
        this._parent.notes[this.note.id] = this
    }

    get scene(){
        return game.Levels3DPreview.scene
    }

    async draw(){
        const texture = await this._parent.helpers.loadTexture(this.note.data.icon);
        const size = canvas.scene.dimensions.size*0.7/factor
        const geometry = new THREE.BoxGeometry(size, size, size)
        const material = new THREE.MeshBasicMaterial({map: texture,})
        const mesh = new THREE.Mesh(geometry, material)
        this.mesh.userData.hitbox = mesh
        this.mesh.userData.interactive = true
        this.mesh.userData.entity3D = this
        mesh.userData.entity3D = this
        mesh.userData.isHitbox = true
        this.mesh.add(mesh)
    }

    setPosition(){
        const position = Ruler3D.posCanvasTo3d({
            x: this.note.center.x,
            y: this.note.center.y,
            z: this.bottom,
        })
        this.mesh.position.set(position.x, position.y, position.z)
    }

    updateVisibility(){
        this.mesh.visible = this.placeable.visible
    }

    destroy(){
        this.scene.remove(this.mesh)
        delete this._parent.notes[this.note.id]
    }

    _onClickLeft(e){
        const event = {
            data: {
              originalEvent: e,
            }
          }
          this.placeable._onClickLeft(event);
    }

    _onClickLeft2(e){
        const event = {
            data: {
              originalEvent: e,
            }
          }
          this.placeable?._onClickLeft2(event);
    }

    _onClickRight(e){
        const event = {
            data: {
              originalEvent: e,
            }
          }
          this.placeable?._onClickRight(event);
    }

    _onClickRight2(e){
        const event = {
            data: {
              originalEvent: e,
            }
          }
          this.placeable?._onClickRight2(event);
    }

    _onHoverIn(e) {
        if(this.placeable?._onHoverIn && !this.placeable._destroyed){
            this.placeable?._onHoverIn(e);
        
        }
      }
  
      _onHoverOut(e) {
        if(this.placeable?._onHoverOut && !this.placeable._destroyed)this.placeable?._onHoverOut(e);
      }
}

Hooks.on("updateNote", (note) => {
    if(game.Levels3DPreview?._active && note?.id) {
        game.Levels3DPreview.notes[note?.id]?.destroy();
        game.Levels3DPreview.createNote(note.object);
    }
  })
  
  Hooks.on("createNote", (note) => {
    if(game.Levels3DPreview?._active && note.object) game.Levels3DPreview.createNote(note.object);
  })
  
  Hooks.on("deleteNote", (note) => {
    if(game.Levels3DPreview?._active) game.Levels3DPreview.notes[note.id]?.destroy();
  })