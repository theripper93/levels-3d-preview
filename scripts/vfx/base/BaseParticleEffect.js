import * as THREE from "three";
import * as QUARKS from "three.quarks";
import * as coords3d from "../../helpers/coords3d.js";
import { factor } from "../../main.js";
import { ParticleEngine } from "../engine.js";
import { Particle3D } from "../api.js";
import { PARTICLE_SYSTEMS } from "../registry.js";
import { BLENDING, getSpriteMaterial, getTextureMaterial } from "../materials.js";
import { Palette } from "../palette.js";
import { sampleLightAt, additiveGain } from "../probe.js";
import { shake } from "../cameraShake.js";
import { EffectLight } from "./effectLight.js";

const raycaster = new THREE.Raycaster();
const worldPosition = new THREE.Vector3();

function isMissing(value) {
    return value === undefined || value === null || Number.isNaN(value);
}

function withDefaults(defaults, params) {
    const result = { ...defaults };
    for (const [key, value] of Object.entries(params)) {
        if (isMissing(value)) continue;
        const fallback = defaults[key];
        if (fallback?.constructor === Object && value?.constructor === Object) {
            result[key] = { ...fallback };
            for (const [subKey, subValue] of Object.entries(value)) if (!isMissing(subValue)) result[key][subKey] = subValue;
        } else {
            result[key] = value;
        }
    }
    return result;
}

export class BaseParticleEffect {
    constructor(from, to, params) {
        this.from = from;
        this.to = to;
        this._missScale = 1;
        this.params = withDefaults(this.defaultSettings, params);
        this.setMeshSurface();
        this.autoSize();
        this.params.color.start = this.params.color.start.map((c) => new THREE.Color(c));
        this.params.color.end = this.params.color.end.map((c) => new THREE.Color(c));
        this._origin = this.inferPosition(from);
        this._target = this.inferPosition(to, true);
        this._originBottom ??= this._origin?.clone();
        this._targetBottom ??= this._target?.clone();
        this._bottomTarget ??= this._target?.clone();
        this._duration = this.params.duration;
        this._rotation = new THREE.Euler(this.params.rotation[0], this.params.rotation[1], this.params.rotation[2]);
        this._up = new THREE.Vector3(this.params.up[0], this.params.up[1], this.params.up[2]);
        this.miss();
        this.setTargetData(to);
        this._time = 0;
        this._currentSpeed = 0;
        this.particleSystems = [];
        this._toDispose = [];
        this._persistObjects = [];
        this._age = 0;
        this._timeline = [];
        this._lights = [];
        this._meshes = [];
        this._litColors = [];
        this._tintAge = Infinity;
    }

    addLight() {}

    static get IMPACT() {
        return null;
    }

    static get IMPACT_SCALE() {
        return 1;
    }

    static get DEFAULT_SCALE() {
        return 1;
    }

    static get TARGET_SIZED() {
        return false;
    }

    static get DEFAULT_EMITTER_SIZE() {
        return 1;
    }

    get AUTO_SIZE_FACTORS() {
        return {
            scale: 0.3,
            emitterSize: 1,
        };
    }

    get rendererScale() {
        return 1;
    }

