import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from "../main.js";
import * as QUARKS from "../lib/three.quarks.esm.js";

const materialCache = {};
const vfxCache = {};

const raycaster = new THREE.Raycaster();

export class ParticleEngine {
    constructor(_parent) {
        this._parent = _parent;
        this.effects = new Set();
        this.toCleanup = new Set();
        this.system = new QUARKS.BatchedParticleRenderer();
        this.loader = new QUARKS.QuarksLoader(new THREE.LoadingManager());
        this.loader.setCrossOrigin("");
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
                        const particleClass = PARTICLE_SYSTEMS.getParticleClass(params.type);
                        const projectileEmitter = new particleClass(origin, target, params);
                        await projectileEmitter.init();
                        this.scene.add(projectileEmitter.emitter)
                        projectileEmitter.particleSystems.forEach((s) => this.system.addSystem(s));
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
            this.disposeEffect(effect, true);
        });
        this.effects.clear();
    }

    disposeEffect(effect, force = false) {
        this.effects.delete(effect);
        effect.particleSystems.forEach((s) => {
            s.autoDestroy = true;
            s.looping = false;
            s.duration = 0;
            s.markForDestroy = true;
        });
        if (force) {
            ParticleEngine.returnLightInstances(effect.emitter);
            this.scene.remove(effect.emitter);
        } else {
            this.toCleanup.add(effect);
        }
        this.cleanUpBatches();
    }

    cleanUpEffect(effect) {
        if (effect.particleSystems.every((s) => s.particleNum === 0)) {
            ParticleEngine.returnLightInstances(effect.emitter);
            this.scene.remove(effect.emitter);
            this.toCleanup.delete(effect);
        }
    }

    cleanUpBatches() {
        const toClean = this.system.batches.filter((b) => b.systems.size === 0);
        if(toClean.length === 0) return;
        let batches  = [...this.system.batches];
        for(let batch of toClean) {
            batch.removeFromParent();
            batch.dispose();
            batches = batches.filter((b) => b !== batch);       
        }
        //re index batches
        const systemToBatch = new Map();
        for(const [system, index] of this.system.systemToBatchIndex.entries()) {
            const oldSystem = this.system.batches[index];
            const newIndex = batches.indexOf(oldSystem);            
            systemToBatch.set(system, newIndex);
        }
        this.system.systemToBatchIndex = systemToBatch;
        this.system.batches = batches;
    }

    isVFX(urlOrId) {
        return vfxCache[urlOrId] !== undefined || urlOrId.endsWith(".json");
    }

    async loadVFX(urlOrId) {
            if (vfxCache[urlOrId]) {
                return await this.getClone(urlOrId);
            } else {
                vfxCache[urlOrId] = await fetchJsonWithTimeout(urlOrId);
                return await this.getClone(urlOrId);
            }
    }

    getClone(urlOrId) {
        return new Promise(async (resolve, reject) => {
            this.loader.parse(vfxCache[urlOrId], (vfx) => { 
                resolve(vfx);
            });
        });
    }


    
    static getLightInstance() {
        const cache = game.Levels3DPreview.lights.lightCache;
        let light = null;
        if (cache.point.length) {
            light = cache.point.pop();
        }
        return light;
    }

    static returnLightInstances(object3d) {
        if (!object3d) return;
        const lights = [];
        object3d.traverse((child) => {
            if (child.isPointLight) {
                lights.push(child);
            }
        });

        const cache = game.Levels3DPreview.lights.lightCache;

        for (let light of lights) {
            light.position.set(-10000, -10000, -10000);
            cache.point.push(light);
            game.Levels3DPreview.scene.add(light);
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
        this.params.type = type ?? "projectile";
        this.params.type = this.shorthandCompatibility[this.params.type] ?? this.params.type;
        this.socket = socket;
        this.params.id = randomID(20);
    }

    get shorthandCompatibility() {
        return {
            "p": "projectile",
            "e": "explosion",
            "s": "sprite",
            "e": "explosion",
            "r": "ray",
        }
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
        //start = start.map((c) => new THREE.Color(c));
        //end = end.map((c) => new THREE.Color(c));
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
        const hasFrom = this._from && this._from.length;
        const hasTo = this._to && this._to.length;
        if ((!hasFrom && !hasTo) || !hasTo) {
            ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.fromto"));
            return false;
        }

        const requiresSourceTarget = PARTICLE_SYSTEMS.requiresSourceTarget(this.params.type);
        
        if(requiresSourceTarget && (!hasFrom || !hasTo)){
            ui.notifications.error(game.i18n.localize("levels3dpreview.errors.particleSystem.fromto"));
            return false;
        }
        
        //validate type
        const types = Object.keys(PARTICLE_SYSTEMS.ALL_PARTICLE_SYSTEMS);
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
        this._lightPiecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,1,1,0),0]]);
        this._missScale = 1;
        this.params = {...this.defaultSettings, ...params};
        this.setMeshSurface();
        this.autoSize();
        this.params.color.start = this.params.color.start.map(c => new THREE.Color(c));
        this.params.color.end = this.params.color.end.map(c => new THREE.Color(c));
        this._origin = this.inferPosition(from);
        this._target = this.inferPosition(to, true);
        this._duration = this.params.duration;
        this._rotation = new THREE.Euler(this.params.rotation[0], this.params.rotation[1], this.params.rotation[2]);
        this._up = new THREE.Vector3(this.params.up[0], this.params.up[1], this.params.up[2]);
        this.miss();
        this._time = 0;
        this._currentSpeed = 0;
        this.particleSystems = [];
        this._toDispose = [];
        this._persistObjects = [];
    }

    addLight(){}

    
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.3,
            emitterSize: 1,
        }
    }

    get rendererScale() {
        return 1;
    }

    async init() {
        this.createAnimationPath();
        await this.createEmitter();
        if (this.params.meshSurface) {
            this.resetMatrix(this.emitter);
            this.emitter.traverse(o => {
                this.resetMatrix(o);
            });
        }
        this.addLight();
        this.attach();
    }

    resetMatrix(object33d) {
        object33d.position.set(0, 0, 0);
        object33d.rotation.set(0, 0, 0);
        object33d.scale.set(1, 1, 1);
    }

    autoSize() {
        if (!this.params.autoSize) return;
        let hasSource = !!this.from && !(this instanceof BasePresetEffect) && !(this instanceof ExplosionParticle)
        if(!!this.from && this.AUTO_SIZE_FACTORS.preferSource) hasSource = true;
        let autosizeTarget;
        if (!hasSource) {
            const target = this.to;
            if (!(target instanceof Token)) return;
            autosizeTarget = target;
        } else {
            const source = this.from;
            if (!(source instanceof Token)) return;
            autosizeTarget = source;
        }
        const scale = (Math.max(autosizeTarget.document.width, autosizeTarget.document.height) * canvas.grid.size) / factor;
        this.params.scale.start = scale * this.AUTO_SIZE_FACTORS.scale;
        //this.params.scale.end = scale * this.AUTO_SIZE_FACTORS.scale;
        this.params.emitterSize = scale * this.AUTO_SIZE_FACTORS.emitterSize;
    }

    miss() {
        if (!this.params.miss) return;
        this._missScale *= 2 * (canvas.grid.size / factor);
        this._target.x += (Math.random() - 0.5) * this._missScale;
        this._target.y += (Math.random() - 0.5) * this._missScale;
        this._target.z += (Math.random() - 0.5) * this._missScale;
    }

    createAnimationPath() {
        const points = [];
        const origin = this.params.rotateTowards ? this._target : this._origin;
        const target = this.params.rotateTowards ? this._bottomTarget : this._target;
        if(!target || !origin) return;
        if(this.params.rotateTowards) target.y -= 1;
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

    attach() {
        if(!this.params.attach) return;
        const objectId = this.to.id;
        const object3D = game.Levels3DPreview.tokens[objectId].mesh;
        this._attachTarget = object3D;
    }

    async getBasicMaterial(filePath, blending = THREE.AdditiveBlending) {
        const path = filePath ?? this.params.sprite;
        const extension = path.split(".").pop();
        const isVideo = extension == "mp4" || extension == "webm" || extension == "ogg" || extension == "mov" || extension == "apng";
        

        const key = `${path}${blending}`;
        if (materialCache[key] && !isVideo) return materialCache[key];
        
        const tex = await game.Levels3DPreview.helpers.loadTexture(path);
        if (tex.image?.currentTime) tex.image.currentTime = 0;
        const material = new THREE.MeshBasicMaterial({
            map: tex,
            blending,
            transparent: true,
            side: THREE.DoubleSide,
            fog: true,
        });

        materialCache[key] = material;
        if(isVideo) this._toDispose.push(material);
        return material;
    }

    async getMesh(filePath, basicMaterial = true) {
        const model = await game.Levels3DPreview.helpers.loadModel(filePath ?? this.params.sprite);
        let mesh;
        if (model) {
            model.scene.traverse((child) => {
                if (child.isMesh) {
                    mesh = child;
                    child.userData.isParticle = true;
                }
            });
        }
        if (!basicMaterial) return model.model;
        
        mesh.material = new THREE.MeshBasicMaterial({
                map: mesh.material.map,
                fog: true,
        });
        return mesh;
    }

    setMeshSurface() {
        if(!this.params.meshSurface) return;
        if (!(this.to instanceof Tile)) return;
        const tile3d = game.Levels3DPreview.tiles[this.to.id];

        const mergedGeometry = tile3d.getMergedGeometry();
        const shape = new QUARKS.MeshSurfaceEmitter(mergedGeometry)
        this._meshSurface = shape;
    }

    async getCollision() {
        while (!game.Levels3DPreview._ready) { 
            await new Promise(r => setTimeout(r, 100));
        }

        const position = this._target.clone();
        const targetp = this._target.clone();
        targetp.y -= 99999;
        const collision = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(position, targetp, "collision", false, false, false, true);
        return collision[0]?.point?.y ?? this._target.y;
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
                start: ["#ff4d00"],
                end: ["#ffff00"],
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
            applyPresetLightOffset: false,
            onCenter: false,
            coneAngle: 0,
            attach: false,
        };
    }

    inferPosition(object, isTarget) {
        if (!object) return null;
        if (object.x !== undefined && object.y !== undefined && object.z !== undefined) {
            return Ruler3D.posCanvasTo3d(object);
        }
        if (object instanceof Token) {
            if (isTarget) {
                this._targetBottom = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            } else {
                this._originBottom = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            }
            this._missScale = Math.max(object.document.width, object.document.height) * object.document.scale;
            const tokenPos = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            if (isTarget) {
                tokenPos.y += game.Levels3DPreview.tokens[object.id].d * (Math.random() * 0.5 + 0.25);
                tokenPos.x += game.Levels3DPreview.tokens[object.id].w * ((Math.random() - 0.5) * 0.5);
                tokenPos.z += game.Levels3DPreview.tokens[object.id].h * ((Math.random() - 0.5) * 0.5);
                if (this.params.impactPoint) {
                    tokenPos.set(this.params.impactPoint.x, this.params.impactPoint.y, this.params.impactPoint.z)
                }
            } else {
                tokenPos.y += game.Levels3DPreview.tokens[object.id].d * 0.66;
            }
            let closest = null;
            const token3D = game.Levels3DPreview.tokens[object.id].model;
            if (token3D && isTarget) {
                try {
                    token3D.traverse((child) => {
                        if (child.isMesh) {
                            if(child.userData.isParticle) return;
                            if (!child.geometry.boundsTree) child.geometry.computeBoundsTree();
                            const closestToGeo = child.geometry.boundsTree.closestPointToPoint(tokenPos.clone().applyMatrix4(child.matrixWorld.clone().invert())).point.applyMatrix4(child.matrixWorld);
                            if (!closest || closestToGeo.distanceTo(tokenPos) < closest.distanceTo(tokenPos)) {
                                closest = closestToGeo;
                            }
                        }
                    });
                    if (closest) {
                        tokenPos.copy(closest);
                        if (this._origin) {
                            raycaster.set(this._origin, tokenPos.clone().sub(this._origin).normalize());
                            const collision = raycaster.intersectObject(token3D, true);
                            if (collision.length) {
                                tokenPos.copy(collision[0].point);
                            }
                        }
                        
                    }
                } catch (e) { }
            }
            this._bottomTarget = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            this._originalPosition = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            this._originalCenter = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            this._originalCenter.y += game.Levels3DPreview.tokens[object.id].d/2;
            this._bottomTarget.y -= game.Levels3DPreview.tokens[object.id].d;
            return tokenPos;
        }
        const z = object.document.getFlag("levels", "rangeBottom") ?? object.document.getFlag("levels", "elevation") ?? 0;
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
            p3d.params.impactPoint = {x: this.emitter.position.x, y: this.emitter.position.y, z: this.emitter.position.z}
            const isTargetOnly = Object.keys(PARTICLE_SYSTEMS.TARGET_ONLY_PARTICLE_SYSTEMS).includes(p3d.params.type);
            if (!p3d._from && !isTargetOnly) p3d.from(this.from);
            p3d.start(false);
        });
        this._toDispose.forEach((e) => {
            e.map.dispose();
            e.dispose()
        });
        this._persistObjects.forEach((o) => {
            if (this.to instanceof Token) {
                const token3D = game.Levels3DPreview.tokens[this.to.id];
                o.applyMatrix4(this.emitter.matrixWorld);
                o.removeFromParent();
                token3D.model.attach(o);
            }
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
        if (this._attachTarget) this.emitter.position.copy(this._attachTarget.position);
        if (this._light) this.animateLight(delta);
    }

    animateLight(delta) { }
}

