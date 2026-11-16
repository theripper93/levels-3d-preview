const BLUR_SQUARES = 0.15;
const BLUR_PER_SQUARE = 0.08;
const MAX_BLUR_SQUARES = 0.6;
const BAND_EDGES = [0, 1.5, 3.5, 5.6, Infinity];
const PROP_FLOOR = 0.22;
const ARC_THRESHOLD = 0.98;
const PUSH_FACTOR = 3;
const MIN_SIGMA_TEXELS = 1.5;
const INSET_TEXELS = 1.5;

const SOLID_COLOR = `rgb(0, ${Math.round(PROP_FLOOR * 255)}, 0)`;
const PROP_COLOR = `rgb(0, ${255 - Math.round(PROP_FLOOR * 255)}, 0)`;

function bandBlur(inner, outer) {
    if (outer === Infinity) return MAX_BLUR_SQUARES;
    return Math.min(MAX_BLUR_SQUARES, BLUR_SQUARES + BLUR_PER_SQUARE * (inner + outer) * 0.5);
}

export class MaskRasterizer {
    constructor() {
        this.canvases = new Map();
    }

    getContext(size) {
        let context = this.canvases.get(size);
        if (!context) {
            context = new OffscreenCanvas(size, size).getContext("2d", { willReadFrequently: true, alpha: false });
            this.canvases.set(size, context);
        }
        return context;
    }

    draw({ size, center, half, gridWorld, walls, tiles }) {
        const ctx = this.getContext(size);
        const scale = (size - 2) / (2 * half);
        const unit = gridWorld * scale;
        const view = { size, scale, originX: center[0] - half, originZ: center[1] - half, half, stroke: Math.max(1, BLUR_SQUARES * unit) };
        ctx.filter = "none";
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = "lighter";
        if (walls) this.drawShape(ctx, walls.points, walls, "#f00", view, view.stroke / 4);
        else this.fillAll(ctx, "#f00", size);
        if (tiles) this.drawTiles(ctx, tiles, view, unit, half / gridWorld);
        else this.fillAll(ctx, "#0f0", size);
        return ctx.getImageData(0, 0, size, size).data;
    }

    fillAll(ctx, color, size) {
        ctx.filter = "none";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, size, size);
    }

    drawTiles(ctx, tiles, view, unit, radiusSquares) {
        const middle = view.size / 2;
        const tileView = { ...view, stroke: 0, inset: INSET_TEXELS };
        for (let i = 0; i < BAND_EDGES.length - 1; i++) {
            const inner = BAND_EDGES[i];
            if (inner >= radiusSquares) break;
            const outer = BAND_EDGES[i + 1];
            const sigma = Math.max(view.stroke, bandBlur(inner, outer) * unit) / 4;
            ctx.save();
            ctx.beginPath();
            ctx.arc(middle, middle, Math.min(outer * unit, view.size * 2), 0, Math.PI * 2);
            if (inner > 0) ctx.arc(middle, middle, inner * unit, 0, Math.PI * 2, true);
            ctx.clip("evenodd");
            this.drawShape(ctx, tiles.solid ?? tiles.points, tiles, SOLID_COLOR, tileView, sigma);
            this.drawShape(ctx, tiles.points, tiles, PROP_COLOR, tileView, sigma);
            ctx.restore();
        }
    }

    drawShape(ctx, points, { origin, radius }, color, { scale, originX, originZ, half, stroke, inset = 0 }, sigma) {
        const push = Math.max(half * PUSH_FACTOR, radius) / radius;
        const arc = radius * ARC_THRESHOLD;
        const shrink = inset / scale;
        ctx.fillStyle = color;
        ctx.filter = `blur(${Math.max(MIN_SIGMA_TEXELS, sigma)}px)`;
        ctx.strokeStyle = color;
        ctx.lineWidth = stroke;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < points.length; i += 2) {
            let dx = points[i] - origin[0];
            let dz = points[i + 1] - origin[1];
            const distance = Math.hypot(dx, dz);
            if (distance >= arc) {
                dx *= push;
                dz *= push;
            } else if (shrink > 0 && distance > 0) {
                const factor = Math.max(0, distance - shrink) / distance;
                dx *= factor;
                dz *= factor;
            }
            const px = (origin[0] + dx - originX) * scale + 1;
            const pz = (origin[1] + dz - originZ) * scale + 1;
            if (i === 0) ctx.moveTo(px, pz);
            else ctx.lineTo(px, pz);
        }
        ctx.closePath();
        ctx.fill();
        if (stroke > 0) ctx.stroke();
    }
}
