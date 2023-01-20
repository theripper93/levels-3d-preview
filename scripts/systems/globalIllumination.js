import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";

export class GlobalIllumination {
    constructor(parent) {
        this._parent = parent;
        this.lights = {};
        this.animationTarget = null;
        this.generateTimeSpline();
        this.init();
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
            if (!game.user.isGM) return;
            if (updates.flags && updates.flags["levels-3d-preview"] && game.Levels3DPreview._active) {
                game.Levels3DPreview.lights.globalIllumination.setTarget();
            }
        });

        let previousTime = 0;

        Hooks.on("updateWorldTime", () => {
            if (!game.user.isGM || !game.Levels3DPreview._active) return;
            const deltaTime = Math.abs(game.time.worldTime - previousTime);
            if (deltaTime < 10) return;
            const timeSync = canvas.scene.getFlag("levels-3d-preview", "timeSync") ?? "off";
            if (timeSync == "off" || timeSync == "darkness") return;
            previousTime = game.time.worldTime;
            game.Levels3DPreview.lights.globalIllumination.setFromWorldTime();
        });

        Hooks.on("preUpdateScene", (scene, updates) => {
            if (!game.user.isGM || !game.Levels3DPreview?._active || scene.id != canvas.scene.id || !("darkness" in updates)) return;
            const timeSync = canvas.scene.getFlag("levels-3d-preview", "timeSync") ?? "off";
            if (timeSync == "off" || timeSync == "time") return;
            const lightness = 1 - updates.darkness;
            mergeObject(updates, {
                flags: {
                    "levels-3d-preview": {
                        exposure: 0.2 + lightness * 1.3,
                    },
                },
            });
        });
    }
}
