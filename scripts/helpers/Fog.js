import * as THREE from "../lib/three.module.js";
import { ShaderPass } from '../lib/ShaderPass.js';
import {factor} from '../main.js';

export class Fog{

    constructor(parent){
        this._parent = parent;
        this.needsUpdate = true;
        this.debouncedUpdate = debounce(this.updateTexture, game.settings.get("levels-3d-preview", "fogDebounce") ? 300 : 0);
        this.init();
    }

    async init(){
        const base64 = this.generateTexture();
        this.fogTexture = await new THREE.TextureLoader().loadAsync( base64)
        const size = [this.fogTexture.image.width, this.fogTexture.image.height];
        const scenesize = [canvas.dimensions.width / factor, canvas.dimensions.height / factor];
        const sceneOrigin = [canvas.dimensions.paddingX / factor, canvas.dimensions.paddingY / factor];
        this.shader = this.getShader(this.fogTexture, size, scenesize, sceneOrigin);
        this._parent.composer.removePass( this.fogPass );
        this.fogPass = new ShaderPass( this.shader );
        this._parent.composer.addPass( this.fogPass );
    }

    update(){
        this.updateTexture();
        if(this.target) this.target.dispose();
        this.target = new THREE.WebGLRenderTarget( window.innerWidth*this._parent.resolutionMulti, window.innerHeight*this._parent.resolutionMulti );
        this.target.texture.format = THREE.RGBFormat;
        this.target.texture.minFilter = THREE.NearestFilter;
        //this.target.texture.magFilter = THREE.NearestFilter;
        this.target.texture.generateMipmaps = false;
        this.target.stencilBuffer = true;
        this.target.depthBuffer = true;
        this.target.depthTexture = new THREE.DepthTexture();
        this.target.depthTexture.format = THREE.DepthFormat;
        this.target.depthTexture.type = THREE.UnsignedShortType;
        this._parent.renderer.setRenderTarget( this.target );
        this._parent.renderer.render( this._parent.scene, this._parent.camera );

        if(this.shader){
            this.shader.uniforms.projectionMatrixInverse.value.copy(this._parent.camera.projectionMatrixInverse);
            this.shader.uniforms.worldMatrixInverse.value.copy(this._parent.camera.matrixWorld);
            this.shader.uniforms.tDepth.value = this.target.depthTexture;
        }
    }

    async updateTexture(force = false){
        if(!this.needsUpdate && !force) return;
        this.needsUpdate = false;
        if(this.fogTexture) this.fogTexture.dispose();
        const base64 = game.user.isGM && (!canvas.tokens.controlled.length || !canvas.sight.sources.size) ? this.getBlankTexture() : this.generateTexture();
        this.fogTexture = await new THREE.TextureLoader().loadAsync( base64)
        this.fogTexture.minFilter = THREE.NearestFilter;
        const size = [this.fogTexture.image.width, this.fogTexture.image.height];
        this.shader.uniforms.texDimensions.value = size;
        this.shader.uniforms.fogTexture.value = this.fogTexture;
    }

