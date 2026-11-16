import * as THREE from "three";
import { SURFACE_CHANNELS } from "./surfaceMap.js";
import { onShelterRendered } from "./surfaceSystem.js";
import { Region3D } from "../../entities/region3d.js";

const MODULE_ID = "levels-3d-preview";
const MAX_SOURCES = 128;
const FLOOR = 0.04;
const DEBOUNCE = 250;
const TOKEN_INTERVAL = 0.25;
const SNOW_STEP = 0.05;
const ROOF_CLEARANCE = 1;
const TOKEN_MOVE = 0.05;

export const HEAT_PRESETS = {
    candle: { fraction: 0.6, min: 0.2, max: 0.5 },
    torch: { fraction: 0.25, min: 0.6, max: 1.5 },
    campfire: { fraction: 0.67, min: 1.2, max: 3 },
    brazier: { fraction: 0.5, min: 1, max: 2.25 },
};

export const HEAT_ANIMATIONS = {
    torch: { fraction: 0.25, min: 0.6, max: 1.5 },
    flame: { fraction: 0.2, min: 0.3, max: 1.2 },
    fire: { fraction: 0.25, min: 0.6, max: 1.5 },
};

const MAX_EDGES = 64;
const RADIUS_JITTER = 0.2;
const DISC_EXTENT = 1.25;

const heatUniforms = { uDepth: { value: 1 }, uSquare: { value: 0.1 } };

const heatNoise = /* glsl */ `
uniform float uDepth;
uniform float uSquare;
float heatHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float heatValue(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(heatHash(i), heatHash(i + vec2(1.0, 0.0)), f.x), mix(heatHash(i + vec2(0.0, 1.0)), heatHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float heatEdge(vec2 world, float seed) {
    vec2 p = world / uSquare + seed * 37.0;
    return 0.65 * heatValue(p / 0.3) + 0.35 * heatValue(p / 0.12 + 11.0) - 0.5;
}
`;

const discMaterial = new THREE.ShaderMaterial({
    uniforms: heatUniforms,
    vertexShader: /* glsl */ `
attribute vec4 aDisc;
varying vec2 vLocal;
varying vec2 vWorld;
varying float vSeed;
void main() {
    vLocal = position.xy * ${DISC_EXTENT.toFixed(2)};
    vec2 world = aDisc.xy + vLocal * aDisc.z;
    vWorld = world;
    vSeed = aDisc.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(world.x, 0.0, world.y, 1.0);
}
`,
    fragmentShader: /* glsl */ `
${heatNoise}
varying vec2 vLocal;
varying vec2 vWorld;
varying float vSeed;
void main() {
    float d = length(vLocal) + 0.35 * heatEdge(vWorld, vSeed);
    float heat = 1.0 - smoothstep(0.3, 1.0, d);
    gl_FragColor = vec4(1.0 - heat * uDepth);
}
`,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MinEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
});

function createRegionMaterial(points) {
    const edges = Array.from({ length: MAX_EDGES }, () => new THREE.Vector4());
    const step = Math.max(1, Math.ceil(points.length / MAX_EDGES));
    const sampled = points.filter((point, index) => index % step === 0);
    sampled.forEach((point, index) => {
        const next = sampled[(index + 1) % sampled.length];
        edges[index].set(point.x, point.y, next.x, next.y);
    });
    return new THREE.ShaderMaterial({
        uniforms: { ...heatUniforms, uEdges: { value: edges }, uEdgeCount: { value: sampled.length } },
        vertexShader: "varying vec2 vWorld; void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xz; gl_Position = projectionMatrix * viewMatrix * world; }",
        fragmentShader: /* glsl */ `
${heatNoise}
uniform vec4 uEdges[${MAX_EDGES}];
uniform int uEdgeCount;
varying vec2 vWorld;
void main() {
    float dist = 1e9;
    for (int i = 0; i < ${MAX_EDGES}; i++) {
        if (i >= uEdgeCount) break;
        vec2 a = uEdges[i].xy;
        vec2 ab = uEdges[i].zw - a;
        float t = clamp(dot(vWorld - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
        dist = min(dist, length(vWorld - a - ab * t));
    }
    float heat = smoothstep(0.0, 0.3, dist / uSquare + 0.3 * heatEdge(vWorld, 0.0) - 0.05);
    gl_FragColor = vec4(1.0 - heat * uDepth);
}
`,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.MinEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
    });
}

