const {
  System,
  Emitter,
  Rate,
  Span,
  Position,
  Mass,
  Radius,
  Life,
  Velocity,
  PointZone,
  Vector3D,
  Alpha,
  Scale,
  Color,
  RadialVelocity,
  SpriteRenderer,
  LineZone,
  RandomDrift,
  Gravity,
  SphereZone,
  ease,
  Force,
  Body,
  GPURenderer,
} = window.Nebula;
import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "../entities/ruler3d.js";
import { factor } from "../main.js";
import { getTriangleHitPointInfo } from "../lib/three-mesh-bvh.js";

export class ParticleSystem {
  constructor(_parent) {
    this._parent = _parent;
    this.effects = new Set();
    this.init();
  }

  get renderer() {
    return this._parent.renderer;
  }

  get scene() {
    return this._parent.scene;
  }

  init() {
    this.system = new System();
    const renderer = new GPURenderer(this.scene, THREE);
    this.system.addRenderer(renderer).emit({
      onStart: () => {},
      onUpdate: () => {},
      onEnd: () => {},
    });
  }

  async effect(from, to, params) {
    to = to instanceof Array ? to : [to];
    const repeats = params.repeats || 1;
    const delay = params.delay || 0;
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (let origin of from) {
        for (let target of to) {
          const projectileEmitter = new ProjectileEffect(
            origin,
            target,
            params
          );
          const emitter = await projectileEmitter.init();
          if (projectileEmitter.emitter instanceof THREE.Sprite) {
            this.effects.add(projectileEmitter);
            this.scene.add(projectileEmitter.emitter);
          } else {
            this.system.addEmitter(projectileEmitter.emitter);
            this.effects.add(projectileEmitter);
          }
        }
        await this.sleep(delay);
      }
    }
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
          if (effect.emitter instanceof THREE.Sprite) {
            this.scene.remove(effect.emitter);
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
    if (canvas.scene.id !== params.scene || !game.Levels3DPreview._active)
      return;
    from = from.map((t) => this.fromUUID(t));
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
  }

  fromUUID(uuid) {
    if (uuid.layer) {
      return canvas.layers.find((l) => l.name === uuid.layer).get(uuid.id);
    } else {
      return uuid;
    }
  }
}

