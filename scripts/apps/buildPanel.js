import { AssetBrowser } from "./assetBrowser.js";
import { TokenBrowser } from "./tokenBrowser.js";
import { Socket } from "../lib/socket.js";
import { factor } from "../main.js";
import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

export class BuildPanel extends HandlebarsApplication {

    constructor() {
        super();
        this._autoHide = true;
        this.autoMode = game.settings.get("levels-3d-preview", "clipNavigatorFollowClient");
        this.wireframe = false;
        this.initClipNavigation();
        if (game.Levels3DPreview.CONFIG.UI.BUILD_PANEL.FORCE_AUTOHIDE_OFF || !game.settings.get("levels-3d-preview", "loadingShown")) {
            this._autoHide = false;
            game.Levels3DPreview.CONFIG.UI.BUILD_PANEL.FORCE_AUTOHIDE_OFF = false;
        }
        const BUILD_PANEL_BUTTONS_PREMIUM = game.Levels3DPreview.CONFIG.UI.BUILD_PANEL_BUTTONS_PREMIUM ?? [];
        this.BUILD_PANEL_BUTTONS = [
            ...this.BUILD_PANEL_BUTTONS_BASE,
            ...BUILD_PANEL_BUTTONS_PREMIUM
        ];
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            tag: "menu",
            classes: ["flexcol"],
            window: {
                frame: false,
                positioned: false,
            },
        });
    }

    async _prepareContext(options) {
        const data = {};
        this.isGC = game.settings.get("levels-3d-preview", "enableGameCamera") && (canvas.scene.getFlag("levels-3d-preview", "enableGameCamera") ?? true);;
        this.isGM = game.user.isGM;
        this.isFog = canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false;
        data.isGC = this.isGC;
        data.isGM = this.isGM;
        data.isFog = this.isFog;
        const levels = (canvas.scene.flags.levels?.sceneLevels ?? [])
            .filter((l) => l[1] !== undefined && l[0] !== undefined)
            .sort((a, b) => {
                return parseFloat(a[0]) - parseFloat(b[0]);
            })
            .map((l) => {
                return {
                    bottom: parseFloat(l[0]),
                    top: parseFloat(l[1]),
                    name: l[2],
                };
            });
        this.showRange = levels.length > 0;
        data.autoMode = this.autoMode;
        data.showRange = this.showRange;
        if (this.showRange) {
            this.lowestLevel = levels.reduce((a, b) => {
                return a.bottom < b.bottom ? a : b;
            });
            this.higestLevel = levels.reduce((a, b) => {
                return a.top > b.top ? a : b;
            });
            this.offLevel = {
                bottom: this.higestLevel.top + 5,
                top: this.higestLevel.top + 5,
                name: game.i18n.localize("levels3dpreview.clipNavigator.disabled"),
            };
            levels.push(this.offLevel);
            this.max = this.higestLevel.top + 5;
            this.min = this.lowestLevel.top;
            this.levels = levels;
            data.levels = this.levels;
            data.range = {
                min: this.min,
                max: this.max,
                curr: this.currentRange ?? this.higestLevel.top + 5,
            }
        }
        const b = game.user.isGM ? this.BUILD_PANEL_BUTTONS.filter((b) => b.visible()) : [];
        const c = this.CLIP_NAVIGATION_BUTTONS.filter(b => b.visible());
        document.querySelector(":root").style.setProperty("--build-panel-height", `${(b.length + c.length) * 40 + 50}px`);
        const showSeparator = b.length > 0 && c.length > 0;
        return {
            ...data,
            showSeparator,
            buttons: b,
            clipNavigation: c,
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        html.querySelectorAll(":scope > li").forEach(li => li.remove());
        html.querySelectorAll("li").forEach(li => this.element.appendChild(li));
        
        html.querySelector("#clip-navigation-fog")?.classList.add("clip-navigation-enabled");
        this.insertMinimizeButton(true);
        this.insertMinimizeButton();
        html.querySelector("#game-camera-toggle")?.classList.toggle("clip-navigation-enabled", game.Levels3DPreview.GameCamera.enabled);
        setTimeout(() => {
            if (this._autoHide) {
                html.classList.add("minimized");
            }
        }, 10000);
        document.querySelector("#sidebar-tabs menu").after(html);

        html.addEventListener("click", (event) => {
            if (event.target.closest("#build-panel-minimize")) {
                html.classList.toggle("minimized");
            }
        }, { signal: this.options.signal });

        html.querySelectorAll(".build-panel-button").forEach(btn => btn.addEventListener("click", (event) => {
            this._autoHide = false;
            const action = btn.dataset.action;
            const button = [
                ...this.BUILD_PANEL_BUTTONS,
                ...this.CLIP_NAVIGATION_BUTTONS
            ].find((b) => b.id === action);
            button.callback(event);
        }));

        if (game.Levels3DPreview.sharing.apps.MapBrowser?.contest?.active) {
            html.querySelector(`i[data-action="community-maps"]`).classList.add("contest-active");
            const li = html.querySelector(`i[data-action="community-maps"]`).closest("li");
            li.style.position = "relative";
            const trophyIcon = document.createElement("i");
            trophyIcon.className = "fas fa-trophy-star";
            Object.assign(trophyIcon.style, {
                position: "absolute",
                left: "-3px",
                top: "2px",
                fontSize: "0.8rem",
                color: "#ffc200",
                pointerEvents: "none",
                textShadow: "0 0 3px black"
            });
            li.append(trophyIcon);
        }

        html.querySelectorAll("input").forEach(el => el.addEventListener("input", (event) => this._onRangeChange(event)));

        html.querySelector("#game-camera-toggle")?.classList.toggle("clip-navigation-enabled", game.Levels3DPreview.GameCamera.enabled);
        html.querySelector("#clip-navigation-fog")?.classList.toggle("clip-navigation-enabled", (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) / factor === game.Levels3DPreview.scene.fog?.far);

        html.querySelectorAll(".clip-navigation-btn").forEach(btn => btn.addEventListener("click", (event) => {
            const button = this.CLIP_NAVIGATION_BUTTONS.find((b) => b.id === btn.id);
            if (button) button.callback(event);
        }));
    }

    insertMinimizeButton(remove = false){
        if(remove) return document.querySelectorAll("#build-panel-minimize").forEach(b => b.closest("li").remove());

        const button = document.createElement("button")
        button.id = "build-panel-minimize";
        button.className = "ui-control plain icon fa-solid fa-cube";
        const li = document.createElement("li");
        li.appendChild(button)
        document.querySelector(`button[data-tab="settings"]`).closest("li").after(li)
        button.addEventListener("click", () => this.element.classList.toggle("minimized"));
    }

    async close(...args){
        this.insertMinimizeButton(true)
        return super.close(...args)
    }

    static setHooks() {
        Hooks.once("ready", () => { 
            Hooks.on("canvasReady", () => {
                if (game.Levels3DPreview.BuildPanel) game.Levels3DPreview.BuildPanel.close();
            });
            Hooks.on("3DCanvasToggleMode", (enabled) => {
                if (game.Levels3DPreview.BuildPanel) game.Levels3DPreview.BuildPanel.close();
            });
            Hooks.on("3DCanvasSceneReady", () => {
                if(!game.Levels3DPreview.BuildPanel) game.Levels3DPreview.BuildPanel = new BuildPanel();
                game.Levels3DPreview.BuildPanel.render(true);
            });
        });

        Hooks.on("renderTokenConfig", async (app, html) => {
            function wait(ms) {
                return new Promise((resolve) => setTimeout(resolve, ms));
            }
            await wait(100);
        
            while (!html.querySelectorAll(`[name="flags.levels-3d-preview.model3d"]`).length) {
                await wait(100);
            }
            const filepicker = html.querySelector(`[name="flags.levels-3d-preview.model3d"]`)?.closest(".form-group");
            TokenBrowser.create(filepicker, app);
        });
        
        Hooks.on("renderPrototypeTokenConfig", async (app, html) => {
            function wait(ms) {
                return new Promise((resolve) => setTimeout(resolve, ms));
            }
            await wait(100);
        
            while (!html.querySelector(`[name="flags.levels-3d-preview.model3d"]`)) {
                await wait(100);
            }
            const filepicker = html.querySelector(`[name="flags.levels-3d-preview.model3d"]`).closest(".form-group");
            TokenBrowser.create(filepicker, app);
        });
    }

    initClipNavigation() {
        const clippingPlane = new game.Levels3DPreview.THREE.Plane(new game.Levels3DPreview.THREE.Vector3(0, -1, 0), 10000);
        this._clipHeight = 10000;
        Object.values(game.Levels3DPreview.tiles).forEach((t) => {
            if (t?.mesh)
                t.mesh.traverse((c) => {
                    if (c.isMesh) {
                        c.material.clippingPlanes = [clippingPlane];
                    }
                });
        });
        Object.values(game.Levels3DPreview.walls).forEach((t) => {
            if (t?.mesh)
                t.mesh.traverse((c) => {
                    if (c.isMesh) {
                        c.material.clippingPlanes = [clippingPlane];
                    }
                });
        });
        game.Levels3DPreview.scene.traverse((c) => {
            if (c.isMesh) {
                c.material.clippingPlanes = null;
            }
        });
    }

    // RememberV14
    _onRangeChange() {
        const input = this.element.querySelector("#clip-navigation-range input");
        const value = parseFloat(input.value);
        const disabled = value == this.offLevel.top;

        const closest = this.levels.reduce((a, b) => {
            return Math.abs(a.top - value) < Math.abs(b.top - value) ? a : b;
        });

        this.element.querySelectorAll(".clip-navigation-range-label").forEach((e) => {
            const top = e.dataset.top;
            e.classList.toggle("level-active", top == closest.top);
        });

        if (disabled) {
            game.Levels3DPreview.scene.traverse((c) => {
                if (c.isMesh) {
                    c.material.clippingPlanes = null;
                }
            });
            return;
        }
        const pxUnit = canvas.scene.dimensions.size / canvas.scene.dimensions.distance;
        const clipHeight = (pxUnit * value) / game.Levels3DPreview.factor;
        this._clipHeight = clipHeight;
        const clippingPlane = new game.Levels3DPreview.THREE.Plane(new game.Levels3DPreview.THREE.Vector3(0, -1, 0), clipHeight);

        Object.values(game.Levels3DPreview.tiles).forEach((t) => {
            t.mesh.traverse((c) => {
                if (c.isMesh) {
                    c.material.clippingPlanes = [clippingPlane];
                }
            });
        });
        Object.values(game.Levels3DPreview.walls).forEach((t) => {
            t.mesh.traverse((c) => {
                if (c.isMesh) {
                    c.material.clippingPlanes = [clippingPlane];
                }
            });
        });
    }

    CLIP_NAVIGATION_BUTTONS = [
        {
            id: "clip-navigation-camera",
            name: "levels3dpreview.clipNavigator.cameraToToken",
            icon: "fas fa-video",
            visible: () => true,
            callback: () => game.Levels3DPreview.setCameraToControlled(),
        },
        {
            id: "clip-navigation-automode",
            name: "levels3dpreview.clipNavigator.automode",
            icon: "fas fa-street-view",
            toggle: true,
            visible: () => this.showRange,
            callback: (e) => {
                this.autoMode = !this.autoMode;
                game.settings.set("levels-3d-preview", "clipNavigatorFollowClient", this.autoMode);
                e.target.classList.toggle("clip-navigation-enabled");
            },
        },
        {
            id: "clip-navigation-lock",
            name: "levels3dpreview.clipNavigator.lockon",
            icon: "fas fa-lock",
            toggle: true,
            visible: () => this.isGC,
            callback: (e) => {
                game.Levels3DPreview.GameCamera.lock = !game.Levels3DPreview.GameCamera.lock;
                e.target.classList.toggle("clip-navigation-enabled", game.Levels3DPreview.GameCamera.lock);
            },
        },
        //GM
        {
            id: "game-camera-toggle",
            name: "levels3dpreview.clipNavigator.gamecamera",
            icon: "fas fa-location-arrow",
            toggle: true,
            visible: () => this.isGM && this.isGC,
            callback: (e) => {
                game.Levels3DPreview.GameCamera.toggle();
                e.target.classList.toggle("clip-navigation-enabled", game.Levels3DPreview.GameCamera.enabled);
            },
        },
        // RememberV14
        // {
        //     id: "clip-navigation-sync",
        //     name: "levels3dpreview.clipNavigator.sync",
        //     icon: "fas fa-random",
        //     visible: () => this.isGM && this.showRange,
        //     callback: () => {
        //         Socket.syncClipNavigator({range: this.currentRange});
        //         ui.notifications.info(game.i18n.localize("levels3dpreview.clipNavigator.syncNotification").replace("{{level}}", this.currentLevel.name));
        //     },
        // },
        {
            id: "clip-navigation-fog",
            name: "levels3dpreview.clipNavigator.fog",
            icon: "fas fa-smog",
            toggle: true,
            visible: () => this.isFog && this.isGM,
            callback: (e) => {
                const factor = game.Levels3DPreview.factor;
                const fogDistance = (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) / factor;
                if (fogDistance == game.Levels3DPreview.scene.fog?.far) {
                    game.Levels3DPreview.scene.fog.far = 3000;
                    game.Levels3DPreview.camera.far = 100;
                    game.Levels3DPreview.camera.updateProjectionMatrix()
                } else {
                    game.Levels3DPreview.scene.fog.far = fogDistance;
                    game.Levels3DPreview.camera.far = fogDistance;
                    game.Levels3DPreview.camera.updateProjectionMatrix()
                }
                e.target.classList.toggle("clip-navigation-enabled", game.Levels3DPreview.scene.fog.far == fogDistance);
            },
        },
        {
            id: "clip-navigation-wireframe",
            name: "levels3dpreview.clipNavigator.wireframe",
            icon: "fas fa-low-vision",
            toggle: true,
            visible: () => this.isGM,
            callback: (e) => {
                this.wireframe = !this.wireframe;
                e.target.classList.toggle("clip-navigation-enabled", this.wireframe);
            },
        },
        {
            id: "clip-navigation-performancereport",
            name: "levels3dpreview.clipNavigator.performancereport",
            icon: "fas fa-chart-column",
            visible: () => this.isGM,
            callback: () => {
                game.Levels3DPreview.helpers.showPerformanceDialog();
            },
        },
        {
            id: "clip-navigation-controls",
            name: "levels3dpreview.clipNavigator.controls",
            icon: "fas fa-question",
            visible: () => true,
            callback: (e) => {
                if (!game.Levels3DPreview._ready) return;
                document.querySelector("#levels-3d-preview-loading-bar").style.display = "none";
                document.querySelector("#clip-navigation-higlight-arrow")?.remove();

                const loadingScreen = document.querySelector(".levels-3d-preview-loading-screen");
                loadingScreen.style.transition = "opacity 0.2s";
                loadingScreen.style.opacity = loadingScreen.style.opacity === "0" ? "1" : "0";

                document.querySelector("#close-loading-screen").style.display = "flex";
            },
        },
        {
            id: "controlsRef",
            name: `levels3dpreview.tileEditor.controlsReference.title`,
            icon: "fas fa-gamepad",
            visible: () => game.Levels3DPreview?._active && this.isGM,
            callback: () => {
                canvas.tiles.activate();
                game.Levels3DPreview.interactionManager.showControlReference();
                ui.sidebar.changeTab("chat", "primary")
            },
        },
        {
            id: "clip-navigation-performance",
            name: "levels3dpreview.clipNavigator.performance",
            icon: "fas fa-cog",
            visible: () => true,
            callback: (e) => {
                game.Levels3DPreview.helpers.setPerformancePreset();
            },
        },
    ];

    BUILD_PANEL_BUTTONS_BASE = [
        {
            id: "props",
            name: "Props",
            icon: "fas fa-tree",
            visible: () => true,
            callback: () => {
                new AssetBrowser().render(true);
            },
        },
    ];
}