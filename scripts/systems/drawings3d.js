import * as THREE from "three";
import { factor } from "../main.js";
import { posCanvasTo3d, unitsToPixels } from "../helpers/coords3d.js";
import { getQuality } from "../vfx/quality.js";

const MAX_BANDS = 4;
const ROW_GAP = 8;
const MAX_TEXELS_PER_PIXEL = 2;
const LOW_TIER_SIZE = 2048;
const HIGH_TIER_SIZE = 4096;
const LOW_TIERS = new Set(["off", "low"]);
const BAND_TOLERANCE_GRIDS = 0.1;
const BOUNDS_PADDING = 4;
const REFRESH_DELAY = 100;
const NO_LIMIT = 1e9;
const LINE_HIT_PADDING = 8;
const PREVIEW_INTERVAL = 33;
const OUTLINE_SHADOW = 0x000000;

function outlineWidth() {
    return Math.max(2, canvas.dimensions.size / 32);
}

export const paintUniforms = {
    l3dPaintMap: { value: null },
    l3dPaintCount: { value: 0 },
    l3dPaintRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    l3dPaintRows: { value: new THREE.Vector2(1, 1) },
    l3dPaintBands: { value: Array.from({ length: MAX_BANDS }, () => new THREE.Vector2()) },
};

const PAINT_PARS = /* glsl */ `
#if defined( L3D_SURFACE ) && !defined( L3D_SURFACE_BLADE ) && !defined( L3D_SURFACE_FORCE_BANK )
#ifdef L3D_SAMPLERS
#if L3D_SAMPLERS + 3 <= L3D_MAX_SAMPLERS
#define L3D_PAINT
#endif
#else
#define L3D_PAINT
#endif
#endif
#ifdef L3D_PAINT
uniform sampler2D l3dPaintMap;
uniform int l3dPaintCount;
uniform vec4 l3dPaintRect;
uniform vec2 l3dPaintRows;
uniform vec2 l3dPaintBands[ ${MAX_BANDS} ];
float l3dPaintAlpha = 0.0;
#endif
`;

const PAINT_ALBEDO = /* glsl */ `
#ifdef L3D_PAINT
if ( l3dPaintCount > 0 ) {
    vec3 l3dPaintPos = vWorldPositionFoW;
    vec3 l3dPaintN = cross( dFdx( l3dPaintPos ), dFdy( l3dPaintPos ) );
    vec2 l3dPaintUv = ( l3dPaintPos.xz - l3dPaintRect.xy ) * l3dPaintRect.zw;
    vec2 l3dPaintDx = dFdx( l3dPaintUv ) * vec2( 1.0, l3dPaintRows.x );
    vec2 l3dPaintDy = dFdy( l3dPaintUv ) * vec2( 1.0, l3dPaintRows.x );
    float l3dPaintLen = dot( l3dPaintN, l3dPaintN );
    if ( l3dPaintLen > 0.0 && all( greaterThanEqual( l3dPaintUv, vec2( 0.0 ) ) ) && all( lessThanEqual( l3dPaintUv, vec2( 1.0 ) ) ) ) {
        if ( dot( l3dPaintN, cameraPosition - l3dPaintPos ) < 0.0 ) l3dPaintN = -l3dPaintN;
        float l3dPaintUp = smoothstep( 0.3, 0.55, l3dPaintN.y * inversesqrt( l3dPaintLen ) );
        if ( l3dPaintUp > 0.0 ) {
            vec3 l3dPaintMix = sRGBTransferOETF( vec4( clamp( diffuseColor.rgb, 0.0, 1.0 ), 1.0 ) ).rgb;
            for ( int i = 0; i < ${MAX_BANDS}; i ++ ) {
                if ( i >= l3dPaintCount ) break;
                if ( l3dPaintPos.y < l3dPaintBands[ i ].x || l3dPaintPos.y >= l3dPaintBands[ i ].y ) continue;
                vec2 l3dPaintAtlas = vec2( l3dPaintUv.x, float( i ) * l3dPaintRows.y + l3dPaintUv.y * l3dPaintRows.x );
                vec4 l3dPaintTexel = textureGrad( l3dPaintMap, l3dPaintAtlas, l3dPaintDx, l3dPaintDy );
                float l3dPaintLayer = clamp( l3dPaintTexel.a, 0.0, 1.0 ) * l3dPaintUp;
                if ( l3dPaintLayer <= 0.0 ) continue;
                l3dPaintMix = mix( l3dPaintMix, clamp( l3dPaintTexel.rgb / max( l3dPaintTexel.a, 1e-4 ), 0.0, 1.0 ), l3dPaintLayer );
                l3dPaintAlpha += l3dPaintLayer * ( 1.0 - l3dPaintAlpha );
            }
            if ( l3dPaintAlpha > 0.0 ) diffuseColor.rgb = sRGBTransferEOTF( vec4( l3dPaintMix, 1.0 ) ).rgb;
        }
    }
}
#endif
`;