class BasePresetEffect extends BaseParticleEffect {
    constructor (...args) {
        super(...args);
        if (this._originalPosition) this._target = this._originalPosition;
        if (this.params.onCenter && this._originalCenter) this._target = this._originalCenter;
        this._dist = null;
        this._speed = null;
        this._origin = null;
        this.isPreset = true;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: this.constructor.DEFAULT_SCALE,
            emitterSize: this.constructor.DEFAULT_EMITTER_SIZE*0.5,
        }
    }

    animate(delta) {
        super.animate(delta);
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class ProjectileParticle extends BaseParticleEffect {
    constructor(from, to, params) {
        super(from, to, params);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (this.params.speed / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this.isProjectile = true;
        this._effectDelay = 0;
        this._initialEffectDelay = 0.00001;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1.6,
            emitterSize: 0.1,
        }
    }

    addLight() {
        const light = ParticleEngine.getLightInstance();
        if (light) {
            this._light = light;
            this._lightIntensity = 10;
            light.decay = 2;
            light.intensity = 0;
            light.distance = 5;
            light.color = this.params.color.start[0];
            light.position.set(0,0,0);
            this.emitter.add(light);
        }
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
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                
                followLocalOrigin: true
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: Math.max(0.01, this.params.emitterSize)}),
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
            prewarm: false,
            
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                
                followLocalOrigin: true
            },
            followLocalOrigin: true,
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const embersData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min*3, this.params.life.max*3),
            startSpeed: new QUARKS.ConstantValue(0.05),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: false,
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 50),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/2}),
            material: await this.getBasicMaterial(),
            renderOrder: 20,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const turbulence = new THREE.Vector3(10,10,10)

        const trail = new QUARKS.ParticleSystem(trailData);

        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), 0]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        trail.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        trail.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence, turbulence));
        
        const tip = new QUARKS.ParticleSystem(sphereData);
        
        tip.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), 0]])));
        tip.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        tip.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        tip.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence,turbulence));

        const embers = new QUARKS.ParticleSystem(embersData);

        embers.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), 0]])));
        embers.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        embers.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        


        this.emitter.add(trail.emitter);
        this.emitter.add(tip.emitter);
        this.emitter.add(embers.emitter);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(trail, tip, embers);
    }

    animate(delta) {
        super.animate(delta);
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1) {
            this._playOnEnd = true;
            this.onEnd();
            return;
        }
        const point = this.animationPath.getPointAt(this._currentSpeed);
        this.emitter.lookAt(point);
        this.emitter.position.copy(point);
    }

    
    animateLight(delta) {
        super.animateLight(delta);
        this._light.intensity = this._lightIntensity * this._lightPiecewise.genValue(0.5*(this._currentSpeed + (1 - this._effectDelay/this._initialEffectDelay)));
    }
}

class BlackDart extends ProjectileParticle{

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 0.01,
        }
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
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: Math.max(0.01, this.params.emitterSize)}),
            material: await this.getBasicMaterial(),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const turbulence = new THREE.Vector3(10,10,10)

        const trail = new QUARKS.ParticleSystem(trailData);

        const blackTrail = new QUARKS.ParticleSystem(trailData);

        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        trail.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence, turbulence));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        blackTrail.startColor = new QUARKS.ConstantColor(colorToVec4(new THREE.Color("black"), 1));
        blackTrail.material = await this.getBasicMaterial(null, THREE.NormalBlending);
        blackTrail.startSize = new QUARKS.ConstantValue(this.params.scale.start * 0.5 * 0.3)
        blackTrail.renderOrder = 10

        blackTrail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        blackTrail.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        blackTrail.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence, turbulence));
 
        
        this.emitter.add(trail.emitter);
        this.emitter.add(blackTrail.emitter);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(trail, blackTrail);
    }
}

class MagicArrow extends ProjectileParticle{

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 0.01,
        }
    }

    async createEmitter() {

        const arrowModel = await this.getMesh("modules/levels-3d-preview/assets/particles/models/arrow_particle.glb");

        arrowModel.scale.setScalar(this.params.scale.start);

        const size = new THREE.Box3().setFromObject(arrowModel).getSize(new THREE.Vector3());

        this.emitter = new THREE.Group();
        const particleData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min*0.8*0.5, this.params.life.max*1.2*0.5),
            startSpeed: new QUARKS.IntervalValue(0.4, 0.6),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5*0.5),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5 * this.params.speed),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.0001, angle: Math.PI / 16}),
            material: await this.getBasicMaterial(),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5*0.5*0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                followLocalOrigin: true,
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.0001, angle: Math.PI / 4}),
            material: await this.getBasicMaterial(),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const turbulence = new THREE.Vector3(10,10,10)

        const trailParticles = new QUARKS.ParticleSystem(particleData);

        trailParticles.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trailParticles.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        
        trailParticles.emitter.position.z = -size.z / 3;
        
        const trail = new QUARKS.ParticleSystem(trailData);
        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        
        trail.emitter.position.z = -size.z / 3;
        
        this.emitter.add(trailParticles.emitter);
        this.emitter.add(trail.emitter);
        this._arrow = arrowModel;
        this._persistObjects.push(arrowModel);
        this.emitter.add(arrowModel);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(trailParticles,trail);
    }

    animate(delta) {
        this._arrow.rotation.z += delta * 10;
        this._arrow.material.color.lerpColors(this.params.color.start[0], this.params.color.end[0], this._currentSpeed);
        super.animate(delta);
    }
}

class Arrow extends ProjectileParticle{

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        }
    }

    addLight() { }

    animateLight() { }

    async createEmitter() {

        const arrowModel = await this.getMesh("modules/levels-3d-preview/assets/particles/models/arrow_particle_color.glb", false);

        arrowModel.scale.setScalar(this.params.scale.start);

       this.emitter = new THREE.Group();

        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5*0.5*0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(10),
                followLocalOrigin: true,
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.0001, angle: Math.PI / 4}),
            material: await this.getBasicMaterial(),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const trail = new QUARKS.ParticleSystem(trailData);
        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        
        //trail.emitter.position.z = -size.z / 3;
        
        this.emitter.add(trail.emitter);
        this._arrow = arrowModel;
        this._persistObjects.push(arrowModel);
        this.emitter.add(arrowModel);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(trail);
    }

    animate(delta) {
        this._arrow.rotation.z += delta * 10;
        super.animate(delta);
    }
}

class Bolt extends ProjectileParticle{

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        }
    }

    addLight() { }

    animateLight() { }

    async createEmitter() {

        const arrowModel = await this.getMesh("modules/levels-3d-preview/assets/particles/models/bolt_particle.glb", false);

        arrowModel.scale.setScalar(this.params.scale.start);

       this.emitter = new THREE.Group();

        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5*0.5*0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(10),
                followLocalOrigin: true,
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.0001, angle: Math.PI / 4}),
            material: await this.getBasicMaterial(),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const trail = new QUARKS.ParticleSystem(trailData);
        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        
        //trail.emitter.position.z = -size.z / 3;
        
        this.emitter.add(trail.emitter);
        this._arrow = arrowModel;
        this._persistObjects.push(arrowModel);
        this.emitter.add(arrowModel);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(trail);
    }

    animate(delta) {
        this._arrow.rotation.z += delta * 10;
        super.animate(delta);
    }
}

class Javelin extends ProjectileParticle{

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        }
    }

    addLight() { }

    animateLight() { }

    async createEmitter() {

        const arrowModel = await this.getMesh("modules/levels-3d-preview/assets/particles/models/javelin_particle.glb", false);

        arrowModel.scale.setScalar(this.params.scale.start);

       this.emitter = new THREE.Group();

        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5*0.5*0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(10),
                followLocalOrigin: true,
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.0001, angle: Math.PI / 4}),
            material: await this.getBasicMaterial(),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const trail = new QUARKS.ParticleSystem(trailData);
        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        
        //trail.emitter.position.z = -size.z / 3;
        
        this.emitter.add(trail.emitter);
        this._arrow = arrowModel;
        this._persistObjects.push(arrowModel);
        this.emitter.add(arrowModel);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(trail);
    }

    animate(delta) {
        this._arrow.rotation.z += delta * 10;
        super.animate(delta);
    }
}

class Bullet extends ProjectileParticle{

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        }
    }

    addLight() { }

    animateLight() { }

    async createEmitter() {

        const arrowModel = await this.getMesh("modules/levels-3d-preview/assets/particles/models/bullet.glb", false);

        arrowModel.scale.setScalar(this.params.scale.start);

       this.emitter = new THREE.Group();

        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.5*0.5*0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(10),
                followLocalOrigin: true,
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.0001, angle: Math.PI / 4}),
            material: await this.getBasicMaterial(),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const trail = new QUARKS.ParticleSystem(trailData);
        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        
        //trail.emitter.position.z = -size.z / 3;
        
        this.emitter.add(trail.emitter);
        this._arrow = arrowModel;
        this.emitter.add(arrowModel);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(trail);
    }

    animate(delta) {
        this._arrow.rotation.z += delta * 10;
        super.animate(delta);
    }
}

class Swing extends ProjectileParticle{

    constructor (...args) {
        super(...args);
        this.params.rotateTowards = true;
        this._maxduration = this.params.duration;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        }
    }

    addLight() { }

    animateLight() { }

    async createEmitter() {

        const model = await this.getMesh(null, false);

        model.scale.setScalar(this.params.scale.start);
        const box3 = new THREE.Box3().setFromObject(model)
        const weaponModel = new THREE.Group();
        weaponModel.add(model);
        const outerGroup = new THREE.Group();
        outerGroup.add(weaponModel);
        outerGroup.rotation.z = -Math.PI / 2 + Math.random() * (Math.PI);
        
       this.emitter = new THREE.Group();

        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(0.5, 0.7),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.33),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                followLocalOrigin: true,
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.scale.start*0.1}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_02.png"),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const trail = new QUARKS.ParticleSystem(trailData);
        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        
        this._sizePiecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,0.10016666412353516,1.4605379065236666,1.4785303661534257),0],[new QUARKS.Bezier(1.4785303661534257,1.5032568879077353,1.538933101357817,1.524796690915664),0.10799999237060547],[new QUARKS.Bezier(1.524796690915664,1.5362982459717474,0.06126674613115683,0.0016847146160523171),0.9267499923706055]]);
        this._rotationPiecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.1, 0.2, 0.3, 1), 0]]);
        //trail.emitter.position.z = -size.z / 3;
        trail.emitter.position.y = box3.max.y * 0.9;
        weaponModel.add(trail.emitter);
        this._weaponModel = weaponModel;
        this._trail = trail;
        this.emitter.add(outerGroup);
        this.emitter.position.copy(this._origin);
        this.emitter.lookAt(this._target);
        this.particleSystems.push(trail);
    }

    animate(delta) {
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        this._duration -= delta;
        if (this._duration < 0) {
            this.ended = true;
            return;
        }
        if (this._currentSpeed > 1 && !this._prematureEnding) {
            this._prematureEnding = true;
            this._playOnEnd = true;
            this.onEnd();
            this.ended = false;
        }
        this._weaponModel.scale.setScalar(this._sizePiecewise.genValue(1 - (this._duration / this._maxduration)));
        this._trail.paused = this._weaponModel.scale.x < 0.9 && this._currentSpeed < 1;
        if (this._currentSpeed > 1) {
            this._trail.looping = false;
            this._trail.duration = 0;
            this._trail.emissionOverDistance = new QUARKS.ConstantValue(0);
            this.emitter.attach(this._trail.emitter);
        }
        const point = this._origin; //this._origin.clone().lerp(this._target, this._currentSpeed);
        if(this._currentSpeed < 1) {
            this.emitter.position.copy(point);
            this._weaponModel.rotation.x = -Math.PI/3 + this._rotationPiecewise.genValue(this._currentSpeed) * Math.PI*0.8;
        }
    }
}

class Thrust extends ProjectileParticle{

    constructor (...args) {
        super(...args);
        this.params.rotateTowards = true;
        this._maxduration = this.params.duration;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        }
    }

    addLight() { }

    animateLight() { }

    async createEmitter() {

        const model = await this.getMesh(null, false);

        model.scale.setScalar(this.params.scale.start);
        const box3 = new THREE.Box3().setFromObject(model)
        const size = box3.getSize(new THREE.Vector3());
        this._moveAmount = size.y * 0.5;
        const weaponModel = new THREE.Group();
        weaponModel.add(model);
        weaponModel.rotation.x = Math.PI/2;
        weaponModel.rotation.y = Math.random() * Math.PI * 2;
        const outerGroup = new THREE.Group();
        outerGroup.add(weaponModel);
        //outerGroup.rotation.z = -Math.PI / 2 + Math.random() * (Math.PI);
        
       this.emitter = new THREE.Group();

        const trailData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(0.5, 0.7),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.33),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                followLocalOrigin: true,
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.scale.start*0.1}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_02.png"),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const trail = new QUARKS.ParticleSystem(trailData);
        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], this.params.alpha.start), colorToVec4(this.params.color.end[0], this.params.alpha.end))));
        
        this._sizePiecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,0.10016666412353516,1.4605379065236666,1.4785303661534257),0],[new QUARKS.Bezier(1.4785303661534257,1.5032568879077353,1.538933101357817,1.524796690915664),0.10799999237060547],[new QUARKS.Bezier(1.524796690915664,1.5362982459717474,0.06126674613115683,0.0016847146160523171),0.9267499923706055]]);
        this._rotationPiecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.1, 0.2, 0.3, 1), 0]]);
        //trail.emitter.position.z = -size.z / 3;
        trail.emitter.position.y = box3.max.y * 0.9;
        weaponModel.add(trail.emitter);
        this._weaponModel = weaponModel;
        this._trail = trail;
        this.emitter.add(outerGroup);
        const randomAngle = Math.random() * Math.PI * 2;
        this._origin.x += Math.cos(randomAngle) * this.params.scale.start * 0.5;
        this._origin.z += Math.sin(randomAngle) * this.params.scale.start * 0.5;
        this.emitter.position.copy(this._origin);
        this.emitter.lookAt(this._target);
        this.particleSystems.push(trail);
    }

    animate(delta) {
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        this._duration -= delta;
        if (this._duration < 0) {
            this.ended = true;
            return;
        }
        if (this._currentSpeed > 1 && !this._prematureEnding) {
            this._prematureEnding = true;
            this._playOnEnd = true;
            this.onEnd();
            this.ended = false;
        }
        this._weaponModel.scale.setScalar(this._sizePiecewise.genValue(1 - (this._duration / this._maxduration)));
        this._trail.paused = this._weaponModel.scale.x < 0.9 && this._currentSpeed < 1;
        if (this._currentSpeed > 1) {
            this._trail.looping = false;
            this._trail.duration = 0;
            this._trail.emissionOverDistance = new QUARKS.ConstantValue(0);
            this.emitter.attach(this._trail.emitter);
        }
        const point = this._origin; //this._origin.clone().lerp(this._target, this._currentSpeed);
        if(this._currentSpeed < 1) {
            this.emitter.position.copy(point);
            this._weaponModel.position.z = -this._moveAmount + this._moveAmount*this._rotationPiecewise.genValue(this._currentSpeed);
        }
    }
}
class Shotgun extends ProjectileParticle {

