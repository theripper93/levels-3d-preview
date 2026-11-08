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
    const centerPosition = position3dtoScreen(position);
    const elementWidth = element.offsetWidth;
    const elementHeight = ontop ? element.offsetHeight * 2 : element.offsetHeight;
    element.style.left = `${centerPosition.x - elementWidth / 2}px`;
    element.style.top = `${centerPosition.y - elementHeight / 2}px`;
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

export function measureMinTokenDistance(origin, target) {
    const originLos = origin.losHeight ?? origin.elevation;
    const targetLos = target.losHeight ?? target.elevation;
    origin = origin.document;
    target = target.document;
    const scene = origin.parent;
    const cellSize = scene.dimensions.size;
    const sizeOffsetOrigin = new THREE.Vector3(
        Math.min(origin.width * cellSize, cellSize) / 2,
        Math.min(originLos * scene.dimensions.distancePixels, cellSize) / 2,
        Math.min(origin.height * cellSize, cellSize) / 2
    );
    const sizeOffsetTarget = new THREE.Vector3(
        Math.min(target.width * cellSize, cellSize) / 2,
        Math.min(targetLos * scene.dimensions.distancePixels, cellSize) / 2,
        Math.min(target.height * cellSize, cellSize) / 2
    );
    const originMin = new THREE.Vector3(
        origin.x + sizeOffsetOrigin.x,
        origin.elevation * scene.dimensions.distancePixels + sizeOffsetOrigin.y,
        origin.y + sizeOffsetOrigin.z
    );
    const originMax = new THREE.Vector3(
        origin.x + origin.width * cellSize - sizeOffsetOrigin.x,
        originLos * scene.dimensions.distancePixels - sizeOffsetOrigin.y,
        origin.y + origin.height * cellSize - sizeOffsetOrigin.z
    );
    const targetMin = new THREE.Vector3(
        target.x + sizeOffsetTarget.x,
        target.elevation * scene.dimensions.distancePixels + sizeOffsetTarget.y,
        target.y + sizeOffsetTarget.z
    );
    const targetMax = new THREE.Vector3(
        target.x + target.width * cellSize - sizeOffsetTarget.x,
        targetLos * scene.dimensions.distancePixels - sizeOffsetTarget.y,
        target.y + target.height * cellSize - sizeOffsetTarget.z
    );

    const dx = Math.max(0, Math.max(originMin.x, targetMin.x) - Math.min(originMax.x, targetMax.x));
    const dy = Math.max(0, Math.max(originMin.y, targetMin.y) - Math.min(originMax.y, targetMax.y));
    const dz = Math.max(0, Math.max(originMin.z, targetMin.z) - Math.min(originMax.z, targetMax.z));

    return Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2) / scene.dimensions.distancePixels;
}
