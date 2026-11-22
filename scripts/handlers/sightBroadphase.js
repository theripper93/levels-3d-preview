import * as THREE from "three";

const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _point = new THREE.Vector3();
const EPSILON = 1e-5;

function sameMatrix(snapshot, elements) {
    for (let i = 0; i < 16; i++) if (snapshot[i] !== elements[i]) return false;
    return true;
}

function staticAnchor(root) {
    for (let node = root; node; node = node.parent) if (node._staticSubtree) return node;
    return null;
}

function expandBySphere(box, sphere, matrixWorld) {
    if (sphere.isEmpty()) return;
    _sphere.copy(sphere).applyMatrix4(matrixWorld);
    _point.setScalar(_sphere.radius);
    box.expandByPoint(_box.min.copy(_sphere.center).sub(_point));
    box.expandByPoint(_box.max.copy(_sphere.center).add(_point));
}

function expandNode(box, node) {
    const raycast = node.raycast;
    if (raycast === THREE.Object3D.prototype.raycast) return true;
    if (node.isInstancedMesh) {
        if (raycast !== THREE.InstancedMesh.prototype.raycast) return false;
        if (node.boundingSphere === null) node.computeBoundingSphere();
        expandBySphere(box, node.boundingSphere, node.matrixWorld);
        return true;
    }
    if (!node.isMesh || node.isSkinnedMesh || node.isBatchedMesh || raycast !== THREE.Mesh.prototype.raycast) return false;
    const geometry = node.geometry;
    if (!geometry) return true;
    if (geometry.boundsTree) {
        geometry.boundsTree.getBoundingBox(_box);
        if (_box.isEmpty()) return true;
        box.union(_box.applyMatrix4(node.matrixWorld));
        return true;
    }
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    expandBySphere(box, geometry.boundingSphere, node.matrixWorld);
    return true;
}

export class SightBroadphase {
    constructor(renderer) {
        this.renderer = renderer;
        this.entries = new WeakMap();
        this.list = [];
    }

    bounds(root) {
        const frame = this.renderer.info.render.frame;
        const anchor = staticAnchor(root);
        const epoch = anchor ? anchor._subtreeEpoch | 0 : -1;
        let entry = this.entries.get(root);
        if (entry && (entry.frame === frame || (anchor && entry.anchor === anchor && entry.epoch === epoch)) && sameMatrix(entry.matrix, root.matrixWorld.elements)) return entry.cullable ? entry.box : null;
        if (!entry) {
            entry = { frame, anchor, epoch, matrix: new Float64Array(16), box: new THREE.Box3(), cullable: true };
            this.entries.set(root, entry);
        }
        entry.frame = frame;
        entry.anchor = anchor;
        entry.epoch = epoch;
        entry.matrix.set(root.matrixWorld.elements);
        const box = entry.box.makeEmpty();
        let cullable = true;
        root.traverse((node) => {
            if (cullable && !expandNode(box, node)) cullable = false;
        });
        entry.cullable = cullable;
        if (!cullable) return null;
        if (!box.isEmpty()) {
            box.getSize(_point);
            box.expandByScalar(Math.max(_point.x, _point.y, _point.z) * EPSILON + EPSILON);
        }
        return box;
    }

    filter(raycaster, objects) {
        const list = this.list;
        list.length = 0;
        const ray = raycaster.ray;
        const far = raycaster.far;
        for (let i = 0; i < objects.length; i++) {
            const object = objects[i];
            const box = this.bounds(object);
            if (box) {
                if (box.isEmpty()) continue;
                if (!box.containsPoint(ray.origin)) {
                    if (!ray.intersectBox(box, _point)) continue;
                    if (far !== Infinity && _point.distanceTo(ray.origin) > far * (1 + EPSILON) + EPSILON) continue;
                }
            }
            list.push(object);
        }
        return list;
    }
}
