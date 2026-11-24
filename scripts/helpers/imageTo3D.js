import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const SIZE = 256;
const PAD = 6;
const DEPTH = SIZE / 64 + 0.2;
const BORDER_SIZE = 3;
const ALPHA_THRESHOLD = 128;
const TRANSLUCENT_ALPHA_THRESHOLD = 48;
const MIN_AREA_RATIO = 0.001;
const OPAQUE_COVERAGE = 0.97;
const SIMPLIFY_TOLERANCE = 0.6;
const SIDE_UV_INSET = 1.5;

const geometryCache = new Map();

export async function imageTo3d(image, returnGeometry = false) {
    const key = getImageKey(image);
    let pending = geometryCache.get(key);
    if (!pending) {
        pending = buildGeometry(image).catch((error) => {
            geometryCache.delete(key);
            console.warn("3D Canvas | Extruded token generation failed, using fallback shape", key, error);
            return createExtrudedGeometry({ shapes: fallbackShapes(SIZE, SIZE, true) }, SIZE, SIZE);
        });
        if (key) geometryCache.set(key, pending);
    }
    const geometry = await pending;
    if (returnGeometry) return geometry.clone();
    const mesh = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}

function getImageKey(image) {
    return image?.currentSrc || image?.src || null;
}

function getSourceSize(image) {
    const width = image.naturalWidth || image.videoWidth || image.width || 0;
    const height = image.naturalHeight || image.videoHeight || image.height || 0;
    return [width, height];
}

async function buildGeometry(image) {
    if (image instanceof HTMLVideoElement) await waitForVideoFrame(image);
    const [sourceWidth, sourceHeight] = getSourceSize(image);
    if (!sourceWidth || !sourceHeight) throw new Error("Image has no size");
    const scale = SIZE / Math.max(sourceWidth, sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const alpha = await readAlpha(image, width, height);
    return createExtrudedGeometry(alphaToShapes(alpha, width, height), width, height);
}

function waitForVideoFrame(video) {
    if (video.readyState >= 2) return;
    return new Promise((resolve) => {
        const done = () => {
            video.removeEventListener("loadeddata", done);
            clearTimeout(timeout);
            resolve();
        };
        const timeout = setTimeout(done, 3000);
        video.addEventListener("loadeddata", done);
    });
}

async function readAlpha(image, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width + PAD * 2;
    canvas.height = height + PAD * 2;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const bitmap = await createBitmap(image, width, height);
    ctx.drawImage(bitmap ?? image, PAD, PAD, width, height);
    bitmap?.close();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(data.length / 4);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    return alpha;
}

async function createBitmap(image, width, height) {
    const options = { resizeWidth: width, resizeHeight: height, resizeQuality: "medium" };
    if (image instanceof HTMLImageElement && image.src && !/\.svg(\?|#|$)/i.test(image.src)) {
        try {
            const response = await fetch(image.src);
            if (response.ok) return await createImageBitmap(await response.blob(), options);
        } catch {}
    }
    try {
        return await createImageBitmap(image, options);
    } catch {
        return null;
    }
}

function alphaToShapes(alpha, width, height) {
    const W = width + PAD * 2;
    const H = height + PAD * 2;
    let mask = thresholdMask(alpha, pickThreshold(alpha));
    mask = erode(dilate(mask, W, H), W, H);
    const minArea = Math.max(4, MIN_AREA_RATIO * width * height);
    removeSmallComponents(mask, W, H, 1, minArea, true);
    removeSmallComponents(mask, W, H, 0, minArea, false);
    let coverage = 0;
    for (let i = 0; i < mask.length; i++) coverage += mask[i];
    if (coverage === 0 || coverage >= OPAQUE_COVERAGE * width * height) return { shapes: fallbackShapes(width, height, false) };
    const faceLoops = maskToLoops(mask, W, H);
    const shapes = buildShapes(faceLoops);
    if (!shapes.length) return { shapes: fallbackShapes(width, height, false) };
    const blankUV = findBlankUV(alpha, width, height);
    if (!blankUV) return { shapes };
    let border = mask;
    for (let i = 0; i < BORDER_SIZE; i++) border = i % 2 ? dilateCross(border, W, H) : dilate(border, W, H);
    removeSmallComponents(border, W, H, 0, minArea, false);
    return { shapes, border: buildRimShapes(faceLoops, maskToLoops(border, W, H)), blankUV };
}

function maskToLoops(mask, W, H) {
    return traceLoops(mask, W, H)
        .map((loop) => simplifyLoop(smoothLoop(loop), SIMPLIFY_TOLERANCE).map((p) => new THREE.Vector2(p.x - PAD, p.y - PAD)))
        .filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) >= 1);
}

