
import * as THREE from "../lib/three.module.js";
import { mergeBufferGeometries } from "../lib/BufferGeometryUtils.js";
import { factor } from "../main.js";
const validTemplateTypes = ["circle", "rectangle", "cone", "ray", "ring"];

export class Shape3D extends THREE.Object3D {
    constructor(extrude) {
        super();
        this.extrude = extrude;
    }

    addToScene() {
        game.Levels3DPreview.scene.add(this);
    }

    destroy() {
        game.Levels3DPreview.scene.remove(this);
    }

    static create({ shape, type, origin, destination, extrude }) {
        type ??= shape.type;
        switch (type) {
            case "rectangle":
            case "rect":
            case "box":
                return new Box3D({ shape, origin, destination, extrude, draw: true });
            case "circle":
                return new Sphere3D({ shape, origin, destination, extrude, draw: true });
            case "ellipse":
                return new Cylinder3D({ shape, origin, destination, extrude, draw: true });
            case "cone":
                return new Cone3D({ shape, origin, destination, extrude, draw: true });
        }
        return new Extrude3D({ shape, origin, destination });
    }

    _get3DData() {

    }

    _getGeometry() {

    }

    updateVisibility() {

    }

    containsPoint(point) {
        return false;
    }

    async fromPreview(create = true) {
        let document;
        const selectedRegion = canvas.regions.controlled[0];
        if (selectedRegion) {
            document = await selectedRegion.document.update({
                shapes: [
                    ...selectedRegion.document.shapes,
                    this.shape
                ]
            })
        } else {
            document = await canvas.scene.createEmbeddedDocuments("Region", [{
                name: "3DCanvas",
                elevation: {
                    bottom: this.elevationBottom * canvas.dimensions.size,
                    top: this.elevationTop * canvas.dimensions.size
                },
                shapes: [this.shape],
            }])?.[0];
        }
        this.destroy();
        return document;
    }

    drawExtrude() {
        const shapes = this._buildShapesFromTree(this.shape.polygonTree);
        const geometry = new THREE.ExtrudeGeometry(shapes, {
            depth: this.height,
            bevelEnabled: false,
        });
        geometry.rotateX(Math.PI / 2);
        geometry.center();

        const material = this.material ?? new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.add(mesh);
    }

    _polygonToShape(polygon) {
        const shape = new THREE.Shape();
        this._applyPointsToPath(polygon.points, shape);
        return shape;
    }

    _polygonToPath(polygon) {
        const path = new THREE.Path();
        this._applyPointsToPath(polygon.points, path);
        return path;
    }

    _applyPointsToPath(pts, target) {
        target.moveTo(pts[0] / factor, pts[1] / factor);
        for (let i = 2; i < pts.length; i += 2) {
            target.lineTo(pts[i] / factor, pts[i + 1] / factor);
        }
        target.closePath();
    }

    _buildShapesFromTree(node, depth = 0) {
        const shapes = [];
        for (const child of node.children ?? []) {
            if (depth % 2 === 0) {
                const threeShape = this._polygonToShape(child.polygon);
                for (const holeNode of child.children ?? []) {
                    threeShape.holes.push(this._polygonToPath(holeNode.polygon));
                    shapes.push(...this._buildShapesFromTree(holeNode, depth + 2));
                }
                shapes.push(threeShape);
            }
        }
        return shapes;
    }
}

