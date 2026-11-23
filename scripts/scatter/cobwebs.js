import * as THREE from "three";

const STRAND = 0.0009;
const pixelUniform = { value: 0.002 };
const _size = new THREE.Vector2();
const materials = new Map();
const SILK = new THREE.Color(0xe8e6df);
const DUST_LIGHT = new THREE.Color(0.5, 0.48, 0.44);
const DUST_DARK = new THREE.Color(0.31, 0.3, 0.28);
const UP = new THREE.Vector3(0, 1, 0);

export const dressUniforms = { dsNoiseMap: { value: null }, dressMetre: { value: 1 } };

let noiseTexture = null;

export function dressNoise() {
    if (noiseTexture) return noiseTexture;
    const S = 256;
    const random = rng(91731);
    const lattice = (period) => Float32Array.from({ length: period * period }, () => random());
    const value = (g, period, x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        const fx = x - xi, fy = y - yi;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const at = (i, j) => g[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
        const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
        const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
        return a + (b - a) * sy;
    };
    const fbm = (base, octaves) => {
        const grids = Array.from({ length: octaves }, (_, o) => lattice(base << o));
        return (x, y) => {
            let v = 0, a = 0.5, n = 0;
            for (let o = 0; o < octaves; o++) {
                const p = base << o;
                v += a * value(grids[o], p, (x / S) * p, (y / S) * p);
                n += a;
                a *= 0.5;
            }
            return v / n;
        };
    };
    const cells = 12;
    const points = Array.from({ length: cells * cells }, () => [random(), random()]);
    const worley = (x, y) => {
        const fx = (x / S) * cells, fy = (y / S) * cells;
        const ci = Math.floor(fx), cj = Math.floor(fy);
        let best = 9;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const i = ci + di, j = cj + dj;
            const p = points[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
            best = Math.min(best, Math.hypot(i + p[0] - fx, j + p[1] - fy));
        }
        return 1 - Math.min(1, best);
    };
    const channels = [fbm(4, 5), worley, fbm(16, 3), fbm(6, 4)];
    const raw = channels.map((fn) => {
        const out = new Float32Array(S * S);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) out[y * S + x] = fn(x, y);
        return out;
    });
    const data = new Uint8Array(S * S * 4);
    raw.forEach((arr, c) => {
        let lo = Infinity, hi = -Infinity;
        for (const v of arr) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
        }
        for (let k = 0; k < arr.length; k++) data[k * 4 + c] = Math.round(((arr[k] - lo) / Math.max(1e-6, hi - lo)) * 255);
    });
    noiseTexture = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
    noiseTexture.magFilter = THREE.LinearFilter;
    noiseTexture.minFilter = THREE.LinearMipmapLinearFilter;
    noiseTexture.generateMipmaps = true;
    noiseTexture.needsUpdate = true;
    return noiseTexture;
}

export function useDressUniforms(shader) {
    dressUniforms.dsNoiseMap.value = dressNoise();
    Object.assign(shader.uniforms, dressUniforms);
}

const WEB_LIGHT = `#include <lights_physical_pars_fragment>
#ifdef WEB_LIT
float wbGlow = 0.0;
void RE_Direct_Web(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    float wbFront = 0.3 + 0.7 * abs(dot(geometryNormal, directLight.direction));
    float wbBack = pow(saturate(dot(-geometryViewDir, directLight.direction)), 5.0);
    wbGlow += wbBack * min(dot(directLight.color, vec3(0.299, 0.587, 0.114)), 4.0);
    reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseColor) * (wbFront * 0.6 + wbBack * 5.0);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Web
#endif`;

const WEB_NORMAL = `#include <normal_fragment_begin>
#ifdef WEB_LIT
normal = normalize(vViewPosition);
#else
normal = dot(normal, vViewPosition) < 0.0 ? -normal : normal;
#endif`;

const WEB_OPAQUE = `#ifdef WEB_LIT
diffuseColor.a = clamp(diffuseColor.a * (1.0 + wbGlow * 1.2), 0.0, 1.0);
#endif
#include <opaque_fragment>`;

function webLighting(shader) {
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <lights_physical_pars_fragment>", WEB_LIGHT)
        .replace("#include <normal_fragment_begin>", WEB_NORMAL)
        .replace("#include <opaque_fragment>", WEB_OPAQUE);
}

