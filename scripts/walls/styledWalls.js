import * as THREE from "three";
import { factor } from "../main.js";
import { buildMapMakerGeometry, buildMapMakerMesh, getMapMakerMaterial, modelBounds } from "../helpers/mapMakerMesh.js";
import { getWallStyle, DEFAULT_WALL_STYLE, WALL_STYLE_NONE } from "./wallStyles.js";

const MODULE_ID = "levels-3d-preview";
const DOOR_TRIM = 0.06;
const DOOR_HEIGHT = 1.6;
const DOOR_MIN_HEIGHT = 1.2;
const GENERIC_MODULE = 2;
const MAX_MITER = 4;
const ENCLOSURE_RAYS = 12;
const REBUILD_DELAY = 40;
const DOOR_SPEED = 2.5;
const DRAIN_MATS = { drainVoid: { src: null, tint: "#070806", roughness: 1, env: 0 }, drainBar: { src: null, tint: "#2a2a27", metalness: 0.7, roughness: 0.55 } };

const senseTypes = () => CONST.EDGE_SENSE_TYPES ?? CONST.WALL_SENSE_TYPES;

export function sceneWallStyleId(scene = canvas.scene) {
    const id = scene?.getFlag(MODULE_ID, "wallStyle");
    if (id) return id;
    return scene?.getFlag(MODULE_ID, "showSceneWalls") === false ? WALL_STYLE_NONE : DEFAULT_WALL_STYLE;
}

export function wallStyleIdFor(document) {
    return document.getFlag(MODULE_ID, "wallStyle") || sceneWallStyleId(document.parent ?? canvas.scene);
}

export function wallStyleFor(document) {
    if (document.getFlag(MODULE_ID, "wallTexture")) return null;
    return getWallStyle(wallStyleIdFor(document));
}

export function wallRole(document) {
    const T = senseTypes();
    if (document.door) return document.door === CONST.WALL_DOOR_TYPES.SECRET ? "secret" : "door";
    if (document.sight === T.NONE) return null;
    if (document.sight === T.LIMITED || document.sight === T.PROXIMITY) return "window";
    return "wall";
}

export function styleMetrics(style) {
    const cell = canvas.grid.size;
    return { cell, thickness: Math.max(4, Math.round(cell * style.thickness)) };
}

export async function doorLayout(style, length, height, margin = 0) {
    const { cell } = styleMetrics(style);
    const door = style.door;
    const lb = await modelBounds(door.leaf);
    const trim = Math.round(cell * DOOR_TRIM);
    const w = Math.max(4, length - 2 * Math.max(trim, margin) - 2);
    const lw = door.double ? 2 * Math.max(Math.abs(lb.min[0]), Math.abs(lb.max[0])) : lb.max[0] - lb.min[0];
    const lh = (door.clip?.y ?? lb.max[1]) - Math.min(0, lb.min[1]);
    const maxH = Math.max(8, Math.min(cell * DOOR_HEIGHT, height - trim - cell * 0.15));
    const h = Math.min(maxH, Math.max(Math.min(cell * DOOR_MIN_HEIGHT, maxH), (w * lh) / Math.max(lw, 1e-3)));
    return { door, lb, w, h, sx: w / Math.max(lw, 1e-3), sy: h / Math.max(lh, 1e-3), trim, op: { u: length / 2, w: w + 1, y0: 0, y1: Math.min(h + 1, height - trim - 4), s: door.shape === "arch" ? "arch" : "rect", f: trim, d: true } };
}

export async function buildDoorLeaves(layout) {
    const { door, lb, sx, sy } = layout;
    const sz = Math.min(sx, sy);
    const tx = door.double ? 0 : (-(lb.min[0] + lb.max[0]) / 2) * sx;
    const ty = -lb.min[1] * sy + 0.5;
    const tz = (-(lb.min[2] + lb.max[2]) / 2) * sz;
    const clipX = door.clip?.x ? door.clip.x * sx : 1e6;
    const clipY = door.clip?.y ? door.clip.y * sy + ty : 1e6;
    const clip = door.clip ? [-clipX, -1e6, -1e6, clipX, clipY, 1e6] : null;
    const part = (mirror) => ({ src: door.leaf, m: [mirror ? -sx : sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, mirror ? -tx : tx, ty, tz, 1], ...(clip ? { clip } : {}) });
    const sides = door.double ? [1, -1] : [1];
    const leaves = [];
    const towards = lb.max[0] >= -lb.min[0] ? 1 : -1;
    for (const side of sides) {
        const mesh = await buildMapMakerMesh({ k: "kit", parts: [part(side < 0)] });
        mesh.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
        });
        const pivot = new THREE.Group();
        pivot.add(mesh);
        leaves.push({ pivot, mesh, side: side * towards });
    }
    return leaves;
}

