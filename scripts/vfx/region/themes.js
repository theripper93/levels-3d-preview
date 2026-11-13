export const STYLES = { plain: 0, flame: 1, frost: 2, acid: 3, lightning: 4, ripple: 5, miasma: 6, radiant: 7, arcane: 8, web: 9, vines: 10, wind: 11, water: 12, physical: 13, hex: 14 };

const glow = { glow: 0.8, fill: 0.7, edge: 0.012, scale: 14, speed: 1, rim: 0.8, lit: false };
const matter = { glow: 0, fill: 0.6, edge: 0.008, scale: 14, speed: 1, rim: 0.45, lit: true };

export const THEMES = {
    plain: { ...matter, style: "plain", colors: null, fill: 0.35, rim: 0.5, glow: 0.3, lit: false },
    fire: { ...glow, directional: "directionalfire", style: "flame", colors: ["#ffa040", "#c42000"], fill: 0.45, particles: { flame: true, rate: 30, life: [0.6, 1.1], size: [0.08, 0.16], ground: true, rise: 0.12, blend: "add", colors: ["#ff9a3a", "#ff2a00"] } },
    cold: { ...glow, directional: "directionalfrost", style: "frost", colors: ["#d6f6ff", "#1f78e0"], fill: 0.45, speed: 0.4, particles: { sprite: "star", rate: 14, life: [1.2, 2], size: [0.008, 0.018], rise: 0.02, blend: "add", colors: ["#ffffff", "#8fd3ff"] } },
    acid: { ...glow, directional: "directionalpoison", style: "acid", colors: ["#d4ff3a", "#2f9a00"], fill: 0.75, particles: { sprite: "circle_02", ground: true, rate: 12, life: [0.8, 1.4], size: [0.006, 0.016], rise: 0.05, blend: "add", colors: ["#d4ff3a", "#4fc400"] } },
    lightning: { ...glow, directional: "directionalshock", style: "lightning", colors: ["#cfe0ff", "#1f3fd1"], fill: 0.55, speed: 1.4, particles: { sprite: "spark_bolt", rate: 10, life: [0.08, 0.2], size: [0.03, 0.06], rise: 0, blend: "add", colors: ["#ffffff", "#7aa8ff"] } },
    thunder: { ...glow, directional: "directionalwave", style: "ripple", colors: ["#e3fff6", "#2fb8a8"], fill: 0.6, speed: 1.2, particles: { sprite: "dust", rate: 10, life: [0.6, 1.2], size: [0.02, 0.05], rise: 0.04, blend: "normal", colors: ["#d8e6e0", "#8aa59c"] } },
    poison: { ...matter, directional: "directionalpoison", style: "miasma", colors: ["#a8ff6a", "#2b6b14"], fill: 0.65, speed: 0.6, particles: { sprite: "smoke", ground: true, rate: 6, life: [1.5, 2.5], size: [0.12, 0.22], rise: 0.03, blend: "normal", colors: ["#7fd14a", "#2b6b14"] } },
    necrotic: { ...matter, style: "miasma", colors: ["#b890ff", "#1a0d24"], fill: 0.7, speed: 0.5, lit: false, particles: { sprite: "smoke", ground: true, rate: 5, life: [1.5, 2.5], size: [0.12, 0.22], rise: 0.04, blend: "normal", colors: ["#4b2d6b", "#120818"] } },
    radiant: { ...glow, style: "radiant", colors: ["#ffe58a", "#d98a00"], fill: 0.6, speed: 0.6, particles: { sprite: "light_01", rate: 14, life: [1, 1.8], size: [0.01, 0.025], rise: 0.12, blend: "add", colors: ["#ffffff", "#ffd36b"] } },
    force: { ...glow, directional: "directionalwave", style: "hex", colors: ["#c9b8ff", "#5a3cff"], fill: 0.55, speed: 0.6, particles: null },
    psychic: { ...glow, style: "ripple", colors: ["#ffb8ff", "#9a2bd6"], fill: 0.6, speed: 0.7, particles: { sprite: "twirl", rate: 8, life: [1, 1.6], size: [0.02, 0.04], rise: 0.06, blend: "add", colors: ["#ffb8ff", "#9a2bd6"] } },
    healing: { ...glow, style: "radiant", colors: ["#c8ffb0", "#1fa84a"], fill: 0.55, speed: 0.5, particles: { sprite: "light_01", rate: 14, life: [1, 1.8], size: [0.01, 0.025], rise: 0.1, blend: "add", colors: ["#ffffff", "#7dff9a"] } },
    physical: { ...matter, style: "physical", colors: ["#e8dfcf", "#6d6253"], fill: 0.5, particles: { sprite: "dirt", ground: true, rate: 6, life: [0.5, 1], size: [0.01, 0.02], rise: 0.05, blend: "normal", colors: ["#a8987c", "#5b4f3e"] } },
    fog: { ...matter, style: "miasma", colors: ["#eef2f4", "#a3adb3"], fill: 0.25, speed: 0.3, rim: 0, fog: { density: 9, height: 0.25 }, particles: null },
    darkness: { ...matter, style: "miasma", colors: ["#2a2238", "#000000"], fill: 0.85, speed: 0.3, rim: 0, lit: false, fog: { density: 30, height: 0.3 }, particles: null },
    smoke: { ...matter, style: "miasma", colors: ["#9a9a9a", "#363636"], fill: 0.55, speed: 0.5, rim: 0, fog: { density: 14, height: 0.25 }, particles: { sprite: "smoke", ground: true, rate: 5, life: [2, 3], size: [0.14, 0.26], rise: 0.04, blend: "normal", colors: ["#8a8a8a", "#3a3a3a"] } },
    water: { ...glow, style: "water", colors: ["#c8f6ff", "#1e6fb0"], fill: 0.65, speed: 0.6, particles: { sprite: "circle_02", ground: true, rate: 8, life: [0.6, 1], size: [0.005, 0.012], rise: 0.08, blend: "add", colors: ["#e6fbff", "#6cc4ff"] } },
    web: { ...matter, style: "web", colors: ["#f4f4f4", "#8c8c8c"], fill: 0.75, speed: 0, particles: null },
    vines: { ...matter, style: "vines", colors: ["#86d84f", "#1f4d14"], fill: 0.8, speed: 0.2, particles: { sprite: "dirt", ground: true, rate: 4, life: [0.8, 1.4], size: [0.01, 0.02], rise: 0.03, blend: "normal", colors: ["#5f9a36", "#2c4d1a"] } },
    wind: { ...glow, directional: "directionalwave", style: "wind", colors: ["#eef8ff", "#8fb7c9"], fill: 0.45, speed: 1.5, particles: { sprite: "dust", rate: 14, life: [0.6, 1], size: [0.02, 0.04], rise: 0.01, blend: "normal", colors: ["#e6eef2", "#9fb2bc"], drift: 0.4 } },
    arcane: { ...glow, style: "arcane", colors: ["#a6dcff", "#3a5cff"], fill: 0.6, speed: 0.5, particles: { sprite: "star", rate: 10, life: [1, 1.8], size: [0.01, 0.02], rise: 0.08, blend: "add", colors: ["#ffffff", "#7fb8ff"] } },
};

