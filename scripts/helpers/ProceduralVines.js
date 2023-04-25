import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import {DecalGeometry} from "../lib/DecalGeometry.js";
import {meshesToSingleMesh} from "./geometryUtils.js";
import {LoopSubdivision} from "../lib/LoopSubdivision.js";
import { mergeBufferGeometries, mergeVertices } from "../lib/BufferGeometryUtils.js";

export class ProceduralVines{
    constructor (point, direction, radius, maxGenerations = 8) {
        this._originPoint = point;
        this._originalDirection = direction;
        this.radius = radius;
        this.meshes = this.getMeshes(point,radius)
        this.mergedMesh = meshesToSingleMesh(this.meshes);
        this.baseGeometry = new DecalGeometry(this.mergedMesh, point, direction, new THREE.Vector3(radius, radius, radius));
        this.baseGeometry = mergeVertices(this.baseGeometry);
        this.baseGeometry = LoopSubdivision.modify(this.baseGeometry, 1);
        this.offsetPointsAlongNormal();
        this.baseGeometry = mergeVertices(this.baseGeometry);
        this.maxGenerations = maxGenerations;
        this.vines = [];
        this.generateVines();
    }

    offsetPointsAlongNormal() {
        const geo = this.baseGeometry;
        const positionAttributes = geo.getAttribute("position");
        const normalAttributes = geo.getAttribute("normal");
        const count = positionAttributes.count;
        const offsetScalar = 0.005;
        for (let i = 0; i < count; i++) {
            const x = positionAttributes.getX(i);
            const y = positionAttributes.getY(i);
            const z = positionAttributes.getZ(i);
            const nx = normalAttributes.getX(i);
            const ny = normalAttributes.getY(i);
            const nz = normalAttributes.getZ(i);
            positionAttributes.setXYZ(i, x + nx * offsetScalar, y + ny * offsetScalar, z + nz * offsetScalar);
        }
        positionAttributes.needsUpdate = true;
    }

    getMeshes(point, radius) {

        const baseBoundingSphere = new THREE.Sphere(point, radius);
        const meshes = [];

        for (const tile of Object.values(game.Levels3DPreview.tiles)) {
            const tileMesh = tile.mesh;
            const boundingBox = new THREE.Box3().setFromObject(tileMesh);
            if (boundingBox.intersectsSphere(baseBoundingSphere)) { 
                meshes.push(tileMesh.children[0]);
            }
        }

        return meshes;
    }

    getBaseGeometryMiddlePoint() { 
        const geometry = this.baseGeometry;
        const closestPoint = this._originPoint;
        let closestToGeometry = new THREE.Vector3();
        let closestDistance = Infinity;
        const positionAttributes = geometry.getAttribute("position");
        const count = positionAttributes.count;
        for (let i = 0; i < count; i++) {
            const x = positionAttributes.getX(i);
            const y = positionAttributes.getY(i);
            const z = positionAttributes.getZ(i);
            const point = new THREE.Vector3(x, y, z);
            const distance = point.distanceTo(closestPoint);
            if (distance < closestDistance) {
                closestToGeometry = point;
                closestDistance = distance;
            }
        }
        return closestToGeometry;

    }

    generateVines() {
        const center = this.getBaseGeometryMiddlePoint();
        const origins = getRandomPoints(this.baseGeometry, Math.round(this.radius / 0.1), this.radius / 4, center);
        origins.push(center);
        for (const origin of origins) { 
            const closestPoints = getClosestPoints(this.baseGeometry, origin, 5);
    
    
            for (const point of closestPoints) {
                const direction = new THREE.Vector3().subVectors(origin, point).normalize();
                const vine = new VineArm(point, direction, origin, this.radius, this.baseGeometry, this.maxGenerations, 0);
                this.vines.push(vine);
            }
        }
    }

    toJSON(offset = new THREE.Vector3()) {
        const vines = this.vines.map(vine => vine.toJSON(offset));
        return vines;
    }

    static fromCurrentHover(generations = 1, radius = 1) {
        const currentHover = game.Levels3DPreview.interactionManager._mouseHoverIntersect.intersect;
        const point = currentHover.point;
        const normal = currentHover.face.normal;
        const finalPoint = new THREE.Vector3().addVectors(point, normal.multiplyScalar(0.1));
        const direction = new THREE.Vector3().subVectors(point, finalPoint).normalize();
        return new ProceduralVines(finalPoint, direction, radius, generations);
    }

