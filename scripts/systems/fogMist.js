import * as THREE from "three";
import { factor } from "../main.js";
import { VFX_LAYER } from "../vfx/constants.js";
import { capabilities, sceneUniforms, warm } from "../vfx/render/index.js";
import { noisePars } from "../vfx/region/shaders.js";
import { ShelterMap } from "../vfx/weather/shelterMap.js";
import { wind } from "../vfx/weather/wind.js";
import { terrainWaterMeshes } from "../helpers/terrainWater.js";
import { gradeMistColor } from "./visionModeMask.js";

const MODULE_ID = "levels-3d-preview";
const MIST_HEIGHT = 1.5;
const MIST_DENSITY = 5;
const MIST_EXPLORED_DENSITY = 0.75;
const MIST_REACH = 8;
const MIST_STEPS = 12;
const DRIFT_SPEED = 0.12;
const WIND_DRIFT = 0.6;
const CALM_DRIFT = new THREE.Vector2(0.6, 0.8);
export const MIST_RENDER_ORDER = 1000;

export function volumetricFogEnabled() {
    return !!(game.settings?.settings?.has(`${MODULE_ID}.volumetricFog`) && game.settings.get(MODULE_ID, "volumetricFog"));
}

const mistVertex = /* glsl */ `
varying vec3 vMistWorld;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vMistWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const mistFragment = /* glsl */ `
#include <common>
#include <vfx_scene_pars_fragment>
${noisePars}
uniform sampler2D uMask;
uniform vec2 uMaskSize;
uniform vec4 uMistRect;
uniform vec4 uMist;
uniform vec3 uUnexplored;
uniform vec3 uExplored;
uniform float uDepthClip;
uniform sampler2D uFloorMap;
uniform vec4 uShelterRect;
uniform float uHasShelter;
uniform vec4 uMotion;
uniform float uBand;
uniform float uExploredDensity;
varying vec3 vMistWorld;
const int MIST_STEPS = ${MIST_STEPS};

float mistMask(vec2 xz) {
    return textureLod(uMask, xz / uMaskSize, 0.0).r;
}

float mistFloor(vec2 xz) {
    if (uHasShelter < 0.5) return uMist.x;
    vec2 uv = clamp(vec2((xz.x - uShelterRect.x) * uShelterRect.z, 1.0 - (xz.y - uShelterRect.y) * uShelterRect.w), 0.0, 1.0);
    return max(textureLod(uFloorMap, uv, 0.0).r, uMist.x);
}

float mistFbm(vec2 p) {
    float value = 0.5 * rfNoise(p);
    value += 0.25 * rfNoise(p * 2.03 + vec2(17.1, 9.2));
    value += 0.125 * rfNoise(p * 4.11 + vec2(3.7, 41.3));
    return value / 0.875;
}

