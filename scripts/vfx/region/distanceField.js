import { ClampToEdgeWrapping, DataTexture, DataUtils, HalfFloatType, LinearFilter, RedFormat } from "three";
import { factor } from "../../main.js";

const MAX_CELLS = 192;
const MIN_CELL = 3;
const PADDING = 40;
const INF = 1e20;
const BAND = 3;

function edt1d(f, n, d, v, z) {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
        let s;
        do {
            const r = v[k];
            s = (f[q] + q * q - f[r] - r * r) / (2 * q - 2 * r);
        } while (s <= z[k] && --k > -1);
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k];
        d[q] = (q - r) * (q - r) + f[r];
    }
}

function edt(grid, cols, rows) {
    const size = Math.max(cols, rows);
    const f = new Float64Array(size);
    const d = new Float64Array(size);
    const v = new Int32Array(size);
    const z = new Float64Array(size + 1);
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) f[y] = grid[y * cols + x];
        edt1d(f, rows, d, v, z);
        for (let y = 0; y < rows; y++) grid[y * cols + x] = d[y];
    }
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) f[x] = grid[y * cols + x];
        edt1d(f, cols, d, v, z);
        for (let x = 0; x < cols; x++) grid[y * cols + x] = d[x];
    }
    return grid;
}

function polygonBounds(tree) {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const visit = (node) => {
        const points = node.polygon?.points ?? [];
        for (let i = 0; i < points.length; i += 2) {
            bounds.minX = Math.min(bounds.minX, points[i]);
            bounds.maxX = Math.max(bounds.maxX, points[i]);
            bounds.minY = Math.min(bounds.minY, points[i + 1]);
            bounds.maxY = Math.max(bounds.maxY, points[i + 1]);
        }
        node.children?.forEach(visit);
    };
    visit(tree);
    return bounds;
}

function collectSegments(tree) {
    const segments = [];
    const visit = (node) => {
        const points = node.polygon?.points ?? [];
        const n = points.length;
        for (let i = 0; i < n; i += 2) segments.push(points[i], points[i + 1], points[(i + 2) % n], points[(i + 3) % n]);
        node.children?.forEach(visit);
    };
    visit(tree);
    return segments;
}

function segmentDistance(px, py, segments) {
    let best = Infinity;
    for (let i = 0; i < segments.length; i += 4) {
        const ax = segments[i];
        const ay = segments[i + 1];
        const dx = segments[i + 2] - ax;
        const dy = segments[i + 3] - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        const ex = ax + dx * t - px;
        const ey = ay + dy * t - py;
        best = Math.min(best, ex * ex + ey * ey);
    }
    return Math.sqrt(best);
}

function rasterize(tree, cols, rows, cell, minX, minY) {
    const canvas = new OffscreenCanvas(cols, rows);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.setTransform(1 / cell, 0, 0, 1 / cell, -minX / cell, -minY / cell);
    context.beginPath();
    const visit = (node) => {
        const points = node.polygon?.points ?? [];
        if (points.length >= 6) {
            context.moveTo(points[0], points[1]);
            for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
            context.closePath();
        }
        node.children?.forEach(visit);
    };
    visit(tree);
    context.fillStyle = "#fff";
    context.fill("evenodd");
    return context.getImageData(0, 0, cols, rows).data;
}

export function buildDistanceField(tree) {
    const bounds = polygonBounds(tree);
    if (!Number.isFinite(bounds.minX)) return null;
    const minX = bounds.minX - PADDING;
    const minY = bounds.minY - PADDING;
    const width = bounds.maxX - bounds.minX + PADDING * 2;
    const height = bounds.maxY - bounds.minY + PADDING * 2;
    const cell = Math.max(MIN_CELL, Math.max(width, height) / MAX_CELLS);
    const cols = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const pixels = rasterize(tree, cols, rows, cell, minX, minY);
    const count = cols * rows;
    const toInside = new Float64Array(count);
    const toOutside = new Float64Array(count);
    const cells = [];
    for (let i = 0; i < count; i++) {
        const inside = pixels[i * 4 + 3] >= 128;
        if (inside) cells.push(i);
        toInside[i] = inside ? 0 : INF;
        toOutside[i] = inside ? INF : 0;
    }
    const area = cells.length;
    edt(toInside, cols, rows);
    edt(toOutside, cols, rows);
    const scale = cell / factor;
    const segments = collectSegments(tree);
    const data = new Uint16Array(count);
    let maxInside = 0;
    for (let i = 0; i < count; i++) {
        const inside = toOutside[i] > 0;
        const cells = Math.sqrt(inside ? toOutside[i] : toInside[i]);
        const exact = cells < BAND ? segmentDistance(minX + ((i % cols) + 0.5) * cell, minY + (Math.floor(i / cols) + 0.5) * cell, segments) / cell : cells - 0.5;
        const distance = (inside ? -exact : exact) * scale;
        maxInside = Math.max(maxInside, -distance);
        data[i] = DataUtils.toHalfFloat(distance);
    }
    const texture = new DataTexture(data, cols, rows, RedFormat, HalfFloatType);
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return {
        texture,
        rect: [minX / factor, minY / factor, (cols * cell) / factor, (rows * cell) / factor],
        bounds: { minX: bounds.minX / factor, minZ: bounds.minY / factor, maxX: bounds.maxX / factor, maxZ: bounds.maxY / factor },
        maxInside,
        area: area * scale * scale,
        sample(x, z) {
            const col = Math.floor((x * factor - minX) / cell);
            const row = Math.floor((z * factor - minY) / cell);
            if (col < 0 || row < 0 || col >= cols || row >= rows) return Infinity;
            return DataUtils.fromHalfFloat(data[row * cols + col]);
        },
        randomPoint(target) {
            if (!cells.length) return null;
            const index = cells[Math.floor(Math.random() * cells.length)];
            target.x = (minX + ((index % cols) + Math.random()) * cell) / factor;
            target.z = (minY + (Math.floor(index / cols) + Math.random()) * cell) / factor;
            return target;
        },
    };
}
