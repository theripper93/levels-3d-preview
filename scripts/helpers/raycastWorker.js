//web worker for raycasing
import * as THREE from "../lib/three.module.js";
import {computeBoundsTree, disposeBoundsTree, acceleratedRaycast} from "../lib/three-mesh-bvh.js";
import { isMath } from "./math.js";
//import * as Math from "https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.5.0/math.js";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const scene = new THREE.Scene();

scene.tiles = {};

const basicMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00});

const raycaster = new THREE.Raycaster();

let _port

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
                port.postMessage({type: "refresh"});
            }

            if (message.type == "remove") { 
                const mesh = scene.tiles[message.id];
                if (mesh) {
                    mesh.removeFromParent();
                    delete scene.tiles[message.id];
                }
                port.postMessage({ type: "refresh" });
            }

            if (message.type == "clear") { 
                scene.tiles = {};
                scene.traverse((child) => {
                    if (child.isMesh) {
                        child.dispose?.();
                    }
                });
                while (scene.children.length > 0) {
                    scene.children[0].dispose?.();
                    scene.remove(this.scene.children[0]);
                }
            }

            if (message.type == "raycast") {
                const raycastObjects = [];
                scene.traverse((child) => { 
                    if(child?.userData?.sight) raycastObjects.push(child);
                });
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
                    const collision = computeSightCollision({ x: origin.x, y: origin.y, z: z }, { x: x, y: y, z: z }, raycastObjects);
                    if (collision) {
                        polygonPoints.push(Math.round(collision.x * factor), Math.round(collision.z * factor));
                    } else {
                        polygonPoints.push(Math.round(x), Math.round(y));
                    }
                }
                port.postMessage({ type: "polygon", polygonPoints: polygonPoints, id: message.id, callbackId: message.callbackId });
            }
        } catch (error) {
            port.postMessage({ type: "error", error: error });
        }

        
    };
};






function computeSightCollision(v1, v2, raycastObjects) {
    const factor = 1000;
        const origin =  new THREE.Vector3(v1.x/factor, v1.z, v1.y/factor) //Ruler3D.posCanvasTo3d(v1);
        const target = new THREE.Vector3(v2.x / factor, v2.z, v2.y / factor);
        return computeSightCollisionFrom3DPositions(origin, target, raycastObjects);
    }

function computeSightCollisionFrom3DPositions(origin, target, raycastObjects) {
    const direction = target.clone().sub(origin).normalize();
    const distance = Infinity;
    raycaster.far = Infinity;
    raycaster.set(origin, direction);
    let collisions = raycaster.intersectObjects(raycastObjects, true);
    if (!collisions.length) return false;
    const collision = collisions[0];
    if (collision.distance > distance) return false;
    return collision.point.add(direction.multiplyScalar(0.025));
}