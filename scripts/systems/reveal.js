import * as THREE from "three";
import { factor } from "../main.js";

export const REVEAL_SLOTS = 6;
const MODULE_ID = "levels-3d-preview";
const CHECK_INTERVAL = 120;
const SWEEP_INTERVAL = 1000;
const HOLD_TIME = 350;
const OPEN_SPEED = 4;
const CLOSE_SPEED = 3;
const PADDING_GRIDS = 3;
const MAX_RADIUS = 4;
const FLOOR_OFFSET = 0.08;
const FLOOR_SOFT = 0.12;
const DEPTH_SOFT = 0.5;
const PLANE_TILT = 0.25;
const INNER_EDGE = "0.55";
const VIEW_POSITION = /varying\s+vec3\s+vViewPosition\s*;/;
const VIEW_TO_WORLD = "( ( vec4( - vViewPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz";
const RAY_SAMPLES = [
    [0, 0.5],
    [0, 0.85],
    [0, 0.2],
    [-0.35, 0.5],
    [0.35, 0.5],
];

const _ndc = new THREE.Vector4();
const _point = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _size = new THREE.Vector2();
const _direction = new THREE.Vector3();

export const revealUniforms = {
    uRevealCount: { value: 0 },
    uRevealViewProj: { value: new THREE.Matrix4() },
    uRevealCamPos: { value: new THREE.Vector3(1e9, 1e9, 1e9) },
    uRevealAspect: { value: 1 },
    uRevealScreen: { value: Array.from({ length: REVEAL_SLOTS }, () => new THREE.Vector4()) },
    uRevealPlane: { value: Array.from({ length: REVEAL_SLOTS }, () => new THREE.Vector4()) },
    uRevealBody: { value: Array.from({ length: REVEAL_SLOTS }, () => new THREE.Vector4()) },
};

const REVEAL_PARS = /* glsl */ `
#ifdef L3D_REVEAL
uniform bool l3dReveal;
uniform int uRevealCount;
uniform mat4 uRevealViewProj;
uniform vec3 uRevealCamPos;
uniform float uRevealAspect;
uniform vec4 uRevealScreen[ ${REVEAL_SLOTS} ];
uniform vec4 uRevealPlane[ ${REVEAL_SLOTS} ];
uniform vec4 uRevealBody[ ${REVEAL_SLOTS} ];
void l3dRevealClip( vec3 l3dPos ) {
    if ( !l3dReveal || uRevealCount == 0 || any( greaterThan( abs( cameraPosition - uRevealCamPos ), vec3( 1e-3 ) ) ) ) return;
    vec4 l3dClip = uRevealViewProj * vec4( l3dPos, 1.0 );
    if ( l3dClip.w <= 0.0 ) return;
    vec2 l3dNdc = l3dClip.xy / l3dClip.w;
    float l3dCut = 0.0;
    for ( int i = 0; i < ${REVEAL_SLOTS}; i ++ ) {
        if ( i >= uRevealCount ) break;
        vec4 l3dScreen = uRevealScreen[ i ];
        float l3dRadius = length( ( l3dNdc - l3dScreen.xy ) * vec2( uRevealAspect, 1.0 ) ) / l3dScreen.z;
        if ( l3dRadius >= 1.0 ) continue;
        vec4 l3dPlane = uRevealPlane[ i ];
        vec4 l3dBody = uRevealBody[ i ];
        float l3dMask = ( 1.0 - smoothstep( ${INNER_EDGE}, 1.0, l3dRadius ) ) * smoothstep( 0.0, l3dBody.y, dot( l3dPos, l3dPlane.xyz ) - l3dPlane.w ) * smoothstep( l3dBody.x, l3dBody.x + l3dBody.z, l3dPos.y ) * l3dScreen.w;
        l3dCut = max( l3dCut, l3dMask );
    }
    if ( l3dCut > 0.0 && l3dCut >= fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;
}
#endif
`;

const REVEAL_FRAGMENT = /* glsl */ `
#ifdef L3D_REVEAL
l3dRevealClip( L3D_REVEAL );
#endif
`;

