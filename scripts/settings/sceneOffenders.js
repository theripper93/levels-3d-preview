import * as THREE from "three";
import { factor } from "../main.js";

export const CPU_WEIGHTS = {
    drawCall: 1,
    transparentDraw: 0.5,
    object: 0.05,
    skinnedMesh: 8,
    bone: 0.1,
    mixer: 5,
};

export const GPU_WEIGHTS = {
    kTriangles: 0.05,
    textureMB: 0.1,
    shading: 30,
    lightPerMesh: 0.25,
};

const SHADER_COST = {
    physical: 1.5,
    standard: 1,
    simple: 0.7,
    basic: 0.4,
    transmission: 2,
    clearcoat: 0.5,
    doubleSide: 0.2,
    transparent: 2,
};

const SHADOW_FACES = { point: 6, spot: 1, directional: 1 };
const OVERDRAW_COVERAGE = 0.05;
const MANY_OBJECTS = 50;
const NOT_INSTANCED_MIN = 3;

const L = (key, data) => (data ? game.i18n.format(`levels3dpreview.performance.report.${key}`, data) : game.i18n.localize(`levels3dpreview.performance.report.${key}`));

export function formatNumber(n) {
    return new Intl.NumberFormat(game.i18n.lang, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function collect(object, entity, top, meshes, lights) {
    if (!object.visible) return;
    const owner = object.userData?.entity3D ?? entity;
    if (object.isLight && object.castShadow && object.shadow?.autoUpdate) lights.push({ light: object, entity: owner });
    if (object.isMesh && object.geometry?.attributes?.position && object.count !== 0) meshes.push({ mesh: object, entity: owner, top });
    for (const child of object.children) collect(child, owner, top ?? child, meshes, lights);
}

function getSystemNames(l3d) {
    const names = new Map();
    for (const [key, value] of Object.entries(l3d)) {
        if (!value || typeof value !== "object") continue;
        if (value.isObject3D) names.set(value, key);
        else for (const inner of Object.values(value)) if (inner?.isObject3D && !names.has(inner)) names.set(inner, key);
    }
    return names;
}

function getSphere(mesh) {
    const target = mesh.isInstancedMesh || mesh.isBatchedMesh ? mesh : mesh.geometry;
    if (!target.boundingSphere) target.computeBoundingSphere();
    const sphere = target.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
    if (!Number.isFinite(sphere.radius)) sphere.radius = 0;
    return sphere;
}

function getCoverage(mesh, sphere, sceneRadius) {
    if (!mesh.isInstancedMesh) return Math.min(1, (sphere.radius / sceneRadius) ** 2);
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const radius = mesh.geometry.boundingSphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
    const matrix = new THREE.Matrix4();
    let area = 0;
    for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        area += ((radius * matrix.getMaxScaleOnAxis()) / sceneRadius) ** 2;
    }
    return Math.min(1, area || 0);
}

function isLit(material) {
    return !(material.isMeshBasicMaterial || material.isSpriteMaterial || material.isPointsMaterial || material.isLineBasicMaterial || (material.isShaderMaterial && !material.lights));
}

function getMaterials(mesh) {
    return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);
}

function getTriangles(mesh) {
    const geometry = mesh.geometry;
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    return (count / 3) * (mesh.isInstancedMesh ? mesh.count : 1);
}

function shaderFactor(material) {
    let f = material.isMeshPhysicalMaterial ? SHADER_COST.physical : material.isMeshStandardMaterial || material.isShaderMaterial ? SHADER_COST.standard : material.isMeshLambertMaterial || material.isMeshPhongMaterial || material.isMeshToonMaterial ? SHADER_COST.simple : SHADER_COST.basic;
    if (material.transmission > 0) f += SHADER_COST.transmission;
    if (material.clearcoat > 0) f += SHADER_COST.clearcoat;
    if (material.side === THREE.DoubleSide) f += SHADER_COST.doubleSide;
    if (material.transparent) f *= SHADER_COST.transparent;
    return f;
}