export const DAMAGE_THEMES = {
    acid: "acid",
    cold: "cold",
    fire: "fire",
    force: "force",
    lightning: "lightning",
    electricity: "lightning",
    necrotic: "necrotic",
    void: "necrotic",
    poison: "poison",
    psychic: "psychic",
    mental: "psychic",
    radiant: "radiant",
    vitality: "radiant",
    holy: "radiant",
    thunder: "thunder",
    sonic: "thunder",
    healing: "healing",
    temphp: "healing",
    bludgeoning: "physical",
    piercing: "physical",
    slashing: "physical",
    bleed: "physical",
    spirit: "arcane",
    unholy: "necrotic",
    water: "water",
    air: "wind",
    earth: "physical",
    plant: "vines",
    darkness: "darkness",
    light: "radiant",
};

export const KEYWORD_THEMES = [
    [/\bfog\b|\bmist/, "fog"],
    [/darkness|hunger of hadar|shadow|blackness|tentacle/, "darkness"],
    [/smoke|pyrotechnic|obscur|\bash\b/, "smoke"],
    [/\bwebs?\b/, "web"],
    [/entangl|vine|thorn|spike growth|plant growth|grasping|bramble|briar/, "vines"],
    [/stinking|cloudkill|poison|toxic|miasma/, "poison"],
    [/sleet|ice storm|freez|frost|blizzard|snow/, "cold"],
    [/wind|gust|whirlwind|tornado|cyclone/, "wind"],
    [/water|tide|tsunami|grease|tidal|flood/, "water"],
    [/spirit guardian|moonbeam|daylight|dawn|sunbeam|sunburst|sacred|bless/, "radiant"],
    [/heal|cure|vitality|prayer|restor/, "healing"],
    [/hypnotic|confusion|psychic|mind/, "psychic"],
    [/silence|wall of force|forcecage|resilient/, "force"],
    [/faerie fire|arcane|magic circle|glyph|antimagic|teleport|portal/, "arcane"],
];

export function themeFromKeywords(name) {
    const text = String(name ?? "").toLowerCase();
    return KEYWORD_THEMES.find(([regex]) => regex.test(text))?.[1] ?? null;
}

export function themeFromDamage(types) {
    for (const type of types ?? []) {
        const theme = DAMAGE_THEMES[type];
        if (theme) return theme;
    }
    return null;
}
