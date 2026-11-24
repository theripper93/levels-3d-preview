import { HandlebarsApplication, prompt, confirm } from "../lib/utils.js";
import { canCaptureScene, captureSceneCanvas } from "../helpers/sceneThumbnail.js";

const API_URL = "https://theripper93.com/api/mapsharing";
const MAP_MAKER_TAG = "mapmaker";
const SHARE_IMAGE = { width: 640, height: 360, format: "image/webp", quality: 0.8 };
const SHARE_IMAGE_TARGET = 80000;
const SHARE_IMAGE_LIMIT = 150000;
const SHARE_IMAGE_MIN_QUALITY = 0.3;

export function initSharing(canvas3d) {
    canvas3d.sharing = {
        shareMap,
        getMap,
        getMapList,
        apps: {
            ShareMap,
            MapBrowser,
        },
    };
}

export function setSharingHooks() {
    Hooks.on("renderSceneDirectory", (app, html) => {
        if (!game.user.isGM) return;
        const buttonContainer = html.querySelector(".header-actions.action-buttons");
        const button = document.createElement("button");
        button.innerHTML = `<i class="fa-solid fa-cube"></i> <span>${game.i18n.localize("levels3dpreview.sharing.scenedirbutton")}</span>`;
        button.onclick = () => {
            new MapBrowser().render({ force: true });
        };
        buttonContainer.appendChild(button);
    });

    Hooks.on("getSceneContextOptions", (directory, buttons) => {
        buttons.push({
            label: "levels3dpreview.sharing.contextbutton",
            icon: "fa-solid fa-cube",
            visible: () => game.user.isGM,
            onClick: (event, li) => {
                const scene = game.scenes.get(li.dataset.entryId);
                new ShareMap(scene).render({ force: true });
            },
        });
    });

    Hooks.on("init", () => {
        game.settings.register("levels-3d-preview", "mapsharingStars", {
            name: "",
            hint: "",
            scope: "client",
            config: false,
            type: Object,
            default: {},
        });

        game.settings.register("levels-3d-preview", "mapsharingDownloaded", {
            name: "",
            hint: "",
            scope: "world",
            config: false,
            type: Array,
            default: [],
        });

        game.settings.register("levels-3d-preview", "mapsharingKeys", {
            name: "",
            hint: "",
            scope: "world",
            config: false,
            type: Object,
            default: {},
        });
    });
}

function notifyError() {
    ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.error"));
    return null;
}

async function shareMap({ image, author, description, scene, name, assetpacks, secret, tags = [] }) {
    try {
        const body = JSON.stringify({
            name: name || scene.name,
            description,
            author,
            image,
            assetpacks,
            secret,
            tags,
            data: scene.toJSON(),
        });
        const res = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body,
        });
        try {
            return await res.json();
        } catch (e) {
            return { status: "Updated" };
        }
    } catch (e) {
        return notifyError();
    }
}

async function getMap(id) {
    try {
        const res = await fetch(API_URL, {
            method: "GET",
            headers: {
                id: id,
            },
        });
        const data = await res.json();
        delete data.data.folder;
        const stringifyData = JSON.stringify(data).replaceAll("assets/canvas3dtokencompendium", "modules/canvas3dtokencompendium");
        return JSON.parse(stringifyData);
    } catch (e) {
        return notifyError();
    }
}

async function getMapList() {
    try {
        const res = await fetch(API_URL);
        return await res.json();
    } catch (e) {
        return notifyError();
    }
}

async function starMap(id) {
    const alreadyStarred = game.settings.get("levels-3d-preview", "mapsharingStars")[id];
    if (alreadyStarred) return;
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: {
                id: id,
                userid: game.user.id,
            },
        });
        await res.json();
        const stars = game.settings.get("levels-3d-preview", "mapsharingStars");
        stars[id] = true;
        await game.settings.set("levels-3d-preview", "mapsharingStars", stars);
    } catch (e) {
        return notifyError();
    }
}

async function increaseDownloadCount(id) {
    const alreadyDownloaded = game.settings.get("levels-3d-preview", "mapsharingDownloaded").includes(id);
    if (alreadyDownloaded) return;

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: {
                id: id,
                download: true,
            },
        });
        await res.json();
        const downloaded = game.settings.get("levels-3d-preview", "mapsharingDownloaded");
        downloaded.push(id);
        await game.settings.set("levels-3d-preview", "mapsharingDownloaded", downloaded);
    } catch (e) {
        return notifyError();
    }
}

