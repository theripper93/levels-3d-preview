import * as THREE from "three";
import { factor } from "../main.js";
import * as coords3d from "../helpers/coords3d.js";
import { RULER_TOKEN_OFFSET } from "../helpers/coords3d.js";

export { RULER_TOKEN_OFFSET };

const RULER_RENDER_ORDER = 1e20;

const freeRulers = new Set();

export function is3DActive() {
    return !!game.Levels3DPreview?._active;
}

export function toThreeColor(color, fallback = 0xffffff) {
    if (color === undefined || color === null) return new THREE.Color(fallback);
    if (color instanceof THREE.Color) return color.clone();
    if (typeof color === "string") return new THREE.Color(color);
    if (Array.isArray(color)) return new THREE.Color(color[0], color[1], color[2]);
    const n = Number(color);
    return Number.isFinite(n) ? new THREE.Color(n) : new THREE.Color(fallback);
}

export function rulerPixelScale() {
    const size = game.Levels3DPreview?.CONFIG?.RULER?.RULER_SIZE ?? 0.002;
    return size / 0.002 / factor;
}

export function get3DCursorElevation(event) {
    const im = game.Levels3DPreview?.interactionManager;
    if (!im || im.isFreeMode || im.forceFree) return undefined;
    const z = im.canvas2dMousePosition?.z;
    if (!Number.isFinite(z)) return undefined;
    const precision = CONFIG.Canvas.elevationSnappingPrecision || 1;
    const interval = event?.shiftKey ? 0.01 : canvas.dimensions.distance / precision;
    return Math.round(z / interval) * interval;
}

export class RulerPath3D {
    constructor(name) {
        this.group = new THREE.Group();
        this.group.name = name;
        this.group.userData.ignoreHover = true;
        this.group.userData.noIntersect = true;
        this.signature = null;
        this.pulseMaterials = [];
        this._sphereGeometry = null;
    }

    get scene() {
        return game.Levels3DPreview?.scene;
    }

    get visible() {
        return this.group.visible;
    }

    set visible(value) {
        this.group.visible = value;
    }

    attach() {
        const scene = this.scene;
        if (!scene) return false;
        if (this.group.parent !== scene) scene.add(this.group);
        return true;
    }

    clear() {
        for (const child of this.group.children) {
            child.geometry?.dispose();
            child.material?.dispose();
        }
        this.group.clear();
        this.pulseMaterials = [];
        this.signature = null;
    }

    destroy() {
        this.clear();
        this.group.removeFromParent();
    }

    _createMaterials(color, alpha, pulse) {
        const c = toThreeColor(color);
        const opaque = alpha >= 1 && !pulse;
        const body = new THREE.MeshBasicMaterial({
            color: c,
            transparent: !opaque,
            opacity: alpha,
            depthWrite: opaque,
        });
        const core = new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity: alpha,
            depthTest: false,
            depthWrite: false,
        });
        if (pulse) {
            body.userData.baseOpacity = core.userData.baseOpacity = alpha;
            this.pulseMaterials.push(body, core);
        }
        return { body, core };
    }

    _addMesh(geometry, material, renderOrder) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.ignoreHover = true;
        mesh.userData.noIntersect = true;
        mesh.raycast = () => {};
        if (renderOrder !== undefined) mesh.renderOrder = renderOrder;
        this.group.add(mesh);
        return mesh;
    }

    addLine(points, { width, color = 0xffffff, alpha = 1, pulse = false } = {}) {
        if (!(width > 0) || !(alpha > 0) || points.length < 2) return;
        const radius = (width / 2) * rulerPixelScale();
        let curve;
        if (points.length === 2) {
            curve = new THREE.LineCurve3(points[0], points[1]);
        } else {
            curve = new THREE.CurvePath();
            for (let i = 1; i < points.length; i++) curve.add(new THREE.LineCurve3(points[i - 1], points[i]));
        }
        const tubular = Math.max(1, (points.length - 1) * 2);
        const { body, core } = this._createMaterials(color, alpha, pulse);
        this._addMesh(new THREE.TubeGeometry(curve, tubular, radius, 8, false), body);
        this._addMesh(new THREE.TubeGeometry(curve, tubular, radius * 0.4, 6, false), core, RULER_RENDER_ORDER);
    }

    addSphere(point, { radius, color = 0xffffff, alpha = 1, pulse = false } = {}) {
        if (!(radius > 0) || !(alpha > 0)) return;
        const r = radius * rulerPixelScale();
        const { body, core } = this._createMaterials(color, alpha, pulse);
        const outer = this._addMesh(new THREE.SphereGeometry(r, 16, 12), body);
        outer.position.copy(point);
        const inner = this._addMesh(new THREE.SphereGeometry(r * 0.5, 12, 8), core, RULER_RENDER_ORDER - 1);
        inner.position.copy(point);
    }

    tick() {
        if (!this.pulseMaterials.length) return;
        const t = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
        for (const m of this.pulseMaterials) m.opacity = m.userData.baseOpacity * (0.25 + 0.75 * t);
    }
}