void main() {
    vec3 origin = cameraPosition;
    vec3 direction = normalize(vMistWorld - origin);
    vec3 boxMin = vec3(uMistRect.x, uMist.x, uMistRect.y);
    vec3 boxMax = vec3(uMistRect.z, uMist.y, uMistRect.w);
    vec3 invDirection = 1.0 / direction;
    vec3 t0 = (boxMin - origin) * invDirection;
    vec3 t1 = (boxMax - origin) * invDirection;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);
    float near = max(max(max(tMin.x, tMin.y), tMin.z), 0.0);
    float far = min(min(tMax.x, tMax.y), tMax.z);
    if (uDepthClip > 0.5) {
        vec2 uv = vfxScreenUv();
        far = min(far, dot(vfxWorldPosition(uv, vfxSceneDepth(uv)) - origin, direction));
    }
    float grid = uMist.z;
    float band = grid * uBand;
    float span = min(grid * ${MIST_REACH.toFixed(1)}, band * 1.2 / max(abs(direction.y), 0.1));
    near = max(near, far - span);
    if (far <= near) discard;
    vec3 a = origin + direction * near;
    vec3 b = origin + direction * far;
    if (min(min(mistMask(a.xz), mistMask(b.xz)), mistMask(mix(a.xz, b.xz, 0.5))) > 0.999) discard;
    float stepLength = (far - near) / float(MIST_STEPS);
    float time = uMotion.z;
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float scale = 0.8 / grid;
    float extinction = uMist.w / grid;
    float transmittance = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 0; i < MIST_STEPS; i++) {
        if (transmittance < 0.02) break;
        vec3 p = origin + direction * (near + stepLength * (float(i) + jitter));
        float m = mistMask(p.xz);
        float cover = 1.0 - smoothstep(0.5, 0.95, m);
        float h = (p.y - mistFloor(p.xz)) / band;
        if (cover > 0.001 && h > -0.05 && h < 1.0) {
            vec2 q = (p.xz - uMotion.xy) * scale;
            vec2 warp = vec2(rfNoise(q * 0.45 + vec2(0.0, time * 0.06)), rfNoise(q * 0.45 + vec2(5.2, 1.3 - time * 0.05)));
            float crest = 0.45 + 0.6 * warp.x;
            float layer = 1.0 - smoothstep(crest * 0.2, crest, max(h, 0.0));
            float n = mistFbm(q + (warp - 0.5) * 2.2 + vec2(h * 0.9 + time * 0.03, -time * 0.02));
            float amount = cover * layer * smoothstep(0.28, 0.72, n * 0.85 + layer * 0.3);
            float alpha = 1.0 - exp(-amount * mix(extinction, uExploredDensity / grid, smoothstep(0.0, 0.5, m)) * stepLength);
            float shade = mix(0.55, 1.15, clamp(h * 0.7 + (n - 0.35) * 0.9, 0.0, 1.0));
            vec3 tint = mix(uUnexplored, uExplored, smoothstep(0.0, 0.5, m)) * shade;
            light += transmittance * alpha * tint;
            transmittance *= 1.0 - alpha;
        }
    }
    float opacity = 1.0 - transmittance;
    if (opacity < 0.002) discard;
    gl_FragColor = vec4(light / opacity, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

function luminance(color) {
    return color ? 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b : 1;
}

function darknessScale() {
    const night = luminance(canvas.colors?.ambientDarkness) / Math.max(luminance(canvas.colors?.ambientDaylight), 1e-3);
    return THREE.MathUtils.lerp(1, Math.min(night, 1), canvas.environment?.darknessLevel ?? 0);
}

const MIST_TINT = { unexplored: 0x3a4250, explored: 0x5a6472 };

function setSceneColor(target, value, fallback, scale) {
    const hex = value === null || value === undefined ? fallback : Number(foundry.utils.Color.from(value));
    return target.setHex(hex).multiplyScalar(scale);
}

function indoorMist() {
    const setting = canvas.scene.getFlag(MODULE_ID, "dynamicSky")?.setting;
    return (!!setting && setting !== "outdoor") || (canvas.level?.elevation?.bottom ?? 0) < 0;
}

function levelFloor() {
    const bottom = canvas.level?.elevation?.bottom;
    const elevation = Number.isFinite(bottom) ? bottom : 0;
    return (elevation * canvas.dimensions.size) / canvas.dimensions.distance / factor;
}

const SHELTER_HOOKS = ["createTile", "updateTile", "deleteTile", "createRegion", "updateRegion", "deleteRegion"];
const FLOOR_RADIUS = 0.5;

const floorVertex = "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }";

const erodeFragment = /* glsl */ `
uniform sampler2D uShelter;
uniform vec2 uShelterY;
uniform float uFloor;
uniform float uRadius;
float floorAt(ivec2 pixel, ivec2 size) {
    vec4 texel = texelFetch(uShelter, clamp(pixel, ivec2(0), size - 1), 0);
    float height = uShelterY.x + (texel.r * 65280.0 + texel.g * 255.0) / 65535.0 * uShelterY.y;
    return texel.a > 0.0 ? max(height, uFloor) : uFloor;
}
void main() {
    ivec2 size = textureSize(uShelter, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    int radius = int(ceil(uRadius));
    float value = 1e6;
    for (int y = -radius; y <= radius; y++) {
        for (int x = -radius; x <= radius; x++) {
            if (float(x * x + y * y) > uRadius * uRadius) continue;
            value = min(value, floorAt(pixel + ivec2(x, y), size));
        }
    }
    gl_FragColor = vec4(value, 0.0, 0.0, 1.0);
}
`;

const blurFragment = /* glsl */ `
uniform sampler2D uSource;
uniform float uRadius;
void main() {
    ivec2 size = textureSize(uSource, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    int radius = int(ceil(uRadius));
    float sigma = max(uRadius * 0.5, 0.5);
    float total = 0.0;
    float weight = 0.0;
    for (int y = -radius; y <= radius; y++) {
        for (int x = -radius; x <= radius; x++) {
            float d = float(x * x + y * y);
            if (d > uRadius * uRadius) continue;
            float w = exp(-0.5 * d / (sigma * sigma));
            total += texelFetch(uSource, clamp(pixel + ivec2(x, y), ivec2(0), size - 1), 0).r * w;
            weight += w;
        }
    }
    gl_FragColor = vec4(total / weight, 0.0, 0.0, 1.0);
}
`;

function floorTarget(width, height, filter) {
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, format: THREE.RedFormat, minFilter: filter, magFilter: filter, depthBuffer: false, generateMipmaps: false });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
}

