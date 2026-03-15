import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

export class MiniCanvas extends HandlebarsApplication {
    constructor(actor) {
        super();
        this.actor = actor;
        this.positionCalls = 0;
        this.savePosition = foundry.utils.debounce(() => {
            game.settings.set("levels-3d-preview", "minicanvasposition", this.position);
        }, 100);
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            classes: ["mini-canvas"],
            id: "miniCanvas",
            window: {
                resizable: true,
                title: "Canvas",
            },
            position: {
                width: position.width ?? 300 * aspectRatio,
                height: position.height ?? 300,
                left: position.left,
                top: position.top,
            }
        });
    }

    static get PARTS() {
        return {
            content: {
                template: `modules/levels-3d-preview/templates/minicanvas.hbs`,
            }
        }
    }

    setPosition({ left, top, width, height, scale } = {}) {
        const aspectRatio = window.innerWidth / window.innerHeight;
        height = width / aspectRatio;
        super.setPosition({ left, top, width, height, scale });
        this.savePosition();
    }

    _prepareContext(options) {
        super._prepareContext(options);
        return {};
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        this.updateControls(true);
        const canvasContainer = html.querySelector(".canvas-container");
        const board = document.getElementById("board");

        canvasContainer.append(board);
        board.style.width = "100%";
        board.style.height = "100%";
        board.style.display = "block";
        canvas.stage.renderable = true;
    }

    resize() {
        // $("#board").css({
        //     width: "100%",
        //     height: "100%",
        // });
        this.element.querySelector("#board").style.width = "100%";
        this.element.querySelector("#board").style.height = "100%";
    }

    _onResize(e) {
        super._onResize(e);
    }

    // updateControls(toggle) {
    //     return;
    //     $(`li[data-tool="miniCanvas"]`).toggleClass("active", toggle);
    //     ui.controls.controls.find((c) => c.name == "token").tools.find((t) => t.name == "miniCanvas").active = toggle;
    // }

    close() {
        document.querySelector(".vtt").append(this.element.querySelector("#board"));
        if (game.Levels3DPreview._active) {
            document.getElementById("board").style.display = "none";
            canvas.stage.renderable = false;
        }
        super.close();
        this.updateControls(false);
    }

    static toggle() {
        const currentInstance = Object.values(ui.windows)?.find((w) => w.id === "miniCanvas");
        if (currentInstance) {
            currentInstance.close();
        } else {
            new MiniCanvas().render(true);
        }
    }
}
