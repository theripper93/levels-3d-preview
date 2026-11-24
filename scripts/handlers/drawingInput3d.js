import * as THREE from "three";
import { pos3DToCanvas, posCanvasTo3d, position3dtoScreen } from "../helpers/coords3d.js";

const CLICK_TOLERANCE_PX = 5;
const CAMERA_TOLERANCE = 0.01;
const LEFT = 0;
const RIGHT = 2;

export function levelForElevation(elevation) {
    const contains = (level) => elevation >= level.elevation.bottom - 0.01 && (!Number.isFinite(level.elevation.top) || elevation < level.elevation.top - 0.01);
    if (canvas.level && contains(canvas.level)) return canvas.level;
    return [...(canvas.scene.levels ?? [])].filter(contains).sort((a, b) => b.elevation.bottom - a.elevation.bottom)[0] ?? canvas.level;
}

export class DrawingInput3D {
    constructor(parent) {
        this._parent = parent;
        this.session = null;
        this.press = null;
        this.box = null;
        this.blocked = new Set();
        this.plane = new THREE.Plane();
        this.ndc = new THREE.Vector2();
        this.boxElement = document.createElement("div");
        this.boxElement.id = "levels-3d-preview-select-box";
        const element = parent.renderer.domElement;
        element.addEventListener("pointerdown", this._onPointerDown.bind(this), true);
        element.addEventListener("pointermove", this._onPointerMove.bind(this), true);
        element.addEventListener("pointerup", this._onPointerUp.bind(this), true);
        element.addEventListener("pointercancel", () => this.cancel(), true);
        for (const type of ["mousedown", "mouseup"]) element.addEventListener(type, this._onMouseEvent.bind(this), true);
        Hooks.on("activateCanvasLayer", () => this.cancel());
        Hooks.on("canvasTearDown", () => this.cancel());
    }

    get interactionManager() {
        return this._parent.interactionManager;
    }

    get layer() {
        return canvas.drawings;
    }

    refresh() {
        this._parent.drawings?.refresh();
    }

    eventTarget(drawing, mim) {
        return mim.object;
    }

    get camera() {
        return this._parent.camera;
    }

    get currentSession() {
        const { mim } = this.session ?? {};
        if (mim && mim.state <= mim.states.HOVER) this.session = null;
        return this.session;
    }

    get active() {
        const interactionManager = this.interactionManager;
        return !!this._parent._active && !!canvas.ready && !!canvas.drawings?.active && !interactionManager?._tokenDrag && !interactionManager?._freeRuler;
    }

    _onMouseEvent(event) {
        if (event.type === "mousedown" && event.button === RIGHT) this.onRightDown(event);
        if (!this.blocked.has(event.button)) return;
        event.stopImmediatePropagation();
        if (event.type === "mouseup") this.blocked.delete(event.button);
    }

    _consume(event) {
        event.stopImmediatePropagation();
        this.blocked.add(event.button);
    }

    surface(event) {
        const hit = this.interactionManager.findMouseIntersect(event);
        if (!hit?.point) return null;
        return { point3d: hit.point.clone(), position: pos3DToCanvas(hit.point) };
    }

    planePoint(event) {
        this.ndc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
        const raycaster = this.interactionManager.raycaster;
        raycaster.setFromCamera(this.ndc, this.camera);
        const point3d = raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
        if (!point3d) return null;
        return { point3d, position: pos3DToCanvas(point3d) };
    }

    setPointer(hit) {
        const { position, point3d } = hit;
        this.interactionManager._setCanvasPointer(position.x, position.y, position.z, point3d);
        this.pointer = { x: position.x, y: position.y };
    }

