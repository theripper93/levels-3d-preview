const MODULE_ID = "levels-3d-preview";
const CORE_FLAGS = ["enablePlayers", "auto3d", "object3dSight"];

function localize(key) {
    return game.i18n.localize(`levels3dpreview.sceneConfig.${key}`);
}

export function section(id, legend, fields) {
    return {
        [`${id}SectionStart`]: { type: "custom", html: `<fieldset><legend>${localize(`sections.${legend}`)}</legend>` },
        ...fields,
        [`${id}SectionEnd`]: { type: "custom", html: `</fieldset>` },
    };
}

export function statusSection() {
    return {
        statusSection: {
            type: "custom",
            html: `<fieldset class="levels3d-scene-status">
                <legend>${localize("sections.status")}</legend>
                <p class="hint notification" data-status></p>
                <div class="form-group">
                    <button type="button" data-action="enable-recommended"><i class="fas fa-check-double"></i> ${localize("status.recommended")}</button>
                </div>
            </fieldset>`,
        },
    };
}

export function activateStatusSection(app, html) {
    const card = html.querySelector(".levels3d-scene-status");
    if (!card) return;
    const inputs = CORE_FLAGS.map((flag) => html.querySelector(`[name="flags.${MODULE_ID}.${flag}"]`)).filter(Boolean);
    const status = card.querySelector("[data-status]");
    const button = card.querySelector("[data-action='enable-recommended']");
    const refresh = () => {
        const missing = inputs.filter((input) => !input.checked).map((input) => input.closest(".form-group")?.querySelector("label")?.textContent.trim());
        status.classList.toggle("info", !missing.length);
        status.classList.toggle("warning", !!missing.length);
        status.textContent = missing.length ? game.i18n.format("levels3dpreview.sceneConfig.status.missing", { settings: missing.join(", "), tab: game.i18n.localize("SCENE.TABS.SHEET.misc") }) : localize("status.ready");
        button.closest(".form-group").classList.toggle("hidden", !missing.length);
        app.setPosition({ height: "auto" });
    };
    inputs.forEach((input) => input.addEventListener("change", refresh));
    button.addEventListener("click", () => {
        inputs.forEach((input) => (input.checked = true));
        refresh();
    });
    refresh();
}
