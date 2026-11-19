import * as THREE from "three";
import { factor } from "../../main.js";
import { wind } from "../../vfx/weather/wind.js";
import { getQuality } from "../../vfx/quality.js";

const IDLE_STRENGTH = 0.05;
const GUST_SQUARES = 7;
const TILE_STIFFNESS = 2.5;
const WOOD = /bark|trunk|wood|branch|stem/i;
const LEAF = /leaf|leaves|foliage|grass|flower|needle|frond|petal|blossom/i;

export function isFoliage(material) {
    const name = material?.name ?? "";
    return !WOOD.test(name) && LEAF.test(name);
}

THREE.ShaderChunk.common += "\nuniform bool l3dFoliage;\n";
THREE.ShaderChunk.normal_fragment_begin = THREE.ShaderChunk.normal_fragment_begin.replace("float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;", "float faceDirection = gl_FrontFacing || l3dFoliage ? 1.0 : - 1.0;");

export function markFoliage(material) {
    if (material?.side === THREE.DoubleSide && isFoliage(material)) material.userData.foliage = true;
}

export const WIND_GLSL = `
uniform vec2 fwDir;
uniform float fwStrength;
uniform float fwGust;
uniform float fwTime;
uniform float fwWave;
uniform float fwScale;
uniform float fwSquare;
float fw_hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float fw_noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fw_hash(i), fw_hash(i + vec2(1.0, 0.0)), f.x), mix(fw_hash(i + vec2(0.0, 1.0)), fw_hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 fw_sway(vec3 wp, vec3 pivot, float height, float response, float anchor, float stiffness, float flutter) {
    vec3 rel = wp - pivot;
    float h = clamp(rel.y / height, 0.0, 1.0);
    float w = pow(clamp((h - anchor) / max(1.0 - anchor, 1e-3), 0.0, 1.0), stiffness);
    if (w <= 0.0) return wp;
    float squares = height / fwSquare;
    float tempo = clamp(1.1 / sqrt(squares), 0.4, 1.0);
    float reach = clamp(3.0 / squares, 0.8, 1.0);
    vec2 side = vec2(-fwDir.y, fwDir.x);
    vec2 q = pivot.xz * fwScale;
    float along = dot(q, fwDir);
    float g = fw_noise(vec2(along - fwWave, dot(q, side) * 0.5));
    g = smoothstep(0.3, 0.8, g) * fwGust;
    float s = fwStrength;
    float ph = fw_hash(floor(pivot.xz * 211.0)) * 1.6 - along * 6.2831;
    float f = (1.4 + 1.8 * s) * tempo;
    float osc = (0.04 + 0.08 * s) * (0.6 + g) * mix(1.0, 1.8, smoothstep(1.5, 4.0, squares));
    float bend = 0.35 * s + g * (0.15 + 0.7 * s);
    vec2 b = (fwDir * (bend + osc * sin(fwTime * f + ph)) + side * (0.5 * osc * sin(fwTime * f * 1.37 + ph * 1.7))) * response * reach;
    float bl = length(b);
    vec3 bent = rel;
    if (bl > 1e-5) {
        vec3 k = vec3(b.y, 0.0, -b.x) / bl;
        float th = atan(bl) * w;
        float c = cos(th);
        bent = rel * c + cross(k, rel) * sin(th) + k * dot(k, rel) * (1.0 - c);
    }
    if (flutter > 0.0) {
        float fp = dot(rel, vec3(1.0, 1.3, 0.7)) * 14.0 / height + ph * 3.0;
        float fl = flutter * h * min(height, fwSquare) * 0.02 * (0.4 + s + g);
        bent += fl * vec3(sin(fwTime * 9.0 + fp), 0.6 * sin(fwTime * 11.0 + fp * 1.3), cos(fwTime * 8.3 + fp));
    }
    return pivot + bent;
}
`;

export const windUniforms = {
    fwDir: { value: new THREE.Vector2(1, 0) },
    fwStrength: { value: IDLE_STRENGTH },
    fwGust: { value: 0.3 },
    fwTime: { value: 0 },
    fwWave: { value: 0 },
    fwScale: { value: 1 },
    fwSquare: { value: 0.1 },
};

let last = 0;

export function updateWindSway() {
    const now = performance.now();
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    if (last && dt < 0.001) return;
    last = now;
    const step = getQuality().reduceMotion ? 0 : dt;
    const strength = Math.max(wind.strength, IDLE_STRENGTH);
    const radians = THREE.MathUtils.degToRad(wind.direction);
    const square = (canvas.scene?.dimensions.size ?? 100) / factor;
    windUniforms.fwDir.value.set(Math.sin(radians), -Math.cos(radians));
    windUniforms.fwStrength.value = strength;
    windUniforms.fwGust.value = 0.3 + 0.9 * wind.gustiness;
    windUniforms.fwScale.value = 1 / (GUST_SQUARES * square);
    windUniforms.fwSquare.value = square;
    windUniforms.fwTime.value += step;
    windUniforms.fwWave.value += step * (0.2 + 1.2 * strength);
}

const VERTEX = `
mat4 ws_m = modelMatrix;
vec3 ws_pivot = vec3(windSway_origin.x, yPos, windSway_origin.z);
float ws_height = mDepth;
#ifdef USE_INSTANCING
ws_m = modelMatrix * instanceMatrix;
ws_pivot = vec3(ws_m[3].x, (modelMatrix * vec4(instanceMatrix[3].x, shader_instance_position, instanceMatrix[3].z, 1.0)).y, ws_m[3].z);
if (shader_instance_depth > 0.0) ws_height = shader_instance_depth * length(modelMatrix[1].xyz);
#endif
vec3 ws_wp = (ws_m * vec4(transformed, 1.0)).xyz;
vec3 ws_new = fw_sway(ws_wp, ws_pivot, max(ws_height, 1e-4), windSway_response, windSway_anchor, ${TILE_STIFFNESS.toFixed(1)}, windSway_flutter * windSway_leaf);
transformed += inverse(mat3(ws_m)) * (ws_new - ws_wp);
`;

const slider = (def, min, max, step) => ({ type: "float", default: def, min, max, step });

export const windSway = {
    icon: `<i class="fas fa-wind"></i>`,
    uniforms: {
        response: slider(1, 0, 3, 0.05),
        anchor: slider(0.3, 0, 0.95, 0.01),
        flutter: slider(0.5, 0, 2, 0.05),
    },
    varying: {},
    vertexShader: [
        { mode: "append", injectionPoint: "#include <common>", noConditional: true, shaderCode: `${WIND_GLSL}
uniform vec3 windSway_origin;
uniform float windSway_leaf;` },
        { mode: "append", injectionPoint: "#include <begin_vertex>", noConditional: true, shaderCode: VERTEX },
    ],
    fragmentShader: [],
    onCompile(shader, { mesh, entity3D }) {
        Object.assign(shader.uniforms, windUniforms, {
            windSway_origin: { value: entity3D.mesh.getWorldPosition(new THREE.Vector3()) },
            windSway_leaf: { value: isFoliage(mesh.material) ? 1 : 0 },
        });
    },
};
