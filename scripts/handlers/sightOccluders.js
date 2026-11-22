import { factor } from "../main.js";
import { posCanvasTo3d } from "../helpers/coords3d.js";

const MAX_ENTRIES = 50000;

export class SightOccluders {
    constructor(interactionManager) {
        this.interactionManager = interactionManager;
        this.entries = new Map();
        for (const hook of ["canvasTearDown", "createTile", "updateTile", "deleteTile", "createWall", "updateWall", "deleteWall"]) Hooks.on(hook, () => this.entries.clear());
    }

    test(v1, v2, sourceId) {
        const im = this.interactionManager;
        const key = sourceId ? `${sourceId}|${v2.x}|${v2.y}|${v2.z}` : null;
        const occluder = key ? this.entries.get(key) : null;
        if (occluder && this.blocks(occluder, v1, v2)) return true;
        im._lastSightHit = null;
        const hit = !!im.computeSightCollision(v1, v2, "sight");
        if (!key) return hit;
        if (!hit) this.entries.delete(key);
        else if (im._lastSightHit) {
            if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
            this.entries.set(key, im._lastSightHit);
        }
        return hit;
    }

    blocks(object, v1, v2) {
        const origin = posCanvasTo3d(v1);
        const target = posCanvasTo3d(v2);
        if (!this.isCandidate(object, origin, target)) return false;
        const raycaster = this.interactionManager.sightRaycaster;
        const distance = origin.distanceTo(target);
        raycaster.far = distance;
        raycaster.firstHitOnly = true;
        raycaster.set(origin, target.clone().sub(origin).normalize());
        const hit = raycaster.intersectObject(object, false)[0];
        return !!hit && hit.distance <= distance;
    }

    isCandidate(object, origin, target) {
        const owners = this.owners();
        let root = object;
        while (root && !owners.has(root)) root = root.parent;
        if (!root) return false;
        const rect = owners.get(root);
        if (rect === true) return true;
        const x0 = origin.x * factor;
        const y0 = origin.z * factor;
        const x1 = target.x * factor;
        const y1 = target.z * factor;
        if (x0 === x1 && y0 === y1) return true;
        return !!rect && new PIXI.Rectangle(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)).overlaps(rect);
    }

    owners() {
        const im = this.interactionManager;
        const cache = im._sightCandidates();
        if (cache.owners) return cache.owners;
        const owners = new Map();
        const add = (list) => {
            for (const { r, entry } of list) if (entry) for (const object of entry.sight) owners.set(object, r ?? null);
        };
        add(cache.tiles);
        add(cache.walls);
        add(cache.treeTiles);
        add(cache.treeWalls);
        if (im._parent.board) owners.set(im._parent.board, true);
        cache.owners = owners;
        return owners;
    }
}
