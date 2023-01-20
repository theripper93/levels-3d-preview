import * as THREE from "../lib/three.module.js";

export function showSceneReport() {
    const scene = game.Levels3DPreview.scene;
    const infos = game.Levels3DPreview.renderer.info;
    let totalVertices = 0;
    let totalMaterials = 0;
    let totalMeshes = 0;
    let totalInstances = 0;

    scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
            const c = object.count ?? 1;
            totalVertices += object.geometry.attributes.position.count * c;
            totalMaterials += object.material instanceof Array ? object.material.length : 1;
            totalMeshes++;
        }
    });

    for (let t of Object.values(game.Levels3DPreview.tiles)) {
        if (t.count) totalInstances += t.count;
    }

    const result = {
        Vertices: totalVertices,
        Materials: totalMaterials,
        Meshes: totalMeshes,
        "Instanced Meshes": totalInstances,
        Textures: infos.memory.textures,
    };

    let score = 20;
    score -= (game.Levels3DPreview.weather?.effects?.length ?? 0) * 3;
    score -= Math.round(result["Vertices"] / 1000000);
    score -= Math.round(result["Meshes"] / 80);
    score -= Math.round(result["Instanced Meshes"] / 500);
    score = Math.clamped(score, 0, 20);
    const color = new THREE.Color("red").lerpHSL(new THREE.Color("green"), score / 18).getHexString();
    const grades = ["F", "E", "D", "C", "B", "A"];
    let grade = grades[Math.floor(score / 3) - 1];
    grade = grade ?? "Real Bad";
    if (score / 3 > Math.floor(score / 3)) grade += "+";
    else if (score / 3 < Math.floor(score / 3)) grade += "-";
    console.log(`%c3D Canvas | Scene Report`, "color: #f5a742; font-size: 1.8em;");
    console.log(`%cPerformance Grade | ${grade}`, `color: #${color}; font-size: 1.8em;`);
    console.table(result);
    result.grade = `Performance Grade | ${grade}`;
    result.color = `#${color}`;
    return result;
}

export function showPerformanceDialog() {
    const report = showSceneReport();
    const dpr = window.devicePixelRatio;
    const resMulti = game.settings.get("levels-3d-preview", "resolutionMultiplier");
    const dialogData = { GPU:SupportDetails.generateSupportReport().gpu, Resolution:`${window.innerWidth * dpr * resMulti}x${window.innerHeight * dpr * resMulti}`,...report}
    dialogData["Shared Context"] = game.settings.get("levels-3d-preview", "sharedContext") ? "Yes" : "No";
    dialogData["Multithreading"] = game.settings.get("levels-3d-preview", "useMultithreading") ? "Yes" : "No";
    delete dialogData.color;
    delete dialogData.grade;
    const dialog = new Dialog({
        title: "3D Canvas | Scene Report",
        content: `<div style="color: ${report.color}; font-size: 1.8em;">${report.grade}</div><table><thead><tr><th>Property</th><th>Value</th></tr></thead><tbody>${Object.entries(dialogData)
            .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
            .join("")}</tbody></table>`,
        buttons: {
            copytoclipboard: {
                label: '<i class="fas fa-copy"></i> Copy to Clipboard',
                callback: () => {
                    dialogData.Grade = report.grade;
                    const text = Object.entries(dialogData)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n");
                    navigator.clipboard.writeText("```" + text + "```");
                },
            },
            close: {
                label: '<i class="fas fa-times"></i> Close',
                callback: () => dialog.close(),
            },
        },
    });
    dialog.render(true);
}