const PAINT_MATERIAL = /* glsl */ `
#if defined( L3D_PAINT ) && defined( STANDARD )
roughnessFactor = mix( roughnessFactor, 0.9, l3dPaintAlpha );
metalnessFactor *= 1.0 - l3dPaintAlpha;
#endif
`;

let installed = false;

export function installPaintChunks(THREELIB = THREE) {
    if (installed) return;
    installed = true;
    const chunks = THREELIB.ShaderChunk;
    chunks.clipping_planes_pars_fragment += PAINT_PARS;
    chunks.alphamap_fragment += PAINT_ALBEDO;
    chunks.normal_fragment_begin += PAINT_MATERIAL;
}

function sortedLevels() {
    return [...(canvas.scene?.levels ?? [])].sort((a, b) => a.elevation.bottom - b.elevation.bottom);
}

function containsElevation(level, elevation) {
    const { bottom, top } = level.elevation;
    return elevation >= bottom - 0.01 && (!Number.isFinite(top) || elevation < top - 0.01);
}

export class Drawing3D {
    constructor(layer, drawing) {
        this.layer = layer;
        this.drawing = drawing;
    }

    get document() {
        return this.drawing.document;
    }

    get id() {
        return this.document.id;
    }

    get shape() {
        return this.drawing.shape;
    }

    get visible() {
        const drawing = this.drawing;
        if (!drawing || drawing.destroyed || !this.shape || this.shape.destroyed) return false;
        return drawing.visible && (drawing.isVisible ?? true);
    }

    get frameTransform() {
        const { x, y, rotation, shape } = this.document;
        const { width = 0, height = 0 } = shape;
        return new PIXI.Matrix()
            .translate(-width / 2, -height / 2)
            .rotate(Math.toRadians(rotation ?? 0))
            .translate(x + width / 2, y + height / 2);
    }

    frameCorners(padding = 0) {
        const { width = 0, height = 0 } = this.document.shape;
        const matrix = this.frameTransform;
        const [left, top, right, bottom] = [-padding, -padding, width + padding, height + padding];
        return [left, top, right, top, right, bottom, left, bottom].reduce((points, value, index, values) => {
            if (index % 2) return points;
            const point = matrix.apply(new PIXI.Point(value, values[index + 1]));
            points.push(point.x, point.y);
            return points;
        }, []);
    }

    get center3d() {
        const center = this.drawing.center;
        return posCanvasTo3d({ x: center.x, y: center.y, z: this.document.elevation ?? 0 });
    }

    covers(elevation) {
        const band = this.band;
        const tolerance = canvas.scene.grid.distance * BAND_TOLERANCE_GRIDS;
        return elevation >= band.bottom - tolerance && elevation < band.top - tolerance;
    }

    contains(point) {
        const { _shape: shape, fillType, fillAlpha, strokeWidth } = this.document;
        const isOpen = shape.type === "polygon" && !(fillType && fillAlpha);
        if (!isOpen) return shape.testPoint({ x: point.x, y: point.y });
        const local = this.frameTransform.applyInverse(new PIXI.Point(point.x, point.y));
        const reach = (strokeWidth ?? 0) / 2 + LINE_HIT_PADDING;
        const points = this.document.shape.points;
        for (let i = 0; i + 3 < points.length; i += 2) {
            const ax = points[i];
            const ay = points[i + 1];
            const dx = points[i + 2] - ax;
            const dy = points[i + 3] - ay;
            const length = dx * dx + dy * dy;
            const t = length ? Math.clamp(((local.x - ax) * dx + (local.y - ay) * dy) / length, 0, 1) : 0;
            if (Math.hypot(local.x - ax - t * dx, local.y - ay - t * dy) <= reach) return true;
        }
        return false;
    }

