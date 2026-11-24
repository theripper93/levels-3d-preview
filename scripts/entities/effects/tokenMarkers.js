import * as THREE from "three";
import { decalMaterial, markerMesh, decalPlaneGeometry, glowMaterial, markerOutlineMaterial, gridUnit, markerTime, tickMarkers } from "./markerDecals.js";

const COMBAT_PAD = 1.7;

const COMBAT_BODY = `
float r = 1.0 / ${COMBAT_PAD.toFixed(2)};
float d = length(p) - r;
float pulse = 0.9 + 0.1 * sin(uTime * 2.0);
float outer = exp(-max(d, 0.0) * 7.0) * smoothstep(1.0, 0.75, length(p));
float inner = smoothstep(-r, 0.0, d) * 0.5;
float glow = max(outer * step(0.0, d), inner * step(d, 0.0)) * 0.75 * pulse;
float ring = band(d, 0.014 * k, aa);
outColor = over(vec4(uColor * 1.3, glow), outColor);
outColor = over(vec4(mix(uColor, vec3(1.0), 0.35) * 1.6, ring), outColor);
`;

export function syncCombatHighlight(token3d, show) {
    if (!show || !token3d.mesh) {
        token3d.combatHighlight?.removeFromParent();
        return;
    }
    const size = Math.max(token3d.baseDocumentWidth, token3d.baseDocumentHeight);
    const material = decalMaterial(`combat|${token3d.combatColor.getHexString()}|${size}`, COMBAT_BODY, { uColor: { value: token3d.combatColor.clone() }, uSize: { value: size } });
    token3d.combatHighlight ??= markerMesh(decalPlaneGeometry, material);
    const highlight = token3d.combatHighlight;
    highlight.material = material;
    const scale = size * gridUnit() * COMBAT_PAD;
    highlight.scale.set(scale, 1, scale);
    highlight.position.y = 0.0015;
    if (highlight.parent !== token3d.mesh) token3d.mesh.add(highlight);
}

const chevronGeometry = (() => {
    const shape = new THREE.Shape();
    shape.moveTo(-1, 0.6);
    shape.lineTo(0, -0.4);
    shape.lineTo(1, 0.6);
    shape.lineTo(1, 1.1);
    shape.lineTo(0, 0.1);
    shape.lineTo(-1, 1.1);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
    geometry.center();
    return geometry;
})();

const worldPosition = new THREE.Vector3();

export function drawTargetChevrons(container, colors, top, parentRotation) {
    container.clear();
    if (!colors.length) return;
    const size = gridUnit() * 0.13;
    const baseY = top + size * 0.9;
    colors.forEach((color, i) => {
        const chevron = markerMesh(chevronGeometry, glowMaterial(color), 7);
        chevron.scale.set(size, size, size * 0.6);
        chevron.position.y = i * size * 1.25;
        const hull = markerMesh(chevronGeometry, markerOutlineMaterial, 6);
        hull.onBeforeRender = () => {};
        hull.scale.setScalar(1.18);
        chevron.add(hull);
        container.add(chevron);
    });
    container.position.y = baseY;
    container.children[0].onBeforeRender = (renderer, scene, camera) => {
        tickMarkers();
        container.getWorldPosition(worldPosition);
        container.rotation.y = Math.atan2(camera.position.x - worldPosition.x, camera.position.z - worldPosition.z) - parentRotation.y;
        container.position.y = baseY + Math.sin(markerTime.value * 2.2) * size * 0.25;
    };
}
