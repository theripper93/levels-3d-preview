import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { factor } from "../../main.js";
import { VFX_LAYER } from "../constants.js";
import { capabilities, createProjectionMaterial, createProjectionVolume, sceneUniforms, warm } from "../render/index.js";
import { getQuality } from "../quality.js";
import { sampleGlobalLight, additiveGain } from "../probe.js";
import { buildDistanceField } from "./distanceField.js";
import { STYLES, THEMES } from "./themes.js";
import { groundFragment, flatVertex, flatFragment, shellVertex, shellFragment, edgeVertex, edgeFragment, fogVertex, fogFragment } from "./shaders.js";
import { RegionEmitter } from "./emitter.js";
import { autoTheme } from "../../shaders/templateEffects.js";
import { playDirectional } from "../effects/directional.js";

const MODULE_ID = "levels-3d-preview";
const CAST_DURATION = 0.9;
const SUSTAIN_SETTLE = 2.5;
const DISSOLVE_DURATION = 0.8;
const DIRECTIONAL_DURATION = 3000;
const FLAT_BAND = [0.05, 0.25];
const EDGE_ANGLE = 30;
const EDGE_WIDTH = 0.004;
const EDGE_MITER = 0.5;
const SHELL_CREASE = Math.PI / 6;
const SHOW_EDGES = false;
const LIGHT_REFRESH = 500;
const regionTime = { value: 0 };
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const lightColor = new THREE.Color();

const hitboxMaterials = new Map();

export function hitboxMaterial(side = THREE.FrontSide) {
    let material = hitboxMaterials.get(side);
    if (!material) {
        material = new THREE.MeshBasicMaterial({ visible: false, side });
        material.userData.persistent = true;
        material.userData.hitbox = true;
        hitboxMaterials.set(side, material);
    }
    return material;
}

function now() {
    return RegionEffect.clock();
}

function readFlags(region) {
    return region.getFlag?.(MODULE_ID, "regionFx") ?? region.flags?.[MODULE_ID]?.regionFx ?? {};
}

export function resolveRegionFx(region, isFog = false) {
    const flags = readFlags(region);
    const id = (THEMES[flags.theme] && flags.theme) || (isFog ? "fog" : null) || autoTheme(region) || "plain";
    const theme = THEMES[id];
    const base = flags.color || (theme.colors ? null : region.color?.css) || null;
    const colors = base ? [base, new THREE.Color(base).multiplyScalar(0.4).getStyle()] : theme.colors;
    return { id, theme, colors, intensity: Number.isFinite(Number(flags.intensity)) && flags.intensity !== "" && flags.intensity !== null && flags.intensity !== undefined ? Number(flags.intensity) : 1, particles: flags.particles !== false, projection: flags.projection !== false };
}