    get level() {
        const levels = sortedLevels();
        const elevation = this.document.elevation ?? 0;
        const own = levels.filter((level) => this.document.levels?.has(level.id));
        return own.find((level) => containsElevation(level, elevation)) ?? own[0] ?? levels.find((level) => containsElevation(level, elevation)) ?? canvas.level;
    }

    get band() {
        const levels = sortedLevels();
        const level = this.level;
        const elevation = this.document.elevation ?? 0;
        if (!level) return { bottom: -Infinity, top: Infinity };
        const bottom = level.elevation.bottom;
        const lowest = level === levels[0];
        const highest = level === levels.at(-1);
        return {
            bottom: elevation > bottom + 0.01 ? elevation : lowest ? -Infinity : bottom,
            top: highest || !Number.isFinite(level.elevation.top) ? Infinity : level.elevation.top,
            levelBottom: lowest ? -Infinity : bottom,
        };
    }

    get bounds() {
        const shape = this.shape;
        const local = shape.getLocalBounds();
        shape.transform.updateLocalTransform();
        const matrix = shape.transform.localTransform;
        const corners = [
            [local.left, local.top],
            [local.right, local.top],
            [local.right, local.bottom],
            [local.left, local.bottom],
        ].map(([x, y]) => matrix.apply(new PIXI.Point(x, y)));
        const xs = corners.map((point) => point.x);
        const ys = corners.map((point) => point.y);
        const padding = BOUNDS_PADDING + (this.document.strokeWidth ?? 0) + (this.drawing.controlled ? outlineWidth() * 2 : 0);
        return new PIXI.Rectangle(Math.min(...xs) - padding, Math.min(...ys) - padding, Math.max(...xs) - Math.min(...xs) + padding * 2, Math.max(...ys) - Math.min(...ys) + padding * 2);
    }

    render(renderer, renderTexture, transform) {
        const shape = this.shape;
        const state = { visible: shape.visible, renderable: shape.renderable, cullable: shape.cullable };
        shape.visible = shape.renderable = true;
        shape.cullable = false;
        try {
            renderer.render(shape, { renderTexture, clear: false, transform });
        } finally {
            Object.assign(shape, state);
        }
    }

    refresh() {
        this.layer.refresh();
    }

    destroy() {
        this.drawing = null;
        this.layer = null;
    }
}

export class Drawings3D {
    constructor(parent) {
        this._parent = parent;
        this.drawings = new Map();
        this.bands = [];
        this.rect = null;
        this.renderTexture = null;
        this.texture = null;
        this.refresh = foundry.utils.debounce(this.render.bind(this), REFRESH_DELAY);
        this.renderPreview = foundry.utils.throttle(this.render.bind(this), PREVIEW_INTERVAL);
    }

    get active() {
        return !!this._parent._active && !!canvas.ready && !!canvas.drawings;
    }

    get maxSize() {
        const limit = this._parent.renderer?.capabilities?.maxTextureSize ?? HIGH_TIER_SIZE;
        return Math.min(limit, LOW_TIERS.has(getQuality().tier) ? LOW_TIER_SIZE : HIGH_TIER_SIZE);
    }

    sync() {
        const seen = new Set();
        for (const drawing of canvas.drawings?.placeables ?? []) {
            const id = drawing.document?.id;
            if (!id) continue;
            seen.add(id);
            const existing = this.drawings.get(id);
            if (existing) existing.drawing = drawing;
            else this.drawings.set(id, new Drawing3D(this, drawing));
        }
        for (const [id, drawing3d] of this.drawings) {
            if (seen.has(id)) continue;
            drawing3d.destroy();
            this.drawings.delete(id);
        }
    }

