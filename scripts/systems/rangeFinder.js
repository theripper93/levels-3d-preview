import * as THREE from "three";
import * as coords3d from "../helpers/coords3d.js";
import { RulerPath3D, RulerLabels3D, rulerPixelScale } from "./ruler3d.js";

const ARC_SEGMENTS = 24;
const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
const previous = new THREE.Vector3();
const current = new THREE.Vector3();
const sightOrigin = new THREE.Vector3();
const sightTarget = new THREE.Vector3();

export class RangeFinder {
    constructor(token, options = {}) {
        if (!token.visible) return;
        this.options = options;
        const RFMode = this._parent.rangeFinderMode;
        if (RFMode === "none") return;
        if (RFMode === "combat" && !game.combat?.started) return;
        this.tokenId = token.id;
        this.token = token;
        this.target3d = this._parent.tokens[token.id];
        if (!this.target3d?.mesh) return;
        this.sources = (options.sources ?? canvas.tokens.controlled)
            .filter((t) => t.id != token.id)
            .map((t) => this._parent.tokens[t.id])
            .filter((t) => t?.mesh);
        if (!this.sources.length) return;
        RangeFinder.clear(token.id);
        const id = `range-finder-3d-${token.id}`;
        this.path3d = new RulerPath3D(id);
        this.labels3d = new RulerLabels3D(id, ["ruler-labels", "distance-ruler-labels", "range-finder-labels"]);
        this.meshes = [this.path3d.group];
        this._positions = new Float64Array((this.sources.length + 1) * 3);
        this._cameraMatrix = new THREE.Matrix4();
        this._projectionMatrix = new THREE.Matrix4();
        this._parent.rangeFinders.push(this);
        this._positionsChanged();
        this.draw();
    }

    get _parent() {
        return game.Levels3DPreview;
    }

    draw() {
        const path3d = this.path3d;
        path3d.clear();
        if (!path3d.attach()) return;
        const scale = canvas.dimensions.uiScale;
        const outline = { thickness: scale, color: 0x000000 };
        const lineColor = this.options.color ?? game.user.color;
        const target = this.target3d.mesh.position;
        const lift = 6 * scale * rulerPixelScale();
        const entries = [];
        for (const source of this.sources) {
            const blocked = this._isBlocked(source);
            const anchor = this._addArc(source.mesh.position, target, { width: 4 * scale, color: lineColor, outline, dashed: blocked, outlineDashed: blocked });
            anchor.y += lift;
            path3d.addWaypoint(source.mesh.position, { radius: 6 * scale, color: lineColor, outline });
            entries.push({ context: this._getLabelContext(source, scale), anchor });
        }
        path3d.addWaypoint(target, { radius: 6 * scale, color: this.getColor(), outline });
        path3d.build();
        const style = this.options.style;
        this.labels3d.render(entries, foundry.canvas.interaction.Ruler.WAYPOINT_LABEL_TEMPLATE).then(() => {
            if (!style || !this.labels3d._element) return;
            for (const label of this.labels3d._element.children) label.style.cssText += `;${style}`;
        });
    }

    _addArc(from, to, style) {
        curve.v0.copy(from);
        curve.v2.copy(to);
        curve.v1.copy(from).lerp(to, 0.5);
        curve.v1.y += from.distanceTo(to) / 2;
        previous.copy(from);
        for (let i = 1; i <= ARC_SEGMENTS; i++) {
            curve.getPoint(i / ARC_SEGMENTS, current);
            this.path3d.addSegment(previous, current, style);
            previous.copy(current);
        }
        return curve.getPoint(0.5, new THREE.Vector3());
    }

    _isBlocked(source) {
        const interactionManager = this._parent.interactionManager;
        if (!interactionManager) return false;
        sightOrigin.copy(source.mesh.position);
        sightOrigin.y += source.d / 2;
        sightTarget.copy(this.target3d.mesh.position);
        sightTarget.y += this.target3d.d / 2;
        return !!interactionManager.computeSightCollisionFrom3DPositions(sightOrigin, sightTarget, "sight");
    }

    _getLabelContext(source, scale) {
        const elevation = (this.token.document.elevation - source.token.document.elevation).toNearest(0.01);
        const text = this.options.text;
        const distance = text ?? coords3d.measureTokenRange(source, this.target3d).toNearest(0.01).toLocaleString(game.i18n.lang);
        return {
            action: { icon: "fa-solid fa-crosshairs" },
            cssClass: "last",
            secret: false,
            units: text ? "" : canvas.grid.units,
            uiScale: scale,
            distance: { total: distance },
            elevation: { total: elevation.signedString(), icon: "fa-solid fa-arrows-up-down", hidden: elevation === 0 },
        };
    }

    getColor() {
        const disposition = this.token.document.disposition;
        let disp = "NEUTRAL";
        for (const [k, v] of Object.entries(CONST.TOKEN_DISPOSITIONS)) {
            if (v === disposition) {
                disp = k;
            }
        }
        return this.options.color ?? CONFIG.Canvas.dispositionColors[disp];
    }

    _positionsChanged() {
        const positions = this._positions;
        let changed = false;
        let offset = 0;
        const check = (token3d) => {
            const p = token3d.mesh.position;
            if (positions[offset] !== p.x || positions[offset + 1] !== p.y || positions[offset + 2] !== p.z) {
                positions[offset] = p.x;
                positions[offset + 1] = p.y;
                positions[offset + 2] = p.z;
                changed = true;
            }
            offset += 3;
        };
        check(this.target3d);
        for (const source of this.sources) check(source);
        return changed;
    }

    _cameraChanged() {
        const camera = this._parent.camera;
        if (this._cameraMatrix.equals(camera.matrixWorld) && this._projectionMatrix.equals(camera.projectionMatrix)) return false;
        this._cameraMatrix.copy(camera.matrixWorld);
        this._projectionMatrix.copy(camera.projectionMatrix);
        return true;
    }

    updateText() {
        if (this._positionsChanged()) {
            this.draw();
            this._cameraChanged();
            return;
        }
        if (this._cameraChanged()) this.labels3d.update();
    }

    destroy() {
        this.path3d.destroy();
        this.labels3d.destroy();
        game.Levels3DPreview.rangeFinders = game.Levels3DPreview.rangeFinders.filter((rf) => rf != this);
    }

    static clear(tokenId) {
        for (const rf of [...game.Levels3DPreview.rangeFinders]) {
            if (rf.tokenId === tokenId) rf.destroy();
        }
    }

    static setHooks() {
        Hooks.on("hoverToken", (token, hover) => {
            if (!game.Levels3DPreview?._active) return;
            if (hover) new RangeFinder(token);
            else RangeFinder.clear(token.id);
        });
        Hooks.on("controlToken", (token) => {
            if (!game.Levels3DPreview?._active) return;
            RangeFinder.clear(token.id);
        });
    }
}
