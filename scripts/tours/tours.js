import { GenericTour } from "./toursHelpers.js";

export const GettingStartedTour = () => { return new GenericTour("getting-started", [
    `li.scene-control[data-control="token"]`,
    `li.control-tool[data-tool="preview3d"]`,
    `.levels-3d-preview-loading-screen`,
    `#clip-navigation-btns`,
    `#game-camera-toggle`,
    `#clip-navigation-controls`,
],
{moduleId: "levels-3d-preview",localizationRoot: "levels3dpreview.tours",display: true,restricted: false,autoRegister: true,})}

export function promptForTour(){
    Dialog.confirm({
        title: game.i18n.localize(`levels3dpreview.tours.dialog.title`),
        content: game.i18n.localize(`levels3dpreview.tours.dialog.content`),
        defaultYes: true,
        yes: () => {
            game.tours.get(`levels-3d-preview.getting-started`).start();
        }, 
    })
}