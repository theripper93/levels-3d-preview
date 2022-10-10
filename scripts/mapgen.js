export class MapGen extends FormApplication{
    constructor(document) {
        super();
        this.document = document;
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
            const height = columns * canvas.scene.dimensions.size;
            const width = rows * canvas.scene.dimensions.size;
            this.document.update({
                width,
                height,
                x: canvas.scene.dimensions.sceneX,
                y: canvas.scene.dimensions.sceneY,
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
}