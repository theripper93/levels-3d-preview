import { SRGBColorSpace, UnsignedByteType, WebGLRenderTarget } from "three";

export class LegacyOutputRenderTarget extends WebGLRenderTarget {
    constructor(width = 1, height = 1, options = {}) {
        super(width, height, { type: UnsignedByteType, colorSpace: SRGBColorSpace, internalFormat: "RGBA8", ...options });
        this.isXRRenderTarget = true;
    }
}
