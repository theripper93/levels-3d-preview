export default function initTemplateEffects(){
    Hooks.callAll("3DCanvasTemplateEffectsInit", shaderData, handlers);
    const handler = handlers[game.system.id]
    if (handler) {
        Hooks.on("preCreateMeasuredTemplate", (templateDocument) => {
            try {
                if(game.Levels3DPreview._active && game.settings.get("levels-3d-preview", "templateEffects")) handler(templateDocument, true)        
            }catch (e) {
                
            }
        })
        Hooks.on("createMeasuredTemplate", (templateDocument) => {
            try {
                if(game.Levels3DPreview._active && game.settings.get("levels-3d-preview", "templateEffects")) handler(templateDocument)        
            }catch (e) {
                
            }
        });
    }
}

const handlers = {
    "dnd5e": (templateDocument, preCreate = false) => {
        const effects = shaderData[game.system.id]
        const activity = fromUuidSync(templateDocument.flags?.dnd5e?.origin)
        if (!activity) return;
        const isInstant = !activity.duration?.value
        const damageTypes = activity.damage.parts.map(part => Array.from(part.types)).flat();
        const damageType = damageTypes.find(type => effects[type]) ?? "default"
        if(isInstant && !preCreate) return playVFX(templateDocument, damageType);
        if(preCreate && !isInstant) applyEffect(templateDocument, effects[damageType])
    },
    "pf2e": (templateDocument) => { 
        const effects = shaderData.dnd5e;
        const damageTypes = templateDocument.flags?.pf2e?.origin?.traits;
        if(!damageTypes) return;
        let effect = effects[damageTypes[0]]
        if(!effect) damageTypes.forEach(type => {if(effects[type]) effect = effects[type]})
        if(!effect) effect = effects["default"];
        applyEffect(templateDocument, effect)
    },
}

const shaderData = {
    "dnd5e": {
        fire: {
            fillColor: "#ff6f00",
            shaderData: {"fire":{"enabled":true,"speed":0.2,"intensity":1.4371,"scale":4,"color":"#ff9500","blendMode":false}}
        },
        acid: {
            fillColor: "#56fc03",
            shaderData: {"ocean":{"enabled":true,"speed":0.04,"scale":0.1,"waveA_wavelength":0.6,"waveA_steepness":0.3029,"waveA_direction":90,"waveB_wavelength":0.3,"waveB_steepness":0.2524,"waveB_direction":260,"waveC_wavelength":0.2,"waveC_steepness":0.3534,"waveC_direction":180,"foam":false},"oil":{"enabled":true,"speed":0.02,"intensity":1.1356,"scale":1,"color":"#00ff00","blendMode":false}}
        },
        cold: {
            fillColor: "#0394fc",
            shaderData: {"ice":{"enabled":true,"speed":0.1,"intensity":1.015,"grain":0.5,"scale":1,"color":"#4294b8","blendMode":false}}
        },
        force: {
            fillColor: "#000000",
            shaderData: {"lightning":{"enabled":true,"speed":0.1,"intensity":0.7738,"scale":0.4,"color":"#0004ff","blendMode":false},"oil":{"enabled":true,"speed":0.02,"intensity":0.8341,"scale":0.2,"color":"#ff0af7","blendMode":false},"colorwarp":{"enabled":true,"speed":0.1,"glow":0,"hue_angle":183,"flicker":false,"animate_range":1}}
        },
        lightning: {
            fillColor: "#0313fc",
            shaderData: {"lightning":{"enabled":true,"speed":0.1,"intensity":0.9346,"scale":0.4,"color":"#0088ff","blendMode":true}}
        },
        necrotic: {
            fillColor: "#4d5e57",
            shaderData: {"oil":{"enabled":true,"speed":0.02,"intensity":0.8341,"scale":2,"color":"#7f347c","blendMode":true}}
        },
        poison: {
            fillColor: "#0b6625",
            shaderData: {"fire":{"enabled":true,"speed":0.07,"intensity":0.5326,"scale":4,"color":"#0b6625","blendMode":false}}
        },
        psychic: {
            fillColor: "#710996",
            shaderData: {"fire":{"enabled":true,"speed":0.07,"intensity":0.3718,"scale":4,"color":"#710996","blendMode":false},"lightning":{"enabled":true,"speed":0.003,"intensity":0.1909,"scale":0.3,"color":"#710996","blendMode":true}}
        },
        radiant: {
            fillColor: "#ffff54",
            shaderData: {"fire":{"enabled":true,"speed":0.07,"intensity":0.4321,"scale":5,"color":"#ffff54","blendMode":true},"oil":{"enabled":true,"speed":0.02,"intensity":1.9999,"scale":0.2,"color":"#ffff54","blendMode":false}}
        },
        thunder: {
            fillColor: "#54ffb2",
            shaderData: {"ice":{"enabled":true,"speed":0.1,"intensity":0.9346,"grain":0.5,"scale":1,"color":"#54ffb2","blendMode":false},"lightning":{"enabled":true,"speed":0.03,"intensity":0.5929,"scale":0.7,"color":"#bc05ff","blendMode":true}}
        },
        healing: {
            fillColor: "#09ff00",
            shaderData: {"fire":{"enabled":true,"speed":0.07,"intensity":0.7537,"scale":5,"color":"#09ff00","blendMode":false},"lightning":{"enabled":true,"speed":0.01,"intensity":0.5929,"scale":0.1,"color":"#00ff4c","blendMode":false},"oil":{"enabled":true,"speed":0.02,"intensity":1.2763,"scale":0.2,"color":"#00ffee","blendMode":false}}
        },
        slashing: {
            fillColor: "#c7c7c7",
            shaderData: {"ice":{"enabled":true,"speed":1,"intensity":0.6532,"grain":1,"scale":1,"color":"#4f4f4f","blendMode":false}}
        },
        piercing: {
            fillColor: "#c7c7c7",
            shaderData: {"ice":{"enabled":true,"speed":1,"intensity":0.6532,"grain":1,"scale":1,"color":"#4f4f4f","blendMode":false}}
        },
        bludgeoning: {
            fillColor: "#c7c7c7",
            shaderData: {"ice":{"enabled":true,"speed":1,"intensity":0.6532,"grain":1,"scale":1,"color":"#4f4f4f","blendMode":false}}
        },
        default: {
            fillColor: "#c7c7c7",
            shaderData: {"ice":{"enabled":true,"speed":1,"intensity":0.6532,"grain":1,"scale":1,"color":"#4f4f4f","blendMode":false}}
        }
    }
}

