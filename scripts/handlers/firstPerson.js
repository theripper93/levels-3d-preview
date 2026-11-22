import * as THREE from "three";
import { factor } from "../main.js";
import { unitsToPixels } from "../helpers/coords3d.js";

const FOV = 72;
const NEAR_CELLS = 0.03;
const CLEARANCE_CELLS = 0.2;
const SENSITIVITY = 0.0025;
const MAX_PITCH = THREE.MathUtils.degToRad(85);
const EYE_DAMPING = 12;
const FOLLOW_DAMPING = 20;
const SNAP_CELLS = 2;
const STEP_LEAD = 120;
const BLOCKED_PAUSE = 400;
const STEP_TIMEOUT = 2000;
const NUDGE_CELLS = 0.1;
const NUDGE_DURATION = 0.25;
const PROBE_REFRESH = 0.5;
const BLOCKED_WAIT = 250;
const PROBE_RANGE_CELLS = 2;
const DOT_DIAMETER = 6;
const EXIT_BACK_CELLS = 3.5;
const EXIT_UP_CELLS = 2.5;
const CONTROL_FIELDS = ["enabled", "enablePan", "enableZoom", "enableRotate", "minPolarAngle", "maxPolarAngle", "minDistance", "maxDistance"];
const BLOCKED_EVENTS = ["pointerdown", "pointerup", "pointermove", "wheel", "contextmenu", "dblclick", "click"];
const HORIZONTAL_PROBES = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.cos((i * Math.PI) / 4), 0, Math.sin((i * Math.PI) / 4)));

export class FirstPersonController {
    constructor(parent) {
        this.parent = parent;
        this.tokenId = null;
        this.yaw = 0;
        this.pitch = 0;
        this.eye = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.lookTarget = new THREE.Vector3();
        this.offset = new THREE.Vector3();
        this.probeDirection = new THREE.Vector3();
        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;
        this.hidden = new Set();
        this.saved = null;
        this.nudgeState = null;
        this.probes = null;
        this.eyeY = null;
        this.eyeX = 0;
        this.eyeZ = 0;
        this.held = new Map();
        this.queuedStep = null;
        this.stepPending = false;
        this.stepPendingAt = 0;
        this.stepEnd = 0;
        this.blockedUntil = 0;
        this.lockFailed = false;
        this.lockUnsupported = false;
        this.synthetic = false;
        this.onMouse = this.onMouse.bind(this);
        this.onBlocked = this.onBlocked.bind(this);
        this.onLockChange = this.onLockChange.bind(this);
        this.onLockError = this.onLockError.bind(this);
        this.onBlur = this.onBlur.bind(this);
    }

    onBlur() {
        this.held.clear();
        this.queuedStep = null;
    }

    get active() {
        return !!this.tokenId && this.parent.firstPersonMode;
    }

    get camera() {
        return this.parent.camera;
    }

    get controls() {
        return this.parent.controls;
    }

    get domElement() {
        return this.parent.renderer.domElement;
    }

    get locked() {
        return document.pointerLockElement === this.domElement;
    }

    get cell() {
        return canvas.grid.size / factor;
    }

    get token3d() {
        return this.parent.tokens[this.tokenId];
    }

    get rotation() {
        return ((Math.round(THREE.MathUtils.radToDeg(this.yaw) * 100) / 100) % 360 + 360) % 360;
    }

    toggle() {
        if (this.active) return this.exit();
        const token = canvas.tokens.controlled[0];
        if (token) this.enter(token);
    }

    enter(token) {
        const token3d = this.parent.tokens[token.id];
        if (!token3d?.mesh) return;
        const camera = this.camera;
        const controls = this.controls;
        this.saved = {
            fov: camera.fov,
            near: camera.near,
            gameCamera: this.parent.GameCamera.enabled,
            controls: Object.fromEntries(CONTROL_FIELDS.map((key) => [key, controls[key]])),
        };
        if (this.parent.GameCamera.enabled) this.parent.GameCamera.toggle();
        this.parent.stopCameraAnimation();
        this.tokenId = token.id;
        this.yaw = THREE.MathUtils.degToRad(token.document.rotation ?? 0);
        this.pitch = 0;
        this.eyeY = null;
        this.probes = null;
        this.nudgeState = null;
        this.stepPending = false;
        this.stepEnd = 0;
        this.onBlur();
        this.parent.firstPersonMode = true;
        controls.enabled = false;
        camera.fov = FOV;
        camera.near = this.cell * NEAR_CELLS;
        camera.updateProjectionMatrix();
        this.ensureDot();
        this.parent.scene.add(this.dot);
        this.addListeners();
        this.requestLock();
        this.update(0);
    }

