import * as THREE from "../lib/three.module.js";

export class WorkerHandler {
    constructor() {
        this.raycastWorker = null;
        this.callbacks = {};
        this._lastResults = {};
        this._lastKnownValid = {};
        this._visionReady = false;
        this._waitingForInit = false;
        this.deleteDebounced = foundry.utils.debounce(this.deleteDebounced.bind(this), 10);
        this.initRaycastWorker();
    }

    get enabled() {
        return game.Levels3DPreview?.CONFIG?.useMultithreading && game.Levels3DPreview?.object3dSight; // && game.Levels3DPreview?.fogExploration;
    }

    async initRaycastWorker() {
        const workerUrl = new URL("./raycastWorker.js", import.meta.url).href;
        const workerBase = workerUrl.substring(0, workerUrl.lastIndexOf("/") + 1);

        const trySharedWorker = (url) => {
            try { return new SharedWorker(url, { type: "module" }); }
            catch { return null; }
        };

        const setupPort = (w) => {
            w.port.onmessageerror = (e) => { throw new Error(e); };
            w.port.onmessage = (e) => {
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
                    if (this._waitingForInit) this._visionReady = true;
                    this.refresh();
                }
                if (e.data.type == "rulerPoints" && game.Levels3DPreview.ruler.useRaycastRuler) {
                    game.Levels3DPreview.ruler._points = e.data.points.length > 2 ? e.data.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)) : 0;
                }
                if (e.data.type == "error") {
                    console.error(e.data.error);
                }
            };
        };

        let raycastWorker = trySharedWorker(workerUrl);
        if (raycastWorker) {
            setupPort(raycastWorker);
            this.raycastWorker = raycastWorker;
            const connected = await this._awaitWorkerConnect(raycastWorker);
            if (connected) return;
        }

        console.warn("3D Canvas: SharedWorker failed to connect, trying blob fallback.");
        try {
            const res = await fetch(workerUrl);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            let text = await res.text();
            text = text.replace(
                /(from\s+["'])(\.\.?\/[^"']+)(["'])/g,
                (_, pre, p, post) => pre + new URL(p, workerBase).href + post
            );
            const blob = new Blob([text], { type: "application/javascript" });
            const blobUrl = URL.createObjectURL(blob);
            raycastWorker = trySharedWorker(blobUrl);
            if (!raycastWorker) { URL.revokeObjectURL(blobUrl); throw new Error("SharedWorker constructor threw"); }
            this._blobUrl = blobUrl;
            setupPort(raycastWorker);
            this.raycastWorker = raycastWorker;
        } catch (err) {
            console.error("3D Canvas: SharedWorker unavailable, multithreading disabled.", err);
            this.raycastWorker = null;
        }
    }

    async _awaitWorkerConnect(w, timeout = 3000) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), timeout);
            w.port.addEventListener("message", function handler(e) {
                if (e.data.type === "connected") {
                    clearTimeout(timer);
                    w.port.removeEventListener("message", handler);
                    resolve(true);
                }
            });
        });
    }

    refresh() {
        if (!this.enabled) return;
        console.log("Refreshing");
        canvas.perception.update(
            {
                initializeLighting: true,
                initializeSounds: true,
                initializeVision: true,
                refreshLighting: true,
                refreshSounds: true,
                refreshOcclusion: true,
                refreshVision: true,
            },
            true,
        );
    }

    requestWorkerRaycast(data, callback) {
        if (!this.raycastWorker) return;
        data.callbackId = foundry.utils.randomID(20);
        this.raycastWorker.port.postMessage(data);
        this.callbacks[data.callbackId] = callback;
    }

    updateRulerPoints(points) {
        if (!this.enabled) return;
        this.raycastWorker.port.postMessage({ type: "ruler", points });
    }

    getLastRaycast(id) {
        const result = this._lastResults[id];
        //delete this._lastResults[id];
        this.deleteDebounced(id);
        return result;
    }

    deleteDebounced(id) {
        delete this._lastResults[id];
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
        this._visionReady = false;
        this._waitingForInit = false;
        this.callbacks = {};
        this._lastResults = {};
        this._lastKnownValid = {};
        if (this._blobUrl) {
            URL.revokeObjectURL(this._blobUrl);
            this._blobUrl = null;
        }
    }
}
