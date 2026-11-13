import * as THREE from "three";

export const HEIGHT_RATIO = 0.5;
export const SPEED_STEPS = 8;

const volume = /* glsl */ `
uniform sampler2D uShelterMap;
uniform vec4 uShelterRect;
uniform vec2 uShelterY;
uniform vec3 uCenter;
uniform vec4 uBounds;
uniform float uEdge;
uniform float uBase;
uniform float uLevel;
uniform float uMaxLevel;
uniform float uTime;
uniform float uSeedShift;
uniform float uTexel;
#define SHELTER_TAPS 6

vec4 shelterSample(vec2 xz) {
    vec2 uv = vec2((xz.x - uShelterRect.x) * uShelterRect.z, 1.0 - (xz.y - uShelterRect.y) * uShelterRect.w);
    return texture2D(uShelterMap, clamp(uv, 0.0, 1.0));
}

float shelterHeight(vec4 texel) {
    return uShelterY.x + (texel.r * 65280.0 + texel.g * 255.0) / 65535.0 * uShelterY.y;
}

float shelterTexel(vec2 pixel, vec2 size, float y, float fade) {
    vec4 texel = texture2D(uShelterMap, clamp((pixel + 0.5) / size, 0.0, 1.0));
    return smoothstep(0.0, fade, y - shelterHeight(texel)) * (1.0 - step(0.5, texel.b));
}

float shelterTap(vec2 xz, float y, float fade) {
    vec2 size = vec2(textureSize(uShelterMap, 0));
    vec2 pixel = vec2((xz.x - uShelterRect.x) * uShelterRect.z, 1.0 - (xz.y - uShelterRect.y) * uShelterRect.w) * size - 0.5;
    vec2 base = floor(pixel);
    vec2 f = pixel - base;
    float bottom = mix(shelterTexel(base, size, y, fade), shelterTexel(base + vec2(1.0, 0.0), size, y, fade), f.x);
    float top = mix(shelterTexel(base + vec2(0.0, 1.0), size, y, fade), shelterTexel(base + vec2(1.0, 1.0), size, y, fade), f.x);
    return mix(bottom, top, f.y);
}

float shelterFade(vec2 xz, float y, float fade, vec2 reach) {
    float sum = 0.0;
    for (int i = 0; i < SHELTER_TAPS; i++) sum += shelterTap(xz + reach * ((float(i) + 0.5) / float(SHELTER_TAPS) * 2.0 - 1.0), y, fade);
    return sum / float(SHELTER_TAPS);
}

float boxLevel(float random) {
    float lower = floor(uLevel);
    return lower + mod(lower + step(0.5, random), 2.0);
}

float levelWeight(float level) {
    return clamp(1.0 - abs(level - uLevel), 0.0, 1.0);
}

float boundsFade(vec2 xz, float size) {
    float inside = min(min(xz.x - uBounds.x, uBounds.z - xz.x), min(xz.y - uBounds.y, uBounds.w - xz.y));
    vec2 offCentre = abs(xz - uCenter.xz) / (0.5 * size);
    return smoothstep(0.0, uEdge, inside) * (1.0 - smoothstep(0.6, 1.0, max(offCentre.x, offCentre.y)));
}
`;

const outputTail = /* glsl */ `
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #ifdef USE_FOG
        gl_FragColor.a *= 1.0 - fogFactor * 0.8;
    #endif
    gl_FragColor.rgb *= gl_FragColor.a;
    gl_FragColor.a *= 1.0 - uAdditive;
`;

