import { SCATTER_SETS } from "./sets.js";
import { scatterApi } from "./api.js";

const L = (key) => game.i18n.localize(`levels3dpreview.scatter.${key}`);

function seedFor(id) {
    let h = 7;
    for (const c of id ?? "") h = (h * 31 + c.charCodeAt(0)) % 2147483647;
    return h;
}

export function scatterConfigTab(doc) {
    const options = { "": L("none"), ...Object.fromEntries(Object.entries(SCATTER_SETS).map(([id, set]) => [id, game.i18n.localize(set.name)])) };
    const range = (label, min, max, step, def) => ({ type: "range", label: L(label), min, max, step, default: def });
    const check = (label) => ({ type: "checkbox", label: L(label), default: true });
    return {
        "scatter-3d": {
            tabLabel: L("tab"),
            tabNotes: L("tabNotes"),
            tabIcon: "fas fa-seedling",
            "scatter.set": { type: "select", label: L("set"), default: "", options },
            "scatter.seed": { type: "number", label: L("seed"), default: seedFor(doc.id) },
            "scatter.base": { ...range("base", 0, 255, 1, 0), notes: L("baseNotes") },
            "scatter.density": range("density", 0.1, 3, 0.1, 1),
            "scatter.scale": range("scale", 0.25, 3, 0.05, 1),
            "scatter.avoid.buildings": check("avoidBuildings"),
            "scatter.avoid.paths": check("avoidPaths"),
            "scatter.avoid.water": check("avoidWater"),
            scatterConvert: { type: "custom", html: `<button type="button" data-scatter-convert><i class="fas fa-object-ungroup"></i> ${L("convert")}</button>` },
        },
    };
}

export function activateScatterConfig(app, html) {
    html.querySelector("[data-scatter-convert]")?.addEventListener("click", async () => {
        const doc = app.document;
        const count = scatterApi.fieldOf(doc)?.instances.length ?? 0;
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: L("convert") }, content: `<p>${game.i18n.format("levels3dpreview.scatter.convertConfirm", { count })}</p>` });
        if (!ok) return;
        const created = await scatterApi.convertToTiles(doc);
        ui.notifications.info(game.i18n.format("levels3dpreview.scatter.converted", { count: created.length }));
    });
}
