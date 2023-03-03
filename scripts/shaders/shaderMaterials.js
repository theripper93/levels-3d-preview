import * as THREE from "../lib/three.module.js";

export const heightHighlightShaderMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
        curvecolor: {
            value: new THREE.Color(0x00ff00),
        },
        gridSize: {
            value: 0.1,
        },
    },
    varying: {
        vPosition: { value: new THREE.Vector3() },
    },
    vertexShader: `

varying vec2 vUv; 
varying vec3 vPosition;
    void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
`,
    fragmentShader: `
    
varying vec2 vUv;
uniform vec3 curvecolor;
uniform float gridSize;
varying vec3 vPosition;
    
    void main() {     
    float multiple = vPosition.y / gridSize;
    bool isEven = int(multiple) % 2 == 0;
    gl_FragColor = vec4(curvecolor.x, curvecolor.y, curvecolor.z , isEven ? 0.5 : 1.0);
    
}
`,
});

export const radialGradientShaderMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
        curvecolor: {
            value: new THREE.Color(0x00ff00),
        },
        gridSize: {
            value: 0.1,
        },
        reverseGradient: {
            value: false,
        },
    },
    varying: {
        vPosition: { value: new THREE.Vector3() },
    },
    vertexShader: `

varying vec2 vUv; 
varying vec3 vPosition;
    void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
`,
    fragmentShader: `
    
varying vec2 vUv;
uniform vec3 curvecolor;
uniform float gridSize;
uniform bool reverseGradient;
varying vec3 vPosition;
    
    void main() {     
    float distanceFromCenter = length(vPosition);
    float radius = gridSize / 2.0;
    gl_FragColor = vec4(curvecolor.x, curvecolor.y, curvecolor.z , reverseGradient ? (distanceFromCenter / radius) : 1.0-(distanceFromCenter / radius));
    
}
`,
});
