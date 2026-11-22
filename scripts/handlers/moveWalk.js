import * as THREE from "three";
import { factor } from "../main.js";
import { posCanvasTo3d, pos3DToCanvas } from "../helpers/coords3d.js";

const MAX_SLOPE_DEGREES = 60;
const MIN_UP = Math.cos((MAX_SLOPE_DEGREES * Math.PI) / 180);
const CLIMB = Math.tan((MAX_SLOPE_DEGREES * Math.PI) / 180);
const STEP_CELLS = 1 / 3;
const LIFT_CELLS = 0.05;
const SAMPLE_CELLS = 0.5;
const MAX_SAMPLES = 48;
const GROUNDED_CELLS = 2.25;

const DOWN = new THREE.Vector3(0, -1, 0);
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _instance = new THREE.Matrix4();
const _normalMatrix = new THREE.Matrix3();

const WALKING_ACTIONS = new Set(["walk", "crawl"]);

let memo = null;
let currentAction = null;

function interactionManager() {
    return game.Levels3DPreview?.interactionManager;
}

function cellSize() {
    return canvas.scene.dimensions.size / factor;
}

function cast(targets, origin, dir, far) {
    const im = interactionManager();
    const rc = im.sightRaycaster;
    rc.far = far;
    rc.firstHitOnly = true;
    rc.set(origin, dir);
    return rc.intersectObjects(im.sightBroadphase.filter(rc, targets), true)[0] ?? null;
}

function castTo(targets, from, to) {
    const distance = from.distanceTo(to);
    if (distance < 1e-6) return null;
    return cast(targets, from, _dir.subVectors(to, from).divideScalar(distance), distance);
}

function hitNormal(hit, direction, out = new THREE.Vector3()) {
    const object = hit?.object;
    const face = hit?.face;
    if (!object || !face?.normal) return null;
    out.copy(face.normal);
    _matrix.copy(object.matrixWorld);
    if (object.isInstancedMesh && hit.instanceId !== undefined) _matrix.multiply(object.getMatrixAt(hit.instanceId, _instance));
    else if (object.isBatchedMesh && hit.batchId !== undefined) _matrix.multiply(object.getMatrixAt(hit.batchId, _instance));
    out.applyMatrix3(_normalMatrix.getNormalMatrix(_matrix)).normalize();
    if (direction && out.dot(direction) > 0) out.negate();
    return out;
}

function isWalkable(hit, direction) {
    const normal = hitNormal(hit, direction, _normal);
    return !!normal && normal.y >= MIN_UP;
}

function groundBelow(targets, x, y, z, far = Infinity) {
    const hit = cast(targets, _from.set(x, y, z), DOWN, far);
    if (hit) return hit.point.y;
    const board = posCanvasTo3d({ x: 0, y: 0, z: canvas.primary.background.elevation ?? 0 }).y;
    return y >= board && y - board <= far ? board : null;
}

function collisionTargets(origin, target, cell) {
    const im = interactionManager();
    const pad = cell * factor;
    im.forceSightCollisions({ x: Math.min(origin.x, target.x) * factor - pad, y: Math.min(origin.z, target.z) * factor - pad }, { x: Math.max(origin.x, target.x) * factor + pad, y: Math.max(origin.z, target.z) * factor + pad });
    return im._sightCollisions.move ?? [];
}

function stepThrough(targets, ax, az, bx, bz, feet, cell) {
    const lift = cell * LIFT_CELLS;
    const step = cell * STEP_CELLS;
    const length = Math.hypot(bx - ax, bz - az);
    const direction = new THREE.Vector3((bx - ax) / length, 0, (bz - az) / length);
    const base = cast(targets, new THREE.Vector3(ax, feet + lift, az), direction, length);
    if (!base) {
        const ground = groundBelow(targets, bx, feet + lift, bz);
        return { feet: ground ?? feet };
    }
    if (!isWalkable(base, direction)) {
        const raised = cast(targets, new THREE.Vector3(ax, feet + step, az), direction, length);
        if (raised && !isWalkable(raised, direction) && raised.distance - base.distance < (step - lift) / CLIMB) return { blocked: base.distance / length };
    }
    const top = feet + lift + step + CLIMB * length;
    const ground = groundBelow(targets, bx, top, bz, top - feet + cell);
    if (ground === null) return { feet };
    const from = base.point.clone().addScaledVector(hitNormal(base, direction, new THREE.Vector3()) ?? THREE.Object3D.DEFAULT_UP, lift);
    from.y = Math.max(from.y, feet + lift);
    const to = new THREE.Vector3(bx, ground + lift, bz);
    const rest = castTo(targets, from, to);
    if (rest && !isWalkable(rest, _dir.subVectors(to, from).normalize())) {
        const over = castTo(targets, from.clone().setY(from.y + step), to.clone().setY(to.y + step));
        if (over && !isWalkable(over, _dir.subVectors(to, from).normalize())) return { blocked: base.distance / length };
    }
    return { feet: ground };
}

function walk(origin, target) {
    const cell = cellSize();
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const horizontal = Math.hypot(dx, dz);
    if (horizontal < cell * LIFT_CELLS) return { grounded: false };
    const targets = collisionTargets(origin, target, cell);
    const start = groundBelow(targets, origin.x, origin.y + cell * LIFT_CELLS, origin.z, cell * (GROUNDED_CELLS + LIFT_CELLS));
    if (start === null) return { grounded: false };
    const key = `${origin.x}|${origin.z}|${target.x}|${target.z}|${Math.round(start * 1000)}`;
    if (!memo) {
        memo = new Map();
        queueMicrotask(() => (memo = null));
    }
    const cached = memo.get(key);
    if (cached) return cached;
    const samples = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(horizontal / (cell * SAMPLE_CELLS))));
    let feet = start;
    let result = null;
    for (let i = 0; i < samples; i++) {
        const a = i / samples;
        const b = (i + 1) / samples;
        const segment = stepThrough(targets, origin.x + dx * a, origin.z + dz * a, origin.x + dx * b, origin.z + dz * b, feet, cell);
        if (segment.blocked !== undefined) {
            result = { grounded: true, blocked: (i + segment.blocked) / samples, start, feet };
            break;
        }
        feet = segment.feet;
    }
    result ??= { grounded: true, start, feet };
    memo.set(key, result);
    return result;
}

export function setMoveAction(action) {
    currentAction = action;
    queueMicrotask(() => (currentAction = null));
}

export function testMoveCollision(origin, destination) {
    const hit = interactionManager().computeSightCollision(origin, destination, "move");
    if (hit && hit.distanceTo(posCanvasTo3d(destination)) <= cellSize() * LIFT_CELLS) return null;
    if (!hit || !WALKING_ACTIONS.has(currentAction)) return hit;
    const from = posCanvasTo3d(origin);
    const result = walk(from, posCanvasTo3d(destination));
    if (!result.grounded || result.blocked !== undefined) return hit;
    const arrival = posCanvasTo3d(destination).y - (from.y - result.start);
    return Math.abs(arrival - result.feet) <= cellSize() * (STEP_CELLS + LIFT_CELLS) ? null : hit;
}

export function walkGroundElevation(origin, destination) {
    if (!game.Levels3DPreview?._active || !interactionManager()) return null;
    const result = walk(posCanvasTo3d(origin), posCanvasTo3d(destination));
    if (!result.grounded || result.blocked !== undefined) return null;
    return pos3DToCanvas(new THREE.Vector3(0, result.feet, 0)).elevation;
}
