import { MODULE_ID } from "../main.js";
import { TERRAIN_JOBS } from "./terrainJobs.js";

export const terrainJobs = {
    disabled: false,
    failed: false,
    worker: null,
    pending: new Map(),
    seq: 0,

    run(type, payload) {
        const worker = this.disabled ? null : this.connect();
        if (!worker) return Promise.resolve().then(() => TERRAIN_JOBS[type](payload));
        const id = ++this.seq;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            worker.postMessage({ id, type, payload });
        }).catch((err) => {
            this.pending.delete(id);
            console.warn("3D Canvas: terrain worker job failed, running it on the main thread.", err);
            return TERRAIN_JOBS[type](payload);
        });
    },

    connect() {
        if (this.worker || this.failed) return this.worker;
        try {
            const worker = new Worker(foundry.utils.getRoute(`modules/${MODULE_ID}/terrainWorker.js`));
            worker.onmessage = ({ data }) => {
                const job = this.pending.get(data.id);
                if (!job) return;
                this.pending.delete(data.id);
                if (data.error) job.reject(new Error(data.error));
                else job.resolve(data.result);
            };
            worker.onerror = (event) => {
                event.preventDefault();
                this.fail(new Error(event.message || "terrain worker error"));
            };
            this.worker = worker;
        } catch (err) {
            this.fail(err);
        }
        return this.worker;
    },

    fail(err) {
        this.failed = true;
        this.worker?.terminate();
        this.worker = null;
        for (const job of this.pending.values()) job.reject(err);
        this.pending.clear();
    },
};
