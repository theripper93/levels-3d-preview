import { ShaderChunk } from "three";
import { EFFECT_SLOTS, DATA_WIDTH, RECORD_TEXELS } from "./clusterManager.js";

const MULTI_SCATTERING_GUARD = "#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )";
const SAMPLER_LIMIT_PATTERN = /#define L3D_MAX_SAMPLERS \d+/;
const FOW_SAMPLERS = 2;
const SOFT_CLIP = "2.0";
const MASK_FLOOR = "0.04";
const MASK_NORMAL_TEXELS = "5.0";

const SAMPLER_CONDITIONS = [
    "defined( USE_MAP )",
    "defined( USE_ALPHAMAP )",
    "defined( USE_AOMAP )",
    "defined( USE_LIGHTMAP )",
    "defined( USE_EMISSIVEMAP )",
    "defined( USE_BUMPMAP ) && !defined( USE_NORMALMAP )",
    "defined( USE_NORMALMAP )",
    "defined( USE_ROUGHNESSMAP )",
    "defined( USE_METALNESSMAP )",
    "defined( USE_ENVMAP )",
    "defined( USE_SPECULARMAP )",
    "defined( USE_GRADIENTMAP )",
    "defined( USE_CLEARCOATMAP )",
    "defined( USE_CLEARCOAT_NORMALMAP )",
    "defined( USE_CLEARCOAT_ROUGHNESSMAP )",
    "defined( USE_IRIDESCENCEMAP )",
    "defined( USE_IRIDESCENCE_THICKNESSMAP )",
    "defined( USE_SHEEN_COLORMAP )",
    "defined( USE_SHEEN_ROUGHNESSMAP )",
    "defined( USE_ANISOTROPYMAP )",
    "defined( USE_SPECULAR_COLORMAP )",
    "defined( USE_SPECULAR_INTENSITYMAP )",
    "defined( USE_DIFFUSE_ROUGHNESSMAP )",
    "defined( USE_TRANSMISSION )",
    "defined( USE_TRANSMISSIONMAP )",
    "defined( USE_THICKNESSMAP )",
    "defined( STANDARD )",
    "defined( L3D_SURFACE )",
];

