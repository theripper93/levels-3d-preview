import * as THREE from "three";
import { frame } from "../render/frame.js";
import { DisplayReferredColor } from "../render/outputPass.js";
import { OUTLINE_LAYER, OUTLINE_ORDER, createOutlineMaterials, createProxy, isOutlineSource } from "../render/outlineShell.js";

const DISPLAY_LIMIT = 0.97;
const FILL_DEPTH = -0.99998;
const FILL_ALPHA = 0.22;
const RING_ALPHA = 0.7;
const GHOST_OPACITY = 0.3;

const RIM_LAYERS = {
    outline: [
        { width: 2, opacity: 1, boost: 1.15 },
        { width: 3.5, opacity: 0.35, boost: 1 },
        { width: 5, opacity: 0.12, boost: 1 },
    ],
    glow: [
        { width: 2, opacity: 1, boost: 1.3 },
        { width: 4.5, opacity: 0.45, boost: 1.15 },
        { width: 8, opacity: 0.18, boost: 1 },
    ],
};

const fillVertexShader = `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform vec2 outlineResolution;
uniform float outlineDepth;
uniform vec3 outlineCenter;
uniform float outlineRadius;
varying vec3 vDetectClip;
varying vec3 vDetectCenter;

void main() {
    #include <morphinstance_vertex>
    #include <batching_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinbase_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vec4 center = projectionMatrix * viewMatrix * vec4(outlineCenter, 1.0);
    float w = max(center.w, 1e-4);
    vDetectCenter = vec3(center.xy / w, outlineRadius * projectionMatrix[1][1] / w * outlineResolution.y * 0.5);
    vDetectClip = gl_Position.xyw;
    gl_Position.z = outlineDepth * gl_Position.w;
}
`;

const fillFragmentShader = `
uniform vec3 outlineColor;
uniform vec3 detectRingColor;
uniform float outlineOpacity;
uniform vec2 outlineResolution;
uniform float detectWave;
uniform float detectTime;
varying vec3 vDetectClip;
varying vec3 vDetectCenter;

void main() {
    vec2 ndc = vDetectClip.xy / vDetectClip.z;
    float d = length((ndc - vDetectCenter.xy) * outlineResolution * 0.5) / max(vDetectCenter.z, 1.0);
    float ring = detectWave * smoothstep(0.6, 1.0, 0.5 + 0.5 * cos(d * 28.0 - detectTime * 5.0));
    gl_FragColor = vec4(mix(outlineColor, detectRingColor, ring), mix(outlineOpacity, RING_ALPHA, ring));
}
`;

const GHOST_GLOW = 0.12;
const GHOST_CHUNK = "#include <alphamap_fragment>\nfloat l3dGhostLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(l3dGhostLum) * vec3(0.85, 1.0, 1.1), 0.5) * 0.55;";
const GHOST_GLOW_CHUNK = `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${GHOST_GLOW.toFixed(3)};`;

function createFillMaterial(resolution) {
    const material = new THREE.ShaderMaterial({
        vertexShader: fillVertexShader,
        fragmentShader: fillFragmentShader.replace("RING_ALPHA", RING_ALPHA.toFixed(3)),
        uniforms: {
            outlineResolution: resolution,
            outlineDepth: { value: FILL_DEPTH },
            outlineCenter: { value: new THREE.Vector3() },
            outlineRadius: { value: 1 },
            outlineColor: { value: new THREE.Color() },
            detectRingColor: { value: new THREE.Color() },
            outlineOpacity: { value: FILL_ALPHA },
            detectWave: { value: 0 },
            detectTime: { value: 0 },
        },
        transparent: true,
        premultipliedAlpha: true,
        forceSinglePass: true,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: true,
        depthFunc: THREE.GreaterDepth,
        fog: false,
        lights: false,
        toneMapped: false,
    });
    Object.defineProperty(material, "onBeforeCompile", { value: () => {}, writable: true, configurable: true });
    return material;
}

