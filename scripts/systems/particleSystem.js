const { System, Emitter, Rate, Span, Position, Mass, Radius, Spring, Life, Velocity, PointZone, Vector3D, Alpha, Repulsion, MeshZone, INTEGRATION_TYPE_VERLET, Scale, Color, RadialVelocity, SpriteRenderer, LineZone, RandomDrift, Gravity, SphereZone, ease, Force, Body, GPURenderer, MeshRenderer } = window.Nebula;
import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import { factor } from "../main.js";

export class ParticleSystem {
    constructor(_parent, renderer = "gpu") {
        this._parent = _parent;
        this.effects = new Set();
        this.renderer = renderer;
        this.init();
    }

    get scene() {
        return this._parent.scene;
    }

    init() {
        this.system = new System();
        const renderer = (this.renderer = "gpu" ? new GPURenderer(this.scene, THREE) : new SpriteRenderer(this.scene, THREE));
        this.system.addRenderer(renderer).emit({
            onStart: () => {},
            onUpdate: () => {},
            onEnd: () => {},
        });
        this.points = this.system.renderers[0].points;
        this.points.userData.ignoreHover = true;
    }

    move() {
        this._parent.scene.add(this.points);
        this.system.renderers[0].container = this.scene;
    }

    destroy() {
        this.stopAll();
    }

    async effect(from, to, params) {
        if (!game.settings.get("levels-3d-preview", "enableEffects")) return;
        to = to instanceof Array ? to : [to];
        if (!from) from = [null];
        from = from instanceof Array ? from : [from];
        const repeats = params.repeats || 1;
        const delay = params.delay || 0;
        const startAfter = params.startAfter || 0;
        const tokenAnimation = params.tokenAnimation;
        for (let repeat = 0; repeat < repeats; repeat++) {
            for (let origin of from) {
                if (tokenAnimation?.from && tokenAnimation.from.options.start) this.playTokenAnimation(tokenAnimation.from, origin);
                for (let target of to) {
                    if (tokenAnimation?.to && tokenAnimation.to.options.start) this.playTokenAnimation(tokenAnimation.to, target);
                    this.sleep(startAfter).then(async () => {
                        const projectileEmitter = new ProjectileEffect(origin, target, params);
                        const emitter = await projectileEmitter.init();
                        if (projectileEmitter.emitter instanceof THREE.Sprite || projectileEmitter.emitter instanceof THREE.Object3D) {
                            this.effects.add(projectileEmitter);
                            this.scene.add(projectileEmitter.emitter);
                        } else {
                            this.system.addEmitter(projectileEmitter.emitter);
                            this.effects.add(projectileEmitter);
                        }
                    });
                }
                await this.sleep(delay);
            }
        }
    }

    playTokenAnimation(animationData, tokenIds) {
        tokenIds instanceof Array || (tokenIds = [tokenIds]);
        tokenIds = tokenIds.map((id) => id.id ?? id);
        game.Levels3DPreview.helpers.playTokenAnimationSocket({ tokenIds: tokenIds, animationId: animationData.id, options: animationData.options });
    }

    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    update(delta) {
        if (this.system) {
            this.system.update(delta);
            this.effects.forEach((effect) => {
                effect.animate(delta);
                if (effect._currentSpeed > 1) {
                    this.effects.delete(effect);
                    if (effect.emitter instanceof THREE.Sprite || effect.emitter instanceof THREE.Object3D) {
                        this.scene.remove(effect.emitter);
                        effect.emitter?.dispose?.();
                    } else {
                        effect.emitter.destroy();
                    }
                }
            });
        }
    }

    stop(id) {
        if (id === "all") return this.stopAll();
        let effect = [];
        this.effects.forEach((e) => {
            if (e.params.id === id || e.params.name === id) effect.push(e);
        });
        effect.forEach((e) => {
            this.effects.delete(e);
            if (e.emitter instanceof THREE.Sprite) {
                this.scene.remove(e.emitter);
            } else {
                e.emitter.destroy();
            }
        });
    }

    stopAll() {
        this.effects.forEach((effect) => {
            if (effect.emitter instanceof THREE.Sprite) {
                this.scene.remove(effect.emitter);
            } else {
                effect.emitter.destroy();
            }
        });
        this.effects.clear();
    }

