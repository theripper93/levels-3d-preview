import { DAMAGE_THEMES, KEYWORD_THEMES, themeFromDamage, themeFromKeywords } from "../vfx/region/themes.js";

export default function initTemplateEffects() {
    Hooks.callAll("3DCanvasTemplateEffectsInit", { damage: DAMAGE_THEMES, keywords: KEYWORD_THEMES }, handlers);
    Hooks.on("preCreateRegion", (regionDocument) => {
        if (!game.Levels3DPreview?._active || !game.settings.get("levels-3d-preview", "templateEffects")) return;
        if (regionDocument.getFlag("levels-3d-preview", "regionFx")?.theme || regionDocument.getFlag("levels-3d-preview", "shaders")) return;
        const theme = systemTheme(regionDocument);
        if (theme) regionDocument.updateSource({ flags: { "levels-3d-preview": { regionFx: { theme } } } });
    });
}

function systemTheme(regionDocument) {
    try {
        return handlers[game.system.id]?.(regionDocument) ?? null;
    } catch (e) {
        return null;
    }
}

export function autoTheme(regionDocument) {
    if (!game.settings.get("levels-3d-preview", "templateEffects")) return null;
    return systemTheme(regionDocument) ?? themeFromKeywords(regionDocument.name);
}

export function applyShaderToRegion(regionDocument) {
    const theme = systemTheme(regionDocument);
    if (theme) return regionDocument.updateSource({ flags: { "levels-3d-preview": { regionFx: { theme } } } });
}

const handlers = {
    dnd5e: (regionDocument) => {
        const flags = regionDocument.flags?.dnd5e ?? {};
        const activity = fromUuidSync(flags.activity ?? flags.origin);
        if (!activity) return null;
        const keyword = themeFromKeywords(activity.item?.name) ?? themeFromKeywords(activity.name);
        if (keyword) return keyword;
        const damageTypes = (activity.damage?.parts ?? []).flatMap((part) => Array.from(part.types ?? []));
        const healingTypes = Array.from(activity.healing?.types ?? []);
        return themeFromDamage([...damageTypes, ...healingTypes]) ?? (activity.type === "heal" ? "healing" : activity.item?.type === "spell" ? "arcane" : null);
    },
    pf2e: (regionDocument) => {
        const origin = regionDocument.flags?.pf2e?.origin;
        if (!origin) return null;
        return themeFromKeywords(origin.name) ?? themeFromDamage(origin.traits) ?? "arcane";
    },
};

export function isLockedOnOrigin(item) {
    const system = game.system.id;
    if (system === "dnd5e") {
        const isLocked = !item.system?.range?.value;
        const token = item.parent.getActiveTokens()[0] ?? _token;
        return isLocked ? token : false;
    }
    return false;
}
