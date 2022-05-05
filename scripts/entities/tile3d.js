import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from '../lib/three-mesh-bvh.js';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class Tile3D {
    constructor(tile,parent){
        this.tile = tile;
        this._parent = parent;
        this.isOverhead = this.tile.data.overhead;
        //this.draggable = true;
        this.embeddedName = "Tile"
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
        this.getFlags();
        if(this.gtflPath){
            this.fillType === "stretch" || this.fillType === "fit" ? this.initModel() : this.initInstanced();
        }else{
            this.init();
        }
    }

    getFlags(){
        this.gtflPath = this.tile.document.getFlag("levels-3d-preview", "model3d");
        this.enableAnim = this.tile.document.getFlag("levels-3d-preview", "enableAnim") ?? true;
        this.animIndex = this.tile.document.getFlag("levels-3d-preview", "animIndex") ?? 0;
        this.animSpeed = this.tile.document.getFlag("levels-3d-preview", "animSpeed") ?? 1;
        this.color = this.tile.document.getFlag("levels-3d-preview", "color") ?? "#ffffff";
        this.imageTexture = this.tile.document.getFlag("levels-3d-preview", "imageTexture") ?? "";
        this.fillType = this.tile.document.getFlag("levels-3d-preview", "fillType") ?? "fit";
        this.scale= this.tile.document.getFlag("levels-3d-preview", "tileScale") ?? 1;
        this.yScale = this.tile.document.getFlag("levels-3d-preview", "yScale") ?? 1;
        this.randomRotation = this.tile.document.getFlag("levels-3d-preview", "randomRotation") ?? false;
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
        this.mesh.userData.hitbox = this.mesh
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        this._parent.scene.add(this.mesh);
    }

    async initModel(){
        const stretch = this.fillType === "stretch";
        const model = await this.getModel();
        const texture = this.imageTexture ? await this._parent.helpers.loadTexture(this.imageTexture) : null;
        const object = model.scene;
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        if(stretch){
            const yScale = this.width > this.height ? this.width/mDepth : this.height/mDepth;
            const scaleFit = Math.max(this.width/mWidth, this.height/mHeight);
            object.scale.set(this.width/mWidth,yScale,this.height/mHeight);
        }else{
            const largest = Math.max(mWidth, mHeight, mDepth);
            let scale = 1;
            if(largest === mWidth){
                scale = this.width/mWidth;
            }else if(largest === mHeight){
                scale = this.height/mHeight;
            }else{
                scale = (Math.min(this.width, this.height))/mDepth;
            }
            object.scale.set(scale,scale,scale);
        }

        const color = new THREE.Color(this.color);
        object.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.geometry.computeBoundsTree();
              child.material.color.set(child.material.color.multiply(color));
              child.material.map = texture;
            }
        });

        if(model.object.animations.length > 0 && this.enableAnim) {
            this.mixer = new THREE.AnimationMixer( scene );
            this.mixer.timeScale = this.animSpeed;
            this.mixer.clipAction( model.object.animations[this.animIndex] ).play();
        }

        const container = new THREE.Group();
        this.mesh = container;

        container.add(object);
        object.position.set(0,0,0);
        container.position.set(this.center.x,this.center.y,this.center.z);
        container.rotation.set(0,-this.angle*this.rotSign,0);
        container.userData.hitbox = container;
        container.userData.interactive = true;
        container.userData.entity3D = this;
        this.mesh.userData.draggable = true;
        this._parent.scene.add(container);
    }

    async initInstanced(){
        const model = await this.getModel();
        const texture = this.imageTexture ? await this._parent.helpers.loadTexture(this.imageTexture) : null;
        const object = model.scene;
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        const grid = (canvas.grid.size * this.scale)/factor;
        const rows = Math.round(this.height/grid) || 1;
        const cols = Math.round(this.width/grid) || 1;
        const count = rows*cols;

        const container = new THREE.Group();
        const gridX = this.width/cols;
        const gridZ = this.height/rows;
        const max = Math.max(mWidth, mHeight);
        const scaleFit = grid/max;
        const color = new THREE.Color(this.color);
        const dummy = new THREE.Object3D();
        object.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.geometry.computeBoundsTree();
              child.material.color.set(child.material.color.multiply(color));
              child.material.map = texture;
 
              //generate instanceed

            const instancedMesh = new THREE.InstancedMesh(
                child.geometry,
                child.material,
                count
            );
    
            instancedMesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
    
            let i = 0;
    
            for(let z = 0; z < rows; z++){
                for(let x = 0; x < cols; x++){
                    const offsetx = (mWidth*scaleFit-gridX)/2;
                    const offsetz = (mHeight*scaleFit-gridZ)/2;
                    dummy.matrix.set(child.matrix);
                    const randomRotation = this.randomRotation ? Math.ceil(Math.random()*3)*Math.PI/2 : 0;
                    dummy.position.set(child.position.x+x*gridX+offsetx,child.position.y,child.position.z+z*gridZ+offsetz);
                    dummy.scale.set(child.scale.x*scaleFit,child.scale.y*scaleFit*this.yScale,child.scale.z*scaleFit);
                    dummy.rotation.set(child.rotation.x,child.rotation.y+randomRotation,child.rotation.z);

                    dummy.updateMatrix();
                    instancedMesh.setMatrixAt(i++, dummy.matrix);
                }
            }
    
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.position.set(-this.width/2+gridX/2,0,-this.height/2+gridZ/2);
            instancedMesh.geometry.computeBoundsTree();
            container.add(instancedMesh);

            }
        });

        this.mesh = container;

        container.position.set(this.center.x,this.center.y,this.center.z);
        container.rotation.set(0,-this.angle*this.rotSign,0);
        container.userData.hitbox = container;
        container.userData.interactive = true;
        container.userData.entity3D = this;
        this._parent.scene.add(container);
    }

    async getModel(){
        const filePath = this.gtflPath;
        const extension = filePath.split(".").pop().toLowerCase();
        const model = await game.Levels3DPreview.helpers.loadModel(this.gtflPath);
        if(model) return model;
        //make 1x1 cube
        const errText = game.i18n.localize("levels3dpreview.errors.filenotsupported") + "(" + extension +"): " + filePath + " Token: " + this.token.data.name
        console.error(errText);
        ui.notifications.error(errText);
        return new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color: 0xff0000}));
    }

    updateVisibility(){
        if(!this.mesh) return;
        this.mesh.visible = !this.tile.data.hidden;
        if(game.Levels3DPreview.mirrorLevelsVisibility && this.tile.data.overhead){
            const isLevelsVisible = _levels.floorContainer.spriteIndex[this.tile.id]?.parent ? true : false;
            this.mesh.visible = this.tile.visible || isLevelsVisible;
        }
    }

    destroy(){
        this._parent.scene.remove(this.mesh);
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.dispose?.();
            }
        })
        delete this._parent.tiles[this.tile.id];
    }

    _onClickLeft(e){
        const point = Ruler3D.pos3DToCanvas(e.position3D);
        if(this.tile.document.checkClick)this.tile.document.checkClick(point, "click");
    }


    _onClickLeft2(e){
        const point = Ruler3D.pos3DToCanvas(e.position3D);
        if(this.tile.document.checkClick)this.tile.document.checkClick(point, "dblclick");
    }

    _onClickRight(e){

    }

    _onClickRight2(e){

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