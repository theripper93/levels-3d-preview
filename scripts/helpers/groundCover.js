import * as THREE from "three";
import { WIND_GLSL, windUniforms } from "../shaders/wind/windSway.js";
import { roadCover } from "./terrainRoads.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { compileForComposer } from "../render/pipeline.js";

const QUALITY = { off: null, low: { grass: 150, pebble: 56 }, medium: { grass: 220, pebble: 80 }, high: { grass: 300, pebble: 110 } };
const KINDS = {
    grass: { spacing: 0.16, height: 0.26, width: 0.1 },
    pebble: { spacing: 0.42, height: 0.1, width: 0.17 },
};
const MASK_ONE = 64;
const OUT_CELLS = 24;
const OUT_DENSITY = 0.4;
const CHUNK = 16;
const LOD_LEVELS = 4;
const LOD_PIXELS = 64;
const _frustum = new THREE.Frustum();
const _matrix = new THREE.Matrix4();
const _box = new THREE.Box3();
const SEED_DELAY = 400;
const SEED_TEXELS = 1 << 24;
const GROW_SECONDS = 2;
const FADE_SECONDS = 4;

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

const PASS_FRAGMENT = `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
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
uniform sampler2D gcIds;
uniform vec3 gcCamera;
uniform float gcLodDist;
layout(location = 0) out vec4 gcO0;
layout(location = 1) out vec4 gcO1;
layout(location = 2) out vec4 gcO2;
#ifndef GC_SWAY
layout(location = 3) out vec4 gcO3;
#endif
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
    float h = 0.0;
    if (gcOutOn > 0.5 && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) h = gcBilinear(gcOut, (uv * gcSize + gcOutPad) / (gcSize + 2.0 * gcOutPad), gcOutGrid);
    else h = gcBilinear(gcHeight, uv, gcGrid);
    return h;
}
void gcLayer(int i, float w, vec2 lp, inout float dens, inout float sum, inout int pick, inout float pickW) {
    if (i >= GC_COUNT) return;
    sum += w;
    float d = gcDensity[i];
    if (gcGaps[i] > 0.0 && w > 0.0) d = max(d, gcGaps[i] * (1.0 - smoothstep(0.25, 0.5, textureLod(gcDetail, vec3(lp * gcScales[i], float(i)), 0.0).b)));
    dens += w * d;
    if (w > pickW) { pickW = w; pick = i; }
}
void gcGroup(int g, vec2 wuv, vec2 lp, inout float dens, inout float sum, inout int pick, inout float pickW) {
    vec4 w4 = textureLod(gcWeights, vec3(wuv, float(g)), 0.0);
    gcLayer(g * 4 + 1, w4.x, lp, dens, sum, pick, pickW);
    gcLayer(g * 4 + 2, w4.y, lp, dens, sum, pick, pickW);
    gcLayer(g * 4 + 3, w4.z, lp, dens, sum, pick, pickW);
    gcLayer(g * 4 + 4, w4.w, lp, dens, sum, pick, pickW);
}
void main() {
gcO0 = vec4(0.0);
gcO1 = vec4(0.0);
gcO2 = vec4(0.0);
#ifndef GC_SWAY
gcO3 = vec4(0.0);
#endif
#ifdef GC_SEED
vec2 gcId = gcOrigin + floor(gl_FragCoord.xy);
vec4 gcIdTexel = vec4(gcId, 1.0, 1.0);
#else
vec4 gcIdTexel = texelFetch(gcIds, ivec2(gl_FragCoord.xy), 0);
vec2 gcId = gcIdTexel.rg;
#endif
ivec2 gcIi = ivec2(gcId);
int gcBits = (gcIi.x | gcIi.y) & ((1 << (GC_LODS - 1)) - 1);
float gcLevel = float(GC_LODS - 1);
for (int l = GC_LODS - 2; l >= 0; l--) if ((gcBits & (1 << l)) != 0) gcLevel = float(l);
vec3 gcRnd = gcHash3(gcId);
vec3 gcRnd2 = gcHash3(gcId + 17.31);
vec2 gcLp = (gcId + gcRnd.xy) * gcCell;
vec2 gcUv = gcLp / gcSize;
vec2 gcMargin = vec2(gcWidth) / gcSize;
float gcInside = step(gcMargin.x, gcUv.x) * step(gcUv.x, 1.0 - gcMargin.x) * step(gcMargin.y, gcUv.y) * step(gcUv.y, 1.0 - gcMargin.y);
float gcOutDist = length(max(max(-gcUv, gcUv - 1.0), 0.0) * gcSize);
float gcKeep = gcEnabled * max(gcInside, gcOutOn * step(gcOutDist, gcOutPad * 0.95));
#ifdef GC_SEED
float gcFade = 1.0;
#else
float gcFade = (1.0 - smoothstep(gcRadius * 0.3, gcRadius * 0.88, length(gcLp - gcCenter))) * gcIdTexel.b;
#endif
if (gcKeep * gcFade <= 0.0) return;
vec2 gcWuv = (gcUv * (gcGrid - 1.0) + 0.5) / gcGrid;
float gcDens = 0.0;
float gcSum = 0.0;
int gcPick = 0;
float gcPickW = 0.0;
#if GC_GROUPS > 1
for (int g = 0; g < GC_GROUPS; g++) gcGroup(g, gcWuv, gcLp, gcDens, gcSum, gcPick, gcPickW);
#else
gcGroup(0, gcWuv, gcLp, gcDens, gcSum, gcPick, gcPickW);
#endif
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
#ifdef GC_SEED
gcO0 = vec4(gcKeep * gcRoad.b > 0.0 ? 1.0 : 0.0);
return;
#endif
#ifdef GC_SWAY
float gcVar = mix(0.55, 1.45, gcRnd2.x);
#else
float gcVar = mix(0.4, 1.55, gcRnd2.x * gcRnd2.x);
gcO3 = vec4(gcHash3(gcId + 41.7), 0.0);
#endif
float gcLod = log2(max(distance(vec3(gcLp.x, gcH * gcHeightScale, gcLp.y), gcCamera) / gcLodDist, 1.0));
float gcLodKeep = gcLevel >= float(GC_LODS - 1) ? 1.0 : 1.0 - smoothstep(gcLevel + 0.5, gcLevel + 1.0, gcLod);
float gcS = gcKeep * smoothstep(0.0, 0.6, gcFade) * gcVar * gcSizeVar * gcRoad.b * gcLodKeep;
if (gcS <= 0.0) return;
gcO0 = vec4(gcLp.x, gcH * gcHeightScale, gcLp.y, gcS);
float gcDry = smoothstep(0.55, 0.85, fw_noise(gcLp * 2.5 / gcCellWorld + 11.7)) * gcRnd.x;
#if GC_COLOR_LAYER >= 0
vec3 gcRock = textureLod(gcColors, vec3(gcLp * gcScales[GC_COLOR_LAYER], float(GC_COLOR_LAYER)), 5.0).rgb;
vec3 gcGround = textureLod(gcColors, vec3(gcLp * gcScales[gcPick], float(gcPick)), 5.0).rgb;
vec3 gcStone = mix(vec3(max(dot(gcGround, vec3(0.3, 0.6, 0.1)), 0.12)) * vec3(1.02, 0.95, 0.85), gcRock * 2.2, 0.35);
gcO1 = vec4(gcRnd2.y * 6.2831853, min(gcLod, float(GC_LODS - 1)), gcDry, max(dot(gcRock, vec3(0.3, 0.6, 0.1)), 0.02));
gcO2 = vec4(mix(gcStone, gcGround, 0.25) * mix(0.7, 1.2, gcRnd2.z), gcIdTexel.a);
#else
int gcTex = gcDensity[gcPick] > 0.0 ? gcPick : 0;
gcO1 = vec4(gcRnd2.y * 6.2831853, min(gcLod, float(GC_LODS - 1)), gcDry, 0.0);
gcO2 = vec4(textureLod(gcColors, vec3(gcLp * gcScales[gcTex], float(gcTex)), 5.0).rgb * mix(0.85, 1.15, gcRnd2.z), gcIdTexel.a);
#endif
}
`;

