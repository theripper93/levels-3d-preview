import * as THREE from "three";
import { factor } from "../main.js";
import { RulerPath3D } from "../systems/ruler3d.js";
import { pos3DToCanvas, posCanvasTo3d } from "../helpers/coords3d.js";
import { WARMUP_LAYER } from "../systems/lightWarmup.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const GHOST_OPACITY = 0.55;
const CLICK_SLOP_PX = 5;
const WARM_POLL_MS = 250;
const WARM_TIMEOUT_MS = 15000;
const FAR_AWAY = -1e5;
const PENDING_PULSE_MS = 900;
const PENDING_TIMEOUT_MS = 30000;
const PENDING_UNBOUND_MS = 5000;
const WARMUP_MASK = (1 << WARMUP_LAYER) >>> 0;
const ghostBox = new THREE.Box3();
const corners = Array.from({ length: 4 }, () => new THREE.Vector3());
const front = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);
const xAxis = new THREE.Vector3(1, 0, 0);
const blankTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
blankTexture.colorSpace = THREE.SRGBColorSpace;
blankTexture.needsUpdate = true;

function isModel(src) {
    const lower = src.toLowerCase();
    return lower.endsWith(".glb") || lower.endsWith(".gltf");
}

function inert(object) {
    object.traverse((child) => {
        child.userData.ignoreHover = true;
        child.userData.noIntersect = true;
        child.raycast = () => {};
        child.castShadow = false;
        child.receiveShadow = false;
    });
    return object;
}

function ghostMaterial({ map = null, color = 0xffffff, vertexColors = false } = {}) {
    const material = new THREE.MeshBasicMaterial({ map, color, vertexColors, transparent: true, opacity: GHOST_OPACITY, alphaTest: 0.05, depthWrite: false, side: THREE.DoubleSide });
    material.userData.noVisionMode = true;
    return material;
}

function ghostMaterialFor(source, mesh) {
    return ghostMaterial({ map: source?.map ?? null, color: source?.color ?? 0xffffff, vertexColors: !!mesh.geometry?.attributes?.color });
}

function billboardGeometry() {
    return mergeGeometries([new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2), new THREE.PlaneGeometry(1, 1)]).translate(0, 0.5, 0);
}

export class AssetPlacementPreview {
    constructor(browser) {
        this.browser = browser;
        this.root = inert(new THREE.Group());
        this.root.name = "asset-placement-preview";
        this.footprint = new RulerPath3D("asset-placement-footprint");
        this.ghosts = new Map();
        this.warmed = new Set();
        this.roll = null;
        this._loadId = 0;
        this._frame = null;
        this._pointer = null;
        this._rightDown = null;
        this._leftDown = null;
        this._collisionDirty = true;
        this._disposers = [];
        this._baseReady = false;
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerLeave = this.hide.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        const dom = this.dom;
        dom.addEventListener("pointermove", this._onPointerMove);
        dom.addEventListener("pointerleave", this._onPointerLeave);
        dom.addEventListener("mousemove", this._onMouseMove, true);
        dom.addEventListener("wheel", this._onWheel, { capture: true, passive: false });
        dom.addEventListener("mousedown", this._onMouseDown, true);
        dom.addEventListener("mouseup", this._onMouseUp, true);
        window.addEventListener("keydown", this._onKeyDown, true);
        this.pending = [];
        this._pendingFrame = null;
        this._createHook = Hooks.on("createTile", (document, options, userId) => {
            this._collisionDirty = true;
            this.bindPending(document, options, userId);
        });
        this.warmBaseMaterials();
    }

    get parent() {
        return game.Levels3DPreview;
    }

    get dom() {
        return this.parent.renderer.domElement;
    }

    get sources() {
        return [...(this.browser.element?.querySelectorAll("li.selected") ?? [])].map((li) => li.dataset.output);
    }

    get active() {
        return !!this.roll && !!canvas.tiles?.active && this.parent._active;
    }

    get capturing() {
        return this.active && ui.controls.tool?.name === "select";
    }

