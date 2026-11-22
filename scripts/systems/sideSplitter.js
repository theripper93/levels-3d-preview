import * as THREE from "three";

const MATERIAL_TYPES = new Set(["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshBasicMaterial", "MeshLambertMaterial", "MeshPhongMaterial"]);

export class SideSplitter {
    constructor(root) {
        this.root = root;
        this.tiles = new Map();
        this.list = [];
        this.active = [];
    }

    get size() {
        return this.list.length;
    }

    invalidate(id) {
        this.tiles.delete(id);
    }

    clear() {
        this.end();
        for (const id of [...this.tiles.keys()]) this.drop(id);
        this.list = [];
    }

    update(tiles) {
        let changed = false;
        for (const id of this.tiles.keys()) {
            const entry = this.tiles.get(id);
            if (tiles[id] === entry.tile3d && entry.tile3d.mesh === entry.mesh) continue;
            this.drop(id);
            changed = true;
        }
        for (const id in tiles) {
            const tile3d = tiles[id];
            if (!tile3d?._loaded || !tile3d.mesh || this.tiles.has(id)) continue;
            this.tiles.set(id, { tile3d, mesh: tile3d.mesh, candidates: this.scan(tile3d) });
            changed = true;
        }
        if (changed) this.list = [...this.tiles.values()].flatMap((entry) => entry.candidates);
    }

    scan(tile3d) {
        const skip = new Set([tile3d.controlledBox, tile3d.sightMesh, tile3d._decalCone].filter(Boolean));
        const candidates = [];
        const visit = (object, groupOrder) => {
            if (skip.has(object) || (object.userData.entity3D && object.userData.entity3D !== tile3d)) return;
            if (object.isGroup) groupOrder = object.renderOrder;
            if (groupOrder === 0 && isSplittableObject(object) && isSplittable(object.material)) candidates.push(this.createCandidate(object));
            for (const child of object.children) visit(child, groupOrder);
        };
        visit(tile3d.mesh, 0);
        return candidates;
    }

    createCandidate(object) {
        const proxy = new THREE.Mesh(object.geometry);
        proxy.matrixAutoUpdate = false;
        proxy.matrixWorldAutoUpdate = false;
        proxy.visible = false;
        proxy.userData.ignoreHover = true;
        proxy.userData.interactive = false;
        proxy.raycast = () => {};
        this.root.add(proxy);
        return { object, proxy, material: null, back: null, front: null };
    }

    drop(id) {
        const entry = this.tiles.get(id);
        this.tiles.delete(id);
        for (const candidate of entry?.candidates ?? []) {
            candidate.proxy.removeFromParent();
            disposeViews(candidate);
        }
    }

    begin(scene) {
        for (const candidate of this.list) {
            const { object, proxy } = candidate;
            const material = object.material;
            if (!isSplittable(material) || !isShown(object, scene)) {
                proxy.visible = false;
                continue;
            }
            if (candidate.material !== material) {
                disposeViews(candidate);
                candidate.material = material;
                candidate.back = createView(material, THREE.BackSide);
                candidate.front = createView(material, THREE.FrontSide);
            }
            object.material = candidate.back;
            proxy.material = candidate.front;
            proxy.geometry = object.geometry;
            proxy.matrixWorld.copy(object.matrixWorld);
            proxy.layers.mask = object.layers.mask;
            proxy.renderOrder = object.renderOrder;
            proxy.frustumCulled = object.frustumCulled;
            proxy.receiveShadow = object.receiveShadow;
            proxy.visible = true;
            this.active.push(candidate);
        }
    }

    end() {
        for (const candidate of this.active) candidate.object.material = candidate.material;
        this.active.length = 0;
    }
}

function isSplittableObject(object) {
    if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh) return false;
    return !object.geometry.morphAttributes?.position && object.onBeforeRender === THREE.Object3D.prototype.onBeforeRender;
}

function isSplittable(material) {
    if (!material || Array.isArray(material) || !MATERIAL_TYPES.has(material.type)) return false;
    return material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass && !(material.transmission > 0) && !material._userOnBeforeCompile;
}

function isShown(object, scene) {
    let node = object;
    for (; node.parent; node = node.parent) if (!node.visible) return false;
    return node === scene && node.visible;
}

function createView(material, side) {
    const view = Object.create(material);
    Object.defineProperty(view, "version", { get: () => material.version, set: (value) => (material.version = value) });
    view._listeners = {};
    view.side = side;
    view.forceSinglePass = true;
    return view;
}

function disposeViews(candidate) {
    candidate.back?.dispose();
    candidate.front?.dispose();
    candidate.material = candidate.back = candidate.front = null;
}
