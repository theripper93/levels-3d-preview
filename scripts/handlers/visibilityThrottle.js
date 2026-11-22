const MODULE_ID = "levels-3d-preview";
const INTERVAL = 3;

export class VisibilityThrottle {
    constructor() {
        this.results = new WeakMap();
        this.slots = new WeakMap();
        this.nextSlot = 0;
        this.frame = -1;
        this.tick = 0;
        this.moving = false;
        this.watching = false;
        libWrapper.register(MODULE_ID, "foundry.canvas.groups.CanvasVisibility.prototype.testVisibility", this._testVisibility.bind(this), "MIXED");
        Hooks.on("canvasTearDown", () => this.stopWatching());
    }

    _testVisibility(wrapped, points, options = {}) {
        const object = options.object;
        const previous = this.currentObject;
        this.currentObject = object;
        try {
            return this._throttledTest(wrapped, points, options, object);
        } finally {
            this.currentObject = previous;
        }
    }

    _throttledTest(wrapped, points, options, object) {
        if (!this.throttles(object)) return wrapped(points, options);
        const signature = this.signature(points, options);
        const cached = this.results.get(object);
        if (cached && this.sameSignature(cached.signature, signature) && this.isMoving() && (this.tick + this.slot(object)) % INTERVAL !== 0) {
            this.watch();
            return cached.visible;
        }
        const visible = wrapped(points, options);
        this.results.set(object, { visible, signature });
        return visible;
    }

    signature(points, options) {
        const list = Array.isArray(points) ? points : [points];
        const signature = [options.tolerance ?? 2, list.length];
        for (const p of list) signature.push(p?.x, p?.y, p?.elevation);
        return signature;
    }

    sameSignature(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }

    throttles(object) {
        return object instanceof foundry.canvas.placeables.Token || object instanceof foundry.canvas.placeables.Note || object instanceof foundry.canvas.containers.DoorControl;
    }

    slot(object) {
        let slot = this.slots.get(object);
        if (slot === undefined) {
            slot = this.nextSlot++ % INTERVAL;
            this.slots.set(object, slot);
        }
        return slot;
    }

    isMoving() {
        const frame = canvas.app.ticker.lastTime;
        if (frame === this.frame) return this.moving;
        this.frame = frame;
        this.tick++;
        this.moving = !!canvas.tokens?._draggedToken || canvas.effects.visionSources.some((source) => source.active && source.object?.animationContexts?.size);
        return this.moving;
    }

    watch() {
        if (this.watching) return;
        this.watching = true;
        canvas.app.ticker.add(this.settle, this);
    }

    settle() {
        if (this.isMoving()) return;
        this.stopWatching();
        canvas.perception.update({ refreshVision: true });
    }

    stopWatching() {
        if (!this.watching) return;
        this.watching = false;
        canvas.app.ticker.remove(this.settle, this);
    }
}