    resolveSocket(from, to, params) {
        if (canvas.scene.id !== params.scene || !game.Levels3DPreview._active) return;
        if (params.type !== "explosion" && params.type !== "e") from = from.map((t) => this.fromUUID(t));
        to = to.map((t) => this.fromUUID(t));
        if (params.type === "projectile" || params.type === "p") {
            this.effect(from, to, params);
        }
        if (params.type === "sprite" || params.type === "s") {
            params.single = true;
            this.effect(from, to, params);
        }
        if (params.type === "ray" || params.type === "r") {
            this.effect(from, to, params);
        }
        if (params.type === "explosion" || params.type === "e") {
            this.effect(from, to, params);
        }
    }

    fromUUID(uuid) {
        if (uuid.layer) {
            return canvas.layers.find((l) => l.name === uuid.layer).get(uuid.id);
        } else {
            return uuid;
        }
    }

    static getScale() {
        return canvas.scene.dimensions.size / 100;
    }
}

class ProjectileEffect {
    constructor(from, to, params) {
        this.from = from;
        this.to = to;
        this._missScale = 1;
        this.params = { ...this.defaultSettings, ...params };
        this._origin = this.isExplosion ? null : this.inferPosition(from);
        this._target = this.inferPosition(to, true);
        this._duration = this.params.duration;
        this._rotation = new THREE.Euler(this.params.rotation[0], this.params.rotation[1], this.params.rotation[2]);
        this._up = new THREE.Vector3(this.params.up[0], this.params.up[1], this.params.up[2]);
        this.miss();
        this._dist = this.isExplosion ? null : this._origin.distanceTo(this._target);
        this._speed = this.isExplosion ? null : (this.params.speed / this._dist / (factor / 100)) * ParticleSystem.getScale(); //unitSpeed / this._dist;
        this._time = 0;
        this._currentSpeed = 0;
    }

    get isSprite() {
        return this.params.type === "sprite" || this.params.type === "s";
    }

    get isProjectile() {
        return this.params.type === "projectile" || this.params.type === "p";
    }

    get isRay() {
        return this.params.type === "ray" || this.params.type === "r";
    }

    get isExplosion() {
        return this.params.type === "explosion" || this.params.type === "e";
    }

    get rendererScale() {
        return game.Levels3DPreview.particleSystem.system.renderers[0].type === "SpriteRenderer" ? 0.5 : 1;
    }

    async init() {
        this.createAnimationPath();
        this.params.single ? await this.createSingleParticle() : await this.createEmitter();
        this.sprite = this.emitter instanceof THREE.Sprite || this.emitter instanceof THREE.Object3D;
        return this;
    }

    async createEmitter() {
        this.emitter = new Emitter();
        const drift = this.isExplosion ? 10 : 0;
        this.emitter
            .setRate(new Rate(this.params.rate.particles, this.params.rate.seconds))
            .addInitializers([new Body(await this.createSprite()), new Mass(this.params.mass), new Life(this.params.life.min, this.params.life.max), new Position(this.isRay ? new LineZone(this._origin.x, this._origin.y, this._origin.z, this._target.x, this._target.y, this._target.z) : new SphereZone(this.params.emitterSize)), new RadialVelocity(this.params.radial.angle, this.params.radial.direction, this.params.radial.theta)])
            .addBehaviours([new Alpha(this.params.alpha.start, this.params.alpha.end, Infinity, ease.easeInOutSine), new RandomDrift(0.001 + drift, 0.001 + drift, 0.001 + drift, 0.05), new Scale(this.params.scale.start * this.rendererScale, this.params.scale.end * this.rendererScale), new Gravity(this.params.gravity), new Force(this.params.push.dx, this.params.push.dz, this.params.push.dy), new Color(this.params.color.start, this.params.color.end, Infinity, ease.easeOutSine)]);
        if (this.isExplosion) {
            this.emitter.addBehaviours([new Repulsion(this._target, this.params.force, this.params.emitterSize, Infinity, ease.easeOutSine)]);
        }
        if (!this.isRay) {
            this.emitter.setPosition(this.isExplosion ? this._target : this._origin);
        }
        this.emitter.emit();
    }

    async createSingleParticle() {
        this.emitter = await this.createSprite();
        const scale = this.params.scale.start ? this.params.scale.start : this.params.scale.end;
        this.emitter.scale.set(scale, scale, scale);
    }