export function animateDoorLeaves(leaves, layout, progress, swing) {
    const { door, w, h } = layout;
    const style = door.style ?? 1;
    const slide = (door.slide ?? 92) / 100;
    for (const leaf of leaves) {
        if (style === 2) leaf.pivot.position.x = (progress * leaf.side * (door.double ? w / 2 : w) * slide) / factor;
        else if (style === 3) leaf.pivot.position.y = (progress * h * slide) / factor;
        else {
            const hinge = (door.hinge ?? -0.5) * w;
            leaf.pivot.position.x = hinge / factor;
            leaf.mesh.position.x = -hinge / factor;
            leaf.pivot.rotation.y = -swing * progress * (Math.PI / 2);
        }
    }
}

export function stepDoor(current, target, delta) {
    if (current === target) return current;
    const step = delta * DOOR_SPEED;
    return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

const cross = (a, b) => a.x * b.y - a.y * b.x;
const pointKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;

function miterSlope(inward, outward, normal) {
    const b = { x: inward.x + outward.x, y: inward.y + outward.y };
    const len = Math.hypot(b.x, b.y);
    if (len < 1e-4) return 0;
    b.x /= len;
    b.y /= len;
    const denom = cross(b, inward);
    if (Math.abs(denom) < 1e-4) return 0;
    return Math.max(-MAX_MITER, Math.min(MAX_MITER, -cross(b, normal) / denom));
}

function raySegment(ox, oy, dx, dy, s) {
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) return false;
    const wx = s.ax - ox;
    const wy = s.ay - oy;
    const t = (wx * ey - wy * ex) / denom;
    const u = (wx * dy - wy * dx) / denom;
    return t > 0 && u >= 0 && u <= 1;
}

function enclosed(x, y, blockers) {
    for (let k = 0; k < ENCLOSURE_RAYS; k++) {
        const angle = (k / ENCLOSURE_RAYS) * Math.PI * 2 + 0.1;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        if (!blockers.some((s) => raySegment(x, y, dx, dy, s))) return false;
    }
    return true;
}

function matDef(m, cell) {
    const def = { src: m.src, s: (m.s * cell) / 100 };
    for (const key of ["tint", "metalness", "roughness", "maps", "grade"]) if (m[key] !== undefined && m[key] !== null) def[key] = m[key];
    return def;
}

export class StyledWalls {
    constructor(parent) {
        this._parent = parent;
        this.members = new Set();
        this.root = new THREE.Group();
        this.root.name = "StyledWalls";
        this.runs = new Map();
        this.meshes = [];
        this.materials = new Map();
        this.glass = null;
        this._staleGlass = [];
        this._timer = null;
        this._building = null;
        this._again = false;
        this.stats = null;
    }

    add(wall3d) {
        this.members.add(wall3d);
        this.schedule();
    }

    remove(wall3d) {
        if (this.members.delete(wall3d)) this.schedule();
    }

