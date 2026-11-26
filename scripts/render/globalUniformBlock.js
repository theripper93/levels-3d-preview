import { fogUniforms } from "../systems/Fog.js";
import { atmosphereFogUniforms } from "../atmosphere/fog.js";
import { surfaceUniforms } from "../vfx/surface/receivers.js";
import { revealUniforms } from "../systems/reveal.js";
import { windUniforms } from "../shaders/wind/windSway.js";
import { sceneUniforms } from "../vfx/render/sceneBuffer.js";

const MARKER = "#define L3D_UBO";
const BLOCK_NAME = "L3DGlobals";
const BINDING = 0;
const DECLARATION = /^[ \t]*uniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+(\w+)\s*(?:\[[^\]]*\])?\s*;[ \t]*$/gm;

const MEMBERS = [
    ["uRevealViewProj", "mat4"],
    ["uSceneProjectionInverse", "mat4"],
    ["uSceneCameraWorld", "mat4"],
    ["uRevealScreen", "vec4[]"],
    ["uRevealPlane", "vec4[]"],
    ["uRevealBody", "vec4[]"],
    ["l3dVMSources", "vec4[]"],
    ["l3dPaintBands", "vec2[]"],
    ["l3dVMGrade", "vec4"],
    ["l3dPaintRect", "vec4"],
    ["atmoEdgeRect", "vec4"],
    ["uSurfaceRect", "vec4"],
    ["uSurfaceGrowth", "vec4"],
    ["uSurfaceAmount", "vec4"],
    ["uSurfaceShape", "vec4"],
    ["uSurfaceDetail", "vec4"],
    ["uSurfaceStyle", "vec4"],
    ["l3dVMTint", "vec3"],
    ["fogWallOffset", "float"],
    ["uRevealCamPos", "vec3"],
    ["uClusterCell", "float"],
    ["uSurfaceColor", "vec3"],
    ["uClusterLevels", "float"],
    ["uSurfaceAmbient", "vec3"],
    ["l3dVM", "float"],
    ["uSurfaceSky", "vec3"],
    ["l3dVMTime", "float"],
    ["sceneDimensions", "vec2"],
    ["sceneOrigin", "vec2"],
    ["overlayRepeat", "vec2"],
    ["uClusterOrigin", "vec2"],
    ["l3dPaintRows", "vec2"],
    ["fwDir", "vec2"],
    ["uSceneResolution", "vec2"],
    ["uSceneNearFar", "vec2"],
    ["uSurfaceY", "vec2"],
    ["uSurfaceWind", "vec2"],
    ["uClusterLayout", "ivec2"],
    ["uClusterDims", "ivec2"],
    ["useOverlay", "bool"],
    ["uClusterEffects", "int"],
    ["uClusterDarkness", "int"],
    ["l3dPaintCount", "int"],
    ["uRevealCount", "int"],
    ["l3dVMFloor", "float"],
    ["l3dVMGlow", "float"],
    ["atmoFogMode", "float"],
    ["atmoFogHeight", "float"],
    ["atmoEdgeFade", "float"],
    ["uRevealAspect", "float"],
    ["fwStrength", "float"],
    ["fwGust", "float"],
    ["fwTime", "float"],
    ["fwWave", "float"],
    ["fwScale", "float"],
    ["fwSquare", "float"],
    ["uSceneTime", "float"],
    ["uSurfaceTexel", "float"],
    ["uSurfaceSquare", "float"],
    ["uSurfaceCover", "float"],
    ["uSurfaceWet", "float"],
    ["uSurfaceRain", "float"],
    ["uSurfaceTime", "float"],
    ["uSurfaceRoughness", "float"],
    ["uSurfaceSparkle", "float"],
    ["uSurfaceLumps", "float"],
    ["uSurfaceQuality", "float"],
    ["uSurfaceEnabled", "float"],
];

const NAMES = new Set(MEMBERS.map(([name]) => name));
const LAYOUT = { float: [4, 4], int: [4, 4], bool: [4, 4], vec2: [8, 8], ivec2: [8, 8], vec3: [16, 12], vec4: [16, 16], mat4: [16, 64] };

let layout = null;
let state = null;

export const uniformBlock = { enabled: true };

function containers() {
    return { ...fogUniforms, ...atmosphereFogUniforms, ...surfaceUniforms, ...revealUniforms, ...windUniforms, ...sceneUniforms };
}

