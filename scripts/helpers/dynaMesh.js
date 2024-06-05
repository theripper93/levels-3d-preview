import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "../lib/three-mesh-bvh.js";
import {mergeBufferGeometries, toTrianglesDrawMode, mergeVertices} from "../lib/BufferGeometryUtils.js";
import {DecalGeometry} from "../lib/DecalGeometry.js";
import {ImprovedNoise} from "../lib/imporovedNoise.js";
import {fbm3d} from "../lib/noiseFunctions.js";
import {VineGeometry} from "./ProceduralVines.js";
import { imageTo3d } from "./imageTo3D.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const defaultFont = "modules/levels-3d-preview/assets/helvetiker.json";

const fonts = {};
export class DynaMesh {
    constructor(type, { width = 1, height = 1, depth = 1, resolution = 1, text = "", decalData = {}, image = null, font = "modules/levels-3d-preview/assets/helvetiker.json" }) {
        this.type = type;
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.resolution = resolution;
        this.text = text;
        this.decalData = decalData;
        this.image = image;
        this.font = font || defaultFont;
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
        try {
            return this[`_construct${this.type}`]();
        } catch {
            console.error(`DynaMesh: Failed to construct ${this.type} geometry. Using box instead.`);
            this.type = "box";
            return this[`_construct${this.type}`]();
        }
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

    _constructplane() {
        const geometry = new THREE.PlaneGeometry(this.width, this.depth, Math.ceil((this.width / this._gridUnit) * this.resolution), Math.ceil((this.height / this._gridUnit) * this.resolution));
        
        const placeholderPlane = new THREE.PlaneGeometry(this.width, this.depth, 1, 1);

        placeholderPlane.translate(0, 0, -this.height);
        placeholderPlane.scale(0.0000001, 0.0000001, 0.0000001);


        return mergeBufferGeometries([geometry, placeholderPlane]);
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
        const font = fonts[this.font] || (fonts[this.font] = await loadTextFont(this.font));
        const geometry = new THREE.TextGeometry(this.text, {
            font: font,
            size: (this.width + this.depth) / 2,
            height: this.height,
            curveSegments: this.resolution,
        });
        geometry.center();
        return geometry;
    }

    async _constructcounter() {
        const font = fonts[this.font] || (fonts[this.font] = await loadTextFont(this.font));
        const textGeometry = new THREE.TextGeometry(this.text || "0", {
            font: font,
            size: (this.width + this.depth),
            height: this.height,
            curveSegments: this.resolution,
        });
        textGeometry.center();
        textGeometry.rotateX(Math.PI / 2 + Math.PI);
        textGeometry.scale(1, 0.5, 1)
        textGeometry.translate(0, this.depth / 4, 0);

        //scale text to fit in box
        const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
        const textHeight = textGeometry.boundingBox.max.z - textGeometry.boundingBox.min.z;

        const maxTextWidth = this.width * 0.9;
        const maxTextHeight = this.height * 0.9;

        const textScale = Math.min(maxTextWidth / textWidth, maxTextHeight / textHeight);

        textGeometry.scale(textScale, 1, textScale);

        const roundedRectShape = new THREE.Shape();
        const x = 0
        const y = 0
        const width = this.width;
        const height = this.height;
        const radius = this.depth / 2;
        roundedRectShape.moveTo(x + radius, y);
        roundedRectShape.lineTo(x + width - radius, y);
        roundedRectShape.quadraticCurveTo(x + width, y, x + width, y + radius);
        roundedRectShape.lineTo(x + width, y + height - radius);
        roundedRectShape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        roundedRectShape.lineTo(x + radius, y + height);
        roundedRectShape.quadraticCurveTo(x, y + height, x, y + height - radius);
        roundedRectShape.lineTo(x, y + radius);
        roundedRectShape.quadraticCurveTo(x, y, x + radius, y);
        const extrudeSettings = {
            steps: 2,
            depth: this.depth,
            bevelEnabled: true,
            bevelThickness: 0.011,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: this.resolution,
        };
        const roundedRectGeometry = new THREE.ExtrudeGeometry(roundedRectShape, extrudeSettings);

        roundedRectGeometry.rotateX(Math.PI / 2);
        roundedRectGeometry.center();

        //set vertex colors to black
        const positionAttribute = roundedRectGeometry.getAttribute("position");
        const colorBuffAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
        roundedRectGeometry.setAttribute("color", colorBuffAttribute);

        for (let i = 0; i < positionAttribute.count; i++) {
            colorBuffAttribute.setXYZ(i, 0.2, 0.2, 0.2);
        }

        //set vertex colors to white on text
        const textPositionAttribute = textGeometry.getAttribute("position");
        const textColorBuffAttribute = new THREE.BufferAttribute(new Float32Array(textPositionAttribute.count * 3), 3);
        textGeometry.setAttribute("color", textColorBuffAttribute);

        for (let i = 0; i < textPositionAttribute.count; i++) {
            textColorBuffAttribute.setXYZ(i, 1, 1, 1);
        }



        const mergedGeometry = mergeBufferGeometries([textGeometry, roundedRectGeometry]);




        return mergedGeometry;
    }

    _constructcounterradial() {
        //creates a radial counter with a pie style shape, every slice is a separate geometry
        const values = this.text.split("|");
        const max = parseInt(values[0] ?? 10);
        const current = parseInt(values[1] ?? total);

        const roundedRectShape = new THREE.Shape();
        const x = 0
        const y = 0
        const width = this.width;
        const height = this.height;
        const radius = this.depth / 2;
        roundedRectShape.moveTo(x + radius, y);
        roundedRectShape.lineTo(x + width - radius, y);
        roundedRectShape.quadraticCurveTo(x + width, y, x + width, y + radius);
        roundedRectShape.lineTo(x + width, y + height - radius);
        roundedRectShape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        roundedRectShape.lineTo(x + radius, y + height);
        roundedRectShape.quadraticCurveTo(x, y + height, x, y + height - radius);
        roundedRectShape.lineTo(x, y + radius);
        roundedRectShape.quadraticCurveTo(x, y, x + radius, y);
        const extrudeSettings = {
            steps: 2,
            depth: this.depth,
            bevelEnabled: true,
            bevelThickness: 0.011,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: this.resolution,
        };
        const roundedRectGeometry = new THREE.ExtrudeGeometry(roundedRectShape, extrudeSettings);

        roundedRectGeometry.rotateX(Math.PI / 2);
        roundedRectGeometry.center();

        //set vertex colors to black
        const positionAttribute = roundedRectGeometry.getAttribute("position");
        const colorBuffAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
        roundedRectGeometry.setAttribute("color", colorBuffAttribute);

        for (let i = 0; i < positionAttribute.count; i++) {
            colorBuffAttribute.setXYZ(i, 0.2, 0.2, 0.2);
        }

        //create pie slices
        
        const pieSlices = [];
        const maxSlices = max;
        const currentSlices = current;

        if(!currentSlices) return roundedRectGeometry;

        const sliceAngle = (Math.PI * 2) / maxSlices;
        const slicePaddedAngle = sliceAngle * 0.8;

        const baseRadius = (Math.min(this.width, this.height) / 2);

        const pieRadius = baseRadius * 0.80;

        const centerOffset = baseRadius * 0.15;

        const slice = new THREE.Shape();
        slice.moveTo(centerOffset, 0);
        const x1 = Math.cos(-slicePaddedAngle/2) * pieRadius;
        const y1 = Math.sin(-slicePaddedAngle/2) * pieRadius;
        const x2 = Math.cos(slicePaddedAngle/2) * pieRadius;
        const y2 = Math.sin(slicePaddedAngle / 2) * pieRadius;
        const midPointX = Math.cos(0) * pieRadius;
        const midPointY = Math.sin(0) * pieRadius;
        slice.lineTo(x1, y1);
        slice.quadraticCurveTo(midPointX, midPointY, x2, y2);
        slice.lineTo(centerOffset, 0);

        const extrudeSettings2 = {
            steps: 2,
            depth: this.depth,
            bevelEnabled: true,
            bevelThickness: 0.011 / maxSlices,
            bevelSize: 0.06 / maxSlices,
            bevelOffset: 0,
            bevelSegments: this.resolution,
        }

        const sliceGeometry = new THREE.ExtrudeGeometry(slice, extrudeSettings2);
        sliceGeometry.translate(0, 0, 0);

        for (let i = 0; i < currentSlices; i++) {
            pieSlices.push(sliceGeometry.clone());
            sliceGeometry.rotateZ(sliceAngle);
        }
        
        const mergedPieSliceGeometry = mergeBufferGeometries(pieSlices);
        mergedPieSliceGeometry.rotateX(Math.PI / 2);
        mergedPieSliceGeometry.rotateY((Math.PI/2 - sliceAngle/2))
        mergedPieSliceGeometry.translate(0, this.depth, 0);

        //set vertex colors to white on text
        const textPositionAttribute = mergedPieSliceGeometry.getAttribute("position");
        const textColorBuffAttribute = new THREE.BufferAttribute(new Float32Array(textPositionAttribute.count * 3), 3);
        mergedPieSliceGeometry.setAttribute("color", textColorBuffAttribute);

        for (let i = 0; i < textPositionAttribute.count; i++) {
            textColorBuffAttribute.setXYZ(i, 1, 1, 1);
        }

        const mergedGeometry = mergeBufferGeometries([mergedPieSliceGeometry, roundedRectGeometry]);

        return mergedGeometry;
    }

    _constructrock() { 
        const geometry = new THREE.BoxGeometry(this.width, this.depth, this.height, Math.ceil((this.width / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution), Math.ceil((this.height / this._gridUnit) * this.resolution));
        const noise = new ImprovedNoise();
        const position = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
            vertex.fromBufferAttribute(position, i);
            const offset = fbm3d(vertex.x, vertex.y, vertex.z, { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 1, exponent: 2 });
            vertex.multiplyScalar(1 + offset);
            position.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        position.needsUpdate = true;
        return geometry;
    }

    _constructrocksphere() {
        const geometry = new THREE.SphereGeometry(this._avgAll, Math.ceil((this._avgWidthHeight / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution));
        const position = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
            vertex.fromBufferAttribute(position, i);
            const offset = fbm3d(vertex.x, vertex.y, vertex.z, { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: this.resolution*4, exponent: 2 }) * 2;
            vertex.multiplyScalar(1 + offset);
            position.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        return geometry;
    }

    _constructrockcone() { 
        const geometry = new THREE.ConeGeometry(this._avgWidthHeight, this.depth, Math.ceil((this._avgWidthHeight / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution), false);
        const position = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
            vertex.fromBufferAttribute(position, i);
            const offset = fbm3d(vertex.x, vertex.y, vertex.z, { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 2, exponent: 2 }) * 2;
            vertex.multiplyScalar(1 + offset);
            position.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        return geometry;
    }

    _constructrockcylinder() {
        const geometry = new THREE.CylinderGeometry(this._avgWidthHeight, this._avgWidthHeight, this.depth, Math.ceil((this._avgWidthHeight / this._gridUnit) * this.resolution), Math.ceil((this.depth / this._gridUnit) * this.resolution), false);
        const position = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
            vertex.fromBufferAttribute(position, i);
            const offset = fbm3d(vertex.x, vertex.y, vertex.z, { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 2, exponent: 2 }) * 2;
            vertex.multiplyScalar(1 + offset);
            position.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
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
        if (this.text.includes("#")){
            const split = this.text.split("#");
            this.bevelSett = JSON.parse((split[0] || "{}").replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": '));
            this.text = split[1];
        }
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
            ...this.bevelSett,
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
            bevelEnabled: true,
            bevelThickness: 0.011,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: 3,
        };
        let geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry = applyJagged(geometry, pixiP, 10, this.depth * 5, this.solidifyThickness * 100, false);
        geometry.rotateX(Math.PI / 2);
        geometry.center();
        
        return mergeBufferGeometries([geometry]);
    }

    _constructpolygonbevelsolidifyjaggeddouble() {
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
            bevelEnabled: true,
            bevelThickness: 0.011,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: 3,
        };
        let geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry = applyJagged(geometry, pixiP, 10, this.depth * 4, this.depth * 4, true);
        geometry.rotateX(Math.PI / 2);
        geometry.center();
        
        return mergeBufferGeometries([geometry]);
    }

    _constructpolygonbevelsolidifyjaggedstraight() {
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
            bevelEnabled: true,
            bevelThickness: 0.011,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: 3,
        };
        let geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry = applyJagged(geometry, pixiP, 10, 1, 0.1, false);
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

    _constructpolygonchain() {
        let chainLinkSize = 0.01;
        if (this.text.includes("#")) {
            const split = this.text.split("#");
            chainLinkSize = Math.max(parseFloat(split[0])/100, chainLinkSize);
            this.text = split[1];
        }

        const points = this.text.split(",").map((point) => parseInt(point) / factor);

        const vector2Points = [];
        for (let i = 0; i < points.length; i += 2) {
            vector2Points.push(new THREE.Vector2(points[i], points[i + 1]));
        }
        const curve = new THREE.SplineCurve(vector2Points);
        const totalLength = curve.getLength();
        const chainLinkCount = Math.max(Math.floor(totalLength / chainLinkSize) * 1.2, 1);
        const geometries = [];
        for (let i = 0; i < chainLinkCount; i++) {
            const geometry = new THREE.TorusGeometry(chainLinkSize / 2, chainLinkSize / 5, 8, 8)
            const fac = (chainLinkSize / 2) / (chainLinkSize / 5);
            geometry.scale(1, 0.3, 1/fac)
            const isEven = i % 2 === 0;
            geometry.rotateX(isEven ? Math.PI / 2 : 0);
            const tangent = curve.getTangentAt(i / chainLinkCount);
            const angle = Math.atan2(tangent.y, tangent.x);
            geometry.rotateZ(angle);
            const position = curve.getPointAt(i / chainLinkCount);
            geometry.translate(position.x, position.y, 0);
            geometries.push(geometry);
        }
        const geometry = mergeBufferGeometries(geometries);
        geometry.rotateX(Math.PI / 2);
        geometry.center();
        return geometry;


    }

    _constructstairs() {
        const params = this.text.split(",");
        const hollow = params[1] === "hollow";
        const stepsMultiParam = parseFloat(params[0])
        const stepsMulti = isNaN(stepsMultiParam) ? 4 : stepsMultiParam || 4;
        const gridSize = canvas.scene.dimensions.size / factor;
        const nSteps = Math.ceil((this.depth / gridSize) * stepsMulti);
        const stepHeight = this.depth / nSteps;
        const stepWidth = this.width / nSteps;

        if (this.width < gridSize) { 
            const ladderPillarGeometry = new THREE.CylinderGeometry(this.width / 2, this.width / 2, this.depth, 8);
            const ladderStepGeometry = new THREE.CylinderGeometry(this.width / 4, this.width / 4, this.height, 8);
            ladderStepGeometry.rotateX(Math.PI / 2);
            ladderStepGeometry.translate(0, 0, 0);
            const geometries = [];

            for (let i = 1; i < nSteps; i++) {
                const ladderStep = ladderStepGeometry.clone();
                ladderStep.translate(0, i * stepHeight, 0);
                geometries.push(ladderStep);
            }

            const ladderPillar = ladderPillarGeometry.clone();
            ladderPillar.translate(0 , this.depth / 2, - this.height/2);
            geometries.push(ladderPillar);
            const ladderPillar2 = ladderPillarGeometry.clone();
            ladderPillar2.translate(0, this.depth / 2, this.height / 2);
            geometries.push(ladderPillar2);

            const geometry = mergeBufferGeometries(geometries);
            geometry.center();
            return geometry;




        } else {            
            const shape = new THREE.Shape();
    
            if (!hollow) {
                shape.moveTo(this.width, this.depth);
                shape.lineTo(this.width, 0);
            }
            for (let i = 0; i < nSteps; i++) {
                shape.lineTo(i * stepWidth, i * stepHeight);
                shape.lineTo(i * stepWidth, (i + 1) * stepHeight);
            }
            shape.lineTo(this.width, this.depth);
    
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
            geometry.center();
            return mergeBufferGeometries([geometry]);
        }

    }

    _constructvines() {
        const vineData = JSON.parse(this.text.replaceAll("'", '"'));
        const vineGeo = new VineGeometry(vineData, 0.002, this.resolution);
        vineGeo.geometry.computeBoundingBox();
        return vineGeo.geometry;
    }

    async _constructpaper() {
        if (!this.image) {
            ui.notifications.error("ERROR: Paper Cutout dynamesh requires an image to be set in the texture field.")
            return this._constructbox();
        }
        
        const texture = await game.Levels3DPreview.helpers.loadTexture(this.image);
        const paperStyle = await imageTo3d(texture.image, true);
        return paperStyle;        
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

export async function loadTextFont(fontPath) {
    try {        
        const loader = new THREE.FontLoader();
        const font = await loader.loadAsync(fontPath || defaultFont);
        return font;
    } catch (error) {
        ui.notifications.error(`ERROR: Could not load font ${fontPath}. Using default font instead.`);
        return await loadTextFont(defaultFont);
    }
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

function applyJagged(geometry, pixiP, scale = 10, strength = 1, curvature = 1, doubleSided = true) {
    curvature = Math.min(curvature, 2)
    geometry.computeBoundingBox();
    const polygonVec2 = [];
    for (let i = 0; i < pixiP.points.length; i += 2) {
        polygonVec2.push(new THREE.Vector2(pixiP.points[i], pixiP.points[i + 1]));
    }
    const positionAttributes = geometry.getAttribute("position");
    const count = positionAttributes.count;
    const improvedNoise = new ImprovedNoise();
    const minZ = geometry.boundingBox.min.z;
    const maxZ = geometry.boundingBox.max.z;
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    for (let i = 0; i < count; i++) {
        const x = positionAttributes.getX(i);
        const y = positionAttributes.getY(i);
        const z = positionAttributes.getZ(i);
        const isInside = pixiP.contains(x, y);
        if (!isInside && !doubleSided) continue;
        const currentPointV2 = new THREE.Vector2(x, y);
        const closestPoint = polygonVec2.reduce((prev, curr) => {
            return prev.distanceTo(currentPointV2) < curr.distanceTo(currentPointV2) ? prev : curr;
        });
        const displacementSign = isInside ? 1 : 1;
        const displacementDirection = new THREE.Vector2().subVectors(currentPointV2, closestPoint).normalize();
        const zPercent = (z - minZ) / (maxZ - minZ);
        if (zPercent < 0.05) continue;
        const curve = 1 - Math.sin(zPercent * Math.PI) * curvature;
        const displacement = (1 - improvedNoise.noise(x * scale, y * scale, z * scale)) * curve; //1 - this.getPixel(this.displacementMap, xPercent*zPercent, yPercent).r / 255;
        const displaced = currentPointV2.add(displacementDirection.clone().multiplyScalar(displacement * displacementSign * strength * 0.05));
        const hasOvershot = isInside ? !pixiP.contains(displaced.x, displaced.y) : pixiP.contains(displaced.x, displaced.y);
        positionAttributes.setX(i, hasOvershot ? closestPoint.x : displaced.x);
        positionAttributes.setY(i, hasOvershot ? closestPoint.y : displaced.y);
    }
    geometry.attributes.position.needsUpdate = true;
    return geometry
}


