export { setSurface, getSurface, surfaceAmounts, surfaceSettings, depositTarget, createRamp, evaluateRamp, describeSurface, rainRate, isInteriorScene, SURFACE_FLAG, SURFACE_KINDS, SURFACE_DEPOSITS, SURFACE_DEFAULTS } from "./state.js";
export { surfaceUniforms, installSurfaceChunks, markReceivers } from "./receivers.js";
export { SurfaceMap, SURFACE_CHANNELS } from "./surfaceMap.js";
export { SurfaceSystem, onShelterRendered } from "./surfaceSystem.js";
import { SurfaceSystem } from "./surfaceSystem.js";

export function getSurfaceSystem() {
    return SurfaceSystem.current;
}

export function stamp(scene, channels) {
    return SurfaceSystem.current?.stamp(scene, channels);
}
