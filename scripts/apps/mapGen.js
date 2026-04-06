
import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { SimplexNoise, Perlin, FractionalBrownianMotion } from "../lib/noiseFunctions.js";
import { tTypes } from "../helpers/helpers.js";
import * as ROT from "../generators/ROT/index.js";

// let ROT = null;

export class MapGen extends HandlebarsApplication {

    constructor(document) {
        super();
        this.document = document;
        const data = this.document.getFlag("levels-3d-preview", "mapgen");
        this.document.setFlag("levels-3d-preview", "dynaMesh", "mapGen");
        this.document.sheet.close();
        if (!data) this.document.setFlag("levels-3d-preview", "mapgen", this.generateDefaultData());
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            id: "mapgen",
            tag: "form",
            window: {
                title: "levels3dpreview.mapgen.title",
            },
            position: {
                width: 1000,
                height: 600,
            },
            form: {
                handler: this._updateObject,
                submitOnChange: true,
                closeOnSubmit: false,
            }
        });
    }

    static get PARTS() {
        return {
            content: {
                template: `modules/levels-3d-preview/templates/mapgen/squareGrid.hbs`,
            }
        }
    }
    
    get title() {
        return game.i18n.localize("levels3dpreview.mapgen.title") + `${canvas.scene.grid.distance} ${canvas.scene.grid.units}`;
    }
    
    async generate(gen, event) {
        // if (!ROT) ROT = await import("../generators/ROT/index.js");
        if (game.keyboard.downKeys.has("ShiftLeft") || game.keyboard.downKeys.has("ShiftRight")) {
            const genFn = this._getGenerator(gen).bind(this);
            const count = this.cellHeight ?? 3;
            this.setCells(this._getMaps(genFn, 1, count, gen), gen !== "rogue" && gen !== "cellular-caves", count);
            return;
        }
        const content = game.i18n.localize("levels3dpreview.mapgen.generator.content") + `<hr><span>${game.i18n.localize("levels3dpreview.mapgen.generator.height")}: <input type="number" name="mapgen-count" value="${this.cellHeight ?? 3}" min="1"/></span><hr>`;
        const result = await foundry.applications.api.DialogV2.input({
            window: { title: game.i18n.localize("levels3dpreview.mapgen.generator.title") },
            content: content,
        });
        if (result) {
            const count = result["mapgen-count"];
            this.cellHeight = count;
            const genFn = this._getGenerator(gen).bind(this);
            this.setCells(this._getMaps(genFn, 1, count, gen), gen !== "rogue" && gen !== "cellular-caves", count);
        }
    }

    _getGenerator(gen) {
        switch (gen) {
            case "rogue":
                return this._generateRogue.bind(this);
            case "cellular-caves":
                return this._generateCellular.bind(this);
            default:
                return this._generateLandscape.bind(this);
        }
    }

    _getMaps(genFn, count = 1, cHeight, gen) {
        let maps = [];
        for (let i = 0; i < count; i++) {
            let map = null;
            let tries = 0;
            while (!map && tries < 10) {
                try {
                    const m = genFn(this._prepareContext().columns, this._prepareContext().rows, cHeight, gen);
                    map = m;
                } catch (e) {
                    console.warn("Failed to generate, retrying...");
                }
                tries++;
            }
            if (!map) ui.notifications.error("Failed to generate map, please try again with a different grid size.");
            maps.push(map);
        }
        return maps;
    }

    _generateRogue(w, h) {
        const cell = new ROT.Map.Rogue(w, h, { connected: true });
        cell.create();
        return cell.map;
    }

    _generateCellular(h, w) {
        const cell = new ROT.Map.Cellular(w, h, { connected: true });
        cell.randomize(0.5);
        for (let i = 0; i < 5; i++) {
            cell.create();
        }
        cell.connect();
        return cell._map;
    }

    _generateLandscape(w, h, maxH, type) {
        const simplex = new SimplexNoise();
        const params = this._getParams(type);
        const map = [];
        for (let i = 0; i < h; i++) {
            map.push([]);
            for (let j = 0; j < w; j++) {
                const n = FractionalBrownianMotion(i / 10, j / 10, simplex.noise.bind(simplex), params);
                const height = Math.ceil((n + 0.000001) * maxH);
                map[i][j] = height;
            }
        }
        return map;
    }

    _getParams(type) {
        switch (type) {
            case "shore":
                return {
                    scale: 5,
                    height: 1,
                    persistence: 0.5,
                    octaves: 1,
                    lacunarity: 1,
                    exponent: 2,
                    flattening: 1,
                };
            case "mountain":
                return {
                    scale: 1,
                    height: 1,
                    persistence: 0.5,
                    octaves: 1,
                    lacunarity: 1,
                    exponent: 3,
                    flattening: 1,
                };
            case "hills":
                return {
                    scale: 2,
                    height: 1,
                    persistence: 0.5,
                    octaves: 1,
                    lacunarity: 1,
                    exponent: 7,
                    flattening: 2,
                };
            case "plateau":
                return {
                    scale: 5,
                    height: 1,
                    persistence: 1,
                    octaves: 3,
                    lacunarity: 2,
                    exponent: 4,
                    flattening: 2,
                };
            case "island":
                return {
                    scale: 7,
                    height: 1,
                    persistence: 1,
                    octaves: 1,
                    lacunarity: 8,
                    exponent: 1,
                    flattening: 1,
                };
            default:
                return this.fbmParams;
        }
    }

    get fbmParams() {
        return {
            scale: this.document.getFlag("levels-3d-preview", "noiseScale") ?? 1,
            height: this.document.getFlag("levels-3d-preview", "noiseHeight") ?? 1,
            persistence: this.document.getFlag("levels-3d-preview", "noisePersistence") ?? 0.5,
            octaves: this.document.getFlag("levels-3d-preview", "noiseOctaves") ?? 1,
            lacunarity: this.document.getFlag("levels-3d-preview", "noiseLacunarity") ?? 2,
            exponent: (this.document.getFlag("levels-3d-preview", "noiseExponent") ?? 1) * 2,
            flattening: 1 - (this.document.getFlag("levels-3d-preview", "noiseFlattening") ?? 0),
        };
    }

    async setCells(_maps, setValue = false, cHeight = 3) {
        const flag = this.document.getFlag("levels-3d-preview", "mapgen");
        const rows = flag.rows;
        const columns = flag.columns;
        const materialMap = this.mapMaterials(flag.materials, cHeight);
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
                for (let m = 0; m < _maps.length; m++) {
                    if (!setValue) {
                        if (m == 0) flag.cells[i][j].elevation = _maps[m][i][j] ? cHeight : 1;
                        else if (flag.cells[i][j].elevation == 3 + m) flag.cells[i][j].elevation += _maps[m][i][j];
                    } else {
                        flag.cells[i][j].elevation = _maps[m][i][j];
                    }
                    flag.cells[i][j].materialId = materialMap[flag.cells[i][j].elevation];
                }
            }
        }
        await this.document.setFlag("levels-3d-preview", "mapgen", flag);
        this.saveGridAndRefresh();
    }

    mapMaterials(materials, cHeight) {
        const matCount = materials.length - 1;
        const map = [];
        map[0] = null;
        map[1] = materials[0]?.materialId ?? "";
        for (let i = 2; i <= cHeight; i++) {
            map[i] = materials[Math.ceil((i - 1) * (matCount / cHeight))]?.materialId ?? "";
        }
        map[cHeight] = materials[matCount]?.materialId;
        return map;
    }

    _prepareContext(options) {
        const flag = this.document.getFlag("levels-3d-preview", "mapgen");
        if (!flag) return this.generateDefaultData();
        const rows = flag.rows;
        const columns = flag.columns;
        if (flag.cells.length < rows) {
            const toAdd = rows - flag.cells.length;
            for (let i = 0; i < toAdd; i++) {
                flag.cells.push([]);
            }
        } else if (flag.cells.length > rows) {
            const toRemove = flag.cells.length - rows;
            flag.cells.splice(rows, toRemove);
        }
        for (let i = 0; i < rows; i++) {
            if (flag.cells[i].length < columns) {
                const toAdd = columns - flag.cells[i].length;
                for (let j = 0; j < toAdd; j++) {
                    flag.cells[i].push({
                        elevation: 1,
                        materialId: "",
                    });
                }
            } else if (flag.cells[i].length > columns) {
                const toRemove = flag.cells[i].length - columns;
                flag.cells[i].splice(columns, toRemove);
            }
        }
        for (let row of flag.cells) {
            for (let cell of row) {
                const material = flag.materials.find((m) => m.materialId === cell.materialId);
                cell.cellColor = cell.materialId ? material?.cellColor || "#ffffff" : "#ffffff";
            }
        }
        flag.zoomLevel = this._zoomLevel || 0.5;
        for (let mat of flag.materials) {
            let colorSrc = mat.texture.src || "";
            tTypes.forEach((t) => {
                colorSrc = colorSrc.replace(t, "Color");
            });
            mat.colorSrc = colorSrc;
        }
        return flag;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        this._setupContextMenu();

        this._restoreGridDisplay();
        html.querySelector("#zoom-level").addEventListener("change", (event) => {
            const zoomLevel = event.target.value;
            this._zoomLevel = zoomLevel;
            document.documentElement.style.setProperty("--mapgen-cellsize", `${zoomLevel * 100}px`);
        });

        const gridContainer = html.querySelector(".grid-container");
        gridContainer.addEventListener("mousedown", (event) => {
            if (!event.target.closest(".grid-cell")) return;
            const cell = event.target.closest(".grid-cell");
            this.toggleCell(cell, !cell.classList.contains("selected"));
            this._cellMouseDown = true;
            this._dragActionToggle = cell.classList.contains("selected");
        });

        gridContainer.addEventListener("mouseup", (event) => {
            if (!event.target.closest(".grid-cell")) return;
            this._cellMouseDown = false;
        });

        gridContainer.addEventListener("mouseover", (event) => {
            if (!event.target.closest(".grid-cell")) return;
            if (this._cellMouseDown) {
                this.toggleCell(event.target.closest(".grid-cell"), this._dragActionToggle);
            }
        });

        html.querySelector("#set-elevation").addEventListener("click", (event) => {
            const elevation = html.querySelector("#elevation").value;
            this.selected.forEach((element) => {
                element.querySelector(".elevation").value = elevation;
            });
        });

        html.querySelector("#deselect-all").addEventListener("click", (event) => {
            this.selected.forEach((element) => {
                this.toggleCell(element, false);
            });
        });

        html.querySelector("#select-all").addEventListener("click", (event) => {
            html.querySelectorAll(".grid-cell").forEach((element) => {
                this.toggleCell(element, true);
            });
        });

        html.querySelector("#select-elevation").addEventListener("click", (event) => {
            const elevation = html.querySelector("#elevation").value;
            html.querySelectorAll(".grid-cell").forEach((element) => {
                const cellElevation = element.querySelector(".elevation").value;
                if (elevation == cellElevation) this.toggleCell(element, true);
            });
        });

        html.querySelector("#invert").addEventListener("click", (event) => {
            html.querySelectorAll(".grid-cell").forEach((element) => {
                this.toggleCell(element, !element.classList.contains("selected"));
            });
        });

        html.querySelector("#clear-material").addEventListener("click", (event) => {
            this.selected.forEach((element) => {
                element.querySelector("input.material-id").value = "";
            });
        });

        html.querySelectorAll("#apply-material").forEach(el => el.addEventListener("click", (event) => {
            const materialEl = event.target.closest(".material-item");
            const materialId = materialEl.dataset.materialId;
            this.selected.forEach((element) => {
                element.querySelector("input.material-id").value = materialId;
            });
            this.submit();
        }));

        html.querySelector("#add-material").addEventListener("click", async (event) => {
            const flag = this.document.getFlag("levels-3d-preview", "mapgen");
            flag.materials.push({
                texture: { repeat: 1 },
                collapsed: false,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            });
            await this.document.setFlag("levels-3d-preview", "mapgen", flag);
            this.saveGridAndRefresh();
        });

        html.querySelectorAll("#delete-material").forEach(el => el.addEventListener("click", async (event) => {
            const materialIndex = parseInt(event.target.closest(".material-item").dataset.materialIndex);
            const flag = this.document.getFlag("levels-3d-preview", "mapgen");
            flag.materials.splice(materialIndex, 1);
            await this.document.setFlag("levels-3d-preview", "mapgen", flag);
            this.saveGridAndRefresh();
        }));

        html.querySelectorAll("#toggle-material").forEach(el => el.addEventListener("click", (event) => {
            const checkbox = event.target.closest(".material-item").querySelector("#collapsed-toggle");
            // checkbox.dispatchEvent(new Event("click"));
            checkbox.checked = !checkbox.checked;
            this.form.dispatchEvent(new Event("change"));
        }));

        html.querySelectorAll("#select-all-material").forEach(el => el.addEventListener("click", (event) => {
            const materialId = event.target.closest(".material-item").dataset.materialId;
            html.querySelectorAll(`.grid-cell input.material-id[value="${materialId}"]`).forEach((input) => {
                this.toggleCell(input.closest(".grid-cell"), true);
            });
        }));

        html.querySelector("#fit-to-scene").addEventListener("click", (event) => {
            const flag = this.document.getFlag("levels-3d-preview", "mapgen");
            const rows = flag.cells.length;
            const columns = flag.cells[0].length;
            let minHeight = 0;
            let maxHeight = 0;
            for (let row of flag.cells) {
                for (let cell of row) {
                    if (cell.elevation < minHeight) minHeight = cell.elevation;
                    if (cell.elevation > maxHeight) maxHeight = cell.elevation;
                }
            }
            const depth = (maxHeight - minHeight) * canvas.scene.dimensions.size;
            const w = canvas.scene.dimensions.size;
            const h = (2 * canvas.scene.dimensions.size) / Math.sqrt(3);
            let height = rows * canvas.scene.dimensions.size;
            let width = columns * canvas.scene.dimensions.size;
            if (canvas.scene.grid.type > 3) {
                width = (columns * h * 3) / 4 + (h * 1) / 4;
                height = rows * w + w / 2;
            } else if (canvas.scene.grid.type > 1) {
                width = columns * w + w / 2;
                height = (rows * h * 3) / 4 + (h * 1) / 4;
            }
            let x = canvas.scene.dimensions.sceneX;
            let y = canvas.scene.dimensions.sceneY;
            switch (canvas.scene.grid.type) {
                case 2:
                    x += w / 2;
                case 3:
                    break;
                case 4:
                    y += w / 2;
            }
            this.document.update({
                width,
                height,
                x,
                y,
                elevation: -canvas.scene.dimensions.distance,
                flags: {
                    "levels-3d-preview": { depth: depth },
                },
            });
        });
    }

    toggleCell(cell, toggle) {
        cell.classList.toggle("selected", toggle);
        cell.querySelector("input[type='checkbox']").checked = toggle;
    }

    _saveGridDisplay() {
        const grid = this.element.querySelector(".grid-container");
        this._gridDisplay = {
            scrollX: grid.scrollLeft,
            scrollY: grid.scrollTop,
        };
        const materialPanel = this.element.querySelector(".material-panel");
        this._materialDisplay = {
            scrollX: materialPanel.scrollLeft,
            scrollY: materialPanel.scrollTop,
        };
    }

    _restoreGridDisplay() {
        if (this._gridDisplay) {
            const grid = this.element.querySelector(".grid-container");
            grid.scrollLeft = this._gridDisplay.scrollX;
            grid.scrollTop = this._gridDisplay.scrollY;
        }
        if (this._materialDisplay) {
            const materialPanel = this.element.querySelector(".material-panel");
            materialPanel.scrollLeft = this._materialDisplay.scrollX;
            materialPanel.scrollTop = this._materialDisplay.scrollY;
        }
    }

    get selected() {
        return this.element.querySelectorAll(".grid-cell.selected");
    }

    generateDefaultData() {
        const data = {
            cells: [],
            materials: [
                {
                    texture: {
                        repeat: 1,
                    },
                    collapsed: false,
                    metalness: 0,
                    roughness: 1,
                    opacity: 1,
                    emissive: 0,
                },
            ],
            elevation: 1,
            bevel: 0.05,
        };
        const width = canvas.scene.dimensions.sceneWidth;
        const height = canvas.scene.dimensions.sceneHeight;
        const size = canvas.scene.dimensions.size;
        const rows = Math.ceil(height / size);
        const columns = Math.ceil(width / size);
        data.columns = columns;
        data.rows = rows;
        for (let i = 0; i < rows; i++) {
            let row = [];
            for (let j = 0; j < columns; j++) {
                row.push({
                    elevation: 1,
                    materialId: "",
                });
            }
            data.cells.push(row);
        }
        return data;
    }

    async _onChangeInput(event) {
        if (event.target.id == "elevation") return;
        return await super._onChangeInput(event);
    }

    static async _updateObject() {
        const form = this.element;
        const formData = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
        formData.materials = Object.values(formData.materials);
        formData.cells = Object.values(formData.cells);
        for (let i = 0; i < formData.cells.length; i++) {
            formData.cells[i] = Object.values(formData.cells[i]);
        }
        await this.document.setFlag("levels-3d-preview", "mapgen", formData);
        this.saveGridAndRefresh();
    }

    saveGridAndRefresh() {
        this._saveGridDisplay();
        this.render(true);
    }

    async setTheme(k, e) {
        const flag = this.document.getFlag("levels-3d-preview", "mapgen");
        const theme = themes[k];
        if (theme) {
            if (game.keyboard.downKeys.has("ShiftLeft") || game.keyboard.downKeys.has("ShiftRight")) {
                flag.materials.push(...theme.materials);
            } else {
                flag.materials = theme.materials;
            }
            await this.document.setFlag("levels-3d-preview", "mapgen", flag);
            this.saveGridAndRefresh();
        }
    }

    _setupContextMenu() {
        if (this._contextEnabled) return;
        new foundry.applications.ux.ContextMenu.implementation(
            this.element,
            "button.generate-dd",
            [
                {
                    name: "levels3dpreview.mapgen.generator.dungeon",
                    class: "generate-dungeon",
                    icon: '<i class="fas fa-dungeon"></i>',
                    callback: (event) => {
                        this.generate("rogue", event);
                    },
                },
                {
                    name: "levels3dpreview.mapgen.generator.cave",
                    class: "generate-caves",
                    icon: '<i class="fas fa-icicles"></i>',
                    callback: (event) => {
                        this.generate("cellular-caves", event);
                    },
                },
                {
                    name: "levels3dpreview.mapgen.generator.shore",
                    class: "generate-shore",
                    icon: '<i class="fas fa-water"></i>',
                    callback: (event) => {
                        this.generate("shore", event);
                    },
                },
                {
                    name: "levels3dpreview.mapgen.generator.hills",
                    class: "generate-hills",
                    icon: '<i class="fas fa-mountain"></i>',
                    callback: (event) => {
                        this.generate("hills", event);
                    },
                },
                {
                    name: "levels3dpreview.mapgen.generator.mountains",
                    class: "generate-mountain",
                    icon: '<i class="fas fa-mountain"></i>',
                    callback: (event) => {
                        this.generate("mountain", event);
                    },
                },
                {
                    name: "levels3dpreview.mapgen.generator.island",
                    class: "generate-island",
                    icon: '<i class="fas fa-umbrella-beach"></i>',
                    callback: (event) => {
                        this.generate("island", event);
                    },
                },
                {
                    name: "levels3dpreview.mapgen.generator.plateau",
                    class: "generate-plateau",
                    icon: '<i class="fas fa-landmark"></i>',
                    callback: (event) => {
                        this.generate("plateau", event);
                    },
                },
                {
                    name: "levels3dpreview.mapgen.generator.landscape",
                    class: "generate-landscape",
                    icon: '<i class="fas fa-mountain"></i>',
                    callback: (event) => {
                        this.generate("landscape", event);
                    },
                },
            ],
            { eventName: "click", jQuery: false, fixed: true },
        );

        const themeButtons = [];
        for (let [k, v] of Object.entries(themes)) {
            themeButtons.push({
                name: "levels3dpreview.mapgen.themes." + k,
                // icon: k.includes("tmc") ? `<i data-tooltip="The Mad Cartographer"><img src="modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/MAD_Logo_Large_Circle.webp" class="tmc-icon"></i>` : `<i class="${v.icon}"></i>`,
                icon: k.includes("tmc") ? `<i class="fas fa-fw fa-levels-3d-preview" style="aspect-ratio: 1; background-size: contain; background-image: url('modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/MAD_Logo_Large_Circle.webp')" data-tooltip="The Mad Cartographer"></i>` : `<i class="${v.icon}"></i>`,
                callback: (e) => {
                    this.setTheme(k, e);
                },
            });
        }

        new foundry.applications.ux.ContextMenu.implementation(this.element, "button.generate-theme", themeButtons, { eventName: "click", jQuery: false, fixed: true });

        this._contextEnabled = true;
    }
}