    static createVinesTile(generations = 1, radius = 1) {
        const vines = ProceduralVines.fromCurrentHover(generations, radius);
        const geometry = new VineGeometry(vines.vines).geometry;
        geometry.computeBoundingBox();
        const offset = geometry.boundingBox.min;
        const positionAttributes = geometry.getAttribute("position");
        const count = positionAttributes.count;
        for (let i = 0; i < count; i++) {
            const x = positionAttributes.getX(i);
            const y = positionAttributes.getY(i);
            const z = positionAttributes.getZ(i);
            positionAttributes.setXYZ(i, x - offset.x, y - offset.y, z - offset.z);
        }
        positionAttributes.needsUpdate = true;

        const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
        const height = geometry.boundingBox.max.z - geometry.boundingBox.min.z;
        const depth = geometry.boundingBox.max.y - geometry.boundingBox.min.y;

        const vineData = vines.toJSON();

        const tileData = {
            x: offset.x * factor,
            y: offset.z * factor,
            width: width * factor,
            height: height * factor,
            flags: {
                "levels-3d-preview": {
                    dynaMesh: "vines",
                    model3d: JSON.stringify(vineData).replaceAll('"', "'"),
                    depth: depth * factor,
                    autoCenter: true,
                    autoGround: true,
                    sight: false,
                    collision: false,
                    color: "#00ff00",
                },
                levels: {
                    rangeBottom: (offset.y * factor) / canvas.scene.dimensions.size * canvas.scene.dimensions.distance,
                }
            }
        }
        canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
    }
}

class VineArm{
    constructor (point, direction, origin, radius, baseGeometry, maxGenerations = 8, generation) {
        this.point = point;
        this.direction = direction;
        this.origin = origin;
        this.radius = radius;
        this.baseGeometry = baseGeometry;
        this.generation = generation;
        this.maxGenerations = maxGenerations;
        this.children = [];
        this._currentPoint = point;
        this._currentDirection = direction;
        this.vine = [];
        if(this.generation == 0) this.vine.push(new THREE.Vector3(origin.x, origin.y, origin.z))
        this.vine.push(new THREE.Vector3(point.x, point.y, point.z))
        let growing = true;
        for (let i = 0; i < 12 * this.radius; i++){
            if(!growing) break;
            growing = this.grow();
        }
    }

    grow() {
        const { _currentPoint, _currentDirection, origin, baseGeometry, generation, maxGenerations, radius } = this;
        const closestPoints = getClosestPoints(baseGeometry, _currentPoint);
        const randomDotOffset = Math.random() > 0.85 ? Math.random() * 0.3 : 0;
        //find point with most similar direction
        const closestPoint = closestPoints.reduce((prev, curr) => {
            const prevDirection = new THREE.Vector3().subVectors(origin, prev);
            const currDirection = new THREE.Vector3().subVectors(origin, curr);
            return prevDirection.dot(_currentDirection) > currDirection.dot(_currentDirection) - randomDotOffset ? prev : curr;
        });
        const closestPointDirection = new THREE.Vector3().subVectors(origin, closestPoint);
        const closestPointDistance = closestPoint.distanceTo(origin);
        if (closestPointDistance > this.radius) return false;
        const closestPointDirectionNormalized = closestPointDirection.clone().normalize();

        const newPoint = closestPoint//new THREE.Vector3().addVectors(_currentPoint, closestPointDirectionNormalized.multiplyScalar(closestPointDistance));
        this.vine.push(newPoint);
        this._currentPoint = newPoint;
        this._currentDirection = closestPointDirectionNormalized;
        if (Math.random() > 0.8 && generation < maxGenerations) {
            const newVineArmDirection = new THREE.Vector3().addVectors(closestPointDirectionNormalized, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.5));
            this.children.push(new VineArm(newPoint, newVineArmDirection, origin, radius, baseGeometry, maxGenerations, generation + 1));
        }
        return true;
    }

    toJSON(offset = new THREE.Vector3()) {
        const children = this.children.map(child => child.toJSON());
        return {
            vine: this.vine.map(point => [point.x - offset.x, point.y - offset.y, point.z - offset.z]),
            children
        };
    }
}

function getClosestPoints(geometry, point, amount = 10) {
    const positionAttributes = geometry.getAttribute("position");
    const count = positionAttributes.count;
    const allPoints = [];
    for (let i = 0; i < count; i++) { 
        const x = positionAttributes.getX(i);
        const y = positionAttributes.getY(i);
        const z = positionAttributes.getZ(i);
        allPoints.push(new THREE.Vector3(x, y, z));
    }
    allPoints.sort((a, b) => a.distanceTo(point) - b.distanceTo(point));
    const closestPoints = allPoints.slice(1, amount);
    return closestPoints;
}

