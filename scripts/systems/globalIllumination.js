import * as THREE from "../lib/three.module.js";
import {factor} from "../main.js";
import {Sky} from "../lib/Sky.js";
import {DynamicSkyConfig} from "../settings/dynamicSkyConfig.js";



export class GlobalIllumination {
    constructor(parent) {
        this._parent = parent;
        this.lights = {};
        this.animationTarget = null;
        this.DynamicSkyConfig = DynamicSkyConfig;
        this.generateTimeSpline();
        this.init();
    }

    initDynamicSky() {
        if(this.sky) return;
        const sky = new Sky();
        this.sky = sky;
        this.sky._positionVector = new THREE.Vector3();
        this.sky._color = new THREE.Color();
        this.sky.clouds._color = new THREE.Color();
        sky.scale.setScalar( 450000 );
        this._parent.scene.add( sky );
    }

    updateDynamicSky() {
        debugger;
        const dynamicSkyData = foundry.utils.mergeObject({...SKY_DEFAULTS}, canvas.scene.getFlag("levels-3d-preview", "dynamicSky") ?? {});
        if (dynamicSkyData.enabled) {
            this.initDynamicSky();
        }
        else {
            this._parent.scene.remove(this.sky);
            this.sky = null;
        }
        if (!this.sky) return;

        this.sky._color.set(dynamicSkyData.color);
        this.sky.clouds._color.set(dynamicSkyData.cloudsTint);


        const maxDistance = canvas.scene.getFlag("levels-3d-preview", "sunDistance") ?? 10;
        const sunWorldY = this.global.sunlight.getWorldPosition(this.sky._positionVector).y;
        let unitDistance = 1 - (sunWorldY / maxDistance + 1) / 2;
        //if(unitDistance < 0.5) unitDistance *= 0.1;

        const uniforms = this.sky.material.uniforms;
        uniforms["turbidity"].value = dynamicSkyData.turbidity;
        uniforms["rayleigh"].value = dynamicSkyData.rayleigh;
        uniforms["mieCoefficient"].value = dynamicSkyData.mieCoefficient;
        uniforms["mieDirectionalG"].value = dynamicSkyData.mieDirectionalG;
        uniforms["skyTint"].value = this.sky._color;
        uniforms["starDensity"].value = 1/dynamicSkyData.starDensity;
        uniforms["starAlpha"].value = Math.pow(unitDistance, 2);
        uniforms["sunPosition"].value.copy(this.global.sunlight.getWorldPosition(this.sky._positionVector));

        if (this.sky.clouds) {
            this.sky.clouds.visible = dynamicSkyData.enableClouds;
            const cloudsUniforms = this.sky.clouds.material.uniforms;
            cloudsUniforms["timeAlpha"].value = Math.pow(this._parent.renderer.toneMappingExposure, 2);
            cloudsUniforms["cloudsSpeed"].value = dynamicSkyData.cloudsSpeed;
            cloudsUniforms["cloudsTint"].value = this.sky.clouds._color;
            cloudsUniforms["cloudsAlpha"].value = dynamicSkyData.cloudsAlpha;
            cloudsUniforms["cloudsScale"].value = (10 - dynamicSkyData.cloudsScale) * 2;
        }
    }

    generateTimeSpline() {
        const spline = new THREE.SplineCurve([new THREE.Vector2(0, 0), new THREE.Vector2(6, Math.PI / 2), new THREE.Vector2(12, Math.PI), new THREE.Vector2(20, (Math.PI * 3) / 2), new THREE.Vector2(24, 2 * Math.PI)]);
        this._timeSpline = spline;
    }

    getAngleAt(time) {
        const angle = this._timeSpline.getPointAt(time / 24).y;
        return angle;
    }

    init() {
        const sunlight = new THREE.DirectionalLight(0xffa95c, 4);
        const debugSphere = new THREE.Mesh(new THREE.SphereGeometry(6 / 10, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffa95c, transparent: true, opacity: 0.5, wireframe: true }));
        debugSphere.visible = this._parent.debugMode;
        const lightTarget = new THREE.Object3D();
        sunlight.target = lightTarget;
        lightTarget.position.copy(this._parent.canvasCenter);

        const lightingGroup = new THREE.Group();
        lightingGroup.position.copy(this._parent.canvasCenter);
        const sizeY = (canvas.scene.dimensions.sceneWidth / factor) * 1.5;
        const sizeX = (canvas.scene.dimensions.sceneHeight / factor) * 1.5;
        sunlight.shadow.camera.left = -sizeX / 2;
        sunlight.shadow.camera.right = sizeX / 2;
        sunlight.shadow.camera.top = sizeY / 2;
        sunlight.shadow.camera.bottom = -sizeY / 2;
        sunlight.shadow.camera.updateProjectionMatrix();
        lightingGroup.add(sunlight);
        lightingGroup.add(debugSphere);

        this.global = {
            sunlight,
            debugSphere,
            lightTarget,
            lightingGroup,
        };

        this._setShadowQuality();

        this._parent.scene.add(lightTarget);
        this._parent.scene.add(lightingGroup);

