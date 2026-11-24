import { Color, Vector3, Vector4 } from "three";
import { Sky } from "../../three/Sky.js";

export const MAX_SKY_BODIES = 4;

export const BODY_KIND = { star: 0, moon: 1, planet: 2 };

const color = new Color();
const scratch = new Vector3();

function vectors() {
    return Array.from({ length: MAX_SKY_BODIES }, () => new Vector4());
}

export function bodyUniforms() {
    return {
        bodyCount: { value: 0 },
        bodyDirection: { value: vectors() },
        bodyColor: { value: vectors() },
        bodyShape: { value: vectors() },
        bodyLight: { value: vectors() },
    };
}

export class SkyDome extends Sky {
    constructor({ name = "SkyStyleShader", uniforms = {}, fragmentShader }) {
        super({
            name,
            uniforms: { ...Sky.SkyShader.uniforms, ...bodyUniforms(), ...uniforms },
            vertexShader: Sky.SkyShader.vertexShader,
            fragmentShader,
        });
    }

    setBodies(bodies) {
        const uniforms = this.material.uniforms;
        if (!uniforms.bodyCount) return;
        const count = Math.min(bodies.length, MAX_SKY_BODIES);
        uniforms.bodyCount.value = count;
        for (let i = 0; i < count; i++) {
            const body = bodies[i];
            const radius = body.radius ?? 0.03;
            uniforms.bodyDirection.value[i].set(body.direction.x, body.direction.y, body.direction.z, radius);
            color.set(body.color ?? "#ffffff").multiplyScalar(body.brightness ?? 1);
            uniforms.bodyColor.value[i].set(color.r, color.g, color.b, body.glow ?? 0);
            uniforms.bodyShape.value[i].set(body.phase ?? -1, BODY_KIND[body.kind] ?? body.kind ?? 0, body.ring ?? 0, body.seed ?? i);
            const light = body.litFrom;
            if (light) toBodyLocal(light, body.direction, scratch);
            else scratch.set(0, 0, 1);
            uniforms.bodyLight.value[i].set(scratch.x, scratch.y, scratch.z, body.lit ?? 1);
        }
    }
}

const right = new Vector3();
const upAxis = new Vector3();
const helper = new Vector3();

function toBodyLocal(lightDirection, axis, target) {
    helper.set(...(Math.abs(axis.y) < 0.99 ? [0, 1, 0] : [1, 0, 0]));
    right.crossVectors(helper, axis).normalize();
    upAxis.crossVectors(axis, right);
    return target.set(lightDirection.dot(right), lightDirection.dot(upAxis), -lightDirection.dot(axis)).normalize();
}

export function realisticShader(declarations = "", layer = "") {
    return Sky.SkyShader.fragmentShader.replace("void main() {", `${declarations}\nvoid main() {`).replace("skyOutput(skyFinish(sky, y, env));", `${layer}\nskyOutput(skyFinish(sky, y, env));`);
}

export function skyDirection(azimuth, elevation, target = new Vector3()) {
    const a = (azimuth * Math.PI) / 180;
    const e = (elevation * Math.PI) / 180;
    return target.set(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).normalize();
}
