import * as THREE from "three";
import { VFX_LAYER } from "../constants.js";
import { sceneUniforms } from "../render/sceneBuffer.js";
import { warm } from "../render/effectsPass.js";

const vertexShader = `
attribute vec3 aTangent;
attribute float aSide;
attribute float aAlong;
attribute float aWidth;
uniform float uWidth;
uniform float uFlat;
uniform vec3 uNormal;
varying vec2 vStrip;

void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 tangent = normalize(mat3(modelMatrix) * aTangent + vec3(1e-6));
    vec3 facing = mix(normalize(cameraPosition - world.xyz), uNormal, uFlat);
    vec3 side = cross(tangent, facing);
    float sideLength = length(side);
    side = sideLength > 1e-5 ? side / sideLength : vec3(1.0, 0.0, 0.0);
    world.xyz += side * aSide * aWidth * uWidth * 0.5;
    vStrip = vec2(aSide, aAlong);
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = `
#include <common>
#include <vfx_scene_pars_fragment>
uniform vec3 uCore;
uniform vec3 uGlow;
uniform float uIntensity;
uniform float uOpacity;
uniform float uTime;
uniform float uNoise;
uniform float uScroll;
uniform float uFrequency;
uniform float uHead;
uniform float uTail;
uniform float uTaper;
uniform float uCoreWidth;
uniform float uGlowPower;
uniform float uSoft;
uniform float uSeed;
varying vec2 vStrip;

float stripHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float stripNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(stripHash(cell), stripHash(cell + vec2(1.0, 0.0)), f.x), mix(stripHash(cell + vec2(0.0, 1.0)), stripHash(cell + vec2(1.0, 1.0)), f.x), f.y);
}

float stripFbm(vec2 p) {
    return stripNoise(p) * 0.55 + stripNoise(p * 2.1 + 3.7) * 0.3 + stripNoise(p * 4.3 + 7.1) * 0.15;
}

void main() {
    float across = abs(vStrip.x);
    float along = vStrip.y;
    float start = uHead - uTail;
    float edge = 0.03;
    float mask = (1.0 - smoothstep(uHead - edge, uHead + 0.001, along)) * smoothstep(start - 0.001, start + edge, along);
    mask *= mix(1.0, clamp((along - start) / max(uTail, 0.0001), 0.0, 1.0), uTaper);
    float n = stripFbm(vec2(along * uFrequency - uTime * uScroll, across * 1.7 + uSeed + uTime * 0.37));
    float glow = pow(1.0 - across, uGlowPower) * mix(1.0, n * 1.8, uNoise);
    float core = (1.0 - smoothstep(uCoreWidth * 0.35, uCoreWidth, across)) * mix(1.0, 0.65 + n * 0.7, uNoise * 0.6);
    float alpha = clamp(glow + core, 0.0, 1.0) * mask * uOpacity;
    if (uSoft > 0.0) alpha *= vfxSoftFade(vfxScreenUv(), uSoft);
    if (alpha < 0.002) discard;
    vec3 color = (uGlow * glow + uCore * core) / max(glow + core, 0.001) * uIntensity;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

function createMaterial(blending) {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uCore: { value: new THREE.Color(1, 1, 1) },
            uGlow: { value: new THREE.Color(1, 1, 1) },
            uIntensity: { value: 1 },
            uOpacity: { value: 1 },
            uTime: { value: 0 },
            uNoise: { value: 0.5 },
            uScroll: { value: 2 },
            uFrequency: { value: 4 },
            uHead: { value: 1 },
            uTail: { value: 1 },
            uTaper: { value: 0 },
            uCoreWidth: { value: 0.25 },
            uGlowPower: { value: 2 },
            uSoft: { value: 0 },
            uSeed: { value: 0 },
            uWidth: { value: 0.1 },
            uFlat: { value: 0 },
            uNormal: { value: new THREE.Vector3(0, 1, 0) },
        },
        vertexShader,
        fragmentShader,
        blending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    Object.assign(material.uniforms, sceneUniforms);
    return material;
}

const BLENDS = { add: THREE.AdditiveBlending, normal: THREE.NormalBlending };
warm(createMaterial(BLENDS.add), createMaterial(BLENDS.normal));

const UP = new THREE.Vector3(0, 1, 0);
const tangent = new THREE.Vector3();
const offset = new THREE.Vector3();
const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();

export class Strip extends THREE.Mesh {
    constructor({ core = "#ffffff", glow = core, width = 0.1, intensity = 1, opacity = 1, noise = 0.5, scroll = 2, frequency = 4, coreWidth = 0.25, glowPower = 2, soft = 0, blending = "add", head = 1, tail = 1, taper = 0, flat = null, renderOrder = 6 } = {}) {
        const material = createMaterial(BLENDS[blending]);
        super(new THREE.BufferGeometry(), material);
        this.capacity = 0;
        this.frustumCulled = false;
        this.renderOrder = renderOrder;
        this.layers.set(VFX_LAYER);
        const u = material.uniforms;
        u.uCore.value.set(core);
        u.uGlow.value.set(glow);
        Object.assign(this, { width, intensity, opacity, noise, scroll, frequency, coreWidth, glowPower, soft, head, tail, taper });
        u.uSeed.value = Math.random() * 100;
        if (flat) {
            u.uFlat.value = 1;
            u.uNormal.value.copy(flat.isVector3 ? flat : UP);
        }
    }

