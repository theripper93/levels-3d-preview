import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';

export class Fog{

    constructor(parent){
        this._parent = parent;
        this._ready = false;
        this._overlay = null;
        this.overlayRepeat = new THREE.Vector2(1,1);
        this.debouncedUpdate = !this._sharedContext ? debounce(this.updateTexture, 300) : this.updateTexture;
        this.initTexture();
        this.initPixiRT();
        this.initOverlay();
        this.init().then(() => {
            this.needsUpdate = true;
            this._ready = true;
        })
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

    initPixiRT(){
        const fowQuality = game.settings.get("levels-3d-preview", "fowQuality");
        const fogTexResolution = canvas.fog.resolution.resolution*fowQuality;
        this.pixiRenderTexture = PIXI.RenderTexture.create({width: canvas.dimensions.width, height: canvas.dimensions.height, resolution: this._sharedContext ? fogTexResolution : 0.1});
    }

    async initOverlay(){
        if(!canvas.scene.fogOverlay) return;
        const overlay = await game.Levels3DPreview.helpers.loadTexture(canvas.scene.fogOverlay);
        overlay.flipY = false;
        overlay.wrapS = THREE.RepeatWrapping;
        overlay.wrapT = THREE.RepeatWrapping;
        const width = canvas.scene.dimensions.sceneWidth / (overlay.image?.width || overlay.image?.videoWidth || 1);
        const height = canvas.scene.dimensions.sceneHeight / (overlay.image?.height || overlay.image?.videoHeight || 1);
        this.overlayRepeat = new THREE.Vector2(width, height);
        this._overlay = overlay;
    }

    async init(){
        this.blank = await new THREE.TextureLoader().loadAsync("modules/levels-3d-preview/assets/blankTex.jpg");
        const base64 = this.generateTexture();
        this.fogTexture = this._sharedContext ? base64 : await new THREE.TextureLoader().loadAsync( base64)
        this.sceneDimensions = [canvas.dimensions.width / factor, canvas.dimensions.height / factor];
        this.sceneOrigin = [canvas.dimensions.sceneX / factor, canvas.dimensions.sceneY / factor];
    }

    async updateTexture(force = false){
        if(!this.needsUpdate && !force) return;
        this.needsUpdate = false;
        if(this.fogTexture && !this._sharedContext) this.fogTexture.dispose();
        const isBlank = game.user.isGM && !canvas.effects?.visionSources?.size
        const base64 = isBlank ? this.blank : this.generateTexture();
        this.fogTexture = this._sharedContext || isBlank ? base64 : await new THREE.TextureLoader().loadAsync( base64)
        if(!this.fogTexture) return;
        this.fogTexture.minFilter = THREE.NearestFilter;
        this.fogTexture.flipY = false;
        this.updateShaders();
    }

    updateShaders(){
        if(!this._ready) return;
        Object.values(this._parent.materialProgramCache).forEach(m => {
            m.uniforms.fogTexture = {value: this.fogTexture};
            m.uniforms.fogOverlay = {value: this._overlay};
            m.uniforms.useOverlay = {value: !!this._overlay};
            m.uniforms.overlayRepeat = {value: this.overlayRepeat};
            m.uniforms.sceneDimensions = {value: this.sceneDimensions};
            m.uniforms.sceneOrigin = {value: this.sceneOrigin};
        })
    }

    generateTexture(){
        const originalTint = canvas.fog.sprite.tint;
        canvas.fog.sprite.tint = 0x808080;
        if(canvas.scene.fogExploration) canvas.app.renderer.render(canvas.fog.sprite, {renderTexture: this.pixiRenderTexture, clear: true});
        canvas.app.renderer.render(canvas.masks.vision.vision, {renderTexture: this.pixiRenderTexture, clear: !canvas.scene.fogExploration});
        canvas.fog.sprite.tint = originalTint;
        if(this._sharedContext){
            const texProps = this._parent.renderer.properties.get(this.webglFogTexture);
            texProps.__webglTexture = Object.values(this.pixiRenderTexture.baseTexture._glTextures)[0]?.texture
            return this.webglFogTexture;
        }else{
            const base64 = canvas.app.renderer.extract.base64(this.pixiRenderTexture,"image/jpeg");
            return base64;
        }
    }

    dispose(){
        this.fogTexture?.dispose();
        this.webglFogTexture?.dispose();
        this.pixiRenderTexture?.destroy(true);
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
    uniform vec2 overlayRepeat;
    uniform sampler2D fogTexture;
    uniform sampler2D fogOverlay;
    uniform bool useOverlay;
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
        if(useOverlay && fogTexel.r == 0.0){
            vec4 overlayTexel = texture( fogOverlay, vec2(sceneX * overlayRepeat.x, sceneY * overlayRepeat.y) );
            gl_FragColor = mix(gl_FragColor, overlayTexel, 1.0 - fogTexel.r);
        }else{
            gl_FragColor = mix( vec4(0.0, 0.0, 0.0, 1.0), gl_FragColor, fogTexel.r );
        }
    }
    `
}

/*
        if(useOverlay && fogTexel.r == 0.0){
            vec4 overlayTexel = texture( fogOverlay, vec2(sceneX * overlayRepeat.x, sceneY * overlayRepeat.y) );
            gl_FragColor = mix(gl_FragColor, overlayTexel, 1.0 - fogTexel.r);
        }else{
            gl_FragColor *= fogTexel;
        }
*/