import * as THREE from "three";
import { SURFACE_CHANNELS } from "./surfaceMap.js";
import { depositTarget, surfaceSettings } from "./state.js";
import { resolveFlag } from "../weather/presets.js";

const MODULE_ID = "levels-3d-preview";
const MAX_SEGMENTS = 128;
const WIDTH = 0.55;
const STEP_PERIOD = 0.4;
const MIN_COVER = 0.02;
const TELEPORT = 2;
const JUMP = 0.6;
const GROUND_TOLERANCE = 0.2;
const MIN_STEP = 0.02;
const REFILL = 1.5;
const FADE_STEP = 2 / 255;
const RATE_INTERVAL = 1;

const stampMaterial = new THREE.ShaderMaterial({
    uniforms: { uTexel: { value: 0.01 }, uSquare: { value: 0.1 }, uPeriod: { value: STEP_PERIOD } },
    vertexShader: /* glsl */ `
attribute vec4 aSegment;
attribute vec2 aShape;
varying vec2 vWorld;
varying vec4 vSegment;
varying vec2 vShape;
uniform float uTexel;
void main() {
    float pad = aShape.x + uTexel * 2.0;
    vec2 lo = min(aSegment.xy, aSegment.zw) - pad;
    vec2 hi = max(aSegment.xy, aSegment.zw) + pad;
    vec2 world = mix(lo, hi, position.xy * 0.5 + 0.5);
    vWorld = world;
    vSegment = aSegment;
    vShape = aShape;
    gl_Position = projectionMatrix * viewMatrix * vec4(world.x, 0.0, world.y, 1.0);
}
`,
    fragmentShader: /* glsl */ `
uniform float uTexel;
uniform float uSquare;
uniform float uPeriod;
varying vec2 vWorld;
varying vec4 vSegment;
varying vec2 vShape;
void main() {
    vec2 a = vSegment.xy;
    vec2 ab = vSegment.zw - a;
    float len2 = max(dot(ab, ab), 1e-8);
    float t = clamp(dot(vWorld - a, ab) / len2, 0.0, 1.0);
    float radius = max(vShape.x, 1e-5);
    float u = length(vWorld - a - ab * t) / radius;
    float aa = uTexel / radius;
    float groove = 1.0 - smoothstep(0.42 - aa, 0.68 + aa, u);
    float rim = 1.0 - smoothstep(0.86 - aa, 1.0 + aa, u);
    float travel = vShape.y + t * sqrt(len2) / uSquare;
    float phase = abs(fract(travel / uPeriod) - 0.5);
    float soft = clamp(uTexel / (uSquare * uPeriod), 0.02, 0.2);
    float print = 1.0 - smoothstep(0.2 - soft, 0.3 + soft, phase);
    gl_FragColor = vec4(max(groove * mix(0.72, 1.0, print), 0.36 * rim));
}
`,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
});

const fadeMaterial = new THREE.ShaderMaterial({
    uniforms: { uAmount: { value: 0 } },
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform float uAmount; void main() { gl_FragColor = vec4(uAmount); }",
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.ReverseSubtractEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
});

