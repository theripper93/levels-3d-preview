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
        opacity: {
            value: 1.0,
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
uniform float opacity;
varying vec3 vPosition;
    
    void main() {     
    float distanceFromCenter = length(vPosition);
    float radius = gridSize / 2.0;
    float alpha = reverseGradient ? (distanceFromCenter / radius) : 1.0-(distanceFromCenter / radius);
    gl_FragColor = vec4(curvecolor.x, curvecolor.y, curvecolor.z , alpha * opacity);
    
}
`,
});

export const radialRingGradientShaderMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
        curvecolor: {
            value: new THREE.Color(0x00ff00),
        },
        innerRadius: {
            value: 0.1,
        },
        outerRadius: {
            value: 0.1,
        },
        maxAlphaRadius: {
            value: 0.1,
        },
        reverseGradient: {
            value: false,
        },
        opacity: {
            value: 1.0,
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
uniform float innerRadius;
uniform float outerRadius;
uniform float opacity;
uniform float maxAlphaRadius;
varying vec3 vPosition;
    
    void main() {     
    float distanceFromCenter = length(vPosition);

    float alpha = 1.0;

    if(distanceFromCenter > maxAlphaRadius) {
        float rangeMax = outerRadius - maxAlphaRadius;
        float current = length(vPosition) - maxAlphaRadius;
        alpha = 1.0 - (current / rangeMax);
    }else{
        float rangeMax = maxAlphaRadius - innerRadius;
        float current = length(vPosition) - innerRadius;
        alpha = current / rangeMax;
    }

    gl_FragColor = vec4(curvecolor.x, curvecolor.y, curvecolor.z , alpha * opacity);
    
}
`,
});

export const coneFadeGradientShaderMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
        curvecolor: {
            value: new THREE.Color(0x00ff00),
        },
        radius: {
            value: 0.1,
        },
        height: {
            value: 0.1,
        },
        tantheta: {
            value: 0.1,
        },
        opacity: {
            value: 1.0,
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
uniform float height;
uniform float radius;
uniform float tantheta;
uniform float opacity;
uniform bool reverseGradient;
varying vec3 vPosition;
    
    void main() {     
    float alpha = 1.0;
    float distanceFromCenter = length(vPosition);
    alpha *= (1.0 - distanceFromCenter / height);

    gl_FragColor = vec4(curvecolor.x, curvecolor.y, curvecolor.z , alpha * opacity);
    
}
`,
});
