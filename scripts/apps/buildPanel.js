import { AssetBrowser } from "./assetBrowser.js";
import { TokenBrowser } from "./tokenBrowser.js";
import { Socket } from "../lib/socket.js";
import { factor } from "../main.js";
// import { CLIP_NAVIGATION_BUTTONS } from "./clipNavigation.js";

export class BuildPanel extends Application {
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

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: "build-panel",
            classes: ["three-canvas-compendium-app-slim"],
            template: `modules/levels-3d-preview/templates/build-panel.hbs`,
            resizable: false,
            popOut: false,
        };
    }

    getData() {
        this.isGC = game.settings.get("levels-3d-preview", "enableGameCamera") && (canvas.scene.getFlag("levels-3d-preview", "enableGameCamera") ?? true);;
        this.isGM = game.user.isGM;
        this.isFog = canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false;
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
        }
        const b = game.user.isGM ? this.BUILD_PANEL_BUTTONS.filter((b) => b.visible()) : [];
        const c = this.CLIP_NAVIGATION_BUTTONS.filter(b => b.visible());
        document.querySelector(":root").style.setProperty("--build-panel-height", `${(b.length + c.length) * 40 + 50}px`);
        const showSeparator = b.length > 0 && c.length > 0;
        return {
            showSeparator,
            buttons: b,
            clipNavigation: c,
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find("#clip-navigation-fog").addClass("clip-navigation-enabled");
        this.insertMinimizeButton();
        html.find("#game-camera-toggle").toggleClass("clip-navigation-enabled", game.Levels3DPreview.GameCamera.enabled);
        setTimeout(() => { 
            if (this._autoHide) {
                html.addClass("minimized");
            }
        }, 10000);
        $("#sidebar-tabs menu").after(html);
        html.on("click", "#build-panel-minimize", () => { 
            html.toggleClass("minimized");
        });
        html.on("click", ".build-panel-button", (event) => { 
            this._autoHide = false;
            const action = event.currentTarget.dataset.action;
            const btn = [
                ...this.BUILD_PANEL_BUTTONS,
                ...this.CLIP_NAVIGATION_BUTTONS
            ].find((b) => b.id === action);
            btn.callback(event);
        });
        if (game.Levels3DPreview.sharing.apps.MapBrowser?.contest?.active) {
            html.find(`i[data-action="community-maps"]`).addClass("contest-active");
            const trophyIcon = $(`<i class="fas fa-trophy-star"></i>`);
            const li = html.find(`i[data-action="community-maps"]`).closest("li");
            li.css("position", "relative");
            trophyIcon.css({
                position: "absolute",
                left: "-3px",
                top: "2px",
                "font-size": "0.8rem",
                color: "#ffc200",
                "pointer-events": "none",
                "text-shadow": "0 0 3px black"
            })
            li.append(trophyIcon);
        }
        html.on("input", "input", this._onRangeChange.bind(this));
        html.find("#clip-navigation-range input").on("change", this._onRangeSnap.bind(this));
        html.find("#clip-navigation-range input").trigger("change");
        html.find("#game-camera-toggle").toggleClass("clip-navigation-enabled", game.Levels3DPreview.GameCamera.enabled);
        html.find("#clip-navigation-fog").toggleClass("clip-navigation-enabled", (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) / factor == game.Levels3DPreview.scene.fog?.far);
        
        html.on("click", ".clip-navigation-btn", (e) => { 
            const id = e.currentTarget.id;
            const button = this.CLIP_NAVIGATION_BUTTONS.find((b) => b.id === id);
            if (button) button.callback(e);
        });

        if (!this._setOnLoad) {
            this.setToClosest();
            this._setOnLoad = true;
        }
    }

    insertMinimizeButton(remove = false){
        if(remove) return document.querySelectorAll("#build-panel-minimize").forEach(b => b.remove());

        const button = document.createElement("button")
        button.id = "build-panel-minimize";
        button.className = "ui-control plain icon fa-solid fa-cube";
        const li = document.createElement("li");
        li.appendChild(button)
        document.querySelector(`button[data-tab="settings"]`).closest("li").after(li)
        button.addEventListener("click", ()=>{
            this.element.toggleClass("minimized")
        })
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

        Hooks.on("controlToken", (token, controlled) => {
            if (!game.Levels3DPreview?._active) return;
            if (controlled) {
                game.Levels3DPreview.BuildPanel.setToClosest();
            }
        });

        Hooks.on("updateToken", (token, updates) => {
            if (!game.Levels3DPreview?._active) return;
            if ("elevation" in updates && token.object?.controlled) {
                game.Levels3DPreview.BuildPanel.setToClosest();
            }
        });

        Hooks.on("renderTokenConfig", async (app, html) => {
            html = $(html);
            function wait(ms) {
                return new Promise((resolve) => setTimeout(resolve, ms));
            }
            await wait(100);
        
            while (!html.find(`[name="flags.levels-3d-preview.model3d"]`).length) {
                await wait(100);
            }
            const filepicker = html.find(`[name="flags.levels-3d-preview.model3d"]`).closest(".form-group");
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

    update() {
        if (!this.showRange) return;
        $(this.element).find("#clip-navigation-range input").trigger("change");
    }

    set(val) {
        if (!this.showRange) return;
        this.currentRange = val;
        this.render(true);
    }

        setToClosest(value) {
        if (!this.showRange) return;
        if (!value && this.autoMode) value = (canvas.tokens.controlled[0] ?? _token)?.document.elevation;
        if (isNaN(value)) return;
        const input = $(this.element).find("#clip-navigation-range input");
        const closest = this.levels.reduce((a, b) => {
            return Math.abs(a.bottom - value) < Math.abs(b.bottom - value) ? a : b;
        });
        if (closest.top === this.currentRange) return;
        input.val(closest.top);
        this.currentRange = closest.top;
        this.currentLevel = closest;
        this._onRangeChange();
    }

    _onRangeSnap(e) {
        const input = $(e.currentTarget);
        const value = parseFloat(input.val());
        const closest = this.levels.reduce((a, b) => {
            return Math.abs(a.top - value) < Math.abs(b.top - value) ? a : b;
        });
        input.val(closest.top);
        this.currentRange = closest.top;
        this.currentLevel = closest;
        this._onRangeChange();
    }

    _onRangeChange() {
        const input = $(this.element).find("#clip-navigation-range input");
        const value = parseFloat(input.val());
        const disabled = value == this.offLevel.top;

        const closest = this.levels.reduce((a, b) => {
            return Math.abs(a.top - value) < Math.abs(b.top - value) ? a : b;
        });

        $(this.element)
            .find(".clip-navigation-range-label")
            .each((i, e) => {
                const top = $(e).data("top");
                $(e).toggleClass("level-active", top == closest.top);
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
                $(e.currentTarget).toggleClass("clip-navigation-enabled");
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
                $(e.currentTarget).toggleClass("clip-navigation-enabled", game.Levels3DPreview.GameCamera.lock);
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
                $(e.currentTarget).toggleClass("clip-navigation-enabled", game.Levels3DPreview.GameCamera.enabled);
            },
        },
        {
            id: "clip-navigation-sync",
            name: "levels3dpreview.clipNavigator.sync",
            icon: "fas fa-random",
            visible: () => this.isGM && this.showRange,
            callback: () => {
                Socket.syncClipNavigator({range: this.currentRange});
                ui.notifications.info(game.i18n.localize("levels3dpreview.clipNavigator.syncNotification").replace("{{level}}", this.currentLevel.name));
            },
        },
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
                $(e.currentTarget).toggleClass("clip-navigation-enabled", game.Levels3DPreview.scene.fog.far == fogDistance);
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
                $(e.currentTarget).toggleClass("clip-navigation-enabled", this.wireframe);
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
                $("#levels-3d-preview-loading-bar").hide();
                $("#clip-navigation-higlight-arrow").remove();
                $(".levels-3d-preview-loading-screen").fadeToggle(200);
                $("#close-loading-screen").css("display", "flex");
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