const precipitationVertex = /* glsl */ `
#define FOW_FROM_OFFSET
#define LOD_BAND 0.2
#define SHELTER_FADE_TIME 0.5
#include <common>
#include <fog_pars_vertex>
attribute vec2 corner;
attribute vec4 seed;
${volume}
uniform vec3 uOffset;
uniform vec3 uVelocity;
uniform vec3 uColors[4];
uniform float uColorCount;
uniform vec2 uTiles;
uniform float uTileCount;
uniform float uSize;
uniform float uSizeVariation;
uniform float uZoomSize;
uniform float uStretch;
uniform float uSway;
uniform float uSwayFrequency;
uniform float uSpin;
uniform float uRandomRotation;
uniform float uRotation;
uniform float uFlip;
uniform float uTwinkle;
uniform float uSpeedVariation;
uniform float uOpacity;
uniform float uGround;
uniform float uBand;
uniform float uLift;
uniform float uShelter;
varying vec2 vUv;
varying vec4 vColor;

void main() {
    vec4 s = fract(seed + uSeedShift * vec4(0.7311, 0.3173, 0.5939, 0.1377));
    vec4 r = fract(s.wzyx * 7.31 + s * 3.17 + 0.37);
    float lower = floor(uLevel);
    float level = lower + mod(lower + step(0.5, s.w), 2.0);
    float size = uBase * exp2(level);
    vec3 box = vec3(size, size * ${HEIGHT_RATIO.toFixed(2)}, size);
    float speed = (${SPEED_STEPS.toFixed(1)} + floor((r.x - 0.5) * uSpeedVariation + 0.5)) / ${SPEED_STEPS.toFixed(1)};
    vec3 centre = vec3(uCenter.x, uCenter.y + 0.4 * box.y, uCenter.z);
    vec3 anchor = mod(s.xyz * box + uOffset * speed - centre + 0.5 * box, box) - 0.5 * box + centre;
    float rise = (anchor.y - centre.y) / box.y + 0.5;
    float phase = uTime * uSwayFrequency;
    vec3 world = anchor + uSway * vec3(sin(phase * 1.3 + s.x * 40.0) + 0.5 * sin(phase * 2.9 + s.z * 23.0), 0.6 * sin(phase * 1.7 + s.y * 31.0), cos(phase * 1.1 + s.z * 37.0) + 0.5 * cos(phase * 3.1 + s.x * 17.0));
    world.y += uLift;

    vec4 shelter = shelterSample(world.xz);
    float roof = shelterHeight(shelter);
    float threshold = mix(LOD_BAND, 1.0 - LOD_BAND, fract(s.w * 2.0));
    float alpha = uOpacity * boundsFade(anchor.xz, size) * smoothstep(threshold - LOD_BAND, threshold + LOD_BAND, 1.0 - abs(level - uLevel));
    if (uGround > 0.5) world.y = roof + uLift + uBand * (0.15 + s.y);
    else alpha *= smoothstep(0.0, 0.06, rise) * (1.0 - smoothstep(0.9, 1.0, rise));
    alpha *= mix(1.0, 0.5 + 0.5 * sin(uTime * (1.5 + r.x * 3.0) + s.z * 100.0), uTwinkle);

    float scale = exp2(level * uZoomSize) * mix(1.0 - uSizeVariation, 1.0 + uSizeVariation, r.y);
    float width = uSize * scale;
    vec2 drift = uVelocity.xz * speed * SHELTER_FADE_TIME;
    vec2 reach = length(drift) > width ? drift : vec2(width, 0.0);
    float settle = max(max(width * 1.5, uTexel), min(max(-uVelocity.y, 0.0) * speed * SHELTER_FADE_TIME, uBase * 0.04));
    if (uShelter > 0.5) alpha *= shelterFade(world.xz, world.y, settle, reach);
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    alpha *= smoothstep(max(uBase * 0.01, width * 4.0), max(uBase * 0.04, width * 12.0), -mvPosition.z);
    vec2 local = corner + 0.5;
    if (uStretch > 0.0) {
        vec3 velocity = (viewMatrix * vec4(uVelocity, 0.0)).xyz;
        float planar = length(velocity.xy);
        vec2 direction = planar > 1e-5 ? velocity.xy / planar : vec2(0.0, -1.0);
        float stretch = max(uStretch * scale * speed * planar / (length(velocity) + 1e-5), width * 1.5);
        mvPosition.xy += direction * corner.y * stretch + vec2(-direction.y, direction.x) * corner.x * width;
        local = vec2(corner.y + 0.5, corner.x + 0.5);
    } else {
        float yaw = atan(viewMatrix[2][0], viewMatrix[0][0]);
        float angle = uRotation + (r.z * 6.2832 + yaw) * uRandomRotation + uTime * uSpin * (0.5 + r.w);
        vec2 flipped = corner * vec2(mix(1.0, cos(uTime * (1.5 + r.w * 2.5) + s.x * 6.2832), uFlip), 1.0);
        mvPosition.xy += vec2(flipped.x * cos(angle) - flipped.y * sin(angle), flipped.x * sin(angle) + flipped.y * cos(angle)) * width;
        if (uGround > 0.5) mvPosition.y += 0.35 * width * abs(viewMatrix[1].y);
    }

    float tile = min(floor(r.w * uTileCount), uTileCount - 1.0);
    vec2 cell = vec2(mod(tile, uTiles.x), floor(tile / uTiles.x));
    local = 0.03125 + local * 0.9375;
    vUv = vec2((cell.x + local.x) / uTiles.x, 1.0 - (cell.y + 1.0 - local.y) / uTiles.y);
    vColor = vec4(uColors[int(min(floor(r.y * uColorCount), uColorCount - 1.0))], alpha);
    gl_Position = alpha < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mvPosition;
    vWorldPositionFoW = world;
    #include <fog_vertex>
}
`;

const precipitationFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uLight;
uniform float uGlow;
uniform float uLit;
uniform float uAdditive;
uniform float uDesaturate;
varying vec2 vUv;
varying vec4 vColor;

