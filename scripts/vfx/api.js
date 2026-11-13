import * as THREE from "three";
import { factor } from "../main.js";
import { Socket } from "../lib/socket.js";
import { ParticleEngine } from "./engine.js";
import { PARTICLE_SYSTEMS } from "./registry.js";

export class Particle3D {
    constructor(type, socket = true) {
        this.params = {};
        this.params.type = type ?? "projectile";
        this.params.type = this.shorthandCompatibility[this.params.type] ?? this.params.type;
        this.socket = socket;
        this.params.id = foundry.utils.randomID(20);
    }

    get shorthandCompatibility() {
        return {
            p: "projectile",
            e: "explosion",
            s: "sprite",
            r: "ray",
        };
    }

    fromObject(object) {
        this.params = object.params;
        this._from = object._from;
        this._to = object._to;
        return this;
    }

    start(socket = true) {
        if (!this._to) this.toTarget();
        if (!this._validate()) return false;
        this.params.scene = canvas.scene.id;
        if (socket) {
            Socket.Particle3D({from: this._from, to: this._to, params: this.params});
        } else {
            game.Levels3DPreview.particleSystem.resolveSocket(this._from, this._to, this.params);
        }
        return this.params.id;
    }

    toUUID(placeable) {
        return placeable.uuid ?? placeable.document?.uuid ?? placeable;
    }

    from(from) {
        from = from instanceof Array ? from : [from];
        from = from.map((t) => this.toUUID(t)).filter((t) => t);
        this._from = from;
        return this;
    }
    to(to) {
        to = to instanceof Array ? to : [to];
        to = to.map((t) => this.toUUID(t)).filter((t) => t);
        this._to = to;
        return this;
    }
    toTarget() {
        this.to("target");
        return this;
    }
    attach(attach = true) {
        this.params.attach = attach;
        return this;
    }
    sprite(sprite) {
        this.params.sprite = sprite;
        return this;
    }
    rate(particles, seconds) {
        seconds = seconds / 1000;
        this.params.rate = { particles, seconds };
        return this;
    }
    alpha(start, end) {
        end = end ?? 1;
        this.params.alpha = { start, end };
        return this;
    }

    mass(mass) {
        this.params.mass = mass;
        return this;
    }
    life(min, max) {
        max = max ?? min;
        min /= 1000;
        max /= 1000;
        this.params.life = { min, max };
        return this;
    }
    emitterSize(size) {
        this.params.emitterSize = (size * canvas.dimensions.size) / factor;
        return this;
    }
    scale(a, b) {
        const scale = this.params.type == "s" || this.params.type == "sprite" ? canvas.scene.dimensions.size / factor : Math.sqrt(ParticleEngine.getScale()) / 5;
        a *= scale;
        if (b) {
            this.params.scale = { start: a, end: b * scale };
        } else {
            this.params.scale = { start: a, end: 0 };
        }
        return this;
    }
    gravity(gravity) {
        this.params.gravity = gravity * ParticleEngine.getScale();
        return this;
    }
    color(start, end) {
        end = end ?? start;
        start = start instanceof Array ? start : [start];
        end = end instanceof Array ? end : [end];
        this.params.color = { start, end };
        return this;
    }
    arc(arc) {
        this.params.arc = arc;
        return this;
    }
    speed(speed) {
        this.params.speed = speed;
        return this;
    }
    miss(miss) {
        this.params.miss = miss === undefined ? true : miss;
        return this;
    }
    force(force) {
        this.params.force = force * ParticleEngine.getScale();
        return this;
    }
    push(dx, dy, dz) {
        dx = (dx ?? 0) * ParticleEngine.getScale();
        dy = (dy ?? 0) * ParticleEngine.getScale();
        dz = (dz ?? 0) * ParticleEngine.getScale();
        this.params.push = { dx, dy, dz };
        return this;
    }
    repeat(repeat) {
        this.params.repeats = repeat;
        return this;
    }
    delay(delay) {
        this.params.delay = delay;
        return this;
    }
    startAfter(delay) {
        this.params.startAfter = delay;
        return this;
    }
    radial(radius, direction = { x: 0, y: 1, z: 0 }, theta = 30) {
        direction = new THREE.Vector3(direction.x, direction.y, direction.z);
        this.params.radial = { radius, direction, theta };
        return this;
    }
    duration(duration) {
        this.params.duration = duration / 1000;
        return this;
    }
    rotation(x, y, z) {
        this.params.rotation = [Math.toRadians(x), Math.toRadians(y), Math.toRadians(z)];
        return this;
    }
    up(x, y, z) {
        this.params.up = [x, y, z];
        return this;
    }
    rotateTowards(v = true) {
        this.params.rotateTowards = v;
        return this;
    }
    playAnimation(animationData) {
        const animationFrom = animationData.from;
        const animationTo = animationData.to;
        const animData = game.Levels3DPreview.CONFIG.tokenAnimations[animationFrom?.id];
        if (animData?.particleDelay) {
            this.startAfter(animData.particleDelay);
        }
        if (animationFrom) {
            animationFrom.options = animationFrom.options ?? {};
            animationFrom.options.start = animationFrom.options.start ?? true;
            animationFrom.options.end = animationFrom.options.end ?? false;
        }
        if (animationTo) {
            animationTo.options = animationTo.options ?? {};
            animationTo.options.start = animationTo.options.start ?? false;
            animationTo.options.end = animationTo.options.end ?? true;
        }
        this.params.tokenAnimation = animationData;
        return this;
    }

    meshSurface(value = true) {
        this.params.meshSurface = value;
        return this;
    }

    presetIntensity(intensity) {
        this.params.presetIntensity = intensity;
        return this;
    }

    onCenter(value = true) {
        this.params.onCenter = value;
        return this;
    }

    autoSize(value = true) {
        this.params.autoSize = value;
        return this;
    }

    coneAngle(angle) {
        this.params.coneAngle = angle;
        return this;
    }

    applyPresetLightOffset(value) {
        this.params.applyPresetLightOffset = value;
        return this;
    }

    impact(impact = true) {
        this.params.impact = impact;
        return this;
    }

    name(name) {
        this.params.name = name;
        return this;
    }
    onEnd(particle3d) {
        particle3d = particle3d instanceof Array ? particle3d : [particle3d];
        for (let p of particle3d) {
            if (!(p instanceof Particle3D)) {
                ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.onend"));
                return this;
            }
            p.params.id = this.params.id;
        }
        this.params.onEnd = particle3d;
        return this;
    }

    _validate() {
        const hasFrom = this._from && this._from.length;
        const hasTo = this._to && this._to.length;
        if ((!hasFrom && !hasTo) || !hasTo) {
            ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.fromto"));
            return false;
        }

        const requiresSourceTarget = PARTICLE_SYSTEMS.requiresSourceTarget(this.params.type);

        if (requiresSourceTarget && (!hasFrom || !hasTo)) {
            ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.fromto"));
            return false;
        }

        const types = Object.keys(PARTICLE_SYSTEMS.ALL_PARTICLE_SYSTEMS);
        if (!types.includes(this.params.type)) {
            ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.type").replace("%type%", this.params.type) + types.join(", "));
            return false;
        }

        return true;
    }

    static stop(id) {
        Socket.Particle3DStop({id});
    }
}
