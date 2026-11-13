import { BufferGeometry, DepthTexture, Float32BufferAttribute, Group, Mesh, ShaderMaterial } from "three";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { VFX_LAYER } from "../constants.js";
import { getQuality } from "../quality.js";
import { attachDecals } from "./decal.js";
import { attachDistortion } from "./distortion.js";
import { pools } from "./instancePool.js";
import { farDepth, sceneUniforms } from "./sceneBuffer.js";

export const capabilities = { enabled: true, failed: false, active: false, softParticles: false, distortion: false, decals: false };

const sceneDepth = new DepthTexture(1, 1);
const warming = new Group();
const warmGeometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(9, 3));
const captureGeometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(3, 3)).setDrawRange(0, 0);
const captureMaterial = new ShaderMaterial({ vertexShader: "void main() { gl_Position = vec4(0.0); }", fragmentShader: "void main() { gl_FragColor = vec4(0.0); }", transparent: true, depthWrite: false, depthTest: false, colorWrite: false });

export function setEnabled(enabled) {
    capabilities.enabled = enabled;
}

export function warm(...materials) {
    for (const material of materials) {
        const proxy = new Mesh(warmGeometry, material);
        proxy.frustumCulled = false;
        proxy.layers.set(VFX_LAYER);
        warming.add(proxy);
    }
}

export class EffectsPass extends RenderPass {
    constructor(parent) {
        super(parent.scene, parent.camera);
        this.parent = parent;
        this.target = parent.composer.renderTarget2;
        this.blocked = !!canvas.scene.getFlag("levels-3d-preview", "pixel");
        this.validated = false;
        this.camera.layers.enable(VFX_LAYER);
        this.capture = new Mesh(captureGeometry, captureMaterial);
        this.capture.frustumCulled = false;
        this.capture.renderOrder = Number.MIN_SAFE_INTEGER;
        this.capture.onBeforeRender = (renderer) => this.captureDepth(renderer);
        this.scene.add(this.capture);
        attachDecals(parent.scene);
        this.distortion = attachDistortion();
    }

    activate(active) {
        capabilities.active = active;
        this.validated = false;
        this.target.depthTexture = active ? sceneDepth : null;
        this.target.resolveDepthBuffer = !active;
        this.target.dispose();
        sceneUniforms.tSceneDepth.value = active ? sceneDepth : farDepth;
        sceneUniforms.tSceneColor.value = active ? this.target.texture : null;
    }

    refresh() {
        const quality = getQuality();
        const active = capabilities.enabled && !capabilities.failed && !this.blocked && (quality.softParticles || quality.distortion || quality.decals);
        if (active !== capabilities.active) this.activate(active);
        capabilities.softParticles = active && quality.softParticles;
        capabilities.distortion = active && quality.distortion;
        capabilities.decals = active && quality.decals;
        const engine = this.parent.particleSystem;
        const texture = capabilities.softParticles ? sceneDepth : null;
        if (engine && (engine !== this.engine || texture !== this.softTexture)) {
            engine.setDepthTexture(texture);
            this.engine = engine;
            this.softTexture = texture;
        }
        return active;
    }

    captureDepth(renderer) {
        if (!capabilities.active || renderer.getRenderTarget() !== this.target) return;
        const gl = renderer.getContext();
        const { state } = renderer;
        const properties = renderer.properties.get(this.target);
        const { width, height } = this.target;
        state.bindFramebuffer(gl.READ_FRAMEBUFFER, properties.__webglMultisampledFramebuffer);
        state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, properties.__webglFramebuffer);
        gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, properties.__webglMultisampledFramebuffer);
    }

    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        const active = this.refresh();
        const delta = this.parent.timer.getDelta();
        const toScreen = this.renderToScreen;
        sceneUniforms.uSceneTime.value += delta;
        if (warming.children.length) this.scene.add(warming);
        for (const pool of pools) pool.sync(this.scene, delta, capabilities[pool.capability]);
        if (active) {
            this.updateUniforms();
            const composer = this.parent.composer;
            if (composer.readBuffer !== this.target) composer.swapBuffers();
            this.renderToScreen = false;
            super.render(renderer, composer.writeBuffer, this.target, deltaTime, maskActive);
            this.renderToScreen = toScreen;
            if (this.distortion.count) this.renderDistortion(renderer);
            if (!this.validated) this.validate(renderer);
            if (toScreen) this.present(renderer);
        } else super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        if (warming.parent) {
            warming.clear();
            warming.removeFromParent();
        }
    }

    updateUniforms() {
        const { camera, target } = this;
        camera.updateMatrixWorld();
        sceneUniforms.uSceneResolution.value.set(target.width, target.height);
        sceneUniforms.uSceneNearFar.value.set(camera.near, camera.far);
        sceneUniforms.uSceneProjectionInverse.value.copy(camera.projectionMatrixInverse);
        sceneUniforms.uSceneCameraWorld.value.copy(camera.matrixWorld);
    }

    renderDistortion(renderer) {
        const { autoClear } = renderer;
        renderer.autoClear = false;
        try {
            renderer.setRenderTarget(this.target);
            renderer.render(this.distortion, this.camera);
        } finally {
            renderer.autoClear = autoClear;
        }
    }

    validate(renderer) {
        const gl = renderer.getContext();
        renderer.state.bindFramebuffer(gl.FRAMEBUFFER, renderer.properties.get(this.target).__webglFramebuffer);
        capabilities.failed = gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE;
        renderer.setRenderTarget(this.target);
        this.validated = true;
    }

    present(renderer) {
        const copy = this.parent.composer.copyPass;
        copy.renderToScreen = true;
        copy.render(renderer, null, this.target);
    }
}
