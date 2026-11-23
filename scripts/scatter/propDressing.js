import * as THREE from "three";
import { buildCobwebs, rng, gauzeMaterial, dressUniforms, useDressUniforms } from "./cobwebs.js";
import { MeshBuffer, MOSS_TONES, flagMesh, dressTier, thinWebs } from "./dressing.js";

const variants = new Map();
const band = (v) => Math.round(Math.max(0, Math.min(1, v ?? 0)) * 20) / 20;

const VERTEX_HEAD = `#include <common>
attribute vec4 dressProp;
varying vec4 vDpProp;
varying vec3 vDpPos;
varying vec3 vDpN;`;

const VERTEX_BODY = `#include <begin_vertex>
{
    vec4 dpP = vec4(transformed, 1.0);
    vec3 dpN = objectNormal;
    #ifdef USE_INSTANCING
    dpP = instanceMatrix * dpP;
    dpN = mat3(instanceMatrix) * dpN;
    #endif
    vDpPos = dpP.xyz;
    vDpN = dpN;
    vDpProp = dressProp;
}`;

const FRAGMENT_HEAD = `#include <common>
uniform sampler2D dsNoiseMap;
uniform float dressMetre;
uniform vec4 dressLevel;
varying vec4 vDpProp;
varying vec3 vDpPos;
varying vec3 vDpN;`;

const COLOR = `#include <color_fragment>
float dpH = (vDpPos.y - vDpProp.x) / dressMetre;
vec3 dpNrm = normalize(vDpN);
vec3 dpW = vDpPos / dressMetre;
vec2 dpP = abs(dpNrm.y) > 0.6 ? dpW.xz : vec2(dpW.x * dpNrm.z - dpW.z * dpNrm.x, dpW.y * 1.3);
vec4 dpA = texture2D(dsNoiseMap, dpP / 1.4 + vDpProp.x * 0.37);
vec4 dpB = texture2D(dsNoiseMap, dpP / 0.4 + vec2(0.31, 0.17));
vec4 dpC = texture2D(dsNoiseMap, dpP / 0.11 + vec2(0.67, 0.41));
float dpN0 = dressLevel.x;
float dpG = dpN0 * 1.4;
float dpUp = smoothstep(0.5, 0.97, dpNrm.y);
float dpBroad = smoothstep(0.2, 1.0, vDpProp.z);
float dpBreak = smoothstep(0.28, 0.72, dpA.r * 0.6 + dpB.r * 0.4 + (dpN0 - 0.5) * 0.2);
float dpDust = dpN0 * dpUp * mix(0.3 + 0.25 * dpN0, 1.0, dpBreak) * (0.55 + 0.5 * dpBroad) * (0.75 + 0.5 * dpC.b) * (0.6 + 0.55 * dpN0);
dpDust += dpN0 * dpN0 * 0.2 * smoothstep(0.1, 0.5, dpNrm.y) * (1.0 - dpUp) * dpB.a;
dpDust = clamp(dpDust, 0.0, 0.78);
float dpGround = vDpProp.w;
float dpGrime = min(dpG, 1.2) * (0.25 + 0.55 * min(dpG, 1.2)) * dpGround * exp(-max(0.0, dpH) / (0.1 + 0.3 * dpG)) * (0.55 + 0.7 * dpB.r);
dpGrime += dpG * dpG * 0.18 * (1.0 - smoothstep(0.2, 0.7, dpC.r * 0.6 + dpB.g * 0.4));
float dpWetTop = (0.04 + 0.4 * dressLevel.z) * (0.55 + 0.8 * dpA.a);
float dpWet = step(0.01, dressLevel.z) * dpGround * (1.0 - smoothstep(dpWetTop * 0.7, dpWetTop, dpH)) * min(1.0, 0.5 + dressLevel.z);
float dpMoss = 0.0;
#ifdef DP_MOSS
float dpMossT = dressLevel.y * dpGround * smoothstep(-0.3, 0.4, dpNrm.y) * (1.0 - smoothstep(0.03 + 0.2 * dressLevel.y, 0.1 + 0.4 * dressLevel.y, dpH)) * (0.6 + 0.4 * smoothstep(0.3, 0.9, dpNrm.y));
float dpGrow = dpA.g * 0.45 + dpB.g * 0.35 + dpC.g * 0.2;
dpMoss = smoothstep(0.84 - dpMossT * 0.45, 0.87 - dpMossT * 0.45, dpGrow) * step(0.01, dpMossT);
float dpTone = floor(clamp(dpC.r * 0.55 + dpB.b * 0.45, 0.0, 0.999) * 3.0);
vec3 dpMossCol = dpTone < 0.5 ? vec3(${MOSS_TONES[0].join(", ")}) : dpTone < 1.5 ? vec3(${MOSS_TONES[1].join(", ")}) : vec3(${MOSS_TONES[2].join(", ")});
#endif
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.34, 0.3, 0.26), clamp(dpGrime, 0.0, 0.85));
diffuseColor.rgb *= 1.0 - 0.5 * dpWet * vec3(1.0, 0.97, 0.93);
float dpLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(dpLum), vec3(0.27, 0.26, 0.24), 0.8) * (0.8 + 0.4 * dpC.a), dpDust);
#ifdef DP_MOSS
diffuseColor.rgb = mix(diffuseColor.rgb, dpMossCol * (0.85 + 0.3 * dpA.b), dpMoss * 0.96);
#endif`;