export class RulerLabels3D {
    constructor(id, classes) {
        this.id = id;
        this.classes = classes;
        this._element = null;
        this._hidden = false;
        this._renderId = 0;
    }

    get element() {
        if (!this._element) {
            const el = document.getElementById(this.id) ?? document.createElement("div");
            el.id = this.id;
            el.classList.add(...this.classes, "levels3d");
            el.classList.toggle("hidden", this._hidden);
            this._element = el;
        }
        const measurement = document.querySelector("#hud #measurement");
        if (measurement && this._element.parentElement !== measurement) measurement.appendChild(this._element);
        return this._element;
    }

    get hidden() {
        return this._hidden;
    }

    set hidden(value) {
        this._hidden = !!value;
        this._element?.classList.toggle("hidden", this._hidden);
    }

    async render(entries, template) {
        const renderId = ++this._renderId;
        if (!template || !entries.length) {
            this._element?.replaceChildren();
            return;
        }
        const labels = [];
        for (const { context, anchor } of entries) {
            const html = await foundry.applications.handlebars.renderTemplate(template, context);
            if (renderId !== this._renderId) return;
            const label = foundry.utils.parseHTML(html);
            if (!(label instanceof HTMLElement)) continue;
            label._anchor3d = anchor;
            label.style.setProperty("--ui-scale", 1);
            labels.push(label);
        }
        this.element.replaceChildren(...labels);
        this.update();
    }

    update() {
        const el = this._element;
        if (!el || this._hidden || !el.childElementCount) return;
        for (const label of el.children) {
            const anchor = label._anchor3d;
            if (!anchor) continue;
            const p = coords3d.position3dtoScreen(anchor);
            if (!(p.z < 1 && p.z > -1)) {
                label.style.visibility = "hidden";
                continue;
            }
            label.style.visibility = "";
            label.style.setProperty("--position-x", `${p.x}px`);
            label.style.setProperty("--position-y", `${p.y + 8}px`);
        }
    }

    clear() {
        this._renderId++;
        this._element?.replaceChildren();
    }

    destroy() {
        this._renderId++;
        this._element?.remove();
        this._element = null;
    }
}

