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

 export function setSharingHooks(){
    Hooks.on("renderSidebarTab", (app, html) => {
        if (!game.user.isGM || !(app instanceof SceneDirectory)) return;
        const buttonContainer = html[0].querySelector(".header-actions.action-buttons");
        const button = document.createElement("button");
        button.innerHTML = `<i class="fa-solid fa-cube"></i> ${game.i18n.localize("levels3dpreview.sharing.scenedirbutton")}`;
        button.onclick = () => {
            new MapBrowser().render(true);
        };
        buttonContainer.appendChild(button);
    });

    Hooks.on("getSidebarDirectoryEntryContext", (directory, buttons) => {
        if (directory !== ui.sidebar.tabs.scenes.element) return;
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
        console.log(body)
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

async function getMap(id){
    try {
        const res = await fetch("https://theripper93.com/api/mapsharing", {
            method: "GET",
            headers: {
                id: id,
            },
        });
        const data = await res.json();
        delete data.data.folder;
        return data;
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

class ShareMap extends FormApplication {
    constructor(scene) {
        super();
        this.scene = scene;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: "Share Map",
            id: `tdc-map-share`,
            template: `modules/levels-3d-preview/templates/sharing/ShareMap.hbs`,
            width: 400,
            closeOnSubmit: false,
            submitOnClose: false,
            submitOnChange: false,
            resizable: false,
            filepickers: [],
        });
    }

    getData() {
        return {
            scene: this.scene,
            user: game.user,
            secret: game.settings.get("levels-3d-preview", "mapsharingKeys")[this.scene.name] ?? randomID(40),
            assetpacks: assetpacks.map((ap) => {
                return {
                    name: game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`),
                    id: ap,
                    selected: ap == "mapmakingpack",
                };
            }),
        };
    }

    get title() {
        return game.i18n.localize("levels3dpreview.sharing.sharemap.title") + `: ${this.scene.name}`;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html[0].querySelector("input[name='image']").addEventListener("keyup", (e) => {
            let url = e.target.value || "https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png";
            const ext = url.split(".").pop();
            if (!["png", "jpg", "jpeg", "gif"].includes(ext)) {
                url = url.replace("imgur.com", "i.imgur.com") + ".jpg";
                e.target.value = url;
            }
            const img = html[0].querySelector(".image-preview");
            img.style.backgroundImage = `url(${url})`;
        });
    }

    async _updateObject(event, formData) {
        formData.scene = this.scene;
        if (!formData.secret) formData.secret = randomID(40);
        if (!formData.image || !formData.description || !formData.assetpacks.length) return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.sharemap.missingfields"));
        if (formData.author.toLowerCase() == "gamemaster") return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.sharemap.gamemaster"));
        Dialog.confirm({
            title: game.i18n.localize("levels3dpreview.sharing.sharemap.confirm.title"),
            content: game.i18n.localize("levels3dpreview.sharing.sharemap.confirm.content"),
            yes: async () => {
                const res = await game.Levels3DPreview.sharing.shareMap(formData);
                if (res.error) return this.displaySubmissionError(res.error, res.status);
                const sett = game.settings.get("levels-3d-preview", "mapsharingKeys");
                sett[formData.name || formData.scene.name] = formData.secret;
                game.settings.set("levels-3d-preview", "mapsharingKeys", sett);
                if (res.status == "Created") this.displaySubmissionSuccess(res);
                if (res.status == "Updated") this.displaySubmissionSuccess(true);
                this.close();
            },
            no: () => {},
        });
    }

    displaySubmissionError(error, status) {
        Dialog.prompt({
            title: game.i18n.localize("levels3dpreview.sharing.sharemap.error") + `: ${error.code} - ${status}`,
            content: `<p><strong>${error.details}</strong></p><p>${error.message}</p>`,
        });
    }

    displaySubmissionSuccess(update = false) {
        Dialog.prompt({
            title: game.i18n.localize(`levels3dpreview.sharing.sharemap.success.title` + (update ? "updated" : "")),
            content: `<p>${game.i18n.localize("levels3dpreview.sharing.sharemap.success.content")}</p>`,
        });
    }
}

class MapBrowser extends Application {
    constructor() {
        super();
        this.sortNewest = true;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: game.i18n.localize("levels3dpreview.sharing.mapbrowser.title"),
            id: `tdc-map-browser`,
            template: `modules/levels-3d-preview/templates/sharing/MapBrowser.hbs`,
            width: 800,
            height: 600,
            closeOnSubmit: false,
            submitOnClose: false,
            submitOnChange: false,
            resizable: true,
            tabs: [{ navSelector: ".tabs", contentSelector: ".content" }],
            filepickers: [],
        });
    }

    get title() {
        return game.i18n.localize("levels3dpreview.sharing.mapbrowser.title").replace("{count}", this._mapCount);
    }

    async getData() {
        const maps = await getMapList();
        let mapList = maps.data.sort((a, b) => b.id - a.id);
        this._mapCount = mapList.length;
        const packs = assetpacks.map((ap) => {
            return {
                name: game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`),
                id: ap,
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
        });
        if (!this.sortNewest) mapList = mapList.sort((a, b) => b.stars - a.stars);
        return {
            maps: mapList,
            sortNewest: this.sortNewest,
            packs,
        };
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.unshift({
            label: "",
            class: "info",
            icon: "fas fa-info-circle",
            onclick: () => {
                //open url
                const link = document.createElement("a");
                link.href = "https://wiki.theripper93.com/levels-3d-preview/communitymaps";
                link.target = "_blank";
                link.click();
            },
        });
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html = html[0];
        html.querySelector("input").addEventListener("keyup", (e) => {
            this._onFilter();
        });
        html.querySelectorAll(".tdc-map-download").forEach((button) => {
            button.addEventListener("click", async (e) => {
                e.preventDefault();
                const id = e.target.dataset.mapid;
                const thumb = e.target.dataset.thumb;
                const map = await getMap(id);
                map.data.thumb = thumb;
                const originalID = map.data._id;
                const newID = randomID();
                map.data.active = false;
                map.data.flags["levels-3d-preview"].enablePlayers = true;
                map.data.flags["levels-3d-preview"].auto3d = true;
                let stringified = JSON.stringify(map.data);
                stringified = stringified.replaceAll(originalID, newID);
                map.data = JSON.parse(stringified);
                await Scene.create(map.data, { keepId: true });
                ui.notifications.info(game.i18n.localize("levels3dpreview.sharing.mapbrowser.imported") + `: ${map.data.name}`);
            });
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
            const oldSort = this.sortNewest;
            this.sortNewest = true;
            if (oldSort != this.sortNewest) this.render(true);
        });
        html.querySelector("#tdc-sort-popular").addEventListener("click", (e) => {
            e.preventDefault();
            const oldSort = this.sortNewest;
            this.sortNewest = false;
            if (oldSort != this.sortNewest) this.render(true);
        });
        html.querySelectorAll(".tdc-filter").forEach((button) => {
            button.addEventListener("click", (e) => {
                e.preventDefault();
                e.target.classList.toggle("active");
                e.target.blur();
                this._onFilter();
            });
        });
    }

    _onFilter() {
        const html = this.element[0];
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
