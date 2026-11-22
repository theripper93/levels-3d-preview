const MODULE_ID = "levels-3d-preview";
const RELOAD_DEFAULTS = {
    object3dSight: false,
    enableFogOfWar: true,
    showSceneWalls: true,
    showSceneFloors: true,
    renderSceneLights: true,
    mirrorLevels: true,
};

function dropUnchangedDefaults(scene, submitData) {
    const submitted = submitData.flags?.[MODULE_ID];
    if (!submitted) return;
    const stored = scene._source.flags?.[MODULE_ID] ?? {};
    for (const [key, value] of Object.entries(RELOAD_DEFAULTS)) {
        if (key in stored || submitted[key] !== value) continue;
        delete submitted[key];
    }
}

export function skipDefaultReloads(app) {
    if (app._l3dSkipDefaultReloads) return;
    app._l3dSkipDefaultReloads = true;
    const processSubmitData = app._processSubmitData;
    app._processSubmitData = function (event, form, submitData, options) {
        dropUnchangedDefaults(this.document, submitData);
        return processSubmitData.call(this, event, form, submitData, options);
    };
}
