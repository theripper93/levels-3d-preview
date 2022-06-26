import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 
import { Ruler3D } from "./ruler3d.js";

export class Light3D {
    constructor(light,parent, isToken){
        this.light = light;
        this._parent = parent
        this.isToken = isToken;
        if(!this.isToken){
            this.embeddedName = this.light.document.documentName;
            this.draggable = true;
            this.placeable = this.light;
        }
        this.init();
    }

    init(){
        this.light3d = this.angle != 360 ? new THREE.SpotLight : new THREE.PointLight();
        if(this._parent.debugMode){
            this.debugSphere = new THREE.Mesh(
                new THREE.SphereGeometry(5, 32, 32),
                new THREE.MeshBasicMaterial({
                        opacity: 0.5,
                        transparent: true,
                        wireframe: true,
                    })
            );
        }
        this.mesh = new THREE.Group();
        const shadowRes = game.settings.get("levels-3d-preview", "shadowQuality")
        this.light3d.shadow.bias = -0.035;
        this.light3d.shadow.camera.near = 0.001;
        this.light3d.shadow.mapSize.width = 1024*shadowRes;
        this.light3d.shadow.mapSize.height = 1024*shadowRes;
        this.refresh();
        if(!this.isToken) {
            this.mesh.add(this.light3d);
            this._parent.scene.add(this.mesh);
            if(game.user.isGM) this.createHandle();
        }
        if(this._parent.debugMode){
            this._parent.scene.add(this.debugSphere);
        }
    }

    createHandle(){
        const texture = this._parent.textures.lightOn
        const size = canvas.scene.dimensions.size*0.7/factor
        const geometry = new THREE.BoxGeometry(size, size, size)
        const material = new THREE.MeshBasicMaterial({map: texture,})
        const mesh = new THREE.Mesh(geometry, material)
        this.mesh.userData.hitbox = mesh
        this.mesh.userData.interactive = true
        this.mesh.userData.entity3D = this
        mesh.userData.entity3D = this
        mesh.userData.isHitbox = true
        this.dragHandle = mesh
        this.mesh.add(mesh)
    }

    updateHandle(){
        if(!this.dragHandle) return;
        this.dragHandle.visible = canvas.lighting._active;
        if(!this.dragHandle.visible) return;
        this.dragHandle.material.map = this.light.data.hidden ? this._parent.textures.lightOff : this._parent.textures.lightOn;
        this.dragHandle.material.color.set(this.light.data.hidden ? '#ff0000' : '#ffffff');
    }

    updatePositionFrom3D(e){
        this.skipMoveAnimation = true;
        const useSnapped = Ruler3D.useSnapped();
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor;
        const y = z3d * factor;
        const z = Math.round(((y3d * factor * canvas.dimensions.distance)/(canvas.dimensions.size))*100)/100;
        const snapped = canvas.grid.getSnappedPosition(x, y);
        const {rangeTop, rangeBottom} = _levels.getFlagsForObject(this.light);
        const dest = {
          x: useSnapped ? snapped.x : x,
          y: useSnapped ? snapped.y : y,
          elevation: z,
        }
        const deltas = {
          x: dest.x - this.light.data.x,
          y: dest.y - this.light.data.y,
          elevation: dest.elevation - rangeBottom,
        }
        let updates = [];
        for(let light of canvas.activeLayer.controlled.length ? canvas.activeLayer.controlled : [this.light]){
        const lightFlags = _levels.getFlagsForObject(light);
          updates.push({
            _id: light.id,
            x: light.data.x + deltas.x,
            y: light.data.y + deltas.y,
            flags: {
                "levels-3d-preview": {
                    wasFreeMode: this.wasFreeMode,
                },
                levels: {
                    rangeBottom: Math.round((lightFlags.rangeBottom + deltas.elevation)*1000)/1000,
                    rangeTop: Math.round((lightFlags.rangeBottom + deltas.elevation)*1000)/1000
                }
            },
          })
        }
        canvas.scene.updateEmbeddedDocuments("AmbientLight", updates)
        return true;
      }

    refresh(){
        const light = this.light;
        if(this.dragHandle){
            this.dragHandle.position.set(0,0,0);
        }
        if(light.document.getFlag("levels-3d-preview", "castShadow") && game.settings.get("levels-3d-preview", "shadowQuality") > 0){
            this.light3d.shadow.autoUpdate = true;
            this.light3d.castShadow = true;
        }
        let top = light.data.flags.levels?.rangeTop ?? 1;
        let bottom = light.data.flags.levels?.rangeBottom ?? 1;
        const z = (top+bottom)*canvas.scene.dimensions.size/canvas.scene.dimensions.distance/2;
        this.z = (top+bottom)/2;
        const color = this.color || "#ffffff";
        const radius = Math.max(this.dim, this.bright)*(canvas.scene.dimensions.size/canvas.scene.dimensions.distance)/factor;
        const alpha = this.alpha*9;
        const decay = this.dim/(this.bright+10)*2;
        const position = {
            x: light.data.x/factor,
            y: z/factor,
            z: light.data.y/factor,
        }
        if(!this.isToken) {
            this.mesh.position.set(position.x, position.y, position.z);
        }
        this.light3d.color.set(color);
        this.light3d.distance = radius;
        this.light3d.decay = decay;
        this.light3d.intensity = alpha;
        this.light3d.shadow.camera.far = radius;
        if(this.angle != 360) {
            this.light3d.angle = Math.toRadians(this.angle)/2;
            const rotationy = -Math.toRadians(this.rotation);
            const distance = 1
            const lx = Math.sin(rotationy) * distance + position.x;
            const ly = position.y;
            const lz = Math.cos(rotationy) * distance + position.z;
            this.light3d.target.position.set(lx,ly,lz);
            this.light3d.target.updateMatrixWorld();
        }
        this.light3d.visible = !this.light.data.hidden
        //this.light3d.shadow.needsUpdate = true;
        if(this.light.document.getFlag("levels-3d-preview", "enableParticle")) this.initParticle();
        if(!this.debugSphere) return;
        this.debugSphere.geometry = new THREE.SphereGeometry(radius, 32, 32);
        this.debugSphere.position.set(position.x, position.y, position.z);
        this.debugSphere.material.color.set(color);
    }