export function installRevealChunks(THREELIB) {
    const chunks = THREELIB.ShaderChunk;
    chunks.clipping_planes_pars_fragment += REVEAL_PARS;
    chunks.clipping_planes_fragment = REVEAL_FRAGMENT + chunks.clipping_planes_fragment;
}

export function revealUniform(material) {
    return (material._l3dReveal ??= { value: !!material.userData?.l3dReveal });
}

export function markRevealable(material) {
    if (!material || material.userData?.l3dReveal) return;
    material.userData.l3dReveal = true;
    revealUniform(material).value = true;
}

export function injectReveal(shader, material) {
    if (!shader.fragmentShader.includes("#include <clipping_planes_fragment>")) return;
    const world = shader.vertexShader.includes("#include <fog_vertex>") && !shader.vertexShader.includes("#define FOW_FROM_OFFSET");
    if (!world && !VIEW_POSITION.test(shader.fragmentShader)) return;
    shader.fragmentShader = `#define L3D_REVEAL ${world ? "vWorldPositionFoW" : VIEW_TO_WORLD}\n${shader.fragmentShader}`;
    Object.assign(shader.uniforms, revealUniforms);
    shader.uniforms.l3dReveal = revealUniform(material);
}

const _clip = new THREE.Vector4();
const PASS_THROUGH = 0.5;

export function revealMaskAt(point) {
    const count = revealUniforms.uRevealCount.value;
    if (!count) return 0;
    _clip.set(point.x, point.y, point.z, 1).applyMatrix4(revealUniforms.uRevealViewProj.value);
    if (_clip.w <= 0) return 0;
    const x = _clip.x / _clip.w;
    const y = _clip.y / _clip.w;
    const aspect = revealUniforms.uRevealAspect.value;
    const inner = Number(INNER_EDGE);
    let cut = 0;
    for (let i = 0; i < count; i++) {
        const screen = revealUniforms.uRevealScreen.value[i];
        const radius = Math.hypot((x - screen.x) * aspect, y - screen.y) / screen.z;
        if (radius >= 1) continue;
        const plane = revealUniforms.uRevealPlane.value[i];
        const body = revealUniforms.uRevealBody.value[i];
        const depth = plane.x * point.x + plane.y * point.y + plane.z * point.z - plane.w;
        const mask = (1 - THREE.MathUtils.smoothstep(radius, inner, 1)) * THREE.MathUtils.smoothstep(depth, 0, body.y) * THREE.MathUtils.smoothstep(point.y, body.x, body.x + body.z) * screen.w;
        cut = Math.max(cut, mask);
    }
    return cut;
}

export function revealActive() {
    return revealUniforms.uRevealCount.value > 0;
}

export function isRevealedHit(hit, proxy = false) {
    if (!revealActive()) return false;
    const material = Array.isArray(hit.object?.material) ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object?.material;
    if (!proxy && (!material?.userData?.l3dReveal || !revealUniform(material).value)) return false;
    return revealMaskAt(hit.point) >= PASS_THROUGH;
}

function isRevealable(object) {
    const material = object.material;
    if (!Array.isArray(material)) return !!material?.userData?.l3dReveal && material.visible && material.colorWrite;
    return material.some((entry) => entry?.userData?.l3dReveal && entry.visible);
}

function markObject(object) {
    if (!object.material) return;
    if (Array.isArray(object.material)) object.material.forEach(markRevealable);
    else markRevealable(object.material);
}

function easeOpen(value) {
    return value * value * (3 - 2 * value);
}

export class RevealSystem {
    constructor(parent) {
        this._parent = parent;
        this.states = new Map();
        this.targets = [];
        this.raycaster = new THREE.Raycaster();
        this.raycaster.layers.enableAll();
        this.raycaster.firstHitOnly = true;
        this.hits = [];
        this.lastSweep = -Infinity;
        this.scene = null;
    }

    get enabled() {
        return !!canvas.scene && game.settings.get(MODULE_ID, "revealTokens") && !this._parent.firstPersonMode;
    }

