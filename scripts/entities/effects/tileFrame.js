import * as THREE from "three";
import { RulerPath3D } from "../../systems/ruler3d.js";
import { pos3DToCanvas, posCanvasTo3d } from "../../helpers/coords3d.js";
import { gridUnit } from "./markerDecals.js";

export const FRAME_STATE = { hover: 1, controlled: 2, locked: 4, hidden: 8, drag: 16 };

const HOVER_COLOR = 0xe2e2e2;
const GROUND_INTERVAL_MS = 60;
const MIN_GAP_CELLS = 0.2;
const EDGES = [0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7];
const BOTTOM = [0, 1, 3, 2];
const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const footprint = Array.from({ length: 4 }, () => new THREE.Vector3());
const bottomCenter = new THREE.Vector3();
const meshPosition = new THREE.Vector3();
const offset = new THREE.Vector3();
const rayOrigin = new THREE.Vector3();
const rayTarget = new THREE.Vector3();
const groundPoint = new THREE.Vector3();

export function tileSnapActive() {
    return !!canvas.scene.grid.type && game.keyboard.isModifierActive("Shift");
}

function frameColor(state) {
    const colors = CONFIG.Canvas.dispositionColors;
    if (state & FRAME_STATE.locked) return colors.HOSTILE;
    return state & FRAME_STATE.controlled ? colors.CONTROLLED : HOVER_COLOR;
}

function isWithin(object, root) {
    for (let node = object; node; node = node.parent) if (node === root) return true;
    return false;
}

export function tileFrameState(tile3d) {
    const tile = tile3d.tile;
    if (!tile3d.mesh?.visible || !tile.layer?.active || tile.isPreview) return 0;
    let state = 0;
    if (tile.controlled) state = FRAME_STATE.controlled;
    else if (tile.hover || tile.layer.highlightObjects) state = FRAME_STATE.hover;
    if (!state) return 0;
    const document = tile.document;
    if (document.locked) state |= FRAME_STATE.locked;
    if (document.hidden) state |= FRAME_STATE.hidden;
    const parent = tile3d._parent;
    if (tile3d.mesh.parent === parent.controlledGroup && (parent.interactionManager?.draggable === parent.controlledGroup || parent.transformControls?.dragging)) state |= FRAME_STATE.drag;
    return state;
}

export class TileFrame {
    constructor(tile3d) {
        this.tile3d = tile3d;
        const id = tile3d.tile.id;
        this.frame = new RulerPath3D(`tile-frame-${id}`);
        this.frame.group.matrixAutoUpdate = false;
        this.ground = new RulerPath3D(`tile-ground-${id}`);
        this.state = 0;
        this._box = null;
        this._groundKey = null;
        this._groundTime = 0;
    }

    update(state) {
        const box = this.tile3d.controlledBox;
        if (!state || !box?.geometry?.boundingBox) return this.hide();
        if (state !== this.state || box !== this._box || !this.frame.group.parent) this.build(state, box);
        this.sync();
        this.updateGround();
    }

    build(state, box) {
        this.state = state;
        this._box = box;
        box.updateMatrix();
        const { min, max } = box.geometry.boundingBox;
        for (let i = 0; i < 8; i++) corners[i].set(i & 1 ? max.x : min.x, i & 4 ? max.y : min.y, i & 2 ? max.z : min.z);
        const scale = canvas.dimensions.uiScale;
        const controlled = state & FRAME_STATE.controlled;
        const dashed = !!(state & FRAME_STATE.hidden);
        const style = {
            width: (controlled ? 2 : 1.5) * scale,
            color: frameColor(state),
            alpha: controlled ? 1 : 0.85,
            outline: { thickness: scale, color: 0x000000 },
            dashed,
            outlineDashed: dashed,
        };
        const frame = this.frame;
        frame.clear();
        for (let i = 0; i < EDGES.length; i += 2) frame.addSegment(corners[EDGES[i]], corners[EDGES[i + 1]], style);
        frame.build();
        frame.attach();
        this._groundKey = null;
    }

    sync() {
        const group = this.frame.group;
        group.matrix.multiplyMatrices(this.tile3d.mesh.matrixWorld, this._box.matrix);
        group.matrixWorldNeedsUpdate = true;
    }

