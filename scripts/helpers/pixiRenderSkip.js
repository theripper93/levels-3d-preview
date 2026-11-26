export function installPixiRenderSkip(levels3d) {
    const renderer = canvas.app?.renderer;
    if (!renderer || renderer._l3dRenderSkip) return;
    const render = renderer.render;
    renderer._l3dRenderSkip = true;
    renderer.render = function (displayObject, options) {
        if (displayObject === canvas.stage && !options && shouldSkip(levels3d)) return;
        return render.call(this, displayObject, options);
    };
}

function shouldSkip(levels3d) {
    if (levels3d.skipPixiRender === false) return false;
    if (levels3d.fogExploration && !levels3d.fogExploration._ready) return false;
    return levels3d._active && levels3d._ready && !levels3d._pauseRendering && !canvas.stage.renderable;
}
