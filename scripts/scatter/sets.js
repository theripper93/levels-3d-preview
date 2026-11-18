const TILES = "modules/canvas3dcompendium/assets/Tiles/";
const SN = `${TILES}Stylized%20Nature%20MegaKit/`;
const PROPS = `${TILES}Fantasy%20Props%20MegaKit/`;

const seq = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

const asset = (o) => ({ align: 0, wind: 0, blocking: false, aquatic: false, yOffset: 0, ...o });

const group = (names, { weight, ...rest }) =>
    names.map((n) => {
        const [file, yOffset = 0] = Array.isArray(n) ? n : [n];
        return asset({ src: `${SN}${file}.glb`, weight: weight / names.length, yOffset, ...rest });
    });

const HIGHEND = `${TILES}Rocks_highend/`;
const RUNIC = `${TILES}Rocks_runic/`;
const pack = (dir, names, { weight, ...rest }) => names.map((n) => asset({ src: `${dir}${n}.glb`, weight: weight / names.length, ...rest }));

const GRASS_SHORT = { scale: [0.25, 0.45], spacing: 0.22, align: 0.7, wind: 1, clumpK: 0.4 };
const GRASS_TALL = { scale: [0.3, 0.5], spacing: 0.28, align: 0.6, wind: 1, clumpK: 0.5 };
const WISPY = { scale: [0.3, 0.55], spacing: 0.3, align: 0.6, wind: 1, clumpK: 0.6 };
const FLOWER = { scale: [0.18, 0.3], spacing: 0.3, align: 0.5, wind: 0.9, clump: 3, clumpK: 0.85 };
const PEBBLE = { scale: [0.5, 1.4], scaleBias: 1.5, spacing: 0.35, align: 1, clump: 3, clumpK: 0.85 };
const ROCK_SMALL = { scale: [0.15, 0.3], spacing: 0.6, align: 1, clump: 4, clumpK: 0.7 };
const ROCK_MID = { scale: [0.3, 0.55], spacing: 1.2, align: 0.9, clump: 5, clumpK: 0.6 };
const BOULDER = { scale: [0.7, 1.2], scaleBias: 1.5, spacing: 2.2, align: 0.7, blocking: true, clump: 5, clumpK: 0.7 };
const BUSH = { scale: [0.45, 0.9], spacing: 0.8, align: 0.4, wind: 0.4, clump: 4, clumpK: 0.7 };
const FERN = { scale: [0.35, 0.65], spacing: 0.6, align: 0.5, wind: 0.6, clump: 3, clumpK: 0.8 };
const MUSHROOM = { scale: [0.4, 0.8], scaleBias: 1.5, spacing: 0.15, align: 0.4, clump: 2, clumpK: 0.9 };

const tree = (o) => ({ align: 0.1, blocking: true, clump: 6, clumpK: 0.5, scaleBias: 1.6, ...o });
const COMMON = tree({ scale: [0.5, 1], spacing: 1.9, wind: 0.4, trunk: 0.42 });
const PINE = tree({ scale: [0.55, 1.1], spacing: 1.8, wind: 0.3, trunk: 0.4, clump: 7, clumpK: 0.6 });
const TWISTED = tree({ scale: [0.3, 0.48], spacing: 3.2, wind: 0.3, trunk: 1, clump: 8 });
const DEAD_SMALL = tree({ scale: [0.35, 0.65], spacing: 2.2, wind: 0.08, trunk: 0.55 });
const DEAD_TALL = tree({ scale: [0.28, 0.5], spacing: 2.2, wind: 0.08, trunk: 0.55 });

const PEBBLES = [...seq("Pebble_Round_", 1, 5), ...seq("Pebble_Square_", 1, 6)];
const ROCKS = seq("Rock_Medium_", 1, 3);
const FLOWERS = ["Flower_3_Group", "Flower_4_Group", "Flower_3_Single", "Flower_4_Single"];
const CLOVER = ["Clover_1", "Clover_2"];
const CACTI = [...seq("UltNature_Cactus_", 1, 5), ...seq("UltNature_CactusFlowers_", 2, 5)];

const nature = (id, icon, assets) => ({ name: `levels3dpreview.scatter.sets.${id}`, kind: "nature", icon, assets });

