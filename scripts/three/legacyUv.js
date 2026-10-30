const LEGACY_UV_MAPS = [
    ["USE_MAP", "vMapUv"],
    ["USE_SPECULARMAP", "vSpecularMapUv"],
    ["USE_DISPLACEMENTMAP", "vDisplacementMapUv"],
    ["USE_NORMALMAP", "vNormalMapUv"],
    ["USE_BUMPMAP", "vBumpMapUv"],
    ["USE_ROUGHNESSMAP", "vRoughnessMapUv"],
    ["USE_METALNESSMAP", "vMetalnessMapUv"],
    ["USE_ALPHAMAP", "vAlphaMapUv"],
    ["USE_EMISSIVEMAP", "vEmissiveMapUv"],
    ["USE_CLEARCOATMAP", "vClearcoatMapUv"],
    ["USE_CLEARCOAT_NORMALMAP", "vClearcoatNormalMapUv"],
    ["USE_CLEARCOAT_ROUGHNESSMAP", "vClearcoatRoughnessMapUv"],
    ["USE_TRANSMISSIONMAP", "vTransmissionMapUv"],
    ["USE_THICKNESSMAP", "vThicknessMapUv"],
];

const LEGACY_UV_TEXTURE_SLOTS = ["map", "specularMap", "displacementMap", "normalMap", "bumpMap", "roughnessMap", "metalnessMap", "alphaMap", "emissiveMap", "clearcoatMap", "clearcoatNormalMap", "clearcoatRoughnessMap", "transmissionMap", "thicknessMap"];

const DEFINE_UV ="#ifndef USE_UV\n#define USE_UV\n#endif\n";

const SELECT_LEGACY_UV = LEGACY_UV_MAPS.map(([define, varying], i) => `#${i ? "elif" : "if"} defined( ${define} )\n\tvUv = ${varying};`).join("\n") + "\n#endif\nlegacyUv = vUv;";

const WRITE_BACK_LEGACY_UV = LEGACY_UV_MAPS.map(([define, varying]) => `#ifdef ${define}\n\t${varying} = vUv;\n#endif`).join("\n");

export function applyLegacyUvMatrix(material, matrix) {
    for (const slot of LEGACY_UV_TEXTURE_SLOTS) {
        let texture = material[slot];
        if (!texture) continue;
        if (!texture.userData.legacyUvMatrix) {
            texture = texture.clone();
            texture.userData.legacyUvMatrix = true;
            texture.matrixAutoUpdate = false;
            material[slot] = texture;
        }
        texture.matrix.copy(matrix);
    }
}

export function applyLegacyUv(shader) {
    shader.vertexShader =
        DEFINE_UV +
        "vec2 legacyUv;\n" +
        shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>\n${SELECT_LEGACY_UV}`).replace("#include <morphtarget_vertex>", `${WRITE_BACK_LEGACY_UV}\n#include <morphtarget_vertex>`);
    shader.fragmentShader = DEFINE_UV + shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n#ifdef USE_MAP\n\tvec4 texelColor = sampledDiffuseColor;\n#endif");
}
