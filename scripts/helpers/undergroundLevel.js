export function isUndergroundLevel(scene = canvas.scene, level = canvas.level) {
    if (!scene || !level || (scene.levels?.size ?? 0) < 2) return false;
    const top = level.elevation?.top;
    return Number.isFinite(top) && top <= 0;
}