    createEvent(type, target, source, button) {
        const events = canvas.app.renderer.events;
        const event = events.rootBoundary.createPointerEvent(events.pointer, type, target);
        event.defaultPrevented = false;
        event.path = null;
        event.button = button;
        event.buttons = source.buttons ?? 0;
        event.shiftKey = !!source.shiftKey;
        event.altKey = !!source.altKey;
        event.ctrlKey = !!source.ctrlKey;
        event.metaKey = !!source.metaKey;
        event.pointerType = "mouse";
        event.timeStamp = performance.now();
        for (const point of [event.global, event.client, event.screen, event.page]) point?.set(source.clientX, source.clientY);
        Object.defineProperties(event, {
            x: { value: window.innerWidth / 2, configurable: true },
            y: { value: window.innerHeight / 2, configurable: true },
        });
        const pointer = this.pointer;
        event.getLocalPosition = (displayObject, out = new PIXI.Point()) => out.set(pointer.x, pointer.y);
        return event;
    }

    dispatch(mim, type, source, button = source.button) {
        if (mim.state < mim.states.HOVER) mim.state = mim.states.HOVER;
        const target = this.session?.mim === mim ? this.session.target ?? mim.object : mim.object;
        const event = this.createEvent(type, target, source, button);
        event.interactionData = mim.interactionData;
        if (type === "pointermove") mim.layer.emit("pointermove", event);
        else mim.handleEvent(event);
        this.elevatePreview();
        return event;
    }

    elevatePreview() {
        const session = this.session;
        const preview = canvas.mouseInteractionManager.interactionData?.preview;
        if (!session || !preview || preview.destroyed || preview._l3dElevated) return;
        preview._l3dElevated = true;
        const level = levelForElevation(session.elevation);
        preview.document.updateSource({ elevation: session.elevation, levels: level ? [level.id] : [] });
    }

    hitDrawing(hit) {
        return this._parent.drawings?.at(hit.position, hit.position.z)[0]?.drawing ?? null;
    }

    _onPointerDown(event) {
        if (!this.active) return this.session && this.cancel();
        if (event.button !== LEFT) return;
        const session = this.currentSession;
        if (session) {
            this._consume(event);
            const hit = this.planePoint(event);
            if (hit) {
                this.setPointer(hit);
                session.mim.interactionData.destination = new PIXI.Point(this.pointer.x, this.pointer.y);
            }
            this.dispatch(session.mim, "pointerdown", event);
            return;
        }
        const hit = this.surface(event);
        const drawing = hit && this.hitDrawing(hit, event);
        let mim = null;
        if (drawing?._canControl(game.user, event)) mim = drawing.mouseInteractionManager;
        else if (hit && this.layer._isCreationToolActive()) mim = canvas.mouseInteractionManager;
        else if (game.activeTool === "select" && this.interactionManager.altControls) return this.startBox(event);
        if (!mim) {
            this.press = { x: event.clientX, y: event.clientY, camera: this.camera.position.clone(), release: true };
            return;
        }
        this._consume(event);
        this.plane.set(new THREE.Vector3(0, 1, 0), -hit.point3d.y);
        this.session = { mim, elevation: Math.round(hit.position.z * 100) / 100, target: this.eventTarget(drawing, mim) };
        this.setPointer(hit);
        event.target.setPointerCapture?.(event.pointerId);
        this.dispatch(mim, "pointerdown", event);
    }

    _onPointerMove(event) {
        if (this.box) return this.updateBox(event);
        const session = this.session;
        if (!session) return;
        if (!this.active) return this.cancel();
        const { mim } = session;
        if (mim.state < mim.states.GRABBED) return;
        const hit = this.planePoint(event);
        if (!hit) return;
        this.setPointer(hit);
        this.dispatch(mim, "pointermove", event, -1);
    }

    _onPointerUp(event) {
        if (event.button === RIGHT) return this.onRightUp(event);
        if (event.button !== LEFT) return;
        if (this.box) return this.endBox(event);
        const press = this.press;
        this.press = null;
        if (press?.release && !this.moved(press, event)) this.releaseOnClick(event);
        const session = this.session;
        if (!session) return;
        event.stopImmediatePropagation();
        event.target.releasePointerCapture?.(event.pointerId);
        const hit = this.planePoint(event);
        if (hit) this.setPointer(hit);
        this.dispatch(session.mim, "pointerup", event);
        this.settle();
    }

    onRightDown(event) {
        if (!this.active) return;
        const session = this.currentSession;
        this.press = { x: event.clientX, y: event.clientY, camera: this.camera.position.clone(), hit: session ? null : this.surface(event) };
        if (session || (this.press.hit && this.hitDrawing(this.press.hit))) this.blocked.add(RIGHT);
    }