const VERTEX_HEAD = `#include <common>
attribute vec3 webOther;
attribute vec2 webStrand;
uniform float webPixel;
varying float vWebFade;`;

const VERTEX_BODY = `#include <begin_vertex>
{
    vec3 wbA = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
    vec3 wbB = (modelViewMatrix * vec4(webOther, 1.0)).xyz;
    vec3 wbSide = cross(wbB - wbA, wbA);
    float wbLen = length(wbSide);
    wbSide = wbLen > 1e-12 ? wbSide / wbLen : vec3(0.0);
    float wbDepth = projectionMatrix[3][3] > 0.5 ? 1.0 : -wbA.z;
    float wbHalf = max(abs(webStrand.x), wbDepth * webPixel / projectionMatrix[1][1] * 0.75);
    vWebFade = webStrand.y * max(abs(webStrand.x) / wbHalf, 0.5);
    #ifdef WEB_ROUND
    vNormal = normalize(wbSide * sign(webStrand.x) * 0.9 + normalize(-wbA) * 0.45);
    #endif
    transformed += inverse(mat3(modelViewMatrix)) * (wbSide * wbHalf * sign(webStrand.x));
}`;

const FRAGMENT_HEAD = `#include <common>
varying float vWebFade;`;

function strandCompile(shader) {
    shader.uniforms.webPixel = pixelUniform;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", VERTEX_HEAD).replace("#include <begin_vertex>", VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", FRAGMENT_HEAD).replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= clamp(vWebFade, 0.0, 1.0);");
    webLighting(shader);
}

export function strandMaterial(key, params, round = false, lit = false) {
    if (materials.has(key)) return materials.get(key);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, ...params });
    material.defines = { ...(round ? { WEB_ROUND: "" } : {}), ...(lit ? { WEB_LIT: "" } : {}) };
    material.onBeforeCompile = strandCompile;
    material.userData.noShaders = true;
    materials.set(key, material);
    return material;
}

const GAUZE_VERTEX_HEAD = `#include <common>
attribute vec4 dressFx;
varying vec4 vGauzeFx;
varying vec3 vGauzeWorld;`;

