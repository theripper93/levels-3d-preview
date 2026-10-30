import { acceleratedRaycast as bvhAcceleratedRaycast } from "three-mesh-bvh";

export function acceleratedRaycast(raycaster, intersects) {
    const start = intersects.length;
    bvhAcceleratedRaycast.call(this, raycaster, intersects);
    for (let i = intersects.length - 1; i >= start; i--) {
        if (!Number.isFinite(intersects[i].distance)) intersects.splice(i, 1);
    }
}
