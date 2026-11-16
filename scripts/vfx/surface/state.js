import * as THREE from "three";
import { LAYERS, resolveFlag, resolveState } from "../weather/presets.js";

const MODULE_ID = "levels-3d-preview";
export const SURFACE_FLAG = "weatherSurface";
const MINUTE = 60;
const WET_RISE = 4;
const RAIN_DENSITY = 32000;
const EPSILON = 1e-3;
const RESTART_TOLERANCE = 60000;
const RESET_GRACE = 5000;
const MELT_WET_SHARE = 0.5;

export const SURFACE_DEFAULTS = { enabled: true, buildTime: 10, meltTime: 20, start: { kind: "snow", cover: 0, wet: 0 } };

export const SURFACE_KINDS = {
    snow: { color: [0.66, 0.7, 0.76], roughness: 0.7, sparkle: 1, lumps: 1, area: 1, shape: [1, 0, 1, 0.35], detail: [0.06, 0, 0, 1], style: [0, 1, 0.025, 1], melt: 1, meltWet: 0.8 },
    hail: { color: [0.62, 0.67, 0.72], roughness: 0.5, sparkle: 0.7, lumps: 0.5, area: 1, shape: [1, 0, 0.8, 0.1], detail: [0.08, 0, 0, 1], style: [0, 1, 0.025, 1], melt: 4, meltWet: 0.6 },
    ash: { color: [0.2, 0.19, 0.18], roughness: 0.95, sparkle: 0, lumps: 0, area: 1, shape: [0.65, 1, 0.3, 0.2], detail: [0.1, 0.3, 0, 0], style: [0, 0.5, 0.025, 1], melt: 0, meltWet: 0 },
    sand: { color: [0.42, 0.28, 0.13], roughness: 0.9, sparkle: 0.15, lumps: 0.4, area: 0.55, shape: [1, 0, 0.6, 1], detail: [0.1, 0.15, 1, 0], style: [0, 0.15, 0.06, 0.25], melt: 0, meltWet: 0 },
    dust: { color: [0.3, 0.24, 0.17], roughness: 0.85, sparkle: 0, lumps: 0, area: 1, shape: [0.4, 1, 0.2, 0], detail: [0, 0, 0, 0], style: [0.6, 0.25, 0.025, 1], melt: 0, meltWet: 0 },
};

export const SURFACE_DEPOSITS = {
    snow: { kind: "snow", cover: 1, rate: 1 },
    hail: { kind: "hail", cover: 0.25, rate: 2 },
    ash: { kind: "ash", cover: 1, rate: 0.6 },
    sand: { kind: "sand", cover: 1, rate: 0.8 },
    dust: { kind: "dust", cover: 0.35, rate: 0.3 },
    rain: { wet: 1, melt: 3 },
};

export function surfaceSettings(scene = canvas.scene) {
    const flag = scene?.flags?.[MODULE_ID]?.[SURFACE_FLAG] ?? {};
    return {
        enabled: flag.enabled ?? SURFACE_DEFAULTS.enabled,
        buildTime: Math.max(Number(flag.buildTime) || SURFACE_DEFAULTS.buildTime, 0.05),
        meltTime: Math.max(Number(flag.meltTime) || SURFACE_DEFAULTS.meltTime, 0.05),
        start: { ...SURFACE_DEFAULTS.start, ...flag.start },
        ramp: flag.ramp ?? null,
    };
}

export function isInteriorScene() {
    const atmosphere = game.Levels3DPreview?.lights?.globalIllumination?.atmosphere;
    return !!atmosphere?.enabled && (atmosphere.setting ?? "outdoor") !== "outdoor";
}

export function suppressSurface(surface) {
    if (!surface) return surface;
    return { ...surface, cover: 0, previous: null, total: 0, wet: 0, melting: false, snow: 0, interior: true };
}

export function rainRate(state) {
    let rate = 0;
    for (const layer of state?.layers?.values() ?? []) {
        if (layer.kind === "rain") rate = Math.max(rate, (layer.amount * layer.count) / RAIN_DENSITY);
    }
    return Math.clamp(rate, 0, 1);
}

export function depositTarget(flag, flags = {}) {
    const state = resolveState(flag ?? { preset: "none" }, { flags });
    const target = { kind: null, cover: 0, wet: 0, build: 1, melt: 1 };
    for (const layer of state.layers.values()) {
        const deposit = SURFACE_DEPOSITS[layer.kind];
        if (!deposit || !(layer.amount > 0)) continue;
        const density = layer.count / (LAYERS[layer.kind]?.count || layer.count || 1);
        const cover = (deposit.cover ?? 0) * layer.amount;
        if (cover > target.cover) Object.assign(target, { kind: deposit.kind, cover, build: deposit.rate * Math.clamp(density, 0.5, 3) });
        if (deposit.wet) {
            target.wet = Math.max(target.wet, deposit.wet * Math.clamp(density, 0.6, 1) * layer.amount);
            target.melt = Math.max(target.melt, deposit.melt);
        }
    }
    return target;
}

