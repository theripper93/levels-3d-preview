import { getQuality } from "../quality.js";
import { createLayer, ORDER } from "./layer.js";

export { createLayer, ORDER };

const PARTICLES = "modules/levels-3d-preview/assets/particles";

export function glow(effect, spec = {}) {
    const s = effect.params.scale.start;
    return createLayer(effect, {
        sprite: "emberssmall",
        world: false,
        life: 0.25,
        size: s,
        rate: 24,
        color: ["glow", "glow", 0.55, 0],
        sizeOverLife: "swell",
        order: ORDER.glow,
        ...spec,
    });
}

export function flame(effect, { size = effect.params.scale.start, lift = size * 0.6, rate = 1, life = 1, shell = 1, core = 1, make = createLayer, ...spec } = {}) {
    const s = size;
    const deep = effect.palette.start.clone().multiplyScalar(0.55);
    const tongue = { sprite: "fire", mode: "stretched", stretch: 0.4 / Math.max(lift, 0.001), lengthFactor: 1.2, speed: lift * 0.5, force: [0, lift * 1.4, 0], position: [0, s * 0.55, 0], soft: true, ...spec };
    const layers = [
        make(effect, {
            ...tongue,
            sprite: "emberssmall",
            frames: 0,
            life: [0.45 * life, 0.75 * life],
            size: [s * 0.6, s * 0.9],
            rate: 16 * rate,
            color: [
                [0, "end", 0],
                [0.1, "end", 0.9],
                [0.4, "start", 0.75],
                [0.8, deep, 0.3],
                [1, deep, 0],
            ],
            sizeOverLife: [0.5, 1, 0.6, 0.15],
            order: ORDER.body,
        }),
        make(effect, {
            ...tongue,
            life: [0.35 * life, 0.6 * life],
            size: [s * 0.5, s * 0.75],
            rate: 12 * rate,
            color: [
                [0, "end", 0],
                [0.15, "end", 0.7],
                [0.5, "start", 0.5],
                [1, deep, 0],
            ],
            sizeOverLife: [0.6, 1, 0.7, 0.2],
            order: ORDER.body,
        }),
    ];
    if (shell)
        layers.push(
            make(effect, {
                ...tongue,
                blend: "normal",
                lit: false,
                life: [0.5 * life, 0.8 * life],
                size: [s * 0.5 * shell, s * 0.75 * shell],
                rate: 9 * rate,
                color: [
                    [0, "start", 0],
                    [0.2, "start", 0.4],
                    [0.6, deep, 0.25],
                    [1, deep, 0],
                ],
                sizeOverLife: [0.7, 1, 0.7, 0.2],
                order: ORDER.smoke + 1,
            }),
        );
    if (core)
        layers.push(
            make(effect, {
                ...spec,
                sprite: "emberssmall",
                life: [0.25 * life, 0.4 * life],
                size: [s * 0.3 * core, s * 0.45 * core],
                speed: lift * 0.3,
                rate: 10 * rate,
                position: [0, s * 0.1, 0],
                color: [
                    [0, "white", 0],
                    [0.2, "end", 0.7],
                    [1, "start", 0],
                ],
                sizeOverLife: [0.8, 1, 0.8, 0.4],
                order: ORDER.glow,
            }),
        );
    return layers;
}

export function smokePuff(effect, spec = {}) {
    const s = effect.params.scale.start;
    return createLayer(effect, {
        sprite: "smoke",
        blend: "normal",
        life: [1.4, 2.2],
        size: [s * 0.8, s * 1.3],
        speed: s * 0.25,
        rotation: true,
        spin: [-0.3, 0.3],
        rate: 6,
        shape: { type: "sphere", radius: s * 0.2 },
        force: [0, s * 0.35, 0],
        color: [
            [0, "smoke", 0],
            [0.2, "smoke", 0.45],
            [0.6, "ash", 0.25],
            [1, "ash", 0],
        ],
        sizeOverLife: [0.5, 0.9, 1.2, 1.5],
        order: ORDER.smoke,
        ...spec,
    });
}

export function sparks(effect, spec = {}) {
    const s = effect.params.scale.start;
    return createLayer(effect, {
        sprite: "emberssmall",
        mode: "stretched",
        stretch: 0.06,
        life: [0.25, 0.7],
        size: [s * 0.06, s * 0.12],
        speed: [s * 3, s * 8],
        burst: 14,
        shape: { type: "cone", radius: s * 0.05, angle: Math.PI / 3 },
        gravity: s * 9,
        speedOverLife: [1, 0.7, 0.45, 0.3],
        color: [
            [0, "white", 1],
            [0.2, "spark", 1],
            [0.7, "end", 0.8],
            [1, "edge", 0],
        ],
        sizeOverLife: "shrink",
        order: ORDER.sparks,
        ...spec,
    });
}

export function embers(effect, spec = {}) {
    const s = effect.params.scale.start;
    return createLayer(effect, {
        sprite: "circle_05",
        life: [1, 2],
        size: [s * 0.04, s * 0.08],
        speed: [s * 0.3, s * 0.8],
        rate: 6,
        shape: { type: "cone", radius: s * 0.3, angle: Math.PI / 8 },
        aim: "up",
        force: [0, s * 0.5, 0],
        turbulence: { scale: s * 2, strength: s * 2, speed: 1 },
        color: [
            [0, "spark", 0],
            [0.15, "spark", 1],
            [0.7, "end", 0.8],
            [1, "edge", 0],
        ],
        sizeOverLife: "shrink",
        order: ORDER.sparks,
        ...spec,
    });
}

export function ribbon(effect, spec = {}) {
    const s = effect.params.scale.start;
    return createLayer(effect, {
        sprite: `${PARTICLES}/emberssmall.png`,
        mode: "trail",
        life: [0.2, 0.45],
        size: s * 0.25,
        length: 30,
        perDistance: 60,
        color: ["start", "end", 1, 0],
        sizeOverLife: "shrink",
        order: ORDER.body,
        ...spec,
    });
}

export function flash(effect, spec = {}) {
    const s = effect.params.scale.start;
    const reduced = getQuality().reduceMotion;
    return createLayer(effect, {
        sprite: "star_09",
        world: false,
        life: reduced ? 0.3 : 0.14,
        size: s * (reduced ? 1.6 : 3),
        rotation: true,
        burst: 1,
        color: ["white", "core", reduced ? 0.3 : 0.9, 0],
        sizeOverLife: "pop",
        order: ORDER.glow,
        ...spec,
    });
}

export function debris(effect, spec = {}) {
    const s = effect.params.scale.start;
    return createLayer(effect, {
        sprite: "debris_2x2",
        blend: "normal",
        life: [0.8, 1.4],
        size: [s * 0.06, s * 0.14],
        speed: [s * 2, s * 5],
        rotation: true,
        spin: [-6, 6],
        burst: 12,
        shape: { type: "cone", radius: s * 0.15, angle: Math.PI / 3 },
        aim: "up",
        gravity: s * 9,
        color: [
            [0, "white", 1],
            [0.8, "white", 1],
            [1, "white", 0],
        ],
        soft: false,
        order: ORDER.body,
        ...spec,
    });
}

export function groundRing(effect, spec = {}) {
    const s = effect.params.scale.start;
    return createLayer(effect, {
        sprite: "circle_02",
        mode: "horizontal",
        world: false,
        life: 0.5,
        size: s * 3,
        burst: 1,
        position: [0, s * 0.02, 0],
        color: ["core", "end", 0.8, 0],
        sizeOverLife: [0.1, 0.8, 1, 1.05],
        soft: false,
        order: ORDER.ground,
        ...spec,
    });
}
