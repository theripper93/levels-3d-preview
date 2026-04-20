import { HandlebarsApplication, mergeClone, prompt, confirm } from "../lib/utils.js";

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
            new MapBrowser().render(true);
        };
        buttonContainer.appendChild(button);
    });

    Hooks.on("getSceneDirectoryEntryContext", (directory, buttons) => {
        buttons.push({
            name: "levels3dpreview.sharing.contextbutton",
            icon: '<i class="fa-solid fa-cube"></i>',
            condition: (li) => {
                return game.user.isGM;
            },
            callback: (li) => {
                const scene = game.scenes.get(li[0].dataset.documentId);
                new ShareMap(scene).render(true);
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

async function shareMap({ image, author, description, scene, name, assetpacks, secret }) {
    try {
        const body = JSON.stringify({
            name: name || scene.name,
            description,
            author,
            image,
            assetpacks,
            secret,
            data: scene.toJSON(),
        });
        const res = await fetch("https://theripper93.com/api/mapsharing", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body,
        });
        console.log(body);
        let rJson;
        try {
            rJson = await res.json();
        } catch (e) {
            rJson = { status: "Updated" };
        }
        return rJson;
    } catch (e) {
        return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.error"));
    }
}

async function getMap(id) {
    try {
        const res = await fetch("https://theripper93.com/api/mapsharing", {
            method: "GET",
            headers: {
                id: id,
            },
        });
        const data = await res.json();
        delete data.data.folder;
        let stringifyData = JSON.stringify(data);
        stringifyData = stringifyData.replaceAll("assets/canvas3dtokencompendium", "modules/canvas3dtokencompendium");
        stringifyData = JSON.parse(stringifyData);
        return stringifyData;
    } catch (e) {
        return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.error"));
    }
}

async function getMapList() {
    try {
        const res = await fetch("https://theripper93.com/api/mapsharing");
        return res.json();
    } catch (e) {
        return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.error"));
    }
}

async function starMap(id) {
    const alreadyStarred = game.settings.get("levels-3d-preview", "mapsharingStars")[id];
    if (alreadyStarred) return;
    try {
        const res = await fetch("https://theripper93.com/api/mapsharing", {
            method: "POST",
            headers: {
                id: id,
                userid: game.user.id,
            },
        });
        const data = await res.json();
        const stars = game.settings.get("levels-3d-preview", "mapsharingStars");
        stars[id] = true;
        game.settings.set("levels-3d-preview", "mapsharingStars", stars);
    } catch (e) {
        return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.error"));
    }
}

async function increaseDownloadCount(id) {
    const alreadyDownloaded = game.settings.get("levels-3d-preview", "mapsharingDownloaded").includes(id);
    if (alreadyDownloaded) return;

    try {
        const res = await fetch("https://theripper93.com/api/mapsharing", {
            method: "POST",
            headers: {
                id: id,
                download: true,
            },
        });
        const data = await res.json();
        const downloaded = game.settings.get("levels-3d-preview", "mapsharingDownloaded");
        downloaded.push(id);
        await game.settings.set("levels-3d-preview", "mapsharingDownloaded", downloaded);
    } catch (e) {
        return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.error"));
    }
}

class ShareMap extends HandlebarsApplication {

    constructor(scene) {
        super();
        this.scene = scene ?? canvas.scene;
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            tag: "form",
            id: `tdc-map-share`,
            window: {
                title: "Share Map",
                contentClasses: ["standard-form"],
            },
            position: {
                width: 400,
            },
            form: {
                handler: this._updateObject,
                closeOnSubmit: false,
                submitOnChange: false,
            }
        });
    }

    static get PARTS() {
        return {
            content: {
                template: `modules/levels-3d-preview/templates/sharing/ShareMap.hbs`,
                classes: ["standard-form", "scrollable"],
            },
            footer: {
                template: "templates/generic/form-footer.hbs",
            }
        };
    }

    async _prepareContext(options) {
        const sceneData = JSON.stringify(this.scene.toObject());
        const submitButton = {
            type: "submit",
            action: "submit",
            icon: "fas fa-share-from-square",
            label: "levels3dpreview.sharing.sharemap.share",
        }
        return {
            scene: this.scene,
            user: game.user,
            secret: game.settings.get("levels-3d-preview", "mapsharingKeys")[this.scene.name] ?? foundry.utils.randomID(40),
            assetpacks: assetpacks.map((ap) => {
                return {
                    name: game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`),
                    id: ap,
                    selected: ap == "mapmakingpack" || sceneData.toLowerCase().includes(packData[ap].id),
                };
            }),
            buttons: [submitButton],
        };
    }

    get title() {
        return game.i18n.localize("levels3dpreview.sharing.sharemap.title") + `: ${this.scene.name}`;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        html.querySelector(".window-title").innerText = this.title;

        html.querySelector("input[name='image']").addEventListener("keyup", (e) => {
            let url = e.target.value || "https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png";
            const ext = url.split(".").pop();
            if (!["png", "jpg", "jpeg", "gif"].includes(ext)) {
                url = url.replace("imgur.com", "i.imgur.com") + ".jpg";
                e.target.value = url;
            }
            const img = html.querySelector(".image-preview");
            img.style.backgroundImage = `url(${url})`;
        });
    }

    static async _updateObject(event) {
        const form = this.element;
        const formData = new foundry.applications.ux.FormDataExtended(form).object;
        formData.scene = this.scene;
        if (!formData.secret) formData.secret = foundry.utils.randomID(40);
        if (!formData.image || !formData.description || !formData.assetpacks.length) return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.sharemap.missingfields"));
        if (formData.author.toLowerCase() == "gamemaster") return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.sharemap.gamemaster"));
        const result = await confirm({
            title: "levels3dpreview.sharing.sharemap.confirm.title",
            content: "levels3dpreview.sharing.sharemap.confirm.content",
        });
        if (result) {
            const res = await game.Levels3DPreview.sharing.shareMap(formData);
            if (res.error) return this.displaySubmissionError(res.error, res.status);
            const sett = game.settings.get("levels-3d-preview", "mapsharingKeys");
            sett[formData.name || formData.scene.name] = formData.secret;
            game.settings.set("levels-3d-preview", "mapsharingKeys", sett);
            if (res.status == "Created") this.displaySubmissionSuccess(res);
            if (res.status == "Updated") this.displaySubmissionSuccess(true);
            this.close();
        }
    }

    displaySubmissionError(error, status) {
        prompt({
            title: game.i18n.localize("levels3dpreview.sharing.sharemap.error") + `: ${error.code} - ${status}`,
            content: `<p><strong>${error.details}</strong></p><p>${error.message}</p>`,
        });
    }

    displaySubmissionSuccess(update = false) {
        prompt({
            title: game.i18n.localize(`levels3dpreview.sharing.sharemap.success.title` + (update ? "updated" : "")),
            content: `<p>${game.i18n.localize("levels3dpreview.sharing.sharemap.success.content")}</p>`,
        });
    }
}

export class MapBrowser extends HandlebarsApplication {

    constructor() {
        super();
        this.sortNewest = true;
        this.sortPopular = false;
        this.sortDownloads = false;
    }

    static get defaultOptions() {
        const active = this.contest.active;
        const isNext = !active && this.contest.isNext;
        const cssClass = active ? "contest-active" : isNext ? "contest-next" : "";
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: game.i18n.localize("levels3dpreview.sharing.mapbrowser.title"),
            id: `tdc-map-browser`,
            template: `modules/levels-3d-preview/templates/sharing/MapBrowser.hbs`,
            width: 800,
            height: 600,
            closeOnSubmit: false,
            submitOnClose: false,
            submitOnChange: false,
            classes: [cssClass],
        });
    }

    // tabs: [{ navSelector: ".tabs", contentSelector: ".content" }],

    static get DEFAULT_OPTIONS() {
        const active = this.contest.active;
        const isNext = !active && this.contest.isNext;
        const cssClass = active ? "contest-active" : isNext ? "contest-next" : "";
        return mergeClone(super.DEFAULT_OPTIONS, {
            id: "tdc-map-browser",
            classes: [cssClass],
            window: {
                title: "levels3dpreview.sharing.mapbrowser.title",
                resizable: true,
            },
            position: {
                width: 800,
                height: 600,
            },
        });
    }

    static get PARTS() {
        return {
            content: {
                classes: ["tdc-map-browser-container"],
                template: `modules/levels-3d-preview/templates/sharing/MapBrowser.hbs`,
            }
        }
    }

    static get contest() {
        const startTimestamp = 1715731200000;
        const endTimestamp = 1719788400000;

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
            isNextSoon: timeToNext <= 86400000, //1 day
            endDateTime: new Date(endTimestamp).toLocaleString(undefined, format),
            startDateTime: new Date(startTimestamp).toLocaleString(undefined, format),
            timeToNext,
            timeToStart,
            rulesUrl,
            pastWinners: ["Violet", "Digi_DM", "Skrautholomew", "Smothmoth"],
        };
    }

    get title() {
        return game.i18n.localize("levels3dpreview.sharing.mapbrowser.title").replace("{count}", this._mapCount) + this.contestTitle;
    }

    get contestTitle() {
        const contest = MapBrowser.contest;
        if (contest.active) {
            if (!contest.endTimestamp || contest.timeToNext < 0) return "";
            return ` | Contest Ends: ${contest.endDateTime}`;
        } else {
            if (!contest.startTimestamp || contest.timeToStart < 0) return "";
            return ` | Next Contest Starts: ${contest.startDateTime}`;
        }
    }

    async _prepareContext(options) {
        const maps = await getMapList();
        const pastWinners = MapBrowser.contest.pastWinners;
        let mapList = maps.data.sort((a, b) => b.id - a.id);
        this._mapCount = mapList.length;
        const packs = assetpacks.map((ap) => {
            return {
                name: game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`),
                id: ap,
                installed: !!game.modules.get(packData[ap].id),
            };
        });
        mapList.forEach((map) => {
            if (map.assetpacks)
                map.assetpacks = map.assetpacks.map((ap) => {
                    return {
                        name: game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`),
                        installed: !!game.modules.get(packData[ap].id),
                        id: ap,
                    };
                });
            const stars = map.stars ?? [];
            map.starred = stars.includes(game.user.id);
            map.notStarOwned = !map.starred && game.scenes.getName(map.name);
            map.stars = stars.length;
            //parse urls into links
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = map.description;
            const descriptionText = tempDiv.innerText;
            map.description = descriptionText.replaceAll(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');

            if (pastWinners.includes(map.author)) map.isWinner = true;
        });
        if (this.sortDownloads) mapList = mapList.sort((a, b) => b.downloads - a.downloads);
        if (this.sortPopular) mapList = mapList.sort((a, b) => b.stars - a.stars);
        this._mapList = mapList;
        return {
            maps: mapList,
            sortNewest: this.sortNewest,
            sortPopular: this.sortPopular,
            sortDownloads: this.sortDownloads,
            createJournal: game.settings.get("levels-3d-preview", "mapsharingJournal"),
            packs,
        };
    }

    _getHeaderControls() {
	    const buttons = super._getHeaderControls();
        buttons.unshift(
            {
                label: "Share Map",
                class: "share",
                icon: "fas fa-share-alt",
                onClick: () => {
                    new ShareMap().render(true);
                },
            },
            {
                label: "",
                class: "info",
                icon: "fas fa-info-circle",
                onClick: () => {
                    //open url
                    const link = document.createElement("a");
                    link.href = "https://wiki.theripper93.com/levels-3d-preview/communitymaps";
                    link.target = "_blank";
                    link.click();
                },
            },
        );
        if (MapBrowser.contest.active && MapBrowser.contest.rulesUrl)
            buttons.unshift({
                label: "Contest Rules",
                class: "contest",
                icon: "fas fa-trophy",
                onClick: () => {
                    //open url
                    const link = document.createElement("a");
                    link.href = MapBrowser.contest.rulesUrl;
                    link.target = "_blank";
                    link.click();
                },
            });
        return buttons;
    }

    async getJournalEntry(sceneName, content) {
        let journal = game.journal.getName("3D Canvas Community Maps");
        if (!journal) {
            //create journal
            journal = await JournalEntry.create({
                name: "3D Canvas Community Maps",
            });
        }
        const existingPage = journal.pages.getName(sceneName);
        if (existingPage) return { journalId: journal.id, pageId: existingPage.id };
        const page = await journal.createEmbeddedDocuments("JournalEntryPage", [
            {
                name: sceneName,
                "text.content": content,
            },
        ]);
        return { journalId: journal.id, pageId: page.id };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        html.querySelector(".window-title").innerText = this.title;

        html.querySelector("input").addEventListener("keyup", (e) => {
            this._onFilter();
        });
        html.querySelectorAll(".tdc-map-download").forEach((button) => {
            button.addEventListener("click", this._onMapDownload.bind(this));
        });
        html.querySelectorAll(".tdc-map-star").forEach((button) => {
            button.addEventListener("click", async (e) => {
                e.preventDefault();
                if (e.target.querySelector("i").classList.contains("fa-solid")) return;
                const id = e.target.dataset.mapid;
                await starMap(id);
                this.render(true);
            });
        });
        html.querySelector("#tdc-sort-newest").addEventListener("click", (e) => {
            e.preventDefault();
            const doRender = this.sortNewest != true;
            this.sortNewest = true;
            this.sortPopular = false;
            this.sortDownloads = false;
            if (doRender) this.render(true);
        });
        html.querySelector("#tdc-sort-popular").addEventListener("click", (e) => {
            e.preventDefault();
            const doRender = this.sortPopular != true;
            this.sortNewest = false;
            this.sortPopular = true;
            this.sortDownloads = false;
            if (doRender) this.render(true);
        });
        html.querySelector("#tdc-sort-downloads").addEventListener("click", (e) => {
            e.preventDefault();
            const doRender = this.sortDownloads != true;
            this.sortNewest = false;
            this.sortPopular = false;
            this.sortDownloads = true;
            if (doRender) this.render(true);
        });
        html.querySelector("#tdc-journal").addEventListener("click", (e) => {
            e.preventDefault();
            game.settings.set("levels-3d-preview", "mapsharingJournal", !game.settings.get("levels-3d-preview", "mapsharingJournal")).then(() => {
                this.render(true);
            });
        });
        html.querySelectorAll(".tdc-filter").forEach((button) => {
            button.addEventListener("click", (e) => {
                e.preventDefault();
                e.target.classList.toggle("active");
                e.target.blur();
                this._onFilter();
            });
        });
        this._onFilter();
    }

    async _onMapDownload(e, id) {
        e?.preventDefault();
        id = id ?? e?.target.dataset.mapid;
        const createJournal = game.settings.get("levels-3d-preview", "mapsharingJournal");
        const map = await getMap(id);
        const mapData = this._mapList.find((m) => m.id == id);
        const journalData = createJournal ? await this.getJournalEntry(mapData.name + ` (${mapData.author})`, mapData.description) : {};
        map.data.thumb = mapData.image;
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
        const scene = await Scene.create({name: map.data.name, id: map.data.id}, {keepId: true});
        await scene.importFromJSON(JSON.stringify(map.data));
        await this._migrateMap(scene, coreGeneration);
        increaseDownloadCount(id);
        return scene;
    }

    static async importDemoScene() {
        const mapBrowser = new MapBrowser();
        await mapBrowser._prepareContext({});
        const scene = await mapBrowser._onMapDownload(null, "71");
        scene.view();
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

    _onFilter() {
        const html = this.element;
        const mapCards = html.querySelectorAll(".tdc-map-card");
        const search = html.querySelector("input").value.toLowerCase();
        const packs = [];
        html.querySelectorAll(".tdc-filter").forEach((b) => {
            if (b.classList.contains("active")) packs.push(b.dataset.filter);
        });
        mapCards.forEach((card) => {
            const name = card.dataset.name.toLowerCase();
            const description = card.querySelector("p").innerText.toLowerCase();
            const author = card.querySelector("span").innerText.toLowerCase();
            const cardpacks = [];
            card.querySelectorAll(".tdc-pack").forEach((p) => {
                cardpacks.push(p.dataset.pack);
            });
            const packInFilter = packs.length == 0 || cardpacks.every((p) => packs.includes(p));
            if (!packInFilter) card.style.display = "none";
            else {
                let tags = "";
                try {
                    (card.querySelectorAll(".tdc-pack") ?? []).forEach((t) => (tags += t.innerText.toLowerCase()));
                } catch (error) {}

                card.style.display = name.includes(search) || author.includes(search) || description.includes(search) || tags.includes(search) ? "flex" : "none";
            }
        });
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
