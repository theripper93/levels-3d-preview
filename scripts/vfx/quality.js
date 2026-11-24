import { queueGraphicsChange } from "../settings/liveGraphics.js";

const MODULE_ID = "levels-3d-preview";

export const QUALITY_TIERS = {
    off: { enabled: false, particleScale: 0, softParticles: false, distortion: false, decals: false, maxEffectLights: 0, surface: 0 },
    low: { enabled: true, particleScale: 0.5, softParticles: false, distortion: false, decals: false, maxEffectLights: 4, surface: 1 },
    medium: { enabled: true, particleScale: 1, softParticles: true, distortion: false, decals: true, maxEffectLights: 8, surface: 2 },
    high: { enabled: true, particleScale: 1, softParticles: true, distortion: true, decals: true, maxEffectLights: 16, surface: 3 },
    ultra: { enabled: true, particleScale: 1.5, softParticles: true, distortion: true, decals: true, maxEffectLights: 16, surface: 3 },
};

const AO_SAMPLES = { off: 0, low: 6, medium: 10, high: 16 };

let cached = null;

function readSetting(key, fallback) {
    return game.settings.settings.has(`${MODULE_ID}.${key}`) ? game.settings.get(MODULE_ID, key) : fallback;
}

function readTier() {
    const tier = readSetting("effectsQuality", null);
    return QUALITY_TIERS[tier] ? tier : "medium";
}

export function getQuality() {
    if (cached) return cached;
    const tier = readTier();
    cached = { tier, ...QUALITY_TIERS[tier], reduceMotion: photosensitiveMode(), ao: AO_SAMPLES[readSetting("ambientOcclusion", "medium")] ?? 0 };
    return cached;
}

function photosensitiveMode() {
    return game.settings.settings.has("core.photosensitiveMode") ? !!game.settings.get("core", "photosensitiveMode") : false;
}

export function refreshQuality() {
    cached = null;
    return getQuality();
}

export function registerQualitySettings() {
    game.settings.register(MODULE_ID, "effectsQuality", {
        name: "levels3dpreview.vfx.settings.effectsQuality.name",
        hint: "levels3dpreview.vfx.settings.effectsQuality.hint",
        scope: "client",
        config: false,
        type: String,
        choices: Object.fromEntries(Object.keys(QUALITY_TIERS).map((tier) => [tier, `levels3dpreview.vfx.settings.effectsQuality.choices.${tier}`])),
        default: "medium",
        onChange: () => {
            const wasEnabled = getQuality().enabled;
            refreshQuality();
            queueGraphicsChange(wasEnabled === getQuality().enabled ? "effectsQuality" : "effectsToggle");
        },
    });

    game.settings.register(MODULE_ID, "ambientOcclusion", {
        name: "levels3dpreview.settings.ambientOcclusion.name",
        hint: "levels3dpreview.settings.ambientOcclusion.hint",
        scope: "client",
        config: false,
        type: String,
        choices: Object.fromEntries(Object.keys(AO_SAMPLES).map((level) => [level, `levels3dpreview.settings.ambientOcclusion.choices.${level}`])),
        default: "medium",
        onChange: () => {
            refreshQuality();
            queueGraphicsChange("ambientOcclusion");
        },
    });

    Hooks.on("clientSettingChanged", (key) => {
        if (key === "core.photosensitiveMode") refreshQuality();
    });

    const storage = game.settings.storage.get("client");
    const legacyKey = `${MODULE_ID}.enableEffects`;
    const migrate = storage.getItem(`${MODULE_ID}.effectsQuality`) === null && storage.getItem(legacyKey) === "false";
    storage.removeItem(legacyKey);
    if (migrate) storage.setItem(`${MODULE_ID}.effectsQuality`, JSON.stringify("off"));
    refreshQuality();
}
