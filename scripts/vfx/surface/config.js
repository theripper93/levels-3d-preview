import { SURFACE_DEFAULTS, SURFACE_FLAG, SURFACE_KINDS } from "./state.js";

function localize(key) {
    return game.i18n.localize(`levels3dpreview.weather.surface.${key}`);
}

function range(label, defaultValue, min, max, step) {
    return { type: "range", label: localize(label), default: defaultValue, min, max, step };
}

export function surfaceConfigFields() {
    const defaults = SURFACE_DEFAULTS;
    return {
        [`${SURFACE_FLAG}.enabled`]: { type: "checkbox", label: localize("enabled"), notes: localize("enabledNotes"), default: defaults.enabled },
        [`${SURFACE_FLAG}.buildTime`]: { ...range("buildTime", defaults.buildTime, 0.5, 120, 0.5), notes: localize("buildTimeNotes") },
        [`${SURFACE_FLAG}.meltTime`]: { ...range("meltTime", defaults.meltTime, 0.5, 240, 0.5), notes: localize("meltTimeNotes") },
        [`${SURFACE_FLAG}.start.kind`]: { type: "select", label: localize("startKind"), default: defaults.start.kind, options: Object.fromEntries(Object.keys(SURFACE_KINDS).map((kind) => [kind, localize(`kinds.${kind}`)])) },
        [`${SURFACE_FLAG}.start.cover`]: { ...range("startCover", defaults.start.cover, 0, 1, 0.01), notes: localize("startNotes") },
        [`${SURFACE_FLAG}.start.wet`]: range("startWet", defaults.start.wet, 0, 1, 0.01),
    };
}
