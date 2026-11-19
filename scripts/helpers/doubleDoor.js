import * as THREE from "three";

const TRANSFORM_KEYS = ["position", "rotation", "quaternion", "scale"];
const SEAM_OVERLAP = 0.0002;

const doubleSidedSightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, side: THREE.DoubleSide });

function shareTransforms(target, source) {
    for (const key of TRANSFORM_KEYS) Object.defineProperty(target, key, { configurable: true, enumerable: true, value: source[key] });
    target.children.forEach((child, i) => source.children[i] && shareTransforms(child, source.children[i]));
}

function mirrored(object) {
    const group = new THREE.Group();
    group.scale.x = -1;
    group.position.x = -SEAM_OVERLAP;
    group.add(object);
    return group;
}

export function buildDoubleDoor(leaf, sightLeaf) {
    leaf.traverse((child) => {
        if (child.isMesh) child.userData.doubleSided = true;
    });
    const leafMirror = leaf.clone();
    shareTransforms(leafMirror, leaf);
    const sightMirror = sightLeaf.clone();
    shareTransforms(sightLeaf, leaf);
    shareTransforms(sightMirror, leaf);
    for (const sightMesh of [sightLeaf, sightMirror]) {
        sightMesh.traverse((child) => {
            if (child.isMesh) child.material = doubleSidedSightMaterial;
        });
    }
    const sight = new THREE.Group();
    sight.add(sightLeaf, mirrored(sightMirror));
    return { mirror: mirrored(leafMirror), sight };
}