const ROUGH = `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 1.0, max(dpDust, dpMoss));
roughnessFactor = mix(roughnessFactor, 0.16, dpWet * (1.0 - dpMoss) * 0.85);`;

const METAL = `#include <metalnessmap_fragment>
metalnessFactor *= 1.0 - max(dpDust, dpMoss);`;

function dressPropCompile(shader, renderer) {
    this.userData.dpPrevious?.call(this, shader, renderer);
    useDressUniforms(shader);
    shader.uniforms.dressLevel = { value: this.userData.dpLevel };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", VERTEX_HEAD).replace("#include <begin_vertex>", VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", FRAGMENT_HEAD)
        .replace("#include <color_fragment>", COLOR)
        .replace("#include <roughnessmap_fragment>", ROUGH)
        .replace("#include <metalnessmap_fragment>", METAL);
}

export function propLevel(dress) {
    const film = dress?.film;
    if (!film || !dressTier()?.props) return null;
    const level = { n: band(film.a), o: band(film.o), d: band(film.d), sf: !!dress.sf };
    return level.n || level.o || level.d ? level : null;
}

function dressable(material) {
    if (!material?.isMeshStandardMaterial || material.transparent || material.alphaTest > 0 || material.userData?.noShaders) return false;
    const e = material.emissive;
    return !(e && material.emissiveIntensity * Math.max(e.r, e.g, e.b) > 0.25 && !material.emissiveMap);
}

export function isTechAsset(asset) {
    return /sci-?fi|SciFi/i.test(asset?.src ?? "") || /^S[FE]_/.test(asset?.id ?? "");
}

export function propMaterial(material, level, asset) {
    if (Array.isArray(material)) return material.map((m) => propMaterial(m, level, asset));
    if (!level || !dressable(material)) return material;
    const moss = level.o > 0 && !level.sf && !isTechAsset(asset) && !/metal|steel|iron|gold|bronze|glass|cloth|fabric|bed/i.test(material.name ?? "");
    const key = `${material.uuid}|${level.n}|${moss ? level.o : 0}|${level.d}`;
    if (!variants.has(key)) {
        const m = material.clone();
        const previous = material._userOnBeforeCompile;
        m.userData = { ...material.userData, dpPrevious: previous, dpLevel: new THREE.Vector4(level.n, moss ? level.o : 0, level.d, 0) };
        m.defines = { ...(material.defines ?? {}), DRESS_PROP: "", ...(moss ? { DP_MOSS: "" } : {}) };
        m.onBeforeCompile = dressPropCompile;
        const baseKey = THREE.Material.prototype.customProgramCacheKey;
        m.customProgramCacheKey = function () {
            return `${baseKey.call(this)}|dressProp|${previous?.toString() ?? ""}`;
        };
        variants.set(key, m);
    }
    return variants.get(key);
}

