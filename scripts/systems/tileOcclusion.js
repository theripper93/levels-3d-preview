import * as THREE from "three";
import { factor } from "../main.js";

const CHECK_INTERVAL = 100;
const HOVER_INTERVAL = 50;
const SWEEP_INTERVAL = 1000;
const FEET_OFFSET = 0.1;
const PASS_THROUGH = 0.5;
const OCCLUSION_SPEED = 3;
const SAMPLES = [
    [0, 0],
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
];
const OVERHEAD_CLEARANCE = 1;
const UP = new THREE.Vector3(0, 1, 0);
const _origin = new THREE.Vector3();
const _below = new THREE.Vector3();
const _box = new THREE.Box3();

const FADE_PARS = /* glsl */ `
#ifdef L3D_TILE_FADE
uniform float l3dTileFade;
#endif
#ifdef L3D_BATCH_FADE
varying float vL3dBatchFade;
#endif
`;

const FADE_FRAGMENT = /* glsl */ `
#ifdef L3D_TILE_FADE
float l3dFadeCut = l3dTileFade;
#ifdef L3D_BATCH_FADE
l3dFadeCut = max( l3dFadeCut, vL3dBatchFade );
#endif
if ( l3dFadeCut > 0.0 && l3dFadeCut >= fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;
#endif
`;

const BATCH_FADE_VARYING = /* glsl */ `
#ifdef L3D_BATCH_FADE
varying float vL3dBatchFade;
#endif
`;

const BATCH_COLOR = "vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );";

const BATCH_FADE_COLOR = /* glsl */ `
#ifdef L3D_BATCH_FADE
	vec4 l3dBatchColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.rgb *= l3dBatchColor.rgb;
	vL3dBatchFade = 1.0 - l3dBatchColor.a;
#else
	${BATCH_COLOR}
#endif
`;

const BATCH_FADE_RESET = /* glsl */ `
#ifdef L3D_BATCH_FADE
vL3dBatchFade = 0.0;
#endif
`;

export const BATCH_FADE_DEFINE = "L3D_BATCH_FADE";

export function installTileFadeChunks(THREELIB) {
    const chunks = THREELIB.ShaderChunk;
    chunks.clipping_planes_pars_fragment += FADE_PARS;
    chunks.clipping_planes_fragment = FADE_FRAGMENT + chunks.clipping_planes_fragment;
    chunks.color_pars_vertex += BATCH_FADE_VARYING;
    chunks.color_vertex = BATCH_FADE_RESET + chunks.color_vertex.replace(BATCH_COLOR, BATCH_FADE_COLOR);
}

export function isTileFadeHook(object) {
    return object.onBeforeRender === beforeFade;
}

export function tileCut(tile3d) {
    return tile3d._occlusionState?.cut ?? 0;
}

function tileFadeUniform(material) {
    return (material._l3dTileFade ??= { value: 0 });
}

export function injectTileFade(shader, material) {
    if (!shader.fragmentShader.includes("#include <clipping_planes_fragment>")) return;
    shader.fragmentShader = "#define L3D_TILE_FADE\n" + shader.fragmentShader;
    shader.uniforms.l3dTileFade = tileFadeUniform(material);
}

function beforeFade(renderer, scene, camera, geometry, material) {
    const cut = this._l3dOcclusion?.cut;
    if (!cut || !material) return;
    tileFadeUniform(material).value = cut;
    renderer.state.useProgram(null);
}

function afterFade(renderer, scene, camera, geometry, material) {
    if (!material || !tileFadeUniform(material).value) return;
    tileFadeUniform(material).value = 0;
    renderer.state.useProgram(null);
}

export function occlusionModes(document) {
    let mask = 0;
    for (const mode of document?.occlusion?.modes ?? []) mask |= mode;
    return mask;
}

export function hasTileOcclusion(tile3d) {
    return occlusionModes(tile3d?.tile?.document) !== CONST.OCCLUSION_MODES.NONE;
}

export function isOcclusionFadedHit(entity) {
    return (entity?._occlusionState?.cut ?? 0) >= PASS_THROUGH && !canvas.tiles?.active;
}