function sceneTarget(scene) {
    return depositTarget(resolveFlag(scene), scene.flags?.[MODULE_ID] ?? {});
}

function approach(from, to, rate, seconds) {
    return from < to ? Math.min(to, from + rate * seconds) : Math.max(to, from - rate * seconds);
}

export function createRamp(current, target, settings, time) {
    const build = 1 / (settings.buildTime * MINUTE);
    const melt = 1 / (settings.meltTime * MINUTE);
    let kind = current.kind;
    let cover = current.cover;
    let previous = current.previous?.cover > EPSILON ? { ...current.previous } : null;
    if (target.kind && target.kind !== kind) {
        const swapped = cover > EPSILON ? { kind, cover } : null;
        cover = previous?.kind === target.kind ? previous.cover : 0;
        previous = swapped;
        kind = target.kind;
    }
    const properties = SURFACE_KINDS[kind] ?? SURFACE_KINDS.snow;
    const persistent = !properties.melt;
    const goal = persistent ? Math.max(cover, target.kind === kind ? target.cover : 0) : target.kind === kind ? target.cover : 0;
    const meltRate = properties.melt * target.melt * melt;
    if (previous) previous.rate = build * target.build;
    const meltCover = !persistent && goal < cover ? cover - goal : 0;
    const meltEnd = meltRate > 0 ? meltCover / meltRate : 0;
    const meltWet = meltEnd > 0 ? Math.max(target.wet, properties.meltWet * Math.min(1, meltCover * 2)) : target.wet;
    const rise = WET_RISE * build;
    const meltRise = meltEnd > 0 && target.wet <= EPSILON ? Math.min(rise, Math.max(meltWet - current.wet, EPSILON) / (MELT_WET_SHARE * meltEnd)) : rise;
    return {
        time,
        wall: time + bootOffset(),
        source: targetKey(target),
        kind,
        cover,
        target: goal,
        build: build * target.build,
        melt: meltRate,
        previous: previous ?? null,
        wet: current.wet,
        wetTarget: target.wet,
        meltWet,
        meltEnd,
        rise,
        meltRise,
        dry: melt,
    };
}

function bootOffset() {
    return Date.now() - game.time.serverTime;
}

function elapsedSeconds(ramp, time) {
    const offset = bootOffset();
    const sameBoot = ramp.wall === undefined || Math.abs(offset - (ramp.wall - ramp.time)) < RESTART_TOLERANCE;
    return Math.max(0, (sameBoot ? time - ramp.time : time + offset - ramp.wall) / 1000);
}

export function evaluateRamp(ramp, time) {
    const seconds = elapsedSeconds(ramp, time);
    const cover = approach(ramp.cover, ramp.target, ramp.cover < ramp.target ? ramp.build : ramp.melt, seconds);
    const previous = ramp.previous ? { kind: ramp.previous.kind, cover: Math.max(0, ramp.previous.cover - ramp.previous.rate * seconds) } : null;
    const melting = seconds < ramp.meltEnd;
    const rate = (from, to) => (from < to ? ramp.meltRise ?? ramp.rise : ramp.dry);
    let wet;
    if (melting) wet = approach(ramp.wet, ramp.meltWet, rate(ramp.wet, ramp.meltWet), seconds);
    else {
        const melted = approach(ramp.wet, ramp.meltWet, rate(ramp.wet, ramp.meltWet), ramp.meltEnd);
        wet = approach(melted, ramp.wetTarget, rate(melted, ramp.wetTarget), seconds - ramp.meltEnd);
    }
    return { kind: ramp.kind, cover, previous: previous?.cover > EPSILON ? previous : null, wet, melting };
}

function startState(start) {
    return { kind: SURFACE_KINDS[start.kind] ? start.kind : "snow", cover: Math.clamp(Number(start.cover) || 0, 0, 1), previous: null, wet: Math.clamp(Number(start.wet) || 0, 0, 1) };
}

