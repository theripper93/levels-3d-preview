import * as THREE from "three";
import { factor, MODULE_ID } from "../main.js";
import { atmosphereFogUniforms } from "./fog.js";
import { realisticWater } from "../shaders/water/realisticWater.js";
import { fbm, smooth } from "../helpers/mapMakerTerrain.js";
import { extraSurfaces } from "../helpers/topDownRender.js";
import { elevationFloor } from "../helpers/elevationFloor.js";

export const EDGE_MODES = ["fade", "island", "diorama", "blueprint"];
export const EDGE_OPTIONS = ["none", ...EDGE_MODES, "legacy"];
export const BACKDROPS = ["none", "hills", "mountains"];
const GROUND_EXTENT = 1000;
const GROUND_COLOR = "#59633f";

const FADE_RANGE = { fade: 0.9, island: 1.1, diorama: 0, blueprint: 1.2 };
const BLUEPRINT = { paper: "#3d352d", minor: "rgba(236,226,206,0.3)", major: "rgba(240,232,214,0.75)", count: 5, sheet: 1024 };
const TARGET_SLACK = 0.1;
const DISTANCE_LIMIT = 2.2;
const RING_SEGMENTS = 384;
const DIORAMA_SAMPLES = 96;
const SHORE_WIDTH = 2.2;
const SHORE_DEPTH = 2.8;
const OUTSKIRT_REACH = 1.5;
const OUTSKIRT_FADE = 1.4;
const OUTSKIRT_STEPS = 40;
const OUTSKIRT_GROWTH = 1.4;
const OUTSKIRT_BLUR = 1.2;
const CALM_SEA ={ clarity: 0.3, opacity: 1, wave_strength: 0.45, wave_scale: 0.7, ripple_size: 0.25, foam: 0.35 };
const BACKDROP_SHAPES = {
    hills: { height: 0.045, ridged: false, layers: [{ radius: 1, haze: 0.8 }, { radius: 0.82, haze: 0.62 }] },
    mountains: { height: 0.11, ridged: true, layers: [{ radius: 1, haze: 0.82 }, { radius: 0.8, haze: 0.6 }] },
};

let active = null;
let buildId = 0;

const rebuildForTerrain = foundry.utils.debounce(() => {
    const L = game.Levels3DPreview;
    if (!L?._active) return;
    if (!active) return L.table && L._tableFloor !== elevationFloor() && L.createTable();
    if (!refreshOutskirts()) L.createTable();
}, 1500);

function refreshOutskirts() {
    if (active.mode !== "fade" || !active.outskirts?.length) return false;
    const states = terrainStates();
    if (states.length !== active.outskirts.length) return false;
    if (active.outskirts.some(({ mesh, state }) => !states.includes(state) || mesh.material !== state.material)) return false;
    for (const { mesh, state, size } of active.outskirts) {
        const { geometry, heightAt } = outskirtGeometry(state, size);
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        state.setCoverOutskirts(heightAt, waterReach(size));
    }
    return true;
}

Hooks.on("updateTile", (tile) => {
    if (tile.flags?.[MODULE_ID]?.mapMakerMesh?.k === "terrain") rebuildForTerrain();
});

export function isEdgeMode(option) {
    return EDGE_MODES.includes(option);
}

export function clearMapEdge() {
    if (!active) return;
    const { group, parent, water, onChange, coverStates, outskirts } = active;
    coverStates.forEach((state) => state.setCoverOutskirts(null));
    outskirts.forEach(({ mesh }) => extraSurfaces.delete(mesh));
    parent.scene.remove(group);
    if (water) water._destroyed = true;
    parent.controls?.removeEventListener("change", onChange);
    group.traverse((o) => {
        o.geometry?.dispose();
        if (!o.userData.sharedMaterial) o.material?.dispose?.();
        o.userData.disposeMap?.dispose();
    });
    atmosphereFogUniforms.atmoEdgeFade.value = 0;
    active = null;
}

export function getMapEdge(scene = canvas.scene) {
    return scene.getFlag(MODULE_ID, "mapEdge") ?? "legacy";
}

