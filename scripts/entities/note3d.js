import * as THREE from "three";
import * as coords3d from "../helpers/coords3d.js";
import { factor } from "../main.js";
import { basicMaterial, getShared, iconMaterial, isCoverIcon, makeLabel } from "./noteVisuals.js";

const tmp = new THREE.Vector3();
const DEFAULT_ICON = "icons/svg/book.svg";
const MIN_ICON_PX = 26;
const MAX_DISTANCE_SCALE = 3.5;
const MIN_LABEL_PX = 22;
const HOVER_SCALE = 1.2;
const DIM_OPACITY = 0.55;
const GROUND_OFFSET = 0.0015;
const LABEL_SCALE = 0.45;
const RING_INNER = 0.86;

export class Note3D {
    constructor(note) {
        this.note = note;
        this.embeddedName = note.document.documentName;
        this.placeable = note;
        this.bottom = note.document.elevation;
        this._parent = game.Levels3DPreview;
        this.draggable = true;
        this.mesh = new THREE.Group();
        this.draw();
        this.setPosition();
        this.scene.add(this.mesh);
        this._parent.notes[this.note.id] = this;
    }

    get scene() {
        return game.Levels3DPreview.scene;
    }

    get isGmOnly() {
        if (!game.user.isGM) return false;
        const doc = this.note.document;
        const target = doc.page ?? doc.entry;
        if (!target) return !(doc._source.author === null || doc.author?.isGM === false);
        const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
        let defaultLevel = target.ownership?.default ?? levels.NONE;
        if (defaultLevel === levels.INHERIT) defaultLevel = target.parent?.ownership?.default ?? levels.NONE;
        if (defaultLevel >= levels.LIMITED) return false;
        return !game.users.players.some((user) => target.testUserPermission(user, "LIMITED"));
    }

    _plane(material, size, z, renderOrder) {
        const mesh = new THREE.Mesh(getShared().plane, material);
        mesh.scale.set(size, size, 1);
        mesh.position.z = z;
        mesh.renderOrder = renderOrder;
        mesh.raycast = () => {};
        return mesh;
    }

    draw() {
        const doc = this.note.document;
        const s = getShared();
        const size = doc.iconSize / factor;
        const radius = size * 0.62;
        const lift = size * 0.7 + radius;
        const gmOnly = this.isGmOnly;
        const opacity = gmOnly ? DIM_OPACITY : 1;
        const tintValue = Number(doc.texture?.tint);
        const tint = Number.isFinite(tintValue) ? tintValue : 0xffffff;
        const ringColor = gmOnly ? 0x8a8f99 : tint !== 0xffffff ? tint : 0xf1ead9;
        const src = doc.texture?.src || DEFAULT_ICON;
        const root = new THREE.Group();
        const head = new THREE.Group();
        head.position.y = lift;
        root.add(head);
        head.add(this._plane(basicMaterial(`note-disc|${opacity}`, { map: s.textures.disc, color: 0x14161b, opacity: 0.88 * opacity }), radius * 2, 0, 2));
        head.add(this._plane(iconMaterial(src, tint, opacity), isCoverIcon(src) ? radius * 2 * RING_INNER : size * 0.78, radius * 0.01, 3));
        head.add(this._plane(basicMaterial(`note-ring|${ringColor}`, { map: s.textures.ring, color: ringColor }), radius * 2, radius * 0.02, 4));
        const hitbox = new THREE.Mesh(s.circle, s.hitMaterial);
        hitbox.scale.setScalar(radius);
        head.add(hitbox);
        const line = new THREE.Line(s.line, s.lineMaterial);
        line.scale.y = lift - radius;
        line.raycast = () => {};
        root.add(line);
        const shadow = new THREE.Mesh(s.ground, basicMaterial("note-shadow", { map: s.textures.shadow, color: 0x000000 }));
        shadow.scale.set(radius * 1.68, 1, radius * 1.68);
        shadow.position.y = GROUND_OFFSET;
        shadow.renderOrder = 1;
        shadow.raycast = () => {};
        root.add(shadow);
        const label = this._drawLabel(head, radius, gmOnly);
        this._visual = { root, head, label, radius, lift };
        this.mesh.add(root);
        this.mesh.userData.hitbox = hitbox;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
    }

