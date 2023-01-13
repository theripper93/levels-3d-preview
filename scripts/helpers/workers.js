export class WorkerHandler {
    constructor() {
        this.raycastWorker = null;
        this.callbacks = {};
        this._lastResults = {};
        this._lastKnownValid = {};
        this.initRaycastWorker();
    }

    initRaycastWorker() {
        const raycastWorker = new SharedWorker("modules/levels-3d-preview/scripts/helpers/raycastWorker.js", { type: "module" });
        this.raycastWorker = raycastWorker;
        raycastWorker.port.onmessageerror = (e) => {
            throw new Error(e);
        };

        raycastWorker.port.onmessage = (e) => {
            //console.log(e.data);
            if (e.data.type == "polygon") {
                const callback = this.callbacks[e.data.callbackId];
                if (callback) {
                    this._lastResults[e.data.id] = e.data.polygonPoints;
                    this._lastKnownValid[e.data.id] = e.data.polygonPoints;
                    callback(e.data.polygonPoints);
                }
            }
            if (e.data.type == "refresh") {
                this.refresh();
            }
        };
    }

    refresh() { 
                canvas.perception.update(
                    {
                        forceUpdateFog: true,
                        initializeLighting: true,
                        initializeSounds: true,
                        initializeVision: true,
                        refreshLighting: true,
                        refreshSounds: true,
                        refreshTiles: true,
                        refreshVision: true,
                    },
                    true,
                );
    }

    requestWorkerRaycast(data, callback) {
        data.callbackId = randomID(20)
        this.raycastWorker.port.postMessage(data);
        this.callbacks[data.callbackId] = callback;
    }

    getLastRaycast(id) { 
        const result = this._lastResults[id];
        delete this._lastResults[id];
        return result;
    }

    getLastComputed(id) { 
        return this._lastKnownValid[id];
    }

    addMesh(data) { 
        this.raycastWorker.port.postMessage(data);
    }

    removeMesh(id) { 
        this.raycastWorker.port.postMessage({ type: "remove", id });
    }

    clearMeshes() { 
        this.raycastWorker.port.postMessage({type: "clear"});
        this.callbacks = {};
        this._lastResults = {};
        this._lastKnownValid = {};
    }
}
