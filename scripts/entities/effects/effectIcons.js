import * as THREE from "three";
import { factor } from "../../main.js";
import { MIST_RENDER_ORDER } from "../../systems/fogMist.js";
import { ActiveEffectEffect } from "./activeEffect.js";

const CELL = 64;
const PAD = 4;
const FALLBACK_ICON = "icons/svg/hazard.svg";
const GAP_X = 1.15;
const GAP_Y = 1.3;
const ICON_GRID_SIZE = 0.22;

const VERTEX = `
attribute vec3 iAnchor;
attribute vec4 iLayout;
attribute vec2 iCell;
attribute vec4 iTint;
attribute vec4 iRim;
uniform vec2 uViewport;
varying vec2 vUv;
varying vec2 vCell;
varying vec4 vTint;
varying vec4 vRim;
varying float vInset;
void main() {
    vUv = uv;
    vCell = iCell;
    vTint = iTint;
    vRim = iRim;
    vInset = iLayout.y;
    vec4 mv = viewMatrix * vec4(modelMatrix[3].xyz + iAnchor, 1.0);
    float depth = (projectionMatrix * mv).w;
    mv.xyz *= max(1.0 - iLayout.z / length(mv.xyz), 0.0);
    vec4 clip = projectionMatrix * mv;
    float px = max(iLayout.w * projectionMatrix[1][1] * uViewport.y * 0.5 / depth, 10.0);
    vec2 offset = (vec2(iLayout.x, 0.0) + position.xy) * px;
    clip.xy += offset * 2.0 / uViewport * clip.w;
    gl_Position = clip;
}`;

const FRAGMENT = `
uniform sampler2D uAtlas;
uniform float uCells;
varying vec2 vUv;
varying vec2 vCell;
varying vec4 vTint;
varying vec4 vRim;
varying float vInset;
void main() {
    float d = length(vUv * 2.0 - 1.0) - 1.0;
    float aa = max(fwidth(d), 1e-4);
    float shape = 1.0 - smoothstep(-aa, 0.0, d);
    float rim = smoothstep(-0.12 - aa, -0.12, d) * vRim.a;
    vec3 backColor = mix(vec3(0.035, 0.035, 0.045), vRim.rgb, rim);
    float backAlpha = max(0.78, rim);
    vec2 iuv = (vUv - 0.5) / vInset + 0.5;
    vec2 inside = step(vec2(0.0), iuv) * step(iuv, vec2(1.0));
    vec2 cuv = clamp(iuv, 0.0, 1.0);
    vec4 icon = texture2D(uAtlas, (vCell + vec2(cuv.x, 1.0 - cuv.y)) / uCells) * (inside.x * inside.y);
    float alpha = icon.a + backAlpha * (1.0 - icon.a);
    vec3 color = (icon.rgb * vTint.rgb + backColor * backAlpha * (1.0 - icon.a)) / max(alpha, 1e-4);
    gl_FragColor = vec4(color, alpha * shape * vTint.a);
    if (gl_FragColor.a < 0.004) discard;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

class EffectIconAtlas {
    constructor() {
        this.cells = 16;
        this.canvas = this._createCanvas(this.cells * CELL);
        this.ctx = this.canvas.getContext("2d");
        this.free = [];
        this._pushFree(0);
        this.entries = new Map();
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.flipY = false;
        this.texture.premultiplyAlpha = true;
        this.texture.minFilter = THREE.LinearMipmapLinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        const viewport = new THREE.Vector2();
        this.uniforms = {
            uAtlas: { value: this.texture },
            uCells: { value: this.cells },
            uViewport: {
                get value() {
                    return game.Levels3DPreview?.renderer?.getSize(viewport) ?? viewport.set(window.innerWidth, window.innerHeight);
                },
            },
        };
        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            depthTest: true,
        });
        this.material.userData.noVisionMode = true;
        this.quad = new THREE.PlaneGeometry(1, 1);
        Hooks.on("refreshToken", (token, flags) => {
            if (!(flags.refreshState || flags.refreshNameplate || flags.refreshBars)) return;
            const token3d = game.Levels3DPreview?.tokens[token.id];
            if (token3d?.token === token && token3d.effectsContainer) token3d.drawEffects();
        });
    }

    _createCanvas(size) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        return canvas;
    }

    _pushFree(fromCells) {
        for (let y = 0; y < this.cells; y++) {
            for (let x = 0; x < this.cells; x++) {
                if (x < fromCells && y < fromCells) continue;
                this.free.push([x, y]);
            }
        }
        this.free.reverse();
    }

    _grow() {
        const old = this.canvas;
        const oldCells = this.cells;
        this.cells *= 2;
        this.canvas = this._createCanvas(this.cells * CELL);
        this.ctx = this.canvas.getContext("2d");
        this.ctx.drawImage(old, 0, 0);
        this._pushFree(oldCells);
        this.texture.dispose();
        this.texture.image = this.canvas;
        this.uniforms.uCells.value = this.cells;
    }

    _alloc() {
        if (!this.free.length) this._grow();
        return this.free.pop();
    }

    _commit(cell, draw) {
        const [x, y] = cell;
        this.ctx.clearRect(x * CELL, y * CELL, CELL, CELL);
        draw(this.ctx, x * CELL + PAD, y * CELL + PAD, CELL - PAD * 2);
        this.texture.needsUpdate = true;
        return cell;
    }

    async _loadImage(src) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = src;
        await image.decode();
        return image;
    }

    icon(src) {
        src ||= FALLBACK_ICON;
        if (this.entries.has(src)) return this.entries.get(src);
        const promise = this._loadImage(src)
            .catch(() => this._loadImage(FALLBACK_ICON))
            .then((image) =>
                this._commit(this._alloc(), (ctx, x, y, size) => {
                    const ratio = (image.naturalWidth || 1) / (image.naturalHeight || 1);
                    const w = ratio >= 1 ? size : size * ratio;
                    const h = ratio >= 1 ? size / ratio : size;
                    ctx.drawImage(image, x + (size - w) / 2, y + (size - h) / 2, w, h);
                }),
            )
            .catch(() => [0, 0]);
        this.entries.set(src, promise);
        return promise;
    }

    text(text) {
        const key = `text:${text}`;
        if (this.entries.has(key)) return this.entries.get(key);
        const cell = this._commit(this._alloc(), (ctx, x, y, size) => {
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${Math.round(size * 0.62)}px Signika, sans-serif`;
            ctx.fillText(text, x + size / 2, y + size / 2 + size * 0.04, size);
        });
        const promise = Promise.resolve(cell);
        this.entries.set(key, promise);
        return promise;
    }
}

