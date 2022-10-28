export function setPerformancePreset(){

    const buttons = {}
    for(let [k,v] of Object.entries(performancePresets)){
        buttons[k] = {
            icon: `<i class="${v.icon}"></i>`,
            label: game.i18n.localize(`levels3dpreview.performance.${k}`),
            callback: () => { applyPreset(k,v) }
        }
    }

    const d = new Dialog({
        title: game.i18n.localize(`levels3dpreview.performance.dialog.title`),
        content: game.i18n.localize(`levels3dpreview.performance.dialog.content`),
        buttons: buttons,
        default: "medium",
        render: () => {},
        close: () => {}
       });
    d.position.width = 600;
    d.render(true);

}

export function injectPresetButtons(html){
    let buttons = '';
    for(let [k,v] of Object.entries(performancePresets)){
        buttons += `<button class="performance-preset" data-tooltip="${game.i18n.localize(`levels3dpreview.performance.buttonTooltip.${k}`)}" data-preset="${k}"><i class="${v.icon}"></i> ${game.i18n.localize(`levels3dpreview.performance.${k}`)}</button>`;
    }
    let prestHtml = $(`<div><h3 class="border">${game.i18n.localize(`levels3dpreview.performance.settings.header`)}</h3><div class="form-group">${buttons}</div><p class="notes">${game.i18n.localize(`levels3dpreview.performance.settings.presetHint`)}</p><hr></div>`);
    prestHtml.on('click', '.performance-preset', (event) => {
        let preset = event.currentTarget.dataset.preset;
        applyPreset(preset, performancePresets[preset]);
    });
    html.find('input[name="levels-3d-preview.enableShaders"]').closest('.form-group').before(prestHtml);

}

async function applyPreset(id, preset){
    Object.values(ui.windows).find(w => w instanceof SettingsConfig)?.close();
    ui.notifications.notify(`${game.i18n.localize(`levels3dpreview.performance.notification`).replace("{performancemode}", game.i18n.localize(`levels3dpreview.performance.${id}`))}`);
    setTimeout(async () => {
    for(let [k,v] of Object.entries(preset)){
        if(k == "icon") continue;
        await game.settings.set("levels-3d-preview", k, v);
    }
    SettingsConfig.reloadConfirm();
    }, 1000);
}


const performancePresets = {
    "verylow": {
        icon: "fas fa-sad-cry",
        softShadows: false,
        shadowQuality: 0,
        antialiasing: "none",
        fowQuality: 0.1,
        enableShaders: false,
        enableEffects: false,
    },
    "low": {
        icon: "fas fa-frown",
        softShadows: false,
        shadowQuality: 0,
        antialiasing: "none",
        fowQuality: 0.25,
        enableShaders: true,
        enableEffects: true,
    },
    "medium": {
        icon: "fas fa-meh",
        softShadows: false,
        shadowQuality: 2,
        antialiasing: "fxaa",
        fowQuality: 0.5,
        enableShaders: true,
        enableEffects: true,
    },
    "high": {
        icon: "fas fa-smile",
        softShadows: true,
        shadowQuality: 4,
        antialiasing: "smaa",
        fowQuality: 0.75,
        enableShaders: true,
        enableEffects: true,
    },
    "veryhigh": {
        icon: "fas fa-grin-stars",
        softShadows: true,
        shadowQuality: 8,
        antialiasing: "smaa",
        fowQuality: 1,
        enableShaders: true,
        enableEffects: true,
    }
}