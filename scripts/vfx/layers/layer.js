import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { ParticleSystem, LegacyNoise, toValue, toCurve } from "../base/quarks.js";

const MODES = {
    billboard: QUARKS.RenderMode.BillBoard,
    stretched: QUARKS.RenderMode.StretchedBillBoard,
    trail: QUARKS.RenderMode.Trail,
    horizontal: QUARKS.RenderMode.HorizontalBillBoard,
    vertical: QUARKS.RenderMode.VerticalBillBoard,
};

const SHAPES = {
    point: QUARKS.PointEmitter,
    sphere: QUARKS.SphereEmitter,
    hemisphere: QUARKS.HemisphereEmitter,
    cone: QUARKS.ConeEmitter,
    circle: QUARKS.CircleEmitter,
    donut: QUARKS.DonutEmitter,
};

const SOFT_MODES = ["billboard", "stretched", "vertical"];
const AIM = { up: -Math.PI / 2, down: Math.PI / 2 };
const FORWARD = new THREE.Vector3(0, 0, 1);

export const ORDER = { ground: 1, smoke: 2, body: 4, glow: 6, sparks: 8 };

function toVector(spec) {
    if (spec?.isVector3) return spec;
    if (Array.isArray(spec)) return new THREE.Vector3(...spec);
    return new THREE.Vector3(spec, spec, spec);
}

function toShape(spec = "point") {
    if (typeof spec === "string") return new SHAPES[spec]();
    if (typeof spec.initialize === "function") return spec;
    const { type, ...options } = spec;
    return new SHAPES[type](options);
}

function toBursts(spec) {
    if (spec === undefined) return [];
    return [spec].flat().map((burst) => ({ time: 0, cycle: 1, interval: 0.01, probability: 1, ...(typeof burst === "number" ? { count: burst } : burst) }));
}

function rendererSettings(mode, spec) {
    if (mode === "trail") return { startLength: toValue(spec.length ?? 30), followLocalOrigin: spec.follow ?? true };
    if (mode === "stretched") return { speedFactor: spec.stretch ?? 1, lengthFactor: spec.lengthFactor ?? 0 };
    return {};
}

function frameBehavior(first, count) {
    const last = first + count - 1;
    return new QUARKS.FrameOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(first, first + (last - first) / 3, first + ((last - first) * 2) / 3, last), 0]]));
}

export class GroundBounce {
    constructor(floor, bounce, friction = 0.7) {
        this.type = "GroundBounce";
        this.floor = floor;
        this.bounce = bounce;
        this.friction = friction;
    }

    initialize() {}

    update(particle) {
        if (particle.position.y > this.floor) return;
        particle.position.y = this.floor;
        if (particle.velocity.y >= 0) return;
        particle.velocity.y *= -this.bounce;
        particle.velocity.x *= this.friction;
        particle.velocity.z *= this.friction;
    }

    frameUpdate() {}

    reset() {}

    clone() {
        return new GroundBounce(this.floor, this.bounce, this.friction);
    }

    toJSON() {
        return { type: this.type, floor: this.floor, bounce: this.bounce, friction: this.friction };
    }
}

function groundCollision(collide, bounce) {
    if (typeof collide === "number") return new GroundBounce(collide, bounce);
    return new QUARKS.ApplyCollision(collide, bounce);
}

function behaviors(effect, spec, sprite, animate) {
    const list = [];
    if (spec.color) list.push(new QUARKS.ColorOverLife(effect.palette.colorOverLife(spec.color)));
    if (spec.sizeOverLife) list.push(new QUARKS.SizeOverLife(toCurve(spec.sizeOverLife)));
    if (spec.speedOverLife) list.push(new QUARKS.SpeedOverLife(toCurve(spec.speedOverLife)));
    if (spec.force) list.push(new QUARKS.ApplyForce(toVector(spec.force), new QUARKS.ConstantValue(1)));
    if (spec.gravity) list.push(new QUARKS.ApplyForce(new THREE.Vector3(0, -1, 0), new QUARKS.ConstantValue(spec.gravity)));
    if (spec.spin !== undefined) list.push(new QUARKS.RotationOverLife(toValue(spec.spin)));
    if (spec.turbulence) {
        const { scale = spec.turbulence, strength = spec.turbulence, speed = spec.turbulence } = typeof spec.turbulence === "object" ? spec.turbulence : {};
        list.push(new QUARKS.TurbulenceField(toVector(scale), 1, toVector(strength), toVector(speed)));
    }
    if (spec.noise) list.push(new LegacyNoise(toVector(spec.noise[0]), toVector(spec.noise[1])));
    if (animate) list.push(frameBehavior(sprite.index, sprite.frames));
    if (spec.collide !== undefined) list.push(groundCollision(spec.collide, spec.bounce ?? 0.5));
    return list.concat(spec.behaviors ?? []);
}

export async function createLayer(effect, spec) {
    const blend = spec.blend ?? "add";
    const mode = spec.mode ?? "billboard";
    const sprite = await effect.material(spec.sprite, blend);
    if (spec.tiles) Object.assign(sprite, { uTileCount: spec.tiles[0], vTileCount: spec.tiles[1], frames: spec.tiles[0] * spec.tiles[1] });
    const frames = spec.frames ?? (sprite.frames > 1 ? "random" : 0);
    const animate = frames === "animate" && sprite.frames > 1;
    const lit = spec.lit ?? blend === "normal";
    const litColor = lit ? new THREE.Vector4(effect.tint.r, effect.tint.g, effect.tint.b, 1) : null;

    const system = new ParticleSystem({
        duration: spec.duration ?? 1,
        looping: spec.loop ?? spec.burst === undefined,
        prewarm: spec.prewarm ?? false,
        worldSpace: spec.world ?? true,
        startLife: toValue(spec.life ?? 1),
        startSpeed: toValue(spec.speed ?? 0),
        startSize: toValue(spec.size ?? effect.params.scale.start),
        startRotation: toValue(spec.rotation === true ? [0, Math.PI * 2] : (spec.rotation ?? 0)),
        startColor: new QUARKS.ConstantColor(litColor ?? (blend === "add" ? effect.glowColor : null) ?? new THREE.Vector4(1, 1, 1, 1)),
        emissionOverTime: toValue(spec.rate ?? 0),
        emissionOverDistance: toValue(spec.perDistance ?? 0),
        emissionBursts: toBursts(spec.burst),
        shape: effect._meshSurface ?? toShape(spec.shape),
        material: sprite.material,
        uTileCount: sprite.uTileCount,
        vTileCount: sprite.vTileCount,
        startTileIndex: frames === "random" ? new QUARKS.IntervalValue(sprite.index, sprite.index + sprite.frames - 0.001) : new QUARKS.ConstantValue(sprite.index + (animate ? 0 : frames)),
        blendTiles: animate && spec.blendFrames !== false,
        renderMode: MODES[mode],
        renderOrder: spec.order ?? ORDER.body,
        rendererEmitterSettings: rendererSettings(mode, spec),
        softParticles: (spec.soft ?? SOFT_MODES.includes(mode)) && effect.softParticles,
        softNearFade: 0,
        softFarFade: effect.softFade,
        behaviors: behaviors(effect, spec, sprite, animate),
    });

    if (spec.position) system.emitter.position.copy(toVector(spec.position));
    if (spec.aim) system.emitter.rotation.x = AIM[spec.aim] ?? spec.aim;
    if (spec.direction) system.emitter.quaternion.setFromUnitVectors(FORWARD, spec.direction.clone().normalize());
    system.litColor = litColor;
    system.startDelay = spec.delay ?? 0;
    return system;
}