function getEffectIconAtlas() {
    const L = game.Levels3DPreview;
    L.effectIconAtlas ??= new EffectIconAtlas();
    return L.effectIconAtlas;
}

export function disposeEffectIcons(token3d) {
    const state = token3d._effectIcons;
    if (!state) return;
    state.mesh?.removeFromParent();
    state.mesh?.geometry.dispose();
    token3d._effectIcons = null;
}

function labelState(token3d) {
    const token = token3d.token;
    const bars = token3d.bars?.isSprite && token3d.bars.scale.x > 0 ? token3d.bars.scale : null;
    const name = token3d.nameplate?.isSprite ? token3d.nameplate.scale : null;
    return {
        showName: !!token.nameplate?.visible,
        showBars: !!token.bars?.visible && !!token3d.document.bar1?.attribute,
        barWidth: bars?.x ?? (token.w || token3d.document.width * canvas.grid.size) / factor,
        barHeight: bars?.y ?? (token.bars?.bar1?.height || 10) / factor,
        nameWidth: name?.x ?? 0,
    };
}

export function drawEffectIcons(token3d, effects, firstDraw) {
    const atlas = getEffectIconAtlas();
    const visible = token3d.effectsContainer.visible;
    const overlay = effects.findLast((e) => e.flags?.core?.overlay);
    const items = visible ? effects.map((e) => ({ src: e.img || FALLBACK_ICON, tint: new THREE.Color(e.tint?.css ?? "#ffffff"), overlay: e === overlay })) : [];
    const labels = labelState(token3d);
    const key = [labels.showName, labels.showBars, labels.barWidth.toFixed(4), labels.barHeight.toFixed(4), labels.nameWidth.toFixed(3), token3d.isProne, token3d.d.toFixed(4), token3d.document.width, token3d.document.height, ...items.map((i) => `${i.src}|${i.tint.getHexString()}|${i.overlay}`)].join(";");
    const state = (token3d._effectIcons ??= { key: null, seq: 0, srcs: new Set() });
    if (state.key === key) return;
    state.key = key;
    if (!firstDraw) for (const item of items) if (!state.srcs.has(item.src)) new ActiveEffectEffect(token3d, item.src);
    state.srcs = new Set(items.map((i) => i.src));
    const seq = ++state.seq;
    const { placed, lift } = layout(token3d, items, labels);
    buildMesh(token3d, atlas, placed).then((mesh) => {
        if (seq !== state.seq || token3d._destroyed || !token3d.mesh) return mesh?.geometry.dispose();
        state.mesh?.removeFromParent();
        state.mesh?.geometry.dispose();
        state.mesh = mesh;
        if (mesh) token3d.effectsContainer.add(mesh);
        applyLabelLift(token3d, lift);
    });
}

function applyLabelLift(token3d, lift) {
    if ((token3d.labelLift ?? 0) === lift) return;
    token3d.labelLift = lift;
    if (token3d.nameplate?.isSprite) token3d.nameplate.position.y = token3d.d + token3d.nameplate.scale.y / 2 + 0.042 + lift;
    if (token3d.bars?.isSprite) token3d.bars.position.y = token3d.d - token3d.bars.scale.y + 0.037 + lift;
}

