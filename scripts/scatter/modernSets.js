const FURNITURE = "modules/canvas3dcompendium/assets/Tiles/Furniture/";

const uf = (prop) => (file, [x0, y0, z0, x1, y1, z1], scale, { id = file, ...o } = {}) =>
    prop(`MD_${id}`, [x1 - x0, z1 - z0, y1 - y0], { src: `${FURNITURE}${file}.glb`, back: -z0, ...(Math.abs(x0 + x1) > 0.04 ? { pivot: [(x0 + x1) / 2, 0] } : {}), scale: [scale, scale], ...o });

export function modernProps(prop) {
    const f = uf(prop);
    return [
        f("Bed_Single", [-0.967, 0, -1.97, 1.013, 1.354, 1.97], 0.5, { placement: "wall", backed: true }),
        f("Bed_King", [-1.532, 0, -1.976, 1.532, 1.215, 1.976], 0.5, { placement: "wall", backed: true }),
        f("NightStand_1", [-0.476, 0, -0.476, 0.476, 0.829, 0.476], 0.5, { placement: "wall", top: 0.83 }),
        f("NightStand_2", [-0.476, 0, -0.476, 0.476, 0.949, 0.476], 0.5, { placement: "wall", top: 0.95 }),
        f("NightStand_3", [-0.476, 0, -0.476, 0.476, 0.829, 0.476], 0.5, { placement: "wall", top: 0.83 }),
        f("Drawer_1", [-1.397, 0, -0.559, 1.397, 1.344, 0.56], 0.5, { placement: "wall", top: 1.34 }),
        f("Drawer_2", [-2.018, 0, -0.559, 2.018, 1.295, 0.56], 0.5, { placement: "wall", top: 1.29 }),
        f("Closet", [-0.777, 0, -0.43, 0.776, 2.97, 0.44], 0.65, { placement: "wall", backed: true, blocking: true }),
        f("Couch_Medium1", [-2.344, 0, -1.183, 2.344, 1.897, 1.02], 0.5, { placement: "wall" }),
        f("Couch_Medium2", [-2.259, 0, -0.946, 2.259, 1.959, 1.054], 0.5, { placement: "wall" }),
        f("Couch_Small1", [-1.443, 0, -1.183, 1.443, 1.897, 1.02], 0.45, { placement: "wall" }),
        f("Sofa", [-2.121, 0, -0.901, 2.121, 1.5, 0.883], 0.5, { placement: "wall" }),
        f("Sofa_individual", [-0.817, 0, -0.694, 0.821, 1.351, 0.744], 0.5, { id: "Armchair" }),
        f("Table (2)", [-0.553, 0, -0.508, 0.553, 0.618, 0.508], 0.75, { id: "CoffeeTable", placement: "center", top: 0.618 }),
        f("Table (2)", [-0.553, 0, -0.508, 0.553, 0.618, 0.508], 1.15, { id: "CafeTable", placement: "center", top: 0.618 }),
        f("Table_RoundSmall", [-0.97, 0, -0.97, 0.97, 1.145, 0.97], 0.45, { placement: "center", top: 1.15 }),
        f("Table", [-0.709, 0, -1.39, 0.709, 0.825, 1.39], 0.9, { placement: "center", top: 0.82 }),
        f("Chair_1", [-0.381, 0, -0.445, 0.381, 1.764, 0.381], 0.5),
        f("Chair_2", [-0.381, 0, -0.445, 0.381, 1.686, 0.381], 0.5),
        f("Chair_3", [-0.381, 0, -0.457, 0.381, 1.687, 0.381], 0.5),
        f("Desk", [-0.911, 0, -0.452, 0.911, 0.922, 0.394], 0.8, { placement: "wall", top: 0.92 }),
        f("OfficeChair", [-0.361, 0, -0.442, 0.36, 1.128, 0.365], 0.9),
        f("Bookcase_Books", [-0.917, 0, -0.287, 0.925, 3.353, 0.378], 0.5, { placement: "wall", backed: true, blocking: true }),
        f("Shelf_2", [-0.56, 0, -0.378, 0.559, 4.438, 0.378], 0.5, { placement: "wall", backed: true, blocking: true }),
        f("Fireplace", [-1.625, 0, -0.492, 1.625, 2.561, 0.665], 0.5, { placement: "wall", backed: true, blocking: true }),
        f("Carpet_1", [-1.058, 0, -1.556, 1.073, 0.036, 1.537], 0.8, { yOffset: 0.01 }),
        f("Carpet_2", [-1.456, 0, -1.558, 1.637, 0.036, 1.624], 0.85, { yOffset: 0.01 }),
        f("Carpet_Round", [-1.246, 0, -1.266, 1.246, 0.016, 1.266], 0.8, { yOffset: 0.01 }),
        f("Kitchen_1Drawers", [-0.505, 0, -0.505, 0.505, 1.62, 0.615], 0.55, { placement: "wall", backed: true, top: 1.6 }),
        f("Kitchen_2Drawers", [-0.505, 0, -0.505, 0.505, 1.625, 0.615], 0.55, { placement: "wall", backed: true, top: 1.6 }),
        f("Kitchen_3Drawers", [-0.505, 0, -0.505, 0.505, 1.625, 0.615], 0.55, { placement: "wall", backed: true, top: 1.6 }),
        f("Kitchen_Sink", [-0.505, 0, -0.505, 0.505, 1.924, 0.615], 0.55, { placement: "wall", backed: true }),
        f("Kitchen_Oven", [-0.505, 0, -0.505, 0.505, 1.617, 0.615], 0.55, { placement: "wall", backed: true }),
        f("Kitchen_Fridge", [-0.649, 0, -0.584, 0.649, 3.316, 0.718], 0.55, { placement: "wall", backed: true, blocking: true }),
        f("Bathroom_Bathtub", [-0.804, 0, -2.124, 0.804, 1.253, 1.776], 0.5, { placement: "wall" }),
        f("Bathroom_Shower1", [-0.824, 0, -1.025, 1.072, 3.453, 0.868], 0.5, { placement: "corner" }),
        f("Bathroom_Toilet", [-0.598, 0, -0.9, 0.598, 1.888, 0.792], 0.5, { placement: "wall", backed: true }),
        f("Bathroom_Sink", [-0.695, 0, -0.304, 0.695, 1.597, 0.512], 0.5, { placement: "wall", backed: true }),
        f("Bathroom_WashingMachine", [-0.646, 0, -0.618, 0.646, 1.47, 0.706], 0.6, { placement: "wall", backed: true }),
        f("Bathroom_Mirror1", [-0.324, -0.465, -0.04, 0.324, 0.465, 0.062], 1, { placement: "wall", hung: true, yOffset: 1.55, back: 0.04 }),
        f("Bathroom_Towel", [-0.561, -0.621, -0.127, 0.624, 0.032, 0.035], 1, { placement: "wall", hung: true, yOffset: 1.6, back: 0.13 }),
        f("Bathroom_ToiletPaperPile", [-0.167, 0, -0.175, 0.167, 0.377, 0.175], 0.8),
        f("Houseplant_3", [-0.169, 0, -0.169, 0.173, 0.846, 0.169], 1),
        f("Houseplant_4", [-0.169, 0, -0.169, 0.169, 0.93, 0.169], 1),
        f("Houseplant_6", [-0.475, 0, -0.571, 0.565, 0.96, 0.479], 1),
        f("Houseplant_7", [-0.538, 0, -0.586, 0.628, 0.883, 0.634], 1),
        f("Houseplant_8", [-0.285, 0, -0.264, 0.232, 1.558, 0.254], 1),
        f("Houseplant_2", [-0.125, 0, -0.125, 0.125, 0.386, 0.125], 0.8, { placement: "table" }),
        f("Houseplant_5", [-0.236, 0, -0.289, 0.276, 0.425, 0.239], 0.7, { placement: "table" }),
        f("Vase", [-0.114, 0, -0.114, 0.114, 0.31, 0.114], 1, { placement: "table" }),
        f("Vase2", [-0.084, 0, -0.084, 0.084, 0.304, 0.084], 1, { placement: "table" }),
        f("Plate_1", [-0.187, 0, -0.196, 0.187, 0.032, 0.196], 0.65, { placement: "table" }),
        f("Light_Desk", [-0.126, 0, -0.126, 0.126, 0.573, 0.327], 1, { placement: "table" }),
        f("Lamp", [-0.116, 0, -0.121, 0.116, 1.039, 0.124], 0.5, { placement: "table" }),
        f("Light_Floor1", [-0.14, 0, -0.148, 0.14, 1.618, 0.148], 1),
        f("Trashcan_Small1", [-0.252, 0, -0.142, 0.251, 0.706, 0.164], 0.8),
        f("Trashcan_Cylindric", [-0.377, 0, -0.377, 0.377, 1.074, 0.377], 0.55),
        f("Light_Chandelier", [-0.407, -0.519, -0.407, 0.407, 0, 0.407], 1, { placement: "ceiling" }),
        f("Light_Ceiling3", [-0.269, -0.678, -0.269, 0.269, 0, 0.269], 1, { placement: "ceiling" }),
        f("Light_Ceiling5", [-0.266, -0.134, -0.279, 0.266, 0, 0.279], 1, { placement: "ceiling" }),
        f("Light_Cube", [-0.282, -1.034, -0.282, 0.282, 0, 0.282], 1, { placement: "ceiling" }),
    ];
}