    async init() {
        this.createAnimationPath();
        await this.createEmitter();
        if (this.params.meshSurface) {
            this.emitter.traverse((o) => {
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
        let hasSource = !!this.from && !this.constructor.TARGET_SIZED;
        if (!!this.from && this.AUTO_SIZE_FACTORS.preferSource) hasSource = true;
        let autosizeTarget;
        if (!hasSource) {
            const target = this.to;
            if (!(target instanceof foundry.canvas.placeables.Token)) return;
            autosizeTarget = target;
        } else {
            const source = this.from;
            if (!(source instanceof foundry.canvas.placeables.Token)) return;
            autosizeTarget = source;
        }
        const scale = (Math.max(autosizeTarget.document.width, autosizeTarget.document.height) * canvas.grid.size) / factor;
        this.params.scale.start = scale * this.AUTO_SIZE_FACTORS.scale;
        this.params.emitterSize = scale * this.AUTO_SIZE_FACTORS.emitterSize;
    }

    miss() {
        if (!this.params.miss) return;
        this._missScale *= 2 * (canvas.grid.size / factor);
        this._target.x += (Math.random() - 0.5) * this._missScale;
        this._target.y += (Math.random() - 0.5) * this._missScale;
        this._target.z += (Math.random() - 0.5) * this._missScale;
        if (this.params.tokenAnimation) this.params.tokenAnimation.to = null;
        const origin = this._origin.clone();
        const target = this._target.clone();
        const collision = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(origin, target, "move", false, false, false, false);
        if (collision) {
            this._target = collision;
        } else {
            const dir = target.clone().sub(origin).normalize();
            this._target = origin.clone().add(dir.multiplyScalar(this._origin.distanceTo(this._target) * 2));
            this._missNoCollision = true;
        }
    }

    createAnimationPath() {
        const points = [];
        const origin = this.params.rotateTowards ? this._target : this._origin;
        const target = this.params.rotateTowards ? this._bottomTarget : this._target;
        if (!target || !origin) return;
        if (this.params.rotateTowards) target.y -= 1;
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

    async createEmitter() {
        this.emitter = new THREE.Group();
        this.emitter.position.copy(this.anchor);
        await this.build();
    }

    async build() {}

    get anchor() {
        return this._target;
    }

    get palette() {
        return (this._palette ??= Palette.from(this.params.color));
    }

    get userForce() {
        return new THREE.Vector3(this.params.push.dx, this.params.push.dz - this.params.gravity * 10, this.params.push.dy);
    }

    get softParticles() {
        return game.Levels3DPreview.particleSystem.softParticles;
    }

    get softFade() {
        return game.Levels3DPreview.particleSystem.softFade;
    }

    get tint() {
        return (this._tint ??= new THREE.Color(1, 1, 1));
    }

    get glowColor() {
        return (this._glowColor ??= new THREE.Vector4(1, 1, 1, this.glowAlpha));
    }

    get glowAlpha() {
        return 1;
    }

    async material(sprite, blend = "add") {
        return getSpriteMaterial(sprite || this.params.sprite || this.defaultSettings.sprite, BLENDING[blend] ?? blend, this);
    }

    async add(...layers) {
        return this.addTo(this.emitter, ...layers);
    }

    async addTo(parent, ...layers) {
        const systems = (await Promise.all(layers.flat())).filter(Boolean);
        for (const system of systems) {
            parent.add(system.emitter);
            this.particleSystems.push(system);
            if (system.litColor) this._litColors.push(system.litColor);
            if (system.startDelay > 0) {
                system.pause();
                this.at(system.startDelay, () => system.play());
            }
        }
        return systems;
    }

    addMesh(mesh, parent = this.emitter) {
        parent.add(mesh);
        this._meshes.push(mesh);
        return mesh;
    }

    at(time, callback) {
        this._timeline.push({ time, callback });
        this._timeline.sort((a, b) => a.time - b.time);
    }

    emitLight(options) {
        const light = new EffectLight(this, options);
        if (!light.alive) return null;
        this._lights.push(light);
        return light;
    }

    shake(strength = 0.5, duration = 0.4) {
        shake(strength, duration, this.emitter.getWorldPosition(worldPosition));
    }

    releaseLights() {
        this._lights.forEach((light) => light.release());
        this._lights = [];
    }

    dispose() {
        this.releaseLights();
        this._meshes.forEach((mesh) => {
            mesh.removeFromParent();
            mesh.geometry?.dispose();
            if (!mesh.material?.userData.shared) mesh.material?.dispose();
        });
        this._meshes = [];
    }

    get impactPoint() {
        return this._target;
    }

    playImpact(point = this.impactPoint, duration = null) {
        if (this._impacted) return;
        this._impacted = true;
        const impact = this.params.impact ?? true;
        const type = !impact || this.params.onEnd?.length || this._missNoCollision ? null : typeof impact === "string" ? impact : this.constructor.IMPACT;
        if (!type || !point) return;
        const scale = this.params.scale.start * this.constructor.IMPACT_SCALE;
        const direction = this._origin ? point.clone().sub(this._origin).normalize() : null;
        const params = { type, id: this.params.id, scene: this.params.scene, color: { start: [...this.params.color.start], end: [...this.params.color.end] }, scale: { start: scale, end: 0 }, direction, subtle: typeof impact !== "string" };
        if (duration) params.duration = duration;
        game.Levels3DPreview.particleSystem.effect(null, point.clone(), params);
    }

    refreshTint(delta) {
        if (!this._litColors.length && !this._glowColor) return;
        this._tintAge += delta;
        if (this._tintAge < 0.4) return;
        this._tintAge = 0;
        if (this._glowColor) this._glowColor.set(1, 1, 1, 1).multiplyScalar(additiveGain()).setW(this.glowAlpha);
        if (!this._litColors.length) return;
        sampleLightAt(this.emitter.getWorldPosition(worldPosition), this.tint);
        for (const color of this._litColors) color.set(this.tint.r, this.tint.g, this.tint.b, color.w);
    }

    tick(delta) {
        this._age += delta;
        while (this._timeline.length && this._timeline[0].time <= this._age) this._timeline.shift().callback();
        this.refreshTint(delta);
        this.animate(delta);
        if (this.isRay && this._currentSpeed >= 1) this.playImpact();
        for (const light of this._lights) light.update(delta);
    }

    attach() {
        if (!this.params.attach) return;
        const objectId = this.to.id;
        const object3D = game.Levels3DPreview.tokens[objectId].mesh;
        this._attachTarget = object3D;
    }

    async getBasicMaterial(filePath, blending = THREE.AdditiveBlending) {
        return getTextureMaterial(filePath || this.params.sprite || this.defaultSettings.sprite, blending, this);
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
        if (!this.params.meshSurface) return;
        if (!(this.to instanceof foundry.canvas.placeables.Tile) && !(this.to instanceof foundry.canvas.placeables.Token)) return;
        const object3d = game.Levels3DPreview.tiles[this.to.id] ?? game.Levels3DPreview.tokens[this.to.id];

        const mergedGeometry = object3d.getMergedGeometry();
        mergedGeometry.computeBoundingBox();
        const shape = new QUARKS.MeshSurfaceEmitter(mergedGeometry);
        this._meshCenter = mergedGeometry.boundingBox.getCenter(new THREE.Vector3());
        this._meshSurface = shape;
    }

    async getCollision(fallback = this._target.y) {
        while (!game.Levels3DPreview._ready) {
            await new Promise((r) => setTimeout(r, 100));
        }

        const position = this._target.clone();
        position.y += 0.02;
        const targetp = this._target.clone();
        targetp.y -= 99999;
        const collision = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(position, targetp, "move", false, false, false, true);
        return collision[0]?.point?.y ?? fallback;
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
            subtle: false,
        };
    }

    inferPosition(object, isTarget) {
        if (!object) return null;
        if (object.isVector3) return object.clone();
        if (object.x !== undefined && object.y !== undefined && object.z !== undefined) {
            return coords3d.posCanvasTo3d(object);
        }
        if (object instanceof foundry.canvas.placeables.Token) {
            if (isTarget) {
                this._targetBottom = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            } else {
                this._originBottom = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            }
            this._missScale = Math.max(object.document.width, object.document.height) * (object.document?.flags?.["levels-3d-preview"]?.scale ?? 1);
            const tokenPos = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            if (isTarget) {
                tokenPos.y += game.Levels3DPreview.tokens[object.id].d * (Math.random() * 0.5 + 0.25);
                tokenPos.x += game.Levels3DPreview.tokens[object.id].w * ((Math.random() - 0.5) * 0.5);
                tokenPos.z += game.Levels3DPreview.tokens[object.id].h * ((Math.random() - 0.5) * 0.5);
                if (this.params.impactPoint) {
                    tokenPos.set(this.params.impactPoint.x, this.params.impactPoint.y, this.params.impactPoint.z);
                }
            } else {
                tokenPos.y += game.Levels3DPreview.tokens[object.id].d * 0.66;
            }
            let closest = null;
            const token3D = game.Levels3DPreview.tokens[object.id].model;
            if (token3D && isTarget && !this.params.impactPoint) {
                try {
                    token3D.traverse((child) => {
                        if (child.isMesh) {
                            if (child.userData.isParticle) return;
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
                } catch (e) {}
            }
            this._bottomTarget = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            this._originalPosition = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            this._originalCenter = game.Levels3DPreview.tokens[object.id].mesh.position.clone();
            this._originalCenter.y += game.Levels3DPreview.tokens[object.id].d / 2;
            this._bottomTarget.y -= game.Levels3DPreview.tokens[object.id].d;
            return tokenPos;
        }
        const z = object.document.elevation;
        return coords3d.posCanvasTo3d({
            x: object.center.x,
            y: object.center.y,
            z: z,
        });
    }

    setTargetData(object) {
        if (!this._origin || !object) return;
        if (object instanceof foundry.canvas.placeables.Token) {
            const token3d = game.Levels3DPreview.tokens[object.id];
            token3d.lastParticleOrigin = this._origin.clone();
        }
    }

    onEnd() {
        if (this.ended) return;
        this.ended = true;
        this.resolveTokenAnimation();
        if (this.isProjectile) this.playImpact();
        this.params.onEnd?.forEach((e) => {
            const p3d = new Particle3D().fromObject(e);
            if (!p3d._to) p3d.to(this.to);
            if (this.isProjectile) p3d.params.impactPoint = { x: this.emitter.position.x, y: this.emitter.position.y, z: this.emitter.position.z };
            if (this.params.miss) p3d.params.impactPoint = { x: this.emitter.position.x, y: this.emitter.position.y, z: this.emitter.position.z };
            const isTargetOnly = Object.keys(PARTICLE_SYSTEMS.TARGET_ONLY_PARTICLE_SYSTEMS).includes(p3d.params.type);
            if (!p3d._from && !isTargetOnly) p3d.from(this.from);
            p3d.start(false);
        });
        this._toDispose.forEach((e) => {
            e.map.dispose();
            e.dispose();
        });
        this._persistObjects.forEach((o) => {
            if (this.to instanceof foundry.canvas.placeables.Token) {
                if (this.params.miss) {
                    if (!this._missNoCollision) game.Levels3DPreview.scene.attach(o);
                } else {
                    const token3D = game.Levels3DPreview.tokens[this.to.id];
                    o.applyMatrix4(this.emitter.matrixWorld);
                    o.removeFromParent();
                    token3D.model.attach(o);
                }
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
        if (this._attachTarget) {
            if (this.to instanceof foundry.canvas.placeables.Token) this.emitter.rotation.copy(this._attachTarget.rotation);
            this.emitter.position.copy(this._attachTarget.position);
        }
    }
}