class ProjectileEffect {
  constructor(from, to, params) {
    this._missScale = 1;
    this._origin = this.inferPosition(from);
    this._target = this.inferPosition(to, true);
    this.params = { ...this.defaultSettings, ...params };
    this._duration = this.params.duration;
    this.miss();
    this._dist = this._origin.distanceTo(this._target);
    const unitSpeed = this.params.speed * (canvas.dimensions.size / factor);
    this._speed = unitSpeed / this._dist;
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

  async init() {
    this.createAnimationPath();
    this.params.single
      ? await this.createSingleParticle()
      : await this.createEmitter();
    this.sprite = this.emitter instanceof THREE.Sprite;
    return this;
  }

  async createEmitter() {
    this.emitter = new Emitter();

    this.emitter
      .setRate(new Rate(this.params.rate.particles, this.params.rate.seconds))
      .addInitializers([
        new Body(await this.createSprite()),
        new Mass(this.params.mass),
        new Life(this.params.life.min, this.params.life.max),
        new Position(
          this.isRay
            ? new LineZone(
                this._origin.x,
                this._origin.y,
                this._origin.z,
                this._target.x,
                this._target.y,
                this._target.z
              )
            : new SphereZone(this.params.emitterSize)
        ),
        new RadialVelocity(
          this.params.radial.angle,
          this.params.radial.direction,
          this.params.radial.theta
        ),
      ])
      .addBehaviours([
        new RandomDrift(0.001, 0.001, 0.001, 0.05),
        new Scale(this.params.scale, 0),
        new Gravity(this.params.gravity),
        new Color(
          this.params.color.start,
          this.params.color.end,
          Infinity,
          ease.easeOutSine
        ),
      ])
      //.setPosition(this._origin)
      .emit();
  }

  async createSingleParticle() {
    this.emitter = await this.createSprite();
    const scale = this.params.scale.a ? this.params.scale.a : this.params.scale;
    this.emitter.scale.set(scale, scale, scale);
  }

  async createSprite() {
    const tex = await game.Levels3DPreview.helpers.loadTexture(
      this.params.sprite
    );
    tex.image.currentTime = 0;
    const material = new THREE.SpriteMaterial({
      map: tex,
      color: 0xffffff,
      blending: this.params.single
        ? THREE.NormalBlending
        : THREE.AdditiveBlending,
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
    for (let i = 0, l = this.params.arc; i < l; i++) {
      const t = (i + 2) / (l + 2);
      const point = this._origin.clone();
      point.lerp(this._target, t);
      point.x += (Math.random() - 0.5) * this._dist * 0.2;
      point.z += (Math.random() - 0.5) * this._dist * 0.2;
      points.push(point);
    }

    this.animationPath = new THREE.CatmullRomCurve3([
      this._origin,
      ...points,
      this._target,
    ]);
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
      scale: new Span(0.2, 0.1),
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
      arc: 0,
      speed: 10,
      miss: false,
      single: false,
      duration: 2,
    };
  }

  inferPosition(object, isTarget) {
    if (
      object.x !== undefined &&
      object.y !== undefined &&
      object.z !== undefined
    ) {
      return Ruler3D.posCanvasTo3d(object);
    }
    if (object instanceof Token) {
      this._missScale =
        Math.max(object.data.width, object.data.height) * object.data.scale;
      const tokenPos =
        game.Levels3DPreview.tokens[object.id].mesh.position.clone();
      if (isTarget) {
        tokenPos.y +=
          game.Levels3DPreview.tokens[object.id].d *
          (Math.random() * 0.5 + 0.25);
        tokenPos.x +=
          game.Levels3DPreview.tokens[object.id].w *
          ((Math.random() - 0.5) * 0.5);
        tokenPos.z +=
          game.Levels3DPreview.tokens[object.id].h *
          ((Math.random() - 0.5) * 0.5);
      } else {
        tokenPos.y += game.Levels3DPreview.tokens[object.id].d * 0.66;
      }
      return tokenPos;
    }
    const z =
      object.document.getFlag("levels", "heightBottom") ??
      object.document.getFlag("levels", "elevation") ??
      0;
    return Ruler3D.posCanvasTo3d({
      x: object.center.x,
      y: object.center.y,
      z: z,
    });
  }

  onEnd() {
    if (this.ended) return;
    this.ended = true;
    this.params.onEnd?.forEach((e) => e.start());
  }

  animate(delta) {
    if (this.isRay) {
      this._duration -= delta;
      if (this._duration <= 0) {
        this.onEnd();
        this._currentSpeed = 2;
      }
      return;
    }
    if (this.animationPath) {
      console.log(delta);
      this._time += delta;
      this._currentSpeed = this._time * this._speed;
      if (this._currentSpeed > 1) {
        this.onEnd();
        return;
      }
      const point = this.animationPath.getPointAt(this._currentSpeed); //this._origin.clone().lerp(this._target, this._currentSpeed);
      if (this.sprite) {
        this.emitter.position.copy(point);
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

  start() {
    this.params.scene = canvas.scene.id;
    game.Levels3DPreview.socket.executeForEveryone(
      "Particle3D",
      this._from,
      this._to,
      this.params
    );
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
    from = from.map((t) => this.toUUID(t));
    this._from = from;
    return this;
  }
  to(to) {
    to = to instanceof Array ? to : [to];
    to = to.map((t) => this.toUUID(t));
    this._to = to;
    return this;
  }
  sprite(sprite) {
    this.params.sprite = sprite;
    return this;
  }
  rate(particles, seconds) {
    this.params.rate = { particles, seconds };
    return this;
  }
  mass(mass) {
    this.params.mass = mass;
    return this;
  }
  life(min, max) {
    max = max ?? min;
    this.params.life = { min, max };
    return this;
  }
  emitterSize(size) {
    this.params.emitterSize = size;
    return this;
  }
  scale(a, b) {
    if (b) {
      this.params.scale = new Span(a, b);
    } else {
      this.params.scale = a;
    }
    return this;
  }
  gravity(gravity) {
    this.params.gravity = gravity;
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
  repeat(repeat) {
    this.params.repeats = repeat;
    return this;
  }
  delay(delay) {
    this.params.delay = delay;
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
  name(name) {
    this.params.name = name;
  }
  onEnd(particle3d) {
    particle3d = particle3d instanceof Array ? particle3d : [particle3d];
    particle3d.forEach((p) => {
      if (!p instanceof Particle3D) return this;
      p.params.id = this.params.id;
    });
    this.params.onEnd = particle3d;
    return this;
  }

  static stop(id) {
    game.Levels3DPreview.socket.executeForEveryone("Particle3DStop", id);
  }
}