const VERTEX_PARS = `
uniform sampler2D gcData0;
uniform sampler2D gcData1;
uniform sampler2D gcData2;
uniform sampler2D gcData3;
uniform float gcScale;
uniform float gcWidth;
attribute float tip;
varying vec3 gcColor;
varying float gcTip;
varying float gcDry;
varying vec3 gcObj;
varying float gcRockLum;
varying float gcAlpha;
${WIND_GLSL}
`;

const VERTEX_MAIN = `
ivec2 gcT = ivec2(gl_InstanceID % GC_DATA_W, gl_InstanceID / GC_DATA_W);
vec4 gcD0 = texelFetch(gcData0, gcT, 0);
float gcS = gcD0.w;
if (gcS <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
vec4 gcD1 = texelFetch(gcData1, gcT, 0);
#ifndef GC_SWAY
vec3 gcRnd3 = texelFetch(gcData3, gcT, 0).xyz;
gcObj = transformed + gcRnd3 * 7.0;
transformed *= vec3(mix(0.7, 1.4, gcRnd3.x), mix(0.55, 1.2, gcRnd3.y), mix(0.75, 1.15, gcRnd3.z));
#endif
float gcA = gcD1.x;
vec3 gcLocal = vec3(transformed.x * gcWidth, transformed.y * gcScale, transformed.z * gcWidth) * gcS;
gcLocal *= exp2(gcD1.y * GC_LOD_GROW);
gcLocal.xz = mat2(cos(gcA), sin(gcA), -sin(gcA), cos(gcA)) * gcLocal.xz;
vec3 gcBase = gcD0.xyz;
transformed = gcBase + gcLocal;
#ifdef GC_SWAY
vec3 gcWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
vec3 gcPivot = (modelMatrix * vec4(gcBase, 1.0)).xyz;
transformed += fw_sway(gcWp, gcPivot, gcScale * gcS, 1.2, 0.0, 1.5, 0.0) - gcWp;
#else
transformed.y -= 0.07 * gcScale * gcS;
#endif
vWorldPositionFoW = (modelMatrix * vec4(transformed, 1.0)).xyz;
gcDry = gcD1.z;
gcRockLum = gcD1.w;
vec4 gcD2 = texelFetch(gcData2, gcT, 0);
gcColor = gcD2.rgb;
gcAlpha = gcD2.a;
gcTip = tip;
`;

