import * as THREE from "three";
import { getQuality } from "../quality.js";
import { wind } from "../weather/wind.js";
import { surfaceUniforms } from "./receivers.js";
import { SurfaceMap, SURFACE_CHANNELS } from "./surfaceMap.js";
import { getSurface, rainRate, surfaceGrowth, isInteriorScene, suppressSurface } from "./state.js";
import { SurfaceProps } from "./props.js";
import { SurfaceTrails } from "./trails.js";
import { SurfaceHeat } from "./heat.js";
import { surfaceLighting } from "./lighting.js";

const ACTIVE_THRESHOLD = 1e-3;
const CALM = 1e-3;
const MIN_WIND = 2e-3;
const shelterListeners = new Set();

export function onShelterRendered(callback) {
    shelterListeners.add(callback);
    const system = SurfaceSystem.current;
    if (system?.map && system.shelter?.ready) callback(system.shelterData());
    return () => shelterListeners.delete(callback);
}

export class SurfaceSystem {
    static current = null;

    constructor(weather) {
        SurfaceSystem.current?.destroy();
        SurfaceSystem.current = this;
        this.weather = weather;
        this.map = null;
        this.time = 0;
        this.amounts = null;
        this.windDirection = new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2);
        this.uniforms = surfaceUniforms;
        this.props = new SurfaceProps(weather._parent, surfaceUniforms);
        this.trails = new SurfaceTrails(this);
        this.heat = new SurfaceHeat(this);
    }

    get quality() {
        return getQuality().surface ?? 0;
    }

    get active() {
        const amounts = this.amounts;
        return !!amounts?.enabled && this.quality > 0 && (amounts.total > ACTIVE_THRESHOLD || amounts.wet > ACTIVE_THRESHOLD);
    }

    get shelter() {
        return this.weather.shelter;
    }

    onShelterRendered(callback) {
        return onShelterRendered(callback);
    }

    shelterData() {
        const shelter = this.shelter;
        return { shelter, pixels: shelter.pixels, width: shelter.width, height: shelter.height, rect: shelter.rect, heightRange: shelter.uniforms.uShelterY.value, map: this.map };
    }

    stamp(scene, channels = SURFACE_CHANNELS.trail) {
        this.map?.stamp(scene, channels);
    }

    ensureMap() {
        const shelter = this.shelter;
        if (!shelter?.ready) return false;
        if (this.map?.matches(shelter)) return false;
        this.map?.dispose();
        this.map = new SurfaceMap(this.weather._parent.renderer, shelter);
        return true;
    }

    refreshMap() {
        const shelter = this.shelter;
        this.map.copyFromShelter(shelter);
        const uniforms = this.uniforms;
        uniforms.uSurfaceMap.value = this.map.texture;
        uniforms.uSurfaceRect.value.set(this.map.rect.x, this.map.rect.y, 1 / this.map.rect.z, 1 / this.map.rect.w);
        uniforms.uSurfaceY.value.copy(shelter.uniforms.uShelterY.value);
        uniforms.uSurfaceTexel.value = this.map.texel;
        uniforms.uSurfaceSquare.value = canvas.scene.dimensions.size / this.weather._parent.factor;
        this.placeProps = true;
        const data = this.shelterData();
        for (const listener of shelterListeners) {
            try {
                listener(data);
            } catch (error) {
                console.error(error);
            }
        }
    }

    refreshQuality() {
        this.placeProps = true;
    }

    update(delta, shelterRendered = false) {
        this.time += delta;
        this.interior = isInteriorScene();
        this.amounts = this.interior ? suppressSurface(getSurface(canvas.scene)) : getSurface(canvas.scene);
        const active = this.active;
        const uniforms = this.uniforms;
        if (active && (this.ensureMap() || shelterRendered)) this.refreshMap();
        else if (shelterRendered && this.map) this.refreshMap();
        const ready = active && !!this.map;
        uniforms.uSurfaceEnabled.value = ready ? 1 : 0;
        if (this.props) this.props.group.visible = ready;
        this.trails?.update(delta, ready);
        if (!ready) return;
        this.updateUniforms();
        this.heat?.update(delta, ready);
        if (this.props && (this.placeProps || this.props.kind !== this.amounts.kind)) {
            this.placeProps = false;
            this.props.place(this.shelterData(), this.amounts.kind, uniforms.uSurfaceWind.value);
        }
    }

    updateUniforms() {
        const uniforms = this.uniforms;
        const amounts = this.amounts;
        uniforms.uSurfaceCover.value = amounts.total;
        uniforms.uSurfaceWet.value = amounts.wet;
        uniforms.uSurfaceRain.value = rainRate(this.weather.state);
        uniforms.uSurfaceTime.value = this.time;
        uniforms.uSurfaceColor.value.copy(amounts.color);
        uniforms.uSurfaceRoughness.value = amounts.roughness;
        uniforms.uSurfaceSparkle.value = amounts.sparkle;
        uniforms.uSurfaceLumps.value = amounts.lumps;
        uniforms.uSurfaceSnow.value = amounts.snow;
        const { growth, amount } = surfaceGrowth(amounts);
        uniforms.uSurfaceGrowth.value.fromArray(growth);
        uniforms.uSurfaceAmount.value.fromArray(amount);
        uniforms.uSurfaceShape.value.fromArray(amounts.shape);
        uniforms.uSurfaceDetail.value.fromArray(amounts.detail);
        uniforms.uSurfaceStyle.value.fromArray(amounts.style);
        surfaceLighting(uniforms);
        this.props?.update(amounts);
        const gust = wind.gustAt(wind.time);
        if (wind.strength > CALM) {
            const radians = (wind.direction * Math.PI) / 180;
            this.windDirection.set(Math.sin(radians), -Math.cos(radians));
        }
        uniforms.uSurfaceWind.value.copy(this.windDirection).multiplyScalar(Math.max(wind.strength * gust, MIN_WIND));
        uniforms.uSurfaceQuality.value = this.quality;
    }

    destroy() {
        this.map?.dispose();
        this.map = null;
        this.props?.dispose();
        this.props = null;
        this.trails?.dispose();
        this.trails = null;
        this.heat?.dispose();
        this.heat = null;
        this.uniforms.uSurfaceEnabled.value = 0;
        this.uniforms.uSurfaceMap.value = null;
        if (SurfaceSystem.current === this) SurfaceSystem.current = null;
    }
}
