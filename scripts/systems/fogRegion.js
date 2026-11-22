const shapeInfo = new WeakMap();

function describePoints(points) {
    let info = shapeInfo.get(points);
    if (info) return info;
    let hash = points.length;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
        const x = points[i];
        const y = points[i + 1];
        hash = (Math.imul(hash, 31) + Math.round(x)) | 0;
        hash = (Math.imul(hash, 31) + Math.round(y)) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
    }
    info = { hash, bounds: points.length >= 2 ? { x0, y0, x1, y1 } : null };
    shapeInfo.set(points, info);
    return info;
}

export function unionRect(a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return a;
    a.x0 = Math.min(a.x0, b.x0);
    a.y0 = Math.min(a.y0, b.y0);
    a.x1 = Math.max(a.x1, b.x1);
    a.y1 = Math.max(a.y1, b.y1);
    return a;
}

function describeSource(source) {
    const data = source.data ?? {};
    let hash = 0;
    let bounds = null;
    for (const shape of new Set([source.los, source.shape, source.light])) {
        const points = shape?.points;
        if (!points?.length) continue;
        const info = describePoints(points);
        hash = (Math.imul(hash, 31) + info.hash) | 0;
        bounds = unionRect(bounds, info.bounds);
    }
    const key = `${source.active}|${source.visionMode?.id ?? ""}|${data.vision ?? ""}|${data.x}|${data.y}|${data.radius}|${data.lightRadius ?? ""}|${hash}`;
    return { key, bounds };
}

export function tokensMoving() {
    return !!canvas.tokens?._draggedToken || !!canvas.tokens?.placeables.some((token) => token.animationContexts?.size);
}

export class FogRegion {
    constructor() {
        this.states = new Map();
    }

    update() {
        const effects = canvas.effects;
        const next = new Map();
        let rect = null;
        for (const collection of [effects?.visionSources, effects?.lightSources, effects?.darknessSources]) {
            for (const source of collection ?? []) {
                const state = describeSource(source);
                next.set(source, state);
                const previous = this.states.get(source);
                if (previous?.key === state.key) continue;
                rect = unionRect(rect, previous?.bounds);
                rect = unionRect(rect, state.bounds);
            }
        }
        for (const [source, state] of this.states) if (!next.has(source)) rect = unionRect(rect, state.bounds);
        this.states = next;
        if (!rect) return null;
        const pad = canvas.dimensions.size;
        rect.x0 -= pad;
        rect.y0 -= pad;
        rect.x1 += pad;
        rect.y1 += pad;
        return rect;
    }

    reset() {
        this.states.clear();
    }
}
