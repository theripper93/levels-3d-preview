const MODULE_ID = "levels-3d-preview";
const MAT = "modules/canvas3dcompendium/assets/Materials/";
const TILES = "modules/canvas3dcompendium/assets/Tiles/";
const VK = `${TILES}Medieval Village MegaKit/`;
const mat = (folder, name, s, tint, maps) => ({ src: `${MAT}${folder}/${name}/${name.replace(/ /g, "_")}_NormalGL.webp`, s, ...(tint ? { tint } : {}), ...(maps ? { maps } : {}) });
const acg = (name, s, tint, maps) => ({ src: `${MAT}${name}/${name}_NormalGL.webp`, s, ...(tint ? { tint } : {}), ...(maps ? { maps } : {}) });
const SOFT = ["Color", "Roughness"];
const FULL = ["Color", "Roughness", "AmbientOcclusion", "NormalGL"];
const NO_AO = ["Color", "Roughness", "NormalGL"];
const NO_ROUGH = ["Color", "AmbientOcclusion", "NormalGL"];

export const DOORS = {
    cottage: { name: "Cottage Door", leaf: `${VK}Door_1_Round.glb`, frame: `${VK}DoorFrame_Round_WoodDark.glb`, shape: "arch", hinge: -0.5 },
    cottageFlat: { name: "Glazed Door", leaf: `${VK}Door_1_Flat.glb`, frame: `${VK}DoorFrame_Flat_WoodDark.glb`, shape: "rect", hinge: -0.5 },
    plank: { name: "Plank Door", leaf: `${VK}Door_2_Round.glb`, frame: `${VK}DoorFrame_Round_WoodDark.glb`, shape: "arch", hinge: -0.5 },
    plankFlat: { name: "Plank Door (Square)", leaf: `${VK}Door_2_Flat.glb`, frame: `${VK}DoorFrame_Flat_WoodDark.glb`, shape: "rect", hinge: -0.5 },
    reinforced: { name: "Reinforced Door", leaf: `${VK}Door_4_Round.glb`, frame: `${VK}DoorFrame_Round_Brick.glb`, shape: "arch", hinge: -0.5 },
    reinforcedFlat: { name: "Reinforced Door (Square)", leaf: `${VK}Door_4_Flat.glb`, frame: `${VK}DoorFrame_Flat_Brick.glb`, shape: "rect", hinge: -0.5 },
    heavy: { name: "Heavy Door", leaf: `${VK}Door_8_Round.glb`, frame: `${VK}DoorFrame_Round_Brick.glb`, shape: "arch", hinge: -0.5 },
    heavyFlat: { name: "Heavy Door (Square)", leaf: `${VK}Door_8_Flat.glb`, frame: `${VK}DoorFrame_Flat_Brick.glb`, shape: "rect", hinge: -0.5 },
};

export const WINDOWS = {
    wideRound: { name: "Arched Window", glass: `${VK}Window_Wide_Round1.glb`, shutters: `${VK}WindowShutters_Wide_Round_Open.glb`, shape: "arch" },
    wideFlat: { name: "Wide Window", glass: `${VK}Window_Wide_Flat1.glb`, shutters: `${VK}WindowShutters_Wide_Flat_Open.glb`, shape: "rect" },
    thinRound: { name: "Narrow Window", glass: `${VK}Window_Thin_Round1.glb`, shutters: `${VK}WindowShutters_Thin_Round_Open.glb`, shape: "arch" },
    thinFlat: { name: "Narrow Square Window", glass: `${VK}Window_Thin_Flat1.glb`, shutters: `${VK}WindowShutters_Thin_Flat_Open.glb`, shape: "rect" },
    bars: { name: "Barred Window", glass: `${TILES}Modular Ruins/Window_Bars.glb`, shape: "rect", fit: { w: 0.6, y0: 0.6, y1: 1.4 } },
    open: { name: "Open Window", glass: null, shape: "arch", fit: { w: 0.55, y0: 0.6, y1: 1.4 } },
    port: { name: "Viewport", glass: null, shape: "rect", fit: { w: 0.7, y0: 0.7, y1: 1.3 } },
    drain: { name: "Drain Outlet", glass: null, shape: "round", fit: { w: 0.45, y0: 0.08, y1: 0.48, f: 0.08 }, recess: true, bars: 4 },
    drainArch: { name: "Drain Arch", glass: null, shape: "arch", fit: { w: 0.8, y0: 0.02, y1: 0.9, f: 0.09 }, recess: true, bars: 0 },
    porthole: { name: "Barred Porthole", glass: null, shape: "round", fit: { w: 0.3, y0: 1.08, y1: 1.38, f: 0.06 }, recess: true, bars: 3 },
};

