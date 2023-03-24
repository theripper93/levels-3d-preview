import { GenericTour } from "./toursHelpers.js";

export const GettingStartedTour = () => { return new GenericTour("getting-started", [`li.scene-control[data-control="token"]`, `li.control-tool[data-tool="preview3d"]`, `.levels-3d-preview-loading-screen`], {
    moduleId: "levels-3d-preview",
    localizationRoot: "levels3dpreview.tours",
    display: true,
    restricted: false,
    autoRegister: true,
    requires: () => {
        return !game.Levels3DPreview._active;
    },
});
}

export const First3DTile = () => { return new GenericTour("first-tile", [
    `li.scene-control[data-control="tiles"]`,
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
        return game.Levels3DPreview._active && game.modules.get("canvas3dcompendium")?.active;
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
    `.form-group:has(label[for="sunPosition"])`,
    `.form-group:has(label[for="particlePreset2"])`,
    `.form-group:has(#levels-3d-preview-advanced)`,
],
{moduleId: "levels-3d-preview",localizationRoot: "levels3dpreview.tours",display: true,restricted: true,autoRegister: true,
    requires: () => {
        return game.Levels3DPreview._active;
    },
    init: async () => { canvas.scene.sheet.render(true); const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms)); await wait(500) },
    })
}

export const First3DScene = () => {
    return new GenericTour("first-scene", [`.item[data-tab="scenes"]`, `#scenes button.create-document`, `input[name="scene3d"]`, `.dialog-button.ok.default`, `.levels-3d-preview-loading-screen`, `#build-panel`, `#clip-navigation-controls`, `#controlsRef` , `.item[data-tab="chat"]`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: true,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active;
        },
        init: () => {
            game.Levels3DPreview.CONFIG.UI.BUILD_PANEL.FORCE_AUTOHIDE_OFF = true;
            Object.values(ui.windows).forEach((window) => window instanceof Dialog && window.close());
        },
        onComplete: () => {},
    });
};

export const AdvancedTileConfiguration = () => {
    return new GenericTour("tile-configuration", [`a[data-tab="levels-3d-preview"]`, `.form-group:has(label[for="model3d"])`, `.form-group:has(label[for="dynaMesh"])`, `.form-group:has(label[for="imageTexture"])`, `.form-group:has(label[for="collision"])`, `button[data-key="shader-config"]`, `#levels-3d-preview-shader-config`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: true,
        autoRegister: true,
        requires: () => {
            return canvas.tiles.controlled[0];
        },
        init: async () => {
            canvas.tiles.controlled[0].document.sheet.render(true);
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            await wait(500);
        },
    });
};

export const Tokens = () => {
    return new GenericTour("tokens", [`a[data-tab="levels-3d-preview"]`, `.form-group:has(label[for="model3d"])`, `.form-group:has(label[for="material"])`, `.form-group:has(label[for="color"])`, `.fa-regular.fa-person`, `#material-browser`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: true,
        autoRegister: true,
        requires: () => {
            return canvas.tokens.controlled[0] && game.modules.get("canvas3dtokencompendium")?.active && game.modules.get("canvas3dcompendium")?.active;
        },
        init: async () => {
            canvas.tokens.controlled[0].document.sheet.render(true);
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            await wait(500);
        },
    });
};

export const AssetBrowser = () => {
    return new GenericTour("asset-browser", [`#material-browser`, `#material-browser #search`, `#material-browser ol`, `#material-browser .quick-placement`, `#material-browser #scale`, `#material-browser #density`, `#material-browser #angle`, `#material-browser .merge`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: true,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active && Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.AssetBrowser);
        },
        init: () => {},
    });
};

export const RegisterTours = () => {
    GettingStartedTour();
    First3DScene();
    AssetBrowser();
    Tokens();
    First3DTile();
    SceneConfiguration();
    AdvancedTileConfiguration();
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