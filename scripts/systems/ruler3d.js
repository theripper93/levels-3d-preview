import * as THREE from "../lib/three.module.js";
import { Template3D } from "../entities/template3d.js";
import { factor } from "../main.js";
import {sleep} from "../helpers/utils.js";

export class Ruler3D {
    constructor(parent) {
        this._parent = parent;
        this._distanceOffset = 0;
        this.isDragRouler = game.modules.get("drag-ruler")?.active;
        this.isHoverDistance = game.modules.get("hover-distance")?.active;
        this.color = new THREE.Color(game.user.color);
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

    drawTemplate() {
        if (ui.controls.activeTool === "select" || !this.allowedRulerDrag.some((a) => a === canvas.activeLayer.options.objectClass.embeddedName)) return;
        if (this.template?.isPreview) return;
        if (this.allowedRulerDrag.some((a) => a === this._object?.userData?.entity3D?.placeable?.document?.documentName)) return;
        this.template?.destroy();
        const pos = Ruler3D.useSnapped() ? Ruler3D.snapped3DPosition(this._object.position) : this._object.position;
        const template = new Template3D({ t: ui.controls.activeTool }, this._origin, pos);
        this.template = template;
    }

    get template() {
        return this._template;
    }

    set template(value) {
        if (this._template) {
            this._lastTemplate?.destroy();
            this._lastTemplate = this._template;
        }
        this._template = value;
    }

    placeTemplate() {
        if (!this.template) return;
        const data = this.template.fromPreview(this._templatePreviewData.create ?? true);
        if (this._templatePreviewData) this._templatePreviewData.resolve(data);
        this._templatePromiseResolve = null;
        this.template = null;
    }

    init() {
        this.sphere1 = new THREE.Mesh(new THREE.SphereGeometry(this.sphereRadius, 16, 16), this.roulerLineMaterial);
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
        this.textElement = $(`<div id="levels3d-ruler-text" class="ruler"><span class="distance"></span></div>`);
        this.textDistance = this.textElement.find(".distance")[0];
        this.textElement.hide();
        $("body").append(this.textElement);
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
        if (!value) {
            //this.clearSegments();  
            const isToken = this.isToken;
            this._object = null;
            this.template?.destroy();
            this.textElement.hide();
            this._parent.scene.remove(this.line);
            this.removeMarkers(isToken);

        } else {
            this.clearSegments();
            this.addMarkers();
            const target = value.userData.isHitbox ? value.parent : value;
            this._object = target;
            this.origin = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
            this.textElement.show();
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
                CanvasAnimation.animate(animation, { duration: 500, easing: "easeOutCircle", name: "dragRing" });
            }
        }

        this.updateVisibility();
    }

