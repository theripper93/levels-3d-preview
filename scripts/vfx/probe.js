import * as THREE from "three";

const ENVIRONMENT_LIGHT = 0.35;
const MIN_LIGHT = 0.02;
const MAX_LIGHT = 1;
const LIGHT_LIST_LIFETIME = 2000;
const WARMUP_LAYER_MASK = (1 << 31) >>> 0;
const DAY_GAIN = 0.45;
const DAY_LEVEL = [0.7, 1.3];

const sunDirection = new THREE.Vector3();
const sunTarget = new THREE.Vector3();
const lightPosition = new THREE.Vector3();
const lightAxis = new THREE.Vector3();
const toSample = new THREE.Vector3();
const scratch = new THREE.Color();
const daylight = new THREE.Color();

const lightList = { scene: null, time: 0, lights: [] };

function sceneLights() {
    const scene = game.Levels3DPreview.scene;
    const now = performance.now();
    if (lightList.scene === scene && now - lightList.time < LIGHT_LIST_LIFETIME) return lightList.lights;
    lightList.scene = scene;
    lightList.time = now;
    lightList.lights = [];
    scene.traverse((object) => {
        if (object.isPointLight || object.isSpotLight) lightList.lights.push(object);
    });
    return lightList.lights;
}

function toPerceptual(color) {
    color.r = Math.clamp(color.r, MIN_LIGHT, MAX_LIGHT);
    color.g = Math.clamp(color.g, MIN_LIGHT, MAX_LIGHT);
    color.b = Math.clamp(color.b, MIN_LIGHT, MAX_LIGHT);
    color.r = Math.pow(color.r, 1 / 2.2);
    color.g = Math.pow(color.g, 1 / 2.2);
    color.b = Math.pow(color.b, 1 / 2.2);
    return color;
}

function addGlobalLight(target) {
    const L = game.Levels3DPreview;
    const globalIllumination = L.lights?.globalIllumination;
    const sun = globalIllumination?.global?.sunlight;
    if (sun?.intensity > 0) {
        sun.getWorldPosition(sunDirection).sub(sun.target.getWorldPosition(sunTarget)).normalize();
        const daylight = THREE.MathUtils.smoothstep(sunDirection.y, -0.05, 0.35);
        target.add(scratch.copy(sun.color).multiplyScalar(sun.intensity * daylight));
    }
    const ambient = globalIllumination?.ambientLight;
    if (ambient?.parent && ambient.intensity > 0) target.add(scratch.copy(ambient.color).multiplyScalar(ambient.intensity));
    if (L.scene.environment) target.addScalar(ENVIRONMENT_LIGHT * (L.scene.environmentIntensity ?? 1));
    return target;
}

function addLocalLights(position, target) {
    for (const light of sceneLights()) {
        if (!light.visible || light.intensity <= 0 || light.layers.mask === WARMUP_LAYER_MASK) continue;
        light.getWorldPosition(lightPosition);
        const distance = lightPosition.distanceTo(position);
        if (light.distance > 0 && distance >= light.distance) continue;
        let falloff = light.distance > 0 ? Math.pow(1 - distance / light.distance, light.decay || 1) : 1;
        if (light.isSpotLight) {
            lightAxis.copy(light.target.getWorldPosition(sunTarget)).sub(lightPosition).normalize();
            toSample.copy(position).sub(lightPosition).normalize();
            const cone = Math.cos(light.angle);
            falloff *= THREE.MathUtils.smoothstep(lightAxis.dot(toSample), cone, cone + (1 - cone) * Math.max(light.penumbra, 0.05));
        }
        if (falloff > 0) target.add(scratch.copy(light.color).multiplyScalar(light.intensity * falloff));
    }
    return target;
}

export function sampleGlobalLight(targetColor = new THREE.Color()) {
    return toPerceptual(addGlobalLight(targetColor.setRGB(0, 0, 0)));
}

export function sampleLightAt(position, targetColor = new THREE.Color()) {
    return toPerceptual(addLocalLights(position, addGlobalLight(targetColor.setRGB(0, 0, 0))));
}

export function additiveGain() {
    const light = addGlobalLight(daylight.setRGB(0, 0, 0));
    const level = (light.r + light.g + light.b) / 3;
    return THREE.MathUtils.lerp(1, DAY_GAIN, THREE.MathUtils.smoothstep(level, DAY_LEVEL[0], DAY_LEVEL[1]));
}
