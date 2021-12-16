import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';


export class GlobalIllumination {
    constructor(parent){
        this._parent = parent;
        this.lights = {};
        this.init();
    }

    init(){
    const light = new THREE.HemisphereLight(0x858585, 0x000000, 1);
    this.lights.hemiLight = light;
    const spotLight = new THREE.DirectionalLight(0xffa95c, 4);
    const adjustmentSpotlight = new THREE.DirectionalLight(0xffa95c, 4);
    spotLight.castShadow = !game.settings.get("levels-3d-preview", "disableLighting");
    //spotLight.shadow.bias = -0.00005;
    spotLight.shadow.radius = 1;
    spotLight.shadow.camera.fov = 90;
    spotLight.shadow.camera.far = 100;
    spotLight.shadow.camera.near = 0.1;
    const shadowRes = game.settings.get("levels-3d-preview", "shadowQuality")
    spotLight.shadow.mapSize.width = 1024*shadowRes;
    spotLight.shadow.mapSize.height = 1024*shadowRes;

    this.lights.spotLight = spotLight;
    this.lights.adjustmentSpotlight = adjustmentSpotlight;
    const sunlightSphere = new THREE.SphereGeometry(6 / 10, 16, 16);
    const sunlight = new THREE.Mesh(sunlightSphere, new THREE.MeshBasicMaterial({ color: 0xffa95c, transparent: true, opacity: 0.5, wireframe: true }));
    this.lights.sunlight = sunlight;
    const color = canvas.scene.getFlag("levels-3d-preview", "sceneTint") ?? 0xffa95c;
    const distance = canvas.scene.getFlag("levels-3d-preview", "sunDistance") ?? 10;
    const angle = Math.toRadians(canvas.scene.getFlag("levels-3d-preview", "sunPosition") ?? 30);
    const intensity = canvas.scene.getFlag("levels-3d-preview", "sunIntensity") ?? 0.5;
    const lightTarget = new THREE.Object3D();
    const center = this._parent.canvasCenter;
    lightTarget.position.set(center.x, center.y, center.z);
    this.lights.target = lightTarget;
    if(!this._parent.isEXR)this._parent.scene.add(light);
    if(this._parent.debugMode) this._parent.scene.add(sunlight);
    this._parent.scene.add(spotLight);
    if(!this._parent.isEXR)this._parent.scene.add(adjustmentSpotlight);
    this._parent.scene.add(lightTarget);
    spotLight.target = lightTarget;
    adjustmentSpotlight.target = lightTarget;
    this.sunlight = {color, distance, angle, intensity};
    updateTime3D();
    }

    set sunlight(data){
        const targetLighting = {
          center : this._parent.canvasCenter,
          color : new THREE.Color(data.color),
          distance : data.distance,
          angle : data.angle,
          showSun : data.showSun ?? this._parent.debugMode,
          intensity : data.intensity,
          animationTime : (data.animationTime ?? 3000)/(1000/60),
        }
        const currentLighting = {
          center : this.lights.sunlight.position,
          color : new THREE.Color(this.lights.sunlight.material.color),
          distance : this.lights.sunlight.position.distanceTo(targetLighting.center),
          angle : Math.acos((this.lights.sunlight.position.x - targetLighting.center.x)/this.lights.sunlight.position.distanceTo(targetLighting.center)),
          intensity : this.lights.spotLight.intensity,
        }
    
        if(this.lights.sunlight.position.y < targetLighting.center.y) currentLighting.angle = -currentLighting.angle;
    
        const ticks = {
          distance : (currentLighting.distance - targetLighting.distance)/targetLighting.animationTime,
          angle : (currentLighting.angle - targetLighting.angle)/targetLighting.animationTime,
          intensity : (currentLighting.intensity - targetLighting.intensity)/targetLighting.animationTime,
          color: 1/targetLighting.animationTime,
          colorTick: 0,
        }
        if(data.animate) return this.animateLighting(currentLighting, targetLighting, ticks);
    
        const center = this._parent.canvasCenter;
        const color = data.color;
        const distance = data.distance;
        const angle = data.angle;
        const showSun = data.showSun ?? this.showSun;
        const intensity = data.intensity;
    
        //generate position form angle
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const z = 0;
        //detrmine the mirrored angle
        const angle2 = Math.PI - angle;
        const x2 = Math.cos(angle2) * distance;
        const y2 = Math.sin(angle2) * distance;
        const z2 = 0;
    
        //set adjustment light
        this.lights.adjustmentSpotlight.position.set(x2+center.x, y2, z2+center.z);
    
        this.lights.adjustmentSpotlight.intensity = intensity/3;
        this.lights.adjustmentSpotlight.color.set(color);
    
        this.lights.sunlight.position.set(x+center.x, y, z+center.z);
        this.lights.hemiLight.position.set(center.x, y, center.z);
        this.lights.spotLight.position.set(x+center.x, y, z+center.z);
        //set colors
        this.lights.spotLight.color.set(color);
        this.lights.sunlight.material.color.set(color);
        this.lights.sunlight.visible = showSun;
        this.lights.spotLight.intensity = intensity;
        this.lights.hemiLight.intensity = !game.settings.get("levels-3d-preview", "disableLighting") ? intensity : intensity;
    
      }

