import * as THREE from "three";
import { buildCobwebs, StrandBuffer, strandMaterial, trackPixelSize, rng, gauzeMaterial, dressUniforms, useDressUniforms } from "./cobwebs.js";
import { getQuality } from "../vfx/quality.js";

const DRESS_TIERS = {
    low: { wallStride: 4, webs: 0.35, gauze: false, coat: false, tufts: false, props: false, propWebs: 0, detail: 0.6 },
    medium: { wallStride: 2, webs: 0.7, gauze: true, coat: true, tufts: true, props: true, propWebs: 0.5, detail: 0.85 },
    high: { wallStride: 1, webs: 1, gauze: true, coat: true, tufts: true, props: true, propWebs: 1, detail: 1 },
};

export function dressTier() {
    const tier = getQuality().tier;
    if (tier === "off") return null;
    return DRESS_TIERS[tier === "ultra" ? "high" : tier] ?? DRESS_TIERS.medium;
}

export const thinWebs = (webs = [], keep = 1) => (keep >= 1 ? webs : webs.filter((w) => ((w.s ?? 0) % 1000) / 1000 < keep));

const LIFT = 0.006;
let leafMaterial = null;

const PALETTE = {
    stem: [0.14, 0.11, 0.06],
    root: [0.12, 0.085, 0.055],
    rootTip: [0.28, 0.22, 0.15],
};

export const MOSS_TONES = [
    [0.032, 0.045, 0.024],
    [0.055, 0.074, 0.036],
    [0.09, 0.11, 0.055],
];

const LEAF_GREENS = [
    [0.025, 0.07, 0.018],
    [0.042, 0.105, 0.025],
    [0.063, 0.14, 0.032],
    [0.105, 0.175, 0.042],
];
const LEAF_OLD = [0.2, 0.16, 0.06];
const LEAF_OUTLINE = [[0, 0], [0.24, 0.03], [0.46, 0.18], [0.5, 0.3], [0.36, 0.4], [0.3, 0.5], [0.24, 0.74], [0, 1], [-0.24, 0.74], [-0.3, 0.5], [-0.36, 0.4], [-0.5, 0.3], [-0.46, 0.18], [-0.24, 0.03]];

const DS_VERTEX_HEAD = `#include <common>
attribute vec4 dressAmt;
attribute vec4 dressUv;
varying vec4 vDsAmt;
varying vec4 vDsUv;`;

const DS_VERTEX_BODY = `#include <begin_vertex>
vDsAmt = dressAmt;
vDsUv = dressUv;`;

const DS_FRAGMENT_HEAD = `#include <common>
uniform sampler2D dsNoiseMap;
uniform vec4 dressLevel;
uniform float dressMetre;
varying vec4 vDsAmt;
varying vec4 vDsUv;
float dsLine(float u, float row) {
    return texture2D(dsNoiseMap, vec2(u, row)).b * 0.7 + texture2D(dsNoiseMap, vec2(u * 0.31, row + 0.37)).r * 0.3;
}`;