function createStampMesh() {
    const geometry = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(2, 2);
    geometry.index = plane.index;
    geometry.setAttribute("position", plane.getAttribute("position"));
    geometry.setAttribute("aSegment", new THREE.InstancedBufferAttribute(new Float32Array(MAX_SEGMENTS * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aShape", new THREE.InstancedBufferAttribute(new Float32Array(MAX_SEGMENTS * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const mesh = new THREE.Mesh(geometry, stampMaterial);
    mesh.frustumCulled = false;
    return mesh;
}

export class SurfaceTrails {
    constructor(system) {
        this.system = system;
        this.mesh = createStampMesh();
        this.scene = new THREE.Scene();
        this.scene.add(this.mesh);
        this.fadeScene = new THREE.Scene();
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMaterial);
        quad.frustumCulled = false;
        this.fadeScene.add(quad);
        this.last = new Map();
        this.dirty = false;
        this.fade = 0;
        this.rate = 0;
        this.rateTimer = 0;
        this.stats = { segments: 0, ms: 0 };
    }

    get enabled() {
        return this.system.quality >= 2;
    }

    update(delta, ready) {
        const map = this.system.map;
        const amounts = this.system.amounts;
        if (!map || !this.enabled) return;
        if (amounts?.interior) {
            this.last.clear();
            return;
        }
        if (!ready || !(amounts?.total > MIN_COVER)) {
            if (this.dirty && !(amounts?.total > 1e-3)) this.clear();
            this.last.clear();
            return;
        }
        const start = performance.now();
        this.refill(delta);
        const count = this.collect();
        if (count) {
            this.mesh.geometry.instanceCount = count;
            this.mesh.geometry.attributes.aSegment.needsUpdate = true;
            this.mesh.geometry.attributes.aShape.needsUpdate = true;
            stampMaterial.uniforms.uTexel.value = map.texel;
            stampMaterial.uniforms.uSquare.value = canvas.scene.dimensions.size / game.Levels3DPreview.factor;
            map.stamp(this.scene, SURFACE_CHANNELS.trail);
            this.dirty = true;
        }
        this.stats.segments = count;
        this.stats.ms = performance.now() - start;
    }

    depositionRate(delta) {
        this.rateTimer -= delta;
        if (this.rateTimer > 0) return this.rate;
        this.rateTimer = RATE_INTERVAL;
        const scene = canvas.scene;
        const target = depositTarget(resolveFlag(scene), scene.flags?.[MODULE_ID] ?? {});
        this.rate = target.cover > 0 ? target.build / (surfaceSettings(scene).buildTime * 60) : 0;
        return this.rate;
    }

    refill(delta) {
        const rate = this.depositionRate(delta);
        if (!this.dirty || !(rate > 0)) return;
        this.fade += rate * REFILL * delta;
        if (this.fade < FADE_STEP) return;
        const amount = Math.floor(this.fade * 255) / 255;
        this.fade -= amount;
        fadeMaterial.uniforms.uAmount.value = amount;
        this.system.map.stamp(this.fadeScene, SURFACE_CHANNELS.trail);
    }

    collect() {
        const tokens = game.Levels3DPreview?.tokens ?? {};
        const shelter = this.system.shelter;
        const factor = game.Levels3DPreview.factor;
        const square = canvas.scene.dimensions.size / factor;
        const segments = this.mesh.geometry.attributes.aSegment.array;
        const shapes = this.mesh.geometry.attributes.aShape.array;
        const seen = new Set();
        let count = 0;
        for (const [id, token3d] of Object.entries(tokens)) {
            const mesh = token3d?.mesh;
            if (!mesh) continue;
            seen.add(id);
            const x = mesh.position.x;
            const y = mesh.position.y;
            const z = mesh.position.z;
            const previous = this.last.get(id);
            if (!previous) {
                this.last.set(id, { x, y, z, travel: 0 });
                continue;
            }
            const distance = Math.hypot(x - previous.x, z - previous.z);
            if (distance < MIN_STEP * square) continue;
            const animating = !!token3d.placeable?.animationContexts?.size;
            const valid = distance <= TELEPORT * square && (animating || distance <= JUMP * square);
            if (valid && count < MAX_SEGMENTS && !token3d.document?.hidden && mesh.visible && this.grounded(shelter, x, y, z, square)) {
                const size = Math.max(token3d.document?.width ?? 1, token3d.document?.height ?? 1, 0.25);
                segments.set([previous.x, previous.z, x, z], count * 4);
                shapes[count * 2] = (WIDTH * size * square) / 2;
                shapes[count * 2 + 1] = previous.travel;
                count++;
            }
            previous.travel = (previous.travel + distance / square) % (STEP_PERIOD * 64);
            previous.x = x;
            previous.y = y;
            previous.z = z;
        }
        for (const id of this.last.keys()) if (!seen.has(id)) this.last.delete(id);
        return count;
    }

    grounded(shelter, x, y, z, square) {
        if (!shelter?.ready) return false;
        const top = shelter.heightAt(x, z);
        return Math.abs(y - top) <= Math.max(GROUND_TOLERANCE * square, this.system.map.texel * 2);
    }

    clear() {
        this.system.map?.clear(SURFACE_CHANNELS.trail, [0, 0, 0, 0]);
        this.dirty = false;
        this.fade = 0;
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.fadeScene.children[0].geometry.dispose();
        this.last.clear();
    }
}
