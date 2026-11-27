import * as THREE from "three";
import { factor } from "../main.js";
import { tileCut } from "./tileOcclusion.js";
import { sampleLightAt } from "../vfx/probe.js";

const CHANGE_HOOK = "3DCanvasDiceGeometryChanged";
const REST_HOOK = "3DCanvasDiceCameraRest";
const REST_MS = 300;
const CAMERA_ELEMENTS = [8, 9, 10, 12, 13, 14];
const CAMERA_EPSILON = 1e-7;
const WATCHED = ["Tile", "Wall"].flatMap((name) => [`create${name}`, `update${name}`, `delete${name}`]);
const CHUNK = 256;
const EXTRACT_SLICE = 4096;
const FADED_CUT = 0.5;
const queryBox = new THREE.Box3();
const worldBox = new THREE.Box3();
const instanceMatrix = new THREE.Matrix4();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const projected = new THREE.Vector3();
const lightColor = new THREE.Color();
const tokenTriangles = new WeakMap();

function localTriangles(geometry) {
    let out = tokenTriangles.get(geometry);
    if (out) return out;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const count = Math.floor((index ? index.count : position.count) / 3);
    out = new Float32Array(count * 9);
    for (let c = 0; c < count * 3; c++) {
        const i = index ? index.getX(c) : c;
        out[c * 3] = position.getX(i);
        out[c * 3 + 1] = position.getY(i);
        out[c * 3 + 2] = position.getZ(i);
    }
    tokenTriangles.set(geometry, out);
    return out;
}
export const TRIANGLE_DOUBLE_SIDED = 1;
export const TRIANGLE_CUTOUT = 2;
export const TRIANGLE_FADED = 4;
export const TRIANGLE_TOKEN = 8;

function materialFlags(material) {
    const list = Array.isArray(material) ? material : [material];
    let flags = 0;
    for (const m of list) {
        if (!m) continue;
        if (m.side === THREE.DoubleSide) flags |= TRIANGLE_DOUBLE_SIDED;
        if (m.alphaTest > 0 || m.alphaHash || (m.transparent && m.opacity < 0.99) || m.visible === false) flags |= TRIANGLE_CUTOUT;
    }
    return flags;
}

function srgbToLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function selectKth(values, k) {
    let left = 0, right = values.length - 1;
    while (right > left) {
        const pivot = values[(left + right) >> 1];
        let i = left, j = right;
        while (i <= j) {
            while (values[i] < pivot) i++;
            while (values[j] > pivot) j--;
            if (i <= j) {
                const t = values[i];
                values[i++] = values[j];
                values[j--] = t;
            }
        }
        if (k <= j) right = j;
        else if (k >= i) left = i;
        else break;
    }
    return values[k];
}

class TriangleSink {
    constructor(capacity = 16384) {
        this.sources = new Uint32Array(capacity);
        this.offsets = new Uint32Array(capacity);
        this.keys = new Float32Array(capacity);
        this.flags = new Uint8Array(capacity);
        this.count = 0;
    }

    grow() {
        const size = this.keys.length * 2;
        for (const name of ["sources", "offsets", "keys", "flags"]) {
            const next = new this[name].constructor(size);
            next.set(this[name]);
            this[name] = next;
        }
    }

    push(source, offset, key, flags) {
        if (this.count === this.keys.length) this.grow();
        const n = this.count++;
        this.sources[n] = source;
        this.offsets[n] = offset;
        this.keys[n] = key;
        this.flags[n] = flags;
    }

    result(sources, maxTriangles) {
        const count = this.count;
        const truncated = count > maxTriangles;
        const threshold = truncated ? selectKth(this.keys.slice(0, count), maxTriangles - 1) : Infinity;
        const total = Math.min(count, maxTriangles);
        const positions = new Float32Array(total * 9);
        const flags = new Uint8Array(total);
        let n = 0;
        for (let t = 0; t < count && n < total; t++) {
            if (this.keys[t] > threshold) continue;
            const p = sources[this.sources[t]], o = this.offsets[t], w = n * 9;
            for (let k = 0; k < 9; k++) positions[w + k] = p[o + k];
            flags[n++] = this.flags[t];
        }
        return { positions, flags, truncated };
    }
}

