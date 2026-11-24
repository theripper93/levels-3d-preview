import * as THREE from "three";
import { compileForComposer } from "../../render/pipeline.js";
import { activeStyleId, getSkyStyle, isOutdoorSky, styleOptions } from "./registry.js";
import { skyDirection } from "./dome.js";

const DOME_SCALE = 450000;
const MAX_RETIRE = 15000;
const DRAIN_INTERVAL = 100;

const turn = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);

export class SkyStyleController {
    constructor(illumination) {
        this.illumination = illumination;
        this.style = null;
        this.pending = null;
        this.target = null;
        this.retired = [];
        this._sky = null;
        this.context = {
            style: null,
            sky: null,
            options: {},
            state: null,
            time: 12,
            darkness: 0,
            directed: false,
            sunDirection: null,
            moonDirection: null,
            skyDirection,
            directionAt: (hours, target = new THREE.Vector3(), { tilt, azimuth = 0 } = {}) => this.directionAt(hours, target, tilt, azimuth),
            setKeyLight: (direction, color, intensity) => this.setKeyLight(direction, color, intensity),
        };
        this.adjust = (state, setting) => this.light(state, setting);
    }

    get parent() {
        return this.illumination._parent;
    }

    get busy() {
        return !!this.pending || (!!this.style && !!this.target && this.target !== this.style.id);
    }

    notifyBusy() {
        const busy = this.busy;
        if (busy === !!this._busy) return;
        this._busy = busy;
        Hooks.callAll("3DCanvasSkyCompile", busy);
    }

    resolve(sky) {
        return activeStyleId(sky);
    }

    get underground() {
        return this.style?.group === "underground";
    }

    createDome(style) {
        const dome = style.createDome();
        dome.scale.setScalar(DOME_SCALE);
        dome.userData.skyStyle = style.id;
        return dome;
    }

    initial(sky) {
        this.discardPending();
        this.style = getSkyStyle(this.resolve(sky));
        this.target = this.style.id;
        this._sky = null;
        return this.createDome(this.style);
    }

    select(sky) {
        this.target = this.resolve(sky);
        this.advance();
    }

    compiling() {
        const pending = this.pending;
        if (pending) pending.waiting = pending.waiting.filter((program) => !program.isReady());
        return !!pending?.waiting.length || this.retired.some((entry) => entry.waiting.length);
    }

    advance() {
        const id = this.target;
        if (!this.style || !id || this.compiling()) return;
        if (this.pending?.style.id === id) return this.finish();
        this.discardPending();
        if (this.style.id === id) return;
        const style = getSkyStyle(id);
        const dome = this.createDome(style);
        const parent = this.parent;
        const state = this.illumination.atmosphere;
        if (state.enabled) dome.applyState(state);
        if (!parent._ready || !parent.composer) return this.swap(style, dome);
        const renderer = parent.renderer;
        const materials = [...compileForComposer(parent, dome, parent.camera, parent.scene)];
        const environment = this.illumination.skyEnvironment.compile(dome);
        materials.push(environment);
        const programs = materials.map((material) => renderer.properties.get(material).currentProgram).filter(Boolean);
        this.pending = { style, dome, environment, programs, waiting: programs.filter((program) => !program.isReady()), start: performance.now() };
        if (!this.pending.waiting.length) this.finish();
    }

    discardPending() {
        const pending = this.pending;
        if (!pending) return;
        this.pending = null;
        pending.waiting = pending.waiting.filter((program) => !program.isReady());
        if (pending.waiting.length) this.retired.push(pending);
        else this.release(pending);
    }

    release({ dome, environment }) {
        dome.dispose();
        environment?.dispose();
    }

    sweep() {
        const now = performance.now();
        this.retired = this.retired.filter((entry) => {
            entry.waiting = entry.waiting.filter((program) => !program.isReady());
            if (entry.waiting.length && now - entry.start < MAX_RETIRE) return true;
            this.release(entry);
            return false;
        });
    }