function sourceSeed(id) {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    return (hash >>> 0) / 4294967296;
}

function heatProfile(document, light) {
    const preset = document.getFlag?.(MODULE_ID, "lightPreset") ?? document.flags?.[MODULE_ID]?.lightPreset;
    if (preset) return HEAT_PRESETS[preset] ?? null;
    return HEAT_ANIMATIONS[light?.animation?.type] ?? null;
}

function heatRadius(profile, light, scene) {
    const bright = Math.max(Number(light?.bright) || 0, 0) / (scene.grid.distance || 1);
    return Math.clamp(bright * profile.fraction, profile.min, profile.max);
}

export class SurfaceHeat {
    constructor(system) {
        this.system = system;
        const geometry = new THREE.InstancedBufferGeometry();
        const plane = new THREE.PlaneGeometry(2, 2);
        geometry.index = plane.index;
        geometry.setAttribute("position", plane.getAttribute("position"));
        geometry.setAttribute("aDisc", new THREE.InstancedBufferAttribute(new Float32Array(MAX_SOURCES * 4), 4).setUsage(THREE.DynamicDrawUsage));
        geometry.instanceCount = 0;
        this.discs = new THREE.Mesh(geometry, discMaterial);
        this.discs.frustumCulled = false;
        this.scene = new THREE.Scene();
        this.scene.add(this.discs);
        this.regionMeshes = [];
        this.regionsDirty = true;
        this.dirty = true;
        this.depth = 0;
        this.tokenTimer = 0;
        this.tokenSignature = "";
        this.stats = { sources: 0, regions: 0, ms: 0 };
        this.invalidate = foundry.utils.debounce(() => (this.dirty = true), DEBOUNCE);
        this.unsubscribe = onShelterRendered(() => this.restamp());
        this.hooks = [
            ["createAmbientLight", (document) => this.onLight(document)],
            ["updateAmbientLight", (document) => this.onLight(document)],
            ["deleteAmbientLight", (document) => this.onLight(document)],
            ["createToken", (document) => this.onToken(document)],
            ["updateToken", (document, changes) => this.onToken(document, changes)],
            ["deleteToken", (document) => this.onToken(document)],
            ["createRegion", (document) => this.onRegion(document)],
            ["updateRegion", (document) => this.onRegion(document)],
            ["deleteRegion", (document) => this.onRegion(document)],
        ].map(([hook, fn]) => [hook, Hooks.on(hook, fn)]);
    }

    get snowDepth() {
        const snow = this.system.amounts?.snow ?? 0;
        return Math.round(snow / SNOW_STEP) * SNOW_STEP * (1 - FLOOR);
    }

    onLight(document) {
        if (document.parent === canvas.scene) this.invalidate();
    }