class MistFloor {
    constructor(renderer) {
        this.renderer = renderer;
        this.erode = new THREE.ShaderMaterial({ uniforms: { uShelter: { value: null }, uShelterY: { value: new THREE.Vector2() }, uFloor: { value: 0 }, uRadius: { value: 1 } }, vertexShader: floorVertex, fragmentShader: erodeFragment, depthTest: false, depthWrite: false });
        this.blur = new THREE.ShaderMaterial({ uniforms: { uSource: { value: null }, uRadius: { value: 1 } }, vertexShader: floorVertex, fragmentShader: blurFragment, depthTest: false, depthWrite: false });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.erode);
        this.quad.frustumCulled = false;
        this.scene = new THREE.Scene();
        this.scene.add(this.quad);
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.key = null;
        this.eroded = null;
        this.smoothed = null;
    }

    get texture() {
        return this.smoothed?.texture ?? null;
    }

    refresh(map, uniforms, levelY, grid) {
        if (!map?.ready || !map.target) return false;
        const key = `${map.version}|${levelY}|${map.width}x${map.height}`;
        if (key === this.key) return true;
        if (this.smoothed?.width !== map.width || this.smoothed?.height !== map.height) {
            this.disposeTargets();
            this.eroded = floorTarget(map.width, map.height, THREE.NearestFilter);
            this.smoothed = floorTarget(map.width, map.height, THREE.LinearFilter);
        }
        const radius = Math.max(1, (FLOOR_RADIUS * grid * map.width) / map.rect.z);
        this.erode.uniforms.uShelter.value = map.target.texture;
        this.erode.uniforms.uShelterY.value.copy(uniforms.uShelterY.value);
        this.erode.uniforms.uFloor.value = levelY;
        this.erode.uniforms.uRadius.value = radius;
        this.blur.uniforms.uSource.value = this.eroded.texture;
        this.blur.uniforms.uRadius.value = radius;
        const renderer = this.renderer;
        const state = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, shadows: renderer.shadowMap.autoUpdate };
        renderer.autoClear = false;
        renderer.shadowMap.autoUpdate = false;
        try {
            this.draw(this.erode, this.eroded);
            this.draw(this.blur, this.smoothed);
        } finally {
            renderer.setRenderTarget(state.target);
            renderer.autoClear = state.autoClear;
            renderer.shadowMap.autoUpdate = state.shadows;
            this.erode.uniforms.uShelter.value = null;
        }
        this.key = key;
        return true;
    }

    draw(material, target) {
        this.quad.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
    }

    disposeTargets() {
        this.eroded?.dispose();
        this.smoothed?.dispose();
        this.eroded = this.smoothed = null;
        this.key = null;
    }

    dispose() {
        this.disposeTargets();
        this.erode.dispose();
        this.blur.dispose();
        this.quad.geometry.dispose();
    }
}

class MistShelterMap extends ShelterMap {
    get roots() {
        const roots = super.roots;
        for (const mesh of terrainWaterMeshes) roots.add(mesh);
        return roots;
    }
}

