const MODULE_ID = "levels-3d-preview";

export const QUALITY_TIERS = {
    off: { enabled: false, particleScale: 0, softParticles: false, distortion: false, decals: false, maxEffectLights: 0 },
    low: { enabled: true, particleScale: 0.5, softParticles: false, distortion: false, decals: false, maxEffectLights: 2 },
    medium: { enabled: true, particleScale: 1, softParticles: true, distortion: false, decals: true, maxEffectLights: 4 },
    high: { enabled: true, particleScale: 1, softParticles: true, distortion: true, decals: true, maxEffectLights: 4 },
    ultra: { enabled: true, particleScale: 1.5, softParticles: true, distortion: true, decals: true, maxEffectLights: 4 },
};

let cached = null;

function readSetting(key, fallback) {
    return game.settings.settings.has(`${MODULE_ID}.${key}`) ? game.settings.get(MODULE_ID, key) : fallback;
}

function readTier() {
    const tier = readSetting("effectsQuality", null);
    if (QUALITY_TIERS[tier]) return tier;
    return readSetting("enableEffects", true) ? "medium" : "off";
}

export function getQuality() {
    if (cached) return cached;
    const tier = readTier();
    cached = { tier, ...QUALITY_TIERS[tier], reduceMotion: !!readSetting("reduceMotion", false) };
    return cached;
}

export function refreshQuality() {
    cached = null;
    return getQuality();
}

function syncLegacySetting() {
    const enabled = refreshQuality().enabled;
    if (game.settings.get(MODULE_ID, "enableEffects") !== enabled) game.settings.set(MODULE_ID, "enableEffects", enabled);
}

export function registerQualitySettings() {
    game.settings.register(MODULE_ID, "effectsQuality", {
        name: "levels3dpreview.vfx.settings.effectsQuality.name",
        hint: "levels3dpreview.vfx.settings.effectsQuality.hint",
        scope: "client",
        config: true,
        type: String,
        choices: Object.fromEntries(Object.keys(QUALITY_TIERS).map((tier) => [tier, `levels3dpreview.vfx.settings.effectsQuality.choices.${tier}`])),
        default: "medium",
        onChange: () => {
            syncLegacySetting();
            game.Levels3DPreview?.UTILS?.debouncedReload();
        },
    });

    game.settings.register(MODULE_ID, "reduceMotion", {
        name: "levels3dpreview.vfx.settings.reduceMotion.name",
        hint: "levels3dpreview.vfx.settings.reduceMotion.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => refreshQuality(),
    });

    game.settings.register(MODULE_ID, "enableEffects", {
        scope: "client",
        config: false,
        type: Boolean,
        default: true,
    });

    const storage = game.settings.storage.get("client");
    const migrate = storage.getItem(`${MODULE_ID}.effectsQuality`) === null && game.settings.get(MODULE_ID, "enableEffects") === false;
    if (migrate) game.settings.set(MODULE_ID, "effectsQuality", "off");
    else syncLegacySetting();
}
