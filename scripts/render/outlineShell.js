import * as THREE from "three";

export const OUTLINE_LAYER = 27;
export const OUTLINE_ORDER = Number.MAX_SAFE_INTEGER - 8;

const MARK_DEPTH = -0.99999;
const RIM_DEPTH = -0.9999;

const vertexShader = `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform vec2 outlineResolution;
uniform float outlineWidth;
uniform float outlineDepth;
uniform vec3 outlineCenter;
varying vec2 vOutlineCenter;

void main() {
    #include <morphinstance_vertex>
    #include <batching_vertex>
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vec2 halfResolution = outlineResolution * 0.5;
    vec4 center = projectionMatrix * viewMatrix * vec4(outlineCenter, 1.0);
    vOutlineCenter = (center.xy / max(center.w, 1e-4) * 0.5 + 0.5) * outlineResolution;
    vec2 radial = center.w > 0.0 ? (gl_Position.xy / gl_Position.w - center.xy / center.w) * halfResolution : vec2(0.0);
    float radialLength = length(radial);
    radial = radialLength > 1e-4 ? radial / radialLength : vec2(0.0);
    float normalLength = length(transformedNormal);
    float facingLength = normalLength > 1e-6 ? length(transformedNormal.xy) / normalLength : 0.0;
    vec2 normalDirection = facingLength > 1e-4 ? normalize(transformedNormal.xy) : vec2(0.0);
    vec2 direction = mix(radial, normalDirection, smoothstep(0.05, 0.4, facingLength));
    float directionLength = length(direction);
    direction = directionLength > 1e-4 ? direction / directionLength : vec2(0.0);
    gl_Position.xy += direction * outlineWidth / halfResolution * gl_Position.w;
    gl_Position.z = outlineDepth * gl_Position.w;
}
`;

const fragmentShader = `
uniform vec3 outlineColor;
uniform float outlineOpacity;

void main() {
    gl_FragColor = vec4(outlineColor, outlineOpacity);
}
`;

const dashedFragmentShader = `
uniform vec3 outlineColor;
uniform float outlineOpacity;
uniform vec2 outlineDash;
varying vec2 vOutlineCenter;

void main() {
    vec2 offset = gl_FragCoord.xy - vOutlineCenter;
    float arc = atan(offset.y, offset.x) * length(offset) / outlineDash.x - outlineDash.y;
    float edge = min(fwidth(arc), 0.25);
    float dash = 1.0 - smoothstep(0.25 - edge, 0.25 + edge, abs(fract(arc) - 0.5));
    gl_FragColor = vec4(outlineColor, outlineOpacity * dash);
}
`;

function createMaterial(resolution, { width, depth, opacity, mark, dashed }) {
    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: dashed && !mark ? dashedFragmentShader : fragmentShader,
        uniforms: {
            outlineResolution: resolution,
            outlineWidth: { value: width },
            outlineDepth: { value: depth },
            outlineCenter: { value: new THREE.Vector3() },
            outlineColor: { value: new THREE.Color() },
            outlineOpacity: { value: opacity },
            outlineDash: { value: new THREE.Vector2(10, 0) },
        },
        transparent: true,
        forceSinglePass: true,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: true,
        depthFunc: mark ? THREE.AlwaysDepth : THREE.LessDepth,
        colorWrite: !mark,
        fog: false,
        lights: false,
        toneMapped: false,
    });
    Object.defineProperty(material, "onBeforeCompile", { value: () => {}, writable: true, configurable: true });
    return material;
}

export function createOutlineMaterials(resolution, layers, dashed = false) {
    return [createMaterial(resolution, { width: 0, depth: MARK_DEPTH, opacity: 0, mark: true }), ...layers.map((layer) => createMaterial(resolution, { ...layer, depth: RIM_DEPTH, mark: false, dashed }))];
}

export function isOutlineSource(object) {
    if (!object.isMesh || object.isBatchedMesh || object.userData?.noOutline) return false;
    if (!object.geometry?.attributes?.position) return false;
    return [object.material].flat().some((material) => material?.visible);
}

const noRaycast = () => {};

export function createProxy(source, material, renderOrder, color) {
    let proxy;
    if (source.isSkinnedMesh) {
        proxy = new THREE.SkinnedMesh(source.geometry, material);
        proxy.skeleton = source.skeleton;
        proxy.bindMatrix = source.bindMatrix;
        proxy.bindMatrixInverse = source.bindMatrixInverse;
        proxy.bindMode = source.bindMode;
    } else if (source.isInstancedMesh) {
        proxy = new THREE.InstancedMesh(source.geometry, material, 0);
        proxy.instanceMatrix = source.instanceMatrix;
        proxy.morphTexture = source.morphTexture;
    } else {
        proxy = new THREE.Mesh(source.geometry, material);
    }
    proxy.morphTargetInfluences = source.morphTargetInfluences;
    proxy.morphTargetDictionary = source.morphTargetDictionary;
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorldAutoUpdate = false;
    proxy.frustumCulled = false;
    proxy.castShadow = false;
    proxy.receiveShadow = false;
    proxy.renderOrder = renderOrder;
    proxy.layers.set(OUTLINE_LAYER);
    proxy.raycast = noRaycast;
    Object.assign(proxy.userData, { noIntersect: true, ignoreHover: true, ignoreIntersect: true, noOutline: true, noShaders: true, noSurface: true });
    if (!source.geometry.boundingSphere) source.geometry.computeBoundingSphere();
    const sphere = source.geometry.boundingSphere;
    proxy.onBeforeRender = (renderer, scene, camera, geometry, material) => {
        proxy.matrixWorld.copy(source.matrixWorld);
        if (source.isInstancedMesh) proxy.count = source.count;
        const uniforms = material.uniforms;
        uniforms.outlineCenter.value.copy(sphere.center).applyMatrix4(source.matrixWorld);
        if (color) uniforms.outlineColor.value.copy(color);
        material.uniformsNeedUpdate = true;
    };
    return proxy;
}
