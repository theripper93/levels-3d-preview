import * as THREE from "three";
import { getQuality } from "../quality.js";
import { wind as weatherWind } from "../weather/wind.js";
import * as GLSL from "./propShaders.js";

const CAPACITY = { mound: 600, bank: 1500, drift: 1000, lip: 600, icicle: 2500 };
const ICICLE_COLOR = new THREE.Color(0.55, 0.7, 0.8);
const FLAT_SLOPE = 0.1;
const WALL_STEP = 0.3;
const ICICLE_DROP = 0.3;
const LEDGE_SLOPE = 0.12;
const LIP_TEXELS = 8;
const OPEN_CELL = 7;
const SINK = 0.14;
const FRAME_BUDGET = 12;
const ROW_CHUNK = 64;
const KIND_RULES = {
    snow: { banks: 1, open: 1, lee: 0.45, height: [0.08, 0.15], icicles: true },
    ash: { banks: 0.3, open: 0, lee: 1, height: [0.04, 0.055] },
    sand: { banks: 0.5, open: 1, lee: 1, height: [0.06, 0.09], drifts: true },
};
const DIRECTIONS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
];

export function seededRandom(text) {
    let seed = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i++) {
        seed = Math.imul(seed ^ text.charCodeAt(i), 3432918353);
        seed = (seed << 13) | (seed >>> 19);
    }
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash(n) {
    let t = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

function lineNoise(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return hash(i * 7919 + seed) * (1 - s) + hash((i + 1) * 7919 + seed) * s;
}

function angleNoise(random, count) {
    const values = Array.from({ length: count }, () => random());
    return (angle) => {
        const position = ((angle / (Math.PI * 2)) * count + count) % count;
        const index = Math.floor(position);
        const f = position - index;
        const s = f * f * (3 - 2 * f);
        return values[index] * (1 - s) + values[(index + 1) % count] * s;
    };
}

function finishGeometry(positions, indices, rims, blendFrom = 0.55) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aRim", new THREE.Float32BufferAttribute(rims, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const normals = geometry.attributes.normal;
    const normal = new THREE.Vector3();
    for (let v = 0; v < normals.count; v++) {
        const k = THREE.MathUtils.smoothstep(rims[v], blendFrom, 0.95);
        normal.fromBufferAttribute(normals, v).lerp(new THREE.Vector3(0, 1, 0), k).normalize();
        normals.setXYZ(v, normal.x, normal.y, normal.z);
    }
    return geometry;
}

function gridIndices(columns, rows) {
    const indices = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
            const a = r * (columns + 1) + c;
            const b = a + columns + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return indices;
}

function moundGeometry(random, rings = 6, segments = 18) {
    const footprint = angleNoise(random, 5);
    const lump = angleNoise(random, 4);
    const skew = 0.15 + random() * 0.15;
    const skewAngle = random() * Math.PI * 2;
    const positions = [Math.cos(skewAngle) * skew, 1, Math.sin(skewAngle) * skew];
    const rims = [0];
    const indices = [];
    for (let ring = 1; ring <= rings; ring++) {
        const d = ring / rings;
        for (let s = 0; s < segments; s++) {
            const angle = (s / segments) * Math.PI * 2;
            const radius = d * (0.78 + 0.4 * footprint(angle));
            const profile = Math.pow(Math.max(0, 1 - d * d), 1.5) * (0.85 + 0.3 * lump(angle) * d);
            const pull = (1 - d) * skew;
            positions.push(Math.cos(angle) * radius + Math.cos(skewAngle) * pull, profile * (1 + SINK) - SINK, Math.sin(angle) * radius + Math.sin(skewAngle) * pull);
            rims.push(d);
        }
    }
    for (let s = 0; s < segments; s++) indices.push(0, 1 + ((s + 1) % segments), 1 + s);
    for (let ring = 1; ring < rings; ring++) {
        const inner = 1 + (ring - 1) * segments;
        const outer = 1 + ring * segments;
        for (let s = 0; s < segments; s++) {
            const n = (s + 1) % segments;
            indices.push(inner + s, inner + n, outer + s, inner + n, outer + n, outer + s);
        }
    }
    return finishGeometry(positions, indices, rims);
}

function driftGeometry(random, columns = 16, rows = 8) {
    const crest = 0.68 + random() * 0.08;
    const horn = 0.1 + random() * 0.12;
    const positions = [];
    const rims = [];
    for (let r = 0; r <= rows; r++) {
        const v = (r / rows) * 2 - 1;
        for (let c = 0; c <= columns; c++) {
            const t = c / columns;
            const halfWidth = 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.6)), 0.55);
            const windward = Math.pow(Math.sin((Math.PI / 2) * Math.min(1, t / crest)), 1.4);
            const lee = t > crest ? 1 - THREE.MathUtils.smoothstep((t - crest) / (1 - crest), 0, 1) : 1;
            const height = windward * lee * Math.pow(Math.max(0, 1 - v * v), 0.8);
            const x = t * 2 - 1 + horn * v * v * THREE.MathUtils.smoothstep(t, 0.4, 1);
            positions.push(x, height * (1 + SINK) - SINK, v * halfWidth);
            rims.push(Math.max(Math.abs(v), Math.abs(t * 2 - 1) * 0.9));
        }
    }
    return finishGeometry(positions, gridIndices(columns, rows), rims);
}