    getBlankTexture(){
        if(this._blankTexture) return this._blankTexture;
        const g = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, 0, 1, 1);
        const texture = PIXI.RenderTexture.create({width: 1, height: 1, resolution: 1});
        canvas.app.renderer.render(g, {renderTexture: texture, clear: false});
        const base64 = canvas.app.renderer.extract.base64(texture,"image/jpeg");
        this._blankTexture = base64;
        texture.destroy(true);
        return base64;
    }

    generateTexture(){
        const texture = PIXI.RenderTexture.create({width: canvas.dimensions.width, height: canvas.dimensions.height, resolution: 0.1});

        if(canvas.scene.data.fogExploration) canvas.app.renderer.render(canvas.sight.revealed, {renderTexture: texture, clear: false});
        canvas.app.renderer.render(canvas.sight.vision, {renderTexture: texture, clear: false});

        const base64 = canvas.app.renderer.extract.base64(texture,"image/jpeg");
        texture.destroy(true);
        return base64;
    }

    dispose(){
        if(this.target) this.target.dispose();
        this.target = null;
    }

    getShader(texture, size, scenesize, sceneOrigin){

        //const texture = await new THREE.TextureLoader().loadAsync( "TheHacienda_free.jpg")

        const shader = {

            uniforms: {

                'tDiffuse': { value: null },
                'tDepth': { value: null },
                'opacity': { value: 1.0  },
                'fogTexture': { value: texture },
                'texDimensions': { value: size },
                'sceneDimensions': { value: scenesize },
                'sceneOrigin': { value: sceneOrigin },
                'cameraNear': { value: this._parent.camera.near },
                'cameraFar': { value: this._parent.camera.far },
                'projectionMatrixInverse': { value: new THREE.Matrix4() },
                'worldMatrixInverse': { value: new THREE.Matrix4() },
                'factor': { value: factor },

            },

            vertexShader: /* glsl */`

                varying vec2 vUv;
                varying vec4 worldPosition;

                void main() {

                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                    worldPosition = modelMatrix * vec4(position, 1.0);

                }`,

            fragmentShader: /* glsl */`

                #include <packing>
                uniform float opacity;

                uniform sampler2D tDiffuse;
                uniform sampler2D tDepth;
                uniform sampler2D fogTexture;

                uniform vec2 texDimensions;
                uniform vec2 sceneDimensions;
                uniform vec2 sceneOrigin;
                uniform mat4 projectionMatrixInverse;
                uniform mat4 worldMatrixInverse;
                uniform float cameraNear;
                uniform float cameraFar;
                uniform float factor;

                varying vec2 vUv;
                varying vec4 worldPosition;


                void main() {

                    float depth = texture(tDepth, vUv).x;
                    
                    vec4 clipSpacePosition = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
                    vec4 viewSpacePosition = projectionMatrixInverse * clipSpacePosition;
                
                    viewSpacePosition /= viewSpacePosition.w;
                
                    vec4 worldSpacePosition = worldMatrixInverse * viewSpacePosition;

                    vec4 finalColor;
                    vec4 texel = texture( tDiffuse, vUv );
                    float sceneX = worldSpacePosition.x*factor;
                    float sceneY = worldSpacePosition.z*factor;
                    float fogTexX = (sceneX)*texDimensions.x/(sceneDimensions.x*factor)-5.0;
                    float fogTexY = texDimensions.y - (sceneY)*texDimensions.y/(sceneDimensions.y*factor)-5.0;

                    //sample a 10x10 pixel texture
                    vec4 fogTexel = vec4(0.0);
                    for(int i = 0; i < 10; i++){
                        for(int j = 0; j < 10; j++){
                            vec2 fogTexCoord = vec2(fogTexX + float(i), fogTexY + float(j));
                            fogTexel += texture(fogTexture, fogTexCoord / texDimensions);
                        }
                    }
                    fogTexel /= 100.0;



                    //vec4 fogTexel = texture( fogTexture, vec2(fogTexX, fogTexY) / texDimensions );
                    vec4 depthTexel = texture( tDepth, vUv );

                    float maxX = sceneDimensions.x - sceneOrigin.x;
                    float maxZ = sceneDimensions.y - sceneOrigin.y;

                    if(worldSpacePosition.y > -0.1 && worldSpacePosition.x > sceneOrigin.x && worldSpacePosition.x < maxX && worldSpacePosition.z > sceneOrigin.y && worldSpacePosition.z < maxZ){
                        if(fogTexel.r == 0.0){
                            finalColor = fogTexel * texel;
                        }else{
                            finalColor = texel;
                        }
                        finalColor = fogTexel * texel;
                    }else{
                        finalColor = texel;
                    }
                    gl_FragColor = finalColor;

                }`

        };
        return new THREE.ShaderMaterial({
            uniforms: shader.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,

        });



    }

}