import { AdditiveBlending, BackSide, BoxGeometry, Color, CustomBlending, DataTexture, DstColorFactor, GreaterEqualDepth, Mesh, NormalBlending, Object3D, OneFactor, ShaderMaterial, SrcColorFactor, ZeroFactor } from "three";
import { VFX_LAYER } from "../constants.js";
import { InstancePool, PooledEffect } from "./instancePool.js";
import { sceneUniforms } from "./sceneBuffer.js";

const BLENDS = {
    additive: { blending: AdditiveBlending },
    normal: { blending: NormalBlending },
    multiply: { blending: CustomBlending, blendSrc: ZeroFactor, blendDst: SrcColorFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, defines: { PROJECTION_MULTIPLY: "" } },
    light: { blending: CustomBlending, blendSrc: DstColorFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, defines: { PROJECTION_LIGHT: "" } },
};

const PATTERNS = { texture: 0, glow: 1, ring: 2 };

const DECAL_RENDER_ORDER = -10;

const white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;

const projectionVertex = (pars, main) => `
flat varying mat4 vWorldToLocal;
flat varying vec3 vProjectionAxis;
flat varying vec3 vProjectionCenter;
${pars}

void main() {
    mat4 localToWorld = modelMatrix;
    #ifdef USE_INSTANCING
        localToWorld = modelMatrix * instanceMatrix;
    #endif
    vWorldToLocal = inverse(localToWorld);
    vProjectionAxis = normalize(localToWorld[1].xyz);
    vProjectionCenter = localToWorld[3].xyz;
    ${main}
    gl_Position = projectionMatrix * viewMatrix * localToWorld * vec4(position, 1.0);
}
`;

const projectionFragment = (fragment) => `
#include <common>
#include <vfx_scene_pars_fragment>
#include <vfx_fog_of_war_pars_fragment>
flat varying mat4 vWorldToLocal;
flat varying vec3 vProjectionAxis;
flat varying vec3 vProjectionCenter;
${fragment}

void main() {
    vec2 screenUv = vfxScreenUv();
    vec3 world = vfxWorldPosition(screenUv, vfxSceneDepth(screenUv));
    vec3 local = (vWorldToLocal * vec4(world, 1.0)).xyz;
    if (any(greaterThan(abs(local), vec3(0.5)))) discard;
    vec3 normal = vfxSurfaceNormal(world);
    gl_FragColor = projectionColor(world, local, normal, dot(normal, vProjectionAxis));
    gl_FragColor.a *= vfxFogOfWar(world);
    #if defined(PROJECTION_MULTIPLY)
        gl_FragColor = vec4(mix(vec3(1.0), gl_FragColor.rgb, gl_FragColor.a), 1.0);
    #elif defined(PROJECTION_LIGHT)
        gl_FragColor = vec4(gl_FragColor.rgb * gl_FragColor.a, 1.0);
    #else
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    #endif
}
`;

export function createProjectionMaterial({ fragment, vertexPars = "", vertexMain = "", uniforms = {}, blending = "additive" }) {
    const { defines, ...blend } = BLENDS[blending];
    return new ShaderMaterial({
        uniforms: { ...sceneUniforms, ...uniforms },
        defines: { ...defines },
        vertexShader: projectionVertex(vertexPars, vertexMain),
        fragmentShader: projectionFragment(fragment),
        side: BackSide,
        transparent: true,
        depthWrite: false,
        depthFunc: GreaterEqualDepth,
        ...blend,
    });
}

const volumeGeometry = new BoxGeometry(1, 1, 1);

export function createProjectionVolume(material) {
    const volume = new Mesh(volumeGeometry, material);
    volume.layers.set(VFX_LAYER);
    volume.renderOrder = DECAL_RENDER_ORDER;
    return volume;
}

const decalVertexPars = `
attribute vec4 iColor;
attribute vec4 iParams;
attribute vec4 iUvRect;
flat varying vec4 vDecalColor;
flat varying vec4 vDecalParams;
flat varying vec4 vDecalUvRect;
`;

const decalVertexMain = `
    vDecalColor = iColor;
    vDecalParams = iParams;
    vDecalUvRect = iUvRect;
`;

const decalFragment = `
uniform sampler2D map;
flat varying vec4 vDecalColor;
flat varying vec4 vDecalParams;
flat varying vec4 vDecalUvRect;

vec4 projectionColor(vec3 world, vec3 local, vec3 normal, float facing) {
    vec4 color = vDecalColor;
    if (vDecalParams.x > 0.5 && vDecalParams.x < 1.5) {
        float towardCenter = dot(normal, normalize(vProjectionCenter - world));
        color.a *= pow(saturate(1.0 - length(local) * 2.0), vDecalParams.w) * mix(1.0, smoothstep(-0.3, 0.3, towardCenter), vDecalParams.z);
        return color;
    }
    if (vDecalParams.x < 0.5) color *= textureLod(map, vDecalUvRect.xy + (local.xz + 0.5) * vDecalUvRect.zw, 0.0);
    else color.a *= 1.0 - smoothstep(0.0, vDecalParams.w, abs(length(local.xz) * 2.0 - 1.0 + vDecalParams.w));
    color.a *= smoothstep(0.0, max(vDecalParams.y, 0.0001), 1.0 - abs(local.y) * 2.0) * mix(1.0, smoothstep(0.0, 0.5, facing), vDecalParams.z);
    return color;
}
`;

const decalPools = new Map();
let decalScene = null;

function decalPool(blending, texture) {
    const key = `${blending}|${texture?.uuid ?? ""}`;
    let pool = decalPools.get(key);
    if (!pool) {
        const material = createProjectionMaterial({ fragment: decalFragment, vertexPars: decalVertexPars, vertexMain: decalVertexMain, uniforms: { map: { value: texture ?? white } }, blending });
        pool = new InstancePool(new BoxGeometry(1, 1, 1), material, { iColor: 4, iParams: 4, iUvRect: 4 }, "decals");
        pool.renderOrder = DECAL_RENDER_ORDER;
        decalPools.set(key, pool);
        decalScene.add(pool);
    }
    return pool;
}

export function attachDecals(scene) {
    for (const pool of decalPools.values()) pool.destroy();
    decalPools.clear();
    decalScene = scene;
    for (const blending in BLENDS) decalPool(blending, null);
}

export class ProjectedDecal extends PooledEffect {
    constructor({ position, size = 1, depth = 0.5, rotation = 0, normal, color = 0xffffff, opacity = 1, blending = "additive", texture = null, uvRect = [0, 0, 1, 1], pattern = texture ? "texture" : "glow", falloff = 2, width = 0.15, fade = 0.5, angleFade = 1, ...lifetime } = {}) {
        super(decalPool(blending, texture), lifetime);
        this.color = new Color(color);
        this.opacity = opacity;
        this.pattern = pattern;
        this.shape = pattern === "ring" ? width : falloff;
        this.fade = fade;
        this.angleFade = angleFade;
        this.uvRect = uvRect;
        if (position) this.position.copy(position);
        if (normal) this.quaternion.setFromUnitVectors(Object3D.DEFAULT_UP, normal);
        this.rotateY(rotation);
        this.scale.set(size.x ?? size, depth, size.y ?? size);
    }

    write(attributes, index) {
        attributes.iColor.setXYZW(index, this.color.r, this.color.g, this.color.b, this.opacity * this.envelope);
        attributes.iParams.setXYZW(index, PATTERNS[this.pattern], this.fade, this.angleFade, this.shape);
        attributes.iUvRect.setXYZW(index, ...this.uvRect);
    }
}
