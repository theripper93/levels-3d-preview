import * as THREE from "three";
import { factor } from "../main.js";
import { rawTexture } from "../three/rawTexture.js";

export const fogUniforms = {
    fogTexture: { value: null },
    fogOverlay: { value: null },
    useOverlay: { value: false },
    overlayRepeat: { value: new THREE.Vector2(1, 1) },
    sceneDimensions: { value: new THREE.Vector2() },
    sceneOrigin: { value: new THREE.Vector2() },
};

export class Fog {
    constructor(parent) {
        this._parent = parent;
        this._ready = false;
        this._overlay = null;
        this._lastBase64 = null;
        this.overlayRepeat = new THREE.Vector2(1, 1);
        this.debouncedUpdate = this.updateTexture; // !this._sharedContext ? foundry.utils.debounce(this.updateTexture, 300) : this.updateTexture;
        this.extractor ??= new foundry.canvas.TextureExtractor(canvas.app.renderer, { callerName: "FogExtractorCanvas3D", controlHash: true, format: PIXI.FORMATS.RED });
        this.extractor.reset();
        this.initTexture();
        this.initPixiRT();
        this.initOverlay();
        this.init().then(() => {
            this.needsUpdate = true;
            this._ready = true;
        });
    }

    get _sharedContext() {
        return this._parent._sharedContext;
    }

    initTexture() {
        this.webglFogTexture = new THREE.ExternalTexture();
    }

    initPixiRT() {
        const fowQuality = game.settings.get("levels-3d-preview", "fowQuality");
        const fogTexResolution = canvas.visibility.textureConfiguration.resolution * fowQuality;
        this.pixiRenderTexture = PIXI.RenderTexture.create({ width: canvas.dimensions.width, height: canvas.dimensions.height, resolution: this._sharedContext ? fogTexResolution : 0.1 });
        this.pixiRenderTexture.baseTexture.alphaMode = PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA;
    }

    async initOverlay(src = canvas.fog.overlay) {
        if (!src) return;
        const overlay = rawTexture(await game.Levels3DPreview.helpers.loadTexture(src));
        overlay.flipY = false;
        overlay.wrapS = THREE.RepeatWrapping;
        overlay.wrapT = THREE.RepeatWrapping;
        const width = canvas.scene.dimensions.sceneWidth / (overlay.image?.width || overlay.image?.videoWidth || 1);
        const height = canvas.scene.dimensions.sceneHeight / (overlay.image?.height || overlay.image?.videoHeight || 1);
        this.overlayRepeat = new THREE.Vector2(width, height);
        this._overlay = overlay;
    }

    async init() {
        this.blank = await new THREE.TextureLoader().loadAsync("modules/levels-3d-preview/assets/blankTex.jpg");
        const base64 = await this.generateTexture();
        this.fogTexture = this._sharedContext ? base64 : await new THREE.TextureLoader().loadAsync(base64);
        this.sceneDimensions = [canvas.dimensions.width / factor, canvas.dimensions.height / factor];
        this.sceneOrigin = [canvas.dimensions.sceneX / factor, canvas.dimensions.sceneY / factor];
    }

    async updateTexture(force = false) {
        if (!this.needsUpdate && !force) return;
        this.needsUpdate = false;
        if (this.fogTexture && !this._sharedContext) this.fogTexture.dispose();
        const isBlank = game.user.isGM && !canvas.effects?.visionSources?.size;
        const base64 = isBlank ? this.blank : await this.generateTexture();
        this.fogTexture = this._sharedContext || isBlank ? base64 : await new THREE.TextureLoader().loadAsync(base64);
        if (!this.fogTexture) return;
        this.fogTexture.minFilter = THREE.NearestFilter;
        this.fogTexture.flipY = false;
        this.updateShaders();
    }

    updateShaders() {
        if (!this._ready) return;
        fogUniforms.fogTexture.value = this.fogTexture;
        fogUniforms.fogOverlay.value = this._overlay;
        fogUniforms.useOverlay.value = !!this._overlay;
        fogUniforms.overlayRepeat.value = this.overlayRepeat;
        fogUniforms.sceneDimensions.value = this.sceneDimensions;
        fogUniforms.sceneOrigin.value = this.sceneOrigin;
    }

