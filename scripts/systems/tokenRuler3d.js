import * as THREE from "three";
import { factor } from "../main.js";
import { posCanvasTo3d, unitsToPixels } from "../helpers/coords3d.js";
import { RulerPath3D, RulerLabels3D, is3DActive, rulerPixelScale } from "./ruler3d.js";

const tokenRulers = new Set();

const MAX_TERRAIN_SAMPLES = 32;

const PENDING_ALPHA = 0.5;
const PENDING_DASH = 12;
const PENDING_GAP = 8;
const MAX_DASHES = 64;

export function TokenRuler3DMixin(Base) {
    return class TokenRuler3D extends Base {
        static is3DTokenRuler = true;

        #path3d;

        #labels3d;

        constructor(token) {
            super(token);
            let id = `token-ruler-3d-${token.document.id}`;
            if (token.isPreview) id += "-preview";
            this.#path3d = new RulerPath3D(id);
            this.#labels3d = new RulerLabels3D(id, ["ruler-labels", "token-ruler-labels"]);
            tokenRulers.add(this);
        }

        get mesh3d() {
            return this.#path3d.group;
        }

        get labels3d() {
            return this.#labels3d;
        }

        get isVisible() {
            if (is3DActive() && canvas.scene?.getFlag("levels-3d-preview", "enableRuler") === false) return false;
            return super.isVisible;
        }

        _onVisibleChange() {
            super._onVisibleChange();
            this.#path3d.visible = this.visible;
            this.#labels3d.hidden = !this.visible;
        }

        clear() {
            this._clear3D();
            super.clear();
        }

        destroy() {
            this.#path3d.destroy();
            this.#labels3d.destroy();
            tokenRulers.delete(this);
            super.destroy();
        }

        refresh(rulerData = {}) {
            if (!is3DActive()) {
                this._clear3D();
                return super.refresh(rulerData);
            }
            const rulerPaths = this._create3DRulerPaths(rulerData);
            this._draw3DPaths(rulerPaths);
            this._render3DLabels(rulerPaths);
        }

        _create3DRulerPaths({ passedWaypoints, pendingWaypoints, plannedMovement } = {}) {
            passedWaypoints ??= [];
            pendingWaypoints ??= [];
            plannedMovement ??= {};
            const path = this._create3DPath([
                { waypoints: passedWaypoints, stage: "passed", hidden: false, unreachable: false },
                { waypoints: pendingWaypoints, stage: "pending", hidden: false, unreachable: false },
            ]);
            const rulerPaths = [{ waypoints: this._create3DRenderedPath(path), searching: false, userId: null }];
            const planned = Object.entries(plannedMovement);
            const selfIndex = planned.findIndex(([userId]) => userId === game.user.id);
            if (selfIndex >= 0 && selfIndex < planned.length - 1) planned.push(...planned.splice(selfIndex, 1));
            for (const [userId, { foundPath = [], unreachableWaypoints = [], history = [], hidden, searching } = {}] of planned) {
                const path = this._create3DPath([
                    { waypoints: history, stage: "passed", hidden, unreachable: false },
                    { waypoints: foundPath, stage: "planned", hidden, unreachable: false, userId },
                    { waypoints: unreachableWaypoints, stage: "planned", hidden, unreachable: true, userId },
                ]);
                const waypoints = this._create3DRenderedPath(path);
                if (history.length) {
                    const i = waypoints.findIndex((w) => w.stage !== "passed");
                    if (i >= 0) waypoints.splice(0, i);
                    else waypoints.length = 0;
                }
                rulerPaths.push({ waypoints, searching: !!searching, userId });
            }
            return rulerPaths;
        }

        _create3DPath(pathParts) {
            const path = [];
            const actionConfigs = CONFIG.Token.movement.actions;
            let index = 0;
            for (const { waypoints, stage, hidden, unreachable, userId } of pathParts) {
                for (let waypoint of waypoints ?? []) {
                    if (waypoint.explicit) index++;
                    const actionConfig = actionConfigs[waypoint.action] ?? actionConfigs.displace;
                    waypoint = { ...waypoint, actionConfig, index, stage, hidden, unreachable };
                    if (userId) waypoint.userId = userId;
                    waypoint.movementId ??= null;
                    waypoint.subpathId ??= null;
                    waypoint.center = this.token.document.getCenterPoint(waypoint);
                    waypoint.size = this.token.document.getSize(waypoint);
                    path.push(waypoint);
                }
            }
            this._measure3DPath(path);
            this._preparePath(path);
            return path;
        }

        _create3DRenderedPath(path) {
            const renderedPath = [];
            const queue = [];
            for (const waypoint of path) {
                queue.push(waypoint);
                if (!this._shouldRenderWaypoint(waypoint)) continue;
                const accumulatedData = queue.reduce((accumulator, w) => {
                    this._accumulateWaypointData(accumulator, w);
                    return accumulator;
                }, {});
                queue.length = 0;
                renderedPath.push({ ...waypoint, ...accumulatedData });
            }
            this._measure3DPath(renderedPath);
            return renderedPath;
        }

        _measure3DPath(waypoints) {
            const measurement = this.token.measureMovementPath(waypoints);
            const Ray = foundry.canvas.geometry.Ray;
            for (let i = 0; i < waypoints.length; i++) {
                const waypoint = waypoints[i];
                waypoint.ray = i > 0 ? new Ray(waypoints[i - 1].center, waypoint.center) : null;
                waypoint.measurement = measurement.waypoints[i];
                waypoint.previous = i > 0 ? waypoints[i - 1] : null;
                waypoint.next = i < waypoints.length - 1 ? waypoints[i + 1] : null;
            }
        }

        _waypointTo3D(waypoint) {
            return posCanvasTo3d({ x: waypoint.center.x, y: waypoint.center.y, z: waypoint.elevation ?? 0 });
        }

        _draw3DPaths(rulerPaths) {
            const path3d = this.#path3d;
            path3d.clear();
            if (!rulerPaths.some((p) => p.waypoints.length)) {
                path3d.group.removeFromParent();
                return;
            }
            if (!path3d.attach()) return;
            path3d.visible = this.visible;
            const terrain = this._useTerrainFollowing();
            for (const { waypoints, searching } of rulerPaths) {
                if (!waypoints.length) continue;
                const points = waypoints.map((w) => this._waypointTo3D(w));
                const first = waypoints[0];
                const from = first.previous ? this._waypointTo3D(first.previous) : null;
                for (let i = 0; i < waypoints.length; i++) {
                    const waypoint = waypoints[i];
                    const start = i > 0 ? points[i - 1] : from;
                    if (!start) continue;
                    let { width, color = 0xffffff, alpha = 1 } = this._getSegmentStyle(waypoint);
                    if (!(width > 0)) continue;
                    if (waypoint.unreachable) alpha *= 0.35;
                    const pending = waypoint.stage === "pending";
                    if (pending) alpha *= PENDING_ALPHA;
                    const line = terrain && this._shouldFollowTerrain(waypoint) ? this._sampleTerrain(start, points[i]) : [start, points[i]];
                    const style = { width, color, alpha, pulse: searching && waypoint.stage === "planned" };
                    if (pending) for (const dash of this._dashLine(line, width)) path3d.addLine(dash, style);
                    else path3d.addLine(line, style);
                }
                for (let i = 0; i < waypoints.length; i++) {
                    const waypoint = waypoints[i];
                    let { radius, color = 0xffffff, alpha = 1 } = this._getWaypointStyle(waypoint);
                    if (waypoint.unreachable) alpha *= 0.35;
                    if (waypoint.stage === "pending") alpha *= PENDING_ALPHA;
                    path3d.addSphere(points[i], { radius, color, alpha, pulse: searching && waypoint.stage === "planned" });
                }
            }
        }

        _dashLine(points, width) {
            const unit = (width / 4) * rulerPixelScale();
            let dash = PENDING_DASH * unit;
            let gap = PENDING_GAP * unit;
            let length = 0;
            for (let i = 1; i < points.length; i++) length += points[i - 1].distanceTo(points[i]);
            if (!(length > 0) || !(dash > 0)) return [points];
            const count = length / (dash + gap);
            if (count > MAX_DASHES) {
                dash *= count / MAX_DASHES;
                gap *= count / MAX_DASHES;
            }
            const dashes = [];
            let current = [points[0].clone()];
            let drawing = true;
            let remaining = dash;
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1];
                const b = points[i];
                const segment = a.distanceTo(b);
                if (!(segment > 0)) continue;
                let travelled = 0;
                while (segment - travelled > remaining) {
                    travelled += remaining;
                    const p = new THREE.Vector3().lerpVectors(a, b, travelled / segment);
                    if (drawing) {
                        current.push(p);
                        dashes.push(current);
                        current = null;
                    } else {
                        current = [p];
                    }
                    drawing = !drawing;
                    remaining = drawing ? dash : gap;
                }
                remaining -= segment - travelled;
                if (drawing) current.push(b.clone());
            }
            if (drawing && current?.length >= 2) dashes.push(current);
            return dashes;
        }

        _render3DLabels(rulerPaths) {
            const template = this.constructor.WAYPOINT_LABEL_TEMPLATE;
            const entries = [];
            const tokenHeight = game.Levels3DPreview?.tokens?.[this.token.id]?.tokenHeight ?? canvas.dimensions.distance;
            const lift = 6 * canvas.dimensions.uiScale * rulerPixelScale();
            for (const { waypoints } of rulerPaths) {
                const state = {};
                for (const waypoint of waypoints) {
                    const context = this._getWaypointLabelContext(waypoint, state);
                    if (!context) continue;
                    context.waypoint = waypoint;
                    context.waypointType = "token-ruler";
                    context.uiScale ??= canvas.dimensions.uiScale;
                    const anchor = this._waypointTo3D(waypoint);
                    if (!waypoint.next) anchor.y += unitsToPixels(tokenHeight);
                    anchor.y += lift;
                    entries.push({ context, anchor });
                }
            }
            this.#labels3d.hidden = !this.visible;
            this.#labels3d.render(entries, template);
        }

        _useTerrainFollowing() {
            try {
                return !!game.settings.get("levels-3d-preview", "useRaycastRuler") && !!game.Levels3DPreview?.interactionManager?._sightCollisions?.move?.length;
            } catch {
                return false;
            }
        }

        _shouldFollowTerrain(waypoint) {
            const actionConfig = waypoint.actionConfig;
            if (!actionConfig?.visualize || actionConfig.teleport) return false;
            if (waypoint.action === "fly" || waypoint.action === "burrow") return false;
            return true;
        }

        _sampleTerrain(a, b) {
            const im = game.Levels3DPreview.interactionManager;
            const cell = canvas.dimensions.size / factor;
            const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
            const samples = Math.min(MAX_TERRAIN_SAMPLES, Math.ceil(horizontal / (cell / 2)));
            if (samples < 2) return [a, b];
            const above = unitsToPixels(canvas.dimensions.distance * 0.5);
            const below = unitsToPixels(canvas.dimensions.distance * 2);
            const top = Math.max(a.y, b.y) + above;
            const bottom = Math.min(a.y, b.y) - below;
            const points = [a];
            for (let i = 1; i < samples; i++) {
                const p = new THREE.Vector3().lerpVectors(a, b, i / samples);
                const hit = im.computeSightCollisionFrom3DPositions(new THREE.Vector3(p.x, top, p.z), new THREE.Vector3(p.x, bottom, p.z), "move", false, true);
                if (hit) p.y = hit.y;
                points.push(p);
            }
            points.push(b);
            return points;
        }

        _clear3D() {
            this.#path3d.clear();
            this.#path3d.group.removeFromParent();
            this.#labels3d.clear();
        }

        updateLabels() {
            if (!is3DActive()) return;
            if (!this.visible) return;
            this.#path3d.tick();
            this.#labels3d.update();
        }

        static updateAllLabels() {
            for (const ruler of tokenRulers) ruler.updateLabels();
        }

        static clearAll3D() {
            for (const ruler of tokenRulers) {
                ruler._clear3D();
                ruler.token?.renderFlags?.set({ refreshRuler: true });
            }
        }
    };
}

