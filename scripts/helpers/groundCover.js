import * as THREE from "three";
import { WIND_GLSL, windUniforms } from "../shaders/wind/windSway.js";
import { roadCover } from "./terrainRoads.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const QUALITY = { off: null, low: { grass: 150, pebble: 56 }, medium: { grass: 220, pebble: 80 }, high: { grass: 300, pebble: 110 } };
const KINDS = {
    grass: { spacing: 0.16, height: 0.26, width: 0.1 },
    pebble: { spacing: 0.42, height: 0.1, width: 0.17 },
};
const MASK_ONE = 64;
const OUT_CELLS = 24;
const OUT_DENSITY = 0.4;

export function groundCoverQuality() {
    const key = game.settings.settings.has("levels-3d-preview.groundCover") ? game.settings.get("levels-3d-preview", "groundCover") : "medium";
    return QUALITY[key] === undefined ? QUALITY.medium : QUALITY[key];
}

function hash(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
}

function tuftGeometry() {
    const positions = [];
    const tips = [];
    const index = [];
    const blades = 9;
    const segments = 3;
    for (let b = 0; b < blades; b++) {
        const spot = hash(b + 41) * Math.PI * 2;
        const reach = 0.08 + hash(b + 23) * 0.32;
        const a = spot + (hash(b + 11) - 0.5) * 2.2;
        const lean = 0.1 + hash(b + 7) * 0.55;
        const tall = 0.4 + hash(b + 3) * 0.6;
        const width = 0.3 + hash(b + 29) * 0.35;
        const twist = (hash(b + 37) - 0.5) * 1.2;
        const ox = Math.cos(spot) * reach, oz = Math.sin(spot) * reach;
        const base = positions.length / 3;
        for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const w = width * (1 - t * 0.95);
            const facing = a + Math.PI / 2 + twist * t;
            const sx = Math.cos(facing), sz = Math.sin(facing);
            const cx = ox + Math.cos(a) * lean * t * t;
            const cz = oz + Math.sin(a) * lean * t * t;
            positions.push(cx - sx * w * 0.5, t * tall * (1 - lean * 0.3 * t), cz - sz * w * 0.5, cx + sx * w * 0.5, t * tall * (1 - lean * 0.3 * t), cz + sz * w * 0.5);
            tips.push(t, t);
            if (s < segments) {
                const k = base + s * 2;
                index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(positions.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    geometry.setAttribute("tip", new THREE.Float32BufferAttribute(tips, 1));
    geometry.setIndex(index);
    return geometry;
}

function pebbleGeometry() {
    const source = new THREE.IcosahedronGeometry(0.5, 2);
    source.deleteAttribute("uv");
    source.deleteAttribute("normal");
    const geometry = mergeVertices(source);
    source.dispose();
    const pos = geometry.attributes.position;
    const tips = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
        const bump = 0.85 + 0.3 * hash(Math.round(x * 7 + 11) * 13 + Math.round(y * 7 + 5) * 7 + Math.round(z * 7 + 3)) + 0.08 * Math.sin(x * 9.1 + z * 6.3);
        const top = Math.max(y * bump * 0.6, -0.06) + 0.08;
        pos.setXYZ(k, x * bump, top, z * bump);
        tips[k] = Math.max(0, Math.min(1, top / 0.38));
    }
    geometry.computeVertexNormals();
    geometry.setAttribute("tip", new THREE.Float32BufferAttribute(tips, 1));
    return geometry;
}

const VERTEX_PARS = `
uniform sampler2D gcHeight;
uniform sampler2D gcOut;
uniform vec2 gcOutGrid;
uniform float gcOutPad;
uniform float gcOutOn;
uniform sampler2D gcMask;
uniform sampler2DArray gcWeights;
uniform sampler2DArray gcColors;
uniform sampler2DArray gcDetail;
uniform vec2 gcSize;
uniform vec2 gcGrid;
uniform vec2 gcOrigin;
uniform vec2 gcCenter;
uniform float gcCell;
uniform float gcRadius;
uniform float gcScale;
uniform float gcWidth;
uniform float gcHeightScale;
uniform float gcWater;
uniform float gcEnabled;
uniform float gcDensity[GC_COUNT];
uniform float gcGaps[GC_COUNT];
uniform float gcScales[GC_COUNT];
uniform int gcSlopeLayer;
uniform vec2 gcSlope;
uniform float gcSlopeDensity;
uniform float gcEdge;
uniform float gcCellWorld;
attribute float tip;
varying vec3 gcColor;
varying float gcTip;
varying float gcDry;
varying vec3 gcObj;
varying float gcRockLum;
${WIND_GLSL}
vec3 gcHash3(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.xxy + q.yzz) * q.zyx);
}
float gcBilinear(sampler2D tex, vec2 uv, vec2 grid) {
    vec2 f = clamp(uv, 0.0, 1.0) * (grid - 1.0);
    ivec2 i = ivec2(floor(f));
    ivec2 m = ivec2(grid) - 1;
    vec2 t = fract(f);
    float a = texelFetch(tex, min(i, m), 0).r;
    float b = texelFetch(tex, min(i + ivec2(1, 0), m), 0).r;
    float c = texelFetch(tex, min(i + ivec2(0, 1), m), 0).r;
    float d = texelFetch(tex, min(i + ivec2(1, 1), m), 0).r;
    return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
float gcHeightAt(vec2 uv) {
    if (gcOutOn > 0.5 && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) return gcBilinear(gcOut, (uv * gcSize + gcOutPad) / (gcSize + 2.0 * gcOutPad), gcOutGrid);
    return gcBilinear(gcHeight, uv, gcGrid);
}
`;

const VERTEX_MAIN = `
vec2 gcId = gcOrigin + vec2(float(gl_InstanceID % GC_GRID), float(gl_InstanceID / GC_GRID));
vec3 gcRnd = gcHash3(gcId);
vec3 gcRnd2 = gcHash3(gcId + 17.31);
vec2 gcLp = (gcId + gcRnd.xy) * gcCell;
vec2 gcUv = gcLp / gcSize;
vec2 gcMargin = vec2(gcWidth) / gcSize;
float gcInside = step(gcMargin.x, gcUv.x) * step(gcUv.x, 1.0 - gcMargin.x) * step(gcMargin.y, gcUv.y) * step(gcUv.y, 1.0 - gcMargin.y);
float gcOutDist = length(max(max(-gcUv, gcUv - 1.0), 0.0) * gcSize);
float gcKeep = gcEnabled * max(gcInside, gcOutOn * step(gcOutDist, gcOutPad * 0.95));
float gcFade = 1.0 - smoothstep(gcRadius * 0.3, gcRadius * 0.88, length(gcLp - gcCenter));
vec2 gcWuv = (gcUv * (gcGrid - 1.0) + 0.5) / gcGrid;
float gcDens = 0.0;
float gcSum = 0.0;
int gcPick = 0;
float gcPickW = 0.0;
for (int g = 0; g < GC_GROUPS; g++) {
    vec4 w4 = textureLod(gcWeights, vec3(gcWuv, float(g)), 0.0);
    for (int c = 0; c < 4; c++) {
        int i = g * 4 + c + 1;
        if (i >= GC_COUNT) break;
        float w = w4[c];
        gcSum += w;
        float d = gcDensity[i];
        if (gcGaps[i] > 0.0 && w > 0.0) d = max(d, gcGaps[i] * (1.0 - smoothstep(0.25, 0.5, textureLod(gcDetail, vec3(gcLp * gcScales[i], float(i)), 0.0).b)));
        gcDens += w * d;
        if (w > gcPickW) { gcPickW = w; gcPick = i; }
    }
}
float gcW0 = clamp(1.0 - gcSum, 0.0, 1.0);
gcDens += gcW0 * gcDensity[0];
if (gcW0 >= gcPickW) gcPick = 0;
vec2 gcStep = 1.0 / gcGrid;
float gcH = gcHeightAt(gcUv);
if (gcSlopeLayer >= 0) {
    float hx = (gcHeightAt(gcUv + vec2(gcStep.x, 0.0)) - gcHeightAt(gcUv - vec2(gcStep.x, 0.0))) * gcHeightScale / (2.0 * gcStep.x * gcSize.x);
    float hz = (gcHeightAt(gcUv + vec2(0.0, gcStep.y)) - gcHeightAt(gcUv - vec2(0.0, gcStep.y))) * gcHeightScale / (2.0 * gcStep.y * gcSize.y);
    float steep = 1.0 - normalize(vec3(-hx, 1.0, -hz)).y;
    float rock = smoothstep(gcSlope.x, gcSlope.y, steep * 2.0);
    float edge = smoothstep(gcSlope.x * 0.6, gcSlope.x, steep * 2.0) * (1.0 - rock);
    gcDens = mix(gcDens, gcSlopeDensity, rock) + gcEdge * edge;
}
vec4 gcRoad = textureLod(gcMask, gcUv, 0.0) * GC_MASK_RANGE;
#ifdef GC_SWAY
gcDens *= gcRoad.r;
#else
gcDens *= gcRoad.g;
#endif
gcDens *= mix(1.0, GC_OUT_DENSITY, smoothstep(0.0, gcCellWorld * 0.3, gcOutDist)) * (1.0 - smoothstep(gcOutPad * 0.5, gcOutPad * 0.95, gcOutDist));
float gcPatch = fw_noise(gcLp * 6.0 / gcCellWorld) * 0.6 + fw_noise(gcLp * 19.0 / gcCellWorld + 5.3) * 0.4;
#ifdef GC_SWAY
gcDens *= smoothstep(0.18, 0.62, gcPatch) * 1.25;
float gcSizeVar = mix(0.5, 1.35, smoothstep(0.25, 0.85, gcPatch));
#else
gcDens *= mix(2.6, 0.35, smoothstep(0.2, 0.7, gcPatch));
float gcSizeVar = 1.0;
#endif
gcKeep *= step(gcRnd.z, gcDens * mix(0.4, 1.0, gcFade)) * step(gcWater, gcH * gcHeightScale);
#ifdef GC_SWAY
float gcVar = mix(0.55, 1.45, gcRnd2.x);
#else
vec3 gcRnd3 = gcHash3(gcId + 41.7);
float gcVar = mix(0.4, 1.55, gcRnd2.x * gcRnd2.x);
gcObj = transformed + gcRnd3 * 7.0;
transformed *= vec3(mix(0.7, 1.4, gcRnd3.x), mix(0.55, 1.2, gcRnd3.y), mix(0.75, 1.15, gcRnd3.z));
#endif
float gcS = gcKeep * smoothstep(0.0, 0.6, gcFade) * gcVar * gcSizeVar * gcRoad.b;
gcDry = smoothstep(0.55, 0.85, fw_noise(gcLp * 2.5 / gcCellWorld + 11.7)) * gcRnd.x;
float gcA = gcRnd2.y * 6.2831853;
vec3 gcLocal = vec3(transformed.x * gcWidth, transformed.y * gcScale, transformed.z * gcWidth) * gcS;
gcLocal.xz = mat2(cos(gcA), sin(gcA), -sin(gcA), cos(gcA)) * gcLocal.xz;
vec3 gcBase = vec3(gcLp.x, gcH * gcHeightScale, gcLp.y);
transformed = gcBase + gcLocal;
#ifndef GC_SWAY
transformed.y -= 0.07 * gcScale * gcS;
#endif
#ifdef GC_SWAY
if (gcS > 0.0) {
    vec3 gcWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vec3 gcPivot = (modelMatrix * vec4(gcBase, 1.0)).xyz;
    transformed += fw_sway(gcWp, gcPivot, gcScale * gcS, 1.2, 0.0, 1.5, 0.0) - gcWp;
}
#endif
vWorldPositionFoW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#if GC_COLOR_LAYER >= 0
vec3 gcRock = textureLod(gcColors, vec3(gcLp * gcScales[GC_COLOR_LAYER], float(GC_COLOR_LAYER)), 5.0).rgb;
vec3 gcGround = textureLod(gcColors, vec3(gcLp * gcScales[gcPick], float(gcPick)), 5.0).rgb;
gcRockLum = max(dot(gcRock, vec3(0.3, 0.6, 0.1)), 0.02);
vec3 gcStone = mix(vec3(max(dot(gcGround, vec3(0.3, 0.6, 0.1)), 0.12)) * vec3(1.02, 0.95, 0.85), gcRock * 2.2, 0.35);
gcColor = mix(gcStone, gcGround, 0.25) * mix(0.7, 1.2, gcRnd2.z);
#else
int gcTex = gcDensity[gcPick] > 0.0 ? gcPick : 0;
gcColor = textureLod(gcColors, vec3(gcLp * gcScales[gcTex], float(gcTex)), 5.0).rgb * mix(0.85, 1.15, gcRnd2.z);
#endif
gcTip = tip;
`;

class CoverLayer {
    constructor(state, kind, grid, shared) {
        this.state = state;
        this.kind = kind;
        this.grid = grid;
        const spec = KINDS[kind];
        const gridSize = canvas.scene.grid.size;
        const cell = (gridSize * spec.spacing) * state.scale;
        const layers = state.layers.length ? state.layers : [{}];
        const count = layers.length;
        const base = kind === "grass" ? tuftGeometry() : pebbleGeometry();
        const geometry = new THREE.InstancedBufferGeometry().copy(base);
        base.dispose();
        geometry.instanceCount = grid * grid;
        geometry.boundingBox = new THREE.Box3();
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
        const cover = (l) => l?.cover ?? {};
        const slopeCover = shared.slopeIndex >= 0 ? cover(layers[shared.slopeIndex]) : {};
        this.uniforms = {
            gcHeight: { value: shared.height },
            gcOut: { value: shared.out },
            gcOutGrid: { value: new THREE.Vector2(1, 1) },
            gcOutPad: { value: 0 },
            gcOutOn: { value: 0 },
            gcMask: { value: shared.mask },
            gcWeights: { value: shared.weights },
            gcColors: { value: shared.colors },
            gcDetail: { value: shared.detail },
            gcSize: { value: new THREE.Vector2(state.data.w * state.scale, state.data.h * state.scale) },
            gcGrid: { value: new THREE.Vector2(state.nx, state.ny) },
            gcOrigin: { value: new THREE.Vector2() },
            gcCenter: { value: new THREE.Vector2() },
            gcCell: { value: cell },
            gcCellWorld: { value: gridSize * state.scale * 10 },
            gcRadius: { value: (grid * cell) / 2 },
            gcScale: { value: gridSize * spec.height * state.scale },
            gcWidth: { value: gridSize * spec.width * state.scale },
            gcHeightScale: { value: state.scale },
            gcWater: { value: shared.water },
            gcEnabled: { value: 1 },
            gcDensity: { value: layers.map((l) => cover(l)[kind] ?? 0) },
            gcGaps: { value: layers.map((l) => (kind === "grass" ? (cover(l).gaps ?? 0) : 0)) },
            gcScales: { value: layers.map((l) => shared.factor / (l?.s || 200)) },
            gcSlopeLayer: { value: shared.slopeIndex },
            gcSlope: { value: shared.slope },
            gcSlopeDensity: { value: slopeCover[kind] ?? 0 },
            gcEdge: { value: kind === "grass" ? (slopeCover.edge ?? 0) : 0 },
        };
        const material = new THREE.MeshStandardMaterial({ roughness: kind === "grass" ? 0.85 : 0.95, metalness: 0, side: kind === "grass" ? THREE.DoubleSide : THREE.FrontSide });
        const defines = `#define FOW_FROM_OFFSET\n#define GC_OUT_DENSITY ${OUT_DENSITY.toFixed(3)}\n#define GC_MASK_RANGE ${(255 / MASK_ONE).toFixed(4)}\n#define GC_COUNT ${count}\n#define GC_GROUPS ${Math.max(1, Math.ceil((count - 1) / 4))}\n#define GC_GRID ${grid}\n#define GC_COLOR_LAYER ${kind === "pebble" ? shared.slopeIndex : -1}\n${kind === "grass" ? "#define GC_SWAY\n" : ""}`;
        material.customProgramCacheKey = () => `groundCover|${kind}|${count}|${grid}|${shared.slopeIndex}`;
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.uniforms, windUniforms);
            shader.vertexShader = defines + shader.vertexShader.replace("#include <common>", `#include <common>\n${VERTEX_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_MAIN}`);
            shader.fragmentShader = (`#define GC_COLOR_LAYER ${kind === "pebble" ? shared.slopeIndex : -1}\n` + shader.fragmentShader)
                .replace("#include <common>", "#include <common>\nuniform sampler2DArray gcColors;\nvarying vec3 gcColor;\nvarying float gcTip;\nvarying float gcDry;\nvarying vec3 gcObj;\nvarying float gcRockLum;")
                .replace(
                    "#include <map_fragment>",
                    kind === "grass"
                        ? "#include <map_fragment>\nvec3 gcStraw = vec3(0.62, 0.55, 0.3) * dot(gcColor, vec3(0.3, 0.6, 0.1)) * 1.6;\ndiffuseColor.rgb *= mix(gcColor, gcStraw, gcDry * smoothstep(0.35, 1.0, gcTip)) * mix(0.4, 1.25, gcTip);"
                        : "#include <map_fragment>\nfloat gcDetail = clamp(pow(dot(texture(gcColors, vec3(gcObj.xz * 0.12 + gcObj.y * 0.05, float(GC_COLOR_LAYER))).rgb, vec3(0.3, 0.6, 0.1)) / gcRockLum, 1.4), 0.45, 1.8);\ndiffuseColor.rgb *= gcColor * gcDetail * mix(0.45, 1.0, smoothstep(0.0, 0.45, gcTip));",
                )
                .replace("#include <normal_fragment_maps>", kind === "grass" ? "#include <normal_fragment_maps>\nnormal = normalize(vNormal);" : "#include <normal_fragment_maps>");
        };
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = false;
        this.mesh.raycast = () => {};
        this.mesh.userData.noIntersect = true;
        this.mesh.userData.noSurface = true;
        material.userData.noSurface = true;
        this.mesh.onBeforeRender = (renderer, scene, camera, geo, mat) => {
            geo.instanceCount = mat === material ? grid * grid : 0;
            this.update();
        };
    }

    update() {
        const surface = this.state.surfaceMesh;
        let visible = !!surface?.parent;
        for (let o = surface; o && visible; o = o.parent) visible = o.visible;
        this.uniforms.gcEnabled.value = visible ? 1 : 0;
        if (!visible) return;
        surface.updateWorldMatrix(true, false);
        this.mesh.matrixWorld.copy(surface.matrixWorld);
        const target = game.Levels3DPreview.controls?.target;
        if (!target) return;
        const local = surface.worldToLocal(target.clone());
        const cell = this.uniforms.gcCell.value;
        this.uniforms.gcCenter.value.set(local.x, local.z);
        this.uniforms.gcOrigin.value.set(Math.floor(local.x / cell) - this.grid / 2, Math.floor(local.z / cell) - this.grid / 2);
    }

    dispose() {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

export class GroundCover {
    constructor(state, { colors, detail, slopeIndex, slope, factor }) {
        this.state = state;
        const quality = groundCoverQuality();
        const layers = state.layers;
        if (!quality || !layers.some((l) => l?.cover)) return;
        this.height = new THREE.DataTexture(new Float32Array(state.nx * state.ny), state.nx, state.ny, THREE.RedFormat, THREE.FloatType);
        this.mask = new THREE.DataTexture(new Uint8Array(state.nx * state.ny * 4).fill(MASK_ONE), state.nx, state.ny, THREE.RGBAFormat, THREE.UnsignedByteType);
        this.mask.minFilter = this.mask.magFilter = THREE.LinearFilter;
        this.update(state.computeHeights());
        this.out = new THREE.DataTexture(new Float32Array(1), 1, 1, THREE.RedFormat, THREE.FloatType);
        this.out.needsUpdate = true;
        const shared = { height: this.height, out: this.out, mask: this.mask, weights: state.weightTexture, colors, detail, slopeIndex, slope, factor, water: this.waterLevel() };
        this.layers = Object.keys(KINDS)
            .filter((kind) => layers.some((l) => l?.cover?.[kind] || (kind === "grass" && l?.cover?.gaps)))
            .map((kind) => new CoverLayer(state, kind, quality[kind], shared));
        for (const layer of this.layers) game.Levels3DPreview.scene.add(layer.mesh);
        if (state.coverOutskirts) this.setOutskirts(state.coverOutskirts);
    }

    setOutskirts(heightAt) {
        if (!this.layers?.length) return;
        for (const layer of this.layers) layer.uniforms.gcOutOn.value = heightAt ? 1 : 0;
        if (!heightAt) return;
        const { w, h } = this.state.data;
        const grid = canvas.scene.grid.size;
        const pad = grid * OUT_CELLS;
        const step = grid / 2;
        const nx = Math.ceil((w + pad * 2) / step) + 1;
        const ny = Math.ceil((h + pad * 2) / step) + 1;
        const data = new Float32Array(nx * ny);
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) data[j * nx + i] = heightAt((i / (nx - 1)) * (w + pad * 2) - pad, (j / (ny - 1)) * (h + pad * 2) - pad);
        }
        this.out.dispose();
        this.out = new THREE.DataTexture(data, nx, ny, THREE.RedFormat, THREE.FloatType);
        this.out.needsUpdate = true;
        for (const layer of this.layers) {
            layer.uniforms.gcOut.value = this.out;
            layer.uniforms.gcOutGrid.value.set(nx, ny);
            layer.uniforms.gcOutPad.value = pad * this.state.scale;
        }
    }

    update(heights) {
        if (!this.height) return;
        this.height.image.data.set(heights);
        this.height.needsUpdate = true;
        const { nx, ny } = this.state;
        const masks = this.state.stampMasks ?? [];
        const mult = roadCover(masks.filter((m) => m.kind === "road"), nx, ny);
        const blocked = new Uint8Array(nx * ny);
        for (const m of masks) {
            if (m.kind === "road") continue;
            for (let q = 0; q < m.cw * m.ch; q++) {
                if (m.kind === "cave" ? !m.skip[q] && m.p[q] > 0.2 : m.weights[q] < 0.35) blocked[(m.j0 + Math.floor(q / m.cw)) * nx + m.i0 + (q % m.cw)] = 1;
            }
        }
        const mask = this.mask.image.data;
        for (let k = 0; k < nx * ny; k++) {
            for (let c = 0; c < 3; c++) mask[k * 4 + c] = blocked[k] ? 0 : Math.min(255, Math.round(mult[k * 3 + c] * MASK_ONE));
            mask[k * 4 + 3] = 255;
        }
        this.mask.needsUpdate = true;
        for (const layer of this.layers ?? []) layer.uniforms.gcWater.value = this.waterLevel();
    }

    waterLevel() {
        const surface = this.state.surfaceMesh;
        if (!surface) return -1e9;
        let level = -1e9;
        for (const tile of Object.values(game.Levels3DPreview.tiles ?? {})) {
            if (!tile?.shaders?.realisticWater?.enabled || !tile.mesh) continue;
            const box = new THREE.Box3().setFromObject(tile.mesh);
            if (!box.isEmpty()) level = Math.max(level, surface.worldToLocal(new THREE.Vector3(0, box.max.y, 0)).y);
        }
        return level;
    }

    dispose() {
        for (const layer of this.layers ?? []) layer.dispose();
        this.layers = [];
        this.height?.dispose();
        this.out?.dispose();
        this.mask?.dispose();
    }
}