        this.setTarget(true, false);
        this.updateDynamicSky();
    }

    _setShadowQuality() {
        const sunlight = this.global.sunlight;
        sunlight.shadow.bias = canvas.scene.getFlag("levels-3d-preview", "shadowBias") ?? -0.00018;
        sunlight.castShadow = game.settings.get("levels-3d-preview", "shadowQuality") > 0;
        sunlight.shadow.radius = 1;
        sunlight.shadow.camera.fov = 90;
        sunlight.shadow.camera.far = 100;
        sunlight.shadow.camera.near = 0.1;
        const shadowRes = game.settings.get("levels-3d-preview", "shadowQuality");
        sunlight.shadow.mapSize.width = 1024 * shadowRes;
        sunlight.shadow.mapSize.height = 1024 * shadowRes;
    }

    setTarget(flags = true, animate = true) {
        const color = new THREE.Color(flags.color ?? canvas.scene.getFlag("levels-3d-preview", "sceneTint") ?? "white");
        const distance = -(flags.distance ?? canvas.scene.getFlag("levels-3d-preview", "sunDistance") ?? 10);
        const time = Math.clamped(flags.time ?? canvas.scene.getFlag("levels-3d-preview", "sunPosition") ?? 12, 0, 24);
        const exposure = flags.exposure ?? canvas.scene.getFlag("levels-3d-preview", "exposure") ?? 1;
        const sunTilt = flags.tilt ?? canvas.scene.getFlag("levels-3d-preview", "sunTilt") ?? 0;
        const intensity = exposure;
        const angle = new THREE.Quaternion().setFromEuler(new THREE.Euler((sunTilt * Math.PI) / 2, 0, this.getAngleAt(time)));
        const targetData = {
            color,
            distance,
            angle,
            intensity,
            exposure,
        };
        if (!animate) return this.setValues(targetData);
        this._timePassed = 0;
        this.animationTarget = targetData;
        this.updateDynamicSky();
    }

    setValues(values) {
        const { color, distance, angle, intensity, exposure } = values;
        const sunlight = this.global.sunlight;
        sunlight.color = color;
        sunlight.position.y = distance;
        sunlight.intensity = distance !== 0 ? intensity : 0;
        sunlight.castShadow = distance !== 0;
        this.global.debugSphere.color = color;
        this.global.debugSphere.position.y = distance;
        this.global.lightingGroup.rotation.setFromQuaternion(angle);
        this._parent.renderer.toneMappingExposure = exposure;
        this.updateDynamicSky();
    }

    setFromWorldTime() {
        const minutes = new Date(game.time.worldTime * 1000).getUTCMinutes();
        const hours = new Date(game.time.worldTime * 1000).getUTCHours();
        const final = parseFloat((hours + minutes / 60).toFixed(1));
        canvas.scene.setFlag("levels-3d-preview", "sunPosition", final);
    }

    update(delta) {
        if (!this.animationTarget) return;
        this._timePassed += delta / 50;
        if (this._timePassed >= 1) this._timePassed = 1;
        const sunlight = this.global.sunlight;
        const lightingGroup = this.global.lightingGroup;
        const { color, distance, angle, intensity, exposure } = this.animationTarget;
        const frameColor = sunlight.color.clone().lerp(color, this._timePassed);
        const frameDistance = sunlight.position.y + (distance - sunlight.position.y) * this._timePassed;
        const currentAngle = new THREE.Quaternion().setFromEuler(lightingGroup.rotation);
        const frameAngle = currentAngle.slerp(angle, this._timePassed);
        const frameIntensity = sunlight.intensity + (intensity - sunlight.intensity) * this._timePassed;
        const frameExposure = this._parent.renderer.toneMappingExposure + (exposure - this._parent.renderer.toneMappingExposure) * this._timePassed;
        this.setValues({ color: frameColor, distance: frameDistance, angle: frameAngle, intensity: frameIntensity, exposure: frameExposure });
        if (this._timePassed >= 1) this.animationTarget = null;
    }

    static setHooks() {
        Hooks.on("updateScene", (scene, updates) => {
            //if (!game.user.isGM) return;
            if (updates.flags && updates.flags["levels-3d-preview"] && game.Levels3DPreview._active) {
                game.Levels3DPreview.lights.globalIllumination.setTarget();
            }
        });

        let previousTime = 0;

        Hooks.on("updateWorldTime", () => {
            if (!game.user.isGM || !game.Levels3DPreview._active) return;
            const deltaTime = Math.abs(game.time.worldTime - previousTime);
            if (deltaTime < 10) return;
            const timeSync = getTimeSync();
            if (timeSync == "off" || timeSync == "darkness") return;
            previousTime = game.time.worldTime;
            game.Levels3DPreview.lights.globalIllumination.setFromWorldTime();
        });

        Hooks.on("preUpdateScene", (scene, updates) => {
            if (!game.user.isGM || !game.Levels3DPreview?._active || scene.id != canvas.scene.id || !("darkness" in updates)) return;
            const timeSync = getTimeSync();
            if (timeSync == "off" || timeSync == "time") return;
            const lightness = 1 - updates.darkness;
            mergeObject(updates, {
                flags: {
                    "levels-3d-preview": {
                        exposure: 0.2 + lightness * 0.8,
                    },
                },
            });
        });
    }
}

function getTimeSync() {
    const flag = canvas.scene.getFlag("levels-3d-preview", "timeSync");
    return flag ?? getTimeSyncDefault(canvas.scene);
}

export function getTimeSyncDefault(scene) {
    const smalltime = game.modules.get("smalltime")?.active;
    if (smalltime && scene.getFlag("smalltime", "darkness-link")) return "time";
    return "darkness";
}

export const SKY_DEFAULTS = {
    enabled: false,
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.999,
    color: "#3f8ea2",
    starDensity: 1,
    enableClouds: true,
    cloudsSpeed: 1,
    cloudsAlpha: 0.7,
    cloudsTint: "#ffffff",
    cloudsScale: 9.5,
}