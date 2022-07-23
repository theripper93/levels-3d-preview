import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 

export class Note3D {
    constructor(note){
        this.note = note;
        this.embeddedName = note.document.documentName
        this.placeable = note;
        this.nameplate = new THREE.Object3D();
        this.bottom = note.document.flags.levels?.rangeBottom ?? 0;
        this._parent = game.Levels3DPreview
        this.mesh = new THREE.Group();
        this.draw()
        this._drawTooltip()
        this.setPosition()
        this.scene.add(this.mesh)
        this._parent.notes[this.note.id] = this
    }

    get scene(){
        return game.Levels3DPreview.scene
    }

    async draw(){
        const texture = await this._parent.helpers.loadTexture(this.note.document.icon);
        const size = this.note.document.iconSize/factor
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

    _drawTooltip(){
        if(this.nameplate) this.mesh.remove(this.nameplate);
        const name = this.note._drawTooltip();
        name.visible = true;
        const container = new PIXI.Container();
        container.addChild(name);
        const base64 = canvas.app.renderer.extract.base64(container);
        const spriteMaterial = new THREE.SpriteMaterial({
          map: new THREE.TextureLoader().load(base64),
          transparent: true,
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.center.set(0.5,0.5);
        this.nameplate = sprite;
        const width = name.width/factor;
        const height = name.height/factor;
        this.nameplate.scale.set(width,height,1);
        this.nameplate.position.set(0, (this.note.document.iconSize/factor)/2 + height/2 + 0.022, 0);
        this.mesh.add(this.nameplate);
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
        this.nameplate.visible = this.note.tooltip.visible
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