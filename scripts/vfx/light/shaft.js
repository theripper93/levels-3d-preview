import { AdditiveBlending, BufferGeometry, Color, ConeGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, Points, ShaderMaterial, Vector3 } from "three";
import { VFX_LAYER } from "../constants.js";
import { sceneUniforms } from "../render/sceneBuffer.js";

const MOTE_COUNT = 48;
const DOWN = new Vector3(0, -1, 0);
const direction = new Vector3();

const shaftVertex = `
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vViewNormal;
varying vec3 vViewDirection;

void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    vViewNormal = normalMatrix * normal;
    vViewDirection = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
}
`;

const shaftFragment = `
#include <common>
#include <vfx_scene_pars_fragment>
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vViewNormal;
varying vec3 vViewDirection;

float shaftHash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float shaftNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 blend = fract(point);
    blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(mix(shaftHash(cell), shaftHash(cell + vec2(1.0, 0.0)), blend.x), mix(shaftHash(cell + vec2(0.0, 1.0)), shaftHash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
}

void main() {
    float along = clamp(-vLocal.y, 0.0, 1.0);
    float facing = abs(dot(normalize(vViewNormal), normalize(vViewDirection)));
    float body = facing * facing;
    float fade = smoothstep(0.0, 0.12, along) * pow(1.0 - along, 1.4);
    vec2 flow = vec2(atan(vLocal.z, vLocal.x) * 3.0, along * 4.0 - uSceneTime * 0.15);
    float streaks = 0.55 + 0.45 * shaftNoise(flow) * shaftNoise(vWorld.xz * 14.0 + uSceneTime * 0.1);
    float alpha = uIntensity * body * fade * streaks * vfxSoftFade(vfxScreenUv(), 0.05);
    gl_FragColor = vec4(uColor * alpha, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

const moteVertex = `
attribute vec3 aSeed;
uniform float uSceneTime;
uniform vec2 uSceneResolution;
uniform float uMoteSize;
varying float vMote;

void main() {
    float along = fract(aSeed.x + uSceneTime * 0.012 * (0.5 + aSeed.z));
    float angle = aSeed.y * 6.2831 + uSceneTime * 0.25 * (aSeed.z - 0.5);
    float radius = sqrt(fract(aSeed.z * 7.13)) * along * 0.85;
    vec3 local = vec3(cos(angle) * radius, -along, sin(angle) * radius);
    vec4 mvPosition = modelViewMatrix * vec4(local, 1.0);
    float twinkle = 0.5 + 0.5 * sin(uSceneTime * (0.7 + aSeed.z * 1.6) + aSeed.x * 40.0);
    vMote = smoothstep(0.0, 0.15, along) * (1.0 - along) * twinkle;
    gl_PointSize = uMoteSize * uSceneResolution.y / max(-mvPosition.z, 0.001);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const moteFragment = `
#include <common>
#include <vfx_scene_pars_fragment>
uniform vec3 uColor;
uniform float uIntensity;
varying float vMote;

void main() {
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float spot = pow(max(0.0, 1.0 - radius), 2.0);
    gl_FragColor = vec4(uColor * spot * vMote * uIntensity * vfxSoftFade(vfxScreenUv(), 0.02), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

const coneGeometry = new ConeGeometry(1, 1, 32, 8, true).translate(0, -0.5, 0);

const moteGeometry = (() => {
    const seeds = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = (Math.sin(i * 12.9898 + 4.1414) * 43758.5453) % 1;
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.abs(seeds[i]);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(MOTE_COUNT * 3), 3));
    geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 3));
    return geometry;
})();

function effectMaterial(vertexShader, fragmentShader, uniforms = {}) {
    return new ShaderMaterial({
        uniforms: { ...sceneUniforms, uColor: { value: new Color() }, uIntensity: { value: 1 }, ...uniforms },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
    });
}

export function createShaftMaterials() {
    return [effectMaterial(shaftVertex, shaftFragment), effectMaterial(moteVertex, moteFragment, { uMoteSize: { value: 0.004 } })];
}

export class LightShaft extends Group {
    constructor() {
        super();
        const [shaftMaterial, moteMaterial] = createShaftMaterials();
        this.cone = new Mesh(coneGeometry, shaftMaterial);
        this.motes = new Points(moteGeometry, moteMaterial);
        for (const object of [this.cone, this.motes]) {
            object.layers.set(VFX_LAYER);
            object.frustumCulled = false;
            object.renderOrder = 15;
            object.userData.ignoreHover = true;
            object.userData.interactive = false;
            this.add(object);
        }
        this.userData.ignoreHover = true;
        this.userData.interactive = false;
    }

    configure({ color, length, angle, intensity, motes, moteSize }) {
        const radius = Math.tan(Math.min(angle, Math.PI * 0.45)) * length;
        this.scale.set(radius, length, radius);
        for (const material of [this.cone.material, this.motes.material]) material.uniforms.uColor.value.set(color);
        this.motes.material.uniforms.uMoteSize.value = moteSize;
        this.motes.visible = motes;
        this.baseIntensity = intensity;
    }

    aim(from, to) {
        direction.subVectors(to, from).normalize();
        this.quaternion.setFromUnitVectors(DOWN, direction);
    }

    update(factor) {
        this.cone.material.uniforms.uIntensity.value = this.baseIntensity * factor;
        this.motes.material.uniforms.uIntensity.value = Math.min(1, this.baseIntensity * 3) * factor;
    }

    destroy() {
        this.removeFromParent();
        this.cone.material.dispose();
        this.motes.material.dispose();
    }
}
