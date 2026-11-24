export const DEFAULT_SKY_STYLE = "realistic";

export const SKY_OPTIONS = ["preset", "time", "tint", "sun", "stars", "moon", "clouds"];

export const STYLE_GROUPS = ["outdoor", "underground"];

const STYLES = new Map();

export function registerSkyStyle(style) {
    if (!style?.id || !style.createDome) return;
    STYLES.set(style.id, {
        order: 100,
        group: "outdoor",
        options: SKY_OPTIONS,
        fields: [],
        timeOfDay: true,
        animated: false,
        label: `levels3dpreview.skyStyles.${style.id}.label`,
        ...style,
    });
}

const context = import.meta.webpackContext("../styles", { recursive: false, regExp: /^\.\/[\w-]+\.js$/ });
for (const key of context.keys()) registerSkyStyle(context(key).default);

export function getSkyStyle(id) {
    return STYLES.get(id) ?? STYLES.get(DEFAULT_SKY_STYLE);
}

export function getSkyStyles() {
    return [...STYLES.values()].sort((a, b) => a.order - b.order);
}

export function isOutdoorSky(sky) {
    return !sky?.setting || sky.setting === "outdoor";
}

export function skyStyleId(sky) {
    return STYLES.get(sky?.style)?.group === "outdoor" ? sky.style : DEFAULT_SKY_STYLE;
}

export function undergroundStyleId(sky) {
    return STYLES.get(sky?.undergroundStyle)?.group === "underground" ? sky.undergroundStyle : "";
}

export function activeStyleId(sky) {
    return isOutdoorSky(sky) ? skyStyleId(sky) : undergroundStyleId(sky) || DEFAULT_SKY_STYLE;
}

export function styleOptions(style, sky) {
    const stored = sky?.styles?.[style.id] ?? {};
    const options = {};
    for (const field of style.fields) {
        const value = stored[field.name];
        options[field.name] = value === undefined || value === null || value === "" ? field.default : value;
    }
    return options;
}

export function styleUsesTime(sky) {
    return getSkyStyle(skyStyleId(sky)).timeOfDay !== false;
}
