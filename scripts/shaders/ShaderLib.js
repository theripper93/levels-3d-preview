import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { noiseShaders } from "./noise.js";

export class ShaderConfig extends FormApplication{
    constructor(document) {
        super();
        this.document = document;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: game.i18n.localize("levels3dpreview.shaders.config.title"),
            id: `levels-3d-preview-shader-config`,
            template: `modules/levels-3d-preview/templates/ShaderConfig.hbs`,
            resizable: true,
            width: 500,
            closeOnSubmit: true,
            tabs: [{ navSelector: ".tabs", contentSelector: ".content"}],
            filepickers: []
        });
    }

    getData() {
        const shaderData = this.document?.getFlag("levels-3d-preview", "shaders") ?? {};
        const finalData = {};
        for( const [k,v] of Object.entries(game.Levels3DPreview.CONFIG.shaders.shaders) ){
            if(k == "defaults") continue;
            const uniforms = v.uniforms;
            if(!shaderData[k]) shaderData[k] = {};
            finalData[k] = {
                title: game.i18n.localize(`levels3dpreview.shaders.${k}.name`),
                icon: game.Levels3DPreview.CONFIG.shaders.shaders[k].icon ?? "",
                isEnabled: shaderData[k].enabled,
            };
            finalData[k]["enabled"] = {
                isBoolean: true,
                value: shaderData[k].enabled ?? false,
                title: game.i18n.localize("levels3dpreview.shaders.config.enabled"),
            }
            for( const [k2,v2] of Object.entries(uniforms) ){
                const uniData = {
                    type: v2.type,
                    isNumber: v2.type == "float",
                    isColor: v2.type == "vec3",
                    isTexture: v2.type == "sampler2D",
                    isBoolean: v2.type == "bool",
                    value: shaderData[k][k2] ?? v2.default,
                    title: game.i18n.localize(`levels3dpreview.shaders.${k}.${k2}`)
                }
                finalData[k][k2] = uniData;
            }
        }
        return {shaders: finalData};
    }

    async activateListeners(html) {
        super.activateListeners(html);
        html.on("click", ".item", (e)=>{
            this.setPosition({height:"auto"})
        })
    }

    async _updateObject(event, formData) {
        formData = foundry.utils.expandObject(formData);
        return await this.document.setFlag("levels-3d-preview", "shaders", formData);
    }

    static injectButton(app, html, element){
        $(element).after(`
        <div class="form-group submenu">
            <label>${game.i18n.localize("levels3dpreview.shaders.config.label")}</label>
            <button type="button" data-key="shader-config">
                <i class="fas fa-magic"></i>
                <label>${game.i18n.localize("levels3dpreview.shaders.config.button")}</label>
            </button>
            <p class="notes">${game.i18n.localize("levels3dpreview.shaders.config.notes")}</p>
        </div>`);
        html.on("click", "button[data-key='shader-config']", (e)=>{
            e.preventDefault();
            new ShaderConfig(app.object).render(true);
        })
    }

}

export class ShaderHandler{

    constructor(){
        this.shaderLib = game.Levels3DPreview.CONFIG.shaders.shaders;
        this.shaders = [];
    }

    applyShader(Object3D, entity3D, shaderParams){
        const hasShaders = Object.values(shaderParams).some(v => v.enabled);
        if(!hasShaders) return;
        const commonParams = getSizesForShader(entity3D);
        commonParams.localSize = entity3D.isInstanced ? new THREE.Vector3(commonParams.mWidth*0.3, commonParams.mDepth*0.3, commonParams.mHeight*0.3) : new THREE.Vector3(0.2, 0.2, 0.2);
        Object3D.traverse(child => {
            if(child.isMesh){
                this.buildShader(child, shaderParams, commonParams);
            }
        })
    }