const DS_MASKS = `
vec2 dsP = vDsUv.xy;
float dsWall = vDsUv.z;
float dsV = vDsUv.y;
float dsN = dressLevel.x;
float dsG = dsN * 1.4;
float dsO = dressLevel.y;
float dsD = dressLevel.z;
vec4 dsBig = texture2D(dsNoiseMap, dsP / 7.0);
vec4 dsMid = texture2D(dsNoiseMap, dsP / 2.2 + vec2(0.37, 0.11));
vec4 dsFine = texture2D(dsNoiseMap, dsP / 0.8 + vec2(0.71, 0.53));
float dsBlotch = dsBig.r * 0.55 + dsMid.r * 0.45;
float dsMott = smoothstep(0.25, 0.75, dsFine.r * 0.6 + dsFine.b * 0.4);
float dsGrime = 0.0;
float dsDust = 0.0;
float dsMossT = 0.0;
float dsWet = 0.0;
float dsWetDark = 0.0;
float dsGloss = 0.0;
float dsRough = 0.3;
float dsSalt = 0.0;
if (dsWall < 0.5) {
    float dsShape = smoothstep(0.42, 0.58, dsBlotch + (min(vDsAmt.x, 0.7) - 0.3) * 0.45);
    dsGrime = vDsAmt.x * mix(0.2 + 0.45 * min(dsG, 1.0), 1.0, dsShape) * (0.65 + 0.6 * dsMott);
    dsDust = vDsAmt.y * (0.68 + 0.32 * smoothstep(0.35, 0.65, dsMid.a)) * (0.72 + 0.45 * dsFine.b) * mix(1.0, 0.35 + 0.9 * smoothstep(0.3, 0.7, dsBig.g * 0.6 + dsMid.b * 0.4), clamp(dsG - 0.5, 0.0, 0.8));
    dsMossT = vDsAmt.z;
    float dsSpread = dsBig.a * 0.6 + dsMid.r * 0.4;
    float dsHasWet = smoothstep(0.0, 0.08, vDsAmt.w);
    dsWet = dsHasWet * smoothstep(0.66 - vDsAmt.w * 0.45, 0.72 - vDsAmt.w * 0.45, dsSpread + dsFine.b * 0.05);
    float dsPuddle = dsHasWet * smoothstep(0.84 - vDsAmt.w * 0.28, 0.86 - vDsAmt.w * 0.28, dsBig.a * 0.75 + dsMid.a * 0.25);
    dsWetDark = dsWet * (0.3 + 0.25 * vDsAmt.w) + dsPuddle * 0.15;
    dsGloss = dsWet * 0.45 + dsPuddle * 0.55;
    dsRough = mix(0.32, 0.04, dsPuddle);
} else {
    float dsEdge = smoothstep(0.34, 0.58, dsBlotch + vDsAmt.x * 0.45 - 0.2);
    float dsFringe = smoothstep(0.0, 0.35, vDsAmt.x * (0.45 + 0.8 * dsMid.b + 0.35 * dsFine.g));
    dsGrime = vDsAmt.x * dsFringe * mix(0.6 + 0.2 * min(dsG, 1.0), 1.0, dsEdge) * (0.72 + 0.45 * dsMott);
    float dsMossH = (0.25 + 1.1 * dsO) * (0.55 + 0.9 * dsMid.a);
    dsMossT = vDsAmt.z * (0.45 + 0.55 * dsBig.b) * (1.0 - smoothstep(dsMossH * 0.3, dsMossH, dsV));
    float dsU = dsP.x;
    float dsCol = dsLine(dsU / 1.1, 0.13);
    float dsLen = (0.35 + 1.6 * dsD) * (0.45 + texture2D(dsNoiseMap, vec2(dsU / 1.7, 0.61)).r);
    float dsStart = vDsUv.w * (0.6 + 0.42 * texture2D(dsNoiseMap, vec2(dsU / 2.9, 0.31)).a);
    float dsStreak = smoothstep(0.62 - dsD * 0.22, 0.66 - dsD * 0.22, dsCol) * (1.0 - smoothstep(dsStart - 0.012, dsStart, dsV)) * exp(-max(0.0, dsStart - dsV) / dsLen);
    float dsTide = (0.12 + 0.6 * dsD) * (0.8 + 0.4 * dsBig.a) * (0.9 + 0.2 * dsMid.r);
    float dsBelow = (1.0 - smoothstep(dsTide - 0.04, dsTide, dsV)) * (0.6 + 0.4 * dsMid.a);
    float dsMark = exp(-abs(dsV - dsTide) / 0.012) * smoothstep(0.3, 0.6, dsD);
    dsSalt = smoothstep(dsTide + 0.005, dsTide + 0.015, dsV) * (1.0 - smoothstep(dsTide + 0.02, dsTide + 0.07, dsV)) * smoothstep(0.3, 0.7, dsFine.b) * smoothstep(0.3, 0.6, dsD);
    dsWet = vDsAmt.w * max(dsStreak * min(1.0, 0.4 + dsD * 1.4), dsBelow * min(1.0, dsD * 1.4));
    dsWetDark = dsWet * 0.5 + dsMark * 0.35;
    dsGloss = dsWet * 0.45;
    dsRough = 0.14;
}
float dsGrow = dsMid.g * 0.35 + dsBig.r * 0.45 + dsFine.g * 0.2;
float dsMoss = smoothstep(0.86 - dsMossT * 0.6, 0.885 - dsMossT * 0.6, dsGrow) * step(0.01, dsMossT);
`;

