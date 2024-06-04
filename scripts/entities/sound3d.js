import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { Ruler3D } from "../systems/ruler3d.js";

export class Sound3D {
    constructor(sound, parent) {
        this.sound = sound;
        this._parent = parent;
        this._useHelper = game.user.isGM && game.settings.get("levels-3d-preview", "lightHelpers");
        this.radius = ((sound.document.radius / canvas.dimensions.distance) * canvas.dimensions.size) / factor;
        this.embeddedName = this.sound.document.documentName;
        this.draggable = true;
        this.placeable = this.sound;
        this.init();
    }

    init() {
        this.mesh = new THREE.Group();
        this._parent.scene.add(this.mesh);
        this.sound3d = new THREE.Object3D();
        const use3DSound = true;
        /*if (use3DSound) {
            this.sound3d = new THREE.PositionalAudio(this._parent.listener);
            this._parent.audioLoader.load(this.sound.document.path, (buffer) => {
                this.sound3d.setBuffer(buffer);
                //this.sound3d.setRefDistance(this.radius);
                this.sound3d.setDistanceModel("linear");
                this.sound3d.setMaxDistance(this.radius);
                this.sound3d.setLoop(true);
                this.sound3d.setVolume(1);//this.sound.document.volume);
                this.sound3d.play();
            });
            this.mesh.add(this.sound3d);
        }*/
        if (game.user.isGM) this.createHandle();
        this.refresh();
    }

    get useHelper() {
        return this._useHelper;
    }

    createHandle() {
        const texture = this._parent.textures.soundOn;
        const size = (canvas.scene.dimensions.size * 0.5) / factor / 2;
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: new THREE.Color("white"), transparent: true, depthWrite: false, opacity: 0.5 });
        const soundSphere = new THREE.Mesh(geometry, material);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.8 }));
        sprite.scale.set(size * 1.5, size * 1.5, size * 1.5);
        const mesh = new THREE.Group();
        mesh.add(soundSphere);
        mesh.add(sprite);
        this.mesh.userData.hitbox = mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        mesh.userData.entity3D = this;
        mesh.userData.isHitbox = true;
        mesh.userData.sprite = sprite;
        mesh.userData.sphere = soundSphere;
        this.dragHandle = mesh;
        this.mesh.add(mesh);
    }

    updateHandle() {
        if (!this.dragHandle) return;
        this.dragHandle.visible = canvas.sounds.active;
        if (this.useHelper && this.soundHelper) this.soundHelper.visible = canvas.sounds.active && !this.sound.document.hidden;
        if (!this.dragHandle.visible) return;
        this.dragHandle.userData.sprite.material.map = this.sound.document.hidden ? this._parent.textures.soundOff : this._parent.textures.soundOn;
        this.dragHandle.userData.sprite.material.color.set(this.sound.document.hidden ? "#ff0000" : "#ffffff");
        this.dragHandle.userData.sphere.material.color.set(this.color || "#ffffff");
    }

    async updatePositionFrom3D(e) {
        this.skipMoveAnimation = true;
        const useSnapped = Ruler3D.useSnapped();
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor;
        const y = z3d * factor;
        const z = Math.round(((y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size) * 100) / 100;
        const snapped = canvas.grid.getSnappedPoint({x, y}, {mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER, resolution: 2});
        const { rangeTop, elevation } = CONFIG.Levels.helpers.getRangeForDocument(this.sound.document);
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
            const soundFlags = CONFIG.Levels.helpers.getRangeForDocument(sound.document);
            updates.push({
                _id: sound.id,
                x: sound.document.x + deltas.x,
                y: sound.document.y + deltas.y,
                elevation: Math.round((soundFlags.elevation + deltas.elevation) * 1000) / 1000,
                flags: {
                    "levels-3d-preview": {
                        wasFreeMode: this.wasFreeMode,
                    },
                    levels: {
                        rangeTop: Math.round((soundFlags.elevation + deltas.elevation) * 1000) / 1000,
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
        if (this.dragHandle) {
            this.dragHandle.position.set(0, 0, 0);
        }
        let top = sound.document.flags.levels?.rangeTop ?? 1;
        let bottom = sound.document.elevation;
        const z = ((top + bottom) * canvas.scene.dimensions.size) / canvas.scene.dimensions.distance / 2;
        this.z = (top + bottom) / 2;
        const position = {
            x: this.sound.document.x / factor,
            y: z / factor,
            z: this.sound.document.y / factor,
        };
        if (this.useHelper) {
            this.mesh.remove(this.soundHelper);
            this.soundHelper?.geometry.dispose();
            this.soundHelper?.material.dispose();
            this.soundHelper = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 16, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color("white"), wireframe: true }));
            this.mesh.add(this.soundHelper);
            this.soundHelper.userData.ignoreHover = true;
            this.soundHelper.userData.interactive = false;
            this.soundHelper.traverse((o) => {
                o.userData.ignoreHover = true;
                o.userData.interactive = false;
            });
        }
        this.mesh.position.set(position.x, position.y, position.z);
    }

    update(delta) {}

    destroy() {
        this._parent.scene.remove(this.mesh);
        this.soundHelper?.dispose();
        this.sound3d?.stop();
        this.sound3d?.disconnect();
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

        Hooks.on("refreshAmbientSound", refreshOrUpdate);

        Hooks.on("createAmbientSound", (soundDocument) => {
            if (game.Levels3DPreview?._active && soundDocument.object) game.Levels3DPreview.addSound(soundDocument.object);
        });

        Hooks.on("deleteAmbientSound", (soundDocument) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.sounds[soundDocument.id]?.destroy();
        });

        Hooks.on("pasteAmbientSound", (copy, data) => {
            if (game.Levels3DPreview?._active) {
                const pos = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
                data.forEach((ld) => {
                    ld.elevation = pos.z;
                    ld.flags.levels.rangeTop = pos.z;
                });
            }
        });
    }
}
