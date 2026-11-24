import * as THREE from "three";
import * as coords3d from "../helpers/coords3d.js";
import {factor} from "../main.js";

const doorIconMaterialCache = {};

export const WALL_DEFAULTS = {
    color: "#a39e94",
    doorColor: "#7d5c40",
    roughness: 0.85,
    metalness: 0,
};

const getWallColor = (wall) => {
    if (game.user.isGM && canvas.walls?.active) return Number(wall._getWallColor());
    const door = wall.document.door;
    if (!door) return WALL_DEFAULTS.color;
    if (door === CONST.WALL_DOOR_TYPES.SECRET && !game.user.isGM) return WALL_DEFAULTS.color;
    return WALL_DEFAULTS.doorColor;
};

const JOIN_TOLERANCE = 1;

const cross2 = (a, b) => a.x * b.y - a.y * b.x;

function wallsAtPoint(wall, point) {
    const L = game.Levels3DPreview;
    const result = [];
    for (const other of canvas.walls.placeables) {
        if (other === wall || other.id === wall?.id || !canvas.scene.walls.has(other.id)) continue;
        if (L?.isLevels && (other.document.flags.wallHeight?.wallHeightBottom ?? -Infinity) > L.level) continue;
        const c = other.document.c;
        if (Math.hypot(c[0] - point.x, c[1] - point.y) <= JOIN_TOLERANCE) result.push({ wall: other, far: new THREE.Vector2(c[2], c[3]) });
        else if (Math.hypot(c[2] - point.x, c[3] - point.y) <= JOIN_TOLERANCE) result.push({ wall: other, far: new THREE.Vector2(c[0], c[1]) });
    }
    return result;
}

