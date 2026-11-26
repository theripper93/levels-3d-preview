import * as THREE from "three";
import { factor } from "../main.js";
import { DrawingInput3D } from "./drawingInput3d.js";
import { position3dtoScreen, pos3DToCanvas, unitsToPixels } from "../helpers/coords3d.js";

const LINE_PICK_PX = 8;
const ENDPOINT_PICK_PX = 10;
const DOOR_PICK_PX = 16;
const LINE_WIDTH = 0.05;
const ENDPOINT_RADIUS = 0.07;
const HIGHLIGHT_WIDTH = 0.11;
const DOOR_ICON_SIZE = 0.55;
const DOOR_ICON_LIFT = 0.35;
const SURFACE_LIFT = 0.002;
const RIGHT = 2;
const HOVER_COLOR = new THREE.Color(0xffffff);
const CONTROLLED_COLOR = new THREE.Color(0xff9829);
const OUTLINE_COLOR = new THREE.Color(0x000000);

export class WallInput3D extends DrawingInput3D {
    constructor(parent) {
        super(parent);
        this.hover = null;
        this.surfaceY = null;
        this.signature = null;
        this.overlay = new THREE.Group();
        this.overlay.name = "WallEditOverlay";
        this.overlay.renderOrder = 1000;
        this.lineMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false });
        this.lines = new THREE.Mesh(new THREE.BufferGeometry(), this.lineMaterial);
        this.lines.renderOrder = 1000;
        this.lines.frustumCulled = false;
        this.lines.userData.ignoreHover = true;
        this.lines.userData.noIntersect = true;
        this.overlay.add(this.lines);
        this.doorIcons = new THREE.Group();
        this.overlay.add(this.doorIcons);
        this.iconMaterials = new Map();
        Hooks.on("deactivateWallsLayer", () => (this.surfaceY = null));
        Hooks.on("canvasTearDown", () => {
            this.surfaceY = null;
            this.hover = null;
        });
    }

    get layer() {
        return canvas.walls;
    }

    get active() {
        const interactionManager = this.interactionManager;
        return !!this._parent._active && !!canvas.ready && !!canvas.walls?.active && !interactionManager?._tokenDrag && !interactionManager?._freeRuler;
    }

    refresh() {
        this.signature = null;
    }

    get levelY() {
        const bottom = canvas.level?.elevation?.bottom;
        return unitsToPixels(Number.isFinite(bottom) ? bottom : 0);
    }

    get overlayY() {
        return (this.surfaceY ?? this.levelY) + SURFACE_LIFT;
    }

    planeAt(event, y) {
        this.ndc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
        const raycaster = this.interactionManager.raycaster;
        raycaster.setFromCamera(this.ndc, this.camera);
        const point3d = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
        return point3d ? { point3d, position: pos3DToCanvas(point3d) } : null;
    }

    toScreen(x, y, height) {
        return position3dtoScreen(new THREE.Vector3(x / factor, height, y / factor));
    }

    pick(event) {
        const height = this.overlayY;
        const px = event.clientX;
        const py = event.clientY;
        let best = null;
        const consider = (candidate) => {
            if (!best || candidate.score < best.score) best = candidate;
        };
        for (const wall of this.layer.placeables) {
            if (!wall.visible && !wall.controlled) continue;
            const c = wall.document.c;
            if (wall.isDoor) {
                const mid = this.toScreen((c[0] + c[2]) / 2, (c[1] + c[3]) / 2, height + DOOR_ICON_LIFT * (canvas.grid.size / factor));
                const d = Math.hypot(mid.x - px, mid.y - py);
                if (mid.z <= 1 && d <= DOOR_PICK_PX) consider({ wall, door: true, score: d - 100 });
            }
            const a = this.toScreen(c[0], c[1], height);
            const b = this.toScreen(c[2], c[3], height);
            if (a.z > 1 || b.z > 1) continue;
            for (const [s, x, y] of [[a, c[0], c[1]], [b, c[2], c[3]]]) {
                const d = Math.hypot(s.x - px, s.y - py);
                if (d <= ENDPOINT_PICK_PX) consider({ wall, point: { x, y }, score: d - 50 });
            }
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len2 = dx * dx + dy * dy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
            const d = Math.hypot(a.x + dx * t - px, a.y + dy * t - py);
            if (d <= LINE_PICK_PX) consider({ wall, point: { x: c[0] + (c[2] - c[0]) * t, y: c[1] + (c[3] - c[1]) * t }, score: d });
        }
        return best;
    }

    surface(event) {
        this.picked = this.pick(event);
        const picked = this.picked;
        if (picked?.point) {
            const point3d = new THREE.Vector3(picked.point.x / factor, this.overlayY - SURFACE_LIFT, picked.point.y / factor);
            return { point3d, position: pos3DToCanvas(point3d) };
        }
        if (this.layer._isCreationToolActive()) {
            const hit = this.interactionManager.findMouseIntersect(event);
            if (hit?.point && hit.object?.userData?.entity3D?.embeddedName !== "Wall") {
                this.surfaceY = hit.point.y;
                return { point3d: hit.point.clone(), position: pos3DToCanvas(hit.point) };
            }
        }
        return this.planeAt(event, this.overlayY - SURFACE_LIFT);
    }

    hitDrawing(hit, event) {
        if (event && (event.ctrlKey || event.metaKey) && this.layer._isCreationToolActive()) return null;
        return this.picked?.door ? null : this.picked?.wall ?? null;
    }

    _onPointerDown(event) {
        if (this.active && event.button === 0 && !this.currentSession) {
            const picked = this.pick(event);
            if (picked?.door) {
                this._consume(event);
                return this.toggleDoor(picked.wall, event, false);
            }
        }
        return super._onPointerDown(event);
    }

    onRightDown(event) {
        if (this.active && !this.currentSession) {
            const picked = this.pick(event);
            if (picked?.door) {
                this.blocked.add(RIGHT);
                return this.toggleDoor(picked.wall, event, true);
            }
        }
        return super.onRightDown(event);
    }

    toggleDoor(wall, event, right) {
        const control = wall.doorControl;
        if (!control) return;
        event.data = { originalEvent: event };
        if (right) control._onRightDown(event);
        else control._onMouseDown(event);
    }

    _onPointerMove(event) {
        super._onPointerMove(event);
        if (!this.active || this.session || this.box) return;
        const picked = this.pick(event);
        const hover = picked?.wall ?? null;
        if (hover !== this.hover) {
            this.hover = hover;
            this.signature = null;
        }
        const hit = this.planeAt(event, this.overlayY - SURFACE_LIFT);
        if (hit) this.interactionManager._setCanvasPointer(hit.position.x, hit.position.y, hit.position.z, hit.point3d);
    }

    selectInBox(rect, additive) {
        const layer = this.layer;
        const height = this.overlayY;
        const selected = layer.placeables.filter((wall) => {
            if (!wall.visible || !wall._canControl(game.user)) return false;
            const c = wall.document.c;
            return [[c[0], c[1]], [c[2], c[3]], [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2]].some(([x, y]) => {
                const s = this.toScreen(x, y, height);
                return s.z <= 1 && rect.contains(s.x, s.y);
            });
        });
        if (!additive) layer.releaseAll();
        for (const wall of selected) wall.control({ releaseOthers: false });
    }

    sessionWalls() {
        const data = this.session?.mim?.interactionData ?? canvas.mouseInteractionManager?.interactionData;
        const out = [];
        if (data?.preview && !data.preview.destroyed && data.preview.document?.c) out.push(data.preview);
        for (const clone of data?.clones ?? []) if (!clone.destroyed && clone.document?.c) out.push(clone);
        return out;
    }

    update() {
        const show = this.active;
        if (this.overlay.parent !== this._parent.scene) this._parent.scene.add(this.overlay);
        this.overlay.visible = show;
        if (!show) {
            this.hover = null;
            return;
        }
        const walls = this.layer.placeables.filter((wall) => wall.visible || wall.controlled);
        const extra = this.sessionWalls();
        const height = this.overlayY;
        const signature = [height, this.hover?.id, ...walls.map((w) => `${w.id}:${w.document.c.join(",")}:${w.controlled ? 1 : 0}:${w.document.door}:${w.document.ds}:${w.document.move}:${w.document.sight}:${w.document.light}:${w.document.sound}:${w.document.dir}`), ...extra.map((w) => w.document.c.join(","))].join("|");
        if (signature === this.signature) return;
        this.signature = signature;
        this.buildLines(walls, extra, height);
        this.buildDoorIcons(walls, height);
    }

    buildLines(walls, extra, height) {
        const positions = [];
        const colors = [];
        const color = new THREE.Color();
        const cell = canvas.grid.size / factor;
        const quad = (c, width, col, y) => {
            const ax = c[0] / factor;
            const az = c[1] / factor;
            const bx = c[2] / factor;
            const bz = c[3] / factor;
            const len = Math.hypot(bx - ax, bz - az);
            if (len < 1e-6) return;
            const nx = (-(bz - az) / len) * width * 0.5;
            const nz = ((bx - ax) / len) * width * 0.5;
            const p = [ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz];
            for (const i of [0, 1, 2, 0, 2, 3]) {
                positions.push(p[i * 2], y, p[i * 2 + 1]);
                colors.push(col.r, col.g, col.b);
            }
        };
        const disk = (x, z, radius, col, y) => {
            const segments = 14;
            for (let i = 0; i < segments; i++) {
                const a0 = (i / segments) * Math.PI * 2;
                const a1 = ((i + 1) / segments) * Math.PI * 2;
                positions.push(x, y, z, x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius, x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius);
                for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
            }
        };
        const draw = (wall, y) => {
            const c = wall.document.c;
            const highlight = wall.controlled ? CONTROLLED_COLOR : wall === this.hover ? HOVER_COLOR : null;
            if (highlight) quad(c, cell * HIGHLIGHT_WIDTH, highlight, y);
            color.set(Number(wall._getWallColor()));
            quad(c, cell * LINE_WIDTH, color, y + SURFACE_LIFT * 0.1);
            for (const [x, z] of [[c[0], c[1]], [c[2], c[3]]]) {
                disk(x / factor, z / factor, cell * ENDPOINT_RADIUS * 1.35, highlight ?? OUTLINE_COLOR, y + SURFACE_LIFT * 0.2);
                disk(x / factor, z / factor, cell * ENDPOINT_RADIUS, color, y + SURFACE_LIFT * 0.3);
            }
        };
        for (const wall of walls) draw(wall, height);
        for (const wall of extra) draw(wall, height + SURFACE_LIFT);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        this.lines.geometry.dispose();
        this.lines.geometry = geometry;
    }

    iconMaterial(path) {
        if (!this.iconMaterials.has(path)) {
            const material = new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
            this._parent.helpers.loadTexture(path).then((texture) => {
                material.map = texture;
                material.needsUpdate = true;
            });
            this.iconMaterials.set(path, material);
        }
        return this.iconMaterials.get(path);
    }

    doorIconPath(wall) {
        const ds = CONST.WALL_DOOR_STATES;
        const icons = CONFIG.controlIcons;
        const state = wall.document.ds;
        if (state === ds.LOCKED) return icons.doorLocked;
        if (state === ds.OPEN) return icons.doorOpen;
        return wall.document.door === CONST.WALL_DOOR_TYPES.SECRET ? icons.doorSecret : icons.doorClosed;
    }

    buildDoorIcons(walls, height) {
        this.doorIcons.clear();
        const cell = canvas.grid.size / factor;
        for (const wall of walls) {
            if (!wall.isDoor) continue;
            const c = wall.document.c;
            const sprite = new THREE.Sprite(this.iconMaterial(this.doorIconPath(wall)));
            sprite.position.set((c[0] + c[2]) / 2 / factor, height + DOOR_ICON_LIFT * cell, (c[1] + c[3]) / 2 / factor);
            sprite.scale.setScalar(cell * DOOR_ICON_SIZE);
            sprite.renderOrder = 1001;
            sprite.userData.ignoreHover = true;
            sprite.userData.noIntersect = true;
            this.doorIcons.add(sprite);
        }
    }
}
