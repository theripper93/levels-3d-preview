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
            closeOnSubmit: true,
            resizable: true,
            tabs: [{ navSelector: ".tabs", contentSelector: ".content"}],
            filepickers: []
        });
    }

    getData() {
        return this.generateDefaultData();
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.on("change", "#zoom-level", (event) => {
            const zoomLevel = event.target.value;
            document.documentElement.style.setProperty('--mapgen-cellsize', `${zoomLevel*100}px`);
        });
        html.on("mousedown", ".grid-cell", (event) => {
            $(event.target).toggleClass("selected");
            this._cellMouseDown = true;
        })
        html.on("mouseup", ".grid-cell", (event) => {
            this._cellMouseDown = false;
        })
        html.on("mouseover", ".grid-cell", (event) => {
            if (this._cellMouseDown) {
                $(event.target).addClass("selected");
            }
        })
    }

    generateDefaultData(){
        const data = {
            cells: [],
            materials: {},
            width: canvas.scene.dimensions.sceneWidth,
            height: canvas.scene.dimensions.sceneHeight,
        };
        const width = canvas.scene.dimensions.sceneWidth;
        const height = canvas.scene.dimensions.sceneHeight;
        const size = canvas.scene.dimensions.size;
        const rows = Math.ceil(height / size);
        const columns = Math.ceil(width / size);
        for( let i = 0; i < rows; i++){
            let row = [];
            for( let j = 0; j < columns; j++){
                row.push({
                    elevation: 0,
                    materialId: "",
                });
            }
            data.cells.push(row);
        }
        return data;
    }
}