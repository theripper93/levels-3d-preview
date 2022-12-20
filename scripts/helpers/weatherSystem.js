import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';


export class WeatherSystem {
    constructor(parent){
        this._parent = parent;
        this.effects = [];
        this.init(canvas.scene.getFlag("levels-3d-preview", "particlePreset"));
    }

    init(){
        this.effects = [];
        if(!game.settings.get("levels-3d-preview", "enableEffects")) return;
        this.initWeather(canvas.scene.getFlag("levels-3d-preview", "particlePreset"));
        this.initWeather(canvas.scene.getFlag("levels-3d-preview", "particlePreset2"));
        const customPresets = canvas.scene.getFlag("levels-3d-preview", "particlePresetCustom");
        if(customPresets){
            customPresets.forEach(preset => this.initWeather("custom", preset));
        }
    }

    initWeather(weather, cOptions){
        if(!weather || weather == "none") return //this._active = false;
        //this._active = true;
        const options = cOptions ?? this._getOptions();
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
            case "starfall":
                this.particleSystem = new BasicDirectionalEffect(WeatherPresets.getStarFallPreset());
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
        this.effects.push(this.particleSystem);
        this.particleSystem = null;
    }

    _getOptions(){
        const density = canvas.scene.getFlag("levels-3d-preview", "particleDensity") ?? 100;
        const direction = Math.toRadians(canvas.scene.getFlag("levels-3d-preview", "particleDirection") ?? 90);
        const color = canvas.scene.getFlag("levels-3d-preview", "particleColor") ?? "#ffffff";
        const size = 0.1*(canvas.scene.getFlag("levels-3d-preview", "particleSize") ?? 20)/factor;
        const speed = 0.1*(canvas.scene.getFlag("levels-3d-preview", "particleSpeed") ?? 5)/factor;
        const velocity = 0.01*(canvas.scene.getFlag("levels-3d-preview", "particleVelocity") ?? 1)/factor;
        const opacity = canvas.scene.getFlag("levels-3d-preview", "particleOpacity") ?? 0.5;
        const texture = canvas.scene.getFlag("levels-3d-preview", "particleTexture");
        const randomRotation = canvas.scene.getFlag("levels-3d-preview", "particleRandomRotation") ?? false;
        const randomScale = canvas.scene.getFlag("levels-3d-preview", "particleRandomScale") ?? true;
        const blending = canvas.scene.getFlag("levels-3d-preview", "particleBlending") ? THREE.AdditiveBlending : THREE.NormalBlending;
        const rotationSpeed = Math.toRadians((canvas.scene.getFlag("levels-3d-preview", "particleRotationspeed") ?? 0)/5);

        return { density, direction, color, size, speed, velocity, opacity, texture, randomRotation, randomScale, blending, rotationSpeed };
    }

    update(delta){
        //if(!this._active) return;
        this.effects.forEach(e => e.animate(delta));
    }

    destroy(){
        //if(!this.particleSystem) return;
        this.effects.forEach((e) => {
            this._parent.scene.remove(e.object)
            e.object.children[0].geometry.dispose();
            e.object.children[0].material.dispose();
        });
    }

    reload(){
        this.destroy();
        this.init();
    }

    static getDensityMultiplier(){
        return (canvas.scene.dimensions.sceneWidth*canvas.scene.dimensions.sceneHeight/(factor*factor))/9;
    }