function groundEntity(object) {
    for (let o = object; o; o = o.parent) {
        const entity3D = o.userData?.entity3D;
        if (entity3D) return entity3D.embeddedName === "Wall" ? false : entity3D;
    }
    return null;
}

function approach(value, target, step) {
    return target > value ? Math.min(target, value + step) : Math.max(target, value - step);
}

function ease(value) {
    return (1 - Math.cos(Math.PI * value)) * 0.5;
}

export class TileOcclusionSystem {
    constructor(parent) {
        this._parent = parent;
        this.entries = new Map();
        this.raycaster = new THREE.Raycaster();
        this.raycaster.layers.enableAll();
        this.hits = [];
        this.lastSweep = -Infinity;
        this.lastCheck = -Infinity;
        this.lastHover = -Infinity;
        this.signature = "";
        this.hoverKey = "";
    }

    update(delta) {
        const now = performance.now();
        if (now - this.lastSweep > SWEEP_INTERVAL) this.sweep(now);
        if (!this.entries.size) return;
        if (now - this.lastCheck > CHECK_INTERVAL) {
            this.lastCheck = now;
            this.checkTokens();
        }
        if (now - this.lastHover > HOVER_INTERVAL) {
            this.lastHover = now;
            this.checkHover(now);
        }
        const { delay, duration } = CONFIG.Canvas.hoverFade;
        const step = (Math.min(delta, 0.1) * 1000) / Math.max(duration, 1);
        for (const entry of this.entries.values()) {
            if (entry.faded !== entry.hovered && now - entry.hoverTime >= delay) entry.faded = entry.hovered;
            entry.hover = approach(entry.hover, entry.hoverFade && entry.faded ? 1 : 0, step);
            entry.fade = approach(entry.fade, entry.occluded ? 1 : 0, step * OCCLUSION_SPEED);
            entry.state.cut = ease(Math.max(entry.fade, entry.hover)) * (1 - entry.alpha);
        }
    }

    sweep(now) {
        this.lastSweep = now;
        const M = CONST.OCCLUSION_MODES;
        const seen = new Set();
        for (const tile3d of Object.values(this._parent.tiles)) {
            if (!tile3d?.mesh) continue;
            const document = tile3d.tile.document;
            const modes = occlusionModes(document);
            const fades = !!(modes & (M.FADE | M.VISION));
            const hoverFade = modes !== M.NONE && !(modes & M.SURFACE);
            if (!fades && !hoverFade) continue;
            seen.add(tile3d);
            let entry = this.entries.get(tile3d);
            if (!entry) this.entries.set(tile3d, (entry = { tile3d, state: (tile3d._occlusionState ??= { cut: 0 }), occluded: false, hovered: false, faded: false, hoverTime: 0, hover: 0, fade: 0, box: new THREE.Box3(), overheadBox: new THREE.Box3(), overhead: undefined, meshes: [] }));
            entry.fades = fades;
            entry.hoverFade = hoverFade;
            entry.alpha = document.occlusion.alpha ?? 0;
            entry.box.setFromObject(tile3d.mesh);
            if (!entry.overheadBox.equals(entry.box)) entry.overhead = undefined;
            const meshes = [];
            tile3d.forEachRenderMesh((mesh) => {
                meshes.push(mesh);
                if (mesh.onBeforeRender === THREE.Object3D.prototype.onBeforeRender) {
                    mesh.onBeforeRender = beforeFade;
                    mesh.onAfterRender = afterFade;
                }
                mesh._l3dOcclusion = entry.state;
            });
            entry.meshes = meshes;
        }
        for (const [tile3d, entry] of this.entries) {
            if (seen.has(tile3d)) continue;
            this.release(entry);
            this.entries.delete(tile3d);
        }
        this.signature = "";
    }

    release(entry) {
        entry.state.cut = 0;
        for (const mesh of entry.meshes) {
            if (mesh.onBeforeRender === beforeFade) {
                mesh.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
                mesh.onAfterRender = THREE.Object3D.prototype.onAfterRender;
            }
            delete mesh._l3dOcclusion;
        }
    }

