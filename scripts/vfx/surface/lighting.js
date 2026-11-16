import * as THREE from "three";
import { sampleGlobalLight } from "../probe.js";

const FALLBACK_SKY = new THREE.Color(0.5, 0.55, 0.6);
const sky = new THREE.Color();

function toLinear(color) {
    color.r = Math.pow(color.r, 2.2);
    color.g = Math.pow(color.g, 2.2);
    color.b = Math.pow(color.b, 2.2);
    return color;
}

function normalized(color) {
    const peak = Math.max(color.r, color.g, color.b, 1e-4);
    return color.multiplyScalar(1 / Math.max(peak, 1));
}

export function surfaceLighting(uniforms) {
    toLinear(sampleGlobalLight(uniforms.uSurfaceAmbient.value));
    const illumination = game.Levels3DPreview?.lights?.globalIllumination;
    const atmosphere = illumination?.atmosphere;
    if (atmosphere?.enabled) sky.copy(atmosphere.skyHorizon);
    else if (illumination?.hemisphereLight?.intensity > 0) sky.copy(illumination.hemisphereLight.color);
    else sky.copy(game.Levels3DPreview?.scene?.fog?.color ?? FALLBACK_SKY);
    uniforms.uSurfaceSky.value.copy(normalized(sky));
}
