import * as THREE from "three";
import { WIND_GLSL, windUniforms } from "./windSway.js";

const BATCH_VERTEX = `#include <begin_vertex>
#ifdef USE_BATCHING
{
    mat4 swM = modelMatrix * batchingMatrix;
    vec3 swWorld = (swM * vec4(transformed, 1.0)).xyz;
    vec3 swPivot = (swM * vec4(0.0, windSwayA.z, 0.0, 1.0)).xyz;
    vec3 swNew = fw_sway(swWorld, swPivot, windSwayA.y * length(swM[1].xyz), windSwayA.x, windSwayA.w, windSwayB.x, windSwayB.y);
    transformed += inverse(mat3(swM)) * (swNew - swWorld);
}
#endif`;

export function windBatchCompile(shader) {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
        .replace(
            "#include <common>",
            `#include <common>
attribute vec4 windSwayA;
attribute vec2 windSwayB;
${WIND_GLSL}`,
        )
        .replace("#include <begin_vertex>", BATCH_VERTEX);
}

const windMaterials = new WeakMap();

export function setWindSwayParams(material, params) {
    windMaterials.set(material, params);
}

export function windSwayParams(material) {
    return (material && windMaterials.get(material)) ?? null;
}

export function windSwayKey(params) {
    return params ? `${params.sway},${params.height},${params.base},${params.anchor},${params.stiffness},${params.flutter}` : "";
}

export function addWindAttributes(geometry, params) {
    const count = geometry.attributes.position.count;
    const a = new Float32Array(count * 4);
    const b = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        a[i * 4] = params.sway;
        a[i * 4 + 1] = params.height;
        a[i * 4 + 2] = params.base;
        a[i * 4 + 3] = params.anchor;
        b[i * 2] = params.stiffness;
        b[i * 2 + 1] = params.flutter;
    }
    geometry.setAttribute("windSwayA", new THREE.BufferAttribute(a, 4));
    geometry.setAttribute("windSwayB", new THREE.BufferAttribute(b, 2));
    return geometry;
}

export function windDepthMaterials() {
    return {
        depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, onBeforeCompile: windBatchCompile }),
        distance: new THREE.MeshDistanceMaterial({ onBeforeCompile: windBatchCompile }),
    };
}