    async generateTexture() {
        const originalTint = canvas.fog.sprite.tint;
        canvas.fog.sprite.tint = 0x808080;
        if (canvas.scene.fog.mode) canvas.app.renderer.render(canvas.fog.sprite, { renderTexture: this.pixiRenderTexture, clear: true });
        canvas.app.renderer.render(canvas.masks.vision.vision, { renderTexture: this.pixiRenderTexture, clear: !canvas.scene.fog.mode });
        canvas.fog.sprite.tint = originalTint;
        if (this._sharedContext) {
            this.webglFogTexture.sourceTexture = Object.values(this.pixiRenderTexture.baseTexture._glTextures)[0]?.texture ?? null;
            return this.webglFogTexture;
        } else {
            let base64 = await this.extractor.extract({
                texture: this.pixiRenderTexture,
                compression: foundry.canvas.TextureExtractor.COMPRESSION_MODES.BASE64,
                type: "image/webp",
                quality: 0.8,
                debug: false,
            });
            if (base64) this._lastBase64 = base64;
            if (!base64) {
                if (this._lastBase64) {
                    return this._lastBase64;
                }
                //fallback to canvas base64 extraction
                this.extractor.reset();
                console.warn("3D Canvas | Failed to extract texture using foundry.canvas.TextureExtractor, falling back to PIXI.RenderTexture extraction");
                base64 = await canvas.app.renderer.extract.base64(this.pixiRenderTexture, "image/webp", 0.8);
            }
            //const base64 = await canvas.app.renderer.extract.base64(this.pixiRenderTexture, "image/jpeg");
            return base64;
        }
    }

    dispose() {
        this.fogTexture?.dispose();
        this.webglFogTexture?.dispose();
        this.pixiRenderTexture?.destroy(true);
        fogUniforms.fogTexture.value = null;
        fogUniforms.fogOverlay.value = null;
        fogUniforms.useOverlay.value = false;
        fogUniforms.sceneDimensions.value = new THREE.Vector2(0, 0);
        fogUniforms.sceneOrigin.value = new THREE.Vector2(0, 0);
    }

    destroy() {
        this.dispose();
    }
}

const PARTICLE_OFFSET_ATTRIBUTE = "attribute vec3 offset;";

function injectParticleFoW(shader) {
    shader.vertexShader = "#define FOW_FROM_OFFSET\n" + shader.vertexShader.replace("void main() {", "void main() {\n\tvWorldPositionFoW = ( modelMatrix * vec4( offset, 1.0 ) ).xyz;\n\tvWorldPositionFoW.y = 9999.0;");
    if (!shader.fragmentShader.includes("#include <fog_fragment>")) shader.fragmentShader = shader.fragmentShader.replace("#include <tonemapping_fragment>", "#include <fog_fragment>\n#include <tonemapping_fragment>");
}

function injectFogUniforms(shader, renderer) {
    this._userOnBeforeCompile?.call(this, shader, renderer);
    Object.assign(shader.uniforms, fogUniforms);
    if (shader.vertexShader.includes(PARTICLE_OFFSET_ATTRIBUTE)) injectParticleFoW(shader);
}

export function injectFoWShaders(THREELIB) {
    Object.defineProperty(THREELIB.Material.prototype, "onBeforeCompile", {
        configurable: true,
        get() {
            return injectFogUniforms;
        },
        set(callback) {
            this._userOnBeforeCompile = callback;
        },
    });
    THREELIB.Material.prototype.customProgramCacheKey = function () {
        return this._userOnBeforeCompile?.toString() ?? "";
    };

    THREELIB.ShaderChunk.common += `
    varying vec3 vWorldPositionFoW;
    uniform vec2 sceneDimensions;
    uniform vec2 sceneOrigin;
    uniform vec2 overlayRepeat;
    uniform sampler2D fogTexture;
    uniform sampler2D fogOverlay;
    uniform bool useOverlay;
    `;

    THREELIB.ShaderChunk.fog_vertex += `
    #ifndef FOW_FROM_OFFSET
    #ifdef USE_INSTANCING
        vWorldPositionFoW = (modelMatrix * (instanceMatrix * vec4( position , 1.0 ))).xyz;
    #else
        vWorldPositionFoW = (modelMatrix * vec4( position , 1.0 )).xyz;
    #endif
    #endif
    `;

    THREELIB.ShaderChunk.fog_fragment =
        `
    if( sceneDimensions.x != 0.0 && vWorldPositionFoW.x >= sceneOrigin.x && vWorldPositionFoW.x <= sceneDimensions.x - sceneOrigin.x && vWorldPositionFoW.z >= sceneOrigin.y && vWorldPositionFoW.z <= sceneDimensions.y - sceneOrigin.y ){
        float sceneX = (vWorldPositionFoW.x)/sceneDimensions.x;
        float sceneY = (vWorldPositionFoW.z)/sceneDimensions.y;
        vec4 fogTexel = texture( fogTexture, vec2(sceneX, sceneY) );
        if(useOverlay && fogTexel.r == 0.0){
            vec4 overlayTexel = texture( fogOverlay, vec2(sceneX * overlayRepeat.x, sceneY * overlayRepeat.y) );
            gl_FragColor = mix(gl_FragColor, overlayTexel, 1.0 - fogTexel.r);
        }else{
            gl_FragColor.rgb = mix( vec3(0.0, 0.0, 0.0), gl_FragColor.rgb, fogTexel.r );
        }
    }
    ` + THREELIB.ShaderChunk.fog_fragment;
}

/*


*/
