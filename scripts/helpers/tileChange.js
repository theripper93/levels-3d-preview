const SURFACE_KEYS = ["x", "y", "width", "height", "elevation", "rotation", "texture", "hidden", "levels", "shape"];
const previous = new Map();
let tracking = false;

export function tileRect(doc, pad = 0) {
    const r = Math.hypot(doc.width, doc.height) / 2 + pad;
    const cx = doc.x - (doc.shape?.anchorX ?? 0.5) * doc.width + doc.width / 2;
    const cy = doc.y - (doc.shape?.anchorY ?? 0.5) * doc.height + doc.height / 2;
    return new PIXI.Rectangle(cx - r, cy - r, r * 2, r * 2);
}

export function affectsSurface(changes) {
    return !changes || SURFACE_KEYS.some((k) => k in changes) || "levels-3d-preview" in (changes.flags ?? {});
}

export function trackTileRects() {
    if (tracking) return;
    tracking = true;
    Hooks.on("preUpdateTile", (doc) => {
        if (doc.parent === canvas.scene) previous.set(doc.id, tileRect(doc));
    });
    Hooks.on("updateTile", (doc) => queueMicrotask(() => previous.delete(doc.id)));
}

export function changedRect(doc, pad = 0) {
    const rect = tileRect(doc, pad);
    const before = previous.get(doc.id);
    if (before) rect.enlarge(before.clone().pad(pad));
    return rect;
}
