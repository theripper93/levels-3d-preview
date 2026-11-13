import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { createLayer } from "../layers/index.js";
import { ProjectedDecal, capabilities } from "../render/index.js";

const DEFAULT_COLORS = ["ff4d00", "ffff00"];

export const SOOT = [
    [0, "#3b302a", 0],
    [0.2, "#3b302a", 0.5],
    [0.6, "#2a2522", 0.3],
    [1, "#1c1a19", 0],
];

export function effectLightIntensity(strength = 1) {
    return strength * 6;
}

export function groundMark(effect, { position, size, color = "#000000", opacity = 0.75, life = 6, blending = "multiply", pattern = "glow" }) {
    if (!capabilities.decals) return null;
    const decal = new ProjectedDecal({ position, size, depth: size, color, opacity, blending, pattern, falloff: 1.5, life, fadeIn: 0.05, fadeOut: life * 0.6 });
    effect.addMesh(decal, game.Levels3DPreview.scene);
    if (effect.isExplosion) effect._duration = Math.max(effect._duration, life);
    return decal;
}

export function usesDefaultColors(effect) {
    return effect.params.color.start[0].getHexString() === DEFAULT_COLORS[0] && effect.params.color.end[0].getHexString() === DEFAULT_COLORS[1];
}

export function useColorsIfDefault(effect, start, end) {
    if (!usesDefaultColors(effect)) return;
    effect.params.color = { start: [new THREE.Color(start)], end: [new THREE.Color(end)] };
}

export function launchGroup(effect, offset = 0) {
    const group = new THREE.Group();
    const direction = effect._target.clone().sub(effect._origin).normalize();
    group.position.copy(effect._origin).addScaledVector(direction, offset);
    group.lookAt(effect._target);
    return effect.addMesh(group, game.Levels3DPreview.scene);
}

export function ballisticPath(effect, loft) {
    if (effect.params.arc || !loft) return false;
    const origin = effect._origin;
    const target = effect._target;
    const middle = origin.clone().lerp(target, 0.5);
    middle.y += effect._dist * loft;
    effect.animationPath = new THREE.QuadraticBezierCurve3(origin, middle, target);
    return true;
}

export async function loadRock(effect, path) {
    const model = await game.Levels3DPreview.helpers.loadModel(path).catch(() => null);
    let rock = null;
    model?.scene.traverse((child) => {
        if (child.isMesh && !rock) rock = child;
    });
    if (!rock) return null;
    const material = new THREE.MeshBasicMaterial({ map: rock.material.map, fog: true });
    effect._rockMaterials = [...(effect._rockMaterials ?? []), material];
    return { geometry: rock.geometry, material };
}

export async function rockLayer(effect, rock, spec) {
    const system = await createLayer(effect, { sprite: "debris_2x2", blend: "normal", ...spec });
    if (!rock) return system;
    system.instancingGeometry = rock.geometry;
    system.material = rock.material;
    system.renderMode = QUARKS.RenderMode.Mesh;
    system.startRotation = new QUARKS.RandomQuatGenerator();
    return system;
}

export function stopEmitting(systems) {
    for (const system of systems) {
        system.emissionOverTime = new QUARKS.ConstantValue(0);
        system.emissionOverDistance = new QUARKS.ConstantValue(0);
    }
}
