import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 

export class Light3D {
    constructor(light,parent){
        this.light = light;
        this._parent = parent
        this.init();
    }

    init(){
        this.light3d = new THREE.PointLight();
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
        console.log(this.debugSphere)
        this.light3d.shadow.bias = -0.035;
        this.light3d.shadow.camera.near = 0.0001;
        this.light3d.shadow.camera.far = 100;
        this.light3d.shadow.camera.near = 0.001;
        this.light3d.shadow.mapSize.width = 512;
        this.light3d.shadow.mapSize.height = 512;
        this.refresh();
        this._parent.scene.add(this.light3d);
        if(this._parent.debugMode){
            this._parent.scene.add(this.debugSphere);
        }
    }

    refresh(){
        const light = this.light;
        this.light3d.castShadow = light.document.getFlag("levels-3d-preview", "castShadows") ?? false;
        let top = light.document.getFlag("levels", "rangeTop") ?? 0;
        let bottom = light.document.getFlag("levels", "rangeBottom") ?? 0;
        const z = (top+bottom)*canvas.scene.dimensions.size/canvas.scene.dimensions.distance/2;
        const color = light.data.tintColor || "#ffffff";
        const radius = Math.max(light.data.dim, light.data.bright)*(canvas.scene.dimensions.size/canvas.scene.dimensions.distance)/factor;
        const alpha = light.data.tintAlpha*6;
        const decay = light.data.dim/(light.data.bright+10)/2;
        const position = {
            x: light.data.x/factor,
            y: z/factor,
            z: light.data.y/factor,
        }
        this.light3d.position.set(position.x, position.y, position.z);
        this.light3d.color.set(color);
        this.light3d.distance = radius;
        this.light3d.decay = decay;
        this.light3d.intensity = alpha;
        if(!this.debugSphere) return;
        this.debugSphere.geometry = new THREE.SphereGeometry(radius, 32, 32);
        this.debugSphere.position.set(position.x, position.y, position.z);
        this.debugSphere.material.color.set(color);
    }

    destroy(){
        this._parent.scene.remove(this.light3d);
        this._parent.scene.remove(this.debugSphere);
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