    toMacro(){
        const config = {
            "particlePreset": "custom",
            "particleDensity": canvas.scene.getFlag("levels-3d-preview", "particleDensity"),
            "particleDirection": canvas.scene.getFlag("levels-3d-preview", "particleDirection"),
            "particleColor": canvas.scene.getFlag("levels-3d-preview", "particleColor"),
            "particleSize": canvas.scene.getFlag("levels-3d-preview", "particleSize"),
            "particleSpeed": canvas.scene.getFlag("levels-3d-preview", "particleSpeed"),
            "particleVelocity": canvas.scene.getFlag("levels-3d-preview", "particleVelocity"),
            "particleOpacity": canvas.scene.getFlag("levels-3d-preview", "particleOpacity"),
            "particleTexture": canvas.scene.getFlag("levels-3d-preview", "particleTexture"),
            "particleRandomRotation": canvas.scene.getFlag("levels-3d-preview", "particleRandomRotation"),
            "particleRandomScale": canvas.scene.getFlag("levels-3d-preview", "particleRandomScale"),
            "particleBlending": canvas.scene.getFlag("levels-3d-preview", "particleBlending"),
            "particleRotationspeed": canvas.scene.getFlag("levels-3d-preview", "particleRotationspeed")
        }
        //createMacro();

        new Dialog({
            title: game.i18n.localize("levels3dpreview.macrodialog.title"),
            content: `<form id="document-create"><div class="form-group">
            <label> ${game.i18n.localize("levels3dpreview.macrodialog.label")}</label>
            <div class="form-fields">
                <input type="text" name="macroname" placeholder="${game.i18n.localize("levels3dpreview.macrodialog.placeholder")}" required="">
            </div>
        </div></form>`,
            buttons: {
                export: {
                    label: `<i class="far fa-save"></i> ` + game.i18n.localize("levels3dpreview.macrodialog.export"),
                    callback: (html) => {
                        const macroname = html.find("input[name='macroname']").val();
                        if(macroname) createMacro(macroname);
                    }
                },
                cancel: {
                    label: `<i class="fas fa-times"></i> ` + game.i18n.localize("levels3dpreview.macrodialog.cancel"),
                    callback: () => { }
                },
            },
            default: "cancel",
          }).render(true);

        function createMacro(name){
            let script = `canvas.scene.update({ flags: { "levels-3d-preview" : #flagData} })`
            script = script.replace("#flagData", JSON.stringify(config));            
            Macro.create({
                name: name,
                command: script,
                type: "script",
                img: "icons/magic/air/weather-clouds-rainbow.webp"
            })
        }
    }
}

class BasicDirectionalEffect {
    constructor(options){
        this.options = {...this.defaultOptions, ...options};
        this.options.density*=WeatherSystem.getDensityMultiplier();
        this.options.density = Math.min(this.options.density, 1000);
        //this.options.density = 4000;
        this.boundsCounter = 1;
        this.boundsCounter2 = -1;
        this.frameCounter = 0;
        this.frameThrottle = 8;
        console.log(`%c3D Canvas\nInitializing Weather System\nParticle Count (${Math.round(this.options.density*500)})`,'color: #f5a742; font-size: 1.8em;');
        console.table(this.options);
        this.BPG = new BasicParticleGeometry(500*this.options.density, this.options.randomRotation, this.options.randomScale, this.options.direction, this.options.texture, this.options.color, this.options.velocity);
        this.init();
    }

    async init(){
        this.detectAnimFn(this.options.direction)
        this.object = new THREE.Group();
        this.object.position.set(canvas.scene.dimensions.sceneX/factor,0,canvas.scene.dimensions.sceneY/factor);
        this.object.userData.ignoreHover = true;
        this.textures = await this._loadTextures();
        this.material = this._getMaterial();
        const effect = new THREE.Points(this.BPG.geometry,this.material);
        this.randomizer = game.Levels3DPreview.randomizer;
        this.object.add(effect);
        this._ready = true;
    }

    detectAnimFn(d){
        const direction = this._detectBounds(d);
        switch(direction){
            case "bl":
                this.animate = this.animateBl;
                break;
            case "br":
                this.animate = this.animateBr;
                break;
            case "tl":
                this.animate = this.animateTl;
                break;
            case "tr":
                this.animate = this.animateTr;
                break;
        }

    }

    async _loadTextures(){
        const textures = [];
        const texturePaths = this.options.texture.split(",").map(t => t.trim());
        for(let tex of texturePaths){
            const texture = await game.Levels3DPreview.helpers.loadTexture(tex)
            textures.push(texture);
        }
        return textures;
    }

