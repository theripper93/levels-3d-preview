import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";

export function renderSceneToImage({elevation = 1000, name, shift = [0,0]} = {}) {
    name ??= window.canvas.scene.name.slugify({strict: true});
    const elevationToPixels = (elevation * window.canvas.scene.dimensions.distancePixels) / factor;
    const dimensions = window.canvas.scene.dimensions;
    const rect = { xMin: dimensions.sceneX / factor, xMax: (dimensions.sceneX + dimensions.sceneWidth) / factor, zMin: dimensions.sceneY / factor, zMax: (dimensions.sceneY + dimensions.sceneHeight) / factor };
    const scene = game.Levels3DPreview.scene;
    const { xMin, xMax, zMin, zMax } = rect;
    const width = dimensions.sceneWidth;
    const height = dimensions.sceneHeight;
    const renderer = game.Levels3DPreview.renderer;
    game.Levels3DPreview.renderingPaused = true;
    _renderSceneToImage(scene, xMin, xMax, zMin, zMax, width, height, renderer, elevationToPixels, name, shift);
}

function _renderSceneToImage(scene, xMin, xMax, zMin, zMax, width, height, originalRenderer, elevation, name, shift) {

    const renderer = originalRenderer
    const originalRenderTarget = renderer.getRenderTarget();
    const originalSize = renderer.getSize(new THREE.Vector2());
    renderer.setSize(width, height);

    const orthoWidth = Math.abs(xMax - xMin);
    const orthoHeight = Math.abs(zMax - zMin);
    const centerX = (xMin + xMax) / 2;
    const centerZ = (zMin + zMax) / 2;

    const camera = new THREE.OrthographicCamera(
        -orthoWidth / 2,
        orthoWidth / 2,
        orthoHeight / 2,
        -orthoHeight / 2,
        0.1,
        100,
    );
    camera.position.set(centerX* (1 + shift[0]), elevation, centerZ * (1 + shift[1])); 
    camera.lookAt(new THREE.Vector3(centerX, 0, centerZ));

    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        encoding: THREE.sRGBEncoding,
        type: THREE.UnsignedByteType,
    });

    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setRenderTarget(originalRenderTarget);
    renderer.setSize(originalSize.width, originalSize.height);

    const pixels = new Uint8Array(4 * width * height);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;
    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * width * 4;
        const destRow = y * width * 4;
        for (let x = 0; x < width; x++) {
            const srcIdx = srcRow + x * 4;
            const destIdx = destRow + x * 4;

            for (let i = 0; i < 3; i++) {
                imageData.data[destIdx + i] = pixels[srcIdx + i];
            }
            imageData.data[destIdx + 3] = pixels[srcIdx + 3];
        }
    }

    ctx.putImageData(imageData, 0, 0);

    canvas.toBlob((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${name}.png`;
        link.click();
        URL.revokeObjectURL(link.href);
    }, "image/png");

    renderTarget.dispose();
}
