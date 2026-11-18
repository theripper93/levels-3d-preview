import * as THREE from "three";

const surfaceMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: `
        #include <common>
        #include <batching_pars_vertex>
        varying float vBedY;
        void main() {
            #include <batching_vertex>
            #include <begin_vertex>
            #include <project_vertex>
            vec4 bedWorld = vec4(transformed, 1.0);
            #ifdef USE_BATCHING
            bedWorld = batchingMatrix * bedWorld;
            #endif
            #ifdef USE_INSTANCING
            bedWorld = instanceMatrix * bedWorld;
            #endif
            vBedY = (modelMatrix * bedWorld).y;
        }`,
    fragmentShader: `
        varying float vBedY;
        void main() {
            gl_FragColor = vec4(vBedY, 1.0, gl_FrontFacing ? 1.0 : 0.0, 1.0);
        }`,
});

export const extraSurfaces = new Set();

export function collectSurfaces(filter = () => true) {
    const L = game.Levels3DPreview;
    const include = new Set();
    for (const tile of Object.values(L.tiles)) if (tile?.mesh && !tile.scatterData && filter(tile)) include.add(tile.mesh);
    if (L.board) include.add(L.board);
    for (const mesh of extraSurfaces) if (mesh.parent) include.add(mesh);
    return include;
}

function isolate(scene, include) {
    const chain = new Set();
    for (const obj of include) for (let p = obj.parent; p && !chain.has(p); p = p.parent) chain.add(p);
    const hidden = [];
    const hide = (o) => {
        o.visible = false;
        hidden.push(o);
    };
    const visit = (obj) => {
        for (const child of obj.children) {
            if (!child.visible) continue;
            if (include.has(child)) child.traverse((c) => c.visible && c !== child && (c.isLine || c.isPoints || c.isSprite || c.material?.wireframe || c.userData.noTopDown) && hide(c));
            else if (chain.has(child)) visit(child);
            else hide(child);
        }
    };
    visit(scene);
    return () => hidden.forEach((o) => (o.visible = true));
}

export function topDownCamera(cx, cz, w, h, y, far) {
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0, far);
    cam.position.set(cx, y, cz);
    cam.up.set(0, 0, -1);
    cam.lookAt(cx, y - 1, cz);
    cam.layers.enableAll();
    cam.updateMatrixWorld();
    return cam;
}

export function renderTopDown(include, rw, rh, cameras) {
    const { renderer, scene } = game.Levels3DPreview;
    const target = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    const buffers = cameras.map(() => new Float32Array(rw * rh * 4));
    const prev = {
        target: renderer.getRenderTarget(),
        override: scene.overrideMaterial,
        background: scene.background,
        autoClear: renderer.autoClear,
        shadowAuto: renderer.shadowMap.autoUpdate,
        shadowNeeds: renderer.shadowMap.needsUpdate,
        clearColor: renderer.getClearColor(new THREE.Color()),
        clearAlpha: renderer.getClearAlpha(),
    };
    const gl = renderer.getContext();
    const depthTest = gl.isEnabled(gl.DEPTH_TEST);
    const restoreVisibility = isolate(scene, include);
    try {
        renderer.resetState();
        scene.overrideMaterial = surfaceMaterial;
        scene.background = null;
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = false;
        renderer.autoClear = true;
        renderer.setClearColor(0x000000, 0);
        renderer.setRenderTarget(target);
        cameras.forEach((camera, k) => {
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 0, 0, rw, rh, buffers[k]);
        });
    } finally {
        restoreVisibility();
        scene.overrideMaterial = prev.override;
        scene.background = prev.background;
        target.dispose();
        if (depthTest) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
        renderer.resetState();
        renderer.setRenderTarget(prev.target);
        renderer.autoClear = prev.autoClear;
        renderer.shadowMap.autoUpdate = prev.shadowAuto;
        renderer.shadowMap.needsUpdate = prev.shadowNeeds;
        renderer.setClearColor(prev.clearColor, prev.clearAlpha);
    }
    return buffers;
}
