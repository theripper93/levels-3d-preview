import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "../systems/ruler3d.js";
import { factor } from "../main.js";

export class Note3D {
    constructor(note) {
        this.note = note;
        this.embeddedName = note.document.documentName;
        this.placeable = note;
        this.nameplate = new THREE.Object3D();
        this.bottom = note.document.flags.levels?.rangeBottom ?? 0;
        this._parent = game.Levels3DPreview;
        this.draggable = true;
        this.mesh = new THREE.Group();
        this.model3d = this.placeable.document.getFlag("levels-3d-preview", "model3d");
        this.rotation = this.placeable.document.getFlag("levels-3d-preview", "rotation") ?? 0;
        this.model3d ? this.drawModel() : this.draw();
        this._drawTooltip();
        this.setPosition();
        this.scene.add(this.mesh);
        this._parent.notes[this.note.id] = this;
    }

    get scene() {
        return game.Levels3DPreview.scene;
    }

    async draw() {
        const texture = await this._parent.helpers.loadTexture(this.note.document.texture?.src);
        const size = this.note.document.iconSize / factor;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({ map: texture, color: this.note.document.texture?.tint });
        const mesh = new THREE.Mesh(geometry, material);
        this.mesh.userData.hitbox = mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        mesh.userData.entity3D = this;
        mesh.userData.isHitbox = true;
        this.mesh.add(mesh);
    }

    async drawModel() {
        const model = await this._parent.helpers.loadModel(this.model3d);
        if (!model) {
            const errText = game.i18n.localize("levels3dpreview.errors.filenotsupported");
            console.error(errText);
            ui.notifications.error(errText);
            return this.draw();
        }
        const size = this.note.document.iconSize / factor;
        const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(size, size, size));
        const mesh = this._parent.helpers.fitToBox(model.scene, box);
        mesh.rotation.y += Math.toRadians(this.rotation);
        const color = this.note.document.texture?.tint;
        if (color) {
            mesh.traverse((node) => {
                if (node.isMesh) {
                    node.material.color.multiply(new THREE.Color(color));
                }
            });
        }
        this.mesh.userData.hitbox = mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        mesh.userData.entity3D = this;
        mesh.userData.isHitbox = true;
        this.mesh.add(mesh);
    }

    _drawTooltip() {
        if (this.nameplate) this.mesh.remove(this.nameplate);
        const name = this.note._drawTooltip();
        name.visible = true;
        const container = new PIXI.Container();
        container.addChild(name);
        const base64 = canvas.app.renderer.extract.base64(container);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: new THREE.TextureLoader().load(base64),
            transparent: true,
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.center.set(0.5, 0.5);
        this.nameplate = sprite;
        const width = name.width / factor;
        const height = name.height / factor;
        this.nameplate.scale.set(width, height, 1);
        this.nameplate.position.set(0, this.note.document.iconSize / factor / 2 + height / 2 + 0.022, 0);
        this.mesh.add(this.nameplate);
    }

    setPosition() {
        const position = Ruler3D.posCanvasTo3d({
            x: this.note.center.x,
            y: this.note.center.y,
            z: this.bottom,
        });
        this.mesh.position.set(position.x, position.y, position.z);
    }

    updatePositionFrom3D(e) {
        this.skipMoveAnimation = true;
        const useSnapped = Ruler3D.useSnapped();
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor;
        const y = z3d * factor;
        const z = Math.round(((y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size) * 100) / 100;
        const snapped = canvas.grid.getSnappedPosition(x, y);
        let { rangeTop, rangeBottom } = CONFIG.Levels.helpers.getRangeForDocument(this.placeable.document);
        if (rangeBottom === -Infinity) rangeBottom = 0;
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        const deltas = {
            x: dest.x - this.placeable.document.x,
            y: dest.y - this.placeable.document.y,
            elevation: dest.elevation - rangeBottom,
        };
        let updates = [];
        for (let placeable of canvas.activeLayer.controlled.length ? canvas.activeLayer.controlled : [this.placeable]) {
            const placeableFlags = CONFIG.Levels.helpers.getRangeForDocument(placeable.document);
            if (placeableFlags.rangeBottom === -Infinity) placeableFlags.rangeBottom = 0;
            updates.push({
                _id: placeable.id,
                x: placeable.document.x + deltas.x,
                y: placeable.document.y + deltas.y,
                flags: {
                    "levels-3d-preview": {
                        wasFreeMode: this.wasFreeMode,
                    },
                    levels: {
                        rangeBottom: Math.round((placeableFlags.rangeBottom + deltas.elevation) * 1000) / 1000,
                        rangeTop: Math.round((placeableFlags.rangeBottom + deltas.elevation) * 1000) / 1000,
                    },
                },
            });
        }
        canvas.scene.updateEmbeddedDocuments("Note", updates);
        return true;
    }

    updateVisibility() {
        this.mesh.visible = this.placeable.visible;
        this.nameplate.visible = this.note.tooltip.visible;
    }

    destroy() {
        this.scene.remove(this.mesh);
        delete this._parent.notes[this.note.id];
    }

    _onClickLeft(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.placeable._onClickLeft(event);
    }

    _onClickLeft2(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.placeable?._onClickLeft2(event);
    }

    _onClickRight(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.placeable?._onClickRight(event);
    }

    _onClickRight2(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.placeable?._onClickRight2(event);
    }

    _onHoverIn(e) {
        if (this.placeable?._onHoverIn && !this.placeable._destroyed) {
            this.placeable?._onHoverIn(e);
        }
    }

    _onHoverOut(e) {
        if (this.placeable?._onHoverOut && !this.placeable._destroyed) this.placeable?._onHoverOut(e);
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
    }
}
