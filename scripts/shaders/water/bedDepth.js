import * as THREE from "three";
import { factor } from "../../main.js";
import { collectSurfaces, renderTopDown, topDownCamera } from "../../helpers/topDownRender.js";
import { clearLavaLights, syncLavaLights } from "./lavaLights.js";

const DEEP = 50;
const MAX_SHORE = 20;
const OVERHANG = 0.5;
const RANGE_CELLS = 200;
const HIDDEN = 1000;
const states = new Map();
let hooksReady = false;
let retries = 0;

export function waterQualityHigh() {
    return game.settings.settings.has("levels-3d-preview.waterQuality") ? game.settings.get("levels-3d-preview", "waterQuality") === "high" : true;
}

function blankTexture() {
    const half = THREE.DataUtils.toHalfFloat;
    const texture = new THREE.DataTexture(new Uint16Array([half(DEEP), half(MAX_SHORE), half(1), 0]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.needsUpdate = true;
    return texture;
}

export function getWaterState(entity3D) {
    let state = states.get(entity3D);
    if (state) return state;
    const cells = Math.max(entity3D.bb?.width ?? 1, entity3D.bb?.height ?? 1) / gridUnit();
    state = {
        entity3D,
        meshes: new Set(),
        params: {},
        uniforms: {
            bed: { value: blankTexture() },
            bedMatrix: { value: new THREE.Matrix4() },
            size: { value: cells },
            sdMax: { value: MAX_SHORE },
        },
    };
    states.set(entity3D, state);
    initHooks();
    refreshWaterBeds();
    return state;
}

function gridUnit() {
    return (canvas.scene?.grid.size ?? 100) / factor;
}

function initHooks() {
    if (hooksReady) return;
    hooksReady = true;
    for (const hook of ["createTile", "updateTile", "deleteTile"]) Hooks.on(hook, () => refreshWaterBeds());
    Hooks.on("3DCanvasSceneReady", (L, options) => !options?.levelSwitch && renderAll());
}

export const refreshWaterBeds = foundry.utils.debounce(renderAll, 500);

function renderAll() {
    const L = game.Levels3DPreview;
    if (!L?._active || !L.renderer) return;
    for (const [entity, state] of states) {
        if (entity._destroyed) {
            state.uniforms.bed.value.dispose();
            clearLavaLights(state);
            states.delete(entity);
        }
    }
    if (!states.size) return;
    const pending = Object.values(L.tiles).some((t) => t && !t._loaded);
    if (pending && retries++ < 40) return refreshWaterBeds();
    retries = 0;
    const rendered = [];
    for (const state of states.values()) {
        try {
            const bed = renderBed(state);
            if (bed) rendered.push(bed);
        } catch (e) {
            console.error("3D Canvas | water bed depth failed", e);
        }
    }
    for (const bed of rendered) finishBed(bed, rendered);
}

function isWater(entity) {
    return !!entity?.shaders?.realisticWater?.enabled;
}

function renderBed(state) {
    state.entity3D.prepareBed?.();
    const gs = gridUnit();
    const box = new THREE.Box3();
    for (const mesh of state.meshes) {
        if (!mesh.parent) continue;
        mesh.updateWorldMatrix(true, false);
        box.expandByObject(mesh);
    }
    if (box.isEmpty()) return;
    const surface = box.max.y;
    const w = Math.max(box.max.x - box.min.x, gs * 0.05);
    const h = Math.max(box.max.z - box.min.z, gs * 0.05);
    const high = waterQualityHigh();
    const perCell = high ? 16 : 8;
    const maxRes = high ? 512 : 256;
    const rw = THREE.MathUtils.clamp(Math.ceil((w / gs) * perCell), 64, maxRes);
    const rh = THREE.MathUtils.clamp(Math.ceil((h / gs) * perCell), 64, maxRes);
    const range = RANGE_CELLS * gs;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const top = topDownCamera(cx, cz, w, h, surface + range, range * 2);
    const below = topDownCamera(cx, cz, w, h, surface, range);
    const [fromTop, fromSurface] = renderTopDown(collectSurfaces((tile) => !isWater(tile)), rw, rh, [top, below]);
    const local = localSurfaces(state.entity3D.waterSurfaceAt, cx - w / 2, cz - h / 2, w, h, rw, rh);
    const depth = blur(classify(fromTop, fromSurface, rw * rh, surface, gs, local), rw, rh);
    if (state.params.contained !== false) contain(depth, rw, rh);
    state.uniforms.bedMatrix.value.multiplyMatrices(top.projectionMatrix, top.matrixWorldInverse);
    state.uniforms.size.value = Math.max(w, h) / gs;
    return { state, depth, local, rw, rh, x0: cx - w / 2, z0: cz - h / 2, w, h, surface, gs, area: w * h, id: state.entity3D.id ?? "" };
}

function localSurfaces(surfaceAt, x0, z0, w, h, rw, rh) {
    if (!surfaceAt) return null;
    const out = new Float32Array(rw * rh);
    for (let y = 0; y < rh; y++) {
        const z = z0 + h - ((y + 0.5) / rh) * h;
        for (let x = 0; x < rw; x++) out[y * rw + x] = surfaceAt(x0 + ((x + 0.5) / rw) * w, z) ?? NaN;
    }
    return out;
}

function slopeFlow(flow, local, depth, w, h, sx, sz) {
    const at = (x, y, c) => {
        const v = local[Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)];
        return Number.isNaN(v) ? c : v;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const c = local[i];
            if (depth[i] <= 0 || Number.isNaN(c)) continue;
            const gx = (at(x + 1, y, c) - at(x - 1, y, c)) / (2 * sx);
            const gz = -(at(x, y + 1, c) - at(x, y - 1, c)) / (2 * sz);
            const g = Math.hypot(gx, gz);
            const k = THREE.MathUtils.smoothstep(g, 0.01, 0.06);
            if (k <= 0) continue;
            const len = Math.max(Math.hypot(flow[i * 2], flow[i * 2 + 1]), 0.25);
            flow[i * 2] += (-(gx / g) * len - flow[i * 2]) * k;
            flow[i * 2 + 1] += (-(gz / g) * len - flow[i * 2 + 1]) * k;
        }
    }
}

