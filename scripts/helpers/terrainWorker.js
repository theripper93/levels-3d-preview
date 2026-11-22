import { TERRAIN_JOBS, transferables } from "./terrainJobs.js";

self.onmessage = ({ data: { id, type, payload } }) => {
    try {
        const result = TERRAIN_JOBS[type](payload);
        self.postMessage({ id, result }, [...transferables(result)]);
    } catch (err) {
        self.postMessage({ id, error: String(err?.stack ?? err) });
    }
};
