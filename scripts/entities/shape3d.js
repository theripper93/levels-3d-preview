import * as THREE from "../lib/three.module.js";
import { mergeBufferGeometries } from "../lib/BufferGeometryUtils.js";
import { DiagonalStripesMaterial } from "../shaders/regionMaterial.js";
import { factor } from "../main.js";

export class Shape3D extends THREE.Object3D {
    constructor() {
        super();
        this.verticalOffset = 0;
    }
    #region = null;
    #extrude = false;
    #height = 0.01;
    #elevationTop = 0;
    #elevationBottom = 0;

    set region(value) {
        this.#region = value;
    }

    get region() {
        return this.#region ?? this.shape?.parent;
    }

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
        if (this.region) {
            return this.elevationTop - this.elevationBottom;
        }
        return this.elevationTop - this.elevationBottom;
    }

    set elevationTop(value) {
        this.#elevationTop = value;
    }

    get elevationTop() {
        if (this.region) {
            return Number.isFinite(this.region.elevation.top) ?
                this.region.elevation.top * canvas.scene.dimensions.distancePixels / factor : 0;
        }
        return this.#elevationTop;
    }

    set elevationBottom(value) {
        this.#elevationBottom = value;
    }

    get elevationBottom() {
        if (this.region) {
            return Number.isFinite(this.region.elevation.bottom) ?
                this.region.elevation.bottom * canvas.scene.dimensions.distancePixels / factor : 0;
        }
        return this.#elevationBottom;
    }

    addToScene() {
        game.Levels3DPreview.scene.add(this);
    }

    destroy() {
        game.Levels3DPreview.scene.remove(this);
    }
    
    getDefaultMaterial() {
        const material = new DiagonalStripesMaterial({ color: this.color });
        material.side = this.height < 0.01 ? THREE.FrontSide : THREE.DoubleSide;
        return material;
    }

    static getRandomColor() {
        const rand = Math.floor(Math.random() * 16777215);
        return '#' + (rand.toString(16).padStart(6, '0'));
    }
    
    static getSelectedRegion() {
        const selectedRegion = canvas.regions.controlled[0];
        return selectedRegion;
    }

    static getMaterialFromTool(tool) {
        if (tool === "light") return new THREE.MeshBasicMaterial({ color: new THREE.Color("gold"), wireframe: true });
        if (tool === "sound") return new THREE.MeshBasicMaterial({ color: new THREE.Color("white"), wireframe: true });
        if (tool === "tile") return new THREE.MeshBasicMaterial({ color: new THREE.Color("chocolate"), transparent: true, depthWrite: false, opacity: 0.5 });
        return;
    }

    static getShapeFromTool(tool) {
        if (tool === "light" || tool === "sound") return "circle";
        if (tool === "tile") return "rectangle";
        return tool;
    }

    static create({ shape, type, tool, origin, destination, segments, material, extrude, hole = false, color, region }) {
        if (shape) {
            type = shape.type;
            extrude = shape.gridBased;
        }
        if (origin && destination) {
            origin = new THREE.Vector3(origin.x, origin.y, origin.z);
            destination = new THREE.Vector3(destination.x, destination.y, destination.z);
        }
        let shape3d = null;
        const options = { shape, origin, destination, hole, extrude };
        switch (type) {
            case "rectangle":
                shape3d = new Box3D(options);
                break;
            case "circle":
                shape3d = new Sphere3D(options);
                break;
            case "ellipse":
                shape3d = new Ellipse3D(options);
                break;
            case "cone":
                shape3d = new Cone3D(options);
                break;
            case "ring":
                shape3d = new Torus3D(options);
                break;
            case "line":
                shape3d = new Ray3D(options);
                break;
            case "polygon":
                shape3d = new Polygon3D({ ...options, segments });
                break;
            case "emanation":
                const baseType = shape?.base?.shape === 0 ? 0 : 4;
                shape3d = new Emanation3D({ shape, origin, destination, baseType, hole });
                break;
        }

        if (shape3d) {
            shape3d.region = region;
            shape3d.extrude = extrude;
            shape3d.material = material;
            shape3d.tool = tool;
            shape3d.color = color ?? shape3d.region?.color?.css ?? Shape3D.getRandomColor();
            if (shape3d.extrude) shape3d.drawExtrude();
            else shape3d.drawShape();
            return shape3d;
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

    updateVisibility() { }

    containsPoint(point) { return false }

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

    drawExtrude() {
        if (!this.shape) return;
        const geometry = Shape3D.extrudeGeometry(this.shape.polygonTree, { depth: this.height });
        geometry.translate(0, this.elevationBottom, 0);
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
    constructor({ shape, origin, destination, hole }) {
        super();
        if (!shape) {
            this.normalizePoints(origin, destination);
            this.width = destination.x - origin.x;
            this.depth = destination.z - origin.z;
            this.height = Math.min(this.width, this.depth);
            this.elevationBottom = origin.y;
            this.elevationTop = origin.y + this.height;
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
        }

        this.shape = shape;
        this.width = shape.width / factor;
        this.depth = shape.height / factor;
        this.origin = {
            x: ((shape.x - shape.anchorX * shape.width) / factor) + this.width / 2,
            z: this.elevationBottom + this.depth / 2,
            y: ((shape.y - shape.anchorY * shape.height) / factor) + this.height / 2,
        };
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
    constructor({ shape, origin, destination, hole }) {
        super();
        if (!shape) {
            this.radius = destination.distanceTo(origin);
            this.elevationBottom = origin.y - this.radius;
            this.elevationTop = origin.y + this.radius;
            shape = new foundry.data.CircleShapeData({
                type: "circle",
                hole: hole,
                x: origin.x * factor,
                y: origin.z * factor,
                radius: this.radius * factor,
                gridBased: false,
            }, {});
        }

        this.shape = shape;
        this.radius = shape.radius / factor;
        this.origin = {
            x: shape.x / factor,
            y: (this.elevationTop + this.elevationBottom) / 2,
            z: shape.y / factor,
        };
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
    constructor({ shape, origin, destination, hole }) {
        super();
        if (!shape) {
            this.radiusX = Math.abs(destination.x - origin.x);
            this.radiusZ = Math.abs(destination.z - origin.z);
            this.height = Math.min(this.radiusX, this.radiusZ);
            this.elevationBottom = origin.y - this.height / 2;
            this.elevationTop = origin.y + this.height / 2;
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
            this.radiusX = shape.radiusX / factor;
            this.radiusZ = shape.radiusY / factor;
            origin = {
                x: shape.x / factor,
                y: (this.elevationTop + this.elevationBottom) / 2,
                z: shape.y / factor,
            };
        }
        this.shape = shape;
        this.origin = origin;
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
    constructor({ shape, origin, destination, hole }) {
        super();
        if (!shape) {
            const dx = destination.x - origin.x;
            const dz = destination.z - origin.z;
            this.angle = 60;
            const angleRad = this.angle * (Math.PI / 180);
            const shapeRadius = Math.sqrt(dx * dx + dz * dz);
            this.coneHeight = shapeRadius * Math.cos(angleRad / 2);
            this.baseRadius = shapeRadius * Math.sin(angleRad / 2);
            this._rotation = Math.atan2(dz, dx) * (180 / Math.PI);
            this.elevationBottom = origin.y - this.baseRadius;
            this.elevationTop = origin.y + this.baseRadius;
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
            origin = {
                x: shape.x / factor,
                y: (this.elevationBottom + this.elevationTop) / 2,
                z: shape.y / factor,
            };
            destination = {
                x: origin.x + shapeRadius * Math.cos(rad),
                y: this.baseRadius,
                z: origin.z + shapeRadius * Math.sin(rad),
            };
        }
        this.shape = shape;
        this.origin = origin;
        this.drawOrigin = {
            x: (origin.x + destination.x) / 2,
            y: origin.y,
            z: (origin.z + destination.z) / 2,
        };
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
        geometry.translate(this.drawOrigin.x, this.drawOrigin.y, this.drawOrigin.z);
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
        geometry.translate(this.drawOrigin.x, this.drawOrigin.y, this.drawOrigin.z);
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
        geometry.translate(this.drawOrigin.x, this.drawOrigin.y, this.drawOrigin.z);
        const material = this.material ?? this.getDefaultMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        this.applySettings(mesh);
        this.add(mesh);
    }

    containsPoint(point) {
        const shapeRadius = this.shape.radius / factor;
        const angle = this.shape.angle * (Math.PI / 180);
        const direction = this.shape.rotation * (Math.PI / 180);

        if (!PointInSolid.inSphere(point, this.origin, shapeRadius)) return false;

        const coneBaseCenter = {
            x: this.origin.x + Math.cos(direction) * this.coneHeight,
            y: this.origin.y,
            z: this.origin.z + Math.sin(direction) * this.coneHeight,
        }
        
        if (this.shape.curvature === "semicircle") {
            if (!PointInSolid.inCone(point, this.origin, coneBaseCenter, angle, this.coneHeight)) {
                const sphereRadius = shapeRadius - this.coneHeight;
                if (!PointInSolid.inSphericalCap(point, this.origin, sphereRadius, direction, 0.5)) return false;   
            }
        } else {
            if (!PointInSolid.inCone(point, this.origin, coneBaseCenter, angle, this.coneHeight)) return false;
        }

        return true;
    }
}

export class Torus3D extends Shape3D {
    constructor({ shape, origin, destination, hole }) {
        super();
        if (!shape) {
            this.radius = destination.distanceTo(origin);
            this.tubeRadius = 50 / factor;
            this.elevationBottom = origin.y - this.tubeRadius;
            this.elevationTop = origin.y + this.tubeRadius;
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
            this.radius = shape.radius / factor;
            this.tubeRadius = shape.outerWidth / (factor * 2);
            this.elevation = this.elevationBottom + this.tubeRadius;
            origin = {
                x: shape.x / factor,
                y: this.elevation,
                z: shape.y / factor,
            };
        }
        this.shape = shape;
        this.origin = origin;
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
    constructor({ shape, origin, destination, hole }) {
        super();

        let angle;
        if (!shape) {
            const length = destination.distanceTo(origin);
            const direction = new THREE.Vector3()
                .subVectors(origin, destination)
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
            origin = new THREE.Vector3(
                shape.x / factor,
                this.elevation,
                shape.y / factor,
            );
            destination = new THREE.Vector3(
                origin.x + Math.cos(angle) * this.length,
                origin.y,
                origin.z + Math.sin(angle) * this.length,
            );
        }

        this.direction = new THREE.Vector3()
            .subVectors(destination, origin)
            .normalize();
        this.halfWidth = this.width / 2;
        this.height = this.width;
        this.elevationBottom = this.elevation;
        this.elevationTop = this.elevation + this.height;
        this.shape = shape;

        origin.x += this.length * Math.cos(angle);
        origin.y += this.height / 2;
        origin.z += this.length * Math.sin(angle);
        destination.x -= this.length * Math.cos(angle);
        destination.y -= this.height / 2;
        destination.z -= this.length * Math.sin(angle);
        this.origin = origin;
        this.destination = destination;

        // this.destination = {
        //     x: this.origin.x - (this.length * Math.cos(angle)),
        //     y: this.origin.y - (this.height / 2),
        //     z: this.origin.z - (this.length * Math.sin(angle)),
        // }
        
    }

    drawShape() {
        const material = this.material ?? this.getDefaultMaterial();
        const geometry = new THREE.BoxGeometry(this.width, this.width, this.length);
        const mesh = new THREE.Mesh(geometry, material);
        const mid = new THREE.Vector3(
            this.origin.x - this.direction.x * this.length / 2,
            this.origin.y - this.direction.y * this.length / 2,
            this.origin.z - this.direction.z * this.length / 2,
        );
        // const mid = this.origin;
        mesh.position.copy(mid);
        
        // Rotate the mesh to align with the direction
        const angle = Math.atan2(this.direction.x, this.direction.z);
        mesh.rotation.y = angle;

        if (canvas.regions._placementContext) {
            const document = canvas.regions._placementContext?.preview?.document;
            if (document) {
                const rotation3d = document.rotation3d ?? 0;
                mesh.rotation.y += rotation3d;
            }
        }
        
        this.applySettings(mesh);
        this.add(mesh);
    }

    containsPoint(point) {
        if (Math.abs(point.y - this.origin.y) > this.height / 2) return false;

        const p2d = new THREE.Vector3(point.x, 0, point.z);
        const start2d = new THREE.Vector3(this.origin.x, 0, this.origin.z);
        const end2d = new THREE.Vector3(this.destination.x, 0, this.destination.z);

        const line = new THREE.Line3(start2d, end2d);
        const closestPoint = new THREE.Vector3();

        line.closestPointToPoint(p2d, true, closestPoint);
        const distance = p2d.distanceTo(closestPoint);

        return distance <= this.width / 2;
    }
}

export class Polygon3D extends Shape3D {
    constructor({ shape, origin, destination, segments, hole }) {
        super();
        if (!shape) {
            const points = [];
            if (!segments.length) points.push(origin.x * factor, origin.z * factor);
            for (const segment of segments) {
                points.push(segment.origin.x * factor, segment.origin.z * factor);
                points.push(segment.target.x * factor, segment.target.z * factor);
            }
            points.push(destination.x * factor, destination.z * factor);
            this.elevationBottom = Math.min(
                origin.y,
                ...segments.map((s) => s.origin.y),
                destination.y
            );
            this.elevationTop = destination.y;
            // this.elevationTop = Math.max(
            //     origin.y,
            //     ...segments.map((s) => s.target.y),
            //     destination.y
            // );
            shape = new foundry.data.PolygonShapeData({
                type: "polygon",
                points: points,
                gridBased: false,
            }, {});
        }
        this.shape = shape;
        this.origin = origin;
    }

    drawShape() {
        this.drawExtrude();
    }
}

export class Emanation3D extends Shape3D {
    constructor({ shape, origin, destination, hole, baseType = 4 }) {
        super();
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
    }

    drawShape() {
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
    constructor({ shape }) {
        super();

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

class PointInSolid {
  /**
   * @param p coordinates of point to be tested
   * @param c opposit corners of the parallelepiped
   */

  static inParallelepiped(p, c) {
    const c0 = c[0];
    const c1 = c[1];
    const maxX = Math.max(c0.x, c1.x);
    const maxY = Math.max(c0.y, c1.y);
    const maxZ = Math.max(c0.z, c1.z);
    const minX = Math.min(c0.x, c1.x);
    const minY = Math.min(c0.y, c1.y);
    const minZ = Math.min(c0.z, c1.z);
    return minX <= p.x && p.x <= maxX && minY <= p.y && p.y <= maxY && minZ <= p.z && p.z <= maxZ;
  }

  /**
   * @param p coordinates of point to be tested
   * @param poly PIXI.Polygon defining the top\bottom face
   * @param z z points of the solid
   */

   static inRotatedParallelepiped(p, poly, z) {
    if(p.z < z[0] || p.z > z[1]) return false
    return poly.contains(p.x,p.y)
  }

  /**
   * @param p coordinates of point to be tested
   * @param c coordinates of center of the sphere
   * @param r radius of the sphere
   */

  static inSphere(p, c, r) {
    return this.getDist(c, p) <= r;
  }

    /**
   * @param p coordinates of point to be tested
   * @param c coordinates of center of the base of the cylinder
   * @param r radius of the cylinder
   * @param h height of the cylinder
   */

  static inCylinder(p, c, r, h){
    const dist = this.getDist({x:c.x,y:c.y,z:p.z}, p)
    return dist <= r && p.z <= h && p.z >= c.z
  }

  /**
   * @param p coordinates of point to be tested
   * @param t coordinates of apex point of cone
   * @param c coordinates of center of basement circle
   * @param a aperture in radians
   * @param h height of the cone
   */

  static inCone(p, t, c, a, h) {
    const a2 = a / 2;
    const apexToXVect = this.dif(t, p);
    const axisVect = this.dif(t, c);
    const iic =
      this.dotProd(apexToXVect, axisVect) /
        this.magn(apexToXVect) /
        this.magn(axisVect) >
      Math.cos(a2);
    if (!iic) return false;
    return this.getDist(t, p) <= h;
    return (
      this.dotProd(apexToXVect, axisVect) / this.magn(axisVect) <
      this.magn(axisVect)
    );
  }

  static getDist(p0, p1) {
    return Math.sqrt(
      Math.pow(p1.x - p0.x, 2) +
        Math.pow(p1.y - p0.y, 2) +
        Math.pow(p1.z - p0.z, 2)
    );
  }

  static dotProd(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  static dif(a, b) {
    return {x:a.x - b.x, y:a.y - b.y, z:a.z - b.z};
  }

  static magn(a) {
    return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  }
}