    async createSprite() {
        if (game.Levels3DPreview.helpers.is3DModel(this.params.sprite)) {
            this.isModel = true;
            const model = (await game.Levels3DPreview.helpers.loadModel(this.params.sprite))?.model ?? new THREE.Group();
            const color = new THREE.Color(this.params.color.start[0] ?? 0xffffff);
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.material.color.multiply(color);
                    if (child.material.emissiveIntensity && child.material.emissive) child.material.emissive.multiply(color);
                }
            });
            const box = new THREE.Box3().setFromObject(model);
            model.position.sub(box.getCenter(new THREE.Vector3()));
            model.position.y = -box.min.y;
            model.rotation.copy(this._rotation);
            const group = new THREE.Group();
            group.add(model);
            group.up = this._up;
            return group;
        }
        const tex = await game.Levels3DPreview.helpers.loadTexture(this.params.sprite);
        if (tex.image?.currentTime) tex.image.currentTime = 0;
        const material = new THREE.SpriteMaterial({
            map: tex,
            color: this.params.single ? this.params.color.start : 0xffffff,
            blending: this.params.single ? THREE.NormalBlending : THREE.AdditiveBlending,
            fog: true,
        });
        return new THREE.Sprite(material);
    }

    miss() {
        if (!this.params.miss) return;
        this._missScale *= 2 * (canvas.dimensions.size / factor);
        this._target.x += (Math.random() - 0.5) * this._missScale;
        this._target.y += (Math.random() - 0.5) * this._missScale;
        this._target.z += (Math.random() - 0.5) * this._missScale;
    }

    createAnimationPath() {
        const points = [];
        const origin = this.params.rotateTowards ? this._target : this._origin;
        const target = this.params.rotateTowards ? this._bottomTarget : this._target;
        for (let i = 0, l = this.params.arc; i < l; i++) {
            const t = (i + 2) / (l + 2);
            const point = origin.clone();
            point.lerp(target, t);
            point.x += (Math.random() - 0.5) * this._dist * 0.2;
            point.z += (Math.random() - 0.5) * this._dist * 0.2;
            points.push(point);
        }

        this.animationPath = new THREE.CatmullRomCurve3([origin, ...points, target]);
        this.animationPath.curveType = "chordal";
    }

    get defaultSettings() {
        return {
            sprite: "modules/levels-3d-preview/assets/particles/emberssmall.png",
            rate: {
                particles: new Span(10, 15),
                seconds: new Span(0.016, 0.01),
            },
            mass: 100,
            life: {
                min: 0.1,
                max: 0.5,
            },
            emitterSize: 0.0001,
            scale: {
                start: (0.8 * Math.sqrt(ParticleSystem.getScale())) / 5,
                end: 0,
            },
            gravity: 0,
            color: {
                start: "#ff4d00",
                end: "#ffff00",
            },
            radial: {
                angle: 0,
                direction: new THREE.Vector3(0, 0, 0),
                theta: 30,
            },
            alpha: {
                start: 1,
                end: 1,
            },
            push: {
                dx: 0,
                dy: 0,
                dz: 0,
            },
            arc: 0,
            speed: 10,
            miss: false,
            single: false,
            duration: 0.3,
            force: 15,
            up: [0, 1, 0],
            rotateTowards: false,
            rotation: [0, 0, 0],
        };
    }

    inferPosition(object, isTarget) {
        if (object.x !== undefined && object.y !== undefined && object.z !== undefined) {
            return Ruler3D.posCanvasTo3d(object);
        }
        if (object instanceof Token) {
            this._missScale = Math.max(object.document.width, object.document.height) * object.document.scale;
            const tokenPos = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            if (isTarget) {
                tokenPos.y += game.Levels3DPreview.tokens[object.id].d * (Math.random() * 0.5 + 0.25);
                tokenPos.x += game.Levels3DPreview.tokens[object.id].w * ((Math.random() - 0.5) * 0.5);
                tokenPos.z += game.Levels3DPreview.tokens[object.id].h * ((Math.random() - 0.5) * 0.5);
            } else {
                tokenPos.y += game.Levels3DPreview.tokens[object.id].d * 0.66;
            }
            this._bottomTarget = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            this._bottomTarget.y -= game.Levels3DPreview.tokens[object.id].d;
            return tokenPos;
        }
        const z = object.document.getFlag("levels", "heightBottom") ?? object.document.getFlag("levels", "elevation") ?? 0;
        return Ruler3D.posCanvasTo3d({
            x: object.center.x,
            y: object.center.y,
            z: z,
        });
    }

    onEnd() {
        if (this.ended) return;
        this.ended = true;
        this.resolveTokenAnimation();
        this.params.onEnd?.forEach((e) => {
            const p3d = new Particle3D().fromObject(e);
            if (!p3d._to) p3d.to(this.to);
            if (!p3d._from) p3d.from(this.from);
            p3d.start(false);
        });
    }

    resolveTokenAnimation() {
        const tokenAnimation = this.params.tokenAnimation;
        if (!tokenAnimation) return;
        const from = tokenAnimation.from;
        const to = tokenAnimation.to;
        if (from && from.options.end) {
            this.playTokenAnimation(from, this.from);
        }
        if (to && to.options.end) {
            this.playTokenAnimation(to, this.to);
        }
    }

    playTokenAnimation(animationData, tokenIds) {
        tokenIds instanceof Array || (tokenIds = [tokenIds]);
        tokenIds = tokenIds.map((id) => id.id ?? id);
        game.Levels3DPreview.helpers.playTokenAnimationSocket({ tokenIds: tokenIds, animationId: animationData.id, options: animationData.options });
    }

    animate(delta) {
        if (this.isRay || this.isExplosion) {
            this._duration -= delta;
            if (this._duration <= 0) {
                this._playOnEnd = true;
                this.onEnd();
                this._currentSpeed = 2;
            }
            return;
        }
        if (this.animationPath) {
            this._time += delta;
            this._currentSpeed = this._time * this._speed;
            if (this._currentSpeed > 1) {
                this._playOnEnd = true;
                this.onEnd();
                return;
            }

            const point = this.params.rotateTowards ? this._origin : this.animationPath.getPointAt(this._currentSpeed); //this._origin.clone().lerp(this._target, this._currentSpeed);
            if (this.sprite) {
                this.emitter.position.copy(point);
                if (this.isModel) {
                    this.emitter.lookAt(this.params.rotateTowards ? this.animationPath.getPointAt(this._currentSpeed) : this._target);
                }
            } else {
                this.emitter.setPosition(point);
            }
        }
    }
}