    onRightUp(event) {
        const press = this.press;
        this.press = null;
        if (!press || !this.active || this.moved(press, event)) return;
        const session = this.session;
        if (session) {
            const hit = this.planePoint(event);
            if (hit) this.setPointer(hit);
            const cancel = this.createEvent("pointermove", session.mim.object, event, RIGHT);
            session.mim.cancel(cancel);
            return this.settle();
        }
        const hit = press.hit;
        const drawing = hit && this.hitDrawing(hit);
        if (!drawing) return;
        this.setPointer(hit);
        const mim = drawing.mouseInteractionManager;
        this.dispatch(mim, "pointerdown", event, RIGHT);
        this.dispatch(mim, "pointerup", event, RIGHT);
    }

    moved(press, event) {
        return Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE_PX || press.camera.distanceTo(this.camera.position) > CAMERA_TOLERANCE;
    }

    releaseOnClick(event) {
        const layer = this.layer;
        layer.hud?.close();
        if (!event.shiftKey && !layer._isCreationToolActive() && game.settings.get("core", "leftClickRelease")) layer.releaseAll();
    }

    settle() {
        const session = this.session;
        if (!session) return;
        const { mim } = session;
        if (mim.state >= mim.states.DRAG) return;
        this.session = null;
        this.refresh();
    }

    cancel() {
        this.endBox();
        const session = this.session;
        if (!session) return;
        this.session = null;
        if (session.mim.state > session.mim.states.HOVER) {
            session.mim.interactionData.cancelled = true;
            session.mim.cancel();
        }
        this.refresh();
    }

    startBox(event) {
        this._consume(event);
        event.target.setPointerCapture?.(event.pointerId);
        this.box = { x: event.clientX, y: event.clientY, shiftKey: event.shiftKey, started: false };
    }

    updateBox(event) {
        const box = this.box;
        if (!box.started && Math.hypot(event.clientX - box.x, event.clientY - box.y) <= CLICK_TOLERANCE_PX) return;
        if (!box.started) {
            box.started = true;
            document.body.append(this.boxElement);
        }
        const style = this.boxElement.style;
        style.left = `${Math.min(box.x, event.clientX)}px`;
        style.top = `${Math.min(box.y, event.clientY)}px`;
        style.width = `${Math.abs(box.x - event.clientX)}px`;
        style.height = `${Math.abs(box.y - event.clientY)}px`;
    }

    endBox(event) {
        const box = this.box;
        if (!box) return;
        this.box = null;
        this.boxElement.remove();
        if (!event) return;
        event.stopImmediatePropagation();
        event.target.releasePointerCapture?.(event.pointerId);
        if (!box.started) return this.releaseOnClick(event);
        const rect = new PIXI.Rectangle(Math.min(box.x, event.clientX), Math.min(box.y, event.clientY), Math.abs(box.x - event.clientX), Math.abs(box.y - event.clientY));
        this.selectInBox(rect, box.shiftKey || event.shiftKey);
    }

    selectInBox(rect, additive) {
        const selected = [...(this._parent.drawings?.drawings.values() ?? [])].filter((drawing3d) => drawing3d.visible && drawing3d.drawing._canControl(game.user) && this.inBox(drawing3d, rect));
        canvas.drawings.hud?.close();
        if (!additive) canvas.drawings.releaseAll();
        for (const drawing3d of selected) drawing3d.drawing.control({ releaseOthers: false });
    }

    inBox(drawing3d, rect) {
        const corners = drawing3d.frameCorners();
        const elevation = drawing3d.document.elevation ?? 0;
        const center = drawing3d.drawing.center;
        const points = [center.x, center.y, ...corners];
        for (let i = 0; i < points.length; i += 2) {
            const screen = position3dtoScreen(posCanvasTo3d({ x: points[i], y: points[i + 1], z: elevation }));
            if (screen.z <= 1 && rect.contains(screen.x, screen.y)) return true;
        }
        return false;
    }
}
