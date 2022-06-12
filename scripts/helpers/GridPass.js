import * as THREE from "../lib/three.module.js";
import { ShaderPass } from '../lib/ShaderPass.js';
import {factor} from '../main.js';

export class GridShaderPass{

    constructor(parent){
        this._parent = parent;
        this.gridSize = canvas.dimensions.size
        this.init();
    }

    async init(){
        this.shader = this.getShader();
        this._parent.composer.removePass( this.gridPass );
        this.gridPass = new ShaderPass( this.shader );
        this._parent.composer.addPass( this.gridPass );
    }

    update(){
        if(this.shader){
            this.shader.uniforms.projectionMatrixInverse.value.copy(this._parent.camera.projectionMatrixInverse);
            this.shader.uniforms.worldMatrixInverse.value.copy(this._parent.camera.matrixWorld);
            this.shader.uniforms.wcameraPosition.value.copy(this._parent.camera.position);
            this.shader.uniforms.tDepth.value = this._parent.depthTexture;
        }
    }

    getShader(){

        //const texture = await new THREE.TextureLoader().loadAsync( "TheHacienda_free.jpg")

        const shader = {

            uniforms: {

                'tDiffuse': { value: null },
                'tDepth': { value: null },
                'cameraNear': { value: this._parent.camera.near },
                'cameraFar': { value: this._parent.camera.far },
                'projectionMatrixInverse': { value: new THREE.Matrix4() },
                'worldMatrixInverse': { value: new THREE.Matrix4() },
                'factor': { value: factor },
                'gridSize': { value: this.gridSize },
                'wcameraPosition': { value: new THREE.Vector3() },
                'gridColor': { value: new THREE.Color("#4dd2db") },

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

                #include <packing>
                uniform float opacity;

                uniform sampler2D tDiffuse;
                uniform sampler2D tDepth;

                uniform mat4 projectionMatrixInverse;
                uniform mat4 worldMatrixInverse;
                uniform float cameraNear;
                uniform float cameraFar;
                uniform float factor;
                uniform float gridSize;
                uniform vec3 wcameraPosition;
                uniform vec3 gridColor;

                varying vec2 vUv;
                varying vec4 worldPosition;


                void main() {

                    float depth = texture(tDepth, vUv).x;
                    
                    vec4 clipSpacePosition = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
                    vec4 viewSpacePosition = projectionMatrixInverse * clipSpacePosition;
                
                    viewSpacePosition /= viewSpacePosition.w;
                
                    vec4 worldSpacePosition = worldMatrixInverse * viewSpacePosition;

                    vec4 finalColor;
                    vec4 texel = texture( tDiffuse, vUv );
                    float dist = distance(worldSpacePosition.xyz, wcameraPosition);
                    float gridStrokeSize = 2.0;
                    float halfStrokeSize = gridStrokeSize * 0.5;
                    float maxCamDist = 2.0;

                    if(dist < maxCamDist){
                        float gridX = mod((worldSpacePosition.x*factor),gridSize);
                        float gridZ = mod((worldSpacePosition.z*factor),gridSize);
                        float gridXDist;
                        float gridZDist;
                        if(gridX <= halfStrokeSize){
                            gridXDist = gridX;
                        }else{
                            gridXDist = gridSize - gridX;
                        }
                        if(gridZ <= halfStrokeSize){
                            gridZDist = gridZ;
                        }else{
                            gridZDist = gridSize - gridZ;
                        }

                        float colorMulti = 1.0 - (min(gridXDist,gridZDist))/halfStrokeSize;
                        vec3 finalGridColor = gridColor.rgb * colorMulti;
                        if( gridX < halfStrokeSize || gridZ < halfStrokeSize || gridX > gridSize - halfStrokeSize || gridZ > gridSize - halfStrokeSize ){
                            finalColor = texel + vec4(finalGridColor, 0.0);
                        }else{
                            finalColor = texel;
                        }
                    }else{
                        finalColor = texel;
                    }

                    gl_FragColor = finalColor;

                }`

        };
        return new THREE.ShaderMaterial({
            uniforms: shader.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,

        });



    }

}