const NATURE_SETS = {
    meadow: nature("meadow", "fa-solid fa-seedling", [
        ...group(["Grass_Common_Short"], { weight: 0.55, ...GRASS_SHORT }),
        ...group(["Grass_Common_Tall"], { weight: 0.18, ...GRASS_TALL }),
        ...group(["Grass_Common_Tall"], { weight: 0.12, ...WISPY }),
        ...group(["Grass_Wispy_Short"], { weight: 0.05, ...WISPY, clump: 4, clumpK: 0.9 }),
        ...group(FLOWERS, { weight: 0.12, ...FLOWER }),
        ...group(CLOVER, { weight: 0.05, scale: [0.15, 0.28], spacing: 0.3, align: 0.5, wind: 0.8, clump: 3, clumpK: 0.8 }),
        ...group(["Plant_1"], { weight: 0.04, scale: [0.35, 0.6], spacing: 0.5, align: 0.5, wind: 0.6 }),
        ...group(["Plant_7"], { weight: 0.03, scale: [0.4, 0.7], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(["Bush_Common_Flowers"], { weight: 0.04, ...BUSH }),
        ...group(PEBBLES.slice(0, 5), { weight: 0.03, ...PEBBLE, scale: [0.5, 1.1] }),
        ...group(ROCKS, { weight: 0.008, ...ROCK_MID, scale: [0.25, 0.45] }),
        ...group(seq("CommonTree_", 1, 5), { weight: 0.012, ...COMMON, scale: [0.5, 0.95], spacing: 3.5, clump: 8, clumpK: 0.9 }),
    ]),
    forest: nature("forest", "fa-solid fa-tree", [
        ...group(seq("CommonTree_", 1, 5), { weight: 0.42, ...COMMON }),
        ...group(seq("Pine_", 1, 5), { weight: 0.3, ...PINE }),
        ...group(["Bush_Common_Flowers"], { weight: 0.1, ...BUSH }),
        ...group(["Fern_1"], { weight: 0.1, ...FERN }),
        ...group(["Plant_1_Big"], { weight: 0.04, scale: [0.3, 0.5], spacing: 0.7, align: 0.5, wind: 0.5 }),
        ...group(["Plant_1"], { weight: 0.04, scale: [0.35, 0.6], spacing: 0.5, align: 0.5, wind: 0.6 }),
        ...group(["Grass_Common_Short"], { weight: 0.22, ...GRASS_SHORT }),
        ...group(["Grass_Common_Tall"], { weight: 0.08, ...WISPY }),
        ...group(["Mushroom_Common"], { weight: 0.006, ...MUSHROOM }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.004, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(ROCKS, { weight: 0.03, ...ROCK_MID, spacing: 1 }),
        ...group(PEBBLES, { weight: 0.03, ...PEBBLE }),
    ]),
    forestFloor: nature("forestFloor", "fa-solid fa-leaf", [
        ...group(["Grass_Common_Short"], { weight: 0.28, ...GRASS_SHORT }),
        ...group(["Grass_Common_Tall"], { weight: 0.1, ...WISPY }),
        ...group(["Fern_1"], { weight: 0.18, ...FERN }),
        ...group(["Plant_1"], { weight: 0.08, scale: [0.35, 0.6], spacing: 0.5, align: 0.5, wind: 0.6, clump: 3, clumpK: 0.7 }),
        ...group(["Plant_1_Big"], { weight: 0.05, scale: [0.3, 0.5], spacing: 0.7, align: 0.5, wind: 0.5 }),
        ...group(["Plant_7", "Plant_7_Big"], { weight: 0.06, scale: [0.4, 0.75], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(CLOVER, { weight: 0.06, scale: [0.15, 0.28], spacing: 0.3, align: 0.5, wind: 0.8, clump: 3, clumpK: 0.8 }),
        ...group(["Bush_Common_Flowers"], { weight: 0.06, ...BUSH }),
        ...group(["Mushroom_Common"], { weight: 0.015, ...MUSHROOM }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.008, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(PEBBLES, { weight: 0.05, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.03, ...ROCK_SMALL }),
    ]),
    autumnForest: nature("autumnForest", "fa-brands fa-canadian-maple-leaf", [
        ...group(seq("TwistedTree_", 1, 5), { weight: 0.22, ...TWISTED, spacing: 3 }),
        ...group(seq("CommonTree_", 1, 5), { weight: 0.04, ...COMMON, spacing: 2 }),
        ...group(seq("Pine_", 1, 3), { weight: 0.05, ...PINE }),
        ...group(["Bush_Common"], { weight: 0.08, ...BUSH }),
        ...group(["Grass_Wispy_Tall"], { weight: 0.15, ...WISPY }),
        ...group(["Grass_Wispy_Short"], { weight: 0.15, ...WISPY }),
        ...group(["Grass_Common_Short"], { weight: 0.1, ...GRASS_SHORT }),
        ...group(["Fern_1"], { weight: 0.04, ...FERN }),
        ...group(["Mushroom_Common"], { weight: 0.01, ...MUSHROOM }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.004, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(PEBBLES, { weight: 0.03, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.02, ...ROCK_MID }),
    ]),
    rocks: nature("rocks", "fa-solid fa-mountain", [
        ...group(PEBBLES, { weight: 0.4, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.18, ...ROCK_SMALL }),
        ...group(ROCKS, { weight: 0.15, ...ROCK_MID }),
        ...group(ROCKS, { weight: 0.25, ...BOULDER }),
        ...group(["RockPath_Round_Small_1", "RockPath_Round_Small_2", "RockPath_Round_Small_3", "RockPath_Round_Wide"], { weight: 0.04, scale: [0.6, 1], spacing: 1.2, align: 1 }),
        ...group(["Grass_Common_Short"], { weight: 0.1, ...GRASS_SHORT }),
        ...group(["Grass_Wispy_Short"], { weight: 0.05, ...WISPY }),
    ]),
    crags: nature("crags", "fa-solid fa-mountain-sun", [
        ...group(ROCKS, { weight: 0.3, ...BOULDER, scale: [0.8, 1.5], spacing: 2.4 }),
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
        ...group(ROCKS, { weight: 0.06, ...BOULDER, spacing: 2.5 }),
        ...group(["Grass_Wispy_Short"], { weight: 0.15, ...WISPY, scale: [0.25, 0.45], spacing: 0.4, clump: 3, clumpK: 0.85 }),
        ...group(["Grass_Wispy_Tall"], { weight: 0.05, ...WISPY, spacing: 0.4, clump: 3, clumpK: 0.9 }),
        ...group(["DeadTree_1", "DeadTree_2"], { weight: 0.02, ...DEAD_SMALL, scale: [0.25, 0.4], spacing: 3 }),
        ...group(CACTI, { weight: 0.12, scale: [0.7, 1.4], scaleBias: 1.4, spacing: 1.2, align: 0.15, clump: 5, clumpK: 0.7 }),
        ...group(["UltNature_CactusFlower_1"], { weight: 0.05, scale: [0.6, 1.2], spacing: 0.7, align: 0.6, clump: 4, clumpK: 0.8 }),
    ]),
    snowyPines: nature("snowyPines", "fa-solid fa-snowflake", [
        ...group(seq("Pine_", 1, 5), { weight: 0.38, ...PINE, spacing: 2, wind: 0.3 }),
        ...group(["DeadTree_1", "DeadTree_2"], { weight: 0.03, ...DEAD_SMALL, scale: [0.3, 0.5] }),
        ...group(ROCKS, { weight: 0.12, ...ROCK_SMALL }),
        ...group(ROCKS, { weight: 0.06, ...ROCK_MID }),
        ...group(ROCKS, { weight: 0.04, ...BOULDER }),
        ...group(PEBBLES, { weight: 0.04, ...PEBBLE }),
        ...group(["Grass_Wispy_Short"], { weight: 0.06, ...WISPY, clump: 4, clumpK: 0.9 }),
        ...group(["Grass_Common_Short"], { weight: 0.05, ...GRASS_SHORT, clumpK: 0.8 }),
    ]),
    swamp: nature("swamp", "fa-solid fa-water", [
        ...group(["DeadTree_1", "DeadTree_2"], { weight: 0.12, ...DEAD_SMALL, scale: [0.3, 0.55] }),
        ...group(seq("CommonTree_", 1, 5), { weight: 0.06, ...COMMON, spacing: 2.5 }),
        ...group(["UltNature_Grass_2"], { weight: 0.12, scale: [0.8, 1.4], spacing: 0.2, align: 0.2, wind: 0.9, aquatic: true, clump: 3, clumpK: 0.85 }),
        ...group(["Grass_Common_Tall"], { weight: 0.25, ...GRASS_TALL, scale: [0.35, 0.6], spacing: 0.25, aquatic: true, clumpK: 0.7 }),
        ...group(CLOVER, { weight: 0.06, scale: [0.2, 0.35], spacing: 0.4, align: 0.3, wind: 0.6, aquatic: true, clump: 3, clumpK: 0.85 }),
        ...group(["UltNature_Lilypad"], { weight: 0.45, scale: [0.4, 0.8], spacing: 0.5, wind: 0.1, aquatic: true, float: true, clump: 3, clumpK: 0.8 }),
        ...group(["Plant_7", "Plant_7_Big"], { weight: 0.1, scale: [0.35, 0.7], spacing: 0.6, wind: 0.2, aquatic: true, float: true, clump: 3, clumpK: 0.8 }),
        ...group(["Fern_1"], { weight: 0.06, ...FERN }),
        ...group(["Plant_1_Big"], { weight: 0.04, scale: [0.3, 0.5], spacing: 0.7, align: 0.5, wind: 0.5 }),
        ...group(["Grass_Common_Short"], { weight: 0.1, ...GRASS_SHORT }),
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
        ...group(["Fern_1"], { weight: 0.12, ...FERN }),
        ...group(CLOVER, { weight: 0.12, scale: [0.15, 0.3], spacing: 0.3, align: 0.5, wind: 0.8, clump: 3, clumpK: 0.8 }),
        ...group(["Plant_7"], { weight: 0.08, scale: [0.4, 0.7], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(["Grass_Common_Short"], { weight: 0.15, ...GRASS_SHORT }),
    ]),
    wildflowers: nature("wildflowers", "fa-solid fa-spa", [
        ...group(["Flower_3_Group", "Flower_4_Group"], { weight: 0.2, ...FLOWER, scale: [0.2, 0.3] }),
        ...group(["Flower_3_Single", "Flower_4_Single"], { weight: 0.15, ...FLOWER }),
        ...group(seq("Petal_", 1, 5), { weight: 0.12, scale: [0.25, 0.45], spacing: 0.3, align: 0.8, wind: 0.4, clump: 3, clumpK: 0.85 }),
        ...group(["Plant_7", "Plant_7_Big"], { weight: 0.1, scale: [0.4, 0.75], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(CLOVER, { weight: 0.08, scale: [0.15, 0.28], spacing: 0.3, align: 0.5, wind: 0.8, clump: 3, clumpK: 0.8 }),
        ...group(["Bush_Common_Flowers"], { weight: 0.05, ...BUSH }),
        ...group(["Grass_Common_Short"], { weight: 0.25, ...GRASS_SHORT }),
        ...group(["Grass_Common_Tall"], { weight: 0.1, ...WISPY }),
    ]),
    stylizedForest: nature("stylizedForest", "fa-solid fa-paintbrush", [
        ...group(seq("TwistedTree_", 1, 5), { weight: 0.12, ...TWISTED }),
        ...group(seq("CommonTree_", 1, 5), { weight: 0.15, ...COMMON, scale: [0.5, 0.95], spacing: 2.5 }),
        ...group(seq("Pine_", 1, 5), { weight: 0.08, ...PINE, spacing: 2.5 }),
        ...group(["Bush_Common_Flowers", "Bush_Common"], { weight: 0.12, ...BUSH }),
        ...group(FLOWERS, { weight: 0.1, ...FLOWER }),
        ...group(["Fern_1"], { weight: 0.08, ...FERN }),
        ...group(["Plant_1"], { weight: 0.06, scale: [0.35, 0.6], spacing: 0.5, align: 0.5, wind: 0.6 }),
        ...group(["Grass_Common_Short"], { weight: 0.2, ...GRASS_SHORT }),
        ...group(["Mushroom_Common"], { weight: 0.01, ...MUSHROOM }),
        ...group(ROCKS, { weight: 0.03, ...ROCK_MID }),
    ]),
    blossomGrove: nature("blossomGrove", "fa-solid fa-fan", [
        ...group(seq("TwistedTree_", 1, 5), { weight: 0.2, ...TWISTED, spacing: 3.2, clump: 7 }),
        ...group(seq("Petal_", 1, 5), { weight: 0.2, scale: [0.25, 0.45], spacing: 0.3, align: 0.8, wind: 0.4, clump: 2.5, clumpK: 0.9 }),
        ...group(["Flower_3_Group", "Flower_3_Single"], { weight: 0.12, ...FLOWER }),
        ...group(["Bush_Common_Flowers"], { weight: 0.1, ...BUSH }),
        ...group(["Plant_7"], { weight: 0.05, scale: [0.4, 0.7], spacing: 0.5, align: 0.8, wind: 0.3, clump: 3, clumpK: 0.9 }),
        ...group(["Grass_Common_Short"], { weight: 0.22, ...GRASS_SHORT }),
        ...group(ROCKS, { weight: 0.02, ...ROCK_MID }),
    ]),
    cave: nature("cave", "fa-solid fa-hill-rockslide", [
        ...group(PEBBLES, { weight: 0.3, ...PEBBLE }),
        ...group(ROCKS, { weight: 0.08, ...ROCK_SMALL }),
        ...pack(HIGHEND, seq("FlatCluster_0", 1, 5), { weight: 0.1, scale: [0.1, 0.2], spacing: 0.9, align: 0.9, clump: 4, clumpK: 0.7 }),
        ...pack(HIGHEND, [...seq("Cluster_0", 1, 3), ...seq("Boulder_0", 1, 3)], { weight: 0.07, scale: [0.18, 0.32], scaleBias: 1.5, spacing: 2, align: 0.6, blocking: true, trunk: 0.5, clump: 5, clumpK: 0.7 }),
        ...pack(RUNIC, seq("Small_", 1, 5).map((n) => `${n}_SMall_0`), { weight: 0.1, scale: [0.3, 0.55], spacing: 0.8, align: 0.8, yOffset: 0.45, clump: 4, clumpK: 0.7 }),
        ...pack(PROPS, ["Vase_Rubble_Medium"], { weight: 0.03, scale: [0.8, 1.2], spacing: 0.8, align: 1 }),
        ...group(["Mushroom_Common"], { weight: 0.05, ...MUSHROOM, clump: 2.5 }),
        ...group(["Mushroom_Laetiporus"], { weight: 0.02, ...MUSHROOM, scale: [0.25, 0.45], spacing: 0.3 }),
        ...group(seq("Crops_Mushroom_", 2, 4), { weight: 0.03, ...MUSHROOM, scale: [0.5, 1] }),
    ]),
};

const NATURE_THUMBS = {
    meadow: `${SN}Flower_3_Group`, forest: `${SN}CommonTree_1`, forestFloor: `${SN}Fern_1`, autumnForest: `${SN}TwistedTree_1`,
    rocks: `${SN}Rock_Medium_2`, crags: `${SN}Rock_Medium_3`, deadWood: `${SN}DeadTree_1`, desertScrub: `${SN}UltNature_CactusFlowers_2`,
    snowyPines: `${SN}Pine_2`, swamp: `${SN}UltNature_Lilypad`, mushrooms: `${SN}Mushroom_Common`, wildflowers: `${SN}Flower_4_Group`,
    stylizedForest: `${SN}TwistedTree_3`, blossomGrove: `${SN}Petal_2`, cave: `${HIGHEND}Cluster_01`,
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
    prop("Bed_Twin1", [1.88, 2.42, 0.81], { placement: "wall", back: 1.21 }),
    prop("Bed_Twin2", [1.88, 2.42, 0.76], { placement: "wall", back: 1.21 }),
    prop("Chest_Wood", [1.28, 0.82, 0.69], { back: 0.38, yOffset: 0.02 }),
    prop("Nightstand_Shelf", [0.7, 0.39, 1.21], { placement: "wall", top: 1.21, back: 0.19, yOffset: 0.01 }),
    prop("Cabinet", [1.36, 0.36, 1], { placement: "wall", top: 1, back: 0.18 }),
    prop("Bookcase_2", [1.46, 0.42, 2.53], { placement: "wall", back: 0.21, yOffset: 0.02, blocking: true, boards: [0.14, 0.77, 1.15, 1.54, 1.92], inner: [1.2, 0] }),
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
    hung("Lantern_Wall", [0.36, 1.3, 1.34], 1, 0.05),
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
];

const PROP_BY_ID = Object.fromEntries(PROP_LIST.map((p) => [p.id, p]));

const furnish = (id, icon, weights, rules) => ({
    name: `levels3dpreview.scatter.sets.${id}`,
    kind: "furnish",
    icon,
    assets: Object.entries(weights).map(([pid, weight]) => ({ ...PROP_BY_ID[pid], weight })),
    rules: { clearance: 1, wallGap: 0.05, ...rules },
});

const TAVERN_TABLE = ["Mug", "Mug", "Table_Plate", "Table_Plate", "Table_Fork", "Table_Knife", "Table_Spoon", "Chalice", "Bottle_1", "Candle_1", "CandleStick", "Coin_Pile"];

const FURNISH_SETS = {
    tavern: furnish("tavern", "fa-solid fa-beer-mug-empty",
        { Table_Large: 0, Chair_1: 0, Bench: 0, Stool: 0.2, Barrel: 0.25, Barrel_Apples: 0.1, Crate_Wooden: 0.2, Bucket_Wooden_1: 0.1, Bag: 0.05, Barrel_Holder: 0, Shelf_Simple: 0, Lantern_Wall: 0, Torch_Metal: 0, Banner_1_Cloth: 0, Chandelier: 0, ...Object.fromEntries(TAVERN_TABLE.map((t) => [t, 0])) },
        {
            minCells: 9,
            groups: [
                { place: "center", items: ["Table_Large"], count: [1, 4], perArea: 6, margin: 1,
                    around: { items: ["Chair_1", "Chair_1", "Stool"], alt: ["Bench"], sides: "long", per: [2, 4], face: "in", gap: 0.1 },
                    ends: { items: ["Chair_1", "Stool"], chance: 0.8, face: "in", gap: 0.1 },
                    top: { items: TAVERN_TABLE, count: [3, 7] } },
                { place: "ceiling", items: ["Chandelier"], count: [1, 2], perArea: 16, over: "Table_Large" },
                { place: "corner", items: ["Barrel", "Barrel", "Barrel_Apples", "Crate_Wooden"], count: [1, 3], cluster: [1, 3] },
                { place: "wall", items: ["Barrel_Holder"], count: [0, 1] },
                { place: "wall", items: ["Shelf_Simple"], count: [0, 2], top: { items: ["Bottle_1", "Mug", "Chalice"], count: [2, 4] } },
                { place: "wall", items: ["Lantern_Wall", "Torch_Metal"], count: [1, 6], perWall: 3 },
                { place: "wall", items: ["Banner_1_Cloth"], count: [0, 1] },
                { place: "floor", items: ["Stool", "Bucket_Wooden_1", "Bag"], count: [0, 2] },
            ],
        }),
    bedroom: furnish("bedroom", "fa-solid fa-bed",
        { Bed_Twin1: 0, Bed_Twin2: 0, Nightstand_Shelf: 0, Chest_Wood: 0, Cabinet: 0, Shelf_Simple: 0, Lantern_Wall: 0, CandleStick_Stand: 0, Vase_4: 0.2, Bag: 0.3, Bucket_Wooden_1: 0.2, Stool: 0.3, Candle_1: 0, CandleStick: 0, Book_Stack_1: 0, Book_5: 0, Bottle_1: 0, Mug: 0 },
        {
            minCells: 4,
            groups: [
                { place: "wall", items: ["Bed_Twin1", "Bed_Twin2"], count: [1, 4], perArea: 6,
                    side: { items: ["Nightstand_Shelf"], chance: 0.8, at: "back", gap: 0.1, top: { items: ["Candle_1", "CandleStick", "Book_Stack_1", "Mug"], count: [1, 2] } },
                    foot: { items: ["Chest_Wood"], chance: 0.6, face: "out", gap: 0.15 } },
                { place: "wall", items: ["Cabinet"], count: [0, 1], top: { items: ["Candle_1", "Book_5", "Bottle_1", "Vase_4"], count: [1, 3] } },
                { place: "wall", items: ["Shelf_Simple"], count: [0, 1], top: { items: ["Book_Stack_1", "Candle_1", "Bottle_1"], count: [1, 3] } },
                { place: "wall", items: ["Lantern_Wall"], count: [0, 2], perWall: 4 },
                { place: "corner", items: ["CandleStick_Stand", "Vase_4"], count: [0, 1] },
                { place: "floor", items: ["Bag", "Bucket_Wooden_1", "Stool"], count: [0, 2] },
            ],
        }),
    library: furnish("library", "fa-solid fa-book",
        { Bookcase_2: 0, BookStand: 0, Table_Large: 0, Chair_1: 0, Shelf_Simple: 0, CandleStick_Stand: 0, Lantern_Wall: 0, Book_Stack_1: 0.4, Book_Stack_2: 0.4, Stool: 0.2, Book_5: 0, Book_7: 0, Scroll_1: 0, Scroll_2: 0, Candle_1: 0, CandleStick_Triple: 0, BookGroup_Small_1: 0, BookGroup_Small_2: 0, BookGroup_Medium_1: 0, BookGroup_Medium_2: 0 },
        {
            minCells: 6,
            groups: [
                { place: "wall", items: ["Bookcase_2"], fill: 0.7, count: [2, 12], shelves: { items: ["BookGroup_Medium_1", "BookGroup_Medium_2", "BookGroup_Small_1", "BookGroup_Small_2"], fill: [0.6, 0.9] } },
                { place: "center", items: ["Table_Large"], count: [0, 2], perArea: 16, margin: 1,
                    around: { items: ["Chair_1"], sides: "long", per: [1, 2], face: "in", gap: 0.1 },
                    top: { items: ["Book_Stack_1", "Book_Stack_2", "Book_5", "Book_7", "Scroll_1", "Scroll_2", "Candle_1", "CandleStick_Triple", "BookGroup_Small_1"], count: [3, 6] } },
                { place: "floor", items: ["BookStand"], count: [0, 2] },
                { place: "wall", items: ["Shelf_Simple"], count: [0, 2], top: { items: ["BookGroup_Medium_1", "BookGroup_Medium_2", "BookGroup_Small_2"], count: [1, 1] } },
                { place: "corner", items: ["CandleStick_Stand"], count: [0, 2] },
                { place: "wall", items: ["Lantern_Wall"], count: [0, 2], perWall: 4 },
                { place: "floor", items: ["Stool"], count: [0, 1] },
            ],
        }),
    storage: furnish("storage", "fa-solid fa-boxes-stacked",
        { Crate_Wooden: 0.25, Crate_Metal: 0.1, Barrel: 0.2, Barrel_Apples: 0.05, FarmCrate_Apple: 0.06, FarmCrate_Carrot: 0.06, FarmCrate_Empty: 0.06, Bag: 0.1, Bucket_Wooden_1: 0.04, Rope_1: 0.03, Rope_2: 0.03, Chain_Coil: 0.02, Barrel_Holder: 0, Shelf_Arch: 0, Peg_Rack: 0, Pot_1: 0, Vase_4: 0, Bottle_1: 0, Potion_2: 0, Torch_Metal: 0 },
        {
            minCells: 2,
            groups: [
                { place: "corner", items: ["Crate_Wooden", "Crate_Wooden", "Crate_Metal", "Barrel", "Barrel"], count: [2, 4], cluster: [2, 5],
                    top: { items: ["FarmCrate_Empty", "FarmCrate_Apple", "Bag"], count: [0, 1] } },
                { place: "wall", items: ["Barrel_Holder", "Shelf_Arch"], count: [0, 3], perWall: 4, shelves: { items: ["Vase_4", "Bottle_1", "Bottle_1", "Potion_2"], fill: [0.4, 0.7] } },
                { place: "wall", items: ["Crate_Wooden", "Barrel", "FarmCrate_Carrot", "FarmCrate_Apple", "Bag"], fill: 0.4, count: [1, 10], cluster: [1, 3] },
                { place: "wall", items: ["Peg_Rack"], count: [0, 1] },
                { place: "wall", items: ["Torch_Metal"], count: [0, 2], perWall: 5 },
                { place: "floor", items: ["Rope_1", "Rope_2", "Chain_Coil", "Bucket_Wooden_1", "Bag"], count: [1, 3] },
            ],
        }),
    kitchen: furnish("kitchen", "fa-solid fa-utensils",
        { Workbench: 0, Cauldron: 0, Table_Large: 0, Stool: 0.2, Barrel_Apples: 0.2, Barrel: 0.15, FarmCrate_Apple: 0.15, FarmCrate_Carrot: 0.15, Bucket_Wooden_1: 0.1, Bucket_Metal: 0.05, Vase_2: 0, Shelf_Simple: 0, Lantern_Wall: 0, Pot_1: 0, Pot_1_Lid: 0, Table_Plate: 0, Mug: 0, Table_Knife: 0, Table_Spoon: 0, Bottle_1: 0, Vase_4: 0 },
        {
            minCells: 4,
            groups: [
                { place: "wall", items: ["Workbench"], count: [1, 3], perWall: 4,
                    top: { items: ["Pot_1", "Pot_1_Lid", "Table_Plate", "Table_Plate", "Mug", "Table_Knife", "Table_Spoon", "Bottle_1", "Vase_4"], count: [3, 6] } },
                { place: "center", items: ["Cauldron"], count: [0, 1], margin: 0.5 },
                { place: "center", items: ["Table_Large"], count: [0, 1], perArea: 12, margin: 1,
                    around: { items: ["Stool"], sides: "long", per: [1, 2], face: "in", gap: 0.15 },
                    top: { items: ["Table_Plate", "Mug", "Pot_1", "Table_Knife", "Bottle_1"], count: [2, 5] } },
                { place: "corner", items: ["Barrel_Apples", "Barrel", "FarmCrate_Apple", "FarmCrate_Carrot", "Vase_2"], count: [1, 3], cluster: [1, 3] },
                { place: "wall", items: ["Shelf_Simple"], count: [0, 2], top: { items: ["Pot_1", "Table_Plate", "Mug", "Bottle_1"], count: [2, 3] } },
                { place: "wall", items: ["Lantern_Wall"], count: [0, 2], perWall: 4 },
                { place: "floor", items: ["Bucket_Wooden_1", "Bucket_Metal", "Stool"], count: [0, 2] },
            ],
        }),
    smithy: furnish("smithy", "fa-solid fa-hammer",
        { Anvil_Log: 0, Whetstone: 0, Workbench: 0, WeaponStand: 0, Crate_Metal: 0.25, Barrel: 0.2, Bucket_Metal: 0.2, Chain_Coil: 0.15, Rope_2: 0.1, Stool: 0.1, Axe_Bronze: 0, Pickaxe_Bronze: 0, Sword_Bronze: 0, Shield_Wooden: 0, Peg_Rack: 0, Torch_Metal: 0, Key_Metal: 0, Rope_1: 0 },
        {
            minCells: 4,
            groups: [
                { place: "center", items: ["Anvil_Log"], count: [1, 2], perArea: 12, margin: 0.75 },
                { place: "floor", items: ["Whetstone"], count: [0, 1] },
                { place: "wall", items: ["Workbench"], count: [1, 2], perWall: 5, top: { items: ["Chain_Coil", "Rope_1", "Key_Metal", "Bucket_Metal"], count: [1, 3] } },
                { place: "wall", items: ["WeaponStand"], count: [0, 2], perWall: 5, rack: { items: ["Sword_Bronze", "Axe_Bronze", "Pickaxe_Bronze"], count: [2, 4] } },
                { place: "wall", items: ["Axe_Bronze", "Pickaxe_Bronze", "Sword_Bronze", "Shield_Wooden", "Peg_Rack"], count: [1, 6], perWall: 2 },
                { place: "corner", items: ["Crate_Metal", "Barrel"], count: [1, 2], cluster: [1, 2] },
                { place: "wall", items: ["Torch_Metal"], count: [1, 3], perWall: 4 },
                { place: "floor", items: ["Bucket_Metal", "Chain_Coil", "Rope_2", "Stool"], count: [1, 3] },
            ],
        }),
    alchemy: furnish("alchemy", "fa-solid fa-flask",
        { Cauldron: 0, Workbench: 0, Table_Large: 0, Stool: 0.3, Shelf_Small_Bottles: 0, Shelf_Simple: 0, Bookcase_2: 0, Cabinet: 0, Vase_2: 0.25, Vase_4: 0.25, Cage_Small: 0.2, CandleStick_Stand: 0, Potion_1: 0, Potion_2: 0, Potion_4: 0, SmallBottle: 0, SmallBottles_1: 0, Bottle_1: 0, Book_5: 0, Scroll_1: 0, Candle_1: 0, CandleStick_Triple: 0, Chalice: 0, Pot_1: 0 },
        {
            minCells: 4,
            groups: [
                { place: "center", items: ["Cauldron"], count: [1, 1], margin: 0.75 },
                { place: "wall", items: ["Workbench", "Table_Large"], count: [1, 2], perWall: 5,
                    front: { items: ["Stool"], chance: 0.7, face: "in", gap: 0.15 },
                    top: { items: ["Potion_1", "Potion_2", "Potion_4", "SmallBottle", "SmallBottles_1", "Bottle_1", "Book_5", "Scroll_1", "Candle_1", "CandleStick_Triple", "Chalice", "Pot_1"], count: [4, 8] } },
                { place: "wall", items: ["Shelf_Small_Bottles"], count: [1, 2] },
                { place: "wall", items: ["Shelf_Simple"], count: [0, 2], top: { items: ["Potion_1", "Potion_2", "Potion_4", "SmallBottles_1"], count: [2, 4] } },
                { place: "wall", items: ["Bookcase_2", "Cabinet"], count: [0, 1], top: { items: ["Potion_2", "Vase_4", "Candle_1"], count: [0, 2] } },
                { place: "corner", items: ["Vase_2", "Vase_4", "Cage_Small", "CandleStick_Stand"], count: [1, 3] },
                { place: "floor", items: ["Vase_4", "Cage_Small"], count: [0, 1] },
            ],
        }),
    shop: furnish("shop", "fa-solid fa-store",
        { Stall_Empty: 0, Stall_Cart_Empty: 0, Cabinet: 0, Workbench: 0, Shelf_Arch: 0, Barrel_Apples: 0.25, FarmCrate_Apple: 0.2, FarmCrate_Carrot: 0.2, Crate_Wooden: 0.15, Bag: 0.15, Vase_2: 0.05, Coin_Pile: 0, Coin_Pile_2: 0, Pouch_Large: 0, Potion_1: 0, Potion_2: 0, SmallBottles_1: 0, Scroll_1: 0, Bottle_1: 0, Vase_4: 0, Key_Metal: 0, Lantern_Wall: 0, Banner_1: 0 },
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
                { place: "wall", items: ["Lantern_Wall"], count: [0, 2], perWall: 4 },
                { place: "wall", items: ["Banner_1"], count: [0, 1], exterior: true },
            ],
        }),
    armory: furnish("armory", "fa-solid fa-shield-halved",
        { WeaponStand: 0, Dummy: 0, Chest_Wood: 0, Crate_Metal: 0.3, Barrel: 0.2, Crate_Wooden: 0.2, Bag: 0.1, Chain_Coil: 0.1, Rope_2: 0.1, Shield_Wooden: 0, Sword_Bronze: 0, Axe_Bronze: 0, Peg_Rack: 0, Banner_1_Cloth: 0, Banner_2_Cloth: 0, Torch_Metal: 0 },
        {
            minCells: 4,
            groups: [
                { place: "wall", items: ["WeaponStand"], count: [1, 4], perWall: 3, rack: { items: ["Sword_Bronze", "Sword_Bronze", "Axe_Bronze"], count: [2, 4] } },
                { place: "wall", items: ["Shield_Wooden", "Sword_Bronze", "Axe_Bronze", "Peg_Rack"], count: [2, 8], perWall: 1.5 },
                { place: "wall", items: ["Banner_1_Cloth", "Banner_2_Cloth"], count: [0, 2], perWall: 5 },
                { place: "center", items: ["Dummy"], count: [0, 2], perArea: 10, margin: 1 },
                { place: "wall", items: ["Chest_Wood"], count: [0, 2] },
                { place: "corner", items: ["Crate_Metal", "Barrel", "Crate_Wooden"], count: [1, 3], cluster: [1, 3] },
                { place: "wall", items: ["Torch_Metal"], count: [1, 3], perWall: 4 },
                { place: "floor", items: ["Chain_Coil", "Rope_2", "Bag"], count: [0, 2] },
            ],
        }),
};

const THUMBS = {
    ...NATURE_THUMBS,
    tavern: `${PROPS}Mug`, bedroom: `${PROPS}Bed_Twin1`, library: `${PROPS}Bookcase_2`, storage: `${PROPS}Crate_Wooden`,
    kitchen: `${PROPS}Cauldron`, smithy: `${PROPS}Anvil_Log`, alchemy: `${PROPS}Potion_2`, shop: `${PROPS}Coin_Pile_2`, armory: `${PROPS}Shield_Wooden`,
};

export const SCATTER_SETS = Object.fromEntries(Object.entries({ ...NATURE_SETS, ...FURNISH_SETS }).map(([id, set]) => [id, { ...set, thumb: THUMBS[id] ? `${THUMBS[id]}.webp` : null }]));
