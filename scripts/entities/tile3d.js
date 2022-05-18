import * as THREE from "../lib/three.module.js";
import { MersenneTwister } from "../lib/mersenneTwister.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from '../lib/three-mesh-bvh.js';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class Tile3D {
    constructor(tile,parent){
        this.tile = tile;
        this.placeable = tile;
        this._parent = parent;
        this.isOverhead = this.tile.data.overhead;
        this.isAnimated = false;
        this.draggable = true;
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
        this.initRandom();

    }

    async load(){
        if(this.gtflPath){
            this.fillType === "stretch" || this.fillType === "fit" ? await this.initModel() : await this.initInstanced();
        }else{
            await this.init();
        }
        this._loaded = true;
        this.elevation3d = this.mesh.position.y;
        this.updateControls();
        return this;
    }

    initRandom(){
        let seed = "";
        for(let c of this.randomSeed){
            seed += c.charCodeAt().toString();
        }
        seed = parseInt(seed);
        this.marsenne = new MersenneTwister(seed);
    }

    get pseudoRandom(){
        return this.marsenne.random() + 0.5;
    }

    get paused(){
        return (this.tile.data.flags && this.tile.data.flags["levels-3d-preview"]?.paused) ?? false
    }

    get scene(){
        return this._parent.scene;
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
        this.randomScale = this.tile.document.getFlag("levels-3d-preview", "randomScale") ?? false;
        this.randomDepth = this.tile.document.getFlag("levels-3d-preview", "randomDepth") ?? false;
        this.randomPosition = this.tile.document.getFlag("levels-3d-preview", "randomPosition") ?? false;
        this.gap = this.tile.document.getFlag("levels-3d-preview", "gap") ?? 0;
        this.randomSeed = this.tile.document.getFlag("levels-3d-preview", "randomSeed") || this.tile.id;
        this.randomSeed = this.randomSeed.substring(0,7);
        this.randomColor = this.tile.document.getFlag("levels-3d-preview", "randomColor") ?? false;
        this.collision = this.tile.document.getFlag("levels-3d-preview", "collision") ?? true;
        this.tiltX = this.tile.document.getFlag("levels-3d-preview", "tiltX") ?? 0;
        this.tiltX = Math.toRadians(this.tiltX);
        this.tiltZ = this.tile.document.getFlag("levels-3d-preview", "tiltZ") ?? 0;
        this.tiltZ = Math.toRadians(this.tiltZ);
        this.wasFreeMode = this.tile.document.getFlag("levels-3d-preview", "wasFreeMode") ?? false;

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
        if(this._destroyed) return;
        this._parent.scene.add(this.mesh);
        this.initBoundingBox();
    }

    async initModel(){
        const stretch = this.fillType === "stretch";
        const model = await this.getModel();
        const {textureOrMat, isPBR} = await this.getTextureOrMat();
        const object = game.Levels3DPreview.helpers.groundModel(model.scene);
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        if(stretch){
            const yScale = this.width > this.height ? this.width/mDepth : this.height/mDepth;
            const scaleFit = Math.max(this.width/mWidth, this.height/mHeight);
            object.scale.set(this.scale*this.width/mWidth,yScale*this.yScale*this.scale,this.scale*this.height/mHeight);
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
            object.scale.set(this.scale*scale,this.yScale*this.scale*scale,this.scale*scale);
        }

        const color = new THREE.Color(this.color);
        object.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.geometry.computeBoundsTree();
              if(isPBR) child.material = textureOrMat;
              if(this.color) child.material.color.set(child.material.color.multiply(color));
              if(textureOrMat && !isPBR) child.material.map = textureOrMat;
            }
        });

        if(model.object.animations.length > 0 && this.enableAnim) {
            if(!model.object.animations[this.animIndex]) {
                console.error("Animation index out of bounds", this.tile);
              }else{
                this.isAnimated = true;
                this.mixer = new THREE.AnimationMixer( model.scene );
                this.mixer.timeScale = this.animSpeed;
                this.mixer.clipAction( model.object.animations[this.animIndex] ).play();
              }
        }

        const container = new THREE.Group();
        this.mesh = container;

        container.add(object);
        object.position.set(0,0,0);
        container.position.set(this.center.x,this.center.y,this.center.z);
        container.rotation.set(this.tiltX,-this.angle*this.rotSign,this.tiltZ);
        container.userData.hitbox = container;
        container.userData.interactive = true;
        container.userData.entity3D = this;
        this.mesh.userData.draggable = true;
        if(this._destroyed) return;
        this._parent.scene.add(container);
        this.initBoundingBox();
    }

    async initInstanced(){
        const model = await this.getModel();
        const {textureOrMat, isPBR} = await this.getTextureOrMat();
        const object = game.Levels3DPreview.helpers.groundModel(model.scene);
        const box = new THREE.Box3().setFromObject(object);
        const gap = this.gap*canvas.grid.size/factor;
        const grid = (canvas.grid.size * this.scale)/factor+gap;
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        const rows = Math.round((this.height+gap/2)/grid) || 1;
        const cols = Math.round((this.width+gap/2)/grid) || 1;
        const count = (rows)*(cols);
        this.count = count;
        const realWidth = grid*cols;
        const realHeight = grid*rows;
        this.realHeight = realHeight;
        this.realWidth = realWidth;
        const container = new THREE.Group();
        const gridX = realWidth/cols;
        const gridZ = realHeight/rows;
        const max = Math.max(mWidth, mHeight);
        const scaleFit = this.scale*(grid-gap)/max;
        this.scaleFit = scaleFit;
        const color = new THREE.Color(this.color);
        const dummy = new THREE.Object3D();
        const maxZ = rows*gridZ-mHeight*scaleFit*1.5;
        const maxX = cols*gridX-mWidth*scaleFit*1.5;
        let randomData = [];

        for(let i = 0; i < count; i++){
            //Random Data
            const randomX = this.randomPosition ? this.pseudoRandom*maxX : 0;
            const randomZ = this.randomPosition ? this.pseudoRandom*maxZ : 0;
            const offsetx = -gap/2+randomX//gap//(mWidth*scaleFit-gridX)/2;
            const offsetz = -gap/2+randomZ//gap//(mHeight*scaleFit-gridZ)/2;
            const randomColor = this.randomColor ? this.pseudoRandom : 0;
            const randomRotation = this.randomRotation ? this.pseudoRandom*Math.PI*2 : 0;
            const randomDepth = this.randomDepth ? this.pseudoRandom : 1;
            const randomScale = this.randomScale ? this.pseudoRandom : 1;
            ///////////////////////////////////////////////////////////
            const randomFrag = { randomColor, randomRotation, randomDepth, randomScale, offsetx, offsetz };
            randomData.push(randomFrag);
        }


        object.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.geometry.computeBoundsTree();
              if(isPBR) child.material = textureOrMat;
              if(this.color) child.material.color.set(child.material.color.multiply(color));
              if(textureOrMat && !isPBR) child.material.map = textureOrMat;
 
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
                    const { randomColor , randomRotation, randomDepth, randomScale, offsetx, offsetz } = randomData[i];
                    dummy.matrix.set(child.matrix);
                    dummy.position.set((child.position.x+x*gridX+offsetx)%maxX,child.position.y*scaleFit*this.yScale,(child.position.z+z*gridZ+offsetz)%maxZ);
                    dummy.scale.set(randomScale*child.scale.x*scaleFit,randomDepth*randomScale*child.scale.y*scaleFit*this.yScale,randomScale*child.scale.z*scaleFit);
                    dummy.rotation.set(child.rotation.x,child.rotation.y+randomRotation,child.rotation.z);
                    dummy.updateMatrix();
                    if(this.randomColor){
                        const originalColor = child.material.color;
                        const color = new THREE.Color(originalColor.r,originalColor.g,originalColor.b);
                        const hsl = color.getHSL({});
                        hsl.l/=randomColor;
                        color.setHSL(hsl.h,hsl.s,hsl.l);
                        instancedMesh.setColorAt(i, color);
                    }
                    instancedMesh.setMatrixAt(i, dummy.matrix);
                    i++;
                }
            }
    
            instancedMesh.instanceMatrix.needsUpdate = true;
            if(this.randomColor) instancedMesh.instanceColor.needsUpdate = true;
            instancedMesh.position.set(-this.width/2+gridX/2,0,-this.height/2+gridZ/2);
            instancedMesh.geometry.computeBoundsTree();
            container.add(instancedMesh);

            }
        });

        this.mesh = container;
        this.mesh.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.geometry.computeBoundsTree();
            }
        })
        container.position.set(this.center.x,this.center.y,this.center.z);
        container.rotation.set(this.tiltX,-this.angle*this.rotSign,this.tiltZ);
        container.userData.hitbox = container;
        container.userData.interactive = true;
        container.userData.entity3D = this;
        if(this._destroyed) return;
        this._parent.scene.add(container);

        this.initBoundingBox(mDepth*scaleFit);
    }

    async getModel(){
        const filePath = this.gtflPath;
        const extension = filePath.split(".").pop().toLowerCase();
        const model = await game.Levels3DPreview.helpers.loadModel(this.gtflPath);
        if(model) return model;
        //make 1x1 cube
        const errText = game.i18n.localize("levels3dpreview.errors.filenotsupported") + "(" + extension +"): " + filePath + " Tile: " + this.tile.id
        console.error(errText);
        ui.notifications.error(errText);
        const obj = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color: 0xff0000}))
        return {scene: obj, model: obj, object: obj};
    }

    async getTextureOrMat(){
        let textureOrMat = null;
        let isPBR = null;
        if(!this.imageTexture) return {textureOrMat, isPBR};
        textureOrMat = await this._parent.helpers.autodetectTextureOrMaterial(this.imageTexture)
        isPBR = this._parent.helpers.isPBR(this.imageTexture)
        if(textureOrMat) return {textureOrMat, isPBR};
        return {textureOrMat, isPBR};
    }

    initBoundingBox(depth){
        let box;
        if(this.fillType === "tile"){
            //const sizeBox = new THREE.Box3().setFromObject(obj);
            const v1 = new THREE.Vector3(0,0,0);
            const v2 = new THREE.Vector3(this.width,depth*this.scaleFit*this.yScale,this.height);
            box = new THREE.Box3(v1,v2);
        }else{
            box = new THREE.Box3().setFromObject(this.mesh);
        }
        const c = new THREE.Color();
        c.set(CONFIG.Canvas.dispositionColors.CONTROLLED);
        const cube = new THREE.Mesh(new THREE.BoxGeometry(this.tile.data.width/factor, box.max.y - box.min.y, this.tile.data.height/factor), new THREE.MeshBasicMaterial({color: c, wireframe: true}));
        cube.position.set(0, (box.max.y - box.min.y) / 2, 0);
        cube.geometry.computeBoundingBox();
        this.controlledBox = cube;
    }

    updateControls(){
        const controls = this._parent.transformControls
        const gizmoEnabled = game.Levels3DPreview.interactionManager._gizmoEnabled
        if(!gizmoEnabled){
            return controls.detach()
        }
        if(this.tile._controlled) controls.attach(this.mesh);
        if(!canvas.activeLayer.controlled.length) controls.detach();
    }

    updateFromTransform(){
        const controls = this._parent.transformControls
        controls.detach();
        this.updatePositionFrom3D();
    }

    processRotation(update){

        const currentTiltX = this.mesh.rotation.x;
        const currentTiltZ = this.mesh.rotation.z;
        const currentTiltY = this.mesh.rotation.y;

        const newTiltX = Math.toDegrees((currentTiltX)%(Math.PI*2));
        const newTiltZ = Math.toDegrees((currentTiltZ)%(Math.PI*2));
        const newTiltY = Math.toDegrees((-currentTiltY*this.rotSign)%(Math.PI*2));

        update.rotation = newTiltY;
        update.flags["levels-3d-preview"].tiltX = newTiltX;
        update.flags["levels-3d-preview"].tiltZ = newTiltZ;

    }

    processScale(update){
        debugger
        const scaleX = this.mesh.scale.x;
        const scaleZ = this.mesh.scale.z;
        const newWidth = this.tile.data.width*scaleX;
        const newHeight = this.tile.data.height*scaleZ;
        const x = (update.x ?? this.tile.data.x) - (newWidth-this.tile.data.width)/2;
        const z = (update.y ?? this.tile.data.y) - (newHeight-this.tile.data.height)/2;
        update.x = Math.round(x);
        update.y = Math.round(z);
        update.width = newWidth;
        update.height = newHeight;
    }

    toggleBoundingBox(){
        if(!game.user.isGM) return;
        const isTileControlled = this.tile._controlled;
        if(this._controlled === isTileControlled) return;
        this._controlled = isTileControlled;
        if(isTileControlled){
            this.mesh.add(this.controlledBox);
        }else{
            this.mesh.remove(this.controlledBox);
        }
    }

    updateVisibility(){
        if(!this.mesh) return;
        this.toggleBoundingBox();
        this.mesh.visible = !this.tile.data.hidden;
        if(game.Levels3DPreview.mirrorLevelsVisibility && this.tile.data.overhead){
            const isLevelsVisible = _levels.floorContainer.spriteIndex[this.tile.id]?.parent ? true : false;
            this.mesh.visible = this.tile.visible || isLevelsVisible;
        }
    }

    updatePositionFrom3D(e){
        this.skipMoveAnimation = true;
        const useSnapped = Ruler3D.useSnapped();
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor - this.tile.data.width/2;
        const y = z3d * factor - this.tile.data.height/2;
        const z = Math.round(((y3d * factor * canvas.dimensions.distance)/(canvas.dimensions.size))*100)/100;
        const snapped = canvas.grid.getSnappedPosition(x, y);
        const {rangeTop, rangeBottom} = _levels.getFlagsForObject(this.tile);
        const dest = {
          x: useSnapped ? snapped.x : x,
          y: useSnapped ? snapped.y : y,
          elevation: z,
        }
        const deltas = {
          x: dest.x - this.tile.data.x,
          y: dest.y - this.tile.data.y,
          elevation: dest.elevation - rangeBottom,
        }
        let updates = [];
        for(let tile of canvas.activeLayer.controlled){
        const tileFlags = _levels.getFlagsForObject(tile);
          const update = {
            _id: tile.id,
            x: tile.data.x + deltas.x,
            y: tile.data.y + deltas.y,
            flags: {
                "levels-3d-preview": {
                    wasFreeMode: this.wasFreeMode,
                },
                levels: {
                    rangeBottom: Math.round((tileFlags.rangeBottom + deltas.elevation)*1000)/1000
                }
            },
          }
          this.processScale(update)
          this.processRotation(update)
          updates.push(update)
        }
        canvas.scene.updateEmbeddedDocuments("Tile", updates)
        return true;
      }

    destroy(){
        this._destroyed = true;
        delete this._parent.tiles[this.tile.id];
        if(!this.mesh) return
        this._parent.scene.remove(this.mesh);
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.dispose?.();
            }
        })
        
    }

    _onClickLeft(e){
        if(canvas.activeLayer.options.objectClass.embeddedName !== "Tile"){
            const point = Ruler3D.pos3DToCanvas(e.position3D);
            if(this.tile.document.checkClick)this.tile.document.checkClick(point, "click");
        }else{
            const event = {
                stopPropagation: () => {},
                data: {
                  originalEvent: e,
                }
              }
              this.tile._onClickLeft(event);
        }

    }


    _onClickLeft2(e){
        if(canvas.activeLayer.options.objectClass.embeddedName !== "Tile"){
            const point = Ruler3D.pos3DToCanvas(e.position3D);
            if(this.tile.document.checkClick)this.tile.document.checkClick(point, "dblclick");
        }else{
            const event = {
                stopPropagation: () => {},
                data: {
                  originalEvent: e,
                }
              }
              this.tile._onClickLeft2(event);
        }
    }

    _onClickRight(e){
        if(canvas.activeLayer.options.objectClass.embeddedName !== "Tile") return;
        const event = {
            stopPropagation: () => {},
            data: {
              originalEvent: e,
            }
          }
          this.tile._onClickRight(event);
    }

    _onClickRight2(e){
        if(canvas.activeLayer.options.objectClass.embeddedName !== "Tile") return;
        const event = {
            stopPropagation: () => {},
            data: {
              originalEvent: e,
            }
          }
          this.tile._onClickRight2(event);
    }

    _onHoverIn(e) {
        //this.placeable._onHoverIn(e);
      }
  
    _onHoverOut(e) {
        //this.placeable._onHoverOut(e);
    }
}