const GRIME_COLOR = `#include <color_fragment>
${DS_MASKS}
float dsStain = max(0.0, dsG - 0.8) * smoothstep(0.5, 0.78, dsMid.g * 0.55 + dsFine.r * 0.45) * smoothstep(0.02, 0.25, vDsAmt.x);
float dsDark = clamp(dsGrime * (1.0 + 0.9 * dsG) + dsStain * 0.5, 0.0, 0.93);
vec3 dsMul = mix(vec3(1.0), vec3(0.16, 0.13, 0.1), dsDark) * (1.0 - clamp(dsWetDark, 0.0, 0.6) * vec3(1.0, 0.97, 0.94));`;

function grimeCompile(shader) {
    useDressUniforms(shader);
    shader.uniforms.dressLevel = { value: this.userData.dressLevel };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", DS_VERTEX_HEAD).replace("#include <begin_vertex>", DS_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", DS_FRAGMENT_HEAD)
        .replace("#include <color_fragment>", GRIME_COLOR)
        .replace(/}\s*$/, "if (dsMul.r > 0.997 && dsMul.b > 0.997) discard;\ngl_FragColor = vec4(dsMul, 1.0);\n}");
}

const COAT_COLOR = `#include <color_fragment>
${DS_MASKS}
float dsTone = floor(clamp(dsFine.r * 0.55 + dsMid.b * 0.45, 0.0, 0.999) * 3.0);
vec3 dsMossCol = dsTone < 0.5 ? vec3(${MOSS_TONES[0].join(", ")}) : dsTone < 1.5 ? vec3(${MOSS_TONES[1].join(", ")}) : vec3(${MOSS_TONES[2].join(", ")});
dsMossCol *= 0.85 + 0.3 * dsBig.b;
float dsDustA = clamp(dsDust + dsSalt * 0.35, 0.0, 0.95);
float dsMossA = dsMoss * 0.96;
float dsA = 1.0 - (1.0 - dsDustA) * (1.0 - dsMossA);
vec3 dsDustCol = mix(vec3(0.37, 0.35, 0.32), vec3(0.47, 0.46, 0.42), dsSalt);
diffuseColor.rgb = mix(dsDustCol, dsMossCol, dsMossA / max(dsA, 0.001));
diffuseColor.a = dsA;
float dsSpec = max(dsA, dsGloss);
if (dsA < 0.004 && dsGloss < 0.004) discard;`;

const COAT_NORMAL = `#include <normal_fragment_begin>
{
    float dsH = dsMoss * (0.4 + 0.6 * dsFine.g) * 0.006 * dressMetre;
    vec3 dsSx = dFdx(-vViewPosition);
    vec3 dsSy = dFdy(-vViewPosition);
    vec3 dsR1 = cross(dsSy, normal);
    vec3 dsR2 = cross(normal, dsSx);
    float dsDet = dot(dsSx, dsR1);
    vec3 dsGrad = sign(dsDet) * (dFdx(dsH) * dsR1 + dFdy(dsH) * dsR2);
    if (abs(dsDet) > 1e-12) normal = normalize(abs(dsDet) * normal - dsGrad);
}`;

function coatCompile(shader) {
    useDressUniforms(shader);
    shader.uniforms.dressLevel = { value: this.userData.dressLevel };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", DS_VERTEX_HEAD).replace("#include <begin_vertex>", DS_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", DS_FRAGMENT_HEAD)
        .replace("#include <color_fragment>", COAT_COLOR)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, dsRough, clamp(dsGloss * 1.6, 0.0, 1.0));")
        .replace("#include <normal_fragment_begin>", COAT_NORMAL)
        .replace("#include <opaque_fragment>", "gl_FragColor = vec4((totalDiffuse + totalEmissiveRadiance) * diffuseColor.a + totalSpecular * dsSpec, diffuseColor.a);");
}

const blendPremultiplied = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

function getGrimeMaterial(level) {
    const grimeMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
    grimeMaterial.onBeforeCompile = grimeCompile;
    Object.assign(grimeMaterial.userData, { noShaders: true, dressLevel: level });
    return grimeMaterial;
}

function getCoatMaterial(level) {
    const coatMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.25, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12, ...blendPremultiplied });
    coatMaterial.onBeforeCompile = coatCompile;
    Object.assign(coatMaterial.userData, { noShaders: true, dressLevel: level });
    return coatMaterial;
}

function getLeafMaterial() {
    if (leafMaterial) return leafMaterial;
    leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
    leafMaterial.userData.noShaders = true;
    return leafMaterial;
}

