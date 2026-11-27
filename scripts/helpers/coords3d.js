import * as THREE from "three";
import { factor } from "../main.js";

export const RULER_TOKEN_OFFSET = 0.05;

export function position3dtoScreen(position) {
    const camera = game.Levels3DPreview.camera;
    const vector = new THREE.Vector3(position.x, position.y, position.z);
    const widthHalf = (game.Levels3DPreview.renderer.getContext().canvas.width * 0.5) / game.Levels3DPreview.resolutionMulti,
        heightHalf = (game.Levels3DPreview.renderer.getContext().canvas.height * 0.5) / game.Levels3DPreview.resolutionMulti;
    vector.project(camera);
    vector.x = vector.x * widthHalf + widthHalf;
    vector.y = -(vector.y * heightHalf) + heightHalf;
    return vector;
}

export function centerElement(element, position, ontop = false) {
    if (!element) return;
    element = element.jquery ? element[0] : element;
    let cachedFontSize = element.dataset.cachedSize;
    if (!cachedFontSize) {
        cachedFontSize = parseFloat(window.getComputedStyle(element, null).getPropertyValue("font-size"));
        element.dataset.cachedSize = cachedFontSize;
    }

    const dist = game.Levels3DPreview.camera.position.distanceTo(position) / (canvas.grid.size / 100);
    const scale = Math.max(0.5, 1.2 / dist) / (game.Levels3DPreview.resolutionMulti);
    if (element.id == "levels3d-ruler-text") {
        element.style.fontSize = `${cachedFontSize * scale}px`;
    } else {
        element.style.transform = `scale(${scale})`;
    }
    const anchor = ontop ? "-50% -100%" : "-50% -50%";
    if (element.dataset.l3dAnchor !== anchor) {
        element.style.translate = anchor;
        element.dataset.l3dAnchor = anchor;
    }
    const centerPosition = position3dtoScreen(position);
    element.style.left = `${centerPosition.x}px`;
    element.style.top = `${centerPosition.y}px`;
}

export function posCanvasTo3d(position) {
    return new THREE.Vector3(position.x / factor, (position.z * canvas.scene.dimensions.size) / (canvas.scene.dimensions.distance * factor), position.y / factor);
}

export function unitsToPixels(units) {
    return (units * canvas.scene.dimensions.size) / (canvas.scene.dimensions.distance * factor);
}

export function pixelsToUnits(pixels) {
    return (pixels * canvas.scene.dimensions.distance * factor) / canvas.scene.dimensions.size;
}

export function pos3DToCanvas(position) {
    const vector = new THREE.Vector3(position.x * factor, position.z * factor, ((position.y * factor) / canvas.scene.dimensions.size) * canvas.scene.dimensions.distance);
    vector.elevation = vector.z;
    return vector;
}

export function useSnapped() {
    const isGrid = canvas.scene.grid.type ? true : false;
    const isShift = game.keyboard.downKeys.has("ShiftLeft") || game.keyboard.downKeys.has("ShiftRight");
    if (!isGrid) return false;
    if (isGrid && !isShift) return true;
    return false;
}

export function roundToMultiple(number, multiple) {
    return Math.round(number / multiple) * multiple;
}

export function snapped3DPosition(position, isToken = false) {
    const canvasPosition = pos3DToCanvas(position);
    let snappedCenterPos;
    if (isToken) {
        snappedCenterPos = canvas.grid.getSnappedPoint({ x: canvasPosition.x - isToken.w / 2, y: canvasPosition.y - isToken.h / 2 }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER, token: isToken });
        snappedCenterPos.x += isToken.w / 2;
        snappedCenterPos.y += isToken.h / 2;
    } else {
        snappedCenterPos = canvas.grid.getSnappedPoint({ x: canvasPosition.x, y: canvasPosition.y }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });
    }

    const snappedPos = {
        x: snappedCenterPos.x,
        y: snappedCenterPos.y,
        z: canvasPosition.z,
    };
    return posCanvasTo3d(snappedPos);
}

export function measureDistance(position1, position2) {
    const pos1Canvas = pos3DToCanvas(position1);
    const pos2Canvas = pos3DToCanvas(position2);
    const d = canvas.grid.measurePath(
        [
            {
                x: Math.round(pos1Canvas.x),
                y: Math.round(pos1Canvas.y),
                elevation: pos1Canvas.z,
            },
            {
                x: Math.round(pos2Canvas.x),
                y: Math.round(pos2Canvas.y),
                elevation: pos2Canvas.z,
            },
        ],
        { gridSpaces: true },
    ).distance;
    return d;
}

function tokenRangeBox(token3d) {
    const los = token3d.losHeight ?? token3d.elevation;
    const document = token3d.document;
    const { size, distancePixels } = document.parent.dimensions;
    const offsetX = Math.min(document.width * size, size) / 2;
    const offsetY = Math.min(los * distancePixels, size) / 2;
    const offsetZ = Math.min(document.height * size, size) / 2;
    return {
        min: new THREE.Vector3(document.x + offsetX, document.elevation * distancePixels + offsetY, document.y + offsetZ),
        max: new THREE.Vector3(document.x + document.width * size - offsetX, los * distancePixels - offsetY, document.y + document.height * size - offsetZ),
    };
}

function nearestOnAxis(a, b, axis) {
    if (a.max[axis] < b.min[axis]) return [a.max[axis], b.min[axis]];
    if (b.max[axis] < a.min[axis]) return [a.min[axis], b.max[axis]];
    const shared = (Math.max(a.min[axis], b.min[axis]) + Math.min(a.max[axis], b.max[axis])) / 2;
    return [shared, shared];
}

export function nearestTokenPoints(origin, target) {
    const a = tokenRangeBox(origin);
    const b = tokenRangeBox(target);
    const [ax, bx] = nearestOnAxis(a, b, "x");
    const [ay, by] = nearestOnAxis(a, b, "y");
    const [az, bz] = nearestOnAxis(a, b, "z");
    const distancePixels = origin.document.parent.dimensions.distancePixels;
    return [
        { x: ax, y: az, elevation: ay / distancePixels },
        { x: bx, y: bz, elevation: by / distancePixels },
    ];
}

export function measureTokenRange(origin, target) {
    return canvas.grid.measurePath(nearestTokenPoints(origin, target)).distance;
}

export function measureMinTokenDistance(origin, target) {
    const [a, b] = nearestTokenPoints(origin, target);
    const distancePixels = origin.document.parent.dimensions.distancePixels;
    return Math.hypot((a.x - b.x) / distancePixels, (a.y - b.y) / distancePixels, a.elevation - b.elevation);
}
