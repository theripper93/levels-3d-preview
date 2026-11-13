import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { ORDER, flame } from "../layers/index.js";
import { sustained, groundBelow } from "./sustain.js";
import { flameNoise, flameSeed, flameTime, lightFlicker } from "../light/noise.js";

const worldPosition = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function orbit(speed, axis = UP) {
    return new QUARKS.OrbitOverLife(typeof speed === "number" ? new QUARKS.ConstantValue(speed) : new QUARKS.IntervalValue(speed[0], speed[1]), axis);
}

export function ringGlow(effect, radius, spec = {}) {
    return sustained(effect, {
        sprite: "circle_02",
        mode: "horizontal",
        world: false,
        duration: 2,
        prewarm: true,
        life: 2,
        rate: 1,
        size: radius * 2.2,
        position: [0, 0.004, 0],
        color: [
            [0, "glow", 0],
            [0.5, "glow", 0.45],
            [1, "glow", 0],
        ],
        sizeOverLife: [0.95, 1, 1, 1.05],
        soft: false,
        order: ORDER.ground,
        ...spec,
    });
}

export function groundGlow(effect, { size, color = effect.palette.light, opacity = 0.7, maxDrop = size, ...options }) {
    if (effect.onSurface && !options.force) return null;
    const base = effect.emitter.getWorldPosition(worldPosition).clone();
    const lift = Math.max(size * 0.1, 0.01);
    const ground = groundBelow(base.clone().add(new THREE.Vector3(0, lift, 0)), base.y);
    const drop = base.y - ground;
    if (drop > maxDrop) return null;
    return effect.addDecal({ position: new THREE.Vector3(0, -drop, 0), size, depth: Math.max(size * 0.3, drop * 2 + size * 0.15), color, opacity, falloff: 1.6, life: Infinity, fadeIn: 0.4, ...options });
}

function cone(effect, radius, angle) {
    return effect.onSurface ? undefined : { type: "cone", radius: Math.max(radius, 0.0005), angle };
}

export async function flameRig(effect, { size, radius = size * 0.1, rate = 1, height = 1, smoke = 1, embers = 1, glow = 1, haze = 1, decal = 1, tongues = 1 }) {
    const s = size;
    const lift = s * 0.6 * height;
    rate *= effect.onSurface ? 2.5 : Math.clamp(radius / (s * 0.3), 1, 4);
    const flames = flame(effect, { size: Math.max(s, Math.min(radius * 2.4, s * 1.6)), lift, rate, shell: tongues, make: sustained, shape: cone(effect, radius, Math.PI / 24), aim: "up", wind: 0.15 });
    const layers = [...flames];
    if (glow)
        layers.push(
            sustained(effect, {
                sprite: "emberssmall",
                world: false,
                life: 0.4,
                size: [s * 1.1 * glow, s * 1.3 * glow],
                rate: 10,
                position: [0, s * 0.25, 0],
                color: [
                    [0, "glow", 0],
                    [0.5, "glow", 0.16],
                    [1, "glow", 0],
                ],
                soft: false,
                order: ORDER.smoke,
            }),
        );
    if (embers)
        layers.push(
            sustained(effect, {
                sprite: "emberssmall",
                life: [1, 1.8],
                size: [s * 0.04, s * 0.08],
                speed: [lift * 0.8, lift * 1.6],
                rate: 5 * embers * rate,
                shape: cone(effect, radius, Math.PI / 8),
                aim: "up",
                force: [0, lift * 0.4, 0],
                turbulence: { scale: s * 2, strength: s * 3, speed: 1 },
                color: [
                    [0, "spark", 0],
                    [0.1, "spark", 1],
                    [0.7, "end", 0.8],
                    [1, "edge", 0],
                ],
                sizeOverLife: "shrink",
                order: ORDER.sparks,
                wind: 0.6,
            }),
        );
    if (smoke)
        layers.push(
            sustained(effect, {
                sprite: "smoke9x9",
                frames: "random",
                blend: "normal",
                life: [1.4, 2.2],
                size: [s * 0.45 * smoke, s * 0.7 * smoke],
                speed: lift * 0.5,
                rotation: true,
                spin: [-0.4, 0.4],
                rate: 4 * rate,
                position: [0, lift * 0.9, 0],
                shape: effect.onSurface ? undefined : { type: "sphere", radius: Math.max(radius, s * 0.1) },
                force: [0, lift * 0.35, 0],
                color: [
                    [0, "smoke", 0],
                    [0.25, "smoke", 0.32],
                    [1, "ash", 0],
                ],
                sizeOverLife: [0.5, 0.9, 1.3, 1.7],
                order: ORDER.smoke,
                wind: 0.6,
                fade: 1,
            }),
        );
    const systems = await effect.add(layers);
    effect._flames = systems.slice(0, flames.length).map((system) => system.emitter);
    if (haze) effect.addHaze({ position: new THREE.Vector3(0, lift * 1.4, 0), size: s * 1.4 * haze, life: Infinity, fadeIn: 0.5 });
    if (decal) effect._fireDecal = groundGlow(effect, { size: Math.max(s * 4 * decal, radius * 3), maxDrop: s * 3 });
}

export function flameFlicker(effect) {
    const key = effect.params.name ?? effect.params.id;
    return lightFlicker(key, null) ?? 0.55 + 0.45 * flameNoise(flameSeed(key), flameTime() || effect._age);
}

export function animateFlame(effect) {
    const value = flameFlicker(effect);
    const scale = 0.8 + 0.25 * value;
    if (effect._flames) for (const emitter of effect._flames) emitter.scale.setScalar(scale);
    if (effect._fireDecal) effect._fireDecal.opacity = 0.8 * value;
}

