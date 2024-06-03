import { GenericTour } from "./toursHelpers.js";

export const GettingStartedTour = () => {
    return new GenericTour("getting-started", [`li.scene-control[data-control="token"]`, `li.control-tool[data-tool="preview3d"]`, `.levels-3d-preview-loading-screen`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: false,
        autoRegister: true,
        requires: () => {
            return !game.Levels3DPreview._active;
        },
    });
};

export const First3DTile = () => {
    return new GenericTour("first-tile", [`li.scene-control[data-control="tiles"]`, `li.control-tool[data-tool="browse"]`, `li.dir[data-name="modules"]`, `li.dir[data-name="canvas3dcompendium"]`, `li.dir[data-name="assets"]`, `li.dir[data-name="Tiles"]`, `li.dir[data-name="Nature"]`, `.app.window-app.filepicker`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: true,
        autoRegister: true,
        requires: () => {
            return game.Levels3DPreview._active && game.modules.get("canvas3dcompendium")?.active;
        },
        init: () => {
            FilePicker.LAST_BROWSED_DIRECTORY = "";
        },
        onComplete: () => {
            game.packs.get("levels-3d-preview.macros").render(true);
        },
    });
};

export const SceneConfiguration = () => {
    return new GenericTour("scene-configuration", [`a[data-tab="levels-3d-preview"]`, `.form-group:has(label[for="flags.levels-3d-preview.enablePlayers"])`, `.form-group:has(label[for="flags.levels-3d-preview.auto3d"])`, `.form-group:has(label[for="flags.levels-3d-preview.object3dSight"])`, `.form-group:has(label[for="flags.levels-3d-preview.enableFogOfWar"])`, `.form-group:has(label[for="flags.levels-3d-preview.exr"])`, `.form-group:has(label[for="flags.levels-3d-preview.sunPosition"])`, `.form-group:has(label[for="flags.levels-3d-preview.particlePreset2"])`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: true,
        autoRegister: true,
        requires: () => {
            return game.Levels3DPreview._active;
        },
        init: async () => {
            canvas.scene.sheet.render(true);
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            await wait(500);
        },
    });
};

export const First3DScene = () => {
    return new GenericTour("first-scene", [`.item[data-tab="scenes"]`, `#scenes button.create-document`, `input[name="scene3d"]`, `.dialog-button.ok.default`, `.levels-3d-preview-loading-screen`, `#build-panel`, `#clip-navigation-controls`, `#controlsRef`, ".chat-message:last-child"], {
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
    return new GenericTour("tile-configuration", [`a[data-tab="levels-3d-preview"]`, `.form-group:has(label[for="flags.levels-3d-preview.model3d"])`, `.form-group:has(label[for="flags.levels-3d-preview.dynaMesh"])`, `.form-group:has(label[for="flags.levels-3d-preview.imageTexture"])`, `.form-group:has(label[for="flags.levels-3d-preview.collision"])`, `button[data-key="shader-config"]`, `#levels-3d-preview-shader-config`], {
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

//Mapmaking pack tours

export const Tokens = () => {
    return new GenericTour("tokens", [`a[data-tab="levels-3d-preview"]`, `.form-group:has(label[for="flags.levels-3d-preview.model3d"])`, `.form-group:has(label[for="flags.levels-3d-preview.material"])`, `.form-group:has(label[for="flags.levels-3d-preview.color"])`, `button:has(.fa-regular.fa-person)`, `#token-browser`], {
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
    return new GenericTour("asset-browser", [`#asset-browser .window-content`, `#asset-browser #search`, `#asset-browser ol`, `#asset-browser #ab-randomization`, `#asset-browser #ab-placement`, `#asset-browser #ab-collision`, `#asset-browser #ab-painting`, `#asset-browser #ab-appearance`, `#asset-browser .tab-button[data-tab="utility"]`, `#asset-browser #ab-optimization`], {
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

export const AssetBrowserPaint = () => {
    return new GenericTour("asset-browser-paint", [`#asset-browser #ab-painting`, `#asset-browser li`, `#asset-browser #selected-notification`, `.control-tool[data-tool="tile"]`, `.control-tool[data-tool="tile3dPolygon"]`, `.control-tool[data-tool="select"]`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: true,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active && Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.AssetBrowser);
        },
        init: () => {
            canvas.tiles.activate();
            const w = Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.AssetBrowser);
            w.element.find("li").each((i, e) => {
                if (i < 3) e.classList.add("selected");
            });
            w.element.find("#selected-notification").show();
        },
    });
};

const Environment = () => {
    return new GenericTour("quick-environment", [`#quick-environment .window-content`, `#quick-environment fieldset:nth-child(1)`, `#quick-environment fieldset:nth-child(2)`, `#quick-environment fieldset:nth-child(3)`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: false,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active && Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.QuickEnvironment);
        },
    });
};

const Terrain = () => {
    return new GenericTour("quick-terrain", [`#quick-terrain .window-content`, `#quick-terrain fieldset:nth-child(1)`, `#quick-terrain div fieldset:nth-child(1)`, `#quick-terrain div fieldset:nth-child(2)`, `#quick-terrain div fieldset:nth-child(3)`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: false,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active && Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.QuickTerrain);
        },
    });
};

const Material = () => {
    return new GenericTour("material-browser", [`#material-browser .window-content`, `#material-browser #search`, `#material-browser .form-group`, `#material-browser ol`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: false,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active && Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.MaterialBrowser);
        },
    });
};

const Effects = () => {
    return new GenericTour("effect-browser", [`#effect-browser .window-content`, `#effect-browser #scale`, `#effect-browser #search`, `#effect-browser ol`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: false,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active && Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.EffectBrowser);
        },
    });
};

