let ROT = null;

import { SimplexNoise, Perlin, FractionalBrownianMotion } from "./lib/noiseFunctions.js";

export class MapGen extends FormApplication{
    constructor(document) {
        super();
        this.document = document;
    }

    async generate(gen){
        if(!ROT) ROT = await import('./generators/ROT/index.js');
        Dialog.confirm({
            title: game.i18n.localize("levels3dpreview.mapgen.generator.title"),
            content: game.i18n.localize("levels3dpreview.mapgen.generator.content") + `<hr><span>${game.i18n.localize("levels3dpreview.mapgen.generator.height")}: <input type="number" id="mapgen-count" value="${this.cellHeight ?? 3}" min="1"/></span><hr>`,
            yes: async (html) => {
                const count = parseFloat(html.find("#mapgen-count").val());
                this.cellHeight = count;
                const genFn = this._getGenerator(gen).bind(this);
                this.setCells(this._getMaps(genFn, 1, count), gen == "landscape", count);
            },
            no: () => {
              
            },
          })
    }

    _getGenerator(gen){
        switch (gen) {
            case "rogue":
                return this._generateRogue.bind(this);
            case "cellular-caves":
                return this._generateCellular.bind(this);
            case "landscape":
                return this._generateLandscape.bind(this);
        }
        return this._generateRogue;
    }

    _getMaps(genFn, count = 1, cHeight){
        let maps = [];
        for(let i = 0; i < count; i++){
            let map = null;
            while(!map){
                try{
                    const m = genFn(this.getData().columns, this.getData().rows, cHeight);
                    map = m;
                }catch(e){
                    console.warn("Failed to generate, retrying...");
                }
            }
            maps.push(map);
        }
        return maps;
    }

    _generateRogue(w,h){
        const cell = new ROT.Map.Rogue(w,h, {connected : true});
        cell.create();
        return cell.map
    }

    _generateCellular(w,h){
        const cell = new ROT.Map.Cellular(w,h, {connected : true});
        cell.randomize(0.5);
        for(let i=0; i<5; i++){
            cell.create();
        }
        cell.connect();
        return cell._map
    }

    _generateLandscape(w,h, maxH){
        const simplex = new SimplexNoise();
        const map = [];
        for(let i=0; i<h; i++){
            map.push([]);
            for(let j=0; j<w; j++){
                const n = FractionalBrownianMotion(i/10, j/10, simplex.noise.bind(simplex), this.fbmParams);
                const height = Math.ceil((n + 0.000001) * maxH);
                map[i][j] = height;
            }
        }
        return map;
    }

    get fbmParams(){
        return {
            scale: this.document.getFlag("levels-3d-preview", "noiseScale") ?? 1,
            height: this.document.getFlag("levels-3d-preview", "noiseHeight") ?? 1,
            persistence: this.document.getFlag("levels-3d-preview", "noisePersistence") ?? 0.5,
            octaves: this.document.getFlag("levels-3d-preview", "noiseOctaves") ?? 1, 
            lacunarity: this.document.getFlag("levels-3d-preview", "noiseLacunarity") ?? 2,
            exponent: (this.document.getFlag("levels-3d-preview", "noiseExponent") ?? 1) * 2,
            flattening: 1 - (this.document.getFlag("levels-3d-preview", "noiseFlattening") ?? 0),
    }
    }

    async setCells(_maps, setValue = false, cHeight = 3){
        const flag = this.document.getFlag("levels-3d-preview", "mapgen");
        const rows = flag.rows;
        const columns = flag.columns;
        const materialMap = this.mapMaterials(flag.materials, cHeight);
        for(let i=0; i<rows; i++){
            for(let j=0; j<columns; j++){
                for(let m=0; m<_maps.length; m++){
                    if(!setValue){
                        if(m == 0)flag.cells[i][j].elevation = _maps[m][i][j] ? cHeight : 1;
                        else if(flag.cells[i][j].elevation == 3+m) flag.cells[i][j].elevation += _maps[m][i][j];
                    }else{
                        flag.cells[i][j].elevation = _maps[m][i][j];
                    }
                    flag.cells[i][j].materialId = materialMap[flag.cells[i][j].elevation];
                }
            }
        }
        await this.document.setFlag("levels-3d-preview", "mapgen", flag);
        this.saveGridAndRefresh();
    }