    constructor (...args) {
        super(...args);
        this._lightLifeMax = this.params.life.max*0.5;
        this._lightLife = this.params.life.max * 0.5;
        this._duration = this.params.life.max;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.2,
            emitterSize: 0,
        }
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const sparksData = {
            duration: 0.1,
            looping: false,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.speed),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: false,
            prewarm: true,
            speedFactor: 10,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
            },
            
            emissionBursts: [
                {
                    time: 0,
                    count: this.params.rate.particles,
                    cycle: 0,
                    interval: 0,
                    probability: 1,
                },
            ],

            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.00001, angle: Math.PI/12}),
            material: await this.getBasicMaterial(),
            renderOrder: 5,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
        };

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 0)), 0.822],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 0), colorToVec4(this.params.color.end[0], 0)),1],
            ]
        );

        const sparks = new QUARKS.ParticleSystem(sparksData);
        sparks.addBehavior(new QUARKS.ColorOverLife(gradient));

        this.emitter.add(sparks.emitter);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(sparks);
        this.emitter.lookAt(this._target);
    }

    animate(delta) {
        if(this._lightLife > 0 )this._lightLife -= delta;
        if(this._light) this.animateLight(delta);
        this._time += delta;
        this._duration -= delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1 || this._duration < 0) {
            this._playOnEnd = true;
            this.onEnd();
            return;
        }
    }

    animateLight(delta) {
        super.animateLight(delta);
        this._light.intensity = this._lightIntensity * this._lightPiecewise.genValue(1-(this._lightLife/this._lightLifeMax));
    }
}

class EarthProjectile extends ProjectileParticle {

    constructor (...args) { 
        super(...args);
        this._origin = this._originBottom
        this._target = this._targetBottom
    }

    addLight() { }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const collision = await this.getCollision();

        const rock1Mesh = await this.getMesh("modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_4.glb");
        const rock2Mesh = await this.getMesh("modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_3.glb");
        const smokeNormal = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/smoke9x9.png", THREE.NormalBlending);
        const debrisNormal = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/debris_2x2.png", THREE.NormalBlending);
        

        const rocks1Data = {
            duration: 1000000,
            looping: true,
            instancingGeometry: rock1Mesh.geometry,
            startLife: new QUARKS.IntervalValue(this.params.life.min * 0.8, this.params.life.max*1.2),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.IntervalValue(this.params.scale.start*0.2 * 0.5, this.params.scale.start*0.2 * 1.5),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.EulerGenerator(new QUARKS.IntervalValue(-Math.PI/1.5, -Math.PI/2.5), new QUARKS.IntervalValue(0, 2* Math.PI), new QUARKS.ConstantValue(0)),
            worldSpace: true,
            prewarm: false,
            
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0, angle: Math.PI / 2}),
            material: rock1Mesh.material,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Mesh,
        };

        const gradient2 = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.0314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 0)), 0.522],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 0), colorToVec4(this.params.color.end[0], 0)),1],
            ]
            );
        const piecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,0.10016666412353516,1.4605379065236666,1.4785303661534257),0],[new QUARKS.Bezier(1.4785303661534257,1.5032568879077353,1.538933101357817,1.524796690915664),0.10799999237060547],[new QUARKS.Bezier(1.524796690915664,1.5362982459717474,0.06126674613115683,0.0016847146160523171),0.9267499923706055]]);

        const rocks1 = new QUARKS.ParticleSystem(rocks1Data);
        rocks1.emitter.rotation.x = Math.PI / 2;
        rocks1.emitter.position.y -= 0.05
        rocks1.addBehavior(new QUARKS.SizeOverLife(piecewise));
        //rocks1.addBehavior(new QUARKS.ColorOverLife(gradient2));

        const rocks2Data = {...rocks1Data, instancingGeometry: rock2Mesh.geometry, material: rock2Mesh.material};

        const rocks2 = new QUARKS.ParticleSystem(rocks2Data);
        rocks2.emitter.rotation.x = Math.PI / 2;
        rocks2.emitter.position.y -= 0.05



        rocks2.addBehavior(new QUARKS.SizeOverLife(piecewise));
        //rocks2.addBehavior(new QUARKS.ColorOverLife(gradientAlpha));

        const smokeData = {
            duration: 1/this.params.rate.particles,
            looping: true,
            startLife: new QUARKS.IntervalValue(1,2),
            startSpeed: new QUARKS.ConstantValue(0.05),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.3),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 0.5)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: false,
            emissionOverTime: new QUARKS.ConstantValue(0),
            emissionBursts: [
                {
                    time: 0,
                    count: 20,
                    cycle: 0,
                    interval: 0,
                    probability: 1,
                },
            ],
        
            shape: this._meshSurface ?? new QUARKS.DonutEmitter({radius: this.params.scale.start*0.3, angle: Math.PI / 2}),
            material: smokeNormal,
            startTileIndex: new QUARKS.IntervalValue(0, 8),
            uTileCount: 3,
            vTileCount: 3,
            renderOrder: 20,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const smoke = new QUARKS.ParticleSystem(smokeData);
        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.end[0], 1)), 0.0314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
            //smoke.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(0.05), new THREE.Vector3(0, 0, 1)));
            //smoke.addBehavior(new QUARKS.Noise(new THREE.Vector3(0.1, 0.01, 0.1), new THREE.Vector3(0.01, 0.01, 0.01)));
            const burst = smoke.clone();
        smoke.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        smoke.addBehavior(new QUARKS.ColorOverLife(gradient2));
        smoke.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.05)));
        smoke.addBehavior(new QUARKS.RotationOverLife(new QUARKS.ConstantValue(0.1)));
        smoke.emitter.rotation.x = -Math.PI / 2;
        


        burst.renderMode = QUARKS.RenderMode.BillBoard;
        burst.startSpeed = new QUARKS.IntervalValue(0.2,0.4);
        burst.startSize = new QUARKS.IntervalValue(this.params.scale.start * 0.03, this.params.scale.start * 0.06);
        burst.startLife = new QUARKS.ConstantValue(3);
        burst.startColor = new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1));
        burst.startRotation = new QUARKS.IntervalValue(0, Math.PI * 2);
        burst.material = debrisNormal;
        burst.emissionBursts = [
            {
                time: (1/this.params.rate.particles)*0.8,
                count: 20,
                cycle: 0,
                interval: 0,
                probability: 1,
            },
        ],
        burst.uTileCount = 2;
        burst.vTileCount = 2;
        burst.startTileIndex = new QUARKS.IntervalValue(0, 3);
        burst.shape = new QUARKS.ConeEmitter({radius: this.params.scale.start*0.3, angle: Math.PI / 2});
        burst.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, -1, 0), new QUARKS.ConstantValue(0.9)));
        burst.addBehavior(new QUARKS.RotationOverLife(new QUARKS.ConstantValue(1)));
        burst.addBehavior(new QUARKS.ColorOverLife(gradient2));
        burst.addBehavior(
            new QUARKS.ApplyCollision(
                {
                    resolve(pos, normal) {
                        if (pos.y <= collision) {
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

        this.emitter.add(rocks1.emitter);
        this.emitter.add(rocks2.emitter);
        this.emitter.add(smoke.emitter);
        this.emitter.add(burst.emitter);
        this.emitter.position.copy(this._origin);
        this.particleSystems.push(rocks1, rocks2, smoke, burst);
    }
}

class RunicShot extends ProjectileParticle {
    constructor (from, to, params) {
        super(from, to, params);
        const frontPos = this._origin.clone().sub(this._target).normalize().multiplyScalar(-this.tokenRadius);
        this._origin.add(frontPos);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (this.params.speed / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this._duration = Math.max(this.params.duration, 0);
        this._effectDelay = this._duration;
        this._initialEffectDelay = this._duration; 
        this.isProjectile = true;
    }
    
    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.0001,
        }
    }

    get tokenRadius() {
        if (!this.from instanceof Token) return 0;
        return (Math.max(this.from.document.width, this.from.document.height) / 2) * canvas.grid.size / factor;
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
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                
                followLocalOrigin: true
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: Math.max(0.01, this.params.emitterSize)}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png"),
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
            prewarm: false,
            
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                
                followLocalOrigin: true
            },
            followLocalOrigin: true,
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png"),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const embersData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min*3, this.params.life.max*3),
            startSpeed: new QUARKS.ConstantValue(0.05),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: false,
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles * 50),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize, angle: Math.PI/2}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png"),
            renderOrder: 20,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const turbulence = new THREE.Vector3(10,10,10)

        const trail = new QUARKS.ParticleSystem(trailData);

        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        trail.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        trail.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        trail.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence, turbulence));
        
        const tip = new QUARKS.ParticleSystem(sphereData);
        
        tip.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), 0]])));
        tip.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        tip.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        tip.addBehavior(new QUARKS.TurbulenceField(turbulence, 1, turbulence,turbulence));

        const embers = new QUARKS.ParticleSystem(embersData);

        embers.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), 0]])));
        embers.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        embers.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        
        const runeData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(this.params.duration*1.5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            startRotation: new QUARKS.IntervalValue(0, 2*Math.PI),
            worldSpace: true,
            prewarm: true,
            instancingGeometry: new THREE.PlaneGeometry(1,1),
            
            emissionBursts: [
                {
                    time: 0,
                    count: 1,
                    cycleCount: 1,
                    interval: 0,
                    probability: 0,
                },
                {
                    time: 0.01,
                    count: 1,
                    cycleCount: 1,
                    interval: 0,
                    probability: 1,
                }
            ],
            
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.000000001, angle: 0.000001}),
            material: await this.getBasicMaterial(),
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.Mesh,
        };

        
        this._duration = runeData.material?.map?.image?.duration ?? this._duration;
        if (runeData.material?.map?.image?.duration) {
            this._initialEffectDelay = this._duration*0.9;
            this._effectDelay = this._duration*0.9;
            runeData.startLife = new QUARKS.ConstantValue(this._duration);
        }


        const rune = new QUARKS.ParticleSystem(runeData);

       const piecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,0.10016666412353516,1.4605379065236666,1.4785303661534257),0],[new QUARKS.Bezier(1.4785303661534257,1.5032568879077353,1.538933101357817,1.524796690915664),0.10799999237060547],[new QUARKS.Bezier(1.524796690915664,1.5362982459717474,0.06126674613115683,0.0016847146160523171),0.9267499923706055]]);

        rune.addBehavior(new QUARKS.SizeOverLife(piecewise));
        rune.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1))));
        rune.addBehavior(new QUARKS.Rotation3DOverLife(new QUARKS.AxisAngleGenerator(new THREE.Vector3(0,0,1), new QUARKS.ConstantValue(1), true)));


        this.emitter.add(trail.emitter);
        this.emitter.add(tip.emitter);
        this.emitter.add(embers.emitter);
        this.emitter.add(rune.emitter);
        this.emitter.position.copy(this._origin);
        rune.emitter.lookAt(this._target);
        this.particleSystems.push(trail, tip, embers, rune);
    }

    animate(delta) {
        if(this._effectDelay > 0) this._effectDelay -= delta;
        if(this._effectDelay > 0) return;
        this._duration -= delta;
        if (!this.animationPath) return;
        if(this._light) this.animateLight(delta);
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
        if (this._currentSpeed > 1) {
            this._playOnEnd = true;
            this.onEnd();
            return;
        }
        if (this._currentSpeed <= 1) {            
            const point = this.params.rotateTowards ? this._origin : this.animationPath.getPointAt(this._currentSpeed);
            this.emitter.lookAt(point);
            this.emitter.position.copy(point);
        }
    }
}

class ExplosionParticle extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this.isExplosion = true;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.35,
            emitterSize: 4,
        }
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const mainExplosionData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.force/30),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor:new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const innerFlashData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(this.params.force/9),
            startSize: new QUARKS.IntervalValue(this.params.scale.start/5, this.params.scale.start/10),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: false,
            prewarm: false,
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
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize/4}),
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
        innerFlash.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, -1), new QUARKS.ConstantValue(1)));
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
        super.animate(delta);
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class JB2AExplosion extends ExplosionParticle {

    constructor (...args) {
        super(...args);
        this._lightTime = 0.3;
        this._initialLightTime = 0.3;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 4,
        }
    }

    addLight() {
        const light = ParticleEngine.getLightInstance();
        if (light) {
            this._light = light;
            this._lightIntensity = 10;
            light.decay = 2;
            light.intensity = 0;
            light.distance = 5;
            light.color = this.params.color.start[0];
            light.position.set(0,0,0);
            this.emitter.add(light);
        }
    }

    animateLight(delta) {
        super.animateLight(delta);
        this._light.intensity = this._lightIntensity * this._lightPiecewise.genValue(this._lightTime / this._initialLightTime);
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const burstData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(0.2),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionBursts: [
                {
                time: 0.01,
                count: 1,
                cycle: 1,
                interval: 0,
                probability: 1,
            }],
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(null, THREE.AdditiveBlending),
            renderOrder: 1,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        this._duration = burstData.material?.map?.image?.duration ?? this._duration;

        burstData.startLife = new QUARKS.ConstantValue(this._duration);

        this._material = burstData.material;
        const burst = new QUARKS.ParticleSystem(burstData);
        //burst.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1,2), colorToVec4(this.params.color.end[0], 0, 2))));
        
        this.emitter.add(burst.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(burst);
    }

    animate(delta) {
        if (this._lightTime > 0) this._lightTime -= delta;
        super.animate(delta);
    }
}

class JB2AExplosionNoLight extends ExplosionParticle {

    constructor (...args) {
        super(...args);
        this._lightTime = 0.3;
        this._initialLightTime = 0.3;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 4,
        }
    }

    addLight() {
    }

    animateLight(delta) {}

    async createEmitter() {
        this.emitter = new THREE.Group();

        const burstData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(0.2),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionBursts: [
                {
                time: 0.01,
                count: 1,
                cycle: 1,
                interval: 0,
                probability: 1,
            }],
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(null, THREE.AdditiveBlending),
            renderOrder: 1,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        this._duration = burstData.material?.map?.image?.duration ?? this._duration;

        burstData.startLife = new QUARKS.ConstantValue(this._duration);

        this._material = burstData.material;
        const burst = new QUARKS.ParticleSystem(burstData);
        //burst.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1,2), colorToVec4(this.params.color.end[0], 0, 2))));
        
        this.emitter.add(burst.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(burst);
    }
}

