import * as THREE from "three";
import { factor } from "../main.js";
import { unitsToPixels } from "../helpers/coords3d.js";

const MODULE_ID = "levels-3d-preview";
const NEAR_PHI = 1.12;
const FAR_PHI = 0.3;
const TOP_DOWN_PHI = 0.02;
const MIN_CELLS = 2.5;
const MAX_CELLS = 45;
const DEFAULT_CELLS = 7;
const ZOOM_STEP = 1.15;
const PAN_SPEED = 1.1;
const LIFT_CELLS = 0.6;
const STEP_CELLS = 0.6;
const HYSTERESIS_CELLS = 0.15;
const GROUND_CONFIRM = 3;
const FLOOR_NORMAL_Y = 0.7;
const HEIGHT_RATE = 4;
const HILL_CELLS = 1.5;
const TRACK_RATE = 24;
const RECENTER_RATE = 7;
const CLEARANCE_CELLS = 0.6;
const SCENE_SLACK = 0.1;
const PUSH_NOTCHES = 5;
const PUSH_HOLD_MS = 400;
const PUSH_DECAY = 2.5;
const PUSH_DOLLY = 0.35;
const PUSH_PHI = 1.35;
const ENTER_PHI = 1.45;
const ENTER_MS = 450;
const EXIT_NOTCHES = 2;
const PAN_KEYS = { panUp: [0, 1], panDown: [0, -1], panLeft: [-1, 0], panRight: [1, 0] };
const DOWN = new THREE.Vector3(0, -1, 0);

export class TacticalCamera {
    constructor(parent) {
        this.parent = parent;
        this.goal = new THREE.Vector3();
        this.pivot = new THREE.Vector3();
        this.lastTarget = new THREE.Vector3();
        this.lastProbe = new THREE.Vector3(Infinity, 0, Infinity);
        this.engaged = false;
        this.followId = null;
        this.topDown = false;
        this.distance = 1;
        this.goalDistance = 1;
        this.phi = 1;
        this.groundY = 0;
        this.pivotY = 0;
        this.pendingGround = null;
        this.cameraFloor = null;
        this.raise = 0;
        this.frame = 0;
        this.heldKeys = new Set();
        this.push = 0;
        this.pushShown = 0;
        this.pushTime = 0;
        this.entering = null;
        this.exitPush = 0;
        this.exitTimer = null;
        this.fromFirstPerson = false;
        window.addEventListener("wheel", this.onFirstPersonWheel.bind(this), { capture: true, passive: true });
        this.onChangeFreeCamera = foundry.utils.debounce(this.onChangeFreeCamera.bind(this), 100);
        this.controls.addEventListener("change", this.onChange.bind(this));
        window.addEventListener("blur", () => this.heldKeys.clear());
        Hooks.on("controlToken", this.onControlToken.bind(this));
        Hooks.on("combatTurnChange", this.onTurnChange.bind(this));
        this.setControlPreset();
    }

    get camera() {
        return this.parent.camera;
    }

    get controls() {
        return this.parent.controls;
    }

    get cell() {
        return canvas.grid.size / factor;
    }

    get preferred() {
        return (this._preferred ??= game.settings.get(MODULE_ID, "tacticalCamera"));
    }

    onPreferredChange(value) {
        this._preferred = value;
        this.refreshButton();
    }

    get active() {
        const parent = this.parent;
        return !!(parent._active && this.preferred && canvas.tokens?.active && !parent.firstPersonMode && !parent.cutsceneEngine?.isPlaying && !document.body.classList.contains("map-maker-active"));
    }

    get suspended() {
        const im = this.parent.interactionManager;
        return !!(canvas.regions?._placementContext || im._tokenDrag || im._freeRuler || im.draggable || canvas.tokens?._draggedToken || canvas.controls?.ruler?.active);
    }

    get limits() {
        const d = canvas.dimensions;
        const min = this.cell * MIN_CELLS;
        const sceneSize = Math.max(d.sceneWidth, d.sceneHeight) / factor;
        const max = Math.max(min * 2, Math.min(this.cell * MAX_CELLS, sceneSize * 1.2));
        return { min, max };
    }

    zoomFraction(distance) {
        const { min, max } = this.limits;
        return THREE.MathUtils.clamp((distance - min) / (max - min), 0, 1);
    }

    pitchFor(distance) {
        if (this.topDown) return TOP_DOWN_PHI;
        return THREE.MathUtils.lerp(NEAR_PHI, FAR_PHI, Math.pow(this.zoomFraction(distance), 0.6));
    }

