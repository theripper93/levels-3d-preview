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

export const First3DTile = () => { return new GenericTour("first-tile", [
    `li.scene-control[data-control="tiles"]`,
    `li.control-tool[data-tool="controlsRef"]`,
    `li.control-tool[data-tool="browse"]`,
    `li.dir[data-name="modules"]`,
    `li.dir[data-name="canvas3dcompendium"]`,
    `li.dir[data-name="assets"]`,
    `li.dir[data-name="Tiles"]`,
    `li.dir[data-name="Nature"]`,
    `.app.window-app.filepicker`
],
{moduleId: "levels-3d-preview",localizationRoot: "levels3dpreview.tours",display: true,restricted: true,autoRegister: true,
    requires: () => {
        return game.Levels3DPreview._active && game.modules.get("canvas3dcompendium");
    },
    init: () => {
        FilePicker.LAST_BROWSED_DIRECTORY = "";
    },
    onComplete: () => {
        game.packs.get("levels-3d-preview.macros").render(true);
    }
})}

export const SceneConfiguration = () => { return new GenericTour("scene-configuration", [
    `a[data-tab="levels-3d-preview"]`,
    `.form-group:has(label[for="enablePlayers"])`,
    `.form-group:has(label[for="auto3d"])`,
    `.form-group:has(label[for="object3dSight"])`,
    `.form-group:has(label[for="enableFogOfWar"])`,
    `.form-group:has(label[for="exr"])`,
    `.form-group:has(label[for="skybox"])`,
    `.form-group:has(label[for="sunPosition"])`,
    `.form-group:has(label[for="particlePreset2"])`,
    `.form-group:has(#levels-3d-preview-advanced)`,
],
{moduleId: "levels-3d-preview",localizationRoot: "levels3dpreview.tours",display: true,restricted: true,autoRegister: true,
    requires: () => {
        return game.Levels3DPreview._active;
    },
    init: async () => { canvas.scene.sheet.render(true); const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms)); await wait(500) },
})}

export const RegisterTours = () => {
    GettingStartedTour();
    First3DTile();
    SceneConfiguration();
}

const TourTemplate = () => { return new GenericTour("tour-id", [
    ``,
    ``,
    ``,
    ``,
    ``,
    ``,
    ``,
    ``,
],
{moduleId: "levels-3d-preview",localizationRoot: "levels3dpreview.tours",display: true,restricted: false,autoRegister: true,})}