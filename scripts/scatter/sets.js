import { modernProps, modernFurnish, MODERN_THUMBS } from "./modernSets.js";

const TILES = "modules/canvas3dcompendium/assets/Tiles/";
const SN = `${TILES}Stylized%20Nature%20MegaKit/`;
const BASALT = "#5a463f";
const MINE_ROCK = "#a89886";
const PROPS = `${TILES}Fantasy%20Props%20MegaKit/`;

const seq = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

const asset = (o) => ({ align: 0, wind: 0, blocking: false, aquatic: false, yOffset: 0, ...o });

const group = (names, { weight, ...rest }) =>
    names.map((n) => {
        const [file, yOffset = 0] = Array.isArray(n) ? n : [n];
        return asset({ src: `${SN}${file}.glb`, weight: weight / names.length, yOffset, ...rest });
    });

const HIGHEND = `${TILES}Rocks_highend/`;
const DESERT = `${TILES}Desert%20Pack/`;
const OLD_MINE = `${TILES}Old%20Mine/`;
const pack = (dir, names, { weight, ...rest }) => names.map((n) => asset({ src: `${dir}${n}.glb`, weight: weight / names.length, ...rest }));

const GRASS_SHORT = { scale: [0.25, 0.45], spacing: 0.22, align: 0.7, wind: 1, clumpK: 0.4 };
const GRASS_TALL = { scale: [0.3, 0.5], spacing: 0.28, align: 0.6, wind: 1, clumpK: 0.5 };
const WISPY = { scale: [0.3, 0.55], spacing: 0.3, align: 0.6, wind: 1, clumpK: 0.6 };
const FLOWER = { scale: [0.18, 0.3], spacing: 0.3, align: 0.5, wind: 0.9, clump: 3, clumpK: 0.85 };
const PEBBLE = { scale: [0.5, 1.4], scaleBias: 1.5, spacing: 0.35, align: 1, clump: 3, clumpK: 0.85 };
const ROCK_SMALL = { scale: [0.15, 0.3], spacing: 0.6, align: 1, clump: 4, clumpK: 0.7 };
const ROCK_MID = { scale: [0.3, 0.55], spacing: 1.2, align: 0.9, clump: 5, clumpK: 0.6 };
const BOULDER = { scale: [0.7, 1.2], scaleBias: 1.5, spacing: 2.2, align: 0.7, blocking: true, clump: 5, clumpK: 0.7 };
const CAVE_BOULDER = { scaleBias: 1.5, spacing: 2, align: 0.6, blocking: true, clump: 5, clumpK: 0.7 };
const BUSH = { scale: [0.45, 0.9], spacing: 0.8, align: 0.4, wind: 0.4, clump: 4, clumpK: 0.7 };
const FERN = { scale: [0.35, 0.65], spacing: 0.6, align: 0.5, wind: 0.6, clump: 3, clumpK: 0.8 };
const MUSHROOM = { scale: [0.4, 0.8], scaleBias: 1.5, spacing: 0.15, align: 0.4, clump: 2, clumpK: 0.9, hug: 0.6 };

const tree = (o) => ({ align: 0.1, blocking: true, clump: 6, clumpK: 0.5, scaleBias: 1.6, ...o });
const COMMON = tree({ scale: [0.5, 1], spacing: 1.9, wind: 0.4, trunk: 0.42 });
const PINE = tree({ scale: [0.55, 1.1], spacing: 1.8, wind: 0.3, trunk: 0.4, clump: 7, clumpK: 0.6 });
const TWISTED = tree({ scale: [0.3, 0.48], spacing: 3.2, wind: 0.3, trunk: 1, clump: 8 });
const DEAD_SMALL = tree({ scale: [0.35, 0.65], spacing: 2.2, wind: 0.08, trunk: 0.55 });
const BIRCH = tree({ scale: [0.35, 0.65], spacing: 2, wind: 0.4, trunk: 0.3 });
const BLOSSOM = tree({ scale: [0.3, 0.5], spacing: 3.2, wind: 0.3, trunk: 0.6, clump: 8 });
const GIANT_PINE = tree({ scale: [0.35, 0.65], spacing: 2.4, wind: 0.3, trunk: 0.45, clump: 7, clumpK: 0.6 });
const TALL_THICK = tree({ scale: [0.3, 0.55], spacing: 2.4, wind: 0.35, trunk: 0.45 });
const PLANT = { scale: [0.3, 0.5], spacing: 0.6, align: 0.5, wind: 0.5, clump: 3, clumpK: 0.7 };
const DEAD_TALL = tree({ scale: [0.28, 0.5], spacing: 2.2, wind: 0.08, trunk: 0.55 });

const PEBBLES = [...seq("Pebble_Round_", 1, 5), ...seq("Pebble_Square_", 1, 6)];
const ROCKS = seq("Rock_Medium_", 1, 4);
const BIG_ROCKS = ["Rock_Big_1", "Rock_Big_2"];
const FLOWERS = ["Flower_3_Group", "Flower_4_Group", "Flower_3_Single", "Flower_4_Single"];
const FLOWERS_PRO = ["Flower_1_Group", "Flower_2_Group", "Flower_7_Group", "Flower_1_Single", "Flower_2_Single", "Flower_7_Single"];
const FLOWER_CARPET = ["Flower_6", "Flower_6_2"];
const PLANTS = ["Plant_2", "Plant_3", "Plant_4", "Plant_5", "Plant_6"];
const BIG_BUSHES = ["Bush_Large", "Bush_Large_Flowers"];
const FERNS = ["Fern_1", "Fern_2"];
const CLOVER = ["Clover_1", "Clover_2"];
const CACTI_TALL = ["Cactus_1A", "Cactus_1B", "Cactus_2A", "Cactus_2B"];
const CACTI_SMALL = ["Cactus_3A", "Cactus_3B", "Cactus_5B"];
const CACTI_LOW = ["Cactus_4A", "Cactus_4B", "Cactus_4C"];
const CACTUS_TALL = { scale: [0.9, 1.6], scaleBias: 1.4, spacing: 1.5, align: 0.1, blocking: true, trunk: 0.3, clump: 5, clumpK: 0.7 };
const CACTUS_SMALL = { scale: [0.8, 1.3], spacing: 0.9, align: 0.2, clump: 4, clumpK: 0.8 };
const CACTUS_LOW = { scale: [0.8, 1.3], spacing: 0.7, align: 0.4, clump: 4, clumpK: 0.8 };

const nature = (id, icon, assets) => ({ name: `levels3dpreview.scatter.sets.${id}`, kind: "nature", icon, assets });

