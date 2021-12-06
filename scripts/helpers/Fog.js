import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';

export class Fog{

    static getShader(){

        //const texture = await new THREE.TextureLoader().loadAsync( "TheHacienda_free.jpg")

        const shader = {

            uniforms: {

                'tDiffuse': { value: null },
                'opacity': { value: 1.0  },
                'fogTexture': { value: new THREE.TextureLoader().load( "TheHacienda_free.jpg") },

            },

            vertexShader: /* glsl */`

                varying vec2 vUv;
                varying vec4 worldPosition;

                void main() {

                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                    worldPosition = modelMatrix * vec4(position, 1.0);

                }`,

            fragmentShader: /* glsl */`

                uniform float opacity;

                uniform sampler2D tDiffuse;

                uniform sampler2D fogTexture;

                varying vec2 vUv;
                varying vec4 worldPosition;

                void main() {
                    vec4 texel = texture( tDiffuse, vUv );
                    vec4 fogTexel = texture( fogTexture, vec2(abs(worldPosition.x * 1000.0), abs(worldPosition.z * 1000.0)) );
                    gl_FragColor = texel * fogTexel;

                }`

        };
        return new THREE.ShaderMaterial({
            uniforms: shader.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,

        });



    }

}