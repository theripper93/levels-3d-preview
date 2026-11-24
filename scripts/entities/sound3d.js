import * as THREE from "three";
import { factor } from "../main.js";
import { createEntityGizmo, placeableGizmoState, snapActive } from "./effects/placeableGizmo.js";

const GIZMO_FLAGS = new Set(["refreshState", "refreshVisibility", "refreshField", "refreshTooltip", "refreshMeasurements"]);

export class Sound3D {
    constructor(sound, parent) {
        this.sound = sound;
        this._parent = parent;
        this.embeddedName = this.sound.document.documentName;
        this.draggable = true;
        this.placeable = this.sound;
        this.init();
    }

    init() {
        this.mesh = new THREE.Group();
        this._parent.scene.add(this.mesh);
        if (game.user.isGM) this.gizmo = createEntityGizmo(this, { glyph: "icons/svg/sound.svg", glyphOff: "icons/svg/sound-off.svg", fill: "#aaddff" });
        this.refresh();
    }

    rangeValues() {
        return { radius: this.sound.document.radius };
    }

    syncGizmo(range = this.rangeValues()) {
        if (!this.gizmo || this.sound.destroyed) return;
        this.gizmo.sync(
            placeableGizmoState(this, {
                disabled: !this.sound.isAudible,
                radius: (range.radius * canvas.dimensions.distancePixels) / factor,
                field: this.sound.source?.shape,
            }),
        );
    }

    commitRange({ radius }) {
        return this.sound.document.update({ radius: radius.toNearest(0.01) });
    }

    get dragLift() {
        this.gizmo?.updateGround();
        return this.gizmo?.height ?? 0;
    }

    onDragMove() {
        this.syncGizmo();
    }

    async updatePositionFrom3D(e) {
        this.skipMoveAnimation = true;
        const useSnapped = snapActive();
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor;
        const y = z3d * factor;
        const z = Math.round(((y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size) * 100) / 100;
        const snapped = canvas.sounds.getSnappedPoint({ x, y });
        const elevation = this.sound.document.elevation;
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        const deltas = {
            x: dest.x - this.sound.document.x,
            y: dest.y - this.sound.document.y,
            elevation: dest.elevation - elevation,
        };
        let updates = [];
        for (let sound of canvas.activeLayer.controlled.length ? canvas.activeLayer.controlled : [this.sound]) {
            const soundElevation = sound.document.elevation;
            updates.push({
                _id: sound.id,
                x: sound.document.x + deltas.x,
                y: sound.document.y + deltas.y,
                elevation: Math.round((soundElevation + deltas.elevation) * 1000) / 1000,
                flags: {
                    "levels-3d-preview": {
                        wasFreeMode: this.wasFreeMode,
                    },
                },
            });
        }
        const res = await canvas.scene.updateEmbeddedDocuments("AmbientSound", updates);
        if (!res.length) this.refresh();
        return true;
    }

    refresh() {
        const sound = this.sound;
        const elevation = sound.document.elevation;
        const z = (elevation * canvas.scene.dimensions.size) / canvas.scene.dimensions.distance;
        this.z = elevation;
        const position = {
            x: this.sound.document.x / factor,
            y: z / factor,
            z: this.sound.document.y / factor,
        };
        this.mesh.position.set(position.x, position.y, position.z);
        this.syncGizmo();
    }

    update(delta) {}

    destroy() {
        this._parent.scene.remove(this.mesh);
        this.gizmo?.dispose();
        this.gizmo = null;
        this.dragHandle = null;
    }

    _onClickLeft(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientSound") return;
        const event = e;
        this.sound._onClickLeft(event);
    }

    _onClickLeft2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientSound") return;
        const event = e;
        this.sound._onClickLeft2(event);
    }

    _onClickRight(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientSound") return;
        const event = e;
        this.sound._onClickRight(event);
    }

    _onClickRight2(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientSound") return;
        const event = e;
        this.sound._onClickRight2(event);
    }

    _onHoverIn(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientSound") return;
        this.placeable._onHoverIn(e);
    }

    _onHoverOut(e) {
        if (canvas.activeLayer.options.objectClass.embeddedName !== "AmbientSound") return;
        this.placeable._onHoverOut(e);
    }

    static setHooks() {
        function refreshOrUpdate(soundDocument) {
            if (game.Levels3DPreview?._active) {
                const sound3d = game.Levels3DPreview.sounds[soundDocument.id];
                if (!sound3d) return;
                game.Levels3DPreview.sounds[soundDocument.id]?.refresh();
            }
        }

        Hooks.on("updateAmbientSound", refreshOrUpdate);

        Hooks.on("refreshAmbientSound", (sound, flags) => {
            if (!game.Levels3DPreview?._active) return;
            game.Levels3DPreview.sounds[sound.document.id]?.syncGizmo();
            if (Object.keys(flags ?? {}).some((flag) => flags[flag] && !GIZMO_FLAGS.has(flag))) refreshOrUpdate(sound.document);
        });

        const syncAll = () => {
            if (!game.Levels3DPreview?._active) return;
            for (const sound3d of Object.values(game.Levels3DPreview.sounds)) {
                sound3d.gizmo?.invalidateGround();
                sound3d.syncGizmo();
            }
        };
        Hooks.on("activateSoundsLayer", syncAll);
        Hooks.on("deactivateSoundsLayer", syncAll);

        Hooks.on("createAmbientSound", (soundDocument) => {
            if (game.Levels3DPreview?._active && soundDocument.object) game.Levels3DPreview.addSound(soundDocument.object);
        });

        Hooks.on("deleteAmbientSound", (soundDocument) => {
            if (!game.Levels3DPreview?._active) return;
            game.Levels3DPreview.sounds[soundDocument.id]?.destroy();
            delete game.Levels3DPreview.sounds[soundDocument.id];
        });

        Hooks.on("pasteAmbientSound", (copy, data) => {
            if (game.Levels3DPreview?._active) {
                const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
                if (!pos) return;
                data.forEach((ld) => (ld.elevation = pos.z));
            }
        });
    }
}