    defaultFollowId() {
        const controlled = canvas.tokens.controlled.at(-1);
        if (controlled) return controlled.id;
        if (game.user.isGM) return null;
        const token = game.user.character?.getActiveTokens()[0] ?? canvas.tokens.ownedTokens[0];
        return token?.id ?? null;
    }

    engage() {
        const { camera, controls } = this;
        if (this.fromFirstPerson) {
            const firstPerson = this.parent.firstPerson;
            camera.position.copy(firstPerson.eye);
            controls.target.copy(firstPerson.eye).addScaledVector(firstPerson.direction, this.cell * 0.3);
            this.fromFirstPerson = false;
        }
        const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        const { min, max } = this.limits;
        this.engaged = true;
        this.distance = spherical.radius;
        this.phi = spherical.phi;
        this.goalDistance = THREE.MathUtils.clamp(this.savedDistance ?? this.cell * DEFAULT_CELLS, min, max);
        this.followId = this.defaultFollowId();
        this.goal.copy(controls.target);
        this.lastProbe.set(Infinity, 0, Infinity);
        const hit = this.floorHits(new THREE.Vector3(this.goal.x, controls.target.y + this.cell * STEP_CELLS, this.goal.z))[0];
        this.groundY = hit ? hit.point.y : unitsToPixels(canvas.primary.background?.elevation ?? 0);
        this.pendingGround = null;
        this.goal.y = this.groundY;
        this.pivotY = this.groundY;
        this.lastTarget.copy(controls.target);
        this.parent.stopCameraAnimation();
        this.setControlPreset();
        this.restorePanning();
        this.refreshButton();
    }

    release(toFirstPerson = false) {
        if (!toFirstPerson && !this.parent.firstPersonMode) this.fromFirstPerson = false;
        if (!this.engaged) return;
        this.engaged = false;
        this.fromFirstPerson = toFirstPerson;
        this.savedDistance = toFirstPerson ? Math.max(this.goalDistance, this.cell * DEFAULT_CELLS) : this.goalDistance;
        this.heldKeys.clear();
        this.resetPush();
        const controls = this.controls;
        controls.minDistance = 0.1;
        controls.maxDistance = 20;
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI;
        this.setControlPreset();
        this.restorePanning();
        this.parent._onCameraChange();
        this.refreshButton();
    }

    update(delta) {
        if (!this.active) return this.release();
        if (!this.engaged) this.engage();
        this.frame++;
        delta = Math.min(delta, 0.1);
        const { controls } = this;
        const target = controls.target;
        const dx = target.x - this.lastTarget.x;
        const dz = target.z - this.lastTarget.z;
        if (Math.abs(dx) + Math.abs(dz) > 1e-7) {
            this.goal.x += dx;
            this.goal.z += dz;
            if (controls._panOffset?.lengthSq() > 1e-12) this.followId = null;
        }
        this.applyKeyPan(delta);
        const token3d = this.followId ? this.parent.tokens[this.followId] : null;
        if (this.followId && !token3d?.mesh) this.followId = null;
        const following = token3d?.mesh && !this.suspended;
        if (following) {
            this.goal.copy(token3d.mesh.position);
            this.groundY = this.goal.y;
        } else {
            this.clampToScene(this.goal);
            if (this.goal.distanceToSquared(this.lastProbe) > (this.cell * 0.25) ** 2 || this.frame % 15 === 0) {
                this.lastProbe.copy(this.goal);
                this.probeGround();
            }
            this.goal.y = this.groundY;
        }
        const ease = (rate) => 1 - Math.exp(-rate * delta);
        this.distance += (this.goalDistance - this.distance) * ease(10);
        this.phi += (this.pitchFor(this.distance) - this.phi) * ease(8);
        this.pivotY += (this.goal.y - this.pivotY) * ease(HEIGHT_RATE);
        this.pivot.copy(this.goal).setY(this.pivotY);
        this.pivot.y += this.cell * LIFT_CELLS * (1 - this.zoomFraction(this.distance));
        this.updatePush(delta);
        const shown = this.pushShown;
        let distance = this.distance * (1 - PUSH_DOLLY * shown);
        let phi = this.phi + (PUSH_PHI - this.phi) * shown * 0.5;
        const previousX = target.x;
        const previousZ = target.z;
        if (this.entering) {
            const token3d = this.parent.tokens[this.entering.id];
            const t = Math.min(1, (performance.now() - this.entering.start) / ENTER_MS);
            const k = t * t * (3 - 2 * t);
            if (token3d?.mesh) {
                this.pivot.copy(token3d.mesh.position).setY(token3d.mesh.position.y + token3d.d * 0.9);
                const yaw = THREE.MathUtils.degToRad(token3d.token.document.rotation ?? 0);
                const turn = Math.atan2(Math.sin(yaw), -Math.cos(yaw)) - this.entering.theta;
                const theta = this.entering.theta + Math.atan2(Math.sin(turn), Math.cos(turn)) * k;
                controls.minAzimuthAngle = controls.maxAzimuthAngle = Math.atan2(Math.sin(theta), Math.cos(theta));
            }
            distance = THREE.MathUtils.lerp(this.entering.distance, this.cell * 0.2, k);
            phi = THREE.MathUtils.lerp(this.entering.phi, ENTER_PHI, k);
            target.lerp(this.pivot, Math.max(k, ease(12)));
            if (t >= 1) return this.finishFirstPerson();
        } else {
            const gap = Math.hypot(target.x - this.pivot.x, target.z - this.pivot.z) / this.cell;
            target.lerp(this.pivot, ease(following ? THREE.MathUtils.lerp(TRACK_RATE, RECENTER_RATE, THREE.MathUtils.clamp((gap - 1) / 2, 0, 1)) : 10));
            this.camera.position.x += target.x - previousX;
            this.camera.position.z += target.z - previousZ;
        }
        this.lastTarget.copy(target);
        if (this.frame % 5 === 0) {
            const floor = this.floorUnderCamera();
            this.cameraFloor = floor !== null && floor - this.pivotY <= this.cell * HILL_CELLS ? floor : null;
        }
        const cameraY = target.y + distance * Math.cos(phi);
        const need = this.cameraFloor === null || this.entering ? 0 : Math.max(0, this.cameraFloor + this.cell * CLEARANCE_CELLS - cameraY);
        this.raise += (need - this.raise) * ease(4);
        if (this.raise > 1e-4) phi = Math.max(TOP_DOWN_PHI, Math.acos(THREE.MathUtils.clamp((cameraY + this.raise - target.y) / distance, -1, 1)));
        controls.minDistance = controls.maxDistance = distance;
        controls.minPolarAngle = controls.maxPolarAngle = phi;
        controls.screenSpacePanning = false;
    }