Hooks.on("updateTile", (tile, updates) => {
    if(game.Levels3DPreview?._active && tile.object && !isAnimOnly(updates)){
        game.Levels3DPreview.tiles[tile.id]?.destroy();
        game.Levels3DPreview.createTile(tile.object);
    }

    function isAnimOnly(updates){
        if(!updates.flags) return false;
        if(!updates.flags["levels-3d-preview"]) return false;
        if(Object.values(updates.flags["levels-3d-preview"]).length !== 1) return false;
        if(updates.flags["levels-3d-preview"].paused !== undefined) return true;
        return false;
    }
})

Hooks.on("createTile", (tile) => {
    if(game.Levels3DPreview?._active && tile.object) game.Levels3DPreview.createTile(tile.object);
})
  
Hooks.on("deleteTile", (tile) => {
if(game.Levels3DPreview?._active) game.Levels3DPreview.tiles[tile.id]?.destroy();
})

Hooks.on("pasteTile", (copy, data) => {
    if(game.Levels3DPreview?._active) {
    const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
    data.forEach(td => {
        const data3d = {
            flags: {
                levels: {
                    rangeBottom: pos.z
                }
            }
        }
        mergeObject(td, data3d);
    })
    }
  })

Hooks.on("renderTileHUD", (hud) => {
    if(!game.Levels3DPreview?._active) return;
    const tile3d = game.Levels3DPreview.tiles[hud.object.id];
    if(!tile3d?.isAnimated) return;

    const images = {
        pause: "fa-play",
        play: "fa-pause",
    }

    const isPaused = tile3d.isPaused;

    const controlButton = $(`
    <div class="control-icon" data-action="play-pause-3d">
        <i class="fas ${isPaused ? images.pause : images.play}" title="Overhead Tile"></i>
    </div>
    `)

    controlButton.on("click", (e) => {
        e.stopPropagation();
        hud.object.document.setFlag("levels-3d-preview", "paused", !hud.object.document.getFlag("levels-3d-preview", "paused"));
        controlButton.find("i").toggleClass(`${images.play} ${images.pause}`);
    })

    hud.element.find(`div[data-action="locked"]`).before(controlButton);

})

Hooks.on("controlTile", (tile, controlled) => {
    if(!game.Levels3DPreview?._active || !game.user.isGM) return;
    Object.values(game.Levels3DPreview.tiles).forEach(tile3d => { tile3d.updateControls() })
})