export async function buildMapEdge(parent, option, groundY) {
    const build = ++buildId;
    clearMapEdge();
    const backdrop = canvas.scene.getFlag(MODULE_ID, "horizonBackdrop") ?? "none";
    if (!isEdgeMode(option) && backdrop === "none") return setTerrainShore(false);
    await terrainLoaded();
    if (build !== buildId) return;
    const rect = sceneRect();
    const seaY = setTerrainShore(option === "island");
    const border = borderHeights(rect, groundY, DIORAMA_SAMPLES);
    const levels = border.map((p) => p[2]).sort((a, b) => a - b);
    const edgeY = option === "island" && seaY !== null ? seaY : levels[Math.floor(levels.length / 2)];
    const ground = option === "fade" ? await buildGround(parent, Math.min(edgeY, groundY)) : null;
    if (build !== buildId) return ground?.geometry.dispose();
    clearMapEdge();
    const halfDiag = Math.hypot(rect.w, rect.h) / 2;
    const size = Math.max(rect.w, rect.h);
    const group = new THREE.Group();
    group.userData.noIntersect = true;
    active = { group, parent, rect, groundY, mode: option, layers: [], coverStates: [], outskirts: [], onChange: () => clampCamera(parent, rect, halfDiag) };

    if (isEdgeMode(option)) {
        atmosphereFogUniforms.atmoEdgeRect.value.set(rect.x, rect.z, rect.x + rect.w, rect.z + rect.h);
        atmosphereFogUniforms.atmoEdgeFade.value = FADE_RANGE[option] * size;
        parent.controls?.addEventListener("change", active.onChange);
        active.onChange();
    }
    if (ground) {
        const outskirts = terrainStates().map((state) => buildOutskirts(state, size)).filter(Boolean);
        if (outskirts.length) {
            ground.geometry.dispose();
            ground.material.dispose();
            atmosphereFogUniforms.atmoEdgeFade.value = OUTSKIRT_FADE * size;
            group.add(...outskirts);
        } else group.add(ground);
    }
    if (option === "island") active.water = buildSea(parent, group, rect, edgeY, halfDiag);
    if (option === "diorama" || option === "blueprint") {
        const bottom = buildDiorama(group, rect, border, Math.min(...levels), size, option === "blueprint");
        if (option === "blueprint") group.add(buildBlueprintSheet(parent, rect, bottom));
    }
    if (BACKDROP_SHAPES[backdrop]) buildBackdrop(group, rect, edgeY, halfDiag, BACKDROP_SHAPES[backdrop]);
    parent.scene.add(group);
}

export function terrainLoaded() {
    return new Promise((resolve) => {
        let tries = 0;
        const check = () => {
            const tiles = game.Levels3DPreview.tiles ?? {};
            const pending = canvas.scene.tiles.some((d) => d.flags?.[MODULE_ID]?.mapMakerMesh?.k === "terrain" && !tiles[d.id]?._loaded);
            if (pending && tries++ < 60) return setTimeout(check, 500);
            resolve();
        };
        check();
    });
}

export function updateMapEdge(state, sky) {
    const blend = active && (isEdgeMode(active.mode) || active.layers.length) ? 1 : 0;
    if (sky?.material?.uniforms?.edgeBlend) sky.material.uniforms.edgeBlend.value = blend;
    if (!active) return;
    for (const layer of active.layers) {
        layer.material.uniforms.fogTint.value.copy(state.fogColor);
        layer.material.uniforms.shade.value = THREE.MathUtils.lerp(0.42, 1, layer.userData.haze);
    }
    if (active.strata) active.strata.uniforms.fogTint.value.copy(state.fogColor);
}

function sceneRect() {
    const d = canvas.scene.dimensions;
    return { x: d.sceneX / factor, z: d.sceneY / factor, w: d.sceneWidth / factor, h: d.sceneHeight / factor };
}

