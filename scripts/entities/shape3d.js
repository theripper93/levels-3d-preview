
import * as THREE from "../lib/three.module.js";
import { mergeBufferGeometries } from "../lib/BufferGeometryUtils.js";
import { DiagonalStripesMaterial } from "../shaders/regionMaterial.js";
import { factor } from "../main.js";

export class Shape3D extends THREE.Object3D {
    constructor({ extrude, material, color }) {
        super();
        this.material = material;
        this.extrude = extrude || !!this.getSelectedRegion();
        this.color = color ?? this.getSelectedRegion()?.document?.color?.css ?? this.getRandomColor();
    }
    #extrude = false;
    #height = 0.01;

    set extrude(value) {
        this.#extrude = value;
    }

    get extrude() {
        const alwaysFlat = game.settings.get("levels-3d-preview", "regionsAlwaysFlat");
        if (alwaysFlat) return true;
        return this.#extrude;
    }

    set height(value) {
        this.#height = value;
    }

    get height() {
        const alwaysFlat = game.settings.get("levels-3d-preview", "regionsAlwaysFlat");
        if (alwaysFlat) return 0.01;
        return this.#height;
    }

    addToScene() {
        game.Levels3DPreview.scene.add(this);
    }

    destroy() {
        game.Levels3DPreview.scene.remove(this);
    }

    getSelectedRegion() {
        const selectedRegion = canvas.regions.controlled[0];
        return selectedRegion;
    }

    getRandomColor() {
        const rand = Math.floor(Math.random() * 16777215);
        return '#' + (rand.toString(16).padStart(6, '0'));
    }

    getDefaultMaterial() {
        const material = new DiagonalStripesMaterial({ color: this.color });
        material.side = this.height < 0.01 ? THREE.FrontSide : THREE.DoubleSide;
        return material;
    }

    static create({ shape, type, origin, destination, material, extrude, hole = false, color }) {
        if (shape) {
            type = shape.type;
            extrude = shape.gridBased;
        }
        if (origin && destination) {
            origin = new THREE.Vector3(origin.x, origin.y, origin.z);
            destination = new THREE.Vector3(destination.x, destination.y, destination.z);
        }
        switch (type) {
            case "rectangle":
            case "rect":
            case "box":
                return new Box3D({ shape, origin, destination, material, extrude, hole, color, draw: true });
            case "circle":
                return new Sphere3D({ shape, origin, destination, material, extrude, hole, color, draw: true });
            case "ellipse":
                return new Ellipse3D({ shape, origin, destination, material, extrude, hole, color, draw: true });
            case "cone":
                return new Cone3D({ shape, origin, destination, material, extrude, hole, color, draw: true });
            case "ring":
                return new Torus3D({ shape, origin, destination, material, extrude, hole, color, draw: true });
            case "line":
                return new Ray3D({ shape, origin, destination, material, extrude, hole, color, draw: true });
            case "emanation":
                const baseType = shape?.base?.shape === 0 ? 0 : 4;
                return new Emanation3D({ shape, origin, destination, material, baseType, extrude, hole, color, draw: true });
        }
        if (!shape) return false;
        return new Extrude3D({ shape, origin, destination, material, extrude });
    }

