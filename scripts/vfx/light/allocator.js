import { Group, Vector3 } from "three";
import { ParticleEngine } from "../engine.js";
import { getQuality } from "../quality.js";
import { ProjectedDecal } from "../render/decal.js";
import { capabilities } from "../render/effectsPass.js";

const NEW_LIGHT_BOOST = 2;
const NEW_LIGHT_WINDOW = 0.3;
const HOLD_BIAS = 1.3;
const CROSSFADE = 0.4;

const requests = new Set();
const ranked = [];
const glowLayer = new Group();
const cameraPosition = new Vector3();
const worldPosition = new Vector3();
let lastFrame = -1;

function byScore(a, b) {
    return b.score - a.score;
}

function isNew(request) {
    return request.age < NEW_LIGHT_WINDOW;
}

function scoreOf(request) {
    request.anchor.getWorldPosition(worldPosition);
    const newest = 1 + NEW_LIGHT_BOOST * Math.max(0, 1 - request.age / NEW_LIGHT_WINDOW);
    const held = request.light ? HOLD_BIAS : 1;
    return (request.value * request.distance * newest * held) / (0.25 + worldPosition.distanceTo(cameraPosition));
}

function grant(request) {
    const light = ParticleEngine.createLight();
    if (!light) return;
    light.color.copy(request.color);
    light.distance = request.distance;
    light.decay = request.decay;
    light.position.set(0, 0, 0);
    request.weight = isNew(request) ? 1 : 0;
    light.intensity = request.value * request.weight;
    request.anchor.add(light);
    request.light = light;
}

function revoke(request) {
    request.weight = 0;
    if (!request.light) return;
    ParticleEngine.releaseLight(request.light);
    request.light = null;
}

function stealFor(request) {
    if (!isNew(request)) return;
    let victim = null;
    for (const other of requests) if (other.light && !other.wanted && (!victim || other.weight < victim.weight)) victim = other;
    if (victim) revoke(victim);
}

export function registerEffectLight(request) {
    request.weight = 0;
    request.wanted = false;
    requests.add(request);
    lastFrame = -1;
}

export function unregisterEffectLight(request) {
    requests.delete(request);
    revoke(request);
    request.decal?.dispose();
    request.decal = null;
}

export function allocateEffectLights() {
    const L = game.Levels3DPreview;
    const frame = L.renderer.info.render.frame;
    if (frame === lastFrame) return;
    lastFrame = frame;
    cameraPosition.copy(L.camera.position);
    ranked.length = 0;
    for (const request of requests) {
        if (request.light && request.light.parent !== request.anchor) {
            request.light = null;
            request.weight = 0;
        }
        request.score = request.value > 0 ? scoreOf(request) : 0;
        ranked.push(request);
    }
    ranked.sort(byScore);
    const slots = getQuality().maxEffectLights;
    ranked.forEach((request, index) => (request.wanted = index < slots && request.score > 0));
    for (const request of ranked) {
        if (!request.wanted || request.light) continue;
        grant(request);
        if (request.light) continue;
        stealFor(request);
        grant(request);
    }
}

export function fadeEffectLight(request, delta) {
    if (!request.light) return;
    const step = delta / CROSSFADE;
    request.weight = request.wanted ? Math.min(1, request.weight + step) : Math.max(0, request.weight - step);
    if (request.weight <= 0 && !request.wanted) return revoke(request);
    request.light.intensity = request.value * request.weight;
}

export function updateGlow(request) {
    const weight = request.light ? request.weight : 0;
    if (weight >= 1 || !request.glow || !capabilities.decals || request.value <= 0) {
        if (request.decal) request.decal.visible = false;
        return;
    }
    if (!request.decal) {
        const size = request.distance * 0.6;
        request.decal = new ProjectedDecal({ size, depth: size, color: request.color, opacity: 0, falloff: 1.6 });
        glowLayer.add(request.decal);
    }
    const scene = game.Levels3DPreview.scene;
    if (glowLayer.parent !== scene) scene.add(glowLayer);
    request.decal.visible = true;
    request.anchor.getWorldPosition(request.decal.position);
    request.decal.opacity = Math.min(1.2, (request.value / Math.max(request.intensity, 0.0001)) * 0.9) * (1 - weight);
}