const themes = {
    firelands: {
        icon: "fas fa-fire",
        materials: [
            {
                materialId: "Lava",
                cellColor: "#f98a0b",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Lava004/Lava004_NormalGL.webp",
                    tint: "",
                    repeat: 0.4,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Fire Rock",
                cellColor: "#4f4040",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Lava002/Lava002_NormalGL.webp",
                    tint: "#5f3d26",
                    repeat: 0.4,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    plains: {
        icon: "fas fa-seedling",
        materials: [
            {
                materialId: "Dirt",
                cellColor: "#7a4d1a",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Ground047/Ground047_NormalGL.webp",
                    tint: "",
                    repeat: 0.4,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Grass",
                cellColor: "#529735",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Grass002/Grass002_NormalGL.webp",
                    tint: "",
                    repeat: 0.2,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Rock",
                cellColor: "#707070",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Rock016/Rock016_NormalGL.webp",
                    tint: "",
                    repeat: 0.7,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    desert: {
        icon: "fas fa-sun",
        materials: [
            {
                materialId: "Sand",
                cellColor: "#c9a41d",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Ground049A/Ground049A_NormalGL.webp",
                    tint: "#c9953b",
                    repeat: 0.4,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Sandstone",
                cellColor: "#bbb786",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/_Stylized/Ground%20Rock%2001/Ground_Rock_01_NormalGL.webp",
                    tint: "#d3b073",
                    repeat: 0.3,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    wood: {
        icon: "fas fa-tree",
        materials: [
            {
                materialId: "Wood Floor",
                cellColor: "#c9a41d",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/_Stylized/stylized_wood_01/stylized_wood_01_NormalGL.webp",
                    tint: "#a3a3a3",
                    repeat: 0.2,
                    rotate: false,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Wood Walls",
                cellColor: "#734612",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/_Stylized/stylized_wood_04/stylized_wood_04_NormalGL.webp",
                    tint: "#7c5e4b",
                    repeat: 0.5,
                    rotate: false,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    frost: {
        icon: "fas fa-snowflake",
        materials: [
            {
                materialId: "Snow",
                cellColor: "#ffffff",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Snow002/Snow002_NormalGL.webp",
                    tint: "",
                    repeat: 1,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Ice",
                cellColor: "#4974a2",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Ice004/Ice004_NormalGL.webp",
                    tint: "#507bb4",
                    repeat: 0.3,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    jungle: {
        icon: "fas fa-gopuram",
        materials: [
            {
                materialId: "Ruins Floor",
                cellColor: "#b37b47",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/PavingStones089/PavingStones089_NormalGL.webp",
                    tint: "#e05e3e",
                    repeat: 0.2,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Mossy Walls",
                cellColor: "#2d7623",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/PavingStones084/PavingStones084_NormalGL.webp",
                    tint: "",
                    repeat: 0.5,
                    rotate: false,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    crypt: {
        icon: "fas fa-skull-crossbones",
        materials: [
            {
                materialId: "Dirt",
                cellColor: "#b37b47",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Ground048/Ground048_NormalGL.webp",
                    tint: "#875e36",
                    repeat: 0.4,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Brick Walls",
                cellColor: "#818381",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/Bricks076C/Bricks076C_NormalGL.webp",
                    tint: "",
                    repeat: 0.5,
                    rotate: false,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    alien: {
        icon: "fas fa-rocket",
        materials: [
            {
                materialId: "Alien Floor",
                cellColor: "#ffeb14",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/_Stylized/Ground%20Rock%2003/Ground_Rock_03_NormalGL.webp",
                    tint: "#875e36",
                    repeat: 0.2,
                    rotate: true,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Metal Walls",
                cellColor: "#818381",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/SheetMetal001/SheetMetal001_NormalGL.webp",
                    tint: "",
                    repeat: 0.3,
                    rotate: false,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    tech: {
        icon: "fas fa-cogs",
        materials: [
            {
                materialId: "Metal Grid",
                cellColor: "#e414ff",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/MetalWalkway010/MetalWalkway010_NormalGL.webp",
                    tint: "#6e6e6e",
                    repeat: 0.3,
                    rotate: false,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
            {
                materialId: "Metal Walls",
                cellColor: "#818381",
                texture: {
                    src: "modules/canvas3dcompendium/assets/Materials/MetalPlates001/MetalPlates001_NormalGL.webp",
                    tint: "#8a8a8a",
                    repeat: 0.6,
                    rotate: false,
                },
                collapsed: true,
                metalness: 0,
                roughness: 1,
                opacity: 1,
                emissive: 0,
            },
        ],
    },
    tmcArabianNights: {
        icon: "fas fa-crown",
        materials: [
            {
                materialId: "Sand",
                cellColor: "#c9a41d",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Desert.webp",
                    tint: "",
                    repeat: 0.4,
                    rotate: true,
                },
                roughness: 1,
                metalness: 0,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Desert.webp",
            },
            {
                materialId: "Sand Bricks",
                cellColor: "#bbb786",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Desert-Tile-Sandy.webp",
                    tint: "",
                    repeat: 0.4,
                    rotate: false,
                },
                roughness: 1,
                metalness: 0,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Desert-Tile-Sandy.webp",
            },
            {
                materialId: "Sand Tiles",
                cellColor: "#f8ffc7",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Sandstone-Tile.webp",
                    tint: "",
                    repeat: 1,
                    rotate: false,
                },
                roughness: 0.44,
                metalness: 0.31,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Sandstone-Tile.webp",
            },
        ],
    },
    tmcNature: {
        icon: "fas fa-tree",
        materials: [
            {
                materialId: "Dirt",
                cellColor: "#877226",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Dirt.webp",
                    tint: "",
                    repeat: 0.4,
                    rotate: true,
                },
                roughness: 1,
                metalness: 0,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Dirt.webp",
            },
            {
                materialId: "Grass",
                cellColor: "#86bb8c",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Grass.webp",
                    tint: "",
                    repeat: 0.4,
                    rotate: true,
                },
                roughness: 1,
                metalness: 0,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Grass.webp",
            },
            {
                materialId: "Water",
                cellColor: "#5ba1ec",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Water.webp",
                    tint: "",
                    repeat: 0.3,
                    rotate: true,
                },
                roughness: 0,
                metalness: 0,
                emissive: 0,
                opacity: 0.69,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Water.webp",
            },
        ],
    },
    tmcDungeon: {
        icon: "fas fa-dungeon",
        materials: [
            {
                materialId: "Stone Brick",
                cellColor: "#949494",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Dungeon-Cobble.webp",
                    tint: "",
                    repeat: 0.4,
                    rotate: false,
                },
                roughness: 1,
                metalness: 0,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Dungeon-Cobble.webp",
            },
            {
                materialId: "Stone Tiles 1",
                cellColor: "#808080",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Brick-Flooring.webp",
                    tint: "",
                    repeat: 0.4,
                    rotate: false,
                },
                roughness: 1,
                metalness: 0,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Brick-Flooring.webp",
            },
            {
                materialId: "Stone Tiles 2",
                cellColor: "#828282",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Dungeon-Stone-Tiles.webp",
                    tint: "",
                    repeat: 0.3,
                    rotate: false,
                },
                roughness: 1,
                metalness: 0,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Dungeon-Stone-Tiles.webp",
            },
            {
                materialId: "Stone Tiles Red",
                cellColor: "#9d6262",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Stone-Tile-Red.webp",
                    tint: "",
                    repeat: 1,
                    rotate: false,
                },
                roughness: 1,
                metalness: 0,
                emissive: 0,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Stone-Tile-Red.webp",
            },
            {
                materialId: "Acid",
                cellColor: "#75d797",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Sewer-Acid.webp",
                    tint: "",
                    repeat: 0.6,
                    rotate: true,
                },
                roughness: 0,
                metalness: 0,
                emissive: 0,
                opacity: 0.65,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Sewer-Acid.webp",
            },
            {
                materialId: "Lava",
                cellColor: "#ffa200",
                texture: {
                    src: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Lava-Bubble.webp",
                    tint: "#ee8711",
                    repeat: 0.4,
                    rotate: true,
                },
                roughness: 0.63,
                metalness: 0.17,
                emissive: 1,
                opacity: 1,
                collapsed: true,
                colorSrc: "modules/canvas3dcompendium/assets/TheMadCartographerTexturePack/Texture-Lava-Bubble.webp",
            },
        ],
    },
};
