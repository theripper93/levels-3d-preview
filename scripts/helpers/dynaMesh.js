import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "../lib/three-mesh-bvh.js";
import {mergeBufferGeometries, toTrianglesDrawMode, mergeVertices} from "../lib/BufferGeometryUtils.js";
import {DecalGeometry} from "../lib/DecalGeometry.js";
import { ImprovedNoise } from "../lib/imporovedNoise.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let font = null;
export class DynaMesh {
    constructor(type, { width = 1, height = 1, depth = 1, resolution = 1, text = "", decalData = {} }) {
        this.type = type;
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.resolution = resolution;
        this.text = text;
        this.decalData = decalData;
    }

    async create() {
        const geometry = await this._constructGeometry();
        const mesh = new THREE.Mesh(geometry, this._material);
        mesh.traverse((child) => {
            if (child.isMesh) {
                child.geometry.computeBoundsTree();
            }
        });
        return mesh;
    }

    _constructGeometry() {
        if (!this[`_construct${this.type}`]) {
            console.error(`DynaMesh: ${this.type} is not a valid type`);
            this.type = "box";
        }
        return this[`_construct${this.type}`]();
    }

    _constructbillboard() {
        const plane1 = new THREE.PlaneGeometry(this.width, this.height, Math.ceil(this.resolution), Math.ceil(this.resolution));
        const plane2 = new THREE.PlaneGeometry(this.width, this.height, Math.ceil(this.resolution), Math.ceil(this.resolution));
        const plane3 = new THREE.PlaneGeometry(this.width, this.height, Math.ceil(this.resolution), Math.ceil(this.resolution));
        plane1.rotateY(Math.PI / 3);
        plane2.rotateY(0);
        plane3.rotateY(-Math.PI / 3);
        const geometry = mergeBufferGeometries([plane1, plane2, plane3]);
        return geometry;
    }

    _constructbillboard2() {
        const plane1 = new THREE.PlaneGeometry(this.width, this.height, Math.ceil(this.resolution), Math.ceil(this.resolution));
        const plane2 = new THREE.PlaneGeometry(this.width, this.height, Math.ceil(this.resolution), Math.ceil(this.resolution));
        plane1.rotateY(Math.PI / 2);
        const geometry = mergeBufferGeometries([plane1, plane2]);
        return geometry;
    }

