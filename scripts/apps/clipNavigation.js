import {Socket} from "../lib/socket.js";
import { factor } from "../main.js";

export class ClipNavigation extends Application {
    constructor() {
        super();
        this.autoMode = game.settings.get("levels-3d-preview", "clipNavigatorFollowClient");
        this.wireframe = false;
        this.init();
    }

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            title: "ClipNavigation",
            id: "clip-navigation",
            template: `modules/levels-3d-preview/templates/ClipNavigation.hbs`,
            resizable: false,
            popOut: false,
        };
    }

    getData() {
        const data = super.getData();
        data.isGC = game.settings.get("levels-3d-preview", "enableGameCamera") && (canvas.scene.getFlag("levels-3d-preview", "enableGameCamera") ?? true);
        data.isGM = game.user.isGM;
        data.isFog = canvas.scene.getFlag("levels-3d-preview", "enableFog") ?? false;
        this.isGC = data.isGC;
        this.isGM = data.isGM;
        this.isFog = data.isFog;
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
        data.autoMode = this.autoMode;
        data.showRange = levels.length > 0;
        this.showRange = data.showRange;
        const compendium = game.modules.get("canvas3dcompendium")?.active;
        const buttons = compendium ? [] : CLIP_NAVIGATION_BUTTONS.filter((b) => b.visible());
        data.buttons = buttons;
        if (!data.showRange) return data;
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
        data.levels = levels;
        data.range = {
            min: this.lowestLevel.top,
            max: this.higestLevel.top + 5,
            curr: this.currentRange ?? this.higestLevel.top + 5,
        };
        this.max = data.range.max;
        this.min = data.range.min;
        this.levels = levels;
        return data;
    }

    setPosition() {
        const html = $(this.element);
        const sidebar = $("#sidebar");
        html.css({
            position: "absolute",
            top: "5px",
            right: sidebar.width() + 10 + "px",
            height: sidebar.height() + "px", //"10px",
            //width: sidebar.height() + "px",
        });
        html.find("#clip-navigation-range").css({
            width: sidebar.height() - html.find("#clip-navigation-btns").height() + "px",
        });
        //Position Labels

        const totalRange = this.max - this.min;
        const rangeSize = html.find("#clip-navigation-range input").width() - 14;

        html.find(".clip-navigation-range-label").each((i, e) => {
            const top = $(e).data("top");
            const percentagePos = (top - this.min) / totalRange;
            const pos = rangeSize * percentagePos - $(e).width() + $(e).height() / 2;
            $(e).css({
                left: pos + "px",
            });
        });
    }

    activateListeners(html) {
        html.on("input", "input", this._onRangeChange.bind(this));
        html.find("#clip-navigation-range input").on("change", this._onRangeSnap.bind(this));
        html.find("#clip-navigation-range input").trigger("change");
        html.find("#game-camera-toggle").toggleClass("clip-navigation-enabled", game.Levels3DPreview.GameCamera.enabled);
        html.find("#clip-navigation-fog").toggleClass("clip-navigation-enabled", (canvas.scene.getFlag("levels-3d-preview", "fogDistance") ?? 3000) / factor == game.Levels3DPreview.scene.fog?.far);
        
        html.on("click", ".clip-navigation-btn", (e) => { 
            const id = e.currentTarget.id;
            const button = CLIP_NAVIGATION_BUTTONS.find((b) => b.id === id);
            if (button) button.callback(e);
        });

        if (!this._setOnLoad) {
            this.setToClosest();
            this._setOnLoad = true;
        }
    }

    init() {
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

    static setHooks() {
        Hooks.on("controlToken", (token, controlled) => {
            if (!game.Levels3DPreview?._active) return;
            if (controlled) {
                game.Levels3DPreview.ClipNavigation.setToClosest();
            }
        });

        Hooks.on("updateToken", (token, updates) => {
            if (!game.Levels3DPreview?._active) return;
            if ("elevation" in updates && token.object?.controlled) {
                game.Levels3DPreview.ClipNavigation.setToClosest();
            }
        });
    }
}

export const CLIP_NAVIGATION_BUTTONS = [
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
        visible: () => game.Levels3DPreview.ClipNavigation.showRange,
        callback: (e) => {
            game.Levels3DPreview.ClipNavigation.autoMode = !game.Levels3DPreview.ClipNavigation.autoMode;
            game.settings.set("levels-3d-preview", "clipNavigatorFollowClient", game.Levels3DPreview.ClipNavigation.autoMode);
            $(e.currentTarget).toggleClass("clip-navigation-enabled");
        },
    },
    {
        id: "clip-navigation-lock",
        name: "levels3dpreview.clipNavigator.lockon",
        icon: "fas fa-lock",
        toggle: true,
        visible: () => game.Levels3DPreview.ClipNavigation.isGC,
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
        visible: () => game.Levels3DPreview.ClipNavigation.isGM && game.Levels3DPreview.ClipNavigation.isGC,
        callback: (e) => {
            game.Levels3DPreview.GameCamera.toggle();
            $(e.currentTarget).toggleClass("clip-navigation-enabled", game.Levels3DPreview.GameCamera.enabled);
        },
    },
    {
        id: "clip-navigation-sync",
        name: "levels3dpreview.clipNavigator.sync",
        icon: "fas fa-random",
        visible: () => game.Levels3DPreview.ClipNavigation.isGM && game.Levels3DPreview.ClipNavigation.showRange,
        callback: () => {
            Socket.syncClipNavigator({range: game.Levels3DPreview.ClipNavigation.currentRange});
            ui.notifications.info(game.i18n.localize("levels3dpreview.clipNavigator.syncNotification").replace("{{level}}", game.Levels3DPreview.ClipNavigation.currentLevel.name));
        },
    },
    {
        id: "clip-navigation-fog",
        name: "levels3dpreview.clipNavigator.fog",
        icon: "fas fa-smog",
        toggle: true,
        visible: () => game.Levels3DPreview.ClipNavigation.isFog && game.Levels3DPreview.ClipNavigation.isGM,
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
        visible: () => game.Levels3DPreview.ClipNavigation.isGM,
        callback: (e) => {
            game.Levels3DPreview.ClipNavigation.wireframe = !game.Levels3DPreview.ClipNavigation.wireframe;
            $(e.currentTarget).toggleClass("clip-navigation-enabled", game.Levels3DPreview.ClipNavigation.wireframe);
        },
    },
    {
        id: "clip-navigation-performancereport",
        name: "levels3dpreview.clipNavigator.performancereport",
        icon: "fas fa-chart-column",
        visible: () => game.Levels3DPreview.ClipNavigation.isGM,
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
        visible: () => game.Levels3DPreview?._active && game.Levels3DPreview.ClipNavigation.isGM,
        callback: () => {
            canvas.tiles.activate();
            game.Levels3DPreview.interactionManager.showControlReference();
            $(".item[data-tab='chat']")[0].click();
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