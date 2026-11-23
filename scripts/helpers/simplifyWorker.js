import { cacheKey, runJob, simplifierReady, simplifyTransferables } from "./simplifyJobs.js";

const DB_NAME = "levels-3d-preview-simplify";
const STORE = "results";
let database = null;

function openDatabase() {
    database ??= new Promise((resolve) => {
        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return database;
}

async function readCache(key) {
    const db = await openDatabase();
    if (!db) return undefined;
    return new Promise((resolve) => {
        try {
            const request = db.transaction(STORE).objectStore(STORE).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(undefined);
        } catch {
            resolve(undefined);
        }
    });
}

async function writeCache(key, value) {
    const db = await openDatabase();
    if (!db) return;
    try {
        db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
    } catch {}
}

self.onmessage = async ({ data: { id, payload } }) => {
    try {
        const key = cacheKey(payload);
        const cached = await readCache(key);
        if (cached !== undefined) {
            self.postMessage({ id, result: cached.result, cached: true }, simplifyTransferables(cached.result));
            return;
        }
        await simplifierReady;
        const result = runJob(payload);
        await writeCache(key, { result });
        self.postMessage({ id, result }, simplifyTransferables(result));
    } catch (err) {
        self.postMessage({ id, error: String(err?.stack ?? err) });
    }
};
