import * as THREE from "three";
import { factor } from "../main.js";
import { DrawingInput3D, levelForElevation } from "./drawingInput3d.js";
import { position3dtoScreen, pos3DToCanvas } from "../helpers/coords3d.js";
import { Region3D } from "../entities/region3d.js";
import { regionExtents, CENTERED_SHAPES } from "../entities/effects/regionOutline.js";

const HANDLE_PICK_PX = 12;

function centeredHeight(shape) {
    const pixels = canvas.dimensions.distancePixels;
    if (shape.type === "circle") return (2 * shape.radius) / pixels;
    const half = Math.toRadians(shape.angle ?? 0) / 2;
    const spread = shape.curvature === "flat" ? Math.tan(half) : Math.sin(half);
    return (2 * shape.radius * Math.min(spread, 1)) / pixels;
}

function baseElevation(elevation, surface) {
    const { bottom, top } = elevation;
    const above = !Number.isFinite(bottom) || surface >= bottom - 0.01;
    const below = !Number.isFinite(top) || surface <= top + 0.01;
    if (above && below) return { bottom, top, level: null };
    const level = levelForElevation(surface);
    const range = level?.elevation;
    if (range && surface >= range.bottom - 0.01 && (!Number.isFinite(range.top) || surface <= range.top + 0.01)) return { bottom: range.bottom, top: range.top, level };
    const height = Number.isFinite(bottom) && Number.isFinite(top) ? top - bottom : canvas.dimensions.distance;
    return { bottom: surface, top: surface + height, level };
}

export class RegionInput3D extends DrawingInput3D {
    get layer() {
        return canvas.regions;
    }

    get active() {
        const interactionManager = this.interactionManager;
        return !!this._parent._active && !!canvas.ready && !!canvas.regions?.active && !canvas.regions._placementContext && !interactionManager?._tokenDrag && !interactionManager?._freeRuler;
    }

    refresh() {}

    surface(event) {
        this.picked = event.type === "pointerdown" && !this.layer._isCreationToolActive() ? this.pickHandle(event) : null;
        if (this.picked) return { point3d: this.picked.point.clone(), position: pos3DToCanvas(this.picked.point) };
        const hit = this.interactionManager.findMouseIntersect(event);
        if (!hit?.point) return null;
        return { point3d: hit.point.clone(), position: pos3DToCanvas(hit.point), object: hit.object };
    }

    hitDrawing(hit, event) {
        this.handle = null;
        if (this.layer._isCreationToolActive()) return null;
        const picked = event && this.picked;
        if (picked) {
            this.handle = picked.handle;
            return picked.region;
        }
        const entity = hit?.object?.userData?.entity3D;
        return entity instanceof Region3D ? entity.placeable : null;
    }

    eventTarget(region, mim) {
        if (this.handle && region?.mouseInteractionManager === mim) return this.handle;
        return mim.object;
    }

    pickHandle(event) {
        let best = null;
        for (const region of this.layer.controlled) {
            const points = Region3D.regions.get(region.document)?.outline?.handlePoints;
            if (!points?.length) continue;
            for (const { shape, name, point } of points) {
                const screen = position3dtoScreen(point);
                const distance = Math.hypot(screen.x - event.clientX, screen.y - event.clientY);
                if (distance > HANDLE_PICK_PX || (best && distance >= best.distance)) continue;
                const handle = this.findHandle(region, shape, name);
                if (handle) best = { region, handle, distance, point };
            }
        }
        return best;
    }

    findHandle(region, index, name) {
        const container = region.children.find((child) => child.children?.length && child.children.every((c) => c.handles && c.shape));
        return container?.children[index]?.handles.children.find((handle) => handle.name === name) ?? null;
    }

    elevatePreview() {
        const session = this.session;
        const mim = canvas.mouseInteractionManager;
        const preview = mim.interactionData?.preview;
        if (!session || session.mim !== mim || !preview || preview.destroyed || preview._original || !preview.document) return;
        const document = preview.document;
        preview._l3dBase ??= baseElevation(document._source.elevation, session.elevation);
        let { bottom, top, level } = preview._l3dBase;
        const shape = document.shapes.at(-1);
        if (shape && CENTERED_SHAPES.has(shape.type) && document.shapes.length === 1) {
            const half = centeredHeight(shape) / 2;
            bottom = Math.round((session.elevation - half) * 100) / 100;
            top = Math.round((session.elevation + half) * 100) / 100;
        }
        const current = document._source.elevation;
        if (current.bottom === bottom && current.top === top && !level) return;
        const changes = { elevation: { bottom, top } };
        if (level) changes.levels = [level.id];
        document.updateSource(changes);
        preview._l3dBase.level = null;
        preview.renderFlags.set({ refreshShapes: true });
    }

    selectInBox(rect, additive) {
        const layer = this.layer;
        const selected = layer.placeables.filter((region) => region.visible && region._canControl(game.user) && this.inBox(region, rect));
        if (!additive) layer.releaseAll();
        for (const region of selected) region.control({ releaseOthers: false });
    }

    inBox(region, rect) {
        const { bottom } = regionExtents(region.document);
        const { x, y, width, height } = region.bounds;
        const center = region.center;
        const points = [center.x, center.y, x, y, x + width, y, x, y + height, x + width, y + height];
        for (let i = 0; i < points.length; i += 2) {
            const screen = position3dtoScreen(new THREE.Vector3(points[i] / factor, bottom, points[i + 1] / factor));
            if (screen.z <= 1 && rect.contains(screen.x, screen.y)) return true;
        }
        return false;
    }
}