function dataUrlBytes(url) {
    return Math.ceil(((url.length - url.indexOf(",") - 1) * 3) / 4);
}

async function encodeShareImage(source) {
    let image;
    for (let quality = SHARE_IMAGE.quality; quality >= SHARE_IMAGE_MIN_QUALITY - 0.01; quality -= 0.1) {
        image = await foundry.helpers.media.ImageHelper.canvasToBase64(source, SHARE_IMAGE.format, quality);
        if (dataUrlBytes(image) <= SHARE_IMAGE_TARGET) return image;
    }
    if (dataUrlBytes(image) > SHARE_IMAGE_LIMIT) throw new Error(game.i18n.localize("levels3dpreview.sharing.sharemap.captureTooLarge"));
    return image;
}

function normalizeImageUrl(url) {
    url = url.trim();
    if (!url || url.startsWith("data:")) return url;
    const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
    if (!isImage && /(^|\/\/)imgur\.com\//i.test(url)) return url.replace("imgur.com", "i.imgur.com") + ".jpg";
    return url;
}

function isMapMakerScene(scene) {
    return scene.tiles.some((tile) => tile.flags["levels-3d-preview"]?.dynaMesh === "mapMaker");
}

class ShareMap extends HandlebarsApplication {
    constructor(scene) {
        super();
        this.scene = scene ?? canvas.scene;
        this.capture = null;
    }

    static DEFAULT_OPTIONS = {
        id: "tdc-map-share",
        tag: "form",
        window: {
            title: "levels3dpreview.sharing.sharemap.title",
            icon: "fa-solid fa-share-from-square",
            contentClasses: ["standard-form"],
        },
        position: {
            width: 480,
        },
        form: {
            handler: ShareMap.#onSubmit,
            closeOnSubmit: false,
        },
        actions: {
            capture: ShareMap.#onCapture,
        },
    };

    static PARTS = {
        content: {
            template: "modules/levels-3d-preview/templates/sharing/ShareMap.hbs",
            classes: ["standard-form", "scrollable"],
        },
        footer: {
            template: "templates/generic/form-footer.hbs",
        },
    };

    get title() {
        return `${game.i18n.localize(this.options.window.title)}: ${this.scene.name}`;
    }

    async _prepareContext(options) {
        const sceneData = JSON.stringify(this.scene.toObject()).toLowerCase();
        const canCapture = canCaptureScene(this.scene);
        return {
            scene: this.scene,
            author: game.user.name,
            secret: game.settings.get("levels-3d-preview", "mapsharingKeys")[this.scene.name] ?? foundry.utils.randomID(40),
            assetpacks: assetpacks.map((ap) => ({ value: ap, label: `levels3dpreview.sharing.packs.${ap}` })),
            selectedPacks: assetpacks.filter((ap) => ap === "mapmakingpack" || sceneData.includes(packData[ap].id)),
            mapMaker: isMapMakerScene(this.scene),
            captureDisabled: !canCapture,
            captureTooltip: canCapture ? "levels3dpreview.sharing.sharemap.captureTooltip" : "levels3dpreview.sharing.sharemap.captureUnavailable",
            image: this.capture,
            buttons: [
                {
                    type: "submit",
                    icon: "fa-solid fa-share-from-square",
                    label: "levels3dpreview.sharing.sharemap.share",
                },
            ],
        };
    }

    _onChangeForm(formConfig, event) {
        super._onChangeForm(formConfig, event);
        if (event.target.name !== "image") return;
        event.target.value = normalizeImageUrl(event.target.value);
        this.capture = null;
        this._showPreview(event.target.value);
    }

    _showPreview(src) {
        const preview = this.element.querySelector(".tdc-share-preview");
        const img = preview.querySelector("img");
        if (src) img.src = src;
        else img.removeAttribute("src");
        preview.classList.toggle("empty", !src);
    }

    static async #onCapture(event, target) {
        target.disabled = true;
        try {
            const source = await captureSceneCanvas(this.scene, { size: SHARE_IMAGE });
            this.capture = await encodeShareImage(source);
            this.element.querySelector("input[name='image']").value = "";
            this._showPreview(this.capture);
        } catch (err) {
            ui.notifications.error(err.message);
        } finally {
            target.disabled = false;
        }
    }

    static async #onSubmit(event, form, formData) {
        const data = formData.object;
        const image = this.capture || data.image;
        const secret = data.secret || foundry.utils.randomID(40);
        if (!image || !data.description || !data.assetpacks?.length) return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.sharemap.missingfields"));
        if (data.author.toLowerCase() == "gamemaster") return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.sharemap.gamemaster"));
        const confirmed = await confirm("levels3dpreview.sharing.sharemap.confirm.title", "levels3dpreview.sharing.sharemap.confirm.content");
        if (!confirmed) return;
        const res = await game.Levels3DPreview.sharing.shareMap({
            image,
            secret,
            author: data.author,
            description: data.description,
            assetpacks: data.assetpacks,
            tags: data.mapMaker ? [MAP_MAKER_TAG] : [],
            scene: this.scene,
        });
        if (!res) return;
        if (res.error) return this.displaySubmissionError(res.error, res.status);
        const keys = game.settings.get("levels-3d-preview", "mapsharingKeys");
        keys[this.scene.name] = secret;
        await game.settings.set("levels-3d-preview", "mapsharingKeys", keys);
        this.displaySubmissionSuccess(res.status == "Updated");
        this.close();
    }

    displaySubmissionError(error, status) {
        prompt(
            game.i18n.localize("levels3dpreview.sharing.sharemap.error") + `: ${error.code} - ${status}`,
            `<p><strong>${error.details}</strong></p><p>${error.message}</p>`,
        );
    }

    displaySubmissionSuccess(update = false) {
        prompt(
            game.i18n.localize(`levels3dpreview.sharing.sharemap.success.title` + (update ? "updated" : "")),
            `<p>${game.i18n.localize("levels3dpreview.sharing.sharemap.success.content")}</p>`,
        );
    }
}