const KIT_DOORS = {
    "dungeon:cell": { leaf: `${TILES}Dungeon Crawler Kit/door_iron_bars.glb`, frame: null, shape: "rect", hinge: -0.5, z: 0, kit: "dungeon" },
    "scifi:bulkhead": { leaf: `${TILES}SciFi MegaKit/Platforms/Door_Metal.glb`, frame: null, shape: "rect", style: 2, double: true, slide: 78, clip: { x: 2.43 }, z: 0, kit: "scifi" },
};

const KIT_WINDOWS = {
    "scifi:viewport": { glass: null, shape: "rect", fit: { w: 0.86, y0: 0.61, y1: 1.205 }, kit: "scifi" },
};

export const BUILTIN_WALL_STYLES = {
    adobe: {
        wallOut: mat("_Quaternius", "VillagePlaster", 250, "#ffc58c", SOFT),
        wallIn: mat("_Quaternius", "VillagePlaster", 250, "#ffdcb4", SOFT),
        cap: mat("_Quaternius", "VillagePlaster", 250, "#eaa96a", SOFT),
        door: "heavy",
        window: "open",
        wallHeight: 1.6,
        thickness: 0.35,
    },
    sewer: {
        wallOut: { ...mat("_Quaternius", "VillageBrick", 120, "#8a9470", NO_AO), grade: { h: 15, s: 0.4, b: 0.75, c: 1.2, g: 0.5 } },
        wallIn: { ...mat("_Quaternius", "VillageBrick", 120, "#8a9470", NO_AO), grade: { h: 15, s: 0.4, b: 0.75, c: 1.2, g: 0.5 } },
        cap: { ...mat("_Stylized2", "Stones_02", 90, "#aeb38c", FULL), grade: { h: 20, s: 0.5, b: 0.9 } },
        band: { ...mat("_Stylized", "Rock Wall 02", 110, "#9aa27a", FULL), grade: { h: 10, s: 0.55, b: 0.7, c: 1.1, g: 0.6 } },
        bandHeight: 0.5,
        door: "dungeon:cell",
        window: "drain",
        wallHeight: 1.6,
        thickness: 0.4,
    },
    pumpStation: {
        wallOut: { ...mat("_Quaternius", "VillageBrick", 120, "#9c8a78", NO_AO), grade: { h: -5, s: 0.4, b: 0.7, c: 1.2, g: 0.6 } },
        wallIn: { ...mat("_Quaternius", "VillageBrick", 120, "#9c8a78", NO_AO), grade: { h: -5, s: 0.4, b: 0.7, c: 1.2, g: 0.6 } },
        cap: { ...mat("_Stylized2", "Stones_02", 90, "#a89580", FULL), grade: { s: 0.5, b: 0.85 } },
        band: { ...mat("_Stylized", "Rock Wall 03", 110, "#b8a48c", FULL), grade: { h: -5, s: 0.45, b: 0.8, c: 1.1, g: 0.6 } },
        bandHeight: 0.55,
        door: "reinforced",
        window: "porthole",
        wallHeight: 1.7,
        thickness: 0.4,
    },
    castleKeep: {
        wallOut: mat("_Stylized", "Floor Tile 03", 400, "#d8d8d8", NO_ROUGH),
        wallIn: mat("_Stylized", "Floor Tile 03", 400, "#c8c2b8", NO_ROUGH),
        cap: mat("_Stylized", "Floor Tile 03", 400, null, NO_ROUGH),
        door: "reinforced",
        window: "thinRound",
        wallHeight: 1.6,
        thickness: 0.45,
    },
    marbleHall: {
        wallOut: acg("Marble014", 350, null, NO_AO),
        wallIn: acg("Marble014", 300, null, NO_AO),
        cap: acg("Marble011", 150, null, NO_AO),
        door: "cottageFlat",
        window: "wideRound",
        wallHeight: 1.6,
        thickness: 0.3,
    },
    dwarvenHold: {
        wallOut: mat("_Stylized", "Rock Wall 03", 300, "#d0b8a0", FULL),
        wallIn: mat("_Stylized", "Rock Wall 03", 300, "#d8c4ac", FULL),
        cap: mat("_Stylized", "Rock Wall 03", 300, "#a89480", FULL),
        door: "heavy",
        window: "bars",
        wallHeight: 1.6,
        thickness: 0.5,
    },
    desertTomb: {
        wallOut: acg("Bricks019", 420, "#ffcf94", FULL),
        wallIn: acg("Bricks019", 420, "#ffdcae", FULL),
        cap: acg("Bricks019", 420, "#e8bc84", FULL),
        door: "heavyFlat",
        window: "bars",
        wallHeight: 1.6,
        thickness: 0.5,
    },
    icePalace: {
        wallOut: mat("_Stylized2", "Ice_05", 350, "#e0ecf4", FULL),
        wallIn: mat("_Stylized2", "Ice_05", 350, "#e8f0f8", FULL),
        cap: mat("_Stylized2", "Snow_01", 200, null, FULL),
        door: "reinforcedFlat",
        window: "open",
        wallHeight: 1.6,
        thickness: 0.5,
    },
    researchLab: {
        wallOut: acg("Plastic010", 150, null, NO_AO),
        wallIn: acg("Tiles107", 150, null, FULL),
        cap: acg("Plastic010", 150, null, NO_AO),
        door: "scifi:bulkhead",
        window: "scifi:viewport",
        wallHeight: 1.6,
        thickness: 0.25,
    },
};