function addTextures(material, textures) {
    const values = [...Object.values(material), ...Object.values(material.uniforms ?? {}).map((u) => u?.value)];
    for (const value of values) {
        if (!value?.isTexture || textures.has(value.uuid)) continue;
        const image = value.image ?? value.source?.data;
        const width = image?.videoWidth || image?.width || 0;
        const height = image?.videoHeight || image?.height || 0;
        textures.set(value.uuid, width * height * 4 * (value.generateMipmaps === false ? 1 : 1.33));
    }
}

function lightType(light) {
    return light.isPointLight ? "point" : light.isSpotLight ? "spot" : "directional";
}

function inRange(light, sphere) {
    if (light.isDirectionalLight) return true;
    const far = light.shadow.camera.far || light.distance || Infinity;
    return light.getWorldPosition(new THREE.Vector3()).distanceTo(sphere.center) <= far + sphere.radius;
}

function getAsset(entity) {
    if (entity.tile) return entity.gtflPath || entity.tile.document.texture?.src || entity.dynaMesh || "";
    if (entity.token) return entity.gtflPath || entity.token.document.texture?.src || "";
    return entity.embeddedName ?? entity.constructor?.name ?? "";
}

function getLabel(entity, asset) {
    const placeable = entity.placeable ?? entity.region;
    const name = placeable?.document?.name || asset.split("/").pop() || placeable?.document?.id;
    return `${placeable?.document?.documentName ?? ""}: ${name}`;
}

function getPlaceable(entity) {
    return entity?.placeable ?? entity?.region ?? null;
}

function newRecord(key, entity, label, asset) {
    return { key, entity, label, asset, cpu: 0, gpu: 0, draws: 0, maxPasses: 1, materials: new Set(), objects: 0, skinned: 0, bones: 0, transparent: 0, triangles: 0, triPasses: 0, textures: new Map(), physical: 0, transmission: 0, overdraw: 0, lit: 0, coverage: 0, shadowDraws: 0, shadowFaces: 0 };
}

