export function setLevelsHooks() {
    ["Tile", "Token", "Region", "AmbientLight", "AmbientSound", "Note"].forEach(entity => {
        const hookName = `preCreate${entity}`;
        Hooks.on(hookName, (document, options, userId) => {
            if (!game.canvas3D.active) return;
            if (!document.flags["levels-3d-preview"]) return;
            if (document.levels?.size > 1) return;
            if (document.flags["canvas3d-premium"] && document.levels?.size) return;
            if (document.documentName === "Token") {
                return document.updateSource({ level: canvas.level.id });
            }
            document.updateSource({ levels: [canvas.level.id] });
        });
    })
    Hooks.on("preCreateToken", (document) => {
        if (!game.canvas3D.active || !document.parent?.isView) return;
        const level = levelForElevation(document.parent, document.elevation, document.level);
        if (level && level.id !== document.level) document.updateSource({ level: level.id });
    });
}

function contains(level, elevation) {
    const { bottom, top } = level.elevation;
    return elevation >= bottom - 0.01 && (!Number.isFinite(top) || elevation < top - 0.01);
}

function levelForElevation(scene, elevation, current) {
    const own = scene.levels.get(current);
    if (!own || contains(own, elevation)) return null;
    const seen = new Set([current, ...(own.visibility?.levels ?? [])]);
    const fits = scene.levels.filter((l) => contains(l, elevation)).sort((a, b) => Number(seen.has(b.id)) - Number(seen.has(a.id)) || b.elevation.bottom - a.elevation.bottom);
    return fits[0] ?? null;
}