    update(delta) {
        const uniforms = revealUniforms;
        const tokens = this.enabled ? this.controlledTokens() : [];
        const now = performance.now();
        if (tokens.length && now - this.lastSweep > SWEEP_INTERVAL) this.sweep(now);
        const seen = new Set();
        for (const token3d of tokens) {
            const id = token3d.token.id;
            seen.add(id);
            let state = this.states.get(id);
            if (!state) this.states.set(id, (state = { open: 0, lastHit: -Infinity, nextCheck: 0, token3d }));
            state.token3d = token3d;
            state.controlled = true;
            if (now >= state.nextCheck) {
                state.nextCheck = now + CHECK_INTERVAL;
                if (this.isOccluded(token3d)) state.lastHit = now;
            }
        }
        const step = Math.min(delta, 0.1);
        for (const [id, state] of this.states) {
            if (!seen.has(id)) state.controlled = false;
            const target = state.controlled && now - state.lastHit < HOLD_TIME ? 1 : 0;
            state.open = target > state.open ? Math.min(1, state.open + step * OPEN_SPEED) : Math.max(0, state.open - step * CLOSE_SPEED);
            if (!state.open && !state.controlled) this.states.delete(id);
        }
        let count = 0;
        if (this.states.size) {
            const camera = this._parent.camera;
            camera.updateMatrixWorld();
            uniforms.uRevealViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            uniforms.uRevealCamPos.value.setFromMatrixPosition(camera.matrixWorld);
            this._parent.renderer.getDrawingBufferSize(_size);
            uniforms.uRevealAspect.value = _size.y ? _size.x / _size.y : 1;
            for (const state of this.states.values()) {
                if (count >= REVEAL_SLOTS) break;
                if (state.open <= 0 || !state.token3d.mesh) continue;
                if (this.writeSlot(count, state, camera)) count++;
            }
        }
        uniforms.uRevealCount.value = count;
    }

    controlledTokens() {
        const tokens = [];
        for (const placeable of canvas.tokens?.controlled ?? []) {
            const token3d = this._parent.tokens[placeable.id];
            if (token3d?.mesh?.visible) tokens.push(token3d);
        }
        return tokens;
    }

    tokenBody(token3d) {
        const position = token3d.mesh.position;
        const width = (Math.max(token3d.baseDocumentWidth, token3d.baseDocumentHeight) * canvas.grid.size) / factor;
        const height = Math.max(token3d.d || width, 0.01);
        return { position, width, height };
    }

    writeSlot(index, state, camera) {
        const uniforms = revealUniforms;
        const { position, width, height } = this.tokenBody(state.token3d);
        const viewProj = uniforms.uRevealViewProj.value;
        _mid.set(position.x, position.y + height / 2, position.z);
        _ndc.set(_mid.x, _mid.y, _mid.z, 1).applyMatrix4(viewProj);
        if (_ndc.w <= 0) return false;
        const cx = _ndc.x / _ndc.w;
        const cy = _ndc.y / _ndc.w;
        _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        const aspect = uniforms.uRevealAspect.value;
        const grid = canvas.dimensions.size / factor;
        const worldRadius = width / 2 + grid * PADDING_GRIDS;
        const extentX = this.projectedOffset(_right, worldRadius, viewProj, cx, cy, aspect);
        const extentY = this.projectedOffset(_up, worldRadius, viewProj, cx, cy, aspect);
        const radius = Math.min(Math.max(extentX, extentY), MAX_RADIUS);
        const open = easeOpen(state.open);
        uniforms.uRevealScreen.value[index].set(cx, cy, radius * (0.4 + 0.6 * open), open);
        if (camera.isOrthographicCamera) camera.getWorldDirection(_direction).negate();
        else _direction.subVectors(uniforms.uRevealCamPos.value, _mid);
        _direction.y *= PLANE_TILT;
        if (_direction.lengthSq() < 1e-8) _direction.set(0, 1, 0);
        _direction.normalize();
        uniforms.uRevealPlane.value[index].set(_direction.x, _direction.y, _direction.z, _direction.dot(_mid));
        uniforms.uRevealBody.value[index].set(position.y + grid * FLOOR_OFFSET, Math.max(width, grid) * DEPTH_SOFT, grid * FLOOR_SOFT, 0);
        return true;
    }