    updateGround() {
        const state = this.state;
        if (!(state & FRAME_STATE.controlled) && !this.tile3d.tile.hover) return this.clearGround();
        const dragging = state & FRAME_STATE.drag;
        const mesh = this.tile3d.mesh;
        meshPosition.setFromMatrixPosition(mesh.matrixWorld);
        offset.set(0, 0, 0);
        if (dragging && tileSnapActive() &&this.tile3d._parent.interactionManager?.draggable) {
            const position = pos3DToCanvas(meshPosition);
            const snapped = posCanvasTo3d({ ...canvas.tiles.getSnappedPoint(position), z: position.z });
            offset.set(snapped.x - meshPosition.x, 0, snapped.z - meshPosition.z);
        }
        if (!this.groundChanged()) return;
        const now = performance.now();
        if (now - this._groundTime < GROUND_INTERVAL_MS) return;
        this._groundTime = now;
        this.storeGroundKey();
        this.buildGround(dragging);
    }

    groundChanged() {
        const key = this._groundKey;
        if (!key || key[16] !== this.state || key[17] !== offset.x || key[18] !== offset.z) return true;
        const e = this.frame.group.matrix.elements;
        for (let i = 0; i < 16; i++) if (key[i] !== e[i]) return true;
        return false;
    }

    storeGroundKey() {
        const key = (this._groundKey ||= new Float64Array(19));
        key.set(this.frame.group.matrix.elements);
        key[16] = this.state;
        key[17] = offset.x;
        key[18] = offset.z;
    }

    buildGround(dragging) {
        const ground = this.ground;
        ground.clear();
        const matrix = this.frame.group.matrix;
        const { min, max } = this._box.geometry.boundingBox;
        bottomCenter.set((min.x + max.x) / 2, min.y, (min.z + max.z) / 2).applyMatrix4(matrix).add(offset);
        const groundY = this.groundBelow(bottomCenter);
        if (groundY === null) return;
        const gap = bottomCenter.y - groundY;
        const unit = gridUnit();
        const elevated = gap > unit * MIN_GAP_CELLS;
        if (!dragging && !elevated) return;
        const scale = canvas.dimensions.uiScale;
        const color = frameColor(this.state);
        const outline = { thickness: scale, color: 0x000000 };
        const lift = unit * 0.01;
        for (let i = 0; i < 4; i++) {
            const index = BOTTOM[i];
            footprint[i].set(index & 1 ? max.x : min.x, min.y, index & 2 ? max.z : min.z).applyMatrix4(matrix).add(offset);
            footprint[i].y = groundY + lift;
        }
        const style = { width: 1.5 * scale, color, alpha: 0.9, outline, dashed: true, outlineDashed: true };
        for (let i = 0; i < 4; i++) ground.addSegment(footprint[i], footprint[(i + 1) % 4], style);
        groundPoint.set(bottomCenter.x, groundY + lift, bottomCenter.z);
        if (elevated) {
            ground.addSegment(groundPoint, bottomCenter, { ...style, alpha: 0.75 });
            ground.addWaypoint(bottomCenter, { radius: 2.5 * scale, color, outline });
        }
        ground.addWaypoint(groundPoint, { radius: 3 * scale, color, outline });
        ground.build();
        ground.attach();
    }

    groundBelow(point) {
        const interactionManager = this.tile3d._parent.interactionManager;
        if (!interactionManager) return null;
        const unit = gridUnit();
        rayOrigin.set(point.x, point.y - unit * 0.01, point.z);
        rayTarget.set(point.x, point.y - unit * 1000, point.z);
        const hits = interactionManager.computeSightCollisionFrom3DPositions(rayOrigin, rayTarget, "move", false, true, false, true);
        const mesh = this.tile3d.mesh;
        const hit = hits ? hits.find((h) => !isWithin(h.object, mesh)) : null;
        return hit ? hit.point.y : 0;
    }

    clearGround() {
        this._groundKey = null;
        if (this.ground.group.children.length) this.ground.clear();
    }

    hide() {
        if (!this.state && !this.frame.group.parent) return;
        this.state = 0;
        this._groundKey = null;
        this.frame.clear();
        this.frame.group.removeFromParent();
        this.ground.clear();
        this.ground.group.removeFromParent();
    }

    destroy() {
        this.frame.destroy();
        this.ground.destroy();
    }
}