function wetAt(bed, x, z) {
    const tx = Math.floor(((x - bed.x0) / bed.w) * bed.rw);
    const ty = Math.floor(((bed.z0 + bed.h - z) / bed.h) * bed.rh);
    if (tx < 0 || ty < 0 || tx >= bed.rw || ty >= bed.rh) return false;
    return bed.depth[ty * bed.rw + tx] > 0;
}

function owns(other, bed) {
    const dy = other.surface - bed.surface;
    if (Math.abs(dy) > bed.gs * 0.05) return dy > 0;
    if (other.area !== bed.area) return other.area < bed.area;
    return other.id < bed.id;
}

function finishBed(bed, all) {
    const { state, depth, rw, rh, w, h, gs } = bed;
    const hidden = new Uint8Array(rw * rh);
    for (const other of all) {
        if (other === bed || !owns(other, bed)) continue;
        if (other.x0 > bed.x0 + w || other.x0 + other.w < bed.x0 || other.z0 > bed.z0 + h || other.z0 + other.h < bed.z0) continue;
        for (let y = 0; y < rh; y++) {
            const z = bed.z0 + h - ((y + 0.5) / rh) * h;
            for (let x = 0; x < rw; x++) {
                const i = y * rw + x;
                if (depth[i] > 0 && !hidden[i] && wetAt(other, bed.x0 + ((x + 0.5) / rw) * w, z)) hidden[i] = 1;
            }
        }
    }
    const ax = w / gs / rw;
    const ay = h / gs / rh;
    const shore = shoreDistance(depth, rw, rh, ax, ay);
    let sdMax = 0;
    for (let i = 0; i < shore.length; i++) if (depth[i] > 0 && !hidden[i] && shore[i] > sdMax) sdMax = shore[i];
    const flow = flowField(depth, shore, rw, rh, ax, ay, Number(state.params.flow_direction ?? 0));
    if (bed.local) slopeFlow(flow, bed.local, depth, rw, rh, w / rw, h / rh);
    syncLavaLights(state, bed, shore, hidden, waterQualityHigh());
    for (let i = 0; i < shore.length; i++) if (hidden[i]) shore[i] += HIDDEN;
    upload(state, depth, shore, flow, rw, rh);
    state.uniforms.sdMax.value = sdMax || MAX_SHORE;
}

function blur(depth, w, h) {
    const out = new Float32Array(depth.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            let n = 0;
            for (let j = Math.max(y - 1, 0); j <= Math.min(y + 1, h - 1); j++) {
                for (let i = Math.max(x - 1, 0); i <= Math.min(x + 1, w - 1); i++) {
                    sum += Math.min(depth[j * w + i], 2);
                    n++;
                }
            }
            const d = depth[y * w + x];
            out[y * w + x] = d > 2 ? d : sum / n;
        }
    }
    return out;
}