function passQuad(uniforms, defines) {
    return new FullScreenQuad(new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: "in vec3 position;\nvoid main() { gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: defines + PASS_FRAGMENT, depthTest: false, depthWrite: false }));
}

class CoverLayer {
    constructor(state, kind, grid, shared) {
        this.state = state;
        this.kind = kind;
        this.range = shared.range;
        this.chunkSide = Math.ceil(grid / CHUNK) + 2;
        const side = this.chunkSide * CHUNK;
        this.ids = new THREE.DataTexture(new Float32Array(side * side * 4), side, side, THREE.RGBAFormat, THREE.FloatType);
        this.lists = new Map();
        this.fades = new Map();
        this.lastCull = 0;
        this.grown = false;
        this.items = [];
        this.count = 0;
        this.stale = true;
        this.dirtyAt = 0;
        const spec = KINDS[kind];
        const gridSize = canvas.scene.grid.size;
        const cell = (gridSize * spec.spacing) * state.scale;
        this.gridWorld = gridSize * state.scale;
        const layers = state.layers.length ? state.layers : [{}];
        const count = layers.length;
        const base = kind === "grass" ? tuftGeometry() : pebbleGeometry();
        const geometry = new THREE.InstancedBufferGeometry().copy(base);
        base.dispose();
        geometry.instanceCount = 0;
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
            gcIds: { value: this.ids },
            gcCamera: { value: new THREE.Vector3() },
            gcLodDist: { value: 1e9 },
        };
        this.target = new THREE.WebGLRenderTarget(side, side, { count: kind === "grass" ? 3 : 4, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
        this.target.textures.forEach((texture, k) => (this.uniforms[`gcData${k}`] = { value: texture }));
        const material = new THREE.MeshStandardMaterial({ roughness: kind === "grass" ? 0.85 : 0.95, metalness: 0, side: kind === "grass" ? THREE.DoubleSide : THREE.FrontSide });
        const defines = `#define FOW_FROM_OFFSET\n#define GC_OUT_DENSITY ${OUT_DENSITY.toFixed(3)}\n#define GC_MASK_RANGE ${(255 / MASK_ONE).toFixed(4)}\n#define GC_COUNT ${count}\n#define GC_GROUPS ${Math.max(1, Math.ceil((count - 1) / 4))}\n#define GC_CHUNK ${CHUNK}\n#define GC_LODS ${LOD_LEVELS}\n#define GC_LOD_GROW ${kind === "grass" ? "vec3(1.0, 0.0, 1.0)" : "vec3(0.5)"}\n#define GC_COLOR_LAYER ${kind === "pebble" ? shared.slopeIndex : -1}\n${kind === "grass" ? "#define GC_SWAY\n" : ""}#define GC_DATA_W ${side}\n`;
        this.pass = passQuad(this.uniforms, defines);
        this.seedPass = passQuad({ ...this.uniforms, gcOrigin: { value: new THREE.Vector2() }, gcEnabled: { value: 1 } }, `${defines}#define GC_SEED\n`);
        material.customProgramCacheKey = () => `groundCover|${kind}|${count}|${shared.slopeIndex}`;
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.uniforms, windUniforms);
            shader.vertexShader = defines + shader.vertexShader.replace("#include <common>", `#include <common>\n${VERTEX_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_MAIN}`);
            shader.fragmentShader = (`#define GC_COLOR_LAYER ${kind === "pebble" ? shared.slopeIndex : -1}\n` + shader.fragmentShader)
                .replace("#include <common>", "#include <common>\nuniform sampler2DArray gcColors;\nvarying vec3 gcColor;\nvarying float gcTip;\nvarying float gcDry;\nvarying vec3 gcObj;\nvarying float gcRockLum;\nvarying float gcAlpha;")
                .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (gcAlpha < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= gcAlpha) discard;")
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
        material.defines = { ...material.defines, L3D_SURFACE: "", ...(kind === "grass" ? { L3D_SURFACE_BLADE: "gcTip" } : {}) };
        this.mesh.onBeforeRender = (renderer, scene, camera, geo, mat) => {
            geo.instanceCount = mat === material && this.passesReady(renderer) ? this.cull(renderer, camera) : 0;
            if (geo.instanceCount) this.prepare(renderer, geo.instanceCount);
        };
        this.mesh.onBeforeShadow = (renderer, object, camera, shadowCamera, geo) => {
            geo.instanceCount = 0;
        };
    }

    warm() {
        const L = game.Levels3DPreview;
        if (!L?._ready) return;
        for (const pass of [this.pass, this.seedPass]) compileForComposer(L, pass._mesh, L.camera);
        L.lightWarmup?.warmObject(this.mesh);
    }

    passesReady(renderer) {
        return [this.pass, this.seedPass].every((pass) => renderer.properties.get(pass.material).currentProgram?.isReady() ?? true);
    }

    cull(renderer, camera) {
        this.update();
        const u = this.uniforms;
        if (!u.gcEnabled.value) return 0;
        u.gcCamera.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_matrix.copy(this.mesh.matrixWorld).invert());
        _frustum.setFromProjectionMatrix(_matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.mesh.matrixWorld));
        const pixels = renderer.getRenderTarget()?.height ?? renderer.getContext().drawingBufferHeight;
        u.gcLodDist.value = camera.isPerspectiveCamera ? (this.gridWorld * pixels * camera.zoom) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * LOD_PIXELS) : 1e9;
        const cell = u.gcCell.value;
        const span = CHUNK * cell;
        const pad = u.gcOutOn.value ? u.gcOutPad.value : 0;
        const reach = u.gcRadius.value * 0.88;
        const margin = u.gcScale.value + u.gcWidth.value * 2 ** (LOD_LEVELS - 1);
        const { x: cx, y: cz } = u.gcCenter.value;
        const now = performance.now();
        const dt = Math.min(0.1, (now - this.lastCull) / 1000);
        const growStep = dt / GROW_SECONDS;
        const fadeStep = dt / FADE_SECONDS;
        this.lastCull = now;
        const radius = u.gcRadius.value;
        const seen = new Set();
        let growing = false;
        const items = [];
        for (let j = 0; j < this.chunkSide; j++) {
            const z0 = (u.gcOrigin.value.y + j * CHUNK) * cell;
            const z1 = z0 + span + cell;
            if (z1 < -pad || z0 > u.gcSize.value.y + pad) continue;
            for (let i = 0; i < this.chunkSide; i++) {
                const x0 = (u.gcOrigin.value.x + i * CHUNK) * cell;
                const x1 = x0 + span + cell;
                if (x1 < -pad || x0 > u.gcSize.value.x + pad) continue;
                if (Math.hypot(Math.max(x0 - cx, 0, cx - x1), Math.max(z0 - cz, 0, cz - z1)) > reach) continue;
                const key = (u.gcOrigin.value.x / CHUNK + i) * 65536 + u.gcOrigin.value.y / CHUNK + j;
                seen.add(key);
                const target = 1 - THREE.MathUtils.smoothstep(Math.hypot((x0 + x1) / 2 - cx, (z0 + z1) / 2 - cz), radius * 0.3, radius * 0.88);
                const previous = this.fades.get(key);
                const start = this.grown ? 0 : target;
                const advance = (shown, step) => (target <= shown ? target : Math.min(target, shown + step));
                const size = advance(previous?.size ?? start, growStep);
                const alpha = advance(previous?.alpha ?? start, fadeStep);
                const grow = target > 0 ? size / target : 1;
                const fade = target > 0 ? alpha / target : 1;
                if (grow < 1 || fade < 1 || previous?.grow < 1 || previous?.fade < 1) growing = true;
                this.fades.set(key, { size, alpha, grow, fade });
                _box.min.set(x0 - margin, this.range.min - u.gcScale.value, z0 - margin);
                _box.max.set(x1 + margin, this.range.max + u.gcScale.value * 3, z1 + margin);
                if (!_frustum.intersectsBox(_box)) continue;
                const level = Math.min(LOD_LEVELS - 1, Math.floor(Math.log2(Math.max(_box.distanceToPoint(u.gcCamera.value) / u.gcLodDist.value, 1))));
                items.push(u.gcOrigin.value.x / CHUNK + i, u.gcOrigin.value.y / CHUNK + j, level);
            }
        }
        for (const key of this.fades.keys()) if (!seen.has(key)) this.fades.delete(key);
        if (seen.size) this.grown = true;
        if (this.stale && performance.now() - this.dirtyAt > SEED_DELAY) this.seed(renderer);
        if (growing || items.length !== this.items.length || items.some((v, k) => v !== this.items[k])) this.fill(items);
        return this.count;
    }

    fill(items) {
        this.items = items;
        const data = this.ids.image.data;
        let k = 0;
        for (let n = 0; n < items.length; n += 3) {
            const list = this.list(items[n], items[n + 1], items[n + 2]);
            const fades = this.fades.get(items[n] * 65536 + items[n + 1]);
            const grow = fades?.grow ?? 1;
            const fade = fades?.fade ?? 1;
            for (let p = 0; p < list.length; p += 2) {
                data[k++] = list[p];
                data[k++] = list[p + 1];
                data[k++] = grow;
                data[k++] = fade;
            }
        }
        this.count = k / 4;
        this.ids.needsUpdate = true;
    }

    list(cx, cz, level) {
        const key = `${cx},${cz},${level}`;
        let list = this.lists.get(key);
        if (list) return list;
        const m = this.mask;
        const stride = 1 << level;
        const out = [];
        for (let y = 0; y < CHUNK; y += stride) {
            for (let x = 0; x < CHUNK; x += stride) {
                const ix = cx * CHUNK + x;
                const iz = cz * CHUNK + y;
                if (m && !m.data[((iz - m.z) * m.w + ix - m.x) * 4]) continue;
                out.push(ix, iz);
            }
        }
        list = new Float32Array(out);
        this.lists.set(key, list);
        return list;
    }

    invalidate() {
        this.stale = true;
        this.dirtyAt = performance.now();
        this.mask = null;
        this.lists.clear();
        this.items = [];
    }

    seed(renderer) {
        this.invalidate();
        this.stale = false;
        const u = this.uniforms;
        const span = CHUNK * u.gcCell.value;
        const pad = u.gcOutOn.value ? u.gcOutPad.value : 0;
        const start = Math.floor((-pad - u.gcCell.value) / span) - 1;
        const w = (Math.ceil((u.gcSize.value.x + pad) / span) - start + 1) * CHUNK;
        const h = (Math.ceil((u.gcSize.value.y + pad) / span) - start + 1) * CHUNK;
        const max = renderer.capabilities.maxTextureSize;
        if (w > max || h > max || w * h > SEED_TEXELS) return;
        const target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
        this.seedPass.material.uniforms.gcOrigin.value.setScalar(start * CHUNK);
        this.run(renderer, target, this.seedPass);
        const data = new Uint8Array(w * h * 4);
        renderer.readRenderTargetPixels(target, 0, 0, w, h, data);
        target.dispose();
        this.mask = { x: start * CHUNK, z: start * CHUNK, w, data };
    }

    prepare(renderer, count) {
        this.target.scissor.set(0, 0, this.target.width, Math.ceil(count / this.target.width));
        this.target.scissorTest = true;
        this.run(renderer, this.target, this.pass);
    }

    run(renderer, target, pass) {
        const current = renderer.getRenderTarget();
        const face = renderer.getActiveCubeFace();
        const level = renderer.getActiveMipmapLevel();
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.setRenderTarget(target);
        pass.render(renderer);
        renderer.setRenderTarget(current, face, level);
        renderer.autoClear = autoClear;
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
        const half = Math.floor(this.chunkSide / 2);
        this.uniforms.gcOrigin.value.set((Math.floor(local.x / cell / CHUNK) - half) * CHUNK, (Math.floor(local.z / cell / CHUNK) - half) * CHUNK);
    }

    dispose() {
        this.ids.dispose();
        this.target.dispose();
        this.pass.material.dispose();
        this.seedPass.material.dispose();
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
        this.range = { min: 0, max: 0 };
        this.update(state.computeHeights());
        this.out = new THREE.DataTexture(new Float32Array(1), 1, 1, THREE.RedFormat, THREE.FloatType);
        this.out.needsUpdate = true;
        const shared = { range: this.range, height: this.height, out: this.out, mask: this.mask, weights: state.weightTexture, colors, detail, slopeIndex, slope, factor, water: this.waterLevel() };
        this.layers = Object.keys(KINDS)
            .filter((kind) => layers.some((l) => l?.cover?.[kind] || (kind === "grass" && l?.cover?.gaps)))
            .map((kind) => new CoverLayer(state, kind, quality[kind], shared));
        for (const layer of this.layers) {
            game.Levels3DPreview.scene.add(layer.mesh);
            layer.warm();
        }
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
        this.fitRange(this.height.image.data, data);
        for (const layer of this.layers) {
            layer.invalidate();
            layer.uniforms.gcOut.value = this.out;
            layer.uniforms.gcOutGrid.value.set(nx, ny);
            layer.uniforms.gcOutPad.value = pad * this.state.scale;
        }
    }

    update(heights) {
        if (!this.height) return;
        this.height.image.data.set(heights);
        this.height.needsUpdate = true;
        this.fitRange(heights, this.out?.image.data);
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
        this.invalidate();
        for (const layer of this.layers ?? []) layer.uniforms.gcWater.value = this.waterLevel();
    }

    invalidate() {
        for (const layer of this.layers ?? []) layer.invalidate();
    }

    fitRange(...sets) {
        let min = Infinity;
        let max = -Infinity;
        for (const set of sets) {
            for (const v of set ?? []) {
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
        this.range.min = min * this.state.scale;
        this.range.max = max * this.state.scale;
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
