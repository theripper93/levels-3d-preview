import * as THREE from "three";
import { ClusterLight } from "../../lighting/cluster/clusterLight.js";

const SPACING = 3;
const HEIGHT = 1;
const RANGE = 4;
const INTENSITY = 2;
const lights = new Map();

export function clearLavaLights(state) {
    for (const light of lights.get(state) ?? []) light.removeFromParent();
    lights.delete(state);
}

export function syncLavaLights(state, bed, shore, hidden, high) {
    clearLavaLights(state);
    const params = state.params;
    const scene = game.Levels3DPreview?.scene;
    const glow = Number(params.glow ?? 0);
    if (!scene || !(Number(params.crust) > 0) || !(glow > 0)) return;
    const { depth, local, rw, rh, x0, z0, w, h, surface, gs } = bed;
    const spacing = SPACING * (high ? 1 : 1.5) * gs;
    const sx = Math.max(1, Math.round((spacing / w) * rw));
    const sy = Math.max(1, Math.round((spacing / h) * rh));
    const color = new THREE.Color(params.shallow_color ?? "#ff7a10").lerp(new THREE.Color(params.foam_color ?? "#ffc828"), 0.35);
    const list = [];
    for (let by = 0; by < rh; by += sy) {
        for (let bx = 0; bx < rw; bx += sx) {
            let best = -1;
            for (let y = by; y < Math.min(by + sy, rh); y++) {
                for (let x = bx; x < Math.min(bx + sx, rw); x++) {
                    const i = y * rw + x;
                    if (depth[i] > 0 && !hidden[i] && (best < 0 || shore[i] > shore[best])) best = i;
                }
            }
            if (best < 0) continue;
            const level = local?.[best];
            const light = new ClusterLight({ color, intensity: INTENSITY * Math.min(glow, 2), distance: RANGE * gs, decay: 1 });
            light.position.set(x0 + (((best % rw) + 0.5) / rw) * w, (Number.isFinite(level) ? level : surface) + HEIGHT * gs, z0 + h - ((Math.floor(best / rw) + 0.5) / rh) * h);
            light.updateMatrix();
            scene.add(light);
            list.push(light);
        }
    }
    lights.set(state, list);
}
