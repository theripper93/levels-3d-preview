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
        if(this._parent.debug){
            this.debugSphere = new THREE.Mesh(
                new THREE.SphereGeometry(0, 32, 32),
                new THREE.MeshBasicMaterial({
                        opacity: 0.5,
                    })
            );
        }
        this.refresh();
        this._parent.scene.add(this.light3d);
        if(this._parent.debug){
            this._parent.scene.add(this.debugSphere);
        }
    }

    refresh(){
        const light = this.light;
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
        this.debugSphere.position.set(position.x, position.y, position.z);
        this.debugSphere.geometry.radius = radius;
        this.debugSphere.geometry.needsUpdate = true;
        this.debugSphere.material.color.set(color);
    }

    destroy(){
        this._parent.scene.remove(this.light3d);
        this._parent.scene.remove(this.debugSphere);
    }
}