    exit() {
        const token3d = this.token3d;
        const token = token3d?.token;
        if (token?.document && token.isOwner) {
            const rotation = this.rotation;
            const current = (((token.document.rotation ?? 0) % 360) + 360) % 360;
            const diff = Math.abs(rotation - current);
            if (Math.min(diff, 360 - diff) >= 0.5) token.document.update({ rotation });
        }
        const gameCamera = this.saved?.gameCamera;
        this.reset();
        if (token3d?.mesh) this.placeBehind(token3d);
        if (gameCamera) this.parent.GameCamera.toggle();
    }

    reset() {
        this.removeListeners();
        this.onBlur();
        if (this.locked) document.exitPointerLock();
        this.restoreToken();
        this.dot?.removeFromParent();
        if (this.saved) {
            const camera = this.camera;
            camera.fov = this.saved.fov;
            camera.near = this.saved.near;
            camera.updateProjectionMatrix();
            Object.assign(this.controls, this.saved.controls);
        }
        this.saved = null;
        this.tokenId = null;
        this.parent.firstPersonMode = false;
    }

    placeBehind(token3d) {
        const cell = this.cell;
        const head = token3d.head;
        const back = new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        let position = head.clone().addScaledVector(back, cell * EXIT_BACK_CELLS);
        position.y += cell * EXIT_UP_CELLS;
        const collision = this.parent.interactionManager.computeSightCollisionFrom3DPositions(head, position);
        if (collision) position = new THREE.Vector3(collision.x, collision.y, collision.z).lerp(head, 0.1);
        this.parent.stopCameraAnimation();
        this.camera.position.copy(position);
        this.controls.target.copy(token3d.mid);
        this.camera.lookAt(this.controls.target);
        if (this.controls._lockZero) this.parent._onCameraChange();
        this.controls.update();
    }

    restoreToken() {
        for (const object of this.hidden) object.visible = true;
        this.hidden.clear();
        this.token3d?.updateVisibility();
    }

    hideToken(token3d) {
        const light = token3d.light?.light3d;
        for (const child of token3d.mesh.children) {
            if (child === light || !child.visible) continue;
            child.visible = false;
            this.hidden.add(child);
        }
    }

    syncToken() {
        const controlled = canvas.tokens.controlled[0];
        if (controlled && controlled.id !== this.tokenId && this.parent.tokens[controlled.id]?.mesh) {
            this.restoreToken();
            this.tokenId = controlled.id;
            this.eyeY = null;
            this.probes = null;
        } else if (!controlled) {
            const token = canvas.tokens.get(this.tokenId);
            if (token?.isOwner || game.user.isGM) token?.control({ releaseOthers: true });
        }
        return this.token3d;
    }

