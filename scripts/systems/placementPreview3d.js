import * as THREE from "three";
import { factor } from "../main.js";
import { Shape3D } from "../entities/shape3d.js";
import { Region3D } from "../entities/region3d.js";
import { pixelsToUnits, snapped3DPosition, useSnapped, measureDistance, centerElement } from "../helpers/coords3d.js";

const LINE_RENDER_ORDER = 1e20;

function noRaycast() {}

class PreviewLeg {
    constructor(line) {
        this.origin = line.origin.clone();
        this.target = line.target.clone();
        this._distance = line.distance;
        this.group = line.createMeshes(this.origin, this.target);
        line.scene?.add(this.group);
    }

    destroy() {
        this.group.removeFromParent();
        this.group.traverse((o) => o.geometry?.dispose());
    }
}

class DragLine3D {
    constructor() {
        this.lineRadius = game.Levels3DPreview?.CONFIG?.RULER?.RULER_SIZE ?? 0.002;
        this.sphereRadius = this.lineRadius * 2;
        this.color = new THREE.Color(game.user.color.css);
        this.closedPolygonColor = new THREE.Color("#ffffff");
        this.bodyMaterial = new THREE.MeshBasicMaterial({ color: this.color });
        this.coreMaterial = new THREE.MeshBasicMaterial({ color: this.color, depthWrite: false, depthTest: false });
        this.sphereGeometry = new THREE.SphereGeometry(this.sphereRadius, 16, 16);
        this.origin = new THREE.Vector3();
        this.target = new THREE.Vector3();
        this.distance = 0;
        this.group = null;
        this._signature = null;
        this.textElement = document.createElement("div");
        this.textElement.id = "levels3d-ruler-text";
        this.textElement.classList.add("ruler");
        this.textElement.innerHTML = `<span class="distance"></span>`;
        this.textDistance = this.textElement.querySelector(".distance");
        this.textElement.style.display = "none";
        document.body.append(this.textElement);
        this._labelAnchor = new THREE.Vector3();
        this.visible = false;
    }

    get scene() {
        return game.Levels3DPreview?.scene;
    }

    createMeshes(origin, target) {
        const group = new THREE.Group();
        group.userData.ignoreHover = true;
        const add = (geometry, material, renderOrder, position) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.ignoreHover = true;
            mesh.raycast = noRaycast;
            if (renderOrder !== undefined) mesh.renderOrder = renderOrder;
            if (position) mesh.position.copy(position);
            group.add(mesh);
        };
        const curve = new THREE.LineCurve3(origin.clone(), target.clone());
        add(new THREE.TubeGeometry(curve, 1, this.lineRadius, 8), this.bodyMaterial);
        add(new THREE.TubeGeometry(curve, 1, this.lineRadius / 5, 8), this.coreMaterial, LINE_RENDER_ORDER);
        add(this.sphereGeometry.clone(), this.coreMaterial, LINE_RENDER_ORDER - 1, origin);
        add(this.sphereGeometry.clone(), this.coreMaterial, LINE_RENDER_ORDER - 1, target);
        return group;
    }

    update(origin, target, { distanceOffset = 0, loopStart = null, force = false } = {}) {
        this.visible = true;
        this.textElement.style.display = "unset";
        const signature = [origin.x, origin.y, origin.z, target.x, target.y, target.z, distanceOffset, loopStart?.x, loopStart?.y, loopStart?.z].join("|");
        this._labelAnchor.copy(target);
        this._labelAnchor.y += 0.05;
        if (!force && signature === this._signature && this.group?.parent) return false;
        this._signature = signature;
        this.origin.copy(origin);
        this.target.copy(target);
        this._disposeGroup();
        this.distance = parseFloat(measureDistance(this.origin, this.target)) || 0;
        const closed = loopStart && loopStart.distanceTo(target) < 0.01;
        const color = closed ? this.closedPolygonColor : this.color;
        this.bodyMaterial.color.copy(color);
        this.coreMaterial.color.copy(color);
        this.group = this.createMeshes(this.origin, this.target);
        this.scene?.add(this.group);
        this.textDistance.innerHTML = `${(this.distance + distanceOffset).toFixed(1)} ${canvas.scene.grid.units}.`;
        this.updateLabel();
        return true;
    }

    updateLabel() {
        if (!this.visible) return;
        centerElement(this.textElement, this._labelAnchor);
    }

    _disposeGroup() {
        if (!this.group) return;
        this.group.removeFromParent();
        this.group.traverse((o) => o.geometry?.dispose());
        this.group = null;
    }

    hide() {
        this.visible = false;
        this._signature = null;
        this._disposeGroup();
        this.textElement.style.display = "none";
    }

    destroy() {
        this.hide();
        this.textElement.remove();
        this.bodyMaterial.dispose();
        this.coreMaterial.dispose();
        this.sphereGeometry.dispose();
    }
}

export class PlacementPreview3D {
    constructor(parent, _legacyRuler) {
        this._parent = parent;
        this._object = null;
        this._origin = null;
        this.segments = [];
        this.distanceOffset = 0;
        this.loopStart = null;
        this.template = null;
        this._templatePreviewData = null;
        this._shapePreviewData = null;
        this._line = new DragLine3D();
    }

    get allowedRulerDrag() {
        return game.Levels3DPreview.interactionManager.allowedRulerDrag;
    }

    get active() {
        return !!this._object;
    }

    get object() {
        return this._object;
    }

    set object(value) {
        if (!value) {
            this._object = null;
            this._line.hide();
            this.shape?.destroy();
        } else {
            this.clearSegments();
            const target = value.userData.isHitbox ? value.parent : value;
            this._object = target;
            this.origin = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
        }
    }

