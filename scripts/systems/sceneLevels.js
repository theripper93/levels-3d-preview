export function setLevelsHooks() {
    ["Tile", "Token", "Region", "AmbientLight", "AmbientSound", "Note"].forEach(entity => {
        const hookName = `preCreate${entity}`;
        Hooks.on(hookName, (document, options, userId) => {
            if (!game.canvas3D.active) return;
            if (!document.flags["levels-3d-preview"]) return;
            if (document.levels.size > 1) return;
            document.updateSource({ levels: [canvas.level.id] }); 
        });
    })
}