function bankGeometry(random, columns = 16, rows = 8) {
    const crest = 0.2 + random() * 0.15;
    const phase = random() * 10;
    const positions = [];
    const rims = [];
    for (let r = 0; r <= rows; r++) {
        const v = (r / rows) * 2 - 1;
        for (let c = 0; c <= columns; c++) {
            const u = (c / columns) * 2 - 1;
            const edge = 1 + 0.12 * Math.sin(u * 3.1 + phase) + 0.06 * Math.sin(u * 7.3 + phase * 2);
            const t = v < crest ? (v - crest) / (1 + crest) : (v - crest) / (1 - crest);
            const height = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 3)), 1.2) * Math.pow(Math.max(0, 1 - t * t), 1.3) * (0.92 + 0.08 * Math.sin(u * 4.7 + phase));
            positions.push(u, height * (1 + SINK) - SINK, v * edge);
            rims.push(Math.max(Math.abs(u), Math.abs(v)));
        }
    }
    return finishGeometry(positions, gridIndices(columns, rows), rims);
}

function lipGeometry(random, columns = 16, rows = 6) {
    const phase = random() * Math.PI * 2;
    const phase2 = random() * Math.PI * 2;
    const positions = [];
    for (let r = 0; r <= rows; r++) {
        const v = (r / rows) * 2 - 1;
        for (let c = 0; c <= columns; c++) {
            const u = c / columns - 0.5;
            const cap = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u * 2), 6)), 0.5);
            const thickness = 1 + 0.25 * (0.6 * Math.sin(u * 8.2 + phase) + 0.4 * Math.sin(u * 19.5 + phase2));
            positions.push(u, Math.sqrt(Math.max(0, 1 - v * v)) * cap * thickness - 0.15, v * 0.5 * (0.4 + 0.6 * cap) * (0.85 + 0.15 * thickness));
        }
    }
    return finishGeometry(positions, gridIndices(columns, rows), new Array(positions.length / 3).fill(0), 2);
}

function icicleGeometry() {
    const rings = 6;
    const segments = 6;
    const positions = [];
    const indices = [];
    for (let ring = 0; ring <= rings; ring++) {
        const t = ring / rings;
        const radius = Math.pow(1 - t, 1.2) * (1 + 0.1 * Math.sin(t * 11));
        for (let s = 0; s < segments; s++) {
            const angle = (s / segments) * Math.PI * 2;
            positions.push(Math.cos(angle) * radius, -t, Math.sin(angle) * radius);
        }
    }
    for (let ring = 0; ring < rings; ring++) {
        for (let s = 0; s < segments; s++) {
            const a = ring * segments + s;
            const b = ring * segments + ((s + 1) % segments);
            indices.push(a, b, a + segments, b, b + segments, a + segments);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function patch(material, key, vertexHeader, scale, varying, fragmentHeader, fragment, uniforms) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", `#include <common>\n${GLSL.propVertexHeader}\n${vertexHeader}`)
            .replace("#include <beginnormal_vertex>", `${scale}\n${varying}\n${GLSL.propNormal}`)
            .replace("#include <begin_vertex>", GLSL.propBegin);
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${fragmentHeader}`);
        for (const [chunk, code] of fragment) shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, typeof code === "function" ? code() : code);
    };
    material.customProgramCacheKey = () => key;
    return material;
}

function shadowMaterials(key, scale, uniforms) {
    const patchShadow = (material, suffix) => {
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${GLSL.propVertexHeader}`).replace("#include <begin_vertex>", `${scale}\n${GLSL.propBegin}`);
        };
        material.customProgramCacheKey = () => `${key}-${suffix}`;
        return material;
    };
    return {
        depth: patchShadow(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), "depth"),
        distance: patchShadow(new THREE.MeshDistanceMaterial(), "distance"),
    };
}

function linked(source, key, fallback) {
    return {
        get value() {
            return source[key]?.value ?? fallback;
        },
    };
}

export class SurfaceProps {
    constructor(parent, surfaceUniforms = {}) {
        this._parent = parent;
        this.surfaceUniforms = surfaceUniforms;
        this.group = new THREE.Group();
        this.group.name = "SurfaceProps";
        this.group.userData.ignoreHover = true;
        this.group.raycast = () => {};
        this.shared = this.createSharedUniforms(surfaceUniforms);
        this.geometries = this.createGeometries();
        this.layers = [this.createLayer(), this.createLayer()];
        this.stats = { mounds: 0, icicles: 0, lips: 0, ms: 0, rays: 0, frames: 0, pending: false };
        this.job = null;
        parent.scene.add(this.group);
    }

    get kind() {
        return this.layers[0].kind;
    }