    buildShader(mesh, shaderParams, commonParams){
        const _onBeforeCompile = (shader) => {
            this.injectShaders(shader, commonParams);
            this.setUniforms(shader, shaderParams);
            this.shaders.push(shader);
        }
        mesh.material.onBeforeCompile = _onBeforeCompile
        mesh.material.customProgramCacheKey = () => {
            return `${mesh.material.type}_canvas3dcustomshader`
        }

        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: mesh.material.alphaTest,
            map: mesh.material.alphaTest ? mesh.material.map : null,
            onBeforeCompile: _onBeforeCompile,
            customProgramCacheKey: () => {
                return `${mesh.material.type}_canvas3dcustomshader_depth`
            }
        })
    }

    injectShaders(shader, commonParams){
        shader.vertexShader = noiseShaders.snoise + "\n" + shader.vertexShader;
        shader.fragmentShader = noiseShaders.snoise + "\n" + shader.fragmentShader;
        for(const [shaderId, shaderConfig] of Object.entries(this.shaderLib)){
            const {vertexShader, fragmentShader, uniforms, varying} = shaderConfig;
            let uniformsVarying = `uniform bool ${shaderId + "_enabled"};`;
            for(const [name, value] of Object.entries(varying)){
                uniformsVarying += `varying ${value.type} ${(shaderId == "defaults" ? name : shaderId + "_" + name)};\n`;
                shader.uniforms[(shaderId == "defaults" ? name : shaderId + "_" + name)] = {value: shaderId == "defaults" ? commonParams[name] ?? (typeof value.value == "function" ? value.value() : value.value) : value.default};
            }
            for(const [name, value] of Object.entries(uniforms)){
                uniformsVarying += `uniform ${value.type} ${(shaderId == "defaults" ? name : shaderId + "_" + name)};\n`;
                shader.uniforms[(shaderId == "defaults" ? name : shaderId + "_" + name)] = {value: shaderId == "defaults" ? commonParams[name] ?? (typeof value.value == "function" ? value.value() : value.value) : value.default};
            }
            for(const vertex of vertexShader){
                shader.vertexShader = this.injectString(vertex, shader.vertexShader, shaderId);
            }
            for(const fragment of fragmentShader){
                shader.fragmentShader = this.injectString(fragment, shader.fragmentShader, shaderId);
            }
            shader.vertexShader = uniformsVarying + shader.vertexShader;
            shader.fragmentShader = uniformsVarying + shader.fragmentShader;
        }
    }

    injectString(inject, shader, shaderId){
        const mode = inject.mode ?? SHADERS_CONSTS.APPEND;
        const injectionPoint = inject.injectionPoint;
        const originalShaderCode = inject.shaderCode;
        const shaderCode = inject.noConditional ? `\n${originalShaderCode}\n` : `if(${shaderId + "_enabled"}){\n${originalShaderCode}\n}`;
        switch(mode){
            case SHADERS_CONSTS.APPEND:
                shader = shader.replace(injectionPoint, injectionPoint + "\n" + shaderCode);
                break;
            case SHADERS_CONSTS.PREPEND:
                shader = shader.replace(injectionPoint, shaderCode + "\n" + injectionPoint);
                break;
            case SHADERS_CONSTS.REPLACE:
                shader = shader.replace(injectionPoint, shaderCode);
                break;
        }
        return shader;
    }

    setUniforms(shader, shaderParams){
        for(const [name, shaderData] of Object.entries(shaderParams)){
            for(const [uniformName, value] of Object.entries(shaderData)){
                const isColor = uniformName.toLowerCase().includes("color");
                const isTexture = uniformName.toLowerCase().includes("texture");
                let finalValue = value;
                if(isColor) finalValue = new THREE.Color(value);
                if(isTexture) finalValue = new THREE.TextureLoader().load(value);
                shader.uniforms[`${name + "_" + uniformName}`] = {value: finalValue};
            }
        }
    }

    updateShaders(delta){
        this.shaders.forEach(shader => {
            shader.uniforms.time.value = delta/100;
        })
    }
}

export const SHADERS_CONSTS = {
    REPLACE: "replace",
    APPEND: "append",
    PREPEND: "prepend",
}

