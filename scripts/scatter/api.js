import { factor } from "../main.js";
import { encodeGridChanges } from "../helpers/chunkCodec.js";
import { SCATTER_SETS, SCATTER_PROPS } from "./sets.js";
import { sampleSurface, gridUnit } from "./surface.js";
import { scatterDefaults, readDensity, refreshScatter, scatterFields, loadAsset } from "./scatterField.js";
import { resolveItemAsset } from "./generate.js";

const MODULE_ID = "levels-3d-preview";

function fieldOf(doc) {
    return game.Levels3DPreview.tiles[doc.id]?.scatterField ?? null;
}

async function create({ scene = canvas.scene, x, y, width, height, elevation = 0, ...data } = {}) {
    const flags = scatterDefaults({ seed: Math.floor(Math.random() * 0x7fffffff), ...data });
    const [doc] = await scene.createEmbeddedDocuments("Tile", [{ x: x + width / 2, y: y + height / 2, width, height, elevation, texture: { src: "modules/levels-3d-preview/assets/blank.webp" }, flags: { [MODULE_ID]: { scatter: flags } } }]);
    return doc;
}

async function writeDensity(doc, values, { update = true } = {}) {
    const data = scatterDefaults(doc.flags[MODULE_ID]?.scatter);
    const current = await readDensity(doc, data);
    const changes = await encodeGridChanges(values, current.values, current.nx, current.ny, current.chunk, 8, current.base);
    const { ForcedDeletion } = foundry.data.operators;
    const out = {};
    for (const [key, b64] of Object.entries(changes)) out[`flags.${MODULE_ID}.scatter.dc.${key}`] = b64 ?? ForcedDeletion.create();
    if (update && !foundry.utils.isEmpty(out)) await doc.update(out);
    return out;
}

function toLocal(doc, x, y) {
    const angle = Math.toRadians(doc.rotation);
    const cx = doc.x - (doc.shape?.anchorX ?? 0.5) * doc.width + doc.width / 2;
    const cy = doc.y - (doc.shape?.anchorY ?? 0.5) * doc.height + doc.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const ly = dx * Math.sin(-angle) + dy * Math.cos(-angle);
    return { x: lx + Math.abs(doc.width) / 2, y: ly + Math.abs(doc.height) / 2 };
}

async function paint(doc, { x, y, radius, value = 255, strength = 1, mode = "paint", update = true }) {
    const grid = await readDensity(doc);
    const { values, nx, ny, cell } = grid;
    const c = toLocal(doc, x, y);
    const i0 = Math.max(0, Math.floor((c.x - radius) / cell)), i1 = Math.min(nx - 1, Math.floor((c.x + radius) / cell));
    const j0 = Math.max(0, Math.floor((c.y - radius) / cell)), j1 = Math.min(ny - 1, Math.floor((c.y + radius) / cell));
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            const d = Math.hypot((i + 0.5) * cell - c.x, (j + 0.5) * cell - c.y) / radius;
            if (d > 1) continue;
            const a = Math.min(1, (1 - d * d) * 2) * strength;
            const k = j * nx + i;
            const target = mode === "erase" ? 0 : mode === "thin" ? values[k] * 0.5 : value;
            values[k] = Math.round(values[k] + (target - values[k]) * a);
        }
    }
    return writeDensity(doc, values, { update });
}

function cellsIn(field, rect, nx, ny, cell) {
    const cells = new Set();
    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            const p = field.localToScene((i + 0.5) * cell, (j + 0.5) * cell);
            if (!rect || rect.contains(p.x, p.y)) cells.add(j * nx + i);
        }
    }
    return cells;
}

async function convertToTiles(doc, rect = null, filter = null) {
    const field = fieldOf(doc);
    if (!field) return [];
    const grid = await readDensity(doc);
    const cells = filter ? null : cellsIn(field, rect, grid.nx, grid.ny, grid.cell);
    const picked = field.instances.filter((inst) => (filter ? filter(inst) : cells.has(inst.cell)));
    const assets = await Promise.all(picked.map((inst) => field.assetInfo(inst.asset)));
    const k = gridUnit() / 2;
    const tiles = picked.map((inst, n) => {
        const info = assets[n];
        const s = k * inst.scale * factor;
        const p = field.localToScene(inst.x, inst.z);
        const y = inst.y + (inst.asset.yOffset ?? 0) * k * inst.scale;
        return {
            x: p.x,
            y: p.y,
            width: Math.max(1, info.size.x * s),
            height: Math.max(1, info.size.z * s),
            elevation: ((y * factor) / canvas.scene.grid.size) * canvas.scene.grid.distance,
            rotation: Math.normalizeDegrees(doc.rotation - Math.toDegrees(inst.yaw)),
            texture: { src: "modules/levels-3d-preview/assets/blank.webp" },
            flags: { [MODULE_ID]: { model3d: inst.asset.src, depth: Math.max(1, info.size.y * s), fillType: "stretch", sight: !!inst.asset.blocking, collision: !!inst.asset.blocking, castShadow: true } },
        };
    });
    const data = doc.flags[MODULE_ID].scatter;
    const drop = new Set(picked.filter((inst) => inst.explicit).map((inst) => inst.item));
    const update = {};
    if (drop.size) update[`flags.${MODULE_ID}.scatter.items`] = (data.items ?? []).filter((_, n) => !drop.has(n));
    const ids = picked.filter((inst) => inst.id).map((inst) => inst.id);
    if (filter && ids.length) update[`flags.${MODULE_ID}.scatter.ex`] = [...(data.ex ?? []), ...ids];
    if (!filter) {
        for (const i of cells) grid.values[i] = 0;
        Object.assign(update, await writeDensity(doc, grid.values, { update: false }));
    }
    const created = await doc.parent.createEmbeddedDocuments("Tile", tiles);
    if (!foundry.utils.isEmpty(update)) await doc.update(update);
    return created;
}

export const scatterApi = {
    sets: SCATTER_SETS,
    props: SCATTER_PROPS,
    itemAsset: (data, item) => resolveItemAsset(SCATTER_SETS[data?.set], item),
    loadAsset,
    create,
    fieldOf,
    readDensity,
    writeDensity,
    paint,
    convertToTiles,
    setItems: (doc, items) => doc.update({ [`flags.${MODULE_ID}.scatter.items`]: items }),
    avoidSampler: (rect) => sampleSurface(rect),
    refresh: refreshScatter,
    refreshAll: () => refreshScatter(),
    fields: scatterFields,
};
