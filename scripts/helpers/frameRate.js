const SAMPLES = 60;
const GAP_RESET = 1000;
const values = [];
let next = 0;
let previous = 0;

export function acceptFrame(time) {
    const max = canvas.app?.ticker?.maxFPS ?? 0;
    if (max > 0 && !game.Levels3DPreview?._sharedContext) {
        const interval = 1000 / max;
        if (time < next - 1) return false;
        next = time - next > interval ? time + interval : next + interval;
    }
    const elapsed = time - previous;
    if (previous && elapsed > 0 && elapsed < GAP_RESET) {
        values.push(1000 / elapsed);
        if (values.length > SAMPLES) values.shift();
    }
    previous = time;
    return true;
}

export function registerFrameRateDisplay() {
    libWrapper.register(
        "levels-3d-preview",
        "foundry.applications.ui.Players.prototype.refreshFPS",
        function (wrapped, options) {
            if (!game.Levels3DPreview?._active || !values.length) return wrapped(options);
            const measured = canvas.fps.values;
            canvas.fps.values = values;
            try {
                return wrapped(options);
            } finally {
                canvas.fps.values = measured;
            }
        },
        "WRAPPER",
    );
}