    _drawLabel(head, radius, gmOnly) {
        const doc = this.note.document;
        const text = doc.label;
        if (!text) return null;
        const label = makeLabel(text, {
            family: doc.fontFamily || CONFIG.defaultFontFamily || "Signika",
            size: doc.fontSize || 32,
            color: doc.textColor?.css ?? "#ffffff",
        });
        const material = new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false, toneMapped: false, opacity: gmOnly ? 0.75 : 1 });
        const mesh = new THREE.Mesh(getShared().plane, material);
        const w = (label.width * LABEL_SCALE) / factor;
        const h = (label.height * LABEL_SCALE) / factor;
        const anchor = Object.values(CONST.TEXT_ANCHOR_POINTS).includes(doc.textAnchor) ? doc.textAnchor : CONST.TEXT_ANCHOR_POINTS.BOTTOM;
        mesh.position.z = radius * 0.05;
        mesh.renderOrder = 5;
        mesh.visible = false;
        mesh.raycast = () => {};
        mesh.userData.label = { w, h, gap: radius * 0.25, anchor, size: 0 };
        this._fitLabel(mesh, radius, 1);
        head.add(mesh);
        return mesh;
    }

    _fitLabel(label, radius, size) {
        const data = label.userData.label;
        if (Math.abs(data.size - size) < 0.01) return;
        data.size = size;
        const w = data.w * size;
        const h = data.h * size;
        const A = CONST.TEXT_ANCHOR_POINTS;
        const edge = radius + data.gap;
        label.scale.set(w, h, 1);
        label.position.x = data.anchor === A.LEFT ? -(edge + w / 2) : data.anchor === A.RIGHT ? edge + w / 2 : 0;
        label.position.y = data.anchor === A.BOTTOM ? -(edge + h / 2) : data.anchor === A.TOP ? edge + h / 2 : 0;
    }

    _disposeLabels() {
        const material = this._visual?.label?.material;
        if (!material) return;
        material.map?.dispose();
        material.dispose();
    }

    setPosition() {
        const position = coords3d.posCanvasTo3d({
            x: this.note.center.x,
            y: this.note.center.y,
            z: this.bottom,
        });
        this.mesh.position.set(position.x, position.y, position.z);
    }

    static async newNote(point) {
        const cls = foundry.utils.getDocumentClass("Note");
        await cls.createDialog({
            x: point.x * factor,
            y: point.z * factor,
            elevation: point.y * factor / canvas.dimensions.distancePixels,
        });
    }

    updatePositionFrom3D(e) {
        this.skipMoveAnimation = true;
        const useSnapped = coords3d.useSnapped();
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor;
        const y = z3d * factor;
        const z = Math.round(((y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size) * 100) / 100;
        const snapped = canvas.grid.getSnappedPoint({x, y}, {mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER, resolution: 2});
        let elevation = this.placeable.document.elevation;
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        const deltas = {
            x: dest.x - this.placeable.document.x,
            y: dest.y - this.placeable.document.y,
            elevation: dest.elevation - elevation,
        };
        let updates = [];
        for (let placeable of canvas.activeLayer.controlled.length ? canvas.activeLayer.controlled : [this.placeable]) {
            const placeableElevation = placeable.document.elevation;
            updates.push({
                _id: placeable.id,
                x: placeable.document.x + deltas.x,
                y: placeable.document.y + deltas.y,
                elevation: Math.round((placeableElevation + deltas.elevation) * 1000) / 1000,
                flags: {
                    "levels-3d-preview": {
                        wasFreeMode: this.wasFreeMode,
                    },
                },
            });
        }
        canvas.scene.updateEmbeddedDocuments("Note", updates);
        return true;
    }

    updateVisibility() {
        this.mesh.visible = this.placeable.visible;
        const labelVisible = !!this.note.tooltip?.visible;
        const visual = this._visual;
        if (!visual || !this.mesh.visible) return;
        const camera = this._parent.camera;
        const viewHeight = this._parent.renderer.domElement.clientHeight || window.innerHeight;
        const span = camera.isOrthographicCamera ? camera.top - camera.bottom : 2 * camera.position.distanceTo(this.mesh.getWorldPosition(tmp)) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const worldPerPixel = span / (camera.zoom || 1) / viewHeight;
        const hover = !!this.placeable.hover;
        const scale = THREE.MathUtils.clamp((MIN_ICON_PX * worldPerPixel) / (visual.radius * 2), 1, MAX_DISTANCE_SCALE) * (hover ? HOVER_SCALE : 1);
        visual.head.scale.setScalar(scale);
        visual.head.position.y = visual.lift + (scale - 1) * visual.radius;
        visual.head.quaternion.copy(camera.quaternion);
        if (visual.label) {
            visual.label.visible = labelVisible || hover;
            visual.label.renderOrder = hover ? 6 : 5;
            if (visual.label.visible) this._fitLabel(visual.label, visual.radius, Math.max(1, (MIN_LABEL_PX * worldPerPixel) / (visual.label.userData.label.h * scale)));
        }
    }

    destroy() {
        this._destroyed = true;
        this.scene.remove(this.mesh);
        this._disposeLabels();
        this._visual = null;
        delete this._parent.notes[this.note.id];
    }

    _onClickLeft(e) {
        this.placeable._onClickLeft(e);
    }

    _onClickLeft2(e) {
        this.placeable?._onClickLeft2(e);
    }

    _onClickRight(e) {
        this.placeable?._onClickRight(e);
    }

    _onClickRight2(e) {
        this.placeable?._onClickRight2(e);
    }

    _onHoverIn(e) {
        if (this.placeable?._onHoverIn && !this.placeable._destroyed) {
            this.placeable?._onHoverIn(e);
        }
    }

    _onHoverOut(e) {
        if (this.placeable?._onHoverOut && !this.placeable._destroyed) this.placeable?._onHoverOut(e);
    }

    static refreshEntry(entryId) {
        const L = game.Levels3DPreview;
        if (!L?._active || !entryId) return;
        for (const note of canvas.notes?.placeables ?? []) {
            if (note.document.entryId !== entryId || !L.notes[note.id]) continue;
            L.notes[note.id].destroy();
            L.createNote(note);
        }
    }

    static setHooks() {
        Hooks.on("updateNote", (note) => {
            if (game.Levels3DPreview?._active && note?.id) {
                game.Levels3DPreview.notes[note?.id]?.destroy();
                game.Levels3DPreview.createNote(note.object);
            }
        });

        Hooks.on("createNote", (note) => {
            if (game.Levels3DPreview?._active && note.object) game.Levels3DPreview.createNote(note.object);
        });

        Hooks.on("deleteNote", (note) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.notes[note.id]?.destroy();
        });

        Hooks.on("updateJournalEntry", (entry) => Note3D.refreshEntry(entry.id));
        Hooks.on("updateJournalEntryPage", (page) => Note3D.refreshEntry(page.parent?.id));
    }
}
