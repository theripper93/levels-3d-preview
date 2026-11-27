import * as QUARKS from "three.quarks";

const { RenderMode, SpriteBatch, TrailBatch, ParticleSystem } = QUARKS;
const BILLBOARDS = new Set([RenderMode.StretchedBillBoard, RenderMode.VerticalBillBoard, RenderMode.HorizontalBillBoard, RenderMode.BillBoard]);

const baseSystemUpdate = ParticleSystem.prototype.update;
ParticleSystem.prototype.update = function (delta) {
    if (!this.paused) this._renderTick = (this._renderTick | 0) + 1;
    return baseSystemUpdate.call(this, delta);
};

SpriteBatch.prototype.update = function () {
    const mode = this.settings.renderMode;
    let needed = 0;
    for (const system of this.systems) {
        if (!system.emitter.visible) continue;
        const slot = system._spriteSlot;
        const count = system.particleNum;
        needed += slot?.batch === this && count <= slot.capacity ? slot.capacity : withHeadroom(count);
    }
    if (needed > this.maxParticles) this.expandBuffers(needed);
    const array = this.offsetBuffer.array;
    let index = 0;
    let first = Infinity;
    let last = 0;
    for (const system of this.systems) {
        const emitter = system.emitter;
        if (!emitter.visible) continue;
        if (emitter.updateMatrixWorld) {
            emitter.updateWorldMatrix(true, false);
            if (emitter.children.length) emitter.updateMatrixWorld(true);
        }
        const elements = emitter.matrixWorld.elements;
        const tick = system._renderTick | 0;
        const count = system.particleNum;
        let slot = system._spriteSlot;
        if (slot?.batch !== this) system._spriteSlot = slot = { batch: this, array: null, offset: -1, capacity: 0, tick: -1, count: 0, matrix: new Float64Array(16) };
        if (slot.array !== array || slot.offset !== index || count > slot.capacity) {
            slot.array = array;
            slot.offset = index;
            if (count > slot.capacity) slot.capacity = withHeadroom(count);
            slot.count = slot.capacity;
            slot.tick = -1;
        }
        if (slot.tick !== tick || slot.count !== count || !sameElements(slot.matrix, elements)) {
            writeSystem(this, system, index, mode);
            clearRange(this, index + count, index + slot.count);
            if (index < first) first = index;
            last = index + Math.max(count, slot.count);
            slot.tick = tick;
            slot.count = count;
            slot.matrix.set(elements);
        }
        index += slot.capacity;
    }
    const resized = this.geometry.instanceCount !== index;
    this.geometry.instanceCount = index;
    if (resized) {
        first = Math.min(first, 0);
        last = Math.max(last, index);
    }
    if (index === 0 || last <= first) return;
    markRange(this.offsetBuffer, first * 3, last * 3);
    markRange(this.sizeBuffer, first * 3, last * 3);
    markRange(this.colorBuffer, first * 4, last * 4);
    markRange(this.uvTileBuffer, first, last);
    if (mode === RenderMode.StretchedBillBoard && this.velocityBuffer) markRange(this.velocityBuffer, first * 4, last * 4);
    if (mode === RenderMode.Mesh) markRange(this.rotationBuffer, first * 4, last * 4);
    else if (BILLBOARDS.has(mode)) markRange(this.rotationBuffer, first, last);
};

const baseTrailUpdate = TrailBatch.prototype.update;
TrailBatch.prototype.update = function () {
    for (const system of this.systems) if (system.particleNum && system.emitter.visible) return baseTrailUpdate.call(this);
    this.geometry.setDrawRange(0, 0);
};

function withHeadroom(count) {
    return count + Math.max(4, Math.ceil(count * 0.25));
}

function sameElements(stored, elements) {
    for (let i = 0; i < 16; i++) if (stored[i] !== elements[i]) return false;
    return true;
}

