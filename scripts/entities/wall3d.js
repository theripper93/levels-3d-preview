import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "../systems/ruler3d.js";
import {factor} from "../main.js";

const doorIconMaterialCache = {};

const getWallColor = (wall) => {
    if (game.user.isGM) return wall._getWallColor().toString();
    if(wall.document.door === CONST.WALL_DOOR_TYPES.SECRET) return 0xFFFFBB
    return wall._getWallColor().toString();
}

export class Wall3D {
    constructor(wall, parent) {
        this.wall = wall;
        this.type = "Wall";
        this.embeddedName = "Wall";
        this.placeable = wall;
        this._parent = parent;
        this.bottom = Number.isFinite(canvas.level.elevation.bottom) ? canvas.level.elevation.bottom : 0;
        this.top = Number.isFinite(canvas.level.elevation.top) ? canvas.level.elevation.top : this.bottom + canvas.scene.dimensions.distance * 2;
        this.externalWall = wall.document.flags.betterroofs?.externalWall ?? false;
        if (this.externalWall) this.top++;
        this.vec1 = Ruler3D.posCanvasTo3d({ x: wall.document.c[0], y: wall.document.c[1], z: this.top });
        this.vec2 = Ruler3D.posCanvasTo3d({ x: wall.document.c[2], y: wall.document.c[3], z: this.bottom });
        this.center = Ruler3D.posCanvasTo3d({ x: wall.center.x, y: wall.center.y, z: (this.top + this.bottom) / 2 });
        this.p1 = new THREE.Vector2(wall.document.c[0], wall.document.c[1]);
        this.p2 = new THREE.Vector2(wall.document.c[2], wall.document.c[3]);
        this.distance = this.p1.distanceTo(this.p2) / factor;
        this.angle = -Math.atan2(this.p2.y - this.p1.y, this.p2.x - this.p1.x) - Math.PI / 2;
        this.stretchTex = wall.document.getFlag("levels-3d-preview", "stretchTex");
        this.repeats = this.stretchTex ? 1 : this.distance / (this.vec1.y - this.vec2.y);
        if (this.repeats < 1) {
            this.repeats = 1;
        }
        this.texture = wall.document.getFlag("levels-3d-preview", "wallTexture");
        this.sidesTexture = wall.document.getFlag("levels-3d-preview", "wallSidesTexture");
        this.opacity = wall.document.getFlag("levels-3d-preview", "wallOpacity") ?? 1;
        if (this.wall.document.door && this.wall.document.ds === 1) this.opacity = this.opacity / 2;
        this.alwaysVisible = wall.document.getFlag("levels-3d-preview", "alwaysVisible");
        this.tint = wall.document.getFlag("levels-3d-preview", "wallTint");
        this.sideTint = wall.document.getFlag("levels-3d-preview", "wallSidesTint");
        this.color = this.texture ? this.tint ?? "#ffffff" : this.tint ?? getWallColor(wall);
        this.sidesColor = this.sidesTexture ? this.sideTint ?? "#ffffff" : this.sideTint ?? getWallColor(wall);
        this.depth = wall.document.getFlag("levels-3d-preview", "wallDepth") / factor || 0.03;
        this.distance += wall.document.getFlag("levels-3d-preview", "joinWall") ? this.depth : 0;
        this.roughness = wall.document.getFlag("levels-3d-preview", "roughness") ?? 1;
        this.metalness = wall.document.getFlag("levels-3d-preview", "metalness") ?? 1;
        this.mesh = new THREE.Group();

        this.init();
    }

    get isDisabledVisible() {
        if (this._isDisabledVisible !== undefined) return this._isDisabledVisible;
        let isDisabledVisible = true;
        const isDoor = this.wall.isDoor;
        if (canvas.scene.getFlag("levels-3d-preview", "showSceneWalls") === false && !isDoor) isDisabledVisible = false;
        if (canvas.scene.getFlag("levels-3d-preview", "showSceneDoors") === false && isDoor) {
            this.showControlIcon = true;
            isDisabledVisible = false;
        }
        this._isDisabledVisible = isDisabledVisible;
        return isDisabledVisible;
    }