function createGhostMaterial(material) {
    if (!material) return material;
    const ghost = material.clone();
    const base = material._userOnBeforeCompile;
    const key = material.customProgramCacheKey();
    ghost.onBeforeCompile = function (shader, renderer) {
        base?.call(this, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace("#include <alphamap_fragment>", GHOST_CHUNK).replace("#include <emissivemap_fragment>", GHOST_GLOW_CHUNK);
    };
    ghost.customProgramCacheKey = () => `${key}|l3dGhost`;
    ghost.transparent = true;
    ghost.opacity = material.opacity * GHOST_OPACITY;
    ghost.alphaTest = 0;
    ghost.depthWrite = false;
    return ghost;
}

function styleFromFilter(filter) {
    const uniforms = filter.uniforms ?? {};
    const glow = !!uniforms.glowColor && !uniforms.outlineColor;
    const rgb = uniforms.outlineColor ?? uniforms.glowColor ?? [1, 1, 1];
    return {
        kind: glow ? "glow" : "outline",
        color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
        knockout: !glow && uniforms.knockout !== false,
        wave: !glow && !!uniforms.wave,
        set: glow ? "glow" : uniforms.wave ? "wave" : "steady",
    };
}

export class DetectionLook {
    constructor(parent) {
        this.parent = parent;
        this.resolution = { value: new THREE.Vector2(1, 1) };
        this.styles = new WeakMap();
        this.sets = {};
        this.entries = new Map();
        this.ghostCache = new Map();
        this.root = new THREE.Group();
        this.root.matrixAutoUpdate = false;
        this.root.matrixWorldAutoUpdate = false;
        this.root.renderOrder = OUTLINE_ORDER;
        this.root.layers.set(OUTLINE_LAYER);
        this.displayColor = new DisplayReferredColor();
        this.scratchColor = new THREE.Color();
        this.exposure = { toneMappingExposure: 1 };
        this.time = 0;
    }

    styleFor(filter) {
        let style = this.styles.get(filter);
        if (!style) this.styles.set(filter, (style = styleFromFilter(filter)));
        return style;
    }

    getSet(name) {
        if (this.sets[name]) return this.sets[name];
        const layers = RIM_LAYERS[name === "glow" ? "glow" : "outline"];
        const materials = createOutlineMaterials(this.resolution, layers);
        const fill = name === "glow" ? null : createFillMaterial(this.resolution);
        if (fill) fill.uniforms.detectWave.value = name === "wave" ? 1 : 0;
        return (this.sets[name] = { name, layers, materials, fill });
    }

    sync(token3d, filter, invisible) {
        const model = token3d.model;
        if (!model) return;
        const style = filter ? this.styleFor(filter) : null;
        const knockout = !!style?.knockout;
        const ghost = !knockout && (invisible || style?.kind === "glow");
        const current = this.entries.get(token3d);
        if (current && current.style === style && current.knockout === knockout && current.ghost === ghost) return;
        if (current) this.release(token3d);
        if (!style && !ghost) return;
        const entry = { token3d, model, style, knockout, ghost, items: [], ghosts: [], colors: [] };
        if (style) this.addProxies(entry);
        if (knockout) model.visible = false;
        token3d._detectedKnockout = knockout;
        if (ghost) this.applyGhost(entry);
        this.entries.set(token3d, entry);
        this.parent.camera.layers.enable(OUTLINE_LAYER);
        this.warm(entry);
    }

    warm(entry) {
        const warmup = this.parent.lightWarmup;
        if (!warmup) return;
        if (entry.ghost) warmup.warmObject(entry.model);
        if (!entry.items.length) return;
        if (this.root.parent !== this.parent.scene) this.parent.scene.add(this.root);
        warmup.warmObject(this.root);
    }

    addProxies(entry) {
        const set = this.getSet(entry.style.set);
        entry.set = set;
        entry.colors = set.layers.map(() => new THREE.Color());
        entry.fillColor = new THREE.Color();
        entry.ringColor = new THREE.Color();
        const materials = [...set.materials];
        const colors = [null, ...entry.colors];
        if (entry.knockout && set.fill) {
            materials.push(set.fill);
            colors.push(entry.fillColor);
        }
        entry.model.traverse((source) => {
            if (!isOutlineSource(source)) return;
            const proxies = materials.map((material, index) => this.createProxy(source, material, OUTLINE_ORDER + index, colors[index], entry.ringColor));
            entry.items.push({ source, proxies });
            this.root.add(...proxies);
        });
    }

    createProxy(source, material, renderOrder, color, ringColor) {
        const proxy = createProxy(source, material, renderOrder, color);
        if (material.uniforms.outlineRadius) {
            const render = proxy.onBeforeRender;
            const radius = source.geometry.boundingSphere.radius;
            proxy.onBeforeRender = (...args) => {
                render(...args);
                material.uniforms.outlineRadius.value = radius * source.matrixWorld.getMaxScaleOnAxis();
                material.uniforms.detectRingColor.value.copy(ringColor);
            };
        }
        return proxy;
    }

    applyGhost(entry) {
        entry.model.traverse((mesh) => {
            if (!mesh.isMesh || mesh.userData?.noOutline) return;
            const original = mesh.material;
            const ghost = Array.isArray(original) ? original.map((material) => this.ghostFor(material)) : this.ghostFor(original);
            entry.ghosts.push({ mesh, original, ghost, castShadow: mesh.castShadow });
            mesh.material = ghost;
            mesh.castShadow = false;
        });
        entry.token3d._ghostLook = true;
    }

    ghostFor(material) {
        if (!material) return material;
        const cached = this.ghostCache.get(material);
        if (!cached) {
            const ghost = createGhostMaterial(material);
            this.ghostCache.set(material, { ghost });
            return ghost;
        }
        cached.ghost.map = material.map;
        if (material.color) cached.ghost.color?.copy(material.color);
        cached.ghost.opacity = material.opacity * GHOST_OPACITY;
        return cached.ghost;
    }

    removeGhost(entry) {
        for (const { mesh, original, ghost, castShadow } of entry.ghosts) {
            if (mesh.material === ghost) mesh.material = original;
            mesh.castShadow = castShadow;
        }
        entry.ghosts.length = 0;
        entry.token3d._ghostLook = false;
        entry.token3d._hidden = undefined;
        if (entry.token3d.model) entry.token3d.updateHiden();
    }

    release(token3d) {
        const entry = this.entries.get(token3d);
        if (!entry) return;
        this.entries.delete(token3d);
        for (const item of entry.items) for (const proxy of item.proxies) proxy.removeFromParent();
        if (entry.knockout) entry.model.visible = true;
        token3d._detectedKnockout = false;
        if (entry.ghost) this.removeGhost(entry);
    }

    update() {
        if (!this.entries.size) {
            if (this.root.parent) this.root.removeFromParent();
            return;
        }
        const scene = this.parent.scene;
        if (this.root.parent !== scene) scene.add(this.root);
        this.parent.renderer.getDrawingBufferSize(this.resolution.value);
        if (!canvas.photosensitiveMode) this.time = performance.now() / 1000;
        this.animateSets();
        const mask = this.parent.camera.layers.mask;
        for (const entry of this.entries.values()) {
            if (!entry.items.length) continue;
            const shown = isShownIn(entry.token3d.mesh, scene);
            if (shown) this.updateColors(entry);
            for (const { source, proxies } of entry.items) {
                const visible = shown && (source.layers.mask & mask) !== 0 && isShownWithin(source, entry.model);
                for (const proxy of proxies) proxy.visible = visible;
            }
        }
    }

    animateSets() {
        const time = canvas.photosensitiveMode ? 0 : this.time;
        for (const set of Object.values(this.sets)) {
            const width = set.name === "wave" ? 1 + 0.25 * Math.sin((time * Math.PI * 2) / 1.5) : 1;
            const strength = set.name === "glow" ? 1.25 + 0.75 * Math.sin(time * Math.PI) : 1;
            set.layers.forEach((layer, index) => {
                const uniforms = set.materials[index + 1].uniforms;
                uniforms.outlineWidth.value = layer.width * width;
                uniforms.outlineOpacity.value = Math.min(layer.opacity * strength, 1);
            });
            if (set.fill) set.fill.uniforms.detectTime.value = time;
        }
    }

    updateColors(entry) {
        const color = entry.style.color;
        entry.set.layers.forEach((layer, index) => this.toSceneColor(this.scratchColor.copy(color).multiplyScalar(layer.boost), entry.colors[index]));
        this.toSceneColor(this.scratchColor.copy(color).multiplyScalar(FILL_ALPHA), entry.fillColor);
        this.toSceneColor(this.scratchColor.copy(color).multiplyScalar(RING_ALPHA), entry.ringColor);
    }

    toSceneColor(display, target) {
        display.r = Math.min(display.r, DISPLAY_LIMIT);
        display.g = Math.min(display.g, DISPLAY_LIMIT);
        display.b = Math.min(display.b, DISPLAY_LIMIT);
        display.convertSRGBToLinear();
        this.exposure.toneMappingExposure = frame.exposure;
        this.displayColor.wrap(display, this.exposure).getRGB(target);
    }

    destroy() {
        for (const token3d of [...this.entries.keys()]) this.release(token3d);
        this.root.removeFromParent();
        for (const set of Object.values(this.sets)) for (const material of [...set.materials, set.fill]) material?.dispose();
        for (const { ghost } of this.ghostCache.values()) ghost.dispose();
        this.ghostCache.clear();
        this.sets = {};
    }
}

function isShownIn(object, scene) {
    let current = object;
    while (current) {
        if (!current.visible) return false;
        if (current === scene) return true;
        current = current.parent;
    }
    return false;
}

function isShownWithin(object, root) {
    let current = object;
    while (current && current !== root) {
        if (!current.visible) return false;
        current = current.parent;
    }
    return current === root;
}
