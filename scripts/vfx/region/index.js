import { RegionEffect, hitboxMaterial, resolveRegionFx } from "./regionEffect.js";
import { registerRegionConfig } from "./config.js";

export { RegionEffect, hitboxMaterial, resolveRegionFx };
export { THEMES, STYLES, DAMAGE_THEMES, KEYWORD_THEMES, themeFromDamage, themeFromKeywords } from "./themes.js";
export { buildDistanceField } from "./distanceField.js";

registerRegionConfig();
Hooks.on("3DCanvasSceneReady", () => RegionEffect.warm());