function markRange(buffer, start, end) {
    end = Math.min(end, buffer.array.length);
    const range = buffer.updateRanges[0];
    if (range) {
        end = Math.max(end, range.start + range.count);
        range.start = Math.min(range.start, start);
        range.count = end - range.start;
    } else buffer.addUpdateRange(start, end - start);
    buffer.needsUpdate = true;
}

function clearRange(batch, start, end) {
    if (end <= start) return;
    batch.sizeBuffer.array.fill(0, start * 3, end * 3);
    batch.colorBuffer.array.fill(0, start * 4, end * 4);
}

function writeSystem(batch, system, index, mode) {
    const particles = system.particles;
    const particleNum = system.particleNum;
    const rotation = batch.quaternion2_;
    const translation = batch.vector2_;
    const scale = batch.vector3_;
    const matrixWorld = system.emitter.matrixWorld;
    const worldSpace = system.worldSpace;
    const billboard = BILLBOARDS.has(mode);
    const stretched = mode === RenderMode.StretchedBillBoard && batch.velocityBuffer;
    const offsets = batch.offsetBuffer.array;
    const colors = batch.colorBuffer.array;
    const sizes = batch.sizeBuffer.array;
    const tiles = batch.uvTileBuffer.array;
    const rotations = batch.rotationBuffer?.array;
    matrixWorld.decompose(translation, rotation, scale);
    batch.rotationMat_.setFromMatrix4(matrixWorld);
    const sx = Math.abs(scale.x);
    const sy = Math.abs(scale.y);
    const sz = Math.abs(scale.z);
    for (let j = 0; j < particleNum; j++, index++) {
        const particle = particles[j];
        if (mode === RenderMode.Mesh) {
            let q;
            if (worldSpace) q = particle.rotation;
            else {
                const parentQ = particle.parentMatrix ? batch.quaternion3_.setFromRotationMatrix(particle.parentMatrix) : rotation;
                q = batch.quaternion_.copy(parentQ).multiply(particle.rotation);
            }
            const r = index * 4;
            rotations[r] = q.x;
            rotations[r + 1] = q.y;
            rotations[r + 2] = q.z;
            rotations[r + 3] = q.w;
        } else if (billboard) rotations[index] = particle.rotation;
        const position = particle.position;
        const o = index * 3;
        if (worldSpace) {
            offsets[o] = position.x;
            offsets[o + 1] = position.y;
            offsets[o + 2] = position.z;
        } else {
            const e = (particle.parentMatrix ?? matrixWorld).elements;
            const x = position.x;
            const y = position.y;
            const z = position.z;
            const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
            offsets[o] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
            offsets[o + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
            offsets[o + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
        }
        const color = particle.color;
        const c = index * 4;
        colors[c] = color.x;
        colors[c + 1] = color.y;
        colors[c + 2] = color.z;
        colors[c + 3] = color.w;
        const size = particle.size;
        if (worldSpace || particle.parentMatrix) {
            sizes[o] = size.x;
            sizes[o + 1] = size.y;
            sizes[o + 2] = size.z;
        } else {
            sizes[o] = size.x * sx;
            sizes[o + 1] = size.y * sy;
            sizes[o + 2] = size.z * sz;
        }
        tiles[index] = particle.uvTile;
        if (stretched) {
            let speedFactor = system.rendererEmitterSettings.speedFactor;
            if (speedFactor === 0) speedFactor = 0.001;
            const lengthFactor = system.rendererEmitterSettings.lengthFactor;
            let velocity;
            if (worldSpace) velocity = particle.velocity;
            else if (particle.parentMatrix) velocity = batch.vector_.copy(particle.velocity).applyMatrix3(batch.rotationMat2_.setFromMatrix4(particle.parentMatrix));
            else velocity = batch.vector_.copy(particle.velocity).applyMatrix3(batch.rotationMat_);
            batch.velocityBuffer.setXYZW(index, velocity.x * speedFactor, velocity.y * speedFactor, velocity.z * speedFactor, lengthFactor);
        }
    }
}
