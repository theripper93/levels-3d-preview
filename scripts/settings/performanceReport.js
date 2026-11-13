import * as THREE from "three";
import { analyzeOffenders, jumpToEntity } from "./sceneOffenders.js";

const TOP_DIALOG = 20;
const TOP_CLIPBOARD = 10;

const L = (key, data) => (data ? game.i18n.format(`levels3dpreview.performance.report.${key}`, data) : game.i18n.localize(`levels3dpreview.performance.report.${key}`));
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const byWorst = (list, n) => [...list].sort((a, b) => Math.max(b.cpuShare, b.gpuShare) - Math.max(a.cpuShare, a.gpuShare)).slice(0, n);

export function showSceneReport() {
    const scene = game.Levels3DPreview.scene;
    const infos = game.Levels3DPreview.renderer.info;
    let totalVertices = 0;
    let totalMaterials = new Set();
    let totalMeshes = 0;
    let totalInstances = 0;

    let ignore = new Set();
    for (let child of scene.children) {
        if (!child.visible && child instanceof THREE.Object3D) {
            ignore.add(child.uuid);
            child.traverse((object) => {
                if (object instanceof THREE.Mesh) ignore.add(object.uuid);
            });
        }
    }

    scene.traverse((object) => {
        if (object instanceof THREE.Mesh && !ignore.has(object.uuid)) {
            const c = object.count ?? 1;
            totalVertices += (object.geometry.attributes.position?.count ?? 0) * c;
            if (object.material instanceof Array) {
                for (let m of object.material) {
                    totalMaterials.add(m.uuid);
                }
            } else {
                totalMaterials.add(object.material.uuid);
            }
            totalMeshes++;
        }
    });

    for (let t of Object.values(game.Levels3DPreview.tiles)) {
        if (t.count) totalInstances += t.count;
    }

    const result = {
        Vertices: totalVertices,
        Materials: totalMaterials.size,
        Meshes: totalMeshes,
        "Instanced Meshes": totalInstances,
        Textures: infos.memory.textures,
    };

    let score = 20;
    score -= (game.Levels3DPreview.weather?.effects?.length ?? 0) * 3;
    score -= Math.round(result["Vertices"] / 1000000);
    score -= Math.round(result["Meshes"] / 80);
    score -= Math.round(result["Instanced Meshes"] / 500);
    score = Math.clamp(score, 0, 20);
    const color = new THREE.Color("red").lerpHSL(new THREE.Color("green"), score / 18).getHexString();
    const grades = ["F", "E", "D", "C", "B", "A"];
    let grade = grades[Math.floor(score / 3) - 1];
    grade = grade ?? L("realBad");
    if (score / 3 > Math.floor(score / 3)) grade += "+";
    else if (score / 3 < Math.floor(score / 3)) grade += "-";
    const analysis = analyzeOffenders();
    console.log(`%c${L("title")}`, "color: #f5a742; font-size: 1.8em;");
    console.log(`%c${L("grade", { grade })}`, `color: #${color}; font-size: 1.8em;`);
    console.table(result);
    console.table(byWorst(analysis.offenders, TOP_DIALOG).map((r) => ({ [L("object")]: r.label, CPU: pct(r.cpuShare), GPU: pct(r.gpuShare), [L("cpuReasons")]: r.cpuReasons.join(" · "), [L("gpuReasons")]: r.gpuReasons.join(" · ") })));
    console.table(byWorst(analysis.groups, TOP_DIALOG).map((g) => ({ [L("asset")]: g.asset, [L("count")]: g.count, CPU: pct(g.cpuShare), GPU: pct(g.gpuShare), [L("notes")]: g.notes })));
    result.grade = L("grade", { grade });
    result.color = `#${color}`;
    Object.defineProperty(result, "analysis", { value: analysis, enumerable: false });
    return result;
}