export class MeshBuffer {
    constructor(fx = false) {
        this.position = [];
        this.normal = [];
        this.color = [];
        this.fx = fx ? [] : null;
        this.index = [];
    }

    vertex(p, n, c, fx) {
        this.position.push(p.x, p.y, p.z);
        this.normal.push(n.x, n.y, n.z);
        this.color.push(c[0], c[1], c[2]);
        if (this.fx) this.fx.push(...fx);
        return this.position.length / 3 - 1;
    }

    triangle(a, b, c, n) {
        const pa = this.at(a), pb = this.at(b), pc = this.at(c);
        const cross = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
        if (cross.dot(n) < 0) this.index.push(a, c, b);
        else this.index.push(a, b, c);
    }

    at(i) {
        return new THREE.Vector3(this.position[i * 3], this.position[i * 3 + 1], this.position[i * 3 + 2]);
    }

    geometry() {
        if (!this.index.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
        g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 3));
        if (this.fx) g.setAttribute("dressFx", new THREE.Float32BufferAttribute(this.fx, 4));
        g.setIndex(this.index);
        g.computeBoundingSphere();
        g.computeBoundingBox();
        return g;
    }
}

class SurfaceBuffer {
    constructor() {
        this.position = [];
        this.normal = [];
        this.amt = [];
        this.uv = [];
        this.grime = [];
        this.coat = [];
    }

    vertex(p, n, amt, uv) {
        this.position.push(p.x, p.y, p.z);
        this.normal.push(n.x, n.y, n.z);
        this.amt.push(...amt);
        this.uv.push(...uv);
        return this.position.length / 3 - 1;
    }

    quad(list, a, b, c, d) {
        const P = this.position, at = (i) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        const n = new THREE.Vector3(this.normal[a * 3], this.normal[a * 3 + 1], this.normal[a * 3 + 2]);
        const pa = at(a);
        const flip = at(b).sub(pa).cross(at(c).sub(pa)).dot(n) < 0;
        if (flip) list.push(a, c, b, b, c, d);
        else list.push(a, b, c, c, b, d);
    }

    geometries(level) {
        if (!this.grime.length && !this.coat.length) return [];
        const attrs = { position: new THREE.Float32BufferAttribute(this.position, 3), normal: new THREE.Float32BufferAttribute(this.normal, 3), dressAmt: new THREE.Float32BufferAttribute(this.amt, 4), dressUv: new THREE.Float32BufferAttribute(this.uv, 4) };
        return [[this.grime, getGrimeMaterial, 2], [this.coat, getCoatMaterial, 2]].filter(([index]) => index.length).map(([index, make, order]) => {
            const material = make(level);
            const g = new THREE.BufferGeometry();
            for (const [name, attr] of Object.entries(attrs)) g.setAttribute(name, attr);
            g.setIndex(index);
            g.computeBoundingSphere();
            g.computeBoundingBox();
            return [g, material, order];
        });
    }
}

export const grimeLevel = (n) => n * 1.4;
const wave = (x) => 0.5 + 0.25 * Math.sin(x * 2.3 + Math.sin(x * 0.7) * 2) + 0.25 * Math.sin(x * 5.1 + 1.7);
const decode = (s, k) => (s ? parseInt(s[k] ?? "0", 36) / 35 : 0);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function addFilm(surf, film, { toLocal, metre, floorAt, holeAt }) {
    const { x, y, step, nx, ny, g, u, m, w, s = 0 } = film;
    if (!(g || u || m || w)) return;
    const up = new THREE.Vector3(0, 1, 0);
    const pxPerM = toLocal(1, 0, 0).sub(toLocal(0, 0, 0)).length() > 0 ? 1 / (toLocal(1, 0, 0).sub(toLocal(0, 0, 0)).length() / metre) : 1;
    const off = (s % 97) * 0.37;
    const ids = new Int32Array(nx * ny).fill(-2);
    const amt = (k) => [decode(g, k), decode(u, k), decode(m, k), decode(w, k)];
    const vertex = (i, j) => {
        const k = j * nx + i;
        if (ids[k] !== -2) return ids[k];
        const lx = x + i * step, ly = y + j * step;
        if (holeAt?.(lx, ly)) return (ids[k] = -1);
        const p = toLocal(lx, ly, 0);
        p.y = floorAt(lx, ly) + LIFT * metre * 2;
        return (ids[k] = surf.vertex(p, up, amt(k), [lx / pxPerM + off, ly / pxPerM + off * 0.7, 0, 0]));
    };
    for (let j = 0; j + 1 < ny; j++) {
        for (let i = 0; i + 1 < nx; i++) {
            const ks = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1];
            const a = ks.map(amt);
            const grime = a.some((v) => v[0] > 0.02 || v[3] > 0.02);
            const coat = a.some((v) => v[1] > 0.02 || v[2] > 0.02 || v[3] > 0.02);
            if (!grime && !coat) continue;
            const v = [vertex(i, j), vertex(i + 1, j), vertex(i, j + 1), vertex(i + 1, j + 1)];
            if (v.some((id) => id < 0)) continue;
            if (grime) surf.quad(surf.grime, ...v);
            if (coat) surf.quad(surf.coat, ...v);
        }
    }
}

