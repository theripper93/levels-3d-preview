import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { AssetPlacementPreview } from "./assetPlacementPreview.js";

let _this = null;

const LIST_ITEM_TEMPLATE = Handlebars.compile(`
<li draggable="true" data-tooltip="{{displayName}}" data-output="{{output}}">
<img src="{{preview}}" alt="" loading="lazy">
<span class="name">{{displayName}}</span>
</li>
`);

const BILLBOARD_FOLDER = "Vegetation_billboard";

function folderOf(file) {
    if (file.includes(BILLBOARD_FOLDER)) return BILLBOARD_FOLDER;
    const tiles = file.split("/assets/Tiles/");
    if (tiles.length > 1 && tiles[1].includes("/")) return tiles[1].split("/")[0];
    const parts = file.split("/");
    return parts.at(-2) ?? "";
}

export class AssetBrowser extends HandlebarsApplication {

    constructor() {
        super();
        canvas.tiles.activate();
        game.Levels3DPreview.CONFIG.UI.windows.AssetBrowser = this;
        this._maxCount = 400;
        this._hasSelected = false;
        this.placementPreview = new AssetPlacementPreview(this);
        _this = this;
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            classes: ["l3d-asset-browser"],
            window: {
                title: "levels3dpreview.assetBrowser.title",
                icon: "fa-solid fa-cubes",
                resizable: true,
            },
            position: {
                width: 420,
                height: window.innerHeight * 0.8,
            },
            dragDrop: [{ dragSelector: "li", dropSelector: "" }],
        });
    }

    static get PARTS() {
        return {
            content: {
                template: "modules/levels-3d-preview/templates/material-explorer/asset-browser.hbs",
            },
        };
    }

    get sources() {
        const sources = AssetBrowser.defaultSources;
        const custom = game.settings.get("levels-3d-preview", "assetBrowserCustomPath");
        if (custom) sources.push(custom);
        return sources;
    }

    static fileCache = null;
    static dataCache = null;
    static assetCache = [];

    static defaultSources = [];

    static get exclude() {
        return [];
    }

    static scale = 1;
    

    get currentPoint() {
        return game.Levels3DPreview.interactionManager.mouseIntersection3DCollision(undefined, true, "compendium")[0];
    }

    placeAtCursor(event) {
        if (!_this._hasSelected || !_this.currentPoint) return;
        canvas.tiles.releaseAll();
        const dragData = _this.buildTileData();
        if (!dragData) return;
        game.Levels3DPreview.interactionManager._onDrop(event, dragData);
    }

    buildTileData(src) {
        const currentIntersect = _this.currentPoint;
        const srcs = [];
        src ? srcs.push(src) : _this.element.querySelectorAll("li.selected").forEach(el => srcs.push(el.dataset.output));
        const roll = src ? null : _this.placementPreview?.consume();
        const randomSrc = roll?.src ?? srcs[Math.floor(Math.random() * srcs.length)];
        if (!randomSrc) return false;
        const angle = parseFloat(_this.element.querySelector("#angle").value || 0);
        let color = _this.element.querySelector("#color").value;
        const options = _this.quickPlacementOptions;
        let normal = null;
        let scale = AssetBrowser.scale;
        const grid = options.grid;
        const randomRotate = options.rotation;
        const rotation = roll?.rotation ?? (randomRotate ? Math.random() * 360 : angle);
        if (roll) scale *= roll.scale;
        else if (options.scale) scale *= Math.random() + 0.5;
        if (options.normal) normal = currentIntersect?.face?.normal ?? { x: 0, y: 1, z: 0 };
        if (options.colorvar) {
            const threecolor = new game.Levels3DPreview.THREE.Color(color);
            const hsl = threecolor.getHSL(new game.Levels3DPreview.THREE.Color());
            const hue = hsl.h + (Math.random() - 0.5) * 0.05;
            const sat = hsl.s + (Math.random() - 0.5) * 0.4;
            const lum = hsl.l + (Math.random() - 0.5) * 0.4;
            threecolor.setHSL(hue, sat, lum);
            color = "#" + threecolor.getHexString();
        }
        //AssetBrowser.scale = scale;
        const sight = _this.quickPlacementOptions.sight;
        const collision = _this.quickPlacementOptions.collision;
        const cameraCollision = _this.quickPlacementOptions.cameraCollision;
        const isImage = !randomSrc.toLowerCase().endsWith(".glb") && !randomSrc.toLowerCase().endsWith(".gltf");
        const dragData = {
            type: "Tile",
            texture: { src: randomSrc },
            tileSize: canvas.dimensions.size / scale,
            params: { color, sight, collision, cameraCollision, dynaMesh: isImage ? "billboard2" : "default", castShadow: !isImage },
            coord3d: currentIntersect?.point ?? null,
            assetBrowser: {
                grid,
                normal,
                rotation,
                pos: options.center,
            },
        };
        if (src) delete dragData.coord3d;

        return dragData;
    }

    _onDragStart(event) {
        canvas.tiles.releaseAll();
        const src = event.currentTarget.dataset.output;
        const dragData = _this.buildTileData(src);
        if (!dragData) return;
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    async _prepareContext(options) {
        const data = await super._prepareContext(options);
        if (!AssetBrowser.dataCache) {
            const files = AssetBrowser.fileCache ?? (await this.getSources());
            AssetBrowser.fileCache = files;
            const materials = files.map((file) => {
                const filename = file.split("/").pop().replaceAll("%20", "_");
                const cleanName = filename.replaceAll("_", " ").replace(".glb", "").replace(".gltf", "").replace(".webp", "");
                return {
                    displayName: cleanName.replace("MZ4250 - ", ""),
                    preview: file.replace(".glb", ".webp").replace(".gltf", ".webp"),
                    output: file,
                    search: file.split("/assets/Tiles/").pop(),
                };
            });
            materials.push(...AssetBrowser.assetCache);
            for (const material of materials) material.folder = folderOf(material.output);
            materials.sort((a, b) => a.displayName.localeCompare(b.displayName));
            const folders = [...new Set(materials.map((m) => m.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
            AssetBrowser.dataCache = { materials, folders: folders.map((id) => ({ id, label: id.replaceAll("_", " ") })) };
        }
        this._assetCount = AssetBrowser.dataCache.materials.length;
        return {
            ...data,
            folders: AssetBrowser.dataCache.folders,
            assetPacks: AssetBrowser.assetPacks,
            scale: AssetBrowser.scale || 1,
            angle: AssetBrowser.angle || 0,
        };
    }

    async getSources() {
        const files = [];
        const billboards = await AssetBrowser.getFiles("modules/canvas3dcompendium/assets/Vegetation_billboard/high_res", "", "webp");
        files.push(...billboards);
        for (let target of this.sources) {
            let sourceFiles;
            try {
                sourceFiles = await AssetBrowser.getFiles(target, "");
            } catch (e) {
                try {
                    sourceFiles = await AssetBrowser.getFiles(target, "user");
                } catch (e) {
                    sourceFiles = [];
                }
            }
            files.push(...sourceFiles);
        }
        return files;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        html.querySelector("#search").addEventListener("input", foundry.utils.debounce(() => this.onSearch(), 150));
        html.querySelector("#asset-packs").addEventListener("change", () => this.onSearch());
        html.querySelectorAll(".quick-placement-toggle").forEach((btn) =>
            btn.addEventListener("click", () => {
                btn.setAttribute("aria-pressed", btn.getAttribute("aria-pressed") !== "true");
                this.placementPreview.refresh();
            }),
        );
        html.querySelector("#scale").addEventListener("change", (e) => {
            AssetBrowser.scale = parseFloat(e.target.value) || 1;
            this.placementPreview.refresh();
        });
        html.querySelector("#angle").addEventListener("change", (e) => {
            AssetBrowser.angle = parseFloat(e.target.value) || 0;
            this.placementPreview.refresh();
        });
        this.onSearch();
    }

    activateListElementListeners(li) {
        const html = this.element;
        li.addEventListener("dragstart", this._onDragStart);
        li.addEventListener("mouseup", (e) => {
            const isSelect = li.classList.contains("selected");
            if (!e.ctrlKey && !e.shiftKey) html.querySelectorAll("li.selected").forEach((el) => el.classList.remove("selected"));
            if (e.ctrlKey) li.classList.toggle("selected");
            if (e.shiftKey) {
                const allLis = [...html.querySelectorAll("li")];
                const first = allLis.findIndex((el) => el.classList.contains("selected"));
                const end = allLis.indexOf(li);
                const start = first === -1 ? end : first;
                allLis.slice(Math.min(start, end), Math.max(start, end) + 1).forEach((el) => el.classList.add("selected"));
            }
            if (!isSelect && !e.ctrlKey) li.classList.add("selected");
            this.placementPreview.refresh();
        });
    }

    filterMatcher() {
        const value = this.element.querySelector("#search").value.trim().toLowerCase();
        const filter = this.element.querySelector("#asset-packs").value;
        if (filter.startsWith("folder:")) {
            const folder = filter.slice(7);
            return (m) => m.folder === folder && (!value || m.displayName.toLowerCase().includes(value) || m.search.toLowerCase().includes(value));
        }
        const packData = filter
            .split(",")
            .filter((p) => p)
            .map((p) => p.trim().toLowerCase().replaceAll(" ", "%20"));
        const packName = packData[0];
        const pack = packData.slice(1);
        return (m) => {
            const searchLC = m.search.toLowerCase();
            const inSearch = !value || searchLC.includes(value) || m.displayName.toLowerCase().includes(value);
            return inSearch && (packName === "all" || (m.output.includes(packName) && pack.some((p) => searchLC.includes(p))));
        };
    }

    onSearch() {
        const matches = this.filterMatcher();
        const results = [];
        for (const material of AssetBrowser.dataCache.materials) {
            if (!matches(material)) continue;
            results.push(material);
            if (results.length >= this._maxCount) break;
        }
        const list = this.element.querySelector("ol");
        list.innerHTML = results.map((m) => LIST_ITEM_TEMPLATE(m)).join("");
        list.scrollTop = 0;
        list.querySelectorAll("li").forEach((li) => this.activateListElementListeners(li));
        this.placementPreview.refresh();
    }

    startTour(force = false) {
        const done = game.settings.get("levels-3d-preview", "assetbrowsertour");
        if (done && !force) return;
        game.settings.set("levels-3d-preview", "assetbrowsertour", true);
        setTimeout(() => game.tours.get("levels-3d-preview.asset-browser")?.start(), 2000);
    }

    _getHeaderControls() {
        const buttons = super._getHeaderControls();
        buttons.unshift(
            {
                label: "levels3dpreview.assetBrowser.lock",
                icon: "fa-solid fa-lock",
                onClick: () => AssetBrowser.toggleLock(),
            },
            {
                label: "levels3dpreview.assetBrowser.tour",
                icon: "fa-solid fa-question",
                onClick: () => game.tours.get(`levels-3d-preview.${this.id}`)?.start(),
            },
        );
        return buttons;
    }

    static async toggleLock() {
        const tiles = canvas.tiles.controlled;
        if (!tiles.length) return ui.notifications.warn("levels3dpreview.assetBrowser.lockNone", { localize: true });
        const locked = !tiles[0].document.locked;
        await canvas.scene.updateEmbeddedDocuments("Tile", tiles.map((tile) => ({ _id: tile.id, locked })));
        ui.notifications.info(locked ? "levels3dpreview.assetBrowser.locked" : "levels3dpreview.assetBrowser.unlocked", { localize: true });
    }

    get quickPlacementOptions() {
        const options = {};
        const quickPlacementToggles = this.element.querySelectorAll(".quick-placement-toggle");
        for (let toggle of quickPlacementToggles) {
            const action = toggle.dataset.action;
            options[action] = toggle.getAttribute("aria-pressed") === "true";
        }
        return options;
    }

    async _render(...args) {
        const res = await super._render(...args);
        this.startTour();
        return res;
    }

    async close(...args) {
        super.close(...args);
        this.placementPreview.destroy();
        game.Levels3DPreview.CONFIG.UI.windows.AssetBrowser = null;
    }

    static registerPack(packId, packName, assetPacks = [], options = {}) {
        let packPath = `modules/${packId}`;
        if (options.subfolder) packPath += `/${options.subfolder}`;
        if (!AssetBrowser.defaultSources.includes(packPath)) AssetBrowser.defaultSources.push(packPath);
        if (!assetPacks.length) return;
        assetPacks.map((p) => {
            p.query = packId + "," + p.query;
            p.query = p.query.toLowerCase();
            p.query.replaceAll(" ", "%20");
            return p;
        });
        assetPacks.sort((a, b) => a.name.localeCompare(b.name));
        if (!AssetBrowser.assetPacks[packId]) {
            AssetBrowser.assetPacks[packId] = { name: packName, packs: assetPacks };
        } else {
            AssetBrowser.assetPacks[packId].packs.push(...assetPacks);
        }
    }

    static registerAssets(assets) {
        for (const asset of assets) {
            const file = asset.output;
            if (!file) throw new Error("Asset Browser: Asset has no file path in the 'output' property");
            const filename = file.split("/").pop().replaceAll("%20", "_");
            const cleanName = filename.replaceAll("_", " ").replace(".glb", "").replace(".gltf", "");
            AssetBrowser.assetCache.push({
                displayName: asset.displayName ?? cleanName,
                preview: asset.preview ?? file.replace(".glb", ".webp").replace(".gltf", ".webp"),
                output: file,
                search: asset.search ?? file.split("/assets/Tiles/").pop(),
            });
        }
    }

    static async getFiles(root, source = "user", extC = ["glb", "gltf"], outerPass = true) {
        const files = [];
        extC = extC instanceof Array ? extC : [extC];
        const fp = new foundry.applications.apps.FilePicker({current: root});
        source = fp.activeSource;
        const contents = await foundry.applications.apps.FilePicker.implementation.browse(source, root);
        const indexFile = contents.files.find((f) => f.endsWith("index.json"));
        if (indexFile) {
            const index = await foundry.utils.fetchJsonWithTimeout(indexFile);
            files.push(...index.map((f) => root + "/" + f));
            return files;
        }
        for (let file of contents.files) {
            const ext = file.split(".").pop();
            if (extC.includes(ext.toLowerCase())) files.push(file);
        }
        let notification;
        if (outerPass) notification = ui.notifications.notify(`Loading assets`, "info", { progress: true });
        for (let i = 0; i < contents.dirs.length; i++) {
            let folder = contents.dirs[i];
            if (outerPass) notification.update({pct: Math.round(((i + 1) / contents.dirs.length)), message: `Loading assets in folder: ${folder}`});
            files.push(...(await AssetBrowser.getFiles(folder, source, extC, false)));
        }
        if (outerPass && notification) {
            notification.update({pct: 1, message: `Assets loaded`});
        }

        return files;
    }
}

AssetBrowser.assetPacks = {};
