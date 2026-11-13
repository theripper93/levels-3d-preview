import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Object3D } from "three";
import { VFX_LAYER } from "../constants.js";

const INITIAL_CAPACITY = 32;

export const pools = new Set();

function instancedAttribute(itemSize, capacity, source) {
    const array = new Float32Array(capacity * itemSize);
    if (source) array.set(source.array);
    const attribute = new InstancedBufferAttribute(array, itemSize);
    attribute.setUsage(DynamicDrawUsage);
    return attribute;
}

export class PooledEffect extends Object3D {
    constructor(pool, { life = Infinity, fadeIn = 0, fadeOut = 0 } = {}) {
        super();
        this.pool = pool;
        this.life = life;
        this.fadeIn = fadeIn;
        this.fadeOut = fadeOut;
        this.age = 0;
        this.attached = false;
        pool.handles.add(this);
    }

    get progress() {
        return Number.isFinite(this.life) ? Math.min(1, this.age / this.life) : 0;
    }

    get envelope() {
        const fadeIn = this.fadeIn > 0 ? Math.min(1, this.age / this.fadeIn) : 1;
        const fadeOut = this.fadeOut > 0 ? Math.min(1, (this.life - this.age) / this.fadeOut) : 1;
        return Math.max(0, fadeIn * fadeOut);
    }

    end(fadeOut = 0.5) {
        this.fadeOut = fadeOut;
        this.life = Math.min(this.life, this.age + fadeOut);
    }

    dispose() {
        this.pool.handles.delete(this);
        this.removeFromParent();
    }
}

export class InstancePool extends InstancedMesh {
    constructor(geometry, material, layout, capability) {
        super(geometry, material, INITIAL_CAPACITY);
        this.capacity = INITIAL_CAPACITY;
        this.layout = layout;
        this.capability = capability;
        this.handles = new Set();
        this.count = 0;
        this.frustumCulled = false;
        this.layers.set(VFX_LAYER);
        this.instanceMatrix.setUsage(DynamicDrawUsage);
        for (const [name, itemSize] of Object.entries(layout)) geometry.setAttribute(name, instancedAttribute(itemSize, this.capacity));
        pools.add(this);
    }

    grow() {
        this.dispose();
        this.geometry.dispose();
        this.capacity *= 2;
        this.instanceMatrix = instancedAttribute(16, this.capacity, this.instanceMatrix);
        for (const [name, itemSize] of Object.entries(this.layout)) this.geometry.setAttribute(name, instancedAttribute(itemSize, this.capacity, this.geometry.getAttribute(name)));
    }

    presence(handle, scene) {
        let visible = handle.visible;
        let root = handle;
        while (root.parent) {
            root = root.parent;
            visible &&= root.visible;
        }
        if (root !== scene) return null;
        return visible;
    }

    sync(scene, delta, draw) {
        let count = 0;
        for (const handle of this.handles) {
            handle.age += delta;
            if (handle.age >= handle.life) {
                handle.dispose();
                continue;
            }
            const visible = this.presence(handle, scene);
            if (visible === null) {
                if (handle.attached) this.handles.delete(handle);
                continue;
            }
            handle.attached = true;
            if (!visible || !draw) continue;
            if (count === this.capacity) this.grow();
            handle.updateWorldMatrix(true, false);
            handle.matrixWorld.toArray(this.instanceMatrix.array, count * 16);
            handle.write(this.geometry.attributes, count);
            count++;
        }
        this.count = count;
        if (!count) return;
        this.instanceMatrix.needsUpdate = true;
        for (const name in this.layout) this.geometry.attributes[name].needsUpdate = true;
    }

    destroy() {
        pools.delete(this);
        this.handles.clear();
        this.removeFromParent();
        this.dispose();
        this.geometry.dispose();
        this.material.dispose();
    }
}
