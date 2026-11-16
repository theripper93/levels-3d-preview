import { Box3, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from "three";

export const PROP_MAX_SQUARES = 2;
export const PROP_PAD_SQUARES = 0.05;
export const SPAN_SQUARES = 0.25;
export const CONTACT_SQUARES = 0.05;
export const HANG_SQUARES = 0.5;
export const REACH_SQUARES = 0.5;
export const WALL_SQUARES = 1.5;
export const BASE_SQUARES = 0.25;

const frontMaterial = new MeshBasicMaterial();
const _instanceMatrix = new Matrix4();
const _point = new Vector3();
const BOX_EPSILON = 1e-6;

function createPart(source, local, matrix, door) {
    const mesh = new Mesh(source.geometry, frontMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.matrixWorld.copy(matrix);
    mesh.layers.mask = source.layers.mask;
    mesh.userData.box = local.clone().applyMatrix4(matrix);
    return { mesh, box: mesh.userData.box, door: door || !!source.userData?.isDoor };
}

export function buildOccluder(meshes, door = false) {
    const box = new Box3();
    const parts = [];
    for (const source of meshes) {
        const position = source.geometry?.attributes.position;
        if (!position) continue;
        const local = new Box3().setFromBufferAttribute(position);
        if (!source.isInstancedMesh) parts.push(createPart(source, local, source.matrixWorld, door));
        else for (let i = 0; i < source.count; i++) parts.push(createPart(source, local, source.getMatrixAt(i, _instanceMatrix).premultiply(source.matrixWorld), door));
    }
    for (const part of parts) box.union(part.box);
    return { box, parts, door: parts.some((part) => part.door) };
}

export function containsLight(box, { x, y, z, pad = 0 }) {
    return !box.isEmpty() && x >= box.min.x - pad && x <= box.max.x + pad && y >= box.min.z - pad && y <= box.max.z + pad && z >= box.min.y - pad && z <= box.max.y + pad;
}

export function coversLight(box, { x, y }, reach = 0) {
    return box.min.x - reach <= x && box.max.x + reach >= x && box.min.z - reach <= y && box.max.z + reach >= y;
}

export function isWallLike(box, { wall = 0 }) {
    return box.max.y - box.min.y >= wall;
}

export function isSolid(item, params) {
    return !!item.door || isWallLike(item.box, params);
}

export function isOwnProp(box, params) {
    if (!params.prop || !containsLight(box, params)) return false;
    return Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) <= params.prop;
}

export function castSupport(raycaster, occluders, params) {
    const { x, y, z } = params;
    const meshes = [];
    for (const occluder of occluders) {
        if (!occluder || occluder.box.isEmpty() || occluder.box.min.y > z || !coversLight(occluder.box, params)) continue;
        for (const part of occluder.parts) if (part.box.min.y <= z && coversLight(part.box, params)) meshes.push(part.mesh);
    }
    if (!meshes.length) return [];
    const firstHitOnly = raycaster.firstHitOnly;
    raycaster.firstHitOnly = false;
    raycaster.ray.origin.set(x, z, y);
    raycaster.ray.direction.set(0, -1, 0);
    raycaster.near = 0;
    raycaster.far = Infinity;
    const hits = raycaster.intersectObjects(meshes, false);
    raycaster.firstHitOnly = firstHitOnly;
    return hits;
}

export function isHanging(occluder, support, params) {
    let floor = params.ground ?? -Infinity;
    let base = Infinity;
    for (const hit of support) {
        if (occluder.parts.some((part) => part.mesh === hit.object)) base = Math.min(base, hit.point.y);
        else floor = Math.max(floor, hit.point.y);
    }
    return floor > -Infinity && occluder.box.min.y > floor + (params.hang ?? 0) && base > occluder.box.min.y + (params.base ?? 0);
}

export function isOwnFixture(occluder, getSupport, params) {
    if (!coversLight(occluder.box, params, params.reach ?? 0)) return false;
    if (!isSolid(occluder, params)) return true;
    return isHanging(occluder, getSupport(), params);
}

export function spansLight(box, { x, y, z, radius, span = 0 }) {
    return box.min.y <= z && box.max.y >= z + span && box.min.x <= x + radius && box.max.x >= x - radius && box.min.z <= y + radius && box.max.z >= y - radius;
}

export function shadowsFloor(item, params) {
    const { x, y, z, radius, span = 0 } = params;
    const box = item.box;
    return box.max.y < z + span && box.min.y <= z && isSolid(item, params) && box.min.x <= x + radius && box.max.x >= x - radius && box.min.z <= y + radius && box.max.z >= y - radius;
}

export function findFloor(support, low, params) {
    let top = low.length ? Infinity : params.z;
    let bottom = Infinity;
    for (const mesh of low) {
        const box = mesh.userData.box;
        top = Math.min(top, box.max.y);
        bottom = Math.min(bottom, box.min.y);
    }
    let floor = params.ground ?? -Infinity;
    for (const hit of support) if (hit.point.y < top && hit.point.y > floor && isFloorMesh(hit.object, params)) floor = hit.point.y;
    return floor > -Infinity ? floor : bottom;
}

function isFloorMesh(mesh, { prop = 0 }) {
    const box = mesh.userData.box;
    return Math.min(box.max.x - box.min.x, box.max.z - box.min.z) > prop;
}

export function collectMaskTargets(occluders, params, getSupport, targets = [], solid = [], low = [], boxes = new Map()) {
    for (const occluder of occluders) {
        if (!occluder || !(spansLight(occluder.box, params) || shadowsFloor(occluder, params)) || isOwnProp(occluder.box, params) || isOwnFixture(occluder, getSupport, params)) continue;
        for (const part of occluder.parts) {
            if (spansLight(part.box, params)) {
                targets.push(part.mesh);
                if (isSolid(part, params)) solid.push(part.mesh);
            } else if (shadowsFloor(part, params)) low.push(part.mesh);
            else continue;
            boxes.set(part.mesh, part.box.clone().expandByScalar(BOX_EPSILON));
        }
    }
    return targets;
}

export function createMaskJob(raycaster, occluders, params) {
    let support = null;
    const getSupport = () => (support ??= castSupport(raycaster, occluders, params));
    const solid = [];
    const low = [];
    const boxes = new Map();
    const targets = collectMaskTargets(occluders, params, getSupport, [], solid, low, boxes);
    const floor = solid.length || low.length ? findFloor(getSupport(), low, params) : -Infinity;
    const lowTops = low.filter((mesh) => boxes.get(mesh).max.y >= params.z - (params.near ?? 0));
    targets.push(...lowTops);
    solid.push(...low);
    return { params, targets, solid, low, boxes, active: targets.length > 0 || solid.length > 0, floor: floor + (params.near ?? 0), solidSet: new Set(solid), points: new Float32Array(params.rays * 4), hits: 0, index: 0 };
}

function firstHit(raycaster, meshes, boxes) {
    const ray = raycaster.ray;
    const candidates = [];
    for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        if (!mesh.layers.test(raycaster.layers)) continue;
        const box = boxes.get(mesh);
        if (!ray.intersectBox(box, _point)) continue;
        const entry = box.containsPoint(ray.origin) ? 0 : _point.distanceTo(ray.origin);
        if (entry <= raycaster.far) candidates.push([entry, i]);
    }
    candidates.sort((a, b) => a[0] - b[0]);
    let best = null;
    let bestIndex = Infinity;
    const hits = [];
    for (const [entry, i] of candidates) {
        if (best && entry > best.distance) break;
        hits.length = 0;
        meshes[i].raycast(raycaster, hits);
        for (const hit of hits) {
            if (!best || hit.distance < best.distance || (hit.distance === best.distance && i < bestIndex)) {
                best = hit;
                bestIndex = i;
            }
        }
    }
    return best;
}

