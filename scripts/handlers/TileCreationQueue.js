export class TileCreationQueue{
    constructor () {
        this.queue = [];
        this.processQueue = debounce(this.processQueue.bind(this), 100);
    }
    
    async createTile(data) {
        let resolve = null;
        const promise = new Promise((res) => resolve = res);
        this.queue.push({data, resolve});
        this.processQueue();
        return promise;
    }

    async processQueue() {
        if (this.queue.length === 0) return;
        const tileData = this.queue.map((t) => t.data);
        const tiles = await canvas.scene.createEmbeddedDocuments("Tile", tileData);
        this.queue.forEach((t, i) => t.resolve([tiles[i]]));
        this.queue = [];
    }


}