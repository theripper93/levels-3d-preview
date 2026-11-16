import { HalfFloatType, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { createAOPass } from "./aoPass.js";

const SCENE_SAMPLES = 8;

const hdrPassFactories = [createAOPass];

export function createComposer(renderer, pixelRatio) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const composer = new EffectComposer(renderer, new WebGLRenderTarget(width, height, { type: HalfFloatType, depthBuffer: false }));
    composer.renderTarget2.dispose();
    composer.renderTarget2 = composer.readBuffer = new WebGLRenderTarget(width, height, { type: HalfFloatType, samples: SCENE_SAMPLES });
    composer.renderTarget2.texture.name = "EffectComposer.scene";
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    return composer;
}

export function compileForComposer(parent, scene, camera, targetScene = null) {
    const renderer = parent.renderer;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(parent.composer.readBuffer);
    try {
        return renderer.compile(scene, camera, targetScene);
    } finally {
        renderer.setRenderTarget(previous);
    }
}

export function createHdrPasses(parent) {
    return hdrPassFactories.map((create) => create(parent)).filter(Boolean);
}