const _box = new THREE.Box3();

function modelTop(token3d) {
    const model = token3d.model;
    if (!model || !token3d.mesh) return token3d.d;
    const target = token3d.isProne ? token3d.proneHandler?.currentTarget : null;
    const position = model.position.clone();
    const rotation = model.rotation.clone();
    if (target?.position) {
        model.position.copy(target.position);
        model.rotation.copy(target.rotation);
    }
    model.updateWorldMatrix(true, true);
    _box.setFromObject(model);
    model.position.copy(position);
    model.rotation.copy(rotation);
    model.updateWorldMatrix(false, true);
    return _box.isEmpty() ? token3d.d : _box.max.y - token3d.mesh.position.y;
}

function overflow(icons, capacity) {
    if (icons.length <= capacity) return icons;
    const shown = icons.slice(0, capacity - 1);
    shown.push({ text: `+${icons.length - shown.length}`, tint: new THREE.Color(1, 1, 1) });
    return shown;
}

function layout(token3d, items, { showName, showBars, barWidth, barHeight, nameWidth }) {
    if (!items.length) return { placed: [], lift: 0 };
    const grid = canvas.grid.size / factor;
    const width = showBars ? barWidth : Math.max(barWidth, showName ? nameWidth : 0);
    const perRow = Math.max(2, Math.round(width / (grid * ICON_GRID_SIZE * GAP_X)));
    const size = width / (perRow * GAP_X);
    const overlay = items.find((i) => i.overlay);
    const icons = overflow(items.filter((i) => !i.overlay), overlay ? perRow * 2 - 1 : perRow * 2);
    if (overlay) icons.unshift(overlay);
    const rows = Math.ceil(icons.length / perRow);
    const height = size + (rows - 1) * size * GAP_Y;
    const spacing = size * 0.4;
    let top;
    let lift = 0;
    let stackTop = 0;
    if (!showName && !showBars) {
        top = modelTop(token3d) + spacing + height;
    } else {
        const labelBottom = showBars ? token3d.d + 0.037 - barHeight * 1.5 : token3d.d + 0.042;
        lift = Math.max(0, token3d.d + spacing + height + spacing - labelBottom);
        top = labelBottom + lift - spacing;
        const nameHeight = token3d.nameplate?.isSprite ? token3d.nameplate.scale.y : (token3d.token._getTextStyle().fontSize * 1.2) / factor;
        stackTop = (showName ? token3d.d + 0.042 + nameHeight : token3d.d + 0.037 - barHeight * 0.5) + lift;
    }
    const placed = icons.map((icon, i) => {
        const row = Math.floor(i / perRow);
        const inRow = Math.min(perRow, icons.length - row * perRow);
        const col = i % perRow;
        const rim = icon.overlay ? [0.85, 0.25, 0.2, 0.9] : [0.85, 0.83, 0.78, 0.45];
        const y = top - size / 2 - row * size * GAP_Y;
        return { ...icon, x: (col - (inRow - 1) / 2) * GAP_X, y, bias: Math.max(stackTop - y, 0) + 0.01, size, inset: icon.text ? 0.9 : 0.66, rim };
    });
    return { placed, lift };
}

async function buildMesh(token3d, atlas, placed) {
    if (!placed.length) return null;
    const cells = await Promise.all(placed.map((p) => (p.text ? atlas.text(p.text) : atlas.icon(p.src))));
    const count = placed.length;
    const geometry = new THREE.InstancedBufferGeometry().copy(atlas.quad);
    geometry.instanceCount = count;
    const attribute = (name, itemSize, fill) => {
        const array = new Float32Array(count * itemSize);
        placed.forEach((p, i) => array.set(fill(p, i), i * itemSize));
        geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, itemSize));
    };
    attribute("iAnchor", 3, (p) => [0, p.y, 0]);
    attribute("iLayout", 4, (p) => [p.x, p.inset, p.bias, p.size]);
    attribute("iCell", 2, (p, i) => cells[i]);
    attribute("iTint", 4, (p) => [p.tint.r, p.tint.g, p.tint.b, 1]);
    attribute("iRim", 4, (p) => p.rim);
    const extent = Math.max(token3d.w, token3d.h, token3d.d) * 2 + (canvas.grid.size / factor) * 2;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, token3d.d * 0.5, 0), extent);
    const mesh = new THREE.Mesh(geometry, atlas.material);
    mesh.raycast = () => {};
    mesh.userData.ignoreIntersect = true;
    mesh.userData.ignoreHover = true;
    mesh.renderOrder = MIST_RENDER_ORDER + 2;
    mesh.matrixAutoUpdate = false;
    return mesh;
}