class CastingSign extends ExplosionParticle {

    constructor (...args) {
        super(...args);
        this._lightTime = 0.3;
        this._initialLightTime = 0.3;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.85,
            emitterSize: 4,
            preferSource: true,
        }
    }

    addLight() {
        const light = ParticleEngine.getLightInstance();
        if (light) {
            this._light = light;
            this._lightIntensity = 10;
            light.decay = 2;
            light.intensity = 0;
            light.distance = 5;
            light.color = this.params.color.start[0];
            light.position.set(0,0,0);
            this.emitter.add(light);
        }
    }

    animateLight(delta) {
        super.animateLight(delta);
        this._light.intensity = this._lightIntensity * this._lightPiecewise.genValue(this._lightTime / this._initialLightTime);
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const burstData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(this.params.duration*1.5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            startRotation: new QUARKS.IntervalValue(0, 2*Math.PI),
            worldSpace: true,
            prewarm: true,
            instancingGeometry: new THREE.PlaneGeometry(1,1),
            
            emissionBursts: [
                {
                    time: 0,
                    count: 1,
                    cycleCount: 1,
                    interval: 0,
                    probability: 0,
                },
                {
                    time: 0.01,
                    count: 1,
                    cycleCount: 1,
                    interval: 0,
                    probability: 1,
                }
            ],
            
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.000000001, angle: 0.000001}),
            material: await this.getBasicMaterial(),
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.Mesh,
        };



        this._duration = burstData.material?.map?.image?.duration ?? this._duration;
        this._lightTime = this._duration;
        this._initialLightTime = this._duration;

        this.isAAnimated = burstData.material?.map?.image?.duration;

        burstData.startLife = new QUARKS.ConstantValue(this._duration);

        this._material = burstData.material;
        const burst = new QUARKS.ParticleSystem(burstData);
        burst.emitter.rotation.x = Math.PI / 2;
        burst.emitter.position.y = 0.001;
        if (!this.isAAnimated) {
            const piecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,0.10016666412353516,1.4605379065236666,1.4785303661534257),0],[new QUARKS.Bezier(1.4785303661534257,1.5032568879077353,1.538933101357817,1.524796690915664),0.10799999237060547],[new QUARKS.Bezier(1.524796690915664,1.5362982459717474,0.06126674613115683,0.0016847146160523171),0.9267499923706055]]);

            burst.addBehavior(new QUARKS.SizeOverLife(piecewise));
            burst.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1))));
        }
        burst.addBehavior(new QUARKS.Rotation3DOverLife(new QUARKS.AxisAngleGenerator(new THREE.Vector3(0,0,1) , new QUARKS.ConstantValue(this.params.speed), true)));
        
        this.emitter.add(burst.emitter);
        this.emitter.position.copy(this._originBottom ?? this._targetBottom);
        this.particleSystems.push(burst);
    }

    animate(delta) {
        if (this._lightTime > 0) this._lightTime -= delta;
        super.animate(delta);
    }
}

class Lightning extends ExplosionParticle {

    constructor (...args) {
        super(...args);
        this._lightTime = 0.3;
        this._initialLightTime = 0.3;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.85,
            emitterSize: 1,
        }
    }

    addLight() {
        const light = ParticleEngine.getLightInstance();
        if (light) {
            this._light = light;
            this._lightIntensity = 10;
            light.decay = 2;
            light.intensity = 0;
            light.distance = 5;
            light.color = this.params.color.start[0];
            light.position.set(0,0,0);
            this.emitter.add(light);
        }
    }

    animateLight(delta) {
        super.animateLight(delta);
        this._light.intensity = this._lightIntensity * this._lightPiecewise.genValue(this._lightTime / this._initialLightTime);
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const plane = new THREE.PlaneGeometry(1,5);

        const burstData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(this.params.duration*1.5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*2),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.EulerGenerator(new QUARKS.ConstantValue(0), new QUARKS.IntervalValue(0, 2 * Math.PI), new QUARKS.ConstantValue(0)),
            worldSpace: false,
            prewarm: false,
            instancingGeometry: new THREE.PlaneGeometry(1,1),
            
            
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles/5),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.000000001, angle: 0.000001}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/spark_02.png"),
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.Mesh,
        };

        const bangData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(0.2),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(8 * this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionBursts: [
                {
                time: 0.01,
                count: 1,
                cycle: 1,
                interval: 0,
                probability: 1,
            }],
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/spark_02.png"),
            renderOrder: 1,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const lightningData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(0.1, 0.2),
            startSpeed: new QUARKS.ConstantValue(10),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*4),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            startRotation: new QUARKS.EulerGenerator(new QUARKS.ConstantValue(Math.PI/2), new QUARKS.IntervalValue(0, 2*Math.PI), new QUARKS.ConstantValue(0)),
            worldSpace: true,
            prewarm: true,
            instancingGeometry: plane,
            
            emissionBursts: [
                {
                    time: 0,
                    count: 1,
                    cycleCount: 1,
                    interval: 0,
                    probability: 0,
                },
                {
                    time: 0.01,
                    count: 0,
                    cycleCount: 1,
                    interval: 0,
                    probability: 1,
                }
            ],
            
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles*2),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize * 0.2, angle: 0.000001}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/lightning_4x4.png"),
            uTileCount: 2,
            vTileCount: 2,
            startTileIndex: new QUARKS.IntervalValue(0, 3),
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.Mesh,
        };

        const lightningData2 = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(0.1, 0.2),
            startSpeed: new QUARKS.ConstantValue(0.5),
            startSize: new QUARKS.IntervalValue(this.params.scale.start*2 ,this.params.scale.start*3),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            startRotation: new QUARKS.IntervalValue(0, 2*Math.PI),
            worldSpace: false,
            prewarm: false,
            speedFactor: 0.5,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(100),
            },
            
            emissionBursts: [
                {
                    time: 0,
                    count: 1,
                    cycleCount: 1,
                    interval: 0,
                    probability: 0,
                },
                {
                    time: 0.01,
                    count: 0,
                    cycleCount: 1,
                    interval: 0,
                    probability: 1,
                }
            ],
            
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.0001, angle: Math.PI/4}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/spark_02.png"),
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const innerFlashData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(0.4, 0.6),
            startSpeed: new QUARKS.IntervalValue(0.3,0.6),
            startSize: new QUARKS.IntervalValue(0.02, 0.04),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 0.7)),
            startRotation: new QUARKS.IntervalValue(0, 2*Math.PI),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(10),
            },
            emissionOverTime: new QUARKS.ConstantValue(0),
            emissionBursts: [{
                time: 0,
                count: this.params.rate.particles*5,
                cycle: 1,
                interval: 0.01,
                probability: 1,
            }],
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/trace_04.png"),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.BillBoard,
        };


        this._duration = burstData.material?.map?.image?.duration ?? this._duration;
        this._lightTime = this._duration;
        this._initialLightTime = this._duration;

        this.isAAnimated = burstData.material?.map?.image?.duration;

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 0)), 0.822],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 0), colorToVec4(this.params.color.end[0], 0)),1],
            ]
        );
        
        const gradient2 = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.end[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 0)), 0.822],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 0), colorToVec4(this.params.color.end[0], 0)),1],
            ]
        );
        
        burstData.startLife = new QUARKS.ConstantValue(this._duration);

        this._material = burstData.material;
        const burst = new QUARKS.ParticleSystem(burstData);
        burst.emitter.rotation.x = - Math.PI / 2;
        burst.emitter.position.y = 0.001
        const piecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,0.10016666412353516,1.4605379065236666,1.4785303661534257),0],[new QUARKS.Bezier(1.4785303661534257,1.5032568879077353,1.538933101357817,1.524796690915664),0.10799999237060547],[new QUARKS.Bezier(1.524796690915664,1.5362982459717474,0.06126674613115683,0.0016847146160523171),0.9267499923706055]]);

        burst.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.95, 0.95, 1), 0]])));
        burst.addBehavior(new QUARKS.ColorOverLife(gradient));
        //burst.addBehavior(new QUARKS.Rotation3DOverLife(new QUARKS.AxisAngleGenerator(new THREE.Vector3(0,0,1) , new QUARKS.ConstantValue(this.params.speed), true)));
        

        const lightning = new QUARKS.ParticleSystem(lightningData);
        lightning.addBehavior(new QUARKS.ColorOverLife(gradient));

        const lighting2 = new QUARKS.ParticleSystem(lightningData2);
        lighting2.addBehavior(new QUARKS.ColorOverLife(gradient));
        lighting2.emitter.rotation.x = - Math.PI / 2;
      
        lightning.emitter.rotation.x = Math.PI / 2;
        lightning.emitter.position.y = this.params.scale.start * 2 * 5 + 1;

        const bang = new QUARKS.ParticleSystem(bangData);
        bang.emitter.rotation.x = Math.PI / 2;
        bang.addBehavior(new QUARKS.ColorOverLife(gradient));
        bang.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.95, 0.95, 1), 0]])));
        
        const flash = new QUARKS.ParticleSystem(innerFlashData)
        flash.emitter.rotation.x = Math.PI / 2;
        flash.addBehavior(new QUARKS.ColorOverLife(gradient2));
        flash.addBehavior(new QUARKS.SpeedOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0, 0, 0), 0]])));

        this.emitter.add(burst.emitter);
        this.emitter.add(lightning.emitter);
        this.emitter.add(lighting2.emitter);
        this.emitter.add(bang.emitter);
        this.emitter.add(flash.emitter);
        this.emitter.position.copy(this._targetBottom);
        this.particleSystems.push(burst, lightning, lighting2, bang, flash);
    }

    animate(delta) {
        if (this._lightTime > 0) this._lightTime -= delta;
        super.animate(delta);
    }
}

class SlashParticle extends ExplosionParticle{

    autoSize() {
        const from = this.from;
        if (!(from instanceof Token)) return;
        const size = Math.max(from.document.width, from.document.height) * (canvas.grid.size / factor);
        this.params.emitterSize = 0.7 * size;
        if (!this.params.autoSize) return;
        this.params.scale.start = 0.7;
    }

    async createEmitter() {
        
        this.emitter = new THREE.Group();
        const trailData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(0.18),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*2),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: false,
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(60),
            },
            
            emissionBursts: [
                {
                    time: 0,
                    count: 3,
                    cycle: 0,
                    interval: 0,
                    probability: 1,
                },
            ],

            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.DonutEmitter({radius: 1, arc: 0.000001, thickness: 1}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const sparkData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(0.1),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*2),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, 2*Math.PI),
            worldSpace: false,
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(60),
            },
            
            emissionBursts: [
                {
                    time: 0.075,
                    count: 1,
                    cycle: 0,
                    interval: 0,
                    probability: 1,
                },
            ],

            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter(),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/star_07.png"),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const sparksData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(0.15),
            startSpeed: new QUARKS.ConstantValue(5),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: false,
            prewarm: false,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(60),
            },
            
            emissionBursts: [
                {
                    time: 0.075,
                    count: 20,
                    cycle: 0,
                    interval: 0,
                    probability: 1,
                },
            ],

            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.1, angle: Math.PI/2}),
            material: await this.getBasicMaterial(),
            renderOrder: 5,
            renderMode: QUARKS.RenderMode.Trail,
        };


        const trail = new QUARKS.ParticleSystem(trailData);
        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 0)), 0.822],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 0), colorToVec4(this.params.color.end[0], 0)),1],
            ]
        );

        trail.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.5, 0.5, 0), 0]])));
        trail.addBehavior(new QUARKS.OrbitOverLife( new QUARKS.ConstantValue(30), new THREE.Vector3(0, 0, 1)));
        
        
        trail.addBehavior(new QUARKS.ColorOverLife(gradient));
        
        trail.emitter.rotation.x = -Math.PI / 2;
        trail.emitter.rotation.z = +Math.PI / 2;
        trail.emitter.rotation.y = Math.random > 0.5 ? Math.PI : 0//Math.random() * Math.PI * 2;
        trail.emitter.rotation.y += Math.random() * Math.PI/2 - Math.PI/4;
        
        const trail2 = new QUARKS.ParticleSystem(trailData);
        trail2.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.5, 0.5, 0), 0]])));
        trail2.addBehavior(new QUARKS.OrbitOverLife( new QUARKS.ConstantValue(30), new THREE.Vector3(0, 0, 1)));
        
        trail2.material = await this.getBasicMaterial(null, THREE.NormalBlending);
        trail2.renderOrder = 0;
        trail2.startColor = new QUARKS.ConstantColor(new THREE.Vector4(0, 0, 0, 0.5))
        trail2.startSize = new QUARKS.ConstantValue(this.params.scale.start * 2.5);
        trail2.emitter.rotation.set(trail.emitter.rotation.x, trail.emitter.rotation.y, trail.emitter.rotation.z);

        const spark = new QUARKS.ParticleSystem(sparkData);
        spark.addBehavior(new QUARKS.ColorOverLife(gradient));
        spark.addBehavior(new QUARKS.RotationOverLife(new QUARKS.ConstantValue(1), true))
        spark.emitter.rotation.copy(trail.emitter.rotation);
        spark.emitter.position.z = 1;

        const sparks = new QUARKS.ParticleSystem(sparksData);
        sparks.addBehavior(new QUARKS.ColorOverLife(gradient));
        sparks.emitter.rotation.copy(trail.emitter.rotation);
        sparks.emitter.rotation.x += Math.PI / 2;
        sparks.emitter.position.z = 1;

        this.emitter.add(trail.emitter);
        this.emitter.add(trail2.emitter);
        this.emitter.add(spark.emitter);
        this.emitter.add(sparks.emitter);
        this.emitter.position.copy(this._origin);
        this.emitter.lookAt(this._target);
        this.emitter.scale.multiplyScalar(this.params.emitterSize);
        this.particleSystems.push(trail, trail2, spark, sparks);
    }

    animate(delta) {
        super.animate(delta);
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class EarthExplosion extends ExplosionParticle {

    constructor (...args) { 
        super(...args);
        this._origin = this._originBottom
        this._target = this._targetBottom
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 2,
            emitterSize: 4,
        }
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const rock1Mesh = await this.getMesh("modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_4.glb");
        const rock2Mesh = await this.getMesh("modules/canvas3dcompendium/assets/Tiles/Stylized%20Trees/Rock_3.glb");
        const smokeNormal = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/smoke9x9.png", THREE.NormalBlending);


        const rocks1Data = {
            duration: 0.1,
            looping: true,
            instancingGeometry: rock1Mesh.geometry,
            startLife: new QUARKS.IntervalValue(this.params.life.min, this.params.life.max),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.IntervalValue(this.params.scale.start*0.2 * 0.5, this.params.scale.start*0.2 * 1.5),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.EulerGenerator(new QUARKS.IntervalValue(-Math.PI, 0), new QUARKS.IntervalValue(0, 2* Math.PI), new QUARKS.ConstantValue(0)),
            worldSpace: false,
            prewarm: false,
            emissionBursts: [{
                time: 0,
                count: this.params.rate.particles*5,
                cycle: 1,
                interval: 0.01,
                probability: 1,
            }],
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0, angle: Math.PI / 2}),
            material: rock1Mesh.material,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Mesh,
        };

        const gradientAlpha = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(1, 1, 1, 1)), 0],
                [new QUARKS.ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(1, 1, 1, 1)), 0.0314],
                [new QUARKS.ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(1, 1, 1, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(1, 1, 1, 0), new THREE.Vector4(1, 1, 1, 0)),1],
            ]
            );
            const piecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,0.10016666412353516,1.4605379065236666,1.4785303661534257),0],[new QUARKS.Bezier(1.4785303661534257,1.5032568879077353,1.538933101357817,1.524796690915664),0.10799999237060547],[new QUARKS.Bezier(1.524796690915664,1.5362982459717474,0.06126674613115683,0.0016847146160523171),0.9267499923706055]]);

        const rocks1 = new QUARKS.ParticleSystem(rocks1Data);
        rocks1.emitter.rotation.x = Math.PI / 2;
        rocks1.emitter.position.y -= 0.05
        rocks1.addBehavior(new QUARKS.SizeOverLife(piecewise));
        
        const rocks2Data = {...rocks1Data, instancingGeometry: rock2Mesh.geometry, material: rock2Mesh.material};

        const rocks2 = new QUARKS.ParticleSystem(rocks2Data);
        rocks2.emitter.rotation.x = Math.PI / 2;
        rocks2.emitter.position.y -= 0.05
        rocks2.addBehavior(new QUARKS.SizeOverLife(piecewise));

        const smokeData = {
            duration: 1/this.params.rate.particles,
            looping: true,
            startLife: new QUARKS.ConstantValue(1),
            startSpeed: new QUARKS.ConstantValue(0.2),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*1),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            emissionOverTime: new QUARKS.ConstantValue(0),
            emissionBursts: [
                {
                    time: 0,
                    count: 20,
                    cycle: 0,
                    interval: 0,
                    probability: 1,
                },
            ],
        
            shape: this._meshSurface ?? new QUARKS.DonutEmitter({radius: 0, angle: Math.PI / 2}),
            material: smokeNormal,
            startTileIndex: new QUARKS.IntervalValue(0, 8),
            uTileCount: 3,
            vTileCount: 3,
            renderOrder: 20,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const smoke = new QUARKS.ParticleSystem(smokeData);
        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.end[0], 1)), 0.0314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
        smoke.addBehavior(new QUARKS.ColorOverLife(gradient));
        smoke.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        //smoke.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(0.05), new THREE.Vector3(0, 0, 1)));
        //smoke.addBehavior(new QUARKS.Noise(new THREE.Vector3(0.1, 0.01, 0.1), new THREE.Vector3(0.01, 0.01, 0.01)));
        smoke.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.02)));
        smoke.addBehavior(new QUARKS.RotationOverLife(new QUARKS.ConstantValue(0.1)));
        smoke.emitter.rotation.x = -Math.PI / 2;
        

        this.emitter.add(rocks1.emitter);
        this.emitter.add(rocks2.emitter);
        this.emitter.add(smoke.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(rocks1, rocks2, smoke);
    }
}

