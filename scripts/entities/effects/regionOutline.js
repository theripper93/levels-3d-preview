import * as THREE from "three";
import { factor } from "../../main.js";
import { RulerPath3D, RulerLabels3D } from "../../systems/ruler3d.js";
import { getSetting } from "../../settings/settingsConfig.js";

const HOVER_COLOR = 0xffffff;
const OUTLINE_COLOR = 0x000000;
const VOLUME_ALPHA = 0.55;
const MAX_EDGES = 8;
const LABEL_CLASSES = ["ruler-labels", "region-measure-labels"];
export const CENTERED_SHAPES = new Set(["circle", "cone"]);

const activeLabels = new Set();
const fillMaterials = new Map();
let labelCount = 0;

export function updateRegionLabels() {
    for (const labels of activeLabels) labels.update();
}

export function regionFillMaterial(color) {
    const key = new THREE.Color(color).getHex();
    let material = fillMaterials.get(key);
    if (!material) {
        material = new THREE.MeshBasicMaterial({ color: key, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
        material.userData.persistent = true;
        material.userData.noVisionMode = true;
        fillMaterials.set(key, material);
    }
    return material;
}

function toY(elevation) {
    return (elevation * canvas.dimensions.distancePixels) / factor;
}

export function regionExtents(document) {
    if (getSetting("regionsAlwaysFlat")) return { bottom: 0, top: 0, base: 0, flat: true };
    const { bottom, top } = document.elevation;
    const b = Number.isFinite(bottom) ? bottom : Number.isFinite(top) ? top : 0;
    const t = Number.isFinite(top) ? top : b;
    const flat = !(t - b > 1e-3) || !Number.isFinite(bottom) || !Number.isFinite(top);
    const centered = !flat && document.shapes.length > 0 && document.shapes.every((shape) => CENTERED_SHAPES.has(shape.type));
    return { bottom: toY(b), top: toY(t), base: toY(centered ? (b + t) / 2 : b), flat };
}

function* treePolygons(node) {
    for (const child of node?.children ?? []) {
        if (child.polygon) yield child.polygon;
        yield* treePolygons(child);
    }
}

function edgeIndices(count) {
    if (count <= MAX_EDGES * 1.5) return Array.from({ length: count }, (_, i) => i);
    return Array.from({ length: MAX_EDGES }, (_, i) => Math.floor((i * count) / MAX_EDGES));
}

function regionState(object) {
    if (!object || object.destroyed || !object.document) return null;
    const layer = object.layer;
    const preview = !!object.isPreview;
    const placement = layer?._placementContext?.preview === object;
    const visible = object.controlled || object.hover || layer?.highlightObjects || preview;
    if (!visible) return null;
    const { locked, hidden } = object.document;
    const colors = CONFIG.Canvas.dispositionColors;
    const color = object.controlled || preview ? colors.CONTROLLED : locked ? colors.HOSTILE : object.hover ? HOVER_COLOR : colors.INACTIVE;
    const volume = object.controlled || (preview && !placement);
    const handles = object.controlled && !preview && !locked && !!layer?.active && !!ui.controls.tool?.interaction && !!ui.controls.tool?.control;
    const measured = preview || object.controlled || object.hover ? object._getMeasuredShapes?.() ?? [] : [];
    const surface = placement ? game.Levels3DPreview?.interactionManager?._regionPlacement : null;
    const token = placement ? object.document.attachment?.token : null;
    const ground = token ? toY(token.elevation ?? 0) : Number.isFinite(surface?.surface) ? toY(surface.surface + (surface.offset ?? 0)) : null;
    return { color, volume, handles, measured, ground, dashed: !!hidden };
}

export class RegionOutline3D {
    constructor() {
        this.id = `region-measure-3d-${++labelCount}`;
        this.path = new RulerPath3D(this.id);
        this.labels = null;
        this.key = null;
        this.handlePoints = [];
    }

    update(object) {
        const state = regionState(object);
        const key = state ? JSON.stringify({ ...state, measured: state.measured.map((s) => s.toObject()), tool: ui.controls.tool?.name }) : null;
        if (key === this.key) return;
        this.key = key;
        this.path.clear();
        this.handlePoints = [];
        if (!state) return this.clearLabels();
        if (!this.path.attach()) return;
        this.draw(object, state);
    }

    draw(object, { color, volume, handles, measured, ground, dashed }) {
        const document = object.document;
        const scale = canvas.dimensions.uiScale;
        const outline = { thickness: scale, color: OUTLINE_COLOR };
        const extents = regionExtents(document);
        const { bottom, top, flat } = extents;
        const base = ground ?? extents.base;
        const point = (x, y, height) => new THREE.Vector3(x / factor, height, y / factor);
        const line = { width: 2 * scale, color, outline, dashed, outlineDashed: dashed };
        const thin = { width: 1.25 * scale, color, alpha: VOLUME_ALPHA, outline, dashed, outlineDashed: dashed };
        for (const polygon of treePolygons(document.polygonTree)) {
            const pts = polygon.points;
            const count = pts.length / 2;
            if (count < 2) continue;
            const loops = volume && !flat ? [top, ...(base !== bottom ? [bottom] : [])] : [];
            for (let i = 0; i < count; i++) {
                const j = (i + 1) % count;
                this.path.addSegment(point(pts[i * 2], pts[i * 2 + 1], base), point(pts[j * 2], pts[j * 2 + 1], base), line);
                for (const height of loops) this.path.addSegment(point(pts[i * 2], pts[i * 2 + 1], height), point(pts[j * 2], pts[j * 2 + 1], height), thin);
            }
            if (!volume || flat) continue;
            for (const i of edgeIndices(count)) this.path.addSegment(point(pts[i * 2], pts[i * 2 + 1], bottom), point(pts[i * 2], pts[i * 2 + 1], top), thin);
        }
        if (handles) this.drawHandles(document, base, color, outline, scale);
        const entries = this.drawMeasurements(measured, base, color, outline, scale);
        this.path.build();
        this.renderLabels(entries);
    }

    drawHandles(document, height, color, outline, scale) {
        for (const shape of document.shapes) {
            for (const [name, { position, visible }] of Object.entries(shape.controlHandles ?? {})) {
                if (!visible) continue;
                const point = new THREE.Vector3(position.x / factor, height, position.y / factor);
                this.handlePoints.push({ shape: shape._index ?? document.shapes.indexOf(shape), name, point });
                this.path.addWaypoint(point, { radius: (name === "translate" ? 4 : 3.5) * scale, color: name === "translate" ? HOVER_COLOR : color, outline });
            }
        }
    }

    drawMeasurements(shapes, height, color, outline, scale) {
        const entries = [];
        const distance = canvas.dimensions.distance;
        const units = canvas.grid.units;
        const point = (p, lift = 0) => new THREE.Vector3(p.x / factor, height + lift, p.y / factor);
        for (const shape of shapes) {
            this.path.addWaypoint(point(shape.origin), { radius: 3 * scale, color, outline });
            for (const { ray, winding, distance: length, angle } of shape.measuredSegments ?? []) {
                if (winding === 0) this.path.addSegment(point(ray.A), point(ray.B), { width: 1.25 * scale, color, outline, dashed: true });
                if (length < 0.5 * distance - 1e-9) continue;
                const label = (text, at, unit) => entries.push({ anchor: point(ray.project(at)), context: { cssClass: "region-measure", units: unit, uiScale: scale, secret: false, distance: { total: text } } });
                label(length.toNearest(0.01).toLocaleString(game.i18n.lang), 0.5, units);
                if (angle !== undefined && length >= 2 * distance - 1e-9) label(`${angle.toNearest(0.01).toLocaleString(game.i18n.lang)}°`, Math.min(0.25, (2 * canvas.dimensions.size) / Math.max(ray.distance, 1)), "");
            }
        }
        return entries;
    }

    renderLabels(entries) {
        if (!entries.length) return this.clearLabels();
        this.labels ??= new RulerLabels3D(this.id, LABEL_CLASSES);
        activeLabels.add(this.labels);
        this.labels.render(entries, foundry.canvas.interaction.Ruler.WAYPOINT_LABEL_TEMPLATE);
    }

    clearLabels() {
        if (!this.labels) return;
        activeLabels.delete(this.labels);
        this.labels.destroy();
        this.labels = null;
    }

    destroy() {
        this.key = null;
        this.handlePoints = [];
        this.path.destroy();
        this.clearLabels();
    }
}
