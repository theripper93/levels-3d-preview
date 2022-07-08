export function setPerformancePreset(){

    const buttons = {}
    for(let [k,v] of Object.entries(performancePresets)){
        buttons[k] = {
            icon: v.icon,
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
    d.position.width = 450;
    d.render(true);

}

async function applyPreset(id, preset){
    ui.notifications.notify(`${game.i18n.localize(`levels3dpreview.performance.notification`).replace("{performancemode}", game.i18n.localize(`levels3dpreview.performance.${id}`))}`);
    setTimeout(async () => {
        for(let [k,v] of Object.entries(preset)){
            if(k == "disableResolutionScaling" || k == "icon") continue;
            await game.settings.set("levels-3d-preview", k, v);
        }
        await game.settings.set("core", "disableResolutionScaling", preset.disableResolutionScaling);
        window.location.reload();
    }, 5000);
}


const performancePresets = {
    "verylow": {
        softShadows: false,
        shadowQuality: 0,
        antialiasing: "none",
        fowQuality: 0.1,
        disableResolutionScaling: true,
    },
    "low": {
        softShadows: false,
        shadowQuality: 2,
        antialiasing: "none",
        fowQuality: 0.25,
        disableResolutionScaling: true,
    },
    "medium": {
        softShadows: false,
        shadowQuality: 4,
        antialiasing: "fxaa",
        fowQuality: 0.5,
        disableResolutionScaling: false,
    },
    "high": {
        softShadows: true,
        shadowQuality: 4,
        antialiasing: "smaa",
        fowQuality: 0.75,
        disableResolutionScaling: false,
    },
    "veryhigh": {
        softShadows: true,
        shadowQuality: 8,
        antialiasing: "smaa",
        fowQuality: 1,
        disableResolutionScaling: false,
    }
}