    look(dx, dy) {
        this.yaw += dx * SENSITIVITY;
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * SENSITIVITY, -MAX_PITCH, MAX_PITCH);
    }

    update(delta) {
        if (!this.active) return;
        const token3d = this.syncToken();
        if (!token3d?.mesh) return this.exit();
        if (this.controls.enabled) this.controls.enabled = false;
        this.hideToken(token3d);
        const cos = Math.cos(this.pitch);
        this.direction.set(-Math.sin(this.yaw) * cos, Math.sin(this.pitch), Math.cos(this.yaw) * cos);
        this.updateWalk();
        const eyeY = unitsToPixels(token3d.losHeight);
        const position = token3d.mesh.position;
        const snap = this.eyeY === null || !delta || Math.hypot(position.x - this.eyeX, position.z - this.eyeZ) > this.cell * SNAP_CELLS;
        if (snap) {
            this.eyeY = eyeY;
            this.eyeX = position.x;
            this.eyeZ = position.z;
        } else {
            this.eyeY += (eyeY - this.eyeY) * (1 - Math.exp(-delta * EYE_DAMPING));
            const follow = 1 - Math.exp(-delta * FOLLOW_DAMPING);
            this.eyeX += (position.x - this.eyeX) * follow;
            this.eyeZ += (position.z - this.eyeZ) * follow;
        }
        this.eye.set(this.eyeX, this.eyeY, this.eyeZ);
        this.keepClear(this.eye, delta);
        this.applyNudge(this.eye, delta);
        this.camera.position.copy(this.eye);
        this.lookTarget.copy(this.eye).addScaledVector(this.direction, this.cell);
        this.camera.lookAt(this.lookTarget);
        this.controls.target.copy(this.lookTarget);
        this.updateDot();
    }

    probeTargets(eye, delta) {
        const probes = this.probes;
        if (probes && probes.age < PROBE_REFRESH && probes.center.distanceTo(eye) < this.cell * 0.5) {
            probes.age += delta;
            return probes.targets;
        }
        const im = this.parent.interactionManager;
        const previous = im._sightCollisions;
        const reach = canvas.grid.size * PROBE_RANGE_CELLS;
        const x = eye.x * factor;
        const y = eye.z * factor;
        im.forceSightCollisions({ x: x - reach, y: y - reach }, { x: x + reach, y: y + reach });
        const targets = [...new Set([...(im._sightCollisions.sight ?? []), ...(im._sightCollisions.move ?? [])])].filter((object) => object !== this.parent.board);
        im._sightCollisions = previous;
        this.probes = { center: eye.clone(), age: 0, targets };
        return targets;
    }

    keepClear(eye, delta) {
        const targets = this.probeTargets(eye, delta);
        if (!targets.length) return;
        const broadphase = this.parent.interactionManager.sightBroadphase;
        const radius = this.cell * CLEARANCE_CELLS;
        const raycaster = this.raycaster;
        raycaster.far = radius;
        this.offset.set(0, 0, 0);
        for (const direction of [...HORIZONTAL_PROBES, this.direction]) {
            raycaster.set(eye, direction);
            const hit = raycaster.intersectObjects(broadphase.filter(raycaster, targets), true)[0];
            if (hit && hit.distance < radius) this.offset.addScaledVector(direction, hit.distance - radius);
        }
        const length = this.offset.length();
        if (length > radius) this.offset.multiplyScalar(radius / length);
        eye.add(this.offset);
    }

    watchMove(promise, dx, dy) {
        if (!this.active || !(promise instanceof Promise)) return;
        const id = this.tokenId;
        let moved = false;
        const hook = Hooks.on("updateToken", (document, changes) => {
            if (document.id !== id || !("x" in changes || "y" in changes)) return;
            moved = true;
            this.stepEnd = Math.max(this.stepEnd, performance.now()) + this.stepDuration(document, dx, dy);
        });
        const settle = () =>
            setTimeout(
                () => {
                    Hooks.off("updateToken", hook);
                    this.stepPending = false;
                    if (moved || !this.active) return;
                    this.nudge(dx, dy);
                    this.blockedUntil = performance.now() + BLOCKED_PAUSE;
                },
                moved ? 0 : BLOCKED_WAIT,
            );
        promise.then(settle, settle);
    }

    stepDuration(document, dx, dy) {
        const action = CONFIG.Token.movement.actions[document.movementAction];
        const speed = action?.getAnimationOptions?.(document)?.movementSpeed ?? CONFIG.Token.movement.defaultSpeed;
        return ((dx && dy ? Math.SQRT2 : 1) * 1000) / speed;
    }

    keyMove(context, action, dx, dy) {
        if (!this.active) return false;
        if (context?.repeat) return true;
        this.held.set(action, { dx, dy });
        this.queuedStep = { dx, dy };
        this.blockedUntil = 0;
        this.updateWalk();
        return true;
    }

    keyRelease(action) {
        this.held.delete(action);
    }

    updateWalk() {
        const now = performance.now();
        if (this.stepPending && now - this.stepPendingAt < STEP_TIMEOUT) return;
        const step = this.queuedStep ?? [...this.held.values()].at(-1);
        if (!step || now < this.blockedUntil) return;
        const token = canvas.tokens.get(this.tokenId);
        if (!token || token._preventKeyboardMovement) return;
        if (!this.queuedStep && now < this.stepEnd - STEP_LEAD - 2 * (game.time.averageLatency || 0)) return;
        this.queuedStep = null;
        this.stepPending = true;
        this.stepPendingAt = now;
        const promise = canvas.tokens.moveMany({ dx: step.dx, dy: step.dy });
        if (this.stepPending && !(promise instanceof Promise)) this.stepPending = false;
        promise?.then?.(null, () => (this.stepPending = false));
    }

    addFacing(result) {
        if (!this.active) return;
        const update = result?.[0]?.find?.((entry) => entry._id === this.tokenId);
        if (update) update.rotation = this.rotation;
    }

    nudge(dx, dy) {
        const direction = new THREE.Vector3(dx, 0, dy);
        if (!direction.lengthSq()) return;
        this.nudgeState = { direction: direction.normalize(), time: 0 };
    }

    applyNudge(eye, delta) {
        const state = this.nudgeState;
        if (!state) return;
        state.time += delta;
        if (state.time >= NUDGE_DURATION) return (this.nudgeState = null);
        eye.addScaledVector(state.direction, this.cell * NUDGE_CELLS * Math.sin((Math.PI * state.time) / NUDGE_DURATION));
    }

    ensureDot() {
        if (this.dot) return;
        const size = 32;
        const canvasElement = document.createElement("canvas");
        canvasElement.width = canvasElement.height = size;
        const context = canvasElement.getContext("2d");
        context.beginPath();
        context.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
        context.fillStyle = "rgba(255, 255, 255, 0.9)";
        context.fill();
        context.lineWidth = 3;
        context.strokeStyle = "rgba(0, 0, 0, 0.6)";
        context.stroke();
        const texture = new THREE.CanvasTexture(canvasElement);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false });
        this.dot = new THREE.Sprite(material);
        this.dot.renderOrder = Number.MAX_SAFE_INTEGER;
        this.dot.frustumCulled = false;
        this.dot.raycast = () => {};
        Object.assign(this.dot.userData, { ignoreIntersect: true, ignoreHover: true, noIntersect: true });
    }

    updateDot() {
        const dot = this.dot;
        dot.visible = this.locked;
        if (!dot.visible) return;
        const scale = (2 * DOT_DIAMETER * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / window.innerHeight;
        dot.scale.set(scale, scale, 1);
        dot.position.copy(this.camera.position).addScaledVector(this.direction, this.camera.near * 4);
    }

    requestLock(fromClick = false) {
        if (this.locked || this.lockUnsupported) return;
        const fail = () => {
            this.lockFailed = true;
            if (fromClick) this.lockUnsupported = true;
        };
        try {
            const request = this.domElement.requestPointerLock();
            if (request instanceof Promise) request.catch(fail);
        } catch (e) {
            fail();
        }
    }

    addListeners() {
        for (const type of ["mousedown", "mouseup", "mousemove"]) window.addEventListener(type, this.onMouse, true);
        for (const type of BLOCKED_EVENTS) window.addEventListener(type, this.onBlocked, { capture: true, passive: false });
        window.addEventListener("keydown", this.onBlocked, true);
        window.addEventListener("blur", this.onBlur);
        document.addEventListener("pointerlockchange", this.onLockChange);
        document.addEventListener("pointerlockerror", this.onLockError);
    }

    removeListeners() {
        for (const type of ["mousedown", "mouseup", "mousemove"]) window.removeEventListener(type, this.onMouse, true);
        for (const type of BLOCKED_EVENTS) window.removeEventListener(type, this.onBlocked, { capture: true });
        window.removeEventListener("keydown", this.onBlocked, true);
        window.removeEventListener("blur", this.onBlur);
        document.removeEventListener("pointerlockchange", this.onLockChange);
        document.removeEventListener("pointerlockerror", this.onLockError);
    }

    onLockChange() {
        if (this.locked) this.lockFailed = false;
        if (this.dot) this.dot.visible = this.locked && this.active;
    }

    onLockError() {
        this.lockFailed = true;
    }

    onBlocked(event) {
        if (this.synthetic || !this.locked) return;
        if (event.type === "keydown" && event.code !== "Escape") return;
        event.stopImmediatePropagation();
        if (event.cancelable && event.type !== "keydown") event.preventDefault();
    }

    onMouse(event) {
        if (this.synthetic) return;
        if (!this.locked) {
            if (event.type === "mousedown" && event.button === 0 && event.target === this.domElement && !this.lockUnsupported) {
                event.stopImmediatePropagation();
                this.requestLock(true);
            }
            return;
        }
        event.stopImmediatePropagation();
        if (event.type === "mousemove") {
            this.look(event.movementX, event.movementY);
            this.dispatchCenter("mousemove", 0);
        } else if (event.type === "mousedown" && event.button === 0) this.clickCenter();
    }

    dispatchCenter(type, button, buttons = 0) {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: window.innerWidth / 2, clientY: window.innerHeight / 2, button, buttons, view: window });
        this.synthetic = true;
        try {
            this.domElement.dispatchEvent(event);
        } finally {
            this.synthetic = false;
        }
    }

    clickCenter() {
        if (!this.active) return;
        const im = this.parent.interactionManager;
        const mesh = this.token3d?.mesh;
        const near = im.raycaster.near;
        const wasVisible = mesh?.visible;
        im.raycaster.near = this.camera.near;
        if (mesh) mesh.visible = false;
        try {
            this.dispatchCenter("mousemove", 0);
            this.dispatchCenter("mousedown", 0, 1);
            this.dispatchCenter("mouseup", 0, 0);
        } finally {
            im.raycaster.near = near;
            if (mesh) mesh.visible = wasVisible;
        }
    }
}