    drain() {
        this.sweep();
        this._draining = this.retired.length > 0;
        if (this._draining) setTimeout(() => this.drain(), DRAIN_INTERVAL);
    }

    finish() {
        const { style, dome, environment, programs } = this.pending;
        this.pending = null;
        const gl = this.parent.renderer.getContext();
        const failed = programs.find((program) => !gl.getProgramParameter(program.program, gl.LINK_STATUS));
        if (failed) {
            console.error(`3D Canvas | Sky style "${style.id}" failed to compile`, gl.getShaderInfoLog(failed.fragmentShader));
            this.release({ dome, environment });
            this.target = this.style?.id ?? null;
            return;
        }
        this.swap(style, dome, environment);
    }

    swap(style, dome, environment) {
        const illumination = this.illumination;
        const scene = this.parent.scene;
        const previous = illumination.sky;
        this.style = style;
        this._sky = null;
        illumination.sky = dome;
        if (previous) {
            dome.visible = previous.visible;
            dome.material.uniforms.time.value = previous.material.uniforms.time.value;
            scene.remove(previous);
            previous.dispose();
        }
        scene.add(dome);
        scene.environment = illumination.skyEnvironment.attach(dome, environment);
    }

    reset() {
        this.discardPending();
        this.style = null;
        this.target = null;
        this._sky = null;
        if (!this._draining) this.drain();
        this.notifyBusy();
    }

    update(delta) {
        if (this.retired.length) this.sweep();
        if (this.pending || (this.target && this.target !== this.style?.id)) this.advance();
        this.notifyBusy();
        const sky = this.illumination.sky;
        if (sky && this.style?.update) this.style.update(sky, delta, this.context);
    }

    prepare(sky, { time, darkness, sunDirection, moonDirection }) {
        const context = this.context;
        const style = this.style;
        context.style = style;
        context.time = time;
        context.darkness = darkness;
        context.sunDirection = sunDirection;
        context.moonDirection = moonDirection;
        context.directed = false;
        const changed = sky !== this._sky;
        if (changed) {
            this._sky = sky;
            context.sky = sky;
            context.options = styleOptions(style, sky);
        }
        if (style?.orient && (isOutdoorSky(sky) || this.underground)) context.directed = style.orient(context) !== false;
        return changed;
    }

    light(state, setting) {
        const context = this.context;
        const style = this.style;
        if (!style || (setting && !this.underground)) return;
        context.state = state;
        context.dim = THREE.MathUtils.lerp(1, setting?.darknessDim ?? 0.5, context.darkness);
        state.skyAnimated = !!style.animated;
        style.light?.(state, context);
        if (context.directed && !state.lightDirected) {
            state.lightDirection.copy(state.lightIsMoon ? state.moonDirection : state.sunDirection);
            state.lightDirected = true;
        }
    }

    apply(dome, state, changed) {
        const style = this.style;
        if (changed) state.version++;
        if (style?.apply && dome.userData.skyStyle === style.id) style.apply(dome, state, this.context);
    }

    setKeyLight(direction, color, intensity) {
        const state = this.context.state;
        if (!state) return;
        if (direction) {
            state.lightDirection.copy(direction).normalize();
            state.lightDirected = true;
        }
        if (color) state.lightColor.copy(color);
        if (intensity !== undefined) state.lightIntensity = intensity;
    }

    directionAt(hours, target, tilt, azimuth) {
        const illumination = this.illumination;
        const sceneTilt = Number(canvas.scene?.getFlag("levels-3d-preview", "sunTilt") ?? 0);
        const sign = illumination._distance > 0 ? 1 : -1;
        const hour = (((hours % 24) + 24) % 24);
        target.set(0, sign, 0).applyQuaternion(illumination.getSunAngle(hour, tilt ?? sceneTilt, turn));
        if (azimuth) target.applyAxisAngle(yAxis, (azimuth * Math.PI) / 180);
        return target;
    }
}
