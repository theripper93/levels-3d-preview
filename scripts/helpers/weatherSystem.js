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
            case "heavyrain":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getHeavyRainPreset());
                break;
            case "snow":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getSnowPreset());
                break;
            case "hail":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getHailPreset());
                break;
            case "leaves":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getLeavesPreset());
                break;
            case "embers":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getEmbersPreset());
                break;
            case "mysteriouslights":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getMysteriousLightsPreset());
                break;
            case "stars":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getStarsPreset());
                break;
            case "dust":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getDustPreset());
                break;
            case "smoke":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getSmokePreset());
                break;
            case "toxic":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getToxicPreset());
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
        const blending = canvas.scene.getFlag("levels-3d-preview", "particleBlending") ? THREE.AdditiveBlending : THREE.NormalBlending;

        return { density, direction, color, size, speed, velocity, opacity, texture, randomRotation, randomScale, blending };
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

    static getDensityMultiplier(){
        return (canvas.scene.dimensions.sceneWidth*canvas.scene.dimensions.sceneHeight/(factor*factor))/9;
    }
}

class BasicDirectionalEffect {
    constructor(options){
        this.options = {...this.defaultOptions, ...options};
        this.options.density*=WeatherSystem.getDensityMultiplier();
        this.options.density = Math.min(this.options.density, 1000);
        //this.options.density = 4000;
        console.info("3D Canvas - Initializing Weather System: Particle Count (", Math.round(this.options.density*500), ")",this.options);
        this.BPG = new BasicParticleGeometry(500*this.options.density, this.options.randomRotation, this.options.randomScale, this.options.direction);
        this.init();
    }

    init(){
        this.object = new THREE.Group();
        this.object.position.set(canvas.scene.dimensions.paddingX/factor,0,canvas.scene.dimensions.paddingY/factor);
        this.object.userData.ignoreHover = true;
        this.material = this._getMaterial();
        const effect = new THREE.Points(this.BPG.geometry,this.material);
        this.randomizer = new Randomizer(this.options.density*5000);
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
            pColor: {
                value: new THREE.Color(this.options.color)
            },
            pOpacity: {
                value: this.options.opacity
            },
          }
        const rainMaterial = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: rain_VS,
            fragmentShader: rain_FS,
            blending: this.options.blending ?? THREE.NormalBlending,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            vertexColors: true,
        });
        return rainMaterial;
    }

    animate(){

        const positions = this.BPG.geometry.attributes.position.array;
        const velocityes = this.BPG.geometry.attributes.velocity.array;
        const randomVelocityMulti = this.BPG.geometry.attributes.randomVelocityMulti.array;
        const bb = this.BPG.boundingBox;

        const velocity = this.options.velocity;
        const speed = this.options.speed;
        const direction = this.options.direction;
        const directionCos = Math.cos(direction);
        const directionSin = Math.sin(direction);


        let i = 0;
        let length = positions.length;
        while(i < length){
                velocityes[i/3] -= speed + randomVelocityMulti[i/3] * velocity;
                positions[i] += velocityes[i/3] * directionCos;
                positions[i+1] += velocityes[i/3] * directionSin;
    

                if(positions[i] < 0 || positions[i] > bb.x ){
                    positions[i] = this.randomizer.get() * bb.x;
                    positions[i+1] = this.randomizer.get() * bb.y;
                    velocityes[i/3] = 0;
                }
                if(positions[i+1] < 0 || positions[i+1] > bb.y ){
                    positions[i] = this.randomizer.get() * bb.x;
                    positions[i+1] = this.randomizer.get() * bb.y;
                    velocityes[i/3] = 0;
                }
                i+=3;
            }

        this.BPG.geometry.attributes.position.needsUpdate = true;
    }

    _detectExit(direction,bb){
        if(direction < Math.PI*5/4 && direction > Math.PI/4){
            return [1,bb.y];
        }
        if(direction < 2*Math.PI-Math.PI*3/4 && direction > Math.PI/2+Math.PI/4){
            return [1,0];
        }
        if(direction > Math.PI/4 && direction < Math.PI/2+Math.PI/4){
            return [0,bb.x];
        }else{
            return [0,0];
        }
    }

    _exitZero(pos){
        return pos > this.exit;
    }

    _exitMax(pos){
        return pos < 0;
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
            canvas.scene.dimensions.sceneWidth/factor,
            Math.min(canvas.scene.dimensions.sceneWidth/factor, canvas.scene.dimensions.sceneHeight/factor)/2,
            canvas.scene.dimensions.sceneHeight/factor
        );
        this.createGeometry();
    }

    createGeometry(){

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.count * 3);
        const velocity = new Float32Array(this.count);
        const randomVelocityMulti = new Float32Array(this.count);
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
            randomVelocityMulti[i] = Math.random();

        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocity, 1));
        geometry.setAttribute('randomSize', new THREE.BufferAttribute(randomSize, 1));
        geometry.setAttribute('randomRot', new THREE.BufferAttribute(randomRot, 2));
        geometry.setAttribute('randomVelocityMulti', new THREE.BufferAttribute(randomVelocityMulti, 1));
        this.geometry = geometry;

    }
}