export class Particle3D {
    constructor(type, socket = true) {
        this.params = {};
        this.params.type = type ?? "p";
        this.socket = socket;
        this.params.id = randomID(20);
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
            game.Levels3DPreview.socket.executeForEveryone("Particle3D", this._from, this._to, this.params);
        } else {
            game.Levels3DPreview.particleSystem.resolveSocket(this._from, this._to, this.params);
        }
        return this.params.id;
    }

    toUUID(placeable) {
        if (placeable?.layer?.name) {
            return {
                layer: placeable.layer.name,
                id: placeable.id,
            };
        } else {
            return placeable;
        }
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
        const scale = this.params.type == "s" || this.params.type == "sprite" ? canvas.scene.dimensions.size / factor : Math.sqrt(ParticleSystem.getScale()) / 5;
        a *= scale;
        if (b) {
            this.params.scale = { start: a, end: b * scale };
        } else {
            this.params.scale = { start: a, end: 0 };
        }
        return this;
    }
    gravity(gravity) {
        this.params.gravity = gravity * ParticleSystem.getScale();
        return this;
    }
    color(start, end) {
        end = end ?? start;
        start = start instanceof Array ? start : [start];
        end = end instanceof Array ? end : [end];
        start = start.map((c) => new THREE.Color(c));
        end = end.map((c) => new THREE.Color(c));
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
        this.params.force = force * ParticleSystem.getScale();
        return this;
    }
    push(dx, dy, dz) {
        dx = dx * ParticleSystem.getScale() ?? 0;
        dy = dy * ParticleSystem.getScale() ?? 0;
        dz = dz * ParticleSystem.getScale() ?? 0;
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
        //validate from\to
        if (this.params.type !== "e" && this.params.type !== "explosion") {
            if (!this._from || !this._to || this._from.length === 0 || this._to.length === 0) {
                ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.fromto"));
                return false;
            }
        } else {
            if (!this._to || !this._to.length) {
                ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.fromto"));
                return false;
            }
        }
        //validate type
        const types = ["p", "e", "s", "r", "projectile", "explosion", "ray", "sprite"];
        if (!types.includes(this.params.type)) {
            ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.type").replace("%type%", this.params.type) + types.join(", "));
            return false;
        }
        return true;
    }

    static stop(id) {
        game.Levels3DPreview.socket.executeForEveryone("Particle3DStop", id);
    }
}