    get uniforms() {
        return this.material.uniforms;
    }

    setColors(core, glow = core) {
        this.uniforms.uCore.value.set(core);
        this.uniforms.uGlow.value.set(glow);
        return this;
    }

    allocate(count) {
        if (count <= this.capacity) return;
        this.capacity = Math.max(count, this.capacity * 2, 16);
        const geometry = this.geometry;
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("aTangent", new THREE.BufferAttribute(new Float32Array(this.capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(this.capacity * 2), 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("aWidth", new THREE.BufferAttribute(new Float32Array(this.capacity * 2), 1).setUsage(THREE.DynamicDrawUsage));
        const side = new Float32Array(this.capacity * 2);
        for (let i = 0; i < this.capacity; i++) side.set([-1, 1], i * 2);
        geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(this.capacity * 6), 1).setUsage(THREE.DynamicDrawUsage));
        this.layout = null;
    }

    setLines(lines) {
        const total = lines.reduce((sum, line) => sum + line.points.length, 0);
        this.allocate(total);
        const { position, aTangent, aAlong, aWidth } = this.geometry.attributes;
        const index = this.geometry.index;
        const layout = lines.map((line) => line.points.length).join(",");
        let vertex = 0;
        let triangles = 0;
        for (const { points, widths = 1, along = [0, 1], closed = false } of lines) {
            const count = points.length;
            for (let i = 0; i < count; i++) {
                const prev = points[closed ? (i - 1 + count) % count : Math.max(i - 1, 0)];
                const next = points[closed ? (i + 1) % count : Math.min(i + 1, count - 1)];
                tangent.subVectors(next, prev);
                const t = count > 1 ? i / (count - 1) : 0;
                const a = along[0] + (along[1] - along[0]) * t;
                const w = typeof widths === "number" ? widths : typeof widths === "function" ? widths(t) : widths[i];
                for (let s = 0; s < 2; s++) {
                    const v = (vertex + i) * 2 + s;
                    position.setXYZ(v, points[i].x, points[i].y, points[i].z);
                    aTangent.setXYZ(v, tangent.x, tangent.y, tangent.z);
                    aAlong.setX(v, a);
                    aWidth.setX(v, w);
                }
                if (layout !== this.layout && i < count - 1) {
                    const v = (vertex + i) * 2;
                    index.array.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], triangles * 3);
                    triangles += 2;
                }
            }
            vertex += count;
        }
        if (layout !== this.layout) {
            this.layout = layout;
            this.indexCount = triangles * 3;
            index.needsUpdate = true;
        }
        this.geometry.setDrawRange(0, this.indexCount);
        position.needsUpdate = aTangent.needsUpdate = aAlong.needsUpdate = aWidth.needsUpdate = true;
        return this;
    }

    sync() {
        const u = this.uniforms;
        u.uWidth.value = this.width;
        u.uIntensity.value = this.intensity;
        u.uOpacity.value = Math.max(0, this.opacity);
        u.uNoise.value = this.noise;
        u.uScroll.value = this.scroll;
        u.uFrequency.value = this.frequency;
        u.uCoreWidth.value = this.coreWidth;
        u.uGlowPower.value = this.glowPower;
        u.uSoft.value = this.soft;
        u.uHead.value = this.head;
        u.uTail.value = this.tail;
        u.uTaper.value = this.taper;
    }

    update(delta) {
        this.uniforms.uTime.value += delta;
        this.sync();
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}

export class Beam extends Strip {
    constructor({ start, end, segments = 24, wobble = 0, waves = 2, waveSpeed = 6, helix = null, ...options } = {}) {
        super(options);
        this.start = start.clone();
        this.end = end.clone();
        this.segments = segments;
        this.wobble = wobble;
        this.waves = waves;
        this.waveSpeed = waveSpeed;
        this.helix = helix;
        this.phase = Math.random() * Math.PI * 2;
        this.points = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
        this.age = 0;
        this.rebuild();
    }

    setEnds(start, end) {
        this.start.copy(start);
        this.end.copy(end);
        return this;
    }

