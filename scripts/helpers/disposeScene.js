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
    const objects = [];
    scene.traverse((object) => objects.push(object));
    for (const object of objects) {
        if (object.isLight || object.isClusterLight) object.dispose();
        object.geometry?.dispose();
        [object.material].flat().forEach(disposeMaterial);
    }
}
