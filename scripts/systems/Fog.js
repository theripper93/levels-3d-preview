import * as THREE from "three";
import { factor } from "../main.js";
import { rawTexture } from "../three/rawTexture.js";
import { injectSurface } from "../vfx/surface/receivers.js";
import { clusterUniforms } from "../lighting/cluster/clusterManager.js";
import { declareExtraSamplers } from "../lighting/cluster/clusterChunks.js";
import { FogSmoother } from "./fogSmoother.js";
import { FogRegion, tokensMoving, unionRect } from "./fogRegion.js";
import { FogMist, volumetricFogEnabled } from "./fogMist.js";
import { VisionModeMask, visionModeUniforms, VISION_MODE_PARS, VISION_MODE_FRAGMENT } from "./visionModeMask.js";
import { injectReveal } from "./reveal.js";

const MASK_TEXELS_PER_GRID = 16;
const WALL_SAMPLE_OFFSET_GRIDS = 0.25;
const ALBEDO_DECLARATION = /\bvec4\s+diffuseColor\s*=/;

export const fogUniforms = {
    fogTexture: { value: null },
    fogOverlay: { value: null },
    useOverlay: { value: false },
    overlayRepeat: { value: new THREE.Vector2(1, 1) },
    sceneDimensions: { value: new THREE.Vector2() },
    sceneOrigin: { value: new THREE.Vector2() },
    fogWallOffset: { value: 0 },
    ...clusterUniforms,
    ...visionModeUniforms,
};

export class Fog {
    constructor(parent) {
        this._parent = parent;
        this._ready = false;
        this._overlay = null;
        this._lastBase64 = null;
        this.overlayRepeat = new THREE.Vector2(1, 1);
        this._updateSeq = 0;
        //The shared context path is cheap (no GPU readback), so only debounce the extract/encode/decode path
        this.debouncedUpdate = this._sharedContext ? this.updateTexture.bind(this) : foundry.utils.debounce(this.updateTexture.bind(this), 100);
        this.extractor ??= new foundry.canvas.TextureExtractor(canvas.app.renderer, { callerName: "FogExtractorCanvas3D", controlHash: true, format: PIXI.FORMATS.RED });
        this.extractor.reset();
        this.smoother = new FogSmoother(parent.renderer);
        this.region = new FogRegion();
        this.pendingRect = null;
        this.pendingFull = true;
        this.visionMask = new VisionModeMask();
        this.smoothing = true;
        this.mist = null;
        this.initTexture();
        this.initPixiRT();
        this.initOverlay();
        this.init().then(() => {
            if (this._destroyed) return;
            this.needsUpdate = true;
            this._ready = true;
            this.refreshMist();
        });
    }

    get _sharedContext() {
        return this._parent._sharedContext;
    }

    initTexture() {
        this.webglFogTexture = new THREE.ExternalTexture();
    }

    initPixiRT() {
        const fogTexResolution = Math.min(canvas.visibility.textureConfiguration.resolution, MASK_TEXELS_PER_GRID / canvas.dimensions.size);
        this.pixiRenderTexture = PIXI.RenderTexture.create({ width: canvas.dimensions.width, height: canvas.dimensions.height, resolution: this._sharedContext ? fogTexResolution : 0.1 });
        this.pixiRenderTexture.baseTexture.alphaMode = PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA;
    }

    refreshMist() {
        const wanted = this._ready && volumetricFogEnabled();
        if (wanted === !!this.mist) return;
        if (wanted) this.mist = new FogMist(this._parent.scene, fogUniforms.fogTexture);
        else {
            this.mist.dispose();
            this.mist = null;
        }
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
        this.fogTexture = this._sharedContext || !base64 ? (base64 ?? this.blank) : await new THREE.TextureLoader().loadAsync(base64);
        this.sceneDimensions = [canvas.dimensions.width / factor, canvas.dimensions.height / factor];
        this.sceneOrigin = [canvas.dimensions.sceneX / factor, canvas.dimensions.sceneY / factor];
        this.wallOffset = (canvas.dimensions.size / factor) * WALL_SAMPLE_OFFSET_GRIDS;
    }

    async updateTexture(force = false) {
        if (this._destroyed) return;
        if (!this.needsUpdate && !force) return;
        this.needsUpdate = false;
        const seq = ++this._updateSeq;
        const isBlank = game.user.isGM && !canvas.effects?.visionSources?.size;
        const toggled = this._wasBlank !== undefined && this._wasBlank !== isBlank;
        this._wasBlank = isBlank;
        if (isBlank) this.visionMask.reset();
        const generated = isBlank ? null : this.generateTexture();
        this.trackRegion(isBlank);
        const base64 = isBlank ? this.blank : await generated;
        if (seq !== this._updateSeq || this._destroyed) return;
        let texture = base64;
        if (!this._sharedContext && !isBlank && base64) {
            texture = await new THREE.TextureLoader().loadAsync(base64);
            if (seq !== this._updateSeq || this._destroyed) {
                texture?.dispose();
                return;
            }
        }
        if (!texture) return;
        const previous = this.fogTexture;
        this.fogTexture = texture;
        this.fogTexture.minFilter = THREE.NearestFilter;
        this.fogTexture.flipY = false;
        if (this.smoothing) {
            this.smoother.resize();
            this.smoother.setSource(texture, ...this.getSourceSize(texture), toggled, this.pendingFull ? null : (this.pendingRect ?? false));
            this.pendingFull = false;
            this.pendingRect = null;
        }
        this.updateShaders();
        //Dispose the previous texture only once the new one is assigned; never dispose the shared blank texture
        if (previous && previous !== texture && previous !== this.blank && !this._sharedContext) previous.dispose();
    }