function buildRimShapes(faceLoops, borderLoops) {
    const nodes = [...faceLoops.map((loop) => ({ loop, face: true })), ...borderLoops.map((loop) => ({ loop, face: false }))];
    for (const node of nodes) node.area = Math.abs(signedArea(node.loop));
    nodes.sort((a, b) => a.area - b.area);
    for (const node of nodes) {
        node.children = [];
        node.parent = nodes.find((other) => other.area > node.area && containsPoint(other.loop, node.loop[0])) ?? null;
    }
    for (const node of nodes) node.parent?.children.push(node);
    const shapes = [];
    for (const node of nodes) {
        let borderDepth = 0;
        let faceDepth = 0;
        for (let n = node; n; n = n.parent) n.face ? faceDepth++ : borderDepth++;
        if (borderDepth % 2 === 0 || faceDepth % 2 === 1) continue;
        const shape = new THREE.Shape(node.loop);
        for (const child of node.children) shape.holes.push(new THREE.Path(child.loop));
        shapes.push(shape);
    }
    return shapes;
}

function findBlankUV(alpha, width, height) {
    const W = width + PAD * 2;
    const r = 3;
    const isBlank = (cx, cy) => {
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (alpha[(y + PAD) * W + x + PAD] !== 0) return false;
        return true;
    };
    const corners = [
        [r, r],
        [width - 1 - r, r],
        [r, height - 1 - r],
        [width - 1 - r, height - 1 - r],
    ];
    for (const [x, y] of corners) if (isBlank(x, y)) return [(x + 0.5) / width, 1 - (y + 0.5) / height];
    for (let y = r; y < height - r; y += 2) for (let x = r; x < width - r; x += 2) if (isBlank(x, y)) return [(x + 0.5) / width, 1 - (y + 0.5) / height];
    return null;
}

function pickThreshold(alpha) {
    let visible = 0;
    let opaque = 0;
    for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] > 8) visible++;
        if (alpha[i] > 250) opaque++;
    }
    return visible && opaque / visible < 0.25 ? TRANSLUCENT_ALPHA_THRESHOLD : ALPHA_THRESHOLD;
}

function thresholdMask(alpha, threshold) {
    const mask = new Uint8Array(alpha.length);
    for (let i = 0; i < alpha.length; i++) mask[i] = alpha[i] > threshold ? 1 : 0;
    return mask;
}

function dilate(mask, W, H) {
    const out = new Uint8Array(mask.length);
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            out[i] = mask[i] | mask[i - 1] | mask[i + 1] | mask[i - W] | mask[i + W] | mask[i - W - 1] | mask[i - W + 1] | mask[i + W - 1] | mask[i + W + 1];
        }
    }
    return out;
}

function dilateCross(mask, W, H) {
    const out = new Uint8Array(mask.length);
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            out[i] = mask[i] | mask[i - 1] | mask[i + 1] | mask[i - W] | mask[i + W];
        }
    }
    return out;
}