    set origin(position) {
        const pos = Ruler3D.useSnapped() ? Ruler3D.snapped3DPosition(position) : position;
        
        this._origin = pos;
        this.token = game.Levels3DPreview?.interactionManager?.draggable?.userData?.entity3D?.token;
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

    updateVisibility() {}

    addSegment() {
        const segment = new RulerSegment(this, this.isToken);
        this.segments.push(segment);
        this.origin = this.getTargetPos().clone();
        this._distanceOffset += segment._distance;
        return segment;
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
        let useTopLeft = false;
        if (isToken) { 
            const width = isToken.document.width;
            const height = isToken.document.height;
            const isEven = (width % 2 === 0) && (height % 2 === 0);
            if(isEven) useTopLeft = true;
        }
        const pos = Ruler3D.useSnapped() ? Ruler3D.snapped3DPosition(this._object.position, useTopLeft, isToken) : this._object.position.clone();
        if (isToken) pos.y -= RULER_TOKEN_OFFSET;
        return pos;
    }

    getCurrentDistance() {
        return parseFloat(Ruler3D.measureDistance(this._origin, this.getTargetPos()));
    }

    update() {
        if (!this._object || !this._origin ) return;
        const isToken = this._object?.userData?.entity3D?.token;
        const targetPos = this.getTargetPos();
        const hasChanged = !this._prevPosition || targetPos.distanceTo(this._prevPosition) > 0.01;
        this._prevPosition = targetPos.clone();
        if (isToken) {
            if(hasChanged) this._object.userData.entity3D.drawHeightIndicatorDebounced();
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
        if (this.template?.isPreview && !this.template?.temporary) {
            midcurve = this._origin.clone().lerp(targetPos, 0.8); //new THREE.Vector3(this._origin.x + (targetPos.x - this._origin.x)/2, this._origin.y + (targetPos.y - this._origin.y)/2, this._origin.z + (targetPos.z - this._origin.z)/2);
            midcurve.y += 2;
            const bezCtrlg = midcurve.clone();
            curve = new THREE.QuadraticBezierCurve3(this._origin, bezCtrlg, targetPos);
            midcurve = curve.getPoint(0.5);
        } else {
            curve = new THREE.LineCurve3(this._origin, targetPos);
        }

        const geometry = new THREE.TubeGeometry(curve, this.template?.isPreview ? 64 : 1, this.lineRadius, 8);
        const c = this.getColor(distance);
        this.roulerLineMaterial.color = c;
        this.dragRingMaterial.color = c;
        this.line = new THREE.Group();
        this.lineOuter = new THREE.Mesh(geometry, this.dragRingMaterial);
        this.lineOuter.userData.ignoreHover = true;
        this.line.add(this.lineOuter);
        if (!this.template?.isPreview) {
            const geometry2 = new THREE.TubeGeometry(curve, this.template?.isPreview ? 64 : 1, this.lineRadius / 5, 8);
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
        const midPoint = this.template?.isPreview ? midcurve : new THREE.Vector3(this._origin.x + (targetPos.x - this._origin.x) / 2, this._origin.y + (targetPos.y - this._origin.y) / 2, this._origin.z + (targetPos.z - this._origin.z) / 2);
        const textPoint = targetPos
        textPoint.y += 0.05;
        Ruler3D.centerElement(this.textElement, targetPos);
        this._parent.scene.add(this.line);
        this.drawTemplate();
    }

    cacheSpeedProvider(token) {
        if (!this.isDragRouler || !token) return;
        this._speedProvider = dragRuler.getRangesFromSpeedProvider(token);
    }

    getColor(distance) {
        let color;
        if (this.token && this.isDragRouler) {
            const drColor = dragRuler?.getColorForDistanceAndToken(distance, this.token, this._speedProvider);
            if (this.colorCache[drColor]) return this.colorCache[drColor];
            color = new THREE.Color(drColor);
            this.colorCache[drColor] = color;
        }
        return color ?? this.color;
    }

    async executeAllMovement() {
        const lastSegment = this.segments[this.segments.length - 1];
        if(this.isToken) lastSegment.target.y += RULER_TOKEN_OFFSET;
        const promises = [];
        for (const token of canvas.tokens.controlled) {
            promises.push(this.executeMovement(token));
        }
        await Promise.all(promises);
        this.clearSegments();
    }

    async executeMovement(token) {
        const token3D = this._parent.tokens[token.id];
        const origin = Ruler3D.pos3DToCanvas(this.segments[0].origin);
        const startPosition = { x: token.document.x + (token.document.width / 2 * canvas.grid.size), y: token.document.y + (token.document.height / 2 * canvas.grid.size), elevation: token.document.elevation };
        const offset = { x: origin.x - startPosition.x, y: origin.y - startPosition.y, elevation: origin.z - startPosition.elevation };

        // Iterate over each measured segment
        let priorDest = undefined;
        for (const segment of this.segments) {
            const dest = Ruler3D.pos3DToCanvas(segment.target);
            dest.x -= token.document.width * canvas.grid.size / 2 + offset.x;
            dest.y -= token.document.height * canvas.grid.size / 2 + offset.y;
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
        await token.document.update(destination);
        await sleep(100);
        const anim = CanvasAnimation.getAnimation(token.animationName);
        if(!anim) return;
        return anim.promise;
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
        //get distance between element and camera
        element = element[0] ?? element;
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
        return new THREE.Vector3(position.x * factor, position.z * factor, ((position.y * factor) / canvas.scene.dimensions.size) * canvas.scene.dimensions.distance);
    }

    static useSnapped() {
        const isGrid = canvas.scene.grid.type ? true : false;
        const isShift = keyboard.downKeys.has("ShiftLeft") || keyboard.downKeys.has("ShiftRight");
        if (!isGrid) return false;
        if (isGrid && !isShift) return true;
        return false;
    }

    static roundToMultiple(number, multiple) { 
        return Math.round(number / multiple) * multiple;
    }

    static snapped3DPosition(position, useTopLeft = false, isToken = false) {
        const canvasPosition = Ruler3D.pos3DToCanvas(position);
        let snappedCenterPos;
        if (useTopLeft) {
            snappedCenterPos = {x: Ruler3D.roundToMultiple(canvasPosition.x, canvas.grid.size), y: Ruler3D.roundToMultiple(canvasPosition.y, canvas.grid.size)};
        } else if (isToken) {
            const [x, y] = canvas.grid.getCenter(canvasPosition.x, canvasPosition.y);
            snappedCenterPos = {x: x, y: y};
        } else {
            snappedCenterPos = canvas.grid.getSnappedPosition(canvasPosition.x, canvasPosition.y, 2);
        }
        
        const snappedPos = {
            x: snappedCenterPos.x,
            y: snappedCenterPos.y,
            z: canvasPosition.z,
        };
        return Ruler3D.posCanvasTo3d(snappedPos);
    }

    static measureDistance(position1, position2) {
        if (Math.round(position1.y * 1000) / 1000 !== Math.round(position2.y * 1000) / 1000 || !Ruler3D.useSnapped()) return (((position1.distanceTo(position2) * factor) / canvas.scene.dimensions.size) * canvas.scene.dimensions.distance).toFixed(1);
        const pos1Canvas = Ruler3D.pos3DToCanvas(position1);
        const pos2Canvas = Ruler3D.pos3DToCanvas(position2);
        const ray = new Ray(
            {
                x: Math.round(pos1Canvas.x),
                y: Math.round(pos1Canvas.y),
            },
            {
                x: Math.round(pos2Canvas.x),
                y: Math.round(pos2Canvas.y),
            },
        );
        return canvas.grid.measureDistances([{ ray }], { gridSpaces: true })[0].toFixed(1);
    }

    static measureMinTokenDistance(origin, target) {
        const square = canvas.scene.dimensions.size / factor;
        const halfSquare = square / 2;
        const generatePoints = (token) => {
            const tokenHeight = (token.token.losHeight - token.token.document.elevation) / canvas.scene.dimensions.distance;
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
    constructor(ruler3d, isToken) {
        this.sphere1 = ruler3d.sphere1.clone();
        this.sphere2 = ruler3d.sphere2.clone();
        this.line = ruler3d.line.clone();
        this.origin = ruler3d.origin.clone();
        this.target = ruler3d.getTargetPos().clone();
        this._parent = ruler3d._parent;
        this._distance = ruler3d.getCurrentDistance();
        this.addToScene();
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