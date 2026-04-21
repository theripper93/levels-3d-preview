export function check3DToggleConflicts() {
    let conflict = false;
    if (game.modules.get("pf2e-toolbelt")?.active) {
        if (game.settings.get("pf2e-toolbelt", "underground.enabled")) {
            ui.notifications.error("3D Canvas | PF2e Toolbelt -> Undeground -> Enabled setting detected. Please disable it to avoid conflicts.", { permanent: true });
            conflict = true;
        }
    }
    return conflict;
}