    destroy(){
        this._parent.scene.remove(this.mesh);
        this._parent.scene.remove(this.debugSphere);
        if(this.particleEffectId) Particle3D.stop(this.particleEffectId);
    }

    initParticle(){
        if(this.particleEffectId) Particle3D.stop(this.particleEffectId);
        if(this.light.data.hidden && !this.light.document.getFlag("levels-3d-preview", "enableParticleHidden")) return;
        const particleData = this.getParticleData();
        this.particleEffect = new Particle3D("e");
        this.particleEffect.sprite(particleData.sprite)
            .scale(particleData.scale)
            .color(particleData.color.split(","), particleData.color2 ? particleData.color2.split(",") : undefined)
            .force(particleData.force)
            .gravity(particleData.gravity)
            .life(particleData.life)
            .rate(particleData.count, particleData.emitTime)
            .duration(Infinity)
            .mass(particleData.mass)
            .alpha(particleData.alphaStart, particleData.alphaEnd)
            .emitterSize(Math.max(this.dim, this.bright)/canvas.scene.dimensions.distance)
            .push(particleData.push.dx, particleData.push.dy, particleData.push.dz)
            .to({x: this.light.center.x, y: this.light.center.y, z: this.z})
        this.particleEffectId = this.particleEffect.start(false);
    }

    getParticleData(){
        return {
            sprite: this.light.document.getFlag("levels-3d-preview", "ParticleSprite") ?? "",
            scale: this.light.document.getFlag("levels-3d-preview", "ParticleScale") ?? 1,
            color: this.light.document.getFlag("levels-3d-preview", "ParticleColor") ?? "#ffffff",
            color2: this.light.document.getFlag("levels-3d-preview", "ParticleColor2"),
            force: this.light.document.getFlag("levels-3d-preview", "ParticleForce") ?? 0,
            gravity: this.light.document.getFlag("levels-3d-preview", "ParticleGravity") ?? 1,
            life: this.light.document.getFlag("levels-3d-preview", "ParticleLife") ?? 1000,
            count: this.light.document.getFlag("levels-3d-preview", "ParticleCount") ?? 5,
            emitTime: this.light.document.getFlag("levels-3d-preview", "ParticleEmitTime") ?? 1,
            mass: this.light.document.getFlag("levels-3d-preview", "ParticleMass") ?? 1000,
            alphaStart: this.light.document.getFlag("levels-3d-preview", "ParticleAlphaStart") ?? 0,
            alphaEnd: this.light.document.getFlag("levels-3d-preview", "ParticleAlphaEnd") ?? 1,
            push: {
                dx: this.light.document.getFlag("levels-3d-preview", "ParticlePushX") ?? 0,
                dy: this.light.document.getFlag("levels-3d-preview", "ParticlePushY") ?? 0,
                dz: this.light.document.getFlag("levels-3d-preview", "ParticlePushZ") ?? 0,
            }
        }
    }

    _onClickLeft(e){
        if(canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            }
            }
            this.light._onClickLeft(event);
    }


    _onClickLeft2(e){
        if(canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = {
            stopPropagation: () => {},
            data: {
                originalEvent: e,
            }
            }
            this.light._onClickLeft2(event);
    }

    _onClickRight(e){
        if(canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = {
            stopPropagation: () => {},
            data: {
              originalEvent: e,
            }
          }
          this.light._onClickRight(event);
    }

    _onClickRight2(e){
        if(canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        const event = {
            stopPropagation: () => {},
            data: {
              originalEvent: e,
            }
          }
          this.light._onClickRight2(event);
    }

    _onHoverIn(e) {
        if(canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        this.placeable._onHoverIn(e);
      }
  
    _onHoverOut(e) {
        if(canvas.activeLayer.options.objectClass.embeddedName !== "AmbientLight") return;
        this.placeable._onHoverOut(e);
    }

    get lightData(){
        return this.light.data.light ?? this.light.data.config
    }

    get dim(){
        return this.lightData.dim ?? this.light.data.dimLight;
    }

    get bright(){
        return this.lightData.bright ?? this.light.data.brightLight;
    }

    get alpha(){
        return this.lightData.alpha ?? this.light.data.lightAlpha;
    }

    get color(){
        return this.lightData.color ?? this.light.data.lightColor;
    }

    get angle(){
        return this.lightData.angle ?? this.light.data.lightAngle;
    }

    get rotation(){
        return this.lightData.rotation ?? this.light.data.rotation;
    }

}

//Hooks

Hooks.on("updateAmbientLight", (lightDocument) => {
    if(game.Levels3DPreview?._active) game.Levels3DPreview.lights.sceneLights[lightDocument.id]?.refresh();
})


Hooks.on("createAmbientLight", (lightDocument) => {
    if(game.Levels3DPreview?._active && lightDocument.object) game.Levels3DPreview.addLight(lightDocument.object);
})
  
Hooks.on("deleteAmbientLight", (lightDocument) => {
    if(game.Levels3DPreview?._active) game.Levels3DPreview.lights.sceneLights[lightDocument.id]?.destroy();
})