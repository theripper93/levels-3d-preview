
import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "../systems/ruler3d.js";
import { factor } from "../main.js";
const validTemplateTypes = ["circle", "rectangle", "cone", "ray", "ring"];

export class Shape3D extends THREE.Object3D {
    constructor (shape, options) {
        super();
    }

    get scene() {
        return game.Levels3DPreview.scene;
    }

    addToScene() {
        this.scene.add(this);
    }

    destroy() {
        this.scene.remove(this);
    }

    static create({ shape, type, origin, destination }) {
        if (shape) {
            type = shape.type;
            origin = {
                x: shape.x,
                y: shape.parent.elevation.bottom,
                z: shape.y,
            };
        }
        switch (type) {
            case "rectangle":
            case "rect":
            case "box":
                return new Box3D({ shape, origin, destination });
            case "circle":
                return new Sphere3D({ shape, origin, destination });
            case "ellipse":
                return new Cylinder3D({ shape, origin, destination });
            case "cone":
                return new Cone3D({ shape, origin, destination });
        }
    }

    _get3DData() {

    }

    _getGeometry() {

    }

    updateVisibility() {

    }

    containsPoint(point) {
        // If square or circle, check if point is inside
        // else 
        // Forse regionbehaviour
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
                    bottom: this.elevation * canvas.dimensions.size,
                    top: (this.elevation + this.height) * canvas.dimensions.size
                },
                shapes: [this.shape],
            }])?.[0];
        }
        this.destroy();
        return document;
    }
    
}

export class Box3D extends Shape3D {
    constructor({ shape = null, origin = null, destination = null, material = null }) {
        super();
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
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ? shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ? shape.parent.elevation.top / canvas.dimensions.size : 0;
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
        this.shape = shape;
        this.origin = {
            x: origin.x + this.width / 2,
            z: origin.z + this.depth / 2,
            y: origin.y + this.height / 2,
        };
        material ??= new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const geometry = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.add(mesh);
    }

    updatePosition() {

    }
}

export class Sphere3D extends Shape3D {
    constructor({ shape = null, origin = null, destination = null, material = null }) {
        super();
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
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ? shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            origin = {
                x: shape.x / factor,
                y: bottom,
                z: shape.y / factor,
            };
            this.radius = shape.radius / factor;
            this.elevation = bottom;
        }
        this.height = this.radius;
        this.shape = shape;
        this.origin = origin;
        material = material ?? new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true });
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.add(mesh);
    }
}

export class Cylinder3D extends Shape3D {
    constructor({ shape = null, origin = null, destination = null, material = null }) {
        super();
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
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ? shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            const top = Number.isFinite(shape.parent.elevation.top) ? shape.parent.elevation.top / canvas.dimensions.size : 0;
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
        this.shape = shape;
        this.origin = {
            x: origin.x,
            y: origin.y + this.height / 2,
            z: origin.z,
        };
        material ??= new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });

        const geometry = new THREE.CylinderGeometry(1, 1, this.height, 32);
        geometry.scale(this.radiusX, 1, this.radiusZ);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
        this.add(mesh);
    }
}

// Cono senza base
// Dome
// MergeBufferGeometries
// Scale
// Se angolo > 90 estrudiamo
export class Cone3D extends Shape3D {
    constructor({ shape = null, origin = null, destination = null, material = null }) {
        super();
        if (!shape) {
            // Derive radius and direction from origin -> destination
            const dx = destination.x - origin.x;
            const dz = destination.z - origin.z;
            // if (this.baseRadius < 0.01) this.baseRadius = 0.01;
            this.angle = 60; // default cone spread angle
            this.coneHeight = Math.sqrt(dx * dx + dz * dz);
            this.baseRadius = this.coneHeight * Math.tan(this.angle * Math.PI / 360);
            this.elevation = origin.y;
            this._rotation = Math.atan2(dz, dx) * (180 / Math.PI);
            shape = new foundry.data.ConeShapeData({
                type: "cone",
                hole: false,
                x: origin.x * factor,
                y: origin.z * factor,
                radius: this.coneHeight * factor,
                angle: this.angle,
                rotation: this._rotation,
                curvature: "flat",
                gridBased: false,
            }, {});
        } else {
            const bottom = Number.isFinite(shape.parent.elevation.bottom) ? shape.parent.elevation.bottom / canvas.dimensions.size : 0;
            origin = {
                x: shape.x / factor,
                y: bottom,
                z: shape.y / factor,
            };
            this.angle = shape.angle;
            this._rotation = shape.rotation;
            this.elevation = bottom;
            this.coneHeight = shape.radius / factor;          // horizontal length, stored in shape.radius
            const rad = this._rotation * (Math.PI / 180);
            const angleRad = this.angle * (Math.PI / 180);
            this.baseRadius = this.coneHeight * Math.tan(angleRad / 2);  // vertical radius derived from length and cone angle
            destination = {
                x: origin.x + this.coneHeight * Math.cos(rad),
                y: this.baseRadius,
                z: origin.z + this.coneHeight * Math.sin(rad),
            };
        }
        this.height = this.baseRadius;
        this.shape = shape;
        this.origin = {
            x: origin.x + (destination.x - origin.x) / 2,
            y: origin.y,
            z: origin.z + (destination.z - origin.z) / 2,
        };
        material ??= new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });

        const geometry = new THREE.ConeGeometry(this.baseRadius, this.coneHeight, 32);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.set(0, -this._rotation * (Math.PI / 180), Math.PI / 2);
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