export class MapBrowser extends HandlebarsApplication {
    constructor() {
        super();
        this.sort = "newest";
        this.search = "";
        this.packFilters = new Set(assetpacks.filter((ap) => game.modules.get(packData[ap].id)));
        this.mapMakerOnly = false;
        this._mapList = null;
    }

    static DEFAULT_OPTIONS = {
        id: "tdc-map-browser",
        window: {
            title: "levels3dpreview.sharing.mapbrowser.title",
            icon: "fa-solid fa-cube",
            resizable: true,
        },
        position: {
            width: 800,
            height: 600,
        },
        actions: {
            sort: MapBrowser.#onSort,
            toggleJournal: MapBrowser.#onToggleJournal,
            togglePack: MapBrowser.#onTogglePack,
            toggleMapMaker: MapBrowser.#onToggleMapMaker,
            star: MapBrowser.#onStar,
            download: MapBrowser.#onDownload,
            shareMap: MapBrowser.#onShareMap,
            openWiki: MapBrowser.#onOpenWiki,
            openRules: MapBrowser.#onOpenRules,
        },
    };

    static PARTS = {
        content: {
            template: "modules/levels-3d-preview/templates/sharing/MapBrowser.hbs",
            classes: ["tdc-map-browser-container"],
            scrollable: [".tdc-map-list"],
        },
    };

    static SORTS = ["newest", "popular", "downloads"];

    static get contest() {
        const startTimestamp = 1777766400000;
        const endTimestamp = 1782860400000;

        const rulesUrl = "";

        const format = {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        };
        const timeToNext = endTimestamp - Date.now();
        const timeToStart = startTimestamp - Date.now();
        return {
            startTimestamp,
            endTimestamp,
            active: Date.now() >= startTimestamp && Date.now() <= endTimestamp,
            isNext: !!endTimestamp,
            isNextSoon: timeToNext <= 86400000,
            endDateTime: new Date(endTimestamp).toLocaleString(undefined, format),
            startDateTime: new Date(startTimestamp).toLocaleString(undefined, format),
            timeToNext,
            timeToStart,
            rulesUrl,
            pastWinners: ["Violet", "Digi_DM", "Skrautholomew", "Smothmoth"],
        };
    }

    _initializeApplicationOptions(options) {
        const applicationOptions = super._initializeApplicationOptions(options);
        const { active, isNext } = MapBrowser.contest;
        if (active) applicationOptions.classes.push("contest-active");
        else if (isNext) applicationOptions.classes.push("contest-next");
        return applicationOptions;
    }

    get title() {
        return game.i18n.format(this.options.window.title, { count: this._mapList?.length ?? 0 }) + this.contestTitle;
    }