const Cutscene = () => {
    return new GenericTour("cutscene-panel", [`#cutscene-panel .window-content`, `#cutscene-panel button[data-action="add-clip"]`, `#cutscene-panel fieldset.clip div`, `#cutscene-panel button[data-action="add-keyframe"]`, `#cutscene-panel button[data-action="capture"]`, `#cutscene-panel .form-group:has(input[name="time"])`, `#cutscene-panel .form-group:has(input[name="hold"])`, `#cutscene-panel .form-group:has(select[name="transition"])`, `#cutscene-panel .form-group:has(select[name="easing"])`, `#cutscene-panel button[data-action="edit"]`, `#cutscene-panel button[data-action="play"]`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: false,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active && Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.CutscenePanel);
        },
    });
};

const RoomBuilder = () => {
    return new GenericTour("room-builder", [`#room-builder .window-content`, `#room-builder fieldset:nth-child(1)`, `#room-builder button[data-action="union"]`, `#room-builder button[data-action="subtract"]`, `#room-builder button[data-action="knife"]`, `#room-builder .shapes`, `#room-builder .roughness`, `#room-builder .entity`, `#room-builder fieldset:nth-child(2)`, `#room-builder fieldset:nth-child(3)`, `#room-builder button[data-action="union"]`], {
        moduleId: "levels-3d-preview",
        localizationRoot: "levels3dpreview.tours",
        display: true,
        restricted: false,
        autoRegister: true,
        requires: () => {
            return game.modules.get("canvas3dcompendium")?.active && Object.values(ui.windows).find((window) => window instanceof game.Levels3DPreview.CONFIG.UI.RoomBuilder);
        },
    });
};

export const RegisterTours = () => {
    GettingStartedTour();
    First3DScene();
    Tokens();
    First3DTile();
    SceneConfiguration();
    AdvancedTileConfiguration();
    Environment();
    Terrain();
    AssetBrowser();
    AssetBrowserPaint();
    Material();
    RoomBuilder();
    Effects();
    Cutscene();
};

const TourTemplate = () => {
    return new GenericTour("tour-id", [``, ``, ``, ``, ``, ``, ``, ``], { moduleId: "levels-3d-preview", localizationRoot: "levels3dpreview.tours", display: true, restricted: false, autoRegister: true });
};