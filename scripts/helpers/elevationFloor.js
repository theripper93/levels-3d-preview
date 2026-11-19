export function elevationFloor() {
    let floor = canvas.primary.background.elevation;
    for (const tile of Object.values(game.Levels3DPreview?.tiles ?? {})) {
        if (tile?.mapMakerMesh?.k !== "terrain" || !tile.mesh) continue;
        let state = null;
        tile.mesh.traverse((c) => (state ??= c.mapMakerTerrain ?? null));
        if (!state?.surfaceMesh) continue;
        const holed = state.holeKey && state.holeKey !== "[]";
        floor = Math.min(floor, holed ? (state.data.min / canvas.scene.dimensions.size) * canvas.scene.dimensions.distance : state.lowestElevation());
    }
    return floor;
}

export function movementFloor() {
    return game.settings.get("levels-3d-preview", "preventNegative") ? elevationFloor() : -Infinity;
}
