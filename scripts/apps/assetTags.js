const TAGS_FILE = "modules/canvas3dcompendium/assets/Tiles/tags.json";
const TILES = "/assets/Tiles/";
const BILLBOARD_FOLDER = "Vegetation_billboard";

export const ASSET_STYLES = ["fantasy", "toy", "scifi", "modern", "nature", "other"];

export const ASSET_CATEGORIES = [
    { id: "all", icon: "fa-grid-2" },
    { id: "recent", icon: "fa-clock" },
    { id: "favorites", icon: "fa-star" },
    { id: "buildings", icon: "fa-chess-rook" },
    { id: "furniture", icon: "fa-chair" },
    { id: "storage", icon: "fa-box-open" },
    { id: "lighting", icon: "fa-lightbulb" },
    { id: "tableware", icon: "fa-utensils" },
    { id: "items", icon: "fa-sword" },
    { id: "decor", icon: "fa-jug" },
    { id: "dungeon", icon: "fa-skull" },
    { id: "trees", icon: "fa-tree" },
    { id: "rocks", icon: "fa-mountain" },
    { id: "creatures", icon: "fa-paw" },
    { id: "vehicles", icon: "fa-ship" },
    { id: "billboards", icon: "fa-image" },
];

const THEME_GROUP_STYLES = { village: ["fantasy", "nature"], dungeon: ["fantasy"], caves: ["fantasy", "nature"], scifi: ["scifi"], modern: ["modern"] };

const VARIANT_SUFFIXES = [/[ _-]?worn$/i, /[ _-]?\(\d+\)$/, /(?<=[a-z])\d+$/i, /[ _-](team ?)?(blue|red|green|yellow|white|brown|grey|gray|tan)$/i, /[ _-](common|uncommon|rare|mimic|empty|filled|damaged|broken|lit|open|closed)$/i, /(?<=[a-z])[A-F]$/, /(?<=\d)[A-Z]$/, /[ _-]+$/];
const SEPARATED_NUMBER = /[ _-]\d+$/;

export function nameWords(name) {
    return name
        .replace(/\.(glb|gltf|webp)$/i, "")
        .replaceAll("%20", " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([A-Za-z])(\d)/g, "$1 $2")
        .replace(/[_\-.()]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function variantBase(name) {
    let base = name;
    let numbered = false;
    for (let pass = 0; pass < 6; pass++) {
        const before = base;
        for (const rx of VARIANT_SUFFIXES) {
            const next = base.replace(rx, "");
            if (next.length >= 2) base = next;
        }
        if (!numbered && SEPARATED_NUMBER.test(base)) {
            base = base.replace(SEPARATED_NUMBER, "");
            numbered = true;
        }
        if (base === before) break;
    }
    return base;
}

let tagData = null;

export async function loadTags() {
    if (tagData) return tagData;
    tagData = { assets: {}, rules: [], kits: {} };
    if (!game.modules.get("canvas3dcompendium")?.active) return tagData;
    try {
        const data = await foundry.utils.fetchJsonWithTimeout(TAGS_FILE);
        const kitRule = data.rules?.find(([c]) => c === "@kit")?.[1];
        tagData = {
            assets: data.assets ?? {},
            kits: data.kits ?? {},
            rules: (data.rules ?? []).map(([category, pattern]) => [category, new RegExp(pattern)]),
            kitRule: kitRule ? new RegExp(kitRule) : null,
        };
    } catch (e) {
        console.warn("3D Canvas | Asset browser tags could not be loaded", e);
    }
    return tagData;
}

function guessCategory(name) {
    const words = nameWords(name);
    for (const [category, rx] of tagData.rules) {
        if (!rx.test(words)) continue;
        return category === "@kit" ? { category: "buildings", piece: true } : { category, piece: false };
    }
    return { category: "decor", piece: false };
}

function kitLabelFor(rel, folder) {
    let best = "";
    for (const prefix of Object.keys(tagData.kits)) if ((rel === prefix || rel.startsWith(prefix + "/")) && prefix.length > best.length) best = prefix;
    return best ? tagData.kits[best] : folder.replaceAll("_", " ");
}

export function tagMaterial(material, packTags) {
    const file = material.output;
    const decoded = decodeURI(file);
    const name = decoded.split("/").pop();
    if (file.includes(BILLBOARD_FOLDER)) return Object.assign(material, { style: material.style ?? "nature", category: material.category ?? "billboards", piece: false, kit: "" });
    const rel = decoded.includes(TILES) ? decoded.split(TILES).pop() : null;
    const tag = rel ? tagData.assets[rel] : null;
    const pack = packTags.find((p) => file.startsWith(p.path) || decoded.startsWith(p.path));
    const folder = material.folder ?? "";
    let style = material.style ?? tag?.[0] ?? pack?.style ?? "other";
    let category = material.category ?? tag?.[1] ?? pack?.category;
    let piece = tag ? !!tag[2] : false;
    if (!category) ({ category, piece } = guessCategory(name));
    else if (!tag && category === "buildings" && tagData.kitRule) piece = tagData.kitRule.test(nameWords(name));
    if (!ASSET_STYLES.includes(style)) style = "other";
    const kit = rel ? kitLabelFor(rel.split("/").slice(0, -1).join("/"), folder) : (pack?.name ?? folder.replaceAll("_", " "));
    return Object.assign(material, { style, category, piece, kit });
}

export function groupMaterials(materials) {
    const groups = new Map();
    for (const material of materials) {
        const fileBase = decodeURI(material.output).split("/").pop().replace(/\.[^.]+$/, "");
        const dir = material.output.split("/").slice(0, -1).join("/");
        const base = variantBase(fileBase);
        const key = `${dir}/${base}|${material.category}`;
        let group = groups.get(key);
        if (!group) {
            group = { key, name: variantBase(material.displayName).trim() || material.displayName, items: [], category: material.category, style: material.style, piece: material.piece, kit: material.kit, search: "", current: 0, random: false };
            groups.set(key, group);
        }
        group.items.push(material);
        group.search += ` ${material.displayName.toLowerCase()} ${material.search.toLowerCase()}`;
    }
    for (const group of groups.values()) group.items.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));
    return groups;
}

export function sceneDefaultStyles(scene) {
    const premium = game.modules.get("canvas3d-premium");
    if (!scene || !premium?.active) return [];
    const bp = scene.tiles.find((t) => t.flags?.["canvas3d-premium"]?.blueprint)?.flags["canvas3d-premium"].blueprint;
    if (!bp) return [];
    const group = premium.api?.catalog?.themes?.[bp.themeId]?.group;
    return THEME_GROUP_STYLES[group] ?? [];
}