    applySettings(mesh) {
        mesh.userData.collision = false;
        mesh.userData.cameraCollision = false;
        mesh.userData.sight = false;
        mesh.userData.ignoreHover = true;
        mesh.userData.noIntersect = true;
        // mesh.userData.noShaders = true;
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

    normalizePoints(origin, destination) {
        const tempOrigin = origin.clone();
        const tempDestination = destination.clone();
        origin.x = Math.min(tempOrigin.x, tempDestination.x);
        origin.y = Math.min(tempOrigin.y, tempDestination.y);
        origin.z = Math.min(tempOrigin.z, tempDestination.z);
        destination.x = Math.max(tempOrigin.x, tempDestination.x);
        destination.y = Math.max(tempOrigin.y, tempDestination.y);
        destination.z = Math.max(tempOrigin.z, tempDestination.z);
    }

    test() {
        foundry.canvas.layers.RegionLayer.prototype.placeRegion({
            name: "3DCanvas",
            color: this.color,
            elevation: {
                bottom: 0,
                top: 10
            },
            shapes: [
                new foundry.data.CircleShapeData({
                    type: "circle",
                    hole: false,
                    x: 0,
                    y: 0,
                    radius: 100,
                    gridBased: false,
                }, {})
            ],
        })
    }

    async fromPreview(create = true) {
        let document;
        const selectedRegion = this.getSelectedRegion();
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
                color: this.color,
                elevation: {
                    bottom: this.elevationBottom * factor / canvas.scene.dimensions.distancePixels,
                    top: this.elevationTop * factor / canvas.scene.dimensions.distancePixels
                },
                shapes: [this.shape],
            }])?.[0];
        }
        this.destroy();
        return document;
    }

    drawExtrude() {
        if (!this.shape) return;
        const geometry = Shape3D.extrudeGeometry(this.shape.polygonTree, { depth: this.height });
        // geometry.center();
        geometry.translate(0, this.height / 2, 0);
        const material = this.material ?? this.getDefaultMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        this.applySettings(mesh);
        this.add(mesh);
    }

    static extrudeGeometry(polygonTree, options = {}) {
        const shapes = Shape3D._buildShapesFromTree(polygonTree);
        const geometry = new THREE.ExtrudeGeometry(shapes, {
            bevelEnabled: false,
            ...options,
        });
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, options.depth, 0);

        return geometry;
    }

    static _polygonToShape(polygon) {
        const shape = new THREE.Shape();
        Shape3D._applyPointsToPath(polygon.points, shape);
        return shape;
    }

    static _polygonToPath(polygon) {
        const path = new THREE.Path();
        Shape3D._applyPointsToPath(polygon.points, path);
        return path;
    }

    static _applyPointsToPath(pts, target) {
        if (pts.length === 0) return;
        target.moveTo(pts[0] / factor, pts[1] / factor);
        for (let i = 2; i < pts.length; i += 2) {
            target.lineTo(pts[i] / factor, pts[i + 1] / factor);
        }
        target.closePath();
    }

    static _buildShapesFromTree(node, depth = 0) {
        const shapes = [];
        for (const child of node.children ?? []) {
            if (depth % 2 === 0) {
                const threeShape = Shape3D._polygonToShape(child.polygon);
                for (const holeNode of child.children ?? []) {
                    threeShape.holes.push(Shape3D._polygonToPath(holeNode.polygon));
                    shapes.push(...Shape3D._buildShapesFromTree(holeNode, depth + 2));
                }
                shapes.push(threeShape);
            }
        }
        return shapes;
    }
}