function addWalls(surf, dress, { toLocal, metre, floorAt, stride = 1 }) {
    const rows = dress.wr ?? [];
    const film = dress.film ?? {};
    const N = film.a ?? 0, O = film.o ?? 0, D = film.d ?? 0;
    if (rows.length < 2) return;
    const [step, max, width = 1] = dress.wo ?? [0.02, 0.3];
    const wallTop = rows[rows.length - 1];
    const G = grimeLevel(N);
    const grimeTop = Math.max(N ? (0.2 + 1.0 * G) * 1.5 : 0, D ? wallTop : 0);
    const coatTop = Math.max(O ? (0.25 + 1.1 * O) * 1.5 : 0, D ? wallTop : 0);
    const off = ((film.s ?? 0) % 97) * 0.37;
    const walls = (dress.walls ?? []).filter(([x1, y1, x2, y2, , , offsets]) => Math.hypot(x2 - x1, y2 - y1) > 1e-6 && typeof offsets === "string");
    const ends = walls.map(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]]);
    const unit = toLocal(1, 0, 0).sub(toLocal(0, 0, 0)).length();
    const pxPerMetre = unit > 0 ? metre / unit : 1;
    const cornerAt = (x, y, self) => ends.some((pair, k) => k !== self && pair.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < 0.8 * pxPerMetre));
    for (const [wi, [x1, y1, x2, y2, nx, ny, offsets]] of walls.entries()) {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const n = new THREE.Vector3(nx, 0, ny).normalize();
        const lenM = toLocal(x2, y2, 0).distanceTo(toLocal(x1, y1, 0)) / metre;
        const pxPerM = len / Math.max(1e-6, lenM);
        const cols = Math.floor(offsets.length / (rows.length * width));
        const code = (c, r) => offsets.substr((c * rows.length + r) * width, width);
        if (cols < 2) continue;
        const colM = lenM / (cols - 1);
        const open = [!cornerAt(x1, y1, wi), !cornerAt(x2, y2, wi)];
        const valid = (c, r) => {
            if (c < 0) return !open[0];
            if (c >= cols) return !open[1];
            return code(c, r)[0] !== "z";
        };
        const gap = (c, r) => {
            let best = 0.6;
            for (let k = 1; (k - 0.5) * colM < best; k++) {
                if (!valid(c - k, r) || !valid(c + k, r)) best = Math.min(best, (k - 0.5) * colM);
            }
            for (const dr of [-2, -1, 1, 2]) {
                const rr = r + dr;
                if (rr < 0 || rr >= rows.length) continue;
                if (!valid(c, rr)) best = Math.min(best, Math.max(0, Math.abs(rows[rr] - rows[r]) * 0.5));
            }
            return best;
        };
        const ids = [];
        const depth = [];
        const meta = [];
        const picks = [...Array(cols).keys()].filter((c) => c % stride === 0 || c === cols - 1);
        for (const c of picks) {
            const t = c / (cols - 1);
            const lx = x1 + (x2 - x1) * t, ly = y1 + (y2 - y1) * t;
            const base = floorAt(lx + nx * pxPerM * 0.25, ly + ny * pxPerM * 0.25) - 0.01 * metre;
            const along = t * lenM;
            const cornerK = 1 + 0.35 * Math.exp(-Math.min(along, lenM - along) / 0.5);
            const u = (lx * Math.abs(ny) + ly * Math.abs(nx)) / pxPerM + off + wi * 0.013;
            const band = Math.min(wallTop * 0.92, (0.2 + 1.0 * G) * (0.7 + 0.6 * wave(u * 0.9)) * (0.85 + 0.3 * wave(u * 3.1 + 7)));
            const level = Math.min(1, (0.15 + 0.6 * G + 0.15 * G * G) * cornerK) * (N ? 1 : 0);
            for (let r = 0; r < rows.length; r++) {
                const ch = code(c, r);
                if (ch[0] === "z") {
                    ids.push(-1);
                    depth.push(0);
                    meta.push(null);
                    continue;
                }
                const reach = 0.22 + 0.25 * wave(u * 4.3 + rows[r] * 3.7);
                const fade = THREE.MathUtils.smoothstep(gap(c, r), 0, reach);
                const o = parseInt(ch, 36) * step - max;
                depth.push(o);
                const p = toLocal(lx, ly, 0).addScaledVector(n, (o + 0.002) * metre);
                p.y = base + rows[r] * metre;
                const amt = [fade * level * Math.pow(Math.max(0, 1 - rows[r] / band), 1.25), 0, fade * O, fade * D];
                const uv = [u, rows[r], 1, wallTop];
                meta.push({ p, amt, uv });
                ids.push(surf.vertex(p, n, amt, uv));
            }
        }
        for (let c = 0; c + 1 < picks.length; c++) {
            for (let r = 0; r + 1 < rows.length; r++) {
                const k = [c * rows.length + r, (c + 1) * rows.length + r, c * rows.length + r + 1, (c + 1) * rows.length + r + 1];
                const v = k.map((q) => ids[q]);
                if (v.some((id) => id < 0)) continue;
                const ds = k.map((q) => depth[q]);
                const back = Math.min(...ds);
                const quad = Math.max(...ds) - back > 0.04 ? k.map((q) => surf.vertex(meta[q].p.clone().addScaledVector(n, (back - depth[q]) * metre), n, meta[q].amt, meta[q].uv)) : v;
                if (rows[r] < grimeTop) surf.quad(surf.grime, ...quad);
                if (rows[r] < coatTop) surf.quad(surf.coat, ...quad);
            }
        }
    }
}