function traceFloorRay(raycaster, job, dx, dz, wall) {
    const { z, radius } = job.params;
    const drop = z - job.floor;
    if (!(drop > 0)) return null;
    const length = Math.hypot(radius, drop);
    raycaster.ray.direction.set((dx * radius) / length, -drop / length, (dz * radius) / length);
    raycaster.near = 0;
    raycaster.far = (length * wall) / radius;
    const hit = firstHit(raycaster, job.low, job.boxes);
    return hit ? (hit.distance * radius) / length : null;
}

function traceOpening(raycaster, job, dx, dz, wall) {
    const { x, y, z, radius, near = 0 } = job.params;
    const floor = job.floor;
    if (!job.solid.length || !(z > floor) || !Number.isFinite(floor)) return null;
    raycaster.ray.origin.set(x, floor, y);
    raycaster.ray.direction.set(dx, 0, dz);
    raycaster.near = near;
    raycaster.far = wall;
    const foot = firstHit(raycaster, job.solid, job.boxes);
    if (!foot || foot.distance >= wall) return null;
    const inside = foot.distance + near;
    raycaster.ray.origin.set(x + dx * inside, z - ((z - floor) * inside) / radius, y + dz * inside);
    raycaster.ray.direction.set(0, 1, 0);
    raycaster.near = 0;
    raycaster.far = Infinity;
    return raycaster.intersectObject(foot.object, false).length ? foot.distance : null;
}

export function traceMaskRay(raycaster, job, index) {
    const { x, y, z, radius, rays, near = 0 } = job.params;
    const a = (index / rays) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    raycaster.ray.origin.set(x, z, y);
    raycaster.ray.direction.set(dx, 0, dz);
    raycaster.near = near;
    raycaster.far = radius;
    const hit = job.targets.length ? firstHit(raycaster, job.targets, job.boxes) : null;
    let d = hit ? Math.min(radius, hit.distance) : radius;
    let wall = d;
    if (hit && !job.solidSet.has(hit.object)) {
        const solidHit = job.solid.length ? firstHit(raycaster, job.solid, job.boxes) : null;
        wall = solidHit ? Math.min(radius, solidHit.distance) : radius;
    }
    const floorHit = job.low.length ? traceFloorRay(raycaster, job, dx, dz, wall) : null;
    if (floorHit !== null) {
        d = Math.min(d, floorHit);
        wall = Math.min(wall, floorHit);
    }
    const opening = traceOpening(raycaster, job, dx, dz, wall);
    if (opening !== null) {
        d = Math.min(d, opening);
        wall = opening;
    }
    if (hit || floorHit !== null || opening !== null) job.hits++;
    const points = job.points;
    points[index * 2] = x + dx * d;
    points[index * 2 + 1] = y + dz * d;
    points[(rays + index) * 2] = x + dx * wall;
    points[(rays + index) * 2 + 1] = y + dz * wall;
}