    async init() {
        const geometry = new THREE.BoxGeometry(this.depth, this.vec1.y - this.vec2.y - 0.001, this.distance);
        let uvAttribute = geometry.attributes.uv;

        for (let i = 0; i < uvAttribute.count; i++) {
            let u = uvAttribute.getX(i);
            let v = uvAttribute.getY(i);
            u *= this.repeats;
            uvAttribute.setXY(i, u, v);
        }

        const texture = this.texture ? await this._parent.helpers.loadTexture(this.texture) : null;
        if (texture) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
        }
        const sidesTexture = this.sidesTexture ? await this._parent.helpers.loadTexture(this.sidesTexture) : null;
        if (sidesTexture) {
            sidesTexture.wrapS = THREE.RepeatWrapping;
            sidesTexture.wrapT = THREE.RepeatWrapping;
        }
        const materials = await this._getMaterials(texture, sidesTexture);
        const wallMesh = new THREE.Mesh(geometry, materials);
        this.wallMesh = wallMesh;
        this.mesh.add(wallMesh);
        if (this.wall.isDoor && !(!game.user.isGM && this.wall.document.door === CONST.WALL_DOOR_TYPES.SECRET)) {
            this.mesh.userData.hitbox = this.mesh;
            this.mesh.userData.interactive = true;
            const controlIconMaterial = await this.getControlIconMaterial();
            //sprite icon
            const icon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), controlIconMaterial);
            icon.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + Math.PI);
            const controlIconScale = (canvas.grid.size / factor) / 2;
            icon.scale.set(controlIconScale, controlIconScale, controlIconScale);
            icon.position.set(0, -((this.vec1.y - this.vec2.y + 0.001)/2) + 0.001, 0);
            this.mesh.add(icon);
            this.controlIcon = icon;
            icon.visible = false;
        }
        this.mesh.userData.entity3D = this;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.position.set(this.center.x, this.center.y, this.center.z);
        this.mesh.rotation.set(0, this.angle, 0);
        this.mesh.visible = this.isDisabledVisible;
        this._parent.scene.add(this.mesh);
    }

    async getControlIconMaterial() {
        // Determine displayed door state
        const ds = CONST.WALL_DOOR_STATES;
        let s = this.wall.document.ds;
        if (!game.user.isGM && s === ds.LOCKED) s = ds.CLOSED;

        // Determine texture path
        const icons = CONFIG.controlIcons;
        let path =
            {
                [ds.LOCKED]: icons.doorLocked,
                [ds.CLOSED]: icons.doorClosed,
                [ds.OPEN]: icons.doorOpen,
            }[s] || icons.doorClosed;
        if (s === ds.CLOSED && this.wall.document.door === CONST.WALL_DOOR_TYPES.SECRET) path = icons.doorSecret;

        // Return cached material
        if (doorIconMaterialCache[path]) return doorIconMaterialCache[path];

        // Obtain the icon texture
        const texture = await this._parent.helpers.loadTexture(path);
        const material = new THREE.MeshBasicMaterial({map: texture, alphaTest: 0.8, transparent: false});
        doorIconMaterialCache[path] = material;
        return material;
    }

    async _getMaterials(texture, sidesTexture) {
        if (!this.texture || !this.sidesTexture) {
            const material = this.texture ? await this._generateMaterial(this.texture, texture) : await this._generateMaterial(this.sidesTexture, sidesTexture);
            return material;
        }
        const material = await this._generateMaterial(this.texture, texture);
        const sidesMaterial = await this._generateMaterial(this.sidesTexture, sidesTexture);
        return [material, material, sidesMaterial, sidesMaterial, sidesMaterial, sidesMaterial];
    }

    async _generateMaterial(texturePath, texture) {
        const isPBR = this._parent.helpers.isPBR(texturePath);
        if (isPBR) return await this._parent.helpers.getPBRMat(texturePath);
        let material;
        const materialId = `${this.color}${this.opacity}${texturePath}${this.isVisible}${this.metalness}${this.roughness}`;
        if (this._parent.helpers.materialCache[materialId]) {
            material = this._parent.helpers.materialCache[materialId];
        } else {
            material = new THREE.MeshStandardMaterial({
                color: this.sidesTexture == texturePath ? this.sidesColor : this.color,
                transparent: this.opacity < 1,
                depthWrite: this.opacity === 1,
                opacity: this.opacity,
                roughness: this.roughness,
                metalness: this.metalness,
                visible: this.isVisible,
                map: texture,
            });
            this._parent.helpers.materialCache[materialId] = material;
        }
        material.castShadow = true;
        material.receiveShadow = true;
        return material;
    }

    get isVisible() {
        if (this._isDisabledVisible === false) return false;
        if (!this.tint && !this.texture) return true;
        if (this.alwaysVisible) return true;
        if (this.wall.document.sense === 0) return false;
        return true;
    }

    updateVisibility() {
        if (!this.mesh) return;
        let meshVisible = this.isVisible;
        if (game.Levels3DPreview.mirrorLevelsVisibility) {
            if (CONFIG.Levels?.UI?.rangeEnabled) {
                const isLevelsVisible = this.wall.visible;
                meshVisible = isLevelsVisible;
            } else {
                // const elevation = WallHeight.tokenElevation;
                const isControlled = canvas.tokens.controlled[0];
                const isGM = game.user.isGM;
                if (isGM && !isControlled && !this.showControlIcon) return;
                // if (elevation < this.bottom) {
                    // meshVisible = false;
                // }
            }
        }
        if (meshVisible) {
            this.wallMesh.visible = true;
            this.mesh.visible = true;
            if(this.controlIcon) this.controlIcon.visible = false;
        } else if (this.showControlIcon) {
            this.wallMesh.visible = false;
            if(this.controlIcon) this.controlIcon.visible = this.wall.doorControl?.visible
            this.mesh.visible = true;
        } else {
            this.mesh.visible = false;
        }
    }

    _onClickLeft(e) {
        if (!this.wall.doorControl.visible) return;
        e.data = {
            originalEvent: e,
        };
        this.wall.doorControl._onMouseDown(e);
    }

    _onClickRight(e) {
        if (!this.wall.doorControl.visible) return;
        e.data = {
            originalEvent: e,
        };
        this.wall.doorControl._onRightDown(e);
    }

    _onClickLeft2(e) {}

    _onClickRight2(e) {}

    _onHoverIn(e) {
        //this.placeable._onHoverIn(e);
    }

    _onHoverOut(e) {
        //this.placeable._onHoverOut(e);
    }

    destroy() {
        this._parent.scene.remove(this.mesh);
        delete this._parent.walls[this.wall.id];
        delete this._parent.doors[this.wall.id];
    }

    static setHooks() {
        Hooks.on("updateWall", (wall) => {
            if (game.Levels3DPreview?._active && wall.object) {
                game.Levels3DPreview.walls[wall.id]?.destroy();
                game.Levels3DPreview.createWall(wall.object);
            }
        });

        Hooks.on("createWall", (wall) => {
            if (game.Levels3DPreview?._active && wall.object) game.Levels3DPreview.createWall(wall.object);
        });

        Hooks.on("deleteWall", (wall) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.walls[wall.id]?.destroy();
        });

        
        Hooks.on("activateWallsLayer", () => {
            if (game.Levels3DPreview?._active) ui.notifications.info(`
                3D Canvas is designed to use 3D Tiles geometry for sight and collision calculations, not walls. Because of this, the walls layer is view-only and exists solely to visualize walls from 2D maps. 2D walls can still block sight and movement if "<strong>Use 3D Objects for Sight Calculations</strong>" is disabled in the scene settings, but for 3D maps it is strongly recommended to keep that setting enabled so that 3D tiles handle all sight and collision logic instead.
            `, { permanent: true });
        });
    }
}