    get contestTitle() {
        const contest = MapBrowser.contest;
        if (contest.active) {
            if (!contest.endTimestamp || contest.timeToNext < 0) return "";
            return game.i18n.format("levels3dpreview.sharing.mapbrowser.contestEnds", { date: contest.endDateTime });
        }
        if (!contest.startTimestamp || contest.timeToStart < 0) return "";
        return game.i18n.format("levels3dpreview.sharing.mapbrowser.contestStarts", { date: contest.startDateTime });
    }

    async _loadMaps() {
        const maps = await getMapList();
        const pastWinners = MapBrowser.contest.pastWinners;
        const parser = new DOMParser();
        return (maps?.data ?? []).map((map) => {
            const packs = (map.assetpacks ?? []).filter((ap) => packData[ap]);
            map.assetpacks = packs.map((ap) => ({
                id: ap,
                name: game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`),
                installed: !!game.modules.get(packData[ap].id),
            }));
            map.packIds = packs.join(",");
            const stars = map.stars ?? [];
            map.starred = stars.includes(game.user.id);
            map.notStarOwned = !map.starred && !!game.scenes.getName(map.name);
            map.stars = stars.length;
            map.mapMaker = !!map.tags?.includes(MAP_MAKER_TAG);
            map.isWinner = pastWinners.includes(map.author);
            const descriptionText = parser.parseFromString(map.description ?? "", "text/html").body.textContent;
            map.description = foundry.utils.escapeHTML(descriptionText).replaceAll(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
            map.searchText = [map.name, map.author, descriptionText, ...map.assetpacks.map((ap) => ap.name)].join(" ").toLowerCase();
            return map;
        });
    }

    async _prepareContext(options) {
        this._mapList ??= await this._loadMaps();
        const sortKey = { newest: "id", popular: "stars", downloads: "downloads" }[this.sort];
        const maps = [...this._mapList].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0) || b.id - a.id);
        return {
            maps,
            search: this.search,
            sorts: MapBrowser.SORTS.map((id) => ({ id, label: `levels3dpreview.sharing.mapbrowser.sort.${id}`, active: this.sort === id })),
            createJournal: game.settings.get("levels-3d-preview", "mapsharingJournal"),
            packs: assetpacks.map((ap) => ({
                id: ap,
                name: game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`),
                active: this.packFilters.has(ap),
            })),
            mapMakerOnly: this.mapMakerOnly,
        };
    }

    async _preRender(context, options) {
        await super._preRender(context, options);
        options.window = { ...options.window, title: this.title };
    }

    _getHeaderControls() {
        const contest = MapBrowser.contest;
        return [
            {
                action: "openRules",
                icon: "fa-solid fa-trophy",
                label: "levels3dpreview.sharing.mapbrowser.contestRules",
                visible: contest.active && !!contest.rulesUrl,
            },
            {
                action: "shareMap",
                icon: "fa-solid fa-share-alt",
                label: "levels3dpreview.sharing.sharemap.title",
            },
            {
                action: "openWiki",
                icon: "fa-solid fa-info-circle",
                label: "levels3dpreview.sharing.wikibutton",
            },
            ...super._getHeaderControls(),
        ];
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const input = this.element.querySelector("input[type='search']");
        input.addEventListener("input", () => {
            this.search = input.value.trim().toLowerCase();
            this._onFilter();
        });
        for (const img of this.element.querySelectorAll(".tdc-map-card > img")) img.addEventListener("error", () => img.remove(), { once: true });
        this._onFilter();
    }

    _onFilter() {
        for (const card of this.element.querySelectorAll(".tdc-map-card")) {
            const packs = card.dataset.packs ? card.dataset.packs.split(",") : [];
            const visible =
                (!this.packFilters.size || packs.every((p) => this.packFilters.has(p))) &&
                (!this.mapMakerOnly || card.dataset.mapMaker === "true") &&
                card.dataset.search.includes(this.search);
            card.classList.toggle("hidden", !visible);
        }
    }