function getRandomPoints(geometry, amount = 10, maxDistance = Infinity, distanceOrigin = new THREE.Vector3()) {

    const positionAttributes = geometry.getAttribute("position");
    const count = positionAttributes.count;
    const allPoints = [];
    for (let i = 0; i < count; i++) { 
        const x = positionAttributes.getX(i);
        const y = positionAttributes.getY(i);
        const z = positionAttributes.getZ(i);
        const point = new THREE.Vector3(x, y, z);
        if (point.distanceTo(distanceOrigin) > maxDistance) continue;
        allPoints.push(point);
    }
    const randomPoints = [];
    for (let i = 0; i < amount; i++) {
        const randomIndex = Math.floor(Math.random() * allPoints.length);
        randomPoints.push(allPoints[randomIndex]);
    }
    return randomPoints;
}

export class VineGeometry{
    constructor (vines, radius = 0.002, leavesDensity = 0.05) {
        this.vines = vines;
        this.radius = radius;
        this.leavesDensity = leavesDensity / 10;
        this.geometry = null;
        this.leaves = [];
        this._createGeometry();
    }

    _createGeometry() {
        for (const vine of this.vines) {
            this._createVineGeometry(vine);
        }
        const baseLeaf = this._createLeafGeometry();
        const positionAttributes = this.complexVinesGeometry.getAttribute("position");
        const normalAttributes = this.complexVinesGeometry.getAttribute("normal");
        const count = positionAttributes.count;
        for (let i = 0; i < count; i++) {
            if (Math.random() > this.leavesDensity) continue;
            const x = positionAttributes.getX(i);
            const y = positionAttributes.getY(i);
            const z = positionAttributes.getZ(i);

            const leaf = baseLeaf.clone();
            const randomScale = Math.random() + 0.5;
            leaf.scale(randomScale, randomScale, randomScale);
            leaf.rotateX(Math.random() * Math.PI * 2);
            leaf.rotateY(Math.random() * Math.PI * 2);
            leaf.rotateZ(Math.random() * Math.PI * 2);
            leaf.translate(x, y, z);

            this.leaves.push(leaf);

        }
        for (const leaf of this.leaves) { 
            //create a random shade of black and white
            const randomColor = Math.random()*0.5 + 0.5;
            const color = new THREE.Color(randomColor, randomColor, randomColor);
            //create color buffer attribute
            const colorBuffAttribute = new THREE.BufferAttribute(new Float32Array(leaf.getAttribute("position").count * 3), 3);
            leaf.setAttribute("color", colorBuffAttribute);
            //set vertex colors
            const colorAttribute = leaf.getAttribute("color");
            const count = colorAttribute.count;
            for (let i = 0; i < count; i++) {
                colorAttribute.setXYZ(i, color.r, color.g, color.b);
            }
        }

        //set vine color attribute
        const colorBuffAttribute = new THREE.BufferAttribute(new Float32Array(this.geometry.getAttribute("position").count * 3), 3);
        const color = new THREE.Color("#404040");
        this.geometry.setAttribute("color", colorBuffAttribute);
        const colorAttribute = this.geometry.getAttribute("color");
        for (let i = 0; i < colorAttribute.count; i++) {
            colorAttribute.setXYZ(i, color.r, color.g, color.b);
        }

        this.geometry = mergeBufferGeometries([this.geometry, ...this.leaves]);
    }

    _createLeafGeometry() {
        const shape = new THREE.Shape();
        
        //create a leaf shape

        
        shape.moveTo(0, 0);
        shape.lineTo(0.5, 0);
        shape.lineTo(0.5, 0.5);
        shape.lineTo(0.25, 0.75);
        shape.lineTo(0.25, 1);
        shape.lineTo(0, 0.75);
        shape.lineTo(0, 0);



        const shapeGeometry = new THREE.ShapeGeometry(shape, 1);
       
        shapeGeometry.scale(0.02, 0.02, 0.02)
        
        return shapeGeometry;
    }

    _createVineGeometry(vine) {

        const curvePoints = vine.vine.map(point => point instanceof THREE.Vector3 ? point : new THREE.Vector3(point[0], point[1], point[2]));

        const curve = new THREE.CatmullRomCurve3(curvePoints);
        const curveGeometry = new THREE.TubeGeometry(curve, 8, this.radius, 3, false);
        this.geometry = !this.geometry ? curveGeometry : mergeBufferGeometries([this.geometry, curveGeometry]);
        this.complexVinesGeometry = !this.complexVinesGeometry ? curveGeometry : mergeBufferGeometries([this.complexVinesGeometry, new THREE.TubeGeometry(curve, 100, this.radius, 1, false)]);
        if (vine.children?.length) {
            for (const child of vine.children) {
                this._createVineGeometry(child);
            }
        }
    }


}