    get(id) {
        return this.drawings.get(id);
    }

    previews() {
        const Drawing = foundry.canvas.placeables.Drawing;
        return (canvas.drawings?.preview?.children ?? []).filter((drawing) => drawing instanceof Drawing && !drawing.destroyed).map((drawing) => new Drawing3D(this, drawing));
    }

    at(point, elevation) {
        this.sync();
        return [...this.drawings.values()]
            .filter((drawing3d) => drawing3d.visible && drawing3d.covers(elevation) && drawing3d.contains(point))
            .sort((a, b) => (b.document.elevation ?? 0) - (a.document.elevation ?? 0) || b.document.sort - a.document.sort);
    }

    outline(entries) {
        const controlled = entries.filter(({ drawing3d }) => drawing3d.drawing.controlled && !drawing3d.drawing.isPreview);
        if (!controlled.length) return null;
        const width = outlineWidth();
        const color = CONFIG.Canvas.dispositionColors.CONTROLLED;
        const graphics = new PIXI.Graphics();
        for (const { drawing3d } of controlled) {
            const corners = drawing3d.frameCorners((drawing3d.document.strokeWidth ?? 0) / 2 + width);
            graphics.lineStyle({ width: width * 2, color: OUTLINE_SHADOW, alpha: 0.5, join: PIXI.LINE_JOIN.ROUND }).drawPolygon(corners);
            graphics.lineStyle({ width, color, alpha: 1, join: PIXI.LINE_JOIN.ROUND }).drawPolygon(corners);
        }
        return graphics;
    }

    collect() {
        const tolerance = canvas.scene.grid.distance * BAND_TOLERANCE_GRIDS;
        const entries = [...this.drawings.values(), ...this.previews()]
            .filter((drawing3d) => drawing3d.visible)
            .map((drawing3d) => ({ drawing3d, band: drawing3d.band, bounds: drawing3d.bounds }))
            .filter((entry) => entry.bounds.width > 0 && entry.bounds.height > 0)
            .sort((a, b) => (a.drawing3d.document.elevation ?? 0) - (b.drawing3d.document.elevation ?? 0) || a.drawing3d.document.sort - b.drawing3d.document.sort);
        const group = (useElevation) => {
            const bands = new Map();
            for (const entry of entries) {
                const bottom = useElevation ? entry.band.bottom : entry.band.levelBottom;
                const key = `${bottom}|${entry.band.top}`;
                if (!bands.has(key)) bands.set(key, { bottom: bottom - tolerance, top: entry.band.top - tolerance, entries: [] });
                bands.get(key).entries.push(entry);
            }
            return [...bands.values()].sort((a, b) => a.bottom - b.bottom);
        };
        let bands = group(true);
        if (bands.length > MAX_BANDS) bands = group(false);
        return { entries, bands: bands.slice(0, MAX_BANDS) };
    }

    layout(entries, rows) {
        const dimensions = canvas.dimensions;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (const { bounds } of entries) {
            left = Math.min(left, bounds.left);
            top = Math.min(top, bounds.top);
            right = Math.max(right, bounds.right);
            bottom = Math.max(bottom, bounds.bottom);
        }
        left = Math.max(Math.floor(left), 0);
        top = Math.max(Math.floor(top), 0);
        right = Math.min(Math.ceil(right), dimensions.width);
        bottom = Math.min(Math.ceil(bottom), dimensions.height);
        if (right <= left || bottom <= top) return null;
        const rect = new PIXI.Rectangle(left, top, right - left, bottom - top);
        const size = this.maxSize;
        const resolution = Math.min(MAX_TEXELS_PER_PIXEL, size / rect.width, (size - ROW_GAP * (rows - 1)) / (rect.height * rows));
        const width = Math.max(1, Math.ceil(rect.width * resolution));
        const rowHeight = Math.max(1, Math.ceil(rect.height * resolution));
        return { rect, resolution, width, rowHeight, height: rowHeight * rows + ROW_GAP * (rows - 1) };
    }