const COVER_QUANTILES = [0.01, 0.289, 0.333, 0.364, 0.388, 0.41, 0.43, 0.448, 0.466, 0.483, 0.5, 0.517, 0.534, 0.552, 0.57, 0.59, 0.611, 0.636, 0.667, 0.71, 0.962];
const PUDDLE_QUANTILES = [0.027, 0.242, 0.293, 0.331, 0.362, 0.389, 0.413, 0.436, 0.459, 0.481, 0.503, 0.525, 0.547, 0.57, 0.593, 0.618, 0.644, 0.674, 0.711, 0.76, 0.968];
const HOLE_QUANTILES = [0.017, 0.261, 0.308, 0.341, 0.369, 0.394, 0.417, 0.439, 0.459, 0.48, 0.5, 0.52, 0.54, 0.561, 0.582, 0.606, 0.631, 0.658, 0.692, 0.738, 0.969];
const AREA_CURVE = [
    [0, 0],
    [0.3, 0.15],
    [0.6, 0.5],
    [0.85, 0.9],
    [1, 0.97],
];
const ROOF_LEAD = 0.1;
const PUDDLE_AREA = 0.15;
const HOLE_AREA = 0.45;
const HOLE_ONSET = 0.1;

function quantile(table, fraction) {
    const position = Math.clamp(fraction, 0, 1) * (table.length - 1);
    const index = Math.min(table.length - 2, Math.floor(position));
    return THREE.MathUtils.lerp(table[index], table[index + 1], position - index);
}

export function coverArea(cover) {
    const value = Math.clamp(cover, 0, 1);
    for (let i = 1; i < AREA_CURVE.length; i++) {
        const [x1, y1] = AREA_CURVE[i];
        if (value > x1) continue;
        const [x0, y0] = AREA_CURVE[i - 1];
        return THREE.MathUtils.lerp(y0, y1, (value - x0) / (x1 - x0));
    }
    return 1;
}

function filmArea(cover) {
    return 1 - (1 - Math.clamp(cover, 0, 1)) ** 2;
}

function coverThreshold(area) {
    return area > EPSILON ? quantile(COVER_QUANTILES, 1 - area) : 2;
}

export function surfaceGrowth(surface) {
    const cover = surface.total;
    const lead = Math.min(1, cover + ROOF_LEAD * Math.min(1, cover * 10));
    const area = coverArea(cover);
    const leadArea = coverArea(lead);
    const fullness = (value) => THREE.MathUtils.smoothstep(value, 0.3, 0.5);
    const holes = HOLE_AREA * surface.snow * THREE.MathUtils.smoothstep(surface.wet, 0, 0.67) * Math.min(1, cover * 3);
    const puddles = PUDDLE_AREA * THREE.MathUtils.smoothstep(surface.wet, 0.35, 1);
    return {
        growth: [coverThreshold(area * surface.area), fullness(cover), coverThreshold(Math.min(leadArea * surface.area, surface.style?.[3] ?? 1)), fullness(lead)],
        amount: [filmArea(cover), filmArea(lead), holes > EPSILON ? quantile(HOLE_QUANTILES, 1 - holes) + HOLE_ONSET * (1 - THREE.MathUtils.smoothstep(holes, 0, 0.02)) : 2, puddles > EPSILON ? quantile(PUDDLE_QUANTILES, 1 - puddles) : 2],
    };
}

const tmpColor = new THREE.Color();

export function describeSurface(amounts, enabled = true) {
    const kind = SURFACE_KINDS[amounts.kind] ?? SURFACE_KINDS.snow;
    const old = amounts.previous ? SURFACE_KINDS[amounts.previous.kind] ?? kind : kind;
    const prevCover = amounts.previous?.cover ?? 0;
    const total = Math.min(1, amounts.cover + prevCover);
    const weight = total > EPSILON ? amounts.cover / (amounts.cover + prevCover) : 1;
    const color = new THREE.Color().fromArray(old.color).lerp(tmpColor.fromArray(kind.color), weight);
    const mix = (key) => THREE.MathUtils.lerp(old[key], kind[key], weight);
    const mixAll = (key) => old[key].map((value, index) => THREE.MathUtils.lerp(value, kind[key][index], weight));
    const snowy = (id) => (id === "snow" || id === "hail" ? 1 : 0);
    return {
        enabled,
        kind: amounts.kind,
        cover: amounts.cover,
        previous: amounts.previous,
        total,
        wet: amounts.wet,
        melting: !!amounts.melting,
        color,
        roughness: mix("roughness"),
        sparkle: mix("sparkle"),
        lumps: mix("lumps"),
        area: mix("area"),
        shape: mixAll("shape"),
        detail: mixAll("detail"),
        style: mixAll("style"),
        snow: THREE.MathUtils.lerp(snowy(amounts.previous?.kind ?? amounts.kind), snowy(amounts.kind), weight),
    };
}

const equilibriumCache = { key: null, target: null };