    mapMaterials(materials, cHeight){
        const matCount = materials.length - 1;
        const map = [];
        map[0] = null;
        map[1] = materials[0]?.materialId ?? "";
        for(let i=2; i<=cHeight; i++){
            map[i] = materials[Math.ceil((i-1) * (matCount/cHeight))]?.materialId ?? "";
        }
        map[cHeight] = materials[matCount]?.materialId;
        return map;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: game.i18n.localize("levels3dpreview.mapgen.title"),
            id: `mapgen`,
            template: `modules/levels-3d-preview/templates/mapgen/squareGrid.hbs`,
            width: 800,
            height: 600,
            closeOnSubmit: false,
            submitOnClose: true,
            submitOnChange: true,
            resizable: true,
            tabs: [{ navSelector: ".tabs", contentSelector: ".content"}],
            filepickers: []
        });
    }

    get title(){
        return game.i18n.localize("levels3dpreview.mapgen.title") + `${canvas.scene.grid.distance} ${canvas.scene.grid.units}`;
    }

    getData() {
        const flag = this.document.getFlag("levels-3d-preview", "mapgen");
        if(!flag) return this.generateDefaultData();
        const rows = flag.rows;
        const columns = flag.columns;
        if(flag.cells.length < rows){
            const toAdd = rows - flag.cells.length;
            for(let i=0; i<toAdd; i++){
                flag.cells.push([]);
            }
        }else if(flag.cells.length > rows){
            const toRemove = flag.cells.length - rows;
            flag.cells.splice(rows, toRemove);
        }
        for(let i=0; i<rows; i++){
            if(flag.cells[i].length < columns){
                const toAdd = columns - flag.cells[i].length;
                for(let j=0; j<toAdd; j++){
                    flag.cells[i].push({
                        elevation: 1,
                        materialId: "",
                    });
                }
            }else if(flag.cells[i].length > columns){
                const toRemove = flag.cells[i].length - columns;
                flag.cells[i].splice(columns, toRemove);
            }
        }
        for(let row of flag.cells){
            for(let cell of row){
                const material = flag.materials.find(m => m.materialId === cell.materialId);
                cell.cellColor = cell.materialId ? material?.cellColor || "#ffffff" : "#ffffff";
            }
        }
        flag.zoomLevel = this._zoomLevel || 0.5;
        return flag;
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._restoreGridDisplay();
        html.on("change", "#zoom-level", (event) => {
            const zoomLevel = event.target.value;
            this._zoomLevel = zoomLevel;
            document.documentElement.style.setProperty('--mapgen-cellsize', `${zoomLevel*100}px`);
        });
        html.on("mousedown", ".grid-cell", (event) => {
            this.toggleCell(event.target, !event.target.classList.contains("selected"));
            this._cellMouseDown = true;
            this._dragActionToggle = $(event.target).hasClass("selected");
        })
        html.on("mouseup", ".grid-cell", (event) => {
            this._cellMouseDown = false;
        })
        html.on("mouseover", ".grid-cell", (event) => {
            if (this._cellMouseDown) {
                this.toggleCell(event.target, this._dragActionToggle);
            }
        })
        html.on("click", "#set-elevation", (event) => {
            const elevation = this.element.find("#elevation").val();
            this.selected.each((index, element) => {
                $(element).find(".elevation").val(elevation);
            });
        });
        html.on("click", "#deselect-all", (event) => {
            this.selected.each((index, element) => {
                this.toggleCell(element, false);
            });
        });
        html.on("click", "#select-all", (event) => {
            this.element.find(`.grid-cell`).each((index, element) => {
                this.toggleCell(element, true);
            });
        });
        html.on("click", "#select-elevation", (event) => {
            const elevation = this.element.find("#elevation").val();
            this.element.find(`.grid-cell`).each((index, element) => {
                const cellElevation = $(element).find(".elevation").val();
                if(elevation == cellElevation) this.toggleCell(element, true);
            });
        });
        html.on("click", "#invert", (event) => {
            this.element.find(`.grid-cell`).each((index, element) => {
                this.toggleCell(element, !element.classList.contains("selected"));
            });
        });
        html.on("click", "#clear-material", (event) => {
            this.selected.each((index, element) => {
                $(element).find("input.material-id").val("");
            });
        });
        html.on("click", "#apply-material", (event) => {
            const materialEl = $(event.target).closest(".material-item");
            const materialId = materialEl.data("material-id");
            this.selected.each((index, element) => {
                $(element).find("input.material-id").val(materialId);
            });
            this.submit();
        });
        html.on("click", "#add-material", async (event) => {
            const flag = this.document.getFlag("levels-3d-preview", "mapgen");
            flag.materials.push({
                texture: {
                    repeat: 1,
                }
            });
            await this.document.setFlag("levels-3d-preview", "mapgen", flag);
            this.saveGridAndRefresh();
        });
        html.on("click", "#delete-material", async (event) => {
            const materialIndex = parseInt($(event.target).closest(".material-item").data("material-index"));
            const flag = this.document.getFlag("levels-3d-preview", "mapgen");
            flag.materials.splice(materialIndex, 1);
            await this.document.setFlag("levels-3d-preview", "mapgen", flag);
            this.saveGridAndRefresh();
        });
        html.on("click", "#toggle-material", (event) => {
            const checkbox = $(event.target).closest(".material-item").find("#collapsed-toggle");
            checkbox.prop("checked", !checkbox.prop("checked"));
        });
        html.on("click", "#select-all-material", (event) => {
            const materialId = $(event.target).closest(".material-item").data("material-id");
            this.element.find(`.grid-cell input.material-id[value="${materialId}"]`).closest(".grid-cell").each((index, element) => {
                this.toggleCell(element, true);
            });
        });
        html.on("click", "#fit-to-scene", (event) => {
            const flag = this.document.getFlag("levels-3d-preview", "mapgen");
            const rows = flag.cells.length;
            const columns = flag.cells[0].length;
            let minHeight = 0;
            let maxHeight = 0;
            for(let row of flag.cells){
                for(let cell of row){
                    if(cell.elevation < minHeight) minHeight = cell.elevation;
                    if(cell.elevation > maxHeight) maxHeight = cell.elevation;
                }
            }
            const depth = (maxHeight - minHeight) * canvas.scene.dimensions.size;
            const w = canvas.scene.dimensions.size;
            const h = 2 * canvas.scene.dimensions.size / Math.sqrt(3);
            let height = columns * canvas.scene.dimensions.size;
            let width = rows * canvas.scene.dimensions.size;
            if(canvas.scene.grid.type > 3){
                width = rows * h * 3/4 + h * 1/4;
                height = columns * w + w/2;

            }else if(canvas.scene.grid.type > 1){
                width = rows * w + w/2;
                height = columns * h * 3/4 + h * 1/4;
            }
            let x = canvas.scene.dimensions.sceneX;
            let y = canvas.scene.dimensions.sceneY;
            switch(canvas.scene.grid.type){
                case 2:
                    x += w/2;
                case 3:
                    break;
                case 4:
                    y += w/2;
            }

            this.document.update({
                width,
                height,
                x,
                y,
                flags: {
                    "levels": {rangeBottom: -canvas.scene.dimensions.distance},
                    "levels-3d-preview": {depth: depth},
                },
            });
        });
    }

    toggleCell(cell, toggle){
        $(cell).toggleClass("selected", toggle);
        $(cell).find("input[type='checkbox']").prop("checked", toggle);
    }

    _saveGridDisplay(){
        const grid = this.element.find(".grid-container");
        this._gridDisplay = {
            scrollX: grid.scrollLeft(),
            scrollY: grid.scrollTop(),
        }
        const materialPanel = this.element.find(".material-panel");
        this._materialDisplay = {
            scrollX: materialPanel.scrollLeft(),
            scrollY: materialPanel.scrollTop(),
        }
        
    }

    _restoreGridDisplay(){
        if (this._gridDisplay) {
            const grid = this.element.find(".grid-container");
            grid.scrollLeft(this._gridDisplay.scrollX);
            grid.scrollTop(this._gridDisplay.scrollY);
        }
        if (this._materialDisplay) {
            const materialPanel = this.element.find(".material-panel");
            materialPanel.scrollLeft(this._materialDisplay.scrollX);
            materialPanel.scrollTop(this._materialDisplay.scrollY);
        }
    }

    get selected(){
        return this.element.find(".grid-cell.selected");
    }

    generateDefaultData(){
        const data = {
            cells: [],
            materials: [
                {
                    texture: {
                        repeat: 1,
                    }
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
        for( let i = 0; i < rows; i++){
            let row = [];
            for( let j = 0; j < columns; j++){
                row.push({
                    elevation: 1,
                    materialId: "",
                });
            }
            data.cells.push(row);
        }
        return data;
    }

    async _onChangeInput(event){
        if(event.target.id == "elevation") return; 
        return await super._onChangeInput(event);
    }

    async _updateObject(event, formData) {
        formData = expandObject(formData);
        formData.materials = Object.values(formData.materials);
        formData.cells = Object.values(formData.cells);
        for(let i=0; i<formData.cells.length; i++){
            formData.cells[i] = Object.values(formData.cells[i]);
        }
        await this.document.setFlag("levels-3d-preview", "mapgen", formData);
        this.saveGridAndRefresh();
    }

    saveGridAndRefresh(){
        this._saveGridDisplay();
        this.render(true);
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.unshift({
            label: "levels3dpreview.mapgen.generator.dungeon",
            class: "generate-dungeon",
            icon: "fas fa-dungeon",
            onclick: (event) => {
                this.generate("rogue");
            },
        },
        {
            label: "levels3dpreview.mapgen.generator.cave",
            class: "generate-caves",
            icon: "fas fa-icicles",
            onclick: (event) => {
                this.generate("cellular-caves");
            },
        },
        {
            label: "levels3dpreview.mapgen.generator.landscape",
            class: "generate-landscape",
            icon: "fas fa-mountain",
            onclick: (event) => {
                this.generate("landscape");
            },
        },
        );
        return buttons;
    }
}