    render() {
        if (!this.active) return this.clearUniforms();
        this.sync();
        const { entries, bands } = this.collect();
        const layout = bands.length ? this.layout(entries, bands.length) : null;
        if (!layout) {
            this.bands = [];
            this.rect = null;
            this.clearUniforms();
            return Hooks.callAll("3DCanvasDrawingsRendered", this);
        }
        const renderer = canvas.app.renderer;
        const renderTexture = this.prepareRenderTexture(layout.width, layout.height);
        renderer.render(new PIXI.Container(), { renderTexture, clear: true });
        bands.forEach((band, row) => {
            const offset = row * (layout.rowHeight + ROW_GAP);
            const transform = new PIXI.Matrix(layout.resolution, 0, 0, layout.resolution, -layout.rect.x * layout.resolution, -layout.rect.y * layout.resolution + offset);
            for (const { drawing3d } of band.entries) drawing3d.render(renderer, renderTexture, transform);
            const outline = this.outline(band.entries);
            if (!outline) return;
            renderer.render(outline, { renderTexture, clear: false, transform });
            outline.destroy();
        });
        this.texture = this.shareTexture(renderTexture);
        this.bands = bands;
        this.rect = layout.rect;
        this.updateUniforms(layout, bands);
        Hooks.callAll("3DCanvasDrawingsRendered", this);
    }

    prepareRenderTexture(width, height) {
        if (!this.renderTexture) {
            this.renderTexture = PIXI.RenderTexture.create({ width, height, resolution: 1 });
            this.renderTexture.baseTexture.alphaMode = PIXI.ALPHA_MODES.PREMULTIPLIED_ALPHA;
        } else if (this.renderTexture.width !== width || this.renderTexture.height !== height) {
            this.renderTexture.resize(width, height, true);
        }
        return this.renderTexture;
    }

    shareTexture(renderTexture) {
        const renderer = canvas.app.renderer;
        const gl = renderer.gl;
        renderer.texture.bind(renderTexture.baseTexture, 0);
        const glTexture = renderTexture.baseTexture._glTextures[renderer.CONTEXT_UID];
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        renderer.texture.unbind(renderTexture.baseTexture);
        if (!this.texture?.isExternalTexture) {
            this.texture?.dispose();
            this.texture = new THREE.ExternalTexture();
        }
        this.texture.sourceTexture = glTexture?.texture ?? null;
        return this.texture;
    }

    updateUniforms(layout, bands) {
        const { rect, rowHeight, height } = layout;
        paintUniforms.l3dPaintMap.value = this.texture;
        paintUniforms.l3dPaintRect.value.set(rect.x / factor, rect.y / factor, factor / rect.width, factor / rect.height);
        paintUniforms.l3dPaintRows.value.set(rowHeight / height, (rowHeight + ROW_GAP) / height);
        paintUniforms.l3dPaintBands.value.forEach((slot, index) => {
            const band = bands[index];
            if (!band) return slot.set(0, 0);
            slot.set(Number.isFinite(band.bottom) ? unitsToPixels(band.bottom) : -NO_LIMIT, Number.isFinite(band.top) ? unitsToPixels(band.top) : NO_LIMIT);
        });
        paintUniforms.l3dPaintCount.value = bands.length;
    }

    clearUniforms() {
        paintUniforms.l3dPaintCount.value = 0;
    }

    clear() {
        this.refresh.cancel?.();
        this.clearUniforms();
        paintUniforms.l3dPaintMap.value = null;
        for (const drawing3d of this.drawings.values()) drawing3d.destroy();
        this.drawings.clear();
        this.bands = [];
        this.rect = null;
        this.texture?.dispose();
        this.texture = null;
        this.renderTexture?.destroy(true);
        this.renderTexture = null;
    }

    static setHooks() {
        const refresh = (object) => {
            const layer = game.Levels3DPreview?.drawings;
            if (!layer?.active) return;
            if (object?.isPreview) layer.renderPreview();
            else layer.refresh();
        };
        for (const hook of ["createDrawing", "updateDrawing", "deleteDrawing", "refreshDrawing", "destroyDrawing", "controlDrawing", "3DCanvasSceneReady"]) Hooks.on(hook, refresh);
    }
}
