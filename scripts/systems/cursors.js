import * as THREE from "three";
import { factor } from "../main.js";

export class Cursors3D {
    constructor(parent) {
        this._parent = parent;
        this._cursors = {};
        this.radius = 0.007;
    }

    get scene() {
        return this._parent.scene;
    }

    update() {
        game.users.forEach(u => this.updateCursor(u.id, canvas.controls.getCursorForUser(u.id)))
    }

    updateCursor(uId, cursor) {
        if(!cursor) return;
        if (!this._cursors[uId]) {
            this.createCursor(uId, cursor);
        }
        this.updateCursorPosition(uId, cursor);
    }

    createCursor(uId, cursor) {
        const color = game.users.get(uId).color?.css;
        const geometry = new THREE.SphereGeometry(this.radius, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        this.scene.add(mesh);
        this._cursors[uId] = mesh;
        this.updateCursorPosition(uId, cursor);
    }

    updateCursorPosition(uId, cursor) {
        const mesh = this._cursors[uId];
        const raw = cursor.target?.x;
        // A plain 2D cursor (user not in 3D) has a numeric x: there is no 3D position to show
        if (typeof raw !== "string") {
            mesh.visible = false;
            mesh.userData.lastRaw = undefined;
            mesh.userData.hasTarget = false;
            return;
        }
        // Only parse when the broadcast payload changed
        if (raw !== mesh.userData.lastRaw) {
            mesh.userData.lastRaw = raw;
            let target = null;
            try {
                target = JSON.parse(raw);
            } catch (e) {}
            mesh.userData.hasTarget = !!(target && (target.x || target.z));
            if (mesh.userData.hasTarget) mesh.userData.lastPosition = new THREE.Vector3(target.x, target.y, target.z);
        }
        if (!mesh.userData.hasTarget) return;
        mesh.visible = true;
        mesh.position.lerp(mesh.userData.lastPosition, 0.1);
    }

    clear() {
        this._cursors = {};
    }
}