    schedule() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.rebuild(), REBUILD_DELAY);
    }

    async rebuild() {
        if (this._building) {
            this._again = true;
            return this._building;
        }
        this._building = this._rebuild().catch((e) => console.error("3D Canvas | Wall styles: rebuild failed", e));
        await this._building;
        this._building = null;
        if (this._again) {
            this._again = false;
            return this.rebuild();
        }
    }

    collect() {
        const segs = [];
        for (const wall3d of this.members) {
            if (!wall3d.role || wall3d._destroyed) continue;
            const c = wall3d.wall.document.c;
            if (Math.hypot(c[2] - c[0], c[3] - c[1]) < 1) continue;
            const metrics = styleMetrics(wall3d.style);
            const fullHeight = Math.round((wall3d.vec1.y - wall3d.vec2.y) * factor);
            const styleHeight = Math.round((Number(wall3d.style.wallHeight) || 0) * metrics.cell);
            segs.push({
                wall3d,
                id: wall3d.wall.id,
                ax: c[0],
                ay: c[1],
                bx: c[2],
                by: c[3],
                style: wall3d.style,
                role: wall3d.role,
                open: wall3d.wall.document.ds === CONST.WALL_DOOR_STATES.OPEN,
                bottom: wall3d.vec2.y,
                height: styleHeight > 0 ? Math.min(fullHeight, styleHeight) : fullHeight,
                ...metrics,
                group: `${wall3d.style.id}|${wall3d.vec2.y}|${wall3d.vec1.y}`,
            });
        }
        return segs;
    }

    blockers() {
        const out = [];
        for (const wall3d of Object.values(this._parent.walls)) {
            const document = wall3d?.wall?.document;
            if (!document || (!document.door && document.sight === senseTypes().NONE)) continue;
            const c = document.c;
            out.push({ ax: c[0], ay: c[1], bx: c[2], by: c[3], id: wall3d.wall.id });
        }
        return out;
    }

    runsOf(segs) {
        const groups = new Map();
        for (const seg of segs) {
            if (!groups.has(seg.group)) groups.set(seg.group, []);
            groups.get(seg.group).push(seg);
        }
        const runs = [];
        for (const list of groups.values()) {
            const ends = new Map();
            for (const seg of list) {
                seg.dir = { x: seg.bx - seg.ax, y: seg.by - seg.ay };
                seg.len = Math.hypot(seg.dir.x, seg.dir.y);
                seg.dir.x /= seg.len;
                seg.dir.y /= seg.len;
                seg.n = { x: -seg.dir.y, y: seg.dir.x };
                seg.k = [0, 0];
                for (const [end, x, y] of [[0, seg.ax, seg.ay], [1, seg.bx, seg.by]]) {
                    const key = pointKey(x, y);
                    if (!ends.has(key)) ends.set(key, []);
                    ends.get(key).push({ seg, end });
                }
            }
            const outward = ({ seg, end }) => (end === 0 ? seg.dir : { x: -seg.dir.x, y: -seg.dir.y });
            for (const joined of ends.values()) {
                const free = [...joined];
                while (free.length >= 2) {
                    let best = null;
                    for (let i = 0; i < free.length; i++) {
                        for (let j = i + 1; j < free.length; j++) {
                            const a = outward(free[i]);
                            const b = outward(free[j]);
                            const dot = a.x * b.x + a.y * b.y;
                            if (!best || dot < best.dot) best = { i, j, dot };
                        }
                    }
                    const [p, q] = [free[best.i], free[best.j]];
                    free.splice(best.j, 1);
                    free.splice(best.i, 1);
                    for (const [self, other] of [[p, q], [q, p]]) {
                        const k = miterSlope(outward(self), outward(other), self.seg.n);
                        const limit = (self.seg.len * 0.45) / Math.max(self.seg.thickness / 2, 1);
                        self.seg.k[self.end] = Math.max(-limit, Math.min(limit, k));
                    }
                }
            }
            const parent = new Map(list.map((s) => [s, s]));
            const find = (s) => (parent.get(s) === s ? s : find(parent.get(s)));
            for (const joined of ends.values()) for (let i = 1; i < joined.length; i++) parent.set(find(joined[i].seg), find(joined[0].seg));
            const byRoot = new Map();
            for (const seg of list) {
                const root = find(seg);
                if (!byRoot.has(root)) byRoot.set(root, []);
                byRoot.get(root).push(seg);
            }
            runs.push(...byRoot.values());
        }
        return runs;
    }

    async runData(run, blockers) {
        const { style, cell, thickness, height } = run[0];
        const key = (slot) => `${style.id}:${slot}`;
        const mats = { [key("wallOut")]: matDef(style.wallOut, cell), [key("wallIn")]: matDef(style.wallIn, cell), [key("cap")]: matDef(style.cap, cell) };
        let lb = null;
        if (style.band) {
            mats[key("band")] = matDef(style.band, cell);
            const h = Math.round(Math.min(style.bandHeight * cell, height * 0.8));
            if (h > 1 && h < height - 1) lb = { h, m: key("band"), k: [key("wallOut"), key("wallIn")], l: Math.max(2, Math.round(cell * 0.05)), lh: Math.max(3, Math.round(cell * 0.09)), lm: key("cap") };
        }
        const segs = [];
        const glass = [];
        let drains = false;
        for (const seg of run) {
            const off = thickness / 2 + 2;
            const mx = (seg.ax + seg.bx) / 2;
            const my = (seg.ay + seg.by) / 2;
            const pos = enclosed(mx + seg.n.x * off, my + seg.n.y * off, blockers);
            const neg = enclosed(mx - seg.n.x * off, my - seg.n.y * off, blockers);
            const outside = pos === neg ? 0 : pos ? -1 : 1;
            seg.wall3d.interiorSide = outside === 0 ? 1 : -outside;
            const mp = outside === 1 ? key("wallOut") : key("wallIn");
            const mn = outside === -1 ? key("wallOut") : key("wallIn");
            const margin = (Math.max(Math.abs(seg.k[0]), Math.abs(seg.k[1])) * thickness) / 2 + 1;
            const ops = [];
            if (seg.role === "door") {
                const layout = await doorLayout(style, seg.len, height, margin);
                if (layout.w > 4) {
                    ops.push({ ...layout.op, fm: key("cap") });
                    seg.doorLayout = layout;
                }
            } else if (seg.role === "secret" && seg.open) {
                const w = seg.len - 2 * margin - 2;
                if (w > 4) ops.push({ u: seg.len / 2, w, y0: 0, y1: Math.min(cell * DOOR_HEIGHT, height - 4), s: "rect", f: 0, d: true });
            } else if (seg.role === "window") {
                const win = style.window;
                const span = seg.len - 2 * margin;
                const count = Math.max(1, Math.floor(span / cell));
                const spacing = span / count;
                for (let i = 0; i < count; i++) {
                    const u = margin + (i + 0.5) * spacing;
                    if (win.fit) {
                        const f = Math.round(cell * (win.fit.f ?? 0.05));
                        const w = Math.min(win.fit.w * cell, spacing - 2 * f - 4);
                        const y1 = Math.min(win.fit.y1 * cell, height - 6);
                        const y0 = Math.min(win.fit.y0 * cell, y1 - 4);
                        if (w <= 4 || y0 < 1) continue;
                        ops.push({ u, w, y0, y1, s: win.shape, f, d: false, ...(win.recess ? { r: 1, p: Math.round(cell * 0.04), bars: win.bars ?? 0, vm: "drainVoid", bm: "drainBar" } : {}) });
                        if (win.recess) drains = true;
                        if (win.glass) glass.push({ src: win.glass, fit: true, u, w, y0, y1, seg, outside });
                    } else if (win.glass) {
                        const gb = await modelBounds(win.glass);
                        let s = cell / GENERIC_MODULE;
                        const gw = (gb.max[0] - gb.min[0]) * s * 0.86;
                        if (gw > spacing - 4) s *= (spacing - 4) / gw;
                        const w = (gb.max[0] - gb.min[0]) * s * 0.86;
                        const y0 = gb.min[1] * s + 2;
                        const y1 = Math.min(gb.max[1] * s * 0.97, height - 6);
                        if (w <= 4 || y1 <= y0 + 4) continue;
                        ops.push({ u, w, y0, y1, s: win.shape, f: 0, d: false });
                        glass.push({ src: win.glass, u, s, zOffset: -(gb.min[2] + gb.max[2]) / 2, seg, outside });
                    }
                }
            }
            segs.push({ a: [seg.ax, seg.ay], b: [seg.bx, seg.by], ...(seg.k[0] ? { k0: seg.k[0] } : {}), ...(seg.k[1] ? { k1: seg.k[1] } : {}), mp, mn, mc: key("cap"), ops });
        }
        const data = { k: "wall", t: thickness, h: height, b: 0, uvAlong: true, segs, mats: { ...mats, ...(drains ? DRAIN_MATS : {}) }, ...(lb ? { lb } : {}) };
        const parts = glass.map((g) => {
            const ext = g.outside === -1 ? { x: -g.seg.n.x, y: -g.seg.n.y } : g.seg.n;
            const d = { x: ext.y, y: -ext.x };
            const p = { x: g.seg.ax + g.seg.dir.x * g.u, y: g.seg.ay + g.seg.dir.y * g.u };
            if (g.fit) return { src: g.src, fit: [p.x, p.y, d.x, d.y, ext.x, ext.y, g.w, g.y0, g.y1, Math.max(3, Math.round(thickness * 0.6))] };
            const s = g.s;
            return { src: g.src, m: [d.x * s, 0, d.y * s, 0, 0, s, 0, 0, ext.x * s, 0, ext.y * s, 0, p.x + ext.x * g.zOffset * s, 0, p.y + ext.y * g.zOffset * s, 1] };
        });
        return { data, parts, bottom: run[0].bottom };
    }

    async fitParts(parts) {
        const out = [];
        for (const part of parts) {
            if (!part.fit) {
                out.push(part);
                continue;
            }
            const [px, py, dx, dy, ex, ey, w, y0, y1, depth] = part.fit;
            const b = await modelBounds(part.src);
            const sx = (w - 1.5) / Math.max(b.max[0] - b.min[0], 1e-3);
            const sy = (y1 - y0 - 1.5) / Math.max(b.max[1] - b.min[1], 1e-3);
            const sz = depth / Math.max(b.max[2] - b.min[2], 1e-3);
            const cx = (b.min[0] + b.max[0]) / 2;
            const cz = (b.min[2] + b.max[2]) / 2;
            const ty = y0 + 0.75 - b.min[1] * sy;
            const ox = px - (dx * cx * sx + ex * cz * sz);
            const oy = py - (dy * cx * sx + ey * cz * sz);
            out.push({ src: part.src, m: [dx * sx, 0, dy * sx, 0, 0, sy, 0, 0, ex * sz, 0, ey * sz, 0, ox, ty, oy, 1] });
        }
        return out;
    }

    material(key, def) {
        const id = `${key}|${JSON.stringify(def)}`;
        if (!this.materials.has(id)) this.materials.set(id, getMapMakerMaterial(def));
        return this.materials.get(id);
    }

    async buildRun(entry) {
        const { geometry, groups } = buildMapMakerGeometry(entry.data);
        geometry.translate(0, entry.bottom, 0);
        const pieces = new Map();
        const position = geometry.attributes.position.array;
        const normal = geometry.attributes.normal.array;
        const uv = geometry.attributes.uv.array;
        for (const group of geometry.groups) {
            const key = groups[group.materialIndex];
            pieces.set(key, {
                def: entry.data.mats[key] ?? null,
                position: position.slice(group.start * 3, (group.start + group.count) * 3),
                normal: normal.slice(group.start * 3, (group.start + group.count) * 3),
                uv: uv.slice(group.start * 2, (group.start + group.count) * 2),
            });
        }
        geometry.dispose();
        return { pieces, parts: entry.parts.map((part) => ({ ...part, y: entry.bottom })) };
    }

    async buildGlass(parts) {
        const signature = JSON.stringify(parts);
        if (signature === this._glassSignature) return;
        if (this.glass) this._staleGlass.push(this.glass);
        this.glass = null;
        this._glassSignature = signature;
        if (!parts.length) return;
        const fitted = await this.fitParts(parts);
        const glass = await buildMapMakerMesh({ k: "kit", parts: fitted.map((part, i) => ({ src: part.src, m: part.m.map((v, k) => (k === 13 ? v + parts[i].y * factor : v)) })) });
        glass.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
        });
        if (signature === this._glassSignature) this.glass = glass;
        else this.disposeGlass(glass);
    }

    async _rebuild() {
        const start = performance.now();
        const generation = this._generation;
        const segs = this.collect();
        const blockers = segs.length ? this.blockers() : [];
        const runs = this.runsOf(segs);
        const next = new Map();
        let built = 0;
        for (const run of runs) {
            const entry = await this.runData(run, blockers);
            const signature = JSON.stringify([entry.data, entry.parts, entry.bottom]);
            let cached = this.runs.get(signature) ?? next.get(signature);
            if (!cached) {
                cached = await this.buildRun(entry);
                built++;
            }
            next.set(signature, cached);
        }
        if (generation !== this._generation) return;
        this.runs = next;
        await this.buildGlass([...next.values()].flatMap((cached) => cached.parts));
        if (generation !== this._generation) return;
        await this.merge();
        for (const glass of this._staleGlass.splice(0)) this.disposeGlass(glass);
        await Promise.all(segs.filter((seg) => seg.doorLayout).map((seg) => seg.wall3d.applyDoorLayout(seg.doorLayout)));
        this.stats = { walls: segs.length, runs: runs.length, rebuilt: built, drawCalls: this.drawCalls(), ms: Math.round(performance.now() - start) };
        this._parent.interactionManager && (this._parent.interactionManager._candidateCache = null);
    }

    drawCalls() {
        let calls = 0;
        for (const object of this.meshes) object.traverse((child) => child.isMesh && child.visible && (calls += Array.isArray(child.material) ? child.material.length : 1));
        return calls;
    }

    async merge() {
        const byKey = new Map();
        for (const { pieces } of this.runs.values()) {
            for (const [key, piece] of pieces) {
                if (!byKey.has(key)) byKey.set(key, { def: piece.def, list: [] });
                byKey.get(key).list.push(piece);
            }
        }
        const meshes = [];
        for (const [key, { def, list }] of byKey) {
            const concat = (name, size) => {
                const total = list.reduce((sum, p) => sum + p[name].length, 0);
                const array = new Float32Array(total);
                let offset = 0;
                for (const p of list) {
                    array.set(p[name], offset);
                    offset += p[name].length;
                }
                return new THREE.BufferAttribute(array, size);
            };
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", concat("position", 3));
            geometry.setAttribute("normal", concat("normal", 3));
            geometry.setAttribute("uv", concat("uv", 2));
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            geometry.computeBoundsTree?.();
            const mesh = new THREE.Mesh(geometry, await this.material(key, def));
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.styledWalls = true;
            mesh.name = `StyledWalls:${key}`;
            meshes.push(mesh);
        }
        for (const mesh of this.meshes) {
            if (mesh.userData.styledWalls) mesh.geometry.disposeBoundsTree?.();
            if (mesh.userData.styledWalls) mesh.geometry.dispose();
        }
        this.root.clear();
        for (const mesh of meshes) this.root.add(mesh);
        if (this.glass) this.root.add(this.glass);
        this.meshes = [...meshes, ...(this.glass ? [this.glass] : [])];
        if (this.root.parent !== this._parent.scene) this._parent.scene.add(this.root);
    }

    disposeGlass(glass) {
        glass?.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry.dispose();
            for (const material of [child.material].flat()) material?.dispose?.();
        });
    }

    clear() {
        clearTimeout(this._timer);
        this._generation = (this._generation ?? 0) + 1;
        for (const glass of [this.glass, ...this._staleGlass.splice(0)]) this.disposeGlass(glass);
        this.glass = null;
        this._glassSignature = null;
        for (const mesh of this.meshes) if (mesh.userData.styledWalls) mesh.geometry.dispose();
        this.runs.clear();
        this.materials.clear();
        this.meshes = [];
        this.members.clear();
        this.root.clear();
        this.root.parent?.remove(this.root);
    }

    static setHooks() {
        Hooks.on("3DCanvasWallStylesChanged", (id) => {
            const L = game.Levels3DPreview;
            if (!L?._active || !canvas.scene) return;
            const used = sceneWallStyleId() === id || Object.values(L.walls).some((w) => w?.style?.id === id || w?.wall?.document?.getFlag(MODULE_ID, "wallStyle") === id);
            if (!used) return;
            for (const wall3d of Object.values(L.walls)) wall3d.destroy();
            L.walls = {};
            L.doors = {};
            L.createWalls();
        });
    }
}