function endTrim(wall, point, inward, normal) {
    const others = wallsAtPoint(wall, point);
    if (others.length !== 1) return null;
    const outward = others[0].far.clone().sub(point);
    if (outward.lengthSq() < 1e-6) return null;
    outward.normalize();
    const bisector = inward.clone().add(outward);
    if (bisector.lengthSq() < 1e-6) return null;
    bisector.normalize();
    const denom = cross2(bisector, inward);
    if (Math.abs(denom) < 1e-4) return null;
    return -cross2(bisector, normal) / denom;
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
        this.vec1 = coords3d.posCanvasTo3d({ x: wall.document.c[0], y: wall.document.c[1], z: this.top });
        this.vec2 = coords3d.posCanvasTo3d({ x: wall.document.c[2], y: wall.document.c[3], z: this.bottom });
        this.center = coords3d.posCanvasTo3d({ x: wall.center.x, y: wall.center.y, z: (this.top + this.bottom) / 2 });
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
        this.joinWall = !!wall.document.getFlag("levels-3d-preview", "joinWall");
        this.distance += this.joinWall ? this.depth : 0;
        this.roughness = wall.document.getFlag("levels-3d-preview", "roughness") ?? WALL_DEFAULTS.roughness;
        this.metalness = wall.document.getFlag("levels-3d-preview", "metalness") ?? WALL_DEFAULTS.metalness;
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
        if (!this.joinWall) this._trimEnds(geometry);

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
        // Shadow flags must be on the Mesh; three.js ignores them on Groups and materials.
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
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
        this.mesh.position.set(this.center.x, this.center.y, this.center.z);
        this.mesh.rotation.set(0, this.angle, 0);
        this.mesh.visible = this.isDisabledVisible;
        this._parent.scene.add(this.mesh);
    }

    _trimEnds(geometry) {
        if (this.distance <= 0) return;
        const dir = this.p2.clone().sub(this.p1).normalize();
        const normal = new THREE.Vector2(-dir.y, dir.x);
        const k1 = endTrim(this.wall, this.p1, dir, normal);
        const k2 = endTrim(this.wall, this.p2, dir.clone().negate(), normal);
        if (k1 === null && k2 === null) return;
        const half = this.distance / 2;
        const maxTrim = this.distance * 0.45;
        const trim = (k, x) => (k === null ? 0 : Math.max(-maxTrim, Math.min(maxTrim, Math.max(-4, Math.min(4, k)) * x)));
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const z = position.getZ(i);
            if (z > 0) position.setZ(i, half - trim(k1, x));
            else position.setZ(i, -half + trim(k2, x));
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
    }

    async getControlIconMaterial() {
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
        const color = this.sidesTexture && this.sidesTexture === texturePath ? this.sidesColor : this.color;
        let material;
        const materialId = `${isPBR ? "wallPBR" : ""}${color}${this.opacity}${texturePath}${this.isVisible}${this.metalness}${this.roughness}`;
        if (this._parent.helpers.materialCache[materialId]) {
            material = this._parent.helpers.materialCache[materialId];
        } else if (isPBR) {
            material = (await this._parent.helpers.getPBRMat(texturePath)).clone();
            material.color = new THREE.Color(color);
            material.transparent = this.opacity < 1;
            material.depthWrite = this.opacity === 1;
            material.opacity = this.opacity;
            if (this.roughness !== WALL_DEFAULTS.roughness) material.roughness = this.roughness;
            if (this.metalness !== WALL_DEFAULTS.metalness) material.metalness = this.metalness;
            material.visible = this.isVisible;
            this._parent.helpers.materialCache[materialId] = material;
        } else {
            material = new THREE.MeshStandardMaterial({
                color,
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
        return material;
    }

    get isVisible() {
        if (this._isDisabledVisible === false) return false;
        if (!this.tint && !this.texture) return true;
        if (this.alwaysVisible) return true;
        if (this.wall.document.sight === CONST.EDGE_SENSE_TYPES.NONE) return false;
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
        // Geometries are created per wall; materials are cached (helpers.materialCache /
        // doorIconMaterialCache) and shared, so they are intentionally not disposed.
        this.wallMesh?.geometry?.dispose();
        this.controlIcon?.geometry?.dispose();
        delete this._parent.walls[this.wall.id];
        delete this._parent.doors[this.wall.id];
    }

    static setHooks() {
        const neighborIds = (wall, points) => {
            const ids = new Set();
            for (const point of points) for (const { wall: other } of wallsAtPoint(wall, point)) ids.add(other.id);
            return ids;
        };
        const endpoints = (c) => [new THREE.Vector2(c[0], c[1]), new THREE.Vector2(c[2], c[3])];
        const rebuildNeighbors = (ids, skipId) => {
            const L = game.Levels3DPreview;
            for (const id of ids) {
                if (id === skipId || !L.walls[id]) continue;
                const placeable = L.walls[id].wall;
                L.walls[id].destroy();
                L.createWall(placeable);
            }
        };

        Hooks.on("updateWall", (wall, changes) => {
            const L = game.Levels3DPreview;
            if (!L?._active || !wall.object) return;
            const old = L.walls[wall.id];
            const ids = "c" in changes ? neighborIds(wall.object, [...(old ? [old.p1, old.p2] : []), ...endpoints(wall.c)]) : null;
            old?.destroy();
            L.createWall(wall.object);
            if (ids) rebuildNeighbors(ids, wall.id);
        });

        Hooks.on("createWall", (wall) => {
            const L = game.Levels3DPreview;
            if (!L?._active || !wall.object) return;
            L.createWall(wall.object);
            rebuildNeighbors(neighborIds(wall.object, endpoints(wall.c)), wall.id);
        });

        Hooks.on("deleteWall", (wall) => {
            const L = game.Levels3DPreview;
            if (!L?._active) return;
            const old = L.walls[wall.id];
            old?.destroy();
            rebuildNeighbors(neighborIds(wall.object ?? old?.wall, endpoints(wall.c)), wall.id);
        });

        const recolorWalls = () => {
            const L = game.Levels3DPreview;
            if (!L?._active || !game.user.isGM) return;
            for (const wall3d of Object.values(L.walls)) {
                if (!wall3d || wall3d.tint || wall3d.texture) continue;
                const placeable = wall3d.wall;
                wall3d.destroy();
                L.createWall(placeable);
            }
        };
        Hooks.on("activateWallsLayer", recolorWalls);
        Hooks.on("deactivateWallsLayer", recolorWalls);

        Hooks.on("activateWallsLayer", () => {
            if (game.Levels3DPreview?._active) ui.notifications.info(`
                3D Canvas is designed to use 3D Tiles geometry for sight and collision calculations, not walls. Because of this, the walls layer is view-only and exists solely to visualize walls from 2D maps. 2D walls can still block sight and movement if "<strong>Use 3D Objects for Sight Calculations</strong>" is disabled in the scene settings, but for 3D maps it is strongly recommended to keep that setting enabled so that 3D tiles handle all sight and collision logic instead.
            `, { permanent: true });
        });
    }
}
