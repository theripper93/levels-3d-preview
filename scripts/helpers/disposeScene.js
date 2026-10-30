import { fogUniforms } from "../systems/Fog.js";

function disposeTexture(texture) {
    if (!texture?.isTexture || texture.isExternalTexture || texture.isRenderTargetTexture) return;
    if (Object.values(fogUniforms).some((uniform) => uniform.value === texture)) return;
    texture.dispose();
}

function disposeMaterial(material) {
    if (!material) return;
    Object.values(material).forEach(disposeTexture);
    Object.values(material.uniforms ?? {}).forEach((uniform) => disposeTexture(uniform?.value));
    material.dispose();
}

export function disposeScene(scene) {
    scene.traverse((object) => {
        if (object.isLight) object.dispose();
        object.geometry?.dispose();
        [object.material].flat().forEach(disposeMaterial);
    });
}
