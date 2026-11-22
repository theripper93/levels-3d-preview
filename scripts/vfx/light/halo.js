import { AdditiveBlending, Color, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial } from "three";
import { VFX_LAYER } from "../constants.js";
import { sceneUniforms } from "../render/sceneBuffer.js";
import { refreshWorldMatrix } from "../../three/matrixWorld.js";

const vertexShader = `
#include <common>
#include <vfx_fog_of_war_pars_fragment>
attribute vec3 haloColor;
attribute vec3 haloShape;
varying vec2 vUv;
flat varying vec3 vCenter;
flat varying float vFogVisible;
flat varying vec3 vColor;
flat varying float vBias;

void main() {
    vUv = uv;
    vColor = haloColor;
    vBias = haloShape.y;
    float fogReach = haloShape.z;
    vec3 world = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vFogVisible = max(vfxFogVisible(world), max(max(vfxFogVisible(world + vec3(fogReach, 0.0, 0.0)), vfxFogVisible(world - vec3(fogReach, 0.0, 0.0))), max(vfxFogVisible(world + vec3(0.0, 0.0, fogReach)), vfxFogVisible(world - vec3(0.0, 0.0, fogReach)))));
    vec4 center = viewMatrix * vec4(world, 1.0);
    vec4 clipCenter = projectionMatrix * center;
    vCenter = clipCenter.xyz / max(clipCenter.w, 0.0001);
    center.xy += position.xy * haloShape.x;
    gl_Position = vFogVisible > 0.0 ? projectionMatrix * center : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const fragmentShader = `
#include <common>
#include <vfx_scene_pars_fragment>
varying vec2 vUv;
flat varying vec3 vCenter;
flat varying float vFogVisible;
flat varying vec3 vColor;
flat varying float vBias;

float haloVisible(vec2 uv, float distance) {
    return step(distance - vBias, vfxSceneDistance(clamp(uv, vec2(0.001), vec2(0.999))));
}

void main() {
    vec2 uv = vCenter.xy * 0.5 + 0.5;
    float distance = vfxLinearDepth(vCenter.z * 0.5 + 0.5);
    vec2 tap = 2.5 / uSceneResolution;
    float visible = (haloVisible(uv, distance) * 2.0 + haloVisible(uv + vec2(tap.x, 0.0), distance) + haloVisible(uv - vec2(tap.x, 0.0), distance) + haloVisible(uv + vec2(0.0, tap.y), distance) + haloVisible(uv - vec2(0.0, tap.y), distance)) / 6.0;
    float radius = length(vUv - 0.5) * 2.0;
    float glow = pow(max(0.0, 1.0 - radius), 2.5) * 0.6 + exp(-radius * radius * 40.0) * 0.8;
    gl_FragColor = vec4(vColor * glow * visible * vFogVisible, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

const INITIAL_CAPACITY = 64;
const halos = new Set();
const _color = new Color();
let batch = null;

class HaloBatch extends InstancedMesh {
    constructor(capacity) {
        const geometry = new PlaneGeometry(1, 1);
        geometry.setAttribute("haloColor", new InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
        geometry.setAttribute("haloShape", new InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
        super(
            geometry,
            new ShaderMaterial({
                uniforms: { ...sceneUniforms },
                vertexShader,
                fragmentShader,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                blending: AdditiveBlending,
            }),
            capacity,
        );
        this.capacity = capacity;
        this.count = 0;
        this.frustumCulled = false;
        this.matrixAutoUpdate = false;
        this.layers.set(VFX_LAYER);
        this.renderOrder = 20;
        this.userData.ignoreHover = true;
        this.userData.interactive = false;
        this.userData.noShaders = true;
        this.raycast = () => {};
    }

    grow(capacity) {
        const geometry = this.geometry;
        for (const name of ["haloColor", "haloShape"]) {
            const attribute = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
            attribute.array.set(geometry.attributes[name].array);
            geometry.setAttribute(name, attribute);
        }
        const matrix = new InstancedBufferAttribute(new Float32Array(capacity * 16), 16);
        matrix.array.set(this.instanceMatrix.array);
        this.instanceMatrix = matrix;
        this.capacity = capacity;
        geometry.dispose();
    }

    sync(scene) {
        if (this.parent !== scene) scene.add(this);
        if (halos.size > this.capacity) this.grow(Math.max(halos.size, this.capacity * 2));
        const matrices = this.instanceMatrix.array;
        const colors = this.geometry.attributes.haloColor.array;
        const shapes = this.geometry.attributes.haloShape.array;
        let count = 0;
        let changed = false;
        for (const halo of halos) {
            if (!isShownIn(halo, scene)) continue;
            refreshWorldMatrix(halo);
            const m = halo.matrixWorld.elements;
            const o = count * 16;
            for (let i = 0; i < 16; i++) {
                if (matrices[o + i] === m[i]) continue;
                matrices[o + i] = m[i];
                changed = true;
            }
            _color.copy(halo.color).multiplyScalar(halo.intensity);
            changed = write3(colors, count * 3, _color.r, _color.g, _color.b) || changed;
            changed = write3(shapes, count * 3, halo.size, halo.bias, halo.fogReach) || changed;
            count++;
        }
        if (count !== this.count) {
            this.count = count;
            changed = true;
        }
        if (!changed) return;
        this.instanceMatrix.needsUpdate = true;
        this.geometry.attributes.haloColor.needsUpdate = true;
        this.geometry.attributes.haloShape.needsUpdate = true;
    }
}

function write3(array, offset, a, b, c) {
    if (array[offset] === a && array[offset + 1] === b && array[offset + 2] === c) return false;
    array[offset] = a;
    array[offset + 1] = b;
    array[offset + 2] = c;
    return true;
}

function isShownIn(object, scene) {
    for (let current = object; current; current = current.parent) {
        if (!current.visible) return false;
        if (current === scene) return true;
    }
    return false;
}

function haloBatch() {
    if (batch) return batch;
    batch = new HaloBatch(INITIAL_CAPACITY);
    const parent = game.Levels3DPreview;
    const render = parent.renderer.render;
    parent.renderer.render = function (scene, camera) {
        if (scene === parent.scene && (halos.size || batch.count)) batch.sync(scene);
        return render.call(this, scene, camera);
    };
    return batch;
}

export class LightHalo extends Object3D {
    constructor() {
        super();
        this.layers.set(VFX_LAYER);
        this.color = new Color();
        this.size = 0.1;
        this.bias = 0.02;
        this.fogReach = 0;
        this.baseIntensity = 1;
        this.intensity = 1;
        this.userData.ignoreHover = true;
        this.userData.interactive = false;
        haloBatch();
        halos.add(this);
    }

    configure({ color, size, intensity }) {
        this.color.set(color);
        this.size = size;
        this.bias = size * 0.35;
        this.fogReach = size * 0.15;
        this.baseIntensity = intensity;
    }

    update(factor) {
        this.intensity = this.baseIntensity * factor;
    }

    destroy() {
        halos.delete(this);
        this.removeFromParent();
    }
}
