import * as THREE from "three";
import * as coords3d from "../helpers/coords3d.js";
import { decalMaterial, markerMesh, decalPlaneGeometry, gridUnit, gridShapeId } from "../entities/effects/markerDecals.js";

const PAD = 1.5;

const BODY = `
float r = 1.0 / ${PAD.toFixed(2)};
float d = sdShape(p, r, uShape);
float halo = exp(-abs(d) * uSize * 22.0) * 0.45;
outColor = over(vec4(vec3(0.0), halo), outColor);
vec3 hi = mix(uColor, vec3(1.0), 0.4);
float a = atan(p.y, p.x) / 6.2831853 + 0.5;
float dashes = step(0.45, fract(a * 14.0 * uSize - uTime * 0.25));
float ring = band(d, 0.014 * k, aa) * dashes;
float inner = fill(d, aa) * smoothstep(-0.35 * r, 0.0, d) * 0.28;
float sector = floor((atan(p.y, p.x) + 0.7853982) / 1.5707963);
float ang = sector * 1.5707963;
vec2 q = vec2(cos(-ang) * p.x - sin(-ang) * p.y, sin(-ang) * p.x + cos(-ang) * p.y);
q = vec2(q.y, q.x);
float y0 = r * 0.6 - 0.05 * k * (0.5 + 0.5 * sin(uTime * 3.0));
float chev = band(q.y - y0 - abs(q.x) * 0.8, 0.022 * k, aa) * (1.0 - smoothstep(0.14 * k, 0.15 * k, abs(q.x)));
outColor = over(vec4(uColor, inner), outColor);
outColor = over(vec4(hi * 1.3, ring), outColor);
outColor = over(vec4(hi * 1.6, chev), outColor);
`;

const rayFrom = new THREE.Vector3();
const rayTo = new THREE.Vector3();

export class turnStartMarker {
    constructor(parent) {
        this._parent = parent;
        this.init();
        this.update();
    }

    init() {
        this.material = decalMaterial("turnStart", BODY, { uColor: { value: new THREE.Color(game.Levels3DPreview.CONFIG.COLORS.COMBAT) } });
        this.mesh = markerMesh(decalPlaneGeometry, this.material);
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    update() {
        if (!this.mesh) return;
        const token = this.token;
        this.mesh.visible = !!token && this.visible;
        if (!this.mesh.visible) return (this._turnKey = null);
        const combat = game.combat;
        const key = `${combat.id}|${combat.round}|${combat.turn}|${token.id}`;
        if (key === this._turnKey) return;
        this._turnKey = key;
        const doc = token.document;
        const center = doc.getCenterPoint();
        const pos = coords3d.posCanvasTo3d({ x: center.x, y: center.y, z: doc.elevation });
        this.mesh.position.set(pos.x, this.groundY(pos), pos.z);
        const size = Math.max(doc.width, doc.height);
        const scale = size * gridUnit() * PAD;
        this.mesh.scale.set(scale, 1, scale);
        this.material.uniforms.uSize.value = size;
        this.material.uniforms.uShape.value = gridShapeId();
    }

    groundY(pos) {
        const unit = gridUnit();
        rayFrom.set(pos.x, pos.y + unit * 0.25, pos.z);
        rayTo.set(pos.x, pos.y - unit * 0.25, pos.z);
        const hit = this._parent.interactionManager.computeSightCollisionFrom3DPositions(rayFrom, rayTo, "move");
        return (hit ? hit.y : pos.y) + 0.001;
    }

    get token() {
        const tokenId = game.combat?.current?.tokenId;
        if (!tokenId) return null;
        if (this._token?.id === tokenId && !this._token.destroyed) return this._token;
        this._token = canvas.tokens.get(tokenId);
        return this._token;
    }

    get visible() {
        if (!this.token?.isOwner) return false;
        return !!game.combat?.started;
    }

    get scene() {
        return this._parent.scene;
    }
}
