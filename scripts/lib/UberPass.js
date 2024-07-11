/**
 * Full-screen textured quad shader
 */

const UberPass = {
    uniforms: {
        tDiffuse: { value: null },
        opacity: { value: 1.0 },
		chromaticAberration: {value: 0.0},
		tint: {value: [1,1,1]},
		contrast: {value: 1.0},
		brightness: {value: 1.0},
		saturation: {value: 1.0},
		vignette: {value: 0.0},
		grain: {value: 0.0},
		time: {value: 0.0},
    },

    vertexShader: /* glsl */ `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

    fragmentShader: /* glsl */ `

		uniform float opacity;

		uniform sampler2D tDiffuse;

		uniform float chromaticAberration;

		uniform vec3 tint;

		uniform float contrast;

		uniform float brightness;

		uniform float saturation;

		uniform float vignette;

		uniform float grain;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			if(chromaticAberration > 0.0){
				texel.r = texture2D( tDiffuse, vUv - vec2( 0.001 * chromaticAberration, 0.0 ) ).r;
				texel.b = texture2D( tDiffuse, vUv + vec2( 0.001 * chromaticAberration, 0.0 ) ).b;
			}

			if(contrast != 1.0){
				texel.rgb = mix(vec3(1.0), texel.rgb, contrast);
			}

			//https://github.com/SableRaf/Filters4Processing/blob/master/sketches/ContrastSaturationBrightness/data/ContrastSaturationBrightness.glsl
			const float AvgLumR = 0.5;
			const float AvgLumG = 0.5;
			const float AvgLumB = 0.5;
			
			const vec3 LumCoeff = vec3(0.2125, 0.7154, 0.0721);
			
			vec3 AvgLumin = vec3(AvgLumR, AvgLumG, AvgLumB);
			vec3 brtColor = texel.rgb * brightness;
			vec3 intensity = vec3(dot(brtColor, LumCoeff));
			vec3 satColor = mix(intensity, brtColor, saturation);
			texel.rgb = mix(AvgLumin, satColor, contrast);

			if(vignette > 0.0){
				vec2 vigUv = vUv * (1.0 - vUv);
				float vig = pow(vigUv.x * vigUv.y * 10.0 / (vignette + 0.15), 0.25);
				texel.rgb *= vig;
			}

			if(grain > 0.0){
				float noise = (fract(sin(dot(vUv, vec2(12.9898,78.233)*2.0)) * 43758.5453));
				texel -= - noise * grain;
			}

			gl_FragColor = opacity * texel * vec4(tint, 1.0);

		}`,
};

export { UberPass };