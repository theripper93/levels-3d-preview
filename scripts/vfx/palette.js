import * as THREE from "three";
import * as QUARKS from "three.quarks";
import { colorToVec4 } from "./base/quarks.js";

const WHITE = new THREE.Color(1, 1, 1);
const BLACK = new THREE.Color(0, 0, 0);
const hsl = { h: 0, s: 0, l: 0 };

function derive(color, { white = 0, saturation = 1, lightness = 1, minLightness = 0, maxLightness = 1 } = {}) {
    const result = color.clone().lerp(WHITE, white);
    result.getHSL(hsl, THREE.SRGBColorSpace);
    return result.setHSL(hsl.h, Math.clamp(hsl.s * saturation, 0, 1), Math.clamp(hsl.l * lightness, minLightness, maxLightness), THREE.SRGBColorSpace);
}

export class Palette {
    constructor(starts, ends = starts) {
        this.starts = starts.map((c) => new THREE.Color(c));
        this.ends = ends.map((c) => new THREE.Color(c));
        this.start = this.starts[0];
        this.end = this.ends[0];
        this.white = WHITE;
        this.black = BLACK;
        this.core = derive(this.start, { white: 0.65 });
        this.mid = this.start.clone().lerp(this.end, 0.5);
        this.edge = derive(this.end, { lightness: 0.6 });
        this.glow = derive(this.start, { saturation: 1.15, minLightness: 0.35 });
        this.spark = derive(this.end, { white: 0.35, minLightness: 0.5 });
        this.light = derive(this.start, { minLightness: 0.5 });
        this.smoke = derive(this.end, { saturation: 0.25, minLightness: 0.1, maxLightness: 0.22 });
        this.ash = derive(this.end, { saturation: 0.12, minLightness: 0.4, maxLightness: 0.55 });
    }

    static from(color) {
        return new Palette(color.start, color.end);
    }

    get(color) {
        if (color?.isColor) return color;
        return this[color] ?? new THREE.Color(color);
    }

    vec4(color, alpha = 1, overdrive = 1) {
        return colorToVec4(this.get(color), alpha, overdrive);
    }

    range(from, to, fromAlpha = 1, toAlpha = fromAlpha) {
        return new QUARKS.ColorRange(this.vec4(from, fromAlpha), this.vec4(to, toAlpha));
    }

    gradient(stops) {
        const colors = [];
        const alphas = [];
        for (const [t, color, alpha = 1, overdrive = 1] of stops) {
            const value = this.vec4(color, alpha, overdrive);
            colors.push([new THREE.Vector3(value.x, value.y, value.z), t]);
            alphas.push([alpha, t]);
        }
        return new QUARKS.Gradient(colors, alphas);
    }

    colorOverLife(spec) {
        if (!Array.isArray(spec)) return spec;
        if (Array.isArray(spec[0])) return this.gradient(spec);
        const [from, to, fromAlpha = 1, toAlpha = 0] = spec;
        return this.range(from, to, fromAlpha, toAlpha);
    }
}