function buildLayout() {
    const source = containers();
    let offset = 0;
    const entries = [];
    const lines = [];
    for (const [name, type] of MEMBERS) {
        const container = source[name];
        const array = type.endsWith("[]");
        const base = array ? type.slice(0, -2) : type;
        const count = array ? container.value.length : 0;
        const [align, size] = LAYOUT[base];
        const step = array ? 16 : align;
        offset = Math.ceil(offset / step) * step;
        entries.push({ container, base, count, offset: offset / 4 });
        offset += array ? 16 * count : size;
        lines.push(`\t${base === "bool" ? "" : "highp "}${base} ${name}${array ? `[ ${count} ]` : ""};`);
    }
    const bytes = Math.ceil(offset / 16) * 16;
    return { source, entries, bytes, glsl: `layout(std140) uniform ${BLOCK_NAME} {\n${lines.join("\n")}\n};` };
}

function writeVector(f32, offset, value, length) {
    if (Array.isArray(value)) {
        for (let i = 0; i < length; i++) f32[offset + i] = value[i] ?? 0;
        return;
    }
    if (value.isColor) {
        f32[offset] = value.r;
        f32[offset + 1] = value.g;
        f32[offset + 2] = value.b;
        return;
    }
    f32[offset] = value.x;
    f32[offset + 1] = value.y;
    if (length > 2) f32[offset + 2] = value.z;
    if (length > 3) f32[offset + 3] = value.w;
}

function pack(f32, i32) {
    for (const entry of layout.entries) {
        const value = entry.container.value;
        const offset = entry.offset;
        switch (entry.base) {
            case "float":
                f32[offset] = value;
                break;
            case "int":
                i32[offset] = value;
                break;
            case "bool":
                i32[offset] = value ? 1 : 0;
                break;
            case "ivec2":
                i32[offset] = Array.isArray(value) ? value[0] : value.x;
                i32[offset + 1] = Array.isArray(value) ? value[1] : value.y;
                break;
            case "mat4":
                f32.set(value.elements, offset);
                break;
            default: {
                const length = entry.base === "vec2" ? 2 : entry.base === "vec3" ? 3 : 4;
                if (!entry.count) writeVector(f32, offset, value, length);
                else for (let i = 0; i < entry.count; i++) writeVector(f32, offset + i * 4, value[i], length);
            }
        }
    }
}

function upload() {
    const { gl, f32, i32, last, buffer } = state;
    pack(f32, i32);
    let changed = state.dirty;
    if (!changed) {
        for (let i = 0; i < i32.length; i++) {
            if (i32[i] === last[i]) continue;
            changed = true;
            break;
        }
    }
    if (changed) {
        last.set(i32);
        state.dirty = false;
        gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, i32);
    }
    gl.bindBufferBase(gl.UNIFORM_BUFFER, BINDING, buffer);
}

function convertSource(source) {
    if (!source.includes(MARKER)) return source;
    return source.replace(DECLARATION, (line, name) => (NAMES.has(name) ? "" : line)).replace(MARKER, layout.glsl);
}

export function installGlobalUniformBlock(renderer) {
    const gl = renderer.getContext();
    if (!state || state.gl !== gl) {
        layout ??= buildLayout();
        const shaderSource = gl.shaderSource;
        if (!shaderSource.l3dUniformBlock) {
            const wrapped = function (shader, source) {
                return shaderSource.call(this, shader, convertSource(source));
            };
            wrapped.l3dUniformBlock = true;
            gl.shaderSource = wrapped;
        }
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
        gl.bufferData(gl.UNIFORM_BUFFER, layout.bytes, gl.DYNAMIC_DRAW);
        const data = new ArrayBuffer(layout.bytes);
        state = { gl, buffer, f32: new Float32Array(data), i32: new Int32Array(data), last: new Int32Array(layout.bytes / 4), dirty: true };
    }
    const render = renderer.render;
    renderer.render = function (scene, camera) {
        upload();
        return render.call(this, scene, camera);
    };
    return uniformBlock;
}

export function useGlobalUniformBlock(shader) {
    if (!state || !uniformBlock.enabled) return;
    const global = layout.source;
    const uniforms = {};
    for (const name in shader.uniforms) {
        const uniform = shader.uniforms[name];
        if (uniform !== global[name] || !NAMES.has(name)) uniforms[name] = uniform;
    }
    shader.uniforms = uniforms;
    shader.vertexShader = `${MARKER}\n${shader.vertexShader}`;
    shader.fragmentShader = `${MARKER}\n${shader.fragmentShader}`;
}
