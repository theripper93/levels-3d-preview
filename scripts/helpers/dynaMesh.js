import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "../lib/three-mesh-bvh.js";
import {mergeBufferGeometries} from "../lib/BufferGeometryUtils.js";
import { DecalGeometry } from "../lib/DecalGeometry.js";
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
        return geometry;
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
        return geometry;
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
        return geometry;
    }

    _constructpolygonbevelsolidify() {
        if (this.text.includes("#")) {
            const split = this.text.split("#") / factor;
            this.solidifyThickness = parseFloat(split[0]);
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
        return geometry;
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
        return geometry;
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
    
    points.push(points[0]);
    
    const solidifiedPoints = [];
    for (let i = 0; i < points.length; i += 1) { 
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const prev = points[(i - 1 + points.length) % points.length];
        
        const currentNextNormal = new THREE.Vector2(next.x - current.x, next.y - current.y).normalize();
        const currentPrevNormal = new THREE.Vector2(current.x - prev.x, current.y - prev.y).normalize();
        const currentNormal = new THREE.Vector2(currentNextNormal.x + currentPrevNormal.x, currentNextNormal.y + currentPrevNormal.y).normalize();
        const currentNormalPerp = new THREE.Vector2(-currentNormal.y, currentNormal.x);

        solidifiedPoints.push(current.x + currentNormalPerp.x * solidifyThickness, current.y + currentNormalPerp.y * solidifyThickness);
    }
    points.reverse();

    for (let i = 0; i < points.length; i += 1) {
        const current = points[i];
        solidifiedPoints.push(current.x, current.y);
    }

    return solidifiedPoints;


}