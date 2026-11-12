import { NoColorSpace } from "three";

export function rawTexture(texture) {
    if (!texture?.image || texture.colorSpace === NoColorSpace) return texture;
    const raw = texture.clone();
    raw.colorSpace = NoColorSpace;
    return raw;
}