void main() {
    vec4 texel = texture2D(uMap, vUv);
    float alpha = texel.a * vColor.a;
    if (alpha < 0.004) discard;
    vec3 base = mix(texel.rgb, vec3(max(texel.r, max(texel.g, texel.b))), uDesaturate);
    gl_FragColor = vec4(base * vColor.rgb * mix(vec3(uGlow), uLight, uLit), alpha);
    ${outputTail}
}
`;

const impactVertex = /* glsl */ `
#define FOW_FROM_OFFSET
#define SPLAT_SIZE 0.5
#define SPLAT_LIFE 0.4
#define SPLAT_OPACITY 0.45
#include <common>
#include <fog_pars_vertex>
attribute vec2 corner;
attribute vec4 seed;
${volume}
uniform float uRate;
uniform float uSize;
uniform float uZoomSize;
uniform float uBounce;
uniform float uOpacity;
varying vec2 vUv;
varying float vKind;
varying float vAlpha;
varying float vLife;
varying float vSeed;
varying vec2 vAxisX;
varying vec2 vAxisY;
varying vec2 vAxisZ;

void main() {
    vec4 s = fract(seed + uSeedShift * vec4(0.7311, 0.3173, 0.5939, 0.1377));
    float phase = uTime * uRate * (0.7 + 0.6 * s.w) + s.z * 10.0;
    float cycle = floor(phase);
    float life = fract(phase);
    vec4 r = fract(sin((s + cycle * vec4(0.1731, 0.7193, 0.4111, 0.9137)) * vec4(127.1, 311.7, 74.7, 269.5)) * 43758.5453);
    float level = boxLevel(s.w);
    float size = uBase * exp2(level);
    vec2 xz = mod(r.xy * size - uCenter.xz + 0.5 * size, size) - 0.5 * size + uCenter.xz;

    vec4 shelter = shelterSample(xz);
    float height = shelterHeight(shelter);
    vec2 slope = vec2(shelterHeight(shelterSample(xz + vec2(uTexel, 0.0))), shelterHeight(shelterSample(xz + vec2(0.0, uTexel)))) - height;
    slope /= uTexel;
    float alpha = uOpacity * boundsFade(xz, size) * levelWeight(level) * step(0.5, shelter.a) * step(shelter.b, 0.5);
    alpha *= 1.0 - smoothstep(1.0, 1.6, max(abs(slope.x), abs(slope.y)));

    float scale = exp2(log2(size / uBase) * uZoomSize) * (0.7 + 0.6 * r.z);
    vec3 world = vec3(xz.x, height, xz.y);
    vec4 mvPosition;
    vUv = corner + 0.5;
    vLife = life;
    vSeed = fract(r.z * 3.71 + r.x);
    vAxisX = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xy;
    vAxisY = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xy;
    vAxisZ = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xy;
    if (uBounce > 0.0) {
        float angle = r.z * 6.2832;
        world += vec3(cos(angle), 0.0, sin(angle)) * uBounce * 0.9 * life * (0.3 + r.x);
        world.y += uBounce * (0.4 + r.y) * 4.0 * life * (1.0 - life) + uSize * 0.5;
        mvPosition = viewMatrix * vec4(world, 1.0);
        mvPosition.xy += corner * uSize * scale;
        vKind = 2.0;
        alpha *= 1.0 - smoothstep(0.75, 1.0, life);
    } else {
        vKind = step(0.7, fract(r.z * 7.13));
        world.y += uSize * 0.04;
        if (vKind < 0.5) {
            float spin = r.x * 6.2832;
            vec2 turned = vec2(corner.x * cos(spin) - corner.y * sin(spin), corner.x * sin(spin) + corner.y * cos(spin)) * uSize * scale * mix(0.2, 1.0, sqrt(life));
            world += normalize(vec3(1.0, slope.x, 0.0)) * turned.x + normalize(vec3(0.0, slope.y, 1.0)) * turned.y;
            mvPosition = viewMatrix * vec4(world, 1.0);
            alpha *= pow(1.0 - life, 1.5);
        } else {
            float reach = SPLAT_SIZE * uSize * scale;
            vLife = life / SPLAT_LIFE;
            mvPosition = viewMatrix * vec4(world, 1.0);
            mvPosition.xy += corner * 2.0 * reach;
            mvPosition.z += 2.0 * reach;
            alpha *= SPLAT_OPACITY * smoothstep(0.0, 0.25, vLife) * step(vLife, 1.0) * (1.0 - vLife * vLife);
        }
    }
    vAlpha = alpha;
    gl_Position = alpha < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mvPosition;
    vWorldPositionFoW = world;
    #include <fog_vertex>
}
`;

const impactFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uLight;
uniform vec3 uColor;
uniform float uAdditive;
varying vec2 vUv;
varying float vKind;
varying float vAlpha;
varying float vLife;
varying float vSeed;
varying vec2 vAxisX;
varying vec2 vAxisY;
varying vec2 vAxisZ;

float droplets(vec2 p) {
    float shape = 0.0;
    float size = 0.15 * (1.0 - 0.4 * vLife);
    float tilt = length(vAxisY);
    vec2 up = vAxisY / max(tilt, 1e-3);
    for (int i = 0; i < 5; i++) {
        float n = float(i);
        float angle = vSeed * 6.2832 + n * 1.2566 + 0.5 * sin(vSeed * 37.0 + n * 11.0);
        float reach = 0.3 + 0.3 * fract(vSeed * 13.0 + n * 0.37);
        float rise = 0.35 + 0.35 * fract(vSeed * 29.0 + n * 0.71);
        vec2 centre = (cos(angle) * vAxisX + sin(angle) * vAxisZ) * reach * (0.3 + 0.7 * sqrt(vLife)) + vAxisY * rise * 4.0 * vLife * (1.0 - vLife);
        vec2 offset = p - centre;
        offset -= up * dot(offset, up) * 0.5 * tilt;
        shape += 1.0 - smoothstep(size * 0.3, size, length(offset));
    }
    return min(shape, 1.0);
}

void main() {
    float radius = length(vUv - 0.5) * 2.0;
    float shape = smoothstep(0.55, 0.78, radius) * (1.0 - smoothstep(0.82, 1.0, radius));
    if (vKind > 1.5) shape = 1.0 - smoothstep(0.4, 1.0, radius);
    else if (vKind > 0.5) shape = droplets((vUv - 0.5) * 2.0);
    float alpha = shape * vAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor * uLight, alpha);
    ${outputTail}
}
`;