class MagicBurst extends ExplosionParticle {

    constructor (...args) {
        super(...args);
        this._lightTime = 0.3;
        this._initialLightTime = 0.3;
    }

    addLight() {
        const light = ParticleEngine.getLightInstance();
        if (light) {
            this._light = light;
            this._lightIntensity = 10;
            light.decay = 2;
            light.intensity = 0;
            light.distance = 5;
            light.color = this.params.color.start[0];
            light.position.set(0,0,0);
            this.emitter.add(light);
        }
    }

    animateLight(delta) {
        super.animateLight(delta);
        this._light.intensity = this._lightIntensity * this._lightPiecewise.genValue(this._lightTime / this._initialLightTime);
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const mainExplosionData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.IntervalValue(this.params.life.min*0.7, this.params.life.max*1.3),
            startSpeed: new QUARKS.ConstantValue(0.1),
            startSize: new QUARKS.IntervalValue(this.params.scale.start * 0.7, this.params.scale.start * 1.3),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            /*emissionBursts: [
                {
                    time: 0,
                    count: this.params.rate.particles*5,
                    cycle: 1,
                    interval: 0,
                    probability: 0
                },
                {
                time: 0.01,
                count: this.params.rate.particles*5,
                cycle: 1,
                interval: 0,
                probability: 1,
            }],*/
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles*25),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize*0.1}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame2x2.png"),
            startTileIndex: new QUARKS.IntervalValue(0, 3),
            uTileCount: 2,
            vTileCount: 2,      
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const burstData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(0.2),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(2),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionBursts: [
                {
                time: 0.01,
                count: 1,
                cycle: 1,
                interval: 0,
                probability: 1,
            }],
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/light_03.png"),
            renderOrder: 1,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const innerFlashData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(1.4, 1.6),
            startSpeed: new QUARKS.IntervalValue(0.3,0.6),
            startSize: new QUARKS.IntervalValue(0.01, 0.02),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(10),
            },
            emissionOverTime: new QUARKS.ConstantValue(0),
            emissionBursts: [{
                time: 0,
                count: this.params.rate.particles*5,
                cycle: 1,
                interval: 0.01,
                probability: 1,
            }],
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/emberssmall.png"),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const innerGlowData = {...innerFlashData}
        innerGlowData.startSpeed = new QUARKS.ConstantValue(this.params.force / 5);
        innerGlowData.startSize = new QUARKS.IntervalValue(this.params.scale.start / 10, this.params.scale.start / 20);
        innerGlowData.renderMode = QUARKS.RenderMode.BillBoard;
        


        const turbulence = new THREE.Vector3(1,1,1)

        const mainExplosion = new QUARKS.ParticleSystem(mainExplosionData);


        mainExplosion.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.95, 0.95, 1), 0]])));
        mainExplosion.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],2), colorToVec4(this.params.color.end[0],2))));
        mainExplosion.addBehavior(new QUARKS.TurbulenceField(turbulence, new QUARKS.ConstantValue(10), turbulence, turbulence));
        mainExplosion.addBehavior(new QUARKS.RotationOverLife(new QUARKS.IntervalValue(0, 0.5 * Math.PI), true));
        mainExplosion.addBehavior(new QUARKS.OrbitOverLife( new QUARKS.ConstantValue(1), new THREE.Vector3(0, 0, 1)));
        mainExplosion.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.95, 0), 0]])));

        const innerFlash = new QUARKS.ParticleSystem(innerFlashData);
       innerFlash.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1,2), colorToVec4(this.params.color.end[0], 1, 2))));
        innerFlash.addBehavior(new QUARKS.SpeedOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.1, 0.05, 0), 0]])));

        const burst = new QUARKS.ParticleSystem(burstData);
        burst.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1,2), colorToVec4(this.params.color.end[0], 0, 2))));
        burst.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.95, 0.95, 1), 0]])));
        
        const burst2 = burst.clone();
        burst2.material = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/star_08.png");

        this.emitter.add(mainExplosion.emitter);
        this.emitter.add(innerFlash.emitter);
        this.emitter.add(burst.emitter);
        this.emitter.add(burst2.emitter);
        //this.emitter.add(innerGlow.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(mainExplosion);
        this.particleSystems.push(innerFlash);
        this.particleSystems.push(burst);
        this.particleSystems.push(burst2);
        //this.particleSystems.push(innerGlow);
    }

    animate(delta) {
        if (this._lightTime > 0) this._lightTime -= delta;
        super.animate(delta);
    }
}
class StarBurst extends ExplosionParticle {

    constructor (...args) {
        super(...args);
        this._lightTime = 0.3;
        this._initialLightTime = 0.3;
    }

    addLight() {
        const light = ParticleEngine.getLightInstance();
        if (light) {
            this._light = light;
            this._lightIntensity = 10;
            light.decay = 2;
            light.intensity = 0;
            light.distance = 5;
            light.color = this.params.color.start[0];
            light.position.set(0,0,0);
            this.emitter.add(light);
        }
    }

    animateLight(delta) {
        super.animateLight(delta);
        this._light.intensity = this._lightIntensity * this._lightPiecewise.genValue(this._lightTime / this._initialLightTime);
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const burstData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(0.2),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.emitterSize),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionBursts: [
                {
                time: 0.01,
                count: 1,
                cycle: 1,
                interval: 0,
                probability: 1,
            }],
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/light_02.png"),
            renderOrder: 1,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const innerFlashData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.IntervalValue(1.4, 1.6),
            startSpeed: new QUARKS.IntervalValue(0.2*this.params.emitterSize,0.4*this.params.emitterSize),
            startSize: new QUARKS.IntervalValue(0.01, 0.02),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(10),
            },
            emissionOverTime: new QUARKS.ConstantValue(0),
            emissionBursts: [{
                time: 0,
                count: this.params.rate.particles*25,
                cycle: 1,
                interval: 0.01,
                probability: 1,
            }],
        
            shape: this._meshSurface ?? new QUARKS.DonutEmitter({radius: 0.001, angle: Math.PI / 2}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/star_08.png"),
            renderOrder: 4,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const innerGlowData = {...innerFlashData}
        innerGlowData.startSpeed = new QUARKS.ConstantValue(this.params.force / 5);
        innerGlowData.startSize = new QUARKS.IntervalValue(this.params.scale.start / 10, this.params.scale.start / 20);
        innerGlowData.shape= this._meshSurface ?? new QUARKS.DonutEmitter({radius: 0.001, angle: Math.PI / 2});
        innerGlowData.renderMode = QUARKS.RenderMode.BillBoard;
        


    const innerFlash = new QUARKS.ParticleSystem(innerFlashData);
       innerFlash.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1,2), colorToVec4(this.params.color.end[0], 1, 2))));
        innerFlash.addBehavior(new QUARKS.SpeedOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.1, 0.05, 0), 0]])));
        innerFlash.addBehavior(new QUARKS.RotationOverLife(new QUARKS.IntervalValue(0, 0.5 * Math.PI), true));
        innerFlash.addBehavior(new QUARKS.OrbitOverLife( new QUARKS.IntervalValue(1,2), new THREE.Vector3(0, 0, 1)));
        
        innerFlash.emitter.rotation.x = Math.PI / 2;

        const burst = new QUARKS.ParticleSystem(burstData);
        burst.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1,2), colorToVec4(this.params.color.end[0], 0, 2))));
        burst.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.95, 0.95, 1), 0]])));
        burst.addBehavior(new QUARKS.RotationOverLife(new QUARKS.IntervalValue(0, 0.5 * Math.PI), true));
        
        const burst2 = burst.clone();
        burst2.material = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/star_09.png");
        burst2.startLife = new QUARKS.ConstantValue(0.7);

        this.emitter.add(innerFlash.emitter);
        this.emitter.add(burst.emitter);
        this.emitter.add(burst2.emitter);
        //this.emitter.add(innerGlow.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(innerFlash);
        this.particleSystems.push(burst);
        this.particleSystems.push(burst2);
        //this.particleSystems.push(innerGlow);
    }

    animate(delta) {
        if (this._lightTime > 0) this._lightTime -= delta;
        super.animate(delta);
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

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.3,
            emitterSize: 1,
        }
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const mainBeamData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(Math.max(this.params.life.max,this.params.duration)),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
                
                followLocalOrigin: true
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(1),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(),
            renderOrder: 20,
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
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };


        const mainBeam = new QUARKS.ParticleSystem(mainBeamData);

        mainBeam.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainBeam.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        mainBeam.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        
        const subBeamData = {...mainBeamData};
        subBeamData.startSize = new QUARKS.ConstantValue(this.params.scale.start*0.4);
        subBeamData.shape = new QUARKS.PointEmitter();
        subBeamData.emissionOverTime = new QUARKS.ConstantValue(0.1);
        subBeamData.material = await this.getBasicMaterial(null, THREE.NormalBlending);
        subBeamData.renderOrder = 10;

        const subBeam1 = new QUARKS.ParticleSystem(subBeamData);
        const subBeam2 = new QUARKS.ParticleSystem(subBeamData);
        const subBeam3 = new QUARKS.ParticleSystem(subBeamData);
        const subBeam4 = new QUARKS.ParticleSystem(subBeamData);
        

        [subBeam1, subBeam2, subBeam3, subBeam4].forEach((subBeam) => {
            subBeam.addBehavior(new QUARKS.Noise(new THREE.Vector3(1, 1, 1), new THREE.Vector3(5, 5, 5)))
            subBeam.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        });

        const subBeamDist = Math.max(0.001, this.params.emitterSize)*this.params.scale.start*8;

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
        super.animate(delta);
        this._duration -= delta;
        if (this.subBeamGroup && this._currentSpeed < 1) {
            this.subBeamGroup.rotation.y += delta * 20;
        }
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

class RunicRay extends RayParticle {
    constructor (from, to, params) {
        super(from, to, params);
        const frontPos = this._origin.clone().sub(this._target).normalize().multiplyScalar(-this.tokenRadius);
        this._origin.add(frontPos);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (Math.max(this.params.speed,40) / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this._duration = Math.max(this.params.duration, this.params.life.max);
        this._effectDelay = this._duration*0.5;
        this.isRay = true;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.0001,
        }
    }