function leaf(buf, at, u, v, n, size, color) {
    const tip = new THREE.Vector3();
    const centre = at.clone().addScaledVector(u, 0.42 * size).addScaledVector(n, 0.1 * size);
    const ids = LEAF_OUTLINE.map(([a, b]) => {
        tip.copy(at).addScaledVector(v, a * size * 0.95).addScaledVector(u, b * size).addScaledVector(n, Math.abs(a) * 0.08 * size);
        return buf.vertex(tip, n, color, null);
    });
    const c = buf.vertex(centre, n, color.map((x) => x * 1.2), null);
    for (let k = 0; k < ids.length; k++) buf.triangle(c, ids[k], ids[(k + 1) % ids.length], n);
}

function addIvy(leaves, stems, source, { toLocal, metre }) {
    const [x, y, ax, ay, nx, ny, top, len, a0, a1, seed] = source;
    const random = rng(seed);
    const S = toLocal(x, y, top);
    const A = new THREE.Vector3(ax, 0, ay).normalize();
    const N = new THREE.Vector3(nx, 0, ny).normalize();
    const D = new THREE.Vector3(0, -1, 0);
    const step = 0.03;
    const at = (a, z, out) => S.clone().addScaledVector(A, a * metre).addScaledVector(D, z * metre).addScaledVector(N, out * metre);
    const grow = (a, z, ang, length, depth, width) => {
        const steps = Math.max(2, Math.round(length / step));
        const pts = [at(a, z, 0.006)];
        let side = random() < 0.5 ? 1 : -1;
        for (let s = 1; s <= steps; s++) {
            const f = s / steps;
            ang += (random() - 0.5) * 0.55 - ang * 0.035;
            let na = a + Math.sin(ang) * step, nz = z + Math.cos(ang) * step;
            if (na < a0 || na > a1) {
                ang = -ang;
                na = Math.min(a1, Math.max(a0, na));
            }
            if (nz < 0.02) {
                ang = Math.sign(ang || 1) * Math.min(Math.abs(ang), 1.2);
                nz = 0.02;
            }
            if (nz > top - 0.06) break;
            a = na;
            z = nz;
            pts.push(at(a, z, 0.006 + random() * 0.006));
            const leafCount = random() < 1 - f * 0.6 ? 1 + (random() < 0.6 - f * 0.55 ? 1 : 0) : 0;
            for (let q = 0; q < leafCount; q++) {
                side = -side;
                const size = (0.04 + random() * 0.05) * Math.pow(1 - f * 0.7, 0.9);
                const spread = ang + side * (0.7 + random() * 0.8);
                const dir = A.clone().multiplyScalar(Math.sin(spread)).addScaledVector(D, Math.cos(spread) * 0.6 + 0.5).normalize();
                const tilt = 0.25 + random() * 0.6;
                const u = dir.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(N, Math.sin(tilt)).normalize();
                const roll = (random() - 0.5) * 0.8;
                const v = new THREE.Vector3().crossVectors(u, N).normalize().applyAxisAngle(u, roll);
                const normal = new THREE.Vector3().crossVectors(v, u).normalize();
                if (normal.dot(N) < 0) normal.negate();
                const base = pts[pts.length - 1].clone().addScaledVector(u, 0.008 * metre);
                const color = random() < 0.06 ? LEAF_OLD : mix(LEAF_GREENS[Math.floor(random() * LEAF_GREENS.length)], LEAF_GREENS[3], f * 0.5 * random());
                leaf(leaves, base, u, v, normal, size * metre, color.map((c) => c * (0.8 + random() * 0.4)));
            }
            if (depth < 3 && random() < 0.06) grow(a, z, ang + (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.8), (length - s * step) * (0.4 + random() * 0.4), depth + 1, width * 0.65);
        }
        stems.tapered(pts, width * metre, width * 0.25 * metre, 1, N);
    };
    stems.tint = new THREE.Color(...PALETTE.stem);
    const vines = 1 + Math.floor(random() * 3);
    for (let k = 0; k < vines; k++) grow((random() - 0.5) * 0.3, 0.02, (random() - 0.5) * 2.6, len * (0.6 + random() * 0.5), 0, 0.004 + random() * 0.002);
}