    _loadTexturesold(){
        const textures = [];
        const texturePaths = this.options.texture.split(",").map(t => t.trim());
        for(let tex of texturePaths){
            textures.push(new THREE.TextureLoader().load(tex));
        }
        return textures;
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
            map: this.options.texture ? new THREE.TextureLoader().load(this.options.texture) : null,
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
                value: this.textures
            },
            baseSize: {
                value: this.options.size*1000
            },
            pOpacity: {
                value: this.options.opacity
            },
            texCount: {
                value: this.textures.length
            },
            rotationOffset: {
                value: 0.0
            },
          }
        const rainMaterial = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: rain_VS,
            fragmentShader: this._generateShader(),
            blending: this.options.blending ?? THREE.NormalBlending,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            vertexColors: true,
        });
        return rainMaterial;
    }

    _generateShader(){
        let baseShader = rain_FS
        baseShader = baseShader.replace("uniform sampler2D diffuseTexture[16];", `uniform sampler2D diffuseTexture[${this.textures.length}];`);
        let ifBlock = `if(texIndex <= 0.5){
            diffuse = texture2D(diffuseTexture[0], coords);
            }`;
        for(let i = 1; i < this.textures.length; i++){
            ifBlock += `else if(texIndex <= ${i+0.5}){
                diffuse = texture2D(diffuseTexture[${i}], coords);
            }`;
        }
        baseShader = baseShader.replace("#ifBlockHere", ifBlock);
        return baseShader;
    }

    getAnimationData(){
        const positions = this.BPG.geometry.attributes.position.array;
        const velocityes = this.BPG.geometry.attributes.velocity.array;
        const randomVelocityMulti = this.BPG.geometry.attributes.randomVelocityMulti.array;
        const bb = this.BPG.boundingBox;
        const velocity = this.options.velocity;
        const speed = this.options.speed;
        const direction = this.options.direction;
        const directionCos = Math.cos(direction);
        const directionSin = Math.sin(direction);
        const newRot = (this.material.uniforms.rotationOffset.value + this.options.rotationSpeed)%(Math.PI*2);
        return { positions, velocityes, randomVelocityMulti, bb, velocity, speed, direction, directionCos, directionSin, newRot };
    }

    animate(){}

    animateBl(delta){
        if(!this._ready) return;
        if(delta >0.25) return;
        const dT = delta/0.016 === Infinity ? 0.016 : delta/0.016;
        let { positions, velocityes, randomVelocityMulti, bb, velocity, speed, direction, directionCos, directionSin, newRot } = this.getAnimationData();
        velocity*=dT;
        directionCos*=dT;
        directionSin*=dT;
        this.frameCounter++;
        if(this.frameCounter > this.frameThrottle) this.frameCounter = 0;
        let i = 0;
        let length = positions.length;
        this.material.uniforms.rotationOffset.value = newRot;
        if(this.frameCounter > this.frameThrottle-2){
            this.boundsCounter*=-1
        }

        if(this.frameCounter < this.frameThrottle-2){
            while(i < length){
                velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                positions[i] += (-speed + velocityes[i/3]) * directionCos;
                positions[i+1] += (-speed + velocityes[i/3]) * directionSin;

                i+=3;
            }
            this.BPG.geometry.attributes.position.needsUpdate = true;
            return;
        }

        if(this.boundsCounter > 0){
            while(i < length){
                if(positions[i] < 0){
                    positions[i] = bb.x;
                    velocityes[i/3] = 0;
                }else{
                    velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                    positions[i] += (-speed + velocityes[i/3]) * directionCos;
                    positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
                }
                i+=3;
            }
        }else{
            while(i < length){
                if(positions[i+1] < 0 ){
                    positions[i+1] = bb.y;
                    velocityes[i/3] = 0;
                }else{
                    velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                    positions[i] += (-speed + velocityes[i/3]) * directionCos;
                    positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
                }

    

                i+=3;
            }
        }

        this.BPG.geometry.attributes.position.needsUpdate = true;

    }

    animateBr(delta){
        if(!this._ready) return;
        if(delta >0.25) return;
        const dT = delta/0.016;
        let { positions, velocityes, randomVelocityMulti, bb, velocity, speed, direction, directionCos, directionSin, newRot } = this.getAnimationData();
        velocity*=dT;
        directionCos*=dT;
        directionSin*=dT;
        this.frameCounter++;
        if(this.frameCounter > this.frameThrottle) this.frameCounter = 0;
        let i = 0;
        let length = positions.length;
        this.material.uniforms.rotationOffset.value = newRot;
        if(this.frameCounter > this.frameThrottle-2){
            this.boundsCounter*=-1
        }

        if(this.frameCounter < this.frameThrottle-2){
            while(i < length){
                velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                positions[i] += (-speed + velocityes[i/3]) * directionCos;
                positions[i+1] += (-speed + velocityes[i/3]) * directionSin;

                i+=3;
            }
            this.BPG.geometry.attributes.position.needsUpdate = true;
            return;
        }

        if(this.boundsCounter > 0){
            while(i < length){
                if(positions[i] > bb.x){
                    positions[i] = 0;
                    velocityes[i/3] = 0;
                }else{
                    velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                    positions[i] += (-speed + velocityes[i/3]) * directionCos;
                    positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
                }

    

                i+=3;
            }
        }else{
            while(i < length){
                if(positions[i+1] < 0 ){
                    positions[i+1] = bb.y;
                    velocityes[i/3] = 0;
                }else{
                    velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                    positions[i] += (-speed + velocityes[i/3]) * directionCos;
                    positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
                }

    

                i+=3;
            }
        }

        this.BPG.geometry.attributes.position.needsUpdate = true;

    }

    animateBr_bk(){
        if(!this._ready) return;
        const dT = delta/0.016;
        let { positions, velocityes, randomVelocityMulti, bb, velocity, speed, direction, directionCos, directionSin, newRot } = this.getAnimationData();
        velocity*=dT;
        directionCos*=dT;
        directionSin*=dT;
        this.frameCounter++;
        if(this.frameCounter > this.frameThrottle) this.frameCounter = 0;
        let i = 0;
        let length = positions.length;
        this.material.uniforms.rotationOffset.value = newRot;
        if(this.frameCounter > this.frameThrottle-2){
            this.boundsCounter*=-1
        }

        if(this.frameCounter < this.frameThrottle-2){
            while(i < length){
                velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                positions[i] += (-speed + velocityes[i/3]) * directionCos;
                positions[i+1] += (-speed + velocityes[i/3]) * directionSin;

                i+=3;
            }
            this.BPG.geometry.attributes.position.needsUpdate = true;
            return;
        }

        if(this.boundsCounter > 0){
            while(i < length){
                velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                positions[i] += (-speed + velocityes[i/3]) * directionCos;
                positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
    
                if(positions[i] > bb.x){
                    positions[i] = 0;
                    velocityes[i/3] = 0;
                }
                i+=3;
            }
        }else{
            while(i < length){
                velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                positions[i] += (-speed + velocityes[i/3]) * directionCos;
                positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
    
                if(positions[i+1] < 0 ){
                    positions[i+1] = bb.y;
                    velocityes[i/3] = 0;
                }
                i+=3;
            }
        }

        this.BPG.geometry.attributes.position.needsUpdate = true;

    }

    animateTl(delta){
        if(!this._ready) return;
        if(delta >0.25) return;
        const dT = delta/0.016;
        let { positions, velocityes, randomVelocityMulti, bb, velocity, speed, direction, directionCos, directionSin, newRot } = this.getAnimationData();
        velocity*=dT;
        directionCos*=dT;
        directionSin*=dT;
        this.frameCounter++;
        if(this.frameCounter > this.frameThrottle) this.frameCounter = 0;
        let i = 0;
        let length = positions.length;
        this.material.uniforms.rotationOffset.value = newRot;
        if(this.frameCounter > this.frameThrottle-2){
            this.boundsCounter*=-1
        }

        if(this.frameCounter < this.frameThrottle-2){
            while(i < length){
                velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                positions[i] += (-speed + velocityes[i/3]) * directionCos;
                positions[i+1] += (-speed + velocityes[i/3]) * directionSin;

                i+=3;
            }
            this.BPG.geometry.attributes.position.needsUpdate = true;
            return;
        }

        if(this.boundsCounter > 0){
            while(i < length){
                if(positions[i] > bb.x){
                    positions[i] = 0;
                    velocityes[i/3] = 0;
                }else{
                    velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                    positions[i] += (-speed + velocityes[i/3]) * directionCos;
                    positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
                }

    

                i+=3;
            }
        }else{
            while(i < length){
                if(positions[i+1] > bb.y ){
                    positions[i+1] = 0;
                    velocityes[i/3] = 0;
                }else{
                    velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                    positions[i] += (-speed + velocityes[i/3]) * directionCos;
                    positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
                }

    

                i+=3;
            }
        }

        this.BPG.geometry.attributes.position.needsUpdate = true;

    }

    animateTr(delta){
        if(!this._ready) return;
        if(delta >0.25) return;
        const dT = delta/0.016;
        let { positions, velocityes, randomVelocityMulti, bb, velocity, speed, direction, directionCos, directionSin, newRot } = this.getAnimationData();
        velocity*=dT;
        directionCos*=dT;
        directionSin*=dT;this.frameCounter++;
        if(this.frameCounter > this.frameThrottle) this.frameCounter = 0;
        let i = 0;
        let length = positions.length;
        this.material.uniforms.rotationOffset.value = newRot;
        if(this.frameCounter > this.frameThrottle-2){
            this.boundsCounter*=-1
        }

        if(this.frameCounter < this.frameThrottle-2){
            while(i < length){
                velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                positions[i] += (-speed + velocityes[i/3]) * directionCos;
                positions[i+1] += (-speed + velocityes[i/3]) * directionSin;

                i+=3;
            }
            this.BPG.geometry.attributes.position.needsUpdate = true;
            return;
        }

        if(this.boundsCounter > 0){
            while(i < length){
                if(positions[i] < 0){
                    positions[i] = bb.x;
                    velocityes[i/3] = 0;
                }else{
                    velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                    positions[i] += (-speed + velocityes[i/3]) * directionCos;
                    positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
                }

    

                i+=3;
            }
        }else{
            while(i < length){
                if(positions[i+1] > bb.y ){
                    positions[i+1] = 0;
                    velocityes[i/3] = 0;
                }else{
                    velocityes[i/3] -= randomVelocityMulti[i/3] * velocity;

                    positions[i] += (-speed + velocityes[i/3]) * directionCos;
                    positions[i+1] += (-speed + velocityes[i/3]) * directionSin;
                }

    

                i+=3;
            }
        }

        this.BPG.geometry.attributes.position.needsUpdate = true;

    }

    _detectBounds(direction){
        if(direction > 0 && direction < Math.PI/2) return "bl";
        if(direction > Math.PI/2 && direction < Math.PI) return "br";
        if(direction > Math.PI && direction < Math.PI*1.5) return "tl";
        if(direction > Math.PI*1.5 && direction < Math.PI*2) return "tr";
        if(direction == 0) return "bl";
        if(direction == Math.PI/2) return "bl";
        if(direction == Math.PI) return "tl";
        if(direction == Math.PI*1.5) return "tr";
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
            rotationSpeed: 0,
        }
    }
}