function boxBlur(src, w, h, r, horizontal) {
    const out = new Float32Array(src.length);
    const lines = horizontal ? h : w;
    const len = horizontal ? w : h;
    const stride = horizontal ? 1 : w;
    const at = (base, k) => src[base + Math.min(Math.max(k, 0), len - 1) * stride];
    for (let l = 0; l < lines; l++) {
        const base = horizontal ? l * w : l;
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += at(base, k);
        for (let k = 0; k < len; k++) {
            out[base + k * stride] = sum / (2 * r + 1);
            sum += at(base, k + r + 1) - at(base, k - r);
        }
    }
    return out;
}

function maxFilter(src, w, h, r, horizontal) {
    let cur = src;
    let covered = 0;
    for (let s = 1; covered < r; s *= 2) {
        const step = Math.min(s, r - covered);
        covered += step;
        const out = new Float32Array(cur.length);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                let m = cur[i];
                if (horizontal) {
                    if (x >= step) m = Math.max(m, cur[i - step]);
                    if (x + step < w) m = Math.max(m, cur[i + step]);
                } else {
                    if (y >= step) m = Math.max(m, cur[i - step * w]);
                    if (y + step < h) m = Math.max(m, cur[i + step * w]);
                }
                out[i] = m;
            }
        }
        cur = out;
    }
    return cur;
}

function alignSigns(depth, fx, fz, w, h, dx, dz) {
    const n = w * h;
    const seen = new Uint8Array(n);
    const rx = new Float32Array(n);
    const rz = new Float32Array(n);
    const queue = new Int32Array(n);
    const flood = (start) => {
        const len = Math.hypot(fx[start], fz[start]);
        if (fx[start] * dx + fz[start] * dz < 0) {
            fx[start] = -fx[start];
            fz[start] = -fz[start];
        }
        rx[start] = len > 1e-6 ? fx[start] / len : dx;
        rz[start] = len > 1e-6 ? fz[start] / len : dz;
        seen[start] = 1;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        while (head < tail) {
            const i = queue[head++];
            const x = i % w;
            for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
                if (j < 0 || j >= n || seen[j] || depth[j] <= 0) continue;
                seen[j] = 1;
                if (fx[j] * rx[i] + fz[j] * rz[i] < 0) {
                    fx[j] = -fx[j];
                    fz[j] = -fz[j];
                }
                const len = Math.hypot(fx[j], fz[j]);
                rx[j] = len > 1e-6 ? fx[j] / len : rx[i];
                rz[j] = len > 1e-6 ? fz[j] / len : rz[i];
                queue[tail++] = j;
            }
        }
    };
    let best = -1;
    let bestDot = -Infinity;
    for (let i = 0; i < n; i++) {
        if (depth[i] <= 0) continue;
        const d = Math.abs(fx[i] * dx + fz[i] * dz) / (Math.hypot(fx[i], fz[i]) + 1e-6);
        if (d > bestDot) {
            bestDot = d;
            best = i;
        }
    }
    if (best >= 0) flood(best);
    for (let i = 0; i < n; i++) if (depth[i] > 0 && !seen[i]) flood(i);
}

function curvature(fx, fz, depth, w, h, ax, ay) {
    const n = w * h;
    const ux = new Float32Array(n);
    const uz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const len = Math.hypot(fx[i], fz[i]);
        if (len > 1e-6) {
            ux[i] = fx[i] / len;
            uz[i] = fz[i] / len;
        }
    }
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (depth[i] <= 0) continue;
            const l = x > 0 ? i - 1 : i, r = x < w - 1 ? i + 1 : i, u = y > 0 ? i - w : i, d = y < h - 1 ? i + w : i;
            const sx = 1 / ((r - l) * ax || 1), sz = -w / ((d - u) * ay || 1);
            const cx = ux[i] * (ux[r] - ux[l]) * sx + uz[i] * (ux[d] - ux[u]) * sz;
            const cz = ux[i] * (uz[r] - uz[l]) * sx + uz[i] * (uz[d] - uz[u]) * sz;
            out[i] = Math.hypot(cx, cz);
        }
    }
    return out;
}