    warm(object) {
        const parent = this.parent;
        object.traverse((child) => (child.frustumCulled = false));
        parent.scene.add(object);
        parent.lightWarmup?.warmObject(object);
        const start = performance.now();
        return new Promise((resolve) => {
            const check = () => {
                const pending = object.layers.mask === WARMUP_MASK && performance.now() - start < WARM_TIMEOUT_MS;
                if (pending && object.parent) return setTimeout(check, WARM_POLL_MS);
                object.removeFromParent();
                resolve(object);
            };
            if (object.layers.mask === WARMUP_MASK) setTimeout(check, WARM_POLL_MS);
            else check();
        });
    }

    warmBaseMaterials() {
        const group = inert(new THREE.Group());
        group.position.set(0, FAR_AWAY, 0);
        const plain = new THREE.BoxGeometry(1, 1, 1);
        const colored = plain.clone();
        colored.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(colored.attributes.position.count * 3).fill(1), 3));
        const materials = [];
        for (const map of [null, blankTexture]) {
            for (const geometry of [plain, colored]) {
                const material = ghostMaterial({ map, vertexColors: geometry === colored });
                materials.push(material);
                group.add(new THREE.Mesh(geometry, material));
            }
        }
        const billboard = new THREE.Mesh(billboardGeometry(), ghostMaterial({ map: blankTexture }));
        materials.push(billboard.material);
        group.add(billboard);
        const lines = new RulerPath3D("asset-placement-warmup");
        const scale = canvas.dimensions.uiScale;
        const outline = { thickness: scale, color: 0x000000 };
        const a = new THREE.Vector3(0, FAR_AWAY, 0);
        const b = new THREE.Vector3(1, FAR_AWAY, 0);
        lines.addSegment(a, b, { width: 1.5 * scale, color: 0xffffff, alpha: 0.9, outline, dashed: true, outlineDashed: true });
        lines.addSegment(a, b, { width: 1.5 * scale, color: 0xffffff, alpha: 0.9, outline });
        lines.addWaypoint(a, { radius: 3 * scale, outline });
        lines.build();
        group.add(lines.group);
        this._disposers.push(() => {
            lines.destroy();
            materials.forEach((material) => material.dispose());
            plain.dispose();
            colored.dispose();
            billboard.geometry.dispose();
        });
        this.baseWarm = this.warm(group).then(() => {
            this._baseReady = true;
            this.schedule();
        });
    }

    async warmModel(src) {
        if (this.warmed.has(src) || !isModel(src)) return;
        this.warmed.add(src);
        const data = await this.parent.helpers.loadModel(src);
        if (!data?.model || !this.parent.scene) return;
        const model = inert(data.model);
        model.position.set(0, FAR_AWAY, 0);
        this._disposers.push(() =>
            model.traverse((child) => {
                if (child.isMesh) [child.material].flat().forEach((material) => material?.dispose());
            }),
        );
        await this.warm(model);
    }

    refresh() {
        const sources = this.sources;
        this.browser._hasSelected = sources.length > 0;
        if (!sources.length) {
            this.roll = null;
            this.hide();
            return;
        }
        this.releaseHover();
        this.reroll(sources);
    }

    releaseHover() {
        const interactionManager = this.parent.interactionManager;
        const event = new MouseEvent("mousemove");
        interactionManager?.currentHover?._onHoverOut?.(event);
        if (interactionManager) interactionManager.currentHover = null;
        canvas.tiles?.hover?._onHoverOut?.(event);
        canvas.tiles?.releaseAll();
    }

    reroll(sources = this.sources) {
        const src = sources[Math.floor(Math.random() * sources.length)];
        if (!src) return;
        const options = this.browser.quickPlacementOptions;
        const angle = parseFloat(this.browser.element.querySelector("#angle")?.value || 0);
        this.roll = {
            src,
            rotation: options.rotation ? Math.random() * 360 : angle,
            scale: options.scale ? Math.random() + 0.5 : 1,
        };
        const loadId = ++this._loadId;
        this.getGhost(src).then((ghost) => {
            if (loadId !== this._loadId) return;
            this.ghost = ghost;
            this.root.clear();
            if (ghost) this.root.add(ghost.object);
            this.schedule();
            this.warmModel(src);
        });
    }

    consume() {
        if (!this.active || !this.roll) return null;
        const roll = this.roll;
        this._collisionDirty = true;
        this.addPending(roll.src);
        setTimeout(() => this.roll && this.reroll(), 0);
        return roll;
    }

    addPending(src) {
        const ghost = this.ghost;
        if (!ghost || !this.root.visible || !this.root.children.includes(ghost.object)) return;
        const object = inert(ghost.object.clone());
        const materials = new Map();
        object.traverse((child) => {
            if (!child.isMesh) return;
            const swap = (material) => {
                if (!materials.has(material)) materials.set(material, material.clone());
                return materials.get(material);
            };
            child.material = Array.isArray(child.material) ? child.material.map(swap) : swap(child.material);
        });
        object.matrixWorldNeedsUpdate = true;
        this.parent.scene.add(object);
        this.pending.push({ src, object, materials: [...materials.values()], tileId: null, start: performance.now() });
        this.animatePending();
    }

    bindPending(document, options, userId) {
        if (userId !== game.user.id) return;
        const sources = [document.texture?.src, document.getFlag("levels-3d-preview", "model3d")];
        const entry = this.pending.find((pending) => !pending.tileId && sources.includes(pending.src));
        if (entry) entry.tileId = document.id;
    }

    isTileShown(tileId) {
        const tile3d = this.parent.tiles?.[tileId];
        if (!tile3d) return !canvas.tiles?.get(tileId);
        if (!tile3d._loaded) return false;
        const mesh = tile3d.mesh;
        return !mesh?.parent || mesh.layers.mask !== WARMUP_MASK;
    }

    animatePending() {
        if (this._pendingFrame || !this.pending.length) return;
        this._pendingFrame = requestAnimationFrame(() => {
            this._pendingFrame = null;
            const now = performance.now();
            const opacity = GHOST_OPACITY * (0.55 + 0.45 * Math.cos((now / PENDING_PULSE_MS) * Math.PI * 2));
            this.pending = this.pending.filter((entry) => {
                const age = now - entry.start;
                const done = entry.tileId ? this.isTileShown(entry.tileId) || age > PENDING_TIMEOUT_MS : age > PENDING_UNBOUND_MS;
                if (done) {
                    this.disposePending(entry);
                    return false;
                }
                entry.materials.forEach((material) => (material.opacity = opacity));
                return true;
            });
            this.animatePending();
        });
    }

    disposePending(entry) {
        entry.object.removeFromParent();
        entry.materials.forEach((material) => material.dispose());
    }

    async getGhost(src) {
        let entry = this.ghosts.get(src);
        if (!entry) {
            entry = this.loadGhost(src);
            this.ghosts.set(src, entry);
        }
        return entry;
    }

    async loadGhost(src) {
        try {
            if (!isModel(src)) {
                const texture = await this.parent.helpers.loadTexture(src);
                const material = ghostMaterial({ map: texture });
                const geometry = billboardGeometry();
                const inner = new THREE.Mesh(geometry, material);
                const object = inert(new THREE.Group().add(inner));
                await this.baseWarm;
                await this.warm(object);
                return { object, inner, billboard: true, materials: [material], geometry };
            }
            const data = await this.parent.helpers.loadModel(src);
            if (!data?.model) return null;
            const model = data.model;
            const materials = [];
            model.traverse((child) => {
                if (!child.isMesh) return;
                const sources = [child.material].flat();
                const ghosts = sources.map((source) => ghostMaterialFor(source, child));
                sources.forEach((source) => source?.dispose());
                child.material = Array.isArray(child.material) ? ghosts : ghosts[0];
                child.customDepthMaterial = undefined;
                materials.push(...ghosts);
            });
            model.updateMatrixWorld(true);
            ghostBox.setFromObject(model);
            const box = ghostBox.clone();
            const inner = new THREE.Group().add(model);
            const object = inert(new THREE.Group().add(inner));
            await this.baseWarm;
            await this.warm(object);
            object.traverse((child) => (child.frustumCulled = true));
            return { object, inner, box, materials };
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    _onPointerMove(event) {
        this._pointer = { x: event.clientX, y: event.clientY };
        if (this.roll) this.schedule();
    }

    _onMouseMove(event) {
        if (!this.capturing) return;
        event.stopImmediatePropagation();
        const down = this._leftDown;
        if (!down) return;
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP_PX) down.moved = true;
    }

    schedule() {
        if (this._frame) return;
        this._frame = requestAnimationFrame(() => {
            this._frame = null;
            this.update();
        });
    }

    update() {
        if (!this.active || !this.ghost || !this._pointer || !this._baseReady) return this.hide();
        const interactionManager = this.parent.interactionManager;
        const hit = interactionManager.mouseIntersection3DCollision(this._pointer, this._collisionDirty, "compendium")[0];
        this._collisionDirty = false;
        if (!hit?.point) return this.hide();
        const placement = this.placement(hit);
        this.place(placement);
        this.drawFootprint(placement);
    }

    placement(hit) {
        const options = this.browser.quickPlacementOptions;
        const roll = this.roll;
        const point = pos3DToCanvas(hit.point);
        let { x, y } = point;
        if (options.grid) ({ x, y } = canvas.grid.getSnappedPoint({ x, y }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER }));
        const center = posCanvasTo3d({ x: Math.round(x), y: Math.round(y), z: point.z });
        let rotation = roll.rotation;
        let tiltX = 0;
        let tiltZ = 0;
        const normal = options.normal ? (hit.face?.normal ?? yAxis) : null;
        if (normal) {
            const dummy = new THREE.Object3D();
            dummy.lookAt(normal.x, normal.y, normal.z);
            dummy.rotateOnAxis(xAxis, Math.PI / 2);
            tiltX = dummy.rotation.x;
            tiltZ = dummy.rotation.z;
            rotation = Math.toDegrees(dummy.rotation.y);
        }
        const size = (canvas.grid.size * this.browser.constructor.scale * roll.scale) / factor;
        return { center, rotation, tiltX, tiltZ, size, autoCenter: !!options.center || !!normal };
    }

    place({ center, rotation, tiltX, tiltZ, size, autoCenter }) {
        const ghost = this.ghost;
        const object = ghost.object;
        object.position.copy(center);
        object.rotation.set(tiltX, -Math.toRadians(rotation), tiltZ);
        if (ghost.billboard) {
            ghost.inner.scale.setScalar(size);
            object.scale.setScalar(1);
        } else {
            const { min, max } = ghost.box;
            ghost.inner.position.set(autoCenter ? -(min.x + max.x) / 2 : 0, -min.y, autoCenter ? -(min.z + max.z) / 2 : 0);
            object.scale.setScalar(size);
        }
        if (this.root.parent !== this.parent.scene) this.parent.scene.add(this.root);
        this.root.visible = true;
    }

    drawFootprint({ center, rotation, size, autoCenter }) {
        const ghost = this.ghost;
        let halfW = size / 2;
        let halfH = size / 2;
        let offsetX = 0;
        let offsetZ = 0;
        if (!ghost.billboard) {
            const { min, max } = ghost.box;
            halfW = ((max.x - min.x) * size) / 2;
            halfH = ((max.z - min.z) * size) / 2;
            if (!autoCenter) {
                offsetX = ((min.x + max.x) / 2) * size;
                offsetZ = ((min.z + max.z) / 2) * size;
            }
        }
        const angle = -Math.toRadians(rotation);
        const lift = canvas.grid.size / factor / 100;
        const local = [
            [-halfW, -halfH],
            [halfW, -halfH],
            [halfW, halfH],
            [-halfW, halfH],
        ];
        for (let i = 0; i < 4; i++) corners[i].set(local[i][0] + offsetX, 0, local[i][1] + offsetZ).applyAxisAngle(yAxis, angle).add(center).setY(center.y + lift);
        front.set(offsetX, 0, halfH + offsetZ).applyAxisAngle(yAxis, angle).add(center).setY(center.y + lift);
        const scale = canvas.dimensions.uiScale;
        const color = game.user.color.css;
        const outline = { thickness: scale, color: 0x000000 };
        const style = { width: 1.5 * scale, color, alpha: 0.9, outline, dashed: true, outlineDashed: true };
        const footprint = this.footprint;
        footprint.clear();
        for (let i = 0; i < 4; i++) footprint.addSegment(corners[i], corners[(i + 1) % 4], style);
        const base = center.clone().setY(center.y + lift);
        footprint.addSegment(base, front, { ...style, dashed: false, outlineDashed: false });
        footprint.addWaypoint(base, { radius: 3 * scale, color, outline });
        footprint.build();
        footprint.attach();
    }

    rotate(delta) {
        const roll = this.roll;
        roll.rotation = (((roll.rotation + delta) % 360) + 360) % 360;
        if (!this.browser.quickPlacementOptions.rotation) {
            const input = this.browser.element.querySelector("#angle");
            if (input) input.value = Math.round(roll.rotation);
        }
        this.update();
    }

    _onWheel(event) {
        if (!this.active || !this.root.visible || !(event.ctrlKey || event.shiftKey)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const step = event.shiftKey ? (canvas.grid.isHexagonal ? 60 : 45) : 15;
        this.rotate(Math.sign(event.deltaY) * step);
    }

    _onMouseDown(event) {
        if (event.button === 2 && this.active) {
            event.stopImmediatePropagation();
            this._rightDown = { x: event.clientX, y: event.clientY };
            return;
        }
        if (event.button !== 0 || !this.capturing) return;
        event.stopImmediatePropagation();
        this._leftDown = { x: event.clientX, y: event.clientY, moved: false };
    }

    _onMouseUp(event) {
        if (event.button === 2) return this._onRightUp(event);
        const down = this._leftDown;
        if (event.button !== 0 || !down) return;
        this._leftDown = null;
        event.stopImmediatePropagation();
        if (!down.moved && this.capturing) this.browser.placeAtCursor(event);
    }

    _onRightUp(event) {
        const down = this._rightDown;
        if (!down) return;
        this._rightDown = null;
        event.stopImmediatePropagation();
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) <= CLICK_SLOP_PX) this.cancel();
    }

    _onKeyDown(event) {
        if (event.key !== "Escape" || !this.active) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancel();
    }

    cancel() {
        this.browser.element?.querySelectorAll("li.selected").forEach((li) => li.classList.remove("selected"));
        this.refresh();
    }

    hide() {
        this.root.visible = false;
        this.footprint.clear();
    }

    destroy() {
        const dom = this.dom;
        dom.removeEventListener("pointermove", this._onPointerMove);
        dom.removeEventListener("pointerleave", this._onPointerLeave);
        dom.removeEventListener("mousemove", this._onMouseMove, true);
        dom.removeEventListener("wheel", this._onWheel, { capture: true });
        dom.removeEventListener("mousedown", this._onMouseDown, true);
        dom.removeEventListener("mouseup", this._onMouseUp, true);
        window.removeEventListener("keydown", this._onKeyDown, true);
        Hooks.off("createTile", this._createHook);
        if (this._frame) cancelAnimationFrame(this._frame);
        if (this._pendingFrame) cancelAnimationFrame(this._pendingFrame);
        this.pending.splice(0).forEach((entry) => this.disposePending(entry));
        this._loadId++;
        this.roll = null;
        this.root.removeFromParent();
        this.footprint.destroy();
        for (const entry of this.ghosts.values()) {
            entry.then((ghost) => {
                ghost?.materials.forEach((material) => material.dispose());
                ghost?.geometry?.dispose();
            });
        }
        this.ghosts.clear();
        this._disposers.splice(0).forEach((dispose) => dispose());
    }
}