    projectedOffset(axis, length, viewProj, cx, cy, aspect) {
        _ndc.set(_mid.x + axis.x * length, _mid.y + axis.y * length, _mid.z + axis.z * length, 1).applyMatrix4(viewProj);
        if (_ndc.w <= 0) return MAX_RADIUS;
        return Math.hypot((_ndc.x / _ndc.w - cx) * aspect, _ndc.y / _ndc.w - cy);
    }

    sweep(now) {
        this.lastSweep = now;
        const parent = this._parent;
        const targets = [];
        for (const tile3d of Object.values(parent.tiles)) {
            if (!tile3d?.mesh) continue;
            const skip = new Set([tile3d.controlledBox, tile3d.sightMesh, tile3d._decalCone, tile3d.scatterField?.pick].filter(Boolean));
            const visit = (object) => {
                if (skip.has(object) || (object.userData.entity3D && object.userData.entity3D !== tile3d)) return;
                markObject(object);
                for (const layer of object.mapMakerTerrain?.cover?.layers ?? []) markObject(layer.mesh);
                for (const child of object.children) visit(child);
            };
            visit(tile3d.mesh);
            const box = new THREE.Box3().setFromObject(tile3d.mesh);
            targets.push({ object: tile3d.mesh, root: tile3d.mesh, box, proxy: false });
            if (tile3d.scatterField && tile3d.sightMesh) targets.push({ object: tile3d.sightMesh, root: tile3d.mesh, box, proxy: true });
        }
        for (const wall3d of Object.values(parent.walls)) {
            if (!wall3d?.mesh) continue;
            wall3d.mesh.traverse(markObject);
            targets.push({ object: wall3d.mesh, root: wall3d.mesh, box: new THREE.Box3().setFromObject(wall3d.mesh), proxy: false });
        }
        parent.kitBatcher?.root.traverse(markObject);
        this.targets = targets;
    }

    isOccluded(token3d) {
        const { position, width, height } = this.tokenBody(token3d);
        const camera = this._parent.camera;
        const origin = camera.getWorldPosition(_point.clone());
        _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        const floorY = position.y + (canvas.dimensions.size / factor) * FLOOR_OFFSET;
        const clipHeight = game.Levels3DPreview.BuildPanel?._clipHeight ?? Infinity;
        const raycaster = this.raycaster;
        const shownRoots = new Map();
        for (const [side, up] of RAY_SAMPLES) {
            _mid.set(position.x + _right.x * width * side, position.y + height * up, position.z + _right.z * width * side);
            const distance = origin.distanceTo(_mid);
            if (distance < 1e-4) continue;
            raycaster.set(origin, _direction.subVectors(_mid, origin).divideScalar(distance));
            raycaster.far = distance - 0.01;
            for (const target of this.targets) {
                if (!target.box.isEmpty() && !raycaster.ray.intersectsBox(target.box)) continue;
                let shown = shownRoots.get(target.root);
                if (shown === undefined) shownRoots.set(target.root, (shown = this.isShown(target.root)));
                if (!shown) continue;
                const hits = this.hits;
                hits.length = 0;
                raycaster.intersectObject(target.object, true, hits);
                for (const hit of hits) {
                    if (hit.distance >= raycaster.far || hit.point.y <= floorY || hit.point.y > clipHeight) continue;
                    if (target.proxy || (isRevealable(hit.object) && this.isShown(hit.object))) return true;
                }
            }
        }
        return false;
    }

    isShown(object) {
        const scene = this._parent.scene;
        while (object) {
            if (!object.visible) return false;
            if (object === scene) return true;
            object = object.parent;
        }
        return false;
    }

    destroy() {
        this.states.clear();
        this.targets = [];
        revealUniforms.uRevealCount.value = 0;
    }
}