    createSharedUniforms(source) {
        const renderer = this._parent.renderer;
        return {
            uPropEnabled: linked(source, "uSurfaceEnabled", 1),
            uPropMap: linked(source, "uSurfaceMap", null),
            uPropUseMap: {
                get value() {
                    return source.uSurfaceMap?.value ? 1 : 0;
                },
            },
            uPropRect: linked(source, "uSurfaceRect", new THREE.Vector4()),
            uPropColor: linked(source, "uSurfaceColor", new THREE.Color(0.74, 0.78, 0.84)),
            uPropRoughness: linked(source, "uSurfaceRoughness", 0.8),
            uPropViewport: {
                get value() {
                    return renderer?.domElement?.height ?? 1080;
                },
            },
        };
    }

    createGeometries() {
        const random = seededRandom("l3d-surface-props");
        return {
            mound: [moundGeometry(random), moundGeometry(random)],
            bank: [bankGeometry(random), bankGeometry(random)],
            drift: [driftGeometry(random), driftGeometry(random)],
            lip: [lipGeometry(random), lipGeometry(random), lipGeometry(random)],
            icicle: [icicleGeometry()],
        };
    }

    createLayer() {
        const layer = {
            kind: null,
            uniforms: {
                ...this.shared,
                uPropCover: { value: 0 },
                uPropRamp: { value: 0.25 },
                uPropFloor: { value: 0 },
            },
        };
        const icicleUniforms = { ...layer.uniforms, uPropRamp: { value: 0.12 } };
        const alphaMode = (this._parent.composer?.readBuffer?.samples ?? 0) > 1 ? { alphaToCoverage: true } : { alphaHash: true };
        const mound = patch(
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, ...alphaMode }),
            "l3d-surface-mound",
            GLSL.moundVertexHeader,
            GLSL.moundScale,
            GLSL.moundVarying,
            GLSL.moundFragmentHeader,
            [
                ["normal_fragment_maps", GLSL.moundNormal],
                ["color_fragment", `#include <color_fragment>\n${GLSL.moundColor}`],
                ["roughnessmap_fragment", GLSL.moundRoughness],
                ["emissivemap_fragment", `${GLSL.moundBlend}\n#include <emissivemap_fragment>`],            ],
            layer.uniforms,
        );
        mound.defines = { ...mound.defines, L3D_SURFACE: "", L3D_SURFACE_FORCE_BANK: "" };
        const icicle = patch(
            new THREE.MeshPhysicalMaterial({ color: ICICLE_COLOR, emissive: ICICLE_COLOR.clone().multiplyScalar(0.25), roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4, ...alphaMode }),
            "l3d-surface-icicle",
            GLSL.icicleVertexHeader,
            GLSL.icicleScale,
            GLSL.icicleVarying,
            GLSL.icicleFragmentHeader,
            [
                ["color_fragment", `#include <color_fragment>\n${GLSL.icicleColor}`],
                ["emissivemap_fragment", `#include <emissivemap_fragment>\n${GLSL.icicleRim}`],
            ],
            icicleUniforms,
        );
        icicle.userData.noSurface = true;
        layer.materials = { mound, icicle, icicleShadow: shadowMaterials("l3d-surface-icicle", GLSL.icicleScale, icicleUniforms) };
        layer.pools = {};
        for (const [type, geometries] of Object.entries(this.geometries)) {
            layer.pools[type] = geometries.map((geometry) => this.createPool(layer, type, geometry));
        }
        return layer;
    }

    createPool(layer, type, geometry) {
        const icicle = type === "icicle";
        const capacity = CAPACITY[type];
        const instanced = geometry.clone();
        instanced.setAttribute("aProp", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
        const mesh = new THREE.InstancedMesh(instanced, icicle ? layer.materials.icicle : layer.materials.mound, capacity);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.castShadow = icicle;
        if (icicle) {
            mesh.customDepthMaterial = layer.materials.icicleShadow.depth;
            mesh.customDistanceMaterial = layer.materials.icicleShadow.distance;
        }
        mesh.userData.ignoreHover = true;
        mesh.userData.noShaders = true;
        mesh.userData.noSurface = true;
        mesh.raycast = () => {};
        this.group.add(mesh);
        return mesh;
    }

    get scale() {
        const quality = getQuality();
        const level = quality.surface ?? { off: 0, low: 1, medium: 2, high: 3, ultra: 3 }[quality.tier] ?? 0;
        return level >= 3 ? 1 : level === 2 ? 0.5 : 0;
    }

    update(amounts) {
        for (const layer of this.layers) {
            if (!layer.kind || !amounts) layer.uniforms.uPropCover.value = 0;
            else if (amounts.kind === layer.kind) layer.uniforms.uPropCover.value = amounts.cover ?? amounts.total ?? 0;
            else if (amounts.previous?.kind === layer.kind) layer.uniforms.uPropCover.value = amounts.previous.cover ?? 0;
            else layer.uniforms.uPropCover.value = 0;
            const lips = !!layer.kind && amounts?.kind === layer.kind;
            for (const mesh of layer.pools.lip) mesh.visible = lips;
        }
        this.watchWind();
        this.step();
    }

    windKey() {
        return weatherWind.strength > 0.001 ? Math.round(weatherWind.direction / 5) : (this.wind ?? "calm");
    }

    watchWind() {
        const key = this.windKey();
        const now = performance.now();
        if (key !== this.wind) {
            this.wind = key;
            this.windChanged = now;
        } else if (this.windChanged && now - this.windChanged > 1000 && !this.job) {
            this.windChanged = 0;
            if (key !== this.placedWind && this.source && this.kind) this.place(this.source, this.kind);
        }
    }

    step() {
        if (!this.job) return;
        const start = performance.now();
        let done = false;
        while (!done && performance.now() - start < FRAME_BUDGET) done = this.job.next().done;
        this.stats.ms += performance.now() - start;
        this.stats.frames++;
        if (done) this.job = null;
        this.stats.pending = !!this.job;
    }

    clearLayer(layer) {
        for (const pools of Object.values(layer.pools)) pools.forEach((mesh) => (mesh.count = 0));
    }

    clear() {
        for (const layer of this.layers) {
            this.clearLayer(layer);
            layer.kind = null;
        }
        this.source = null;
        this.stats.mounds = this.stats.icicles = this.stats.lips = 0;
    }

    readHeights(shelter, square) {
        const { pixels, width, height } = shelter;
        const range = shelter.heightRange ?? shelter.uniforms.uShelterY.value;
        const heights = new Float32Array(width * height);
        const open = new Uint8Array(width * height);
        const bucket = square * 0.05;
        const buckets = new Uint32Array(Math.ceil(range.y / bucket) + 2);
        for (let i = 0; i < width * height; i++) {
            const p = i * 4;
            if (!pixels[p + 3]) {
                heights[i] = NaN;
                continue;
            }
            const h = range.x + ((pixels[p] * 256 + pixels[p + 1]) / 65535) * range.y;
            heights[i] = h;
            if (pixels[p + 2] <= 127) {
                open[i] = 1;
                buckets[Math.max(0, Math.floor((h - range.x) / bucket))]++;
            }
        }
        let best = 0;
        for (let b = 1; b < buckets.length; b++) if (buckets[b] > buckets[best]) best = b;
        const ground = range.x + (best + 0.5) * bucket;
        return { heights, open, ground };
    }

    windDirection() {
        if (!(weatherWind.strength > 0.001)) return { x: Math.SQRT1_2, z: Math.SQRT1_2, strong: false };
        const radians = THREE.MathUtils.degToRad(weatherWind.direction);
        return { x: Math.sin(radians), z: -Math.cos(radians), strong: true };
    }

    place(source, kind) {
        const shelter = source?.shelter ? { ...source, roots: source.shelter.roots } : source;
        if (kind !== this.layers[0].kind && this.layers[1].kind === kind) this.layers.reverse();
        else if (kind !== this.layers[0].kind) {
            this.layers.reverse();
            this.clearLayer(this.layers[0]);
            this.layers[0].kind = kind;
        }
        this.source = source;
        this.placedWind = this.windKey();
        Object.assign(this.stats, { mounds: 0, icicles: 0, lips: 0, rays: 0, ms: 0, frames: 0 });
        this.job = this.placeJob(shelter, this.scale);
        this.step();
        return this.stats;
    }

    *placeJob(shelter, scale) {
        const valid = scale && shelter?.pixels;
        const square = canvas.scene.dimensions.size / this._parent.factor;
        const context = valid ? { shelter, square, texel: shelter.rect.z / shelter.width, wind: this.windDirection(), scale, ...this.readHeights(shelter, square) } : null;
        if (context) yield* this.findEdges(context);
        const writers = [];
        for (const layer of this.layers) {
            const writer = this.writer(layer, scale);
            writers.push(writer);
            if (context && KIND_RULES[layer.kind] && (layer === this.layers[0] || layer.uniforms.uPropCover.value > 0)) yield* this.placeLayer(layer, context, writer);
        }
        writers.forEach((writer) => writer.commit());
    }

    *placeLayer(layer, context, writer) {
        const rules = KIND_RULES[layer.kind];
        const random = seededRandom(`${canvas.scene.id}:${layer.kind}`);
        layer.uniforms.uPropFloor.value = rules.drifts ? 1 : 0;
        yield* this.placeBanks(context, rules, random, writer);
        if (rules.open) this.placeOpen(context, rules, random, writer);
        if (rules.icicles) yield* this.placeIcicles(context, random, writer);
    }

    writer(layer, scale) {
        const counts = new Map();
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        const position = new THREE.Vector3();
        const size = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const stats = this.stats;
        return {
            add(type, x, y, z, sx, sy, sz, yaw, threshold, tilt = null, taperStart = 0, taperEnd = 0) {
                const pools = layer.pools[type];
                const pool = pools[Math.floor(hash(Math.round(x * 997 + z * 131)) * pools.length)];
                const index = counts.get(pool) ?? 0;
                if (index >= Math.floor(pool.instanceMatrix.count * scale)) return false;
                quaternion.setFromAxisAngle(up, yaw);
                if (tilt) quaternion.premultiply(tilt);
                matrix.compose(position.set(x, y, z), quaternion, size.set(sx, sy, sz));
                pool.setMatrixAt(index, matrix);
                pool.geometry.attributes.aProp.setXYZ(index, threshold, taperStart, taperEnd);
                counts.set(pool, index + 1);
                if (type === "icicle") stats.icicles++;
                else if (type === "lip") stats.lips++;
                else stats.mounds++;
                return true;
            },
            commit() {
                for (const pool of Object.values(layer.pools).flat()) {
                    pool.count = counts.get(pool) ?? 0;
                    pool.instanceMatrix.needsUpdate = true;
                    pool.geometry.attributes.aProp.needsUpdate = true;
                }
            },
        };
    }

    worldAt(shelter, px, py, jx = 0.5, jy = 0.5) {
        const { rect, width, height } = shelter;
        return { x: rect.x + ((px + jx) / width) * rect.z, z: rect.y + (1 - (py + jy) / height) * rect.w };
    }

    isFlat(heights, width, px, py, flat) {
        const h = heights[py * width + px];
        return Math.abs(heights[py * width + px + 1] - h) <= flat && Math.abs(heights[py * width + px - 1] - h) <= flat && Math.abs(heights[(py + 1) * width + px] - h) <= flat && Math.abs(heights[(py - 1) * width + px] - h) <= flat;
    }

    *findEdges(context) {
        const { shelter, heights, open, square } = context;
        const { width, height } = shelter;
        const flat = square * FLAT_SLOPE;
        const step = square * WALL_STEP;
        const edges = [];
        const near = new Uint8Array(width * height);
        const edgeIndex = new Int32Array(width * height).fill(-1);
        for (let py = 2; py < height - 2; py++) {
            if (py % ROW_CHUNK === 0) yield;
            for (let px = 2; px < width - 2; px++) {
                const i = py * width + px;
                const h = heights[i];
                if (!open[i] || Number.isNaN(h) || !this.isFlat(heights, width, px, py, flat)) continue;
                let wallX = 0;
                let wallZ = 0;
                let sides = 0;
                let solid = 0;
                let distance = 2;
                for (const [dx, dy] of DIRECTIONS) {
                    for (let r = 1; r <= 2; r++) {
                        const j = (py + dy * r) * width + px + dx * r;
                        if (heights[j] - h > step) {
                            const length = Math.hypot(dx, dy);
                            wallX += dx / length;
                            wallZ -= dy / length;
                            sides++;
                            solid += open[j];
                            distance = Math.min(distance, r * length);
                            break;
                        }
                    }
                }
                if (!sides) continue;
                near[i] = 1;
                const length = Math.hypot(wallX, wallZ);
                if (length < 0.3) continue;
                edgeIndex[i] = edges.length;
                edges.push({ i, px, py, x: wallX / length, z: wallZ / length, solid: solid * 2 >= sides, distance });
            }
        }
        context.near = near;
        context.edges = edges;
        context.edgeIndex = edgeIndex;
    }

    stretch(world, square) {
        const scale = square * 1.6;
        const n = (lineNoise(world.x / scale + 0.31 * world.z / scale, 4271) + lineNoise(world.z / scale - 0.27 * world.x / scale, 9137)) / 2;
        return THREE.MathUtils.clamp((n - 0.5) * 2.2 + 0.5, 0, 1);
    }

    edgeShape(context, edge) {
        const { shelter, edges, edgeIndex, texel, square } = context;
        const { width, height } = shelter;
        const radius = Math.max(2, Math.round((square * 0.6) / texel));
        let x = 0;
        let z = 0;
        let count = 0;
        for (let oy = -radius; oy <= radius; oy++) {
            const y = edge.py + oy;
            if (y < 0 || y >= height) continue;
            for (let ox = -radius; ox <= radius; ox++) {
                const px = edge.px + ox;
                if (px < 0 || px >= width || ox * ox + oy * oy > radius * radius) continue;
                const index = edgeIndex[y * width + px];
                if (index < 0) continue;
                x += edges[index].x;
                z += edges[index].z;
                count++;
            }
        }
        const length = Math.hypot(x, z);
        if (count < 3 || length < 1e-3) return { x: edge.x, z: edge.z, curvature: Infinity };
        const spread = Math.max(1e-6, 1 - length / count);
        return { x: x / length, z: z / length, curvature: (radius * texel) / Math.sqrt(6 * spread) };
    }

    *placeBanks(context, rules, random, writer) {
        const { shelter, heights, square, texel, wind, edges } = context;
        const { width, height } = shelter;
        const order = edges.map((_, e) => e);
        for (let e = order.length - 1; e > 0; e--) {
            const j = Math.floor(random() * (e + 1));
            [order[e], order[j]] = [order[j], order[e]];
        }
        const claimed = new Uint8Array(width * height);
        const banks = [];
        for (let o = 0; o < order.length; o++) {
            if (o % 4096 === 4095) yield;
            const edge = edges[order[o]];
            if (claimed[edge.i]) continue;
            const shape = this.edgeShape(context, edge);
            const facing = shape.x * wind.x + shape.z * wind.z;
            const windward = wind.strong ? facing : 0;
            const r1 = random();
            const r2 = random();
            const r3 = random();
            const r4 = random();
            const drift = rules.drifts && windward < -0.3;
            const keep = drift ? 0.7 : (windward < -0.3 ? rules.lee : 1) * rules.banks;
            const bend = Math.max(square * 0.5, 2 * Math.sqrt(2 * shape.curvature * square * 0.05));
            const length = drift ? square * (0.8 + r1) : Math.min(bend, square * (1 + 0.6 * r1) * (1 + 0.2 * Math.max(0, windward)));
            const across = drift ? length / 2.4 : square * (0.45 + 0.3 * r2);
            const claim = Math.max(1, Math.round(((drift ? across * 0.7 : length * (length < bend ? 0.3 : 0.24)) / texel) * (0.85 + 0.3 * r3)));
            for (let oy = -claim; oy <= claim; oy++) {
                for (let ox = -claim; ox <= claim; ox++) {
                    if (ox * ox + oy * oy > claim * claim) continue;
                    const x = edge.px + ox;
                    const y = edge.py + oy;
                    if (x >= 0 && y >= 0 && x < width && y < height) claimed[y * width + x] = 1;
                }
            }
            const world = this.worldAt(shelter, edge.px, edge.py, 0.3 + random() * 0.4, 0.3 + random() * 0.4);
            const wall = (edge.distance - 0.5) * texel;
            const threshold = 0.5 + (windward > 0.3 ? 0.08 : 0.16) * random();
            const ratio = rules.height[0] + (rules.height[1] - rules.height[0]) * random();
            if (drift ? r4 >= keep : keep < 1 && this.stretch(world, square) >= keep) continue;
            const h = heights[edge.i];
            if (drift) {
                const offset = length * (0.5 + 0.35 * r2) - (edge.solid ? 0.15 : 0) * length - wall;
                const lateral = (r3 - 0.5) * across * 0.8;
                const x = world.x + wind.x * offset - wind.z * lateral;
                const z = world.z + wind.z * offset + wind.x * lateral;
                const fit = this.fit(context, x, z, h, wind.x, wind.z, length * 0.45, across * 0.45);
                if (fit) writer.add("drift", x, h, z, (length / 2) * fit, length * ratio * fit, (length / 2) * fit, Math.atan2(-wind.z, wind.x) + (random() - 0.5) * 0.5, threshold);
                continue;
            }
            const offset = wall - across * (edge.solid ? 0.2 : 0.4);
            const x = world.x + shape.x * offset;
            const z = world.z + shape.z * offset;
            const fit = this.fit(context, x, z, h, -shape.z, shape.x, length * 0.42, across * 0.42);
            const rise = ((Math.max(length, square) + across) / 2) * ratio;
            const yaw = Math.atan2(shape.x, shape.z) + (random() - 0.5) * (shape.curvature < square * 3 ? 0.1 : 0.25);
            if (fit) banks.push({ x, h, z, half: (length / 2) * fit, rise: rise * fit, across: (across / 2) * fit, yaw, threshold, ux: Math.cos(yaw), uz: -Math.sin(yaw) });
        }
        yield;
        this.writeBanks(banks, square, writer);
    }

    writeBanks(banks, square, writer) {
        const cell = square;
        const grid = new Map();
        const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
        banks.forEach((bank, index) => {
            const k = key(bank.x, bank.z);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(index);
        });
        const joined = (self, x, z) => {
            const cx = Math.floor(x / cell);
            const cz = Math.floor(z / cell);
            for (let dz = -2; dz <= 2; dz++) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (const index of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
                        if (index === self) continue;
                        const other = banks[index];
                        const rx = x - other.x;
                        const rz = z - other.z;
                        const along = rx * other.ux + rz * other.uz;
                        const side = rx * other.uz - rz * other.ux;
                        if (Math.abs(along) < other.half * 0.85 && Math.abs(side) < other.across * 1.2 + square * 0.1) return true;
                    }
                }
            }
            return false;
        };
        banks.forEach((bank, index) => {
            const taper = Math.min(1, (square * 0.5) / Math.max(bank.half, 1e-4));
            const reach = bank.half * 0.9;
            const start = joined(index, bank.x - bank.ux * reach, bank.z - bank.uz * reach) ? 0 : taper;
            const end = joined(index, bank.x + bank.ux * reach, bank.z + bank.uz * reach) ? 0 : taper;
            writer.add("bank", bank.x, bank.h, bank.z, bank.half, bank.rise, bank.across, bank.yaw, bank.threshold, null, start, end);
        });
    }

    placeOpen(context, rules, random, writer) {
        const { shelter, heights, open, near, square, wind } = context;
        const { width, height, rect } = shelter;
        const cell = square * OPEN_CELL;
        const flat = square * FLAT_SLOPE;
        for (let cz = 0; cz < Math.ceil(rect.w / cell); cz++) {
            for (let cx = 0; cx < Math.ceil(rect.z / cell); cx++) {
                const x = rect.x + (cx + random()) * cell;
                const z = rect.y + (cz + random()) * cell;
                const size = random();
                const shape = random();
                const threshold = 0.58 + 0.14 * random();
                if (random() > 0.85) continue;
                const px = Math.floor(((x - rect.x) / rect.z) * width);
                const py = Math.floor((1 - (z - rect.y) / rect.w) * height);
                if (px < 2 || py < 2 || px >= width - 2 || py >= height - 2) continue;
                const i = py * width + px;
                if (!open[i] || near[i] || Number.isNaN(heights[i]) || !this.isFlat(heights, width, px, py, flat)) continue;
                const ratio = rules.height[0] + (rules.height[1] - rules.height[0]) * shape;
                const length = square * (rules.drifts ? 1 + 0.6 * size : 0.6 + 0.9 * size);
                const fit = this.fit(context, x, z, heights[i], wind.x, wind.z, length * 0.45, length * 0.45);
                if (!fit) continue;
                if (rules.drifts) writer.add("drift", x, heights[i], z, (length / 2) * fit, length * ratio * fit, (length / 2) * fit, Math.atan2(-wind.z, wind.x) + (shape - 0.5) * 0.3, threshold);
                else writer.add("mound", x, heights[i], z, (length / 2) * fit, length * ratio * fit, (length / 2) * (0.7 + 0.3 * shape) * fit, shape * Math.PI * 2, threshold);
            }
        }
    }

    heightAt(context, x, z) {
        const { shelter, heights } = context;
        const { rect, width, height } = shelter;
        const px = Math.floor(((x - rect.x) / rect.z) * width);
        const py = Math.floor((1 - (z - rect.y) / rect.w) * height);
        if (px < 0 || py < 0 || px >= width || py >= height) return NaN;
        return heights[py * width + px];
    }

    fit(context, x, z, h, ux, uz, along, across) {
        const flat = context.square * FLAT_SLOPE;
        for (const scale of [1, 0.6]) {
            const a = along * scale;
            const b = across * scale;
            const points = [
                [ux * a, uz * a],
                [-ux * a, -uz * a],
                [-uz * b, ux * b],
                [uz * b, -ux * b],
            ];
            if (points.every(([dx, dz]) => this.heightAt(context, x + dx, z + dz) >= h - flat)) return scale;
        }
        return 0;
    }

    isEdge(heights, width, height, px, py, d, drop, flat) {
        const [dx, dy] = DIRECTIONS[d];
        const h = heights[py * width + px];
        for (const side of [-2, -1, 1, 2]) {
            const x = px + dy * side;
            const y = py + dx * side;
            if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
            const along = heights[y * width + x];
            const below = heights[(y + dy) * width + x + dx];
            if (!(Math.abs(along - h) <= flat * 0.5 * Math.abs(side)) || !(along - below > drop)) return false;
        }
        let previous = h;
        for (let r = 1; r <= 4; r++) {
            const x = px - dx * r;
            const y = py - dy * r;
            if (x < 0 || y < 0 || x >= width || y >= height) return false;
            const inner = heights[y * width + x];
            if (!(inner >= previous - flat * 0.25 && inner - previous <= flat * 2.5)) return false;
            previous = inner;
        }
        return true;
    }

    *findEaves(context) {
        const { shelter, heights, open, square, ground } = context;
        const { width, height } = shelter;
        const drop = square * ICICLE_DROP;
        const ledge = square * LEDGE_SLOPE;
        const flags = new Uint8Array(width * height);
        const falls = new Float32Array(width * height * 4);
        for (let py = 1; py < height - 1; py++) {
            if (py % ROW_CHUNK === 0) yield;
            for (let px = 1; px < width - 1; px++) {
                const i = py * width + px;
                const h = heights[i];
                if (!open[i] || Number.isNaN(h) || h - ground < drop) continue;
                for (let d = 0; d < 4; d++) {
                    const [dx, dy] = DIRECTIONS[d];
                    const n = heights[i + dx + dy * width];
                    const fall = h - n;
                    if (!(fall > drop) || !this.isEdge(heights, width, height, px, py, d, drop, ledge)) continue;
                    flags[i] |= 1 << d;
                    falls[i * 4 + d] = fall;
                }
            }
        }
        const runs = [];
        for (let d = 0; d < 4; d++) {
            const [dx, dy] = DIRECTIONS[d];
            const tx = Math.abs(dy);
            const ty = Math.abs(dx);
            const bit = 1 << d;
            for (let py = 1; py < height - 1; py++) {
                for (let px = 1; px < width - 1; px++) {
                    const i = py * width + px;
                    if (!(flags[i] & bit) || flags[i - tx - ty * width] & bit) continue;
                    let n = 0;
                    while (flags[i + (tx + ty * width) * n] & bit) n++;
                    for (let s = 0; s < n; s += LIP_TEXELS) runs.push({ i, d, tx, ty, from: s, count: Math.min(LIP_TEXELS, n - s) });
                }
            }
        }
        context.eaves = { runs, falls };
    }

    *placeIcicles(context, random, writer) {
        const { shelter, heights, square, texel } = context;
        const { width } = shelter;
        yield* this.findEaves(context);
        const { runs, falls } = context.eaves;
        const raycaster = new THREE.Raycaster();
        raycaster.firstHitOnly = true;
        const roots = [...(shelter.roots ?? [])];
        const boxes = runs.length ? roots.map((root) => new THREE.Box3().setFromObject(root)) : [];
        const tilt = new THREE.Quaternion();
        const axis = new THREE.Vector3();
        const origin = new THREE.Vector3();
        const direction = new THREE.Vector3();
        for (let r = 0; r < runs.length; r++) {
            if (r % 64 === 63) yield;
            const run = runs[r];
            const [dx, dy] = DIRECTIONS[run.d];
            const step = run.tx + run.ty * width;
            const first = run.i + step * run.from;
            const last = first + step * (run.count - 1);
            const middle = first + step * Math.floor(run.count / 2);
            const out = { x: dx, z: -dy };
            const tangent = { x: run.tx, z: -run.ty };
            const a = this.worldAt(shelter, first % width, Math.floor(first / width), 0.5 + dx * 0.5, 0.5 + dy * 0.5);
            const b = this.worldAt(shelter, last % width, Math.floor(last / width), 0.5 + dx * 0.5, 0.5 + dy * 0.5);
            let top = 0;
            let fall = Infinity;
            for (let k = 0; k < run.count; k++) {
                top += heights[first + step * k];
                fall = Math.min(fall, falls[(first + step * k) * 4 + run.d]);
            }
            top /= run.count;
            if (roots.length) {
                const mid = this.worldAt(shelter, middle % width, Math.floor(middle / width), 0.5 + dx * 0.5, 0.5 + dy * 0.5);
                this.stats.rays++;
                raycaster.set(origin.set(mid.x + out.x * texel, top - Math.min(square * 0.08, fall * 0.25), mid.z + out.z * texel), direction.set(-out.x, 0, -out.z));
                raycaster.far = texel * 1.25;
                const nearby = roots.filter((_, k) => boxes[k].distanceToPoint(origin) <= texel * 1.5);
                if (nearby.length && raycaster.intersectObjects(nearby, true).length) continue;
            }
            const length = Math.hypot(b.x - a.x, b.z - a.z) + texel;
            const cx = (a.x + b.x) / 2 + out.x * square * 0.02;
            const cz = (a.z + b.z) / 2 + out.z * square * 0.02;
            const yaw = Math.atan2(-tangent.z, tangent.x);
            writer.add("lip", cx, top - square * 0.012, cz, length * 1.08, square * (0.045 + 0.02 * random()), square * (0.12 + 0.03 * random()), yaw, 0.5 + 0.06 * random());
            const line = Math.round((out.x ? a.x : a.z) / texel) * 31 + run.d;
            const startAlong = (a.x * tangent.x + a.z * tangent.z) - texel / 2;
            const maxLength = Math.min(fall * 0.85, square * 0.45);
            let s = random() * square * 0.04;
            while (s < length) {
                const along = (startAlong + s) / (square * 0.3);
                const cluster = lineNoise(along, line);
                s += square * (0.02 + 0.05 * random());
                if (cluster < 0.38) continue;
                const rare = random() < 0.06;
                const icicleLength = Math.min(maxLength, square * (rare ? 0.3 + 0.15 * random() : 0.08 + 0.25 * Math.pow((cluster - 0.38) / 0.62, 1.3) * (0.5 + random())));
                const radius = square * Math.max(0.008, Math.min(0.03, (icicleLength / square) * (0.07 + 0.04 * random())));
                const t = s - texel / 2;
                axis.set(random() - 0.5, 0, random() - 0.5).normalize();
                tilt.setFromAxisAngle(axis, THREE.MathUtils.degToRad(5) * random());
                const x = a.x + tangent.x * t + out.x * square * 0.025;
                const z = a.z + tangent.z * t + out.z * square * 0.025;
                if (!writer.add("icicle", x, top - square * 0.004, z, radius, icicleLength, radius, random() * Math.PI * 2, 0.58 + 0.2 * Math.pow(random(), 1.5) + (rare ? 0.04 : 0), tilt)) return;
            }
        }
    }

    dispose() {
        this.job = null;
        this.group.removeFromParent();
        for (const layer of this.layers) {
            for (const pools of Object.values(layer.pools)) pools.forEach((mesh) => mesh.geometry.dispose());
            layer.materials.mound.dispose();
            layer.materials.icicle.dispose();
            Object.values(layer.materials.icicleShadow).forEach((material) => material.dispose());
        }
        for (const geometries of Object.values(this.geometries)) geometries.forEach((geometry) => geometry.dispose());
        this.layers = [];
    }
}
