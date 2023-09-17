import * as THREE from "../lib/three.module.js";
export class WorkerHandler {
    constructor() {
        this.raycastWorker = null;
        this.callbacks = {};
        this._lastResults = {};
        this._lastKnownValid = {};
        this._visionReady = false;
        this._waitingForInit = false;
        this.initRaycastWorker();
    }

    get enabled() {
        return game.Levels3DPreview?.CONFIG?.useMultithreading && game.Levels3DPreview?.object3dSight;// && game.Levels3DPreview?.fogExploration;
    }

    initRaycastWorker() {
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
                if(this._waitingForInit) this._visionReady = true;
                this.refresh();
            }
            if (e.data.type == "rulerPoints") {
                game.Levels3DPreview.ruler._points = e.data.points.length > 2 ? e.data.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)) : 0;
            }
            if (e.data.type == "error") {
                console.error(e.data.error);
            }
            ///debug
            
            /*
            if (e.data.type == "removed") {
                console.log("Removed", e.data.data);
            }
            if (e.data.type == "added") {
                console.log("Added", e.data.data);
            }
            if (e.data.type == "geoType") { 
                console.log("GeoType", e.data.data);
            }
            if (e.data.type == "mergedGeometry") {
                console.log("Merged", e.data.data);
                game.Levels3DPreview.scene.remove(game.Levels3DPreview.scene.getObjectByName("shadowWorld"));
                const mesh = new THREE.ObjectLoader().parse(e.data.data.g);
                mesh.name = "shadowWorld";
                game.Levels3DPreview.scene.add(mesh);
            }*/
            
        };
    }

    refresh() {
        if (!this.enabled) return;
        canvas.perception.update(
            {
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

    updateRulerPoints(points) {
        if (!this.enabled) return;
        this.raycastWorker.port.postMessage({ type: "ruler", points });
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
        this._visionReady = false;
        this._waitingForInit = false;
        this.callbacks = {};
        this._lastResults = {};
        this._lastKnownValid = {};
    }
}