function clampCamera(parent, rect, halfDiag) {
    const { controls, camera } = parent;
    if (!controls || parent.firstPersonMode) return;
    const sx = rect.w * TARGET_SLACK;
    const sz = rect.h * TARGET_SLACK;
    const t = controls.target;
    const x = THREE.MathUtils.clamp(t.x, rect.x - sx, rect.x + rect.w + sx);
    const z = THREE.MathUtils.clamp(t.z, rect.z - sz, rect.z + rect.h + sz);
    if (x !== t.x || z !== t.z) {
        camera.position.x += x - t.x;
        camera.position.z += z - t.z;
        t.x = x;
        t.z = z;
    }
    const limit = halfDiag * DISTANCE_LIMIT;
    const offset = camera.position.clone().sub(t);
    if (offset.length() > limit) camera.position.copy(t).add(offset.setLength(limit));
}

async function buildGround(parent, groundY) {
    const texture = canvas.scene.getFlag(MODULE_ID, "edgeTexture") ?? "";
    const color = new THREE.Color(canvas.scene.getFlag(MODULE_ID, "edgeColor") ?? GROUND_COLOR);
    const geometry = new THREE.PlaneGeometry(GROUND_EXTENT, GROUND_EXTENT).rotateX(-Math.PI / 2);
    const repeat = (GROUND_EXTENT * factor) / canvas.scene.dimensions.size / 4;
    geometry.attributes.uv.array.forEach((v, i, arr) => (arr[i] = v * repeat));
    let material = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
    if (texture) {
        const loaded = await parent.helpers.autodetectTextureOrMaterial(texture);
        if (loaded?.isTexture) {
            loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
            material.map = loaded;
        } else if (loaded?.isMaterial) {
            material = loaded;
            material.color = color;
        }
    }
    material.polygonOffset = true;
    material.polygonOffsetFactor = 10;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1e20;
    const center = parent.canvasCenter;
    mesh.position.set(center.x, groundY - 0.011, center.z);
    return mesh;
}

function outskirtAxis(length, samples, reach, step) {
    const fine = length / (samples - 1);
    const outer = [];
    for (let d = fine, gap = fine; d < reach + step; gap = Math.min(step, gap * OUTSKIRT_GROWTH), d += gap) outer.push(d);
    const values = outer.map((d) => -d).reverse();
    for (let k = 0; k < samples; k++) values.push(k === samples - 1 ? length : k * fine);
    for (const d of outer) values.push(length + d);
    return { values, offset: outer.length };
}

function outskirtHeight(state, reach) {
    const { w, h } = state.data;
    const grid = canvas.scene.grid.size;
    const edges = [];
    for (let t = 0; t <= 1; t += 0.02) edges.push(state.heightAt(t * w, 0), state.heightAt(t * w, h), state.heightAt(0, t * h), state.heightAt(w, t * h));
    edges.sort((a, b) => a - b);
    const median = edges[Math.floor(edges.length / 2)];
    return (x, z) => {
        const cx = Math.clamp(x, 0, w);
        const cz = Math.clamp(z, 0, h);
        const d = Math.hypot(x - cx, z - cz);
        const r = d * OUTSKIRT_BLUR;
        let edge = state.heightAt(cx, cz);
        if (r > 0) {
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * Math.PI * 2;
                edge += state.heightAt(Math.clamp(cx + Math.cos(a) * r, 0, w), Math.clamp(cz + Math.sin(a) * r, 0, h));
            }
            edge /= 9;
        }
        const base = edge + (median - edge) * smooth(d / (reach * 0.3));
        const hills = grid * 1.6 * (fbm(x / (grid * 7), z / (grid * 7), 41) - 0.35) * smooth(d / (grid * 4));
        const ridge = 1 - Math.abs(fbm(x / (grid * 16), z / (grid * 16), 53) * 2 - 1);
        const mountains = grid * 9 * ridge * ridge * smooth((d - reach * 0.35) / (reach * 0.4)) * (1 - smooth((d - reach * 0.8) / (reach * 0.2)));
        return base + hills + mountains;
    };
}

