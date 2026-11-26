import * as THREE from "three";
import { factor } from "../../main.js";
import { decalPlaneGeometry } from "./markerDecals.js";
import { setStaticSubtree } from "../../three/matrixWorld.js";
import { pixelsToUnits, centerElement } from "../../helpers/coords3d.js";

const ICON_SIZE = 128;
const ICON_SCALE = 0.026;
const HANDLE_SCALE = 0.016;
const HANDLE_SIZE = 64;
const BACK_OPACITY = 0.3;
const RENDER_ORDER = 1e6;
const IDLE_RING = "#8c8c8c";
const HOVER_RING = "#ffffff";
const GROUND_LIFT = 0.002;
const LIGHT_LIFT = 0.2;
export const DARKNESS_GLYPH = "icons/svg/light-off.svg";
export const DARKNESS_FILL = "#1a1426";

const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();

function noRaycast() {}

function hexColor(value) {
    return "#" + Number(value).toString(16).padStart(6, "0");
}

export function ringColor({ controlled, hover, locked }) {
    const colors = CONFIG.Canvas.dispositionColors;
    if (controlled) return hexColor(colors.CONTROLLED);
    if (hover) return HOVER_RING;
    if (locked) return hexColor(colors.HOSTILE);
    return IDLE_RING;
}

const glyphs = new Map();
const iconCache = new Map();

function glyph(src) {
    let image = glyphs.get(src);
    if (image) return image;
    image = new Image();
    image.onload = () => {
        for (const entry of iconCache.values()) {
            if (entry.spec.glyph !== src) continue;
            drawIcon(entry.texture.image, entry.spec);
            entry.texture.needsUpdate = true;
        }
    };
    image.src = src;
    glyphs.set(src, image);
    return image;
}

