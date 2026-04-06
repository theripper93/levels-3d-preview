import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { Shape3D } from "../entities/shape3d.js";

export class Ruler3D {
    constructor(parent) {
        this._parent = parent;
        this._distanceOffset = 0;
        this.isDragRouler = game.modules.get("drag-ruler")?.active;
        this.isHoverDistance = game.modules.get("hover-distance")?.active;
        this.useRaycastRuler = game.settings.get("levels-3d-preview", "useRaycastRuler");
        this._enableRuler = canvas.scene.getFlag("levels-3d-preview", "enableRuler") ?? true;
        this.color = new THREE.Color(game.user.color.css);
        this.closedPolygonColor = new THREE.Color("#ffffff");
        this.colorCache = {};
        const hsl = {};
        this.segments = [];
        this.color.getHSL(hsl);
        this.lineColor = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l - 0.2);
        this.origin = new THREE.Vector3(0, 0, 0);
        this.target = new THREE.Vector3(0, 0, 0);
        this.lineRadius = this._parent.CONFIG.RULER.RULER_SIZE;
        this.sphereRadius = this.lineRadius * 2;
        this.roulerLineMaterial = new THREE.MeshBasicMaterial({
            depthWrite: false,
            depthTest: false,
        });
        this.dragRingMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
        });
        this.init();
    }

    get allowedRulerDrag() {
        return game.Levels3DPreview.interactionManager.allowedRulerDrag;
    }

    get enableRuler() {
        return this._enableRuler || !this.isToken;
    }

    drawShape() {
        if (ui.controls.tool.name === "select" || ui.controls.tool.name === "tile3dPolygon" || !this.allowedRulerDrag.some((a) => a === canvas.activeLayer.options.objectClass.embeddedName)) return;
        if (this.shape?.isPreview) return;
        if (this.allowedRulerDrag.some((a) => a === this._object?.userData?.entity3D?.placeable?.document?.documentName)) return;
        const color = this.shape?.color;
        this.shape?.destroy();
        const pos = Ruler3D.useSnapped() ? Ruler3D.snapped3DPosition(this._object.position) : this._object.position;
        const selectedRegion = canvas.regions.controlled[0];
        this.height = null;
        if (selectedRegion) {
            const top = Number.isFinite(selectedRegion.document.elevation.top) ?
                selectedRegion.document.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
            const bottom = Number.isFinite(selectedRegion.document.elevation.bottom) ?
                selectedRegion.document.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
            this.height = this.top !== this.bottom ? this.top - this.bottom : 0.001;
        }
        const shape = Shape3D.create({
            shape: null,
            hole: ui.controls?.tools?.hole?.active,
            color: color,
            type: ui.controls?.tool?.name ?? "rectangle",
            origin: this._origin,
            destination: pos,
            extrude: !!canvas.regions.controlled[0],
            regionHeight: this.height,
        });
        if (!shape) return; 
        shape.addToScene();
        this.shape = shape;
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

    placeShape() {
        if (!this.shape) return;
        const data = this.shape.fromPreview(this._shapePreviewData?.create ?? true);
        if (this._shapePreviewData) this._shapePreviewData.resolve(data);
        this._shapePromiseResolve = null;
        this.shape = null;
    }

    init() {
        this.sphere1 = new THREE.Mesh(new THREE.SphereGeometry(this.sphereRadius,
            16, 16), this.roulerLineMaterial);
        this.sphere1.renderOrder = 1e20 - 1;
        this.sphere2 = this.sphere1.clone();
        const tGeo1 = new THREE.TorusGeometry((canvas.grid.size / factor) * 0.5 * Math.SQRT2, this.lineRadius / 10, 8, 32);
        tGeo1.rotateX(Math.PI / 2);
        const tGeo2 = new THREE.TorusGeometry((canvas.grid.size / factor) * 0.5 * Math.SQRT2, this.lineRadius / 2, 8, 32);
        tGeo2.rotateX(Math.PI / 2);
        this.dragRing = new THREE.Group();
        const ring1 = new THREE.Mesh(tGeo1, this.roulerLineMaterial);
        ring1.renderOrder = 1e20 - 1;
        const ring2 = new THREE.Mesh(tGeo2, this.dragRingMaterial);
        this.dragRing.add(ring1);
        this.dragRing.add(ring2);
        this.textElement = document.createElement("div");
        this.textElement.id = "levels3d-ruler-text";
        this.textElement.classList.add("ruler");
        this.textElement.innerHTML = `<span class="distance"></span>`;
        this.textDistance = this.textElement.querySelector(".distance");
        this.textElement.style.display = "none";
        document.body.append(this.textElement);
        if (!this.enableRuler) {
            this.sphere1.visible = false;
            this.sphere2.visible = false;
            this.dragRing.visible = false;
        }
    }

    addMarkers() {
        this._parent.scene.add(this.sphere1);
        this._parent.scene.add(this.sphere2);
        this._parent.scene.add(this.dragRing);
    }

    async removeMarkers() {
        this._parent.scene.remove(this.sphere1);
        this._parent.scene.remove(this.sphere2);
        this._parent.scene.remove(this.dragRing);
    }

    set object(value) {
        this._points = null;
        if (!value) {
            //this.clearSegments();
            const isToken = this.isToken;
            this._object = null;
            this.shape?.destroy();
            this.textElement.style.display = "none";
            this._parent.scene.remove(this.line);
            this.removeMarkers(isToken);
        } else {
            this._enableRuler = canvas.scene.getFlag("levels-3d-preview", "enableRuler") ?? true;
            this.clearSegments();
            this.addMarkers();
            const target = value.userData.isHitbox ? value.parent : value;
            this._object = target;
            this.origin = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
            if (this.enableRuler) this.textElement.style.display = "unset";
            const isToken = this._object?.userData?.entity3D?.token;
            if (isToken) {
                this.dragRing.scale.set(0, 1, 0);
                const animation = [
                    {
                        parent: this.dragRing.scale,
                        attribute: "x",
                        to: isToken.document.width,
                    },
                    {
                        parent: this.dragRing.scale,
                        attribute: "z",
                        to: isToken.document.height,
                    },
                ];
                foundry.canvas.animation.CanvasAnimation.animate(animation, { duration: 500, easing: "easeOutCircle", name: "dragRing" });
            }
        }

        this.updateVisibility();
    }

    set origin(position) {
        const pos = Ruler3D.useSnapped() ? Ruler3D.snapped3DPosition(position) : position;

        this.token = game.Levels3DPreview?.interactionManager?.draggable?.userData?.entity3D?.token;
        this._origin = this.token ? position : pos;
        this.cacheSpeedProvider(this.token);
        this.updateVisibility();
        if (!this.line) return;
        this.update();
    }

    get origin() {
        return this._origin;
    }

    get isToken() {
        return !!this._object?.userData?.entity3D?.token;
    }

    updateVisibility() { }

    pointsArrayToSegments(points) {
        const segments = [];
        const empty = new THREE.Group();

        const maxPoints = Math.max(2, this._curveLength ? Math.ceil(this._curveLength / 0.2) : 10);

        if (points.length > maxPoints) {
            const pointsPerSegment = Math.ceil(points.length / maxPoints);
            const newPoints = [];
            for (let i = 0; i < points.length; i++) {
                if (i % pointsPerSegment === 0) {
                    newPoints.push(points[i]);
                }
            }
            points = newPoints;
        }

        points.forEach((p) => (p.y += RULER_TOKEN_OFFSET));
        points[points.length - 1] = this.getTargetPos().clone();
        points[0] = this._origin.clone();
        for (let i = 0; i < points.length - 1; i++) {
            const isLast = i === points.length - 2;
            const segment = new RulerSegment(this, this.isToken, isLast);
            segment.origin = points[i];
            segment.target = points[i + 1];
            segment._distance = parseFloat(Ruler3D.measureDistance(segment.origin, segment.target));
            segments.push(segment);
        }
        return segments;
    }

    addSegment() {
        if (!this._object) return;
        if (this.isToken && this._points?.length) {
            const pointSegments = this.pointsArrayToSegments(this._points);
            this.segments.push(...pointSegments);
            this._distanceOffset += pointSegments.reduce((a, b) => a + b._distance, 0);
        } else {
            const segment = new RulerSegment(this, this.isToken);
            this.segments.push(segment);
            this._distanceOffset += segment._distance;
        }
        this.origin = this.getTargetPos().clone();
        //return segment;
    }

    removeSegment() {
        if (!this._object) return false;
        if (!this.segments.length) {
            this._parent.interactionManager.cancelDrag(true);
            return true;
        }
        const segment = this.segments.pop();
        this.origin = segment.origin.clone();
        segment.destroy();
        this._distanceOffset -= segment._distance;
        return true;
    }

    clearSegments() {
        this.segments.forEach((s) => s.destroy());
        this.segments = [];
        this._distanceOffset = 0;
    }

    getTargetPos() {
        const isToken = this._object?.userData?.entity3D?.token;
        const pos = Ruler3D.useSnapped() ? Ruler3D.snapped3DPosition(this._object.position, isToken) : this._object.position.clone();
        if (isToken) pos.y -= RULER_TOKEN_OFFSET;
        return pos;
    }

    getCurrentDistance() {
        return parseFloat(Ruler3D.measureDistance(this._origin, this.getTargetPos()));
    }

    update() {
        if (!this._object || !this._origin) return;
        const isToken = this._object?.userData?.entity3D?.token;
        const targetPos = this.getTargetPos();
        const hasChanged = !this._prevPosition || targetPos.distanceTo(this._prevPosition) > 0.01;
        this._prevPosition = targetPos.clone();
        const useRaycastPoints = this.useRaycastRuler && this._points?.length && isToken && !this._object?.userData?.entity3D?.wasFreeMode;
        if (isToken) {
            if (hasChanged) this._object.userData.entity3D.drawHeightIndicatorDebounced();
            if (this.useRaycastRuler) this._parent.workers.updateRulerPoints([this._origin, targetPos]);
            //this.dragRing.scale.x = isToken.document.width;
            //this.dragRing.scale.z = isToken.document.height;
        }
        this.dragRing.visible = !!isToken;
        this._parent.scene.remove(this.line);
        this.lineInner?.geometry?.dispose();
        this.lineOuter?.geometry?.dispose();
        const distance = (this.getCurrentDistance() + this._distanceOffset).toFixed(1);
        //draw ruler
        let curve;
        let midcurve;
        if (this.shape?.isPreview && !this.shape?.temporary) {
            midcurve = this._origin.clone().lerp(targetPos, 0.8); //new THREE.Vector3(this._origin.x + (targetPos.x - this._origin.x)/2, this._origin.y + (targetPos.y - this._origin.y)/2, this._origin.z + (targetPos.z - this._origin.z)/2);
            midcurve.y += 2;
            const bezCtrlg = midcurve.clone();
            curve = new THREE.QuadraticBezierCurve3(this._origin, bezCtrlg, targetPos);
            midcurve = curve.getPoint(0.5);
        } else if (!useRaycastPoints) {
            curve = new THREE.LineCurve3(this._origin, targetPos);
        } else {
            const points = this._points;
            curve = new THREE.CatmullRomCurve3(points);
            this._curveLength = curve.getLength();
        }

        const geometry = new THREE.TubeGeometry(curve, this.shape?.isPreview || useRaycastPoints ? 64 : 1, this.lineRadius, 8);
        const c = this.getColor(distance, targetPos);
        this.roulerLineMaterial.color = c;
        this.dragRingMaterial.color = c;
        this.line = new THREE.Group();
        if (!this.enableRuler) this.line.visible = false;
        this.lineOuter = new THREE.Mesh(geometry, this.dragRingMaterial);
        this.lineOuter.userData.ignoreHover = true;
        this.line.add(this.lineOuter);
        if (!this.shape?.isPreview) {
            const geometry2 = new THREE.TubeGeometry(curve, this.shape?.isPreview || useRaycastPoints ? 64 : 1, this.lineRadius / 5, 8);
            this.lineInner = new THREE.Mesh(geometry2, this.roulerLineMaterial);
            this.lineInner.userData.ignoreHover = true;
            this.lineInner.renderOrder = 1e20;
            this.line.add(this.lineInner);
        }
        this.sphere1.position.copy(this._origin);
        this.sphere2.position.copy(targetPos);
        this.dragRing.position.copy(targetPos);
        //draw floating text
        const text = `${distance} ${canvas.scene.grid.units}.`;
        this.textDistance.innerHTML = text;
        //get mid point of ruler
        const midPoint = this.shape?.isPreview ? midcurve : new THREE.Vector3(this._origin.x + (targetPos.x - this._origin.x) / 2, this._origin.y + (targetPos.y - this._origin.y) / 2, this._origin.z + (targetPos.z - this._origin.z) / 2);
        const textPoint = targetPos;
        textPoint.y += 0.05;
        Ruler3D.centerElement(this.textElement, targetPos);
        this._parent.scene.add(this.line);
        this.drawShape();
    }

    cacheSpeedProvider(token) {
        if (!this.isDragRouler || !token) return;
        this._speedProvider = dragRuler.getRangesFromSpeedProvider(token);
    }

    getColor(distance, currentPos) {
        let color;
        if (this.token && this.isDragRouler) {
            const drColor = dragRuler?.getColorForDistanceAndToken(distance, this.token, this._speedProvider);
            if (this.colorCache[drColor]) return this.colorCache[drColor];
            color = new THREE.Color(drColor);
            this.colorCache[drColor] = color;
        }
        let closedColor;
        if (this.segments.length > 0) {
            const firstPoint = this.segments[0].origin;
            const currentPoint = currentPos;
            const dist = firstPoint.distanceTo(currentPoint);
            if (dist < 0.01) {
                closedColor = this.closedPolygonColor;
            }
        }
        return color ?? closedColor ?? this.color;
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
        const bottom = Ruler3D.pixelsToUnits(minElevation);
        const polygonPoints = [];
        for (const point of points) {
            polygonPoints.push(parseInt((point.x - minX) * factor), parseInt((point.z - minY) * factor));
        }
        isClosed && polygonPoints.push(polygonPoints[0], polygonPoints[1]);
        const tileData = {
            width: Math.max(width, 10),
            height: Math.max(height, 10),
            x: minX * factor,
            y: minY * factor,
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

    async executeAllMovement() {
        const lastSegment = this.segments[this.segments.length - 1];
        if (this.isToken) lastSegment.target.y += RULER_TOKEN_OFFSET;
        const promises = [];
        for (const token of canvas.tokens.controlled) {
            promises.push(this.executeMovement(token));
        }
        for (const p of promises) await p;
        //await Promise.all(promises);
        this.clearSegments();
    }

    async executeMovement(token) {
        const token3D = this._parent.tokens[token.id];
        const origin = Ruler3D.pos3DToCanvas(this.segments[0].origin);
        const startPosition = { x: token.center.x, y: token.center.y, elevation: token.document.elevation };
        const offset = { x: origin.x - startPosition.x, y: origin.y - startPosition.y, elevation: origin.z - startPosition.elevation };

        // Iterate over each measured segment
        let priorDest = undefined;
        for (const segment of this.segments) {
            const isLast = segment === this.segments[this.segments.length - 1];
            token3D.rulerOffset = isLast ? 0 : RULER_TOKEN_OFFSET;
            const dest = Ruler3D.pos3DToCanvas(segment.target);
            dest.x -= token.w / 2 + offset.x;
            dest.y -= token.h / 2 + offset.y;
            dest.x = Math.round(dest.x);
            dest.y = Math.round(dest.y);

            dest.elevation = dest.z + offset.elevation;
            dest.elevation = parseFloat(dest.elevation.toFixed(2));

            if (priorDest && (token.document.x !== priorDest.x || token.document.y !== priorDest.y)) break;
            const canMove = token3D.testCollision(dest);
            if (!canMove) break;
            await this._animateSegment(token, dest);
            segment.destroy();
            priorDest = dest;
        }
    }

    async _animateSegment(token, destination) {
        await token.document.update({ ...destination }, {movement: {[token.document.id]: { autoRotate: game.settings.get("core", "tokenAutoRotate") }}});
        return token.movementAnimationPromise;
    }

    static position3dtoScreen(position) {
        const camera = game.Levels3DPreview.camera;
        const vector = new THREE.Vector3(position.x, position.y, position.z);
        const widthHalf = (game.Levels3DPreview.renderer.getContext().canvas.width * 0.5) / game.Levels3DPreview.resolutionMulti,
            heightHalf = (game.Levels3DPreview.renderer.getContext().canvas.height * 0.5) / game.Levels3DPreview.resolutionMulti;
        vector.project(camera);
        vector.x = vector.x * widthHalf + widthHalf;
        vector.y = -(vector.y * heightHalf) + heightHalf;
        return vector;
    }

    static centerElement(element, position, ontop = false) {
        if (!element) return;
        //get distance between element and camera
        element = element.jquery ? element[0] : element;
        let cachedFontSize = element.dataset.cachedSize;
        if (!cachedFontSize) {
            cachedFontSize = parseFloat(window.getComputedStyle(element, null).getPropertyValue("font-size"));
            element.dataset.cachedSize = cachedFontSize;
        }

        const dist = game.Levels3DPreview.camera.position.distanceTo(position);
        const scale = Math.max(0.5, 1.2 / dist) / game.Levels3DPreview.resolutionMulti; //*(canvas.grid.size/100);
        if (element.id == "levels3d-ruler-text") {
            element.style.fontSize = `${cachedFontSize * scale}px`;
        } else {
            element.style.transform = `scale(${scale})`;
        }
        const centerPosition = Ruler3D.position3dtoScreen(position);
        const elementWidth = element.offsetWidth;
        const elementHeight = ontop ? element.offsetHeight * 2 : element.offsetHeight;
        element.style.left = `${centerPosition.x - elementWidth / 2}px`;
        element.style.top = `${centerPosition.y - elementHeight / 2}px`;
    }

    static posCanvasTo3d(position) {
        return new THREE.Vector3(position.x / factor, (position.z * canvas.scene.dimensions.size) / (canvas.scene.dimensions.distance * factor), position.y / factor);
    }

    static unitsToPixels(units) {
        return (units * canvas.scene.dimensions.size) / (canvas.scene.dimensions.distance * factor);
    }

    static pixelsToUnits(pixels) {
        return (pixels * canvas.scene.dimensions.distance * factor) / canvas.scene.dimensions.size;
    }

    static pos3DToCanvas(position) {
        const vector = new THREE.Vector3(position.x * factor, position.z * factor, ((position.y * factor) / canvas.scene.dimensions.size) * canvas.scene.dimensions.distance);
        vector.elevation = vector.z;
        return vector;
    }

    static useSnapped() {
        const isGrid = canvas.scene.grid.type ? true : false;
        const isShift = game.keyboard.downKeys.has("ShiftLeft") || game.keyboard.downKeys.has("ShiftRight");
        if (!isGrid) return false;
        if (isGrid && !isShift) return true;
        return false;
    }

    static roundToMultiple(number, multiple) {
        return Math.round(number / multiple) * multiple;
    }

    static snapped3DPosition(position, isToken = false) {
        const canvasPosition = Ruler3D.pos3DToCanvas(position);
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
        return Ruler3D.posCanvasTo3d(snappedPos);
    }

    static measureDistance(position1, position2) {
        const pos1Canvas = Ruler3D.pos3DToCanvas(position1);
        const pos2Canvas = Ruler3D.pos3DToCanvas(position2);
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
        return d
    }

    static measureMinTokenDistance(origin, target) {
        const square = canvas.scene.dimensions.size / factor;
        const halfSquare = square / 2;
        const generatePoints = (token) => {
            const tokenHeight = ((token.token.losHeight ?? (token.token.document.elevation + 0.001)) - token.token.document.elevation) / canvas.scene.dimensions.distance;
            const tokenPositions = [];
            const tokenStart = token.mesh.position.clone();
            tokenStart.x += -token.token.document.width * halfSquare + halfSquare;
            tokenStart.y += halfSquare;
            tokenStart.z += -token.token.document.height * halfSquare + halfSquare;

            for (let i = 0; i < token.token.document.width; i++) {
                for (let j = 0; j < token.token.document.height; j++) {
                    for (let k = 0; k < tokenHeight; k++) {
                        const position = new THREE.Vector3(tokenStart.x + i * square, tokenStart.y + k * square, tokenStart.z + j * square);
                        tokenPositions.push(position);
                    }
                }
            }
            return tokenPositions;
        };
        const measurements = [];
        const originPoints = generatePoints(origin);
        const targetPoints = generatePoints(target);
        for (const oPoint of originPoints) {
            for (const tPoint of targetPoints) {
                const distance = Ruler3D.measureDistance(oPoint, tPoint);
                measurements.push(distance);
            }
        }
        return Math.min(...measurements);
    }
}

class RulerSegment {
    constructor(ruler3d, isToken, addToScene = true) {
        this.sphere1 = ruler3d.sphere1.clone();
        this.sphere2 = ruler3d.sphere2.clone();
        this.line = ruler3d.line.clone();
        this.origin = ruler3d.origin.clone();
        this.target = ruler3d.getTargetPos().clone();
        this._parent = ruler3d._parent;
        this._distance = ruler3d.getCurrentDistance();
        if (addToScene) this.addToScene();
    }

    get scene() {
        return this._parent.scene;
    }

    addToScene() {
        this.scene.add(this.sphere1);
        this.scene.add(this.sphere2);
        this.scene.add(this.line);
    }

    destroy() {
        this.scene.remove(this.sphere1);
        this.scene.remove(this.sphere2);
        this.scene.remove(this.line);
        this.line.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
        });
    }
}

export const RULER_TOKEN_OFFSET = 0.05;