function outskirtGeometry(state, sizeWorld) {
    const { w, h } = state.data;
    const grid = canvas.scene.grid.size;
    const reach = sizeWorld * factor * OUTSKIRT_REACH;
    const step = Math.max(grid, reach / OUTSKIRT_STEPS);
    const { values: xs, offset: ox } = outskirtAxis(w, state.nx, reach, step);
    const { values: zs, offset: oz } = outskirtAxis(h, state.ny, reach, step);
    const heightAt = outskirtHeight(state, reach);
    const s = state.scale;
    const positions = [];
    const uvs = [];
    for (const z of zs) {
        for (const x of xs) {
            if (x > 0 && x < w && z > 0 && z < h) {
                positions.push(0, 0, 0);
                uvs.push(0, 0);
                continue;
            }
            positions.push(x * s, heightAt(x, z) * s, z * s);
            uvs.push(Math.clamp(x, 0, w) / w, Math.clamp(z, 0, h) / h);
        }
    }
    const cols = xs.length;
    const index = [];
    for (let j = 0; j < zs.length - 1; j++) {
        const innerZ = zs[j] >= 0 && zs[j + 1] <= h;
        for (let i = 0; i < cols - 1; i++) {
            if (innerZ && xs[i] >= 0 && xs[i + 1] <= w) continue;
            const a = j * cols + i, b = a + 1, c = a + cols, e = c + 1;
            index.push(a, c, b, b, c, e);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute("normal").array;
    const surface = state.surfaceMesh.geometry.getAttribute("normal").array;
    const seam = (i, j) => {
        const k = ((j + oz) * cols + i + ox) * 3, t = (j * state.nx + i) * 3;
        normals[k] = surface[t];
        normals[k + 1] = surface[t + 1];
        normals[k + 2] = surface[t + 2];
    };
    for (let i = 0; i < state.nx; i++) {
        seam(i, 0);
        seam(i, state.ny - 1);
    }
    for (let j = 0; j < state.ny; j++) {
        seam(0, j);
        seam(state.nx - 1, j);
    }
    return { geometry, heightAt };
}

function waterReach(sizeWorld) {
    return sizeWorld * factor * OUTSKIRT_FADE;
}

function buildOutskirts(state, sizeWorld) {
    if (!state.material || !state.surfaceMesh) return null;
    const { geometry, heightAt } = outskirtGeometry(state, sizeWorld);
    state.setCoverOutskirts(heightAt, waterReach(sizeWorld));
    active?.coverStates.push(state);
    const mesh = new THREE.Mesh(geometry, state.material);
    active?.outskirts.push({ mesh, state, size: sizeWorld });
    extraSurfaces.add(mesh);
    state.surfaceMesh.updateWorldMatrix(true, false);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(state.surfaceMesh.matrixWorld);
    mesh.frustumCulled = false;
    mesh.onBeforeRender = () => {
        if (mesh.matrix.equals(state.surfaceMesh.matrixWorld)) return;
        mesh.matrix.copy(state.surfaceMesh.matrixWorld);
        mesh.matrixWorld.copy(mesh.matrix);
        mesh.modelViewMatrix.multiplyMatrices(game.Levels3DPreview.camera.matrixWorldInverse, mesh.matrixWorld);
        mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix);
    };
    mesh.receiveShadow = true;
    mesh.userData.sharedMaterial = true;
    return mesh;
}

function buildSea(parent, group, rect, groundY, halfDiag) {
    const extent = halfDiag * 8;
    const inset = (canvas.scene.grid.size * SHORE_WIDTH * 1.5) / factor;
    const hw = Math.max(rect.w / 2 - inset, 0.001);
    const hh = Math.max(rect.h / 2 - inset, 0.001);
    const shape = new THREE.Shape([new THREE.Vector2(-extent / 2, -extent / 2), new THREE.Vector2(extent / 2, -extent / 2), new THREE.Vector2(extent / 2, extent / 2), new THREE.Vector2(-extent / 2, extent / 2)]);
    shape.holes.push(new THREE.Path([new THREE.Vector2(-hw, -hh), new THREE.Vector2(-hw, hh), new THREE.Vector2(hw, hh), new THREE.Vector2(hw, -hh)]));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, transparent: true, side: THREE.DoubleSide }));
    mesh.position.set(rect.x + rect.w / 2, groundY - 0.0005, rect.z + rect.h / 2);
    const bed = new THREE.Mesh(mesh.geometry.clone(), new THREE.MeshBasicMaterial({ color: new THREE.Color(realisticWater.presets.ocean.deep_color).multiplyScalar(0.7) }));
    bed.position.copy(mesh.position).y -= 0.004;
    group.add(mesh, bed);
    const entity = { bb: { width: extent, depth: extent, height: 0.001 }, mesh, shaders: {} };
    const ocean = realisticWater.presets.ocean;
    entity.shaders.realisticWater = { enabled: true, preset: "ocean", style: 0, contained: false, flow_direction: 0, ...ocean, ...CALM_SEA };
    parent.shaderHandler.applyShader(mesh, entity, entity.shaders);
    return entity;
}