    get tokenRadius() {
        if (!this.from instanceof Token) return 0;
        return (Math.max(this.from.document.width, this.from.document.height) / 2) * canvas.grid.size / factor;
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
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: Math.max(0.01, this.params.emitterSize)}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png"),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const sphereData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1),
            startSpeed: new QUARKS.ConstantValue(0.001),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*2),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            startRotation: new QUARKS.IntervalValue(0, 2*Math.PI),
            worldSpace: true,
            prewarm: true,
            speedFactor: 10,
            
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(30),
                
                followLocalOrigin: true
            },
            followLocalOrigin: true,
            
            emissionOverDistance: new QUARKS.ConstantValue(this.params.rate.particles),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
            material: await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/spark_02.png"),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const runeData = {
            duration: 1,
            looping: false,
            startLife: new QUARKS.ConstantValue(this.params.duration*1.5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            startRotation: new QUARKS.IntervalValue(0, 2*Math.PI),
            worldSpace: true,
            prewarm: true,
            instancingGeometry: new THREE.PlaneGeometry(1,1),
            
            emissionBursts: [
                {
                    time: 0,
                    count: 1,
                    cycleCount: 1,
                    interval: 0,
                    probability: 0,
                },
                {
                    time: 0.01,
                    count: 1,
                    cycleCount: 1,
                    interval: 0,
                    probability: 1,
                }
            ],
            
            emissionOverTime: new QUARKS.ConstantValue(0),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: 0.000000001, angle: 0.000001}),
            material: await this.getBasicMaterial(),
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.Mesh,
        };

        
        
        this._duration = runeData.material?.map?.image?.duration ?? this._duration;
        this._effectDelay = this._duration*0.5;
        this._initialEffectDelay = this._duration;


        const mainBeam = new QUARKS.ParticleSystem(mainBeamData);

        mainBeam.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainBeam.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        mainBeam.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        
        const tip = new QUARKS.ParticleSystem(sphereData);

        this.tip = tip;
        
        tip.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.95, 0.75, 0), 0]])));
        tip.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],0.3), colorToVec4(this.params.color.end[0],0.3))));
        tip.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));

        const rune = new QUARKS.ParticleSystem(runeData);

        this.rune = rune;
        const piecewise = new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0,0.10016666412353516,1.4605379065236666,1.4785303661534257),0],[new QUARKS.Bezier(1.4785303661534257,1.5032568879077353,1.538933101357817,1.524796690915664),0.10799999237060547],[new QUARKS.Bezier(1.524796690915664,1.5362982459717474,0.06126674613115683,0.0016847146160523171),0.9267499923706055]]);

        rune.addBehavior(new QUARKS.SizeOverLife(piecewise));
        rune.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1))));
        rune.addBehavior(new QUARKS.Rotation3DOverLife(new QUARKS.AxisAngleGenerator(new THREE.Vector3(0,0,1), new QUARKS.ConstantValue(1), true)));

        this.emitter.add(mainBeam.emitter);
        this.emitter.add(tip.emitter);
        this.emitter.add(rune.emitter);
        this.emitter.position.copy(this._origin);
        rune.emitter.lookAt(this._target);
        
        this.particleSystems.push(mainBeam, tip, rune);
    }

    animate(delta) {
        this._effectDelay -= delta;
        if(this._effectDelay > 0) return;
        this._duration -= delta;
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

class VoidRay extends BaseParticleEffect {
    constructor (from, to, params) {
        super(from, to, params);
        this._dist = this._origin.distanceTo(this._target);
        this._speed = (Math.max(this.params.speed,40) / this._dist / (factor / 100)) * ParticleEngine.getScale();
        this._duration = Math.max(this.params.duration, this.params.life.max);
        this.isRay = true;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const mainBeamData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(Math.max(this.params.life.max,this.params.duration)),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"),1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
                
                followLocalOrigin: true
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(1),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter(),
            material: await this.getBasicMaterial(),
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        };

        const darkBeamData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(Math.max(this.params.life.max,this.params.duration)),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.6),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("black"), 1)),
            worldSpace: true,
            prewarm: true,

            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
                
                followLocalOrigin: true
            },
            
            emissionOverDistance: new QUARKS.ConstantValue(1),
        
            shape: this._meshSurface ?? new QUARKS.PointEmitter(),
            material: await this.getBasicMaterial(null, THREE.NormalBlending),
            renderOrder: 5,
            renderMode: QUARKS.RenderMode.Trail,
        };



        const mainBeam = new QUARKS.ParticleSystem(mainBeamData);

        mainBeam.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end]])));
        mainBeam.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity*10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        mainBeam.addBehavior(new QUARKS.ColorOverLife(new QUARKS.ColorRange(colorToVec4(this.params.color.start[0],this.params.alpha.start), colorToVec4(this.params.color.end[0],this.params.alpha.end))));
        
        const darkBeam = new QUARKS.ParticleSystem(darkBeamData);

        darkBeam.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.75, 0), this.params.scale.end * 0.8]])));
        darkBeam.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity * 10, this.params.push.dy), new QUARKS.ConstantValue(1)));
        

     
        this.emitter.add(mainBeam.emitter);
        this.emitter.add(darkBeam.emitter);
        this.emitter.position.copy(this._origin);
        
        this.particleSystems.push(mainBeam, darkBeam);
    }

    animate(delta) {
        super.animate(delta);
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
            return;
        }
        if (!this.animationPath) return;
        this._time += delta;
        this._currentSpeed = this._time * this._speed;
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

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 1,
            emitterSize: 0.01,
        }
    }

    async createEmitter() {
        this.emitter = await this.createSprite();
        const scale = this.params.scale.start ? this.params.scale.start : this.params.scale.end;
        this.emitter.scale.set(scale, scale, scale);
        this.emitter.traverse((child) => {
            if (child.type === "ParticleEmitter") {
                this.particleSystems.push(child.system);
            }
        });
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
        } else if (game.Levels3DPreview.particleSystem.isVFX(this.params.sprite)) {
            const model = (await game.Levels3DPreview.particleSystem.loadVFX(this.params.sprite)) ?? new THREE.Group();
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
        super.animate(delta);
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
            prewarm: false,
            rendererEmitterSettings: {
                followLocalOrigin: true
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.rate.particles * 5),
        
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
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
        super.animate(delta);
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


class TorchParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.3;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
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
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/10}),
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
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*18),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/10}),
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
            startLife: new QUARKS.IntervalValue(1*lifeMultiplier,1.2*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.08),
            startSize: new QUARKS.ConstantValue(0.065*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(this.params.color.end[0], 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: false,
            speedFactor: 20,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize+this.params.scale.start*0.2, angle: Math.PI/20}),
            material: emberMaterial,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
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
        ember.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.8, 0), 0]])));
        //ember.addBehavior(new QUARKS.Noise(new THREE.Vector3(0.1,0.1,0.1) , new THREE.Vector3(0.05,0,0.05)))
        ember.emitter.rotation.x = -Math.PI / 2;

        this.emitter.add(fire1.emitter);
        this.emitter.add(fire2.emitter);
        this.emitter.add(fireGlow.emitter);
        this.emitter.add(ember.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fire1, fire2, fireGlow, ember);
    }
}

class FireParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const fireMaterial1 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.NormalBlending);
        const fireMaterial1Add = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.AdditiveBlending);
        const fireMaterial2 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/smoke9x9.png");
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");

        const lifeMultiplier = Math.sqrt(this.params.scale.start*5);

        const fire1Data = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(2.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.01),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.8),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/10}),
            material: fireMaterial1,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const fireGlowData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.01),
            startSize: new QUARKS.ConstantValue(0.7*0.8*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8 - Math.min(7,lifeMultiplier*4)),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/10}),
            material: fireMaterial2,
            startTileIndex: new QUARKS.IntervalValue(0, 7),
            uTileCount: 3,
            vTileCount: 3,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.BillBoard,
        }

        const emberData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(1*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0.1),
            startSize: new QUARKS.ConstantValue(0.015*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(this.params.color.start[0], 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: true,
            prewarm: false,
            speedFactor: 6,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize+0.05, angle: Math.PI/20}),
            material: emberMaterial,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
        }

        const fire1 = new QUARKS.ParticleSystem(fire1Data);
        
        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0.3)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0.3), colorToVec4(this.params.color.end[0], 1)), 0.2314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0.3, 0.3, 0.3, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0.3, 0.3, 0.3, 0), new THREE.Vector4(0.3, 0.3, 0.3, 0)),1],
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
        fireGlow.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.05)));
        fireGlow.addBehavior(new QUARKS.ColorOverLife(gradient));
        fireGlow.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.5, 0.5), 0]])));
        fireGlow.emitter.rotation.x = -Math.PI / 2;

        const ember = new QUARKS.ParticleSystem(emberData);
        ember.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.05)));
        ember.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.8, 0), 0]])));
        ember.addBehavior(new QUARKS.Noise(new THREE.Vector3(0.1,0.1,0.1) , new THREE.Vector3(0.05,0,0.05)))
        ember.emitter.rotation.x = -Math.PI / 2;

        this.emitter.add(fire1.emitter);
        this.emitter.add(fire2.emitter);
        this.emitter.add(fireGlow.emitter);
        this.emitter.add(ember.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fire1, fire2, fireGlow, ember);
    }
}

class MagicCircleParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/trace_01.png");

        const circleLinesData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(40*this.params.emitterSize),
            startSpeed: new QUARKS.ConstantValue(0.01),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: false,
            speedFactor: 1000*this.params.emitterSize,
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*2.5*this.params.emitterSize),
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: 0.001}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
        }

        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        
        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.522],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0,0,0,0)), 0.71],
                [new QUARKS.ColorRange(new THREE.Vector4(0,0,0,0), new THREE.Vector4(0,0,0,0)), 1],
            ]
            );
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0, 0.95, 1), 0]])));
        //circleLines.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.01)));
        circleLines.emitter.rotation.x = -Math.PI / 2;
        circleLines.emitter.position.y-=0.02;
        
        this.emitter.add(circleLines.emitter);
        this.emitter.position.copy(this._target);
        //if(this.params.applyPresetLightOffset) this.emitter.position.y -= 0.2;
        this.particleSystems.push(circleLines);
    }
}

class VortexParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial();


        const circleLinesData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.IntervalValue(1.5, 2.5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(80),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*25*this.params.emitterSize),
            shape: this._meshSurface ?? new QUARKS.DonutEmitter({radius: this.params.emitterSize, angle: 0.001, thickness: 1}),
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
        if(this.params.applyPresetLightOffset) this.emitter.position.y -= 0.1;
        this.particleSystems.push(circleLines,particles);
    }
}

class SparksParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async createEmitter() {

        this.emitter = new THREE.Group();

        const collision = await this.getCollision();
        const emberMaterial = await this.getBasicMaterial();

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
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: Math.PI/2}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.Trail,
        }


        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        

        circleLines.addBehavior(
            new QUARKS.ApplyCollision(
                {
                    resolve(pos, normal) {
                        if (pos.y <= collision) {
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
}

class HolyLightParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
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
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity),
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: 0.001}),
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
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity),
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize*0.8, angle: 0.001}),
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
        if(this.params.applyPresetLightOffset) this.emitter.position.y -= 0.09;
        this.particleSystems.push(circleLines, symbols);
    }
}

class GhostlyParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const symbolMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/spark_02.png");
        
        const symbolsData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*15*this.params.emitterSize),
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize*0.8, angle: 0.001}),
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
        if(this.params.applyPresetLightOffset) this.emitter.position.y -= 0.09;
        this.particleSystems.push(symbols);
    }
}

class FairyParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.05;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const emberMaterial = await this.getBasicMaterial();

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
            shape: this._meshSurface ?? new QUARKS.SphereEmitter({radius: this.params.emitterSize}),
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
}

class SmokeCloudParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
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
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*15*this.params.emitterSize),
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: 0.001}),
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
}

class MysteriousLightsParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.3;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {

        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial();

        const particlesData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.IntervalValue(4.5*this.params.emitterSize*5, 6.5*this.params.emitterSize*5),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(80),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*25*this.params.emitterSize),
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize, angle: 0.001, thickness: 1}),
            material: emberMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        }


        const particles = new QUARKS.ParticleSystem(particlesData);
        

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.114],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 0)), 0.522],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 0), colorToVec4(this.params.color.end[0], 0)),1],
            ]
            );
        
        particles.addBehavior(new QUARKS.ColorOverLife(gradient));
        particles.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.01)));
        particles.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(0.04), new THREE.Vector3(0, 0, 1)));
        particles.addBehavior(new QUARKS.Noise(new THREE.Vector3(0.1, 0.01, 0.1), new THREE.Vector3(0.01, 0.01, 0.01)));
        particles.emitter.rotation.x = -Math.PI / 2;
        
        this.emitter.add(particles.emitter);
        this.emitter.position.copy(this._target);
        if(this.params.applyPresetLightOffset) this.emitter.position.y -= 0.1;
        this.particleSystems.push(particles);
    }
}

class SunburstParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const rayMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");

        const circleLinesData = {
            duration: 0.2,
            looping: true,
            startLife: new QUARKS.ConstantValue(10*this.params.emitterSize),
            startSpeed: new QUARKS.ConstantValue(0.1),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            prewarm: false,
            speedFactor: 1000*this.params.emitterSize,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*50/Math.max(1,this.params.emitterSize*10)),
            shape: this._meshSurface ?? new QUARKS.PointEmitter(),
            material: rayMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
        }


        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.522],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0,0,0,0)), 0.71],
                [new QUARKS.ColorRange(new THREE.Vector4(0,0,0,0), new THREE.Vector4(0,0,0,0)), 1],
            ]
            );
        
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.emitter.rotation.x = -Math.PI / 2;

        const particles = circleLines.clone();

        particles.material = emberMaterial;
        //particles.renderMode = QUARKS.RenderMode.BillBoard;
        particles.startSize = new QUARKS.ConstantValue(this.params.scale.start * 0.2);
        
        this.emitter.add(circleLines.emitter);
        this.emitter.add(particles.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(circleLines,particles);
    }
}

class TeslaParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const rayMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/Rotated/spark_05_rotated.png");
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/Rotated/spark_06_rotated.png");
        
        const circleLinesData = {
            duration: 0.25,
            looping: true,
            startLife: new QUARKS.ConstantValue(1*this.params.emitterSize),
            startSpeed: new QUARKS.ConstantValue(2),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
            },
            emissionBursts: [
                {
                    time: 0,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
                {
                    time: 0.05,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
                {
                    time: 0.1,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },                {
                    time: 0.15,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
                {
                    time: 0.2,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
                {
                    time: 0.25,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
            ],
            emissionOverTime: new QUARKS.ConstantValue(0),
            shape: this._meshSurface ?? new QUARKS.PointEmitter(),
            material: rayMaterial,
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
            const turbulence = new THREE.Vector3(0.5,0.5,0.5)
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.Noise(turbulence, turbulence))


        const particles = circleLines.clone();

        particles.material = emberMaterial;
        particles.startSize = new QUARKS.ConstantValue(this.params.scale.start * 0.2);
        
        this.emitter.add(circleLines.emitter);
        this.emitter.add(particles.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(circleLines,particles);
    }
}

class MagicSphereParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const rayMaterial = await this.getBasicMaterial();

        const circleLinesData = {
            duration: 0.2,
            looping: true,
            startLife: new QUARKS.IntervalValue(3,5),
            startSpeed: new QUARKS.ConstantValue(1),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: true,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
                followLocalOrigin: true,
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*2),
            shape: this._meshSurface ?? new QUARKS.DonutEmitter({radius: this.params.emitterSize, thickness: 1}),
            material: rayMaterial,
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
        
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));

        const particles = circleLines.clone();
        //particles.renderMode = QUARKS.RenderMode.BillBoard;
        particles.startSize = new QUARKS.ConstantValue(this.params.scale.start * 0.2);
        this._donut1 = circleLines.emitter;
        this._donut2 = particles.emitter;
        this.emitter.add(circleLines.emitter);
        this.emitter.add(particles.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(circleLines,particles);
    }

    animate(delta) {
        super.animate(delta);
        const deltaSpeed = delta*2;
        this._donut1.rotation.x += deltaSpeed;
        this._donut2.rotation.x += deltaSpeed;
        this._donut1.rotation.z += deltaSpeed;
        this._donut2.rotation.z += deltaSpeed;
        return super.animate(delta);
    }
}

class MistParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const symbolMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/mist_01.png", THREE.NormalBlending);
        
        const symbolsData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(20),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            //startRotation: new QUARKS.IntervalValue(0, 2 * Math.PI),
            worldSpace: false,
            prewarm: false,
            speedFactor: 100,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(400),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*4*this.params.emitterSize),
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this.params.emitterSize*0.8, angle: 0.001}),
            material: symbolMaterial,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
        }

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.522],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0,0,0,0)), 0.71],
                [new QUARKS.ColorRange(new THREE.Vector4(0,0,0,0), new THREE.Vector4(0,0,0,0)), 1],
            ]
            );

        const symbols = new QUARKS.ParticleSystem(symbolsData);

    
            
        symbols.addBehavior(new QUARKS.ColorOverLife(gradient));
        symbols.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        symbols.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 1, 0), new QUARKS.ConstantValue(0.00002)));
        symbols.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(0.02), new THREE.Vector3(0, 0, 1)));
        
        symbols.emitter.rotation.x = -Math.PI / 2;
        
        
        this.emitter.add(symbols.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(symbols);
    }
}

class GravityWellParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 0.5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/smoke9x9.png", THREE.NormalBlending);
        const coreMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.AdditiveBlending);


        const gravityStrength = 1.3*this.params.emitterSize;
        const lifeMultiplier = 1.3 * this.params.emitterSize;
        const orbitMultiplier = 0.7 / (this.params.emitterSize);

        const circleLinesData = {
            duration: 10,
            looping: true,
            startLife: new QUARKS.ConstantValue(1.5*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            startRotation: new QUARKS.IntervalValue(0, 2 * Math.PI),
            worldSpace: false,
            prewarm: false,
            speedFactor: 1,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(80),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*15*this.params.emitterSize),
            shape: this._meshSurface ?? new QUARKS.DonutEmitter({radius: this.params.emitterSize, angle: 0.001, thickness: 1}),
            material: emberMaterial,
            renderOrder: 2,
            startTileIndex: new QUARKS.IntervalValue(0, 8),
            uTileCount: 3,
            vTileCount: 3,
            renderMode: QUARKS.RenderMode.Trail,
        }

        const circleLines = new QUARKS.ParticleSystem(circleLinesData);
        
        const particleData = {...circleLinesData}
        particleData.startSize = new QUARKS.ConstantValue(this.params.scale.start * 4);
        particleData.startLife = new QUARKS.ConstantValue(2*lifeMultiplier);
        //particleData.renderMode = QUARKS.RenderMode.StretchedBillBoard;


        const particles = new QUARKS.ParticleSystem(particleData);
        particles.emitter.position.y += this.params.emitterSize / 4

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.522],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0,0,0,0)), 0.71],
                [new QUARKS.ColorRange(new THREE.Vector4(0,0,0,0), new THREE.Vector4(0,0,0,0)), 1],
            ]
            );
            
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(orbitMultiplier), new THREE.Vector3(0, 0, 1)));
        circleLines.addBehavior(new QUARKS.GravityForce(new THREE.Vector3(0, 0, 0), 0.3*gravityStrength));
        circleLines.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.75, 0.75, 0), 0]])));
        circleLines.emitter.rotation.x = -Math.PI / 2;

        particles.addBehavior(new QUARKS.ColorOverLife(gradient));
        particles.addBehavior(new QUARKS.GravityForce(new THREE.Vector3(0, 0, -this.params.emitterSize / 4), 0.1*gravityStrength));
        particles.addBehavior(new QUARKS.OrbitOverLife(new QUARKS.ConstantValue(0.3), new THREE.Vector3(0, 0, 1)));
        particles.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.75, 0.75, 0), 0]])));
        
        particles.emitter.rotation.x = -Math.PI / 2;

        const particles2Data = {...particleData, uTileCount: 1, vTileCount: 1, startTileIndex: new QUARKS.ConstantValue(0)}
        particles2Data.renderMode = QUARKS.RenderMode.BillBoard;
        particles2Data.shape = new QUARKS.DonutEmitter({radius: this.params.emitterSize * 0.5, angle: 0.001, thickness: 1})
        particles2Data.startLife = new QUARKS.ConstantValue(2 * lifeMultiplier);
        particles2Data.material = coreMaterial;

        const particles2 = new QUARKS.ParticleSystem(particles2Data);

        particles2.addBehavior(new QUARKS.ColorOverLife(gradient));
        particles2.addBehavior(new QUARKS.GravityForce(new THREE.Vector3(0, 0, -this.params.emitterSize / 4), 0.01*gravityStrength));
        particles2.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.75, 0.75, 0), 0]])));
        particles2.emitter.position.y += this.params.emitterSize / 4;
        particles2.emitter.rotation.x = -Math.PI / 2;
        

        this.emitter.add(circleLines.emitter);
        this.emitter.add(particles.emitter);
        this.emitter.add(particles2.emitter);
        this.emitter.position.copy(this._target);
        if(this.params.applyPresetLightOffset) this.emitter.position.y -= 0.09;
        this.particleSystems.push(circleLines,particles,particles2);
    }
}

class JSONParticle extends BasePresetEffect {

    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    async createEmitter() {
        this.emitter = await game.Levels3DPreview.particleSystem.loadVFX(this.params.sprite);
        this.emitter.position.copy(this._target);
        this.emitter.scale.multiplyScalar(this.params.scale.start);
        this.emitter.traverse((child) => {
            if (child.type === "ParticleEmitter") {
                this.particleSystems.push(child.system);
            }
        });
    }
}


// Directional Effects

class BaseDirectionalEffect extends BaseParticleEffect {
    constructor (...args) {
        super(...args);
        this.lookAtTarget = this.inferLookAt();
        this._dist = null;
        this._speed = null;
        this.isTemplate = true;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: this.constructor.DEFAULT_SCALE,
            emitterSize: this.constructor.DEFAULT_EMITTER_SIZE,
        }
    }

    inferLookAt() {
        const object = this.to;
        if (object instanceof AmbientLight) {
            const light3d = game.Levels3DPreview.lights.sceneLights[object.id];
            this._coneEmitterAngle = light3d.light3d.angle ?? Math.PI/3;
            this._objectRadius = light3d.light3d.distance;
            const lightTarget = light3d.light3d.target ?? light3d.light3d;
            return lightTarget?.position;
        } else if (object instanceof MeasuredTemplate) {
            const template3d = game.Levels3DPreview.templates[object.id];
            this._target = template3d._effectOrigin.getWorldPosition(new THREE.Vector3());
            this._objectRadius = template3d._effectLength*0.7;
            this._emitterRadius = template3d._effectRadius;

            switch (template3d._baseShape) {
                case "circle":
                    this._coneEmitterAngle = 0;
                case "rect":
                    this._coneEmitterAngle = 0;
                    break;
                case "cone":
                    this._coneEmitterAngle = template3d._effectAngle * 0.5;
                    break;
                case "ray":
                    this._coneEmitterAngle = 0;
                    break;
            }
            return template3d._effectTarget.getWorldPosition(new THREE.Vector3());;
        } else {
            this._coneEmitterAngle = this.params.coneAngle;
            this._objectRadius = this._origin.distanceTo(this._target);
            this._emitterRadius = this.params.emitterSize;
            const tempTarget = this._target.clone();
            this._target = this._origin;
            this._origin = tempTarget;
            return this._origin;
        }
    }

    animate(delta) {
        super.animate(delta);
        this._duration -= delta;
        if (this._duration <= 0) {
            this._playOnEnd = true;
            this.onEnd();
            this._currentSpeed = 2;
        }
        return;
    }
}

class DirectionalBreathParticle extends BaseDirectionalEffect{

    static get DEFAULT_SCALE() {
        return 2;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const fireMaterial1 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.NormalBlending);
        const fireMaterial1Add = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.AdditiveBlending);
        const fireMaterial2 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame2x2.png");
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");

        const effectSpeed = 2;
        const lifeMultiplier = (this._objectRadius*5*0.5)/effectSpeed;
        const fire1Data = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.8),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: this._coneEmitterAngle}),
            material: fireMaterial1,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const fireGlowData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.5*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(0.7*0.5*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            //startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            speedFactor: 1.5,
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*18 - Math.min(7,lifeMultiplier*4)),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: this._coneEmitterAngle}),
            material: fireMaterial2,
            startTileIndex: new QUARKS.IntervalValue(0, 3),
            uTileCount: 2,
            vTileCount: 2,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
        }

        const emberData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.55*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(0.4*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(this.params.color.start[0], 0)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize*0.5, angle: this._coneEmitterAngle}),
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
        fire1.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.03)));
        fire1.emitter.rotation.x = -Math.PI / 2;
        
        const fire2 = fire1.clone();
        fire2.material = fireMaterial1Add;
        fire2.renderOrder = 4;
        fire2.emitter.rotation.x = -Math.PI / 2;

        const fireGlow = new QUARKS.ParticleSystem(fireGlowData);
        fireGlow.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.10)));
        fireGlow.addBehavior(new QUARKS.ColorOverLife(gradient));
        fire1.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        fireGlow.emitter.rotation.x = -Math.PI / 2;

        const ember = new QUARKS.ParticleSystem(emberData);
        ember.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.05)));
        ember.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.95, 0.45, 0.3), 0.2]])));
        ember.emitter.rotation.x = -Math.PI / 2;

        this.emitter.add(fire1.emitter);
        this.emitter.add(fire2.emitter);
        this.emitter.add(fireGlow.emitter);
        this.emitter.add(ember.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fire1, fire2, fireGlow, ember);
        this.emitter.lookAt(this.lookAtTarget);
        this.emitter.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    }
}

class DirectionalShockParticle extends BaseDirectionalEffect{
    
    static get DEFAULT_SCALE() {
        return 1;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();
        const rayMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/Rotated/spark_05_rotated.png");
        const rayMaterial2 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/Rotated/spark_06_rotated.png");
        const rayMaterial3 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/Rotated/trace_05_rotated.png");
        
        const effectSpeed = 4;
        const lifeMultiplier = (this._objectRadius * 5 * 0.5) / effectSpeed;
        
        const circleLinesData = {
            duration: 0.25,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.75*lifeMultiplier),
            startSpeed: new QUARKS.IntervalValue(2,4),
            startSize: new QUARKS.ConstantValue(this.params.scale.start),
            startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
            worldSpace: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
            },
            emissionBursts: [
                {
                    time: 0,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
                {
                    time: 0.05,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
                {
                    time: 0.1,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },                {
                    time: 0.15,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
                {
                    time: 0.2,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
                {
                    time: 0.25,
                    count: 5,
                    cycle: 1,
                    interval: .21,
                    probability: 0.1*this.params.presetIntensity,
                },
            ],
            emissionOverTime: new QUARKS.ConstantValue(0),
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: this._coneEmitterAngle}),
            material: rayMaterial,
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
            const turbulence = new THREE.Vector3(0.5,0.5,0.5)
        circleLines.addBehavior(new QUARKS.ColorOverLife(gradient));
        circleLines.addBehavior(new QUARKS.Noise(turbulence, turbulence))

        const circleLines2 = circleLines.clone();
        circleLines2.material = rayMaterial2;

        const circleLines3 = circleLines.clone();
        circleLines3.material = rayMaterial3;

        
        this.emitter.add(circleLines.emitter);
        this.emitter.add(circleLines2.emitter);
        this.emitter.add(circleLines3.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(circleLines, circleLines2, circleLines3);
        this.emitter.lookAt(this.lookAtTarget);
    }
}

class DirectionalPoisonParticle extends BaseDirectionalEffect{
    
    static get DEFAULT_SCALE() {
        return 4;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const smokeNormal = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/smoke9x9.png", THREE.NormalBlending);


        const effectSpeed = 1;
        const lifeMultiplier = (this._objectRadius*5*0.5)/effectSpeed;
        const fire1Data = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.8),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: this._coneEmitterAngle}),
            material: smokeNormal,
            startTileIndex: new QUARKS.IntervalValue(0, 8),
            uTileCount: 3,
            vTileCount: 3,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const fireGlowData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.5*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(0.7*0.3*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            speedFactor: 5,
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*18 - Math.min(7,lifeMultiplier*4)),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: this._coneEmitterAngle*2}),
            material: smokeNormal,
            startTileIndex: new QUARKS.IntervalValue(0, 8),
            uTileCount: 3,
            vTileCount: 3,
            renderOrder: 5,
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
        
        const gradient2 = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 1)), 0.314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.522],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0,0,0,0)), 0.71],
                [new QUARKS.ColorRange(new THREE.Vector4(0,0,0,0), new THREE.Vector4(0,0,0,0)), 1],
            ]
            );
            
        fire1.addBehavior(new QUARKS.ColorOverLife(gradient));
        fire1.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.55, 0.95, 1), 0]])));
        fire1.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.03)));
        fire1.emitter.rotation.x = -Math.PI / 2;
        
        const fire2 = fire1.clone();
        fire2.renderOrder = 4;
        fire2.emitter.rotation.x = -Math.PI / 2;

        const fireGlow = new QUARKS.ParticleSystem(fireGlowData);
        fireGlow.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.10)));
        fireGlow.addBehavior(new QUARKS.ColorOverLife(gradient2));
        fire1.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        fireGlow.emitter.rotation.x = -Math.PI / 2;

        fire1.emitter.position.y = -0.2;
        fire2.emitter.position.y = -0.2;
        fireGlow.emitter.position.y = -0.2;

        this.emitter.add(fire1.emitter);
        this.emitter.add(fire2.emitter);
        this.emitter.add(fireGlow.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fire1, fire2, fireGlow);
        this.emitter.lookAt(this.lookAtTarget);
        this.emitter.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    }
}