const GAUZE_VERTEX_BODY = `#include <begin_vertex>
vGauzeFx = dressFx;
vGauzeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

const GAUZE_FRAGMENT_HEAD = `#include <common>
uniform sampler2D dsNoiseMap;
uniform float dressMetre;
varying vec4 vGauzeFx;
varying vec3 vGauzeWorld;`;

const GAUZE_COLOR = `#include <color_fragment>
{
    vec3 gzW = vGauzeWorld / dressMetre;
    vec2 gzP = vec2(gzW.x + gzW.y * 0.6, gzW.z - gzW.y * 0.8) + vGauzeFx.y * 1.37;
    vec4 gzA = texture2D(dsNoiseMap, gzP * 0.8);
    vec4 gzB = texture2D(dsNoiseMap, gzP * 3.3 + 0.5);
    float gzClot = smoothstep(0.25, 0.85, gzA.r * 0.7 + gzB.r * 0.3);
    float gzHole = smoothstep(0.12, 0.34, gzA.a * 0.8 + gzB.b * 0.2);
    diffuseColor.a *= vGauzeFx.x * (0.3 + 1.1 * gzClot) * (0.6 + 0.4 * gzB.b) * gzHole;
    diffuseColor.rgb *= 0.85 + 0.3 * gzClot;
}`;

function gauzeCompile(shader) {
    useDressUniforms(shader);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", GAUZE_VERTEX_HEAD).replace("#include <begin_vertex>", GAUZE_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", GAUZE_FRAGMENT_HEAD).replace("#include <color_fragment>", GAUZE_COLOR);
    webLighting(shader);
}

export function gauzeMaterial() {
    if (materials.has("gauze")) return materials.get("gauze");
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, emissive: new THREE.Color(0.012, 0.012, 0.011), envMapIntensity: 0.3, forceSinglePass: true });
    material.defines = { WEB_LIT: "" };
    material.onBeforeCompile = gauzeCompile;
    material.userData.noShaders = true;
    materials.set("gauze", material);
    return material;
}

export function trackPixelSize(mesh) {
    mesh.onBeforeRender = (renderer) => {
        renderer.getDrawingBufferSize(_size);
        pixelUniform.value = 2 / Math.max(1, _size.y);
    };
}

export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class StrandBuffer {
    constructor() {
        this.position = [];
        this.other = [];
        this.strand = [];
        this.normal = [];
        this.color = [];
        this.index = [];
        this.tint = SILK;
    }

    segment(a, b, width, alpha, n, wb = width) {
        const base = this.position.length / 3;
        for (const [p, q, side, w] of [[a, b, 1, width], [a, b, -1, width], [b, a, -1, wb], [b, a, 1, wb]]) {
            this.position.push(p.x, p.y, p.z);
            this.other.push(q.x, q.y, q.z);
            this.strand.push(w * side, alpha);
            this.normal.push(n.x, n.y, n.z);
            this.color.push(this.tint.r, this.tint.g, this.tint.b);
        }
        this.index.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }

    line(points, width, alpha, n, fadeEnd = false) {
        for (let k = 1; k < points.length; k++) this.segment(points[k - 1], points[k], width, fadeEnd ? alpha * (1 - (k - 1) / (points.length - 1)) : alpha, n);
    }

    tapered(points, w0, w1, alpha, n) {
        const last = points.length - 1;
        for (let k = 1; k <= last; k++) this.segment(points[k - 1], points[k], w0 + (w1 - w0) * ((k - 1) / last), alpha, n, w0 + (w1 - w0) * (k / last));
    }

    geometry() {
        if (!this.index.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
        g.setAttribute("webOther", new THREE.Float32BufferAttribute(this.other, 3));
        g.setAttribute("webStrand", new THREE.Float32BufferAttribute(this.strand, 2));
        g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 3));
        g.setIndex(this.index);
        g.computeBoundingSphere();
        g.computeBoundingBox();
        return g;
    }
}

function frameNormal(P) {
    const n = new THREE.Vector3();
    for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        n.x += (a.y - b.y) * (a.z + b.z);
        n.y += (a.z - b.z) * (a.x + b.x);
        n.z += (a.x - b.x) * (a.y + b.y);
    }
    return n.lengthSq() > 1e-12 ? n.normalize() : new THREE.Vector3(0, 1, 0);
}

export function catenary(a, b, drop, steps) {
    const out = [];
    for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const p = a.clone().lerp(b, t);
        p.y -= drop * 4 * t * (1 - t);
        out.push(p);
    }
    return out;
}

const threadWidth = (random, w) => (random() < 0.1 ? w * (2 + random() * 2) : w * (0.5 + random() * 0.6));
const threadAlpha = (random, o) => o * (0.2 + 0.8 * random() * random());

function hanger(buf, top, random, metre, w, o, n) {
    const len = (0.05 + Math.pow(random(), 1.6) * 0.35) * metre;
    const sway = new THREE.Vector3(random() - 0.5, 0, random() - 0.5).multiplyScalar(len * 0.35);
    const pts = [];
    for (let s = 0; s <= 5; s++) {
        const t = s / 5;
        pts.push(top.clone().addScaledVector(sway, t * t).setY(top.y - len * t));
    }
    buf.line(pts, w * (0.7 + random() * 0.6), o * (0.5 + random() * 0.4), n);
    const tip = pts[pts.length - 1];
    if (random() < 0.6) buf.segment(tip.clone().setY(tip.y + len * 0.12), tip, w * (1.5 + random()), o * 0.6, n);
}

function addDrape(buf, gauze, web, P, metre, random, detail) {
    const [A, B] = P;
    const span = A.distanceTo(B);
    if (span < 1e-6) return;
    const n = new THREE.Vector3().subVectors(B, A).cross(UP).normalize();
    const w = STRAND * metre, o = web.o ?? 0.7, z = web.z ?? 0.4;
    const color = DUST_LIGHT.clone().lerp(DUST_DARK, (web.u ?? 0.5) * 0.7);
    buf.tint = color;
    const low = catenary(A, B, (0.06 + random() * 0.14) * metre + span * 0.08, 10);
    const strands = 2 + Math.floor(random() * 3);
    for (let s = 0; s < strands; s++) {
        const pts = catenary(A.clone().addScaledVector(n, (random() - 0.5) * 0.03 * metre), B.clone().addScaledVector(n, (random() - 0.5) * 0.03 * metre), (0.03 + random() * 0.18) * metre + span * 0.05, 10);
        buf.line(pts, threadWidth(random, w), threadAlpha(random, o) + o * 0.2, n);
    }
    if (gauze && z > 0) {
        const seed = ((web.s ?? 1) % 89) + 1;
        const rows = [0, 0.5, 1].map((t) => low.map((p, k) => gauze.vertex(A.clone().lerp(B, k / 10).lerp(p, t).addScaledVector(n, (random() - 0.5) * 0.02 * metre), n, [color.r, color.g, color.b], [z * (t < 0.25 ? 0.75 : t < 0.75 ? 0.6 : 0.04) * (0.6 + random() * 0.7), seed, 0, 0])));
        for (let r = 0; r + 1 < rows.length; r++) for (let k = 0; k < 10; k++) {
            gauze.triangle(rows[r][k], rows[r + 1][k], rows[r][k + 1], n);
            gauze.triangle(rows[r][k + 1], rows[r + 1][k], rows[r + 1][k + 1], n);
        }
    }
    const tufts = Math.round((1 + random() * 3) * detail);
    for (let t = 0; t < tufts; t++) hanger(buf, low[1 + Math.floor(random() * 9)], random, metre, w, o, n);
}

function addWeb(buf, web, toLocal, metre, gauze, detail) {
    const flat = web.p ?? [];
    const P = [];
    for (let i = 0; i + 2 < flat.length; i += 3) P.push(toLocal(flat[i], flat[i + 1], flat[i + 2]));
    const random = rng(web.s ?? 1);
    if (web.k === 1) return P.length >= 2 && addDrape(buf, gauze, web, P, metre, random, detail);
    if (P.length < 3) return;
    const N = frameNormal(P);
    const C = P.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length);
    const L = P.reduce((sum, p) => sum + p.distanceTo(C), 0) / P.length;
    if (L < 1e-6) return;
    const H = (web.c ? toLocal(web.c[0], web.c[1], web.c[2]) : C.clone()).lerp(C, 0.2 + random() * 0.12);
    const dust = web.u ?? 0.4, tear = web.t ?? 0, o = web.o ?? 0.6, z = web.z ?? 0.3;
    const sag = (web.g ?? 0.4) * L * 0.22;
    const w = STRAND * metre;
    const color = DUST_LIGHT.clone().lerp(DUST_DARK, dust * 0.7 + random() * 0.15);
    buf.tint = color;
    const free = web.f ?? 0;
    const rim = [];
    const edgeFree = [];
    P.forEach((p, i) => {
        const q = P[(i + 1) % P.length];
        const isFree = !!(free & (1 << i));
        const scallop = (0.12 + random() * 0.22) * (isFree ? 1 : 0.3);
        const drop = isFree ? p.distanceTo(q) * (0.05 + random() * 0.12) * (0.6 + (web.g ?? 0.4)) : 0;
        const steps = 5;
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const e = p.clone().lerp(q, t).lerp(H, scallop * Math.sin(Math.PI * t));
            e.y -= drop * 4 * t * (1 - t);
            rim.push({ p: e, t, free: isFree });
        }
        edgeFree.push(isFree);
    });
    const K = rim.length;
    const bump = Array.from({ length: K * 6 }, () => (random() - 0.5) * L * 0.05);
    const point = (k, r, layer = 0) => {
        const kk = ((k % K) + K) % K;
        const e = rim[kk];
        const p = H.clone().lerp(e.p, r);
        const weight = 0.35 + 0.65 * Math.sin(Math.PI * e.t);
        p.y -= sag * Math.sin(Math.PI * Math.min(1, r)) * weight * (1 + layer * 0.45);
        p.addScaledVector(N, bump[(kk * 6 + Math.round(r * 4) + layer) % bump.length] * Math.sin(Math.PI * r) + layer * L * 0.04);
        return p;
    };
    const tornFrom = random() < tear * 1.4 ? Math.floor(random() * K) : -1;
    const tornSpan = tornFrom >= 0 ? 1 + Math.floor(random() * Math.max(1, K * tear * 0.4)) : 0;
    const torn = (k) => tornFrom >= 0 && (((k - tornFrom) % K) + K) % K < tornSpan;
    const sheets = z > 0 ? 1 + (dust > 0.4 ? 1 : 0) + (dust > 0.7 ? 1 : 0) : 0;
    if (gauze) {
        const seed = ((web.s ?? 1) % 89) + 1;
        const rgb = [color.r * 1.05, color.g * 1.05, color.b * 1.05];
        const radii = [0.3, 0.55, 0.8, 1];
        for (let layer = 0; layer < sheets; layer++) {
            const k0 = layer ? 0.5 : 1;
            const hub = gauze.vertex(point(0, 0, layer), N, rgb, [z * k0 * 1.1, seed + layer * 7, 0, 0]);
            const rings = radii.map((r) => Array.from({ length: K }, (_, k) => gauze.vertex(point(k, r, layer), N, rgb, [z * k0 * Math.max(0, 1 - Math.pow(r, 1.6)) * (0.8 + random() * 0.35), seed + layer * 7, 0, 0])));
            for (let k = 0; k < K; k++) {
                const n = (k + 1) % K;
                if (layer && random() < 0.25) continue;
                gauze.triangle(hub, rings[0][k], rings[0][n], N);
                for (let r = 0; r + 1 < rings.length; r++) {
                    if ((torn(k) || torn(n)) && r >= 1) continue;
                    gauze.triangle(rings[r][k], rings[r + 1][k], rings[r + 1][n], N);
                    gauze.triangle(rings[r][k], rings[r + 1][n], rings[r][n], N);
                }
            }
        }
    }
    for (let k = 0; k < K; k++) {
        const e = rim[k], f = rim[(k + 1) % K];
        if (torn(k) || (!e.free && random() < 0.6)) continue;
        buf.segment(e.p, f.p, threadWidth(random, w), threadAlpha(random, o) + o * 0.15, N);
    }
    for (const p of P) if (random() < 0.8) buf.segment(point(0, 0), p, threadWidth(random, w), threadAlpha(random, o) + o * 0.2, N);
    const tangle = Math.round((6 + 20 * (web.d ?? 0.5)) * (0.5 + dust) * detail);
    const loose = [];
    for (let s = 0; s < tangle; s++) {
        const k = Math.floor(random() * K);
        const a = point(k, 0.1 + random() * 0.9, Math.floor(random() * Math.max(1, sheets)));
        const b = random() < 0.25 ? P[Math.floor(random() * P.length)].clone() : point(k + Math.floor((random() - 0.5) * K * 0.5), 0.1 + random() * 0.9);
        b.addScaledVector(N, (random() - 0.5) * L * 0.25).y -= random() * L * 0.15;
        if (a.distanceTo(b) < L * 0.08) continue;
        if (torn(k) && random() < 0.6) {
            loose.push(a);
            continue;
        }
        buf.segment(a, b, threadWidth(random, w), threadAlpha(random, o), N);
    }
    const hangers = Math.round((random() * 1.5 + dust * 3 + tear * 3) * detail) + Math.min(loose.length, 3);
    for (let d = 0; d < hangers; d++) {
        const free = rim.filter((e) => e.free);
        const top = d < Math.min(loose.length, 3) ? loose[d] : free.length && random() < 0.6 ? free[Math.floor(random() * free.length)].p : point(Math.floor(random() * K), 0.5 + random() * 0.5);
        hanger(buf, top, random, metre, w, o, N);
    }
}

export function buildCobwebs(webs, { toLocal, metre }, gauze = null, detail = 1) {
    if (!webs?.length) return null;
    const buf = new StrandBuffer();
    for (const web of webs) addWeb(buf, web, toLocal, metre, gauze, detail);
    const geometry = buf.geometry();
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, strandMaterial("web", { roughness: 0.9, metalness: 0, transparent: true, opacity: 0.9, depthWrite: false, forceSinglePass: true, emissive: new THREE.Color(0.012, 0.012, 0.011), envMapIntensity: 0.3 }, false, true));
    mesh.renderOrder = 3;
    trackPixelSize(mesh);
    return mesh;
}