export function Ruler3DMixin(Base) {
    return class Ruler3D extends Base {
        static is3DRuler = true;

        #path3d;

        #labels3d;

        #destroyed = false;

        constructor(user) {
            super(user);
            this.#path3d = new RulerPath3D(`distance-ruler-3d-${this.user.id}`);
            this.#labels3d = new RulerLabels3D(`distance-ruler-3d-${this.user.id}`, ["ruler-labels", "distance-ruler-labels"]);
            freeRulers.add(this);
        }

        get mesh3d() {
            return this.#path3d.group;
        }

        get labels3d() {
            return this.#labels3d;
        }

        destroy() {
            this.#destroyed = true;
            this.renderFlags.clear();
            this._destroy3D();
            freeRulers.delete(this);
            super.destroy();
        }

        _refresh() {
            if (this.#destroyed) return;
            if (!is3DActive()) {
                this._clear3D();
                return super._refresh();
            }
            if (!this.visible || !this.path.length) {
                this._clear3D();
                return;
            }
            const signature = JSON.stringify([this.path, this.hidden]);
            if (signature === this.#path3d.signature && this.#path3d.group.parent) return;
            const waypoints = this._get3DWaypoints();
            const points = waypoints.map((w) => coords3d.posCanvasTo3d({ x: w.x, y: w.y, z: w.elevation }));
            this._draw3DPath(waypoints, points);
            this.#path3d.signature = signature;
            this._render3DLabels(waypoints, points);
        }

        _get3DWaypoints() {
            const waypoints = [];
            const measurement = canvas.grid.measurePath(this.path);
            const Ray = foundry.canvas.geometry.Ray;
            for (let i = 0; i < this.path.length; i++) {
                const { x, y, elevation } = this.path[i];
                let ray = null;
                if (waypoints.length > 0) {
                    const { x: x0, y: y0 } = waypoints.at(-1);
                    ray = new Ray({ x: x0, y: y0 }, { x, y });
                }
                waypoints.push({ x, y, elevation, index: i, ray, measurement: measurement.waypoints[i], previous: null, next: null });
            }
            for (let i = 0; i < waypoints.length; i++) {
                waypoints[i].previous = i > 0 ? waypoints[i - 1] : null;
                waypoints[i].next = i < waypoints.length - 1 ? waypoints[i + 1] : null;
            }
            return waypoints;
        }

        _draw3DPath(waypoints, points) {
            const path3d = this.#path3d;
            path3d.clear();
            if (!path3d.attach()) return;
            for (let i = 1; i < waypoints.length; i++) {
                const { width, color = 0xffffff, alpha = 1 } = this._getSegmentStyle(waypoints[i]);
                path3d.addLine([points[i - 1], points[i]], { width, color, alpha });
            }
            for (let i = 0; i < waypoints.length; i++) {
                const { radius, color = 0xffffff, alpha = 1 } = this._getWaypointStyle(waypoints[i]);
                path3d.addSphere(points[i], { radius, color, alpha });
            }
        }

        _render3DLabels(waypoints, points) {
            const template = this.constructor.WAYPOINT_LABEL_TEMPLATE;
            const entries = [];
            const state = {};
            const lift = 6 * canvas.dimensions.uiScale * rulerPixelScale();
            for (let i = 0; i < waypoints.length; i++) {
                const waypoint = waypoints[i];
                const context = this._getWaypointLabelContext(waypoint, state);
                if (!context) continue;
                context.waypoint = waypoint;
                context.waypointType = "distance-ruler";
                context.uiScale ??= canvas.dimensions.uiScale;
                const anchor = points[i].clone();
                anchor.y += lift;
                entries.push({ context, anchor });
            }
            this.#labels3d.hidden = false;
            this.#labels3d.render(entries, template);
        }

        _clear3D() {
            this.#path3d.clear();
            this.#path3d.group.removeFromParent();
            this.#labels3d.clear();
        }

        _destroy3D() {
            this.#path3d.destroy();
            this.#labels3d.destroy();
        }

        updateLabels() {
            if (!is3DActive()) return;
            this.#labels3d.update();
        }

        _set3DElevation(elevation, count = 1) {
            if (elevation === undefined || !this.path.length) return;
            const path = [...this.path];
            let changed = false;
            for (let i = Math.max(0, path.length - count); i < path.length; i++) {
                if (path[i].elevation === elevation) continue;
                path[i] = { ...path[i], elevation };
                changed = true;
            }
            if (changed) this.path = path;
        }

        _onDragStart(event) {
            super._onDragStart(event);
            if (!is3DActive()) return;
            this._set3DElevation(get3DCursorElevation(event), this.path.length);
        }

        _onMouseMove(event) {
            super._onMouseMove(event);
            if (!is3DActive() || !this.active) return;
            this._set3DElevation(get3DCursorElevation(event), 1);
        }

        _addDragWaypoint(point, options) {
            const length = this.path.length;
            super._addDragWaypoint(point, options);
            if (!is3DActive() || this.path.length === length) return;
            this._set3DElevation(get3DCursorElevation(), 2);
        }

        static updateAllLabels() {
            for (const ruler of freeRulers) ruler.updateLabels();
        }

        static clearAll3D() {
            for (const ruler of freeRulers) {
                ruler._clear3D();
                ruler.refresh();
            }
        }

        static position3dtoScreen(position) {
            return coords3d.position3dtoScreen(position);
        }

        static centerElement(element, position, ontop = false) {
            return coords3d.centerElement(element, position, ontop);
        }

        static posCanvasTo3d(position) {
            return coords3d.posCanvasTo3d(position);
        }

        static unitsToPixels(units) {
            return coords3d.unitsToPixels(units);
        }

        static pixelsToUnits(pixels) {
            return coords3d.pixelsToUnits(pixels);
        }

        static pos3DToCanvas(position) {
            return coords3d.pos3DToCanvas(position);
        }

        static useSnapped() {
            return coords3d.useSnapped();
        }

        static roundToMultiple(number, multiple) {
            return coords3d.roundToMultiple(number, multiple);
        }

        static snapped3DPosition(position, isToken = false) {
            return coords3d.snapped3DPosition(position, isToken);
        }

        static measureDistance(position1, position2) {
            return coords3d.measureDistance(position1, position2);
        }

        static measureMinTokenDistance(origin, target) {
            return coords3d.measureMinTokenDistance(origin, target);
        }
    };
}

export const Ruler3D = Ruler3DMixin(foundry.canvas.interaction.Ruler);

export function registerRuler3D() {
    const cls = CONFIG.Canvas.rulerClass;
    if (!cls || cls.is3DRuler === true) return false;
    CONFIG.Canvas.rulerClass = Ruler3DMixin(cls);
    if (canvas?.ready) redrawRulers3D();
    return true;
}

export async function redrawRulers3D() {
    if (!canvas?.ready || !canvas.controls) return;
    try {
        await canvas.controls.drawRulers();
    } catch (e) {
        console.error("3D Canvas | Failed to redraw rulers", e);
    }
}
