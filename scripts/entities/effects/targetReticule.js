import * as THREE from "three";
import { factor } from "../../main.js";
import { markerTime, tickMarkers } from "./markerDecals.js";

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 s = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
    mv.xy += position.xy * s;
    gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uOutline;
uniform vec2 uBox;
uniform float uLeg;
uniform float uLine;
varying vec2 vUv;
void main() {
    float t = mod(uTime * 1000.0, 2000.0);
    float k = max(0.0, t - 1200.0) / 800.0;
    float ease = sqrt(max(0.0, 1.0 - (k - 1.0) * (k - 1.0)));
    float margin = t < 1200.0 ? 0.5 : 0.5 + 0.5 * ease;
    float fade = 1.0 - max(0.0, t - 1800.0) / 200.0;
    vec2 p = abs(vUv - 0.5);
    vec2 q = p - (uBox - margin * uLeg);
    float d = max(max(-q.x, -q.y), (q.x + q.y - uLeg) * 0.70710678);
    float px = max(fwidth(d), 1e-5);
    float alpha = 1.0 - smoothstep(uLine - px, uLine + px, d);
    if (alpha <= 0.0) discard;
    vec3 color = mix(uColor, uOutline, smoothstep(-uLine - px, -uLine + px, d));
    gl_FragColor = vec4(color, alpha * fade);
    #include <colorspace_fragment>
}
`;

const geometry = new THREE.PlaneGeometry(1, 1);

export function createTargetReticule() {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: markerTime,
            uColor: { value: new THREE.Color(0xffffff) },
            uOutline: { value: new THREE.Color(0x000000) },
            uBox: { value: new THREE.Vector2(0.3, 0.3) },
            uLeg: { value: 0.1 },
            uLine: { value: 0.01 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1e20;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    mesh.onBeforeRender = tickMarkers;
    return mesh;
}

export function fitTargetReticule(mesh, token) {
    const uiScale = canvas.dimensions.uiScale ?? 1;
    const grid = canvas.grid.size;
    const width = (token.document.width * grid) / factor;
    const height = (token.document.height * grid) / factor;
    const leg = (CONFIG.Canvas.targeting.size * 100 * uiScale) / factor;
    const line = uiScale / factor;
    const size = Math.max(width, height) + 2 * (leg + line * 2);
    const uniforms = mesh.material.uniforms;
    uniforms.uBox.value.set(width / 2 / size, height / 2 / size);
    uniforms.uLeg.value = leg / size;
    uniforms.uLine.value = line / size;
    uniforms.uColor.value.set(token._getBorderColor() ?? 0xffffff);
    mesh.scale.setScalar(size);
}
