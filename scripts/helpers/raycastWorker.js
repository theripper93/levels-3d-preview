//web worker for raycasing
import * as THREE from "../lib/three.module.js";
import {computeBoundsTree, disposeBoundsTree, acceleratedRaycast} from "../lib/three-mesh-bvh.js";
import { mergeBufferGeometries, toTrianglesDrawMode } from "../lib/BufferGeometryUtils.js";
import { isMath } from "./utils.js";
//import * as Math from "https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.5.0/math.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const scene = new THREE.Scene();

scene.tiles = {};

const mergedMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));

const basicMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00});

const raycaster = new THREE.Raycaster();

let _port

function debounce(func, timeout = 200) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            func.apply(this, args);
        }, timeout);
    };
}

self.onconnect = function (e) {
    const port = e.ports[0];
    _port = port;
    const Math = isMath;
    port.postMessage({type: "connected", says: "3D Canvas: Multithreading initialized",});

    port.onmessage = (e) => {

        try {
            const message = e.data;
            if (message.type == "add") {
                const mesh = new THREE.ObjectLoader().parse(message.meshJSON);
                const boxes = [];
                mesh.traverse((child) => {
                    if (child.isMesh) { 
                        if (child.visible == false) boxes.push(child);
                        if (!message.hasTags) { 
                            child.userData.sight = message.sight;
                        }
                        if(child.userData.isDoor) child.userData.sight = !child.userData.isOpen
                        child.material = basicMaterial;
                    }
                });
                boxes.forEach(box => {
                    box.removeFromParent();
                });
                if (scene.tiles[message.id]) {
                    scene.tiles[message.id].removeFromParent();
                    delete scene.tiles[message.id];
                }
                scene.add(mesh);
                scene.tiles[message.id] = mesh;
                mesh.traverse((child) => { 
                    if (child.isMesh) { 
                        child.updateMatrixWorld();
                        child.geometry.computeBoundsTree();
                    }
                });
                mesh.updateMatrixWorld();
                createMergedGeometryDebounced();
            }

            if (message.type == "remove") { 
                const mesh = scene.tiles[message.id];
                mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry.disposeBoundsTree();
                        child.geometry.dispose();
                    }
                });
                if (mesh) {
                    mesh.removeFromParent();
                    delete scene.tiles[message.id];
                }
                createMergedGeometryDebounced();
            }

            if (message.type == "clear") { 
                scene.tiles = {};
                mergedMesh.geometry.dispose();
                mergedMesh.geometry = new THREE.BufferGeometry();
                while (scene.children.length > 0) {
                    if (scene.children[0].geometry) {
                        scene.children[0].geometry.disposeBoundsTree();
                        scene.children[0].geometry.dispose();
                    }
                    scene.remove(scene.children[0]);
                    
                }
            }

            if (message.type == "raycast") {
                const perf = performance.now();
                
                const config = message.config;
                const polygonPoints = [];
                const aMin = Math.normalizeRadians(Math.toRadians(config.rotation + 90 - config.angle / 2));
                const aMax = aMin + (config.hasLimitedAngle ? Math.toRadians(config.angle) : Math.PI * 2);
                const radius = config.radius;
                const nPoints = 100; //Math.ceil((config.angle * 0.25) / splits) * splits;
                const origin = config.origin;
                const factor = 1000;
                const z = config.z ?? 0;
                for (let i = 0, n = config.hasLimitedAngle ? nPoints + 1 : nPoints; i < n; i++) {
                    const a = aMin + (aMax - aMin) * (i / nPoints);
                    const x = origin.x + radius * Math.cos(a);
                    const y = origin.y + radius * Math.sin(a);
                    const currentTime = performance.now() - perf;
                    if (currentTime > 16) { 
                        polygonPoints.push(Math.round(origin.x), Math.round(origin.y));
                        continue;
                    }
                    const collision = computeSightCollision({ x: origin.x, y: origin.y, z: z }, { x: x, y: y, z: z });
                    if (collision) {
                        polygonPoints.push(Math.round(collision.x * factor), Math.round(collision.z * factor));
                    } else {
                        polygonPoints.push(Math.round(x), Math.round(y));
                    }
                }
                port.postMessage({ type: "polygon", time: performance.now() - perf, polygonPoints: polygonPoints, id: message.id, callbackId: message.callbackId });
            }
        } catch (error) {
            port.postMessage({ type: "error", error: error });
        }

        
    };
};






function computeSightCollision(v1, v2) {
    const factor = 1000;
        const origin =  new THREE.Vector3(v1.x/factor, v1.z, v1.y/factor) //Ruler3D.posCanvasTo3d(v1);
        const target = new THREE.Vector3(v2.x / factor, v2.z, v2.y / factor);
        return computeSightCollisionFrom3DPositions(origin, target);
    }

function computeSightCollisionFrom3DPositions(origin, target) {
    const direction = target.clone().sub(origin).normalize();
    const distance = Infinity;
    raycaster.far = Infinity;
    raycaster.set(origin, direction);
    let collisions = raycaster.intersectObjects([mergedMesh], false);
    if (!collisions.length) return false;
    const collision = collisions[0];
    if (collision.distance > distance) return false;
    return collision.point.add(direction.multiplyScalar(0.025));
}


function createMergedGeometry(){
    const geometries = [];
    scene.traverse((child) => {
        if (child.isMesh && child?.userData?.sight) {
            const worldSpaceGeometry = applyMatrixWorldToGeometry(child);
            geometries.push(...worldSpaceGeometry);
        }
    });
    const mergedGeometry = mergeBufferGeometries(geometries);
    geometries.forEach(geometry => geometry.dispose());
    if(!mergedGeometry) return mergedMesh.geometry;
    mergedGeometry.computeBoundsTree();
    mergedMesh.geometry?.dispose();
    mergedMesh.geometry?.disposeBoundsTree();
    mergedMesh.geometry = mergedGeometry;
    _port.postMessage({ type: "refresh" });
    _port.postMessage({type: "mergedGeometry", mergedGeometry: mergedGeometry.attributes.position.array.length});
    return mergedGeometry;
}

const createMergedGeometryDebounced = debounce(createMergedGeometry, 100);

function applyMatrixWorldToGeometry(mesh) {
    if(mesh.isInstancedMesh) return applyMatrixWorldToGeometryInstanced(mesh)
    const geometry = toTrianglesDrawMode(mesh.geometry.clone());
    mesh.updateMatrixWorld(true,true)
    geometry.applyMatrix4(mesh.matrixWorld);
    const attributes = geometry.attributes;
    for (const key in attributes) {
        if (key != "position" && key != "uv" && key != "normal") {
            delete attributes[key];
        }
    }
    return [geometry];
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
    for(let i = 0; i < count; i++) {
        mesh.getMatrixAt(i, instanceMatrix);
        const worldSpaceGeometry = geometry.clone();
        worldSpaceGeometry.applyMatrix4(instanceMatrix);
        worldSpaceGeometry.applyMatrix4(mesh.matrixWorld);
        geometries.push(worldSpaceGeometry);
    }
    return geometries;
}