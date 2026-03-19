import { GLTFExporter } from "../lib/GLTFExporter.js";
import { injectConfig } from "../lib/injectConfig.js";

export class Exporter {
    constructor(parent) {
        this._parent = parent;
        this.GLTFExporter = new GLTFExporter();
    }

    async export() {
        const exportData = await this.renderDialog();
        if (!exportData) return;
        let objects = exportData.all
            ? this._parent.scene.children
            : this._parent.scene.children.filter((o) => {
                  const documentType = o.userData?.entity3D?.embeddedName;
                  if (exportData.background && o.userData?.isBackground) return true;
                  if (!documentType) return false;
                  if (exportData.tokens && documentType === "Token") {
                      const interactive = o.userData?.entity3D?.interactive;
                      if (!exportData.interactive && interactive) return false;
                      return true;
                  }
                  if (exportData.tiles && documentType === "Tile") return true;
                  if (exportData.walls && documentType === "Wall" && !o.userData?.entity3D.placeable.isDoor) return true;
                  if (exportData.doors && documentType === "Wall" && o.userData?.entity3D.placeable.isDoor) return true;
                  return false;
              });
        objects = objects.filter((o) => !o?.userData?.entity3D?.gtflPath?.includes("[HeroForge]"));
        objects.forEach((o) => {
            o.traverse((child) => {
                child.userData = {};
            });
            o.userData = {};
        });
        this.exportToGltf({
            objects,
        });
    }

    async renderDialog() {
        const emptyEl = document.createElement("form");
        let html = injectConfig.inject(null, emptyEl, {
            inject: emptyEl,
            moduleId: "levels-3d-preview",
            all: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.all"),
                default: false,
            },
            tokens: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.tokens"),
                default: true,
            },
            interactive: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.interactive"),
                default: false,
            },
            tiles: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.tiles"),
                default: true,
            },
            walls: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.walls"),
                default: true,
            },
            doors: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.doors"),
                default: true,
            },
            background: {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.background"),
                default: true,
            },
        }, {});
        return new Promise((resolve) => {
            Hooks.once("renderDialog", (app) => {
                app.element.style.width = "auto";
            });
            new foundry.applications.api.DialogV2({
                window: { title: "levels3dpreview.exporter.title" },
                content: "",
                buttons: [
                    {
                        action: "export",
                        icon: "fas fa-file-export",
                        label: "levels3dpreview.exporter.export",
                        callback: (dhtml) => {
                            const data = {
                                tokens: dhtml.querySelector('[name="flags.levels-3d-preview.tokens"]').checked,
                                tiles: dhtml.querySelector('[name="flags.levels-3d-preview.tiles"]').checked,
                                walls: dhtml.querySelector('[name="flags.levels-3d-preview.walls"]').checked,
                                doors: dhtml.querySelector('[name="flags.levels-3d-preview.doors"]').checked,
                                background: dhtml.querySelector('[name="flags.levels-3d-preview.background"]').checked,
                                all: dhtml.querySelector('[name="flags.levels-3d-preview.all"]').checked,
                            };
                            resolve(data);
                        },
                    },
                    {
                        action: "cancel",
                        icon: "fas fa-times",
                        label: "levels3dpreview.exporter.cancel",
                        callback: () => {
                            resolve(false);
                        },
                    },
                ],
                render: (dhtml) => {
                    dhtml.append(html);
                    const newForm = document.createElement('form');
                    newForm.innerHTML = dhtml.innerHTML;
                    dhtml.replaceWith(newForm);
                },
                default: "cancel",
            }).render(true);
        });
    }

    exportToGltf(options) {
        const objects = options.objects;
        this.GLTFExporter.parse(
            objects,
            // called when the gltf has been generated
            function (gltf) {
                saveDataToFile(JSON.stringify(gltf), "application/json", "scene.gltf");
                game.Levels3DPreview.reload();
            },
            // called when there is an error in the generation
            function (error) {
                console.log("An error happened during the export process", error);
            },
            options,
        );
    }
}