function applyEffect(templateDocument, effect){
    templateDocument.updateSource({fillColor: effect.fillColor, flags: {"levels-3d-preview": {shaders: effect.shaderData}}})
}

export function isLockedOnOrigin(item) {
    const system = game.system.id;
    if (system === "dnd5e") { 
        const isLocked = !item.system?.range?.value;
        const token = item.parent.getActiveTokens()[0] ?? _token;
        return isLocked ? token : false;
    }
    return false;
}

function playVFX(template,damageType) {

    const shape = template.t;
    const effect = new Particle3D(vfxTypes[damageType], false);
    effect
        .to(template)
        .scale(vfxScale[shape])
        .duration(3000)
        .color(vfxColors[damageType][0], vfxColors[damageType][1])
        .presetIntensity(vfxIntensity[shape][vfxTypes[damageType]])
    .start(false)
}

const vfxColors = {
    "acid": ["lime", "green"],
    "bludgeoning": ["#c7c7c7", "#c7c7c7"],
    "cold": ["lightblue", "blue"],
    "fire": ["#ffcd42", "#ff7b00"],
    "force": ["white", "magenta"],
    "lightning": ["blue", "lightblue"],
    "necrotic": ["grey", "purple"],
    "piercing": ["#c7c7c7", "#c7c7c7"],
    "poison": ["lightgreen", "green"],
    "psychic": ["blue", "magenta"],
    "radiant": ["white", "yellow"],
    "slashing": ["#c7c7c7", "#c7c7c7"],
    "thunder": ["lime", "orange"],
}

const vfxTypes = {
    "acid": "directionalfire",
    "bludgeoning": "directionalpoison",
    "cold": "directionalfire",
    "fire": "directionalfire",
    "force": "directionalshock",
    "lightning": "directionalshock",
    "necrotic": "directionalpoison",
    "piercing": "directionalpoison",
    "poison": "directionalpoison",
    "psychic": "directionalshock",
    "radiant": "directionalfire",
    "slashing": "directionalpoison",
    "thunder": "directionalshock",
}

const vfxIntensity = {
    "circle": {
        "directionalfire": 8,
        "directionalpoison": 8,
        "directionalshock": 1,
    },
    "ray": {
        "directionalfire": 8,
        "directionalpoison": 8,
        "directionalshock": 1,
    },
    "cone": {
        "directionalfire": 10,
        "directionalpoison": 8,
        "directionalshock": 5,
    },
    "rect": {
        "directionalfire": 8,
        "directionalpoison": 8,
        "directionalshock": 1,
    },
}

const vfxScale = {
    "circle": 6,
    "ray": 2,
    "cone": 3,
    "rect": 6,
}