export function propFrame(inst, info, { metre, centerY, mPx }) {
    const a = inst.asset;
    const s = inst.scale ?? 1;
    const { min, max } = info.box;
    const cos = Math.cos(inst.yaw ?? 0), sin = Math.sin(inst.yaw ?? 0);
    const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
    const hx = ((max.x - min.x) / 2) * s, hz = ((max.z - min.z) / 2) * s;
    const hb = (inst.y - centerY) / metre + ((a.yOffset ?? 0) + min.y) * s;
    const ht = hb + (max.y - min.y) * s;
    const back = a.front === "-z" ? 1 : -1;
    const at = (u, v, h) => {
        const x = cx * s + u * hx, z = cz * s + v * hz;
        return { x: inst.x + (x * cos + z * sin) * mPx, y: inst.z + (-x * sin + z * cos) * mPx, h };
    };
    const axis = (u, v) => ({ x: u * cos + v * sin, y: -u * sin + v * cos });
    return { inst, asset: a, hx, hz, hb, ht, back, at, axis, ground: !inst.rx && !a.lay && !a.hung && hb < 0.12 && a.placement !== "table" };
}

export function dressPropVector(frame, metre) {
    const a = frame.asset;
    const hung = a.hung || a.placement === "wall" || a.placement === "ceiling";
    return [frame.hb * metre, frame.ht - frame.hb, Math.min(frame.hx, frame.hz) * 2, frame.ground ? 1 : hung || frame.hb > 0.3 ? 0 : frame.hb < 0.12 ? 0.6 : 0.3];
}

function strHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return h >>> 0;
}

function hash(...values) {
    let h = 0x811c9dc5;
    for (const v of values) {
        h = Math.imul(h ^ (v >>> 0), 0x01000193);
        h ^= h >>> 13;
        h = Math.imul(h, 0x5bd1e995);
        h ^= h >>> 15;
    }
    return h >>> 0;
}

const r2 = (v) => Math.round(v * 100) / 100;
const layers = (chance, roll, cap) => Math.min(cap, Math.floor(chance) + (roll < chance % 1 ? 1 : 0));

function kindOf(asset) {
    const id = `${asset.id ?? ""} ${asset.src ?? ""}`.toLowerCase();
    if (asset.placement === "table" || asset.lay || asset.stand || /rug|decal|torch|sign_|banner|vent|logo|candle|book|page|parchment|scroll|coin|key|mug|plate|fork|knife|spoon|bottle|potion|chalice|skull|bone|grass|fern|clover|bush/.test(id)) return null;
    if (asset.placement === "ceiling" || /chandelier|lantern|hanging|_beam|beam_/.test(id)) return "hang";
    if (/chair|stool/.test(id)) return "seat";
    if (/table|desk|bench|workbench|altar|counter/.test(id) && !/nightstand/.test(id)) return "table";
    if (/shel|cabinet|wardrobe|bookcase|dresser|locker|cupboard|rack|nightstand|holder/.test(id)) return "tall";
    return "bulk";
}

function wallFaces(dress, mPx) {
    return (dress.walls ?? []).map(([x1, y1, x2, y2, nx, ny]) => {
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        return { a: { x: x1, y: y1 }, t: { x: (x2 - x1) / len, y: (y2 - y1) / len }, n: { x: nx, y: ny }, len, mPx };
    });
}

function faceDistance(w, p) {
    const across = ((p.x - w.a.x) * w.n.x + (p.y - w.a.y) * w.n.y) / w.mPx;
    const along = (p.x - w.a.x) * w.t.x + (p.y - w.a.y) * w.t.y;
    const out = Math.max(0, -along, along - w.len) / w.mPx;
    return { across, out };
}

export function propWebs(frames, dress, scale) {
    const keep = dressTier()?.propWebs ?? 0;
    return keep ? thinWebs(allPropWebs(frames, dress, scale), keep) : [];
}