    trackRegion(isBlank) {
        const signature = `${isBlank}|${canvas.scene.fog.mode}|${this.visionMask.signature}|${canvas.environment?.darknessLevel}`;
        const rect = this.region.update();
        if (signature !== this.signature || !tokensMoving()) this.pendingFull = true;
        this.signature = signature;
        if (!this.pendingFull) this.pendingRect = unionRect(this.pendingRect, rect);
    }

    getSourceSize(texture) {
        if (texture === this.webglFogTexture) return [this.pixiRenderTexture.baseTexture.realWidth, this.pixiRenderTexture.baseTexture.realHeight];
        const image = texture.image;
        return [image?.width ?? 0, image?.height ?? 0];
    }

    update(delta) {
        if (!this._ready) return;
        this.mist?.update(delta);
        this.visionMask.update(delta);
        if (this.smoothing && this.smoother.partial && !tokensMoving()) this.smoother.refresh();
        if (!this.smoothing || !this.smoother.active) return;
        this.smoother.update(delta);
        fogUniforms.fogTexture.value = this.smoother.texture;
    }

    updateShaders() {
        if (!this._ready) return;
        fogUniforms.fogTexture.value = this.smoothing && this.smoother.primed ? this.smoother.texture : this.fogTexture;
        fogUniforms.fogOverlay.value = this._overlay;
        fogUniforms.useOverlay.value = !!this._overlay;
        fogUniforms.overlayRepeat.value = this.overlayRepeat;
        fogUniforms.sceneDimensions.value = this.sceneDimensions;
        fogUniforms.sceneOrigin.value = this.sceneOrigin;
        fogUniforms.fogWallOffset.value = this.wallOffset;
    }