    onToken(document, changes) {
        if (document.parent !== canvas.scene) return;
        if (changes && !("light" in changes) && !foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.lightPreset`) && !("hidden" in changes) && !heatProfile(document, document.light)) return;
        this.invalidate();
    }

    onRegion(document) {
        if (document.parent !== canvas.scene) return;
        this.regionsDirty = true;
        this.invalidate();
    }

    update(delta, ready) {
        if (!ready || !this.system.map) return;
        const depth = this.snowDepth;
        if (depth !== this.depth) this.dirty = true;
        this.tokenTimer -= delta;
        if (this.tokenTimer <= 0) {
            this.tokenTimer = TOKEN_INTERVAL;
            const signature = this.tokenSources().map((source) => `${Math.round(source.x / TOKEN_MOVE)},${Math.round(source.z / TOKEN_MOVE)}`).join("|");
            if (signature !== this.tokenSignature) {
                this.tokenSignature = signature;
                this.dirty = true;
            }
        }
        if (!this.dirty) return;
        const map = this.system.map;
        if (this.depth > 0 || depth > 0) map.copyFromShelter(this.system.shelter);
        this.restamp();
    }

    restamp() {
        this.dirty = false;
        const map = this.system.map;
        const shelter = this.system.shelter;
        this.depth = this.snowDepth;
        if (!map || !shelter?.ready || !(this.depth > 0)) return;
        const start = performance.now();
        const sources = [...this.lightSources(), ...this.tokenSources()].filter((source) => this.exposed(shelter, source));
        const array = this.discs.geometry.attributes.aDisc.array;
        const count = Math.min(sources.length, MAX_SOURCES);
        for (let i = 0; i < count; i++) {
            const seed = sourceSeed(sources[i].id);
            array.set([sources[i].x, sources[i].z, sources[i].radius * (1 + RADIUS_JITTER * (seed * 2 - 1)), seed], i * 4);
        }
        this.discs.geometry.instanceCount = count;
        this.discs.geometry.attributes.aDisc.needsUpdate = true;
        this.discs.visible = count > 0;
        if (this.regionsDirty) this.buildRegions();
        heatUniforms.uDepth.value = this.depth;
        heatUniforms.uSquare.value = canvas.scene.dimensions.size / game.Levels3DPreview.factor;
        if (count || this.regionMeshes.length) map.stamp(this.scene, SURFACE_CHANNELS.mask);
        this.stats = { sources: count, regions: this.regionMeshes.length, ms: performance.now() - start };
    }

    exposed(shelter, source) {
        const square = canvas.scene.dimensions.size / game.Levels3DPreview.factor;
        return shelter.heightAt(source.x, source.z) <= source.y + ROOF_CLEARANCE * square;
    }

    lightSources() {
        const scene = canvas.scene;
        const { size, distance } = scene.dimensions;
        const factor = game.Levels3DPreview.factor;
        const square = size / factor;
        const sources = [];
        for (const light of scene.lights) {
            if (light.hidden) continue;
            const profile = heatProfile(light, light.config);
            if (!profile) continue;
            sources.push({ id: light.id, x: light.x / factor, z: light.y / factor, y: ((light.elevation || 0) * size) / distance / factor, radius: heatRadius(profile, light.config, scene) * square });
        }
        return sources;
    }

    tokenSources() {
        const scene = canvas.scene;
        const square = scene.dimensions.size / game.Levels3DPreview.factor;
        const sources = [];
        for (const token3d of Object.values(game.Levels3DPreview?.tokens ?? {})) {
            const document = token3d?.document;
            const mesh = token3d?.mesh;
            if (!document || !mesh || document.hidden || !(document.light?.bright > 0 || document.light?.dim > 0)) continue;
            const profile = heatProfile(document, document.light);
            if (!profile) continue;
            sources.push({ id: document.id, x: mesh.position.x, z: mesh.position.z, y: mesh.position.y, radius: heatRadius(profile, document.light, scene) * square });
        }
        return sources;
    }

    buildRegions() {
        for (const mesh of this.regionMeshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.regionMeshes = [];
        this.regionsDirty = false;
        const factor = game.Levels3DPreview.factor;
        for (const [region, region3d] of Region3D.regions) {
            if (region.parent !== canvas.scene || !region3d?.effect || region3d.fx?.id !== "fire") continue;
            for (const polygon of region.polygons ?? []) {
                const points = [];
                for (let i = 0; i < polygon.points.length; i += 2) points.push(new THREE.Vector2(polygon.points[i] / factor, polygon.points[i + 1] / factor));
                if (points.length < 3) continue;
                const mesh = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(points)).rotateX(Math.PI / 2), createRegionMaterial(points));
                mesh.frustumCulled = false;
                this.scene.add(mesh);
                this.regionMeshes.push(mesh);
            }
        }
    }

    dispose() {
        this.unsubscribe?.();
        for (const [hook, id] of this.hooks) Hooks.off(hook, id);
        for (const mesh of this.regionMeshes) {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.regionMeshes = [];
        this.discs.geometry.dispose();
    }
}
