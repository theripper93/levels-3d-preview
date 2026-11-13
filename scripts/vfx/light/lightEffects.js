import { factor } from "../../main.js";
import { getQuality } from "../quality.js";
import { LightHalo } from "./halo.js";
import { LightShaft } from "./shaft.js";

const MODULE_ID = "levels-3d-preview";

export class LightEffects {
    constructor(light3d) {
        this.light3d = light3d;
        this.halo = null;
        this.shaft = null;
    }

    refresh(document) {
        const flags = document.flags?.[MODULE_ID] ?? {};
        const enabled = getQuality().enabled;
        const { color, radius } = this.light3d.initialLightParams;
        const alpha = this.light3d.alpha ?? 0.5;
        const unit = canvas.dimensions.size / factor;
        if (enabled && flags.lightHalo) {
            this.halo ??= new LightHalo();
            this.light3d.mesh.add(this.halo);
            this.halo.configure({ color, size: unit * 1.2 * (flags.lightHaloScale ?? 1), intensity: 0.4 + alpha });
        } else this.disposeHalo();
        if (enabled && flags.lightShaft && !this.light3d.isPointLight) {
            this.shaft ??= new LightShaft();
            this.light3d.mesh.add(this.shaft);
            this.shaft.configure({ color, length: radius, angle: this.light3d.light3d.angle, intensity: flags.lightShaftIntensity ?? 0.35, motes: flags.lightShaftMotes ?? true, moteSize: unit * 0.04 });
        } else this.disposeShaft();
    }

    update(flicker, visible) {
        if (this.halo) {
            this.halo.visible = visible;
            this.halo.update(flicker);
        }
        if (this.shaft) {
            this.shaft.visible = visible;
            this.shaft.aim(this.light3d.mesh.position, this.light3d.light3d.target.position);
            this.shaft.update(flicker);
        }
    }

    disposeHalo() {
        this.halo?.destroy();
        this.halo = null;
    }

    disposeShaft() {
        this.shaft?.destroy();
        this.shaft = null;
    }

    dispose() {
        this.disposeHalo();
        this.disposeShaft();
    }
}