    async generateTexture() {
        if (!canvas.fog?.sprite || !canvas.masks?.vision?.vision) return this._sharedContext ? this.webglFogTexture : this._lastBase64;
        const originalTint = canvas.fog.sprite.tint;
        canvas.fog.sprite.tint = 0x808080;
        if (canvas.scene.fog.mode) canvas.app.renderer.render(canvas.fog.sprite, { renderTexture: this.pixiRenderTexture, clear: true });
        canvas.app.renderer.render(canvas.masks.vision.vision, { renderTexture: this.pixiRenderTexture, clear: !canvas.scene.fog.mode });
        canvas.fog.sprite.tint = originalTint;
        this.visionMask.refresh();
        this.visionMask.render(canvas.app.renderer, this.pixiRenderTexture);
        if (this._sharedContext) {
            this.webglFogTexture.sourceTexture = Object.values(this.pixiRenderTexture.baseTexture._glTextures)[0]?.texture ?? null;
            return this.webglFogTexture;
        } else {
            const packed = this.visionMask.active;
            let base64 = await this.getExtractor(packed).extract({
                texture: this.pixiRenderTexture,
                compression: foundry.canvas.TextureExtractor.COMPRESSION_MODES.BASE64,
                type: packed ? "image/png" : "image/webp",
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

    getExtractor(packed) {
        if (!packed) return this.extractor;
        this.packedExtractor ??= new foundry.canvas.TextureExtractor(canvas.app.renderer, { callerName: "FogExtractorCanvas3DPacked", controlHash: true, format: PIXI.FORMATS.RGBA });
        return this.packedExtractor;
    }

    dispose() {
        this.visionMask?.destroy();
        this.fogTexture?.dispose();
        this.webglFogTexture?.dispose();
        this.pixiRenderTexture?.destroy(true);
        this.smoother?.dispose();
        this.mist?.dispose();
        this.mist = null;
        fogUniforms.fogTexture.value = null;
        fogUniforms.fogOverlay.value = null;
        fogUniforms.useOverlay.value = false;
        fogUniforms.sceneDimensions.value = new THREE.Vector2(0, 0);
        fogUniforms.sceneOrigin.value = new THREE.Vector2(0, 0);
        fogUniforms.fogWallOffset.value = 0;
    }

    destroy() {
        this._destroyed = true;
        this.dispose();
    }
}

const PARTICLE_OFFSET_ATTRIBUTE = "attribute vec3 offset;";

function injectParticleFoW(shader) {
    shader.fragmentShader = "#define L3D_NO_CLUSTER\n" + shader.fragmentShader;
    shader.vertexShader = "#define FOW_FROM_OFFSET\n" +shader.vertexShader.replace("void main() {", "void main() {\n\tvWorldPositionFoW = ( modelMatrix * vec4( offset, 1.0 ) ).xyz;\n\tvWorldPositionFoW.y = 9999.0;");
    if (!shader.fragmentShader.includes("#include <fog_fragment>")) shader.fragmentShader = shader.fragmentShader.replace("#include <tonemapping_fragment>", "#include <fog_fragment>\n#include <tonemapping_fragment>");
}

export function selfLitUniform(material) {
    return (material._l3dSelfLit ??= { value: false });
}

export function noVisionModeUniform(material) {
    return (material._l3dNoVisionMode ??= { value: !!material.userData?.noVisionMode });
}

function injectFogUniforms(shader, renderer) {
    this._userOnBeforeCompile?.call(this, shader, renderer);
    declareExtraSamplers(shader);
    Object.assign(shader.uniforms, fogUniforms);
    shader.uniforms.l3dFoliage = { value: !!this.userData?.foliage };
    shader.uniforms.l3dNoVisionMode = noVisionModeUniform(this);
    shader.uniforms.l3dSelfLit = selfLitUniform(this);
    if (ALBEDO_DECLARATION.test(shader.fragmentShader)) shader.fragmentShader = "#define L3D_VM_ALBEDO diffuseColor.rgb\n" + shader.fragmentShader;
    injectSurface(shader);
    if (shader.vertexShader.includes(PARTICLE_OFFSET_ATTRIBUTE)) injectParticleFoW(shader);
    injectReveal(shader, this);
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
        //Closures with identical source but different captured state stringify the same, so add the material state that injected code depends on
        const map = this.map;
        const mapKey = map ? (map.matrixAutoUpdate === false || map.userData?.legacyUvMatrix ? "mapM" : "map") : "nomap";
        return `${this.type}|${mapKey}|${this._userOnBeforeCompile?.toString() ?? ""}`;
    };

    THREELIB.ShaderChunk.common += `
    varying vec3 vWorldPositionFoW;
    uniform vec2 sceneDimensions;
    uniform vec2 sceneOrigin;
    uniform vec2 overlayRepeat;
    uniform sampler2D fogTexture;
    uniform sampler2D fogOverlay;
    uniform bool useOverlay;
    uniform float fogWallOffset;
    ` + VISION_MODE_PARS;

    THREELIB.ShaderChunk.fog_vertex += `
    #ifndef FOW_FROM_OFFSET
    #if defined( USE_BATCHING )
        vWorldPositionFoW = (modelMatrix * (batchingMatrix * vec4( position , 1.0 ))).xyz;
    #elif defined( USE_INSTANCING )
        vWorldPositionFoW = (modelMatrix * (instanceMatrix * vec4( position , 1.0 ))).xyz;
    #else
        vWorldPositionFoW = (modelMatrix * vec4( position , 1.0 )).xyz;
    #endif
    #endif
    `;

    THREELIB.ShaderChunk.fog_fragment =
        `
    vec2 fowSampleXZ = vWorldPositionFoW.xz;
    vec3 fowFaceNormal = cross( dFdx( vWorldPositionFoW ), dFdy( vWorldPositionFoW ) );
    float fowFaceLength = dot( fowFaceNormal, fowFaceNormal );
    if( fogWallOffset > 0.0 && fowFaceLength > 0.0 ){
        fowFaceNormal *= inversesqrt( fowFaceLength );
        if( dot( fowFaceNormal, cameraPosition - vWorldPositionFoW ) < 0.0 ) fowFaceNormal = -fowFaceNormal;
        float fowHorizontal = length( fowFaceNormal.xz );
        fowSampleXZ += fowFaceNormal.xz / max( fowHorizontal, 1e-4 ) * fogWallOffset * smoothstep( 0.7, 0.95, fowHorizontal );
    }
    if( sceneDimensions.x != 0.0 && vWorldPositionFoW.x >= sceneOrigin.x && vWorldPositionFoW.x <= sceneDimensions.x - sceneOrigin.x && vWorldPositionFoW.z >= sceneOrigin.y && vWorldPositionFoW.z <= sceneDimensions.y - sceneOrigin.y ){
        float sceneX = (vWorldPositionFoW.x)/sceneDimensions.x;
        float sceneY = (vWorldPositionFoW.z)/sceneDimensions.y;
        vec4 fogTexel = texture( fogTexture, fowSampleXZ / sceneDimensions );
        if(useOverlay && fogTexel.r == 0.0){
            vec4 overlayTexel = texture( fogOverlay, vec2(sceneX * overlayRepeat.x, sceneY * overlayRepeat.y) );
            gl_FragColor = mix(gl_FragColor, overlayTexel, 1.0 - fogTexel.r);
        }else{
            if (!l3dNoVisionMode) gl_FragColor.rgb = mix( vec3(0.0, 0.0, 0.0), gl_FragColor.rgb, fogTexel.r );
            ${VISION_MODE_FRAGMENT}
        }
    }
    ` + THREELIB.ShaderChunk.fog_fragment;
}

/*


*/