const samplerCountChunk = () => /* glsl */ `
#define L3D_MAX_SAMPLERS 16
${SAMPLER_CONDITIONS.map((condition, i) => `#if ${condition}\n#define L3D_SAMPLER_${i} 1\n#else\n#define L3D_SAMPLER_${i} 0\n#endif`).join("\n")}
#ifdef USE_SHADOWMAP
#define L3D_SAMPLER_SHADOWS ( NUM_SUN_LIGHT_SHADOWS + NUM_DIR_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS + NUM_POINT_LIGHT_SHADOWS )
#else
#define L3D_SAMPLER_SHADOWS 0
#endif
#if NUM_RECT_AREA_LIGHTS > 0
#define L3D_SAMPLER_AREA 2
#else
#define L3D_SAMPLER_AREA 0
#endif
#ifndef L3D_EXTRA_SAMPLERS
#define L3D_EXTRA_SAMPLERS 0
#endif
#define L3D_SAMPLERS ( ${SAMPLER_CONDITIONS.map((_, i) => `L3D_SAMPLER_${i}`).join(" + ")} + L3D_SAMPLER_SHADOWS + L3D_SAMPLER_AREA + NUM_SPOT_LIGHT_MAPS + NUM_LIGHT_PROBE_GRIDS + L3D_EXTRA_SAMPLERS + ${FOW_SAMPLERS} )
#if !defined( L3D_NO_CLUSTER ) && L3D_SAMPLERS + 1 > L3D_MAX_SAMPLERS
#define L3D_NO_CLUSTER
#elif !defined( L3D_NO_CLUSTER_MASKS ) && L3D_SAMPLERS + 2 > L3D_MAX_SAMPLERS
#define L3D_NO_CLUSTER_MASKS
#endif
`;

const clusterParsChunk = () => /* glsl */ `
${samplerCountChunk()}
uniform highp sampler2D uClusterLights;
uniform sampler2D uClusterMasks;
uniform ivec2 uClusterLayout;
uniform vec2 uClusterOrigin;
uniform float uClusterCell;
uniform ivec2 uClusterDims;
uniform int uClusterEffects;
uniform float uClusterLevels;
#define L3D_CLUSTER_TEXEL( index ) texelFetch( uClusterLights, ivec2( ( index ) % ${DATA_WIDTH}, ( index ) / ${DATA_WIDTH} ), 0 )
`;

const accumulateLight = (slot) => /* glsl */ `
    {
        int l3dBase = ( ${slot} ) * ${RECORD_TEXELS};
        vec4 l3dT0 = L3D_CLUSTER_TEXEL( l3dBase );
        vec4 l3dT1 = L3D_CLUSTER_TEXEL( l3dBase + 1 );
        vec3 l3dVector = ( viewMatrix * vec4( l3dT0.xyz, 1.0 ) ).xyz - geometryPosition;
        float l3dDistance = length( l3dVector );
        if ( l3dT1.rgb != vec3( 0.0 ) && ( l3dT0.w <= 0.0 || l3dDistance < l3dT0.w ) ) {
            vec4 l3dT2 = L3D_CLUSTER_TEXEL( l3dBase + 2 );
            vec4 l3dT4 = L3D_CLUSTER_TEXEL( l3dBase + 4 );
            directLight.direction = normalize( l3dVector );
            float l3dAttenuation = getDistanceAttenuation( l3dDistance, l3dT0.w, l3dT1.a );
            if ( uClusterLevels > 0.0 ) {
                float l3dBright = L3D_CLUSTER_TEXEL( l3dBase + 5 ).x * l3dT0.w;
                if ( l3dBright > 0.0 && l3dDistance > l3dBright ) l3dAttenuation = mix( l3dAttenuation, pow2( saturate( 1.0 - pow4( l3dDistance / l3dT0.w ) ) ) / max( pow( l3dBright, l3dT1.a ), 0.01 ), uClusterLevels );
            }
            directLight.color = l3dT1.rgb * l3dAttenuation;
            directLight.visible = true;
            if ( l3dT2.w > -1.5 ) directLight.color *= getSpotAttenuation( l3dT2.w, l3dT4.w, dot( directLight.direction, ( viewMatrix * vec4( l3dT2.xyz, 0.0 ) ).xyz ) );
            #ifndef L3D_NO_CLUSTER_MASKS
            vec4 l3dT3 = L3D_CLUSTER_TEXEL( l3dBase + 3 );
            if ( l3dT3.z > 0.0 ) {
                vec2 muv = clamp( ( l3dWorldPosition.xz - l3dT4.xy ) / ( 2.0 * l3dT4.z ) + 0.5 + l3dMaskOffset / l3dT3.z, 0.0, 1.0 );
                vec4 m = textureLod( uClusterMasks, l3dT3.xy + muv * l3dT3.zw, 0. );
                directLight.color *= max( m.r * m.g - ${MASK_FLOOR}, 0.0 ) / ( 1.0 - ${MASK_FLOOR} );
            }
            #endif
            RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
        }
    }
