import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';


export class WeatherSystem {
    constructor(parent){
        this._parent = parent;
        this.init();
    }

    init(){
        const weather = canvas.scene.getFlag("levels-3d-preview", "particlePreset") //read flag
        if(!weather || weather == "none") return this._active = false;
        this._active = true;
        const options = this._getOptions();
        switch(weather){
            case "custom":
                this.particleSystem = new RainEffect(options);
        }
        this._parent.scene.add(this.particleSystem.object);
    }

    _getOptions(){
        const density = canvas.scene.getFlag("levels-3d-preview", "particleDensity") ?? 100;
        const direction = Math.toRadians(canvas.scene.getFlag("levels-3d-preview", "particleDirection") ?? 90);
        const color = canvas.scene.getFlag("levels-3d-preview", "particleColor") ?? "#ffffff";
        const size = 0.1*(canvas.scene.getFlag("levels-3d-preview", "particleSize") ?? 20)/factor;
        const speed = 0.01*(canvas.scene.getFlag("levels-3d-preview", "particleSpeed") ?? 5)/factor;
        const velocity = 0.01*(canvas.scene.getFlag("levels-3d-preview", "particleVelocity") ?? 1)/factor;
        const opacity = canvas.scene.getFlag("levels-3d-preview", "particleOpacity") ?? 0.5;
        const texture = canvas.scene.getFlag("levels-3d-preview", "particleTexture");

        return { density, direction, color, size, speed, velocity, opacity, texture };
    }

    update(){
        if(!this._active) return;
        this.particleSystem.animate();
    }

    destroy(){
        if(!this.particleSystem) return;
        this._parent.scene.remove(this.particleSystem.object);
    }

    reload(){
        this.destroy();
        this.init();
    }
}

class RainEffect {
    constructor(options){
        this.options = {...this.defaultOptions, ...options};
        this.BPG = new BasicParticleGeometry(500*this.options.density);
        this.init();
    }

    init(){
        this.object = new THREE.Group();
        this.object.userData.ignoreHover = true;
        this.material = this._getMaterial();
        const effect = new THREE.Points(this.BPG.geometry,this.material);
        this.object.add(effect);
    }

    _getMaterial(){
        const rotation = this.options.direction;
        const rainMaterial = new THREE.PointsMaterial({
            color: this.options.color,
            size: this.options.size,
            opacity: this.options.opacity,
            transparent: true,
            map: this.options.texture ? new THREE.TextureLoader().load(this.options.texture, (t)=>{
                //set rotation
                //t.rotation = rotation;

            }) : null,
            alphaTest: 0.1,
          });
        return rainMaterial;
    }

    animate(){

        const positions = this.BPG.geometry.attributes.position.array;
        const velocityes = this.BPG.geometry.attributes.velocity.array;
        const bb = this.BPG.boundingBox;

        const velocity = this.options.velocity;
        const speed = this.options.speed;
        const direction = this.options.direction;


        for(let i = 0; i < positions.length; i+=3){
            
            velocityes[i/3] -= speed + Math.random() * velocity;
            positions[i] += velocityes[i/3] * Math.cos(direction);
            positions[i+1] += velocityes[i/3] * Math.sin(direction);
            //positions[i+2] += velocityes[i/3] * Math.sin(direction);

            if(positions[i] < 0 || positions[i] > bb.x ){
                positions[i] = Math.random() * bb.x;
                velocityes[i/3] = 0;
            }
            if(positions[i+1] < 0 || positions[i+1] > bb.y ){
                positions[i+1] = Math.random() * bb.y;
                velocityes[i/3] = 0;
            }
            if(positions[i+2] < 0 || positions[i+2] > bb.z ){
                positions[i+2] = Math.random() * bb.z;
                velocityes[i/3] = 0;
            }
            

        }

        this.BPG.geometry.attributes.position.needsUpdate = true;
    }


    get defaultOptions(){
        return {
            density: 1,
            size: 0.008,
            color: 0xaaaaaa,
            opacity: 1,
            velocity: 0.0001,
            direction: 0,
            speed: 0.0001,
        }
    }
}

class BasicParticleGeometry{
    constructor(count = 1000){
        this.count = count;
        this.boundingBox = new THREE.Vector3(
            canvas.scene.dimensions.width/factor,
            1,
            canvas.scene.dimensions.height/factor
        );
        this.createGeometry();
    }

    createGeometry(){

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.count * 3);
        const velocity = new Float32Array(this.count);
        for(let i=0;i<this.count;i++) {
            positions[i * 3] = Math.random() * this.boundingBox.x;
            positions[i * 3 + 1] = Math.random() * this.boundingBox.y;
            positions[i * 3 + 2] = Math.random() * this.boundingBox.z;
            velocity[i] = 0;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocity, 1));
        this.geometry = geometry;

    }
}