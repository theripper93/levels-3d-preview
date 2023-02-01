export class WorkerHandler {
    constructor() {
        this.raycastWorker = null;
        this.callbacks = {};
        this._lastResults = {};
        this._lastKnownValid = {};
        this.initRaycastWorker();
    }

    get enabled() { 
        return (game.Levels3DPreview?.CONFIG?.useMultithreading && game.Levels3DPreview?.object3dSight && game.Levels3DPreview?.fogExploration);
    }

    initRaycastWorker() {
        if (!game.settings.get("levels-3d-preview", "useMultithreading")) return;
        const path = window.location.pathname.split("/game")[1] ?? "";
        const raycastWorker = new SharedWorker(path + "/modules/levels-3d-preview/scripts/helpers/raycastWorker.js", { type: "module" });
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
                    delete this.callbacks[e.data.callbackId];
                }
            }
            if (e.data.type == "refresh") {
                this.refresh();
            }
        };
    }

    refresh() {
        if(!this.enabled) return;
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
        data.callbackId = randomID(20);
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
        if (!this.enabled) return;
        this.raycastWorker.port.postMessage(data);
    }

    removeMesh(id) {
        if (!this.enabled) return;
        this.raycastWorker.port.postMessage({ type: "remove", id });
    }

    clearMeshes() {
        if (!this.raycastWorker) return;
        this.raycastWorker.port.postMessage({ type: "clear" });
        this.callbacks = {};
        this._lastResults = {};
        this._lastKnownValid = {};
    }
}