    _constructbox() {
        const geometry = new THREE.BoxGeometry(this.width, this.depth, this.height, Math.ceil((this.width / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution), Math.ceil((this.height / this._gridUnit) * this.resolution));
        return geometry;
    }

    _constructsphere() {
        const geometry = new THREE.SphereGeometry(this._avgAll, Math.ceil((this._avgWidthHeight / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution));
        return geometry;
    }

    _constructcylinder() {
        const geometry = new THREE.CylinderGeometry(this._avgWidthHeight, this._avgWidthHeight, this.depth, Math.ceil((this._avgWidthHeight / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution), false);
        return geometry;
    }

    _constructtube() {
        const geometry = new THREE.CylinderGeometry(this._avgWidthHeight, this._avgWidthHeight, this.depth, Math.ceil((this._avgWidthHeight / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution), true);
        return geometry;
    }

    _constructcone() {
        const geometry = new THREE.ConeGeometry(this._avgWidthHeight, this.depth, Math.ceil((this._avgWidthHeight / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution), false);
        return geometry;
    }

    _constructdome() {
        const geometry = new THREE.SphereGeometry(this._avgAll, Math.ceil((this._avgWidthHeight / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution), 0, Math.PI * 2, 0, Math.PI / 2);
        return geometry;
    }

    async _constructdecal() {
        const decalData = this.decalData;
        const geometry = new DecalGeometry(decalData.mesh, decalData.position, decalData.rotation, new THREE.Vector3(this.width, this.height, this.height));
        return geometry;
    }

    async _constructtext() {
        if (!font) font = await loadTextFont();
        const geometry = new THREE.TextGeometry(this.text, {
            font: font,
            size: (this.width + this.depth) / 2,
            height: this.height,
            curveSegments: this.resolution,
        });
        geometry.center();
        return geometry;
    }

    _constructpolygon() {
        const points = this.text.split(",").map((point) => parseInt(point) / factor);
        const shape = new THREE.Shape();
        shape.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) {
            shape.lineTo(points[i], points[i + 1]);
        }
        shape.lineTo(points[0], points[1]);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: this.depth, bevelEnabled: false });
        geometry.rotateX(Math.PI / 2);
        geometry.center();
        return mergeBufferGeometries([geometry]);
    }

    _constructpolygonbevel() {
        const points = this.text.split(",").map((point) => parseInt(point) / factor);
        const shape = new THREE.Shape();
        shape.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) {
            shape.lineTo(points[i], points[i + 1]);
        }
        shape.lineTo(points[0], points[1]);
        const extrudeSettings = {
            steps: 2,
            depth: this.depth,
            bevelEnabled: true,
            bevelThickness: 0.011,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: 3,
        };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.rotateX(Math.PI / 2);
        geometry.center();
        return mergeBufferGeometries([geometry]);
    }

    _constructpolygonsolidify() {
        if (this.text.includes("#")){
            const split = this.text.split("#");
            this.solidifyThickness = parseFloat(split[0]) / factor;
            this.text = split[1];
        }
        const points = solidifyPolygon(this.text.split(",").map((point) => parseInt(point) / factor), this.solidifyThickness);
        const shape = new THREE.Shape();
        shape.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) {
            shape.lineTo(points[i], points[i + 1]);
        }
        shape.lineTo(points[0], points[1]);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: this.depth, bevelEnabled: false });
        geometry.rotateX(Math.PI / 2);
        geometry.center();
        return mergeBufferGeometries([geometry]);
    }

    _constructpolygonbevelsolidify() {
        if (this.text.includes("#")) {
            const split = this.text.split("#");
            this.solidifyThickness = parseFloat(split[0]) / factor;
            this.text = split[1];
        }
        const points = solidifyPolygon(this.text.split(",").map((point) => parseInt(point) / factor), this.solidifyThickness);
        const shape = new THREE.Shape();
        shape.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) {
            shape.lineTo(points[i], points[i + 1]);
        }
        shape.lineTo(points[0], points[1]);
        const extrudeSettings = {
            steps: 2,
            depth: this.depth,
            bevelEnabled: true,
            bevelThickness: 0.011,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: 3,
        };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.rotateX(Math.PI / 2);
        geometry.center();
        return mergeBufferGeometries([geometry]);
    }

    _constructpolygonbevelsolidifyjagged() {
        if (this.text.includes("#")) {
            const split = this.text.split("#");
            this.solidifyThickness = parseFloat(split[0]) / factor;
            this.text = split[1];
        }
        const iterations = this.resolution + 2;
        let points = this.text.split(",").map((point) => parseInt(point) / factor);
        points = subdividePolygon(points, iterations);
        const pixiP = new PIXI.Polygon(points);
        points = solidifyPolygon(points, this.solidifyThickness);
        const shape = new THREE.Shape();
        shape.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) {
            shape.lineTo(points[i], points[i + 1]);
        }
        shape.lineTo(points[0], points[1]);
        const extrudeSettings = {
            steps: iterations * 2,
            depth: this.depth,
            bevelEnabled: false,
            bevelThickness: 0.011,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: 3,
        };
        let geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry = applyJagged(geometry, pixiP, (this.solidifyThickness * 2) / factor);
        geometry.rotateX(Math.PI / 2);
        geometry.center();
        
        return mergeBufferGeometries([geometry]);
    }

    _constructpolygonlathe() { 
        let phiLength = Math.PI * 2;
        if (this.text.includes("#")) {
            const split = this.text.split("#");
            phiLength = parseFloat(split[0]) * Math.PI / 180;
            this.text = split[1];
        }
        const points = this.text.split(",").map((point) => parseInt(point) / factor);
        const vector2Points = [];
        for (let i = 0; i < points.length; i += 2) {
            vector2Points.push(new THREE.Vector2(points[i], points[i + 1]));
        }
        const geometry = new THREE.LatheGeometry(vector2Points, this.resolution * 4, 0, phiLength);
        geometry.rotateX(Math.PI);
        geometry.center();
        return mergeBufferGeometries([geometry]);
    }

    get _avgWidthHeight() {
        return ((this.width + this.height) / 2) * this.resolution;
    }

    get _avgAll() {
        return ((this.width + this.height + this.depth) / 3) * this.resolution;
    }

    get _gridUnit() {
        return canvas.scene.dimensions.size / factor;
    }

    get _material() {
        switch (this.type) {
            case "billboard":
                return new THREE.MeshStandardMaterial({ alphaTest: 0.5, color: 0xffffff, side: THREE.DoubleSide });
            case "billboard2":
                return new THREE.MeshStandardMaterial({ alphaTest: 0.5, color: 0xffffff, side: THREE.DoubleSide });
            default:
                return new THREE.MeshStandardMaterial({ color: 0xffffff });
        }
    }
}

