import { PARTICLE_SYSTEMS } from "../registry.js";

const MODULE_ID = "levels-3d-preview";

export const LIGHT_PRESETS = {
    candle: {
        icon: "fas fa-candle-holder",
        light: { color: "#ffb35c", alpha: 0.45, bright: 0.5, dim: 1.5, animation: { type: "flame", speed: 4, intensity: 3 } },
        particles: ["candle", "torch"],
        particle: { ParticleScale: 0.15, ParticleColor: "#ff6a00", ParticleColor2: "#ffd27a", ParticleIntensity: 0.6 },
        halo: 0.45,
    },
    torch: {
        icon: "fas fa-fire-flame-simple",
        light: { color: "#ff9a3c", alpha: 0.5, bright: 4, dim: 8, animation: { type: "torch", speed: 5, intensity: 5 } },
        particles: ["torch"],
        particle: { ParticleScale: 0.3, ParticleColor: "#ff4f00", ParticleColor2: "#ffcf4a", ParticleIntensity: 1 },
        halo: 1,
    },
    campfire: {
        icon: "fas fa-campground",
        light: { color: "#ff7a2a", alpha: 0.55, bright: 3, dim: 7, animation: { type: "torch", speed: 4, intensity: 6 } },
        particles: ["campfire", "fire"],
        particle: { ParticleScale: 1.2, ParticleColor: "#ff3c00", ParticleColor2: "#ffb347", ParticleIntensity: 1 },
        halo: 1.8,
    },
    brazier: {
        icon: "fas fa-fire-burner",
        light: { color: "#ff8840", alpha: 0.5, bright: 3, dim: 6, animation: { type: "flame", speed: 4, intensity: 5 } },
        particles: ["brazier", "fire"],
        particle: { ParticleScale: 0.8, ParticleColor: "#ff4f00", ParticleColor2: "#ffcf4a", ParticleIntensity: 1 },
        halo: 1.3,
    },
    lantern: {
        icon: "fas fa-lightbulb",
        light: { color: "#ffd08a", alpha: 0.45, bright: 3, dim: 6, animation: { type: "flame", speed: 2, intensity: 2 } },
        particles: ["lantern"],
        particle: { ParticleScale: 0.2, ParticleColor: "#ff9a3c", ParticleColor2: "#ffe0a0", ParticleIntensity: 0.5 },
        halo: 0.8,
    },
    crystal: {
        icon: "fas fa-gem",
        light: { color: "#7fd8ff", alpha: 0.5, bright: 2, dim: 4, animation: { type: "starlight", speed: 3, intensity: 4 } },
        particles: ["crystal", "fairy"],
        particle: { ParticleScale: 0.05, ParticleColor: "#7fd8ff", ParticleColor2: "#e0f6ff", ParticleIntensity: 0.6 },
        halo: 1,
    },
};

export function resolvePresetParticle(preset) {
    return preset.particles.find((id) => PARTICLE_SYSTEMS.getParticleClass(id)) ?? null;
}

export function getLightPresetUpdate(id, scene = canvas.scene) {
    const preset = LIGHT_PRESETS[id];
    if (!preset) return null;
    const unit = scene.grid.distance;
    const { bright, dim, ...light } = preset.light;
    const particle = resolvePresetParticle(preset);
    return {
        config: { ...light, bright: bright * unit, dim: dim * unit },
        flags: {
            [MODULE_ID]: {
                lightPreset: id,
                lightHalo: true,
                lightHaloScale: preset.halo,
                enableParticle: !!particle,
                ...(particle ? { ParticleType: particle, ParticleEmitterSizeMultiplier: PARTICLE_SYSTEMS.getDefaultLightData(particle)?.emitterSize ?? 0, ...preset.particle } : {}),
            },
        },
    };
}

export async function applyLightPreset(document, id) {
    const update = getLightPresetUpdate(id, document.parent);
    if (!update) return null;
    return document.update(update);
}