function offendersTable(offenders) {
    const rows = offenders
        .map(
            (r, i) =>
                `<tr data-cpu="${r.cpu}" data-gpu="${r.gpu}"><td>${foundry.utils.escapeHTML(r.label)}</td><td>${pct(r.cpuShare)}</td><td>${pct(r.gpuShare)}</td><td class="hint"><div>CPU: ${r.cpuReasons.join(" · ")}</div><div>GPU: ${r.gpuReasons.join(" · ")}</div></td><td>${
                    r.entity ? `<button type="button" class="icon fa-solid fa-crosshairs" data-action="jump" data-index="${i}" data-tooltip="${L("jump")}"></button>` : ""
                }</td></tr>`,
        )
        .join("");
    return `<h3>${L("worstOffenders")}</h3><table><thead><tr><th>${L("object")}</th><th><a data-action="sort" data-sort="cpu">CPU</a></th><th><a data-action="sort" data-sort="gpu">GPU</a></th><th>${L("reasons")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function groupsTable(groups) {
    const rows = groups
        .map(
            (g, i) =>
                `<tr data-cpu="${g.cpu}" data-gpu="${g.gpu}"><td>${foundry.utils.escapeHTML(g.asset)}</td><td>${g.count}</td><td>${pct(g.cpuShare)}</td><td>${pct(g.gpuShare)}</td><td>${g.notes}</td><td><button type="button" class="icon fa-solid fa-crosshairs" data-action="jumpGroup" data-index="${i}" data-tooltip="${L("jumpGroup")}"></button></td></tr>`,
        )
        .join("");
    return `<h3>${L("byAsset")}</h3><table><thead><tr><th>${L("asset")}</th><th>${L("count")}</th><th><a data-action="sort" data-sort="cpu">CPU</a></th><th><a data-action="sort" data-sort="gpu">GPU</a></th><th>${L("notes")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function switchTab(event, target) {
    const root = target.closest(".window-content");
    for (const el of root.querySelectorAll(`[data-group="${target.dataset.group}"]`)) el.classList.toggle("active", el.dataset.tab === target.dataset.tab);
}

function sortTable(event, target) {
    const tbody = target.closest("table").querySelector("tbody");
    const key = target.dataset.sort;
    const rows = [...tbody.rows].sort((a, b) => Number(b.dataset[key]) - Number(a.dataset[key]));
    tbody.append(...rows);
}

export function showPerformanceDialog() {
    const report = showSceneReport();
    const { analysis } = report;
    const offenders = byWorst(analysis.offenders, TOP_DIALOG);
    const groups = byWorst(analysis.groups, TOP_DIALOG);
    const dpr = game.settings.get("core", "pixelRatioResolutionScaling") ? window.devicePixelRatio : 1;
    const resMulti = game.settings.get("levels-3d-preview", "resolutionMultiplier");
    const dialogData = { "3D Canvas Engine": game.modules.get("levels-3d-preview").version, "Mapmaking Pack": game.modules.get("canvas3dcompendium")?.version, "FVTT CORE": foundry.applications.sidebar.apps.SupportDetails.generateSupportReport().coreVersion, GPU: foundry.applications.sidebar.apps.SupportDetails.generateSupportReport().gpu, Resolution: `${Math.round(window.innerWidth * dpr * resMulti)}x${Math.round(window.innerHeight * dpr * resMulti)}`, ...report };
    dialogData["Shared Context"] = game.settings.get("levels-3d-preview", "sharedContext") ? game.i18n.localize("Yes") : game.i18n.localize("No");
    delete dialogData.color;
    delete dialogData.grade;
    const cursors = new Map();
    const dialog = new foundry.applications.api.DialogV2({
        window: { title: L("title") },
        classes: ["levels-3d-preview-scene-report"],
        position: { width: 900, height: Math.round(window.innerHeight * 0.8) },
        actions: {
            sort: sortTable,
            tab: switchTab,
            jump: (event, target) => jumpToEntity(offenders[target.dataset.index].entity),
            jumpGroup: (event, target) => {
                const group = groups[target.dataset.index];
                const cursor = cursors.get(group) ?? 0;
                cursors.set(group, (cursor + 1) % group.records.length);
                jumpToEntity(group.records[cursor].entity);
            },
        },
        content: `<nav class="tabs"><a class="active" data-action="tab" data-group="report" data-tab="summary">${L("summary")}</a><a data-action="tab" data-group="report" data-tab="offenders">${L("offenders")}</a></nav><section class="tab active" data-group="report" data-tab="summary"><div style="color: ${report.color}; font-size: 1.8em;">${report.grade}</div><table><thead><tr><th>${L("property")}</th><th>${L("value")}</th></tr></thead><tbody>${Object.entries(dialogData)
            .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
            .join("")}</tbody></table></section><section class="tab" data-group="report" data-tab="offenders"><p class="hint">${L("estimateHint")}</p>${offendersTable(offenders)}${groupsTable(groups)}</section>`,
        buttons: [
            {
                label: L("copy"),
                action: "copy",
                icon: "fas fa-copy",
                callback: (e) => {
                    dialogData.Grade = report.grade;
                    const summary = Object.entries(dialogData)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n");
                    const offenderLines = byWorst(analysis.offenders, TOP_CLIPBOARD).map((r) => `${r.label} | CPU ${pct(r.cpuShare)}: ${r.cpuReasons.join(" · ")} | GPU ${pct(r.gpuShare)}: ${r.gpuReasons.join(" · ")}`);
                    const groupLines = byWorst(analysis.groups, TOP_CLIPBOARD).map((g) => `${g.asset} x${g.count} | CPU ${pct(g.cpuShare)} | GPU ${pct(g.gpuShare)}${g.notes ? ` | ${g.notes}` : ""}`);
                    const text = [summary, `\n${L("worstOffenders")}:`, ...offenderLines, `\n${L("byAsset")}:`, ...groupLines].join("\n");
                    game.clipboard.copyPlainText("```" + text + "```");
                },
            },
            {
                label: L("close"),
                action: "close",
                icon: "fas fa-times",
                callback: () => dialog.close(),
            },
        ],
    });
    dialog.render(true);
}
