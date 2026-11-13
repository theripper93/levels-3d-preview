import * as THREE from "three";

const CELL = 128;
const GUTTER = 4;

const atlases = new Map();

class WeatherAtlas {
    constructor(paths) {
        this.paths = paths;
        this.cols = Math.ceil(Math.sqrt(paths.length));
        this.rows = Math.ceil(paths.length / this.cols);
        this.count = paths.length;
        this.canvas = document.createElement("canvas");
        this.canvas.width = this.cols * CELL;
        this.canvas.height = this.rows * CELL;
        this.context = this.canvas.getContext("2d");
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.sources = [];
        this.videos = [];
        this.ready = this.load();
    }

    async load() {
        const textures = await Promise.all(this.paths.map((path) => game.Levels3DPreview.helpers.loadTexture(path).catch(() => null)));
        this.sources = textures.map((texture) => texture?.image ?? null);
        this.videos = this.sources.filter((source) => source instanceof HTMLVideoElement);
        this.draw();
        return this;
    }

    draw() {
        const context = this.context;
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.sources.forEach((source, index) => {
            if (!source || (source instanceof HTMLVideoElement && source.readyState < 2)) return;
            const x = (index % this.cols) * CELL + GUTTER;
            const y = Math.floor(index / this.cols) * CELL + GUTTER;
            context.drawImage(source, x, y, CELL - GUTTER * 2, CELL - GUTTER * 2);
        });
        this.texture.needsUpdate = true;
    }

    update() {
        if (this.videos.length) this.draw();
    }
}

export function getAtlas(paths) {
    const key = paths.join(",");
    if (!atlases.has(key)) atlases.set(key, new WeatherAtlas(paths));
    return atlases.get(key);
}