const NATURE_SETS = {
    grass: nature("grass", "fa-solid fa-wheat-awn", [
        ...group(["Grass_Common_Short"], { weight: 0.55, ...GRASS_SHORT }),
        ...group(["Grass_Common_Tall"], { weight: 0.18, ...GRASS_TALL }),
        ...group(["Grass_Wispy_Short", "Grass_Wispy_Tall"], { weight: 0.12, ...WISPY, clump: 4, clumpK: 0.9 }),
        ...group(["Grass_Wide_Short", "Grass_Wide_Tall"], { weight: 0.06, ...GRASS_TALL }),
    ]),
    meadow: nature("meadow", "fa-solid fa-seedling", [
        ...group(FLOWERS, { weight: 0.12, ...FLOWER }),
        ...group(FLOWERS_PRO, { weight: 0.05, ...FLOWER, scale: [0.2, 0.32] }),
        ...group(CLOVER, { weight: 0.05, scale: [0.15, 0.28], spacing: 0.3, align: 0.5, wind: 0.8, clump: 3, clumpK: 0.8 }),
        ...group(["Plant_1"], { weight: 0.04, scale: [0.35, 0.6], spacing: 0.5, align: 0.5, wind: 0.6 }),
        ...group(["Plant_7"], { weight: 0.03, scale: [0.4, 0.7], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(["Bush_Common_Flowers"], { weight: 0.04, ...BUSH }),
        ...group(["Bush_Long_1", "Bush_Long_2"], { weight: 0.02, scale: [0.4, 0.6], spacing: 0.8, align: 0.4, wind: 0.4, clump: 3, clumpK: 0.8 }),
        ...group(PEBBLES.slice(0, 5), { weight: 0.03, ...PEBBLE, scale: [0.5, 1.1] }),
        ...group(ROCKS, { weight: 0.008, ...ROCK_MID, scale: [0.25, 0.45] }),
        ...group(seq("CommonTree_", 1, 5), { weight: 0.012, ...COMMON, scale: [0.5, 0.95], spacing: 3.5, clump: 8, clumpK: 0.9 }),
    ]),
    forest: nature("forest", "fa-solid fa-tree", [
        ...group(seq("CommonTree_", 1, 5), { weight: 0.36, ...COMMON }),
        ...group(seq("Pine_", 1, 5), { weight: 0.25, ...PINE }),
        ...group(seq("TallThick_", 1, 5), { weight: 0.07, ...TALL_THICK }),
        ...group(seq("GiantPine_", 1, 5), { weight: 0.05, ...GIANT_PINE }),
        ...group(["Bush_Common_Flowers"], { weight: 0.1, ...BUSH }),
        ...group(BIG_BUSHES, { weight: 0.03, ...BUSH, scale: [0.3, 0.5], spacing: 1 }),
        ...group(FERNS, { weight: 0.1, ...FERN }),
        ...group(PLANTS, { weight: 0.03, ...PLANT }),
        ...group(["Plant_1_Big"], { weight: 0.04, scale: [0.3, 0.5], spacing: 0.7, align: 0.5, wind: 0.5 }),
        ...group(["Plant_1"], { weight: 0.04, scale: [0.35, 0.6], spacing: 0.5, align: 0.5, wind: 0.6 }),
        ...group(["Mushroom_Common"], { weight: 0.006, ...MUSHROOM }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.004, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(["Mushroom_RedCap"], { weight: 0.004, ...MUSHROOM, scale: [0.2, 0.4] }),
        ...group(ROCKS, { weight: 0.03, ...ROCK_MID, spacing: 1 }),
        ...group(PEBBLES, { weight: 0.03, ...PEBBLE }),
    ]),
    forestFloor: nature("forestFloor", "fa-solid fa-leaf", [
        ...group(FERNS, { weight: 0.18, ...FERN }),
        ...group(PLANTS, { weight: 0.05, ...PLANT }),
        ...group(["Plant_1"], { weight: 0.08, scale: [0.35, 0.6], spacing: 0.5, align: 0.5, wind: 0.6, clump: 3, clumpK: 0.7 }),
        ...group(["Plant_1_Big"], { weight: 0.05, scale: [0.3, 0.5], spacing: 0.7, align: 0.5, wind: 0.5 }),
        ...group(["Plant_7", "Plant_7_Big"], { weight: 0.06, scale: [0.4, 0.75], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(CLOVER, { weight: 0.06, scale: [0.15, 0.28], spacing: 0.3, align: 0.5, wind: 0.8, clump: 3, clumpK: 0.8 }),
        ...group(["Bush_Common_Flowers"], { weight: 0.06, ...BUSH }),
        ...group(["Mushroom_Common"], { weight: 0.015, ...MUSHROOM }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.008, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(["Mushroom_Oyster"], { weight: 0.008, ...MUSHROOM, scale: [0.12, 0.25], spacing: 0.3 }),
        ...group(["Mushroom_RedCap"], { weight: 0.008, ...MUSHROOM, scale: [0.2, 0.4] }),
        ...group(PEBBLES, { weight: 0.05, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.03, ...ROCK_SMALL }),
    ]),
    autumnForest: nature("autumnForest", "fa-brands fa-canadian-maple-leaf", [
        ...group(seq("TwistedTree_", 1, 5), { weight: 0.15, ...TWISTED, spacing: 3 }),
        ...group(seq("Birch_", 1, 5), { weight: 0.12, ...BIRCH }),
        ...group(seq("CommonTree_", 1, 5), { weight: 0.04, ...COMMON, spacing: 2 }),
        ...group(seq("Pine_", 1, 3), { weight: 0.05, ...PINE }),
        ...group(["Bush_Common"], { weight: 0.08, ...BUSH }),
        ...group(["Fern_1"], { weight: 0.04, ...FERN }),
        ...group(["Mushroom_Common"], { weight: 0.01, ...MUSHROOM }),
        ...group(["Mushroom_RedCap"], { weight: 0.006, ...MUSHROOM, scale: [0.2, 0.4] }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.004, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(PEBBLES, { weight: 0.03, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.02, ...ROCK_MID }),
    ]),
    rocks: nature("rocks", "fa-solid fa-mountain", [
        ...group(PEBBLES, { weight: 0.4, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.18, ...ROCK_SMALL }),
        ...group(ROCKS, { weight: 0.15, ...ROCK_MID }),
        ...group(ROCKS, { weight: 0.2, ...BOULDER }),
        ...group(BIG_ROCKS, { weight: 0.06, ...BOULDER, scale: [0.3, 0.6] }),
        ...group(["RockPath_Round_Small_1", "RockPath_Round_Small_2", "RockPath_Round_Small_3", "RockPath_Round_Wide"], { weight: 0.04, scale: [0.6, 1], spacing: 1.2, align: 1 }),
        ...group(["Grass_Wispy_Short"], { weight: 0.05, ...WISPY }),
    ]),
    crags: nature("crags", "fa-solid fa-mountain-sun", [
        ...group(ROCKS, { weight: 0.22, ...BOULDER, scale: [0.8, 1.5], spacing: 2.4 }),
        ...group(BIG_ROCKS, { weight: 0.1, ...BOULDER, scale: [0.35, 0.7], spacing: 2.6 }),
        ...group(ROCKS, { weight: 0.2, ...ROCK_MID, scale: [0.35, 0.65], spacing: 1.3, align: 0.8 }),
        ...group(ROCKS, { weight: 0.2, ...ROCK_SMALL }),
        ...group(["RockPath_Square_Small_1", "RockPath_Square_Small_2", "RockPath_Square_Small_3", "RockPath_Square_Wide"], { weight: 0.1, scale: [0.7, 1.2], spacing: 1.4, align: 1 }),
        ...group(PEBBLES.slice(5), { weight: 0.2, ...PEBBLE }),
        ...group(["Grass_Wispy_Short"], { weight: 0.08, ...WISPY }),
    ]),
    deadWood: nature("deadWood", "fa-solid fa-skull", [
        ...group(["DeadTree_1", "DeadTree_2"], { weight: 0.13, ...DEAD_SMALL }),
        ...group(["DeadTree_3", "DeadTree_4", "DeadTree_5"], { weight: 0.17, ...DEAD_TALL }),
        ...group(["Grass_Wispy_Tall"], { weight: 0.22, ...WISPY }),
        ...group(["Grass_Wispy_Short"], { weight: 0.15, ...WISPY }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.012, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(PEBBLES, { weight: 0.08, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.04, ...ROCK_MID }),
    ]),
    desertScrub: nature("desertScrub", "fa-solid fa-sun", [
        ...group(ROCKS, { weight: 0.25, ...ROCK_SMALL, clumpK: 0.85 }),
        ...group(ROCKS, { weight: 0.1, ...ROCK_MID }),
        ...group(ROCKS, { weight: 0.05, ...BOULDER, spacing: 2.5 }),
        ...group(BIG_ROCKS, { weight: 0.02, ...BOULDER, scale: [0.3, 0.55], spacing: 2.8 }),
        ...group(["Grass_Wispy_Short"], { weight: 0.15, ...WISPY, scale: [0.25, 0.45], spacing: 0.4, clump: 3, clumpK: 0.85 }),
        ...group(["Grass_Wispy_Tall"], { weight: 0.05, ...WISPY, spacing: 0.4, clump: 3, clumpK: 0.9 }),
        ...group(["DeadTree_1", "DeadTree_2"], { weight: 0.02, ...DEAD_SMALL, scale: [0.25, 0.4], spacing: 3 }),
        ...pack(DESERT, CACTI_TALL, { weight: 0.1, ...CACTUS_TALL, spacing: 1.8 }),
        ...pack(DESERT, CACTI_SMALL, { weight: 0.06, ...CACTUS_SMALL }),
        ...pack(DESERT, CACTI_LOW, { weight: 0.05, ...CACTUS_LOW }),
        ...group(PEBBLES, { weight: 0.1, ...PEBBLE, scale: [0.4, 1.1] }),
        ...group(["RockPath_Round_Small_1", "RockPath_Round_Small_2", "RockPath_Round_Small_3", "RockPath_Square_Small_1", "RockPath_Square_Small_2"], { weight: 0.025, scale: [0.6, 1], spacing: 1.4, align: 1, clump: 3, clumpK: 0.8 }),
    ]),
    cactusGrove: nature("cactusGrove", "fa-solid fa-sun-plant-wilt", [
        ...pack(DESERT, CACTI_TALL, { weight: 0.4, ...CACTUS_TALL, spacing: 1.3, clumpK: 0.75 }),
        ...pack(DESERT, CACTI_SMALL, { weight: 0.14, ...CACTUS_SMALL }),
        ...pack(DESERT, CACTI_LOW, { weight: 0.12, ...CACTUS_LOW, spacing: 0.6, clumpK: 0.85 }),
        ...group(PEBBLES, { weight: 0.3, ...PEBBLE, scale: [0.4, 1.1] }),
        ...group(ROCKS, { weight: 0.1, ...ROCK_SMALL }),
        ...group(["RockPath_Round_Wide", "RockPath_Round_Thin", "RockPath_Square_Wide", "RockPath_Square_Thin"], { weight: 0.04, scale: [0.6, 1], spacing: 1.6, align: 1 }),
        ...group(["Grass_Wispy_Short"], { weight: 0.1, ...WISPY, scale: [0.25, 0.4], spacing: 0.4, clump: 3, clumpK: 0.9 }),
    ]),
    snowyPines: nature("snowyPines", "fa-solid fa-snowflake", [
        ...group(seq("Pine_", 1, 5), { weight: 0.28, ...PINE, spacing: 2, wind: 0.3 }),
        ...group(seq("GiantPine_", 1, 5), { weight: 0.08, ...GIANT_PINE }),
        ...group(seq("TallThick_", 1, 5), { weight: 0.04, ...TALL_THICK }),
        ...group(["DeadTree_1", "DeadTree_2"], { weight: 0.03, ...DEAD_SMALL, scale: [0.3, 0.5] }),
        ...group(ROCKS, { weight: 0.12, ...ROCK_SMALL }),
        ...group(ROCKS, { weight: 0.06, ...ROCK_MID }),
        ...group(ROCKS, { weight: 0.04, ...BOULDER }),
        ...group(PEBBLES, { weight: 0.04, ...PEBBLE }),
        ...group(["Grass_Wispy_Short"], { weight: 0.06, ...WISPY, clump: 4, clumpK: 0.9 }),
    ]),
    swamp: nature("swamp", "fa-solid fa-water", [
        ...group(["DeadTree_1", "DeadTree_2"], { weight: 0.12, ...DEAD_SMALL, scale: [0.3, 0.55] }),
        ...group(seq("CommonTree_", 1, 5), { weight: 0.06, ...COMMON, spacing: 2.5 }),
        ...group(["Grass_Wheat"], { weight: 0.12, scale: [0.4, 0.7], spacing: 0.22, align: 0.2, wind: 0.9, aquatic: true, clump: 3, clumpK: 0.85 }),
        ...group(["Grass_Common_Tall"], { weight: 0.25, ...GRASS_TALL, scale: [0.35, 0.6], spacing: 0.25, aquatic: true, clumpK: 0.7 }),
        ...group(CLOVER, { weight: 0.06, scale: [0.2, 0.35], spacing: 0.4, align: 0.3, wind: 0.6, aquatic: true, clump: 3, clumpK: 0.85 }),
        ...group(["Plant_7", "Plant_7_Big"], { weight: 0.25, scale: [0.35, 0.7], spacing: 0.6, wind: 0.2, aquatic: true, float: true, clump: 3, clumpK: 0.8 }),
        ...group(FERNS, { weight: 0.06, ...FERN }),
        ...group(["Plant_1_Big"], { weight: 0.04, scale: [0.3, 0.5], spacing: 0.7, align: 0.5, wind: 0.5 }),
        ...group(["Plant_2", "Plant_2_Big", "Plant_4"], { weight: 0.03, ...PLANT, scale: [0.25, 0.45] }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.008, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(ROCKS, { weight: 0.03, ...ROCK_MID }),
        ...group(PEBBLES.slice(0, 5), { weight: 0.03, ...PEBBLE }),
    ]),
    mushrooms: nature("mushrooms", "fa-solid fa-hat-wizard", [
        ...group(["Mushroom_Common"], { weight: 0.25, ...MUSHROOM, clump: 2.5 }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.1, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(seq("Crops_Mushroom_", 2, 4), { weight: 0.12, ...MUSHROOM, scale: [0.6, 1.2] }),
        ...group(["Mushroom_Common"], { weight: 0.05, scale: [3, 5], scaleBias: 1.5, spacing: 2.5, align: 0.1, blocking: true, trunk: 0.15, clump: 5, clumpK: 0.8 }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.03, scale: [1.5, 2.5], spacing: 2, align: 0.2, blocking: true, trunk: 0.4, clump: 5, clumpK: 0.8 }),
        ...group(["Mushroom_RedCap"], { weight: 0.12, ...MUSHROOM, scale: [0.2, 0.4] }),
        ...group(["Mushroom_RedCap"], { weight: 0.03, scale: [1.5, 2.5], scaleBias: 1.5, spacing: 2.5, align: 0.1, blocking: true, trunk: 0.3, clump: 5, clumpK: 0.8 }),
        ...group(["Mushroom_Oyster"], { weight: 0.05, ...MUSHROOM, scale: [0.12, 0.25], spacing: 0.3 }),
        ...group(FERNS, { weight: 0.12, ...FERN }),
        ...group(CLOVER, { weight: 0.12, scale: [0.15, 0.3], spacing: 0.3, align: 0.5, wind: 0.8, clump: 3, clumpK: 0.8 }),
        ...group(["Plant_7"], { weight: 0.08, scale: [0.4, 0.7], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
    ]),
    wildflowers: nature("wildflowers", "fa-solid fa-spa", [
        ...group(["Flower_3_Group", "Flower_4_Group"], { weight: 0.2, ...FLOWER, scale: [0.2, 0.3] }),
        ...group(["Flower_3_Single", "Flower_4_Single"], { weight: 0.15, ...FLOWER }),
        ...group(FLOWERS_PRO, { weight: 0.12, ...FLOWER, scale: [0.2, 0.32] }),
        ...group(FLOWER_CARPET, { weight: 0.06, scale: [0.4, 0.7], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(seq("Petal_", 1, 6), { weight: 0.12, scale: [0.25, 0.45], spacing: 0.3, align: 0.8, wind: 0.4, clump: 3, clumpK: 0.85 }),
        ...group(["Plant_7", "Plant_7_Big"], { weight: 0.1, scale: [0.4, 0.75], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(CLOVER, { weight: 0.08, scale: [0.15, 0.28], spacing: 0.3, align: 0.5, wind: 0.8, clump: 3, clumpK: 0.8 }),
        ...group(["Bush_Common_Flowers"], { weight: 0.05, ...BUSH }),
    ]),
    stylizedForest: nature("stylizedForest", "fa-solid fa-paintbrush", [
        ...group(seq("TwistedTree_", 1, 5), { weight: 0.12, ...TWISTED }),
        ...group(seq("CommonTree_", 1, 5), { weight: 0.12, ...COMMON, scale: [0.5, 0.95], spacing: 2.5 }),
        ...group(seq("Pine_", 1, 5), { weight: 0.08, ...PINE, spacing: 2.5 }),
        ...group(seq("TallThick_", 1, 5), { weight: 0.05, ...TALL_THICK, spacing: 2.6 }),
        ...group(["Bush_Common_Flowers", "Bush_Common"], { weight: 0.12, ...BUSH }),
        ...group(BIG_BUSHES, { weight: 0.04, ...BUSH, scale: [0.3, 0.5], spacing: 1 }),
        ...group(FLOWERS, { weight: 0.1, ...FLOWER }),
        ...group(FLOWERS_PRO, { weight: 0.04, ...FLOWER, scale: [0.2, 0.32] }),
        ...group(FERNS, { weight: 0.08, ...FERN }),
        ...group(PLANTS, { weight: 0.03, ...PLANT }),
        ...group(["Plant_1"], { weight: 0.06, scale: [0.35, 0.6], spacing: 0.5, align: 0.5, wind: 0.6 }),
        ...group(["Mushroom_Common"], { weight: 0.01, ...MUSHROOM }),
        ...group(ROCKS, { weight: 0.03, ...ROCK_MID }),
    ]),
    blossomGrove: nature("blossomGrove", "fa-solid fa-fan", [
        ...group(seq("TwistedTree_", 1, 5), { weight: 0.1, ...TWISTED, spacing: 3.2, clump: 7 }),
        ...group(seq("CherryBlossom_", 1, 5), { weight: 0.14, ...BLOSSOM }),
        ...group(FLOWER_CARPET, { weight: 0.05, scale: [0.4, 0.7], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(seq("Petal_", 1, 6), { weight: 0.2, scale: [0.25, 0.45], spacing: 0.3, align: 0.8, wind: 0.4, clump: 2.5, clumpK: 0.9 }),
        ...group(["Flower_3_Group", "Flower_3_Single"], { weight: 0.12, ...FLOWER }),
        ...group(["Bush_Common_Flowers"], { weight: 0.1, ...BUSH }),
        ...group(["Plant_7"], { weight: 0.05, scale: [0.4, 0.7], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(ROCKS, { weight: 0.02, ...ROCK_MID }),
    ]),
    cave: nature("cave", "fa-solid fa-hill-rockslide", [
        ...group(PEBBLES, { weight: 0.3, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.18, ...ROCK_SMALL }),
        ...pack(HIGHEND, seq("FlatCluster_0", 1, 5), { weight: 0.1, scale: [0.1, 0.2], spacing: 0.9, align: 0.9, clump: 4, clumpK: 0.7 }),
        ...group(BIG_ROCKS, { weight: 0.04, ...CAVE_BOULDER, scale: [0.18, 0.3], trunk: 1.5 }),
        ...group(["Rock_Medium_1", "Rock_Medium_2"], { weight: 0.03, ...CAVE_BOULDER, scale: [0.3, 0.5], trunk: 1 }),
        ...pack(PROPS, ["Vase_Rubble_Medium"], { weight: 0.03, scale: [0.8, 1.2], spacing: 0.8, align: 1 }),
        ...group(["Mushroom_Common"], { weight: 0.05, ...MUSHROOM, clump: 2.5 }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.02, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(seq("Crops_Mushroom_", 2, 4), { weight: 0.03, ...MUSHROOM, scale: [0.5, 1] }),
    ]),
    iceCave: nature("iceCave", "fa-solid fa-icicles", [
        ...group(PEBBLES, { weight: 0.4, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.12, ...ROCK_SMALL }),
        ...pack(HIGHEND, seq("FlatCluster_0", 1, 5), { weight: 0.15, scale: [0.1, 0.2], spacing: 0.9, align: 0.9, clump: 4, clumpK: 0.7 }),
        ...pack(HIGHEND, seq("SlantedRock_0", 1, 3), { weight: 0.06, scale: [0.12, 0.22], scaleBias: 1.5, spacing: 2, align: 0.6, blocking: true, trunk: 0.5, clump: 5, clumpK: 0.7 }),
        ...pack(HIGHEND, seq("Boulder_0", 1, 3), { weight: 0.05, scale: [0.18, 0.3], scaleBias: 1.5, spacing: 2, align: 0.6, blocking: true, trunk: 0.5, clump: 5, clumpK: 0.7 }),
    ]),
    lavaCave: nature("lavaCave", "fa-solid fa-volcano", [
        ...group(ROCKS, { weight: 0.3, scale: [0.06, 0.13], scaleBias: 1.5, spacing: 0.35, align: 1, clump: 3, clumpK: 0.85, tint: BASALT }),
        ...group(PEBBLES.slice(0, 5), { weight: 0.1, ...PEBBLE, tint: BASALT }),
        ...group(ROCKS, { weight: 0.12, ...ROCK_SMALL, tint: BASALT }),
        ...group(ROCKS, { weight: 0.12, ...ROCK_MID, tint: BASALT }),
        ...group(BIG_ROCKS, { weight: 0.09, ...BOULDER, scale: [0.3, 0.55], trunk: 0.5, tint: BASALT }),
        ...group(ROCKS, { weight: 0.13, scale: [0.12, 0.2], spacing: 0.8, align: 1, clump: 4, clumpK: 0.7, tint: BASALT }),
    ]),
    mine: nature("mine", "fa-solid fa-trowel-bricks", [
        ...group(PEBBLES, { weight: 0.35, ...PEBBLE, tint: MINE_ROCK }),
        ...group(ROCKS, { weight: 0.2, ...ROCK_SMALL, tint: MINE_ROCK }),
        ...pack(OLD_MINE, ["Crate"], { weight: 0.07, scale: [0.9, 1.1], spacing: 0.9, align: 1, blocking: true, clump: 3, clumpK: 0.85 }),
        ...pack(PROPS, ["Barrel", "Barrel_Worn", "Barrel_Dark_Worn"], { weight: 0.03, scale: [0.9, 1.1], spacing: 1.1, align: 1, blocking: true, clump: 3, clumpK: 0.85 }),
        ...pack(OLD_MINE, ["Dynamite"], { weight: 0.03, scale: [0.9, 1.1], spacing: 0.5, align: 1, clump: 2, clumpK: 0.9 }),
        ...pack(OLD_MINE, ["Pickaxe", "Shovel", "Hammer"], { weight: 0.05, scale: [0.95, 1.05], spacing: 0.7, align: 1, clump: 2, clumpK: 0.8 }),
        ...pack(OLD_MINE, ["Plunger", "Helmet", "Lantern"], { weight: 0.03, scale: [0.95, 1.05], spacing: 0.6, align: 1, clump: 2, clumpK: 0.9 }),
        ...pack(PROPS, ["Bucket_Wooden_1", "Rope_1"], { weight: 0.02, scale: [0.9, 1.1], spacing: 0.6, align: 1, clump: 2, clumpK: 0.9 }),
        ...pack(OLD_MINE, ["Cart"], { weight: 0.015, scale: [0.95, 1.05], spacing: 2.5, align: 1, blocking: true }),
    ]),
    market: nature("market", "fa-solid fa-store", [
        ...pack(PROPS, ["Crate_Wooden", "Barrel", "Barrel_Apples"], { weight: 0.3, scale: [0.9, 1.1], spacing: 0.9, align: 1, blocking: true, clump: 3, clumpK: 0.9 }),
        ...pack(PROPS, ["FarmCrate_Apple", "FarmCrate_Carrot", "FarmCrate_GreenApples", "FarmCrate_Oranges", "FarmCrate_Leek", "FarmCrate_Radish", "FarmCrate_Empty"], { weight: 0.35, scale: [0.9, 1.1], spacing: 0.7, align: 1, clump: 3, clumpK: 0.9 }),
        ...pack(PROPS, ["Bag", "Bag_2", "Bucket_Wooden_1", "Bucket_Wooden_2"], { weight: 0.25, scale: [0.9, 1.1], spacing: 0.6, align: 1, clump: 3, clumpK: 0.9 }),
        ...pack(PROPS, ["Vase_2", "Vase_4", "Rope_2"], { weight: 0.1, scale: [0.9, 1.1], spacing: 0.6, align: 1, clump: 2, clumpK: 0.9 }),
    ]),
};

const NATURE_THUMBS = {
    meadow: `${SN}Flower_3_Group`, forest: `${SN}CommonTree_1`, forestFloor: `${SN}Fern_1`, autumnForest: `${SN}Birch_1`,
    rocks: `${SN}Rock_Medium_2`, crags: `${SN}Rock_Medium_3`, deadWood: `${SN}DeadTree_1`, desertScrub: `${DESERT}Cactus_3B`, cactusGrove: `${DESERT}Cactus_1B`,
    snowyPines: `${SN}Pine_2`, swamp: `${SN}Plant_7_Big`, mushrooms: `${SN}Mushroom_Common`, wildflowers: `${SN}Flower_4_Group`,
    stylizedForest: `${SN}TwistedTree_3`, blossomGrove: `${SN}CherryBlossom_1`, cave: `${SN}Rock_Big_1`,
    iceCave: `${HIGHEND}SlantedRock_01`, lavaCave: `${SN}Rock_Big_2`, mine: `${OLD_MINE}Cart`, market: `${PROPS}FarmCrate_Apple`,
};

const prop = (id, size, o = {}) =>
    asset({ id, src: `${PROPS}${id}.glb`, weight: 0, scale: [0.95, 1.05], spacing: Math.max(size[0], size[1]) / 2, size, front: "+z", back: size[1] / 2, placement: "floor", ...o });
const hung = (id, size, yOffset, back = 0, o = {}) => prop(id, size, { placement: "wall", hung: true, yOffset, back, ...o });
const onTable = (id, size, o = {}) => prop(id, size, { placement: "table", scale: [0.9, 1.1], ...o });

const PROP_LIST = [
    prop("Table_Large", [2.84, 1.1, 0.81], { placement: "center", top: 0.81 }),
    prop("Workbench", [2.02, 1.03, 0.9], { placement: "wall", top: 0.9, back: 0.52 }),
    prop("Chair_1", [0.58, 0.55, 1.12], { back: 0.29 }),
    prop("Bench", [2.78, 0.53, 0.53], { yOffset: 0.01 }),
    prop("Stool", [0.48, 0.48, 0.58], { yOffset: 0.01 }),
    prop("Barrel", [0.7, 0.7, 0.9], { placement: "corner", top: 0.9 }),
    prop("Barrel_Apples", [0.7, 0.7, 0.9], { placement: "corner" }),
    prop("Barrel_Holder", [1.36, 0.74, 1.25], { placement: "wall", back: 0.35, yOffset: 0.01 }),
    prop("Crate_Wooden", [0.85, 0.9, 0.88], { placement: "corner", top: 0.88, yOffset: 0.05 }),
    prop("Crate_Metal", [0.86, 0.86, 0.87], { placement: "corner", top: 0.87 }),
    prop("FarmCrate_Apple", [0.72, 0.42, 0.25], { yOffset: 0.02 }),
    prop("FarmCrate_Carrot", [0.72, 0.57, 0.42], { yOffset: 0.02, back: 0.36 }),
    prop("FarmCrate_Empty", [0.72, 0.42, 0.25], { yOffset: 0.02 }),
    prop("Bag", [0.66, 0.54, 0.8], { back: 0.24 }),
    prop("Bed_Twin1", [1.88, 2.42, 0.81], { placement: "wall", backed: true, back: 1.21 }),
    prop("Bed_Twin2", [1.88, 2.42, 0.76], { placement: "wall", backed: true, back: 1.21 }),
    prop("Chest_Wood", [1.28, 0.82, 0.69], { back: 0.38, yOffset: 0.02 }),
    prop("Nightstand_Shelf", [0.7, 0.39, 1.21], { placement: "wall", top: 1.21, back: 0.19, yOffset: 0.01 }),
    prop("Cabinet", [1.36, 0.36, 1], { placement: "wall", top: 1, back: 0.18 }),
    prop("Bookcase_2", [1.46, 0.42, 2.53], { placement: "wall", backed: true, back: 0.21, yOffset: 0.02, blocking: true, boards: [0.14, 0.77, 1.15, 1.54, 1.92], inner: [1.2, 0] }),
    prop("Shelf_Arch", [1.24, 0.32, 1.58], { placement: "wall", back: 0.01, yOffset: 0.61, boards: [-0.41, 0.13, 0.64], inner: [1.05, 0.16] }),
    prop("BookStand", [0.5, 0.52, 1.44], { back: 0.26 }),
    prop("CandleStick_Stand", [0.74, 0.74, 1.31], { placement: "corner", yOffset: 0.01 }),
    prop("WeaponStand", [1.38, 0.98, 1.11], { placement: "wall", back: 0.49, rack: { y: 0.14, x: [-0.5, 0.5] } }),
    prop("Dummy", [0.8, 0.58, 1.86], { placement: "center" }),
    prop("Anvil_Log", [0.93, 0.82, 1.07], { placement: "center", back: 0.35 }),
    prop("Whetstone", [1.14, 0.91, 1.17], { back: 0.38 }),
    prop("Cauldron", [0.98, 0.94, 0.81], { placement: "center" }),
    prop("Bucket_Metal", [0.48, 0.45, 0.36], { yOffset: 0.01, scale: [0.9, 1.1] }),
    prop("Bucket_Wooden_1", [0.44, 0.38, 0.29], { scale: [0.9, 1.1] }),
    prop("Vase_2", [0.7, 0.7, 0.52], { placement: "corner", scale: [0.9, 1.1] }),
    prop("Vase_4", [0.36, 0.36, 0.49], { placement: "corner", scale: [0.9, 1.1] }),
    prop("Vase_Rubble_Medium", [0.8, 0.6, 0.18], { scale: [0.9, 1.1] }),
    prop("Cage_Small", [0.85, 0.88, 0.8], { yOffset: 0.04 }),
    prop("Chain_Coil", [1.07, 0.91, 0.08], { scale: [0.9, 1.1] }),
    prop("Rope_1", [0.56, 0.61, 0.1], { yOffset: 0.03, scale: [0.9, 1.1] }),
    prop("Rope_2", [0.8, 0.85, 0.12], { scale: [0.9, 1.1] }),
    prop("Rope_3", [1.23, 0.95, 0.1], { yOffset: 0.03, scale: [0.9, 1.1] }),
    prop("Stall_Empty", [1.84, 0.93, 2.62], { placement: "wall", back: 0.46, yOffset: 0.01, top: 0.82, surface: { x: [-0.8, 0.8], z: [-0.35, 0.35] } }),
    prop("Stall_Cart_Empty", [3.02, 1.06, 2.63], { placement: "center", back: 0.53, pivot: [-0.6, 0], top: 0.83, surface: { x: [-1.9, 0.7], z: [-0.4, 0.4] } }),
    prop("Chandelier", [1.3, 1.3, 1.46], { placement: "ceiling", yOffset: -0.04 }),
    hung("Shelf_Simple", [1.18, 0.34, 0.31], 1.5, 0, { top: 0.11 }),
    hung("Shelf_Small_Bottles", [1.14, 0.29, 0.65], 1.2),
    hung("Peg_Rack", [1.18, 0.1, 0.34], 1.6),
    hung("Lantern_Wall", [0.36, 1.3, 1.34], 1.6, 0.05),
    hung("Torch_Metal", [0.22, 0.39, 0.65], 1.6),
    hung("Shield_Wooden", [0.62, 0.18, 0.62], 1.5),
    hung("Axe_Bronze", [0.3, 0.04, 0.83], 1.5, 0.02),
    hung("Pickaxe_Bronze", [0.81, 0.14, 1.19], 1.5, 0.07),
    hung("Sword_Bronze", [0.26, 0.06, 1.13], 1.3, 0.03),
    hung("Banner_1_Cloth", [0.81, 0.05, 2.25], 2.7, 0.03),
    hung("Banner_2_Cloth", [0.81, 0.05, 1.93], 2.6, 0.03),
    hung("Banner_1", [0.19, 1.61, 2.39], 2, 0, { front: "+x" }),
    hung("Banner_2", [0.19, 1.61, 2.07], 1.9, 0, { front: "+x" }),
    onTable("Mug", [0.19, 0.14, 0.19], { yOffset: 0.01 }),
    onTable("Table_Plate", [0.34, 0.34, 0.02]),
    onTable("Table_Fork", [0.06, 0.26, 0.01]),
    onTable("Table_Knife", [0.04, 0.28, 0.01]),
    onTable("Table_Spoon", [0.04, 0.27, 0.01], { yOffset: 0.01 }),
    onTable("Chalice", [0.12, 0.12, 0.26]),
    onTable("Bottle_1", [0.12, 0.12, 0.37]),
    onTable("Candle_1", [0.1, 0.11, 0.13]),
    onTable("Candle_2", [0.1, 0.1, 0.25]),
    onTable("CandleStick", [0.27, 0.18, 0.16]),
    onTable("CandleStick_Triple", [0.44, 0.14, 0.46]),
    onTable("Pot_1", [0.54, 0.48, 0.22], { yOffset: 0.02 }),
    onTable("Pot_1_Lid", [0.54, 0.48, 0.28], { yOffset: 0.02 }),
    onTable("Book_Stack_1", [0.29, 0.23, 0.21]),
    onTable("Book_Stack_2", [0.27, 0.23, 0.2]),
    onTable("Book_5", [0.21, 0.28, 0.06], { yOffset: 0.03 }),
    onTable("Book_7", [0.25, 0.34, 0.06], { yOffset: 0.03 }),
    onTable("BookGroup_Medium_1", [1.06, 0.25, 0.29]),
    onTable("BookGroup_Medium_2", [1.1, 0.25, 0.29]),
    onTable("BookGroup_Small_1", [0.29, 0.22, 0.29], { yOffset: 0.01 }),
    onTable("BookGroup_Small_2", [0.22, 0.23, 0.28]),
    onTable("Scroll_1", [0.24, 0.07, 0.06]),
    onTable("Scroll_2", [0.23, 0.07, 0.06]),
    onTable("Potion_1", [0.12, 0.12, 0.14]),
    onTable("Potion_2", [0.12, 0.12, 0.26]),
    onTable("Potion_4", [0.14, 0.14, 0.2]),
    onTable("SmallBottle", [0.06, 0.06, 0.12]),
    onTable("SmallBottles_1", [0.21, 0.06, 0.15]),
    onTable("Coin_Pile", [0.2, 0.16, 0.07]),
    onTable("Coin_Pile_2", [0.28, 0.2, 0.06]),
    onTable("Pouch_Large", [0.22, 0.12, 0.16]),
    onTable("Key_Metal", [0.05, 0.11, 0.02], { yOffset: 0.01 }),
    prop("Chair_2", [0.61, 0.59, 0.99], { back: 0.33 }),
    prop("Barrel_Dark", [0.7, 0.7, 0.89], { placement: "corner", top: 0.89 }),
    prop("Bag_2", [0.72, 0.6, 0.72], { back: 0.29 }),
    prop("Bucket_Wooden_2", [0.47, 0.46, 0.4], { scale: [0.9, 1.1] }),
    prop("FarmCrate_GreenApples", [0.72, 0.42, 0.25], { yOffset: 0.02 }),
    prop("FarmCrate_Oranges", [0.72, 0.42, 0.25], { yOffset: 0.02 }),
    prop("FarmCrate_Leek", [0.72, 0.52, 0.36], { yOffset: 0.02, back: 0.31 }),
    prop("FarmCrate_Radish", [0.72, 0.59, 0.38], { yOffset: 0.02, back: 0.3 }),
    prop("Bed_Double", [2.56, 2.42, 0.81], { placement: "wall", backed: true, back: 1.21 }),
    prop("Bed_Bunk", [1.88, 2.42, 2.13], { placement: "wall", backed: true, back: 1.21, yOffset: 0.01 }),
    prop("Nightstand_Drawer", [0.72, 0.5, 0.9], { placement: "wall", top: 0.89, back: 0.25, yOffset: 0.01 }),
    prop("Cage_Large", [0.86, 0.81, 1.33], { yOffset: 0.04 }),
    prop("Chest_Legendary", [1.39, 0.71, 0.84], { back: 0.35, yOffset: 0.01 }),
    prop("Skull", [0.16, 0.26, 0.19], { scale: [0.9, 1.1] }),
    prop("Skull_Top", [0.16, 0.22, 0.17], { scale: [0.9, 1.1] }),
    prop("Vase_Rubble_Large", [0.89, 1.01, 0.18], { scale: [0.9, 1.1] }),
    prop("Vase_Rubble_Small", [0.44, 0.41, 0.15], { scale: [0.9, 1.1] }),
    hung("Shield_Metal", [0.62, 0.18, 0.62], 1.5),
    hung("Sword_Steel", [0.26, 0.06, 1.13], 1.3, 0.03),
    hung("Axe_Steel", [0.3, 0.04, 0.83], 1.5, 0.02),
    onTable("Bottle_2", [0.12, 0.12, 0.37]),
    onTable("Book_Open", [0.46, 0.3, 0.05]),
    onTable("Page_Single", [0.2, 0.24, 0.01]),
    onTable("Pot_2_Lid", [0.56, 0.48, 0.41], { yOffset: 0.02 }),
    onTable("Potion_3", [0.16, 0.16, 0.27]),
    onTable("Potion_5", [0.12, 0.1, 0.23]),
    onTable("Potion_7", [0.18, 0.1, 0.17]),
    onTable("Potion_8", [0.12, 0.12, 0.26]),
    prop("Bed_Bunk2", [1.88, 2.42, 2.13], { placement: "wall", backed: true, back: 1.21, yOffset: 0.01 }),
    prop("Bench_MetalSides", [2.83, 0.62, 0.57], { back: 0.32, yOffset: 0.01 }),
    prop("Vase_1", [0.67, 0.67, 0.71], { placement: "corner", scale: [0.9, 1.1] }),
    prop("Vase_3", [0.56, 0.56, 0.92], { placement: "corner", scale: [0.9, 1.1] }),
    prop("FirePit", [0.81, 0.81, 1.09], { placement: "corner" }),
    prop("CampfireTripod", [1.74, 2.01, 1.54], { placement: "center", pivot: [0.27, 0], back: 1.01, scale: [0.8, 0.9] }),
    prop("Runes", [2, 2, 0.01], { placement: "center", yOffset: 0.02, scale: [0.65, 0.75] }),
    prop("Banner_Vertical_1", [1.04, 0.15, 2.35], { placement: "wall", back: 0.06 }),
    prop("Banner_Vertical_2", [1.04, 0.15, 2.35], { placement: "wall", back: 0.06 }),
    hung("Parts_Chain_Straight", [0.12, 0.12, 1.22], 2.5, 0.06),
    hung("Axe_Double_Steel", [0.48, 0.06, 0.83], 1.5, 0.03),
    onTable("Chalice_Golden", [0.14, 0.14, 0.23]),
    onTable("Candle_3", [0.15, 0.16, 0.15]),
    onTable("Pouch_Small", [0.22, 0.17, 0.13]),
    onTable("Key_Gold", [0.06, 0.12, 0.01], { yOffset: 0.01 }),
    onTable("Parchment", [0.24, 0.26, 0.05]),
    prop("Anvil", [1.08, 0.4, 0.56], { pivot: [0.06, 0] }),
    prop("Bellows", [0.88, 1.88, 1.2], { back: 0.75 }),
    hung("Hammer_Rack", [0.72, 0.18, 0.52], 1.55, 0.02),
    hung("Shelf_Sword", [0.94, 0.21, 0.27], 1.5, 0.01),
    hung("Hammer_Large_Steel", [0.18, 0.06, 0.5], 1.45, 0.03),
    hung("Hammer_Medium_Bronze", [0.16, 0.04, 0.41], 1.45, 0.02),
    hung("Pickaxe_Steel", [0.81, 0.14, 1.19], 1.5, 0.07),
    prop("Shovel_Bronze", [0.28, 0.12, 1.48], { placement: "wall", back: 0.04, yOffset: 0.16 }),
    prop("Shovel_Steel", [0.28, 0.12, 1.48], { placement: "wall", back: 0.04, yOffset: 0.16 }),
    prop("Hoe_Bronze", [0.25, 0.13, 1.02], { placement: "wall", back: 0.05, yOffset: 0.22, pivot: [0.08, 0] }),
    prop("Hoe_Steel", [0.25, 0.13, 1.02], { placement: "wall", back: 0.05, yOffset: 0.22, pivot: [0.08, 0] }),
    prop("Rug_1", [1.48, 0.36, 0.01], { yOffset: 0.02, scale: [1, 1] }),
    prop("Rug_Round", [2.46, 2.46, 0.01], { yOffset: 0.02, scale: [1, 1] }),
    prop("Dresser_1", [1.46, 0.42, 1.09], { placement: "wall", top: 1.09, back: 0.21, yOffset: 0.02 }),
    prop("Chandelier_Large", [1.3, 1.3, 2.62], { placement: "ceiling", yOffset: -0.12, scale: [0.66, 0.7] }),
    onTable("Book_Stack_3", [0.31, 0.27, 0.28]),
    onTable("Book_Stack_4", [0.3, 0.25, 0.24]),
    onTable("Page_Stack_Large", [0.32, 0.33, 0.11], { yOffset: 0.01 }),
    onTable("Page_Stack_Small", [0.53, 0.41, 0.01]),
    prop("Stall_Blacksmith", [2.06, 1.08, 2.65], { placement: "wall", pivot: [0.11, 0], back: 0.46 }),
    prop("Stall_Potions", [1.84, 0.98, 2.65], { placement: "wall", back: 0.46 }),
    prop("Stall_Vegetables_Full", [3.02, 1.06, 2.65], { placement: "center", pivot: [-0.6, 0], back: 0.53 }),
    prop("Wagon", [2.09, 4.49, 3.03], { placement: "center", back: 1.51, yOffset: -0.08 }),
    hung("Sign_Pub", [0.14, 1.21, 1.23], 2.3, 0, { front: "+x" }),
    hung("Sign_Food", [0.14, 1.21, 1.23], 2.3, 0, { front: "+x" }),
    hung("Sign_Potions", [0.14, 1.21, 1.23], 2.3, 0, { front: "+x" }),
    hung("Sign_Blacksmith", [0.14, 1.21, 1.23], 2.3, 0, { front: "+x" }),
    hung("Sign_Armory", [0.14, 1.21, 1.23], 2.3, 0, { front: "+x" }),
    hung("Sign_Armory_2", [0.14, 1.21, 1.23], 2.3, 0, { front: "+x" }),
    prop("Chair_3", [0.68, 0.6, 1.48], { back: 0.32 }),
    prop("Desk", [1.86, 0.78, 0.84], { placement: "wall", top: 0.84, back: 0.39 }),
    prop("Bed_Double2", [2.56, 2.42, 0.76], { placement: "wall", backed: true, back: 1.21 }),
    prop("Bed_Twin3", [1.88, 2.42, 0.76], { placement: "wall", backed: true, back: 1.21 }),
    hung("Shelf_Small", [1.14, 0.29, 0.65], 1.2, 0, { boards: [0.03, 0.33], inner: [1, 0.15] }),
    onTable("Pot_2", [0.56, 0.48, 0.36], { yOffset: 0.02 }),
    onTable("Pan_1", [0.51, 0.9, 0.1], { yOffset: 0.02 }),
    onTable("Pan_2", [0.38, 0.74, 0.16]),
    onTable("SmallBottles_2", [0.41, 0.06, 0.14]),
    onTable("Potion_6", [0.08, 0.07, 0.24]),
];

const ATTACH_LIST = [prop("Workbench_Vice", [0.39, 0.34, 0.28], { placement: "table" })];

const WORN_IDS = [
    "Table_Large", "Chair_1", "Chair_2", "Bench", "Stool", "Barrel", "Barrel_Dark", "Crate_Wooden", "Crate_Metal", "FarmCrate_Empty", "Bag", "Bed_Bunk",
    "Chest_Wood", "Cabinet", "Bookcase_2", "Shelf_Arch", "CandleStick_Stand", "WeaponStand", "Dummy", "Bucket_Wooden_1", "Vase_2", "Vase_4", "Vase_Rubble_Medium", "Vase_Rubble_Large",
    "Vase_Rubble_Small", "Cage_Small", "Cage_Large", "Chain_Coil", "Rope_1", "Rope_2", "Skull", "Skull_Top", "Peg_Rack", "Shield_Wooden", "Axe_Bronze", "Pickaxe_Bronze", "Sword_Bronze",
    "Banner_1_Cloth", "Banner_2_Cloth", "Mug", "Chalice", "Bottle_1", "Candle_1", "Candle_2", "Pot_1", "Book_Stack_1", "Book_Open", "Coin_Pile", "Coin_Pile_2", "Key_Metal",
    "Bed_Bunk2", "Bench_MetalSides", "Vase_1", "Vase_3", "FirePit", "CampfireTripod", "Banner_Vertical_1", "Banner_Vertical_2", "Parts_Chain_Straight", "Bag_2", "Bucket_Metal",
    "CandleStick_Triple", "Chest_Legendary", "Barrel_Holder", "BookGroup_Small_1", "Torch_Metal",
];
const WORN_LIST = WORN_IDS.map((id) => {
    const base = PROP_LIST.find((p) => p.id === id);
    return { ...base, id: `${id}_Worn`, src: `${PROPS}${id}_Worn.glb` };
});
const W = (id) => `${id}_Worn`;

export const SCATTER_PROPS = PROP_LIST;

const SCIFI = `${TILES}SciFi%20MegaKit/`;
const kitProp = (dir, tag) => (file, size, o = {}) => prop(`${tag}${file.split("/").pop()}`, size, { src: `${dir}${file}.glb`, ...o });
const SCIFI_ESS = `${TILES}Sci-Fi%20Essentials%20Kit/`;
const sf = kitProp(SCIFI, "SF_");
const se = kitProp(SCIFI_ESS, "SE_");
const dc = kitProp(`${TILES}Dungeon%20Crawler%20Kit/`, "DC_");
const dp = kitProp(`${TILES}Dungeon%20Props/`, "DP_");
const bn = kitProp(`${TILES}Bones%20Pack/`, "");

const SCIFI_LIST = [
    sf("Props/Prop_Computer", [0.74, 0.56, 1.59], { placement: "wall", back: 0.22 }),
    sf("Props/Prop_Chest", [1.5, 0.75, 0.73], { placement: "wall", back: 0.36 }),
    sf("Props/Prop_Barrel_Large", [0.51, 0.53, 1.1], { placement: "corner" }),
    sf("Props/Prop_Crate3", [1, 1, 1], { placement: "corner", yOffset: 0.5, scale: [1, 1], top: 0.5, snap: true }),
    sf("Props/Prop_Crate4", [1.12, 1.12, 1.12], { placement: "corner", yOffset: 0.56, scale: [1, 1], top: 0.56, snap: true }),
    sf("Props/Prop_PipeHolder", [4.12, 1.16, 0.93], { placement: "wall", back: 0.58, scale: [1, 1] }),
    sf("Props/Prop_ItemHolder", [1.04, 1.07, 0.44], { back: 0.51 }),
    sf("Props/Prop_Clamp", [0.56, 0.46, 0.16], { pivot: [0.08, 0], back: 0.24 }),
    sf("Props/Prop_Cable_1", [1.02, 1.65, 0.15], { yOffset: 0.02, back: 0.58 }),
    sf("Props/Prop_Vent_Big", [2, 0.98, 0.07], { yOffset: 0.07, scale: [1, 1], snap: true }),
    sf("Props/Prop_Light_Floor", [1.33, 0.52, 0.21], { placement: "wall", back: 0.26, scale: [1, 1] }),
    sf("Props/Prop_Light_Wide", [1.32, 0.45, 0.18], { placement: "wall", hung: true, yOffset: 4.1, back: 0.22, pivot: [-0.66, 0], scale: [1, 1] }),
    sf("Props/Prop_Light_Small", [0.86, 0.45, 0.18], { placement: "wall", hung: true, yOffset: 4.1, back: 0.22, pivot: [-0.43, 0], scale: [1, 1] }),
    sf("Columns/Column_Pipes", [0.87, 0.87, 5], { placement: "corner", scale: [0.94, 0.94], blocking: true }),
    sf("Aliens/Alien_Oculichrysalis", [0.81, 0.82, 1.53], { placement: "center", yOffset: 0.87, scale: [0.9, 1] }),
    sf("Aliens/Alien_Cyclop", [1.07, 1.22, 2.01], { placement: "center", yOffset: 1.09, back: 0.58, faceCenter: true }),
    sf("Decals/Decal_Logo", [2.29, 1.42, 0.01], { placement: "center", yOffset: 0.02, scale: [1, 1] }),
    sf("Decals/Decal_Dashes", [1.07, 0.33, 0.01], { yOffset: 0.02, scale: [1, 1], snap: true }),
    sf("Props/Prop_Vent_Small", [1, 0.62, 0.04], { yOffset: 0.01, scale: [1, 1], snap: true }),
    sf("Props/Prop_Vent_Wide", [1.94, 0.29, 0.06], { yOffset: 0.01, back: 0.13, scale: [1, 1], snap: true }),
    sf("Props/Prop_Pod", [2.13, 2.13, 4.13], { placement: "wall", back: 1.06, scale: [0.75, 0.75], blocking: true }),
    sf("Props/Prop_Pod_Short", [2.13, 2.13, 3.44], { placement: "wall", back: 1.06, scale: [0.75, 0.75], blocking: true }),
    sf("Props/Prop_Crate1", [1, 1, 1], { placement: "corner", yOffset: 0.5, scale: [1, 1], top: 0.5, snap: true }),
    sf("Props/Prop_Crate2", [1, 1, 1], { placement: "corner", yOffset: 0.5, scale: [1, 1], top: 0.5, snap: true }),
    sf("Props/Prop_Barrel_Small", [0.4, 0.58, 0.79], { placement: "corner", scale: [0.95, 1.05] }),
    sf("Props/Prop_Pipe_Medium_Straight", [0.28, 4, 0.28], { placement: "wall", hung: true, yOffset: 3.4, back: 0.16, front: "+x", scale: [1, 1] }),
    sf("Props/Prop_Pipe_Thick_Straight", [0.54, 4, 0.54], { placement: "wall", yOffset: 0.27, back: 0.28, front: "+x", scale: [1, 1] }),
    sf("Props/Prop_Fan_Big", [3.25, 3, 0.49], { placement: "center", yOffset: 0.02, scale: [0.7, 0.8] }),
    sf("Props/Prop_Teleporter", [4.38, 4.38, 0.8], { placement: "center", yOffset: 0.04, scale: [0.8, 0.85] }),
    sf("Props/Prop_AccessPoint_Short", [0.44, 0.66, 0.47], { placement: "wall", hung: true, yOffset: 0, back: 0.02, scale: [1, 1] }),
    sf("Decals/Decal_Warning", [2.68, 1.06, 0.01], { yOffset: 0.02, scale: [0.8, 0.9], snap: true }),
    sf("Decals/Decal_Caution", [2.66, 1.03, 0.01], { yOffset: 0.02, scale: [0.8, 0.9], snap: true }),
    sf("Decals/Decal_Arrows", [0.65, 0.42, 0.01], { yOffset: 0.02, scale: [1, 1.2], snap: true }),
    sf("Decals/Decal_Code", [2.5, 0.16, 0.01], { yOffset: 0.02, scale: [0.8, 1], snap: true }),
    sf("Columns/Column_Hollow", [1.21, 1.21, 5], { placement: "center", scale: [0.88, 0.92], blocking: true }),
    sf("Props/Prop_Fan_Small", [1.68, 1.68, 0.44], { yOffset: 0.05, scale: [0.85, 0.95] }),
    sf("Props/Prop_Pipe_Small_Straight", [0.14, 4, 0.14], { placement: "wall", hung: true, yOffset: 2.9, back: 0.09, front: "+x", scale: [1, 1] }),
    sf("Decals/Decal_Warning", [2.68, 0.01, 1.06], { id: "SF_Decal_Warning_Wall", placement: "wall", hung: true, stand: true, yOffset: 2.8, back: 0, scale: [0.6, 0.6] }),
    sf("Decals/Decal_Caution", [2.66, 0.01, 1.03], { id: "SF_Decal_Caution_Wall", placement: "wall", hung: true, stand: true, yOffset: 2.8, back: 0, scale: [0.6, 0.6] }),
    se("Prop_Desk_Small", [2.06, 1.03, 0.94], { placement: "wall", back: 0.53, top: 0.94, scale: [0.85, 0.85] }),
    se("Prop_Desk_Medium", [2.84, 1.03, 0.94], { placement: "wall", back: 0.53, top: 0.94, scale: [0.85, 0.85] }),
    se("Prop_Desk_L", [2.22, 2.22, 0.94], { placement: "wall", back: 1.42, pivot: [0.31, 0], top: 0.94, surface: { x: [-0.8, 1.42], z: [-1.42, -0.75] }, scale: [0.85, 0.85] }),
    se("Prop_Chair", [0.88, 1.12, 1.64], { front: "-z", back: 0.63, yOffset: 0.01, scale: [0.85, 0.85] }),
    se("Prop_Locker", [0.98, 0.5, 2.67], { placement: "wall", back: 0.23, blocking: true, scale: [0.85, 0.85] }),
    se("Prop_Shelves_ThinShort", [1.37, 0.54, 1.21], { placement: "wall", back: 0.27, top: 1.21, boards: [0.31], inner: [1.3, 0], scale: [0.85, 0.85] }),
    se("Prop_Shelves_WideShort", [1.98, 0.54, 1.21], { placement: "wall", back: 0.27, top: 1.21, boards: [0.31], inner: [1.9, 0], scale: [0.85, 0.85] }),
    se("Prop_Shelves_ThinTall", [1.37, 0.54, 2.67], { placement: "wall", back: 0.27, blocking: true, boards: [0.31, 1.05, 1.78], inner: [1.3, 0], scale: [0.85, 0.85] }),
    se("Prop_Shelves_WideTall", [1.98, 0.54, 2.67], { placement: "wall", back: 0.27, blocking: true, boards: [0.31, 1.05, 1.78], inner: [1.9, 0], scale: [0.85, 0.85] }),
    se("Prop_Chest", [1.84, 0.98, 0.94], { placement: "wall", back: 0.44, yOffset: -0.01, scale: [0.8, 0.85] }),
    se("Prop_Crate", [1.57, 1.5, 1.5], { placement: "corner", top: 1.5, snap: true, scale: [0.8, 0.9] }),
    se("Prop_Crate_Large", [3.47, 1.5, 1.5], { placement: "wall", top: 1.5, back: 0.75, scale: [0.8, 0.9] }),
    se("Prop_Crate_Tarp", [1.72, 1.72, 1.57], { placement: "corner", yOffset: 0.01, snap: true, scale: [0.8, 0.9] }),
    se("Prop_Crate_Tarp_Large", [3.22, 1.72, 1.57], { placement: "wall", yOffset: 0.01, back: 0.86, scale: [0.8, 0.9] }),
    se("Prop_Barrel1", [0.72, 0.65, 1.11], { placement: "corner", scale: [0.85, 0.95] }),
    se("Prop_Barrel2_Closed", [0.54, 0.54, 0.77], { placement: "corner", scale: [0.85, 0.95] }),
    se("Prop_Barrel2_Open", [0.54, 0.54, 1.1], { placement: "corner", scale: [0.85, 0.95] }),
    se("Prop_Ammo", [0.57, 0.72, 0.28], { scale: [0.85, 0.95] }),
    se("Prop_Ammo_Closed", [0.57, 0.72, 0.41], { top: 0.31, scale: [0.85, 0.95] }),
    se("Prop_Ammo_Small", [0.4, 0.43, 0.28], { scale: [0.85, 0.95] }),
    se("Prop_Mine", [0.81, 0.7, 0.82], { back: 0.24, scale: [0.8, 0.9] }),
    se("Prop_Mug", [0.18, 0.13, 0.17], { placement: "table", pivot: [0.03, 0], scale: [0.9, 1] }),
    se("Prop_HealthPack_Tube", [0.15, 0.15, 0.32], { placement: "table", yOffset: 0.14, scale: [0.8, 0.9] }),
    se("Prop_Syringe", [0.11, 0.11, 0.65], { placement: "table", yOffset: 0.16, scale: [0.5, 0.6] }),
    se("Prop_Grenade", [0.13, 0.09, 0.24], { placement: "table", yOffset: 0.13, scale: [0.8, 0.9] }),
    se("Gun_SMG_Ammo", [0.06, 0.04, 0.28], { placement: "table", yOffset: 0.16, scale: [0.9, 1] }),
    se("Gun_Sniper_Ammo", [0.14, 0.03, 0.16], { placement: "table", yOffset: 0.08, scale: [0.9, 1] }),
    se("Prop_KeyCard", [0.18, 0.48, 0.05], { placement: "table", lay: true, yOffset: 0.024, scale: [0.6, 0.7] }),
    se("Prop_HealthPack", [0.43, 0.18, 0.6], { placement: "table", yOffset: 0.26, back: 0.09, scale: [0.9, 1] }),
    se("Gun_Pistol", [0.44, 0.25, 0.07], { placement: "table", lay: true, yOffset: 0.035, scale: [0.8, 0.9] }),
    se("Gun_Revolver", [0.53, 0.26, 0.08], { placement: "table", lay: true, yOffset: 0.042, scale: [0.8, 0.9] }),
    se("Gun_Rifle", [1.06, 0.37, 0.09], { placement: "table", lay: true, yOffset: 0.044, scale: [0.85, 0.9] }),
    se("Gun_Sniper", [1.72, 0.33, 0.06], { placement: "table", lay: true, yOffset: 0.031, scale: [0.85, 0.9] }),
];

const sn = (file, size, o = {}) => prop(`SN_${file}`, size, { src: `${SN}${file}.glb`, ...o });

const DUNGEON_LIST = [
    dc("prop_sarcophagus", [1.09, 2.07, 0.9], { placement: "center", yOffset: 0.01, blocking: true }),
    dc("prop_cage_hanging", [0.68, 0.67, 2.96], { placement: "center", scale: [1, 1] }),
    dc("prop_brazier_stand", [0.98, 0.98, 1.2], { placement: "corner", yOffset: 0.01 }),
    dc("prop_brazier_hanging", [1, 1, 3.01], { placement: "center", scale: [1, 1] }),
    dc("prop_tombstone_cross", [0.82, 0.48, 1.46], { placement: "wall", back: 0.24, yOffset: 0.01 }),
    dc("prop_altar", [1.61, 1.11, 1.28], { placement: "wall", back: 0.56, yOffset: 0.01, blocking: true, top: 1.28, surface: { x: [-0.3, 0.3], z: [-0.4, 0.4] } }),
    dc("pillar_broken", [1.76, 0.95, 1.73], { placement: "corner", pivot: [0.21, 0], yOffset: 0.01, blocking: true }),
    dp("Coffin", [2.03, 0.83, 0.7], { placement: "center", back: 0.41 }),
    hung("DP_WallChain_1", [0.4, 0.37, 2.07], 0.8, 0, { src: `${TILES}Dungeon%20Props/WallChain_1.glb`, scale: [1, 1] }),
    hung("DP_WallChain_2", [2.4, 0.37, 2.07], 0.8, 0, { src: `${TILES}Dungeon%20Props/WallChain_2.glb`, scale: [1, 1] }),
    dp("HeadClamp", [0.78, 0.34, 0.13], { scale: [0.9, 1.1] }),
    dp("SpikeTrap", [2.3, 2.3, 0.65], { placement: "center", scale: [0.8, 0.9] }),
    dp("LargeBone", [3.25, 0.26, 0.31], { scale: [0.3, 0.45] }),
    bn("BN_BonePile_1", [0.84, 0.95, 0.29], { scale: [0.8, 0.95] }),
    bn("BN_BonePile_2", [1.12, 0.78, 0.26], { scale: [0.8, 0.95] }),
    bn("BN_BonePile_3", [0.61, 0.58, 0.42], { scale: [0.8, 0.95] }),
    bn("BN_BonePile_4", [0.94, 1.09, 0.17], { scale: [0.8, 0.95] }),
    bn("BN_BonePile_5", [0.51, 0.53, 0.48], { scale: [0.8, 0.95] }),
    bn("BN_BonePile_6", [0.99, 0.96, 0.38], { scale: [0.8, 0.95] }),
    bn("BN_BonePile_7", [0.78, 0.76, 0.24], { scale: [0.8, 0.95] }),
    bn("BN_BonePile_8", [0.55, 0.6, 0.5], { scale: [0.8, 0.95] }),
    bn("BN_Skull_1", [0.19, 0.32, 0.24], { scale: [0.8, 0.9] }),
];

const RUINS_LIST = [
    sn("Grass_Common_Short", [0.64, 0.74, 1.33], { scale: [0.45, 0.7] }),
    sn("Grass_Wispy_Short", [1.32, 1.21, 1.07], { scale: [0.45, 0.7] }),
    sn("Clover_1", [0.8, 0.76, 1.14], { scale: [0.35, 0.55] }),
    sn("Fern_2", [1.68, 1.79, 0.78], { scale: [0.45, 0.7] }),
    sn("Fern_1", [2.83, 2.65, 0.84], { placement: "corner", scale: [0.4, 0.55] }),
    sn("Bush_Long_1", [1.68, 1.64, 2.37], { placement: "corner", scale: [0.35, 0.5] }),
];

const MODERN_LIST = modernProps(prop);

export const SCATTER_KIT_PROPS = { scifi: SCIFI_LIST, dungeon: DUNGEON_LIST, ruins: RUINS_LIST, modern: MODERN_LIST };

const PROP_BY_ID = Object.fromEntries([...PROP_LIST, ...ATTACH_LIST, ...WORN_LIST, ...SCIFI_LIST, ...DUNGEON_LIST, ...RUINS_LIST, ...MODERN_LIST].map((p) => [p.id, p]));

const furnish = (id, icon, weights, { family = "fantasy", ...rules }) => ({
    name: `levels3dpreview.scatter.sets.${id}`,
    kind: "furnish",
    family,
    icon,
    assets: Object.entries(weights).map(([pid, weight]) => ({ ...PROP_BY_ID[pid], weight })),
    rules: { clearance: 1, wallGap: 0.05, ...rules },
});

const TAVERN_TABLE = ["Mug", "Mug", "Table_Plate", "Table_Plate", "Table_Fork", "Table_Knife", "Table_Spoon", "Chalice", "Bottle_1", "Bottle_2", "Candle_1", "CandleStick", "Coin_Pile"];
const DINING_TABLE = ["Table_Plate", "Table_Plate", "Table_Plate", "Table_Fork", "Table_Knife", "Table_Spoon", "Chalice", "Chalice", "Chalice_Golden", "Bottle_1", "Bottle_2", "CandleStick_Triple", "Candle_2", "Pot_2_Lid", "Mug"];
const FEAST_TABLE = [...DINING_TABLE, "Pot_1_Lid", "Mug", "Mug", "FarmCrate_Apple", "FarmCrate_Oranges"];
const KITCHEN_TOP = ["Pot_1", "Pot_1_Lid", "Pot_2", "Pot_2_Lid", "Pan_1", "Pan_2", "Table_Plate", "Table_Plate", "Mug", "Table_Knife", "Table_Spoon", "Bottle_1", "Bottle_2", "Vase_4", "FarmCrate_Apple", "FarmCrate_GreenApples", "FarmCrate_Leek", "FarmCrate_Carrot"];
const KEEPSAKES = ["Candle_1", "CandleStick", "Book_5", "Book_Stack_3", "Bottle_1", "Vase_4", "Page_Stack_Large", "Pouch_Small", "Coin_Pile", "Key_Metal", "Potion_6", "Chalice", "Mug"];
const LIGHTS = (lo, hi, perWall = 4) => ({ place: "wall", items: ["Torch_Metal", "Lantern_Wall"], count: [lo, hi], perWall });

const SPEC_KEYS = ["around", "ends", "side", "foot", "front", "top", "shelves", "rack", "attach", "under"];
const groupIds = (g) => [...(g.keep ?? []), ...(g.items ?? []), ...(g.alt ?? []), ...SPEC_KEYS.flatMap((k) => (g[k] ? groupIds(g[k]) : []))];
const zeroWeights = (groups) => Object.fromEntries(groups.flatMap(groupIds).map((pid) => [pid, 0]));
const kitFurnish = (id, icon, clutter, rules) =>
    furnish(id, icon, { ...zeroWeights(rules.groups.filter((g) => !g.appended)), ...clutter, ...zeroWeights(rules.groups.filter((g) => g.appended)) }, rules);
const clutterOf = (ids, w) => Object.fromEntries(ids.map((pid) => [pid, w]));

const FURNISH_SETS = {
    tavern: furnish("tavern", "fa-solid fa-beer-mug-empty",
        { Table_Large: 0, Chair_1: 0, Chair_2: 0, Bench: 0, Stool: 0.2, Barrel: 0.25, Barrel_Dark: 0.1, Barrel_Apples: 0.1, Crate_Wooden: 0.2, Bucket_Wooden_1: 0.1, Bag: 0.05, Barrel_Holder: 0, Shelf_Simple: 0, Torch_Metal: 0, Banner_1_Cloth: 0, Chandelier: 0, Chandelier_Large: 0, Rug_Round: 0, ...Object.fromEntries(TAVERN_TABLE.map((t) => [t, 0])) },
        {
            minCells: 9,
            groups: [
                { place: "center", items: ["Table_Large"], count: [1, 4], perArea: 6, margin: 1,
                    around: { items: ["Chair_1", "Chair_1", "Chair_2", "Stool"], alt: ["Bench"], sides: "long", per: [2, 4], face: "in", gap: 0.1 },
                    ends: { items: ["Chair_1", "Chair_2", "Stool"], chance: 0.8, face: "in", gap: 0.1 },
                    top: { items: TAVERN_TABLE, count: [3, 7] },
                    under: { items: ["Rug_Round"], chance: 0.3 } },
                { place: "ceiling", items: ["Chandelier", "Chandelier_Large"], count: [1, 2], perArea: 16, over: "Table_Large" },
                { place: "corner", items: ["Barrel", "Barrel", "Barrel_Dark", "Barrel_Apples", "Crate_Wooden"], count: [1, 3], cluster: [1, 3] },
                { place: "wall", items: ["Barrel_Holder"], count: [0, 1] },
                { place: "wall", items: ["Shelf_Simple"], count: [0, 2], top: { items: ["Bottle_1", "Mug", "Chalice"], count: [2, 4] } },
                { place: "wall", items: ["Torch_Metal"], count: [1, 6], perWall: 3 },
                { place: "wall", items: ["Banner_1_Cloth"], count: [0, 1] },
                { place: "floor", items: ["Stool", "Bucket_Wooden_1", "Bag"], count: [0, 2] },
            ],
        }),
    bedroom: kitFurnish("bedroom", "fa-solid fa-bed", clutterOf(["Bag", "Bag_2", "Bucket_Wooden_1", "Stool"], 0.25), {
        minCells: 4,
        groups: [
            { place: "wall", items: ["Bed_Twin1", "Bed_Twin2", "Bed_Twin3", "Bed_Double", "Bed_Double2"], count: [1, 3], perArea: 10,
                side: { items: ["Nightstand_Shelf", "Nightstand_Drawer"], chance: 0.9, at: "back", gap: 0.1, top: { items: ["Candle_1", "CandleStick", "Book_Stack_1", "Mug", "Book_5", "Potion_6"], count: [1, 3] } },
                foot: { items: ["Chest_Wood"], chance: 0.7, face: "out", gap: 0.15 },
                under: { items: ["Rug_Round", "Rug_1"], chance: 0.8, at: "front" } },
            { place: "wall", items: ["Dresser_1", "Dresser_1", "Cabinet"], count: [1, 1], top: { items: KEEPSAKES, count: [2, 4] } },
            { place: "wall", items: ["Desk"], count: [0, 1], minRoom: 6, front: { items: ["Chair_1", "Chair_2"], chance: 0.9, face: "in", gap: 0.05, walk: true },
                top: { items: ["Book_Open", "Candle_1", "CandleStick", "Parchment", "Scroll_1", "Book_Stack_2", "Page_Stack_Small", "Mug", "Potion_6"], count: [2, 4] } },
            { place: "wall", items: ["Chest_Wood", "Cabinet"], count: [0, 1], minRoom: 9 },
            { place: "wall", items: ["Shelf_Simple", "Shelf_Small"], count: [1, 2], perWall: 4, top: { items: ["Book_Stack_1", "Candle_1", "Bottle_1", "Vase_4"], count: [1, 3] }, shelves: { items: ["Book_5", "Book_Stack_4", "Bottle_1", "SmallBottles_2", "Vase_4", "Candle_1"], fill: [0.4, 0.7] } },
            { place: "wall", items: ["Peg_Rack", "Banner_2_Cloth"], count: [0, 1], minRoom: 6 },
            LIGHTS(1, 2),
            { place: "corner", items: ["CandleStick_Stand", "Vase_3", "Vase_1"], count: [1, 2] },
            { place: "floor", items: ["Bag", "Bag_2", "Bucket_Wooden_1", "Stool"], count: [1, 2] },
        ],
    }),
    library: furnish("library", "fa-solid fa-book",
        { Bookcase_2: 0, BookStand: 0, Table_Large: 0, Chair_1: 0, Shelf_Simple: 0, CandleStick_Stand: 0, Torch_Metal: 0, Book_Stack_1: 0.4, Book_Stack_2: 0.4, Stool: 0.2, Book_5: 0, Book_7: 0, Scroll_1: 0, Scroll_2: 0, Candle_1: 0, CandleStick_Triple: 0, Book_Open: 0, Page_Single: 0, BookGroup_Small_1: 0, BookGroup_Small_2: 0, BookGroup_Medium_1: 0, BookGroup_Medium_2: 0, Book_Stack_3: 0, Book_Stack_4: 0, Page_Stack_Large: 0, Page_Stack_Small: 0, Rug_Round: 0 },
        {
            minCells: 6,
            groups: [
                { place: "wall", items: ["Bookcase_2"], fill: 0.7, count: [2, 12], shelves: { items: ["BookGroup_Medium_1", "BookGroup_Medium_2", "BookGroup_Small_1", "BookGroup_Small_2"], fill: [0.6, 0.9] } },
                { place: "center", items: ["Table_Large"], count: [0, 2], perArea: 16, margin: 1,
                    around: { items: ["Chair_1"], sides: "long", per: [1, 2], face: "in", gap: 0.1 },
                    top: { items: ["Book_Stack_1", "Book_Stack_2", "Book_Stack_3", "Book_Stack_4", "Book_5", "Book_7", "Scroll_1", "Scroll_2", "Book_Open", "Page_Single", "Page_Stack_Large", "Page_Stack_Small", "Candle_1", "CandleStick_Triple", "BookGroup_Small_1"], count: [3, 6] },
                    under: { items: ["Rug_Round"], chance: 0.7 } },
                { place: "floor", items: ["BookStand"], count: [0, 2] },
                { place: "wall", items: ["Shelf_Simple"], count: [0, 2], top: { items: ["BookGroup_Medium_1", "BookGroup_Medium_2", "BookGroup_Small_2", "Book_Stack_4", "Page_Stack_Large"], count: [1, 1] } },
                { place: "corner", items: ["CandleStick_Stand"], count: [0, 2] },
                { place: "wall", items: ["Torch_Metal"], count: [0, 2], perWall: 4 },
                { place: "floor", items: ["Stool"], count: [0, 1] },
            ],
        }),
    storage: furnish("storage", "fa-solid fa-boxes-stacked",
        { Crate_Wooden: 0.25, Crate_Metal: 0.1, Barrel: 0.2, Barrel_Dark: 0.06, Barrel_Apples: 0.05, FarmCrate_Apple: 0.06, FarmCrate_GreenApples: 0.04, FarmCrate_Oranges: 0.04, Bag_2: 0.05, FarmCrate_Carrot: 0.06, FarmCrate_Empty: 0.06, Bag: 0.1, Bucket_Wooden_1: 0.04, Rope_1: 0.03, Rope_2: 0.03, Chain_Coil: 0.02, Barrel_Holder: 0, Shelf_Arch: 0, Peg_Rack: 0, Pot_1: 0, Vase_4: 0, Bottle_1: 0, Potion_2: 0, Torch_Metal: 0 },
        {
            minCells: 2,
            groups: [
                { place: "corner", items: ["Crate_Wooden", "Crate_Wooden", "Crate_Metal", "Barrel", "Barrel", "Barrel_Dark"], count: [2, 4], cluster: [2, 5],
                    top: { items: ["FarmCrate_Empty", "FarmCrate_Apple", "Bag"], count: [0, 1] } },
                { place: "wall", items: ["Barrel_Holder", "Shelf_Arch"], count: [0, 3], perWall: 4, shelves: { items: ["Vase_4", "Bottle_1", "Bottle_1", "Potion_2"], fill: [0.4, 0.7] } },
                { place: "wall", items: ["Crate_Wooden", "Barrel", "FarmCrate_Carrot", "FarmCrate_Apple", "FarmCrate_GreenApples", "FarmCrate_Oranges", "Bag", "Bag_2"], fill: 0.4, count: [1, 10], cluster: [1, 3] },
                { place: "wall", items: ["Peg_Rack"], count: [0, 1] },
                { place: "wall", items: ["Torch_Metal"], count: [0, 2], perWall: 5 },
                { place: "floor", items: ["Rope_1", "Rope_2", "Chain_Coil", "Bucket_Wooden_1", "Bag", "Bag_2"], count: [1, 3] },
            ],
        }),
    kitchen: kitFurnish("kitchen", "fa-solid fa-utensils", clutterOf(["Bucket_Wooden_1", "Bucket_Wooden_2", "Bucket_Metal", "Stool", "Bag", "Bag_2"], 0.2), {
        minCells: 4,
        groups: [
            { place: "wall", items: ["Workbench", "Workbench", "Desk"], count: [1, 3], perWall: 3, top: { items: KITCHEN_TOP, count: [3, 6] } },
            { place: "center", items: ["CampfireTripod"], count: [1, 1], minRoom: 12, margin: 0.75 },
            { place: "center", items: ["Cauldron"], count: [1, 1], margin: 0.5 },
            { place: "center", items: ["Table_Large"], count: [0, 1], perArea: 12, margin: 1,
                around: { items: ["Stool"], sides: "long", per: [1, 2], face: "in", gap: 0.15 },
                top: { items: KITCHEN_TOP, count: [3, 6] } },
            { place: "corner", items: ["Barrel_Apples", "Barrel", "Barrel_Dark", "FarmCrate_Apple", "FarmCrate_Carrot", "FarmCrate_Radish", "FarmCrate_Leek", "Vase_2"], count: [2, 3], cluster: [1, 3] },
            { place: "wall", items: ["Bag", "Bag_2", "Bag", "Barrel", "FarmCrate_Radish", "FarmCrate_Leek"], count: [1, 2], perWall: 5, cluster: [2, 3] },
            { place: "wall", items: ["Barrel_Holder"], count: [0, 1], minRoom: 9 },
            { place: "wall", items: ["Shelf_Simple", "Shelf_Simple", "Shelf_Small"], count: [1, 3], perWall: 3, top: { items: ["Pot_1", "Pot_1_Lid", "Table_Plate", "Mug", "Bottle_1", "Vase_4"], count: [2, 3] }, shelves: { items: ["Pot_1", "Mug", "Bottle_1", "Bottle_2", "Vase_4", "Table_Plate"], fill: [0.5, 0.8] } },
            { place: "wall", items: ["Peg_Rack"], count: [0, 1] },
            LIGHTS(1, 2),
            { place: "floor", items: ["Bucket_Wooden_1", "Bucket_Wooden_2", "Bucket_Metal", "Stool", "Bag", "Bag_2"], count: [1, 3] },
        ],
    }),
    smithy: furnish("smithy", "fa-solid fa-hammer",
        { Anvil_Log: 0, Whetstone: 0, Workbench: 0, WeaponStand: 0, Crate_Metal: 0.25, Barrel: 0.2, Bucket_Metal: 0.2, Chain_Coil: 0.15, Rope_2: 0.1, Stool: 0.1, Axe_Bronze: 0, Pickaxe_Bronze: 0, Sword_Bronze: 0, Shield_Wooden: 0, Peg_Rack: 0, Torch_Metal: 0, Key_Metal: 0, Rope_1: 0, FirePit: 0, Bellows: 0, Workbench_Vice: 0, Hammer_Rack: 0, Shelf_Sword: 0, Hammer_Large_Steel: 0, Hammer_Medium_Bronze: 0, Pickaxe_Steel: 0, Shovel_Bronze: 0, Shovel_Steel: 0, Hoe_Bronze: 0, Hoe_Steel: 0 },
        {
            minCells: 4,
            groups: [
                { place: "corner", items: ["FirePit"], count: [1, 1], side: { items: ["Bellows"], chance: 0.9, gap: 0.15 } },
                { place: "center", items: ["Anvil_Log"], count: [1, 2], perArea: 12, margin: 0.75 },
                { place: "floor", items: ["Whetstone"], count: [0, 1] },
                { place: "wall", items: ["Workbench"], count: [1, 2], perWall: 5, attach: { items: ["Workbench_Vice"], chance: 0.8 }, top: { items: ["Chain_Coil", "Rope_1", "Key_Metal", "Bucket_Metal"], count: [1, 2] } },
                { place: "wall", items: ["Hammer_Rack"], count: [1, 1] },
                { place: "wall", items: ["WeaponStand"], count: [0, 2], perWall: 5, rack: { items: ["Sword_Bronze", "Axe_Bronze", "Pickaxe_Bronze"], count: [2, 4] } },
                { place: "wall", items: ["Shovel_Bronze", "Shovel_Steel", "Hoe_Bronze", "Hoe_Steel"], count: [1, 3], perWall: 3, cluster: [1, 3] },
                { place: "wall", items: ["Axe_Bronze", "Pickaxe_Bronze", "Pickaxe_Steel", "Hammer_Large_Steel", "Hammer_Medium_Bronze", "Shelf_Sword", "Shield_Wooden", "Peg_Rack"], count: [1, 6], perWall: 2 },
                { place: "corner", items: ["Crate_Metal", "Barrel"], count: [1, 2], cluster: [1, 2] },
                { place: "wall", items: ["Torch_Metal"], count: [1, 3], perWall: 4 },
                { place: "floor", items: ["Bucket_Metal", "Chain_Coil", "Rope_2", "Stool"], count: [1, 3] },
            ],
        }),
    alchemy: furnish("alchemy", "fa-solid fa-flask",
        { Cauldron: 0, Workbench: 0, Table_Large: 0, Stool: 0.3, Shelf_Small_Bottles: 0, Shelf_Simple: 0, Bookcase_2: 0, Cabinet: 0, Vase_2: 0.25, Vase_4: 0.25, Cage_Small: 0.2, CandleStick_Stand: 0, Potion_1: 0, Potion_2: 0, Potion_3: 0, Potion_4: 0, Potion_5: 0, Potion_7: 0, Potion_8: 0, SmallBottle: 0, SmallBottles_1: 0, Bottle_1: 0, Book_5: 0, Scroll_1: 0, Candle_1: 0, CandleStick_Triple: 0, Chalice: 0, Pot_1: 0 },
        {
            minCells: 4,
            groups: [
                { place: "center", items: ["Cauldron"], count: [1, 1], margin: 0.75 },
                { place: "wall", items: ["Workbench", "Table_Large"], count: [1, 2], perWall: 5,
                    front: { items: ["Stool"], chance: 0.7, face: "in", gap: 0.15 },
                    top: { items: ["Potion_1", "Potion_2", "Potion_3", "Potion_4", "Potion_5", "Potion_7", "Potion_8", "SmallBottle", "SmallBottles_1", "Bottle_1", "Book_5", "Scroll_1", "Candle_1", "CandleStick_Triple", "Chalice", "Pot_1"], count: [4, 8] } },
                { place: "wall", items: ["Shelf_Small_Bottles"], count: [1, 2] },
                { place: "wall", items: ["Shelf_Simple"], count: [0, 2], top: { items: ["Potion_1", "Potion_2", "Potion_4", "Potion_8", "SmallBottles_1"], count: [2, 4] } },
                { place: "wall", items: ["Bookcase_2", "Cabinet"], count: [0, 1], top: { items: ["Potion_2", "Vase_4", "Candle_1"], count: [0, 2] } },
                { place: "corner", items: ["Vase_2", "Vase_4", "Cage_Small", "CandleStick_Stand"], count: [1, 3] },
                { place: "floor", items: ["Vase_4", "Cage_Small"], count: [0, 1] },
            ],
        }),
    shop: furnish("shop", "fa-solid fa-store",
        { Stall_Empty: 0, Stall_Cart_Empty: 0, Cabinet: 0, Workbench: 0, Shelf_Arch: 0, Barrel_Apples: 0.25, FarmCrate_Apple: 0.2, FarmCrate_Carrot: 0.2, Crate_Wooden: 0.15, Bag: 0.15, Vase_2: 0.05, Coin_Pile: 0, Coin_Pile_2: 0, Pouch_Large: 0, Potion_1: 0, Potion_2: 0, SmallBottles_1: 0, Scroll_1: 0, Bottle_1: 0, Vase_4: 0, Key_Metal: 0, Torch_Metal: 0, Banner_1: 0 },
        {
            minCells: 4,
            groups: [
                { place: "counter", items: ["Cabinet", "Cabinet", "Workbench"], count: [2, 3],
                    top: { items: ["Coin_Pile", "Coin_Pile_2", "Pouch_Large", "Potion_2", "Scroll_1", "Bottle_1", "Key_Metal", "Vase_4"], count: [2, 3] } },
                { place: "wall", items: ["Shelf_Arch"], count: [1, 3], perWall: 3, shelves: { items: ["Vase_4", "Bottle_1", "Potion_1", "Potion_2", "SmallBottles_1"], fill: [0.5, 0.8] } },
                { place: "wall", items: ["Stall_Empty"], count: [0, 2], perWall: 5, minRoom: 30, top: { items: ["FarmCrate_Apple", "FarmCrate_Carrot", "Bag", "Potion_2"], count: [2, 4] } },
                { place: "center", items: ["Stall_Cart_Empty"], count: [0, 1], perArea: 20, margin: 1, minRoom: 30, top: { items: ["FarmCrate_Apple", "FarmCrate_Carrot", "Bag"], count: [2, 4] } },
                { place: "corner", items: ["Barrel_Apples", "Crate_Wooden", "Vase_2"], count: [1, 3], cluster: [1, 3] },
                { place: "wall", items: ["Barrel_Apples", "FarmCrate_Apple", "FarmCrate_Carrot", "Crate_Wooden", "Bag"], count: [1, 3], cluster: [2, 3] },
                { place: "wall", items: ["Torch_Metal"], count: [0, 2], perWall: 4 },
                { place: "wall", items: ["Banner_1"], count: [0, 1], exterior: true },
            ],
        }),
    armory: furnish("armory", "fa-solid fa-shield-halved",
        { WeaponStand: 0, Dummy: 0, Chest_Wood: 0, Crate_Metal: 0.3, Barrel: 0.2, Crate_Wooden: 0.2, Bag: 0.1, Chain_Coil: 0.1, Rope_2: 0.1, Shield_Wooden: 0, Shield_Metal: 0, Sword_Bronze: 0, Sword_Steel: 0, Axe_Bronze: 0, Axe_Steel: 0, Peg_Rack: 0, Banner_1_Cloth: 0, Banner_2_Cloth: 0, Torch_Metal: 0 },
        {
            minCells: 4,
            groups: [
                { place: "wall", items: ["WeaponStand"], count: [1, 4], perWall: 3, rack: { items: ["Sword_Bronze", "Sword_Steel", "Axe_Bronze", "Axe_Steel"], count: [2, 4] } },
                { place: "wall", items: ["Shield_Wooden", "Shield_Metal", "Sword_Bronze", "Sword_Steel", "Axe_Bronze", "Axe_Steel", "Peg_Rack"], count: [2, 8], perWall: 1.5 },
                { place: "wall", items: ["Banner_1_Cloth", "Banner_2_Cloth"], count: [0, 2], perWall: 5 },
                { place: "center", items: ["Dummy"], count: [0, 2], perArea: 10, margin: 1 },
                { place: "wall", items: ["Chest_Wood"], count: [0, 2] },
                { place: "corner", items: ["Crate_Metal", "Barrel", "Crate_Wooden"], count: [1, 3], cluster: [1, 3] },
                { place: "wall", items: ["Torch_Metal"], count: [1, 3], perWall: 4 },
                { place: "floor", items: ["Chain_Coil", "Rope_2", "Bag"], count: [0, 2] },
            ],
        }),
    dining: kitFurnish("dining", "fa-solid fa-wine-glass", clutterOf(["Vase_4", "Bucket_Wooden_1"], 0.2), {
        minCells: 6,
        groups: [
            { place: "center", items: ["Table_Large"], count: [1, 2], perArea: 16, margin: 1,
                around: { items: ["Chair_1", "Chair_1", "Chair_2"], sides: "long", per: [2, 3], face: "in", gap: 0.1 },
                ends: { items: ["Chair_3"], chance: 0.9, face: "in", gap: 0.1 },
                top: { items: DINING_TABLE, count: [7, 11] },
                under: { items: ["Rug_Round"], chance: 0.4 } },
            { place: "ceiling", items: ["Chandelier", "Chandelier_Large"], count: [1, 2], perArea: 12, over: "Table_Large" },
            { place: "wall", items: ["Cabinet", "Dresser_1"], count: [1, 2], perWall: 5, top: { items: ["Bottle_1", "Bottle_2", "Chalice", "Chalice_Golden", "Table_Plate", "CandleStick", "Pot_2_Lid", "Vase_4"], count: [2, 4] } },
            { place: "wall", items: ["Shelf_Simple", "Shelf_Small"], count: [0, 2], perWall: 4, top: { items: ["Table_Plate", "Mug", "Chalice", "Bottle_1"], count: [2, 3] }, shelves: { items: ["Table_Plate", "Mug", "Chalice", "Bottle_2"], fill: [0.5, 0.8] } },
            { place: "corner", items: ["CandleStick_Stand"], count: [1, 2] },
            { place: "corner", items: ["Vase_1", "Vase_3", "Barrel_Dark"], count: [0, 1] },
            LIGHTS(1, 3),
            { place: "wall", items: ["Banner_1_Cloth", "Banner_2_Cloth"], count: [0, 2], perWall: 5 },
        ],
    }),
    greatHall: kitFurnish("greatHall", "fa-solid fa-crown", clutterOf(["Mug", "Bucket_Wooden_1"], 0.2), {
        minCells: 12,
        groups: [
            { place: "wall", items: ["Chair_3"], count: [1, 1], mid: true, front: { items: ["Rug_Round"], chance: 1, gap: -0.3, walk: true }, side: { items: ["CandleStick_Stand", "DC_prop_brazier_stand"], chance: 1, gap: 0.4 } },
            { place: "center", items: ["Table_Large"], count: [2, 4], perArea: 9, margin: 1.2, even: true, under: { items: ["Rug_Round"], chance: 0.5 },
                around: { items: ["Chair_1", "Chair_2", "Chair_1"], alt: ["Bench"], sides: "long", per: [2, 3], face: "in", gap: 0.1 },
                ends: { items: ["Chair_1", "Chair_2"], chance: 0.5, face: "in", gap: 0.1 },
                top: { items: FEAST_TABLE, count: [6, 10] } },
            { place: "ceiling", items: ["Chandelier_Large", "Chandelier"], count: [1, 3], perArea: 12, over: "Table_Large" },
            { place: "wall", items: ["Banner_1_Cloth", "Banner_2_Cloth"], count: [2, 8], perWall: 2.5 },
            { place: "wall", items: ["Shield_Wooden", "Shield_Metal", "Shield_Metal", "Sword_Steel", "Axe_Double_Steel"], count: [2, 6], perWall: 2.5 },
            { place: "corner", items: ["DC_prop_brazier_stand", "FirePit"], count: [2, 4] },
            { place: "wall", items: ["Banner_Vertical_1", "Banner_Vertical_2"], count: [0, 2], perWall: 6, minRoom: 20 },
            { place: "wall", items: ["Barrel_Holder", "WeaponStand"], count: [0, 1], minRoom: 24, rack: { items: ["Sword_Steel", "Axe_Steel"], count: [2, 3] } },
            { place: "wall", items: ["Torch_Metal"], count: [2, 6], perWall: 3 },
        ],
    }),
    corridor: kitFurnish("corridor", "fa-solid fa-arrows-left-right", {}, {
        minCells: 2,
        groups: [
            { place: "wall", items: ["Torch_Metal"], count: [2, 8], perWall: 2.5 },
            { place: "wall", items: ["Banner_1_Cloth", "Banner_2_Cloth", "Shield_Wooden", "Shield_Metal", "Peg_Rack", "Shelf_Simple"], count: [1, 4], perWall: 3.5, top: { items: ["Candle_1", "Bottle_1", "Vase_4", "Book_Stack_1"], count: [1, 2] } },
            { place: "wall", items: ["Bench", "Barrel", "Crate_Wooden", "Vase_3", "Vase_1", "Bag_2", "Chest_Wood"], count: [0, 2], perWall: 6 },
            { place: "corner", items: ["Barrel", "Crate_Wooden", "Vase_1"], count: [0, 1] },
        ],
    }),
};

const SF_LIGHTS = { place: "wall", items: ["SF_Prop_Light_Wide", "SF_Prop_Light_Wide", "SF_Prop_Light_Small"], count: [1, 4], perWall: 3 };
const SE_CHAIR = { items: ["SE_Prop_Chair"], chance: 0.9, gap: 0.05, face: "in", walk: true };
const SE_MED = ["SE_Prop_Syringe", "SE_Prop_HealthPack_Tube", "SE_Prop_HealthPack_Tube"];
const SE_AMMO = ["SE_Prop_Ammo_Small", "SE_Prop_Ammo_Closed", "SE_Prop_Ammo"];
const SE_GUNS = ["SE_Gun_Rifle", "SE_Gun_Sniper", "SE_Gun_Pistol", "SE_Gun_Revolver"];
const SF_PODS = ["SF_Prop_Pod", "SF_Prop_Pod_Short"];
const SF_SIGN_OF = { SF_Decal_Warning: "SF_Decal_Warning_Wall", SF_Decal_Caution: "SF_Decal_Caution_Wall" };
const SF_DECALS = (ids, hi = 1) => {
    const floor = ids.filter((id) => !SF_SIGN_OF[id]);
    return { place: floor.length ? "floor" : null, keep: ids, items: floor, count: [0, hi] };
};
const SF_SIGNS = (ids, hi = 1) => ({ place: "wall", items: ids.map((id) => SF_SIGN_OF[id]), count: [0, hi], perWall: 5, appended: true });
const DG_TORCHES = (lo, hi, perWall = 4) => ({ place: "wall", items: ["Torch_Metal", W("Torch_Metal")], count: [lo, hi], perWall });
const RU_TORCHES = (lo, hi, perWall = 5) => ({ place: "wall", items: [W("Torch_Metal")], count: [lo, hi], perWall });
const SHARDS = [W("Vase_Rubble_Medium"), W("Vase_Rubble_Large"), W("Vase_Rubble_Small")];
const RUBBLE = [...SHARDS, W("Vase_Rubble_Small")];
const BONES = [W("Skull"), W("Skull_Top"), "Skull"];
const FLOOR_BONES = [...BONES, "BN_Skull_1"];
const BONE_PILES = ["BN_BonePile_1", "BN_BonePile_2", "BN_BonePile_3", "BN_BonePile_4", "BN_BonePile_5", "BN_BonePile_6", "BN_BonePile_7", "BN_BonePile_8"];
const URNS = [W("Vase_1"), W("Vase_3"), W("Vase_2"), W("Vase_4")];
const WEEDS = ["SN_Grass_Common_Short", "SN_Grass_Common_Short", "SN_Grass_Wispy_Short", "SN_Clover_1", "SN_Fern_2"];

const KIT_FURNISH_SETS = {
    sfBridge: kitFurnish("sfBridge", "fa-solid fa-satellite-dish", clutterOf(["SF_Prop_Vent_Small", "SF_Prop_Clamp"], 0.5), {
        family: "scifi",
        minCells: 4,
        groups: [
            { place: "wall", items: ["SF_Prop_Computer"], count: [1, 1], cluster: [3, 5], mid: true, front: { ...SE_CHAIR, chance: 0.6 } },
            { place: "center", items: ["SE_Prop_Chair"], count: [1, 1], minRoom: 6, margin: 0.5, faceTo: "SF_Prop_Computer", under: { items: ["SF_Decal_Logo"], chance: 1 } },
            { place: "wall", items: ["SF_Prop_Computer"], count: [1, 2], cluster: [1, 2], perWall: 5, minRoom: 9, front: SE_CHAIR },
            { place: "wall", items: ["SE_Prop_Desk_Medium", "SE_Prop_Desk_L"], count: [0, 1], perWall: 6, minRoom: 16, front: SE_CHAIR, top: { items: ["SE_Prop_Mug", "SE_Gun_Sniper_Ammo"], count: [1, 2] } },
            { place: "wall", items: ["SE_Prop_Locker"], count: [0, 1], cluster: [1, 2] },
            { place: "corner", items: ["SF_Column_Pipes"], count: [2, 4] },
            { place: "wall", items: ["SF_Prop_AccessPoint_Short"], count: [0, 2], perWall: 6 },
            SF_LIGHTS,
            { place: "floor", items: ["SF_Prop_Vent_Small", "SF_Prop_Clamp"], count: [0, 1] },
            SF_DECALS(["SF_Decal_Arrows", "SF_Decal_Code"]),
        ],
    }),
    sfEngineering: kitFurnish("sfEngineering", "fa-solid fa-gears", clutterOf(["SF_Prop_Cable_1", "SF_Prop_Clamp", "SF_Prop_Vent_Big"], 0.4), {
        family: "scifi",
        minCells: 4,
        groups: [
            { place: "center", items: ["SF_Column_Hollow"], count: [1, 1], minRoom: 9, margin: 1, under: { items: ["SF_Prop_Fan_Small"], chance: 1 },
                around: { items: ["SF_Prop_Barrel_Large", "SE_Prop_Barrel2_Open", "SF_Prop_Barrel_Small"], per: [1, 2], gap: 0.25 } },
            { place: "wall", items: ["SF_Prop_PipeHolder"], count: [1, 2], perWall: 4 },
            { place: "corner", items: ["SF_Column_Pipes"], count: [1, 4] },
            { place: "wall", items: ["SF_Prop_Computer"], count: [1, 2], perWall: 4 },
            { place: "wall", items: ["SF_Prop_Barrel_Large", "SE_Prop_Barrel1", "SE_Prop_Barrel2_Open"], count: [1, 3], perWall: 3, cluster: [2, 3] },
            { place: "wall", items: ["SE_Prop_Shelves_WideTall", "SE_Prop_Shelves_WideShort"], count: [0, 2], perWall: 5, shelves: { items: [...SE_AMMO, "SE_Prop_Barrel2_Closed"], fill: [0.4, 0.7] } },
            { place: "wall", items: ["SE_Prop_Desk_Small"], count: [0, 1], minRoom: 9, front: SE_CHAIR, top: { items: ["SE_Prop_Mug", "SE_Prop_Grenade", "SE_Gun_SMG_Ammo"], count: [1, 3] } },
            SF_LIGHTS,
            { place: "wall", items: ["SF_Prop_Pipe_Medium_Straight"], count: [0, 2], perWall: 6 },
            { place: "wall", items: ["SF_Prop_Pipe_Thick_Straight"], count: [0, 1], minRoom: 12 },
            { place: "center", items: ["SE_Prop_Desk_Medium", "SE_Prop_Desk_Small"], count: [1, 1], minRoom: 12, margin: 0.75, front: { ...SE_CHAIR, chance: 0.7 },
                top: { items: ["SE_Prop_Mug", "SE_Prop_Grenade", "SE_Gun_SMG_Ammo", "SE_Prop_KeyCard", "SE_Prop_HealthPack_Tube"], count: [2, 4] } },
            { place: "center", items: ["SF_Column_Pipes", "SF_Prop_PipeHolder", "SF_Column_Pipes"], count: [1, 3], perArea: 8, minRoom: 16, margin: 0.75 },
            { place: "center", items: ["SF_Prop_Fan_Big"], count: [0, 1], minRoom: 12, margin: 1 },
            { place: "floor", items: ["SF_Prop_Cable_1", "SF_Prop_Clamp", "SF_Prop_Vent_Big"], count: [1, 4] },
            SF_DECALS(["SF_Decal_Warning", "SF_Decal_Caution"]),
            SF_SIGNS(["SF_Decal_Warning", "SF_Decal_Caution"]),
        ],
    }),
    sfLab: kitFurnish("sfLab", "fa-solid fa-flask-vial", clutterOf(["SF_Prop_Vent_Small", "SF_Prop_Clamp"], 0.5), {
        family: "scifi",
        minCells: 4,
        groups: [
            { place: "center", items: ["SF_Prop_ItemHolder"], count: [1, 2], perArea: 8, margin: 0.75 },
            { place: "wall", items: ["SF_Prop_Computer"], count: [1, 1], cluster: [2, 3], mid: true, front: SE_CHAIR },
            { place: "wall", items: ["SE_Prop_Desk_Small", "SE_Prop_Desk_L"], count: [1, 2], perWall: 5, front: SE_CHAIR, top: { items: [...SE_MED, "SE_Prop_Mug"], count: [2, 4] } },
            { place: "wall", items: ["SE_Prop_Shelves_ThinShort", "SE_Prop_Shelves_ThinTall"], count: [0, 2], perWall: 5, shelves: { items: [...SE_MED, "SE_Prop_Ammo_Small", "SE_Prop_HealthPack"], fill: [0.4, 0.7] }, top: { items: SE_MED, count: [1, 2] } },
            { place: "wall", items: ["SF_Prop_Barrel_Large", "SE_Prop_Barrel2_Closed"], count: [1, 1], cluster: [2, 3] },
            { place: "wall", items: ["SF_Prop_Chest"], count: [0, 1] },
            { place: "corner", items: ["SF_Column_Pipes"], count: [0, 2] },
            SF_LIGHTS,
            { place: "floor", items: ["SF_Prop_Vent_Small", "SF_Prop_Clamp"], count: [0, 1] },
        ],
    }),
    sfCargo: kitFurnish("sfCargo", "fa-solid fa-boxes-stacked", clutterOf(["SF_Decal_Dashes", "SF_Prop_Clamp", "SF_Prop_Cable_1"], 0.4), {
        family: "scifi",
        minCells: 2,
        groups: [
            { place: "corner", items: ["SF_Prop_Crate4", "SF_Prop_Crate4", "SF_Prop_Crate3", "SF_Prop_Crate1", "SF_Prop_Crate2", "SE_Prop_Crate", "SE_Prop_Crate_Tarp"], count: [2, 4], cluster: [2, 4], top: { items: ["SF_Prop_Crate3", "SF_Prop_Crate2", "SE_Prop_Ammo_Closed"], count: [0, 1] } },
            { place: "wall", items: ["SF_Prop_Crate4", "SF_Prop_Crate3", "SF_Prop_Crate1", "SF_Prop_Crate2", "SF_Prop_Barrel_Large", "SF_Prop_Barrel_Small", "SF_Prop_Chest", "SE_Prop_Crate", "SE_Prop_Barrel1", "SE_Prop_Barrel2_Closed"], fill: 0.4, count: [1, 10], cluster: [1, 3], top: { items: ["SF_Prop_Crate3", "SF_Prop_Crate1", "SE_Prop_Ammo_Closed"], count: [0, 1] } },
            { place: "wall", items: ["SE_Prop_Crate_Large", "SE_Prop_Crate_Tarp_Large"], count: [0, 2], minRoom: 10, top: { items: ["SE_Prop_Ammo_Closed", "SE_Prop_Ammo_Small"], count: [0, 2] } },
            { place: "wall", items: ["SE_Prop_Shelves_WideTall"], count: [0, 2], perWall: 5, shelves: { items: [...SE_AMMO, "SE_Prop_Barrel2_Closed"], fill: [0.5, 0.8] } },
            { place: "wall", items: ["SF_Prop_PipeHolder"], count: [0, 1], minRoom: 8 },
            { place: "center", items: ["SF_Prop_Crate4"], count: [0, 2], perArea: 10, margin: 1, top: { items: ["SF_Prop_Crate3"], count: [0, 1] } },
            SF_LIGHTS,
            { place: "floor", items: ["SF_Decal_Dashes", "SF_Prop_Clamp", "SF_Prop_Cable_1", "SE_Prop_Ammo", "SE_Prop_Ammo_Small"], count: [1, 3] },
            SF_DECALS(["SF_Decal_Warning", "SF_Decal_Caution", "SF_Decal_Arrows"], 2),
            SF_SIGNS(["SF_Decal_Warning", "SF_Decal_Caution"], 2),
        ],
    }),
    sfTeleporter: kitFurnish("sfTeleporter", "fa-solid fa-atom", clutterOf(["SF_Prop_Vent_Small", "SF_Prop_Clamp"], 0.4), {
        family: "scifi",
        minCells: 4,
        groups: [
            { place: "center", items: ["SF_Prop_Teleporter"], count: [1, 1], margin: 0.5 },
            { place: "wall", items: ["SF_Prop_Computer"], count: [1, 2], perWall: 6, front: SE_CHAIR },
            { place: "wall", items: ["SF_Prop_AccessPoint_Short"], count: [1, 3], perWall: 4 },
            { place: "corner", items: ["SF_Column_Pipes"], count: [0, 4] },
            { place: "corner", items: ["SF_Prop_Crate1", "SF_Prop_Crate2", "SF_Prop_Barrel_Small"], count: [0, 2], cluster: [1, 2] },
            SF_LIGHTS,
            SF_DECALS(["SF_Decal_Arrows", "SF_Decal_Warning"], 2),
            SF_SIGNS(["SF_Decal_Warning"]),
        ],
    }),
    sfQuarters: kitFurnish("sfQuarters", "fa-solid fa-bed", clutterOf(["SE_Prop_Ammo_Small", "SF_Prop_Clamp"], 0.3), {
        family: "scifi",
        minCells: 4,
        groups: [
            { place: "wall", items: SF_PODS, count: [1, 2], perWall: 3, cluster: [1, 2] },
            { place: "wall", items: ["SE_Prop_Desk_Small"], count: [0, 1], minRoom: 6, front: SE_CHAIR, top: { items: ["SE_Prop_Mug", "SE_Gun_SMG_Ammo", "SE_Prop_HealthPack_Tube", "SE_Gun_Pistol", "SE_Prop_KeyCard"], count: [1, 3] } },
            { place: "wall", items: ["SE_Prop_Locker"], count: [1, 1], cluster: [2, 3] },
            { place: "wall", items: ["SE_Prop_Shelves_ThinShort"], count: [0, 1], top: { items: ["SE_Prop_Mug", "SE_Prop_Grenade", "SE_Gun_Revolver", "SE_Prop_KeyCard"], count: [1, 2] } },
            { place: "wall", items: ["SE_Prop_Chest"], count: [0, 1] },
            SF_LIGHTS,
            { place: "floor", items: ["SE_Prop_Ammo_Small", "SF_Prop_Clamp"], count: [0, 1] },
        ],
    }),
    sfMess: kitFurnish("sfMess", "fa-solid fa-mug-hot", clutterOf(["SE_Prop_Barrel2_Closed", "SF_Prop_Vent_Small"], 0.3), {
        family: "scifi",
        minCells: 6,
        groups: [
            { place: "center", items: ["SE_Prop_Desk_Medium"], count: [1, 4], perArea: 8, margin: 1, front: { ...SE_CHAIR, chance: 1, count: [2, 3] }, top: { items: ["SE_Prop_Mug", "SE_Prop_Mug", "SE_Prop_Mug", "SE_Prop_HealthPack_Tube"], count: [2, 5] } },
            { place: "wall", items: ["SE_Prop_Shelves_WideShort"], count: [1, 2], perWall: 5, top: { items: ["SE_Prop_Mug"], count: [2, 4] }, shelves: { items: ["SE_Prop_Barrel2_Closed", "SE_Prop_Ammo_Closed"], fill: [0.3, 0.6] } },
            { place: "corner", items: ["SE_Prop_Barrel2_Closed", "SE_Prop_Barrel1", "SE_Prop_Crate_Tarp"], count: [1, 3], cluster: [1, 2] },
            SF_LIGHTS,
            { place: "floor", items: ["SE_Prop_Barrel2_Closed", "SF_Prop_Vent_Small"], count: [0, 1] },
        ],
    }),
    sfMedBay: kitFurnish("sfMedBay", "fa-solid fa-kit-medical", clutterOf(["SE_Prop_HealthPack_Tube", "SF_Prop_Clamp"], 0.3), {
        family: "scifi",
        minCells: 4,
        groups: [
            { place: "wall", items: SF_PODS, count: [1, 2], perWall: 4, cluster: [1, 2] },
            { place: "wall", items: ["SE_Prop_Desk_Small", "SE_Prop_Desk_L"], count: [1, 1], front: SE_CHAIR, top: { items: [...SE_MED, "SE_Prop_Syringe", "SE_Prop_Mug"], count: [2, 5] } },
            { place: "wall", items: ["SE_Prop_Shelves_ThinTall", "SE_Prop_Shelves_ThinShort"], count: [1, 2], perWall: 5, shelves: { items: [...SE_MED, "SE_Prop_HealthPack", "SE_Prop_HealthPack"], fill: [0.4, 0.6] }, top: { items: [...SE_MED, "SE_Prop_HealthPack"], count: [1, 2] } },
            { place: "center", items: ["SF_Prop_ItemHolder"], count: [0, 1], margin: 0.75, minRoom: 9 },
            { place: "wall", items: ["SE_Prop_Locker"], count: [0, 2], cluster: [1, 2] },
            SF_LIGHTS,
        ],
    }),
    sfArmory: kitFurnish("sfArmory", "fa-solid fa-person-rifle", clutterOf(["SE_Prop_Ammo_Small", "SE_Prop_Ammo"], 0.3), {
        family: "scifi",
        minCells: 4,
        groups: [
            { place: "wall", items: ["SE_Prop_Locker"], count: [1, 2], perWall: 8, cluster: [2, 3] },
            { place: "wall", items: ["SE_Prop_Crate_Large"], count: [1, 2], perWall: 5, top: { items: SE_GUNS, count: [2, 3] } },
            { place: "wall", items: ["SE_Prop_Shelves_WideTall", "SE_Prop_Shelves_WideShort"], count: [1, 2], perWall: 5, shelves: { items: SE_AMMO, fill: [0.5, 0.8] }, top: { items: ["SE_Prop_Grenade", "SE_Gun_SMG_Ammo"], count: [1, 3] } },
            { place: "wall", items: ["SE_Prop_Desk_Small"], count: [0, 1], minRoom: 9, front: SE_CHAIR, top: { items: ["SE_Gun_Pistol", "SE_Prop_Grenade", "SE_Gun_SMG_Ammo", "SE_Gun_Sniper_Ammo", "SE_Prop_Mug"], count: [2, 4] } },
            { place: "wall", items: ["SE_Prop_Chest"], count: [0, 1] },
            { place: "wall", items: ["SE_Prop_Crate", "SE_Prop_Crate", "SE_Prop_Mine"], count: [1, 3], cluster: [1, 2], top: { items: ["SE_Gun_Rifle", "SE_Gun_Pistol", "SE_Gun_Revolver", "SE_Prop_Ammo_Closed"], count: [1, 2] } },
            SF_LIGHTS,
            { place: "floor", items: ["SE_Prop_Ammo_Small", "SE_Prop_Ammo"], count: [0, 2] },
        ],
    }),
    sfCorridor: kitFurnish("sfCorridor", "fa-solid fa-arrows-left-right", clutterOf(["SF_Prop_Vent_Small", "SF_Decal_Dashes"], 0.3), {
        family: "scifi",
        minCells: 2,
        groups: [
            { place: "wall", items: ["SF_Prop_Pipe_Medium_Straight", "SF_Prop_Pipe_Small_Straight"], count: [1, 4], perWall: 3 },
            { place: "wall", items: ["SF_Prop_Light_Wide", "SF_Prop_Light_Small"], count: [2, 6], perWall: 2.5 },
            { place: "wall", items: ["SF_Prop_AccessPoint_Short"], count: [1, 3], perWall: 4 },
            { place: "wall", items: ["SE_Prop_Locker", "SF_Prop_Crate1", "SF_Prop_Crate2", "SF_Prop_Barrel_Small", "SE_Prop_Barrel2_Closed"], count: [0, 2], perWall: 6 },
            { place: "corner", items: ["SF_Column_Pipes"], count: [0, 2] },
            SF_DECALS(["SF_Decal_Arrows", "SF_Decal_Dashes", "SF_Decal_Code"], 2),
            { place: "floor", items: ["SF_Prop_Vent_Small", "SF_Prop_Vent_Wide"], count: [0, 2] },
        ],
    }),
    dgGuardRoom: kitFurnish("dgGuardRoom", "fa-solid fa-chess-knight", clutterOf(["Bucket_Wooden_1", W("Bag"), W("Rope_2"), "Bag_2"], 0.3), {
        family: "dungeon",
        minCells: 4,
        groups: [
            { place: "center", items: ["Table_Large", W("Table_Large")], count: [1, 1], perArea: 9, margin: 1,
                around: { items: ["Chair_1", W("Chair_1"), W("Chair_2"), "Stool"], alt: [W("Bench")], sides: "long", per: [1, 2], face: "in", gap: 0.1 },
                ends: { items: [W("Stool"), "Stool"], chance: 0.6, face: "in", gap: 0.1 },
                top: { items: ["Mug", W("Mug"), "Table_Plate", W("Bottle_1"), "Coin_Pile", W("Coin_Pile"), "Candle_1", "Key_Metal", "Pouch_Small"], count: [3, 6] } },
            { place: "wall", items: ["WeaponStand", W("WeaponStand")], count: [1, 2], perWall: 4, rack: { items: ["Sword_Steel", W("Sword_Bronze"), "Axe_Steel", W("Axe_Bronze")], count: [2, 3] } },
            { place: "wall", items: ["Shield_Metal", W("Shield_Wooden"), "Sword_Steel", "Axe_Double_Steel", W("Peg_Rack")], count: [1, 4], perWall: 2 },
            { place: "wall", items: [W("Bed_Bunk"), W("Bed_Bunk2")], count: [0, 2], perWall: 4, minRoom: 9 },
            { place: "wall", items: [W("Chest_Wood")], count: [0, 1] },
            { place: "corner", items: ["Barrel", W("Barrel"), W("Crate_Wooden")], count: [1, 2], cluster: [1, 2] },
            { place: "corner", items: [W("FirePit")], count: [0, 1], minRoom: 9 },
            { place: "center", items: ["DC_prop_brazier_hanging"], count: [0, 1], minRoom: 16 },
            DG_TORCHES(1, 4, 3),
            { place: "floor", items: ["Bucket_Wooden_1", W("Bag"), W("Rope_2"), "Bag_2"], count: [0, 2] },
        ],
    }),
    dgPrison: kitFurnish("dgPrison", "fa-solid fa-handcuffs", clutterOf([W("Chain_Coil"), ...FLOOR_BONES, W("Vase_Rubble_Small"), W("Bag_2")], 0.3), {
        family: "dungeon",
        minCells: 1,
        groups: [
            { place: "wall", items: [W("Parts_Chain_Straight")], count: [1, 4], perWall: 1.5, cluster: [2, 2] },
            { place: "wall", items: ["DP_WallChain_2", "DP_WallChain_1", "DP_WallChain_1"], count: [1, 2], perWall: 3 },
            { place: "center", items: ["DC_prop_cage_hanging"], count: [0, 2], perArea: 6, minRoom: 6, margin: 0.5 },
            { place: "wall", items: [W("Bench"), W("Bench_MetalSides")], count: [1, 1], perWall: 4 },
            { place: "corner", items: [W("Bucket_Wooden_1"), W("Bucket_Metal")], count: [1, 1] },
            { place: "corner", items: [W("Cage_Large"), W("Cage_Small")], count: [0, 2], minRoom: 4 },
            { place: "wall", items: [W("Bag_2"), W("Bag")], count: [0, 1], minRoom: 2 },
            DG_TORCHES(1, 2, 5),
            { place: "floor", items: [W("Chain_Coil"), ...FLOOR_BONES, W("Vase_Rubble_Small"), W("Bag_2")], count: [2, 5] },
            { place: "floor", items: ["DP_HeadClamp", "DP_LargeBone", "BN_BonePile_1", "BN_BonePile_4", "BN_BonePile_7", "BN_BonePile_8"], count: [1, 2] },
        ],
    }),
    dgCrypt: kitFurnish("dgCrypt", "fa-solid fa-skull", clutterOf([...FLOOR_BONES, W("Vase_Rubble_Medium"), W("Vase_Rubble_Small"), W("Candle_1"), W("Coin_Pile")], 0.3), {
        family: "dungeon",
        minCells: 4,
        groups: [
            { place: "wall", items: [W("Bookcase_2"), W("Shelf_Arch")], count: [2, 6], perWall: 2,
                shelves: { items: [...BONES, ...BONES, W("Candle_1"), W("Vase_4"), W("Chalice")], fill: [0.5, 0.8] } },
            { place: "corner", items: ["CandleStick_Stand", W("CandleStick_Stand")], count: [1, 4] },
            { place: "wall", items: ["CandleStick_Stand", W("CandleStick_Stand")], count: [1, 2], perWall: 4 },
            { place: "center", items: ["Runes"], count: [1, 1], minRoom: 12 },
            { place: "center", items: ["DC_prop_sarcophagus", "DP_Coffin"], count: [1, 3], perArea: 8, margin: 0.6 },
            { place: "center", items: ["DC_prop_altar"], count: [0, 1], minRoom: 9, margin: 0.5, top: { items: [W("Skull"), "Chalice_Golden", W("Candle_2"), W("CandleStick_Triple")], count: [1, 2] } },
            { place: "wall", items: ["DC_prop_tombstone_cross"], count: [0, 2], perWall: 4 },
            { place: "floor", items: [W("Vase_1"), W("Vase_3")], count: [1, 3] },
            { place: "wall", items: URNS, count: [2, 4], perWall: 3, cluster: [1, 3], loose: 0.3 },
            DG_TORCHES(1, 2),
            { place: "floor", items: [...FLOOR_BONES, W("Vase_Rubble_Medium"), W("Vase_Rubble_Small"), W("Candle_1"), W("Coin_Pile")], count: [3, 7] },
            { place: "floor", items: ["DP_LargeBone", ...BONE_PILES], count: [1, 3] },
        ],
    }),
    dgShrine: kitFurnish("dgShrine", "fa-solid fa-place-of-worship", clutterOf(["Candle_1", "Candle_3", W("Candle_2")], 0.4), {
        family: "dungeon",
        minCells: 4,
        groups: [
            { place: "wall", items: ["DC_prop_altar"], count: [1, 1], mid: true, top: { items: ["Chalice_Golden", W("CandleStick_Triple"), "Book_Open"], count: [1, 2] } },
            { place: "corner", items: ["CandleStick_Stand", W("CandleStick_Stand"), "FirePit", "DC_prop_brazier_stand"], count: [2, 4] },
            { place: "wall", items: ["CandleStick_Stand", "FirePit"], count: [1, 2], perWall: 4 },
            { place: "wall", items: ["Banner_Vertical_1", "Banner_Vertical_2"], count: [1, 4], perWall: 3 },
            { place: "center", items: ["Bench", W("Bench")], count: [1, 4], perArea: 4, margin: 0.25, minRoom: 9, faceFrom: "DC_prop_altar" },
            { place: "wall", items: ["Vase_1", "Vase_3", W("Vase_3")], count: [0, 3], cluster: [1, 2] },
            DG_TORCHES(1, 2, 5),
            { place: "floor", items: ["Candle_1", "Candle_3", W("Candle_2")], count: [2, 4] },
        ],
    }),
    dgVault: kitFurnish("dgVault", "fa-solid fa-gem", clutterOf(["Coin_Pile", "Coin_Pile_2", W("Coin_Pile_2"), "Pouch_Large", "Pouch_Small", "Chalice_Golden"], 0.4), {
        family: "dungeon",
        minCells: 2,
        groups: [
            { place: "wall", items: ["Chest_Legendary", "Chest_Legendary", W("Chest_Legendary"), "Chest_Wood"], count: [2, 8], perWall: 1.5 },
            { place: "center", items: ["DC_prop_altar"], count: [1, 2], perArea: 8, margin: 0.5, top: { items: ["Chalice_Golden", "Coin_Pile_2", "Pouch_Large", "Key_Gold", "Coin_Pile"], count: [1, 3] } },
            { place: "corner", items: ["Vase_1", "Vase_3", "Crate_Metal"], count: [1, 3], cluster: [1, 2] },
            { place: "wall", items: ["Shield_Metal", "Sword_Steel", "Axe_Double_Steel"], count: [0, 3], perWall: 3 },
            DG_TORCHES(1, 3),
            { place: "floor", items: ["Coin_Pile", "Coin_Pile_2", W("Coin_Pile_2"), "Pouch_Large", "Pouch_Small", "Chalice_Golden"], count: [2, 6] },
        ],
    }),
    dgStoreroom: kitFurnish("dgStoreroom", "fa-solid fa-box-archive", clutterOf(["Bucket_Wooden_1", W("Rope_2"), W("Chain_Coil"), W("Bag_2"), "Bucket_Metal"], 0.3), {
        family: "dungeon",
        minCells: 2,
        groups: [
            { place: "corner", items: ["Barrel", W("Barrel_Dark"), "Crate_Wooden", W("Crate_Wooden"), "Crate_Metal"], count: [2, 4], cluster: [2, 4], top: { items: ["Bag", W("Bag"), W("FarmCrate_Empty")], count: [0, 1] } },
            { place: "wall", items: ["Shelf_Arch", W("Shelf_Arch")], count: [0, 2], perWall: 4, shelves: { items: ["Vase_4", W("Vase_4"), W("Bottle_1"), "Pot_1", W("Pot_1")], fill: [0.4, 0.7] } },
            { place: "wall", items: [W("Barrel_Holder")], count: [0, 1], minRoom: 6 },
            { place: "wall", items: ["Barrel", W("Barrel"), "Crate_Wooden", "Bag", W("Bag_2"), W("FarmCrate_Empty")], count: [3, 8], perWall: 1.5, cluster: [2, 3] },
            { place: "wall", items: [W("Peg_Rack")], count: [0, 1] },
            DG_TORCHES(0, 2, 5),
            { place: "floor", items: ["Bucket_Wooden_1", W("Rope_2"), W("Chain_Coil"), W("Bag_2"), "Bucket_Metal"], count: [1, 3] },
        ],
    }),
    ruRubbleHall: kitFurnish("ruRubbleHall", "fa-solid fa-dumpster-fire", clutterOf([...RUBBLE, ...SHARDS, ...WEEDS, W("Skull"), W("Book_Open"), "Page_Single", "Parchment"], 0.3), {
        family: "ruins",
        minCells: 2,
        groups: [
            { place: "corner", items: ["DC_pillar_broken"], count: [1, 3] },
            { place: "wall", items: ["DC_pillar_broken"], count: [0, 2], perWall: 4, loose: 0.5 },
            { place: "wall", items: [W("Bookcase_2")], count: [0, 2], minRoom: 9, shelves: { items: [W("BookGroup_Small_1"), W("Book_Stack_1"), W("Vase_4"), W("Skull")], fill: [0.1, 0.3] } },
            { place: "center", items: [W("Table_Large")], count: [0, 1], margin: 1, minRoom: 16,
                around: { items: [W("Chair_1"), W("Chair_2"), W("Stool")], sides: "long", per: [1, 2], face: "in", gap: 0.15 },
                top: { items: [W("Book_Open"), W("Book_Stack_1"), W("Candle_1"), W("Chalice"), W("Bottle_1"), "Page_Single", "Parchment"], count: [2, 4] } },
            RU_TORCHES(0, 2),
            { place: "floor", items: RUBBLE, count: [3, 7] },
            { place: "floor", items: [...SHARDS, W("Skull"), W("Book_Open"), "Page_Single", "Parchment"], count: [2, 5] },
            { place: "floor", items: WEEDS, count: [5, 10] },
        ],
    }),
    ruStorage: kitFurnish("ruStorage", "fa-solid fa-box-open", clutterOf([...RUBBLE, ...SHARDS, W("Rope_2"), W("Chain_Coil"), W("FarmCrate_Empty"), W("Bag")], 0.3), {
        family: "ruins",
        minCells: 2,
        groups: [
            { place: "corner", items: [W("Crate_Wooden"), W("Barrel"), W("Barrel_Dark")], count: [1, 3], cluster: [1, 3], top: { items: [W("Bag")], count: [0, 1] } },
            { place: "wall", items: [...URNS, W("Vase_Rubble_Large"), W("Crate_Wooden"), W("Barrel")], count: [1, 4], cluster: [1, 2], loose: 0.3 },
            { place: "wall", items: [W("Shelf_Arch")], count: [0, 1], minRoom: 6, shelves: { items: [W("Vase_4"), W("Bottle_1"), W("Pot_1")], fill: [0.2, 0.5] } },
            { place: "wall", items: [W("Chest_Wood")], count: [0, 1] },
            RU_TORCHES(0, 1, 6),
            { place: "floor", items: RUBBLE, count: [3, 8] },
            { place: "floor", items: [...SHARDS, W("Rope_2"), W("Chain_Coil"), W("FarmCrate_Empty"), W("Bag")], count: [2, 5] },
            { place: "floor", items: WEEDS, count: [1, 3] },
        ],
    }),
    ruShrine: kitFurnish("ruShrine", "fa-solid fa-leaf", clutterOf([...WEEDS, ...RUBBLE, W("Vase_Rubble_Small")], 0.35), {
        family: "ruins",
        minCells: 4,
        groups: [
            { place: "wall", items: ["DC_prop_altar"], count: [1, 1], mid: true, front: { items: [W("CandleStick_Stand")], chance: 0.8, count: [2, 2], gap: 0.3 } },
            { place: "center", items: [W("Bench")], count: [0, 3], perArea: 5, margin: 0.25, minRoom: 9, faceFrom: "DC_prop_altar" },
            { place: "corner", items: ["SN_Bush_Long_1", "SN_Fern_1", "DC_pillar_broken"], count: [2, 4] },
            { place: "wall", items: [W("Vase_1"), W("Vase_3"), W("Vase_Rubble_Large")], count: [0, 3], cluster: [1, 2], loose: 0.3 },
            { place: "wall", items: [W("Banner_Vertical_1"), W("Banner_Vertical_2")], count: [0, 2], perWall: 4 },
            { place: "wall", items: ["DC_prop_tombstone_cross"], count: [0, 3], perWall: 3 },
            { place: "corner", items: ["DC_prop_brazier_stand"], count: [0, 2] },
            { place: "floor", items: WEEDS, count: [4, 10] },
            { place: "floor", items: [...RUBBLE, W("Vase_Rubble_Small")], count: [1, 3] },
        ],
    }),
    ruCamp: kitFurnish("ruCamp", "fa-solid fa-campground", clutterOf([W("Pot_1"), W("Bucket_Wooden_1"), W("Rope_2"), W("Mug"), W("Vase_Rubble_Medium"), "SN_Grass_Common_Short"], 0.3), {
        family: "ruins",
        minCells: 4,
        groups: [
            { place: "center", items: [W("CampfireTripod")], count: [1, 1], margin: 1.25, ends: { items: [W("Stool"), W("Bag")], chance: 0.9, gap: 0.35 }, around: { items: [W("Bag"), W("Bag_2"), W("Stool")], per: [1, 2], gap: 0.35 } },
            { place: "wall", items: [W("Bag"), W("Bag_2"), W("Barrel"), W("Crate_Wooden")], count: [1, 4], cluster: [1, 3] },
            { place: "corner", items: [W("Chest_Wood"), W("Crate_Wooden")], count: [0, 2] },
            { place: "floor", items: [W("Pot_1"), W("Bucket_Wooden_1"), W("Rope_2"), W("Mug")], count: [1, 4] },
            { place: "floor", items: [W("Vase_Rubble_Medium"), W("Vase_Rubble_Small"), "SN_Grass_Common_Short"], count: [1, 3] },
        ],
    }),
    swTunnel: kitFurnish("swTunnel", "fa-solid fa-water", clutterOf([W("Rope_2"), W("Chain_Coil"), W("Bucket_Wooden_1"), W("Vase_Rubble_Small"), "BN_Skull_1"], 0.3), {
        family: "dungeon",
        minCells: 2,
        groups: [
            DG_TORCHES(1, 3, 4.5),
            { place: "wall", items: [W("Parts_Chain_Straight")], count: [0, 2], perWall: 4 },
            { place: "wall", items: ["DP_WallChain_1", "DP_WallChain_2"], count: [0, 1], perWall: 6 },
            { place: "wall", items: [W("Barrel"), W("Barrel_Dark"), W("Crate_Wooden")], count: [0, 2], perWall: 5, cluster: [1, 2] },
            { place: "floor", items: [W("Rope_2"), W("Chain_Coil"), W("Bucket_Wooden_1"), W("Vase_Rubble_Small"), "BN_Skull_1", W("Skull")], count: [1, 3] },
            { place: "floor", items: ["BN_BonePile_1", "BN_BonePile_4", "BN_BonePile_7", "DP_LargeBone"], count: [0, 1] },
        ],
    }),
    swCistern: kitFurnish("swCistern", "fa-solid fa-droplet", clutterOf([W("Bucket_Wooden_1"), "Bucket_Metal", W("Rope_2"), W("Chain_Coil")], 0.3), {
        family: "dungeon",
        minCells: 4,
        groups: [
            { place: "corner", items: ["Barrel", W("Barrel"), W("Barrel_Dark")], count: [1, 3], cluster: [1, 3] },
            { place: "wall", items: [W("Barrel_Holder")], count: [0, 1], minRoom: 9 },
            { place: "wall", items: [W("Parts_Chain_Straight")], count: [1, 3], perWall: 3 },
            { place: "wall", items: ["Bucket_Metal", W("Bucket_Wooden_1"), W("Bucket_Metal")], count: [0, 2], perWall: 4 },
            { place: "corner", items: ["DC_prop_brazier_stand"], count: [0, 1], minRoom: 12 },
            DG_TORCHES(1, 3, 5.5),
            { place: "floor", items: [W("Bucket_Wooden_1"), "Bucket_Metal", W("Rope_2"), W("Chain_Coil")], count: [1, 3] },
        ],
    }),
    swCache: kitFurnish("swCache", "fa-solid fa-boxes-stacked", clutterOf([W("Bag_2"), W("Rope_2"), "Coin_Pile", "Pouch_Small"], 0.3), {
        family: "dungeon",
        minCells: 2,
        groups: [
            { place: "corner", items: ["Crate_Wooden", W("Crate_Wooden"), "Crate_Metal", "Barrel", W("Barrel_Dark")], count: [2, 4], cluster: [2, 4], top: { items: [W("Bag"), "Bag_2"], count: [0, 1] } },
            { place: "wall", items: [W("Chest_Wood"), "Chest_Wood"], count: [1, 2], perWall: 4 },
            { place: "wall", items: [W("Barrel"), "Crate_Wooden", W("Crate_Wooden"), W("Bag"), W("Bag_2")], count: [2, 6], perWall: 1.5, cluster: [2, 3] },
            { place: "wall", items: [W("Shelf_Arch")], count: [0, 1], minRoom: 6, shelves: { items: [W("Bottle_1"), W("Vase_4"), "Pouch_Small", "Coin_Pile", W("Candle_1")], fill: [0.3, 0.6] } },
            DG_TORCHES(1, 1, 7),
            { place: "floor", items: [W("Bag_2"), W("Rope_2"), "Coin_Pile", "Pouch_Small"], count: [1, 3] },
        ],
    }),
    swDen: kitFurnish("swDen", "fa-solid fa-fire", clutterOf([...FLOOR_BONES, W("Bag"), W("Mug"), W("Pot_1")], 0.3), {
        family: "dungeon",
        minCells: 4,
        groups: [
            { place: "center", items: [W("CampfireTripod")], count: [1, 1], margin: 1.25, ends: { items: [W("Stool"), W("Bag")], chance: 0.9, gap: 0.35 }, around: { items: [W("Bag"), W("Bag_2"), W("Stool")], per: [1, 2], gap: 0.35 } },
            { place: "wall", items: [W("Bag"), W("Bag_2"), W("Barrel"), W("Crate_Wooden")], count: [1, 4], cluster: [1, 3] },
            { place: "corner", items: [W("Cage_Small"), W("Cage_Large"), W("Chest_Wood")], count: [0, 2] },
            DG_TORCHES(1, 1, 7),
            { place: "floor", items: [...BONE_PILES, "DP_LargeBone"], count: [1, 3] },
            { place: "floor", items: [...FLOOR_BONES, W("Bag"), W("Mug"), W("Pot_1")], count: [2, 5] },
        ],
    }),
};

const THUMBS = {
    ...NATURE_THUMBS,
    ...MODERN_THUMBS,
    sfBridge: `${SCIFI}Props/Prop_Computer`, sfEngineering: `${SCIFI}Props/Prop_PipeHolder`, sfLab: `${SCIFI}Props/Prop_ItemHolder`, sfCargo: `${SCIFI}Props/Prop_Crate4`, sfTeleporter: `${SCIFI}Props/Prop_Teleporter`,
    sfCorridor: `${SCIFI}Props/Prop_Light_Wide`, dining: `${PROPS}CandleStick_Triple`, greatHall: `${PROPS}Chair_3`, corridor: `${PROPS}Torch_Metal`,
    sfQuarters: `${SCIFI_ESS}Prop_Locker`, sfMess: `${SCIFI_ESS}Prop_Mug`, sfMedBay: `${SCIFI_ESS}Prop_HealthPack`, sfArmory: `${SCIFI_ESS}Gun_Rifle`,
    dgGuardRoom: `${PROPS}WeaponStand`, dgPrison: `${PROPS}Cage_Large_Worn`, dgCrypt: `${PROPS}Skull`, dgShrine: `${TILES}Dungeon%20Crawler%20Kit/prop_altar`,
    dgVault: `${PROPS}Chest_Legendary`, dgStoreroom: `${PROPS}Barrel_Dark`, ruRubbleHall: `${TILES}Dungeon%20Crawler%20Kit/pillar_broken`, ruStorage: `${PROPS}Vase_Rubble_Large_Worn`, ruShrine: `${SN}Bush_Long_1`, ruCamp: `${PROPS}CampfireTripod_Worn`,
    swTunnel: `${TILES}Dungeon%20Crawler%20Kit/floor_drain_grate`, swCistern: `${PROPS}Barrel_Holder`, swCache: `${PROPS}Crate_Metal`, swDen: `${PROPS}CampfireTripod`,
    tavern: `${PROPS}Mug`, bedroom: `${PROPS}Bed_Twin1`, library: `${PROPS}Bookcase_2`, storage: `${PROPS}Crate_Wooden`,
    kitchen: `${PROPS}Cauldron`, smithy: `${PROPS}Anvil_Log`, alchemy: `${PROPS}Potion_2`, shop: `${PROPS}Coin_Pile_2`, armory: `${PROPS}Shield_Wooden`,
};

export const SCATTER_SETS = Object.fromEntries(Object.entries({ ...NATURE_SETS, ...FURNISH_SETS, ...KIT_FURNISH_SETS, ...modernFurnish(kitFurnish, clutterOf) }).map(([id, set]) => [id, { ...set, thumb: THUMBS[id] ? `${THUMBS[id]}.webp` : null }]));
