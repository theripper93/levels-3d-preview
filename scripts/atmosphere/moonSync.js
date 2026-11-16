const DEFAULT_PHASE_COUNT = 8;

let cachedTime = null;
let cachedMoon = null;
let cachedPhase = null;

export function getSyncedMoonPhase() {
    if (!game.modules.get("simple-timekeeping")?.active) return null;
    const timekeeping = ui.simpleTimekeeping;
    const moon = timekeeping?.moons?.[0];
    if (!moon) return null;
    const time = game.time.worldTime;
    if (time === cachedTime && moon === cachedMoon) return cachedPhase;
    const { index, cycle, override } = timekeeping.getMoonPhase(moon, time);
    cachedTime = time;
    cachedMoon = moon;
    cachedPhase = Number.isFinite(cycle) && !override ? cycle : index / (moon.phaseNames?.length || DEFAULT_PHASE_COUNT);
    return cachedPhase;
}