      async animateLighting(current,target,ticks){
        const center = this._parent.canvasCenter;
        let time = target.animationTime;
        while(time > 0){
          await this.sleep(1000/60);
          time -= 1;
          const color = current.color.lerp(target.color, ticks.colorTick);
          ticks.colorTick += ticks.color;
          current.distance -= ticks.distance;
          current.angle -= ticks.angle;
          current.intensity -= ticks.intensity;
          const distance = current.distance;
          const angle = current.angle;
          const intensity = current.intensity;
          const showSun = this.showSun;
      
          //generate position form angle
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          const z = 0;
          //detrmine the mirrored angle
          const angle2 = Math.PI - angle;
          const x2 = Math.cos(angle2) * distance;
          const y2 = Math.sin(angle2) * distance;
          const z2 = 0;
      
          //set adjustment light
          this.lights.adjustmentSpotlight.position.set(x2+center.x, y2, z2+center.z);
      
          this.lights.adjustmentSpotlight.intensity = intensity/3;
          this.lights.adjustmentSpotlight.color.set(color);
      
          this.lights.sunlight.position.set(x+center.x, y, z+center.z);
          this.lights.hemiLight.position.set(center.x, y, center.z);
          this.lights.spotLight.position.set(x+center.x, y, z+center.z);
          //set colors
          this.lights.spotLight.color.set(color);
          this.lights.sunlight.material.color.set(color);
          this.lights.sunlight.visible = showSun;
          this.lights.spotLight.intensity = intensity;
          this.lights.hemiLight.intensity = intensity;
        }
      }
    
      sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    
      setSunlightFromFlags(animate){
        const color = new THREE.Color(canvas.scene.getFlag("levels-3d-preview", "sceneTint") ?? 0xffa95c);
        const distance = canvas.scene.getFlag("levels-3d-preview", "sunDistance") ?? 10;
        const angle = Math.toRadians(canvas.scene.getFlag("levels-3d-preview", "sunPosition") ?? 30);
        const intensity = canvas.scene.getFlag("levels-3d-preview", "sunIntensity") ?? 0.5;
        this.sunlight = {color, distance, angle, intensity, animate: animate};
      }
    
      updateSunlight(data){
        const color = new THREE.Color(data.color ?? canvas.scene.getFlag("levels-3d-preview", "sceneTint") ?? 0xffa95c);
        const distance = data.distance ?? canvas.scene.getFlag("levels-3d-preview", "sunDistance") ?? 10;
        const angle = Math.toRadians(data.angle ?? canvas.scene.getFlag("levels-3d-preview", "sunPosition") ?? 30);
        const intensity = data.intensity ?? canvas.scene.getFlag("levels-3d-preview", "sunIntensity") ?? 0.5;
        canvas.scene.update({
          flags: {
            "levels-3d-preview": {
              sceneTint: color.getHexString(),
              sunDistance: distance,
              sunPosition: angle,
              sunIntensity: intensity,
          }
        }
      });
      }
}


//HOOKS

Hooks.on("updateScene", (scene, updates) => {
  if(!game.user.isGM) return;
  if(updates.flags && updates.flags["levels-3d-preview"] && game.Levels3DPreview._active){
    game.Levels3DPreview.lights.globalIllumination.setSunlightFromFlags(true);
  }
  const darknessSync = canvas.scene.getFlag("levels-3d-preview", "timeSync");
  if(darknessSync === "darkness"){
    if("darkness" in updates && game.Levels3DPreview._active){
      const darkness = 90*(1-updates.darkness);
      canvas.scene.setFlag("levels-3d-preview", "sunPosition", darkness);
    }
  }

})

Hooks.on("updateWorldTime", () => {
  if(!game.user.isGM) return;
  debounceTime3D();

});

function updateTime3D(){ 
  if(!game.Levels3DPreview._active || !game.user.isGM) return;
  const darknessSync = canvas.scene.getFlag("levels-3d-preview", "timeSync");
  if(darknessSync !== "time") return;
  const darkness = timeToSunPosition()//90*(1-updates.darkness);
  const prevDarkness = canvas.scene.getFlag("levels-3d-preview", "sunPosition")
  if(darkness.sunPosition === prevDarkness) return;
  canvas.scene.update({
    flags:{
      "levels-3d-preview": {
        sunPosition: darkness.sunPosition,
        animate3d: darkness.animate ? darkness.sunPosition+1 : false,
      }
    }
  })
}

const debounceTime3D = debounce(updateTime3D, 1000);
let previousTime
Hooks.on("ready", ()=>{previousTime = new Date(game.time.worldTime*1000);})
function timeToSunPosition(){
  let prevTime = previousTime;
  previousTime = new Date(game.time.worldTime*1000);
  const minutes = new Date(game.time.worldTime*1000).getUTCMinutes();
  const hours = (new Date(game.time.worldTime*1000).getUTCHours()*60 + minutes)/60;
  if(hours < 6 || hours > 20) return {
    sunPosition: prevTime > previousTime ? -90 : 270,
    animate: false,
  };
  const dayPercent = (hours-6)/14
  const sunPosition = dayPercent*180;
  return {
    sunPosition: sunPosition,
    animate: true,
  };
}