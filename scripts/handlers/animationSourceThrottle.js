const MODULE_ID = "levels-3d-preview";
const MIN_INTERVAL_MS = 1000 / 30 - 4;

const lastInitialized = new WeakMap();
const pending = new WeakSet();
const flushing = new WeakSet();
let animationFrame = null;

export function registerAnimationSourceThrottle() {
    libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype._onAnimationUpdate", onAnimationUpdate, "WRAPPER");
    libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype.initializeSources", initializeSources, "MIXED");
}

function onAnimationUpdate(wrapped, changed, context) {
    const previous = animationFrame;
    animationFrame = { token: this, context };
    try {
        return wrapped(changed, context);
    } finally {
        animationFrame = previous;
    }
}

function initializeSources(wrapped, options = {}) {
    const now = performance.now();
    if (shouldDefer(this, options, now)) {
        pending.add(this);
        return;
    }
    pending.delete(this);
    lastInitialized.set(this, now);
    return wrapped(options);
}

function shouldDefer(token, options, now) {
    if (options.deleted || animationFrame?.token !== token || !game.Levels3DPreview?._active) return false;
    const context = animationFrame.context;
    if (!(context.time < context.duration)) return false;
    const last = lastInitialized.get(token);
    if (last === undefined || now - last >= MIN_INTERVAL_MS) return false;
    flushOnEnd(token, context);
    return true;
}

function flushOnEnd(token, context) {
    if (flushing.has(context)) return;
    flushing.add(context);
    context.postAnimate.push(() => {
        if (pending.has(token) && !token.destroyed) token.initializeSources();
    });
}