function allPropWebs(frames, dress, { mPx }) {
    const level = propLevel(dress);
    const N = level?.n ?? 0;
    if (!N) return [];
    const sci = dress.sf ? 0.6 : 1;
    const webMult = N * (0.8 + 2.2 * N * N) * sci;
    const sizeK = 0.6 + 1.0 * N;
    const strandA = r2(0.45 + 0.55 * N);
    const gauzeA = 0.15 + 0.75 * N;
    const ceilingH = dress.h ?? 3;
    const faces = wallFaces(dress, mPx);
    const out = [];
    const web = (R, pts, f = 0, extra = {}) => {
        const g = R(), t = R(), u = R(), d = R(), s = R(), z = R();
        out.push({ p: pts.flatMap((p) => [p.x, p.y, p.h]), f, g: r2(0.2 + g * 0.6), t: r2(Math.min(0.8, N * t * 0.8)), u: r2(N * (0.55 + 0.45 * u)), d: r2(0.3 + 0.7 * d), o: strandA, z: r2(gauzeA * (N > 0.3 ? 0.8 + 0.2 * z : 0.4 + 0.3 * z)), s: Math.floor(s * 0x7fffffff), ...extra });
    };
    const drape = (R, a, b) => web(R, [a, b], 0, { k: 1 });
    const off = (p, v, d) => ({ x: p.x + v.x * d * mPx, y: p.y + v.y * d * mPx, h: p.h });
    const items = frames.map((fr) => ({ ...fr, kind: kindOf(fr.asset), seed: hash(Math.round(fr.inst.x), Math.round(fr.inst.z), strHash(fr.asset.id ?? fr.asset.src ?? "")) })).filter((fr) => fr.kind && fr.ht - fr.hb > 0.12);
    const stream = (fr, tag, i = 0) => rng(hash(fr.seed, tag, i));
    for (const fr of items) {
        const { at, axis, ht, hb, hx, hz, back } = fr;
        const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
        if (fr.kind === "table" && fr.ground && ht > 0.35) {
            const hu = ht - Math.min(0.08, (ht - hb) * 0.12);
            corners.forEach(([u, v], ci) => {
                const R = stream(fr, 1, ci);
                const roll = R(), a = R(), b = R(), c = R(), footRoll = R(), fa = R(), fb = R(), fc = R();
                const C = at(u * 0.9, v * 0.9, hu);
                const du = axis(-u, 0), dv = axis(0, -v);
                const la = Math.min(hx * 1.6, (0.15 + a * 0.3) * sizeK), lb = Math.min(hz * 1.6, (0.15 + b * 0.3) * sizeK), lc = Math.min(hu - 0.05, (0.12 + c * 0.35) * sizeK);
                const count = layers(0.45 * webMult, roll, 2);
                for (let l = 0; l < count; l++) {
                    const L = stream(fr, 2, ci * 4 + l);
                    const drop = l * 0.04;
                    web(L, [{ ...off(C, du, la * (1 - 0.25 * l)), h: hu - drop }, { ...off(C, dv, lb * (1 - 0.25 * l)), h: hu - drop }, { ...C, h: hu - lc }], 1, { c: [r2(C.x), r2(C.y), r2(hu - drop)] });
                }
                if (footRoll < 0.22 * webMult) {
                    const F = at(u * 0.9, v * 0.9, hb + 0.01);
                    const s = (0.08 + fa * 0.15) * sizeK;
                    web(stream(fr, 3, ci), [{ ...off(F, axis(u, 0), s * (0.6 + fb)), h: hb + 0.01 }, { ...off(F, axis(0, v), s * (0.6 + fc)), h: hb + 0.01 }, { ...F, h: hb + s * 1.2 }], 0, { c: [r2(F.x), r2(F.y), r2(hb + 0.01)] });
                }
            });
            for (const side of [1, -1]) {
                const R = stream(fr, 4, side + 1);
                if (R() > 0.3 * webMult) continue;
                const long = hx >= hz;
                drape(R, at(long ? 0.9 : side * 0.9, long ? side * 0.9 : 0.9, hu - 0.02), at(long ? -0.9 : side * 0.9, long ? side * 0.9 : -0.9, hu - 0.02));
            }
        }
        if (fr.kind === "seat" && fr.ground) {
            const R = stream(fr, 5);
            const roll = R(), drapeRoll = R(), r1 = R(), r2v = R();
            if (roll < 0.4 * webMult) {
                web(stream(fr, 6), [at(0.85, back * 0.85, hb + (ht - hb) * (0.35 + 0.2 * r1)), at(-0.85, back * 0.85, hb + (ht - hb) * (0.25 + 0.25 * r2v)), at(0.1 * (r1 - 0.5), back * 0.85, hb + 0.02)], 3);
            }
            if (drapeRoll < 0.3 * webMult) drape(stream(fr, 7), at(0.85, back * 0.9, ht - 0.03), at(-0.85, back * 0.9, ht - 0.03));
        }
        if (fr.kind === "hang") {
            const R = stream(fr, 8);
            const roll = R(), roll2 = R(), roll3 = R(), a = R(), b = R();
            const ceiling = fr.asset.placement === "ceiling" || ht > ceilingH - 0.6;
            const tall = ht - hb > 1.2;
            if (roll < 0.5 * webMult) drape(stream(fr, 9), at(0.8, 0.3, hb + (ht - hb) * (tall ? 0.28 : 0.6)), at(-0.8, -0.3, hb + (ht - hb) * (tall ? 0.28 : 0.6)));
            if (roll2 < 0.4 * webMult) drape(stream(fr, 10), at(0.3, 0.8, hb + (ht - hb) * (tall ? 0.12 : 0.25)), at(-0.3, -0.8, hb + (ht - hb) * (tall ? 0.12 : 0.25)));
            if (ceiling && roll3 < 0.45 * webMult) {
                const top = at(0, 0, Math.min(ht, ceilingH) - 0.02);
                const H = ceilingH - 0.02;
                const s = (0.12 + a * 0.2) * sizeK;
                web(stream(fr, 11), [{ ...off(top, axis(1, 0.3), s), h: H }, { ...off(top, axis(-0.6, 0.8), s * (0.7 + b * 0.6)), h: H }, { ...off(top, axis(0.1, -0.1), 0.02), h: Math.max(hb + 0.1, H - (0.12 + a * 0.25) * sizeK) }], 2, { c: [r2(top.x), r2(top.y), r2(H)] });
            }
        }
        if ((fr.kind === "tall" || fr.kind === "bulk" || fr.kind === "table") && fr.ground && ht > 0.4) {
            let best = null;
            const backPts = [at(1, back, ht), at(-1, back, ht)];
            for (const w of faces) {
                const ds = backPts.map((p) => faceDistance(w, p));
                if (ds.some((d) => d.across < -0.05 || d.across > 0.45 || d.out > 0)) continue;
                const d = Math.min(...ds.map((q) => q.across));
                if (!best || d < best.d) best = { w, d, ds };
            }
            if (best) {
                const { w, ds } = best;
                for (const [si, u] of [1, -1].entries()) {
                    const R = stream(fr, 12, si);
                    const roll = R(), kind = R(), r1 = R(), r3 = R(), r4 = R(), r5 = R();
                    const count = layers((fr.kind === "tall" ? 0.6 : 0.4) * webMult, roll, 2);
                    const B = at(u, back, ht);
                    const across = ds[si].across;
                    const F = off(B, w.n, -across + 0.01);
                    const side = axis(u, 0);
                    for (let l = 0; l < count; l++) {
                        const L = stream(fr, 13, si * 4 + l);
                        if ((kind < 0.5) !== (l === 1) || fr.kind !== "tall") {
                            const d1 = (0.1 + r1 * 0.3) * sizeK;
                            web(L, [{ ...off(B, side, 0.01), h: ht - 0.02 }, { ...off(off(B, side, 0.01), w.n, Math.min(d1, hz * 1.5)), h: ht - 0.06 - r3 * 0.3 }, { ...off(F, side, (0.12 + r4 * 0.3) * sizeK), h: ht - 0.08 - r5 * 0.35 }], 6, { c: [r2(F.x), r2(F.y), r2(ht - 0.02)] });
                        } else {
                            const d3 = (0.08 + r1 * 0.25) * sizeK;
                            web(L, [{ ...off(B, axis(-u, 0), d3), h: ht + 0.01 }, { ...off(F, axis(-u, 0), d3 * 0.6), h: Math.min(ceilingH - 0.05, ht + (0.12 + r3 * 0.35) * sizeK) }, { ...off(B, side, 0.02), h: ht + 0.01 }], 5, { c: [r2(F.x), r2(F.y), r2(ht + 0.01)] });
                        }
                    }
                }
            }
        }
    }
    const solids = items.filter((fr) => fr.ground && (fr.kind === "bulk" || fr.kind === "tall" || fr.kind === "table") && fr.ht > 0.25);
    const raised = items.filter((fr) => !fr.ground && fr.kind === "bulk" && fr.hb > 0.2);
    const centre = (fr) => fr.at(0, 0, 0);
    for (let i = 0; i < solids.length; i++) {
        for (let j = i + 1; j < solids.length; j++) {
            const A = solids[i], B = solids[j];
            const ca = centre(A), cb = centre(B);
            const dist = Math.hypot(ca.x - cb.x, ca.y - cb.y) / mPx;
            const ra = Math.min(A.hx, A.hz), rb = Math.min(B.hx, B.hz);
            const gap = dist - ra - rb;
            if (gap > 0.5 || dist < 1e-3) continue;
            const R = rng(hash(Math.min(A.seed, B.seed), Math.max(A.seed, B.seed), 21));
            const roll = R(), h1 = R(), h2 = R(), sl = R(), lo = R();
            if (roll > 0.5 * webMult) continue;
            const dir = { x: (cb.x - ca.x) / (dist * mPx), y: (cb.y - ca.y) / (dist * mPx) };
            const perp = { x: -dir.y, y: dir.x };
            const H = Math.min(A.ht, B.ht);
            const shift = (sl - 0.5) * Math.min(ra, rb);
            const pa = off(off(ca, dir, ra * 0.92), perp, shift), pb = off(off(cb, dir, -rb * 0.92), perp, shift);
            const mid = { x: (pa.x + pb.x) / 2 + perp.x * (lo - 0.5) * 0.2 * mPx, y: (pa.y + pb.y) / 2 + perp.y * (lo - 0.5) * 0.2 * mPx };
            web(R, [{ ...pa, h: H * (0.55 + 0.4 * h1) }, { ...pb, h: H * (0.5 + 0.45 * h2) }, { ...mid, h: 0.02 + lo * H * 0.25 }], 1, { c: [r2(mid.x), r2(mid.y), r2(H * 0.6)] });
        }
    }
    for (const top of raised) {
        const ct = centre(top);
        const base = solids.find((s) => Math.abs(s.ht - top.hb) < 0.12 && Math.hypot(centre(s).x - ct.x, centre(s).y - ct.y) / mPx < Math.max(s.hx, s.hz));
        if (!base) continue;
        const R = stream(top, 22);
        const roll = R(), u = R() < 0.5 ? 1 : -1, a = R(), b = R();
        if (roll > 0.45 * webMult) continue;
        const C = top.at(u, top.back, top.hb + (0.08 + a * 0.25) * (top.ht - top.hb));
        const out = off(C, top.axis(u, 0), (0.1 + b * 0.25) * sizeK);
        web(R, [C, { ...out, h: base.ht + 0.01 }, { ...off(C, top.axis(0, top.back), (0.1 + a * 0.2) * sizeK), h: base.ht + 0.01 }], 1, { c: [r2(C.x), r2(C.y), r2(base.ht + 0.01)] });
    }
    return out;
}

export function buildPropWebs(webs, ctx) {
    if (!webs.length) return [];
    const out = [];
    const gauze = new MeshBuffer(true);
    const strands = buildCobwebs(webs, ctx, gauze, ctx.detail ?? 1);
    if (strands) out.push(strands);
    const geometry = gauze.geometry();
    if (geometry) {
        const mesh = new THREE.Mesh(geometry, gauzeMaterial());
        mesh.renderOrder = 3;
        mesh.onBeforeRender = () => (dressUniforms.dressMetre.value = ctx.metre);
        out.push(mesh);
    }
    return out.map(flagMesh);
}