    rebuild() {
        tangent.subVectors(this.end, this.start);
        const length = tangent.length();
        tangent.normalize();
        axisX.crossVectors(tangent, Math.abs(tangent.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
        axisY.crossVectors(axisX, tangent).normalize();
        const time = this.age * this.waveSpeed + this.phase;
        for (let i = 0; i <= this.segments; i++) {
            const t = i / this.segments;
            const point = this.points[i].lerpVectors(this.start, this.end, t);
            const envelope = Math.sin(Math.PI * t);
            if (this.wobble) {
                offset.copy(axisX).multiplyScalar(Math.sin(t * this.waves * Math.PI * 2 - time) * this.wobble * envelope);
                offset.addScaledVector(axisY, Math.cos(t * this.waves * Math.PI * 1.3 - time * 0.7) * this.wobble * 0.6 * envelope);
                point.add(offset);
            }
            if (this.helix) {
                const angle = t * length * this.helix.turns * Math.PI * 2 - this.age * this.helix.speed + this.helix.phase;
                const radius = this.helix.radius * Math.min(1, t * 6, (1 - t) * 6 + 0.35);
                point.addScaledVector(axisX, Math.cos(angle) * radius).addScaledVector(axisY, Math.sin(angle) * radius);
            }
        }
        this.setLines([{ points: this.points }]);
    }

    update(delta) {
        this.age += delta;
        this.rebuild();
        super.update(delta);
    }
}

function displace(points, start, end, depth, jitter, rng) {
    const list = [start.clone(), end.clone()];
    const direction = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let level = 0; level < depth; level++) {
        const next = [list[0]];
        for (let i = 0; i < list.length - 1; i++) {
            const a = list[i];
            const b = list[i + 1];
            direction.subVectors(b, a);
            const length = direction.length();
            side.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).projectOnPlane(direction.normalize()).normalize();
            next.push(a.clone().lerp(b, 0.4 + rng() * 0.2).addScaledVector(side, length * jitter * (0.5 + rng() * 0.5)), b);
        }
        list.splice(0, list.length, ...next);
    }
    points.push(...list);
    return points;
}

export class Bolt extends Strip {
    constructor({ start, end, depth = 5, jitter = 0.32, branches = 3, branchLength = 0.35, branchSpread = 0.9, ...options } = {}) {
        super({ noise: 0.25, scroll: 0, coreWidth: 0.35, glowPower: 3, taper: 0, ...options });
        this.start = start.clone();
        this.end = end.clone();
        Object.assign(this, { depth, jitter, branches, branchLength, branchSpread });
        this.strike();
    }

    setEnds(start, end) {
        this.start.copy(start);
        this.end.copy(end);
        return this;
    }

    strike() {
        const rng = Math.random;
        const main = displace([], this.start, this.end, this.depth, this.jitter, rng);
        const lines = [{ points: main, widths: (t) => 1 - t * 0.35, along: [0, 1] }];
        const length = this.start.distanceTo(this.end);
        const direction = new THREE.Vector3();
        for (let b = 0; b < this.branches; b++) {
            const index = 2 + Math.floor(rng() * (main.length * 0.7));
            const root = main[Math.min(index, main.length - 2)];
            const along = index / (main.length - 1);
            direction.subVectors(main[Math.min(index + 1, main.length - 1)], root).normalize();
            direction.add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(this.branchSpread * 2)).normalize();
            const branchLength = length * this.branchLength * (0.4 + rng() * 0.6) * (1 - along * 0.5);
            const tip = root.clone().addScaledVector(direction, branchLength);
            const points = displace([], root, tip, Math.max(2, this.depth - 2), this.jitter, rng);
            lines.push({ points, widths: (t) => 0.45 * (1 - t * 0.8), along: [along, Math.min(1, along + branchLength / length)] });
        }
        this.setLines(lines);
        return this;
    }
}

export class ShockRing extends Strip {
    constructor({ position, radius = 1, life = 0.6, segments = 48, normal = UP, ...options } = {}) {
        super({ flat: normal, noise: 0.6, scroll: 1.5, frequency: 12, coreWidth: 0.3, glowPower: 1.5, ...options });
        if (position) this.position.copy(position);
        this.radius = radius;
        this.life = life;
        this.age = 0;
        this.baseOpacity = this.opacity;
        this.baseWidth = this.width;
        this.quaternion.setFromUnitVectors(UP, normal);
        const points = Array.from({ length: segments }, (_, i) => new THREE.Vector3(Math.cos((i / segments) * Math.PI * 2), 0, Math.sin((i / segments) * Math.PI * 2)));
        this.setLines([{ points, closed: true }]);
        this.geometry.index.array.set([(segments - 1) * 2, (segments - 1) * 2 + 1, 0, (segments - 1) * 2 + 1, 1, 0], this.indexCount);
        this.indexCount += 6;
        this.geometry.setDrawRange(0, this.indexCount);
        this.scale.setScalar(0.0001);
    }

    update(delta) {
        this.age += delta;
        const t = Math.min(1, this.age / this.life);
        this.scale.setScalar(Math.max(0.0001, this.radius * (1 - (1 - t) ** 3)));
        this.opacity = this.baseOpacity * (1 - t) ** 1.5;
        this.width = this.baseWidth * (1 - t * 0.5);
        this.visible = t < 1;
        super.update(delta);
    }
}