    get origin() {
        return this._origin;
    }

    set origin(position) {
        if (!position) {
            this._origin = position;
            return;
        }
        this._origin = useSnapped() ? snapped3DPosition(position) : position;
        if (this._object) this.update(true);
    }

    getTargetPos() {
        if (!this._object) return null;
        return useSnapped() ? snapped3DPosition(this._object.position) : this._object.position.clone();
    }

    update(force = false) {
        if (!this._object || !this._origin) return;
        const target = this.getTargetPos();
        const rebuilt = this._line.update(this._origin, target, { distanceOffset: this.distanceOffset, loopStart: this.loopStart, force });
        if (rebuilt) this.drawShape();
    }

    updateLabels() {
        if (!this._object) return;
        this._line.updateLabel();
    }

    get shape() {
        return this._shape;
    }

    set shape(value) {
        if (this._shape) {
            this._lastShape?.destroy();
            this._lastShape = this._shape;
        }
        this._shape = value;
    }

    drawShape() {
        if (!this._object || !this.origin) return;
        if (ui.controls.tool.name === "select" || ui.controls.tool.name === "tile3dPolygon" || !this.allowedRulerDrag.some((a) => a === canvas.activeLayer.options.objectClass.embeddedName)) return;
        if (this.shape?.isPreview) return;
        if (this.allowedRulerDrag.some((a) => a === this._object?.userData?.entity3D?.placeable?.document?.documentName)) return;
        const color = this.shape?.color;
        this.shape?.destroy();
        const pos = useSnapped() ? snapped3DPosition(this._object.position) : this._object.position;
        const selectedRegion = canvas.regions.controlled[0];
        const tool = ui.controls?.tool?.name ?? "rectangle";
        const hole = ui.controls?.tools?.hole?.active;
        const shape = Shape3D.create({
            shape: null,
            hole: hole,
            color: color,
            type: Shape3D.getShapeFromTool(tool),
            material: Shape3D.getMaterialFromTool(tool, hole),
            origin: this.origin,
            destination: pos,
            segments: this.segments,
            extrude: !!selectedRegion,
            tool: tool,
            region: selectedRegion?.document,
            height: game.Levels3DPreview.CONFIG.UI.windows.RoomBuilder?.height,
        });
        if (!shape) return;
        shape.addToScene();
        this.shape = shape;
    }

    placeShape() {
        if (!this.shape) return;
        const data = Region3D.fromPreview(this.shape);
        if (this.segments.length) this.clearSegments();
        if (this._shapePreviewData) this._shapePreviewData.resolve(data);
        this._shapePromiseResolve = null;
        this.shape = null;
    }

    addSegment() {
        if (!this._object || !this._origin) return;
        this._line.update(this._origin, this.getTargetPos(), { distanceOffset: this.distanceOffset, loopStart: this.loopStart });
        const segment = new PreviewLeg(this._line);
        this.segments.push(segment);
        this.distanceOffset += segment._distance;
        this.loopStart = this.segments[0].origin;
        this.origin = segment.target.clone();
    }

    removeSegment() {
        if (!this._object) return false;
        if (!this.segments.length) {
            this._parent.interactionManager.cancelDrag(true);
            return true;
        }
        const segment = this.segments.pop();
        this.distanceOffset -= segment._distance;
        this.loopStart = this.segments[0]?.origin ?? null;
        this.origin = segment.origin.clone();
        segment.destroy();
        return true;
    }

    clearSegments() {
        this.segments.forEach((s) => s.destroy());
        this.segments = [];
        this.distanceOffset = 0;
        this.loopStart = null;
    }

    cancel() {
        this.template = undefined;
        if (this._templatePreviewData) {
            this._templatePreviewData.resolve(false);
            this._templatePreviewData = null;
        }
    }

    async createTile() {
        const points = this.segments.map((s) => s.origin);
        const lastSegment = this.segments[this.segments.length - 1];
        const lastPoint = lastSegment.target;
        points.push(lastPoint);
        const isClosed = points[0].distanceTo(points[points.length - 1]) < 0.01;
        const minX = Math.min(...points.map((p) => p.x));
        const maxX = Math.max(...points.map((p) => p.x));
        const minY = Math.min(...points.map((p) => p.z));
        const maxY = Math.max(...points.map((p) => p.z));
        const minElevation = Math.min(...points.map((p) => p.y));
        const maxElevation = Math.max(...points.map((p) => p.y));

        const depth = parseInt((maxElevation - minElevation) * factor);
        const width = parseInt((maxX - minX) * factor);
        const height = parseInt((maxY - minY) * factor);
        const bottom = pixelsToUnits(minElevation);
        const polygonPoints = [];
        for (const point of points) {
            polygonPoints.push(parseInt((point.x - minX) * factor), parseInt((point.z - minY) * factor));
        }
        isClosed && polygonPoints.push(polygonPoints[0], polygonPoints[1]);
        const boundWidth = Math.max(width, 10);
        const boundHeight = Math.max(height, 10);
        const tileData = {
            width: boundWidth,
            height: boundHeight,
            x: minX * factor + boundWidth / 2,
            y: minY * factor + boundHeight / 2,
            elevation: bottom,
            texture: {
                src: "modules/levels-3d-preview/assets/blank.webp",
            },
            flags: {
                "levels-3d-preview": {
                    depth: Math.max(depth, 50),
                    dynaMesh: isClosed ? "polygonbevel" : "polygonbevelsolidify",
                    model3d: isClosed ? polygonPoints.join(",") : "10#" + polygonPoints.join(","),
                    fromPolygonTool: true,
                    autoGround: true,
                },
            },
        };
        this.clearSegments();
        const res = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
        return res[0];
    }
}