async function loadTextFont() {
    const loader = new THREE.FontLoader();
    font = await loader.loadAsync("modules/levels-3d-preview/assets/helvetiker.json");
    return font;
}



function solidifyPolygon(points, thickness) {
    const solidifyThickness = thickness ?? 0.05;
    
    points = points
        .map((point, index) => {
            if (index % 2 === 0) {
                return { x: point, y: points[index + 1] };
            }
        })
        .filter((point) => point);
    
    //points.push(points[0]);
    
    const outerEdgePoints = [];
    const innerEdgePoints = [];

    //outerEdgePoints.push(points[0].x, points[0].y);

    //Create starting Cap

    const startCapDirectionFirstSecond = new THREE.Vector2(points[1].x - points[0].x, points[1].y - points[0].y).normalize();

    const startCapNormalFirstSecond = new THREE.Vector2(startCapDirectionFirstSecond.y, -startCapDirectionFirstSecond.x);
    startCapNormalFirstSecond.negate();

    const startCapBottom = new THREE.Vector2(points[0].x + startCapNormalFirstSecond.x * solidifyThickness, points[0].y + startCapNormalFirstSecond.y * solidifyThickness);
    const startCapTop = new THREE.Vector2(points[0].x - startCapNormalFirstSecond.x * solidifyThickness, points[0].y - startCapNormalFirstSecond.y * solidifyThickness);
    startCapDirectionFirstSecond.negate();
    const startCapMiddle = new THREE.Vector2(points[0].x + startCapDirectionFirstSecond.x * solidifyThickness, points[0].y + startCapDirectionFirstSecond.y * solidifyThickness);
    outerEdgePoints.push(startCapBottom.x, startCapBottom.y, startCapMiddle.x, startCapMiddle.y, startCapTop.x, startCapTop.y);


    for (let i = 1; i < points.length -1; i += 1) { 
        const current = points[i];
        const next = points[i + 1];
        const prev = points[i - 1];
        
        const directionCurrentNext = new THREE.Vector2(next.x - current.x, next.y - current.y).normalize();
        const directionCurrentPrev = new THREE.Vector2(current.x - prev.x, current.y - prev.y).normalize();

        const normalCurrentNext = new THREE.Vector2(directionCurrentNext.y, -directionCurrentNext.x);
        const normalCurrentPrev = new THREE.Vector2(directionCurrentPrev.y, -directionCurrentPrev.x);

        const avgDirection = new THREE.Vector2(normalCurrentNext.x + normalCurrentPrev.x, normalCurrentNext.y + normalCurrentPrev.y).normalize();

        const outerEdgePoint = new THREE.Vector2(current.x + avgDirection.x * solidifyThickness, current.y + avgDirection.y * solidifyThickness);
        const innerEdgePoint = new THREE.Vector2(current.x - avgDirection.x * solidifyThickness, current.y - avgDirection.y * solidifyThickness);

        outerEdgePoints.push(outerEdgePoint.x, outerEdgePoint.y);
        innerEdgePoints.push({ x: innerEdgePoint.x, y: innerEdgePoint.y}); 
    }

    //Create ending Cap

    const endCapDirectionLastSecondLast = new THREE.Vector2(points[points.length - 1].x - points[points.length - 2].x, points[points.length - 1].y - points[points.length - 2].y).normalize();

    const endCapNormalLastSecondLast = new THREE.Vector2(endCapDirectionLastSecondLast.y, -endCapDirectionLastSecondLast.x);
    endCapNormalLastSecondLast.negate();

    const endCapBottom = new THREE.Vector2(points[points.length - 1].x + endCapNormalLastSecondLast.x * solidifyThickness, points[points.length - 1].y + endCapNormalLastSecondLast.y * solidifyThickness);
    const endCapTop = new THREE.Vector2(points[points.length - 1].x - endCapNormalLastSecondLast.x * solidifyThickness, points[points.length - 1].y - endCapNormalLastSecondLast.y * solidifyThickness);

    const endCapMiddle = new THREE.Vector2(points[points.length - 1].x + endCapDirectionLastSecondLast.x * solidifyThickness, points[points.length - 1].y + endCapDirectionLastSecondLast.y * solidifyThickness);

    outerEdgePoints.push(endCapTop.x, endCapTop.y, endCapMiddle.x, endCapMiddle.y, endCapBottom.x, endCapBottom.y);


    innerEdgePoints.reverse();

    for (let i = 0; i < innerEdgePoints.length; i += 1) {
        outerEdgePoints.push(innerEdgePoints[i].x, innerEdgePoints[i].y);
    }

    return outerEdgePoints;


}