export class Box3D extends Shape3D {
    constructor({ shape, origin, destination, material, color, hole, extrude = false, draw = false }) {
        super({ extrude, material, color });
        if (!shape) {
            this.normalizePoints(origin, destination);
            this.width = destination.x - origin.x;
            this.height = destination.y - origin.y;
            this.depth = destination.z - origin.z;
            this.elevation = origin.y;
            shape = new foundry.data.RectangleShapeData({
                type: "rectangle",
                hole: hole,
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
                shape.parent.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ?
                shape.parent.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
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
        const material = this.material ?? this.getDefaultMaterial();
        const geometry = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.applySettings(mesh);
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
    constructor({ shape, origin, destination, material, color, hole, extrude = false, draw = false }) {
        super({ extrude, material, color });
        if (origin) origin = new THREE.Vector3(origin.x, origin.y, origin.z);
        if (destination) destination = new THREE.Vector3(destination.x, destination.y, destination.z);
        if (!shape) {
            this.radius = destination.distanceTo(origin);
            this.elevation = origin.y;
            shape = new foundry.data.CircleShapeData({
                type: "circle",
                hole: hole,
                x: origin.x * factor,
                y: origin.z * factor,
                radius: this.radius * factor,
                gridBased: false,
            }, {});
        } else {
            const top = Number.isFinite(shape.parent.elevation.top) ?
                shape.parent.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
                shape.parent.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
            this.radius = shape.radius / factor;
            this.elevation = (top + bottom) / 2;
            origin = {
                x: shape.x / factor,
                y: this.elevation,
                z: shape.y / factor,
            };
        }
        this.height = this.radius * 2;
        this.elevationBottom = this.elevation - this.radius;
        this.elevationTop = this.elevation + this.radius;
        this.shape = shape;
        this.origin = origin;
        if (!draw) return;
        if (this.extrude) return this.drawExtrude();
        return this.drawShape();
    }

    drawShape() {
        const material = this.material ?? this.getDefaultMaterial();
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.applySettings(mesh);
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

export class Ellipse3D extends Shape3D {
    constructor({ shape, origin, destination, material, color, hole, extrude = false, draw = false }) {
        super({ extrude, material, color });
        if (!shape) {
            this.radiusX = Math.abs(destination.x - origin.x);
            this.radiusZ = Math.abs(destination.z - origin.z);
            this.height = destination.y - origin.y;
            this.elevation = origin.y;
            shape = new foundry.data.EllipseShapeData({
                type: "ellipse",
                hole: hole,
                x: origin.x * factor,
                y: origin.z * factor,
                radiusX: this.radiusX * factor,
                radiusY: this.radiusZ * factor,
                anchorX: 0,
                anchorY: 0,
                rotation: 0,
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
                shape.parent.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ?
                shape.parent.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
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
        this.origin = {
            x: origin.x,
            y: origin.y,
            z: origin.z,
        };
        if (!draw) return;
        if (this.extrude) return this.drawExtrude();
        return this.drawShape();
    }

    drawShape() {
        const material = this.material ?? this.getDefaultMaterial();
        const geometry = new THREE.CylinderGeometry(1, 1, 1, 32, 32);
        geometry.scale(this.radiusX, this.height, this.radiusZ);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.applySettings(mesh);
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
    constructor({ shape, origin, destination, material, color, hole, extrude = false, draw = false }) {
        super({ extrude, material, color });
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
                hole: hole,
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
                shape.parent.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ?
                shape.parent.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
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
        this.origin = {
            x: (origin.x + destination.x) / 2,
            y: origin.y,
            z: (origin.z + destination.z) / 2,
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
        const material = this.material ?? this.getDefaultMaterial();
        const geometry = new THREE.ConeGeometry(this.baseRadius, this.coneHeight, 32);
        geometry.rotateX(-this._rotation * (Math.PI / 180));
        geometry.rotateZ(Math.PI / 2);
        geometry.translate(this.origin.x, this.origin.y, this.origin.z);
        const mesh = new THREE.Mesh(geometry, material);
        this.applySettings(mesh);
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
        const material = this.material ?? this.getDefaultMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        this.applySettings(mesh);
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
        const material = this.material ?? this.getDefaultMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        this.applySettings(mesh);
        this.add(mesh);
    }
}

export class Torus3D extends Shape3D {
    constructor({ shape, origin, destination, material, color, hole, extrude = false, draw = false }) {
        super({ extrude, material, color });
        if (origin) origin = new THREE.Vector3(origin.x, origin.y, origin.z);
        if (destination) destination = new THREE.Vector3(destination.x, destination.y, destination.z);

        if (!shape) {
            this.radius = destination.distanceTo(origin);
            this.tubeRadius = 50 / factor;
            this.elevation = origin.y;
            shape = new foundry.data.RingShapeData({
                type: "ring",
                hole: hole,
                x: origin.x * factor,
                y: origin.z * factor,
                radius: this.radius * factor,
                innerWidth: 0,
                outerWidth: this.tubeRadius * factor * 2,
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
            shape.parent.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
            this.radius = shape.radius / factor;
            this.tubeRadius = shape.outerWidth / (factor * 2);
            this.elevation = bottom + this.tubeRadius;
            origin = {
                x: shape.x / factor,
                y: this.elevation,
                z: shape.y / factor,
            };
        }
        
        this.height = this.tubeRadius * 2;
        this.elevationBottom = this.elevation - this.tubeRadius;
        this.elevationTop = this.elevation + this.tubeRadius;
        this.shape = shape;
        this.origin = origin;
        
        if (!draw) return;
        if (this.extrude) return this.drawExtrude();
        return this.drawShape();
    }
    
    drawShape() {
        const material = this.material ?? this.getDefaultMaterial();
        const geometry = new THREE.TorusGeometry(this.radius + this.tubeRadius, this.tubeRadius, 16, 64);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.applySettings(mesh);
        this.add(mesh);
    }
    
    containsPoint(point) {
        if (!this.extrude) {
            const dx = point.x - this.origin.x;
            const dy = point.y - this.origin.y;
            const dz = point.z - this.origin.z;
            const distXZ = Math.sqrt(dx * dx + dz * dz);
            const distToRing = Math.sqrt((distXZ - this.radius) ** 2 + dy * dy);
            return distToRing <= this.tubeRadius;
        }
        const dx = point.x - this.origin.x;
        const dz = point.z - this.origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        if (distXZ * factor > this.shape.radius) return false;
        if (distXZ * factor < this.shape.innerRadius) return false;
        if (point.y < this.elevationBottom) return false;
        if (point.y > this.elevationTop) return false;
        return true;
    }
}

export class Ray3D extends Shape3D {
    constructor({ shape, origin, destination, material, color, hole, extrude = false, draw = false }) {
        super({ extrude, material, color });
        let originVec, destVec;
        
        if (origin) originVec = new THREE.Vector3(origin.x, origin.y, origin.z);
        if (destination) destVec = new THREE.Vector3(destination.x, origin.y, destination.z);

        let angle;
        if (!shape) {
            const length = destVec.distanceTo(originVec);
            const direction = new THREE.Vector3()
                .subVectors(originVec, destVec)
                .normalize();
            angle = 2 * Math.PI - Math.atan2(direction.x, direction.z) - Math.PI / 2;
            this.length = length;
            this.width = canvas.dimensions.size / factor;
            this.elevation = origin.y;
            shape = new foundry.data.LineShapeData({
                type: "line",
                hole: hole,
                x: origin.x * factor,
                y: origin.z * factor,
                length: this.length * factor,
                width: this.width * factor,
                rotation: Math.toDegrees(angle),
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
                shape.parent.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
            this.length = shape.length / factor;
            this.width = shape.width / factor;
            this.elevation = bottom;
            angle = Math.toRadians(shape.rotation ?? 0);
            origin = {
                x: shape.x / factor,
                y: this.elevation,
                z: shape.y / factor,
            };
            originVec = new THREE.Vector3(origin.x, origin.y, origin.z);
            destVec = new THREE.Vector3(
                origin.x + Math.cos(angle) * this.length,
                origin.y,
                origin.z + Math.sin(angle) * this.length,
            );
        }

        this.direction = new THREE.Vector3()
            .subVectors(destVec, originVec)
            .normalize();
        this.halfWidth = this.width / 2;
        this.height = this.width;
        this.elevationBottom = this.elevation;
        this.elevationTop = this.elevation + this.height;
        this.shape = shape;
        
        this.origin = {
            x: originVec.x + (this.length * Math.cos(angle)) / 2,
            y: originVec.y,
            z: originVec.z + (this.length * Math.sin(angle)) / 2,
        };
        this.destination = {
            x: this.origin.x - (this.length * Math.cos(angle)),
            y: this.origin.y,
            z: this.origin.z - (this.length * Math.sin(angle)),
        }
        
        this.originVec = originVec;
        this.destVec = destVec;

        if (!draw) return;
        if (this.extrude) return this.drawExtrude();
        return this.drawShape();
    }

    drawShape() {
        const material = this.material ?? this.getDefaultMaterial();
        const geometry = new THREE.BoxGeometry(this.width, this.width, this.length);
        const mesh = new THREE.Mesh(geometry, material);
        const mid = new THREE.Vector3(
            this.originVec.x + this.direction.x * this.length / 2,
            this.originVec.y + this.direction.y * this.length / 2,
            this.originVec.z + this.direction.z * this.length / 2,
        );
        mesh.position.copy(mid);
        
        // Rotate the mesh to align with the direction
        const angle = Math.atan2(this.direction.x, this.direction.z);
        mesh.rotation.y = angle;
        
        this.applySettings(mesh);
        this.add(mesh);
    }
}

export class Emanation3D extends Shape3D {
    constructor({ shape, origin, destination, material, color, hole, baseType = 4, extrude = false, draw = false }) {
        super({ extrude, material, color });
        if (!shape) {
            this.totalWidth = (destination.x - origin.x) * 2;
            this.totalDepth = (destination.z - origin.z) * 2;
            this.radius = 0.1;

            this.width = this.totalWidth - 2 * this.radius;
            this.depth = this.totalDepth - 2 * this.radius;
            this.width = Math.abs(this.width);
            this.depth = Math.abs(this.depth);
            if (this.width <= 0.01) this.width = 0.01;
            if (this.depth <= 0.01) this.depth = 0.01;
            this.height = destination.y - origin.y;
            this.elevation = origin.y;
            
            shape = new foundry.data.EmanationShapeData({
                type: "emanation",
                hole: hole,
                base: {
                    type: "token",
                    shape: baseType, // rectangle
                    width: this.width * factor / canvas.scene.dimensions.size,
                    height: this.depth * factor / canvas.scene.dimensions.size,
                    x: (origin.x - this.width / 2) * factor,
                    y: (origin.z - this.depth / 2) * factor,
                },
                radius: this.radius * factor,
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ?
                shape.parent.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ?
                shape.parent.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
            this.radius = shape.radius / factor;
            this.width = shape.base.width * canvas.scene.dimensions.size / factor;
            this.depth = shape.base.height * canvas.scene.dimensions.size / factor;
            this.elevation = bottom;
            this.height = top - bottom;
            this.totalWidth = this.width + 2 * this.radius;
            this.totalDepth = this.depth + 2 * this.radius;
            origin = {
                x: shape.base.x / factor + this.width / 2,
                y: bottom,
                z: shape.base.y / factor + this.depth / 2,
            };
        }
        this.baseType = baseType;
        this.elevationBottom = this.elevation;
        this.elevationTop = this.elevation + this.height;
        this.shape = shape;
        
        this.origin = {
            x: origin.x,
            y: origin.y,
            z: origin.z,
        };
        
        if (!draw) return;
        this.drawExtrude();
    }

    containsPoint(point) {
        if (this.baseType === 0) {
            const dx = (point.x - this.origin.x) * factor / this.shape.width;
            const dz = (point.z - this.origin.z) * factor / this.shape.depth;
            
            if (dx * dx + dz * dz > 1) return false;
            if (point.y < this.origin.y) return false;
            if (point.y > this.origin.y + this.height) return false;
            
            return true;
        }

        if (point.y < this.origin.y - this.height / 2) return false;
        if (point.y > this.origin.y + this.height / 2) return false;
        
        const halfWidth = this.width / 2;
        const halfDepth = this.depth / 2;
        
        const dx = Math.abs(point.x - this.origin.x);
        const dz = Math.abs(point.z - this.origin.z);
        
        if (dx <= halfWidth && dz <= halfDepth) return true;
        
        const closestX = Math.max(this.origin.x - halfWidth, Math.min(point.x, this.origin.x + halfWidth));
        const closestZ = Math.max(this.origin.z - halfDepth, Math.min(point.z, this.origin.z + halfDepth));
        
        const distSq = (point.x - closestX) * (point.x - closestX) + 
                       (point.z - closestZ) * (point.z - closestZ);
        
        return distSq <= this.radius * this.radius;
    }
}

export class Extrude3D extends Shape3D {
    constructor({ shape, material, color, extrude = false }) {
        super({ extrude, material, color });

        const bottom = Number.isFinite(shape.parent.elevation.bottom)
            ? shape.parent.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
        const top = Number.isFinite(shape.parent.elevation.top)
            ? shape.parent.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
        this.elevation = bottom;
        this.height = top - bottom;
        this.origin = {
            x: shape.origin.x / factor,
            y: bottom + this.height / 2,
            z: shape.origin.y / factor,
        };

        this.shape = shape;
        this.drawExtrude();
    }
}