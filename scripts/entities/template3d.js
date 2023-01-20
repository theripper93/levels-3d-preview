import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "../systems/ruler3d.js";
import { factor } from "../main.js";

export class Template3D {
    constructor(template, A, B) {
        this.template = template;
        if (this.template.t === "light") {
            this.template.t = "circle";
            this.isLight = true;
        } else if (this.template.t === "tile") {
            this.template.t = "rect";
            this.isTile = true;
        }
        this.embeddedName = "MeasuredTemplate";
        this.placeable = template;
        this.initialDirection = this.template.document?.direction;
        this.isFog = this.template?.document?.getFlag("levels-3d-preview", "isFog") ?? false;
        this.shaders = this.template?.document?.getFlag("levels-3d-preview", "shaders") ?? {};
        this.wasFreeMode = this.template?.document?.getFlag("levels-3d-preview", "wasFreeMode") ?? false;
        this.hasShaders = Object.values(this.shaders).some((v) => v.enabled);
        this.draggable = true;
        this.directionOffset = 0;
        this._parent = game.Levels3DPreview;
        this.mesh = new THREE.Group();
        this.elevation3d = 0;
        this.template3dData = this._get3DData();
        this.shape = this._inferShape(this.template3dData);
        this._origin = this._getOrigin(A);
        this._destination = this._getDestination(B);
        this.draw();
        const box = new THREE.Box3().setFromObject(this.mesh).getSize(new THREE.Vector3());
        this.bb = {
            height: box.x,
            width: box.z,
            depth: box.y,
        };
        this._parent.shaderHandler.applyShader(this.mesh, this, this.shaders);
        this.setPosition();
        this.scene.add(this.mesh);
        this._parent.templates[this.template.id] = this;
        setTimeout(() => {
            Hooks.callAll("3DTemplateCreated", this);
        }, 100);
    }

    get isOwner() {
        return this.template.owner;
    }

    get scene() {
        return game.Levels3DPreview.scene;
    }

    get fromData() {
        //if(this.isPreview) return false;
        return this.template.document?.x !== undefined ? true : false;
    }

    contains(point, convertSpace = true) {
        if (convertSpace) point = Ruler3D.posCanvasTo3d(point);
        return this._parent.interactionManager.inMesh(point, this.templateMesh);
    }

    setPosition() {
        this.mesh.position.set(this._origin.x, this._origin.y + 0.0001, this._origin.z);
    }

    draw() {
        this.mesh.remove(this.templateMesh);
        this.material = this._getMaterial();
        this._getTexture();
        this.A = this._origin ?? Ruler3D.posCanvasTo3d({ x: this.template.document?.x, y: this.template.document?.y, z: this.template.document?.flags?.levels?.elevation ?? 0 });
        this.B = this._destination;
        this.pointsFromData();
        this.direction = (Math.atan2(this.B.z - this.A.z, this.B.x - this.A.x) * 180) / Math.PI;
        const vec2A = new THREE.Vector2(this.A.x, this.A.z);
        const vec2B = new THREE.Vector2(this.B.x, this.B.z);
        this.distance = this.useVec2 ? Ruler3D.pixelsToUnits(vec2A.distanceTo(vec2B)) : Ruler3D.pixelsToUnits(this.A.distanceTo(this.B));
        this.angle = 0;
        this.width = 1;
        const mesh = this._getMesh();
        this.templateMesh = mesh;
        this.templateMesh.userData.interactive = false;
        this.templateMesh.userData.ignoreHover = true;
        this.mesh.add(mesh);
        this.createHandle();
    }

    get useVec2() {
        return !(this.shape === "sphere" || this.shape === "cone");
    }

    _createHandle() {
        const texture = this.isLight ? this._parent.textures.lightOn : this._parent.textures.template;
        const size = (canvas.scene.dimensions.size * 0.7) / factor;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const mesh = new THREE.Mesh(geometry, material);
        this.mesh.userData.hitbox = mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        mesh.userData.entity3D = this;
        mesh.userData.isHitbox = true;
        this.dragHandle = mesh;
        if (this.placeable?.document) mesh.visible = this.placeable.owner;
        this.mesh.add(mesh);
    }

