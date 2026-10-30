import { NoColorSpace } from "three";

export function rawTexture(texture) {
    if (!texture || texture.colorSpace === NoColorSpace) return texture;
    const raw = texture.clone();
    raw.colorSpace = NoColorSpace;
    return raw;
}