    pushToken() {
        if (this.suspended || this.parent.firstPersonMode) return null;
        const controlled = canvas.tokens.controlled;
        if (controlled.length !== 1 || !controlled[0].isOwner) return null;
        return this.parent.tokens[controlled[0].id]?.mesh ? controlled[0] : null;
    }

    addPush(event) {
        const token = this.pushToken();
        if (!token) return false;
        const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
        this.push = Math.min(1, this.push + Math.min(Math.abs(event.deltaY) * scale, 120) / 100 / PUSH_NOTCHES);
        this.pushTime = performance.now();
        if (this.push >= 1) {
            this.entering = { id: token.id, start: performance.now(), distance: this.distance * (1 - PUSH_DOLLY * this.pushShown), phi: this.controls.getPolarAngle(), theta: this.controls.getAzimuthalAngle() };
            this.followId = token.id;
        }
        this.renderPush();
        return true;
    }

    updatePush(delta) {
        if (!this.push && !this.pushShown) return;
        if (!this.entering) {
            if (!this.pushToken()) this.push = 0;
            else if (performance.now() - this.pushTime > PUSH_HOLD_MS) this.push = Math.max(0, this.push - delta * PUSH_DECAY);
        }
        this.pushShown += (this.push - this.pushShown) * (1 - Math.exp(-12 * delta));
        if (this.pushShown < 0.002 && !this.push) this.pushShown = 0;
        this.renderPush();
    }

    finishFirstPerson() {
        const token = canvas.tokens.get(this.entering.id);
        this.resetPush();
        this.goalDistance = this.cell * DEFAULT_CELLS;
        if (!token) return;
        if (!token.controlled) token.control({ releaseOthers: true });
        this.parent.toggleFirstPerson();
    }

    resetPush() {
        if (this.entering) {
            this.controls.minAzimuthAngle = -Infinity;
            this.controls.maxAzimuthAngle = Infinity;
        }
        this.entering = null;
        this.push = 0;
        this.pushShown = 0;
        this.renderPush();
    }

    renderPush() {
        const value = this.entering ? 1 : Math.max(this.push, this.pushShown, this.exitPush);
        if (value <= 0) {
            this.pushElement?.remove();
            this.pushElement = null;
            return;
        }
        if (!this.pushElement) {
            const element = document.createElement("div");
            element.id = "tactical-fp-push";
            element.innerHTML = `<div class="push-ring"></div><i class="push-icon fas"></i>`;
            document.body.append(element);
            this.pushElement = element;
        }
        const icon = this.pushElement.querySelector(".push-icon");
        icon.classList.toggle("fa-eye", !this.exitPush);
        icon.classList.toggle("fa-eye-slash", !!this.exitPush);
        this.pushElement.style.setProperty("--push", value.toFixed(3));
    }

