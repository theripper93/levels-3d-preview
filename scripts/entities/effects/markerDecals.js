import * as THREE from "three";
import { factor } from "../../main.js";

export const markerTime = { value: 0 };

export function tickMarkers() {
    markerTime.value = performance.now() / 1000;
}

export function gridUnit() {
    return canvas.grid.size / factor;
}

export function gridShapeId() {
    const grid = canvas.grid;
    if (grid.isHexagonal) return grid.columns ? 2 : 3;
    if (grid.isGridless) return 0;
    return 1;
}

export const decalPlaneGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const SDF = `
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, float b) { vec2 d = abs(p) - vec2(b); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdHex(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}
float sdShape(vec2 p, float r, int shape) {
    if (shape == 1) return sdBox(p, r);
    if (shape == 2) return sdHex(p, r * 0.92);
    if (shape == 3) return sdHex(p.yx, r * 0.92);
    return sdCircle(p, r);
}
float band(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
float fill(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }
vec4 over(vec4 top, vec4 bottom) {
    float a = top.a + bottom.a * (1.0 - top.a);
    vec3 c = (top.rgb * top.a + bottom.rgb * bottom.a * (1.0 - top.a)) / max(a, 1e-4);
    return vec4(c, a);
}
`;

const DECAL_VERTEX = `
varying vec2 vP;
void main() {
    vP = uv * 2.0 - 1.0;
    vP.y = -vP.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const decalCache = new Map();

export function decalMaterial(key, fragmentBody, uniforms = {}) {
    let material = decalCache.get(key);
    if (material) return material;
    material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        uniforms: { uTime: markerTime, uShape: { value: 0 }, uSize: { value: 1 }, uColor: { value: new THREE.Color(1, 1, 1) }, ...uniforms },
        vertexShader: DECAL_VERTEX,
        fragmentShader: `
uniform float uTime;
uniform int uShape;
uniform float uSize;
uniform vec3 uColor;
varying vec2 vP;
${SDF}
void main() {
    vec2 p = vP;
    float aa = fwidth(length(p)) * 1.5;
    float k = 1.0 / uSize;
    vec4 outColor = vec4(0.0);
    ${fragmentBody}
    gl_FragColor = outColor;
}
`,
    });
    material.userData.noVisionMode = true;
    decalCache.set(key, material);
    return material;
}

export function markerMesh(geometry, material, renderOrder = 5) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = renderOrder;
    mesh.onBeforeRender = tickMarkers;
    mesh.raycast = () => {};
    mesh.userData.ignoreHover = true;
    mesh.userData.ignoreIntersect = true;
    mesh.userData.noIntersect = true;
    mesh.userData.interactive = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
}

const glowCache = new Map();

export function glowMaterial(color, boost = 1.7) {
    const c = new THREE.Color(color);
    const key = `${c.getHexString()}|${boost}`;
    let material = glowCache.get(key);
    if (!material) {
        material = new THREE.MeshBasicMaterial({ color: c.multiplyScalar(boost), toneMapped: false });
        material.userData.noVisionMode = true;
        glowCache.set(key, material);
    }
    return material;
}

export const markerOutlineMaterial = new THREE.MeshBasicMaterial({ color: 0x05070a, side: THREE.BackSide, transparent: true, opacity: 0.75, depthWrite: false });
markerOutlineMaterial.userData.noVisionMode = true;
