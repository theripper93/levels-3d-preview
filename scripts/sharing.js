export function initSharing(canvas3d){
    canvas3d.sharing = {
        shareMap,
        getMap,
        getMapList,
        apps: {
            ShareMap,
            MapBrowser
        }
    }
}

export function setSharingHooks(){
  Hooks.on("renderSidebarTab", (app, html) => {
    if(!game.user.isGM || !(app instanceof SceneDirectory)) return;
    const buttonContainer = html[0].querySelector(".header-actions.action-buttons");
    const button = document.createElement("button");
    //button.classList.add(`${MASTERCRAFTED_CONST.MODULE_ID}-open-recipe-app`);
    button.innerHTML = `<i class="fa-solid fa-cube"></i> ${game.i18n.localize("levels3dpreview.sharing.scenedirbutton")}`;
    button.onclick = () => {
      new MapBrowser().render(true);
    }
    buttonContainer.appendChild(button);
  })

  Hooks.on("getSidebarDirectoryEntryContext", (directory, buttons) => {
    if(directory !== ui.sidebar.tabs.scenes.element) return;
    buttons.push({
      name: "levels3dpreview.sharing.contextbutton",
      icon: '<i class="fa-solid fa-cube"></i>',
      condition: (li) => {
        return game.user.isGM;
      },
      callback : (li) => {
        const scene = game.scenes.get(li[0].dataset.documentId);
        new ShareMap(scene).render(true);
      }
    });
  })
}

async function shareMap({ image, author, description, scene, name, assetpacks }) {
  try {
    const body = JSON.stringify({
      name: name || scene.name,
      description,
      author,
      image,
      assetpacks,
      data: scene.toJSON(),
    });
    const res = await fetch("https://theripper93.com/api/mapsharing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
    const rJson = await res.json();
    return rJson;
  } catch (e) {
    return ui.notifications.error(
      game.i18n.localize("levels3dpreview.sharing.error")
    );
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
    return data;
  } catch (e) {
    return ui.notifications.error(
      game.i18n.localize("levels3dpreview.sharing.error")
    );
  }
}

async function getMapList() {
  try {
    const res = await fetch("https://theripper93.com/api/mapsharing");
    return res.json();
  } catch (e) {
    return ui.notifications.error(
      game.i18n.localize("levels3dpreview.sharing.error")
    );
  }
}

class ShareMap extends FormApplication{
    constructor(scene){
        super();
        this.scene = scene;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: 'Share Map',
            id: `tdc-map-share`,
            template: `modules/levels-3d-preview/templates/sharing/ShareMap.hbs`,
            width: 400,
            closeOnSubmit: false,
            submitOnClose: false,
            submitOnChange: false,
            resizable: false,
            filepickers: []
        });
    }

    getData(){
        return {
            scene: this.scene,
            user: game.user,
            assetpacks: assetpacks.map((ap) => {
                return {
                    name: game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`),
                    id: ap,
                    selected: ap == "mapmakingpack",
                }
            })
        }
    }

    get title(){
        return game.i18n.localize("levels3dpreview.sharing.sharemap.title") + `: ${this.scene.name}`;
    }

    activateListeners(html){
        super.activateListeners(html);
        html[0].querySelector("input[name='image']").addEventListener("keyup", (e) => {
          let url = e.target.value || "https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png";
          const ext = url.split(".").pop();
          if(!["png", "jpg", "jpeg", "gif"].includes(ext)){
            url = url.replace("imgur.com", "i.imgur.com") + ".jpg";
            e.target.value = url;
          }
          const img = html[0].querySelector(".image-preview");
          img.style.backgroundImage = `url(${url})`;
        });
    }

    async _updateObject(event, formData){
        formData.scene = this.scene;
        if(!formData.image || !formData.description || !formData.assetpacks.length) return ui.notifications.error(game.i18n.localize("levels3dpreview.sharing.sharemap.missingfields"));
        Dialog.confirm({
            title: game.i18n.localize("levels3dpreview.sharing.sharemap.confirm.title"),
            content: game.i18n.localize("levels3dpreview.sharing.sharemap.confirm.content"),
            yes: async () => {
                const res = await shareMap(formData);
                if(res.error) return this.displaySubmissionError(res.error, res.status);
                if(res.status == "Created") this.displaySubmissionSuccess(res);
                this.close();
            },
            no: () => {}
        });
    }

    displaySubmissionError(error, status){
        Dialog.prompt({
            title: game.i18n.localize("levels3dpreview.sharing.sharemap.error") + `: ${error.code} - ${status}`,
            content: `<p><strong>${error.details}</strong></p><p>${error.message}</p>`,
        });

    }

    displaySubmissionSuccess(res){
        Dialog.prompt({
            title: game.i18n.localize("levels3dpreview.sharing.sharemap.success.title"),
            content: `<p>${game.i18n.localize("levels3dpreview.sharing.sharemap.success.content")}</p>`,
        });
    }
}

class MapBrowser extends Application{
    constructor(){
        super();
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
            tabs: [{ navSelector: ".tabs", contentSelector: ".content"}],
            filepickers: []
        });
    }

    async getData(){
        const maps = await getMapList();
        const mapList = maps.data.sort((a, b) => b.id - a.id);
        mapList.forEach((map) => {
          if(map.assetpacks) map.assetpacks = map.assetpacks.map((ap) => game.i18n.localize(`levels3dpreview.sharing.packs.${ap}`))
        });
        return {
            maps: mapList,
        }
    }

    activateListeners(html){
        super.activateListeners(html);
        html = html[0];
        html.querySelector("input").addEventListener("keyup", (e) => {
            const mapCards = html.querySelectorAll(".tdc-map-card");
            const search = e.target.value.toLowerCase();
            mapCards.forEach((card) => {
                const name = card.dataset.name.toLowerCase();
                const description = card.querySelector("p").innerText.toLowerCase();
                let tags = "";
                try {
                  (card.querySelectorAll(".tdc-pack") ?? []).forEach(t => tags += t.innerText.toLowerCase());
                } catch (error) {                
                }
                
                card.style.display = name.includes(search) || description.includes(search) || tags.includes(search) ? "flex" : "none";
            });
        });
        html.querySelectorAll(".tdc-map-download").forEach((button) => {
            button.addEventListener("click", async (e) => {
                e.preventDefault();
                const id = e.target.dataset.mapid;
                const map = await getMap(id);
                Scene.create(map.data);
                ui.notifications.info(game.i18n.localize("levels3dpreview.sharing.mapbrowser.imported") + `: ${map.data.name}`);
            });
        });
    }
}

const assetpacks = [ "mapmakingpack", "tokencollection","baileywiki" ];