const CEILING = (items, n = 1, over = null) => ({ place: "ceiling", items, count: [1, n], perArea: 10, ...(over ? { over } : {}) });
const DECOR = ["MD_Vase", "MD_Vase2", "MD_Houseplant_2", "MD_Houseplant_5"];
const FLOOR_PLANTS = ["MD_Houseplant_8", "MD_Houseplant_6", "MD_Houseplant_7", "MD_Houseplant_3", "MD_Houseplant_4"];
const KITCHEN_TOP = ["MD_Plate_1", "MD_Vase2", "MD_Houseplant_2", "MD_Houseplant_5"];
const COUNTER = ["MD_Kitchen_2Drawers", "MD_Kitchen_Sink", "MD_Kitchen_3Drawers", "MD_Kitchen_1Drawers", "MD_Kitchen_Oven", "MD_Kitchen_2Drawers", "MD_Kitchen_3Drawers"];
const SEATS = ["MD_Couch_Medium1", "MD_Couch_Medium2", "MD_Sofa"];

export function modernFurnish(kitFurnish, clutterOf) {
    const md = (id, icon, clutter, rules) => kitFurnish(id, icon, { ...Object.fromEntries(rules.groups.flatMap((g) => g.chain ?? []).map((pid) => [pid, 0])), ...clutter }, { family: "modern", ...rules });
    return {
        mdLiving: md("mdLiving", "fa-solid fa-couch", clutterOf(["MD_Houseplant_4"], 0.2), {
            minCells: 4,
            groups: [
                { place: "wall", items: SEATS, count: [1, 1], mid: true,
                    front: { items: ["MD_CoffeeTable"], chance: 1, face: "in", gap: 0.35, walk: true, under: { items: ["MD_Carpet_2", "MD_Carpet_1", "MD_Carpet_Round"], chance: 1, once: true }, top: { items: DECOR, count: [1, 2] } },
                    side: { items: ["MD_Light_Floor1", "MD_Houseplant_8", "MD_NightStand_3"], chance: 0.9, gap: 0.1, both: true, top: { items: ["MD_Lamp", "MD_Vase"], count: [1, 1] } } },
                { place: "wall", items: ["MD_Fireplace"], count: [0, 1], minRoom: 12, mid: true, side: { items: ["MD_Houseplant_8", "MD_Light_Floor1"], chance: 0.8, gap: 0.2, both: true } },
                { place: "wall", items: ["MD_Bookcase_Books"], count: [1, 3], perWall: 3, cluster: [1, 2] },
                { place: "wall", items: ["MD_Drawer_2", "MD_Drawer_1"], count: [1, 2], perWall: 5, top: { items: [...DECOR, "MD_Lamp"], count: [2, 3] } },
                { place: "wall", items: ["MD_Armchair"], count: [1, 2], perWall: 4, minRoom: 8, side: { items: ["MD_Light_Floor1", "MD_Houseplant_3"], chance: 0.7, gap: 0.15 } },
                { place: "corner", items: [...FLOOR_PLANTS, "MD_Light_Floor1"], count: [2, 4] },
                CEILING(["MD_Light_Chandelier", "MD_Light_Ceiling3"]),
            ],
        }),
        mdKitchen: md("mdKitchen", "fa-solid fa-kitchen-set", clutterOf(["MD_Trashcan_Cylindric"], 0.2), {
            minCells: 3,
            groups: [
                { place: "wall", items: ["MD_Kitchen_Fridge"], count: [1, 1], chain: COUNTER, top: { items: KITCHEN_TOP, count: [0, 2] } },
                { place: "wall", items: ["MD_Kitchen_2Drawers"], count: [0, 1], minRoom: 8, chain: ["MD_Kitchen_3Drawers", "MD_Kitchen_1Drawers", "MD_Kitchen_2Drawers"], top: { items: KITCHEN_TOP, count: [0, 1] } },
                { place: "center", items: ["MD_Table"], count: [0, 1], minRoom: 6, margin: 0.9,
                    around: { items: ["MD_Chair_1", "MD_Chair_2", "MD_Chair_3"], per: [2, 2], face: "in", gap: 0.05 },
                    ends: { items: ["MD_Chair_1", "MD_Chair_3"], chance: 0.7, face: "in", gap: 0.05 },
                    under: { items: ["MD_Carpet_1"], chance: 0.4, once: true },
                    top: { items: ["MD_Plate_1", "MD_Plate_1", "MD_Plate_1", "MD_Vase", "MD_Houseplant_2"], count: [3, 5] } },
                { place: "wall", items: ["MD_Drawer_1"], count: [0, 1], minRoom: 12, top: { items: KITCHEN_TOP, count: [1, 2] } },
                { place: "corner", items: ["MD_Trashcan_Cylindric", ...FLOOR_PLANTS], count: [1, 3] },
                CEILING(["MD_Light_Ceiling3", "MD_Light_Chandelier"], 2, "MD_Table"),
                CEILING(["MD_Light_Ceiling5"]),
            ],
        }),
        mdBedroom: md("mdBedroom", "fa-solid fa-bed", {}, {
            minCells: 3,
            groups: [
                { place: "wall", items: ["MD_Bed_King", "MD_Bed_Single", "MD_Bed_King"], count: [1, 2], perArea: 12, mid: true,
                    side: { items: ["MD_NightStand_1", "MD_NightStand_2", "MD_NightStand_3"], chance: 1, at: "back", gap: 0.08, both: true, top: { items: ["MD_Lamp", "MD_Lamp", "MD_Vase", "MD_Houseplant_2"], count: [1, 1] } },
                    under: { items: ["MD_Carpet_1", "MD_Carpet_2"], chance: 0.8, once: true } },
                { place: "wall", items: ["MD_Closet"], count: [1, 2], perWall: 6 },
                { place: "wall", items: ["MD_Drawer_1", "MD_Drawer_2"], count: [1, 1], top: { items: [...DECOR, "MD_Lamp"], count: [1, 3] } },
                { place: "wall", items: ["MD_Desk"], count: [0, 1], minRoom: 9, front: { items: ["MD_Chair_2"], chance: 0.9, face: "in", gap: 0.05, walk: true }, top: { items: ["MD_Light_Desk", "MD_Houseplant_2", "MD_Vase2"], count: [1, 2] } },
                { place: "wall", items: ["MD_Armchair"], count: [0, 1], minRoom: 9, side: { items: ["MD_Light_Floor1"], chance: 0.8, gap: 0.1 } },
                { place: "center", items: ["MD_Carpet_Round", "MD_Carpet_2"], count: [0, 1], minRoom: 8, margin: 0.5 },
                { place: "corner", items: [...FLOOR_PLANTS, "MD_Light_Floor1"], count: [1, 3] },
                CEILING(["MD_Light_Ceiling5", "MD_Light_Chandelier"]),
            ],
        }),
        mdBathroom: md("mdBathroom", "fa-solid fa-bath", {}, {
            minCells: 2,
            groups: [
                { place: "wall", items: ["MD_Bathroom_Bathtub"], count: [1, 1], minRoom: 5 },
                { place: "corner", items: ["MD_Bathroom_Shower1"], count: [0, 1], minRoom: 3 },
                { place: "wall", items: ["MD_Bathroom_Toilet"], count: [1, 1], side: { items: ["MD_Bathroom_ToiletPaperPile", "MD_Trashcan_Small1"], chance: 0.8, gap: 0.1 } },
                { place: "wall", items: ["MD_Bathroom_Sink"], count: [1, 2], perWall: 3 },
                { place: "wall", items: ["MD_Bathroom_WashingMachine"], count: [0, 1], minRoom: 5 },
                { place: "wall", items: ["MD_Bathroom_Mirror1"], count: [1, 2], perWall: 3 },
                { place: "wall", items: ["MD_Bathroom_Towel"], count: [1, 2], perWall: 3 },
                { place: "corner", items: ["MD_Houseplant_3", "MD_Houseplant_4", "MD_Trashcan_Small1"], count: [1, 2] },
                CEILING(["MD_Light_Ceiling5"]),
            ],
        }),
        mdOffice: md("mdOffice", "fa-solid fa-briefcase", clutterOf(["MD_Trashcan_Small1"], 0.2), {
            minCells: 3,
            groups: [
                { place: "center", items: ["MD_Table"], count: [0, 1], minRoom: 16, margin: 1,
                    around: { items: ["MD_OfficeChair"], per: [2, 3], face: "in", gap: 0.02 },
                    top: { items: ["MD_Vase", "MD_Houseplant_2", "MD_Plate_1"], count: [1, 2] } },
                { place: "wall", items: ["MD_Desk"], count: [1, 6], perWall: 2.5, front: { items: ["MD_OfficeChair"], chance: 1, face: "in", gap: 0.02, walk: true }, top: { items: ["MD_Light_Desk", "MD_Houseplant_2", "MD_Vase2", "MD_Houseplant_5"], count: [1, 2] } },
                { place: "wall", items: ["MD_Bookcase_Books", "MD_Shelf_2"], count: [1, 3], perWall: 3, cluster: [1, 2] },
                { place: "wall", items: ["MD_Couch_Small1"], count: [0, 1], minRoom: 12, side: { items: ["MD_Houseplant_8"], chance: 0.8, gap: 0.15 } },
                { place: "wall", items: ["MD_Drawer_1"], count: [0, 1], minRoom: 9, top: { items: DECOR, count: [1, 2] } },
                { place: "corner", items: [...FLOOR_PLANTS, "MD_Trashcan_Small1"], count: [2, 3] },
                CEILING(["MD_Light_Ceiling5"], 2),
            ],
        }),
        mdCafe: md("mdCafe", "fa-solid fa-mug-hot", clutterOf(["MD_Houseplant_4"], 0.2), {
            minCells: 6,
            groups: [
                { place: "wall", items: ["MD_Kitchen_Fridge"], count: [1, 1], chain: ["MD_Kitchen_2Drawers", "MD_Kitchen_Sink", "MD_Kitchen_3Drawers", "MD_Kitchen_2Drawers", "MD_Kitchen_1Drawers", "MD_Kitchen_Fridge"], top: { items: KITCHEN_TOP, count: [1, 2] } },
                { place: "center", items: ["MD_CafeTable"], count: [2, 6], perArea: 6, margin: 0.8,
                    around: { items: ["MD_Chair_1", "MD_Chair_2", "MD_Chair_3"], per: [1, 1], face: "in", gap: 0.05 },
                    top: { items: ["MD_Plate_1", "MD_Vase2", "MD_Houseplant_2"], count: [1, 2] } },
                { place: "wall", items: ["MD_Couch_Small1"], count: [0, 2], perWall: 5, minRoom: 12 },
                { place: "wall", items: ["MD_Shelf_2", "MD_Bookcase_Books"], count: [0, 2], perWall: 5 },
                { place: "corner", items: FLOOR_PLANTS, count: [2, 4] },
                CEILING(["MD_Light_Ceiling3"], 4, "MD_CafeTable"),
            ],
        }),
    };
}

export const MODERN_THUMBS = {
    mdLiving: `${FURNITURE}Couch_Medium1`,
    mdKitchen: `${FURNITURE}Kitchen_Oven`,
    mdBedroom: `${FURNITURE}Bed_King`,
    mdBathroom: `${FURNITURE}Bathroom_Bathtub`,
    mdOffice: `${FURNITURE}Desk`,
    mdCafe: `${FURNITURE}Table_RoundSmall`,
};
