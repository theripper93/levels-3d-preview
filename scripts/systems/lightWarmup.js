import * as THREE from "three";

export const WARMUP_LAYER = 31;
const MAX_WAIT = 10000;
const COMPILE_BUDGET = 2;
const EFFECT_POOL_SIZE = 4;

export class LightWarmup {
    constructor(parent) {
        this._parent = parent;
        this.camera = new THREE.PerspectiveCamera();
        this.pending = new Set();
        this.batch = null;
        this.effectLights = new Set();
        this.effectPool = [];
    }

    createEffectPool() {
        this.effectLights.clear();
        this.effectPool = [];
        for (let i = 0; i < EFFECT_POOL_SIZE; i++) {
            const light = new THREE.PointLight(0xffffff, 0, 0.0001, 2);
            light.userData.pooled = true;
            this.effectLights.add(light);
            this.releaseEffectLight(light);
        }
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

    isWarming(light) {
        return this.pending.has(light) || !!this.batch?.lights.has(light);
    }

    remove(light) {
        this.pending.delete(light);
        this.batch?.lights.delete(light);
    }

    clear() {
        this.pending.clear();
        this.batch = null;
        this.effectLights.clear();
        this.effectPool = [];
    }

    isInScene(object) {
        while (object.parent) object = object.parent;
        return object === this._parent.scene;
    }

    update() {
        if (this.batch) return this.batch.index < this.batch.objects.length ? this.compileStep() : this.checkBatch();
        if (!this.pending.size) return;
        const lights = new Set([...this.pending].filter((light) => this.isInScene(light)));
        if (!lights.size) return;
        lights.forEach((light) => this.pending.delete(light));
        const objects = [];
        this._parent.scene.traverse((object) => {
            if (object.material) objects.push(object);
        });
        this.batch = { lights, objects, index: 0, programs: [], start: performance.now() };
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
        const materials = renderer.compile(target, this.camera, this._parent.scene);
        waiting.forEach((light) => light.layers.enable(WARMUP_LAYER));
        materials.forEach((material) => {
            const program = renderer.properties.get(material).currentProgram;
            if (program) batch.programs.push({ material, program });
        });
    }

    checkBatch() {
        const { lights, start } = this.batch;
        const properties = this._parent.renderer.properties;
        this.batch.programs = this.batch.programs.filter(({ material, program }) => properties.get(material).currentProgram !== undefined && program.usedTimes > 0 && !program.isReady());
        if (this.batch.programs.length && performance.now() - start < MAX_WAIT) return;
        this.batch = null;
        lights.forEach((light) => light.layers.enable(0));
    }
}