class WeatherPresets{
    static getRainPreset(){
        return {
            density: 10,
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
    static getHeavyRainPreset(){
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
    static getHailPreset(){
        return {
            density: 200,
            size: 0.0075,
            color: "#ffffff",
            opacity: 1,
            velocity: 0.00007,
            direction: 1.7453292519943295,
            speed: 0.00001,
            randomRotation: true,
            randomScale: true,
            texture: 'modules/levels-3d-preview/assets/particles/emberssmall.png',
            blending: THREE.AdditiveBlending,
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
    static getEmbersPreset(){
        return {
            density: 10,
            size: 0.0075,
            color: "#ff3700",
            opacity: 1,
            velocity: 0,
            direction: Math.PI,
            speed: 0.0000001,
            randomRotation: true,
            randomScale: true,
            texture: 'modules/levels-3d-preview/assets/particles/emberssmall.png',
            blending: THREE.AdditiveBlending,
        }
    }
    static getMysteriousLightsPreset(){
        return {
            density: 5,
            size: 0.0200,
            color: "#0084ff",
            opacity: 1,
            velocity: 0,
            direction: Math.PI*3/2,
            speed: 0.0000001,
            randomRotation: true,
            randomScale: true,
            texture: 'modules/levels-3d-preview/assets/particles/emberssmall.png',
            blending: THREE.AdditiveBlending,
        }
    }
    static getStarsPreset(){
        return {
            density: 5,
            size: 0.0200,
            color: "#ffff80",
            opacity: 0.7,
            velocity: 0,
            direction: Math.PI*2.5/2,
            speed: 0.00000005,
            randomRotation: true,
            randomScale: true,
            texture: 'modules/levels-3d-preview/assets/particles/stars.png',
            blending: THREE.AdditiveBlending,
        }
    }
    static getDustPreset(){
        return {
            density: 100,
            size: 0.175,
            color: "#5e461b",
            opacity: 0.05,
            velocity: 0,
            direction: Math.PI,
            speed: 0.0000005,
            randomRotation: true,
            randomScale: true,
            texture: 'modules/levels-3d-preview/assets/particles/dust.png',
            blending: THREE.NormalBlending,
        }
    }
    static getSmokePreset(){
        return {
            density: 200,
            size: 0.075,
            color: "#0d0d0d",
            opacity: 0.05,
            velocity: 0,
            direction: Math.PI*3/2,
            speed: 0.0000005,
            randomRotation: true,
            randomScale: true,
            texture: 'modules/levels-3d-preview/assets/particles/dust.png',
            blending: THREE.NormalBlending,
        }
    }
    static getToxicPreset(){
        return {
            density: 10,
            size: 0.275,
            color: "#21451c",
            opacity: 0.1,
            velocity: 0,
            direction: Math.PI,
            speed: 0.0000001,
            randomRotation: true,
            randomScale: true,
            texture: 'modules/levels-3d-preview/assets/particles/dust.png',
            blending: THREE.NormalBlending,
        }
    }
}


const rain_FS = `
uniform sampler2D diffuseTexture;
uniform vec3 pColor;
uniform float pOpacity;
varying vec4 vColour;
varying vec2 vAngle;
varying vec2 vUv;
void main() {
  vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
  vec4 diffuse = texture2D(diffuseTexture, coords);
  if ( diffuse.a < 0.01 ) discard;
  vec4 pColor4 = vec4(pColor, pOpacity);
  gl_FragColor = diffuse * pColor4;
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



class Randomizer{

    constructor(length){
        this.length = length;
        this.numbers = new Float32Array(this.length);
        this.index = 0;
        while(this.index < this.length){
            this.numbers[this.index] = Math.random();
            this.index++;
        }
        this.index = 0;
    }

    get(){
        if(this.index >= this.length) this.index = 0;
        return this.numbers[this.index++];
    }

}