export function analyzeOffenders() {
    const l3d = game.Levels3DPreview;
    const meshes = [];
    const shadowLights = [];
    collect(l3d.scene, null, null, meshes, shadowLights);
    const vsm = l3d.renderer.shadowMap.type === THREE.VSMShadowMap;
    const sceneRect = canvas.dimensions.sceneRect;
    const sceneRadius = Math.max(Math.hypot(sceneRect.width, sceneRect.height) / factor / 2, 0.001);
    const pointLights = [];
    l3d.scene.traverseVisible((o) => {
        if ((o.isPointLight || o.isSpotLight) && o.intensity > 0) pointLights.push(o);
    });

    const systemNames = getSystemNames(l3d);
    const records = new Map();
    const lightRecords = new Map();
    const getRecord = (entity, top) => {
        const key = entity ?? top;
        if (!records.has(key)) {
            const asset = entity ? getAsset(entity) : "";
            records.set(key, newRecord(key, entity, entity ? getLabel(entity, asset) : L("other", { name: systemNames.get(top) || top.name || top.constructor.name }), asset));
        }
        return records.get(key);
    };
    for (const { light, entity } of shadowLights) {
        const label = light.isDirectionalLight ? L("sunShadow") : entity ? getLabel(entity, "") : L("lightShadow");
        lightRecords.set(light, newRecord(light, light.isDirectionalLight ? null : entity, label, light.isDirectionalLight ? L("sunShadow") : L("lightShadow")));
    }

    for (const { mesh, entity, top } of meshes) {
        const record = getRecord(entity, top);
        const materials = getMaterials(mesh);
        const draws = materials.length;
        const sphere = getSphere(mesh);
        const triangles = getTriangles(mesh);
        const inShadow = mesh.castShadow || (mesh.receiveShadow && vsm);
        const batched = l3d.shadowBatcher?.isBatched(mesh);
        let passes = 1;
        let cpuPasses = 1;
        if (inShadow) {
            for (const { light } of shadowLights) {
                if (!inRange(light, sphere)) continue;
                const faces = SHADOW_FACES[lightType(light)];
                const merged = batched && light.isDirectionalLight;
                passes += faces;
                if (!merged) cpuPasses += faces;
                const lightRecord = lightRecords.get(light);
                if (!merged) lightRecord.shadowDraws += draws;
                lightRecord.shadowFaces = faces;
                lightRecord.triangles += triangles;
                if (!merged) lightRecord.cpu += draws * faces * CPU_WEIGHTS.drawCall;
                lightRecord.gpu += ((triangles * faces) / 1000) * GPU_WEIGHTS.kTriangles;
            }
        }
        const lit = pointLights.filter((light) => inRange(light, sphere)).length;
        const coverage = getCoverage(mesh, sphere, sceneRadius);
        const transparentDraws = materials.filter((m) => m.transparent).length;

        record.draws += draws;
        record.maxPasses = Math.max(record.maxPasses, passes);
        record.transparent += transparentDraws;
        record.triangles += triangles;
        record.triPasses += triangles * passes;
        if (materials.some(isLit)) record.lit = Math.max(record.lit, lit);
        record.coverage = Math.max(record.coverage, coverage);
        if (mesh.isSkinnedMesh) {
            record.skinned++;
            record.bones += mesh.skeleton?.bones.length ?? 0;
        }
        record.cpu += draws * cpuPasses * CPU_WEIGHTS.drawCall + transparentDraws * CPU_WEIGHTS.transparentDraw;
        record.gpu += ((triangles * passes) / 1000) * GPU_WEIGHTS.kTriangles;
        for (const material of materials) {
            record.materials.add(material.uuid);
            addTextures(material, record.textures);
            if (material.isMeshPhysicalMaterial) record.physical++;
            if (material.transmission > 0) record.transmission++;
            if (material.transparent && coverage > OVERDRAW_COVERAGE) record.overdraw++;
            const lightFactor = isLit(material) ? 1 + lit * GPU_WEIGHTS.lightPerMesh : 1;
            record.gpu += (coverage * shaderFactor(material) * lightFactor * GPU_WEIGHTS.shading) / materials.length;
        }
    }

    const sunRecord = [...lightRecords.values()].find((r) => r.key.isDirectionalLight);
    const batchDraws = l3d.shadowBatcher?.enabled ? l3d.shadowBatcher.drawCount : 0;
    if (sunRecord && batchDraws) {
        sunRecord.shadowDraws += batchDraws;
        sunRecord.shadowFaces = SHADOW_FACES.directional;
        sunRecord.cpu += batchDraws * CPU_WEIGHTS.drawCall;
    }

    for (const record of records.values()) {
        const root = record.entity?.mesh ?? (record.entity?.isObject3D ? record.entity : null);
        root?.traverseVisible((o) => {
            if (o.matrixAutoUpdate) record.objects++;
        });
        record.cpu += record.objects * CPU_WEIGHTS.object + record.skinned * CPU_WEIGHTS.skinnedMesh + record.bones * CPU_WEIGHTS.bone + (record.entity?.mixer ? CPU_WEIGHTS.mixer : 0);
        record.textureBytes = sumBytes(record.textures);
        record.gpu += (record.textureBytes / 1048576) * GPU_WEIGHTS.textureMB;
    }

    const offenders = [...records.values()].filter((r) => r.entity);
    const others = [...records.values()].filter((r) => !r.entity);
    const totalCpu = [...records.values()].reduce((a, r) => a + r.cpu, 0) || 1;
    const totalGpu = [...records.values()].reduce((a, r) => a + r.gpu, 0) || 1;
    const all = [...offenders, ...others, ...[...lightRecords.values()].filter((r) => r.shadowDraws)];
    for (const r of all) {
        r.cpuShare = r.cpu / totalCpu;
        r.gpuShare = r.gpu / totalGpu;
        r.cpuReasons = cpuReasons(r);
        r.gpuReasons = gpuReasons(r);
        r.placeable = getPlaceable(r.entity);
    }

    const groups = new Map();
    for (const r of offenders) {
        const key = `${r.entity.embeddedName ?? r.entity.constructor?.name}|${r.asset}`;
        if (!groups.has(key)) groups.set(key, { key, asset: r.asset || r.label, type: r.entity.embeddedName ?? "", records: [], cpu: 0, gpu: 0, textures: new Map(), instanced: 0, isModel: false });
        const group = groups.get(key);
        group.records.push(r);
        group.cpu += r.cpu;
        group.gpu += r.gpu - (r.textureBytes / 1048576) * GPU_WEIGHTS.textureMB;
        for (const [uuid, bytes] of r.textures) group.textures.set(uuid, bytes);
        if (r.entity.tile && r.entity.gtflPath) group.isModel = true;
        if (r.entity.mergedMatrix) group.instanced++;
    }
    for (const group of groups.values()) {
        group.textureBytes = sumBytes(group.textures);
        group.gpu += (group.textureBytes / 1048576) * GPU_WEIGHTS.textureMB;
        group.count = group.records.length;
        group.cpuShare = group.cpu / totalCpu;
        group.gpuShare = group.gpu / totalGpu;
        const notInstanced = group.isModel ? group.count - group.instanced : 0;
        group.notes = [notInstanced >= NOT_INSTANCED_MIN ? L("notInstanced", { count: notInstanced }) : "", group.textureBytes > 1048576 ? L("gpu.textures", { mb: formatNumber(group.textureBytes / 1048576) }) : ""].filter(Boolean).join(" · ");
        group.records.sort((a, b) => b.cpu + b.gpu - (a.cpu + a.gpu));
    }

    return { offenders: all, groups: [...groups.values()], totalCpu, totalGpu };
}