class TriangleEntry {
    constructor(object, geometry, matrix, root, owner) {
        this.object = object;
        this.geometry = geometry;
        this.matrix = matrix.clone();
        this.root = root;
        this.owner = owner;
        this.flags = materialFlags(object.material);
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        this.box = new THREE.Box3().copy(geometry.boundingBox).applyMatrix4(this.matrix);
        this.count = Math.floor((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3);
        this.cursor = 0;
        this.size = 0;
        this.positions = null;
        this.chunks = null;
    }

    get ready() {
        return this.cursor >= this.count;
    }

    extract(deadline = Infinity) {
        if (this.ready) return true;
        if (!this.positions) {
            this.positions = new Float32Array(this.count * 9);
            this.chunks = new Float32Array(Math.ceil(this.count / CHUNK) * 6);
        }
        const position = this.geometry.attributes.position;
        const index = this.geometry.index;
        const e = this.matrix.elements;
        const mirrored = this.matrix.determinant() < 0;
        const out = this.positions;
        while (this.cursor < this.count) {
            const end = Math.min(this.count, this.cursor + EXTRACT_SLICE);
            for (let t = this.cursor; t < end; t++) {
                const o = this.size * 9;
                for (let k = 0; k < 3; k++) {
                    const corner = mirrored && k ? 3 - k : k;
                    const i = index ? index.getX(t * 3 + corner) : t * 3 + corner;
                    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
                    out[o + k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
                    out[o + k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
                    out[o + k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
                }
                let finite = true;
                for (let k = 0; k < 9; k++) if (!Number.isFinite(out[o + k])) finite = false;
                if (finite) this.size++;
            }
            this.cursor = end;
            if (performance.now() > deadline) break;
        }
        if (!this.ready) return false;
        for (let c = 0; c * CHUNK < this.size; c++) {
            const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
            const last = Math.min(this.size, (c + 1) * CHUNK);
            for (let t = c * CHUNK; t < last; t++) {
                for (let k = 0; k < 9; k++) {
                    const v = out[t * 9 + k], axis = k % 3;
                    if (v < min[axis]) min[axis] = v;
                    if (v > max[axis]) max[axis] = v;
                }
            }
            this.chunks.set([...min, ...max], c * 6);
        }
        return true;
    }
}

function shown(object, root) {
    for (let o = object; o; o = o.parent) {
        if (!o.visible) return false;
        if (o === root) return true;
    }
    return true;
}

export class DiceAPI {
    constructor(parent) {
        this._parent = parent;
        this.version = 3;
        this.geometryVersion = 0;
        this._frameCallbacks = [];
        this._catalog = null;
        this._cameraKey = "";
        this._cameraMoved = 0;
        this._announce = foundry.utils.debounce(() => Hooks.callAll(CHANGE_HOOK, this), 100);
        for (const hook of WATCHED) Hooks.on(hook, (document) => document.parent === canvas.scene && this.invalidate());
        Hooks.on("3DCanvasSceneReady", () => this.invalidate());
    }

    get active() {
        const parent = this._parent;
        return !!(parent._active && parent._ready && canvas.scene && parent._builtSceneId === canvas.scene.id);
    }

    get canvas() {
        return this._parent.renderer.domElement;
    }

    get camera() {
        return this._parent.camera;
    }

    get gridSize() {
        return canvas.dimensions.size / factor;
    }

    get sceneId() {
        return this._parent._builtSceneId ?? null;
    }

    invalidate() {
        this.geometryVersion++;
        this._catalog = null;
        this._announce();
    }

    requestFrame(callback) {
        this._frameCallbacks.push(callback);
    }

    _onFrame(time) {
        this._watchCamera(time);
        if (!this._frameCallbacks.length) return;
        const callbacks = this._frameCallbacks;
        this._frameCallbacks = [];
        for (const callback of callbacks) {
            try {
                callback(time);
            } catch (error) {
                console.error(error);
            }
        }
    }

    _watchCamera(time) {
        const e = this._parent.camera.matrixWorld.elements;
        const last = (this._cameraKey ||= new Float64Array(6).fill(NaN));
        let moved = false;
        CAMERA_ELEMENTS.forEach((index, k) => {
            if (!(Math.abs(e[index] - last[k]) <= CAMERA_EPSILON)) moved = true;
            last[k] = e[index];
        });
        if (moved) {
            this._cameraMoved = time;
            this._cameraResting = false;
            return;
        }
        if (this._cameraResting || time - this._cameraMoved < REST_MS) return;
        this._cameraResting = true;
        Hooks.callAll(REST_HOOK, this);
    }

    get cameraResting() {
        return !!this._cameraResting;
    }

    viewCenter() {
        const parent = this._parent;
        const rect = this.canvas.getBoundingClientRect();
        parent.camera.updateMatrixWorld();
        const hits = parent.interactionManager.mouseIntersection3DCollision({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, true);
        const hit = hits.find((h) => h.object?.visible !== false);
        const point = hit?.point ?? parent.controls.target;
        return { x: point.x, y: point.y, z: point.z, hit: !!hit };
    }

    lighting(at = null) {
        const parent = this._parent;
        const illumination = parent.lights?.globalIllumination;
        const sun = illumination?.global?.sunlight;
        const ambient = new THREE.Color(0, 0, 0);
        const ambientLight = illumination?.ambientLight;
        if (ambientLight?.parent && ambientLight.intensity > 0) ambient.add(lightColor.copy(ambientLight.color).multiplyScalar(ambientLight.intensity));
        const hemisphere = illumination?.hemisphereLight;
        if (hemisphere?.intensity > 0) ambient.add(lightColor.copy(hemisphere.color).lerp(hemisphere.groundColor, 0.3).multiplyScalar(hemisphere.intensity));
        const out = {
            exposure: parent.renderer.toneMappingExposure,
            toneMapping: parent.renderer.toneMapping,
            environmentIntensity: parent.scene.environment ? parent.scene.environmentIntensity ?? 1 : 0,
            ambient: ambient.toArray(),
            sun: null,
            probe: null,
        };
        if (at) {
            sampleLightAt(projected.set(at.x, at.y, at.z), lightColor);
            out.probe = [lightColor.r, lightColor.g, lightColor.b].map((v) => Math.pow(v, 2.2));
        }
        if (!sun || !sun.visible || sun.intensity <= 0) return out;
        sun.updateMatrixWorld();
        sun.target.updateMatrixWorld();
        const from = new THREE.Vector3().setFromMatrixPosition(sun.matrixWorld);
        const to = new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld);
        const direction = from.sub(to).normalize();
        out.sun = { direction: direction.toArray(), color: sun.color.toArray(), intensity: sun.intensity };
        return out;
    }

    sampleColor(point, size = 24) {
        const renderer = this._parent.renderer;
        const gl = renderer.getContext();
        const patch = this._patch(point, size);
        if (!patch) return null;
        const { x, y, w, h } = patch;
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(null);
        const data = new Uint8Array(w * h * 4);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
        renderer.setRenderTarget(previous);
        return this._meanColor(data, w, h);
    }

    _patch(point, size) {
        const gl = this._parent.renderer.getContext();
        projected.set(point.x, point.y, point.z).project(this._parent.camera);
        if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return null;
        const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        const w = Math.min(size, width), h = Math.min(size, height);
        const x = Math.round(Math.min(width - w, Math.max(0, (projected.x * 0.5 + 0.5) * width - w / 2)));
        const y = Math.round(Math.min(height - h, Math.max(0, (projected.y * 0.5 + 0.5) * height - h / 2)));
        return { x, y, w, h };
    }

    _meanColor(data, w, h) {
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += srgbToLinear(data[i + k]);
        const color = sum.map((v) => v / (w * h));
        return { color, luminance: 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2] };
    }

    sampleColorAsync(point, size = 24) {
        return new Promise((resolve) => {
            this.requestFrame(() => {
                const renderer = this._parent.renderer;
                const gl = renderer.getContext();
                const patch = this._patch(point, size);
                if (!patch || !gl.fenceSync) return resolve(null);
                const { x, y, w, h } = patch;
                const buffer = gl.createBuffer();
                const previous = renderer.getRenderTarget();
                renderer.setRenderTarget(null);
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
                gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
                gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                renderer.setRenderTarget(previous);
                const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
                gl.flush();
                const poll = () => {
                    if (gl.isContextLost()) return resolve(null);
                    const status = gl.clientWaitSync(sync, 0, 0);
                    if (status === gl.TIMEOUT_EXPIRED) return this.requestFrame(poll);
                    gl.deleteSync(sync);
                    const data = new Uint8Array(w * h * 4);
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
                    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data);
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                    gl.deleteBuffer(buffer);
                    resolve(this._meanColor(data, w, h));
                };
                this.requestFrame(poll);
            });
        });
    }

    fadedTiles() {
        const ids = [];
        for (const tile of Object.values(this._parent.tiles ?? {})) if (tile && tileCut(tile) >= FADED_CUT) ids.push(tile.tile?.id ?? tile.id);
        return ids.sort().join(",");
    }

    _sourceRoots() {
        const parent = this._parent;
        const roots = [];
        for (const tile of Object.values(parent.tiles ?? {})) {
            const mesh = tile?.mesh;
            if (!mesh) continue;
            if (tile.hasTags) {
                mesh.traverse((o) => {
                    if (o.userData?.collision) roots.push({ object: o, root: mesh, owner: tile });
                });
            } else roots.push({ object: mesh, root: mesh, owner: tile });
        }
        for (const wall of Object.values(parent.walls ?? {})) if (wall?.mesh) roots.push({ object: wall.mesh, root: wall.mesh, owner: wall });
        if (parent.board) roots.push({ object: parent.board, root: parent.board, owner: null });
        if (parent.table) roots.push({ object: parent.table, root: parent.table, owner: null });
        return roots;
    }

    _catalogFor() {
        if (this._catalog?.version === this.geometryVersion && this._catalog.sceneId === this.sceneId) return this._catalog;
        const entries = [];
        const skinned = [];
        for (const { object, root, owner } of this._sourceRoots()) {
            object.traverse((o) => {
                if (!o.isMesh || !o.geometry?.attributes?.position) return;
                o.updateWorldMatrix(true, false);
                if (o.isSkinnedMesh) return skinned.push({ object: o, root });
                if (o.isInstancedMesh) {
                    for (let i = 0; i < o.count; i++) {
                        o.getMatrixAt(i, instanceMatrix);
                        entries.push(new TriangleEntry(o, o.geometry, instanceMatrix.premultiply(o.matrixWorld), root, owner));
                    }
                    return;
                }
                entries.push(new TriangleEntry(o, o.geometry, o.matrixWorld, root, owner));
            });
        }
        this._catalog = { version: this.geometryVersion, sceneId: this.sceneId, entries, skinned };
        return this._catalog;
    }

    _setQuery({ center, radius, from }) {
        a.set(center.x, center.y, center.z);
        queryBox.setFromCenterAndSize(a, b.setScalar(radius * 2));
        if (from) queryBox.expandByPoint(b.set(from.x, from.y, from.z));
    }

    _isEntryShown(entry) {
        if (entry.owner?.document?.hidden || entry.owner?.tile?.document?.hidden) return false;
        if (entry.owner?.placeable?.isDoor && entry.owner.placeable.document.ds === CONST.WALL_DOOR_STATES.OPEN) return false;
        return shown(entry.object, entry.root);
    }

    getTokens({ center, radius }) {
        this._setQuery({ center, radius });
        const boxes = [];
        const meshes = [];
        let total = 0;
        let animated = false;
        for (const token of Object.values(this._parent.tokens ?? {})) {
            const body = token?.model ?? token?.mesh;
            if (!body || !token.mesh?.visible) continue;
            body.updateWorldMatrix(true, true);
            const box = new THREE.Box3().setFromObject(body);
            if (box.isEmpty() || !box.intersectsBox(queryBox) || !Number.isFinite(box.min.x + box.min.y + box.min.z + box.max.x + box.max.y + box.max.z)) continue;
            boxes.push(...box.getCenter(a).toArray(), ...box.getSize(b).multiplyScalar(0.5).toArray());
            if (token.mixer && token.enableAnim) animated = true;
            body.traverseVisible((o) => {
                if (!o.isMesh || !o.geometry?.attributes?.position || materialFlags(o.material) & TRIANGLE_CUTOUT) return;
                const index = o.geometry.index;
                const corners = Math.floor((index ? index.count : o.geometry.attributes.position.count) / 3) * 3;
                meshes.push({ o, corners });
                total += corners;
            });
        }
        const positions = new Float32Array(total * 3);
        const vertex = new THREE.Vector3();
        let w = 0;
        for (const { o, corners } of meshes) {
            const mirrored = o.matrixWorld.determinant() < 0;
            const e = o.matrixWorld.elements;
            const index = o.geometry.index;
            const local = o.isSkinnedMesh ? null : localTriangles(o.geometry);
            for (let c = 0; c < corners; c++) {
                const corner = mirrored && c % 3 ? c + (c % 3 === 1 ? 1 : -1) : c;
                let x, y, z;
                if (local) {
                    x = local[corner * 3];
                    y = local[corner * 3 + 1];
                    z = local[corner * 3 + 2];
                } else {
                    o.getVertexPosition(index ? index.getX(corner) : corner, vertex);
                    ({ x, y, z } = vertex);
                }
                positions[w++] = e[0] * x + e[4] * y + e[8] * z + e[12];
                positions[w++] = e[1] * x + e[5] * y + e[9] * z + e[13];
                positions[w++] = e[2] * x + e[6] * y + e[10] * z + e[14];
            }
        }
        return { positions, boxes: new Float32Array(boxes), animated };
    }

    *_collect({ center, radius, from = null, maxTriangles = 40000, tokens = true }) {
        let catalog = this._catalogFor();
        this._setQuery({ center, radius, from });
        const minX = queryBox.min.x, minY = queryBox.min.y, minZ = queryBox.min.z, maxX = queryBox.max.x, maxY = queryBox.max.y, maxZ = queryBox.max.z;
        const box = queryBox.clone();
        const fx = from ? from.x : center.x, fy = from ? from.y : center.y, fz = from ? from.z : center.z;
        const dx = center.x - fx, dy = center.y - fy, dz = center.z - fz;
        const length2 = dx * dx + dy * dy + dz * dz || 1;
        const segmentKey = (p, o) => {
            const mx = (p[o] + p[o + 3] + p[o + 6]) / 3 - fx, my = (p[o + 1] + p[o + 4] + p[o + 7]) / 3 - fy, mz = (p[o + 2] + p[o + 5] + p[o + 8]) / 3 - fz;
            const s = Math.min(1, Math.max(0, (mx * dx + my * dy + mz * dz) / length2));
            const ex = mx - s * dx, ey = my - s * dy, ez = mz - s * dz;
            return Math.sqrt(ex * ex + ey * ey + ez * ez);
        };
        const picks = new TriangleSink();
        const sources = [];
        let tested = 0;
        for (const entry of catalog.entries) {
            if (!entry.box.intersectsBox(box) || !this._isEntryShown(entry)) continue;
            while (!entry.extract(performance.now() + 2)) yield;
            let flags = entry.flags;
            const owner = entry.owner;
            if (owner?.tile && tileCut(owner) >= FADED_CUT) flags |= TRIANGLE_FADED;
            const source = sources.push(entry.positions) - 1;
            const p = entry.positions, chunks = entry.chunks;
            for (let c = 0; c * CHUNK < entry.size; c++) {
                const co = c * 6;
                if (chunks[co] > maxX || chunks[co + 3] < minX || chunks[co + 1] > maxY || chunks[co + 4] < minY || chunks[co + 2] > maxZ || chunks[co + 5] < minZ) continue;
                const last = Math.min(entry.size, (c + 1) * CHUNK);
                for (let t = c * CHUNK; t < last; t++) {
                    const o = t * 9;
                    const x0 = p[o], x1 = p[o + 3], x2 = p[o + 6];
                    if ((x0 < minX && x1 < minX && x2 < minX) || (x0 > maxX && x1 > maxX && x2 > maxX)) continue;
                    const z0 = p[o + 2], z1 = p[o + 5], z2 = p[o + 8];
                    if ((z0 < minZ && z1 < minZ && z2 < minZ) || (z0 > maxZ && z1 > maxZ && z2 > maxZ)) continue;
                    const y0 = p[o + 1], y1 = p[o + 4], y2 = p[o + 7];
                    if ((y0 < minY && y1 < minY && y2 < minY) || (y0 > maxY && y1 > maxY && y2 > maxY)) continue;
                    picks.push(source, o, segmentKey(p, o), flags);
                }
                tested += last - c * CHUNK;
                if (tested > 16384) {
                    tested = 0;
                    yield;
                }
            }
        }
        const boxes = [];
        for (const { object, root } of catalog.skinned) {
            if (!shown(object, root)) continue;
            if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
            worldBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
            if (worldBox.intersectsBox(box)) boxes.push(worldBox.clone());
        }
        if (tokens) {
            const found = this.getTokens({ center, radius: Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 });
            const p = found.positions;
            const source = sources.push(p) - 1;
            for (let o = 0; o < p.length; o += 9) picks.push(source, o, segmentKey(p, o), TRIANGLE_TOKEN);
            for (let o = 0; o < found.boxes.length; o += 6) boxes.push(new THREE.Box3().setFromCenterAndSize(a.fromArray(found.boxes, o), b.fromArray(found.boxes, o + 3).multiplyScalar(2)));
        }
        yield;
        const { positions, flags, truncated } = picks.result(sources, maxTriangles);
        const near = boxes.filter((b) => Number.isFinite(b.min.x + b.min.y + b.min.z + b.max.x + b.max.y + b.max.z));
        const boxData = new Float32Array(near.length * 6);
        near.forEach((b2, i) => {
            b2.getCenter(a);
            b2.getSize(b).multiplyScalar(0.5);
            boxData.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        });
        return { positions, flags, triangles: positions.length / 9, truncated, boxes: boxData, gridSize: this.gridSize, version: catalog.version, sceneId: catalog.sceneId };
    }

    getGeometry(query = {}) {
        const run = this._collect(query);
        let step = run.next();
        while (!step.done) step = run.next();
        return step.value;
    }

    async getGeometryAsync(query = {}, budgetMs = 4, { urgent = false } = {}) {
        const run = this._collect(query);
        const pause = urgent ? () => new Promise((resolve) => setTimeout(resolve)) : () => new Promise((resolve) => requestIdleCallback(resolve, { timeout: 200 }));
        for (;;) {
            const deadline = performance.now() + budgetMs;
            let step = run.next();
            while (!step.done && performance.now() < deadline) step = run.next();
            if (step.done) return step.value;
            await pause();
        }
    }
}