export const DEFAULT_WALL_STYLE = "castleKeep";
export const WALL_STYLE_NONE = "none";
export const WALL_STYLE_CLASSIC = "classic";

const registry = new Map();

export function resolveDoor(door) {
    if (door && typeof door === "object") return door.leaf ? door : null;
    return DOORS[door] ?? KIT_DOORS[door] ?? null;
}

export function resolveWindow(win) {
    if (win && typeof win === "object") return win.glass || win.fit ? win : null;
    return WINDOWS[win] ?? KIT_WINDOWS[win] ?? null;
}

const validMat = (m) => (m?.src ? m : null);

function normalizeStyle(id, style) {
    const wallOut = validMat(style.wallOut);
    if (!wallOut) return null;
    const wallIn = validMat(style.wallIn) ?? wallOut;
    const band = validMat(style.band);
    return {
        id,
        label: style.label ?? `levels3dpreview.wallStyles.${id}`,
        wallOut,
        wallIn,
        cap: validMat(style.cap) ?? wallOut,
        ...(band ? { band, bandHeight: Number(style.bandHeight) > 0 ? Number(style.bandHeight) : 1 } : {}),
        door: resolveDoor(style.door) ?? DOORS.plank,
        window: resolveWindow(style.window) ?? WINDOWS.wideRound,
        thickness: Number(style.thickness) > 0 ? Number(style.thickness) : 0.2,
        wallHeight: Number(style.wallHeight) > 0 ? Number(style.wallHeight) : 2.5,
        source: style.source ?? MODULE_ID,
    };
}

export function registerWallStyle(id, style) {
    if (id === WALL_STYLE_NONE || id === WALL_STYLE_CLASSIC) return false;
    const normalized = id && style ? normalizeStyle(id, style) : null;
    if (!normalized) return false;
    const previous = registry.get(id);
    registry.set(id, normalized);
    if (previous && JSON.stringify(previous) === JSON.stringify(normalized)) return true;
    Hooks.callAll("3DCanvasWallStylesChanged", id);
    return true;
}

export function unregisterWallStyle(id) {
    if (!registry.delete(id)) return false;
    Hooks.callAll("3DCanvasWallStylesChanged", id);
    return true;
}

export function getWallStyle(id) {
    return id ? registry.get(id) ?? null : null;
}

export function wallStyleChoices() {
    const label = (s) => (game.i18n.has(s.label) ? game.i18n.localize(s.label) : s.label);
    const themes = [...registry.values()].map((s) => [s.id, label(s)]).sort((a, b) => a[1].localeCompare(b[1]));
    return Object.fromEntries([[WALL_STYLE_NONE, game.i18n.localize("levels3dpreview.wallStyles.none")], [WALL_STYLE_CLASSIC, game.i18n.localize("levels3dpreview.wallStyles.classic")], ...themes]);
}

for (const [id, style] of Object.entries(BUILTIN_WALL_STYLES)) registry.set(id, normalizeStyle(id, style));

export const WALL_STYLES_API = {
    BUILTIN: BUILTIN_WALL_STYLES,
    DOORS,
    WINDOWS,
    register: registerWallStyle,
    unregister: unregisterWallStyle,
    get: getWallStyle,
    choices: wallStyleChoices,
    resolveDoor,
    resolveWindow,
};

Hooks.once("init", () => {
    const module = game.modules.get(MODULE_ID);
    module.api = { ...(module.api ?? {}), wallStyles: WALL_STYLES_API };
});