    onFirstPersonWheel(event) {
        const parent = this.parent;
        if (!parent.firstPersonMode || !parent._active || event.target !== parent.renderer.domElement) return;
        clearTimeout(this.exitTimer);
        if (event.deltaY <= 0) {
            this.exitPush = 0;
            return this.renderPush();
        }
        const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
        this.exitPush = Math.min(1, this.exitPush + Math.min(event.deltaY * scale, 120) / 100 / EXIT_NOTCHES);
        if (this.exitPush >= 1) {
            this.exitPush = 0;
            this.renderPush();
            return parent.toggleFirstPerson();
        }
        this.renderPush();
        this.exitTimer = setTimeout(() => {
            this.exitPush = 0;
            this.renderPush();
        }, PUSH_HOLD_MS);
    }

    applyKeyPan(delta) {
        if (!this.heldKeys.size || !this.parent.hasFocus) return;
        let x = 0;
        let y = 0;
        for (const key of this.heldKeys) {
            x += PAN_KEYS[key][0];
            y += PAN_KEYS[key][1];
        }
        if (!x && !y) return;
        const theta = this.controls.getAzimuthalAngle();
        const step = this.distance * PAN_SPEED * delta;
        this.goal.x += (-Math.sin(theta) * y + Math.cos(theta) * x) * step;
        this.goal.z += (-Math.cos(theta) * y - Math.sin(theta) * x) * step;
        this.followId = null;
    }

    clampToScene(point) {
        const d = canvas.dimensions;
        const x = d.sceneX / factor;
        const z = d.sceneY / factor;
        const w = d.sceneWidth / factor;
        const h = d.sceneHeight / factor;
        point.x = THREE.MathUtils.clamp(point.x, x - w * SCENE_SLACK, x + w * (1 + SCENE_SLACK));
        point.z = THREE.MathUtils.clamp(point.z, z - h * SCENE_SLACK, z + h * (1 + SCENE_SLACK));
    }

    floorHits(origin, terrainOnly = false) {
        const hits = this.parent.interactionManager.computeSightCollisionFrom3DPositions(origin, origin.clone().add(DOWN), "move", false, false, true, true) || [];
        const normal = new THREE.Vector3();
        return hits.filter((hit) => {
            const entity3D = this.renderedEntity(hit);
            if (entity3D === false || entity3D?.embeddedName === "Wall") return false;
            if (terrainOnly && entity3D && entity3D.mapMakerMesh?.k !== "terrain" && !entity3D.isTerrain) return false;
            if (!hit.face) return true;
            return normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y > FLOOR_NORMAL_Y;
        });
    }

    groundAt(point, referenceY) {
        const hit = this.floorHits(new THREE.Vector3(point.x, referenceY + this.cell * STEP_CELLS, point.z))[0];
        return hit ? hit.point.y : referenceY;
    }

    probeGround() {
        const y = this.groundAt(this.goal, this.groundY);
        if (Math.abs(y - this.groundY) < this.cell * HYSTERESIS_CELLS) return (this.pendingGround = null);
        const pending = this.pendingGround;
        if (pending && Math.abs(pending.y - y) < this.cell * HYSTERESIS_CELLS) {
            if (++pending.count < GROUND_CONFIRM) return;
            this.groundY = y;
            this.pendingGround = null;
            return;
        }
        this.pendingGround = { y, count: 1 };
    }

    floorUnderCamera() {
        const position = this.camera.position;
        const limit = position.y + this.cell;
        return this.floorHits(new THREE.Vector3(position.x, position.y + this.cell * 4, position.z), true).find((hit) => hit.point.y <= limit)?.point.y ?? null;
    }

