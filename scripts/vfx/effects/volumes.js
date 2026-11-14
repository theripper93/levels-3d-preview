import * as THREE from "three";
import { registerEffects } from "../registry.js";
import { VFX_LAYER } from "../constants.js";
import { getQuality } from "../quality.js";
import { ParticleEngine } from "../engine.js";
import { BasePresetEffect } from "../base/BasePresetEffect.js";
import { capabilities, sceneUniforms, warm } from "../render/index.js";
import { THEMES } from "../region/themes.js";
import { noisePars } from "../region/shaders.js";

const STEPS = { low: 6, medium: 8, high: 8, ultra: 12 };
const NOISE_FREQUENCY = 9;
const HULL_SCALE = 1.1;
const white = new THREE.Color(1, 1, 1);
const center = new THREE.Vector3();

const volumeVertex = `
varying vec3 vVolumeWorld;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vVolumeWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const volumeFragment = `
#include <common>
#include <vfx_scene_pars_fragment>
#include <vfx_fog_of_war_pars_fragment>
${noisePars}
uniform vec4 uSphere;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec4 uFog;
varying vec3 vVolumeWorld;
void main() {
    vec3 origin = cameraPosition;
    vec3 direction = normalize(vVolumeWorld - origin);
    vec3 offset = origin - uSphere.xyz;
    float b = dot(offset, direction);
    float h = b * b - dot(offset, offset) + uSphere.w * uSphere.w;
    if (h <= 0.0) discard;
    h = sqrt(h);
    float near = max(-b - h, 0.0);
    float far = -b + h;
    if (uFog.w > 0.5) {
        vec2 uv = vfxScreenUv();
        far = min(far, dot(vfxWorldPosition(uv, vfxSceneDepth(uv)) - origin, direction));
    }
    if (far <= near) discard;
    float stepLength = (far - near) / float(VOLUME_STEPS);
    float t = uSceneTime;
    float jitter = rfHash(gl_FragCoord.xy + fract(t));
    float density = 0.0;
    float lightness = 0.0;
    for (int i = 0; i < VOLUME_STEPS; i++) {
        vec3 p = origin + direction * (near + stepLength * (float(i) + jitter));
        vec3 q = p * uFog.y;
        float n = rfFbm(q.xz + vec2(q.y * 0.66 + t * 0.08, -t * 0.05));
        float radial = length(p - uSphere.xyz) / uSphere.w;
        float shape = (1.0 - smoothstep(0.15, 1.0, radial + (0.5 - n) * 0.3)) * (1.0 - smoothstep(0.8, 1.0, radial));
        float amount = shape * smoothstep(0.15, 0.75, n * 0.8 + shape * 0.35);
        density += amount;
        lightness += amount * n;
    }
    float alpha = (1.0 - exp(-density * stepLength * uFog.x * uFog.z)) * vfxFogOfWar(origin + direction * (near + far) * 0.5);
    vec3 color = mix(uColorB, uColorA, clamp(lightness / max(density, 0.0001), 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

function createVolumeMaterial(uniforms = {}, side = THREE.BackSide) {
    return new THREE.ShaderMaterial({
        uniforms: { ...sceneUniforms, ...uniforms },
        defines: { VOLUME_STEPS: STEPS[getQuality().tier] ?? 8 },
        vertexShader: volumeVertex,
        fragmentShader: volumeFragment,
        transparent: true,
        depthWrite: false,
        side,
    });
}

class VolumeEffect extends BasePresetEffect {
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    static get THEME() {
        return "fog";
    }

    get light3d() {
        return game.Levels3DPreview.lights?.sceneLights?.[this.to?.id];
    }

    get darkness() {
        return this.constructor.THEME === "darkness" || !!(this.to?.document?.config ?? this.to?.document?.light)?.negative;
    }

    async build() {
        const light3d = this.light3d;
        if (light3d && !light3d.isToken) this.emitter.position.copy(light3d.mesh.position);
        const radius = Math.max(this.params.emitterSize, 0.01);
        const unit = Math.sqrt(ParticleEngine.getScale()) / 5;
        this.uniforms = {
            uSphere: { value: new THREE.Vector4(0, 0, 0, radius) },
            uColorA: { value: new THREE.Color() },
            uColorB: { value: new THREE.Color() },
            uFog: { value: new THREE.Vector4(0, NOISE_FREQUENCY / Math.max(this.params.scale.start / unit, 0.05), this.intensity, 0) },
        };
        this.materials = [createVolumeMaterial(this.uniforms), createVolumeMaterial(this.uniforms, THREE.FrontSide)];
        const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * HULL_SCALE, 1), this.materials[0]);
        mesh.layers.set(VFX_LAYER);
        this.volume = this.addMesh(mesh);
        this.refreshVolume();
    }

    refreshVolume() {
        const theme = THEMES[this.darkness ? "darkness" : this.constructor.THEME];
        const tint = this.params.color.start[0];
        const lightColor = this.light3d?.light3d.color ?? white;
        const { uSphere, uColorA, uColorB, uFog } = this.uniforms;
        this.emitter.getWorldPosition(center);
        uSphere.value.set(center.x, center.y, center.z, uSphere.value.w);
        uColorA.value.set(theme.colors[0]).multiply(tint).multiply(lightColor);
        uColorB.value.set(theme.colors[1]).multiply(tint).multiply(lightColor);
        uFog.value.x = theme.fog.density;
        uFog.value.w = capabilities.active ? 1 : 0;
        const outside = game.Levels3DPreview.camera.position.distanceTo(center) > uSphere.value.w * HULL_SCALE * 1.1;
        const front = !capabilities.active && outside;
        this.volume.material = this.materials[front ? 1 : 0];
        this.volume.material.depthTest = front;
    }

    animate(delta) {
        if (this.volume) this.refreshVolume();
        super.animate(delta);
    }

    dispose() {
        this.materials?.forEach((material) => material !== this.volume.material && material.dispose());
        super.dispose();
    }
}

export class FogVolumeParticle extends VolumeEffect {}

export class DarknessVolumeParticle extends VolumeEffect {
    static get THEME() {
        return "darkness";
    }
}

export class SmokeVolumeParticle extends VolumeEffect {
    static get THEME() {
        return "smoke";
    }
}

registerEffects("presets", {
    fogvolume: FogVolumeParticle,
    darknessvolume: DarknessVolumeParticle,
    smokevolume: SmokeVolumeParticle,
});

Hooks.on("3DCanvasSceneReady", () => warm(createVolumeMaterial(), createVolumeMaterial({}, THREE.FrontSide)));