function subdividePolygon(polygon, iterations = 1) {
    for (let i = 0; i < iterations; i += 1) {
        polygon = subdividePolygonPoints(polygon);
    }
    return polygon;
}

function subdividePolygonPoints(polygon) {
    const points = polygon
        .map((point, index) => {
            if (index % 2 === 0) {
                return { x: point, y: polygon[index + 1] };
            }
        })
        .filter((point) => point);
    
    const segments = [];
    for (let i = 0; i < points.length - 1; i += 1) {
        segments.push({ start: points[i], end: points[i + 1] });
    }
    const subdivededSegments = [];
    for (let i = 0; i < segments.length; i += 1) { 
        const segment = segments[i];
        const midPoint = new THREE.Vector2((segment.start.x + segment.end.x) / 2, (segment.start.y + segment.end.y) / 2);
        subdivededSegments.push({ start: segment.start, end: midPoint });
        subdivededSegments.push({ start: midPoint, end: segment.end });
    }
    const subdivededPoints = [];
    for (let i = 0; i < subdivededSegments.length; i += 1) {
        subdivededPoints.push(subdivededSegments[i].start.x, subdivededSegments[i].start.y);
    }
    subdivededPoints.push(subdivededSegments[subdivededSegments.length - 1].end.x, subdivededSegments[subdivededSegments.length - 1].end.y);

    return subdivededPoints;
}

function applyJagged(geometry, pixiP, thickness, scale = 10, strength = 1) {
    geometry.computeBoundingBox();
    const polygonVec2 = [];
    for (let i = 0; i < pixiP.points.length; i += 2) {
        polygonVec2.push(new THREE.Vector2(pixiP.points[i], pixiP.points[i + 1]));
    }
    const positionAttributes = geometry.getAttribute("position");
    const count = positionAttributes.count;
    const improvedNoise = new ImprovedNoise();
    const minY = geometry.boundingBox.min.y;
    const maxY = geometry.boundingBox.max.y;
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    for (let i = 0; i < count; i++) {
        const x = positionAttributes.getX(i);
        const y = positionAttributes.getY(i);
        const z = positionAttributes.getZ(i);
        if (!pixiP.contains(x, y)) continue;
        const currentPointV2 = new THREE.Vector2(x, y);
        const closestPoint = polygonVec2.reduce((prev, curr) => {
            return prev.distanceTo(currentPointV2) < curr.distanceTo(currentPointV2) ? prev : curr;
        });
        const displacementDirection = new THREE.Vector2().subVectors(currentPointV2, closestPoint).normalize();
        //const yPercent = (y - minY) / (maxY - minY);
        //if(yPercent > 0.97) continue;
        const displacement = 1 - improvedNoise.noise(x * scale, y * scale, z * scale); //1 - this.getPixel(this.displacementMap, xPercent*zPercent, yPercent).r / 255;
        const displaced = currentPointV2.add(displacementDirection.clone().multiplyScalar(displacement * strength * 0.05));
        positionAttributes.setX(i, displaced.x);
        positionAttributes.setY(i, displaced.y);
    }
    geometry.computeVertexNormals();
    geometry.normalizeNormals();
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    return geometry;
}

function _applyJagged(geometry, thickness, scale = 10, strength = 1) {
    const positionAttributes = geometry.getAttribute("position");
    const count = positionAttributes.count;
    const improvedNoise = new ImprovedNoise();
    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const maxY = geometry.boundingBox.max.y;
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    for (let i = 0; i < count; i++) {
        const x = positionAttributes.getX(i);
        const y = positionAttributes.getY(i);
        const z = positionAttributes.getZ(i);
        const yPercent = (y - minY) / (maxY - minY);
        //if(yPercent > 0.97) continue;
        const point = new THREE.Vector3(x, y, z);
        const towardsCenter = new THREE.Vector3().subVectors(center, point).normalize();
        const displacement = 1 - improvedNoise.noise(x * scale, y * scale, z * scale); //1 - this.getPixel(this.displacementMap, xPercent*zPercent, yPercent).r / 255;
        const displaced = point.add(towardsCenter.clone().multiplyScalar(displacement * strength * 0.05));
        displaced.sub(towardsCenter.multiplyScalar(thickness));
        positionAttributes.setX(i, displaced.x);
        positionAttributes.setZ(i, displaced.z);
    }
    geometry.computeVertexNormals();
    geometry.normalizeNormals();
    geometry.computeTangents();
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    return geometry;
}