function addRoot(stems, source, { toLocal, metre }) {
    const [x, y, nx, ny, top, len, seed] = source;
    const random = rng(seed);
    const N = new THREE.Vector3(nx, 0, ny).normalize();
    const T = new THREE.Vector3(-ny, 0, nx).normalize();
    const hug = random() < 0.35;
    const grow = (start, length, width, depth, phase) => {
        const steps = Math.max(3, Math.round(length / 0.025));
        const pts = [start.clone()];
        const p = start.clone();
        let out = hug ? 0.01 : 0.04 + random() * 0.08;
        for (let s = 1; s <= steps; s++) {
            const f = s / steps;
            const twist = Math.sin(phase + f * (5 + random() * 2)) * 0.012;
            out += hug ? (random() - 0.5) * 0.004 : (random() - 0.4) * 0.008;
            p.y -= 0.025 * metre * (0.85 + random() * 0.3);
            p.addScaledVector(T, (twist + (random() - 0.5) * 0.01) * metre);
            const q = p.clone().addScaledVector(N, Math.max(0.006, out) * metre * Math.min(1, f * 4));
            pts.push(q);
            if (depth < 2 && random() < 0.08 * (1 - f)) grow(q, length * (1 - f) * (0.3 + random() * 0.5), width * (1 - f) * 0.55, depth + 1, random() * 6);
        }
        stems.tint = new THREE.Color(...mix(PALETTE.root, PALETTE.rootTip, depth * 0.3 + random() * 0.2));
        stems.tapered(pts, width * metre, Math.max(0.0008, width * 0.12) * metre, 1, N);
    };
    const count = 1 + Math.floor(random() * 3);
    for (let k = 0; k < count; k++) {
        const start = toLocal(x, y, top - random() * 0.04).addScaledVector(T, (random() - 0.5) * 0.3 * metre).addScaledVector(N, 0.01 * metre);
        grow(start, len * (0.5 + random() * 0.6), 0.006 + random() * 0.01, 0, random() * 6);
    }
}

