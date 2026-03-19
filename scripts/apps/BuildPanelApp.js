import { BUILD_PANEL_APPLICATION_PADDING, BUILD_PANEL_APPLICATION_WIDTH } from "../config.js";
import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

export class BuildPanelApp extends HandlebarsApplication {
    constructor () {
        super();
    }

    static get DEFAULT_OPTIONS() {
        const chatButton = document.querySelector(".ui-control[data-tab='chat']");
        return mergeClone(super.DEFAULT_OPTIONS, {
            classes: ["three-canvas-compendium-app-slim"],
            position: {
                width: BUILD_PANEL_APPLICATION_WIDTH,
                height: "auto",
                top: BUILD_PANEL_APPLICATION_PADDING,
                left: chatButton.getBoundingClientRect().left - BUILD_PANEL_APPLICATION_WIDTH - BUILD_PANEL_APPLICATION_PADDING,
            },
        });
    }
}