import { GLTFExporter } from '../lib/GLTFExporter.js';


export class Exporter{
    constructor(parent){
        this._parent = parent;
        this.GLTFExporter = new GLTFExporter();
    }

    async export(){
        const exportData = await this.renderDialog();
        if(!exportData) return;
        let objects = exportData.all ? this._parent.scene.children : this._parent.scene.children.filter((o) => {
            const documentType = o.userData?.entity3D?.embeddedName;
            if(exportData.background && o.userData?.isBackground) return true;
            if(!documentType) return false;
            if(exportData.tokens && documentType === "Token") {
                const interactive = o.userData?.entity3D?.interactive
                if(!exportData.interactive && interactive) return false;
                return true;
            }
            if(exportData.tiles && documentType === "Tile") return true;
            if(exportData.walls && documentType === "Wall" && !o.userData?.entity3D.placeable.isDoor) return true;
            if(exportData.doors && documentType === "Wall" && o.userData?.entity3D.placeable.isDoor) return true;
            return false;
        });
        objects = objects.filter((o) => !o?.userData?.entity3D?.gtflPath?.includes("[HeroForge]"))
        if(exportData.all){
            objects.traverse(child => { child.userData = {} });
        }else{
            objects.forEach (o => {
                o.traverse(child => { child.userData = {} });
                o.userData = {};
            })
        }
        this.exportToGltf({
            objects
        });
    }

    async renderDialog(){
        const emptyEl = document.createElement('form');
        let html = injectConfig.inject(false,$(emptyEl),{
            "moduleId": "levels-3d-preview",
            "all": {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.all"),
                default: false,
            },
            "tokens": {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.tokens"),
                default: true,
            },
            "interactive": {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.interactive"),
                default: false,
            },
            "tiles": {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.tiles"),
                default: true,
            },
            "walls": {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.walls"),
                default: true,
            },
            "doors": {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.doors"),
                default: true,
            },
            "background": {
                type: "checkbox",
                label: game.i18n.localize("levels3dpreview.exporter.background"),
                default: true,
            },
        });
        return new Promise(resolve => {
        Hooks.once("renderDialog", (app) => {
            app.element.css({width: "auto"})
        })
        new Dialog({
            title: game.i18n.localize("levels3dpreview.exporter.title"),
            content: "",
            buttons: {
                export: {
                    label: `<i class="fas fa-file-export"></i> ` + game.i18n.localize("levels3dpreview.exporter.export"),
                    callback: (dhtml) => {
                        const data = {
                          "tokens": dhtml.find('[name="flags.levels-3d-preview.tokens"]').is(":checked"),
                          "tiles": dhtml.find('[name="flags.levels-3d-preview.tiles"]').is(":checked"),
                          "walls": dhtml.find('[name="flags.levels-3d-preview.walls"]').is(":checked"),
                          "doors": dhtml.find('[name="flags.levels-3d-preview.doors"]').is(":checked"),
                          "background": dhtml.find('[name="flags.levels-3d-preview.background"]').is(":checked"),
                          "all": dhtml.find('[name="flags.levels-3d-preview.all"]').is(":checked"),
                        }
                          resolve(data);
                      }
                },
                cancel: {
                    label: `<i class="fas fa-times"></i> ` + game.i18n.localize("levels3dpreview.exporter.cancel"),
                    callback: () => { resolve(false)}
                },
            },
            render: (dhtml) => {
                $(dhtml[0]).append(html);
                $(dhtml[0]).replaceWith(function() { 
                    return "<form>" + this.innerHTML + "</form>"; 
                });
                
            },
            default: "cancel",
          }).render(true);
        });
    }


    exportToGltf(options){
        const objects = options.objects;
        this.GLTFExporter.parse(
            objects,
            // called when the gltf has been generated
            function ( gltf ) {
        
                saveDataToFile(JSON.stringify(gltf), 'application/json', 'scene.gltf');
                game.Levels3DPreview.reload();
        
            },
            // called when there is an error in the generation
            function ( error ) {
        
                console.log( 'An error happened during the export process', error );
        
            },
            options
        );
    }


}