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
    if (QUALITY_TIERS[tier]) return tier;
    return readSetting("enableEffects", true) ? "medium" : "off";
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

function syncLegacySetting() {
    const enabled = refreshQuality().enabled;
    if (game.settings.get(MODULE_ID, "enableEffects") !== enabled) game.settings.set(MODULE_ID, "enableEffects", enabled);
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
            const wasEnabled = game.settings.get(MODULE_ID, "enableEffects");
            syncLegacySetting();
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

    game.settings.register(MODULE_ID, "enableEffects", {
        scope: "client",
        config: false,
        type: Boolean,
        default: true,
    });

    Hooks.on("clientSettingChanged", (key) => {
        if (key === "core.photosensitiveMode") refreshQuality();
    });

    const storage = game.settings.storage.get("client");
    const migrate = storage.getItem(`${MODULE_ID}.effectsQuality`) === null && game.settings.get(MODULE_ID, "enableEffects") === false;
    if (migrate) game.settings.set(MODULE_ID, "effectsQuality", "off");
    else syncLegacySetting();
}
