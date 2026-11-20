import { DataTexture, RGBAFormat, UnsignedByteType, LinearFilter, Vector2 } from "three";

export const ATLAS_SIZE = 2048;
export const MIN_BLOCK = 32;

const QUADRANTS = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
];
const _position = new Vector2();
const UNPACK_STATE = ["UNPACK_ROW_LENGTH", "UNPACK_IMAGE_HEIGHT", "UNPACK_SKIP_PIXELS", "UNPACK_SKIP_ROWS", "UNPACK_SKIP_IMAGES"];

export class MaskAtlas {
    constructor() {
        this.texture = new DataTexture(null, ATLAS_SIZE, ATLAS_SIZE, RGBAFormat, UnsignedByteType);
        this.texture.minFilter = LinearFilter;
        this.texture.magFilter = LinearFilter;
        this.texture.generateMipmaps = false;
        this.texture.flipY = false;
        this.texture.source.dataReady = false;
        this.texture.needsUpdate = true;
        this.uploader = new DataTexture(null, MIN_BLOCK, MIN_BLOCK, RGBAFormat, UnsignedByteType);
        this.uploads = 0;
        this._whitePending = true;
        this.reset();
    }

    reset() {
        this.free = new Map();
        for (let size = MIN_BLOCK; size <= ATLAS_SIZE; size *= 2) this.free.set(size, new Map());
        this.free.get(ATLAS_SIZE).set("0,0", { x: 0, y: 0, size: ATLAS_SIZE });
        this.whiteBlock = this.allocate(MIN_BLOCK);
    }

    allocate(size) {
        const list = this.free.get(size);
        if (!list) return null;
        const first = list.values().next().value;
        if (first) {
            list.delete(`${first.x},${first.y}`);
            return first;
        }
        const parent = size < ATLAS_SIZE ? this.allocate(size * 2) : null;
        if (!parent) return null;
        for (const [dx, dy] of QUADRANTS.slice(1)) {
            const block = { x: parent.x + dx * size, y: parent.y + dy * size, size };
            list.set(`${block.x},${block.y}`, block);
        }
        return { x: parent.x, y: parent.y, size };
    }

    release(block) {
        if (!block || block === this.whiteBlock) return;
        const { size } = block;
        const list = this.free.get(size);
        if (size < ATLAS_SIZE) {
            const parentSize = size * 2;
            const px = block.x - (block.x % parentSize);
            const py = block.y - (block.y % parentSize);
            const siblings = QUADRANTS.map(([dx, dy]) => `${px + dx * size},${py + dy * size}`).filter((key) => key !== `${block.x},${block.y}`);
            if (siblings.every((key) => list.has(key))) {
                siblings.forEach((key) => list.delete(key));
                return this.release({ x: px, y: py, size: parentSize });
            }
        }
        list.set(`${block.x},${block.y}`, block);
    }

    rect(block) {
        const inner = block.size - 2;
        return [(block.x + 1) / ATLAS_SIZE, (block.y + 1) / ATLAS_SIZE, inner / ATLAS_SIZE, inner / ATLAS_SIZE];
    }

    ensureWhite(renderer) {
        if (!this._whitePending) return;
        this._whitePending = false;
        this.upload(renderer, this.whiteBlock, new Uint8Array(MIN_BLOCK * MIN_BLOCK * 4).fill(255));
    }

    upload(renderer, block, data) {
        const gl = renderer.getContext();
        for (const name of UNPACK_STATE) renderer.state.pixelStorei(gl[name], 0);
        this.uploader.image = { width: block.size, height: block.size, data };
        _position.set(block.x, block.y);
        renderer.copyTextureToTexture(this.uploader, this.texture, null, _position);
        this.uploads++;
    }

    dispose() {
        this.texture.dispose();
    }
}
