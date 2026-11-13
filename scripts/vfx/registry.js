const TargetOnlyPresetSystems = {};
const ProjectilesParticleSystems = {};
const RaysParticleSystems = {};
const ExplosionsParticleSystems = {};
const SpritesParticleSystems = {};
const DirectionalParticleSystems = {};
const TileParticleSystems = {};
const TokenParticleSystems = {};

const GROUPS = {
    presets: TargetOnlyPresetSystems,
    projectiles: ProjectilesParticleSystems,
    rays: RaysParticleSystems,
    explosions: ExplosionsParticleSystems,
    sprites: SpritesParticleSystems,
    directional: DirectionalParticleSystems,
};

export function registerEffects(group, effects, { token = false, tile = false } = {}) {
    if (!GROUPS[group]) throw new Error(`3D Canvas | Unknown particle effect group "${group}"`);
    Object.assign(GROUPS[group], effects);
    if (token) Object.assign(TokenParticleSystems, effects);
    if (tile) Object.assign(TileParticleSystems, effects);
}

export class PARTICLE_SYSTEMS {
    static get CONSTS() {
        return {
            TargetOnlyPresetSystems,
            ProjectilesParticleSystems,
            RaysParticleSystems,
            ExplosionsParticleSystems,
            SpritesParticleSystems,
            DirectionalParticleSystems,
            TileParticleSystems,
            TokenParticleSystems,
        };
    }

    static get TARGET_ONLY_PRESET_SYSTEMS() {
        return {
            ...TargetOnlyPresetSystems,
        };
    }

    static get TILE_PARTICLE_SYSTEMS() {
        return {
            ...TileParticleSystems,
        };
    }

    static get TOKEN_PARTICLE_SYSTEMS() {
        return {
            ...TokenParticleSystems,
        };
    }

    static get LIGHT_PARTICLE_SYSTEMS() {
        return {
            ...TargetOnlyPresetSystems,
            ...DirectionalParticleSystems,
        };
    }

    static get TARGET_ONLY_PARTICLE_SYSTEMS() {
        return {
            ...TargetOnlyPresetSystems,
            ...ExplosionsParticleSystems,
        };
    }

    static get SOURCE_TARGET_PARTICLE_SYSTEMS() {
        return {
            ...ProjectilesParticleSystems,
            ...RaysParticleSystems,
            ...SpritesParticleSystems,
        };
    }

    static get TEMPLATE_PARTICLE_SYSTEMS() {
        return {
            ...DirectionalParticleSystems,
        };
    }

    static get ALL_PARTICLE_SYSTEMS() {
        return {
            ...TargetOnlyPresetSystems,
            ...ProjectilesParticleSystems,
            ...RaysParticleSystems,
            ...ExplosionsParticleSystems,
            ...SpritesParticleSystems,
            ...DirectionalParticleSystems,
        };
    }

    static get ALL_PARTICLE_SYSTEMS_WITHOPTS() {
        return {
            "optgroup-projectiles": "optgroup-projectiles",
            ...ProjectilesParticleSystems,
            "optgroup-rays": "optgroup-rays",
            ...RaysParticleSystems,
            "optgroup-sprites": "optgroup-sprites",
            ...SpritesParticleSystems,
            "optgroup-directional": "optgroup-directional",
            ...DirectionalParticleSystems,
            "optgroup-explosions": "optgroup-explosions",
            ...ExplosionsParticleSystems,
            "optgroup-targetonly": "optgroup-targetonly",
            ...TargetOnlyPresetSystems,
        };
    }

    static getLocalizationKeys(systems) {
        const key = "levels3dpreview.particleSystems.";
        if (typeof systems === "string") return key + systems;
        else if (Array.isArray(systems)) return systems.map((s) => key + s);
        else if (typeof systems === "object") return Object.keys(systems).map((s) => key + s);
    }

    static localize(systems) {
        const keys = this.getLocalizationKeys(systems);
        if (Array.isArray(keys)) return keys.map((k) => game.i18n.localize(k));
        else return game.i18n.localize(keys);
    }

    static getSelectOptions(systems, options = { localize: false }) {
        systems = systems instanceof Object ? Object.keys(systems) : systems;
        const { localize } = options;
        const obj = Object.fromEntries(systems.map((k) => [k, localize ? this.localize(k) : this.getLocalizationKeys(k)]));
        return Object.fromEntries(Object.entries(obj).sort((a, b) => a[1].localeCompare(b[1])));
    }

    static requiresSourceTarget(system) {
        return Object.keys(this.SOURCE_TARGET_PARTICLE_SYSTEMS).includes(system);
    }

    static getParticleClass(type) {
        return this.ALL_PARTICLE_SYSTEMS[type];
    }

    static getDefaultLightData(system) {
        const systemClass = this.getParticleClass(system);
        if (!systemClass) return null;
        return {
            scale: systemClass.DEFAULT_SCALE,
            emitterSize: systemClass.DEFAULT_EMITTER_SIZE,
        };
    }
}
