import * as THREE from "three";
import { factor } from "../main.js";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const FLOOR_PAD_CELLS = 0.05;
const MIN_SIZE = 1e-4;
const colliders = new WeakMap();
const _inverse = new THREE.Matrix4();
const _relative = new THREE.Matrix4();
const _box = new THREE.Box3();
const _scale = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

function localBounds(source) {
    const bounds = new THREE.Box3();
    source.updateWorldMatrix(true, true);
    _inverse.copy(source.matrixWorld).invert();
    source.traverse((node) => {
        if (!node.isMesh || !node.geometry?.attributes?.position) return;
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        bounds.union(_box.copy(node.geometry.boundingBox).applyMatrix4(_relative.multiplyMatrices(_inverse, node.matrixWorld)));
    });
    return bounds;
}

export function doorCollider(source) {
    let collider = colliders.get(source);
    if (!collider) {
        const bounds = localBounds(source);
        if (bounds.isEmpty()) return null;
        collider = new THREE.Mesh(BOX, MATERIAL);
        collider.matrixAutoUpdate = false;
        collider.matrixWorldAutoUpdate = false;
        collider.userData = { bounds, doorCollider: true };
        colliders.set(source, collider);
    }
    const bounds = collider.userData.bounds;
    _scale.setFromMatrixScale(source.matrixWorld);
    const pad = ((canvas.grid.size / factor) * FLOOR_PAD_CELLS) / (_scale.y || 1);
    bounds.getCenter(_center);
    bounds.getSize(_size);
    _size.y += pad;
    _center.y -= pad / 2;
    _size.set(Math.max(_size.x, MIN_SIZE), Math.max(_size.y, MIN_SIZE), Math.max(_size.z, MIN_SIZE));
    collider.matrixWorld.copy(source.matrixWorld).multiply(_relative.makeTranslation(_center.x, _center.y, _center.z).scale(_size));
    return collider;
}
