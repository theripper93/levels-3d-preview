import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 

export class Light3D {
    constructor(light,parent, isToken){
        this.light = light;
        this._parent = parent
        this.isToken = isToken;
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
        this.light3d.shadow.bias = -0.035;
        this.light3d.shadow.camera.near = 0.0001;
        this.light3d.shadow.camera.far = 100;
        this.light3d.shadow.camera.near = 0.001;
        this.light3d.shadow.mapSize.width = 512;
        this.light3d.shadow.mapSize.height = 512;
        this.refresh();
        if(!this.isToken) this._parent.scene.add(this.light3d);
        if(this._parent.debugMode){
            this._parent.scene.add(this.debugSphere);
        }
    }

    refresh(){
        const light = this.light;
        this.light3d.castShadow = light.document.getFlag("levels-3d-preview", "castShadows") ?? false;
        let top = light.data.flags.levels?.rangeTop ?? 1;
        let bottom = light.data.flags.levels?.rangeBottom ?? 1;
        const z = (top+bottom)*canvas.scene.dimensions.size/canvas.scene.dimensions.distance/2;
        const color = this.color || "#ffffff";
        const radius = Math.max(this.dim, this.bright)*(canvas.scene.dimensions.size/canvas.scene.dimensions.distance)/factor;
        const alpha = this.alpha*6;
        const decay = this.dim/(this.bright+10)*2;
        const position = {
            x: light.data.x/factor,
            y: z/factor,
            z: light.data.y/factor,
        }
        if(!this.isToken) this.light3d.position.set(position.x, position.y, position.z);
        this.light3d.color.set(color);
        this.light3d.distance = radius;
        this.light3d.decay = decay;
        this.light3d.intensity = alpha;
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
        if(!this.debugSphere) return;
        this.debugSphere.geometry = new THREE.SphereGeometry(radius, 32, 32);
        this.debugSphere.position.set(position.x, position.y, position.z);
        this.debugSphere.material.color.set(color);
    }

    destroy(){
        this._parent.scene.remove(this.light3d);
        this._parent.scene.remove(this.debugSphere);
    }

    get dim(){
        return this.light.data.dim ?? this.light.data.dimLight;
    }

    get bright(){
        return this.light.data.bright ?? this.light.data.brightLight;
    }

    get alpha(){
        return this.light.data.tintAlpha ?? this.light.data.lightAlpha;
    }

    get color(){
        return this.light.data.tintColor ?? this.light.data.lightColor;
    }

    get angle(){
        return this.light.data.angle ?? this.light.data.lightAngle;
    }

    get rotation(){
        return this.light.data.rotation;
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