function sumBytes(textures) {
    let total = 0;
    for (const bytes of textures.values()) total += bytes;
    return total;
}

function cpuReasons(r) {
    if (r.shadowFaces) return [L("cpu.shadowLight", { faces: r.shadowFaces, draws: formatNumber(r.shadowDraws) })];
    const reasons = [L("cpu.drawCalls", { count: formatNumber(r.draws) })];
    if (r.maxPasses > 1) reasons.push(L("cpu.passes", { count: r.maxPasses }));
    if (r.materials.size > 1) reasons.push(L("cpu.materials", { count: r.materials.size }));
    if (r.entity?.mixer) reasons.push(L("cpu.animated"));
    if (r.skinned) reasons.push(L("cpu.skinned", { count: r.skinned, bones: r.bones }));
    if (r.objects > MANY_OBJECTS) reasons.push(L("cpu.objects", { count: formatNumber(r.objects) }));
    if (r.transparent) reasons.push(L("cpu.transparent", { count: r.transparent }));
    return reasons;
}

function gpuReasons(r) {
    if (r.shadowFaces) return [L("gpu.triangles", { count: formatNumber(r.triangles * r.shadowFaces) })];
    const reasons = [L("gpu.triangles", { count: formatNumber(r.triangles) })];
    if (r.maxPasses > 1) reasons.push(L("gpu.trianglePasses", { count: formatNumber(r.triPasses) }));
    if (r.textureBytes > 1048576) reasons.push(L("gpu.textures", { mb: formatNumber(r.textureBytes / 1048576) }));
    if (r.coverage > OVERDRAW_COVERAGE) reasons.push(L("gpu.coverage", { percent: Math.round(r.coverage * 100) }));
    if (r.transmission) reasons.push(L("gpu.transmission"));
    else if (r.physical) reasons.push(L("gpu.physical"));
    if (r.overdraw) reasons.push(L("gpu.overdraw"));
    if (r.lit) reasons.push(L("gpu.lights", { count: r.lit }));
    return reasons;
}

export function jumpToEntity(entity) {
    if (!entity) return;
    const placeable = getPlaceable(entity);
    if (placeable?.layer && placeable.document?.canUserModify(game.user, "update")) {
        if (!placeable.layer.active) placeable.layer.activate();
        placeable.control({ releaseOthers: true });
    }
    const box = new THREE.Box3().setFromObject(entity.mesh ?? entity);
    if (box.isEmpty()) return;
    const l3d = game.Levels3DPreview;
    const center = box.getCenter(new THREE.Vector3());
    const distance = Math.max(box.getSize(new THREE.Vector3()).length() * 1.5, 0.5);
    const direction = l3d.camera.position.clone().sub(l3d.controls.target).normalize();
    l3d.helpers.socketCamera({ cameraLookat: center, cameraPosition: center.clone().addScaledVector(direction, distance) });
}
