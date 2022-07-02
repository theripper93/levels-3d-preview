import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';

export class Fog{

    constructor(parent){
        this._parent = parent;
        this.needsUpdate = true;
        this.debouncedUpdate = !this._sharedContext ? debounce(this.updateTexture, 300) : this.updateTexture;
        this.initTexture();
        this.init();
    }

    get _sharedContext(){
        return this._parent._sharedContext;
    }

    initTexture(){
        const forceTextureInitialization = () => {
            const material = new THREE.MeshBasicMaterial();
            const geometry = new THREE.PlaneBufferGeometry();
            const scene = new THREE.Scene();
            scene.add(new THREE.Mesh(geometry, material));
            const camera = new THREE.Camera();
            const renderer = this._parent.renderer
            return function forceTextureInitialization(texture) {
              material.map = texture;
              renderer.render(scene, camera);
            };
          };
        
          const texture = new THREE.Texture();
          forceTextureInitialization(texture);
          this.webglFogTexture = texture;
    }

    async init(){
        this.blank = await new THREE.TextureLoader().loadAsync("modules/levels-3d-preview/assets/blankTex.jpg");
        const base64 = this.generateTexture();
        this.fogTexture = this._sharedContext ? base64 : await new THREE.TextureLoader().loadAsync( base64)
        this.sceneDimensions = [canvas.dimensions.width / factor, canvas.dimensions.height / factor];
        this.sceneOrigin = [canvas.dimensions.paddingX / factor, canvas.dimensions.paddingY / factor];
    }

    async updateTexture(force = false){
        if(!this.needsUpdate && !force) return;
        this.needsUpdate = false;
        if(this.fogTexture && !this._sharedContext) this.fogTexture.dispose();
        const isBlank = game.user.isGM && (!canvas.tokens.controlled.length || !canvas.sight.sources.size)
        const base64 = isBlank ? this.blank : this.generateTexture();
        this.fogTexture = this._sharedContext || isBlank ? base64 : await new THREE.TextureLoader().loadAsync( base64)
        this.fogTexture.minFilter = THREE.NearestFilter;
        this.fogTexture.flipY = false;
        Object.values(this._parent.materialProgramCache).forEach(m => {
            m.uniforms.fogTexture = {value: this.fogTexture};
            m.uniforms.sceneDimensions = {value: this.sceneDimensions};
            m.uniforms.sceneOrigin = {value: this.sceneOrigin};
        })
        //this.shader.uniforms.fogTexture.value = this.fogTexture;
    }

    generateTexture(){
        if(this._sharedContext){
            this.pixiRenderTexture?.destroy(true)
            const maxDimension = Math.max(canvas.dimensions.width, canvas.dimensions.height);
            const maxResolution = this._parent.renderer.capabilities.maxTextureSize
            const fogTexResolution = Math.min(maxResolution/maxDimension, 1)
            this.pixiRenderTexture = PIXI.RenderTexture.create({width: canvas.dimensions.width, height: canvas.dimensions.height, resolution: fogTexResolution});
            this.texWidth = canvas.dimensions.width;
            this.texHeight = canvas.dimensions.height;
            if(canvas.scene.data.fogExploration) canvas.app.renderer.render(canvas.sight.revealed, {renderTexture: this.pixiRenderTexture, clear: false});
            canvas.app.renderer.render(canvas.sight.vision, {renderTexture: this.pixiRenderTexture, clear: false});
            const texProps = this._parent.renderer.properties.get(this.webglFogTexture);
            texProps.__webglTexture = Object.values(this.pixiRenderTexture.baseTexture._glTextures)[0]?.texture
            return this.webglFogTexture;
        }else{
            let texture = PIXI.RenderTexture.create({width: canvas.dimensions.width, height: canvas.dimensions.height, resolution: 0.1});
            this.texWidth = canvas.dimensions.width;
            this.texHeight = canvas.dimensions.height;
            if(canvas.scene.data.fogExploration) canvas.app.renderer.render(canvas.sight.revealed, {renderTexture: texture, clear: false});
            canvas.app.renderer.render(canvas.sight.vision, {renderTexture: texture, clear: false});
            const base64 = canvas.app.renderer.extract.base64(texture,"image/jpeg");
            texture.destroy(true);
            return base64;
        }
    }

    dispose(){
        this.fogTexture?.dispose();
        this.webglFogTexture?.dispose();
        Object.values(this._parent.materialProgramCache).forEach(m => {
            m.uniforms.fogTexture = {value: null};
            m.uniforms.sceneDimensions = {value: new THREE.Vector2(0,0)};
            m.uniforms.sceneOrigin = {value: new THREE.Vector2(0,0)};
        })
        this._parent.materialProgramCache = {};
    }

    destroy(){
        this.dispose();
    }

}

export function injectFoWShaders(THREELIB){

    THREELIB.ShaderChunk.common += `
    varying vec3 vWorldPositionFoW;
    uniform vec2 sceneDimensions;
    uniform vec2 sceneOrigin;
    uniform sampler2D fogTexture;
    ` 

    THREELIB.ShaderChunk.begin_vertex += `
    #ifdef USE_INSTANCING
        vWorldPositionFoW = (modelMatrix * (instanceMatrix * vec4( position , 1.0 ))).xyz;
    #else
        vWorldPositionFoW = (modelMatrix * vec4( position , 1.0 )).xyz;
    #endif
    `

    THREELIB.ShaderChunk.fog_fragment += `
    if( sceneDimensions.x != 0.0 && vWorldPositionFoW.x >= sceneOrigin.x && vWorldPositionFoW.x <= sceneOrigin.x + sceneDimensions.x && vWorldPositionFoW.z >= sceneOrigin.y && vWorldPositionFoW.z <= sceneOrigin.y + sceneDimensions.y ){
        float sceneX = (vWorldPositionFoW.x)/sceneDimensions.x;
        float sceneY = (vWorldPositionFoW.z)/sceneDimensions.y;
        vec4 fogTexel = texture( fogTexture, vec2(sceneX, sceneY) );
        gl_FragColor *= fogTexel;
    }
    `
}