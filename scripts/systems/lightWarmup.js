import * as THREE from "three";
import { compileForComposer } from "../render/pipeline.js";

export const WARMUP_LAYER = 31;
const MAX_WAIT = 10000;
const COMPILE_BUDGET = 2;

export class LightWarmup {
    constructor(parent) {
        this._parent = parent;
        this.camera = new THREE.PerspectiveCamera();
        this.pending = new Set();
        this.changes = [];
        this.batch = null;
        this.effectLights = new Set();
        this.effectPool = [];
        this.objects = [];
    }

    createEffectPool() {
        this.effectLights.clear();
        this.effectPool = [];
    }

    acquireEffectLight() {
        return this.effectPool.pop();
    }

    releaseEffectLight(light) {
        light.removeFromParent();
        if (!this.effectLights.has(light)) return light.dispose();
        light.intensity = 0;
        light.color = new THREE.Color(0xffffff);
        light.distance = 0.0001;
        light.decay = 2;
        light.castShadow = false;
        light.visible = true;
        light.layers.set(0);
        light.position.set(-1000, -1000, -1000);
        this._parent.scene.add(light);
        if (!this.effectPool.includes(light)) this.effectPool.push(light);
    }

    add(light) {
        this.batch?.lights.delete(light);
        if (!this._parent._ready) {
            this.pending.delete(light);
            light.layers.set(0);
            return;
        }
        light.layers.set(WARMUP_LAYER);
        this.pending.add(light);
    }

    get idle() {
        return !this.batch && !this.objects.length && !this.pending.size && !this.changes.length;
    }

    isWarming(light) {
        return this.pending.has(light) || !!this.batch?.lights.has(light);
    }

    remove(light) {
        this.pending.delete(light);
        this.batch?.lights.delete(light);
    }

    warmChange(change) {
        if (!this._parent._ready) return finishChange(change);
        this.changes.push(change);
    }

    clear() {
        [...(this.batch?.changes ?? []), ...this.changes.splice(0)].forEach(finishChange);
        this.pending.clear();
        this.batch = null;
        this.objects = [];
        this.effectLights.clear();
        this.effectPool = [];
    }

    isInScene(object) {
        while (object.parent) object = object.parent;
        return object === this._parent.scene || object === this._parent.kitBatcher?.root;
    }

    warmObject(object) {
        if (!this._parent._ready || !object || !this.isInScene(object)) return;
        const renderer = this._parent.renderer;
        this.camera.copy(this._parent.camera);
        this.camera.layers.enableAll();
        const materials = compileForComposer(this._parent, object, this.camera, this._parent.scene);
        const programs = [...materials].map((material) => renderer.properties.get(material).currentProgram).filter((program) => program?.usedTimes > 0 && !program.isReady());
        if (!programs.length) return;
        const layers = new Map();
        object.traverse((child) => {
            layers.set(child, this.originalMask(child));
            child.layers.set(WARMUP_LAYER);
        });
        this.objects.push({ layers, programs, start: performance.now() });
    }

    originalMask(child) {
        for (const entry of this.objects) if (entry.layers.has(child)) return entry.layers.get(child);
        return child.layers.mask;
    }

    updateObjects() {
        this.objects = this.objects.filter((entry) => {
            entry.programs = entry.programs.filter((program) => program.usedTimes > 0 && !program.isReady());
            if (entry.programs.length && performance.now() - entry.start < MAX_WAIT) return true;
            for (const [child, mask] of entry.layers) child.layers.mask = mask;
            return false;
        });
    }

    update() {
        if (this.objects.length) this.updateObjects();
        if (this.batch) return this.batch.index < this.batch.objects.length ? this.compileStep() : this.checkBatch();
        if (!this.pending.size && !this.changes.length) return;
        const lights = new Set([...this.pending].filter((light) => this.isInScene(light)));
        if (!lights.size && !this.changes.length) return;
        lights.forEach((light) => this.pending.delete(light));
        const objects = [];
        const collect = (object) => {
            if (object.material) objects.push(object);
        };
        this._parent.scene.traverse(collect);
        this._parent.kitBatcher?.root.traverse(collect);
        this.batch = { lights, changes: this.changes.splice(0), objects, index: 0, programs: [], start: performance.now() };
        this.compileStep();
    }

    compileStep() {
        const renderer = this._parent.renderer;
        const batch = this.batch;
        const start = performance.now();
        const target = {
            traverse: (callback) => {
                while (batch.index < batch.objects.length && performance.now() - start < COMPILE_BUDGET) {
                    const object = batch.objects[batch.index++];
                    if (this.isInScene(object)) callback(object);
                }
            },
            traverseVisible: () => {},
        };
        this.camera.copy(this._parent.camera);
        this.camera.layers.enable(WARMUP_LAYER);
        const waiting = [...this.pending];
        waiting.forEach((light) => light.layers.disable(WARMUP_LAYER));
        batch.changes.forEach((change) => change.apply());
        const materials = compileForComposer(this._parent, target, this.camera, this._parent.scene);
        batch.changes.toReversed().forEach((change) => change.revert());
        waiting.forEach((light) => light.layers.enable(WARMUP_LAYER));
        materials.forEach((material) => {
            const program = renderer.properties.get(material).currentProgram;
            if (program) batch.programs.push({ material, program });
            if (batch.changes.length) material.needsUpdate = true;
        });
    }

    checkBatch() {
        const { lights, changes, start } = this.batch;
        const properties = this._parent.renderer.properties;
        this.batch.programs = this.batch.programs.filter(({ material, program }) => properties.get(material).currentProgram !== undefined && program.usedTimes > 0 && !program.isReady());
        if (this.batch.programs.length && performance.now() - start < MAX_WAIT) return;
        this.batch = null;
        lights.forEach((light) => light.layers.enable(0));
        changes.forEach(finishChange);
    }
}

function finishChange(change) {
    change.apply();
    change.done?.();
}