export class FogMist {
    constructor(scene, maskUniform) {
        this.uniforms = {
            ...sceneUniforms,
            uMask: maskUniform,
            uMaskSize: { value: new THREE.Vector2(1, 1) },
            uMistRect: { value: new THREE.Vector4() },
            uMist: { value: new THREE.Vector4(0, 0.15, 0.1, MIST_DENSITY) },
            uUnexplored: { value: new THREE.Color(0, 0, 0) },
            uExplored: { value: new THREE.Color(0, 0, 0) },
            uDepthClip: { value: 0 },
            uFloorMap: { value: null },
            uShelterRect: { value: new THREE.Vector4(0, 0, 1, 1) },
            uHasShelter: { value: 0 },
            uMotion: { value: new THREE.Vector4() },
            uBand: { value: MIST_HEIGHT },
            uExploredDensity: { value: MIST_EXPLORED_DENSITY },
        };
        this.shelterUniforms = { uShelterMap: { value: null }, uShelterRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uShelterY: { value: new THREE.Vector2(-1, 0) }, uTexel: { value: 0.01 } };
        this.ownShelter = null;
        this.hooks = [];
        this.floor = new MistFloor(game.Levels3DPreview.renderer);
        this.drift = new THREE.Vector2();
        this.direction = new THREE.Vector2();
        this.time = 0;
        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: mistVertex,
            fragmentShader: mistFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide,
        });
        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.material);
        this.mesh.layers.set(VFX_LAYER);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = MIST_RENDER_ORDER;
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.mesh.raycast = () => {};
        this.mesh.userData.noShaders = true;
        this.mesh.userData.ignoreHover = true;
        scene.add(this.mesh);
        warm(this.material);
        this.readyHook = Hooks.on("3DCanvasSceneReady", () => {
            if (this.ownShelter) this.ownShelter.dirty = true;
        });
        this.update(0, false);
    }

    resolveShelter(render) {
        if (!this.ownShelter) {
            this.ownShelter = new MistShelterMap(game.Levels3DPreview, this.shelterUniforms);
            this.hooks = SHELTER_HOOKS.map((hook) => [hook, Hooks.on(hook, (document) => (document.parent?.parent ?? document.parent) === canvas.scene && this.ownShelter?.invalidate())]);
        }
        if (render) this.ownShelter.update();
        return { map: this.ownShelter, uniforms: this.shelterUniforms };
    }

    disposeShelter() {
        for (const [hook, id] of this.hooks) Hooks.off(hook, id);
        this.hooks = [];
        this.ownShelter?.dispose();
        this.ownShelter = null;
    }

    updateMotion(delta) {
        const step = Math.min(Math.max(delta, 0), 0.1);
        const grid = this.uniforms.uMist.value.z;
        const strength = wind.strength ?? 0;
        const radians = THREE.MathUtils.degToRad(wind.direction ?? 0);
        if (strength > 0.001) this.direction.set(Math.sin(radians), -Math.cos(radians));
        else this.direction.copy(CALM_DRIFT);
        this.drift.addScaledVector(this.direction, step * grid * (DRIFT_SPEED + strength * WIND_DRIFT));
        this.time += step;
        this.uniforms.uMotion.value.set(this.drift.x, this.drift.y, this.time, 0);
    }

    update(delta = 0, render = true) {
        const d = canvas.dimensions;
        const grid = d.size / factor;
        const floor = levelFloor();
        const { map, uniforms } = this.resolveShelter(render);
        const ready = render ? this.floor.refresh(map, uniforms, floor, grid) : !!this.floor.texture;
        const surfaceTop = ready ? uniforms.uShelterY.value.x + uniforms.uShelterY.value.y : floor;
        const height = MIST_HEIGHT, density = MIST_DENSITY, explored = MIST_EXPLORED_DENSITY;
        const top = Math.max(floor, surfaceTop) + grid * height;
        this.uniforms.uBand.value = height;
        this.uniforms.uExploredDensity.value = explored;
        this.uniforms.uFloorMap.value = this.floor.texture;
        this.uniforms.uShelterRect.value.copy(uniforms.uShelterRect.value);
        this.uniforms.uHasShelter.value = ready ? 1 : 0;
        const x0 = d.sceneX / factor, z0 = d.sceneY / factor;
        const x1 = (d.sceneX + d.sceneWidth) / factor, z1 = (d.sceneY + d.sceneHeight) / factor;
        this.uniforms.uMaskSize.value.set(d.width / factor, d.height / factor);
        this.uniforms.uMistRect.value.set(x0, z0, x1, z1);
        this.uniforms.uMist.value.set(floor, top, grid, density);
        this.mesh.position.set((x0 + x1) / 2, (floor + top) / 2, (z0 + z1) / 2);
        this.mesh.scale.set(x1 - x0, top - floor, z1 - z0);
        if (indoorMist()) {
            this.uniforms.uUnexplored.value.setRGB(0, 0, 0);
            this.uniforms.uExplored.value.setRGB(0, 0, 0);
        } else {
            const colors = canvas.scene.fog?.colors ?? {};
            const scale = darknessScale();
            gradeMistColor(setSceneColor(this.uniforms.uUnexplored.value, colors.unexplored, MIST_TINT.unexplored, scale));
            gradeMistColor(setSceneColor(this.uniforms.uExplored.value, colors.explored, MIST_TINT.explored, scale));
        }
        this.uniforms.uDepthClip.value = capabilities.active ? 1 : 0;
        this.material.depthTest = !capabilities.active;
        this.updateMotion(delta);
    }

    dispose() {
        Hooks.off("3DCanvasSceneReady", this.readyHook);
        this.disposeShelter();
        this.floor.dispose();
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