function erode(mask, W, H) {
    const out = new Uint8Array(mask.length);
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            out[i] = mask[i] & mask[i - 1] & mask[i + 1] & mask[i - W] & mask[i + W] & mask[i - W - 1] & mask[i - W + 1] & mask[i + W - 1] & mask[i + W + 1];
        }
    }
    return out;
}

function removeSmallComponents(mask, W, H, value, minArea, keepLargest) {
    const labels = new Int32Array(mask.length).fill(-1);
    const stack = new Int32Array(mask.length);
    const components = [];
    for (let start = 0; start < mask.length; start++) {
        if (mask[start] !== value || labels[start] !== -1) continue;
        const id = components.length;
        const pixels = [];
        let touchesBorder = false;
        let top = 0;
        stack[top++] = start;
        labels[start] = id;
        const visit = (n) => {
            if (mask[n] === value && labels[n] === -1) {
                labels[n] = id;
                stack[top++] = n;
            }
        };
        while (top) {
            const i = stack[--top];
            pixels.push(i);
            const x = i % W;
            const y = (i - x) / W;
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesBorder = true;
            if (x > 0) visit(i - 1);
            if (x < W - 1) visit(i + 1);
            if (y > 0) visit(i - W);
            if (y < H - 1) visit(i + W);
        }
        components.push({ pixels, touchesBorder });
    }
    const largest = keepLargest ? components.reduce((best, c) => (!best || c.pixels.length > best.pixels.length ? c : best), null) : null;
    for (const component of components) {
        if (component === largest || component.touchesBorder || component.pixels.length >= minArea) continue;
        for (const i of component.pixels) mask[i] = 1 - value;
    }
}

const DIRS = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
];

function traceLoops(mask, W, H) {
    const VW = W + 1;
    const out = new Uint8Array(VW * (H + 1));
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (!inside(x, y)) continue;
            if (!inside(x, y - 1)) out[y * VW + x] |= 1;
            if (!inside(x + 1, y)) out[y * VW + x + 1] |= 2;
            if (!inside(x, y + 1)) out[(y + 1) * VW + x + 1] |= 4;
            if (!inside(x - 1, y)) out[(y + 1) * VW + x] |= 8;
        }
    }
    const loops = [];
    for (const singleOnly of [true, false]) {
        for (let v = 0; v < out.length; v++) {
            while (out[v] && (!singleOnly || !(out[v] & (out[v] - 1)))) {
                let dir = 31 - Math.clz32(out[v] & -out[v]);
                let vx = v % VW;
                let vy = (v - vx) / VW;
                const loop = [];
                let current = v;
                while (out[current] & (1 << dir)) {
                    out[current] &= ~(1 << dir);
                    const [dx, dy] = DIRS[dir];
                    loop.push({ x: vx + dx / 2, y: vy + dy / 2 });
                    vx += dx;
                    vy += dy;
                    current = vy * VW + vx;
                    const bits = out[current];
                    if (current === v || !bits) break;
                    for (const turn of [1, 0, 3]) {
                        const next = (dir + turn) % 4;
                        if (bits & (1 << next)) {
                            dir = next;
                            break;
                        }
                    }
                }
                if (loop.length >= 4) loops.push(loop);
            }
        }
    }
    return loops;
}

function smoothLoop(loop) {
    const n = loop.length;
    return loop.map((p, i) => {
        const a = loop[(i + n - 1) % n];
        const b = loop[(i + 1) % n];
        return { x: p.x * 0.5 + (a.x + b.x) * 0.25, y: p.y * 0.5 + (a.y + b.y) * 0.25 };
    });
}

function simplifyLoop(loop, tolerance) {
    const n = loop.length;
    if (n < 8) return loop;
    let far = 0;
    let farDist = -1;
    for (let i = 1; i < n; i++) {
        const d = (loop[i].x - loop[0].x) ** 2 + (loop[i].y - loop[0].y) ** 2;
        if (d > farDist) {
            farDist = d;
            far = i;
        }
    }
    const first = simplifyChain(loop.slice(0, far + 1), tolerance);
    const second = simplifyChain(loop.slice(far).concat([loop[0]]), tolerance);
    return first.slice(0, -1).concat(second.slice(0, -1));
}

