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
        this.shaders = [];
        /*this.index = canvas.background.placeables.indexOf(this.tile) ?? canvas.foreground.placeables.indexOf(this.tile) ?? 0;
        this.zIndex = 0 + this.index;
        this.bottom+=this.zIndex/1000;*/
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
        this.initShaders();
        this._loaded = true;
        this.elevation3d = this.mesh.position.y;
        this.updateControls();
        setTimeout(()=>{
            this.updateControls();
        }, 150)
        if(this.tile._controlled) this._parent.interactionManager.setControlledGroup(this);
        setTimeout(() => {this.setupDoor()}, 100);
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
        this.shader = this.tile.document.getFlag("levels-3d-preview", "shader") ?? "none";
        this.shaderParams = {
            intensity: this.tile.document.getFlag("levels-3d-preview", "shaderIntensity") ?? 0.1,
            speed: this.tile.document.getFlag("levels-3d-preview", "shaderSpeed") ?? 0.1,
            other: this.tile.document.getFlag("levels-3d-preview", "shaderOther") ?? 0.1,
            alt: this.tile.document.getFlag("levels-3d-preview", "shaderAlt") ?? false,
        }
        this.imageTexture = this.tile.document.getFlag("levels-3d-preview", "imageTexture") ?? "";
        this.fillType = this.tile.document.getFlag("levels-3d-preview", "fillType") ?? "stretch";
        this.scale= this.tile.document.getFlag("levels-3d-preview", "tileScale") ?? 1;
        this.yScale = this.tile.document.getFlag("levels-3d-preview", "yScale") ?? 1;
        this.depth = this.tile.document.getFlag("levels-3d-preview", "depth")/factor;
        this.randomRotation = this.tile.document.getFlag("levels-3d-preview", "randomRotation") ?? false;
        this.randomScale = this.tile.document.getFlag("levels-3d-preview", "randomScale") ?? false;
        this.randomDepth = this.tile.document.getFlag("levels-3d-preview", "randomDepth") ?? false;
        this.randomPosition = this.tile.document.getFlag("levels-3d-preview", "randomPosition") ?? false;
        this.gap = this.tile.document.getFlag("levels-3d-preview", "gap") ?? 0;
        this.randomSeed = this.tile.document.getFlag("levels-3d-preview", "randomSeed") || this.tile.id;
        this.randomSeed = this.randomSeed.substring(0,7);
        this.randomColor = this.tile.document.getFlag("levels-3d-preview", "randomColor") ?? false;
        this.collision = this.tile.document.getFlag("levels-3d-preview", "collision") ?? true;
        this.sight = this.tile.document.getFlag("levels-3d-preview", "sight") ?? true;
        this.tiltX = this.tile.document.getFlag("levels-3d-preview", "tiltX") ?? 0;
        this.tiltX = Math.toRadians(this.tiltX);
        this.tiltZ = this.tile.document.getFlag("levels-3d-preview", "tiltZ") ?? 0;
        this.tiltZ = Math.toRadians(this.tiltZ);
        this.autoCenter = this.tile.document.getFlag("levels-3d-preview", "autoCenter") ?? false;
        this.autoGround = this.tile.document.getFlag("levels-3d-preview", "autoGround") ?? false;
        this.textureMode = this.tile.document.getFlag("levels-3d-preview", "textureMode") ?? "stretch";
        this.textureRepeat = this.tile.document.getFlag("levels-3d-preview", "textureRepeat") ?? 1;
        this.wasFreeMode = this.tile.document.getFlag("levels-3d-preview", "wasFreeMode") ?? false;
        this.doorType = this.tile.document.getFlag("levels-3d-preview", "doorType") ?? 0;
        this.doorState = this.tile.document.getFlag("levels-3d-preview", "doorState") ?? 0;
        this.isDoor = this.doorType != 0;
        this.isSecret = this.doorType == 2;
        this.isOpen = this.doorState == 1;
        this.isLocked = this.doorState == 2;
        if(this.isOpen) {
            this.collision = false;
            this.sight = false;
        }
    }

    setupDoor(){
        if(!this.isDoor) return;

        this._parent.interactionManager?.generateSightCollisions();
        canvas.perception.schedule({
            lighting: { initialize: true /* calls updateSource on each light source */, refresh: true },
            sight: { initialize: true /* calls updateSource on each token */, refresh: true /* you probably to refesh sight as well */, forceUpdateFog: true /* not sure if you need this */ },
        });

        if(this.isOpen){
            this.mesh.traverse(child => {
                if(child.isMesh){
                    child.material.transparent = true;
                    child.material.opacity = 0.4;
                    child.material.format = THREE.RGBAFormat;
                    child.material.depthWrite = false;
                }
            })
        }
    }

    async init(){
        const pbr = this._parent.helpers.isPBR(this.texture)
        const {textureOrMat, isPBR} = await this.getTextureOrMat(this.texture);
        const texture = textureOrMat
        const geometry = new THREE.PlaneGeometry(this.width, this.height);
        const material = isPBR ? textureOrMat : new THREE.MeshStandardMaterial({
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
        this.isPlane = true;
        this.initBoundingBox();
    }

    async initModel(){
        const stretch = this.fillType === "stretch";
        const model = await this.getModel();
        const {textureOrMat, isPBR} = await this.getTextureOrMat();
        const object = game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter);
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        //migration
        if(!this.depth){
            if(stretch){
                let yScale = this.width > this.height ? this.width/mDepth : this.height/mDepth;
                yScale*=this.yScale
                const depth = mDepth*yScale
                this.depth = Math.round(depth*factor)/factor;
                this.tile.document.setFlag("levels-3d-preview", "depth", Math.round(depth*factor))
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
                const depth = mDepth*this.yScale*scale//*2
                this.depth = Math.round(depth*factor)/factor;
                const wDiff = (this.tile.data.width - Math.round(scale*mWidth*factor))/2
                const hDiff = (this.tile.data.height - Math.round(scale*mHeight*factor))/2
                this.tile.document.update({
                    flags: {
                        "levels-3d-preview": {
                            "depth": Math.round(depth*factor),
                            "fillType": "stretch"
                        }
                    },
                    width: Math.round(scale*mWidth*factor),
                    height: Math.round(scale*mHeight*factor),
                    x: this.tile.data.x + wDiff,
                    y: this.tile.data.y + hDiff
                })
                this.tile.document.setFlag("levels-3d-preview", "depth", )
            }
        }
        //end migration
        object.scale.set(this.width/mWidth,this.depth/mDepth,this.height/mHeight);

        const color = new THREE.Color(this.color);
        this._processModel(object, textureOrMat, isPBR, color);

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
        const object =  game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter);//model.scene
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
        const scaleFit = (grid-gap)/max;
        this.scaleFit = scaleFit;
        const color = new THREE.Color(this.color);
        const dummy = new THREE.Object3D();
        const maxZ = this.height-mHeight*scaleFit*1.5;
        const maxX =this.width-mWidth*scaleFit*1.5;
        let randomData = [];

        for(let i = 0; i < count; i++){
            //Random Data
            const randomX = this.randomPosition ? ((this.pseudoRandom-0.5)*maxX) : 0;
            const randomZ = this.randomPosition ? ((this.pseudoRandom-0.5)*maxZ) : 0;
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

        this._processModel(object, textureOrMat, isPBR, color);
        object.scale.set(scaleFit,scaleFit,scaleFit);
        const baseScale = object.scale.clone();
        object.traverse((child) => {
            if (child.isMesh) {
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
                    const newScale = baseScale.clone().multiplyScalar(randomScale)
                    newScale.y *= this.yScale*randomDepth;
                    object.scale.copy(newScale);
                    child.getWorldPosition(dummy.position);
                    child.getWorldQuaternion(dummy.quaternion);
                    child.getWorldScale(dummy.scale);
                    object.scale.copy(baseScale);
                    if(this.randomPosition){
                        dummy.position.set((dummy.position.x+offsetx),dummy.position.y,(dummy.position.z+offsetz));
                    }else{
                        dummy.position.set((dummy.position.x+x*gridX+offsetx),dummy.position.y,(dummy.position.z+z*gridZ+offsetz));
                    }

                    //dummy.scale.set(randomScale*child.scale.x*scaleFit,randomDepth*randomScale*child.scale.y*scaleFit*this.yScale,randomScale*child.scale.z*scaleFit);
                    dummy.rotation.set(dummy.rotation.x,dummy.rotation.y+randomRotation,dummy.rotation.z);
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
        this.mesh.position.set(this.center.x,this.center.y,this.center.z);
        this.mesh.rotation.set(this.tiltX,-this.angle*this.rotSign,this.tiltZ);
        this.mesh.userData.hitbox = this.mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        if(this._destroyed) return;
        this._parent.scene.add(this.mesh);

        this.initBoundingBox(mDepth*scaleFit);
    }

    async getModel(){
        const filePath = this.gtflPath;
        const extension = filePath.split(".").pop().toLowerCase();
        const model = await game.Levels3DPreview.helpers.loadModel(this.gtflPath);
        if(model) game.Levels3DPreview.helpers.groundModel(model.model, this.autoGround ,this.autoCenter)
        if(model) return model;
        //make 1x1 cube
        const errText = game.i18n.localize("levels3dpreview.errors.filenotsupported") + "(" + extension +"): " + filePath + " Tile: " + this.tile.id
        console.error(errText);
        ui.notifications.error(errText);
        const obj = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color: 0xff0000}))
        return {scene: obj, model: obj, object: obj};
    }

    async getTextureOrMat(texture, options = {}){
        if(!texture) texture = this.imageTexture
        let textureOrMat = null;
        let isPBR = null;
        if(!texture) return {textureOrMat, isPBR};
        textureOrMat = await this._parent.helpers.autodetectTextureOrMaterial(texture, {noCache: true, ...options});
        isPBR = this._parent.helpers.isPBR(texture)
        if(isPBR){
            Object.values(textureOrMat).forEach(v => this.setTexture(v));
        }else{
            this.setTexture(textureOrMat);
        }
        if(textureOrMat) return {textureOrMat, isPBR};
        return {textureOrMat, isPBR};
    }

    _processModel(object, textureOrMat, isPBR, color){
        const setMaterial = (mat) => {
                
                if(this.color) mat.color.set(mat.color.multiply(color));
                if(textureOrMat && !isPBR) mat.map = textureOrMat;
                mat.needsUpdate = true;
        }
        object.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.geometry.computeBoundsTree();
            
              if(child.material instanceof Array){
                for(let i = 0; i < child.material.length; i++){
                    if(isPBR) child.material[i] = textureOrMat;
                    setMaterial(child.material[i]);
                }
              }else{
                if(isPBR) child.material = textureOrMat;
                  setMaterial(child.material);
              }
            }
        });
        
    }

    setTexture(tex){
        if(this.textureMode == "stretch" || !tex?.image) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set( this.textureRepeat, this.textureRepeat );
        return;
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
        const cube = new THREE.Mesh(new THREE.BoxGeometry(this.tile.data.width/factor, this.fillType === "tile" ? depth : this.depth, this.tile.data.height/factor), new THREE.MeshBasicMaterial({color: c, wireframe: true}));
        cube.position.set(0, this.fillType === "tile" ? depth/2 : (this.depth) / 2, 0);
        if(this.isPlane) cube.rotation.set(-Math.PI/2,0,0);
        cube.geometry.computeBoundingBox();
        this.controlledBox = cube;
    }

    updateControls(){
        if(!this.mesh.parent) return;
        const controls = this._parent.transformControls
        const gizmoEnabled = this._parent.interactionManager._gizmoEnabled
        if(!gizmoEnabled){
            return controls.detach()
        }
        if(this.tile._controlled && !this.tile.data.locked) controls.attach(this._parent.controlledGroup);
        if(!canvas.activeLayer?.controlled?.length) controls.detach();
    }

    updateFromTransform(){
        const controls = this._parent.transformControls
        controls.detach();
        this.updatePositionFrom3D(true);
    }

    processRotation(update, tile){

        const worldRotation = new THREE.Euler().setFromQuaternion(this.mesh.getWorldQuaternion(new THREE.Quaternion()));

        /*if(Math.abs(worldRotation.x) === Math.PI && Math.abs(worldRotation.z) === Math.PI){
            worldRotation.y = (Math.PI + (worldRotation.y))*Math.sign(worldRotation.x);
            worldRotation.x = 0;
            worldRotation.z = 0;
        }*/

        const currentTiltX = worldRotation.x;
        const currentTiltZ = worldRotation.z;
        const currentTiltY = worldRotation.y;

        let newTiltX = Math.round(Math.toDegrees((currentTiltX)%(Math.PI*2)));
        let newTiltZ = Math.round(Math.toDegrees((currentTiltZ)%(Math.PI*2)));
        let newTiltY = Math.round(Math.toDegrees((-currentTiltY*this.rotSign)%(Math.PI*2)));

        if(newTiltX === -180 && newTiltZ === -180 && newTiltY === 0){
            newTiltX = 0;
            newTiltZ = 0;
            newTiltY+= 180;
        }

        update.rotation = newTiltY;
        update.flags["levels-3d-preview"].tiltX = newTiltX;
        update.flags["levels-3d-preview"].tiltZ = newTiltZ;

    }

    processScale(update, tile){
        const scale = this.mesh.getWorldScale(new THREE.Vector3());
        const scaleX = scale.x;
        const scaleZ = scale.z;
        const scaleY = scale.y;
        const newWidth = this.tile.data.width*scaleX;
        const newHeight = this.tile.data.height*scaleZ;
        const newDepth = this.depth*factor*scaleY
        const x = (update.x ?? this.tile.data.x) - (newWidth-this.tile.data.width)/2;
        const z = (update.y ?? this.tile.data.y) - (newHeight-this.tile.data.height)/2;
        update.x = Math.round(x);
        update.y = Math.round(z);
        update.width = newWidth;
        update.height = newHeight;
        update.flags["levels-3d-preview"].depth = Math.round(newDepth)
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

    updateVisibility(time){
        if(!this.mesh) return;
        this.updateShader(time);
        this.toggleBoundingBox();
        this.mesh.visible = !this.tile.data.hidden;
        if(game.Levels3DPreview.mirrorLevelsVisibility && this.tile.data.overhead){
            const isLevelsVisible = _levels.floorContainer.spriteIndex[this.tile.id]?.parent ? true : false;
            this.mesh.visible = this.tile.occluded ? false : this.tile.visible || isLevelsVisible;
        }
    }

    async updatePositionFrom3D(transform = false){
        this.skipMoveAnimation = true;
        const worldPosition = this.mesh.getWorldPosition(new THREE.Vector3());
        const x3d = worldPosition.x;
        const y3d = worldPosition.y;
        const z3d = worldPosition.z;
        const x = x3d * factor - this.tile.data.width/2;
        const y = z3d * factor - this.tile.data.height/2;
        const z = ((y3d * factor * canvas.dimensions.distance)/(canvas.dimensions.size));
        const useSnapped = Ruler3D.useSnapped() && !transform;
        const snapped = canvas.grid.getSnappedPosition(x, y);
        let {rangeTop, rangeBottom} = _levels.getFlagsForObject(this.tile);
        if(!rangeBottom || rangeBottom == -Infinity) rangeBottom = 0;
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
        let tile = this.tile
        let tileFlags = _levels.getFlagsForObject(tile) || {};
        if(!tileFlags.rangeBottom || tileFlags.rangeBottom == -Infinity) tileFlags.rangeBottom = 0;
          const update = {
            _id: tile.id,
            x: tile.data.x + deltas.x,
            y: tile.data.y + deltas.y,
            flags: {
                "levels-3d-preview": {
                    wasFreeMode: this.wasFreeMode,
                },
                levels: {
                    rangeBottom: (tileFlags.rangeBottom + deltas.elevation)
                }
            },
          }
          this.processScale(update, tile)
          this.processRotation(update, tile)
          updates.push(update)
        await canvas.scene.updateEmbeddedDocuments("Tile", updates)
        return true;
    }

    initShaders(){
        if(this.shader == "none") return;
        this.mesh.traverse(child => {
            if(child.isMesh){
                if(child.material instanceof Array){
                    child.material.forEach(material => {
                        this.applyShader(materia,child)
                    })
                }else{
                    this.applyShader(child.material,child)
                }
            }
        })
    }

    applyShader(material, object){
        const shaderFn = tileShaders[this.shader];
        shaderFn(this, material, object, this.shaderParams);
    }

    //

    updateShader(delta){
        this.shaders.forEach(shader => {
            shader.uniforms.time.value = delta/100;
        })
    }

    destroy(){
        this._destroyed = true;
        delete this._parent.tiles[this.tile.id];
        if(!this.mesh) return
        this.mesh.removeFromParent();
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.dispose?.();
            }
        })
        
    }

    get isToFar(){
        if(game.user.isGM) return false;
        const maxDist = (canvas.dimensions.size*3)/factor
        let minDist = Infinity;
        for(let token of canvas.tokens.controlled){
            const token3d = this._parent.tokens[token.id];
            if(!token3d) continue;
            const dist = token3d.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(this.mesh.getWorldPosition(new THREE.Vector3()));
            if(dist < minDist) minDist = dist;
        }
        return minDist > maxDist;
    }   

    _onClickLeft(e){
        if(canvas.activeLayer.options.objectClass.embeddedName === "Token" && this.isDoor && !(this.isSecret && !game.user.isGM)){
            if(this.isToFar) ui.notifications.error(game.i18n.localize("levels3dpreview.errors.toofarfromdoor"));
            else this._parent.socket.executeAsGM("toggleDoor", this.tile.id, canvas.scene.id, game.user.id)
        }
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
        if(canvas.activeLayer.options.objectClass.embeddedName === "Token" && game.user.isGM){
            if(this.isDoor){
                if(this.isLocked) this.tile.document.setFlag("levels-3d-preview", "doorState", 0);
                else this.tile.document.setFlag("levels-3d-preview", "doorState", 2);
            }
        }
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

const tileShaders = {
    "wind": (_this, material, object, params) => {
        const {intensity, speed, other, alt} = params;
        const ySize = object.geometry.boundingBox.max.y;
        const mWidth = object.geometry.boundingBox.max.x - object.geometry.boundingBox.min.x;
        const mHeight = object.geometry.boundingBox.max.z - object.geometry.boundingBox.min.z;
        material.onBeforeCompile = (shader,renderer) => {
            _this.shaders.push(shader)
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                `float currentY = position.y;
                float windFactor = 0.0;
                vec2 windOffset = vec2(0.0);
                if (currentY > ySize/2.0) {
                    windFactor = (currentY - ySize/2.0) / (ySize/2.0);
                    if(alt == 1.0) {
                        windFactor = sin(time*speed + position.x + position.z) * windFactor;
                    }else{
                        windFactor = sin(time*speed) * windFactor;
                    }
                    windOffset = vec2(windFactor * mWidth * intensity * cos(other), windFactor * mHeight * intensity * sin(other));
                }
                
                vec3 transformed = vec3( position.x + windOffset.x, position.y, position.z + windOffset.y );`
                )
            shader.vertexShader = 
            `uniform float time;
            uniform float ySize;
            uniform float mWidth;
            uniform float mHeight;
            uniform float intensity;
            uniform float speed;
            uniform float other;
            uniform float alt;
            `
             + shader.vertexShader;
            
            shader.uniforms.time = { value: 0.0 };
            shader.uniforms.ySize = { value: ySize };
            shader.uniforms.mWidth = { value: mWidth };
            shader.uniforms.mHeight = { value: mHeight };
            shader.uniforms.intensity = { value: intensity };
            shader.uniforms.speed = { value: speed };
            shader.uniforms.other = { value: other*Math.PI*2-_this.angle*_this.rotSign };
            shader.uniforms.alt = { value: alt ? 1.0 : 0.0 };
        }
        material.customProgramCacheKey = () => {
            return `wind`
        }
    },
    "lava": (_this, material, object, params) => {
        const {intensity, speed, other, alt} = params;
        const mWidth = object.geometry.boundingBox.max.x - object.geometry.boundingBox.min.x;
        const mHeight = object.geometry.boundingBox.max.z - object.geometry.boundingBox.min.z;
        material.onBeforeCompile = (shader,renderer) => {
            _this.shaders.push(shader)
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                `float currentY = position.y;
                float direction = position.x + position.z;   
                vec3 displaceOffset = vec3(mWidth * intensity * cos(other+direction) * sin(time*speed), intensity * sin(time*speed) * cos(direction) ,mHeight * intensity * sin(other+direction) * sin(time*speed));
                vec3 transformed = vec3( position.x + displaceOffset.x, position.y + displaceOffset.y, position.z + displaceOffset.z );`
                )
            shader.vertexShader = 
            `uniform float time;
            uniform float mWidth;
            uniform float mHeight;
            uniform float intensity;
            uniform float speed;
            uniform float other;
            uniform float alt;
            `
             + shader.vertexShader;
            
            shader.uniforms.time = { value: 0.0 };
            shader.uniforms.mWidth = { value: mWidth/10 };
            shader.uniforms.mHeight = { value: mHeight/10 };
            shader.uniforms.intensity = { value: intensity };
            shader.uniforms.speed = { value: speed };
            shader.uniforms.other = { value: other*Math.PI*2-_this.angle*_this.rotSign };
            shader.uniforms.alt = { value: alt ? 1.0 : 0.0 };
        }
        material.customProgramCacheKey = () => {
            return `lava`
        }
    },
    "water": (_this, material, object, params) => {
        const {intensity, speed, other, alt} = params;
        const mDepth = object.geometry.boundingBox.max.y - object.geometry.boundingBox.min.y;
        const mWidth = object.geometry.boundingBox.max.x - object.geometry.boundingBox.min.x;
        const mHeight = object.geometry.boundingBox.max.z - object.geometry.boundingBox.min.z;
        //float posX = (position.x - mWidth) * ((speed)*2.0 + 1.0) ;
        //float posZ = (position.z - mHeight) * ((speed)*2.0 + 1.0) ;
        //float r = sqrt (posX*posX + posZ*posZ) * (time * other / 50.0);
        //float yDisplace = (sin (r) / r) * 5.0 * intensity * mDepth;
        material.onBeforeCompile = (shader,renderer) => {
            _this.shaders.push(shader)
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                `float yDisplace = 0.0;
                if( position.y > mHeight/10.0 ) {
                    float posX = position.x - mWidth ;
                    float posZ = position.z - mHeight ;
                    float timeSpeed = time * speed;
                    float r = sqrt (posX*posX + posZ*posZ)*(intensity) + timeSpeed;
                    yDisplace = (1.0 + sin(r) ) * other * mDepth;
                }
                vec3 transformed = vec3( position.x, position.y + yDisplace, position.z);`
                )
            shader.vertexShader = 
            `uniform float time;
            uniform float mDepth;
            uniform float mWidth;
            uniform float mHeight;
            uniform float intensity;
            uniform float speed;
            uniform float other;
            uniform float alt;
            `
             + shader.vertexShader;
            
            shader.uniforms.time = { value: 0.0 };
            shader.uniforms.mDepth = { value: mDepth*10 };
            shader.uniforms.mWidth = { value: mWidth };
            shader.uniforms.mHeight = { value: mHeight };
            shader.uniforms.intensity = { value: intensity*8.0 };
            shader.uniforms.speed = { value: speed*0.8 };
            shader.uniforms.other = { value: other*0.2 };
            shader.uniforms.alt = { value: alt ? 1.0 : 0.0 };
        }
        material.customProgramCacheKey = () => {
            return `water`
        }
    }
}