`;

const clusterFragmentChunk = () => /* glsl */ `
#if defined( RE_Direct ) && !defined( L3D_NO_CLUSTER )
    vec3 l3dWorldPosition = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
    #ifndef L3D_NO_CLUSTER_MASKS
    vec2 l3dMaskOffset = inverseTransformDirection( geometryNormal, viewMatrix ).xz * ( ${MASK_NORMAL_TEXELS} / float( textureSize( uClusterMasks, 0 ).x ) );
    #endif
    vec3 l3dDiffuseBefore = reflectedLight.directDiffuse;
    vec3 l3dSpecularBefore = reflectedLight.directSpecular;
    for ( int l3dEffect = 0; l3dEffect < ${EFFECT_SLOTS}; l3dEffect ++ ) {
        if ( l3dEffect >= uClusterEffects ) break;
        ${accumulateLight("l3dEffect")}
    }
    ivec2 l3dCell = ivec2( floor( ( l3dWorldPosition.xz - uClusterOrigin ) / uClusterCell ) );
    if ( all( greaterThanEqual( l3dCell, ivec2( 0 ) ) ) && all( lessThan( l3dCell, uClusterDims ) ) ) {
        int l3dCellIndex = l3dCell.y * uClusterDims.x + l3dCell.x;
        vec4 l3dHeaders = L3D_CLUSTER_TEXEL( uClusterLayout.x + l3dCellIndex / 2 );
        vec2 l3dHeader = ( l3dCellIndex % 2 ) == 0 ? l3dHeaders.xy : l3dHeaders.zw;
        int l3dOffset = int( l3dHeader.x );
        int l3dCount = int( l3dHeader.y );
        for ( int l3dK = 0; l3dK < l3dCount; l3dK ++ ) {
            int l3dIndex = l3dOffset + l3dK;
            ${accumulateLight("int( dot( L3D_CLUSTER_TEXEL( uClusterLayout.y + l3dIndex / 4 ), vec4( equal( ivec4( l3dIndex % 4 ), ivec4( 0, 1, 2, 3 ) ) ) ) )")}
        }
    }
    {
        vec3 l3dDiffuse = reflectedLight.directDiffuse - l3dDiffuseBefore;
        vec3 l3dSpecular = reflectedLight.directSpecular - l3dSpecularBefore;
        float l3dClip = 1.0 / ( 1.0 + dot( l3dDiffuse + l3dSpecular, vec3( 0.2126, 0.7152, 0.0722 ) ) / ${SOFT_CLIP} );
        reflectedLight.directDiffuse = l3dDiffuseBefore + l3dDiffuse * l3dClip;
        reflectedLight.directSpecular = l3dSpecularBefore + l3dSpecular * l3dClip;
    }
#endif
`;

const CUSTOM_SAMPLER_PATTERN = /(?:^|;)\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?\w*sampler\w*\s+(\w+)\s*(?:\[\s*(\d+)\s*\])?\s*;/gm;
const COUNTED_SAMPLERS = new Set(["specularColorMap", "specularIntensityMap", "diffuseRoughnessMap", "sheenColorMap", "sheenRoughnessMap", "anisotropyMap", "uSurfaceMap"]);

export function declareExtraSamplers(shader) {
    let count = 0;
    for (const [, name, size] of shader.fragmentShader.matchAll(CUSTOM_SAMPLER_PATTERN)) if (!COUNTED_SAMPLERS.has(name)) count += Number(size ?? 1);
    if (count) shader.fragmentShader = `#define L3D_EXTRA_SAMPLERS ${count}\n${shader.fragmentShader}`;
}

export function setClusterSamplerLimit(limit) {
    if (!(limit > 0)) return;
    ShaderChunk.lights_pars_begin = ShaderChunk.lights_pars_begin.replace(SAMPLER_LIMIT_PATTERN, `#define L3D_MAX_SAMPLERS ${limit}`);
}

export function installClusterChunks(THREELIB) {
    const chunks = THREELIB.ShaderChunk;
    if (!chunks.lights_fragment_begin.includes(MULTI_SCATTERING_GUARD)) console.warn("3D Canvas | Clustered lights could not patch multi-scattering compensation");
    chunks.lights_fragment_begin = chunks.lights_fragment_begin.replace(MULTI_SCATTERING_GUARD, `#if !defined( L3D_NO_CLUSTER ) || ${MULTI_SCATTERING_GUARD.slice(4)}`) + clusterFragmentChunk();
    chunks.lights_pars_begin += clusterParsChunk();
}
