import * as THREE from "three";
import { surfaceParsFragment, surfaceNormalFragment, surfaceMapFragment, surfaceLightsFragment } from "./shaders.js";

const RECEIVER_TYPES = new Set(["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshLambertMaterial", "MeshPhongMaterial", "MeshBasicMaterial"]);
const EXCLUDED_SHADERS = ["water", "ocean", "fire", "ice", "lightning", "oil", "distortion"];
const SURFACE_INCLUDES = ["#include <normal_fragment_maps>", "#include <map_fragment>", "#include <lights_fragment_maps>"];

export const surfaceUniforms = {
    uSurfaceMap: { value: null },
    uSurfaceRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSurfaceY: { value: new THREE.Vector2(0, 1) },
    uSurfaceTexel: { value: 0.01 },
    uSurfaceSquare: { value: 0.1 },
    uSurfaceCover: { value: 0 },
    uSurfaceWet: { value: 0 },
    uSurfaceRain: { value: 0 },
    uSurfaceTime: { value: 0 },
    uSurfaceColor: { value: new THREE.Color(1, 1, 1) },
    uSurfaceRoughness: { value: 0.8 },
    uSurfaceSparkle: { value: 0 },
    uSurfaceLumps: { value: 0 },
    uSurfaceSnow: { value: 0 },
    uSurfaceWind: { value: new THREE.Vector2() },
    uSurfaceQuality: { value: 0 },
    uSurfaceEnabled: { value: 0 },
    uSurfaceGrowth: { value: new THREE.Vector4(1, 0, 1, 0) },
    uSurfaceAmount: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSurfaceShape: { value: new THREE.Vector4(1, 0, 1, 0) },
    uSurfaceDetail: { value: new THREE.Vector4() },
    uSurfaceStyle: { value: new THREE.Vector4(0, 1, 0.025, 1) },
    uSurfaceAmbient: { value: new THREE.Color(1, 1, 1) },
    uSurfaceSky: { value: new THREE.Color(0.5, 0.55, 0.6) },
};

let installed = false;

export function installSurfaceChunks(THREELIB = THREE) {
    if (installed) return;
    installed = true;
    THREELIB.ShaderChunk.map_fragment += surfaceMapFragment;
    THREELIB.ShaderChunk.normal_fragment_maps += surfaceNormalFragment;
    THREELIB.ShaderChunk.lights_fragment_maps += surfaceLightsFragment;
}

export function injectSurface(shader) {
    Object.assign(shader.uniforms, surfaceUniforms);
    if (SURFACE_INCLUDES.some((include) => shader.fragmentShader.includes(include))) shader.fragmentShader = surfaceParsFragment + shader.fragmentShader;
}

function isReceiver(material) {
    if (!material || !RECEIVER_TYPES.has(material.type)) return false;
    if (material.transparent || material.transmission > 0 || material.userData?.noSurface) return false;
    if (material.isMeshBasicMaterial && (material.opacity < 1 || material.blending !== THREE.NormalBlending)) return false;
    return true;
}

export function markReceivers(root, entity) {
    if (!root) return 0;
    const shaders = entity?.shaders ?? {};
    if (EXCLUDED_SHADERS.some((id) => shaders[id]?.enabled)) return 0;
    let count = 0;
    root.traverse((child) => {
        if (!child.isMesh || child.userData?.noShaders || child.userData?.noSurface) return;
        for (const material of [child.material].flat()) {
            if (!isReceiver(material)) continue;
            material.defines ??= {};
            if ("L3D_SURFACE" in material.defines) continue;
            material.defines.L3D_SURFACE = "";
            if (material.isMeshBasicMaterial) material.defines.L3D_SURFACE_BASIC = "";
            material.needsUpdate = true;
            count++;
        }
    });
    return count;
}
