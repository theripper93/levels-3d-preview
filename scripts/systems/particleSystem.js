import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from "../main.js";
import * as QUARKS from "../lib/three.quarks.esm.js";

const materialCache = {};

export class ParticleEngine {
    constructor(_parent) {
        this._parent = _parent;
        this.effects = new Set();
        this.toCleanup = new Set();
        this.system = new QUARKS.BatchedParticleRenderer();
        this.init();
    }

    get scene() {
        return this._parent.scene;
    }

    init() {
        this.scene.add(this.system);
    }

    move() {
        this.scene.add(this.system);
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
                        const particleClass = getParticleClass(params.type);
                        const projectileEmitter = new particleClass(origin, target, params);
                        await projectileEmitter.init();
                        this.scene.add(projectileEmitter.emitter)
                        projectileEmitter.particleSystems.forEach((s) => this.system.addSystem(s));
                        //projectileEmitter instanceof Object3DParticle ? this.scene.add(projectileEmitter.emitter) : this.system.addEmitter(projectileEmitter.emitter);
                        this.effects.add(projectileEmitter);
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
        if(delta > 500) return;
        if (this.system) {
            this.system.update(delta);
            this.effects.forEach((effect) => {
                effect.animate(delta);
                if (effect.ended) {
                    this.disposeEffect(effect);
                }
            });
            this.toCleanup.forEach((effect) => {
                this.cleanUpEffect(effect);
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
            this.disposeEffect(e);
        });
    }

    stopAll() {
        this.effects.forEach((effect) => {
            this.disposeEffect(effect);
        });
        this.effects.clear();
    }

    disposeEffect(effect) {
        this.effects.delete(effect);
        this.toCleanup.add(effect);
        effect.particleSystems.forEach((s) => {
            s.autoDestroy = true;
            s.looping = false;
            s.duration = 0;
            s.markForDestroy = true;
        });
    }

    cleanUpEffect(effect) {
        if(effect.particleSystems.every((s) => s.particleNum === 0)){
            this.scene.remove(effect.emitter);
            this.toCleanup.delete(effect);
        }
    }

    async resolveSocket(from, to, params) {
        if (canvas.scene.id !== params.scene || !game.Levels3DPreview._active) return;
        if (from) {
            const fromObjects = [];
            for(let f of from) fromObjects.push(typeof f == "string" ? (await fromUuid(f)) ?? f : f);
            from = fromObjects.map((f) => f._object ?? f);
        }
        if (to) {
            const toObjects = []; 
            for(let t of to) toObjects.push(typeof t == "string" ? (await fromUuid(t)) ?? t : t);
            to = toObjects.map((t) => t._object ?? t);
        }
        this.effect(from, to, params);
    }

    static getScale() {
        return canvas.scene.dimensions.size / 100;
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
        this.params.force = force * ParticleEngine.getScale();
        return this;
    }
    push(dx, dy, dz) {
        dx = dx * ParticleEngine.getScale() ?? 0;
        dy = dy * ParticleEngine.getScale() ?? 0;
        dz = dz * ParticleEngine.getScale() ?? 0;
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

    presetIntensity(intensity) {
        this.params.presetIntensity = intensity;
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
        if (this.params.type !== "e" && this.params.type !== "explosion" && !Object.keys(LightParticleSystems).includes(this.params.type)) {
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
        const types = ["p", "e", "s", "r", "projectile", "explosion", "ray", "sprite"].concat(Object.keys(LightParticleSystems));
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

//Particle Types

class BaseParticleEffect {
    constructor(from, to, params) {
        this.from = from;
        this.to = to;
        this._missScale = 1;
        this.params = { ...this.defaultSettings, ...params };
        this._origin = this.inferPosition(from);
        this._target = this.inferPosition(to, true);
        this._duration = this.params.duration;
        this._rotation = new THREE.Euler(this.params.rotation[0], this.params.rotation[1], this.params.rotation[2]);
        this._up = new THREE.Vector3(this.params.up[0], this.params.up[1], this.params.up[2]);
        this.miss();
        this._time = 0;
        this._currentSpeed = 0;
        this.particleSystems = [];
    }

    get rendererScale() {
        return 1;
    }

    async init() {
        this.createAnimationPath();
        await this.createEmitter();
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

    async createEmitter() { }

    async getBasicMaterial(filePath, blending = THREE.AdditiveBlending) {
        const path = filePath ?? this.params.sprite;
        const key = `${path}${blending}`;
        if (materialCache[key]) return materialCache[key];
        
        const tex = await game.Levels3DPreview.helpers.loadTexture(path);
        if (tex.image?.currentTime) tex.image.currentTime = 0;
        const material = new THREE.MeshBasicMaterial({
            map: tex,
            blending,
            transparent: true,
            side: THREE.DoubleSide,
        });

        materialCache[key] = material;

        return material;
    }

    get defaultSettings() {
        return {
            sprite: "modules/levels-3d-preview/assets/particles/emberssmall.png",
            rate: {
                particles: 15,
                seconds: 0.01,
            },
            mass: 100,
            life: {
                min: 0.1,
                max: 0.5,
            },
            emitterSize: 0.0001,
            scale: {
                start: (0.8 * Math.sqrt(ParticleEngine.getScale())) / 5,
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
            presetIntensity: 1,
        };
    }

    inferPosition(object, isTarget) {
        if (!object) return null;
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
    }
}

class ProjectileParticle extends BaseParticleEffect {
    constructor(from, to, params) {
        super(from, to, params);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (this.params.speed / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this.isProjectile = true;
    }

    async createSprite() {
        const tex = await game.Levels3DPreview.helpers.loadTexture(this.params.sprite);
        if (tex.image?.currentTime) tex.image.currentTime = 0;
        const material = new THREE.SpriteMaterial({
            map: tex,
            color: 0xffffff,
            blending: THREE.AdditiveBlending,
            fog: true,
        });
        return new THREE.Sprite(material);
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5*0.5),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                
                followLocalOrigin: true
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: new QUARKS.SphereEmitter({radius: Math.max(0.01, this.params.emitterSize)}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const sphereData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min*0.1, this.params.life.max*0.1),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.4),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,
            
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                
                followLocalOrigin: true
            },
            followLocalOrigin: true,
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const turbulence = new THREE.Vector3(10,10,10)

        const trail = new QUARKS.ParticleSystem(trailData);

        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        trail.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        trail.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence, turbulence));
        
        const tip = new QUARKS.ParticleSystem(sphereData);
        
        tip.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        tip.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        tip.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        tip.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence,turbulence));


        this.emitter.add(trail.emitter);
        this.emitter.add(tip.emitter);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(trail, tip);
    }

    animate(delta) {
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1) {
            this._playOnEnd = true;
            this.onEnd();
            return;
        }
        const point = this.params.rotateTowards ? this._origin : this.animationPath.getPointAt(this._currentSpeed);
        this.emitter.position.copy(point);
    }
}

class ExplosionParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const mainExplosionData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.force/30),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor:new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const innerFlashData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.force/9),
            startSize: new QUARKS.IntervalValue(this.params.scale.start/5, this.params.scale.start/10),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
            },
            emissionOverTime: new QUARKS.ConstantValue(0),
            emissionBursts: [{
                time: 0,
                count: this.params.rate.particles*5,
                cycle: 1,
                interval: 0.01,
                probability: 1,
            }],
        
            shape: new QUARKS.SphereEmitter({radius: this.params.emitterSize/4}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png"),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const innerGlowData = {...innerFlashData}
        innerGlowData.startSpeed = new QUARKS.ConstantValue(this.params.force / 5);
        innerGlowData.startSize = new QUARKS.IntervalValue(this.params.scale.start / 10, this.params.scale.start / 20);
        innerGlowData.renderMode = QUARKS.RenderMode.BillBoard;
        


        const turbulence = new THREE.Vector3(1,1,1).multiplyScalar(this.params.emitterSize)

        const mainExplosion = new QUARKS.ParticleSystem(mainExplosionData);


        mainExplosion.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainExplosion.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        mainExplosion.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity / (this.params.mass / 100), this.params.push.dy), new QUARKS.ConstantValue(1)));
        mainExplosion.addBehavior(new QUARKS.RotationOverLife(new QUARKS.IntervalValue(0, 0.5*Math.PI), true));

        const innerFlash = new QUARKS.ParticleSystem(innerFlashData);
        innerFlash.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        innerFlash.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, -1, 0), new QUARKS.ConstantValue(1)));
        const innerGlow = new QUARKS.ParticleSystem(innerGlowData);
        innerGlow.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));

        this.emitter.add(mainExplosion.emitter);
        this.emitter.add(innerFlash.emitter);
        this.emitter.add(innerGlow.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(mainExplosion);
        this.particleSystems.push(innerFlash);
        this.particleSystems.push(innerGlow);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class RayParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (Math.max(this.params.speed,40) / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this._duration = Math.max(this.params.duration, this.params.life.max);
        this.isRay = true;
    }

    async createSprite() {
        const tex = await game.Levels3DPreview.helpers.loadTexture(this.params.sprite);
        if (tex.image?.currentTime) tex.image.currentTime = 0;
        const material = new THREE.SpriteMaterial({
            map: tex,
            color: 0xffffff,
            blending: THREE.AdditiveBlending,
            fog: true,
        });
        return new THREE.Sprite(material);
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const mainBeamData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(Math.max(this.params.life.max,this.params.duration)),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5*0.5),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
                
                followLocalOrigin: true
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(1),
        
            shape: new QUARKS.SphereEmitter({radius: Math.max(0.01, this.params.emitterSize)}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const sphereData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1),
            startSpeed: new QUARKS.ConstantValue(0.1),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            startRotation: new QUARKS.IntervalValue(0, 2*Math.PI),
            worldSpace: true,
            prewarm: true,
            speedFactor: 5,
            
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                
                followLocalOrigin: true
            },
            followLocalOrigin: true,
            
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles),
        
            shape: new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };


        const mainBeam = new QUARKS.ParticleSystem(mainBeamData);

        mainBeam.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainBeam.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        mainBeam.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        
        const subBeamData = {...mainBeamData};
        subBeamData.startSize = new QUARKS.ConstantValue(1 * 0.5 * 0.5 * 0.25);
        subBeamData.shape = new QUARKS.PointEmitter();
        subBeamData.emissionOverTime = new QUARKS.ConstantValue(0.1);

        const subBeam1 = new QUARKS.ParticleSystem(subBeamData);
        const subBeam2 = new QUARKS.ParticleSystem(subBeamData);
        const subBeam3 = new QUARKS.ParticleSystem(subBeamData);
        const subBeam4 = new QUARKS.ParticleSystem(subBeamData);
        

        [subBeam1, subBeam2, subBeam3, subBeam4].forEach((subBeam) => {
            subBeam.addBehavior(new QUARKS.Noise(new THREE.Vector3(1, 1, 1), new THREE.Vector3(5, 5, 5)))
            subBeam.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        });

        const subBeamDist = Math.max(0.01, Math.max(0.01,this.params.emitterSize)*this.params.scale.start)*2;

        subBeam1.emitter.position.set(subBeamDist, 0, 0);
        subBeam2.emitter.position.set(-subBeamDist, 0, 0);
        subBeam3.emitter.position.set(0, 0, subBeamDist);
        subBeam4.emitter.position.set(0, 0, -subBeamDist);

        const subBeamGroup = new THREE.Group();
        subBeamGroup.add(subBeam1.emitter);
        subBeamGroup.add(subBeam2.emitter);
        subBeamGroup.add(subBeam3.emitter);
        subBeamGroup.add(subBeam4.emitter);

        subBeamGroup.rotation.x = Math.PI / 2;

        this.subBeamGroup = subBeamGroup;

        const tip = new QUARKS.ParticleSystem(sphereData);

        this.tip = tip;
        
        tip.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        tip.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],0.3), colorToVec4(this.params.color.end[0],0))));
        tip.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));

        this.emitter.add(mainBeam.emitter);
        this.emitter.add(tip.emitter);
        this.emitter.add(subBeamGroup);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(mainBeam, subBeam1, subBeam2, subBeam3, subBeam4, tip);
    }

    animate(delta) {
        this._duration -= delta;
        this.subBeamGroup.rotation.y += delta * 20;
        const sbScale = (0.5 - Math.abs(Math.min(1,this._currentSpeed) - 0.5))*2;
        this.subBeamGroup.scale.set(sbScale,sbScale,sbScale)
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
            return;
        }
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1) {
            this.tip.emissionOverTime = new QUARKS.ConstantValue(this.params.rate.particles/10)
        }
        if (this._currentSpeed > 1 && this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            return;
        }
        if (this._duration > 0 && this._currentSpeed <= 1) {            
            const point = this.params.rotateTowards ? this._origin : this.animationPath.getPointAt(this._currentSpeed);
            this.emitter.lookAt(point);
            this.emitter.position.copy(point);
        }
    }
}