const heightVertex = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <skinning_pars_vertex>
uniform float uCameraY;
varying float vHeight;

void main() {
    #include <batching_vertex>
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vHeight = uCameraY + mvPosition.z;
}
`;

const heightFragment = /* glsl */ `
uniform vec2 uRange;
uniform float uZone;
varying float vHeight;

void main() {
    float height = clamp((vHeight - uRange.x) / uRange.y, 0.0, 1.0) * 65535.0;
    float high = floor(height / 256.0);
    gl_FragColor = vec4(high / 255.0, (height - high * 256.0) / 255.0, uZone, 1.0);
}
`;

function createParticleMaterial(vertexShader, fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uAdditive: { value: 0 }, ...uniforms },
        vertexShader,
        fragmentShader,
        fog: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
    });
}

export function createPrecipitationMaterial(shared) {
    return createParticleMaterial(precipitationVertex, precipitationFragment, {
        ...shared,
        uMap: { value: null },
        uSeedShift: { value: 0 },
        uOffset: { value: new THREE.Vector3() },
        uVelocity: { value: new THREE.Vector3() },
        uColors: { value: Array.from({ length: 4 }, () => new THREE.Color()) },
        uColorCount: { value: 1 },
        uTiles: { value: new THREE.Vector2(1, 1) },
        uTileCount: { value: 1 },
        uSize: { value: 0 },
        uSizeVariation: { value: 0 },
        uZoomSize: { value: 0.5 },
        uStretch: { value: 0 },
        uSway: { value: 0 },
        uSwayFrequency: { value: 0 },
        uSpin: { value: 0 },
        uRandomRotation: { value: 0 },
        uRotation: { value: 0 },
        uFlip: { value: 0 },
        uTwinkle: { value: 0 },
        uSpeedVariation: { value: 0 },
        uOpacity: { value: 0 },
        uGround: { value: 0 },
        uBand: { value: 0 },
        uLift: { value: 0 },
        uShelter: { value: 0 },
        uLit: { value: 1 },
        uDesaturate: { value: 0 },
    });
}

export function createImpactMaterial(shared) {
    const material = createParticleMaterial(impactVertex, impactFragment, {
        ...shared,
        uSeedShift: { value: 0 },
        uColor: { value: new THREE.Color(0xdfe8f0) },
        uRate: { value: 2.2 },
        uSize: { value: 0 },
        uZoomSize: { value: 0.5 },
        uBounce: { value: 0 },
        uOpacity: { value: 0 },
        uTexel: { value: 0.01 },
    });
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    return material;
}

export function createHeightMaterial(zone = 0) {
    return new THREE.ShaderMaterial({
        uniforms: { uCameraY: { value: 0 }, uRange: { value: new THREE.Vector2(0, 1) }, uZone: { value: zone } },
        vertexShader: heightVertex,
        fragmentShader: heightFragment,
        side: THREE.DoubleSide,
    });
}
