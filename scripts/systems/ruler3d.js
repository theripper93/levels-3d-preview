import * as THREE from "three";
import { factor } from "../main.js";
import * as coords3d from "../helpers/coords3d.js";
import { RULER_TOKEN_OFFSET } from "../helpers/coords3d.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

export { RULER_TOKEN_OFFSET };

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

export function get3DCursorElevation() {
    const im = game.Levels3DPreview?.interactionManager;
    if (!im || im.isFreeMode || im.forceFree) return undefined;
    const z = im.canvas2dMousePosition?.z;
    if (!Number.isFinite(z)) return undefined;
    return Math.round(z * 10) / 10;
}

const DOT_VERTEX = `
uniform float uPixelRatio;
attribute float aSize;
attribute float aRing;
attribute vec3 aColor;
attribute vec3 aOutline;
attribute float aAlpha;
varying vec3 vColor;
varying vec3 vOutline;
varying float vAlpha;
varying float vSize;
varying float vRing;
void main() {
    vColor = aColor;
    vOutline = aOutline;
    vAlpha = aAlpha;
    vSize = aSize * uPixelRatio;
    vRing = aRing * uPixelRatio;
    gl_PointSize = vSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DOT_FRAGMENT = `
varying vec3 vColor;
varying vec3 vOutline;
varying float vAlpha;
varying float vSize;
varying float vRing;
void main() {
    float r = length(gl_PointCoord - 0.5) * vSize;
    float R = vSize * 0.5;
    float aa = 0.75;
    float disc = 1.0 - smoothstep(R - aa, R + aa, r);
    float inner = 1.0 - smoothstep(R - vRing - aa, R - vRing + aa, r);
    float a = disc * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vOutline, vColor, inner), a);
    #include <colorspace_fragment>
}
`;

const RULER_SCALE = 1.5;
const XRAY_LINE_ALPHA = 0.6;
const XRAY_OUTLINE_ALPHA = 0.4;
const DASH = 12;
const GAP = 8;
const DASH_SPEED = 50;
const LINE_ORDER = 1e15;

const lineMaterials = new Map();
const animatedMaterials = [];
let dotMaterial = null;

function syncDotPixelRatio(renderer) {
    dotMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
}

function getDotMaterial() {
    dotMaterial ??= new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: 1 } },
        vertexShader: DOT_VERTEX,
        fragmentShader: DOT_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    return dotMaterial;
}

function dashUnit() {
    return canvas.dimensions.uiScale / factor;
}

function getLineMaterial({ outline, xray, width, alpha, dash, color }) {
    const key = `${outline}|${xray}|${width}|${alpha}|${dash}|${color}`;
    let material = lineMaterials.get(key);
    if (!material) {
        material = new LineMaterial({
            color: outline ? color : 0xffffff,
            vertexColors: !outline,
            linewidth: width,
            transparent: true,
            opacity: alpha * (xray ? (outline ? XRAY_OUTLINE_ALPHA : XRAY_LINE_ALPHA) : 1),
            depthTest: !xray,
            depthWrite: false,
            dashed: !!dash,
            worldUnits: false,
        });
        material.toneMapped = false;
        if (dash === "animated") animatedMaterials.push(material);
        lineMaterials.set(key, material);
    }
    return material;
}

function configureDash(material, outline, thickness) {
    if (!material.dashed) return;
    const unit = dashUnit();
    const shift = outline ? thickness * unit : 0;
    material.dashSize = DASH * unit + 2 * shift;
    material.gapSize = Math.max(GAP * unit - 2 * shift, 0);
    material.userData.dashShift = shift;
    material.dashOffset = shift;
}

function tickDashes() {
    if (!animatedMaterials.length || !canvas?.dimensions) return;
    const unit = dashUnit();
    const travel = ((performance.now() / 1000) * DASH_SPEED * unit) % ((DASH + GAP) * unit);
    for (let i = 0; i < animatedMaterials.length; i++) animatedMaterials[i].dashOffset = (animatedMaterials[i].userData.dashShift ?? 0) - travel;
}

function inertObject(object) {
    object.userData.ignoreHover = true;
    object.userData.noIntersect = true;
    object.raycast = () => {};
    object.castShadow = false;
    object.receiveShadow = false;
    return object;
}

const emptyLineGeometry = new LineSegmentsGeometry();

export class RulerPath3D {
    constructor(name) {
        this.group = new THREE.Group();
        this.group.name = name;
        this.group.userData.ignoreHover = true;
        this.group.userData.noIntersect = true;
        this.signature = null;
        this._batches = new Map();
        this._dots = { positions: [], sizes: [], rings: [], colors: [], outlines: [], alphas: [] };
        this._geometries = [];
        this._linePool = [];
        this._points = null;
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
        for (const object of this.group.children) {
            if (object.isLineSegments2) {
                object.geometry = emptyLineGeometry;
                this._linePool.push(object);
            }
        }
        this.group.clear();
        this._points?.geometry.dispose();
        for (const geometry of this._geometries) geometry.dispose();
        this._geometries.length = 0;
        this._batches.clear();
        for (const list of Object.values(this._dots)) list.length = 0;
        this.signature = null;
    }

    destroy() {
        this.clear();
        this._linePool.length = 0;
        this._points = null;
        this.group.removeFromParent();
    }

    addSegment(from, to, { width, color = 0xffffff, alpha = 1, outline = {}, dashed = false, outlineDashed = false, animated = false } = {}) {
        if (!(width > 0) || !(alpha > 0)) return;
        const thickness = outline.thickness ?? 0;
        const outlineColor = toThreeColor(outline.color, 0x000000).getHex();
        const dash = (flag) => (flag ? (animated ? "animated" : "static") : "");
        const key = `${width}|${alpha}|${thickness}|${outlineColor}|${dash(dashed)}|${dash(outlineDashed)}`;
        let batch = this._batches.get(key);
        if (!batch) {
            batch = { width, alpha, thickness, outlineColor, dash: dash(dashed), outlineDash: dash(outlineDashed), positions: [], colors: [] };
            this._batches.set(key, batch);
        }
        const c = toThreeColor(color);
        batch.positions.push(from.x, from.y, from.z, to.x, to.y, to.z);
        batch.colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }

    addWaypoint(point, { radius, color = 0xffffff, alpha = 1, outline = {} } = {}) {
        if (!(radius > 0) || !(alpha > 0)) return;
        const thickness = outline.thickness ?? 0;
        const c = toThreeColor(color);
        const o = toThreeColor(outline.color, 0x000000);
        const dots = this._dots;
        dots.positions.push(point.x, point.y, point.z);
        dots.sizes.push((radius + thickness) * 2 * RULER_SCALE);
        dots.rings.push(thickness * 2);
        dots.colors.push(c.r, c.g, c.b);
        dots.outlines.push(o.r, o.g, o.b);
        dots.alphas.push(alpha);
    }

    build() {
        for (const batch of this._batches.values()) this._buildBatch(batch);
        this._buildDots();
    }

    _line(geometry, material, renderOrder) {
        const line = this._linePool.pop() ?? inertObject(new LineSegments2(emptyLineGeometry, material));
        line.geometry = geometry;
        line.material = material;
        line.renderOrder = renderOrder;
        this.group.add(line);
        return line;
    }

    _buildBatch({ width, alpha, thickness, outlineColor, dash, outlineDash, positions, colors }) {
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(positions);
        geometry.setColors(colors);
        this._geometries.push(geometry);
        const lineWidth = width * RULER_SCALE;
        const outlineWidth = lineWidth + thickness * 4;
        const layers = [];
        if (thickness > 0) {
            layers.push({ outline: true, xray: true, width: outlineWidth, dash: outlineDash, order: 0 });
            layers.push({ outline: true, xray: false, width: outlineWidth, dash: outlineDash, order: 2 });
        }
        layers.push({ outline: false, xray: true, width: lineWidth, dash, order: 1 });
        layers.push({ outline: false, xray: false, width: lineWidth, dash, order: 3 });
        let measured = false;
        for (const layer of layers) {
            const material = getLineMaterial({ ...layer, alpha, color: outlineColor });
            configureDash(material, layer.outline, thickness);
            const line = this._line(geometry, material, LINE_ORDER + layer.order);
            if (layer.dash && !measured) {
                line.computeLineDistances();
                measured = true;
            }
        }
    }

    _buildDots() {
        const dots = this._dots;
        if (!dots.alphas.length) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(dots.positions, 3));
        geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(dots.sizes, 1));
        geometry.setAttribute("aRing", new THREE.Float32BufferAttribute(dots.rings, 1));
        geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(dots.colors, 3));
        geometry.setAttribute("aOutline", new THREE.Float32BufferAttribute(dots.outlines, 3));
        geometry.setAttribute("aAlpha", new THREE.Float32BufferAttribute(dots.alphas, 1));
        if (!this._points) {
            this._points = inertObject(new THREE.Points(geometry, getDotMaterial()));
            this._points.frustumCulled = false;
            this._points.renderOrder = LINE_ORDER + 4;
            this._points.onBeforeRender = syncDotPixelRatio;
        } else this._points.geometry = geometry;
        this.group.add(this._points);
    }

    tick() {
        tickDashes();
    }
}

const LABEL_SKIP_KEYS = new Set(["waypoint", "action"]);

function sanitizeLabelContext(context, seen = new Set()) {
    seen.add(context);
    for (const [key, value] of Object.entries(context)) {
        if (LABEL_SKIP_KEYS.has(key)) continue;
        if (typeof value === "number") {
            if (Number.isNaN(value)) delete context[key];
            else if (Number.isFinite(value)) context[key] = value.toNearest(0.01);
        } else if (typeof value === "string") {
            if (value.includes("NaN")) delete context[key];
        } else if (value && typeof value === "object" && !seen.has(value) && Object.getPrototypeOf(value) === Object.prototype) {
            sanitizeLabelContext(value, seen);
        }
    }
    return context;
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
            this._htmls = null;
            this._element?.replaceChildren();
            return;
        }
        const htmls = [];
        for (const { context } of entries) {
            htmls.push(await foundry.applications.handlebars.renderTemplate(template, sanitizeLabelContext(context)));
            if (renderId !== this._renderId) return;
        }
        const element = this.element;
        const children = element.children;
        if (this._htmls && children.length === htmls.length && htmls.every((html, i) => html === this._htmls[i])) {
            for (let i = 0; i < children.length; i++) children[i]._anchor3d = entries[i].anchor;
            this.update();
            return;
        }
        const labels = [];
        const kept = [];
        for (let i = 0; i < htmls.length; i++) {
            const label = foundry.utils.parseHTML(htmls[i]);
            if (!(label instanceof HTMLElement)) continue;
            label._anchor3d = entries[i].anchor;
            label.style.setProperty("--ui-scale", 1);
            labels.push(label);
            kept.push(htmls[i]);
        }
        this._htmls = kept.length === htmls.length ? htmls : null;
        element.replaceChildren(...labels);
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
        this._htmls = null;
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
            const outline = this._configureOutline?.() ?? {};
            for (let i = 1; i < waypoints.length; i++) {
                const { width, color = 0xffffff, alpha = 1 } = this._getSegmentStyle(waypoints[i]);
                path3d.addSegment(points[i - 1], points[i], { width, color, alpha, outline });
            }
            for (let i = 0; i < waypoints.length; i++) {
                const { radius, color = 0xffffff, alpha = 1 } = this._getWaypointStyle(waypoints[i]);
                path3d.addWaypoint(points[i], { radius, color, alpha, outline });
            }
            path3d.build();
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
            this._set3DElevation(get3DCursorElevation(), this.path.length);
        }

        _onMouseMove(event) {
            super._onMouseMove(event);
            if (!is3DActive() || !this.active) return;
            this._set3DElevation(get3DCursorElevation(), 1);
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

let rulerRedraw = Promise.resolve();

export function redrawRulers3D() {
    rulerRedraw = rulerRedraw.then(async () => {
        if (!canvas?.ready || canvas.loading || !canvas.controls) return;
        try {
            await canvas.controls.drawRulers();
        } catch (e) {
            console.error("3D Canvas | Failed to redraw rulers", e);
        }
    });
    return rulerRedraw;
}
