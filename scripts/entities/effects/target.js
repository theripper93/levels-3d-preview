import {mergeBufferGeometries} from "../../lib/BufferGeometryUtils.js"
import * as THREE from "../../lib/three.module.js"

const CONE_RADIUS = 0.5
const CONE_HEIGHT = 1.8
const CONE_RADIAL_SEGMENTS = 8
const SPOKE_SIZE = 0.01
const BASE_SPOKES = 8

export function createTargetGeometry(radius = 1, spokeMultiplier = 1) {

    const originalMultiplier = spokeMultiplier
    spokeMultiplier = 1 + (spokeMultiplier - 1) * 0.20

    const spokeGeometries = []
    const cone1Geometry = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, CONE_RADIAL_SEGMENTS);
    const cone2Geometry = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT / 2, CONE_RADIAL_SEGMENTS);
    cone2Geometry.rotateX(Math.PI)
    cone2Geometry.translate(0, - (CONE_HEIGHT / 2 + CONE_HEIGHT / 4), 0)
    cone1Geometry.scale(0.001, 1, 1)
    cone2Geometry.scale(0.001, 1, 1)
    spokeGeometries.push(cone1Geometry, cone2Geometry)
    const spokeGeometry = mergeBufferGeometries(spokeGeometries)
    spokeGeometry.scale(SPOKE_SIZE * spokeMultiplier, SPOKE_SIZE * spokeMultiplier, SPOKE_SIZE * spokeMultiplier)
    spokeGeometry.center()
    spokeGeometry.translate(0, -radius, 0)

    const SPOKES = Math.round(BASE_SPOKES * spokeMultiplier)

    // Clone the spoke geometry in a radial pattern
    const targetGeometries = []
    for (let i = 0; i < SPOKES; i++) {
        const spoke = spokeGeometry.clone()
        spoke.rotateX(i * Math.PI / (SPOKES / 2))
        targetGeometries.push(spoke)
    }

    const targetGeometry = mergeBufferGeometries(targetGeometries)

    targetGeometry.center()
    targetGeometry.rotateZ(Math.PI / 2)
    targetGeometry.translate(0, 0.001*originalMultiplier, 0)

    return targetGeometry;
}