function addTuft(buf, source, { toLocal, metre, floorAt }) {
    const [x, y, nx, ny, size, seed] = source;
    const random = rng(seed);
    const N = new THREE.Vector3(nx, 0, ny).normalize();
    const T = new THREE.Vector3(-ny, 0, nx).normalize();
    const blobs = 2 + Math.floor(random() * 3);
    for (let b = 0; b < blobs; b++) {
        const r = size * (0.25 + random() * 0.3) * metre;
        const c = toLocal(x, y, 0).addScaledVector(T, (random() - 0.5) * size * 2.2 * metre).addScaledVector(N, r * (0.4 + random() * 0.6));
        c.y = floorAt(x, y) + 0.004 * metre;
        const tone = MOSS_TONES[Math.floor(random() * MOSS_TONES.length)].map((v) => v * (1.6 + random() * 0.5));
        const h = r * (0.25 + random() * 0.2);
        const K = 7;
        const ring = [];
        for (let k = 0; k < K; k++) {
            const a = (k / K) * Math.PI * 2 + random() * 0.4;
            const rr = r * (0.75 + random() * 0.4);
            const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
            ring.push({ p: c.clone().addScaledVector(dir, rr), mid: c.clone().addScaledVector(dir, rr * 0.55).setY(c.y + h * (0.7 + random() * 0.25)), dir });
        }
        const top = buf.vertex(c.clone().setY(c.y + h), new THREE.Vector3(0, 1, 0), tone.map((v) => v * 1.15), null);
        const mids = ring.map((q) => buf.vertex(q.mid, q.dir.clone().setY(1.2).normalize(), tone, null));
        const outs = ring.map((q) => buf.vertex(q.p, q.dir.clone().setY(0.4).normalize(), tone.map((v) => v * 0.7), null));
        for (let k = 0; k < K; k++) {
            const n = (k + 1) % K;
            const up = new THREE.Vector3(0, 1, 0);
            buf.triangle(top, mids[k], mids[n], up);
            buf.triangle(mids[k], outs[k], outs[n], ring[k].dir.clone().setY(0.5));
            buf.triangle(mids[k], outs[n], mids[n], ring[k].dir.clone().setY(0.5));
        }
    }
}

export function flagMesh(mesh) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    Object.assign(mesh.userData, { sight: false, collision: false, cameraCollision: false, noShaders: true, noBatch: true });
    return mesh;
}

export function buildDressing(dress, ctx) {
    if (!dress) return [];
    const out = [];
    const tier = dressTier();
    if (!tier) return [];
    const detail = (ctx.detail ?? 1) * tier.detail;
    const film = dress.film ?? {};
    const level = new THREE.Vector4(film.a ?? 0, film.o ?? 0, film.d ?? 0, 0);
    const setLevel = () => (dressUniforms.dressMetre.value = ctx.metre);
    const gauze = tier.gauze ? new MeshBuffer(true) : null;
    const webs = buildCobwebs(thinWebs(dress.webs, tier.webs), ctx, gauze, detail);
    if (webs) out.push(webs);
    const gauzeGeometry = gauze?.geometry();
    if (gauzeGeometry) {
        const mesh = new THREE.Mesh(gauzeGeometry, gauzeMaterial());
        mesh.renderOrder = 3;
        mesh.onBeforeRender = setLevel;
        out.push(mesh);
    }
    const surf = new SurfaceBuffer();
    if (dress.film) addFilm(surf, dress.film, ctx);
    if (dress.walls?.length) addWalls(surf, dress, { ...ctx, stride: tier.wallStride });
    if (!tier.coat) surf.coat = [];
    for (const [geometry, material, order] of surf.geometries(level)) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = order;
        mesh.onBeforeRender = setLevel;
        mesh.userData.ownMaterial = true;
        out.push(mesh);
    }
    const leaves = new MeshBuffer();
    const stems = new StrandBuffer();
    for (const source of dress.ivy ?? []) addIvy(leaves, stems, source, ctx);
    for (const source of dress.roots ?? []) addRoot(stems, source, ctx);
    for (const source of tier.tufts ? dress.tufts ?? [] : []) addTuft(leaves, source, ctx);
    const leafGeometry = leaves.geometry();
    if (leafGeometry) out.push(new THREE.Mesh(leafGeometry, getLeafMaterial()));
    const stemGeometry = stems.geometry();
    if (stemGeometry) {
        const mesh = new THREE.Mesh(stemGeometry, strandMaterial("stem", { roughness: 0.85, metalness: 0 }, true));
        trackPixelSize(mesh);
        out.push(mesh);
    }
    return out.map(flagMesh);
}
