import * as QUARKS from "../lib/three.quarks.esm.js";
import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";

const vfxCache = {};

export class VFXSystem {
    constructor(parent) {
        this._parent = parent;
        this.system = new QUARKS.BatchedParticleRenderer();
        this.loader = new QUARKS.QuarksLoader(new THREE.LoadingManager());
        this.loader.setCrossOrigin("");
    }

    get scene() {
        return this._parent.scene;
    }

    init() {
        this.scene.add(this.system);
    }

    update(delta) {
        this.system.update(delta);
    }

    isVFX(urlOrId) {
        return vfxCache[urlOrId] !== undefined || urlOrId.endsWith(".json");
    }

    async loadVFX(urlOrId) {
            if (vfxCache[urlOrId]) {
                return await this.getClone(urlOrId);
            } else {
                vfxCache[urlOrId] = await fetchJsonWithTimeout(urlOrId);
                return await this.getClone(urlOrId);
            }
    }

    getClone(urlOrId) {
        return new Promise(async (resolve, reject) => {
            this.loader.parse(vfxCache[urlOrId], (vfx) => { 
                vfx.traverse((child) => {
                    if (child.type === "ParticleEmitter") {
                        this.system.addSystem(child.system);
                    }
                });
                resolve(this.preProcessVFX(vfx));
            });
        });
    }

    preProcessVFX(vfx) {
        const gridSize = canvas.grid.size / factor;
        // Scale the VFX to the grid size
        const currentSize = new THREE.Box3().setFromObject(vfx).getSize(new THREE.Vector3());
        //Fit into a gridSize x gridSize x gridSize box
        const scale = gridSize / Math.max(currentSize.x, currentSize.y, currentSize.z);
        vfx.scale.set(scale, scale, scale);
        // Center the VFX
        const box = new THREE.Box3().setFromObject(vfx);
        const center = box.getCenter(new THREE.Vector3());
        vfx.position.set(-center.x, -center.y, -center.z);
        vfx.scale.set(gridSize, gridSize, gridSize);
        return vfx;
    }
}

const defaultVFX = {};
