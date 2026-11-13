import { AdditiveBlending, Mesh, PlaneGeometry } from "three";
import { VFX_LAYER } from "../constants.js";
import { getTextureMaterial } from "../materials.js";
import { capabilities } from "../render/effectsPass.js";
import { ProjectedDecal } from "../render/decal.js";
import { Distortion } from "../render/distortion.js";
import { getQuality } from "../quality.js";

export { Strip, Beam, Bolt, ShockRing } from "./strip.js";

export function addPrimitive(effect, primitive, parent = effect.emitter) {
    effect.addMesh(primitive, parent);
    (effect._primitives ??= []).push(primitive);
    return primitive;
}

export function updatePrimitives(effect, delta) {
    if (effect._primitives) for (const primitive of effect._primitives) primitive.update(delta);
}

const quadGeometry = new PlaneGeometry(1, 1);

export async function spriteQuad(effect, path, { color = effect.palette.glow, blending = AdditiveBlending, parent = effect.emitter, horizontal = false } = {}) {
    const material = (await getTextureMaterial(path, blending, effect)).clone();
    material.color.copy(color);
    material.depthWrite = false;
    const quad = new Mesh(quadGeometry, material);
    quad.layers.set(VFX_LAYER);
    quad.renderOrder = 5;
    if (horizontal) quad.rotation.x = -Math.PI / 2;
    effect.addMesh(quad, parent);
    return quad;
}

export function groundGlow(effect, { parent = effect.emitter, position, size = effect.params.scale.start * 3, depth = size * 0.6, color = effect.palette.glow, opacity = 1, blending = "additive", ...options } = {}) {
    if (!capabilities.decals) return null;
    const reduced = getQuality().reduceMotion && blending === "additive";
    const decal = new ProjectedDecal({ position, size, depth, color, opacity: opacity * (reduced ? 0.5 : 1), blending, ...options });
    parent.add(decal);
    return decal;
}

export function scorch(effect, { size = effect.params.scale.start * 2.5, opacity = 0.75, life = 6, fadeOut = 2.5, ...options } = {}) {
    return groundGlow(effect, { size, color: "#1a1410", blending: "multiply", opacity, falloff: 1.2, life, fadeIn: 0.05, fadeOut, ...options });
}

export function shockwave(effect, { parent = effect.emitter, position, size = effect.params.scale.start * 4, strength = 0.06, life = 0.6, ...options } = {}) {
    if (!capabilities.distortion || getQuality().reduceMotion) return null;
    const wave = Distortion.shockwave({ position, size, strength, life, ...options });
    parent.add(wave);
    return wave;
}
