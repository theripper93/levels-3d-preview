import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { AssetPlacementPreview } from "./assetPlacementPreview.js";
import { ASSET_CATEGORIES, ASSET_STYLES, groupMaterials, loadTags, sceneDefaultStyles, tagMaterial } from "./assetTags.js";

let _this = null;

const MEMORY_SETTING = "assetBrowserMemory";
const RECENT_LIMIT = 48;

const LIST_ITEM_TEMPLATE = Handlebars.compile(`
<li draggable="true" data-tooltip="{{name}} ({{kit}})" data-key="{{key}}" data-output="{{output}}">
<img src="{{preview}}" alt="" loading="lazy">
{{#if count}}<span class="l3d-ab-count">&times;{{count}}</span>{{/if}}
<button type="button" class="l3d-ab-fav" aria-pressed="{{fav}}" aria-label="{{favLabel}}"><i class="fa-star {{#if fav}}fa-solid{{else}}fa-regular{{/if}}" inert></i></button>
<span class="name">{{name}}</span>
</li>
`);

const KIT_HEADER_TEMPLATE = Handlebars.compile(`<li class="l3d-ab-kit">{{label}}</li>`);

const VARIANTS_TEMPLATE = Handlebars.compile(`
<header>
<span class="name">{{name}}</span>
<button type="button" class="ui-control icon toggle fa-solid fa-shuffle" data-variant-random aria-pressed="{{random}}" data-tooltip aria-label="{{randomLabel}}"></button>
</header>
<ol>
{{#each items}}
<li draggable="true" data-index="{{@index}}" data-output="{{output}}" data-tooltip="{{displayName}}" class="{{#if current}}selected{{/if}}"><img src="{{preview}}" alt="" loading="lazy"></li>
{{/each}}
</ol>
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
        this._maxCount = 200;
        this._hasSelected = false;
        this._selected = new Set();
        this._variantKey = null;
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
            dragDrop: [{ dragSelector: "li[draggable]", dropSelector: "" }],
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
        const sources = [...AssetBrowser.defaultSources];
        const custom = game.settings.get("levels-3d-preview", "assetBrowserCustomPath");
        if (custom) sources.push(custom);
        return sources;
    }

    static fileCache = null;
    static dataCache = null;
    static assetCache = [];
    static packTags = [];
    static category = "all";
    static advanced = false;

    static defaultSources = [];

    static get exclude() {
        return [];
    }

    static scale = 1;

    get currentPoint() {
        return game.Levels3DPreview.interactionManager.mouseIntersection3DCollision(undefined, true, "compendium")[0];
    }

    get memory() {
        const memory = game.settings.get("levels-3d-preview", MEMORY_SETTING) ?? {};
        return { recent: memory.recent ?? [], favorites: memory.favorites ?? [], styles: memory.styles ?? {} };
    }

    async updateMemory(changes) {
        await game.settings.set("levels-3d-preview", MEMORY_SETTING, { ...this.memory, ...changes });
    }

    get activeStyles() {
        const stored = this.memory.styles[canvas.scene?.id];
        return stored ?? sceneDefaultStyles(canvas.scene);
    }

    groupOf(output) {
        return AssetBrowser.dataCache?.byOutput.get(output) ?? null;
    }

    selectedSources() {
        const sources = [];
        this.element?.querySelectorAll(".l3d-ab-grid li.selected").forEach((li) => {
            const group = AssetBrowser.dataCache.groups.get(li.dataset.key);
            if (group?.random) sources.push(...group.items.map((m) => m.output));
            else sources.push(li.dataset.output);
        });
        return sources;
    }

    clearSelection() {
        this._selected.clear();
        this.element?.querySelectorAll(".l3d-ab-grid li.selected").forEach((li) => li.classList.remove("selected"));
        this.renderVariants();
        this.placementPreview.refresh();
    }

    recordRecent(output) {
        const group = this.groupOf(output);
        if (!group) return;
        const recent = [group.key, ...this.memory.recent.filter((k) => k !== group.key)].slice(0, RECENT_LIMIT);
        this.updateMemory({ recent });
    }

    placeAtCursor(event) {
        if (!_this._hasSelected || !_this.currentPoint) return;
        canvas.tiles.releaseAll();
        const dragData = _this.buildTileData();
        if (!dragData) return;
        game.Levels3DPreview.interactionManager._onDrop(event, dragData);
        _this.recordRecent(dragData.texture.src);
    }

    buildTileData(src) {
        const currentIntersect = _this.currentPoint;
        const srcs = src ? [src] : _this.selectedSources();
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
        if (!src) return;
        const dragData = _this.buildTileData(src);
        if (!dragData) return;
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        _this.recordRecent(src);
    }

    async _prepareContext(options) {
        const data = await super._prepareContext(options);
        if (!AssetBrowser.dataCache) {
            const files = AssetBrowser.fileCache ?? (await this.getSources());
            AssetBrowser.fileCache = files;
            await loadTags();
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
            for (const material of materials) {
                material.folder = folderOf(material.output);
                tagMaterial(material, AssetBrowser.packTags);
            }
            materials.sort((a, b) => a.displayName.localeCompare(b.displayName));
            const folders = [...new Set(materials.map((m) => m.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
            const groups = groupMaterials(materials);
            const byOutput = new Map();
            for (const group of groups.values()) for (const material of group.items) byOutput.set(material.output, group);
            const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            AssetBrowser.dataCache = { materials, groups, sorted, byOutput, folders: folders.map((id) => ({ id, label: id.replaceAll("_", " ") })) };
        }
        const { materials, folders } = AssetBrowser.dataCache;
        this._assetCount = materials.length;
        const present = new Set(materials.map((m) => m.category));
        const styles = new Set(materials.map((m) => m.style));
        const activeStyles = this.activeStyles;
        const fixed = ["all", "recent", "favorites"];
        if (!fixed.includes(AssetBrowser.category) && !present.has(AssetBrowser.category)) AssetBrowser.category = "all";
        return {
            ...data,
            folders,
            assetPacks: AssetBrowser.assetPacks,
            advanced: AssetBrowser.advanced,
            categories: ASSET_CATEGORIES.filter((c) => fixed.includes(c.id) || present.has(c.id)).map((c) => ({ ...c, label: game.i18n.localize(`levels3dpreview.assetBrowser.categories.${c.id}`), active: c.id === AssetBrowser.category })),
            styles: ASSET_STYLES.filter((s) => styles.has(s)).map((id) => ({ id, label: game.i18n.localize(`levels3dpreview.assetBrowser.styles.${id}`), active: activeStyles.includes(id) })),
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
        html.querySelector(":scope > .l3d-ab-tabs")?.remove();
        const tabs = html.querySelector(".l3d-ab-tabs");
        html.append(tabs);
        tabs.querySelectorAll("[data-category]").forEach((btn) => btn.addEventListener("click", () => this.setCategory(btn.dataset.category)));
        html.querySelectorAll("[data-style]").forEach((btn) => btn.addEventListener("click", () => this.toggleStyle(btn.dataset.style)));
        html.querySelector("#ab-advanced").addEventListener("click", (e) => {
            AssetBrowser.advanced = !AssetBrowser.advanced;
            e.currentTarget.setAttribute("aria-pressed", AssetBrowser.advanced);
            const select = html.querySelector("#asset-packs");
            select.hidden = !AssetBrowser.advanced;
            if (!AssetBrowser.advanced && select.value !== "all") {
                select.value = "all";
                this.onSearch();
            }
        });
        const grid = html.querySelector(".l3d-ab-grid");
        grid.addEventListener("scroll", () => {
            if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 400) this.renderMore();
        });
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

    setCategory(category) {
        AssetBrowser.category = category;
        this.element.querySelectorAll(".l3d-ab-tabs [data-category]").forEach((btn) => btn.setAttribute("aria-pressed", btn.dataset.category === category));
        this.onSearch();
    }

    async toggleStyle(style) {
        const active = new Set(this.activeStyles);
        if (active.has(style)) active.delete(style);
        else active.add(style);
        const styles = { ...this.memory.styles, [canvas.scene?.id ?? "none"]: [...active] };
        this.element.querySelector(`[data-style="${style}"]`)?.setAttribute("aria-pressed", active.has(style));
        await this.updateMemory({ styles });
        this.onSearch();
    }

    async toggleFavorite(key, button) {
        const favorites = this.memory.favorites;
        const fav = !favorites.includes(key);
        await this.updateMemory({ favorites: fav ? [key, ...favorites] : favorites.filter((k) => k !== key) });
        button.firstElementChild.classList.toggle("fa-solid", fav);
        button.firstElementChild.classList.toggle("fa-regular", !fav);
        button.setAttribute("aria-pressed", fav);
        if (AssetBrowser.category === "favorites") this.onSearch();
    }

    activateListElementListeners(li) {
        const html = this.element;
        li.addEventListener("dragstart", this._onDragStart);
        li.querySelector(".l3d-ab-fav")?.addEventListener("mouseup", (e) => {
            e.stopPropagation();
            this.toggleFavorite(li.dataset.key, e.currentTarget);
        });
        li.addEventListener("mouseup", (e) => {
            const isSelect = li.classList.contains("selected");
            const items = [...html.querySelectorAll(".l3d-ab-grid li[data-key]")];
            if (!e.ctrlKey && !e.shiftKey) items.forEach((el) => el.classList.remove("selected"));
            if (e.ctrlKey) li.classList.toggle("selected");
            if (e.shiftKey) {
                const first = items.findIndex((el) => el.classList.contains("selected"));
                const end = items.indexOf(li);
                const start = first === -1 ? end : first;
                items.slice(Math.min(start, end), Math.max(start, end) + 1).forEach((el) => el.classList.add("selected"));
            }
            if (!isSelect && !e.ctrlKey) li.classList.add("selected");
            this._selected = new Set(items.filter((el) => el.classList.contains("selected")).map((el) => el.dataset.key));
            this._variantKey = li.classList.contains("selected") ? li.dataset.key : null;
            this.renderVariants();
            this.placementPreview.refresh();
        });
    }

    renderVariants() {
        const panel = this.element?.querySelector(".l3d-ab-variants");
        if (!panel) return;
        const group = this._selected.has(this._variantKey) ? AssetBrowser.dataCache.groups.get(this._variantKey) : null;
        if (!group || group.items.length < 2) {
            panel.hidden = true;
            panel.innerHTML = "";
            return;
        }
        panel.hidden = false;
        panel.innerHTML = VARIANTS_TEMPLATE({
            name: group.name,
            random: group.random,
            randomLabel: game.i18n.localize("levels3dpreview.assetBrowser.randomVariant"),
            items: group.items.map((m, i) => ({ ...m, current: !group.random && i === group.current })),
        });
        panel.querySelector("[data-variant-random]").addEventListener("click", () => {
            group.random = !group.random;
            this.renderVariants();
            this.placementPreview.refresh();
        });
        panel.querySelectorAll("li[data-index]").forEach((li) => {
            li.addEventListener("dragstart", this._onDragStart);
            li.addEventListener("click", () => this.pickVariant(group, Number(li.dataset.index)));
        });
    }

    pickVariant(group, index) {
        group.current = index;
        group.random = false;
        const material = group.items[index];
        const card = this.element.querySelector(`.l3d-ab-grid li[data-key="${CSS.escape(group.key)}"]`);
        if (card) {
            card.dataset.output = material.output;
            card.querySelector("img").src = material.preview;
        }
        this.renderVariants();
        this.placementPreview.refresh();
    }

    filterMatcher() {
        const filter = this.element.querySelector("#asset-packs").value;
        if (filter === "all") return null;
        if (filter.startsWith("folder:")) {
            const folder = filter.slice(7);
            return (m) => m.folder === folder;
        }
        const packData = filter
            .split(",")
            .filter((p) => p)
            .map((p) => p.trim().toLowerCase().replaceAll(" ", "%20"));
        const packName = packData[0];
        const pack = packData.slice(1);
        return (m) => {
            const searchLC = m.search.toLowerCase();
            return m.output.includes(packName) && pack.some((p) => searchLC.includes(p));
        };
    }

    categoryGroups() {
        const { groups, sorted } = AssetBrowser.dataCache;
        const category = AssetBrowser.category;
        if (category === "recent" || category === "favorites") {
            const memory = this.memory;
            return memory[category].map((key) => groups.get(key)).filter(Boolean);
        }
        if (category === "all") return sorted.filter((g) => !g.piece);
        if (category === "buildings") return sorted.filter((g) => g.category === "buildings").sort((a, b) => a.kit.localeCompare(b.kit) || a.piece - b.piece);
        return sorted.filter((g) => g.category === category && !g.piece);
    }

    onSearch() {
        const value = this.element.querySelector("#search").value.trim().toLowerCase();
        const matches = this.filterMatcher();
        const styles = new Set(this.activeStyles);
        const favorites = new Set(this.memory.favorites);
        const personal = AssetBrowser.category === "recent" || AssetBrowser.category === "favorites";
        const results = this.categoryGroups().filter((group) => {
            if (!personal && styles.size && !styles.has(group.style)) return false;
            if (value && !group.search.includes(value) && !group.name.toLowerCase().includes(value)) return false;
            return !matches || group.items.some(matches);
        });
        const list = this.element.querySelector(".l3d-ab-grid");
        list.innerHTML = "";
        list.scrollTop = 0;
        this._results = { groups: results, shown: 0, kit: null, favorites };
        this.renderMore();
        this._selected = new Set([...list.querySelectorAll("li.selected")].map((li) => li.dataset.key));
        this.renderVariants();
        this.placementPreview.refresh();
    }

    renderMore() {
        const state = this._results;
        if (!state || state.shown >= state.groups.length) return;
        const list = this.element.querySelector(".l3d-ab-grid");
        const favLabel = game.i18n.localize("levels3dpreview.assetBrowser.favorite");
        const showKits = AssetBrowser.category === "buildings";
        const chunk = state.groups.slice(state.shown, state.shown + this._maxCount);
        state.shown += chunk.length;
        const html = [];
        for (const group of chunk) {
            if (showKits && group.kit !== state.kit) {
                state.kit = group.kit;
                html.push(KIT_HEADER_TEMPLATE({ label: group.kit }));
            }
            const material = group.items[group.current] ?? group.items[0];
            html.push(LIST_ITEM_TEMPLATE({ key: group.key, name: group.name, kit: group.kit, output: material.output, preview: material.preview, count: group.items.length > 1 ? group.items.length : 0, fav: state.favorites.has(group.key), favLabel }));
        }
        const template = document.createElement("template");
        template.innerHTML = html.join("");
        template.content.querySelectorAll("li[data-key]").forEach((li) => {
            if (this._selected.has(li.dataset.key)) li.classList.add("selected");
            this.activateListElementListeners(li);
        });
        list.append(template.content);
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
        if ((options.style || options.category) && !AssetBrowser.packTags.some((p) => p.path === packPath)) {
            AssetBrowser.packTags.push({ path: packPath, name: packName, style: options.style, category: options.category });
            AssetBrowser.packTags.sort((a, b) => b.path.length - a.path.length);
        }
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
                style: asset.style,
                category: asset.category,
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