    onWheel(event) {
        const sign = Math.sign(event.deltaY);
        if (!sign || this.entering) return;
        const { min, max } = this.limits;
        if (sign < 0 && this.goalDistance <= min * 1.001 && this.addPush(event)) return;
        if (sign > 0 && this.push) this.push = 0;
        this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * (sign > 0 ? ZOOM_STEP : 1 / ZOOM_STEP), min, max);
    }

    onKey(action, down) {
        if (!this.engaged) {
            this.heldKeys.delete(action);
            return false;
        }
        if (!down) {
            this.heldKeys.delete(action);
            return true;
        }
        const controlled = canvas.tokens.controlled.at(-1);
        if (controlled) {
            this.followId = controlled.id;
            return false;
        }
        this.heldKeys.add(action);
        return true;
    }

    onControlToken(token, controlled) {
        if (!this.engaged) return;
        if (controlled) this.followId = token.id;
        else if (!canvas.tokens.controlled.length) this.followId = null;
    }

    onTurnChange(combat) {
        if (!this.engaged || combat.scene?.id !== canvas.scene?.id) return;
        const token = combat.combatant?.token?.object;
        if (token?.isOwner && token.visible) this.followId = token.id;
    }

    focusToken(token) {
        let placeable = token?.token?.document ? token.token : (token?.object ?? token);
        if (!placeable?.document) placeable = canvas.tokens.get(this.defaultFollowId());
        if (!placeable || !this.parent.tokens[placeable.id]) return;
        if (placeable.isOwner && !placeable.controlled) placeable.control();
        this.followId = placeable.id;
    }

    consumeAnimation() {
        if (!this.engaged) return false;
        const lookat = this.parent._animateCameraTarget.cameraLookat;
        if (lookat) {
            this.goal.copy(lookat);
            this.groundY = lookat.y;
            this.lastProbe.copy(lookat);
            this.followId = null;
        }
        this.parent.stopCameraAnimation();
        return true;
    }

    toggleTopDown() {
        if (!this.engaged) return this.parent.resetCamera(true);
        this.topDown = !this.topDown;
    }

    async toggle() {
        await game.settings.set(MODULE_ID, "tacticalCamera", !this.preferred);
        this.refreshButton();
    }

    refreshButton() {
        document.querySelector(`[data-action="tactical-camera"]`)?.classList.toggle("clip-navigation-enabled", this.preferred);
    }

    onChange() {
        if (!this.engaged) this.onChangeFreeCamera();
        const now = performance.now();
        if (now - (this._lastSoundRefresh ?? 0) < 250) return;
        this._lastSoundRefresh = now;
        canvas.perception.update({ refreshSounds: true }, true);
    }

    onChangeFreeCamera() {
        if (!this.parent._active || this.engaged) return;
        const target = this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3));
        const collisions = this.parent.interactionManager.computeSightCollisionFrom3DPositions(this.camera.position, target, "sight", false, false, false, true) || [];
        let collision = null;
        for (const c of collisions) {
            const entity3D = this.renderedEntity(c);
            if (entity3D === false) continue;
            if (!entity3D?.cameraCollision && c.distance < 0.25) continue;
            collision = c.point;
            break;
        }
        this.controls.target = collision || target;
    }

    renderedEntity(hit) {
        if (!this.parent.interactionManager._clippingFilter(hit)) return false;
        let entity3D = null;
        for (let o = hit.object; o; o = o.parent) {
            if (o.userData?.noIntersect) return false;
            entity3D ??= o.userData?.entity3D ?? null;
        }
        const mesh = entity3D?.mesh ?? hit.object;
        let root = mesh;
        for (let o = mesh; o; o = o.parent) {
            if (!o.visible) return false;
            root = o;
        }
        if (root !== this.parent.scene) return false;
        const proxy = entity3D?.sightMesh;
        const path = [];
        for (let o = hit.object; o && o !== mesh; o = o.parent) path.push(o);
        if (path.at(-1)?.parent !== mesh && hit.object !== mesh) return entity3D;
        if (path.includes(proxy)) return mesh.children.some((child) => child !== proxy && child.visible) ? entity3D : false;
        if (path.some((o) => !o.visible)) return false;
        const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
        if (materials.every((m) => !m || m.visible === false || m.opacity === 0 || m.colorWrite === false)) return false;
        return entity3D;
    }

    moveCameraToCursor() {
        const mouse = this.parent.interactionManager._currentMousePosition;
        if (!mouse || !Number.isFinite(mouse.x) || !Number.isFinite(mouse.y) || !Number.isFinite(mouse.z)) return;
        const hover = new THREE.Vector3(mouse.x, mouse.y, mouse.z);
        if (this.engaged) {
            this.goal.copy(hover);
            this.groundY = hover.y;
            this.lastProbe.copy(hover);
            this.followId = null;
            return;
        }
        const animation = this.parent._animateCameraTarget;
        animation.cameraPosition = this.camera.position.clone().add(hover.clone().sub(this.controls.target));
        animation.cameraLookat = hover;
        animation.speed = 0.04;
    }

    restorePanning() {
        this.controls.screenSpacePanning = !this.engaged;
    }

    setControlPreset() {
        const alt = this.engaged || game.settings.get(MODULE_ID, "altCameraControls");
        this.parent.interactionManager.altControls = alt;
        this.controls.mouseButtons = alt ? { LEFT: undefined, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN } : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    }
}