function simplifyChain(points, tolerance) {
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    const tol2 = tolerance * tolerance;
    while (stack.length) {
        const [start, end] = stack.pop();
        const a = points[start];
        const b = points[end];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        let index = -1;
        let max = tol2;
        for (let i = start + 1; i < end; i++) {
            const p = points[i];
            const cross = (p.x - a.x) * dy - (p.y - a.y) * dx;
            const d = (cross * cross) / len2;
            if (d > max) {
                max = d;
                index = i;
            }
        }
        if (index !== -1) {
            keep[index] = 1;
            stack.push([start, index], [index, end]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

function signedArea(loop) {
    let area = 0;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) area += loop[j].x * loop[i].y - loop[i].x * loop[j].y;
    return area / 2;
}

function containsPoint(loop, point) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i];
        const b = loop[j];
        if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

function buildShapes(loops) {
    const outers = [];
    const holes = [];
    for (const loop of loops) {
        const area = signedArea(loop);
        if (Math.abs(area) < 1) continue;
        (area > 0 ? outers : holes).push({ loop, area: Math.abs(area) });
    }
    outers.sort((a, b) => a.area - b.area);
    const shapes = new Map(outers.map((outer) => [outer, new THREE.Shape(outer.loop)]));
    for (const hole of holes) {
        const probe = hole.loop[0];
        const owner = outers.find((outer) => outer.area > hole.area && containsPoint(outer.loop, probe));
        if (owner) shapes.get(owner).holes.push(new THREE.Path(hole.loop));
    }
    return [...shapes.values()];
}

function fallbackShapes(width, height, rectangle) {
    const ratio = width / height;
    if (!rectangle && ratio > 0.9 && ratio < 1.1) {
        const shape = new THREE.Shape();
        shape.absarc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2, false);
        return [shape];
    }
    return [new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(width, 0), new THREE.Vector2(width, height), new THREE.Vector2(0, height)])];
}

function createExtrudedGeometry({ shapes, border, blankUV }, width, height) {
    const face = extrudeFace(shapes, width, height);
    const geometry = border?.length ? mergeGeometries([capsOnly(face), extrudeBorder(border, blankUV)]) : face;
    geometry.center();
    geometry.rotateX(Math.PI);
    return geometry;
}

function capsOnly(geometry) {
    const caps = geometry.groups.filter((group) => group.materialIndex === 0);
    const result = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
        const attribute = geometry.getAttribute(name);
        const size = attribute.itemSize;
        const data = new Float32Array(caps.reduce((sum, group) => sum + group.count, 0) * size);
        let offset = 0;
        for (const group of caps) {
            data.set(attribute.array.subarray(group.start * size, (group.start + group.count) * size), offset);
            offset += group.count * size;
        }
        result.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    return result;
}

function extrudeBorder(shapes, blankUV) {
    const geometry = new THREE.ExtrudeGeometry(shapes, { steps: 1, depth: DEPTH, bevelEnabled: false });
    geometry.clearGroups();
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, blankUV[0], blankUV[1]);
    return geometry;
}

function extrudeFace(shapes, width, height) {
    const geometry = new THREE.ExtrudeGeometry(shapes, { steps: 1, depth: DEPTH, bevelEnabled: false, curveSegments: 48 });
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < position.count; i++) {
        let x = position.getX(i);
        let y = position.getY(i);
        if (Math.abs(normal.getZ(i)) < 0.5) {
            x -= normal.getX(i) * SIDE_UV_INSET;
            y -= normal.getY(i) * SIDE_UV_INSET;
        }
        uv.setXY(i, THREE.MathUtils.clamp(x / width, 0, 1), THREE.MathUtils.clamp(1 - y / height, 0, 1));
    }
    return geometry;
}
