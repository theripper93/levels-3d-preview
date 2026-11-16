import * as THREE from "three";
import { fogUniforms } from "../systems/Fog.js";

const LINEAR_FOG = "float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );";
const INERT_NEAR = 1e7;
const INERT_FAR = 1e8;
const INERT_FOG = "levels3dInertFog";
const MIN_DENSITY = 0.002;
const HEIGHT_FLOOR = 0.35;
const WEATHER_RANGE = 2.2;
const SETTING_NEAR = 0.7;

export const atmosphereFogUniforms = {
    atmoFogMode: { value: 0 },
    atmoFogHeight: { value: 1 },
};

let installed = false;

export function installAtmosphereFog() {
    if (installed) return;
    installed = true;
    Object.assign(fogUniforms, atmosphereFogUniforms);
    THREE.ShaderChunk.fog_pars_fragment += `
    #ifdef USE_FOG
        uniform float atmoFogMode;
        uniform float atmoFogHeight;
    #endif
    `;
    THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
        LINEAR_FOG,
        `${LINEAR_FOG}
        if ( atmoFogMode > 0.5 ) {
            fogFactor = 1.0 - exp( -3.0 * max( vFogDepth - fogNear, 0.0 ) / max( fogFar - fogNear, 1e-4 ) );
            #ifndef FOW_FROM_OFFSET
                fogFactor *= mix( ${HEIGHT_FLOOR.toFixed(2)}, 1.0, exp( -max( vWorldPositionFoW.y, 0.0 ) / max( atmoFogHeight, 1e-4 ) ) );
            #endif
        }`,
    );
}

export function applyAtmosphereFog(fog, state, { sceneSize, fogDistance, cameraDistance }) {
    atmosphereFogUniforms.atmoFogMode.value = 1;
    atmosphereFogUniforms.atmoFogHeight.value = Math.max(state.fogHeight, 1e-3);
    if (!fog) return;
    fog.color.copy(state.fogColor);
    const density = state.fogDensity;
    if (density < MIN_DENSITY) {
        fog.near = INERT_NEAR;
        fog.far = INERT_FAR;
        return;
    }
    if (state.setting !== "outdoor") {
        fog.near = cameraDistance * SETTING_NEAR;
        fog.far = fogDistance ?? fog.near + (sceneSize * 0.5 + cameraDistance * 0.6) * THREE.MathUtils.lerp(4, 1.5, density);
        return;
    }
    const range = fogDistance ?? Math.max(sceneSize, cameraDistance * 2);
    const weatherRange = cameraDistance * WEATHER_RANGE * (1.5 + 10 * (1 - state.weatherFog) ** 2);
    const far = Math.min(range * THREE.MathUtils.lerp(8, 0.9, Math.sqrt(density)), state.weatherFog > 0.001 ? weatherRange : Infinity);
    fog.near = Math.min(Math.max(far * 0.08 * (1 - density), cameraDistance * (1 - state.weatherFog)), far * 0.5);
    fog.far = far;
}

export function resetAtmosphereFog(fog) {
    atmosphereFogUniforms.atmoFogMode.value = 0;
    if (fog?.name !== INERT_FOG) return;
    fog.near = INERT_NEAR;
    fog.far = INERT_FAR;
}
