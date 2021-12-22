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
                this.particleSystem = new BasicDirectionalEffect(options);
                break;
            case "rain":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getRainPreset());
                break;
            case "snow":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getSnowPreset());
                break;
            case "leaves":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getLeavesPreset());
                break;
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
        const randomRotation = canvas.scene.getFlag("levels-3d-preview", "particleRandomRotation") ?? false;
        const randomScale = canvas.scene.getFlag("levels-3d-preview", "particleRandomScale") ?? true;

        return { density, direction, color, size, speed, velocity, opacity, texture, randomRotation, randomScale };
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

class BasicDirectionalEffect {
    constructor(options){
        this.options = {...this.defaultOptions, ...options};
        this.BPG = new BasicParticleGeometry(500*this.options.density, this.options.randomRotation, this.options.randomScale, this.options.direction);
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
        return this._getShaderMaterial();
    }

    _getPointsMaterial(){
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
            onBeforeCompile: (shader)=>{
                if(this.options.randomScale){
                shader.vertexShader = "attribute float randomSize;" + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace("gl_PointSize = size;", "gl_PointSize = size*randomSize;");
                }
            }
          });
          return rainMaterial;
    }

    _getShaderMaterial(){
        const uniforms = {
            diffuseTexture: {
                value: new THREE.TextureLoader().load(this.options.texture)
            },
            baseSize: {
                value: this.options.size*1000
            },
          }
        const rainMaterial = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: rain_VS,
            fragmentShader: rain_FS,
            blending: THREE.NormalBlending,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            vertexColors: true
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
            randomRotation: false,
            randomScale: true,
        }
    }
}

class BasicParticleGeometry{
    constructor(count = 1000, randomRotation = false, randomScale = false, direction = 0){
        this.count = count;
        this.randomRotation = randomRotation;
        this.randomScale = randomScale;
        this.direction = direction;
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
        const randomSize = new Float32Array(this.count);
        const randomRot = new Float32Array(this.count * 2);
        for(let i=0;i<this.count;i++) {
            positions[i * 3] = Math.random() * this.boundingBox.x;
            positions[i * 3 + 1] = Math.random() * this.boundingBox.y;
            positions[i * 3 + 2] = Math.random() * this.boundingBox.z;
            velocity[i] = 0;
            randomSize[i] = this.randomScale ? Math.random()*2+0.5 : 1;
            const rotation = this.randomRotation ? Math.random()*Math.PI*2 : Math.PI - this.direction;
            randomRot[i*2] = Math.cos(rotation);
            randomRot[i*2+1] = Math.sin(rotation);
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocity, 1));
        geometry.setAttribute('randomSize', new THREE.BufferAttribute(randomSize, 1));
        geometry.setAttribute('randomRot', new THREE.BufferAttribute(randomRot, 2));
        this.geometry = geometry;

    }
}

class WeatherPresets{
    static getRainPreset(){
        return {
            density: 200,
            size: 0.0075,
            color: 0xaaaaaa,
            opacity: 1,
            velocity: 0.00007,
            direction: 1.7453292519943295,
            speed: 0.00075,
            randomRotation: false,
            randomScale: true,
            texture: 'ui/particles/rain.png'
        }
    }
    static getSnowPreset(){
        return {
            density: 10,
            size: 0.0075,
            color: "#ffffff",
            opacity: 1,
            velocity: 0,
            direction: 1.7453292519943295,
            speed: 0.00001,
            randomRotation: true,
            randomScale: true,
            texture: 'ui/particles/snow.png'
        } 
    }
    static getLeavesPreset(){
        return {
            density: 10,
            size: 0.0075,
            color: "#ffffff",
            opacity: 1,
            velocity: 0,
            direction: 2.530727415391778,
            speed: 0.000001,
            randomRotation: true,
            randomScale: true,
            texture: 'ui/particles/leaf1.png'
        } 
    }
}


const rain_FS = `
uniform sampler2D diffuseTexture;
varying vec4 vColour;
varying vec2 vAngle;
varying vec2 vUv;
void main() {
  vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
  vec4 diffuse = texture2D(diffuseTexture, coords);
  if ( diffuse.r < 0.1 ) discard;
  gl_FragColor = diffuse;
}
`
const rain_VS = `
attribute float randomSize;
attribute vec2 randomRot;
varying vec2 vUv;
uniform float baseSize;
attribute vec4 colour;
varying vec4 vColour;
varying vec2 vAngle;
void main() {
    vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = baseSize * randomSize / gl_Position.w;
  vAngle = randomRot;
  vColour = colour;
}
`