class Object3DParticle extends BaseParticleEffect {
    constructor(from, to, params) {
        super(from, to, params);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (this.params.speed / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this.isSprite = true;
        this.sprite = true;
    }

    async createEmitter() {
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
        } else if (game.Levels3DPreview.vfx.isVFX(this.params.sprite)) {
            const model = (await game.Levels3DPreview.vfx.loadVFX(this.params.sprite)) ?? new THREE.Group();
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

    animate(delta) {
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1) {
            this._playOnEnd = true;
            this.onEnd();
            return;
        }

        const point = this.params.rotateTowards ? this._origin : this.animationPath.getPointAt(this._currentSpeed); //this._origin.clone().lerp(this._target, this._currentSpeed);

        this.emitter.position.copy(point);
        if (this.isModel) {
            this.emitter.lookAt(this.params.rotateTowards ? this.animationPath.getPointAt(this._currentSpeed) : this._target);
        }
    }
}

class BasicCustomParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const mainExplosionData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.force/10),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const mainExplosion = new QUARKS.ParticleSystem(mainExplosionData);
        
        mainExplosion.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainExplosion.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        mainExplosion.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity, this.params.push.dy), new QUARKS.ConstantValue(1)));


        this.emitter.add(mainExplosion.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(mainExplosion);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

//Light particles


class TorchParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const fireMaterial1 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.NormalBlending);
        const fireMaterial1Add = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.AdditiveBlending);
        const fireMaterial2 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame2x2.png");
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");

        const lifeMultiplier = Math.sqrt(this.params.scale.start * 5)*1.5;

        const fire1Data = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(2.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.03),
            startSize: new QUARKS.ConstantValue(0.2*lifeMultiplier*0.35),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/10}),
            material: fireMaterial1,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const fireGlowData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.005),
            startSize: new QUARKS.ConstantValue(0.2*0.7*0.25*lifeMultiplier),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*18),
        
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/10}),
            material: fireMaterial2,
            startTileIndex: new QUARKS.IntervalValue(0, 3),
            uTileCount: 2,
            vTileCount: 2,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.BillBoard,
        }

        const emberData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.005),
            startSize: new QUARKS.ConstantValue(0.02*0.4*lifeMultiplier),
            startColor: new QUARKS.ConstantColor(colorToVec4(this.params.color.start[0], 0)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize*0.5, angle: Math.PI/5}),
            material: emberMaterial,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.BillBoard,
        }

        const fire1 = new QUARKS.ParticleSystem(fire1Data);
        
        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0.3)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0.3), colorToVec4(this.params.color.end[0], 1)), 0.2314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
            
        fire1.addBehavior(new QUARKS.ColorOverLife(gradient));
        fire1.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        fire1.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.03)));
        fire1.emitter.rotation.x = -Math.PI / 2;
        
        const fire2 = fire1.clone();
        fire2.material = fireMaterial1Add;
        fire2.renderOrder = 4;
        fire2.emitter.rotation.x = -Math.PI / 2;

        const fireGlow = new QUARKS.ParticleSystem(fireGlowData);
        fireGlow.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.10)));
        fireGlow.addBehavior(new QUARKS.ColorOverLife(gradient));
        fireGlow.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.45, 0.3), 0.2]])));
        fireGlow.emitter.rotation.x = -Math.PI / 2;

        const ember = new QUARKS.ParticleSystem(emberData);
        ember.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.05)));
        ember.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.45, 0.3), 0.2]])));
        ember.emitter.rotation.x = -Math.PI / 2;

        this.emitter.add(fire1.emitter);
        this.emitter.add(fire2.emitter);
        this.emitter.add(fireGlow.emitter);
        this.emitter.add(ember.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fire1, fire2, fireGlow, ember);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class FireParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const fireMaterial1 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.NormalBlending);
        const fireMaterial1Add = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.AdditiveBlending);
        const fireMaterial2 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/fire_02.png");
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");

        const lifeMultiplier = Math.sqrt(this.params.scale.start * 5)*1.5;

        const fire1Data = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(2.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.01),
            startSize: new QUARKS.ConstantValue(0.2*lifeMultiplier*0.8),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/10}),
            material: fireMaterial1,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const fireGlowData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.01),
            startSize: new QUARKS.ConstantValue(0.2*0.7*0.5*lifeMultiplier),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*18),
        
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/10}),
            material: fireMaterial2,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.BillBoard,
        }

        const emberData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.005),
            startSize: new QUARKS.ConstantValue(0.02*0.4*lifeMultiplier),
            startColor: new QUARKS.ConstantColor(colorToVec4(this.params.color.start[0], 0)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize*0.5, angle: Math.PI/5}),
            material: emberMaterial,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.BillBoard,
        }

        const fire1 = new QUARKS.ParticleSystem(fire1Data);
        
        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0.3)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0.3), colorToVec4(this.params.color.end[0], 1)), 0.2314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
            
        fire1.addBehavior(new QUARKS.ColorOverLife(gradient));
        fire1.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        fire1.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.03)));
        fire1.emitter.rotation.x = -Math.PI / 2;
        
        const fire2 = fire1.clone();
        fire2.material = fireMaterial1Add;
        fire2.renderOrder = 4;
        fire2.emitter.rotation.x = -Math.PI / 2;

        const fireGlow = new QUARKS.ParticleSystem(fireGlowData);
        fireGlow.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.10)));
        fireGlow.addBehavior(new QUARKS.ColorOverLife(gradient));
        fireGlow.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.45, 0.3), 0.2]])));
        fireGlow.emitter.rotation.x = -Math.PI / 2;

        const ember = new QUARKS.ParticleSystem(emberData);
        ember.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.05)));
        ember.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.45, 0.3), 0.2]])));
        ember.emitter.rotation.x = -Math.PI / 2;

        this.emitter.add(fire1.emitter);
        this.emitter.add(fire2.emitter);
        this.emitter.add(fireGlow.emitter);
        this.emitter.add(ember.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fire1, fire2, fireGlow, ember);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class MagicCircleParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/rotated/trace_01_rotated.png");

        const circleLinesData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(8),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*5*this.params.emitterSize),
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: 0.001}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        }

        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        
        
        

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.0314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
            
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        circleLines.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.02)));
        circleLines.emitter.rotation.x = -Math.PI / 2;
        circleLines.emitter.position.y-=0.02;
        
        this.emitter.add(circleLines.emitter);
        this.emitter.position.copy(this._target);
        this.emitter.position.y -= 0.1;
        this.particleSystems.push(circleLines);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class VortexParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");


        const circleLinesData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.IntervalValue(1.5, 2.5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(80),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*25*this.params.emitterSize),
            shape: new QUARKS.DonutEmitter({radius: this.params.emitterSize, angle: 0.001, thickness: 1}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        }

        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        
        const particleData = {...circleLinesData}
        particleData.renderMode = QUARKS.RenderMode.BillBoard;
        particleData.startColor = new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1));
        
        const particles = new QUARKS.ParticleSystem(particleData);

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.0314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
            
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.4)));
        circleLines.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(1), new THREE.Vector3(0, 0, 1)));
        circleLines.emitter.rotation.x = -Math.PI / 2;

        particles.addBehavior(new QUARKS.ColorOverLife(gradient));
        particles.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.4)));
        particles.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(0.4), new THREE.Vector3(0, 0, 1)));
        particles.emitter.rotation.x = -Math.PI / 2;
        

        this.emitter.add(circleLines.emitter);
        this.emitter.add(particles.emitter);
        this.emitter.position.copy(this._target);
        this.emitter.position.y -= 0.1;
        this.particleSystems.push(circleLines,particles);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class SparksParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {

        while (!game.Levels3DPreview._ready) { 
            await new Promise(r => setTimeout(r, 100));
        }

        this.emitter = new THREE.Group();

        const position = this._target.clone();
        const targetp = this._target.clone();
        targetp.y -= 99999;
        const collision = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(position, targetp, "collision", false, false, false, true);
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");

        const circleLinesData = {
            duration: 0.2,
            looping: true,
            startLife: new QUARKS.ConstantValue(3),
            startSpeed: new QUARKS.ConstantValue(1),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionBursts: [
                {
                    time: 0,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
            ],
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*0),
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/2}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        }


        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        
        if (collision[0]) {
            const collY = collision[0].point.y;
            circleLines.addBehavior(
                new QUARKS.ApplyCollision(
                    {
                        resolve(pos, normal) {
                            if (pos.y <= collY) {
                                normal.set(0, 1, 0);
                                return true;
                            } else {
                                return false;
                            }
                        },
                    },
                    0.6
                )
            );
        }

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.0314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
            
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(-3)));
        circleLines.emitter.rotation.x = -Math.PI / 2;
        circleLines.emitter.position.y-=0.02;
        
        this.emitter.add(circleLines.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(circleLines);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class HolyLightParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/rotated/trace_01_rotated.png");

        const symbolMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/spark_02.png");

        const circleLinesData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(8),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*5*this.params.emitterSize),
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: 0.001}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        }

        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        
        const symbolsData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(8),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*5*this.params.emitterSize),
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize*0.8, angle: 0.001}),
            material: symbolMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        }

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.114],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );

        const symbols = new QUARKS.ParticleSystem(symbolsData);

        symbols.emitter.position.y -= 0.02;
    
            
        symbols.addBehavior(new QUARKS.ColorOverLife(gradient));
        symbols.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        symbols.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.02)));
        symbols.emitter.rotation.x = -Math.PI / 2;
        


            
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        //circleLines.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.02)));
        circleLines.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(1), new THREE.Vector3(0, 0, 1)));
        circleLines.emitter.rotation.x = -Math.PI / 2;
        
        this.emitter.add(circleLines.emitter);
        this.emitter.add(symbols.emitter);
        this.emitter.position.copy(this._target);
        this.emitter.position.y -= 0.09;
        this.particleSystems.push(circleLines, symbols);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class GhostlyParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/rotated/trace_01_rotated.png");

        const symbolMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/spark_02.png");
        
        const symbolsData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*15*this.params.emitterSize),
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize*0.8, angle: 0.001}),
            material: symbolMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        }

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.114],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );

        const symbols = new QUARKS.ParticleSystem(symbolsData);

        symbols.emitter.position.y -= 0.02;
    
            
        symbols.addBehavior(new QUARKS.ColorOverLife(gradient));
        symbols.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        symbols.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.02)));
        symbols.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(0.2), new THREE.Vector3(0, 0, 1)));
        symbols.emitter.rotation.x = -Math.PI / 2;
        
        
        this.emitter.add(symbols.emitter);
        this.emitter.position.copy(this._target);
        this.emitter.position.y -= 0.09;
        this.particleSystems.push(symbols);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class FairyParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");

        const circleLinesData = {
            duration: 0.2,
            looping: true,
            startLife: new QUARKS.ConstantValue(4),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*20*this.params.emitterSize),
            shape: new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        }


        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.0314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
            
        const turbulence = new THREE.Vector3(0.1,0.01,0.1)
        
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(1), new THREE.Vector3(0, 0, 1)));
        //circleLines.addBehavior(new QUARKS.TurbulenceField(turbulence, new QUARKS.ConstantValue(10), turbulence, turbulence));
        circleLines.addBehavior(new QUARKS.Noise(turbulence,turbulence))
        circleLines.emitter.rotation.x = -Math.PI / 2;
        
        this.emitter.add(circleLines.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(circleLines);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class SmokeCloudParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const symbolMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/smoke_04.png", THREE.NormalBlending);
        
        const symbolsData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(8),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            startRotation: new QUARKS.IntervalValue(0, 2 * Math.PI),
            worldSpace: false,
            prewarm: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*15*this.params.emitterSize),
            shape: new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: 0.001}),
            material: symbolMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        }

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.end[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );

        const symbols = new QUARKS.ParticleSystem(symbolsData);

        symbols.emitter.position.y -= 0.02;
    
            
        symbols.addBehavior(new QUARKS.ColorOverLife(gradient));
        symbols.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        symbols.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(0.05), new THREE.Vector3(0, 0, 1)));
        symbols.addBehavior(new QUARKS.Noise(new THREE.Vector3(0.1, 0.01, 0.1), new THREE.Vector3(0.01, 0.01, 0.01)));
        symbols.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.02)));
        symbols.addBehavior(new QUARKS.RotationOverLife(new QUARKS.ConstantValue(0.1)));
        symbols.emitter.rotation.x = -Math.PI / 2;
        
        
        this.emitter.add(symbols.emitter);
        this.emitter.position.copy(this._target);
        this.emitter.position.y -= 0.09;
        this.particleSystems.push(symbols);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class EnergyFieldParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isExplosion = true;
    }

    async createEmitter() {

        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_02.png");

        const circleLinesData = {
            duration: 0.2,
            looping: true,
            startLife: new QUARKS.ConstantValue(10),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.emitterSize*2),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*0.01),
            shape: new QUARKS.PointEmitter({radius: this.params.emitterSize}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        }


        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.0314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.522],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 1)),1],
            ]
            );
            
        
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.75, 0.95, 1), 0.75]])));

        circleLines.emitter.rotation.x = -Math.PI / 2;
        
        this.emitter.add(circleLines.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(circleLines);
    }

    animate(delta) {
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}


//Helpers

const getParticleClass = (type) => {
    if(type === "projectile" || type === "p") return ProjectileParticle;
    else if (type === "ray" || type === "r") return RayParticle;
    else if (type === "explosion" || type === "e") return ExplosionParticle;
    else if (type === "sprite" || type === "s") return Object3DParticle;
    else if (LightParticleSystems[type]) return LightParticleSystems[type];
    return ProjectileParticle;
}

const colorToVec4 = (color, alpha) => {
    return new THREE.Vector4(color.r, color.g, color.b, alpha);
}


export const LightParticleSystems = {
    "custom": BasicCustomParticle,
    "torch": TorchParticle,
    "fire": FireParticle,
    "magiccircle": MagicCircleParticle,
    "vortex": VortexParticle,
    "sparks": SparksParticle,
    "holy": HolyLightParticle,
    "ghostly": GhostlyParticle,
    "fairy": FairyParticle,
    "smokecloud": SmokeCloudParticle,
    "energy": EnergyFieldParticle,
}