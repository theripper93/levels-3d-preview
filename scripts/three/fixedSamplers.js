const SHARED_SAMPLERS = ["fogTexture", "fogOverlay", "uSurfaceMap", "uClusterLights", "uClusterMasks", "dfgLUT", "envMap", "tSceneDepth"];
const MIN_UNITS = 32;
const SAMPLER_2D = 0x8b5e;
const SAMPLER_CUBE = 0x8b60;

export function installFixedSamplers(renderer) {
    const gl = renderer.getContext();
    const combined = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    if (!(combined >= MIN_UNITS)) return;
    const base = combined - 2 - SHARED_SAMPLERS.length;
    const units = new Map(SHARED_SAMPLERS.map((name, i) => [name, base + i]));
    const programs = renderer.info.programs;
    const seen = new WeakSet();
    const pending = [];
    let count = -1;
    let last = null;
    const refresh = () => {
        if (programs.length !== count || programs[programs.length - 1] !== last) {
            count = programs.length;
            last = programs[count - 1];
            for (const program of programs) {
                if (seen.has(program)) continue;
                seen.add(program);
                pending.push(program);
            }
        }
        for (let i = pending.length - 1; i >= 0; i--) {
            const program = pending[i];
            if (program.usedTimes === 0) {
                pending.splice(i, 1);
                continue;
            }
            if (!program.isReady()) continue;
            pending.splice(i, 1);
            patchUniforms(program.getUniforms().seq, units);
        }
    };
    const render = renderer.render;
    renderer.render = function (scene, camera) {
        refresh();
        return render.call(this, scene, camera);
    };
}

function patchUniforms(seq, units) {
    for (const uniform of seq) {
        const unit = units.get(uniform.id);
        if (unit === undefined) continue;
        if (uniform.type === SAMPLER_2D) uniform.setValue = fixedSetter(uniform.setValue, unit, "setTexture2D");
        else if (uniform.type === SAMPLER_CUBE) uniform.setValue = fixedSetter(uniform.setValue, unit, "setTextureCube");
    }
}

function fixedSetter(original, unit, bind) {
    return function (gl, value, textures) {
        if (!value) return original.call(this, gl, value, textures);
        if (this.cache[0] !== unit) {
            gl.uniform1i(this.addr, unit);
            this.cache[0] = unit;
        }
        textures[bind](value, unit);
    };
}