function equilibrium(scene) {
    const key = JSON.stringify([scene.id, scene.weather, scene.flags?.[MODULE_ID]?.weather ?? null]);
    if (equilibriumCache.key !== key) {
        equilibriumCache.key = key;
        equilibriumCache.target = sceneTarget(scene);
    }
    return equilibriumCache.target;
}

export function surfaceAmounts(scene = canvas.scene, time = game.time.serverTime) {
    const settings = surfaceSettings(scene);
    if (settings.ramp) return evaluateRamp(settings.ramp, time);
    const target = equilibrium(scene);
    return { kind: target.kind ?? settings.start.kind, cover: target.cover, previous: null, wet: target.wet, melting: false };
}

export function getSurface(scene = canvas.scene, time = game.time.serverTime) {
    if (!scene) return null;
    return describeSurface(surfaceAmounts(scene, time), surfaceSettings(scene).enabled);
}

export function setSurface({ cover, wet, kind, enabled, buildTime, meltTime } = {}, scene = canvas.scene) {
    if (!game.user.isGM || !scene) return null;
    const update = {};
    if (enabled !== undefined) update.enabled = !!enabled;
    if (buildTime !== undefined) update.buildTime = Math.max(Number(buildTime) || SURFACE_DEFAULTS.buildTime, 0.05);
    if (meltTime !== undefined) update.meltTime = Math.max(Number(meltTime) || SURFACE_DEFAULTS.meltTime, 0.05);
    const reset = cover !== undefined || wet !== undefined || kind !== undefined;
    if (reset) {
        const current = getSurface(scene);
        update.start = {
            kind: kind && SURFACE_KINDS[kind] ? kind : current.kind ?? SURFACE_DEFAULTS.start.kind,
            cover: Math.clamp(Number(cover ?? current.total) || 0, 0, 1),
            wet: Math.clamp(Number(wet ?? current.wet) || 0, 0, 1),
        };
    }
    return scene.update({ flags: { [MODULE_ID]: { [SURFACE_FLAG]: update } } }, { l3dSurfaceReset: reset });
}

export function surfaceMacroData(scene = canvas.scene) {
    const { enabled, buildTime, meltTime } = surfaceSettings(scene);
    return { enabled, buildTime, meltTime };
}

function weatherChanged(changes) {
    if ("weather" in changes || "environment" in changes) return true;
    return Object.keys(changes.flags?.[MODULE_ID] ?? {}).some((key) => (key.includes("weather") && !key.includes(SURFACE_FLAG)) || key.includes("particle"));
}

function previewScene(scene, changes) {
    const source = { flags: scene._source.flags, weather: scene._source.weather, environment: scene._source.environment };
    const next = foundry.utils.mergeObject(foundry.utils.deepClone(source), { flags: changes.flags ?? {}, ...("weather" in changes ? { weather: changes.weather } : {}) }, { inplace: false, applyOperators: true });
    return { id: scene.id, flags: next.flags ?? {}, weather: next.weather };
}

function sameStart(a, b) {
    return a.kind === b.kind && Number(a.cover) === Number(b.cover) && Number(a.wet) === Number(b.wet);
}

function sameTarget(ramp, target) {
    return ramp.source === targetKey(target);
}

function targetKey(target) {
    return [target.kind, target.cover, target.wet, target.build, target.melt].join("|");
}

function onPreUpdateScene(scene, changes, options) {
    if (!game.user.isGM) return;
    const surfaceChange = changes.flags?.[MODULE_ID]?.[SURFACE_FLAG];
    const weather = weatherChanged(changes);
    if (!weather && !surfaceChange && !options.l3dSurfaceReset) return;
    if (surfaceChange && "ramp" in surfaceChange) return;
    const next = previewScene(scene, changes);
    const before = surfaceSettings(scene);
    const after = surfaceSettings(next);
    const reset = !!options.l3dSurfaceReset || !sameStart(before.start, after.start);
    const timing = before.buildTime !== after.buildTime || before.meltTime !== after.meltTime;
    const target = sceneTarget(next);
    if (!reset && !timing && (!weather || (before.ramp && sameTarget(before.ramp, target)))) return;
    const time = game.time.serverTime;
    const fresh = !!before.ramp?.reset && Math.abs(time - before.ramp.time) < RESET_GRACE;
    const current = reset || fresh ? startState(after.start) : surfaceAmounts(scene, time);
    const ramp = createRamp(current, target, after, time);
    if (reset || fresh) ramp.reset = true;
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${SURFACE_FLAG}.ramp`, ramp);
}

Hooks.on("preUpdateScene", onPreUpdateScene);
