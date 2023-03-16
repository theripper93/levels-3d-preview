import * as THREE from "../lib/three.module.js";
import { mergeBufferGeometries, toTrianglesDrawMode } from "../lib/BufferGeometryUtils.js";

export function getMergedMeshFromInstanced(instancedMesh) {
    const geometries = applyMatrixWorldToGeometryInstanced(instancedMesh);
    const mergedGeometry = mergeBufferGeometries(geometries);
    const mergedMesh = new THREE.Mesh(mergedGeometry, instancedMesh.material);
    return mergedMesh;
}

function applyMatrixWorldToGeometryInstanced(mesh) {
    const geometry = toTrianglesDrawMode(mesh.geometry.clone());
    mesh.updateMatrixWorld(true, true);
    const attributes = geometry.attributes;
    for (const key in attributes) {
        if (key != "position" && key != "uv" && key != "normal") {
            delete attributes[key];
        }
    }
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.uv.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    const geometries = [];
    const count = mesh.count;
    const instanceMatrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
        mesh.getMatrixAt(i, instanceMatrix);
        const worldSpaceGeometry = geometry.clone();
        worldSpaceGeometry.applyMatrix4(instanceMatrix);
        worldSpaceGeometry.applyMatrix4(mesh.matrixWorld);
        geometries.push(worldSpaceGeometry);
    }
    return geometries;
}