function ridge(angle, seed, ridged) {
    let v = 0;
    let amp = 1;
    let freq = 3;
    for (let o = 0; o < 5; o++) {
        const s = Math.sin(angle * freq + seed * (o + 1) * 1.7) * 0.6 + Math.sin(angle * freq * 1.93 + seed * 3.1 + o) * 0.4;
        v += (ridged ? 1 - Math.abs(s) : s * 0.5 + 0.5) * amp;
        amp *= 0.5;
        freq *= 2.1;
    }
    return v / 1.94;
}

const BACKDROP_VERTEX = `
attribute float lift;
varying float vLift;
void main() {
    vLift = lift;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BACKDROP_FRAGMENT = `
uniform vec3 fogTint;
uniform float shade;
varying float vLift;
void main() {
    gl_FragColor = vec4(fogTint * mix(1.0, shade, smoothstep(0.0, 0.7, vLift)), 1.0);
}`;

function buildBackdrop(group, rect, groundY, halfDiag, shape) {
    const cx = rect.x + rect.w / 2;
    const cz = rect.z + rect.h / 2;
    const base = halfDiag * 3.2;
    shape.layers.forEach(({ radius, haze }, li) => {
        const r = base * radius;
        const height = r * shape.height;
        const positions = [];
        const lift = [];
        const index = [];
        for (let i = 0; i <= RING_SEGMENTS; i++) {
            const a = (i / RING_SEGMENTS) * Math.PI * 2;
            const n = ridge(a, li * 11 + 3, shape.ridged);
            const h = height * (0.35 + 0.65 * n ** (shape.ridged ? 1.6 : 1));
            const x = cx + Math.cos(a) * r;
            const z = cz + Math.sin(a) * r;
            positions.push(x, groundY - r * 0.02, z, x, groundY + h, z);
            lift.push(0, h / height);
            if (i < RING_SEGMENTS) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("lift", new THREE.Float32BufferAttribute(lift, 1));
        geometry.setIndex(index);
        const material = new THREE.ShaderMaterial({
            uniforms: { fogTint: { value: new THREE.Color(0.7, 0.75, 0.8) }, shade: { value: 0.6 } },
            vertexShader: BACKDROP_VERTEX,
            fragmentShader: BACKDROP_FRAGMENT,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.haze = haze;
        mesh.renderOrder = -1e19;
        group.add(mesh);
        active.layers.push(mesh);
    });
}

function terrainStates() {
    const states = [];
    for (const mesh of terrainTargets()) mesh.traverse((o) => o.mapMakerTerrain && states.push(o.mapMakerTerrain));
    return states;
}

function setTerrainShore(enabled) {
    const grid = canvas.scene.grid.size;
    const shore = enabled ? { width: grid * SHORE_WIDTH, depth: grid * SHORE_DEPTH } : null;
    let seaY = null;
    for (const state of terrainStates()) {
        state.setShore(shore);
        if (seaY === null && state.surfaceMesh) seaY = state.surfaceMesh.localToWorld(new THREE.Vector3()).y;
    }
    return seaY;
}

function terrainTargets() {
    return Object.values(game.Levels3DPreview.tiles ?? {})
        .filter((t) => t?.tile?.document?.flags?.[MODULE_ID]?.mapMakerMesh?.k === "terrain" && t.mesh)
        .map((t) => t.mesh);
}

function borderHeights(rect, groundY, count) {
    const targets = terrainTargets();
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const from = new THREE.Vector3();
    const points = [];
    const perimeter = [
        [rect.x, rect.z, rect.w, 0],
        [rect.x + rect.w, rect.z, 0, rect.h],
        [rect.x + rect.w, rect.z + rect.h, -rect.w, 0],
        [rect.x, rect.z + rect.h, 0, -rect.h],
    ];
    for (const [x0, z0, dx, dz] of perimeter) {
        for (let i = 0; i < count; i++) {
            const t = i / count;
            const inset = 0.0005;
            const x = x0 + dx * t;
            const z = z0 + dz * t;
            from.set(THREE.MathUtils.clamp(x, rect.x + inset, rect.x + rect.w - inset), groundY + 1000, THREE.MathUtils.clamp(z, rect.z + inset, rect.z + rect.h - inset));
            ray.set(from, down);
            const hit = targets.length ? ray.intersectObjects(targets, true)[0] : null;
            points.push([x, z, hit ? hit.point.y : groundY]);
        }
    }
    points.push(points[0]);
    return points;
}

const STRATA_VERTEX = `
varying vec3 vWorld;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}`;

const STRATA_FRAGMENT = `
uniform float topY;
uniform float depth;
uniform vec3 fogTint;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
void main() {
    float along = vWorld.x + vWorld.z;
    float d = (topY - vWorld.y) / depth;
    float wobble = noise(vec2(along * 6.0, 0.0)) * 0.08 + noise(vec2(along * 23.0, 3.0)) * 0.02;
    float band = d + wobble;
    vec3 soil = vec3(0.30, 0.20, 0.12);
    vec3 clay = vec3(0.42, 0.30, 0.19);
    vec3 rock = vec3(0.33, 0.32, 0.31);
    vec3 col = mix(soil, clay, smoothstep(0.12, 0.2, band));
    col = mix(col, soil * 0.8, smoothstep(0.38, 0.44, band) * (1.0 - smoothstep(0.5, 0.56, band)));
    col = mix(col, rock, smoothstep(0.6, 0.7, band));
    col *= 0.85 + 0.3 * noise(vec2(along * 12.0, vWorld.y * 140.0));
    col *= mix(1.0, 0.55, smoothstep(0.0, 1.0, d));
    col = mix(col, fogTint * 0.5, smoothstep(0.75, 1.0, d) * 0.6);
    gl_FragColor = vec4(col * 0.6, 1.0);
}`;

const BLUEPRINT_VERTEX = `
attribute float side;
varying float vSide;
varying vec3 vWorld;
void main() {
    vSide = side;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}`;

const BLUEPRINT_FRAGMENT = `
uniform vec3 paper;
uniform vec3 ink;
uniform vec3 origin;
uniform float cell;
varying float vSide;
varying vec3 vWorld;
float line(float v, float width) {
    float w = fwidth(v) * width;
    return 1.0 - smoothstep(0.0, w, abs(v));
}
float pristine(float v, float width) {
    float w = fwidth(v);
    float draw = clamp(width, w, 0.5);
    float aa = w * 1.5;
    float g = smoothstep(draw + aa, draw - aa, 1.0 - abs(fract(v) * 2.0 - 1.0));
    g *= clamp(width / draw, 0.0, 1.0);
    return mix(g, width, clamp(w * 2.0 - 1.0, 0.0, 1.0));
}
void main() {
    vec2 p = vec2(vWorld.x - origin.x + vWorld.z - origin.z, vWorld.y - origin.y) / cell;
    float minor = max(pristine(p.x, 0.01), pristine(p.y, 0.01)) * 0.3;
    float major = max(pristine(p.x / 5.0, 0.006), pristine(p.y / 5.0, 0.006)) * 0.75;
    float grid = max(minor, major) * 0.5;
    float outline = max(line(vSide, 2.0), line(1.0 - vSide, 1.6)) * 0.3;
    vec3 col = mix(pow(paper, vec3(1.0 / 2.2)), pow(ink, vec3(1.0 / 2.2)), max(grid, outline));
    gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
}`;

function blueprintTexture() {
    const size = BLUEPRINT.sheet;
    const canvasEl = document.createElement("canvas");
    canvasEl.width = canvasEl.height = size;
    const ctx = canvasEl.getContext("2d");
    ctx.fillStyle = BLUEPRINT.paper;
    ctx.fillRect(0, 0, size, size);
    const cell = size / BLUEPRINT.count;
    ctx.strokeStyle = BLUEPRINT.minor;
    ctx.lineWidth = 2;
    for (let k = 1; k < BLUEPRINT.count; k++) {
        ctx.beginPath();
        ctx.moveTo(k * cell, 0);
        ctx.lineTo(k * cell, size);
        ctx.moveTo(0, k * cell);
        ctx.lineTo(size, k * cell);
        ctx.stroke();
    }
    ctx.strokeStyle = BLUEPRINT.major;
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvasEl);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function buildBlueprintSheet(parent, rect, y) {
    const extent = GROUND_EXTENT;
    const geometry = new THREE.PlaneGeometry(extent, extent).rotateX(-Math.PI / 2);
    const center = parent.canvasCenter;
    const tile = (canvas.scene.grid.size * BLUEPRINT.count) / factor;
    const uv = geometry.attributes.uv;
    const pos = geometry.attributes.position;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + center.x - rect.x) / tile, -(pos.getZ(k) + center.z - rect.z) / tile);
    const texture = blueprintTexture();
    texture.anisotropy = parent.renderer.capabilities.getMaxAnisotropy();
    const material = new THREE.MeshBasicMaterial({ map: texture, polygonOffset: true, polygonOffsetFactor: 10 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(center.x, y - 0.0005, center.z);
    mesh.renderOrder = -1e20;
    mesh.userData.disposeMap = texture;
    return mesh;
}

function buildDiorama(group, rect, points, lowY, size, blueprint = false) {
    const depth = size * (blueprint ? 0.06 : 0.12);
    const topY = Math.max(...points.map((p) => p[2]));
    const bottom = lowY - depth;
    const positions = [];
    const sides = [];
    const index = [];
    const cx = rect.x + rect.w / 2;
    const cz = rect.z + rect.h / 2;
    const push = size * 0.001;
    points.forEach(([x, z, y], i) => {
        x = cx + (x - cx) * (1 + push / (rect.w / 2));
        z = cz + (z - cz) * (1 + push / (rect.h / 2));
        positions.push(x, y, z, x, bottom, z);
        sides.push(0, 1);
        if (i < points.length - 1) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("side", new THREE.Float32BufferAttribute(sides, 1));
    geometry.setIndex(index);
    if (blueprint) {
        const paper = new THREE.Color(BLUEPRINT.paper);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                paper: { value: paper },
                ink: { value: new THREE.Color("#ece2ce") },
                origin: { value: new THREE.Vector3(rect.x, bottom, rect.z) },
                cell: { value: canvas.scene.grid.size / factor },
            },
            vertexShader: BLUEPRINT_VERTEX,
            fragmentShader: BLUEPRINT_FRAGMENT,
            side: THREE.DoubleSide,
        });
        group.add(new THREE.Mesh(geometry, material));
        return bottom;
    }
    const material = new THREE.ShaderMaterial({
        uniforms: { topY: { value: topY }, depth: { value: topY - bottom }, fogTint: { value: new THREE.Color(0.6, 0.65, 0.7) } },
        vertexShader: STRATA_VERTEX,
        fragmentShader: STRATA_FRAGMENT,
        side: THREE.DoubleSide,
    });
    const walls = new THREE.Mesh(geometry, material);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(rect.w, rect.h).rotateX(Math.PI / 2), material);
    base.position.set(rect.x + rect.w / 2, bottom, rect.z + rect.h / 2);
    group.add(walls, base);
    active.strata = material;
    return bottom;
}