    createHandle() {
        const texture = this.isLight ? this._parent.textures.lightOn : this._parent.textures.template;
        const size = (canvas.scene.dimensions.size * 0.5) / factor / 2;
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = this.material; //new THREE.MeshBasicMaterial({color: new THREE.Color("white"), transparent: true, depthWrite:false, opacity: 0.5})
        const lightSphere = new THREE.Mesh(geometry, material);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.8 }));
        sprite.scale.set(size * 1.5, size * 1.5, size * 1.5);
        const mesh = new THREE.Group();
        mesh.add(lightSphere);
        mesh.add(sprite);
        this.mesh.userData.hitbox = mesh;
        this.mesh.userData.interactive = true;
        this.mesh.userData.entity3D = this;
        mesh.userData.entity3D = this;
        mesh.userData.isHitbox = true;
        mesh.userData.sprite = sprite;
        mesh.userData.sphere = lightSphere;
        this.dragHandle = mesh;
        if (this.placeable?.document) mesh.visible = this.placeable.owner;
        this.mesh.add(mesh);
    }

    pointsFromData() {
        if (!this.fromData) return;
        this.A = Ruler3D.posCanvasTo3d({ x: this.template.ray.A.x, y: this.template.ray.A.y, z: this.template.document?.flags?.levels?.elevation ?? 0 });
        this.B = Ruler3D.posCanvasTo3d({ x: this.template.ray.B.x, y: this.template.ray.B.y, z: this.template.document?.flags?.levels?.elevation ?? 0 });
        if (this.shape !== "cylinder") this.B.y += Ruler3D.unitsToPixels(this.template.document?.flags?.levels?.special ?? 0);
    }

    fromPreview() {
        const origin2d = this.isPreview ? Ruler3D.pos3DToCanvas(this.mesh.position) : Ruler3D.pos3DToCanvas(this.A);

        if (this.isLight) {
            const lightData = {
                config: {
                    dim: this.distance,
                    bright: this.distance / 2,
                    color: null,
                },
                x: origin2d.x,
                y: origin2d.y,
                flags: {
                    levels: {
                        rangeBottom: parseFloat((origin2d.z + 0.1).toFixed(2)),
                        rangeTop: parseFloat((origin2d.z + 0.1).toFixed(2)),
                    },
                },
            };
            canvas.scene.createEmbeddedDocuments("AmbientLight", [lightData]);
            return this.destroy();
        }

        if (this.isTile) {
            let elevation = parseFloat(origin2d.z.toFixed(2));
            const width = (this.B.x - this.A.x) * factor;
            const height = (this.B.z - this.A.z) * factor;
            const depth = (this.B.y - this.A.y) * factor;
            let x = origin2d.x;
            let y = origin2d.y;
            if (width < 0) x += width;
            if (height < 0) y += height;
            if (depth < 0) elevation += Ruler3D.pixelsToUnits(depth) / factor;

            const tileData = {
                width: width,
                height: height,
                texture: {
                    img: "modules/levels-3d-preview/assets/blank.webp",
                },
                overhead: true,
                x: x,
                y: y,
                flags: {
                    "levels-3d-preview": {
                        dynaMesh: "box",
                        autoGround: true,
                        depth: Math.abs(depth),
                    },
                    levels: {
                        rangeBottom: elevation,
                        rangeTop: elevation,
                    },
                },
            };
            canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
            return this.destroy();
        }
        const templateData = {
            angle: this.angle,
            distance: this.distance,
            direction: this.isPreview ? this.template.document?.direction : this.direction,
            width: this.width,
            user: game.user.id,
            fillColor: game.user.color,
            t: this._getBaseShape(),
            x: origin2d.x,
            y: origin2d.y,
            flags: {
                levels: {
                    elevation: origin2d.z.toFixed(2),
                    special: this.special !== undefined ? this.special.toFixed(2) : undefined,
                },
            },
        };
        const currentTemplateData = this.template?.document?.toObject() ?? {};
        canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [mergeObject(currentTemplateData, templateData)]);
        this.destroy();
    }

    destroy() {
        if (this.isPreview) {
            this.initialLayer?.activate();
            this.actorSheet?.maximize();
        }
        this.scene.remove(this.mesh);
        delete this._parent.templates[this.template.id];
    }

    _getMesh() {
        switch (this.shape) {
            case "sphere":
                return this._getSphereGeometry();
            case "square":
                return this._getSquareGeometry();
            case "cone":
                return this._getConeGeometry();
            case "ray":
                return this._getRayGeometry();
            case "cylinder":
                return this._getCylinderGeometry();
            case "box":
                return this._getBoxGeometry();
            case "boxray":
                return this._getRayGeometry();
        }
    }

    _getSphereGeometry() {
        const radius = this._origin && this._destination ? this._origin.distanceTo(this._destination) : Ruler3D.unitsToPixels(this.template.document?.distance);
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        const mesh = new THREE.Mesh(geometry, this.material);
        this.fogMesh = mesh;
        return mesh;
    }

    _getSquareGeometry() {
        const vertexA = this.A;
        let vertexB = this.B;
        const width = vertexB.x - vertexA.x;
        const height = this.template3dData.special !== undefined ? Ruler3D.unitsToPixels(this.template3dData.special) : vertexB.y - vertexA.y;
        this.special = Ruler3D.pixelsToUnits(height);
        const depth = vertexB.z - vertexA.z;
        const geometry = new THREE.BoxGeometry(width, height, depth, 8, 8, 8);
        const mesh = new THREE.Mesh(geometry, this.material);

        if (this.isFog) {
            const cameraNear = game.Levels3DPreview.camera.near * 2;
            const box = new THREE.BoxGeometry(width + cameraNear, height + cameraNear, depth + cameraNear);
            const boxMesh = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x000000 }));
            this.fogBB = new THREE.Box3().setFromObject(boxMesh);
            this.fogBBOfset = new THREE.Vector3((width + cameraNear) / 2, (height + cameraNear) / 2, (depth + cameraNear) / 2);
        }

        mesh.position.set(width / 2, height / 2, depth / 2);
        return mesh;
    }

    _getConeGeometry() {
        const vertexA = this.A;
        let vertexB = this.B;
        const height = vertexB.distanceTo(vertexA);
        const angle = Math.toRadians(CONFIG.MeasuredTemplate.defaults.angle) / 2;
        this.angle = CONFIG.MeasuredTemplate.defaults.angle;
        const radius = (height / Math.cos(angle)) * Math.sin(angle); //height*Math.acos(angle)*2
        const group = new THREE.Group();
        const geometry = new THREE.ConeGeometry(radius, height, this.template?.document?.texture ? 256 : 64);
        const mesh = new THREE.Mesh(geometry, this.material);
        //mesh.position.set(0, -height/2, 0)
        mesh.rotateZ(Math.PI / 2);
        mesh.translateY(-height / 2);
        group.add(mesh);
        const rotationAngle = Math.atan2(vertexB.z - vertexA.z, vertexB.x - vertexA.x);
        group.rotateY(-rotationAngle);
        return group;
    }

    _getCylinderGeometry() {
        const vertexA = this.A;
        let vertexB = this.B;
        const height = Ruler3D.unitsToPixels(this.template3dData.special);
        this.special = this.template3dData.special;
        const radius = vertexB.distanceTo(vertexA);
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.position.set(0, height / 2, 0);
        return mesh;
    }

    _getRayGeometry() {
        const vertexA = this.A;
        let vertexB = this.B;
        const width = vertexB.distanceTo(vertexA);
        const height = this.template3dData.special !== undefined ? Ruler3D.unitsToPixels(this.template3dData.special) : vertexB.y - vertexA.y;
        this.special = Ruler3D.pixelsToUnits(height);
        const depth = Ruler3D.unitsToPixels(5);
        this.width = Ruler3D.pixelsToUnits(depth);
        const geometry = new THREE.BoxGeometry(width, height, depth, 5, 5, 5);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.position.set(width / 2, height / 2, 0);
        const group = new THREE.Group();
        group.add(mesh);
        const rotationAngle = Math.atan2(vertexB.z - vertexA.z, vertexB.x - vertexA.x);
        group.rotateY(-rotationAngle);
        return group;
    }

    _getOrigin(A) {
        if (A) return A;
        return Ruler3D.posCanvasTo3d({ x: this.template.document?.x, y: this.template.document?.y, z: this.template.document?.flags?.levels?.elevation ?? 0 });
    }

    _getDestination(B) {
        if (B) return B;
        return undefined;
    }

    _get3DData() {
        if (this.fromData) {
            return this.template.document?.flags?.levels ?? { special: 0 };
        } else {
            return { special: CONFIG.Levels.UI.nextTemplateSpecial };
        }
    }

    _inferShape(template3dData) {
        let baseShape = this._getBaseShape();
        if (!template3dData.special) {
            switch (baseShape) {
                case "circle":
                    return "sphere";
                case "rect":
                    return "square";
                case "cone":
                    return "cone";
                case "ray":
                    return "ray";
            }
        } else {
            switch (baseShape) {
                case "circle":
                    return "cylinder";
                case "rect":
                    return "square";
                case "cone":
                    return "cone";
                case "ray":
                    return "boxray";
            }
        }
    }

    _getBaseShape() {
        return this.template.document?.t ?? this.template.t;
    }

    _getMaterial() {
        const templateStyle = this.template?.document?.texture || this.hasShaders ? "solid" : game.settings.get("levels-3d-preview", "templateSyle");
        if (this.isFog) {
            return new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: game.user.isGM,
                side: THREE.DoubleSide,
                opacity: game.user.isGM ? 0.5 : 1,
            });
        }
        switch (templateStyle) {
            case "wireframe":
                return new THREE.MeshBasicMaterial({
                    color: this.fromData ? this.template.document?.fillColor : game.user.color,
                    wireframe: true,
                });
            case "solid":
                let templateColor = this.fromData ? this.template.document?.fillColor : game.user.color;
                if (this.hasShaders) templateColor = 0xffffff;
                return new THREE.MeshPhongMaterial({
                    color: templateColor,
                    transparent: true,
                    opacity: this.hasShaders ? 0.7 : 0.3,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    emissive: this.fromData ? this.template.document?.fillColor : game.user.color,
                    specular: 0xffffff,
                    shininess: 1,
                });
        }
    }

    _getTexture() {
        if (!this.template.document?.texture && !this.template.document?.flags?.siftoolkit?.displayData?.texture) return;
        const texturePath = this.template.document?.texture || this.template.document?.flags?.siftoolkit?.displayData?.texture;
        if (texturePath.includes("tokenmagic")) return;
        this._parent.helpers.loadTexture(texturePath).then((texture) => {
            this.material.map = texture;
            this.material.emissiveMap = texture;
            this.material.opacity = 1;
            this.material.needsUpdate = true;
        });
    }

    pointInFogmesh(point) {
        if (!this.fogBB) return false;
        const offsetPoint = new THREE.Vector3(point.x, point.y, point.z);
        offsetPoint.sub(this.mesh.position);
        offsetPoint.sub(this.fogBBOfset);
        return this.fogBB.containsPoint(offsetPoint);
    }

    updatePositionFrom3D(e) {
        this.skipMoveAnimation = true;
        const useSnapped = canvas.scene.grid.type && !e?.shiftKey;
        const x3d = this.mesh.position.x;
        const y3d = this.mesh.position.y;
        const z3d = this.mesh.position.z;
        const x = x3d * factor;
        const y = z3d * factor;
        const z = ((y3d * factor * canvas.dimensions.distance) / canvas.dimensions.size).toFixed(2);
        const snapped = canvas.grid.getSnappedPosition(x, y);
        const dest = {
            x: useSnapped ? snapped.x : x,
            y: useSnapped ? snapped.y : y,
            elevation: z,
        };
        const data = {
            x: dest.x,
            y: dest.y,
            t: this._getBaseShape(),
            direction: ((this.isPreview ? this.initialDirection : this.template.document?.direction) - this.directionOffset) % 360,
            flags: {
                levels: {
                    elevation: dest.elevation,
                    wasFreeMode: this.wasFreeMode,
                },
            },
        };
        this.isPreview ? this.template.document?.updateSource(data) : this.template.document?.update(data);
        if (this.isPreview) Hooks.callAll(`template3dUpdatePreview`, this.template, this.template.document ?? data);
    }

    _onClickLeft(e) {
        if (this.isPreview) return;
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.template._onClickLeft(event);
        this.template.control();
    }

    _onClickLeft2(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.template?._onClickLeft2(event);
    }

    _onClickRight(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.template?._onClickRight(event);
    }

    _onClickRight2(e) {
        const event = {
            data: {
                originalEvent: e,
            },
        };
        this.template?._onClickRight2(event);
    }

    _onHoverIn(e) {
        if (this.template?._onHoverIn && !this.template._destroyed && !this.isPreview) {
            this.template?._onHoverIn(e);
        }
    }

    _onHoverOut(e) {
        if (this.template?._onHoverOut && !this.template._destroyed && !this.isPreview) this.template?._onHoverOut(e);
    }

    onMove() {
        if (this.isPreview) this.updatePositionFrom3D();
    }

    static drawPreview(template) {
        const initialLayer = canvas.activeLayer;
        template.ray = Ray.fromAngle(template.document?.x, template.document?.y, Math.toRadians(template.document?.direction), (template.document?.distance * canvas.scene.dimensions.size) / canvas.scene.dimensions.distance);
        // Draw the template and switch to the template layer
        canvas.templates.activate();
        const template3d = new Template3D(template);
        template3d.initialLayer = initialLayer;
        template3d.draggable = true;
        template3d.isPreview = true;
        template3d.angle = template.document?.angle;
        template3d.distance = template.document?.distance;
        template3d.direction = template.document?.direction;
        template3d.arcDelta = Ruler3D.unitsToPixels(template3d.distance);
        game.Levels3DPreview.interactionManager.ruler.template = template3d;
        game.Levels3DPreview.interactionManager.draggable = template3d.dragHandle;
        game.Levels3DPreview.controls.enableZoom = false;
        const token = game.Levels3DPreview.tokens[_token.id]?.token ?? template.item?.actor?.getActiveTokens()[0];
        if (token && game.Levels3DPreview.tokens[token.id]) {
            template3d.mesh.position.copy(game.Levels3DPreview.tokens[token.id].mesh.position);
            game.Levels3DPreview.interactionManager.ruler.origin = game.Levels3DPreview.tokens[token.id].mesh.position;
        }

        // Hide the sheet that originated the preview
        if (template.actorSheet) {
            template3d.actorSheet = template.actorSheet;
            template.actorSheet.minimize();
        }
    }

    onRotate(deltaY) {
        if (game.Levels3DPreview.interactionManager.isFreeMode) return;
        let delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
        let snap = delta;
        this.directionOffset += snap * Math.sign(-deltaY);
        this.mesh.rotation.y = Math.toRadians(this.directionOffset);
    }

    static setHooks() {
        Hooks.on("updateMeasuredTemplate", (template) => {
            if (game.Levels3DPreview?._active && template?.id) {
                game.Levels3DPreview.templates[template?.id]?.destroy();
                game.Levels3DPreview.createTemplate(template.object);
            }
        });

        Hooks.on("createMeasuredTemplate", (template) => {
            Hooks.once("refreshMeasuredTemplate", () => {
                if (game.Levels3DPreview?._active && template.object) game.Levels3DPreview.createTemplate(template.object);
            });
        });

        Hooks.on("deleteMeasuredTemplate", (template) => {
            if (game.Levels3DPreview?._active) game.Levels3DPreview.templates[template.id]?.destroy();
        });
    }
}