export class Box3D extends Shape3D {
    constructor({ shape = null, origin = null, destination = null, material = null, extrude = false, draw = false }) {
        super(extrude);
        if (!shape) {
            this.width = destination.x - origin.x;
            this.height = destination.y - origin.y;
            this.depth = destination.z - origin.z;
            this.elevation = origin.y;
            shape = new foundry.data.RectangleShapeData({
                type: "rectangle",
                hole: false,
                x: origin.x * factor,
                y: origin.z * factor,
                width: this.width * factor,
                height: this.depth * factor,
                anchorX: 0,
                anchorY: 0,
                rotation: 0,
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
                shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ?
                shape.parent.elevation.top / canvas.dimensions.size : 0;
            origin = {
                x: shape.x / factor,
                y: bottom,
                z: shape.y / factor,
            };
            this.width = shape.width / factor;
            this.depth = shape.height / factor;
            this.elevation = bottom;
            this.height = top - bottom;
        }
        this.elevationBottom = this.elevation;
        this.elevationTop = this.elevation + this.height;
        this.shape = shape;
        this.material = material;
        this.origin = {
            x: origin.x + this.width / 2,
            z: origin.z + this.depth / 2,
            y: origin.y + this.height / 2,
        };
        if (!draw) return;
        if (this.extrude) return this.drawExtrude();
        return this.drawShape();
    }

    drawShape() {
        const material = this.material ?? new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const geometry = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.add(mesh);
    }

    containsPoint(point) {
        if (point.x < this.origin.x) return false;
        if (point.x > this.origin.x + this.width) return false;
        if (point.y < this.origin.y) return false;
        if (point.y > this.origin.y + this.height) return false;
        if (point.z < this.origin.z) return false;
        if (point.z > this.origin.z + this.depth) return false;
        return true;
    }
}

export class Sphere3D extends Shape3D {
    constructor({ shape = null, origin = null, destination = null, material = null, extrude = false, draw = false }) {
        super(extrude);
        if (origin) origin = new THREE.Vector3(origin.x, origin.y, origin.z);
        if (destination) destination = new THREE.Vector3(destination.x, destination.y, destination.z);
        if (!shape) {
            this.radius = destination.distanceTo(origin);
            this.elevation = origin.y;
            shape = new foundry.data.CircleShapeData({
                type: "circle",
                hole: false,
                x: origin.x * factor,
                y: origin.z * factor,
                radius: this.radius * factor,
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
                shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            this.radius = shape.radius / factor;
            this.elevation = bottom + this.radius;
            origin = {
                x: shape.x / factor,
                y: this.elevation,
                z: shape.y / factor,
            };
        }
        this.height = this.radius;
        this.elevationBottom = this.elevation - this.radius;
        this.elevationTop = this.elevation + this.radius;
        this.shape = shape;
        this.material = material;
        this.origin = origin;
        if (!draw) return;
        if (this.extrude) return this.drawExtrude();
        return this.drawShape();
    }

    drawShape() {
        const material = this.material ?? new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true });
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.add(mesh);
    }

    containsPoint(point) {
        if (!this.extrude) {
            const origin3d = new THREE.Vector3(this.origin.x, this.origin.y, this.origin.z);
            const point3d = new THREE.Vector3(point.x, point.y, point.z);
            const distance = origin3d.distanceTo(point3d);
            return distance * factor <= this.shape.radius;
        }
        const origin2d = new THREE.Vector2(this.origin.x, this.origin.z);
        const point2d = new THREE.Vector2(point.x, point.z);
        const distance = origin2d.distanceTo(point2d);
        if (distance > this.shape.radius) return false;
        if (this.origin.y > point.y) return false;
        if (this.origin.y + this.height < point.y) return false;
        return true;
    }
}

export class Cylinder3D extends Shape3D {
    constructor({ shape = null, origin = null, destination = null, material = null, extrude = false, draw = false }) {
        super(extrude);
        if (!shape) {
            this.radiusX = destination.x - origin.x;
            this.radiusZ = destination.z - origin.z;
            this.height = destination.y - origin.y;
            this.elevation = origin.y;
            shape = new foundry.data.EllipseShapeData({
                type: "ellipse",
                hole: false,
                x: (origin.x) * factor,
                y: (origin.z) * factor,
                radiusX: this.radiusX * factor,
                radiusY: this.radiusZ * factor,
                anchorX: 0,
                anchorY: 0,
                rotation: 0,
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
                shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ?
                shape.parent.elevation.top / canvas.dimensions.size : 0;
            origin = {
                x: shape.x / factor,
                y: bottom,
                z: shape.y / factor,
            };
            this.radiusX = shape.radiusX / factor;
            this.radiusZ = shape.radiusY / factor;
            this.elevation = bottom;
            this.height = top - bottom;
        }
        this.elevationBottom = this.elevation;
        this.elevationTop = this.elevation + this.height;
        this.shape = shape;
        this.material = material;
        this.origin = {
            x: origin.x,
            y: origin.y + this.height / 2,
            z: origin.z,
        };
        if (!draw) return;
        if (this.extrude) return this.drawExtrude();
        return this.drawShape();
    }

    drawShape() {
        const material = this.material ?? new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const geometry = new THREE.CylinderGeometry(1, 1, this.height, 32);
        geometry.scale(this.radiusX, 1, this.radiusZ);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.add(mesh);
    }

    containsPoint(point) {
        const dx = (point.x - this.origin.x) * factor / this.shape.radiusX;
        const dz = (point.z - this.origin.z) * factor / this.shape.radiusZ;
        if (dx * dx + dz * dz > 1) return false;
        if (point.y < this.origin.y) return false;
        if (point.y > this.origin.y + this.height) return false;
        return true;
    }
}

export class Cone3D extends Shape3D {
    constructor({ shape = null, origin = null, destination = null, material = null, extrude = false, draw = false }) {
        super(extrude);
        if (!shape) {
            const dx = destination.x - origin.x;
            const dz = destination.z - origin.z;
            this.angle = 60;
            const angleRad = this.angle * (Math.PI / 180);
            const shapeRadius = Math.sqrt(dx * dx + dz * dz);
            this.coneHeight = shapeRadius * Math.cos(angleRad / 2);
            this.baseRadius = shapeRadius * Math.sin(angleRad / 2);
            this.elevation = origin.y;
            this._rotation = Math.atan2(dz, dx) * (180 / Math.PI);
            shape = new foundry.data.ConeShapeData({
                type: "cone",
                hole: false,
                x: origin.x * factor,
                y: origin.z * factor,
                radius: shapeRadius * factor,
                angle: this.angle,
                rotation: this._rotation,
                curvature: "round",
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
                shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ?
                shape.parent.elevation.top / canvas.dimensions.size : 0;
            this.angle = shape.angle;
            if (this.angle > 90) this.extrude = true;
            const angleRad = this.angle * (Math.PI / 180);
            this._rotation = shape.rotation;
            const shapeRadius = shape.radius / factor;
            switch (shape.curvature) {
                case "flat":
                    this.coneHeight = shapeRadius;
                    this.baseRadius = shapeRadius * Math.tan(angleRad / 2);
                    break;
                case "round":
                    this.coneHeight = shapeRadius * Math.cos(angleRad / 2);
                    this.baseRadius = shapeRadius * Math.sin(angleRad / 2);
                    break;
                case "semicircle":
                    this.coneHeight = shapeRadius / (1 + Math.tan(angleRad / 2));
                    this.baseRadius = shapeRadius - this.coneHeight;
                    break;
            }
            console.log(this.coneHeight);
            const rad = this._rotation * (Math.PI / 180);
            this.elevation = (bottom + top) / 2;
            origin = {
                x: shape.x / factor,
                y: this.elevation,
                z: shape.y / factor,
            };
            destination = {
                x: origin.x + shapeRadius * Math.cos(rad),
                y: this.baseRadius,
                z: origin.z + shapeRadius * Math.sin(rad),
            };
        }
        this.height = this.baseRadius;
        this.elevationBottom = this.elevation - this.baseRadius;
        this.elevationTop = this.elevation + this.baseRadius;
        this.shape = shape;
        this.material = material;
        this.origin = {
            x: origin.x + (destination.x - origin.x) / 2,
            y: origin.y,
            z: origin.z + (destination.z - origin.z) / 2,
        };
        if (!draw) return;
        if (this.extrude) return this.drawExtrude();
        return this.drawShape();
    }

    drawShape() {
        switch (this.shape.curvature) {
            case "flat":
                return this.drawFlat();
            case "round":
                return this.drawRound();
            case "semicircle":
                return this.drawSemicircle();
        }
    }

    drawFlat() {
        const material = this.material ?? new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const geometry = new THREE.ConeGeometry(this.baseRadius, this.coneHeight, 32);
        geometry.rotateX(-this._rotation * (Math.PI / 180));
        geometry.rotateZ(Math.PI / 2);
        geometry.translate(this.origin.x, this.origin.y, this.origin.z);
        const mesh = new THREE.Mesh(geometry, material);
        this.add(mesh);
    }

    drawRound() {
        const phiStart = 0;
        const phiEnd = Math.PI * 2;
        const thetaStart = 0;
        const hypothenuse = Math.sqrt(this.baseRadius * this.baseRadius + this.coneHeight * this.coneHeight);
        const littleHeight = hypothenuse - this.coneHeight;
        const thetaEnd = this.angle * Math.PI / 360;
        
        const emisphereGeometry = new THREE.SphereGeometry(hypothenuse, 32, 16, phiStart, phiEnd, thetaStart, thetaEnd );
        emisphereGeometry.rotateX(Math.PI);
        emisphereGeometry.translate(0, this.coneHeight / 2, 0);
        const coneGeometry = new THREE.ConeGeometry(this.baseRadius, this.coneHeight, 32, 1, true);

        const geometry = mergeBufferGeometries([
            coneGeometry,
            emisphereGeometry
        ]);

        geometry.translate(0, littleHeight / 2, 0);
        geometry.rotateX(-this._rotation * (Math.PI / 180));
        geometry.rotateZ(Math.PI / 2);
        geometry.translate(this.origin.x, this.origin.y, this.origin.z);
        const material = this.material ?? new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const mesh = new THREE.Mesh(geometry, material);
        this.add(mesh);
    }

    drawSemicircle() {
        const phiStart = 0;
        const phiEnd = Math.PI * 2;
        const thetaStart = 0;
        const thetaEnd = Math.PI / 2;

        const emisphereGeometry = new THREE.SphereGeometry(this.baseRadius, 32, 16, phiStart, phiEnd, thetaStart, thetaEnd );
        emisphereGeometry.rotateX(Math.PI);
        emisphereGeometry.translate(0, -this.coneHeight / 2, 0);
        const coneGeometry = new THREE.ConeGeometry(this.baseRadius, this.coneHeight, 32, 1, true);

        const geometry = mergeBufferGeometries([
            coneGeometry,
            emisphereGeometry
        ]);

        geometry.translate(0, this.baseRadius / 2, 0);
        geometry.rotateX(-this._rotation * (Math.PI / 180));
        geometry.rotateZ(Math.PI / 2);
        geometry.translate(this.origin.x, this.origin.y, this.origin.z);
        const material = this.material ?? new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const mesh = new THREE.Mesh(geometry, material);
        this.add(mesh);
    }
}

export class Extrude3D extends Shape3D {
    constructor({ shape = null, shape3d = null, origin = null, destination = null, material = null }) {
        super();

        let polygons;

        if (!shape) {
            this.height = destination.y - origin.y;
            this.elevation = origin.y;
            polygons = shape.polygons;
            this.origin = {
                x: origin.x,
                y: origin.y + this.height / 2,
                z: origin.z,
            };
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom)
                ? shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            const top = Number.isFinite(shape.parent.elevation.top)
                ? shape.parent.elevation.top / canvas.dimensions.size : 0;
            origin = {
                x: shape.origin.x / factor,
                y: bottom,
                z: shape.origin.y / factor,
            };
            this.elevation = bottom;
            this.height = top - bottom;
            polygons = shape.polygons;
            const isCone = shape.type === "cone";
            this.origin = {
                x: origin.x + (isCone ? destination.x - origin.x : 0) / 2,
                y: origin.y + this.height / 2,
                z: origin.z + (isCone ? destination.z - origin.z : 0) / 2,
            };
        }

        this.shape = shape;

        const shapes = this._buildShapesFromTree(shape.polygonTree);

        const geometry = new THREE.ExtrudeGeometry(shapes, {
            depth: this.height,
            bevelEnabled: false,
        });

        geometry.rotateX(Math.PI / 2);
        geometry.center();

        material ??= new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.add(mesh);
    }
}

export class Ring3D extends Shape3D {
    constructor(shape, { build = false, origin, destination }) {
        if (build) {
            
        }
        super(shape);
    }
}

export class Line3D extends Shape3D {
    constructor(shape, { build = false, origin, destination }) {
        if (build) {
            
        }
        super(shape);
    }
}