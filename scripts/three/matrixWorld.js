import { Object3D } from "three";

const baseUpdateMatrix = Object3D.prototype.updateMatrix;
const baseUpdateMatrixWorld = Object3D.prototype.updateMatrixWorld;

function updateMatrix() {
    if (isMoved(this)) {
        this._trsDirty = true;
        markAncestors(this.parent);
    }
    compose(this);
}

function markAncestors(object) {
    for (let node = object; node; node = node.parent) node._subtreeDirty = true;
}

export function setStaticSubtree(object, value) {
    object._staticSubtree = value;
    object._subtreeDirty = true;
}

export function injectMatrixWorld() {
    const add = Object3D.prototype.add;
    const attach = Object3D.prototype.attach;
    Object3D.prototype.updateMatrix = updateMatrix;
    Object3D.prototype.add = function (...objects) {
        for (const object of objects) if (object?.isObject3D) object.matrixWorldNeedsUpdate = true;
        markAncestors(this);
        return add.apply(this, objects);
    };
    Object3D.prototype.attach = function (object) {
        const result = attach.call(this, object);
        object.matrixWorldNeedsUpdate = true;
        markAncestors(this);
        return result;
    };
}

function isMoved(object) {
    const trs = object._trs;
    if (!trs || object.updateMatrix !== updateMatrix) return true;
    const p = object.position;
    const q = object.quaternion;
    const s = object.scale;
    return trs[0] !== p.x || trs[1] !== p.y || trs[2] !== p.z || trs[3] !== q._x || trs[4] !== q._y || trs[5] !== q._z || trs[6] !== q._w || trs[7] !== s.x || trs[8] !== s.y || trs[9] !== s.z;
}

function compose(object) {
    baseUpdateMatrix.call(object);
    const trs = (object._trs ??= new Float64Array(10));
    const p = object.position;
    const q = object.quaternion;
    const s = object.scale;
    trs[0] = p.x;
    trs[1] = p.y;
    trs[2] = p.z;
    trs[3] = q._x;
    trs[4] = q._y;
    trs[5] = q._z;
    trs[6] = q._w;
    trs[7] = s.x;
    trs[8] = s.y;
    trs[9] = s.z;
}

function updateTree(object, force) {
    const own = object.updateMatrixWorld;
    if (own !== baseUpdateMatrixWorld) return own.call(object, force);
    updateNode(object, force);
}

function updateNode(object, force) {
    if (object._staticSubtree) {
        if (!force && !object._subtreeDirty && !object.matrixWorldNeedsUpdate && !object._trsDirty && !isMoved(object)) return;
        object._subtreeDirty = false;
        object._subtreeEpoch = (object._subtreeEpoch | 0) + 1;
    }
    if (!object.matrixAutoUpdate) object.matrixWorldNeedsUpdate = true;
    else if (object.updateMatrix !== updateMatrix) {
        object.updateMatrix();
        object.matrixWorldNeedsUpdate = true;
    } else if (object._trsDirty || isMoved(object)) {
        compose(object);
        object._trsDirty = false;
    }
    if (object.matrixWorldNeedsUpdate || force) {
        if (object.matrixWorldAutoUpdate === true) {
            if (object.parent === null) object.matrixWorld.copy(object.matrix);
            else object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
        }
        object.matrixWorldNeedsUpdate = false;
        force = true;
    }
    const children = object.children;
    for (let i = 0, l = children.length; i < l; i++) updateTree(children[i], force);
}

export function updateSceneMatrixWorld(force) {
    updateNode(this, force);
}

export function isWorldMatrixStale(object) {
    for (let node = object; node; node = node.parent) if (node.matrixWorldNeedsUpdate || node._trsDirty || !node.matrixAutoUpdate || isMoved(node)) return true;
    return false;
}

export function refreshWorldMatrix(object) {
    for (let node = object; node; node = node.parent) {
        if (node.matrixWorldNeedsUpdate || node._trsDirty || !node.matrixAutoUpdate || isMoved(node)) return object.updateWorldMatrix(true, false);
    }
}
