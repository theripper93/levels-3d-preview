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
  RandomDrift,
  Gravity,
  SphereZone,
  ease,
  Force,
  Body,
  GPURenderer
} = window.Nebula;
import * as THREE from '../lib/three.module.js';
import { Ruler3D } from "../entities/ruler3d.js";
import {factor} from '../main.js';
import { getTriangleHitPointInfo } from '../lib/three-mesh-bvh.js';

  export class ParticleSystem{
  
    constructor(_parent){
      this._parent = _parent;
      this.effects = new Set();
      this.init()
    }

    get renderer(){
      return this._parent.renderer
    }

    get scene(){
      return this._parent.scene;
    }

    init(){
      this.system = new System();
      const renderer = new GPURenderer(this.scene, THREE);
      this.system
        .addRenderer(renderer)
        .emit({
          onStart: ()=>{},
          onUpdate: ()=>{},
          onEnd: ()=>{},
        });
    }

    async projectile(from,to,params){
      to = to instanceof Array ? to : [to]; 
      const repeats = params.repeats || 1;
      const delay = params.delay || 0;
      for(let repeat = 0; repeat < repeats; repeat++){
        for(let target of to){
          const projectileEmitter = new ProjectileEffect(from,target,params);
          const emitter = await projectileEmitter.init();
          if(projectileEmitter.emitter instanceof THREE.Sprite){
            this.effects.add(projectileEmitter);
            this.scene.add(projectileEmitter.emitter);
          }else{
            this.system.addEmitter(projectileEmitter.emitter);
            this.effects.add(projectileEmitter);
          }
        }
        await this.sleep(delay);
      }
    }

    async sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    update(delta){
      if(this.system){
        this.system.update();
        this.effects.forEach(effect => {
          effect.animate(delta);
          if(effect._currentSpeed > 1){
            this.effects.delete(effect);
            if(effect.emitter instanceof THREE.Sprite){
              this.scene.remove(effect.emitter);
            }else{
              effect.emitter.destroy();
            }
            
          }
        })
      }
    }


  }
  
/*
Projectile Params
{
  sprite,
  rate: {
    particles,
    seconds,
  }
  mass,
  life: {
    min,
    max,
  }
  emitterSize,
  scale,
  gravity,
  color: {
    start,
    end,
  }
  arc,
  speed,
  miss,
  repeats,
  delay,
  single,
}
*/


class ProjectileEffect{
  constructor(from,to,params){
      this._missScale = 1;
      this._origin = this.inferPosition(from);
      this._target = this.inferPosition(to);
      this.params = {...this.defaultSettings, ...params};
      this.miss();
      this._dist = this._origin.distanceTo(this._target);
      const unitSpeed = this.params.speed*((canvas.dimensions.size)/factor);
      this._speed = unitSpeed/this._dist;
      this._time = 0;
      this._currentSpeed = 0;
  }

  async init(){
    this.createAnimationPath();
    this.params.single ? await this.createSingleParticle() : await this.createEmitter();
    this.sprite = this.emitter instanceof THREE.Sprite;
    return this;
  }

  async createEmitter(){
    this.emitter = new Emitter();
    
    this.emitter
      .setRate(new Rate(this.params.rate.particles, this.params.rate.seconds))
      .addInitializers([
        new Body(await this.createSprite()),
        new Mass(this.params.mass),
        new Life(this.params.life.min, this.params.life.max),
        new Position(new SphereZone(this.params.emitterSize)),
      ])
      .addBehaviours([
        new RandomDrift(0.0010, 0.0010, 0.0010, 0.05),
        new Scale(this.params.scale, 0),
        new Gravity(this.params.gravity),
        new Color(this.params.color.start, this.params.color.end, Infinity, ease.easeOutSine),
      ])
      .setPosition(this._origin)
      .emit();
  }

  async createSingleParticle(){
    this.emitter = await this.createSprite();
    const scale = this.params.scale.a ? this.params.scale.a : this.params.scale;
    this.emitter.scale.set(scale,scale,scale);
  }

  async createSprite(){
    const tex =  await game.Levels3DPreview.helpers.loadTexture(this.params.sprite);
    tex.image.currentTime = 0;
    const material = new THREE.SpriteMaterial({
      map: tex,
      color: 0xff0000,
      blending: this.params.single ? THREE.NormalBlending : THREE.AdditiveBlending,
      fog: true,
    });
    return new THREE.Sprite(material);
  };

  miss(){
    if(!this.params.miss) return;
    this._missScale *= 2*((canvas.dimensions.size)/factor);
    this._target.x += (Math.random()-0.5) * this._missScale;
    this._target.y += (Math.random()-0.5) * this._missScale;
    this._target.z += (Math.random()-0.5) * this._missScale;
  }

  createAnimationPath(){
    const points = [];
    for(let i = 0, l = this.params.arc; i < l; i++){
      const t = (i+2) / (l+2);
      const point = this._origin.clone();
      point.lerp(this._target, t);
      point.x += (Math.random()-0.5) * this._dist*0.2;
      point.z += (Math.random()-0.5) * this._dist*0.2;
      points.push(point);
    }

    this.animationPath = new THREE.CatmullRomCurve3([
      this._origin,
      ...points,
      this._target,
    ]);
    this.animationPath.curveType = 'chordal';
  }

  get defaultSettings(){
    return {
      sprite: "modules/levels-3d-preview/assets/particles/emberssmall.png",
      rate: {
        particles: new Span(10, 15),
        seconds: new Span(0.016, 0.010),
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
      arc: 0,
      speed: 10,
      miss: false,
      single: false,
    }
  }

  inferPosition(object){
    if(object.x !== undefined && object.y !== undefined && object.z !== undefined){
      return Ruler3D.posCanvasTo3d(object);
    }
    if(object instanceof Token){
      this._missScale = Math.max(object.data.width, object.data.height)*object.data.scale;
      const tokenPos = game.Levels3DPreview.tokens[object.id].mesh.position.clone()
      tokenPos.y += game.Levels3DPreview.tokens[object.id].d*0.66;
      return tokenPos;
    }
    const z = object.document.getFlag("levels", "heightBottom") ?? object.document.getFlag("levels", "elevation") ?? 0;
    return Ruler3D.posCanvasTo3d({x:object.center.x,y:object.center.y,z:z});
  }

  getPoint(a){

  }

  animate(delta){
    if(this.animationPath){
      console.log(delta)
      this._time += delta;
      this._currentSpeed = this._time*this._speed;
      if(this._currentSpeed > 1) return;
      const point = this.animationPath.getPointAt(this._currentSpeed)//this._origin.clone().lerp(this._target, this._currentSpeed);
      if(this.sprite){
        this.emitter.position.copy(point);
      }else{
        this.emitter.setPosition(point);
      }

    }
  }
}