    static #onSort(event, target) {
        if (this.sort === target.dataset.sort) return;
        this.sort = target.dataset.sort;
        this.render();
    }

    static async #onToggleJournal() {
        await game.settings.set("levels-3d-preview", "mapsharingJournal", !game.settings.get("levels-3d-preview", "mapsharingJournal"));
        this.render();
    }

    static #onTogglePack(event, target) {
        const id = target.dataset.pack;
        if (this.packFilters.has(id)) this.packFilters.delete(id);
        else this.packFilters.add(id);
        target.classList.toggle("active", this.packFilters.has(id));
        this._onFilter();
    }

    static #onToggleMapMaker(event, target) {
        this.mapMakerOnly = !this.mapMakerOnly;
        target.classList.toggle("active", this.mapMakerOnly);
        this._onFilter();
    }

    static async #onStar(event, target) {
        const id = target.closest("[data-map-id]").dataset.mapId;
        if (this._mapList?.find((m) => m.id == id)?.starred) return;
        await starMap(id);
        this._mapList = null;
        this.render();
    }

    static #onDownload(event, target) {
        return this._onMapDownload(target.closest("[data-map-id]").dataset.mapId);
    }

    static #onShareMap() {
        new ShareMap().render({ force: true });
    }

    static #onOpenWiki() {
        window.open("https://wiki.theripper93.com/levels-3d-preview/communitymaps", "_blank");
    }

    static #onOpenRules() {
        window.open(MapBrowser.contest.rulesUrl, "_blank");
    }

    async getJournalEntry(sceneName, content) {
        let journal = game.journal.getName("3D Canvas Community Maps");
        if (!journal) {
            journal = await JournalEntry.create({
                name: "3D Canvas Community Maps",
            });
        }
        const existingPage = journal.pages.getName(sceneName);
        if (existingPage) return { journalId: journal.id, pageId: existingPage.id };
        const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [
            {
                name: sceneName,
                "text.content": content,
            },
        ]);
        return { journalId: journal.id, pageId: page.id };
    }

    async _onMapDownload(id) {
        const createJournal = game.settings.get("levels-3d-preview", "mapsharingJournal");
        const map = await getMap(id);
        if (!map) return;
        const mapData = this._mapList.find((m) => m.id == id);
        const journalData = createJournal ? await this.getJournalEntry(mapData.name + ` (${mapData.author})`, mapData.description) : {};
        map.data.thumb = mapData.image && !mapData.image.startsWith("data:") ? mapData.image : null;
        const originalID = map.data._id;
        const newID = foundry.utils.randomID();
        map.data.active = false;
        map.data.flags["levels-3d-preview"].enablePlayers = true;
        map.data.flags["levels-3d-preview"].auto3d = true;
        map.data.flags["levels-3d-preview"].enableAnimationScripts = false;
        map.data.journal = journalData?.journalId;
        map.data.journalPage = journalData?.pageId;
        let stringified = JSON.stringify(map.data);
        stringified = stringified.replaceAll(originalID, newID);
        map.data = JSON.parse(stringified);
        const coreGeneration = parseInt(map.data._stats.coreVersion);
        const scene = await Scene.create({ name: map.data.name, id: map.data.id }, { keepId: true });
        await scene.importFromJSON(JSON.stringify(map.data));
        await this._migrateMap(scene, coreGeneration);
        increaseDownloadCount(id);
        return scene;
    }

    static async importDemoScene() {
        const mapBrowser = new MapBrowser();
        mapBrowser._mapList = await mapBrowser._loadMaps();
        const scene = await mapBrowser._onMapDownload("71");
        scene?.view();
    }

    async _migrateMap(scene, coreGeneration) {
        if (coreGeneration < 12) {
            const collections = scene.collections;
            for (const [collectionName, collection] of Object.entries(collections)) {
                const documents = collection.contents;
                const updates = [];
                for (const document of documents) {
                    const oldBottom = document.flags?.levels?.rangeBottom;
                    let update = {};
                    if (Number.isNumeric(oldBottom)) {
                        update = {
                            _id: document.id,
                            elevation: oldBottom,
                            flags: {
                                levels: {
                                    "-=rangeBottom": null,
                                },
                            },
                        };
                        if (documents[0].documentName === "Drawing") {
                            update.interface = false;
                        }
                        updates.push(update);
                    }
                }
                if (updates.length <= 0) continue;
                await scene.updateEmbeddedDocuments(documents[0].documentName, updates);
            }
        }
        return scene;
    }
}

const assetpacks = ["mapmakingpack", "tokencollection", "baileywiki"];

const packData = {
    mapmakingpack: {
        id: "canvas3dcompendium",
    },
    tokencollection: {
        id: "canvas3dtokencompendium",
    },
    baileywiki: {
        id: "baileywiki-3d",
    },
};