export const shaders = {
    "defaults": {
        uniforms: {
            time: {
                type: "float",
                value: 0
            },
            mDepth: {
                type: "float",
                value: 0
            },
            mWidth: {
                type: "float",
                value: 0
            },
            mHeight: {
                type: "float",
                value: 0
            },
            yPos: {
                type: "float",
                value: 0
            },
            localSize: {
                type: "vec3",
                value: new THREE.Vector3(0, 0, 0)
            },
            textureRepeat: {
                type: "float",
                value: 1
            },
            gridColor: {
                type: "vec3",
                value: () => {
                    return new THREE.Color(canvas.scene.grid.color);
                }
            },
            gridAlpha: {
                type: "float",
                value: () => {
                    return canvas.scene.grid.alpha;
                }
            },
            gridSize: {
                type: "float",
                value: () => {
                    return canvas.scene.grid.size/factor;
                }
            }
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [],
    },
    "wind": {
        icon: `<i class="fas fa-wind"></i>`,
        uniforms: {
            "speed": {
                type: "float",
                default: 0.1,
            },
            "direction": {
                type: "float",
                default: 0,
            },
            "intensity": {
                type: "float",
                default: 0.1,
            },
            "affect_model": {
                type: "float",
                default: 0.5,
            },
            "convoluted": {
                type: "bool",
                default: false,
            }
        },
        varying: {},
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                float currentY = (modelMatrix * vec4( transformed, 1.0 )).y;
                float currentYDelta = currentY - yPos;
                float windFactor = 0.0;
                vec2 windOffset = vec2(0.0);
                if (currentYDelta > mDepth*wind_affect_model) {
                    windFactor = (currentYDelta - mDepth*wind_affect_model) / (mDepth*wind_affect_model);
                    if(wind_convoluted) {
                        windFactor = (sin(time*wind_speed + transformed.x + transformed.z) + wind_intensity) * windFactor;
                    }else{
                        windFactor = (sin(time*wind_speed) + wind_intensity) * windFactor;
                    }
                    windOffset = vec2(windFactor * wind_intensity * cos(wind_direction) * localSize.x, windFactor *  wind_intensity * sin(wind_direction) * localSize.z);
                }
                
                transformed = vec3( transformed.x + windOffset.x, transformed.y, transformed.z + windOffset.y );
                `
            }
        ],
        fragmentShader: [],
    },
    "distortion": {
        icon: `<i class="fas fa-wave-square"></i>`,
        uniforms: {
            "speed": {
                type: "float",
                default: 0.1,
            },
            "direction": {
                type: "float",
                default: 0,
            },
            "intensity": {
                type: "float",
                default: 0.1,
            },
            "convoluted": {
                type: "bool",
                default: false,
            }
        },
        varying: {},
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                vec3 displaceOffset = vec3(0.0);
                if( transformed.y > 0.01 ) {
                    if( distortion_convoluted ) {
                        float direction = snoise(vec2(transformed.x , transformed.z));
                        displaceOffset = vec3(mWidth * distortion_intensity * cos(distortion_direction+direction) * sin(time*distortion_speed), mDepth * distortion_intensity * (sin(time*distortion_speed) + 1.0) * direction * 0.5 ,mHeight * distortion_intensity * sin(distortion_direction+direction) * sin(time*distortion_speed));
                    }else{
                        float direction = transformed.x * transformed.z;   
                        displaceOffset = vec3(mWidth * distortion_intensity * cos(distortion_direction+direction) * sin(time*distortion_speed), mDepth * distortion_intensity * (sin(time*distortion_speed) + 1.0) * (cos(direction) + 1.0) * 0.25 ,mHeight * distortion_intensity * sin(distortion_direction+direction) * sin(time*distortion_speed));
                    }
                    if( transformed.y + displaceOffset.y <= 0.0 ) {
                        displaceOffset.y = 0.0;
                    }
                }
                transformed = vec3( transformed.x + displaceOffset.x, transformed.y + displaceOffset.y, transformed.z + displaceOffset.z );`
            }
        ],
        fragmentShader: [],
    },
    "water": {
        icon: `<i class="fas fa-water"></i>`,
        uniforms: {
            "speed": {
                type: "float",
                default: 0.1,
            },
            "direction": {
                type: "float",
                default: 0,
            },
            "intensity": {
                type: "float",
                default: 0.1,
            },
        },
        varying: {},
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                float yDisplace = 0.0;
                if( transformed.y > 0.01 ) {
                    float posX = transformed.x - mWidth ;
                    float posZ = transformed.z - mHeight ;
                    float timeSpeed = time * water_speed;
                    float r = sqrt (posX*posX + posZ*posZ)*(water_intensity) + timeSpeed;
                    yDisplace = (1.0 + sin(r) ) * water_direction * mDepth;
                    if( transformed.y + yDisplace <= 0.0 ) {
                        yDisplace = 0.0;
                    }
                }
                transformed = vec3( transformed.x, transformed.y + yDisplace, transformed.z);`
            }
        ],
        fragmentShader: [],
    },
    "grid": {
        icon: `<i class="fas fa-grid"></i>`,
        uniforms: {
            "normalCulling": {
                type: "float",
                default: 0.0,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <dithering_fragment>",
                shaderCode: `
                if( abs(normal.y) > grid_normalCulling && (mod(vWorldPositionFoW.x, gridSize) < 0.0015 || mod(vWorldPositionFoW.z, gridSize) < 0.0015)){
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridAlpha);
                }
                `
            }
        ],
    },
    "triplanar": {
        icon: `<i class="fas fa-cube"></i>`,
        uniforms: {
            roughnessAdjust: {
                type: "float",
                default: 8,
            },
        },
        varying: {
            wNormal: {
                type: "vec3",
                default: new THREE.Vector3(0, 0, 0),
            },
            vUvTri: {
                type: "vec3",
                default: new THREE.Vector3(0, 0, 0),
            }
        },
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "void main() {",
                shaderCode: `
                vec4 worldPosition2 = modelMatrix * vec4( position, 1.0 );
                triplanar_wNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
                triplanar_vUvTri = worldPosition2.xyz;
                `
            },
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "void main() {",
                noConditional: true,
                shaderCode: `
                vec3 GetTriplanarWeights (vec3 normals) {
                    vec3 triW = abs(normals);
                    return triW / (triW.x + triW.y + triW.z);
                  }
                struct TriplanarUV {
                  vec2 x, y, z;
                };
                TriplanarUV GetTriplanarUV (vec3 pos) {
                    TriplanarUV  triUV;
                    triUV.x = pos.zy;
                    triUV.y = pos.xz;
                    triUV.z = pos.xy;
                    return triUV;
                }
                `
            },
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <map_fragment>",
                shaderCode: `
                #ifdef USE_MAP
                vec3 xColor = texture2D(map, triplanar_vUvTri.yz * textureRepeat * 0.1).rgb;
                vec3 yColor = texture2D(map, triplanar_vUvTri.xz * textureRepeat * 0.1).rgb;
                vec3 zColor = texture2D(map, triplanar_vUvTri.xy * textureRepeat * 0.1).rgb;
                vec3 triW = GetTriplanarWeights(triplanar_wNormal);
                vec4 easedColor = vec4( xColor * triW.x + yColor * triW.y + zColor * triW.z, 1.0);
                vec4 gammaCorrectedColor = vec4( pow(abs(easedColor.x),1.0), pow(abs(easedColor.y),1.0), pow(abs(easedColor.z),1.0), 1.0);
                vec4 texelColor3 = mapTexelToLinear( gammaCorrectedColor );
                diffuseColor *= texelColor3;
                #endif
                `
            },
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <roughnessmap_fragment>",
                shaderCode: `
                #ifdef USE_ROUGHNESSMAP
                    vec3 xColorR = texture2D(roughnessMap, triplanar_vUvTri.yz * textureRepeat * 0.1).rgb;
                    vec3 yColorR = texture2D(roughnessMap, triplanar_vUvTri.xz * textureRepeat * 0.1).rgb;
                    vec3 zColorR = texture2D(roughnessMap, triplanar_vUvTri.xy * textureRepeat * 0.1).rgb;

                    vec3 triWR = GetTriplanarWeights(triplanar_wNormal);
                    vec4 easedColorR = vec4( xColorR * triWR.x + yColorR * triWR.y + zColorR * triWR.z, 1.0);
                    vec4 gammaCorrectedColorR = vec4( pow(abs(easedColorR.x),1.0), pow(abs(easedColorR.y),1.0), pow(abs(easedColorR.z),1.0), 1.0);
                    vec4 texelColorR = mapTexelToLinear( gammaCorrectedColorR );
                    roughnessFactor *= texelColorR.g * triplanar_roughnessAdjust;
                #endif
                `
            },
            {
                mode: SHADERS_CONSTS.REPLACE,
                injectionPoint: "#include <normal_fragment_maps>",
                noConditional: true,
                shaderCode: `
                #ifdef OBJECTSPACE_NORMALMAP
                    normal = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0; // overrides both flatShading and attribute normals
                    #ifdef FLIP_SIDED
                        normal = - normal;
                    #endif
                    #ifdef DOUBLE_SIDED
                        normal = normal * ( float( gl_FrontFacing ) * 2.0 - 1.0 );
                    #endif
                    normal = normalize( normalMatrix * normal );
                #elif defined( TANGENTSPACE_NORMALMAP )
                if(triplanar_enabled){
                    TriplanarUV triUV = GetTriplanarUV(triplanar_vUvTri);

                    vec3 tangentNormalX = texture2D(normalMap, triUV.x * textureRepeat * 0.1).xyz;
                    vec3 tangentNormalY = texture2D(normalMap, triUV.y * textureRepeat * 0.1).xyz;
                    vec3 tangentNormalZ = texture2D(normalMap, triUV.z * textureRepeat * 0.1).xyz;

                    vec3 worldNormalX = tangentNormalX.xyz;
                    vec3 worldNormalY = tangentNormalY.xyz;
                    vec3 worldNormalZ = tangentNormalZ;

                    vec3 triWN = GetTriplanarWeights(triplanar_wNormal);
                    vec3 mapI = normalize(worldNormalX * triWN.x + worldNormalY * triWN.y + worldNormalZ * triWN.z);
                    vec3 mapN = vec3(mapI.x, mapI.y, mapI.z);
                    mapN.xy *= normalScale;
                    #ifdef USE_TANGENT
                        normal = normalize( vTBN * mapN );
                    #else
                        normal = perturbNormal2Arb( -vViewPosition, normal, mapN, faceDirection  );
                    #endif
                }else{
                    vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;
                    mapN.xy *= normalScale;
                    #ifdef USE_TANGENT
                        normal = normalize( vTBN * mapN );
                    #else
                        normal = perturbNormal2Arb( - vViewPosition, normal, mapN, faceDirection );
                    #endif
                }
                #elif defined( USE_BUMPMAP )
                    normal = perturbNormalArb( -vViewPosition, normal, dHdxy_fwd() );
                #endif
    `
            }
        ]
    },
    "textureScroll": {
        icon: `<i class="fas fa-angle-double-right"></i>`,
        uniforms: {
            speed: {
                type: "float",
                default: 0.01
            },
            direction: {
                type: "float",
                default: 0
            }
        },
        varying: {},
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                #ifdef USE_UV
                vUv.x += time * textureScroll_speed * cos(textureScroll_direction);
                vUv.y += time * textureScroll_speed * sin(textureScroll_direction);
                #endif
                `
            }
        ],
        fragmentShader: []
    },
    "fire": {
        icon: `<i class="fas fa-fire"></i>`,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1
            },
            intensity: {
                type: "float",
                default: 0.5
            },
            scale: {
                type: "float",
                default: 1
            },
            color: {
                type: "vec3",
                default: "#ff9500"
            },
            blendMode: {
                type: "bool",
                default: false
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <dithering_fragment>",
                shaderCode: `
                #ifdef USE_UV
                    vec3 c1 = fire_color*0.1;
                    vec3 c2 = fire_color*0.7;
                    vec3 c3 = fire_color*0.2;
                    vec3 c4 = fire_color*vec3(1.0, 0.9, 0.0);
                    vec3 c5 = vec3(0.1);
                    vec3 c6 = vec3(0.9);
                    vec2 p = vUv.xy * 8.0 * fire_scale;
                    float fire_time = time * fire_speed;
                    float q = fbm(p - fire_time * 0.1);
                    vec2 r = vec2(fbm(p + q + fire_time * 0.7 - p.x - p.y), fbm(p + q - fire_time * 0.4));
                    vec3 c = mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);
                    vec4 fire_finalColor = vec4(c * cos(1.57 * vUv.y / textureRepeat), 1.0);
                    if(fire_blendMode){
                        gl_FragColor = mix(gl_FragColor, fire_finalColor, fire_intensity);
                    }else{
                        gl_FragColor += fire_finalColor * fire_intensity;
                    }
                #endif
                `
            }

        ],

    }
}

function getSizesForShader(_this){
    if(_this.isInstanced){
        return {
            mDepth : _this.instancedBBSize.y,
            mWidth : _this.instancedBBSize.x,
            mHeight : _this.instancedBBSize.z,
            yPos : _this.mesh.position.y - _this.instancedBBSize.y / 2,
            textureRepeat : _this.textureRepeat ?? 1,
        }
    }else{
        return {
            mDepth : _this.bb.depth,
            mWidth : _this.bb.width,
            mHeight : _this.bb.height,
            yPos : _this.mesh.position.y - _this.bb.depth / 2,
            textureRepeat : _this.textureRepeat ?? 1,
        }
    }
}