function drawIcon(canvas, { glyph: src, ring, color, hidden, disabled }) {
    const ctx = canvas.getContext("2d");
    const c = ICON_SIZE / 2;
    const muted = hidden || disabled;
    ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, c - 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(14, 15, 19, 0.82)";
    ctx.fill();
    if (color) {
        ctx.beginPath();
        ctx.arc(c, c, c - 25, 0, Math.PI * 2);
        ctx.lineWidth = 8;
        ctx.strokeStyle = color;
        ctx.globalAlpha = muted ? 0.45 : 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(c, c, c - 13, 0, Math.PI * 2);
    ctx.lineWidth = 11;
    ctx.strokeStyle = ring;
    ctx.setLineDash(hidden ? [18, 12] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    const image = glyph(src);
    if (!image.complete || !image.naturalWidth) return;
    const size = ICON_SIZE * 0.44;
    ctx.globalAlpha = muted ? 0.5 : 1;
    ctx.drawImage(image, c - size / 2, c - size / 2, size, size);
    ctx.globalAlpha = 1;
}

function spriteMaterial(map, depthTest, opacity) {
    const material = new THREE.SpriteMaterial({ map, sizeAttenuation: false, depthWrite: false, depthTest, transparent: true, opacity, toneMapped: false, fog: false });
    material.userData.noVisionMode = true;
    return material;
}

function iconMaterials(spec) {
    const key = `${spec.glyph}|${spec.ring}|${spec.color}|${spec.hidden}|${spec.disabled}`;
    let entry = iconCache.get(key);
    if (entry) return entry;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = ICON_SIZE;
    drawIcon(canvas, spec);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    entry = { spec, texture, front: spriteMaterial(texture, true, 1), back: spriteMaterial(texture, false, BACK_OPACITY) };
    iconCache.set(key, entry);
    return entry;
}

function overlayMaterial(material) {
    material.userData.noVisionMode = true;
    return material;
}

const stemGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0)]);
const stemMaterial = overlayMaterial(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, fog: false }));
const footGeometry = new THREE.RingGeometry(0.62, 1, 32).rotateX(-Math.PI / 2);
const footMaterial = overlayMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
const fieldMaterial = overlayMaterial(new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
const pickerGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
const pickerMaterial = new THREE.MeshBasicMaterial({ visible: false });
const handleMaterials = new Map();

function handleMaterial(shape) {
    let material = handleMaterials.get(shape);
    if (material) return material;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = HANDLE_SIZE;
    const ctx = canvas.getContext("2d");
    const c = HANDLE_SIZE / 2;
    const r = HANDLE_SIZE * 0.32;
    ctx.beginPath();
    if (shape === "circle") ctx.arc(c, c, r, 0, Math.PI * 2);
    else ctx.rect(c - r, c - r, r * 2, r * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material = spriteMaterial(texture, false, 1);
    material.color.set(hexColor(CONFIG.Canvas.dispositionColors.CONTROLLED));
    handleMaterials.set(shape, material);
    return material;
}

function handlePosition(name, { radius, angle = 360, rotation = 0 }, out) {
    if (angle >= 360) return out.set(radius, 0, 0);
    const direction = Math.atan2(Math.cos(Math.toRadians(rotation)), -Math.sin(Math.toRadians(rotation)));
    if (name === "sweep") {
        const edge = direction + Math.toRadians(angle) / 2;
        return out.set(Math.cos(edge) * radius * 0.5, 0, Math.sin(edge) * radius * 0.5);
    }
    const distance = name === "rotate" ? radius + canvas.grid.size / factor / 3 : radius;
    return out.set(Math.cos(direction) * distance, 0, Math.sin(direction) * distance);
}

const RANGE_VERTEX = `
varying vec2 vP;
void main() {
    vP = uv * 2.0 - 1.0;
    vP.y = -vP.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RANGE_FRAGMENT = `
uniform vec3 uFill;
uniform vec3 uStroke;
uniform float uFillAlpha;
uniform float uBright;
uniform vec2 uDir;
uniform float uHalf;
uniform float uDashes;
uniform float uOpacity;
varying vec2 vP;
float band(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
vec4 over(vec4 top, vec4 bottom) {
    float a = top.a + bottom.a * (1.0 - top.a);
    vec3 c = (top.rgb * top.a + bottom.rgb * bottom.a * (1.0 - top.a)) / max(a, 1e-4);
    return vec4(c, a);
}
void main() {
    float r = length(vP);
    float aa = max(fwidth(r), 1e-4);
    float sector = 1.0;
    float edge = 0.0;
    float edgeHalo = 0.0;
    if (uHalf < 3.14) {
        float angle = acos(clamp(dot(vP / max(r, 1e-5), uDir), -1.0, 1.0));
        float diff = angle - uHalf;
        float s = diff > -1.5707 ? r * sin(diff) : -r;
        sector = 1.0 - smoothstep(-aa, aa, s);
        float reach = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, r)) * step(-1.5707, diff);
        edge = band(s, aa * 1.1, aa) * reach;
        edgeHalo = band(s, aa * 2.6, aa) * reach;
    }
    float inside = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, r)) * sector;
    float brightZone = uBright > 0.0 ? 1.0 - smoothstep(uBright - aa, uBright + aa, r) : 0.0;
    float fillA = uFillAlpha * mix(0.5, 1.0, brightZone) * mix(1.0, 0.6, r) * inside;
    float dash = uDashes > 0.0 ? step(0.45, fract(atan(vP.y, vP.x) / 6.28318 * uDashes)) : 1.0;
    float ring = band(r - 1.0, aa * 1.1, aa) * sector * dash;
    float halo = max(band(r - 1.0, aa * 2.6, aa) * sector * dash, edgeHalo);
    float brightRing = uBright > 0.0 && uBright < 0.999 ? band(r - uBright, aa * 0.8, aa) * sector * 0.55 : 0.0;
    vec4 color = vec4(uFill, fillA);
    color = over(vec4(0.02, 0.02, 0.03, 0.5 * max(halo, brightRing * 0.8)), color);
    color = over(vec4(uStroke, brightRing), color);
    color = over(vec4(uStroke, max(ring, edge)), color);
    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
    #include <colorspace_fragment>
}
`;

function rangeMeshes() {
    const uniforms = {
        uFill: { value: new THREE.Color(1, 1, 1) },
        uStroke: { value: new THREE.Color(1, 1, 1) },
        uFillAlpha: { value: 0.11 },
        uBright: { value: 0 },
        uDir: { value: new THREE.Vector2(0, 1) },
        uHalf: { value: Math.PI },
        uDashes: { value: 0 },
    };
    const create = (depthTest, opacity, renderOrder) => {
        const material = overlayMaterial(
            new THREE.ShaderMaterial({
                uniforms: { ...uniforms, uOpacity: { value: opacity } },
                vertexShader: RANGE_VERTEX,
                fragmentShader: RANGE_FRAGMENT,
                transparent: true,
                depthWrite: false,
                depthTest,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
            }),
        );
        const mesh = new THREE.Mesh(decalPlaneGeometry, material);
        mesh.renderOrder = renderOrder;
        return mesh;
    };
    return { uniforms, front: create(true, 1, RENDER_ORDER - 1), back: create(false, BACK_OPACITY, RENDER_ORDER - 2) };
}

function passive(object) {
    object.raycast = noRaycast;
    object.userData.ignoreHover = true;
    object.userData.ignoreIntersect = true;
    object.userData.noIntersect = true;
    object.userData.interactive = false;
    object.castShadow = false;
    object.receiveShadow = false;
    return object;
}

export class PlaceableGizmo {
    constructor(parent, { glyph, glyphOff, fill }) {
        this.parent = parent;
        this.glyph = glyph;
        this.glyphOff = glyphOff;
        this.fill = fill ?? "#ffffff";
        this.height = 0;
        this.state = { visible: false };
        this.handle = new THREE.Group();
        this.front = new THREE.Sprite();
        this.front.renderOrder = RENDER_ORDER + 2;
        this.back = passive(new THREE.Sprite());
        this.back.renderOrder = RENDER_ORDER + 1;
        for (const sprite of [this.front, this.back]) sprite.scale.set(ICON_SCALE, ICON_SCALE, 1);
        this.handle.add(this.back, this.front, passive(new THREE.Mesh(pickerGeometry, pickerMaterial)));
        this.root = passive(new THREE.Group());
        this.stem = passive(new THREE.Line(stemGeometry, stemMaterial));
        this.stem.renderOrder = RENDER_ORDER - 3;
        this.foot = passive(new THREE.Mesh(footGeometry, footMaterial));
        this.foot.renderOrder = RENDER_ORDER - 3;
        const footSize = canvas.grid.size / factor / 10;
        this.foot.scale.set(footSize, 1, footSize);
        this.root.add(this.stem, this.foot);
        parent.add(this.handle, this.root);
        this.setHeight(0);
    }

    update(state) {
        this.state = state;
        this.handle.visible = this.root.visible = !!state.visible;
        if (state.visible) {
            const icon = iconMaterials({ glyph: state.hidden ? this.glyphOff : (state.glyph ?? this.glyph), ring: state.ring, color: state.color ?? null, hidden: !!state.hidden, disabled: !!state.disabled });
            this.front.material = icon.front;
            this.back.material = icon.back;
        }
        this.updateRange();
        this.markDirty();
    }

    updateRange() {
        const state = this.state;
        const show = state.visible && state.showRange && state.radius > 0;
        this.updateHandles(show && state.handles);
        if (!show) {
            if (this.range) this.range.front.visible = this.range.back.visible = false;
            if (this.field) this.field.visible = false;
            return;
        }
        const range = (this.range ??= this.createRange());
        range.front.visible = range.back.visible = true;
        const u = range.uniforms;
        u.uFill.value.set(state.color ?? this.fill);
        u.uStroke.value.set(state.ring);
        u.uBright.value = state.bright ?? 0;
        const rotation = Math.toRadians(state.rotation ?? 0);
        u.uDir.value.set(-Math.sin(rotation), Math.cos(rotation));
        u.uHalf.value = (state.angle ?? 360) >= 360 ? Math.PI : Math.toRadians(state.angle) / 2;
        u.uDashes.value = state.hidden ? Math.max(12, Math.round((state.radius * Math.PI * 2) / (canvas.grid.size / factor / 3))) : 0;
        const size = state.radius * 2;
        range.front.scale.set(size, 1, size);
        range.back.scale.set(size, 1, size);
        this.updateField(state.dragging ? null : state.field, state.origin);
    }

    updateHandles(show) {
        const state = this.state;
        const names = !show ? [] : (state.angle ?? 360) >= 360 ? ["scale"] : ["scale", "rotate", "sweep"];
        this.handles ??= {};
        for (const name of ["scale", "rotate", "sweep"]) {
            let sprite = this.handles[name];
            if (!names.includes(name)) {
                if (sprite) sprite.visible = false;
                continue;
            }
            if (!sprite) {
                sprite = this.handles[name] = new THREE.Sprite(handleMaterial(name === "rotate" ? "circle" : "square"));
                sprite.scale.set(HANDLE_SCALE, HANDLE_SCALE, 1);
                sprite.renderOrder = RENDER_ORDER + 3;
                sprite.userData.gizmoHandle = name;
                this.handle.add(sprite);
            }
            sprite.visible = true;
            handlePosition(name, state, sprite.position).y = -this.height + GROUND_LIFT;
        }
    }

    createRange() {
        const range = rangeMeshes();
        passive(range.front);
        passive(range.back);
        range.front.position.y = range.back.position.y = -this.height + GROUND_LIFT;
        this.root.add(range.front, range.back);
        return range;
    }

    updateField(shape, origin) {
        const points = shape?.points;
        if (!points?.length || !origin) {
            if (this.field) this.field.visible = false;
            return;
        }
        if (!this.field) {
            this.field = passive(new THREE.LineLoop(new THREE.BufferGeometry(), fieldMaterial));
            this.field.renderOrder = RENDER_ORDER;
            this.field.position.y = -this.height + GROUND_LIFT;
            this.root.add(this.field);
        }
        this.field.visible = true;
        if (this._fieldPoints === points && this._fieldOrigin?.x === origin.x && this._fieldOrigin?.y === origin.y) return;
        this._fieldPoints = points;
        this._fieldOrigin = { x: origin.x, y: origin.y };
        const positions = new Float32Array((points.length / 2) * 3);
        for (let i = 0, j = 0; i < points.length; i += 2, j += 3) {
            positions[j] = (points[i] - origin.x) / factor;
            positions[j + 2] = (points[i + 1] - origin.y) / factor;
        }
        this.field.geometry.dispose();
        this.field.geometry = new THREE.BufferGeometry();
        this.field.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    }

    sync(state) {
        this.handle.position.set(0, 0, 0);
        const collisions = game.Levels3DPreview?.interactionManager?._sightCollisions;
        if (state.visible && (collisions !== this._groundSource || !this._groundAt?.equals(this.parent.position)) && this.updateGround()) {
            (this._groundAt ??= new THREE.Vector3()).copy(this.parent.position);
            this._groundSource = collisions;
        }
        this.update(state);
    }

    invalidateGround() {
        this._groundAt = null;
    }

    updateGround() {
        const interactionManager = game.Levels3DPreview?.interactionManager;
        if (!interactionManager?._sightCollisions?.move?.length) return false;
        _origin.copy(this.parent.position);
        _origin.y += GROUND_LIFT;
        _target.copy(_origin);
        _target.y -= 1;
        const hit = interactionManager.computeSightCollisionFrom3DPositions(_origin, _target, "move", false, false);
        this.setHeight(hit ? Math.max(this.parent.position.y - hit.y, 0) : 0);
        return true;
    }

    setHeight(height) {
        this.height = height;
        const show = height > canvas.grid.size / factor / 20;
        this.stem.visible = this.foot.visible = show;
        this.stem.scale.y = Math.max(height, 1e-4);
        const y = -height + GROUND_LIFT;
        this.foot.position.y = y;
        if (this.range) this.range.front.position.y = this.range.back.position.y = y;
        if (this.field) this.field.position.y = y;
        for (const sprite of Object.values(this.handles ?? {})) sprite.position.y = y;
        this.markDirty();
    }

    markDirty() {
        if (this.parent._staticSubtree) setStaticSubtree(this.parent, true);
    }

    dispose() {
        this.handle.removeFromParent();
        this.root.removeFromParent();
        if (this.range) {
            this.range.front.material.dispose();
            this.range.back.material.dispose();
        }
        this.field?.geometry.dispose();
    }
}

export function createEntityGizmo(entity, options) {
    const gizmo = new PlaceableGizmo(entity.mesh, options);
    const handle = gizmo.handle;
    handle.userData.entity3D = entity;
    handle.userData.isHitbox = true;
    entity.mesh.userData.hitbox = handle;
    entity.mesh.userData.interactive = true;
    entity.mesh.userData.entity3D = entity;
    entity.dragHandle = handle;
    return gizmo;
}

export function placeableGizmoState(entity, range) {
    const placeable = entity.placeable;
    const document = placeable.document;
    const layer = placeable.layer;
    const controlled = placeable.controlled;
    const hover = placeable.hover;
    const interactionManager = game.Levels3DPreview?.interactionManager;
    const dragging = interactionManager?.draggable?.userData?.entity3D === entity || interactionManager?._handleDrag?.entity === entity;
    return {
        ...range,
        visible: !!layer?.active,
        ring: ringColor({ controlled, hover, locked: document.locked }),
        hidden: document.hidden,
        disabled: !document.hidden && range.disabled,
        showRange: controlled || hover || layer?.highlightObjects || dragging,
        handles: controlled && layer?.controlled.length === 1 && !document.locked && !!ui.controls.tool?.interaction,
        dragging,
        origin: { x: document.x, y: document.y },
    };
}

const HANDLE_PICK_PX = 10;
const _projected = new THREE.Vector3();

export function pickGizmo(ndc, layerEntity) {
    const L = game.Levels3DPreview;
    const entities = layerEntity === "AmbientLight" ? L?.lights?.sceneLights : layerEntity === "AmbientSound" ? L?.sounds : null;
    if (!entities) return null;
    const camera = L.camera;
    const { width, height } = L.renderer.domElement.getBoundingClientRect();
    const iconRadius = Math.max((ICON_SCALE * camera.projectionMatrix.elements[5] * height) / 4, HANDLE_PICK_PX);
    let best = null;
    const consider = (entity, sprite, radius, bias) => {
        if (!sprite?.visible) return;
        _projected.copy(sprite.position).add(entity.mesh.position).project(camera);
        if (Math.abs(_projected.z) > 1) return;
        const distance = Math.hypot(((_projected.x - ndc.x) * width) / 2, ((_projected.y - ndc.y) * height) / 2);
        if (distance > radius) return;
        const score = distance - bias;
        if (!best || score < best.score) best = { entity, sprite, score };
    };
    for (const entity of Object.values(entities)) {
        const gizmo = entity.gizmo;
        if (!gizmo?.handle.visible || !entity.dragHandle) continue;
        for (const sprite of Object.values(gizmo.handles ?? {})) consider(entity, sprite, HANDLE_PICK_PX, HANDLE_PICK_PX * 2);
        consider(entity, gizmo.front, iconRadius, 0);
    }
    if (!best) return null;
    const point = best.sprite.position.clone().add(best.entity.mesh.position);
    return { object: best.entity.dragHandle, sprite: best.sprite, point, handle: !!best.sprite.userData.gizmoHandle };
}

export function snapActive() {
    return game.keyboard.isModifierActive("Shift");
}

const _point = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class RangeHandleDrag {
    static start(entity, object) {
        const name = object?.userData?.gizmoHandle;
        if (!name || !entity.gizmo || !entity.rangeValues) return null;
        return new RangeHandleDrag(entity, name);
    }

    constructor(entity, name) {
        this.entity = entity;
        this.name = name;
        this.values = entity.rangeValues();
        const { x, y } = entity.placeable.document;
        this.origin = { x, y };
        _point.copy(entity.mesh.position);
        _point.y -= entity.gizmo.height;
        this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(_up, _point);
        this.label = document.createElement("div");
        this.label.id = "levels3d-ruler-text";
        this.label.classList.add("ruler");
        document.body.append(this.label);
        this.anchor = new THREE.Vector3();
    }

    update(interactionManager) {
        interactionManager.raycaster.setFromCamera(interactionManager.mousemove, interactionManager.camera);
        const point = interactionManager.raycaster.ray.intersectPlane(this.plane, _point);
        if (!point) return;
        const snap = snapActive();
        const dx = point.x * factor - this.origin.x;
        const dy = point.z * factor - this.origin.y;
        const values = this.values;
        const units = canvas.grid.units;
        let text;
        if (this.name === "scale") {
            const { distance, distancePixels } = canvas.dimensions;
            const radius = Math.hypot(dx, dy) / distancePixels;
            values.radius = snap ? radius.toNearest(distance / 2) : radius.toNearest(0.01);
            text = `${values.radius} ${units}`;
        } else {
            let degrees = Math.toDegrees(Math.atan2(dy, dx));
            if (this.name === "rotate") {
                degrees = Math.normalizeDegrees(degrees - 90);
                values.rotation = snap ? degrees.toNearest(5) : degrees.toNearest(0.01);
                text = `${values.rotation}°`;
            } else {
                const offset = Math.abs(Math.normalizeDegrees(degrees - values.rotation - 90 + 180) - 180);
                const angle = Math.clamp(offset * 2, 1, 360);
                values.angle = snap ? Math.max(angle.toNearest(5), 5) : angle.toNearest(0.01);
                text = `${values.angle}°`;
            }
        }
        this.entity.syncGizmo(values);
        this.label.textContent = text.trim();
        const handle = this.entity.gizmo.handles?.[this.name];
        if (handle) this.anchor.copy(handle.position).add(this.entity.mesh.position);
        else this.anchor.copy(point);
        centerElement(this.label, this.anchor, true);
    }

    async commit() {
        this.label.remove();
        try {
            await this.entity.commitRange(this.values);
        } finally {
            this.entity.syncGizmo();
        }
    }

    cancel() {
        this.label.remove();
        this.entity.syncGizmo();
    }
}

export function createGizmoWarmupProxies(layer) {
    const group = new THREE.Group();
    const icon = iconMaterials({ glyph: "icons/svg/light.svg", ring: IDLE_RING, color: null, hidden: false, disabled: false });
    const range = rangeMeshes();
    const objects = [
        new THREE.Sprite(icon.front),
        new THREE.Sprite(icon.back),
        new THREE.Sprite(handleMaterial("square")),
        new THREE.Line(stemGeometry, stemMaterial),
        new THREE.LineLoop(stemGeometry, fieldMaterial),
        new THREE.Mesh(footGeometry, footMaterial),
        range.front,
        range.back,
    ];
    for (const object of objects) {
        object.scale.setScalar(0.001);
        object.layers.set(layer);
        passive(object);
        group.add(object);
    }
    return group;
}

const PLACEMENT_TOOLS = {
    light: {
        layer: () => canvas.lighting,
        documentName: "AmbientLight",
        glyph: "icons/svg/light.svg",
        glyphOff: "icons/svg/light-off.svg",
        createData: () => foundry.applications.sheets.palette.AmbientLightPalette.createData,
        lift: LIGHT_LIFT,
        glyphFor: (data) => (data.config?.negative ? DARKNESS_GLYPH : null),
        color: (data) => data.config?.color?.css ?? data.config?.color ?? (data.config?.negative ? DARKNESS_FILL : null),
        angle: (data) => data.config?.angle ?? 360,
        bright: () => 0.5,
        apply: (data, radius, rotation) => {
            const update = { config: { dim: radius, bright: radius / 2 } };
            if ((data.config?.angle ?? 360) < 360) update.rotation = rotation;
            return update;
        },
    },
    sound: {
        layer: () => canvas.sounds,
        documentName: "AmbientSound",
        glyph: "icons/svg/sound.svg",
        glyphOff: "icons/svg/sound-off.svg",
        fill: "#aaddff",
        createData: () => foundry.applications.sheets.palette.AmbientSoundPalette.createData,
        lift: 0,
        color: () => null,
        angle: () => 360,
        bright: () => 0,
        apply: (data, radius) => ({ radius }),
    },
};

export class RadiusPlacement3D {
    static handles(tool) {
        const config = PLACEMENT_TOOLS[tool];
        return !!config && canvas.activeLayer === config.layer();
    }

    constructor(tool) {
        this.config = PLACEMENT_TOOLS[tool];
        this.group = new THREE.Group();
        this.gizmo = new PlaceableGizmo(this.group, this.config);
        game.Levels3DPreview.scene.add(this.group);
    }

    update(surface, originY, cursor) {
        const config = this.config;
        const snap = snapActive();
        const raw = { x: surface.x * factor, y: surface.z * factor };
        const origin = snap ? config.layer().getSnappedPoint(raw) : raw;
        const dx = cursor.x * factor - origin.x;
        const dy = cursor.z * factor - origin.y;
        const { distance, distancePixels } = canvas.dimensions;
        let radius = Math.hypot(dx, dy) / distancePixels;
        radius = snap ? radius.toNearest(distance / 2) : radius.toNearest(0.01);
        let rotation = Math.normalizeDegrees(Math.toDegrees(Math.atan2(dy, dx)) - 90);
        rotation = snap ? rotation.toNearest(5) : rotation.toNearest(0.01);
        const defaults = config.createData();
        this.group.position.set(origin.x / factor, originY, origin.y / factor);
        this.gizmo.setHeight(originY - surface.y);
        this.data = foundry.utils.mergeObject(defaults, { x: origin.x, y: origin.y, elevation: Math.round((pixelsToUnits(originY) + config.lift) * 100) / 100, ...config.apply(defaults, radius, rotation) }, { inplace: false });
        this.radius = radius;
        this.gizmo.update({
            visible: true,
            glyph: config.glyphFor?.(defaults) ?? null,
            ring: ringColor({ controlled: true }),
            hidden: !!defaults.hidden,
            color: config.color(defaults),
            showRange: true,
            radius: (radius * distancePixels) / factor,
            bright: config.bright(),
            angle: config.angle(defaults),
            rotation,
        });
        return `${radius} ${canvas.grid.units}`.trim();
    }

    async commit() {
        if (!this.data || !(this.radius > 0)) return null;
        const layer = this.config.layer();
        const tool = ui.controls.tool?.name;
        const evaluate = (value) => (Array.isArray(value) ? value.includes(tool) : typeof value === "function" ? value() : !!value);
        const confirm = evaluate(layer.options.confirmBeforeCreation);
        const controlObject = !confirm && layer.options.controllableObjects && evaluate(layer.options.controlObjectAfterCreation);
        const documentClass = CONFIG[this.config.documentName].documentClass;
        const created = await documentClass.create(this.data, { parent: canvas.scene, controlObject });
        if (confirm) created?.sheet.render({ force: true });
        return created;
    }

    destroy() {
        this.gizmo.dispose();
        this.group.removeFromParent();
    }
}