function flowField(depth, shore, w, h, ax, ay, degrees) {
    const dx = Math.cos(THREE.MathUtils.degToRad(degrees));
    const dz = Math.sin(THREE.MathUtils.degToRad(degrees));
    let fx = new Float32Array(w * h);
    let fz = new Float32Array(w * h);
    const at = (x, y) => shore[Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (depth[i] <= 0) continue;
            fx[i] = (at(x, y + 1) - at(x, y - 1)) / (2 * ay);
            fz[i] = (at(x + 1, y) - at(x - 1, y)) / (2 * ax);
        }
    }
    alignSigns(depth, fx, fz, w, h, dx, dz);
    const r = Math.max(2, Math.round(0.4 / Math.min(ax, ay)));
    for (let pass = 0; pass < 2; pass++) {
        fx = boxBlur(boxBlur(fx, w, h, r, true), w, h, r, false);
        fz = boxBlur(boxBlur(fz, w, h, r, true), w, h, r, false);
    }
    const hw = maxFilter(maxFilter(shore, w, h, Math.round(1.5 / ax), true), w, h, Math.round(1.5 / ay), false);
    let bend = curvature(fx, fz, depth, w, h, ax, ay);
    for (let i = 0; i < w * h; i++) bend[i] *= hw[i];
    bend = boxBlur(boxBlur(bend, w, h, r, true), w, h, r, false);
    const flow = new Float32Array(w * h * 2);
    for (let i = 0; i < w * h; i++) {
        const len = Math.hypot(fx[i], fz[i]);
        const g = depth[i] > 0 && len > 1e-3 ? (1 - THREE.MathUtils.smoothstep(hw[i], 0.8, 1.5)) * (1 - THREE.MathUtils.smoothstep(bend[i], 0.45, 0.85)) : 0;
        let vx = (len > 1e-3 ? fx[i] / len : 0) * g + dx * (1 - g);
        let vz = (len > 1e-3 ? fz[i] / len : 0) * g + dz * (1 - g);
        const vl = Math.hypot(vx, vz);
        if (vl < 1e-3) {
            vx = dx;
            vz = dz;
        } else {
            vx /= vl;
            vz /= vl;
        }
        const s = THREE.MathUtils.clamp(hw[i], 0.05, 4) / 4;
        flow[i * 2] = vx * s;
        flow[i * 2 + 1] = vz * s;
    }
    return flow;
}

function classify(fromTop, fromSurface, n, max, gs, local) {
    const depth = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const k = i * 4;
        const surface = local ? local[i] : max;
        if (Number.isNaN(surface)) {
            depth[i] = -0.05;
            continue;
        }
        if (fromTop[k + 1] < 0.5) {
            depth[i] = DEEP;
            continue;
        }
        const above = (fromTop[k] - surface) / gs;
        if (above <= 0) depth[i] = -above;
        else if (above > OVERHANG && fromSurface[k + 1] > 0.5 && fromSurface[k + 2] > 0.5) depth[i] = (surface - fromSurface[k]) / gs;
        else depth[i] = -Math.min(Math.max(above, 0.02), 2);
    }
    return depth;
}

function contain(depth, w, h) {
    const start = Math.floor(h / 2) * w + Math.floor(w / 2);
    if (depth[start] <= 0) return;
    const keep = new Uint8Array(w * h);
    const stack = [start];
    keep[start] = 1;
    while (stack.length) {
        const i = stack.pop();
        const x = i % w;
        const neighbours = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
        for (const j of neighbours) {
            if (j < 0 || j >= w * h || keep[j] || depth[j] <= 0) continue;
            keep[j] = 1;
            stack.push(j);
        }
    }
    for (let i = 0; i < depth.length; i++) if (!keep[i] && depth[i] > 0) depth[i] = -0.05;
}

function shoreDistance(depth, w, h, ax, ay) {
    const dist = new Float32Array(w * h);
    for (let i = 0; i < dist.length; i++) dist[i] = depth[i] <= 0 ? 0 : MAX_SHORE;
    const ad = Math.hypot(ax, ay);
    const relax = (i, j, cost) => {
        if (dist[j] + cost < dist[i]) dist[i] = dist[j] + cost;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (x > 0) relax(i, i - 1, ax);
            if (y > 0) {
                relax(i, i - w, ay);
                if (x > 0) relax(i, i - w - 1, ad);
                if (x < w - 1) relax(i, i - w + 1, ad);
            }
        }
    }
    for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            if (x < w - 1) relax(i, i + 1, ax);
            if (y < h - 1) {
                relax(i, i + w, ay);
                if (x < w - 1) relax(i, i + w + 1, ad);
                if (x > 0) relax(i, i + w - 1, ad);
            }
        }
    }
    return dist;
}

function upload(state, depth, shore, flow, w, h) {
    const half = THREE.DataUtils.toHalfFloat;
    const data = new Uint16Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        data[i * 4] = half(depth[i]);
        data[i * 4 + 1] = half(shore[i]);
        data[i * 4 + 2] = half(flow[i * 2]);
        data[i * 4 + 3] = half(flow[i * 2 + 1]);
    }
    const old = state.uniforms.bed.value;
    if (old.image.width === w && old.image.height === h) {
        old.image.data = data;
        old.needsUpdate = true;
        return;
    }
    const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    state.uniforms.bed.value = texture;
    old.dispose();
}