function regionOrigin(region, bounds) {
    const shape = region.shapes?.[0];
    if (shape && ["circle", "ellipse", "ring", "cone", "line"].includes(shape.type)) return { x: shape.x / factor, z: shape.y / factor };
    return { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
}

export class RegionEffect extends THREE.Group {
    constructor(region3d, fx, { cast = false, preview = false } = {}) {
        super();
        this.region3d = region3d;
        this.fx = fx;
        this.preview = preview;
        this.field = buildDistanceField(region3d.region.polygonTree);
        this.born = now();
        this.castStart = cast && !preview ? this.born : -Infinity;
        this.dissolveStart = null;
        this.lightTime = 0;
        this.renderOrder = -10;
        if (!this.field) return;
        this.computeExtents();
        this.uniforms = this.createUniforms();
        this.createGround();
        if (this.region3d.height > 0.02 && !fx.theme.fog && game.settings.get("levels-3d-preview", "regionShells")) this.createShells();
        if (fx.theme.fog) this.createFog();
        if (fx.particles && fx.theme.particles && !preview) this.emitter = new RegionEmitter(this);
    }

    get fog() {
        return !!this.fogMesh;
    }

    computeExtents() {
        const { bounds, maxInside } = this.field;
        const region3d = this.region3d;
        const flat = region3d.height <= 0.02;
        this.bottom = flat ? region3d.bottom - FLAT_BAND[0] : region3d.bottom - 0.02;
        this.top = flat ? region3d.bottom + FLAT_BAND[1] : region3d.top + 0.02;
        this.origin = regionOrigin(region3d.region, bounds);
        const corners = [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.minX, bounds.maxZ], [bounds.maxX, bounds.maxZ]];
        this.reach = Math.max(...corners.map(([x, z]) => Math.hypot(x - this.origin.x, z - this.origin.z)), 0.01);
        this.maxInside = maxInside;
        const centered = !flat && region3d.region.shapes?.every((shape) => ["circle", "cone"].includes(shape.type));
        this.groundLevel = centered ? (region3d.bottom + region3d.top) / 2 : region3d.bottom;
    }

    createUniforms() {
        const { theme, colors, intensity } = this.fx;
        const [colorA, colorB] = colors;
        const fogHeight = theme.fog ? Math.max(this.region3d.height > 0.02 ? this.region3d.height : 0, theme.fog.height) : 0;
        return {
            uField: { value: this.field.texture },
            uFieldRect: { value: new THREE.Vector4(...this.field.rect) },
            uColorA: { value: new THREE.Color(colorA) },
            uColorB: { value: new THREE.Color(colorB) },
            uStyle: { value: STYLES[theme.style] ?? 0 },
            uState: { value: new THREE.Vector4(1, this.castStart > 0 ? 0 : 1, this.preview ? 1 : 0, intensity) },
            uOrigin: { value: new THREE.Vector3(this.origin.x, this.origin.z, this.reach) },
            uParams: { value: new THREE.Vector4(theme.fill, this.preview ? theme.edge * 0.8 : theme.edge, theme.scale, theme.speed) },
            uShape: { value: new THREE.Vector4(this.maxInside, this.region3d.bottom, this.region3d.bottom + fogHeight, getQuality().reduceMotion ? 0.15 : 1) },
            uFog: { value: new THREE.Vector4(theme.fog?.density ?? 0, 0.03, 1, 0) },
            uShell: { value: new THREE.Vector3(theme.rim, theme.rim > 0 ? 1 : 0.4, 1) },
            uGlow: { value: theme.glow },
            uGain: { value: 1 },
            uTime: regionTime,
        };
    }

    premultiply(material) {
        return Object.assign(material, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
    }

    createGround() {
        const [x, z, width, depth] = this.field.rect;
        const material = this.premultiply(createProjectionMaterial({ fragment: groundFragment, uniforms: this.uniforms, blending: "normal" }));
        this.ground = createProjectionVolume(material);
        this.ground.position.set(x + width / 2, (this.bottom + this.top) / 2, z + depth / 2);
        this.ground.scale.set(width, this.top - this.bottom, depth);
        this.ground.frustumCulled = false;
        this.add(this.ground);
        const flatMaterial = this.premultiply(new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: flatVertex,
            fragmentShader: flatFragment,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -4,
        }));
        this.flat = new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2), flatMaterial);
        this.flat.position.set(x + width / 2, this.groundLevel + 0.001, z + depth / 2);
        this.flat.layers.set(VFX_LAYER);
        this.add(this.flat);
        this.updateMode();
    }

    createShells() {
        const material = this.premultiply(new THREE.ShaderMaterial({
            uniforms: { ...sceneUniforms, ...this.uniforms, uBounds: { value: new THREE.Vector2(this.region3d.bottom, this.region3d.bottom + this.region3d.height) } },
            vertexShader: shellVertex,
            fragmentShader: shellFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        }));
        this.shellMaterial = material;
        this.region3d.updateMatrixWorld(true);
        this.region3d.traverse((child) => {
            if (!child.isMesh || !child.material?.userData?.hitbox) return;
            const shell = new THREE.Mesh(toCreasedNormals(child.geometry, SHELL_CREASE), material);
            shell.userData.ownsGeometry = true;
            shell.matrixAutoUpdate = false;
            shell.matrix.copy(child.matrixWorld);
            shell.layers.set(VFX_LAYER);
            this.add(shell);
            if (SHOW_EDGES) this.createEdges(child);
        });
    }

    createEdges(child) {
        const edges = new THREE.EdgesGeometry(child.geometry, EDGE_ANGLE);
        const source = edges.attributes.position;
        const count = source.count / 2;
        edges.dispose();
        if (!count) return;
        const position = new Float32Array(count * 12);
        const direction = new Float32Array(count * 12);
        const side = new Float32Array(count * 4);
        const index = [];
        const segments = [];
        const joints = new Map();
        const key = (p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
        for (let i = 0; i < count; i++) {
            const a = new THREE.Vector3().fromBufferAttribute(source, i * 2).applyMatrix4(child.matrixWorld);
            const b = new THREE.Vector3().fromBufferAttribute(source, i * 2 + 1).applyMatrix4(child.matrixWorld);
            const d = b.clone().sub(a).normalize();
            segments.push({ a, b, d });
            for (const point of [a, b]) {
                const k = key(point);
                if (!joints.has(k)) joints.set(k, []);
                joints.get(k).push(d);
            }
        }
        const extend = new Float32Array(count * 4);
        const miter = (point, d) => {
            const shared = joints.get(key(point));
            if (shared.length !== 2) return null;
            const other = shared[0] === d ? shared[1] : shared[0];
            const aligned = other.dot(d) < 0 ? other.clone().negate() : other;
            return aligned.dot(d) > EDGE_MITER ? d.clone().add(aligned).normalize() : null;
        };
        for (let i = 0; i < count; i++) {
            const { a, b, d } = segments[i];
            const corners = [[a, -1, -1], [a, 1, -1], [b, -1, 1], [b, 1, 1]];
            corners.forEach(([point, s, end], j) => {
                const joined = miter(point, d);
                point.toArray(position, (i * 4 + j) * 3);
                (joined ?? d).toArray(direction, (i * 4 + j) * 3);
                side[i * 4 + j] = s;
                extend[i * 4 + j] = joined ? 0 : end;
            });
            const v = i * 4;
            index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
        geometry.setAttribute("aDirection", new THREE.BufferAttribute(direction, 3));
        geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
        geometry.setAttribute("aExtend", new THREE.BufferAttribute(extend, 1));
        geometry.setIndex(index);
        this.edgeMaterial ??= this.premultiply(new THREE.ShaderMaterial({
            uniforms: { ...sceneUniforms, ...this.uniforms, uEdgeWidth: { value: EDGE_WIDTH } },
            vertexShader: edgeVertex,
            fragmentShader: edgeFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        }));
        const mesh = new THREE.Mesh(geometry, this.edgeMaterial);
        mesh.frustumCulled = false;
        mesh.userData.ownsGeometry = true;
        mesh.layers.set(VFX_LAYER);
        this.add(mesh);
    }

    createFog() {
        const material = new THREE.ShaderMaterial({
            uniforms: { ...sceneUniforms, ...this.uniforms },
            vertexShader: fogVertex,
            fragmentShader: fogFragment,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.BackSide,
        });
        const [x, z, width, depth] = this.field.rect;
        const bottom = this.uniforms.uShape.value.y;
        const top = this.uniforms.uShape.value.z;
        this.fogMesh = new THREE.Mesh(boxGeometry, material);
        this.fogMesh.position.set(x + width / 2, (bottom + top) / 2, z + depth / 2);
        this.fogMesh.scale.set(width, Math.max(top - bottom, 0.001), depth);
        this.fogMesh.layers.set(VFX_LAYER);
        this.fogMesh.frustumCulled = false;
        this.add(this.fogMesh);
    }

    updateMode() {
        const projected = capabilities.decals;
        this.ground.visible = projected && this.fx.projection;
        this.flat.visible = !projected && this.fx.projection;
        this.uniforms.uShell.value.z = this.uniforms.uFog.value.w = capabilities.active ? 1 : 0;
        if (this.fogMesh) this.fogMesh.material.depthTest = !capabilities.active;
    }

    updateLight(time) {
        if (time - this.lightTime < LIGHT_REFRESH / 1000) return;
        this.lightTime = time;
        if (!this.fx.theme.lit) return void (this.uniforms.uGain.value = additiveGain());
        sampleGlobalLight(lightColor.setRGB(0, 0, 0));
        const [colorA, colorB] = this.fx.colors;
        this.uniforms.uColorA.value.set(colorA).multiply(lightColor);
        this.uniforms.uColorB.value.set(colorB).multiply(lightColor);
    }

    tick() {
        const time = now();
        regionTime.value = time % 3600;
        const state = this.uniforms.uState.value;
        const age = time - this.castStart;
        state.y = Math.min(1, Math.max(0, age / CAST_DURATION));
        const surge = 1 + 0.6 * (1 - THREE.MathUtils.smoothstep(age, CAST_DURATION * 0.5, SUSTAIN_SETTLE));
        state.w = this.fx.intensity * (Number.isFinite(age) ? surge : 1);
        if (this.dissolveStart !== null) {
            state.x = Math.max(0, 1 - (time - this.dissolveStart) / DISSOLVE_DURATION);
            if (state.x <= 0) return queueMicrotask(() => this.dispose());
        }
        this.updateMode();
        this.updateLight(time);
        this.emitter?.update(state);
    }

    updateMatrixWorld(force) {
        if (this.uniforms && this.parent) this.tick();
        super.updateMatrixWorld(force);
    }

    addToScene() {
        if (!this.field) return;
        game.Levels3DPreview.scene.add(this);
        this.emitter?.start();
        this.playDirectional();
    }

    playDirectional() {
        const type = this.fx.theme.directional;
        const shape = this.region3d.region.shapes?.[0];
        if (!type || !Number.isFinite(this.castStart) || !getQuality().enabled || !["cone", "line"].includes(shape?.type)) return;
        const cone = shape.type === "cone";
        const length = (cone ? shape.radius : shape.length) / factor;
        const rotation = Math.toRadians(shape.rotation ?? 0);
        const origin = new THREE.Vector3(shape.x / factor, this.region3d.bottom + 0.01, shape.y / factor);
        const target = origin.clone().add(new THREE.Vector3(Math.cos(rotation) * length, 0, Math.sin(rotation) * length));
        const color = this.fx.colors !== this.fx.theme.colors ? this.fx.colors : null;
        this.directionalId = playDirectional(type, { origin, target, length, angle: cone ? Math.toRadians(shape.angle) / 2 : 0, radius: cone ? 0 : shape.width / factor / 2, color, intensity: this.fx.intensity, duration: DIRECTIONAL_DURATION });
    }

    stopDirectional() {
        if (this.directionalId) game.Levels3DPreview.particleSystem.stop(this.directionalId);
        this.directionalId = null;
    }

    dissolve() {
        if (!this.uniforms || !this.parent || this.preview) return this.dispose();
        this.dissolveStart = now();
        this.emitter?.stop();
        this.stopDirectional();
    }

    dispose() {
        this.removeFromParent();
        this.stopDirectional();
        this.emitter?.dispose();
        this.emitter = null;
        this.field?.texture.dispose();
        this.traverse((child) => {
            if (child === this.fogMesh) return child.material.dispose();
            if (child === this.flat || child.userData.ownsGeometry) child.geometry.dispose();
            child.material?.dispose();
        });
        this.uniforms = null;
    }

    static clock() {
        return performance.now() / 1000;
    }

    static warm() {
        const uniforms = { uField: { value: null }, uTime: regionTime };
        warm(
            createProjectionMaterial({ fragment: groundFragment, uniforms, blending: "normal" }),
            new THREE.ShaderMaterial({ uniforms: { ...sceneUniforms, ...uniforms, uBounds: { value: new THREE.Vector2() } }, vertexShader: shellVertex, fragmentShader: shellFragment, transparent: true }),
            new THREE.ShaderMaterial({ uniforms: { ...sceneUniforms, ...uniforms, uEdgeWidth: { value: EDGE_WIDTH } }, vertexShader: edgeVertex, fragmentShader: edgeFragment, transparent: true }),
            new THREE.ShaderMaterial({ uniforms: { ...sceneUniforms, ...uniforms }, vertexShader: fogVertex, fragmentShader: fogFragment, transparent: true }),
            new THREE.ShaderMaterial({ uniforms, vertexShader: flatVertex, fragmentShader: flatFragment, transparent: true }),
        );
    }
}