export const TokenRuler3D = TokenRuler3DMixin(foundry.canvas.placeables.tokens.TokenRuler);

export function registerTokenRuler3D() {
    const cls = CONFIG.Token.rulerClass;
    if (!cls || cls.is3DTokenRuler === true) return false;
    CONFIG.Token.rulerClass = TokenRuler3DMixin(cls);
    if (canvas?.ready) recreateTokenRulers3D();
    return true;
}

let rulerRecreate = Promise.resolve();

export function recreateTokenRulers3D() {
    rulerRecreate = rulerRecreate.then(recreateTokenRulers);
    return rulerRecreate;
}

async function recreateTokenRulers() {
    if (!canvas?.ready || canvas.loading || !canvas.tokens) return;
    const promises = [];
    for (const token of canvas.tokens.placeables) {
        if (token.destroyed || token.ruler === undefined) continue;
        promises.push(
            (async () => {
                token.ruler?.destroy();
                token.ruler = token._initializeRuler();
                if (!token.ruler) return;
                await token.ruler.draw();
                if (token.destroyed) return;
                token.ruler.visible = token.ruler.isVisible;
                token.renderFlags.set({ refreshRuler: true });
            })().catch((e) => console.error("3D Canvas | Failed to recreate token ruler", e)),
        );
    }
    await Promise.all(promises);
}
