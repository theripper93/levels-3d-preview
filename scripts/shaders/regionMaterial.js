import * as THREE from "../lib/three.module.js";

const _vertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const _fragmentShader = /* glsl */`
  uniform vec3  uColor;
  uniform float uThickness;
  uniform float uAngle;
  uniform float uScale;

  varying vec2 vUv;

  #define PI 3.14159265358979

  void main() {
    // Rotate the UV projection axis by uAngle degrees
    float rad  = uAngle * PI / 180.0;
    float cosA = cos(rad);
    float sinA = sin(rad);

    // Project scaled UV onto the stripe axis
    vec2  uv   = vUv * uScale;
    float proj = uv.x * cosA + uv.y * sinA;

    // Tile into [0, 1) and discard the invisible half
    float stripe = mod(proj, 1.0);
    float alpha = 1.0;
    if (stripe > uThickness) alpha = 0.3;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

export class DiagonalStripesMaterial extends THREE.ShaderMaterial {
    constructor({
        color = 0x4f7ef5,
        thickness = 0.5,
        angle = 45,
        scale = 50,
    } = {}) {

        const colorObj = color instanceof THREE.Color
            ? color.clone()
            : new THREE.Color(color);

        super({
            vertexShader: _vertexShader,
            fragmentShader: _fragmentShader,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
                uColor: { value: colorObj },
                uThickness: { value: thickness },
                uAngle: { value: angle },
                uScale: { value: scale },
            },
        });
    }
}