    occludableTokens() {
        const tokens = [];
        for (const token of canvas.tokens?._getOccludableTokens() ?? []) {
            const token3d = this._parent.tokens[token.id];
            if (token3d?.mesh?.visible) tokens.push(token3d);
        }
        return tokens;
    }

    checkTokens() {
        const tokens = this.occludableTokens();
        let signature = `${this.entries.size}`;
        for (const token3d of tokens) {
            const p = token3d.mesh.position;
            signature += `|${token3d.token.id}:${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
        }
        if (signature === this.signature) return;
        this.signature = signature;
        const grid = canvas.dimensions.size / factor;
        for (const entry of this.entries.values()) {
            entry.occluded = entry.fades && entry.tile3d.mesh?.visible && tokens.some((token3d) => this.isUnder(token3d, entry, grid));
        }
    }

    isUnder(token3d, entry, grid) {
        const position = token3d.mesh.position;
        const width = (Math.max(token3d.baseDocumentWidth, token3d.baseDocumentHeight) * canvas.grid.size) / factor;
        const y = position.y + grid * FEET_OFFSET;
        const box = entry.box;
        if (box.isEmpty() || box.max.y <= y) return false;
        _box.min.set(position.x - width / 2, y, position.z - width / 2);
        _box.max.set(position.x + width / 2, box.max.y, position.z + width / 2);
        if (!_box.intersectsBox(box)) return false;
        const raycaster = this.raycaster;
        for (const [dx, dz] of SAMPLES) {
            _origin.set(position.x + dx * width, y, position.z + dz * width);
            raycaster.set(_origin, UP);
            raycaster.far = box.max.y - y + 0.01;
            if (this.hitsMeshes(entry)) return true;
        }
        return false;
    }

    hitsMeshes(entry) {
        const hits = this.hits;
        for (const mesh of entry.meshes) {
            if (!mesh.visible) continue;
            hits.length = 0;
            this.raycaster.intersectObject(mesh, false, hits);
            if (hits.length) return true;
        }
        return false;
    }

    checkHover(now) {
        const parent = this._parent;
        const mouse = parent.interactionManager?.mousemove;
        const camera = parent.camera;
        if (!mouse || !camera) return;
        const e = camera.matrixWorld.elements;
        const key = `${mouse.x.toFixed(4)},${mouse.y.toFixed(4)},${e[12].toFixed(3)},${e[13].toFixed(3)},${e[14].toFixed(3)},${e[8].toFixed(4)},${e[10].toFixed(4)}`;
        if (key === this.hoverKey) return;
        this.hoverKey = key;
        const raycaster = this.raycaster;
        raycaster.setFromCamera(mouse, camera);
        raycaster.far = Infinity;
        for (const entry of this.entries.values()) {
            const hovered = entry.hoverFade && !!entry.tile3d.mesh?.visible && raycaster.ray.intersectsBox(entry.box) && this.hitsMeshes(entry) && this.isOverhead(entry);
            if (hovered === entry.hovered) continue;
            entry.hovered = hovered;
            entry.hoverTime = now;
        }
    }

    isOverhead(entry) {
        if (entry.overhead !== undefined) return entry.overhead;
        const box = entry.box;
        const dimensions = canvas.scene.dimensions;
        const clearance = (dimensions.size / factor) * OVERHEAD_CLEARANCE;
        box.getCenter(_origin);
        _origin.y = box.min.y + clearance;
        _below.copy(_origin).sub(UP);
        const hits = this._parent.interactionManager?.computeSightCollisionFrom3DPositions(_origin, _below, "move", false, false, false, true) || [];
        const ground = hits.find((hit) => {
            const entity3D = groundEntity(hit.object);
            return entity3D !== false && entity3D !== entry.tile3d;
        });
        if (!ground) return false;
        entry.overhead = box.min.y - ground.point.y > clearance;
        entry.overheadBox.copy(box);
        return entry.overhead;
    }

    destroy() {
        for (const entry of this.entries.values()) this.release(entry);
        this.entries.clear();
    }
}
