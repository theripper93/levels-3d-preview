import * as THREE from "../lib/three.module.js";
import { MersenneTwister } from "../lib/mersenneTwister.js";
import { noiseShaders } from "../shaders/noise.js";
import { SimplexNoise, Perlin, FractionalBrownianMotion } from "../lib/noiseFunctions.js";
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
        this.setShading();
        this._loaded = true;
        this.elevation3d = this.mesh.position.y;
        this.setHidden();
        this.updateControls();
        setTimeout(()=>{
            this.updateControls();
        }, 150)
        if(this.tile._controlled) this._parent.interactionManager.setControlledGroup(this);
        setTimeout(() => {
            this.setUpDoors()
            this.setupDoor()
        }, 100);
        return this;
    }

    initRandom(){
        let seed = "";
        for(let c of this.randomSeed){
            seed += c.charCodeAt().toString();
        }
        seed = parseInt(seed);
        this.marsenne = new MersenneTwister(seed);
        this.simplex = new SimplexNoise(this.marsenne);
        this.perlin = new Perlin(this.marsenne);
        this.noiseFn = this.simplex.noise.bind(this.simplex);
        switch(this.noiseType){
            case "simplex":
                this.noiseFn = this.simplex.noise.bind(this.simplex);
                break;
            case "perlin":
                this.noiseFn = this.perlin.get.bind(this.perlin);
                break;
        }
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
        this.enableGravity = this.tile.document.getFlag("levels-3d-preview", "enableGravity") ?? "none";
        this.shading = this.tile.document.getFlag("levels-3d-preview", "shading") ?? "default";
        this.shader = this.tile.document.getFlag("levels-3d-preview", "shader") ?? "none";
        this.flipY = this.tile.document.getFlag("levels-3d-preview", "flipY") ?? false;
        this.shaderParams = {
            intensity: this.tile.document.getFlag("levels-3d-preview", "shaderIntensity") ?? 0.1,
            speed: this.tile.document.getFlag("levels-3d-preview", "shaderSpeed") ?? 0.1,
            other: this.tile.document.getFlag("levels-3d-preview", "shaderOther") ?? 0.1,
            other2: this.tile.document.getFlag("levels-3d-preview", "shaderOther2") ?? 0.5,
            alt: this.tile.document.getFlag("levels-3d-preview", "shaderAlt") ?? false,
        }
        this.noiseParams = {
            scale: this.tile.document.getFlag("levels-3d-preview", "noiseScale") ?? 1,
            height: this.tile.document.getFlag("levels-3d-preview", "noiseHeight") ?? 1,
            persistence: this.tile.document.getFlag("levels-3d-preview", "noisePersistence") ?? 0.5,
            octaves: this.tile.document.getFlag("levels-3d-preview", "noiseOctaves") ?? 1, 
            lacunarity: this.tile.document.getFlag("levels-3d-preview", "noiseLacunarity") ?? 2,
            exponent: this.tile.document.getFlag("levels-3d-preview", "noiseExponent") ?? 1,
            flattening: 1 - (this.tile.document.getFlag("levels-3d-preview", "noiseFlattening") ?? 0),
        }
        this.noiseType = this.tile.document.getFlag("levels-3d-preview", "noiseType") ?? "none";
        this.noiseScale = this.tile.document.getFlag("levels-3d-preview", "noiseScale") ?? 1;
        this.imageTexture = this.tile.document.getFlag("levels-3d-preview", "imageTexture") ?? "";
        this.displacementMap = this.tile.document.getFlag("levels-3d-preview", "displacementMap") ?? "";
        this.fillType = this.tile.document.getFlag("levels-3d-preview", "fillType") ?? "stretch";
        this.scale= this.tile.document.getFlag("levels-3d-preview", "tileScale") ?? 1;
        this.yScale = this.tile.document.getFlag("levels-3d-preview", "yScale") ?? 1;
        this.depth = this.tile.document.getFlag("levels-3d-preview", "depth")/factor;
        this.randomRotation = this.tile.document.getFlag("levels-3d-preview", "randomRotation") ?? false;
        this.randomScale = this.tile.document.getFlag("levels-3d-preview", "randomScale") ?? false;
        this.randomDepth = this.tile.document.getFlag("levels-3d-preview", "randomDepth") ?? false;
        this.randomPosition = this.tile.document.getFlag("levels-3d-preview", "randomPosition") ?? false;
        this.gap = this.tile.document.getFlag("levels-3d-preview", "gap") ?? 0;
        if(this.gap < 0) this.gap = 0;
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
        this.textureRepeat = this.tile.document.getFlag("levels-3d-preview", "textureRepeat") ?? 1;
        this.repeatTexture = this.textureRepeat > 1;
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

    setUpDoors(){
        const doors = {};
        this.mesh.traverse((child) => {
            if(child.isMesh && child?.userData?.isDoor && child?.userData?.doorId){
                doors[child?.userData?.doorId] = child;
                child.userData.doorMaterialData = {
                    transparent : true,
                    opacity : 0.4,
                    alphaTest : 0,
                    depthWrite : false,
                    format : THREE.RGBAFormat,
                    needsUpdate : true,
                }
                child.userData.originalMaterial = {
                    transparent : child.material.transparent,
                    opacity : child.material.opacity,
                    alphaTest : child.material.alphaTest,
                    depthWrite : child.material.depthWrite,
                    format : child.material.format,
                    needsUpdate : true,
                }
            }
        })
        this._doors = doors;
        this.setDoorsMaterials();
    }

    setDoorsMaterials(){
        const modelDoorsStates = this.tile.document.getFlag("levels-3d-preview", "modelDoors") || {};
        for(let doorId in this._doors){

            let isOpen = this._doors[doorId].userData?.isOpen == 1;
            isOpen = modelDoorsStates[doorId]?.ds !== undefined ? modelDoorsStates[doorId].ds == 1 : isOpen;
            const door = this._doors[doorId];
            const originalMaterial = door.userData.originalMaterial;
            const doorMaterialData = door.userData.doorMaterialData;
            let matToApply = isOpen ? doorMaterialData : originalMaterial;
            for(let [k,v] of Object.entries(matToApply)){
                door.material[k] = v;
                door.userData.sight = isOpen ? false : this.sight;
                door.userData.collision = isOpen ? false : this.collision;
            }
        }

        this._parent.interactionManager?.generateSightCollisions();
        canvas.perception.schedule({
            lighting: { initialize: true /* calls updateSource on each light source */, refresh: true },
            sight: { initialize: true /* calls updateSource on each token */, refresh: true /* you probably to refesh sight as well */, forceUpdateFog: true /* not sure if you need this */ },
        });
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
                    child.material.alphaTest = 0;
                    child.material.depthWrite = false;
                    child.material.format = THREE.RGBAFormat
                    child.material.needsUpdate = true;
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
            transparent: !(texture instanceof THREE.VideoTexture),
            opacity: this.opacity,
            visible: !this.tile.data.hidden,
            map: texture,
            side: THREE.DoubleSide,
            roughness : 1,
            metalness : 1,
            //depthWrite: false,
            alphaTest: texture instanceof THREE.VideoTexture ? 0.99 : 0,
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
        if(this.displacementMap) {
            const tex = await this._parent.helpers.loadTexture(this.displacementMap);
            this.displacementMap = this.getDisplacementData(tex.image);
            this.applyDisplacement(model.scene)
        }
        const object = game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter);
        const box = new THREE.Box3().setFromObject(object);
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = Math.max(box.max.y - box.min.y, 0.00001);
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
        this.applyNoise(object);

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
        container.traverse(child => {
            if(child.geometry) child.geometry.computeBoundsTree();
        })
        this._parent.scene.add(container);
        this.initBoundingBox();
    }

    async initInstanced(){
        this.isGravity = this.enableGravity !== "none";
        if(this.isGravity) this._parent.interactionManager.forceSightCollisions();
        if(this.displacementMap) {
            const tex = await this._parent.helpers.loadTexture(this.displacementMap);
            this.displacementMap = this.getDisplacementData(tex.image);
        }
        const model = await this.getModel();
        const raycaster = this._parent.interactionManager
        this.isInstanced = true;
        const {textureOrMat, isPBR} = await this.getTextureOrMat();
        const object =  game.Levels3DPreview.helpers.groundModel(model.scene, this.autoGround, this.autoCenter);//model.scene
        this.applyNoise(object);
        const box = new THREE.Box3().setFromObject(object);
        const gap = this.gap*canvas.grid.size/factor;
        const grid = (canvas.grid.size * this.scale)/factor+gap;
        const mWidth = box.max.x - box.min.x;
        const mHeight = box.max.z - box.min.z;
        const mDepth = box.max.y - box.min.y;
        const rows = Math.round((this.height+gap/2)/grid) || 1;
        const cols = Math.round((this.width+gap/2)/grid) || 1;
        let count = (rows)*(cols);
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

        let finalCount = count;
        for(let z = 0; z < rows; z++){
            for(let x = 0; x < cols; x++){
                const posx = x*gridX;
                const posz = z*gridZ;
                //Random Data
                const randomX = this.randomPosition ? ((this.pseudoRandom-0.5)*maxX) : 0;
                const randomZ = this.randomPosition ? ((this.pseudoRandom-0.5)*maxZ) : 0;
                const offsetx = -gap/2+randomX//gap//(mWidth*scaleFit-gridX)/2;
                const offsetz = -gap/2+randomZ//gap//(mHeight*scaleFit-gridZ)/2;
                const finalX = this.randomPosition ? offsetx : posx+offsetx;
                const finalZ = this.randomPosition ? offsetz : posz+offsetz;
                const randomColor = this.randomColor ? this.pseudoRandom : 0;
                const randomRotation = this.randomRotation ? this.pseudoRandom*Math.PI*2 : 0;
                const randomDepth = this.randomDepth ? this.pseudoRandom : 1;
                const randomScale = this.randomScale ? this.pseudoRandom : 1;
                const displacementRandom = this.displacementMap ? this.pseudoRandom-0.5 : 0;
                ///////////////////////////////////////////////////////////
                const randomFrag = { randomColor, randomRotation, randomDepth, randomScale, offsetx, offsetz };
                if(this.displacementMap){
                    const keep = this.getPixel(this.displacementMap, finalX/realWidth, finalZ/realHeight).r/255 < displacementRandom;
                    if(!keep) {
                        finalCount--;
                        randomData.push(null)
                        continue;
                    }
                }
                randomData.push(randomFrag);
            }
        }

        count = finalCount;

        this._processModel(object, textureOrMat, isPBR, color);
        object.scale.set(scaleFit,scaleFit,scaleFit);
        const instBoxSize = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
        this.instancedBBSize = instBoxSize;
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
            let j = 0;
            for(let z = 0; z < rows; z++){
                for(let x = 0; x < cols; x++){
                    if(!randomData[i]) {
                        i++;
                        continue;
                    }
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
                    if(this.enableGravity !== "none"){
                        const realTarget = dummy.position.clone();
                        realTarget.add(new THREE.Vector3(
                            -this.width/2+gridX/2 + this.center.x,
                            0 + this.center.y,
                            -this.height/2+gridZ/2 + this.center.z
                        ))
                        realTarget.y = this.center.y;
                        const rcTarget = realTarget.clone();
                        rcTarget.y -= 10;
                        const collision = raycaster.computeSightCollisionFrom3DPositions(realTarget,rcTarget, "collision", false, false, false, true)
                        if(collision){
                            dummy.position.y -= (collision[0].distance + 0.01);
                            if(this.enableGravity === "gravityRotation") {
                                dummy.rotation.set(collision[0].face.normal.x,collision[0].face.normal.y,collision[0].face.normal.z);
                                dummy.rotateOnAxis(collision[0].face.normal, randomRotation);
                            }
                        }
                    }

                    dummy.updateMatrix();
                    if(this.randomColor){
                        //const color = child.material.color.clone();
                        const color = new THREE.Color(this.color)
                        const hsl = color.getHSL({});
                        hsl.l/=randomColor;
                        color.setHSL(hsl.h,hsl.s,hsl.l);
                        instancedMesh.setColorAt(j, color);
                    }
                    instancedMesh.setMatrixAt(j, dummy.matrix);
                    i++;
                    j++
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
        let hasTags = false;
        model.model.traverse((child) => {
            if(child?.userData?.sight !== undefined || child?.userData?.collision !== undefined || child?.userData?.isDoor !== undefined){
                hasTags = true;
            }
        })
        this.hasTags = hasTags;
        if(this.hasTags){
            model.model.traverse((child) => {
                if(child?.userData?.sight === undefined){
                    child.userData.sight = this.sight;
                }
                if(child?.userData?.collision === undefined){
                    child.userData.collision = this.collision;
                }
            }) 
        }
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
                if(this.color && mat.emissiveMap) mat.emissive = color;
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
        if(this.flipY && tex?.image){
            tex.flipY = false;
        }
        if(!this.repeatTexture || !tex?.image) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set( this.textureRepeat, this.textureRepeat );
        return;
    }

    setShading(){
        if(this.shading == "default") return;
        const flatShading = this.shading == "flat";
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                if(child.material instanceof Array){
                    child.material.forEach(m => m.flatShading = flatShading);
                }else{
                    child.material.flatShading = flatShading;
                }
            }
        })
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
        this.bb = {
            width: this.tile.data.width/factor,
            depth: this.fillType === "tile" ? depth : this.depth,
            height: this.tile.data.height/factor,
        }
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

    setHidden(){
        if(!game.user.isGM) return;
        const hidden = this.tile.data.hidden;
        if(hidden){
            this.mesh.traverse(child => {
                if(child.isMesh){
                    child.material.transparent = true;
                    child.material.opacity *= 0.5;
                    child.material.alphaTest = 0;
                    child.material.depthWrite = false;
                    child.material.format = THREE.RGBAFormat
                    child.material.needsUpdate = true;
                }
            })
        }
    }

    updateVisibility(time){
        if(!this.mesh) return;
        this.updateShader(time);
        this.toggleBoundingBox();
        this.mesh.visible = !this.tile.data.hidden || game.user.isGM;
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
        const resp = await canvas.scene.updateEmbeddedDocuments("Tile", updates)
        if(!resp?.length) this._parent.interactionManager.setControlledGroup();
        return true;
    }

    initShaders(){
        if(!tileShaders[this.shader]) return;
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

    updateShader(delta){
        this.shaders.forEach(shader => {
            shader.uniforms.time.value = delta/100;
        })
    }

    getNoise(x,y){
        return FractionalBrownianMotion(x,y,this.noiseFn,this.noiseParams)
    }

    applyDisplacement(model){
        if(!this.displacementMap) return;
        model.traverse(c => {
            if(c.isMesh){
                c.geometry = c.geometry.clone();
                const positionAttributes = c.geometry.getAttribute("position");
                const count = positionAttributes.count;
                const maxX = c.geometry.boundingBox.max.x;
                const minX = c.geometry.boundingBox.min.x;
                const maxZ = c.geometry.boundingBox.max.z;
                const minZ = c.geometry.boundingBox.min.z;
                for(let i=0; i < count; i++){
                        const x = positionAttributes.getX(i);
                        const z = positionAttributes.getZ(i);
                        if(x===maxX || x===minX || z===maxZ || z===minZ) continue;
                        const xPercent = (x - minX)/(maxX - minX);
                        const zPercent = (z - minZ)/(maxZ - minZ);
                        const displacement = 1 - this.getPixel(this.displacementMap, xPercent, zPercent).r/255;
                        let y = positionAttributes.getY(i);
                        if(y<=0) continue;
                        y += displacement * this.noiseParams.height;
                        positionAttributes.setY(i, y);
                }
                c.geometry.computeVertexNormals();
                c.geometry.normalizeNormals();
                c.geometry.computeTangents();
                c.geometry.attributes.position.needsUpdate = true;
                c.geometry.attributes.normal.needsUpdate = true;
            }
        })
    }

    applyNoise(model){
        if(this.noiseType === "none") return;
        model.traverse(c => {
            if(c.isMesh){
                c.geometry = c.geometry.clone();
                const positionAttributes = c.geometry.getAttribute("position");
                const count = positionAttributes.count;
                for(let i=0; i < count; i++){
                    let x = positionAttributes.getX(i);
                    let y = positionAttributes.getY(i);
                    let z = positionAttributes.getZ(i);
                    y+= this.getNoise(x,z);
                    positionAttributes.setY(i, y);
                }
                c.geometry.computeVertexNormals();
                c.geometry.normalizeNormals();
                c.geometry.computeTangents();
                c.geometry.attributes.position.needsUpdate = true;
                c.geometry.attributes.normal.needsUpdate = true;
            }
        })
    }

    getDisplacementData( image ) {

        var canvas = document.createElement( 'canvas' );
        canvas.width = image.width;
        canvas.height = image.height;
    
        var context = canvas.getContext( '2d' );
        context.drawImage( image, 0, 0 );
    
        return context.getImageData( 0, 0, image.width, image.height );
    
    }

    getPixel( imagedata, x, y ) {
        x *= imagedata.width;
        y *= imagedata.height;
        x = parseInt( x );
        y = parseInt( y );  
        var position = ( x + imagedata.width * y ) * 4, data = imagedata.data;
        return { r: data[ position ], g: data[ position + 1 ], b: data[ position + 2 ], a: data[ position + 3 ] };
    
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

    isToFar(mesh){
        mesh = mesh ?? this.mesh;
        if(game.user.isGM) return false;
        const maxDist = (canvas.dimensions.size*3)/factor
        let minDist = Infinity;
        for(let token of canvas.tokens.controlled){
            const token3d = this._parent.tokens[token.id];
            if(!token3d) continue;
            const dist = token3d.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(mesh.getWorldPosition(new THREE.Vector3()));
            if(dist < minDist) minDist = dist;
        }
        return minDist > maxDist;
    }   

    _onClickLeft(e){
        const oT = e.originalIntersect?.userData
        if(oT?.isDoor && canvas.activeLayer.options.objectClass.embeddedName === "Token" && !(oT?.isSecret && !game.user.isGM)){
            if(this.isToFar(e.originalIntersect)) ui.notifications.error(game.i18n.localize("levels3dpreview.errors.toofarfromdoor"));
            else this._parent.socket.executeAsGM("toggleDoor", this.tile.id, canvas.scene.id, game.user.id, oT.doorId)
        }

        if(canvas.activeLayer.options.objectClass.embeddedName === "Token" && this.isDoor && !(this.isSecret && !game.user.isGM)){
            if(this.isToFar()) ui.notifications.error(game.i18n.localize("levels3dpreview.errors.toofarfromdoor"));
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

    _setDoorState(){}

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
              this.tile._onClickLeft(event);
              this.tile._onClickLeft2(event);
        }
    }

    _onClickRight(e){
        const oT = e.originalIntersect?.userData
        if(canvas.activeLayer.options.objectClass.embeddedName === "Token" && game.user.isGM){
            if(oT?.isDoor){
                const subDoorId = oT.doorId;
                const ds = this.tile.document.getFlag("levels-3d-preview", `modelDoors.${subDoorId}`)?.ds ?? 0
                const isLocked = ds == 2;
            
                if(isLocked) this.tile.document.setFlag("levels-3d-preview", `modelDoors.${subDoorId}.ds`, 0);
                else this.tile.document.setFlag("levels-3d-preview", `modelDoors.${subDoorId}.ds`, 2);
            }
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

export async function recomputeGravity(){
    const _parent =  game.Levels3DPreview;
    const tiles = Object.values(_parent.tiles).sort((a,b) => {
        return a.bottom - b.bottom;
    }).reverse();
    for(let tile3d of tiles){
        const gravity = tile3d.isGravity
        if(!gravity) continue;
        tile3d?.destroy();
    }
    for(let tile3d of tiles){
        const gravity = tile3d.isGravity
        if(!gravity) continue;
        const newTile = new Tile3D(tile3d.placeable, game.Levels3DPreview);
        await newTile.load();
        game.Levels3DPreview.tiles[tile3d.placeable.id] = newTile;
    }
    game.Levels3DPreview.interactionManager.setControlledGroup();
}

export const recomputeGravityDebounced = debounce(recomputeGravity, 100);

Hooks.on("updateTile", (tile, updates) => {
    if(game.Levels3DPreview?._active && tile.object && isDoorUpdate(updates)){
        game.Levels3DPreview.tiles[tile.id]?.setDoorsMaterials();
        return;
    }
    if(game.Levels3DPreview?._active && tile.object && !isAnimOnly(updates)){
        const hasGravity = (tile.getFlag("levels-3d-preview", "enableGravity") ?? "none") !== "none";
        const hadGravity = game.Levels3DPreview.tiles[tile.id]?.isGravity;
        if(hasGravity && hadGravity) return recomputeGravityDebounced();
        game.Levels3DPreview.tiles[tile.id]?.destroy();
        const newTile = new Tile3D(tile.object, game.Levels3DPreview);
        game.Levels3DPreview.tiles[tile.id] = newTile;
        newTile.load().then(() => {
            if("x" in updates || "y" in updates || hasFlag(updates)){
                recomputeGravityDebounced();
            }
        })

        function hasFlag(updates){
            if(updates?.flags?.levels?.rangeBottom !== undefined) return true;
            if(updates?.flags?.levels?.rangeTop !== undefined) return true;
        }
    }

    function isDoorUpdate(updates){
        if(updates.flags && updates.flags["levels-3d-preview"] && updates.flags["levels-3d-preview"].modelDoors) return true;
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
        const {intensity, speed, other,other2, alt} = params;
        const {mDepth, mWidth, mHeight, yPos} = getSizesForShader(_this);
        const localSize = _this.isInstanced ? new THREE.Vector3(mWidth*0.3, mDepth*0.3, mHeight*0.3) : new THREE.Vector3(0.2, 0.2, 0.2);
        
        const beginFragment = `uniform float time;
        uniform float mDepth;
        uniform float yPos;
        uniform float mWidth;
        uniform float mHeight;
        uniform vec3 localSize;
        uniform float intensity;
        uniform float speed;
        uniform float other;
        uniform float other2;
        uniform float alt;
        `
        const transformFragment = `float currentY = (modelMatrix * vec4( position, 1.0 )).y;
        float lWidth = localSize.x;
        float lHeight = localSize.z;
        float currentYDelta = currentY - yPos;
        float windFactor = 0.0;
        vec2 windOffset = vec2(0.0);
        float modelAffected = other2;
        if (currentYDelta > mDepth*modelAffected) {
            windFactor = (currentYDelta - mDepth*modelAffected) / (mDepth*modelAffected);
            if(alt == 1.0) {
                windFactor = (sin(time*speed + position.x + position.z) + intensity) * windFactor;
            }else{
                windFactor = (sin(time*speed) + intensity) * windFactor;
            }
            windOffset = vec2(windFactor * intensity * cos(other) * lWidth, windFactor *  intensity * sin(other) * lHeight);
        }
        
        transformed = vec3( position.x + windOffset.x, position.y, position.z + windOffset.y );
        
        `

        const setUniforms = (shader) => {
            shader.uniforms.time = { value: 0.0 };
            shader.uniforms.mWidth = { value: mWidth };
            shader.uniforms.mHeight = { value: mHeight };
            shader.uniforms.intensity = { value: intensity };
            shader.uniforms.speed = { value: speed };
            shader.uniforms.other = { value: other*Math.PI*2-_this.angle*_this.rotSign };
            shader.uniforms.other2 = { value: other2 };
            shader.uniforms.alt = { value: alt ? 1.0 : 0.0 };
            shader.uniforms.yPos = { value: yPos };
            shader.uniforms.mDepth = { value: mDepth };
            shader.uniforms.localSize = { value: localSize };
        }

        const setupShader = (shader) => {
            _this.shaders.push(shader);
            shader.vertexShader = beginFragment + shader.vertexShader.replace(`#include <begin_vertex>`, `#include <begin_vertex>\n` + transformFragment);
            setUniforms(shader);
        }

        object.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: material.alphaTest,
            map: material.alphaTest ? material.map : null,
            onBeforeCompile: setupShader,
            customProgramCacheKey: () => {
                return `wind_depth`
            }
        })

        material.onBeforeCompile = setupShader;
        material.customProgramCacheKey = () => {
            return `wind`
        }
    },
    "distortion": (_this, material, object, params) => {
        const {intensity, speed, other,other2, alt} = params;
        const {mDepth, mWidth, mHeight, yPos} = getSizesForShader(_this);

        const beginFragment = `${noiseShaders.snoise}
        uniform float time;
        uniform float mWidth;
        uniform float mHeight;
        uniform float mDepth;
        uniform float intensity;
        uniform float speed;
        uniform float other;
        uniform float alt;
        `
        const transformFragment = `vec3 displaceOffset = vec3(0.0);
        if( position.y > 0.01 ) {
            if( alt == 1.0 ) {
                float direction = snoise(vec2(position.x , position.z));//position.x * position.z;   
                displaceOffset = vec3(mWidth * intensity * cos(other+direction) * sin(time*speed), mDepth * intensity * (sin(time*speed) + 1.0) * direction * 0.5 ,mHeight * intensity * sin(other+direction) * sin(time*speed));
            }else{
                float direction = position.x * position.z;   
                displaceOffset = vec3(mWidth * intensity * cos(other+direction) * sin(time*speed), mDepth * intensity * (sin(time*speed) + 1.0) * (cos(direction) + 1.0) * 0.25 ,mHeight * intensity * sin(other+direction) * sin(time*speed));
            }
            if( position.y + displaceOffset.y <= 0.0 ) {
                displaceOffset.y = 0.0;
            }
        }
        vec3 transformed = vec3( position.x + displaceOffset.x, position.y + displaceOffset.y, position.z + displaceOffset.z );`

        const setUniforms = (shader) => {
            shader.uniforms.time = { value: 0.0 };
            shader.uniforms.mWidth = { value: mWidth/10 };
            shader.uniforms.mHeight = { value: mHeight/10 };
            shader.uniforms.mDepth = { value: mDepth };
            shader.uniforms.intensity = { value: intensity };
            shader.uniforms.speed = { value: speed };
            shader.uniforms.other = { value: other*Math.PI*2-_this.angle*_this.rotSign };
            shader.uniforms.alt = { value: alt ? 1.0 : 0.0 };
        }

        const setupShader = (shader) => {
            _this.shaders.push(shader);
            shader.vertexShader = beginFragment + shader.vertexShader.replace(`#include <begin_vertex>`, `#include <begin_vertex>\n` + transformFragment);
            setUniforms(shader);
        }

        object.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: material.alphaTest,
            map: material.alphaTest ? material.map : null,
            onBeforeCompile: setupShader,
            customProgramCacheKey: () => {
                return `distortion_depth`
            }
        })

        material.onBeforeCompile = setupShader
        material.customProgramCacheKey = () => {
            return `distortion`
        }
    },
    "water": (_this, material, object, params) => {
        const {intensity, speed, other,other2, alt} = params;
        const {mDepth, mWidth, mHeight, yPos} = getSizesForShader(_this);

        const beginFragment = `uniform float time;
        uniform float mDepth;
        uniform float mWidth;
        uniform float mHeight;
        uniform float intensity;
        uniform float speed;
        uniform float other;
        uniform float alt;
        `
        const transformFragment = `float yDisplace = 0.0;
        if( position.y > 0.01 ) {
            float posX = position.x - mWidth ;
            float posZ = position.z - mHeight ;
            float timeSpeed = time * speed;
            float r = sqrt (posX*posX + posZ*posZ)*(intensity) + timeSpeed;
            yDisplace = (1.0 + sin(r) ) * other * mDepth;
            if( position.y + yDisplace <= 0.0 ) {
                yDisplace = 0.0;
            }
        }
        vec3 transformed = vec3( position.x, position.y + yDisplace, position.z);`

        const setUniforms = (shader) => {
            shader.uniforms.time = { value: 0.0 };
            shader.uniforms.mDepth = { value: mDepth*10 };
            shader.uniforms.mWidth = { value: mWidth };
            shader.uniforms.mHeight = { value: mHeight };
            shader.uniforms.intensity = { value: intensity*8.0 };
            shader.uniforms.speed = { value: speed*0.8 };
            shader.uniforms.other = { value: other*0.2 };
            shader.uniforms.alt = { value: alt ? 1.0 : 0.0 };
        }

        const setupShader = (shader) => {
            _this.shaders.push(shader);
            shader.vertexShader = beginFragment + shader.vertexShader.replace(`#include <begin_vertex>`, `#include <begin_vertex>\n` + transformFragment);
            setUniforms(shader);
        }

        object.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: material.alphaTest,
            map: material.alphaTest ? material.map : null,
            onBeforeCompile: setupShader,
            customProgramCacheKey: () => {
                return `water_depth`
            }
        })

        material.onBeforeCompile = setupShader
        material.customProgramCacheKey = () => {
            return `water`
        }
    },
    "triplanar": (_this, material, object, params) => {
        material.onBeforeCompile = (shader) => {
            shader.uniforms.scaler = { value: 0.1 * _this.textureRepeat };
            shader.uniforms.gamma = { value: 1 };
            shader.uniforms.roughnessAdjust = { value: 4*params.other2 };
            shader.vertexShader = shader.vertexShader.replace(
              '#define STANDARD',
              `
              #define STANDARD
              varying vec3 wNormal;
              varying vec3 vUvTri;
              `
            );
            shader.vertexShader = shader.vertexShader.replace(
              'void main() {',
              `
              void main() {
                vec4 worldPosition2 = modelMatrix * vec4( position, 1.0 );
                wNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
                vUvTri = worldPosition2.xyz;
              `
            );
          
            shader.fragmentShader = 
            `
               uniform float scaler;
               uniform float gamma;
               uniform float roughnessAdjust;
               varying vec3 vUvTri;
               varying vec3 wNormal;
               vec3 GetTriplanarWeights (vec3 normals) {
                  vec3 triW = abs(normals);
                  return triW / (triW.x + triW.y + triW.z);
                }
              struct TriplanarUV {
                vec2 x, y, z;
              };
              TriplanarUV GetTriplanarUV (vec3 pos) {
                  TriplanarUV  triUV;
                  triUV.x = pos.zy;
                  triUV.y = pos.xz;
                  triUV.z = pos.xy;
                  return triUV;
                }
               ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <map_fragment>',
              `
              #ifdef USE_MAP
                  vec3 xColor = texture2D(map, vUvTri.yz * scaler).rgb;
                  vec3 yColor = texture2D(map, vUvTri.xz * scaler).rgb;
                  vec3 zColor = texture2D(map, vUvTri.xy * scaler).rgb;
                  vec3 triW = GetTriplanarWeights(wNormal);
                  vec4 easedColor = vec4( xColor * triW.x + yColor * triW.y + zColor * triW.z, 1.0);
                  vec4 gammaCorrectedColor = vec4( pow(abs(easedColor.x),gamma), pow(abs(easedColor.y),gamma), pow(abs(easedColor.z),gamma), 1.0);
                  vec4 texelColor3 = mapTexelToLinear( gammaCorrectedColor );
                  diffuseColor *= texelColor3;
              #endif
              `
            );
          
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <roughnessmap_fragment>',
              `
              float roughnessFactor = roughness;
          
              #ifdef USE_ROUGHNESSMAP
      vec3 xColorR = texture2D(roughnessMap, vUvTri.yz * scaler).rgb;
      vec3 yColorR = texture2D(roughnessMap, vUvTri.xz * scaler).rgb;
      vec3 zColorR = texture2D(roughnessMap, vUvTri.xy * scaler).rgb;

      vec3 triWR = GetTriplanarWeights(wNormal);
      vec4 easedColorR = vec4( xColorR * triWR.x + yColorR * triWR.y + zColorR * triWR.z, 1.0);
      vec4 gammaCorrectedColorR = vec4( pow(abs(easedColorR.x),gamma), pow(abs(easedColorR.y),gamma), pow(abs(easedColorR.z),gamma), 1.0);
      vec4 texelColorR = mapTexelToLinear( gammaCorrectedColorR );
      roughnessFactor *= texelColorR.g * roughnessAdjust;
    #endif

    `
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `
    #ifdef OBJECTSPACE_NORMALMAP
        normal = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0; // overrides both flatShading and attribute normals
        #ifdef FLIP_SIDED
            normal = - normal;
        #endif
        #ifdef DOUBLE_SIDED
            normal = normal * ( float( gl_FrontFacing ) * 2.0 - 1.0 );
        #endif
        normal = normalize( normalMatrix * normal );
    #elif defined( TANGENTSPACE_NORMALMAP )
        TriplanarUV triUV = GetTriplanarUV(vUvTri);

        vec3 tangentNormalX = texture2D(normalMap, triUV.x * scaler).xyz;
        vec3 tangentNormalY = texture2D(normalMap, triUV.y * scaler).xyz;
        vec3 tangentNormalZ = texture2D(normalMap, triUV.z * scaler).xyz;

        vec3 worldNormalX = tangentNormalX.xyz;
        vec3 worldNormalY = tangentNormalY.xyz;
        vec3 worldNormalZ = tangentNormalZ;

        vec3 triWN = GetTriplanarWeights(wNormal);
        vec3 mapI = normalize(worldNormalX * triWN.x + worldNormalY * triWN.y + worldNormalZ * triWN.z);
        vec3 mapN = vec3(mapI.x, mapI.y, mapI.z);
        mapN.xy *= normalScale;
        #ifdef USE_TANGENT
            normal = normalize( vTBN * mapN );
        #else
            normal = perturbNormal2Arb( -vViewPosition, normal, mapN );
        #endif
    #elif defined( USE_BUMPMAP )
        normal = perturbNormalArb( -vViewPosition, normal, dHdxy_fwd() );
    #endif
    `
  )
};       
        material.customProgramCacheKey = () => {
            return `triplanar`
        }
    },
    "grid": (_this, material, object, params) => {
        const {intensity, speed, other,other2, alt} = params;
        const {mDepth, mWidth, mHeight, yPos} = getSizesForShader(_this);

        const beginFragment = `
        uniform float gridSize;
        uniform vec3 gridColor;
        uniform float gridAlpha;
        uniform float normalCulling;
        `

        const fragment = `
        #ifdef DITHERING
            gl_FragColor.rgb = dithering( gl_FragColor.rgb );
        #endif
        if( abs(normal.y) > normalCulling && (mod(vWorldPositionFoW.x, gridSize) < 0.0015 || mod(vWorldPositionFoW.z, gridSize) < 0.0015)){
            gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridAlpha);
        }
        `

        const setUniforms = (shader) => {
            shader.uniforms.time = { value: 0.0 };
            shader.uniforms.gridSize = { value: canvas.scene.dimensions.size/factor }
            shader.uniforms.gridColor = { value: new THREE.Color(canvas.scene.data.gridColor) }
            shader.uniforms.gridAlpha = { value: canvas.scene.data.gridAlpha }
            shader.uniforms.normalCulling = { value: intensity-0.01 }
        }
        const setupShader = (shader) => {
            _this.shaders.push(shader);
            shader.fragmentShader = beginFragment + shader.fragmentShader.replace(`#include <dithering_fragment>`, fragment);
            setUniforms(shader);
        }

        material.onBeforeCompile = setupShader
        material.customProgramCacheKey = () => {
            return `grid`
        }
    },
}

function getSizesForShader(_this){
    if(_this.isInstanced){
        return {
            mDepth : _this.instancedBBSize.y,
            mWidth : _this.instancedBBSize.x,
            mHeight : _this.instancedBBSize.z,
            yPos : _this.mesh.position.y - _this.instancedBBSize.y / 2
        }
    }else{
        return {
            mDepth : _this.bb.depth,
            mWidth : _this.bb.width,
            mHeight : _this.bb.height,
            yPos : _this.mesh.position.y - _this.bb.depth / 2
        }
    }
}