class DirectionalWaveParticle extends BaseDirectionalEffect{
    
    static get DEFAULT_SCALE() {
        return 6;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const wave = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/slash_05.png");

        const effectSpeed = 2;
        const lifeMultiplier = (this._objectRadius*5*0.5)/effectSpeed;

        const fireGlowData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.5*lifeMultiplier*4),
            startSpeed: new QUARKS.ConstantValue(effectSpeed*0.2),
            startSize: new QUARKS.ConstantValue(this._coneEmitterAngle*3*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            //startRotation: new QUARKS.ConstantValue(Math.PI),
            speedFactor: 1.5,
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: 0}),
            material: wave,
            renderMode: QUARKS.RenderMode.BillBoard,
        }

        const gradient = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0), colorToVec4(this.params.color.start[0], 0.3)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 0.3), colorToVec4(this.params.color.end[0], 1)), 0.2314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), new THREE.Vector4(0, 0, 0, 0)), 0.522],
                [new QUARKS.ColorRange(new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)),1],
            ]
            );
            
        const fireGlow = new QUARKS.ParticleSystem(fireGlowData);
        fireGlow.addBehavior(new QUARKS.ColorOverLife(gradient));
        fireGlow.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 0.25, 0.75, 1), 0]])));
        fireGlow.emitter.rotation.x = -Math.PI / 2;

        
        this.emitter.add(fireGlow.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fireGlow);
        this.emitter.lookAt(this.lookAtTarget);
        this.emitter.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    }
}

class DirectionalFrostParticle extends BaseDirectionalEffect{
    
    static get DEFAULT_SCALE() {
        return 3;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const fireMaterial1 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/flame_01.png", THREE.NormalBlending);
        const fireMaterial1Add = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/scorch_02.png", THREE.AdditiveBlending);
        const fireMaterial2 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/Rotated/trace_01_rotated.png", THREE.NormalBlending);
        const emberMaterial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/circle_05.png");

        const effectSpeed = 1;
        const lifeMultiplier = (this._objectRadius*5*0.35)/effectSpeed;
        const fire1Data = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.75*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.8),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            speedFactor: 1.5,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: this._coneEmitterAngle}),
            material: fireMaterial1,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
        };

        const fireGlowData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.5*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(0.7*0.2*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            //startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            speedFactor: 1.5,
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*18 - Math.min(7,lifeMultiplier*4)),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: this._coneEmitterAngle}),
            material: fireMaterial2,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
        }

        const emberData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.55*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(0.4*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(this.params.color.start[0], 0)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            speedFactor: 10.5,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(20),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize*0.5, angle: this._coneEmitterAngle}),
            material: emberMaterial,
            renderOrder: 20,
            renderMode: QUARKS.RenderMode.StretchedBillBoard,
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
        fire1.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 1, 1, 1), 0]])));
        fire1.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.03)));
        fire1.emitter.rotation.x = -Math.PI / 2;
        
        const fire2 = fire1.clone();
        fire2.material = fireMaterial1Add;
        fire2.renderOrder = 4;
        fire2.emitter.rotation.x = -Math.PI / 2;

        const fireGlow = new QUARKS.ParticleSystem(fireGlowData);
        fireGlow.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.10)));
        fireGlow.addBehavior(new QUARKS.ColorOverLife(gradient));
        fire1.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0.5, 0.55, 0.95, 1), 0.2]])));
        fireGlow.emitter.rotation.x = -Math.PI / 2;

        const ember = new QUARKS.ParticleSystem(emberData);
        ember.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.05)));
        ember.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 1, 1, 1), 0]])));
        ember.emitter.rotation.x = -Math.PI / 2;

        this.emitter.add(fire1.emitter);
        this.emitter.add(fire2.emitter);
        this.emitter.add(fireGlow.emitter);
        this.emitter.add(ember.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fire1, fire2, fireGlow, ember);
        this.emitter.lookAt(this.lookAtTarget);
        this.emitter.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    }
}

class DirectionalLaserParticle extends BaseDirectionalEffect{
    
    static get DEFAULT_SCALE() {
        return 0.5;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 0;
    }

    async createEmitter() {
        this.emitter = new THREE.Group();

        const fireMaterial1 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/light_01.png", THREE.NormalBlending);
        const fireMaterial1Core = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/light_01.png", THREE.AdditiveBlending);
        
        const fireMaterial2 = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/Rotated/trace_10_rotated.png", THREE.NormalBlending);
        const corematerial = await this.getBasicMaterial("modules/levels-3d-preview/assets/particles/Rotated/trace_10_rotated.png");
        
        const effectSpeed = 0.1;
        const lifeMultiplier = (this._objectRadius*7);
        const fire1Data = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.75*lifeMultiplier*0.05),
            startSpeed: new QUARKS.ConstantValue(0),
            startSize: new QUARKS.ConstantValue(this.params.scale.start*0.8),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            worldSpace: false,
            speedFactor: 1.5,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(80),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity*8),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: 0}),
            material: fireMaterial1,
            renderOrder: 2,
            renderMode: QUARKS.RenderMode.BillBoard,
        };

        const fireGlowData = {
            duration: 1,
            looping: true,
            startLife: new QUARKS.ConstantValue(0.5*lifeMultiplier),
            startSpeed: new QUARKS.ConstantValue(effectSpeed),
            startSize: new QUARKS.ConstantValue(0.7*this.params.scale.start),
            startColor: new QUARKS.ConstantColor(colorToVec4(new THREE.Color("white"), 1)),
            //startRotation: new QUARKS.IntervalValue(0, Math.PI * 2),
            speedFactor: 1.5,
            worldSpace: false,
            prewarm: false,
            rendererEmitterSettings: {
                startLength: new QUARKS.ConstantValue(200),
            },
            emissionOverTime: new QUARKS.ConstantValue(this.params.presetIntensity),
        
            shape: this._meshSurface ?? new QUARKS.ConeEmitter({radius: this._emitterRadius ?? this.params.emitterSize, angle: 0}),
            material: fireMaterial2,
            renderOrder: 10,
            renderMode: QUARKS.RenderMode.Trail,
        }

        const fire1 = new QUARKS.ParticleSystem(fire1Data);


        const gradient2 = new QUARKS.Gradient(
            [
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.start[0], 1)), 0],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.start[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.2314],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 1)), 0.922],
                [new QUARKS.ColorRange(colorToVec4(this.params.color.end[0], 1), colorToVec4(this.params.color.end[0], 1)),1],
            ]
        );
            
        fire1.addBehavior(new QUARKS.ColorOverLife(gradient2));
        fire1.addBehavior(new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 1, 1, 1), 0]])));
        fire1.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.03)));
        fire1.emitter.rotation.x = -Math.PI / 2;

        const fire2 = fire1.clone();
        fire2.material = fireMaterial1Core;
        fire2.renderOrder = 15;
        fire2.emitter.rotation.x = -Math.PI / 2;

        const fireGlow = new QUARKS.ParticleSystem(fireGlowData);
        fireGlow.addBehavior(new QUARKS.ApplyForce(new THREE.Vector3(0, 0, 1), new QUARKS.ConstantValue(0.10)));
        fireGlow.addBehavior(new QUARKS.ColorOverLife(gradient2));
        fireGlow.emitter.rotation.x = -Math.PI / 2;

        const core = fireGlow.clone();
        core.material = corematerial;
        core.renderOrder = 20;
        core.startSize = new QUARKS.ConstantValue(0.7 * this.params.scale.start * 0.5);
        core.emitter.rotation.x = -Math.PI / 2;

        this.emitter.add(fire1.emitter);
        this.emitter.add(fire2.emitter);
        this.emitter.add(fireGlow.emitter);
        this.emitter.add(core.emitter);
        //this.emitter.add(ember.emitter);
        this.emitter.position.copy(this._target);
        this.particleSystems.push(fire1, fireGlow, core, fire2);
        this.emitter.lookAt(this.lookAtTarget);
        this.emitter.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    }
}



const colorToVec4 = (color, alpha, overdrive = 1) => {
    return new THREE.Vector4(color.r * overdrive, color.g * overdrive, color.b * overdrive, alpha);
}

const ProjectilesParticleSystems = {
    "projectile": ProjectileParticle,
    "earthprojectile": EarthProjectile,
    "blackdart": BlackDart,
    "runicshot": RunicShot,
    "arrow": Arrow,
    "bolt": Bolt,
    "javelin": Javelin,
    "magicarrow": MagicArrow,
    "bullet": Bullet,
    "shotgun": Shotgun,
 }

const RaysParticleSystems = {
    "ray": RayParticle,
    "runicray": RunicRay,
    "voidray": VoidRay,
}

const ExplosionsParticleSystems = {
    "explosion": ExplosionParticle,
    "earthexplosion": EarthExplosion,
    "slash": SlashParticle,
    "magicburst": MagicBurst,
    "jb2aexplosion": JB2AExplosion,
    "jb2aexplosionnolight": JB2AExplosionNoLight,
    "castingsign": CastingSign,
    "lightning": Lightning,
    "starburst": StarBurst,
}

const SpritesParticleSystems = {
    "sprite": Object3DParticle,
    "swing": Swing,
    "thrust": Thrust,
    "thrustswing": () => {
        return Math.random() > 0.5 ? Thrust : Swing;
    },
}

const TargetOnlyPresetSystems = {
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
    "mysteriouslights": MysteriousLightsParticle,
    "sunburst": SunburstParticle,
    "tesla": TeslaParticle,
    "magicsphere": MagicSphereParticle,
    "mist": MistParticle,
    "gravitywell": GravityWellParticle,
    "json": JSONParticle,
}

const DirectionalParticleSystems = {
    "directionalfire": DirectionalBreathParticle,
    "directionalshock": DirectionalShockParticle,
    "directionalpoison": DirectionalPoisonParticle,
    "directionalwave": DirectionalWaveParticle,
    "directionalfrost": DirectionalFrostParticle,
    "directionallaser": DirectionalLaserParticle,
};

export class PARTICLE_SYSTEMS{

    static get CONSTS() {
        return {
            TargetOnlyPresetSystems,
            ProjectilesParticleSystems,
            RaysParticleSystems,
            ExplosionsParticleSystems,
            SpritesParticleSystems,
            LightParticleSystems,
            DirectionalParticleSystems,
        }
    }

    static get TARGET_ONLY_PRESET_SYSTEMS() {
        return {
            ...TargetOnlyPresetSystems,
        }
    }

    static get LIGHT_PARTICLE_SYSTEMS() {
        return {
            ...TargetOnlyPresetSystems,
            ...DirectionalParticleSystems,
        }
    }

    static get TARGET_ONLY_PARTICLE_SYSTEMS() {
        return {
            ...TargetOnlyPresetSystems,
            ...ExplosionsParticleSystems,
        }
    }

    static get SOURCE_TARGET_PARTICLE_SYSTEMS() {
        return {
            ...ProjectilesParticleSystems,
            ...RaysParticleSystems,
            ...SpritesParticleSystems,
        }
    }

    static get TEMPLATE_PARTICLE_SYSTEMS() {
        return {
            ...DirectionalParticleSystems,
        }
    }

    static get ALL_PARTICLE_SYSTEMS() {
        return {
            ...TargetOnlyPresetSystems,
            ...ProjectilesParticleSystems,
            ...RaysParticleSystems,
            ...ExplosionsParticleSystems,
            ...SpritesParticleSystems,
            ...DirectionalParticleSystems,
        }
    }

    static get ALL_PARTICLE_SYSTEMS_WITHOPTS() {
        return {
            "optgroup-projectiles": "optgroup-projectiles",
            ...ProjectilesParticleSystems,
            "optgroup-rays": "optgroup-rays",
            ...RaysParticleSystems,
            "optgroup-sprites": "optgroup-sprites",
            ...SpritesParticleSystems,
            "optgroup-directional": "optgroup-directional",
            ...DirectionalParticleSystems,
            "optgroup-explosions": "optgroup-explosions",
            ...ExplosionsParticleSystems,
            "optgroup-targetonly": "optgroup-targetonly",
            ...TargetOnlyPresetSystems,
        }
    }

    static getLocalizationKeys(systems) {
        const key = "levels3dpreview.particleSystems.";
        if(typeof systems === "string") return key + systems;
        else if (Array.isArray(systems)) return systems.map(s => key + s);
        else if (typeof systems === "object") return Object.keys(systems).map(s => key + s);
    }

    static localize(systems) {
        const keys = this.getLocalizationKeys(systems);
        if(Array.isArray(keys)) return keys.map(k => game.i18n.localize(k));
        else return game.i18n.localize(keys);
    }

    static getSelectOptions(systems, options = {localize: false}) {
        systems = systems instanceof Object ? Object.keys(systems) : systems;
        const { localize } = options;
        const obj = Object.fromEntries(systems.map(k => [k, localize ? this.localize(k) : this.getLocalizationKeys(k)]));
        return Object.fromEntries(Object.entries(obj).sort((a, b) => a[1].localeCompare(b[1])));
    }

    static requiresSourceTarget(system) {
        return Object.keys(this.SOURCE_TARGET_PARTICLE_SYSTEMS).includes(system);
    }

    static getParticleClass(type) {
        const pClass = this.ALL_PARTICLE_SYSTEMS[type]
        return typeof pClass === "function" ? pClass : pClass();
    }

    static getDefaultLightData(system) {
        const systemClass = this.getParticleClass(system);
        return {
            scale: systemClass.DEFAULT_SCALE,
            emitterSize: systemClass.DEFAULT_EMITTER_SIZE,
        }
    }
}