class BasicParticleGeometry{
    constructor(count = 1000, randomRotation = false, randomScale = false, direction = 0, texture, color = "#ffffff", velocity){
        this.count = Math.round(count);
        this.randomRotation = randomRotation;
        this.randomScale = randomScale;
        this.direction = direction;
        this.velocity = velocity;
        this.textureCount = texture.split(",").length;
        this.colors = color.split(",").map(c=>new THREE.Color(c));
        this.colorCount = this.colors.length;
        let maxYBound = 0;
        for(let tile3d of Object.values(game.Levels3DPreview.tiles)){
            const bbox = new THREE.Box3().setFromObject(tile3d.mesh)
            if(bbox.max.y > maxYBound) maxYBound = bbox.max.y;
        }
        this.boundingBox = new THREE.Vector3(
            canvas.scene.dimensions.sceneWidth/factor,
            Math.max(maxYBound, Math.min(canvas.scene.dimensions.sceneWidth/factor, canvas.scene.dimensions.sceneHeight/factor)/2),
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
        const textureIndex = new Float32Array(this.count);
        const randomRot = new Float32Array(this.count * 1);
        const colors = new Float32Array(this.count * 3);
        for(let i=0;i<this.count;i++) {
            positions[i * 3] = Math.random() * this.boundingBox.x;
            positions[i * 3 + 1] = Math.random() * this.boundingBox.y;
            positions[i * 3 + 2] = Math.random() * this.boundingBox.z;
            const color = this.colors[Math.floor(Math.random() * this.colorCount)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            velocity[i] = 0;
            randomSize[i] = this.randomScale ? Math.random()*2+0.5 : 1;
            const rotation = this.randomRotation ? Math.random()*Math.PI*2 : Math.PI - this.direction;
            randomRot[i] = rotation;
            randomVelocityMulti[i] = (Math.random()+0.5)*this.velocity;
            textureIndex[i] = Math.floor(Math.random()*this.textureCount);

        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('colors', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocity, 1));
        geometry.setAttribute('randomSize', new THREE.BufferAttribute(randomSize, 1));
        geometry.setAttribute('randomRot', new THREE.BufferAttribute(randomRot, 1));
        geometry.setAttribute('randomVelocityMulti', new THREE.BufferAttribute(randomVelocityMulti, 1));
        geometry.setAttribute('textureIndex', new THREE.BufferAttribute(textureIndex, 1));
        this.geometry = geometry;

    }
}

class WeatherPresets{
    static getRainPreset(){
        return {
            density: 10,
            size: 0.0075,
            color: "#aaaaaa",
            opacity: 1,
            velocity: 0.007,
            direction: 1.7453292519943295,
            speed: 0.0055,
            randomRotation: false,
            randomScale: true,
            texture: 'ui/particles/rain.png'
        }
    }
    static getHeavyRainPreset(){
        return {
            density: 200,
            size: 0.0075,
            color: "#aaaaaa",
            opacity: 1,
            velocity: 0.0027,
            direction: 1.7453292519943295,
            speed: 0.005,
            randomRotation: false,
            randomScale: true,
            texture: 'ui/particles/rain.png'
        }
    }
    static getSnowPreset(){
        return {
            density: 5,
            size: 0.0075,
            color: "#ffffff",
            opacity: 1,
            velocity: 0.00001,
            direction: 1.7453292519943295,
            speed: 0.0007,
            randomRotation: true,
            randomScale: true,
            rotationSpeed: Math.toRadians(1),
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
            direction: Math.toRadians(91),
            speed: 0.001,
            randomRotation: true,
            randomScale: true,
            texture: 'modules/levels-3d-preview/assets/particles/emberssmall.png',
            blending: THREE.AdditiveBlending,
        } 
    }
    static getLeavesPreset(){
        return {
            density: 2,
            size: 0.0075,
            color: "#ffffff",
            opacity: 1,
            velocity: 0.000001,
            direction: 2.530727415391778,
            speed: 0.001,
            randomRotation: true,
            randomScale: true,
            rotationSpeed: Math.toRadians(1),
            texture: 'ui/particles/leaf1.png,ui/particles/leaf2.png,ui/particles/leaf3.png,ui/particles/leaf4.png,ui/particles/leaf5.png,ui/particles/leaf6.png'
        } 
    }
    static getEmbersPreset(){
        return {
            density: 10,
            size: 0.0075,
            color: "#ff3700,#bd2900,#cf380e,#ff5900,#c24f11,#c22311,#fa1900",
            opacity: 1,
            velocity: 0.00000001,
            direction: Math.PI,
            speed: 0.0001,
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
            color: "#0084ff,#00ff6a",
            opacity: 1,
            velocity: 0.000001,
            direction: Math.PI*3/2,
            speed: 0.000001,
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
            velocity: 0.00000005,
            direction: Math.PI*2.5/2,
            speed: 0.00000005,
            randomRotation: true,
            randomScale: true,
            rotationSpeed: Math.toRadians(0.1)/5,
            texture: 'modules/levels-3d-preview/assets/particles/stars.png',
            blending: THREE.AdditiveBlending,
        }
    }
    static getStarFallPreset(){
        const modFolder = game.modules.get("jb2a_patreon") ? "jb2a_patreon" : "JB2A_DnD5e";
        return {
            density: 1,
            size: 0.01,
            color: "#ffffff",
            opacity: 1,
            velocity: 0,
            direction: Math.PI/2,
            speed: 0.00078,
            randomRotation: true,
            randomScale: true,
            rotationSpeed: Math.toRadians(1),
            texture: `modules/${modFolder}/Library/Generic/Twinkling_Stars/TwinklingStars_05_Orange_100x100.webm,modules/${modFolder}/Library/Generic/Twinkling_Stars/TwinklingStars_04_Orange_100x100.webm,modules/${modFolder}/Library/Generic/Twinkling_Stars/TwinklingStars_06_Orange_100x100.webm,modules/${modFolder}/Library/Generic/Twinkling_Stars/TwinklingStars_07_Orange_100x100.webm,modules/${modFolder}/Library/Generic/Twinkling_Stars/TwinklingStars_08_Orange_100x100.webm,modules/${modFolder}/Library/Generic/Twinkling_Stars/TwinklingStars_09_Orange_100x100.webm`,
            blending: THREE.AdditiveBlending,
        }
    }
    static getDustPreset(){
        return {
            density: 100,
            size: 0.175,
            color: "#5e461b",
            opacity: 0.05,
            velocity: 0.0000005,
            direction: Math.PI,
            speed: 0.00005,
            randomRotation: true,
            randomScale: true,
            rotationSpeed: Math.toRadians(0.1)/5,
            texture: 'modules/levels-3d-preview/assets/particles/dust.png',
            blending: THREE.NormalBlending,
        }
    }
    static getSmokePreset(){
        return {
            density: 200,
            size: 0.075,
            color: "#0d0d0d",
            opacity: 0.075,
            velocity: 0.00005,
            direction: Math.PI*3/2,
            speed: 0.00005,
            randomRotation: true,
            randomScale: true,
            rotationSpeed: Math.toRadians(0.1)/5,
            texture: 'modules/levels-3d-preview/assets/particles/dust.png',
            blending: THREE.NormalBlending,
        }
    }
    static getToxicPreset(){
        return {
            density: 10,
            size: 0.275,
            color: "#21451c,#38c75e,#1b7533",
            opacity: 0.1,
            velocity: 0.0001,
            direction: Math.PI,
            speed: 0.00001,
            randomRotation: true,
            randomScale: true,
            rotationSpeed: Math.toRadians(0.2),
            texture: 'modules/levels-3d-preview/assets/particles/dust.png',
            blending: THREE.NormalBlending,
        }
    }
}


const rain_FS = `
uniform sampler2D diffuseTexture[16];
uniform float pOpacity;
uniform float rotationOffset;
varying float texIndex;
varying vec3 vColour;
varying float vAngle;
varying vec2 vUv;
void main() {
  vec2 coords = (gl_PointCoord - 0.5) * mat2(cos(vAngle+rotationOffset), sin(vAngle+rotationOffset), -sin(vAngle+rotationOffset), cos(vAngle+rotationOffset)) + 0.5;
  if(coords.x < 0.0 || coords.x > 1.0 || coords.y < 0.0 || coords.y > 1.0) discard;
  vec4 diffuse;
  #ifBlockHere
  if ( diffuse.a < 0.01 ) discard;
  vec4 pColor4 = vec4(vColour, pOpacity);
  gl_FragColor = diffuse * pColor4;
}
`
const rain_VS = `
attribute float textureIndex;
attribute float randomSize;
attribute float randomRot;
varying vec2 vUv;
uniform float baseSize;
attribute vec3 colors;
varying vec3 vColour;
varying float vAngle;
varying float texIndex;
void main() {
    texIndex = textureIndex;
    vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = baseSize * randomSize / gl_Position.w;
  vAngle = randomRot;
  vColour = colors;
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


/*
embers - add multiple colors
leaves - less and faster
*/