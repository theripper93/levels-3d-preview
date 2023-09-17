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
scene.doors = {};
scene._doors = [];

function computeDoors() {
    const group = new THREE.Group();
    Object.values(scene.doors).forEach((door) => { 
        group.add(door);
    });
    const doorColliders = [];
    group.traverse((child) => {
        if (child.isMesh && child.userData.sight) {
            doorColliders.push(child);
        }
    });
    return doorColliders;
}

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
                removeMeshFromScene(message.id);
                const mesh = new THREE.ObjectLoader().parse(message.meshJSON);
                const boxes = [];
                let hasDoor = message.isDoor;
                mesh.traverse((child) => {
                    if (child.name == "sightMesh") boxes.push(child);
                    if (child.isMesh) {
                        //if (child.visible == false) boxes.push(child);
                        if (!message.hasTags) {
                            child.userData.sight = message.sight;
                        }
                        if (child.userData.isDoor) {
                            hasDoor = true;
                            child.userData.sight = !child.userData.isOpen;
                        }
                        child.material = basicMaterial;
                    }
                });
                boxes.forEach(box => {
                    box.removeFromParent();
                });
                scene.tiles[message.id] = mesh;
                if (hasDoor) scene.doors[message.id] = mesh;
                else scene.add(mesh);

                mesh.traverse((child) => { 
                    if (child.isMesh) { 
                        child.updateMatrixWorld();
                        child.geometry.computeBoundsTree();
                    }
                });
                mesh.updateMatrixWorld();
                _port.postMessage({ type: "added", data: {type: mesh.type, scene: scene.children.length} });
                if (!hasDoor) createMergedGeometryDebounced();
                else _port.postMessage({ type: "refresh" });
            }

            if (message.type == "remove") { 
                removeMeshFromScene(message.id);
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
                scene._doors = computeDoors();
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
                    if (currentTime > 160) { 
                        polygonPoints.push(Math.round(origin.x), Math.round(origin.y));
                        continue;
                    }
                    const collision = computeSightCollision({ x: origin.x, y: origin.y, z: z }, { x: x, y: y, z: z }, radius);
                    if (collision) {
                        polygonPoints.push(Math.round(collision.x * factor), Math.round(collision.z * factor));
                    } else {
                        polygonPoints.push(Math.round(x), Math.round(y));
                    }
                }
                if(config.hasLimitedAngle) polygonPoints.push(Math.round(origin.x), Math.round(origin.y));
                port.postMessage({ type: "polygon", time: performance.now() - perf, polygonPoints: polygonPoints, id: message.id, callbackId: message.callbackId });
            }

            if (message.type == "ruler") {
                const points = message.points;
                getRulerPoints(points);
            }
        } catch (error) {
            port.postMessage({ type: "error", error: error });
        }

        
    };
};


function removeMeshFromScene(id) {
    const mesh = scene.tiles[id];
    if (!mesh) return;
    mesh.traverse((child) => {
        if (child.isMesh) {
            child.geometry.disposeBoundsTree();
            child.geometry.dispose();
        }
    });
    mesh.removeFromParent();
    delete scene.tiles[id];
    delete scene.doors[id];
    _port.postMessage({ type: "removed", data: { id, scene: scene.children.length } });
}



function computeSightCollision(v1, v2, radius) {
    const factor = 1000;
        const origin =  new THREE.Vector3(v1.x/factor, v1.z, v1.y/factor) //Ruler3D.posCanvasTo3d(v1);
        const target = new THREE.Vector3(v2.x / factor, v2.z, v2.y / factor);
        return computeSightCollisionFrom3DPositions(origin, target, radius / factor);
    }

function computeSightCollisionFrom3DPositions(origin, target, radius, addDirection = true) {
    const direction = target.clone().sub(origin).normalize();
    const distance = radius;
    raycaster.far = Infinity;
    raycaster.set(origin, direction);
    let collisions = raycaster.intersectObjects([mergedMesh, ...scene._doors], false);
    if (!collisions.length) return false;
    const collision = collisions[0];
    if (collision.distance > distance) return false;
    return addDirection ? collision.point.add(direction.multiplyScalar(0.025)) : collision.point;
}


function createMergedGeometry() {
    try {
        if (!scene.children.length) {
            mergedMesh.geometry?.dispose();
            mergedMesh.geometry = new THREE.BufferGeometry();
            _port.postMessage({ type: "refresh" });
            return;
        }
        const geometries = [];
        scene.traverse((child) => {
            if (child.isMesh && child?.userData?.sight) {
                const worldSpaceGeometry = applyMatrixWorldToGeometry(child);
                geometries.push(...worldSpaceGeometry);
            }
        });
        const mergedGeometry = mergeBufferGeometries(geometries);
        geometries.forEach((geometry) => geometry.dispose());
        if (!mergedGeometry) return mergedMesh.geometry;
        mergedGeometry.computeBoundsTree();
        mergedMesh.geometry?.dispose();
        mergedMesh.geometry?.disposeBoundsTree();
        mergedMesh.geometry = mergedGeometry;
        mergedMesh.updateMatrixWorld();
        mergedMesh.updateMatrix();
        _port.postMessage({type: "refresh"});
        //_port.postMessage({ type: "mergedGeometry", data: { g: (new THREE.Mesh(mergedGeometry)).toJSON() } });
        return mergedGeometry;
    } catch (error) {
        _port.postMessage({ type: "error", error: error });
    }
}

const createMergedGeometryDebounced = debounce(createMergedGeometry, 100);

function applyMatrixWorldToGeometry(mesh) {
    if (mesh.isInstancedMesh) return applyMatrixWorldToGeometryInstanced(mesh)    
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
    const geometry = mesh.geometry.clone()//toTrianglesDrawMode(mesh.geometry.clone());
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

function getRulerPoints(points) {
    const rulerPoints = [];

    const origin = new THREE.Vector3(points[0].x, points[0].y, points[0].z);
    const target = new THREE.Vector3(points[1].x, points[1].y, points[1].z);

    const curve = new THREE.LineCurve3(origin, target);
    const length = curve.getLength();
    const subdivisionSize = 0.01;
    const nPoints = Math.ceil(length / subdivisionSize);
    const points3D = curve.getPoints(nPoints)
    points3D.forEach((point) => {
        point.y += 0.1;
    });

    //raycast all points
    for (const point of points3D) {
        const downPoint = point.clone();
        downPoint.y -= 10000;
        const collisionPoint = point.clone();
        const previousPoint = rulerPoints[rulerPoints.length - 1];
        if(previousPoint && previousPoint.y > collisionPoint.y) collisionPoint.y = previousPoint.y+ 0.1;
        const newPoint = computeSightCollisionFrom3DPositions(collisionPoint, downPoint, Infinity, false);
        if (newPoint) {
            rulerPoints.push(newPoint);
        } else {
            point.y -= 0.1;
            rulerPoints.push(point);
        }
    }

    //Loop points and remove all points that have a y value within 0.001 of the next point

    for (let i = 0; i < rulerPoints.length - 1; i++) {
        const point = rulerPoints[i];
        const nextPoint = rulerPoints[i + 1];
        if (Math.abs(point.y - nextPoint.y) < 0.001) {
            rulerPoints.splice(i, 1);
            i--;
        }
    }

    rulerPoints.forEach((point) => { point.y += 0.001; });

    _port.postMessage({ type: "rulerPoints", points: rulerPoints });


}