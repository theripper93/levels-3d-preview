import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { noiseShaders } from "./noise.js";

export class ShaderConfig extends FormApplication {
    constructor(document) {
        super();
        this.document = document;
        this.autoSave = game.settings.get("levels-3d-preview", "shaderAutoSave");
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: game.i18n.localize("levels3dpreview.shaders.config.title"),
            id: `levels-3d-preview-shader-config`,
            template: `modules/levels-3d-preview/templates/ShaderConfig.hbs`,
            width: 335,
            closeOnSubmit: true,
            tabs: [{ navSelector: ".tabs", contentSelector: ".content" }],
            filepickers: [],
        });
    }

    getData() {
        const shaderData = this.document?.getFlag("levels-3d-preview", "shaders") ?? {};
        const finalData = {};
        for (const [k, v] of Object.entries(game.Levels3DPreview.CONFIG.shaders.shaders)) {
            if (k == "defaults") continue;
            const uniforms = v.uniforms;
            if (!shaderData[k]) shaderData[k] = {};
            finalData[k] = {
                title: game.i18n.localize(`levels3dpreview.shaders.${k}.name`),
                description: game.i18n.localize(`levels3dpreview.shaders.${k}.description`),
                icon: game.Levels3DPreview.CONFIG.shaders.shaders[k].icon ?? "",
                isEnabled: shaderData[k].enabled,
                isSlow: v.fragmentShader && v.fragmentShader[0]?.shaderCode?.length > 300,
            };
            finalData[k]["enabled"] = {
                isBoolean: true,
                value: shaderData[k].enabled ?? false,
                title: game.i18n.localize("levels3dpreview.shaders.config.enabled"),
                isField: true,
            };
            for (const [k2, v2] of Object.entries(uniforms)) {
                const uniData = {
                    isField: true,
                    type: v2.type,
                    isNumber: v2.type == "float" && (v2.min == undefined || v2.max == undefined),
                    isColor: v2.type == "vec3",
                    isTexture: v2.type == "sampler2D",
                    isBoolean: v2.type == "bool",
                    isSlider: v2.type == "float" && v2.min != undefined && v2.max != undefined,
                    min: v2.min,
                    max: v2.max,
                    step: v2.step ?? Math.min(((v2.min ?? 0) + (v2.max ?? 0)) / 100, 1),
                    value: shaderData[k][k2] ?? v2.default,
                    title: game.i18n.localize(`levels3dpreview.shaders.${k}.${k2}`),
                };
                finalData[k][k2] = uniData;
            }
        }
        return { shaders: finalData };
    }

    _getHeaderButtons(...args) {
        const buttons = super._getHeaderButtons(...args);
        buttons.unshift({
            label: game.i18n.localize("levels3dpreview.shaders.config.autosave"),
            class: `autosave`,
            icon: "far fa-save",
            onclick: (e) => {
                this.autoSave = !this.autoSave;
                game.settings.set("levels-3d-preview", "shaderAutoSave", this.autoSave);
                $(e.currentTarget).toggleClass("active");
            },
        });
        return buttons;
    }

    async activateListeners(html) {
        super.activateListeners(html);
        html[0].closest("#levels-3d-preview-shader-config").querySelector(".autosave").classList.toggle("active", this.autoSave);
        html.on("click", ".item", (e) => {
            this.setPosition({ height: "auto" });
        });
        html.on("click", "#apply", (e) => {
            e.preventDefault();
            this._onSubmit(e, { preventClose: true, preventRender: true });
        });
        html.on("click", "#tomacro", (e) => {
            e.preventDefault();
            Dialog.prompt({
                title: game.i18n.localize("levels3dpreview.shaders.config.macro.title"),
                content: "",
                callback: (html) => {
                    const macroName = html.find("#macro-name").val();
                    const macroEnabled = html.find("#macro-enabled").prop("checked");
                    const macroPlayers = html.find("#macro-players").prop("checked");
                    let macroData = foundry.utils.expandObject(this._getSubmitData());
                    if (macroEnabled) {
                        for (const [k, v] of Object.entries(macroData)) {
                            if (!v.enabled) delete macroData[k];
                        }
                    }
                    const shaderData = JSON.stringify(macroData);
                    const macroContent = `
                    if(!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
                    const updates = [];
                    const shaderData = ${shaderData};
                    canvas.activeLayer.controlled.forEach(obj => {
                        updates.push({
                            _id: obj.id,
                            flags: {
                                "levels-3d-preview": {
                                    "shaders": shaderData
                                }
                            }
                        });
                    })
                    canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
                    `;
                    Macro.create({
                        command: macroContent,
                        img: "icons/svg/acid.svg",
                        type: "script",
                        name: macroName,
                        ownership: {
                            default: macroPlayers ? 2 : 0,
                        },
                    });
                    ui.notifications.notify(game.i18n.localize("levels3dpreview.shaders.config.macro.created").replace("%s", macroName));
                },
                render: (html) => {
                    const input = `
                    <div class="form-group" style="display: grid;grid-template-columns: 1fr 1fr;align-items: center;padding-bottom: 8px;">
                        <label>${game.i18n.localize("levels3dpreview.shaders.config.macro.content")}</label>
                        <input type="text" id="macro-name" value="Shader Macro" placeholder="">
                    </div>
                    <div class="form-group" style="display: grid;grid-template-columns: 1fr 1fr;align-items: center;padding-bottom: 8px;">
                        <label>${game.i18n.localize("levels3dpreview.shaders.config.macro.enabled")}</label>
                            <input style="justify-self: end;" type="checkbox" id="macro-enabled" checked>
                    </div>
                    <div class="form-group" style="display: grid;grid-template-columns: 1fr 1fr;align-items: center;padding-bottom: 8px;">
                    <label>${game.i18n.localize("levels3dpreview.shaders.config.macro.players")}</label>
                        <input style="justify-self: end;" type="checkbox" id="macro-players">
                    </div>
                  `;
                    $(html[0]).append(input);
                },
            });
        });
        html.on("change", (e) => {
            if (this.autoSave) this.debouncedSubmit(e, { preventClose: true, preventRender: true });
        });
    }

    debouncedSubmit = debounce(this._onSubmit.bind(this), 400);

    setPosition(...args) {
        super.setPosition(...args);
        if (!this.activatedInitialTab) {
            this.activatedInitialTab = true;
            const tabId = $(this.element).find(".shader-tab-enabled").first().data("tab");
            if (tabId) this.activateTab(tabId);
            this.setPosition({ height: "auto" });
        }
    }

    async _updateObject(event, formData) {
        formData = foundry.utils.expandObject(formData);
        return await this.document.setFlag("levels-3d-preview", "shaders", formData);
    }

    static injectButton(app, html, element) {
        $(element).after(`
        <div class="form-group submenu">
            <label>${game.i18n.localize("levels3dpreview.shaders.config.label")}</label>
            <button type="button" data-key="shader-config">
                <i class="fas fa-magic"></i>
                <label>${game.i18n.localize("levels3dpreview.shaders.config.button")}</label>
            </button>
            <p class="notes">${game.i18n.localize("levels3dpreview.shaders.config.notes")}</p>
        </div>`);
        html.on("click", "button[data-key='shader-config']", (e) => {
            e.preventDefault();
            new ShaderConfig(app.object).render(true);
        });
    }
}

export class ShaderHandler {
    constructor() {
        this.shaderLib = game.Levels3DPreview.CONFIG.shaders.shaders;
        this.shaders = [];
        this._sceneUniformsNeedUpdate = true;
        this._sceneReadyHook = Hooks.on("canvasReady", () => {
            this._sceneUniformsNeedUpdate = true;
        });
        this._sceneUpdateHook = Hooks.on("updateScene", () => {
            this._sceneUniformsNeedUpdate = true;
        });
    }

    async preloadTextures(shaderParams) {
        for (const [shaderName, shader] of Object.entries(shaderParams)) {
            if (shader.enabled) {
                for (const [key,value] of Object.entries(shader)) {
                    if (key.toLowerCase().includes("texture")) {
                        await game.Levels3DPreview.helpers.loadTexture(value);
                    }
                }
            }
        }
    }

    applyShader(Object3D, entity3D, shaderParams) {
        const enableShaders = game.settings.get("levels-3d-preview", "enableShaders");
        if (!enableShaders) shaderParams = this.disablePerformanceHeavyShaders(shaderParams);
        const hasShaders = Object.values(shaderParams).some((v) => v.enabled);
        if (!hasShaders) return;
        const commonParams = getSizesForShader(entity3D);
        commonParams.localSize = entity3D.isInstanced ? new THREE.Vector3(commonParams.mWidth * 0.3, commonParams.mDepth * 0.3, commonParams.mHeight * 0.3) : new THREE.Vector3(0.2, 0.2, 0.2);
        Object3D.traverse((child) => {
            if (child.isMesh && !child.userData?.noShaders) {
                if(!child.material.map) child.material.map = game.Levels3DPreview.UTILS.TEXTURES.BLANK
                this.buildShader(child, shaderParams, commonParams, entity3D);
            }
        });
    }

    disablePerformanceHeavyShaders(shaderParams){
        const perfHeavy = ["ice", "fire", "oil", "lightning"];
        perfHeavy.forEach((shader) => { 
            delete shaderParams[shader];
        });
        return shaderParams;
    }

    buildShader(mesh, shaderParams, commonParams, entity3D) {
        const shaderKey = Object.keys(shaderParams).filter((k) => shaderParams[k].enabled).join("_");
        const _onBeforeCompile = (shader) => {
            shader.entity3D = entity3D;
            this.injectShaders(shader, commonParams, shaderParams);
            shader.uniforms.bevelSize = { value: mesh.material?.userData?.bevelSize || -9999 };
            shader.uniforms.tex_repeat = { value: mesh.material?.userData?.tex_repeat || 1 };
            shader.uniforms.mDepth = { value: commonParams.mDepth };
            shader.uniforms.mWidth = { value: commonParams.mWidth };
            shader.uniforms.mHeight = { value: commonParams.mHeight };
            shader.uniforms.localSize = {value: commonParams.localSize};
            
            this.setUniforms(shader, shaderParams);
            this.shaders.push(shader);
            if (entity3D.pathTraced) {
                const customBlendMap = "#ifdef USE_MAP\n\tvec4 texelColor = texture2D( map, vUv );\n\ttexelColor = mapTexelToLinear( texelColor );\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, texelColor.rgb, texelColor.a);\n#endif";
                shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", customBlendMap)
            }
        };
        mesh.material.onBeforeCompile = _onBeforeCompile;
        mesh.material.customProgramCacheKey = () => {
            return `${mesh.material.type}${shaderKey}`;
        };

        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: mesh.material.alphaTest,
            map: mesh.material.alphaTest ? mesh.material.map : null,
            onBeforeCompile: _onBeforeCompile,
            customProgramCacheKey: () => {
                return `${mesh.material.type}${shaderKey}_depth`;
            },
        });
    }

    injectShaders(shader, commonParams, shaderParams) {
        shader.vertexShader = "attribute float shader_instance_depth;\nattribute float shader_instance_position;\nattribute float shader_random_rotation;\nuniform float tex_repeat;\nattribute float shader_cell_size;\nuniform float bevelSize;\n" + shader.vertexShader;
        if (Object.keys(shaderParams).some((k) => this.shaderLib[k].useNoise)){     
            shader.vertexShader = noiseShaders.snoise + "\n" + shader.vertexShader;
            shader.fragmentShader = noiseShaders.snoise + "\n" + shader.fragmentShader;
        }
        shader.vertexShader = shader.vertexShader.replace("#include <fog_vertex>", "shader_vPosition = vec3(transformed);\nshader_vUv = ( uvTransform * vec3( uv, 1 ) ).xy;\nshader_vNormal = normal;\n#include <fog_vertex>");
        shader.vertexShader = shader.vertexShader.replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\n #ifdef USE_UV\n#else\nuniform mat3 uvTransform;\n#endif");
        shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
        #ifdef USE_UV
        vUv *= tex_repeat;
        #endif
        if(bevelSize != -9999.0){
        #ifdef USE_UV
        if(normal.y < 0.5){
            vUv.y = vUv.y*shader_cell_size;
        }
        float angle = shader_random_rotation;
        float s = sin(angle);
        float c = cos(angle);
        vec2 c_uv = vUv;
        vUv.x = c_uv.x * c - c_uv.y * s;
        vUv.y = c_uv.x * s + c_uv.y * c;
        #endif
        if(transformed.y < 1.0 && transformed.y > 0.5){
            transformed.y = transformed.y + (bevelSize - bevelSize/shader_cell_size);
        }
        if(transformed.y < 0.5 && transformed.y > 0.0){
            transformed.y = transformed.y - (bevelSize - bevelSize/shader_cell_size);
        }
        }
        `,
        );
        shader.fragmentShader = `
        vec4 getMappedTexel( sampler2D tex, vec2 uv ) {
            vec4 texelColor = texture2D( tex, uv );
            texelColor.r = pow((texelColor.r + 0.055) / 1.055, 2.4);
            texelColor.g = pow((texelColor.g + 0.055) / 1.055, 2.4);
            texelColor.b = pow((texelColor.b + 0.055) / 1.055, 2.4);
            return texelColor;
        }
        ` + shader.fragmentShader;
        for (const [shaderId, shaderConfig] of Object.entries(this.shaderLib)) {
            if(!shaderParams[shaderId]?.enabled && shaderId !== "defaults") continue;
            const { vertexShader, fragmentShader, uniforms, varying } = shaderConfig;
            let uniformsVarying = `uniform bool ${shaderId + "_enabled"};`;
            for (const [name, value] of Object.entries(varying)) {
                uniformsVarying += `varying ${value.type} ${shaderId == "defaults" ? name : shaderId + "_" + name};\n`;
                shader.uniforms[shaderId == "defaults" ? name : shaderId + "_" + name] = { value: shaderId == "defaults" ? commonParams[name] ?? (typeof value.value == "function" ? value.value() : value.value) : value.default };
            }
            for (const [name, value] of Object.entries(uniforms)) {
                uniformsVarying += `uniform ${value.type} ${shaderId == "defaults" ? name : shaderId + "_" + name};\n`;
                shader.uniforms[shaderId == "defaults" ? name : shaderId + "_" + name] = { value: shaderId == "defaults" ? commonParams[name] ?? (typeof value.value == "function" ? value.value() : value.value) : value.default };
            }
            for (const vertex of vertexShader) {
                shader.vertexShader = this.injectString(vertex, shader.vertexShader, shaderId);
            }
            for (const fragment of fragmentShader) {
                shader.fragmentShader = this.injectString(fragment, shader.fragmentShader, shaderId);
            }
            shader.vertexShader = uniformsVarying + shader.vertexShader;
            shader.fragmentShader = uniformsVarying + shader.fragmentShader;
        }
    }

    injectString(inject, shader, shaderId) {
        const mode = inject.mode ?? SHADERS_CONSTS.APPEND;
        const injectionPoint = inject.injectionPoint;
        const originalShaderCode = inject.shaderCode;
        const shaderCode = inject.noConditional ? `\n${originalShaderCode}\n` : `if(${shaderId + "_enabled"}){\n${originalShaderCode}\n}`;
        switch (mode) {
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

    setUniforms(shader, shaderParams) {
        for (const [name, shaderData] of Object.entries(this.shaderLib)) {
            if (name === "defaults") continue;
            shader.uniforms[`${name + "_enabled"}`] = { value: shaderParams[name]?.enabled ? true : false };
            for (const [uniformName, value] of Object.entries(shaderData.uniforms)) {
                const paramValue = shaderParams[name]?.[uniformName] ?? value.default;
                const isColor = uniformName.toLowerCase().includes("color");
                const isTexture = uniformName.toLowerCase().includes("texture");
                const isAngle = uniformName.toLowerCase().includes("direction") || uniformName.toLowerCase().includes("angle");
                let finalValue = paramValue;
                if (isColor) finalValue = new THREE.Color(paramValue);
                if (isTexture) {
                    const hpInputName = game.Levels3DPreview._heightmapPainter?.input?.name;
                    const hasPreview = hpInputName && hpInputName.includes(name) && hpInputName.includes(uniformName);
                    if (hasPreview) {
                        finalValue = new THREE.CanvasTexture(game.Levels3DPreview._heightmapPainter.canvas);
                        game.Levels3DPreview._heightmapPainter.CanvasTexture = finalValue;
                    } else {
                        finalValue = game.Levels3DPreview.helpers.loadTextureSync(paramValue);
                    }
                    if (finalValue) {    
                        finalValue.wrapS = THREE.RepeatWrapping;
                        finalValue.wrapT = THREE.RepeatWrapping;
                        if(value.flipY !== undefined) finalValue.flipY = value.flipY;
                        shader.uniforms[`${name + "_" + uniformName}`] = { value: finalValue };
                    } else {
                        game.Levels3DPreview.helpers.loadTexture(paramValue).then((texture) => {
                            finalValue = texture;
                            if(!finalValue) return;
                            finalValue.wrapS = THREE.RepeatWrapping;
                            finalValue.wrapT = THREE.RepeatWrapping;
                            if(value.flipY !== undefined) finalValue.flipY = value.flipY;
                            shader.uniforms[`${name + "_" + uniformName}`] = { value: finalValue };
                        });
                    }
                }
                if (isAngle) finalValue = Math.toRadians(paramValue);
                shader.uniforms[`${name + "_" + uniformName}`] = { value: finalValue };
            }
        }
    }

    updateShaders(delta, tokens, sound, obstructing) {
        const v4 = new THREE.Vector4();
        this.shaders = this.shaders.filter((shader) => {
            if (shader.entity3D._destroyed) return false;
            shader.uniforms.time.value = delta / 100;
            shader.uniforms.yPos.value = getYpos(shader.entity3D);
            shader.uniforms.tokens.value = tokens;
            shader.uniforms.sound.value = sound;
            shader.uniforms.obstructing.value = obstructing ? obstructing.get(shader.entity3D) ?? v4 : v4;
            if (this._sceneUniformsNeedUpdate) {
                shader.uniforms.sceneSize.value = shaders.defaults.uniforms.sceneSize.value();
                shader.uniforms.gridSize.value = shaders.defaults.uniforms.gridSize.value();
                shader.uniforms.gridMinX.value = shaders.defaults.uniforms.gridMinX.value();
                shader.uniforms.gridMinY.value = shaders.defaults.uniforms.gridMinY.value();
                shader.uniforms.gridType.value = shaders.defaults.uniforms.gridType.value();
                shader.uniforms.gridAlpha.value = shaders.defaults.uniforms.gridAlpha.value();
                shader.uniforms.gridColor.value = shaders.defaults.uniforms.gridColor.value();
            }
            return true;
        });
        this._sceneUniformsNeedUpdate = false;
    }

    dispose() {
        Hooks.off("canvasReady", this._sceneReadyHook);
        Hooks.off("updateScene", this._sceneUpdateHook);
    }
}

export const SHADERS_CONSTS = {
    REPLACE: "replace",
    APPEND: "append",
    PREPEND: "prepend",
};

export const shaders = {
    defaults: {
        uniforms: {
            time: {
                type: "float",
                value: 0,
            },
            tokens: {
                type: "vec4[100]",
                value: new Float32Array(100 * 4),
            },
            sound: {
                type: "vec3",
                value: new THREE.Vector3(1, 1, 1),
            },
            obstructing: {
                type: "vec4",
                value: new THREE.Vector4(0, 0, 0, 0),
            },
            mDepth: {
                type: "float",
                value: 0,
            },
            mWidth: {
                type: "float",
                value: 0,
            },
            mHeight: {
                type: "float",
                value: 0,
            },
            yPos: {
                type: "float",
                value: 0,
            },
            localSize: {
                type: "vec3",
                value: new THREE.Vector3(0, 0, 0),
            },
            textureRepeat: {
                type: "float",
                value: 1,
            },
            gridColor: {
                type: "vec3",
                value: () => {
                    return new THREE.Color(canvas.scene.grid.color);
                },
            },
            gridAlpha: {
                type: "float",
                value: () => {
                    return canvas.scene.grid.alpha;
                },
            },
            gridSize: {
                type: "float",
                value: () => {
                    return canvas.scene.grid.size / factor;
                },
            },
            gridType: {
                type: "float",
                value: () => {
                    return canvas.scene.grid.type;
                },
            },
            gridMinX: {
                type: "float",
                value: () => {
                    return 0;//(canvas.grid.grid._bounds?.minX ?? 0) / factor;
                },
            },
            gridMinY: {
                type: "float",
                value: () => {
                    return 0;//(canvas.grid.grid._bounds?.minY ?? 0) / factor;
                },
            },
            sceneSize: {
                type: "vec4",
                value: () => { 
                    return new THREE.Vector4(canvas.scene.dimensions.sceneWidth / factor, canvas.scene.dimensions.sceneHeight / factor, canvas.scene.dimensions.sceneX / factor, canvas.scene.dimensions.sceneY / factor);
                },
            }
        },
        varying: {
            shader_vPosition: {
                type: "vec3",
                value: new THREE.Vector3(0, 0, 0),
            },
            shader_vUv: {
                type: "vec2",
                value: new THREE.Vector2(0, 0),
            },
            shader_vNormal: {
                type: "vec3",
                value: new THREE.Vector3(0, 0, 0),
            },
        },
        vertexShader: [],
        fragmentShader: [],
    },
    idle: {
        icon: `<i class="fas fa-walking"></i>`,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            direction: {
                type: "float",
                default: 0,
                min: 0,
                max: 360,
            },
            intensity: {
                type: "float",
                default: 0.3,
            },
            affect_model: {
                type: "float",
                default: 0.7,
                min: 0.01,
                max: 1,
            },
        },
        varying: {},
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                float currentY = (modelMatrix * vec4( transformed, 1.0 )).y;
                float currentYDelta = currentY - yPos;
                float idleFactor = 0.0;
                vec3 idleOffset = vec3(0.0);
                float idle_intensity_final = idle_intensity / 100.0;
                if (currentYDelta > mDepth*idle_affect_model) {
                    idleFactor = (currentYDelta - mDepth*idle_affect_model) / (mDepth*idle_affect_model);
                    idleFactor = (sin(time*idle_speed + transformed.x + transformed.z + transformed.y) + idle_intensity_final) * idleFactor;
                    idleOffset = vec3(idleFactor * idle_intensity_final * cos(idle_direction) * localSize.x, idleFactor *  idle_intensity_final * cos(sin(idle_direction)) * localSize.y, idleFactor *  idle_intensity_final * sin(idle_direction) * localSize.z);
                }
                transformed = vec3( transformed.x + idleOffset.x, transformed.y + idleOffset.y, transformed.z + idleOffset.z );
                `,
            },
        ],
        fragmentShader: [],
    },
    wind: {
        icon: `<i class="fas fa-wind"></i>`,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            direction: {
                type: "float",
                default: 0,
                min: 0,
                max: 360,
            },
            intensity: {
                type: "float",
                default: 0.5,
            },
            affect_model: {
                type: "float",
                default: 0.5,
                min: 0.01,
                max: 1,
            },
            convoluted: {
                type: "bool",
                default: false,
            },
            /*reactive: {
                type: "bool",
                default: false,
            },
            reactive_intensity: {
                type: "float",
                default: 1.0,
                min: 0.01,
                max: 10,
            },*/
            ground_blend: {
                type: "float",
                default: 0,
                min: 0,
                max: 1,
            },
            ground_color: {
                type: "vec3",
                default: "#ffffff",
            },
        },
        varying: {
            ground_blend_percent: {
                type: "float",
                value: 0,
            },
        },
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                float useY = yPos;
                float useDepth = mDepth;
                mat4 current_matrix = modelMatrix;
                #ifdef USE_INSTANCING
                current_matrix = instanceMatrix;
                if(shader_instance_position > -999999999999999.0) {
                    useY = shader_instance_position;
                    if(shader_instance_depth > 0.0){
                        useDepth = shader_instance_depth;
                    }
                }
                #endif
                float currentY = (current_matrix * vec4( transformed, 1.0 )).y;
                float currentYDelta = currentY - useY;
                wind_ground_blend_percent = max(0.0, currentYDelta / useDepth);
                float windFactor = 0.0;
                vec2 windOffset = vec2(0.0);


                //Reactive Removed due to performance issues


                if (currentYDelta > useDepth*wind_affect_model) {
                    windFactor = (currentYDelta - useDepth*wind_affect_model) / (useDepth*wind_affect_model);
                    if(wind_convoluted) {
                        windFactor = (sin(time*wind_speed + transformed.x + transformed.z) + wind_intensity) * windFactor;
                    }else{
                        windFactor = (sin(time*(wind_speed)) + wind_intensity) * windFactor;
                    }
                    windOffset += vec2(windFactor * wind_intensity * cos(wind_direction) * localSize.x, windFactor *  wind_intensity * sin(wind_direction) * localSize.z);
                }
                
                transformed = vec3( transformed.x + windOffset.x, transformed.y, transformed.z + windOffset.y );
                `,
            },
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                if(wind_ground_blend_percent < wind_ground_blend && wind_ground_blend > 0.0) {
                    float ground_blend_factor = 1.0 - wind_ground_blend_percent / wind_ground_blend;
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, wind_ground_color, ground_blend_factor);
                }
                `,
            },
        ],
    },
    distortion: {
        icon: `<i class="fas fa-wave-square"></i>`,
        useNoise: true,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            direction: {
                type: "float",
                default: 0,
                min: 0,
                max: 360,
            },
            intensity: {
                type: "float",
                default: 0.1,
            },
            convoluted: {
                type: "bool",
                default: false,
            },
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
                transformed = vec3( transformed.x + displaceOffset.x, transformed.y + displaceOffset.y, transformed.z + displaceOffset.z );`,
            },
        ],
        fragmentShader: [],
    },
    water: {
        icon: `<i class="fas fa-water"></i>`,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            direction: {
                type: "float",
                default: 45,
                min: 0,
                max: 360,
            },
            wave_height: {
                type: "float",
                default: 0.3,
            },
            wave_amplitude: {
                type: "float",
                default: 5,
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
                    float posX = (transformed.x - mWidth)*cos(water_direction) ;
                    float posZ = (transformed.z - mHeight)*sin(water_direction) ;
                    float timeSpeed = time * water_speed;
                    float r = sqrt (posX*posX + posZ*posZ)*(water_wave_amplitude) + timeSpeed;
                    yDisplace = (1.0 + sin(r)) * water_wave_height * mDepth;
                    if( transformed.y + yDisplace <= 0.0 ) {
                        yDisplace = 0.0;
                    }
                }
                transformed = vec3( transformed.x, transformed.y + yDisplace, transformed.z);`,
            },
        ],
        fragmentShader: [],
    },
    ocean: {
        icon: `<i class="fas fa-fish"></i>`,
        useNoise: true,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            scale: {
                type: "float",
                default: 1,
            },
            waveA_wavelength: {
                type: "float",
                default: 0.6,
            },
            waveA_steepness: {
                type: "float",
                default: 0.3,
                min: 0.01,
                max: 1,
            },
            waveA_direction: {
                type: "float",
                default: 90,
                min: 0,
                max: 360,
            },
            waveB_wavelength: {
                type: "float",
                default: 0.3,
            },
            waveB_steepness: {
                type: "float",
                default: 0.25,
                min: 0.01,
                max: 1,
            },
            waveB_direction: {
                type: "float",
                default: 260,
                min: 0,
                max: 360,
            },
            waveC_wavelength: {
                type: "float",
                default: 0.2,
            },
            waveC_steepness: {
                type: "float",
                default: 0.35,
                min: 0.01,
                max: 1,
            },
            waveC_direction: {
                type: "float",
                default: 180,
                min: 0,
                max: 360,
            },
            foam: {
                type: "bool",
                default: false,
            },
            /*"reflections": {
                type: "bool",
                default: false,
            },*/
        },
        varying: {
            foam_factor: {
                type: "float",
                default: 0.0,
            },
        },
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                vec4 _WaveA = vec4(1.0, ocean_waveA_direction, ocean_waveA_steepness, ocean_waveA_wavelength * ocean_scale);
                vec4 _WaveB = vec4(1.0, ocean_waveB_direction, ocean_waveA_steepness, ocean_waveB_wavelength * ocean_scale);
                vec4 _WaveC = vec4(1.0, ocean_waveC_direction, ocean_waveA_steepness, ocean_waveC_wavelength * ocean_scale);
                vec4 _WaveD = (_WaveA + _WaveB) * _WaveC;
                vec4 _WaveE = (_WaveA + _WaveC) * _WaveB;
                vec4 _WaveF = (_WaveC + _WaveB) * _WaveA;
                vec3 gridPoint = transformed.xyz;
                vec3 tangent = vec3(1.0, 0.0, 0.0);
                vec3 binormal = vec3(0.0, 0.0, 1.0);
                vec3 p = gridPoint;
                p += GerstnerWave(_WaveA, gridPoint, tangent, binormal, ocean_speed) ;
                p += GerstnerWave(_WaveB, gridPoint, tangent, binormal, ocean_speed) ;
                p += GerstnerWave(_WaveC, gridPoint, tangent, binormal, ocean_speed) ;
                p += GerstnerWave(_WaveD, gridPoint, tangent, binormal, ocean_speed) ;
                p += GerstnerWave(_WaveE, gridPoint, tangent, binormal, ocean_speed) ;
                p += GerstnerWave(_WaveF, gridPoint, tangent, binormal, ocean_speed) ;
                vec3 ocean_normal = normalize(cross(tangent, binormal));
                if(ocean_foam){
                    ocean_foam_factor = pow(ocean_normal.y, 4.0);
                }
                transformed = p;
                `,
            },
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                if(ocean_foam){
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 1.0, 1.0), ocean_foam_factor * 0.5);
                }
                `,
            },
        ],
    },
    orbit: {
        icon: `<i class="fa-regular fa-planet-ringed"></i>`,
        uniforms: {
            orbit_speed: {
                type: "float",
                default: 0.1,
            },
            radius: {
                type: "float",
                default: 1,
            },
            pivot_speed: {
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
                    float orbit_timeSpeed = time * orbit_orbit_speed;
                    float pivot_timeSpeed = time * orbit_pivot_speed;
                    
                    mat4 pivot = mat4(
                        cos(pivot_timeSpeed), 0, sin(pivot_timeSpeed), 0,
                        0, 1, 0, 0,
                        -sin(pivot_timeSpeed), 0, cos(pivot_timeSpeed), 0,
                        0, 0, 0, 1
                    );
                    transformed = (pivot * vec4(transformed, 1)).xyz;

                    float radius = orbit_radius;
                    float x = radius * cos(orbit_timeSpeed) + transformed.x;
                    float z = radius * sin(orbit_timeSpeed) + transformed.z;
                    transformed = vec3(x, transformed.y, z);
                `,
            },
        ],
        fragmentShader: [],
    },
    bounce: {
        icon: `<i class="fa-solid fa-reel"></i>`,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            strength: {
                type: "float",
                default: 1,
            },
            axisX: {
                type: "float",
                default: 0,
            },
            axisZ: {
                type: "float",
                default: 0,
            },
            axisY: {
                type: "float",
                default: 1,
            },
        },
        varying: {},
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                    float bounce_timeSpeed = time * bounce_speed;
                    float bounce = sin(bounce_timeSpeed) * bounce_strength;
                    transformed = vec3(transformed.x + bounce * bounce_axisX, transformed.y + bounce * bounce_axisY, transformed.z + bounce * bounce_axisZ);
                `,
            },
        ],
        fragmentShader: [],
    },
    clipping: {
        icon: `<i class="fas fa-scissors"></i>`,
        useNoise: true,
        uniforms: {
            heightOffset: {
                type: "float",
                default: 200,
            },
            diameter: {
                type: "float",
                default: 500,
            },
            speed: {
                type: "float",
                default: 0.1,
            },
            noiseScale: {
                type: "float",
                default: 1,
            },
            useCamera: {
                type: "bool",
                default: false,
            },
            useCameraAdvanced: {
                type: "bool",
                default: false,
            }
        },
        varying: {},
        vertexShader: [
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                if( tokens[0].w > 0.0) {
                    float adj_clipping_heightOffset = clipping_heightOffset / 1000.0;
                    float adj_clipping_diameter = clipping_diameter / 1000.0;
                    vec3 currentToken = clipping_useCamera ? cameraPosition : tokens[0].xyz;
                    currentToken = clipping_useCameraAdvanced ? obstructing.xyz : currentToken;
                    float distance2D = distance(vec2(vWorldPositionFoW.x, vWorldPositionFoW.z), vec2(currentToken.x, currentToken.z));
                    if(distance2D < adj_clipping_diameter && vWorldPositionFoW.y > (tokens[0].y + adj_clipping_heightOffset)){
                        float ts = time * 0.001 * clipping_speed;
                        float gradientBorderSize = 0.05;
                        float noise_factor = 1.0 - ((gradientBorderSize - abs(vWorldPositionFoW.y - (tokens[0].y + adj_clipping_heightOffset))) / gradientBorderSize) * (gradientBorderSize - abs(distance2D - adj_clipping_diameter)) / gradientBorderSize;

                        if(noise_factor <= 0.9 && (Perlin3D(vec3(vWorldPositionFoW.x + ts, vWorldPositionFoW.y + ts, vWorldPositionFoW.z + ts)*(100.0/clipping_noiseScale)) - noise_factor) > 0.1) {
                            discard;
                        }
                    }
                }
                `
            }
        ],
    },
    grid: {
        icon: `<i class="fas fa-grid"></i>`,
        uniforms: {
            normalCulling: {
                type: "float",
                default: 0.0,
                min: 0.0,
                max: 0.99,
            },
            heightCulling: {
                type: "float",
                default: 1,
                min: 0,
                max: 1,
            },
            showBounds: {
                type: "bool",
                default: false,
            },
        },
        varying: {
            height_percent: {
                type: "float",
            },
        },
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                if(grid_heightCulling < 1.0){
                    float gird_currentY = vWorldPositionFoW.y;
                    float gird_useY = yPos;
                    #ifdef USE_INSTANCING
                        if(shader_instance_position > -999999999999999.0) {
                            gird_useY = shader_instance_position;
                        }
                    #endif
                    float gird_currentYDelta = gird_currentY - gird_useY;
                    grid_height_percent = clamp(gird_currentYDelta / mDepth, 0.0, 1.0);
                }else{
                    grid_height_percent = 0.0;
                }
                `,
            },
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                if(grid_height_percent <= grid_heightCulling && abs(shader_vNormal.y) > grid_normalCulling){
                    if(grid_showBounds){
                       float thickness = 0.01 * 0.5;
                        vec4 paddingRectOuter = vec4(0.0 - thickness, 0.0 - thickness, sceneSize.x + sceneSize.z * 2.0 + thickness, sceneSize.y + sceneSize.a * 2.0 + thickness);
                        vec4 paddingRectInner = vec4(0.0 + thickness, 0.0 + thickness, sceneSize.x + sceneSize.z * 2.0 - thickness, sceneSize.y + sceneSize.a * 2.0 - thickness);

                        vec4 sceneRectOuter = vec4(sceneSize.z - thickness, sceneSize.a - thickness, sceneSize.x + sceneSize.z + thickness, sceneSize.y + sceneSize.a + thickness);
                        vec4 sceneRectInner = vec4(sceneSize.z + thickness, sceneSize.a + thickness, sceneSize.x + sceneSize.z - thickness, sceneSize.y + sceneSize.a - thickness);

                        bool isPadding = (vWorldPositionFoW.x > paddingRectOuter.x && vWorldPositionFoW.x < paddingRectOuter.z && vWorldPositionFoW.z > paddingRectOuter.y && vWorldPositionFoW.z < paddingRectOuter.w) && (vWorldPositionFoW.x < paddingRectInner.x || vWorldPositionFoW.x > paddingRectInner.z || vWorldPositionFoW.z < paddingRectInner.y || vWorldPositionFoW.z > paddingRectInner.w);
                        bool isScene = (vWorldPositionFoW.x > sceneRectOuter.x && vWorldPositionFoW.x < sceneRectOuter.z && vWorldPositionFoW.z > sceneRectOuter.y && vWorldPositionFoW.z < sceneRectOuter.w) && (vWorldPositionFoW.x < sceneRectInner.x || vWorldPositionFoW.x > sceneRectInner.z || vWorldPositionFoW.z < sceneRectInner.y || vWorldPositionFoW.z > sceneRectInner.w);


                        if(isPadding || isScene){
                            gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridAlpha);
                        }
                    }
                    if(gridType == 1.0){
                        if( (mod(vWorldPositionFoW.x, gridSize) < 0.0015 || mod(vWorldPositionFoW.z, gridSize) < 0.0015)){
                            gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridAlpha);
                        }
                    }else{
                        vec2 s = gridType > 3.0 ? vec2(1.7320508, 1) : vec2(1, 1.7320508);
                        
                        vec2 gridOffset = vec2(gridMinX ,gridMinY);
                        
                        vec2 misteryAdjustment = vec2(0.0, 0.0);

                        if(gridType == 2.0){
                            misteryAdjustment = vec2( gridSize*0.5 + 0.96 * 0.5*gridSize/1.7320508, gridSize * 1.02);
                        }else if(gridType == 3.0){
                            misteryAdjustment = vec2( gridSize*0.5 + 1.02 * 1.7320508 * gridSize, gridSize * 1.02);
                        }else if(gridType == 4.0){
                            misteryAdjustment = vec2(gridSize * 1.02, gridSize*0.5 +  0.96 * 0.5*gridSize/1.7320508);
                        }else if(gridType == 5.0){
                            misteryAdjustment = vec2(gridSize * 1.02, gridSize*0.5 + 1.02 * 1.7320508 * gridSize);
                        }
                        
                        vec2 u = vec2(vWorldPositionFoW.x, vWorldPositionFoW.z) + gridOffset + misteryAdjustment;
    
                        vec2 p = u*(1.0/(gridSize)) + s.yx;
                        vec4 hC = gridType > 3.0 ? floor(vec4(p, p - vec2(1, .5))/s.xyxy) + 0.5 : floor(vec4(p, p - vec2(.5, 1))/s.xyxy) + 0.5;
                        vec4 h = vec4(p - hC.xy*s, p - (hC.zw + .5)*s);
                        vec4 hex = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
                        
                        p = abs(hex.xy);
                        float eDist = gridType > 3.0 ? max(dot(p, s*0.5), p.y) : max(dot(p, s*0.5), p.x);
                    
                        gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor , smoothstep(0.0, 0.0, eDist - 0.5 + 0.01) * gridAlpha);     
                    }
                }
                `,
            },
        ],
    },
    textureScroll: {
        icon: `<i class="fas fa-angle-double-right"></i>`,
        uniforms: {
            speedX: {
                type: "float",
                default: 0.01,
            },
            speedY: {
                type: "float",
                default: 0.01,
            },
            direction: {
                type: "float",
                default: 0,
                min: 0,
                max: 360,
            },
        },
        varying: {},
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                #ifdef USE_UV
                vUv.x += time * textureScroll_speedX * cos(textureScroll_direction);
                vUv.y += time * textureScroll_speedY * sin(textureScroll_direction);
                #endif
                `,
            },
        ],
        fragmentShader: [],
    },
    textureRotate: {
        icon: `<i class="fas fa-sync-alt"></i>`,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            offsetAngle: {
                type: "float",
                default: 0,
                min: 0,
                max: 360,
            },
            centerx: {
                type: "float",
                default: 0.5,
                min: 0,
                max: 1,
            },
            centery: {
                type: "float",
                default: 0.5,
                min: 0,
                max: 1,
            },
        },
        varying: {},
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                #ifdef USE_UV
                vec2 textureRotate_center_uv = vec2(textureRotate_centerx + 0.0001, textureRotate_centery + 0.0001);
                vec2 textureRotate_center = textureRotate_center_uv * textureRepeat;
                float textureRotate_r = distance(vUv, textureRotate_center);
                vec2 textureRotate_vUv = (vUv - textureRotate_center) / textureRotate_center_uv;
                float textureRotate_angle = atan(textureRotate_vUv.y, textureRotate_vUv.x);
                textureRotate_angle = textureRotate_angle + time * 0.1 * textureRotate_speed + textureRotate_offsetAngle;
                vec2 textureRotate_newUv = vec2(cos(textureRotate_angle), sin(textureRotate_angle)) * textureRotate_r;
                vUv = (textureRotate_newUv) + textureRotate_center;
                #endif
                `,
            },
        ],
        fragmentShader: [],
    },
    fire: {
        icon: `<i class="fas fa-fire"></i>`,
        useNoise: true,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            intensity: {
                type: "float",
                default: 0.5,
                min: 0.01,
                max: 2,
            },
            scale: {
                type: "float",
                default: 1,
            },
            color: {
                type: "vec3",
                default: "#ff9500",
            },
            blendMode: {
                type: "bool",
                default: false,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                vec2 noiseSampler = shader_vUv;
                #ifdef USE_UV
                    noiseSampler = vec2(vUv);
                #endif
                noiseSampler /= 2.0;
                vec3 c1 = fire_color*0.1;
                vec3 c2 = fire_color*0.7;
                vec3 c3 = fire_color*0.2;
                vec3 c4 = fire_color*vec3(1.0, 0.9, 1.0);
                vec3 c5 = vec3(0.1);
                vec3 c6 = vec3(0.9);
                vec2 p = noiseSampler.xy * 8.0 * fire_scale * 2.0;
                float fire_time = time * fire_speed;
                float q = fbm(p - fire_time * 0.1);
                vec2 r = vec2(fbm(p + q + fire_time * 0.7 - p.x - p.y), fbm(p + q - fire_time * 0.4));
                vec3 c = mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);
                vec4 fire_finalColor = vec4(c * cos(1.57 * noiseSampler.y / textureRepeat), 1.0);
                if(fire_blendMode){
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, fire_finalColor.rgb, fire_intensity);
                }else{
                    gl_FragColor.rgb += (fire_finalColor.rgb * fire_intensity);
                }
                `,
            },
        ],
    },
    ice: {
        icon: `<i class="fas fa-icicles"></i>`,
        useNoise: true,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            intensity: {
                type: "float",
                min: 0.01,
                max: 2,
                default: 1,
            },
            grain: {
                type: "float",
                default: 0.5,
            },
            scale: {
                type: "float",
                default: 1,
            },
            color: {
                type: "vec3",
                default: "#abe5e8",
            },
            blendMode: {
                type: "bool",
                default: false,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                vec2 noiseSampler = shader_vUv;
                #ifdef USE_UV
                    noiseSampler = vec2(vUv);
                #endif
                noiseSampler /= 2.0;
                vec3 c1 = ice_color*0.1;
                vec3 c2 = ice_color*0.7;
                vec3 c3 = ice_color*0.2;
                vec3 c4 = ice_color*vec3(1.0, 0.9, 1.0);
                vec3 c5 = vec3(0.1);
                vec3 c6 = vec3(0.9);
                vec2 p = noiseSampler.xy * 8.0 * ice_scale * 3.0;
                float ice_time = time * ice_speed * 0.3;
                float final_ice_grain = ice_grain / textureRepeat * 1000.0;
                float q = fbm3D(vec3(p.xy - final_ice_grain * 0.1, noiseSampler.x * noiseSampler.y * final_ice_grain * 0.7));
                vec2 r = vec2(fbm(p + q + ice_time * 0.7 - p.x - p.y), fbm(p + q - ice_time * 0.4));
                vec3 c = mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);
                vec4 ice_finalColor = vec4(c * cos(1.57 * noiseSampler.y / textureRepeat), 1.0);
                if(ice_blendMode){
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, ice_finalColor.rgb, ice_intensity);
                }else{
                    gl_FragColor.rgb += (ice_finalColor.rgb * ice_intensity);
                    }
                `,
            },
        ],
    },
    lightning: {
        icon: `<i class="fas fa-bolt"></i>`,
        useNoise: true,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            intensity: {
                type: "float",
                min: 0.01,
                max: 2,
                default: 0.5,
            },
            scale: {
                type: "float",
                default: 1,
            },
            color: {
                type: "vec3",
                default: "#0037ff",
            },
            blendMode: {
                type: "bool",
                default: false,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                vec3 noiseVec = vWorldPositionFoW;          
                
                vec3 lightning_final_color = vec3( 0.0 );
                for( int i = 0; i < 5; ++i ) {
                    noiseVec = noiseVec.zyx * lightning_scale * 2.0;
                    float t = abs(2.0 / (fbm3D(noiseVec + vec3(0.0, (time * lightning_speed) / float(i + 4), 0.0)) * 120.0));
                    lightning_final_color +=  t * vec3( float(i+1) * 0.1 +lightning_color.r, lightning_color.g, lightning_color.b );
                }    
                if(lightning_blendMode){
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, lightning_final_color, lightning_intensity);
                }else{
                    gl_FragColor.rgb += lightning_final_color * lightning_intensity;
                }
                `,
            },
        ],
    },
    oil: {
        icon: `<i class="fas fa-tint"></i>`,
        useNoise: true,
        uniforms: {
            speed: {
                type: "float",
                default: 0.02,
            },
            intensity: {
                type: "float",
                default: 0.5,
                min: 0.01,
                max: 2,
            },
            scale: {
                type: "float",
                default: 5,
            },
            color: {
                type: "vec3",
                default: "#00ff00",
            },
            blendMode: {
                type: "bool",
                default: false,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                vec3 noiseSampler = vWorldPositionFoW;
                vec3 c1 = oil_color*0.1;
                vec3 c2 = oil_color*0.7;
                vec3 c3 = oil_color*0.2;
                vec3 c4 = oil_color*vec3(1.0, 0.9, 1.0);
                vec3 c5 = vec3(0.1);
                vec3 c6 = vec3(0.9);
                vec3 p = noiseSampler.xyz * 8.0 * oil_scale;
                float oil_time = time * oil_speed;
                float q = fbm3D(p - oil_time * 0.1);
                vec2 r = vec2(fbm3D(p + q + oil_time * 0.7 - p.x - p.y - p.z), fbm3D(p + q - oil_time * 0.4));
                vec3 c = mix(c1, c2, fbm3D(p + r.x + r.y)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);
                vec4 oil_finalColor = vec4(c * cos(1.57 * noiseSampler.y / textureRepeat), 1.0);
                if(oil_blendMode){
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, oil_finalColor.rgb, oil_intensity);
                }else{
                    gl_FragColor.rgb += (oil_finalColor.rgb * oil_intensity);
                }
                `,
            },
        ],
    },
    colorwarp: {
        icon: `<i class="fas fa-palette"></i>`,
        useNoise: true,
        uniforms: {
            speed: {
                type: "float",
                default: 0.1,
            },
            glow: {
                type: "float",
                default: 1,
                min: 0,
                max: 2,
            },
            hue_angle: {
                type: "float",
                default: 0,
                min: 0,
                max: 360,
            },
            flicker: {
                type: "bool",
                default: false,
            },
            animate_range: {
                type: "float",
                default: 0.5,
                min: 0,
                max: 1,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                float colorwarp_time_fac = 1.0;
                float noise = colorwarp_flicker ? noise(vec2(time*0.05, time*0.05)) : 1.0;
                colorwarp_time_fac = (sin(time * colorwarp_speed * noise) + 1.0) * 0.5;
                if(colorwarp_glow > 0.0){
                    gl_FragColor.rgb = gl_FragColor.rgb * (1.0 + (colorwarp_glow * (1.0 - colorwarp_animate_range)) + (colorwarp_glow * colorwarp_animate_range) * colorwarp_time_fac);
                }
                if(colorwarp_hue_angle > 0.0){
                    gl_FragColor.rgb = hueShift(gl_FragColor.rgb, ((colorwarp_hue_angle * (1.0 - colorwarp_animate_range)) + (colorwarp_hue_angle * colorwarp_animate_range) * colorwarp_time_fac));
                }
                `,
            },
        ],
    },
    mask: {
        icon: `<i class="fas fa-mask"></i>`,
        flipY: true,
        uniforms: {
            textureMask: {
                type: "sampler2D",
                default: null,
            },
            textureDiffuse: {
                type: "sampler2D",
                default: null,
            },
            color: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat: {
                type: "float",
                default: 1,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <map_fragment>",
                shaderCode: `
                #ifdef USE_UV
                if(shader_vNormal.y > 0.0) {
                    vec2 mask_vUv = vec2(vUv.x, vUv.y) * (mask_repeat);
                    vec4 maskTexture = texture( mask_textureMask, vUv );
                    vec4 maskDiffuseTexture = sRGBToLinear(texture( mask_textureDiffuse, mask_vUv ));
                    maskDiffuseTexture.a *= texelColor.a;
                    maskDiffuseTexture.rgb *= mask_color;
                    texelColor = mix(texelColor, maskDiffuseTexture, maskTexture.r);
                    diffuseColor = texelColor;
                }
                #endif
                `,
            },
        ],
    },
    noiseMask: {
        icon: `<i class="fas fa-masks-theater"></i>`,
        uniforms: {
            textureNoise1: {
                type: "sampler2D",
                default: null,
            },
            noise1Repeat: {
                type: "float",
                default: 1,
            },
            noise1ScrollX: {
                type: "float",
                default: 0.01,
            },
            noise1ScrollY: {
                type: "float",
                default: 0.01,
            },
            textureNoise2: {
                type: "sampler2D",
                default: null,
            },
            noise2Repeat: {
                type: "float",
                default: 1,
            },
            noise2ScrollX: {
                type: "float",
                default: -0.01,
            },
            noise2ScrollY: {
                type: "float",
                default: -0.01,
            },
            invert: {
                type: "bool",
                default: false,
            },
            textureDiffuse: {
                type: "sampler2D",
                default: null,
            },
            color: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat: {
                type: "float",
                default: 1,
            },
            strength: {
                type: "float",
                default: 1,
                min: 0,
                max: 1,
            },
            maskThreshold: {
                type: "float",
                default: 0,
                min: 0,
                max: 1,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <map_fragment>",
                shaderCode: `
                #ifdef USE_UV
                vec2 noiseMask1_vUv = vec2(vUv.x * noiseMask_noise1Repeat + noiseMask_noise1ScrollX * time, vUv.y * noiseMask_noise1Repeat + noiseMask_noise1ScrollY * time);
                vec2 noiseMask2_vUv = vec2(vUv.x * noiseMask_noise2Repeat + noiseMask_noise2ScrollX * time, vUv.y * noiseMask_noise2Repeat + noiseMask_noise2ScrollY * time);
                vec4 noise1Texture = texture( noiseMask_textureNoise1, noiseMask1_vUv );
                vec4 noise2Texture = texture( noiseMask_textureNoise2, noiseMask2_vUv );
                vec4 maskTexture = noise1Texture * noise2Texture;
                if(noiseMask_invert) maskTexture = vec4(1.0) - maskTexture;
                if(maskTexture.r > noiseMask_maskThreshold){
                    vec2 mask_vUv = vec2(vUv.x, vUv.y) * (noiseMask_repeat);
                    vec4 maskDiffuseTexture = sRGBToLinear(texture( noiseMask_textureDiffuse, mask_vUv ));
                    maskDiffuseTexture.rgb *= noiseMask_color;
                    texelColor = mix(texelColor, maskDiffuseTexture, maskTexture.r * noiseMask_strength);
                    diffuseColor = texelColor;
                }
                #endif
                `,
            },
        ],
    },
    overlay: {
        icon: '<i class="fas fa-images"></i>',
        uniforms: {
            textureDiffuse: {
                type: "sampler2D",
                default: null,
            },
            color: {
                type: "vec3",
                default: "#ffffff",
            },
            strength: {
                type: "float",
                default: 1,
                max: 1,
                min: 0,
            },
            coveragePercent: {
                type: "float",
                default: 1,
                max: 1,
                min: -1,
                step: 0.01,
            },
            inclination: {
                type: "float",
                default: 0,
                max: 1,
                min: -1,
                step: 0.01,
            },
            repeat: {
                type: "float",
                default: 1,
            },
            rotation_angle: {
                type: "float",
                default: 0,
            },
            offsetX: {
                type: "float",
                default: 0,
            },
            offsetY: {
                type: "float",
                default: 0,
            },
            black_alpha: {
                type: "bool",
                default: false,
            },
            add_blend: {
                type: "bool",
                default: false,
            },
            mult_blend: {
                type: "bool",
                default: false,
            },
        },
        varying: {
            height_percent: {
                type: "float",
            },
        },
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                float currentY = (modelMatrix * vec4( transformed, 1.0 )).y;
                float currentYDelta = (currentY - yPos) / mDepth;
                overlay_height_percent = clamp(currentYDelta, 0.0, 1.0);
                `,
            },
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <map_fragment>",
                shaderCode: `
                #ifdef USE_UV
                float percent = overlay_height_percent;
                float absCoverage = abs(overlay_coveragePercent);
                float inversePercent = 1.0 - percent;
                if(
                    (overlay_coveragePercent > 0.0 && percent < (overlay_coveragePercent + 0.05)) ||
                    (overlay_coveragePercent < 0.0 && inversePercent < (absCoverage + 0.05))
                ){
                float strength = overlay_strength;
                if(overlay_coveragePercent > 0.0 && percent > (overlay_coveragePercent)){
                    strength *= (1.0 - (percent - overlay_coveragePercent) * 20.0);
                }
                if(overlay_coveragePercent < 0.0 && inversePercent > (absCoverage)){
                    strength *= (1.0 - (inversePercent - absCoverage) * 20.0);
                }
                float overlaySmoothing = 0.3;
                if(overlay_inclination > 0.0){
                    float o_normalY = max(0.0,shader_vNormal.y);
                    if(o_normalY < overlay_inclination){
                        if(o_normalY > (overlay_inclination - overlaySmoothing)){
                            float diff = o_normalY - (overlay_inclination - overlaySmoothing);
                            strength *= (diff / overlaySmoothing);
                        }else{
                            strength = 0.0;
                        }
                    }
                }
                if(overlay_inclination < 0.0){
                    float o_normalY = max(0.0,shader_vNormal.y);
                    float absInclination = 1.0 - abs(overlay_inclination);
                    if(o_normalY > absInclination){
                        if(o_normalY < (absInclination + overlaySmoothing)){
                            float diff = (absInclination + overlaySmoothing) - o_normalY;
                            strength *= (diff / overlaySmoothing);
                        }else{
                            strength = 0.0;
                        }
                    }
                }
                vec2 overlay_vUv = vec2(vUv.x, vUv.y) * (overlay_repeat);
                overlay_vUv.x += overlay_offsetX;
                overlay_vUv.y += overlay_offsetY;
                vec2 rotation_center = vec2(0.5, 0.5);
                overlay_vUv -= rotation_center;
                overlay_vUv = mat2(cos(overlay_rotation_angle), -sin(overlay_rotation_angle), sin(overlay_rotation_angle), cos(overlay_rotation_angle)) * overlay_vUv;
                overlay_vUv += rotation_center;

                vec4 overlayTexture = sRGBToLinear(texture( overlay_textureDiffuse, overlay_vUv ));
                overlayTexture.a *= texelColor.a;
                if(overlay_black_alpha && overlayTexture.rgb == vec3(0.0)){}
                else{
                    float black_alpha = overlay_black_alpha ? (overlayTexture.r + overlayTexture.g + overlayTexture.b) / 3.0 : 1.0;
                    if(black_alpha > 0.1) black_alpha *= 3.0;
                    black_alpha = clamp(black_alpha, 0.0, 1.0);
                    if(overlay_add_blend){
                        overlayTexture.rgb *= overlay_color;
                        texelColor += overlayTexture*strength*black_alpha;
                    }else if(overlay_mult_blend){
                        overlayTexture.rgb *= overlay_color;
                        texelColor *= overlayTexture*strength*black_alpha;
                    }else{
                        overlayTexture.rgb *= overlay_color;
                        texelColor = mix( texelColor, overlayTexture, strength*black_alpha*overlayTexture.a );
                    }

                }
                diffuseColor = texelColor;
                }
                #endif
                `,
            },
        ],
    },
    colorswap: {
        icon: `<i class="fa-solid fa-fill-drip"></i>`,
        uniforms: {
            sourceColor1: {
                type: "vec3",
                default: "#ff0000",
            },
            targetColor1: {
                type: "vec3",
                default: "#0000ff",
            },
            threshold1: {
                type: "float",
                default: 0.4,
                min: 0,
                max: 1,
            },
            sourceColor2: {
                type: "vec3",
                default: "#ff0000",
            },
            targetColor2: {
                type: "vec3",
                default: "#0000ff",
            },
            threshold2: {
                type: "float",
                default: 0,
                min: 0,
                max: 1,
            },
            sourceColor3: {
                type: "vec3",
                default: "#ff0000",
            },
            targetColor3: {
                type: "vec3",
                default: "#0000ff",
            },
            threshold3: {
                type: "float",
                default: 0,
                min: 0,
                max: 1,
            },
        },
        varying: {},
        vertexShader: [],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <map_fragment>",
                shaderCode: `
                #ifdef USE_UV
                if(colorswap_threshold1 > 0.0 && distance(texelColor.rgb, colorswap_sourceColor1.rgb) < colorswap_threshold1*1.732){
                    float gray = 0.21 * texelColor.r + 0.71 * texelColor.g + 0.07 * texelColor.b;
                    texelColor = vec4(gray * colorswap_targetColor1, texelColor.a);
                    diffuseColor = texelColor;
                }
                else if(colorswap_threshold2 > 0.0 && distance(texelColor.rgb, colorswap_sourceColor2.rgb) < colorswap_threshold2*1.732){
                    float gray = 0.21 * texelColor.r + 0.71 * texelColor.g + 0.07 * texelColor.b;
                    texelColor = vec4(gray * colorswap_targetColor2, texelColor.a);
                    diffuseColor = texelColor;
                }
                else if(colorswap_threshold3 > 0.0 && distance(texelColor.rgb, colorswap_sourceColor3.rgb) < colorswap_threshold3*1.732){
                    float gray = 0.21 * texelColor.r + 0.71 * texelColor.g + 0.07 * texelColor.b;
                    texelColor = vec4(gray * colorswap_targetColor3, texelColor.a);
                    diffuseColor = texelColor;
                }
                #endif
                `,
            },
        ],
    },
    triplanar: {
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
            },
        },
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "void main() {",
                shaderCode: `
                vec4 worldPosition2 = modelMatrix * vec4( position, 1.0 );
                triplanar_wNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
                triplanar_vUvTri = worldPosition2.xyz;
                `,
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
                `,
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
                diffuseColor = texelColor3;
                #endif
                `,
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
                `,
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
    `,
            },
        ],
    },
    splatMap: {
        icon: '<i class="fa-solid fa-splotch"></i>',
        uniforms: {
            textureSplatMap: {
                type: "sampler2D",
                default: null,
                flipY: false,
            },
            repeatSplatMap: {
                type: "float",
                default: 1,
            },
            useAlpha: {
                type: "bool",
                default: false,
            },
            upNormals: {
                type: "bool",
                default: false,
            },
            flipY: {
                type: "bool",
                default: false,
            },
            textureDiffuse0: {
                type: "sampler2D",
                default: null,
            },
            color0: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat0: {
                type: "float",
                default: 1,
            },
            textureDiffuse1: {
                type: "sampler2D",
                default: null,
            },
            color1: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat1: {
                type: "float",
                default: 1,
            },
            textureDiffuse2: {
                type: "sampler2D",
                default: null,
            },
            color2: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat2: {
                type: "float",
                default: 1,
            },
            textureDiffuse3: {
                type: "sampler2D",
                default: null,
            },
            color3: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat3: {
                type: "float",
                default: 1,
            },
        },
        varying: {
        },
        vertexShader: [
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <map_fragment>",
                shaderCode: `
                #ifdef USE_UV
                if(splatMap_upNormals && shader_vNormal.y <= 0.0) {
                }else{
                    vec4 splatMapTexture = sRGBToLinear(texture( splatMap_textureSplatMap, vec2(vUv.x, splatMap_flipY ? 1.0 - vUv.y : vUv.y) * splatMap_repeatSplatMap ));
                    float splatR = splatMapTexture.r;
                    float splatG = splatMapTexture.g;
                    float splatB = splatMapTexture.b;
                    float splatA = splatMapTexture.a;
                    vec4 finalColor = diffuseColor;
                    if(splatR > 0.0){
                        vec4 R_CHANNEL_TEX = sRGBToLinear(texture( splatMap_textureDiffuse0, vUv * splatMap_repeat0 ));
                        R_CHANNEL_TEX.a *= diffuseColor.a;
                        R_CHANNEL_TEX.rgb *= splatMap_color0;
                        finalColor = mix(finalColor, R_CHANNEL_TEX, splatR);
                    }
                    if(splatG > 0.0){
                        vec4 G_CHANNEL_TEX = sRGBToLinear(texture( splatMap_textureDiffuse1, vUv * splatMap_repeat1 ));
                        G_CHANNEL_TEX.a *= diffuseColor.a;
                        G_CHANNEL_TEX.rgb *= splatMap_color1;
                        finalColor = mix(finalColor, G_CHANNEL_TEX, splatG);
                    }
                    if(splatB > 0.0){
                        vec4 B_CHANNEL_TEX = sRGBToLinear(texture( splatMap_textureDiffuse2, vUv * splatMap_repeat2 ));
                        B_CHANNEL_TEX.a *= diffuseColor.a;
                        B_CHANNEL_TEX.rgb *= splatMap_color2;
                        finalColor = mix(finalColor, B_CHANNEL_TEX, splatB);
                    }
                    if(splatMap_useAlpha && splatA > 0.0){
                        vec4 A_CHANNEL_TEX = sRGBToLinear(texture( splatMap_textureDiffuse3, vUv * splatMap_repeat3 ));
                        A_CHANNEL_TEX.a *= diffuseColor.a;
                        A_CHANNEL_TEX.rgb *= splatMap_color3;
                        finalColor = mix(finalColor, A_CHANNEL_TEX, splatA);
                    }
                    diffuseColor = finalColor;
                }
                #endif
                `,
            },
        ],
    },
    textureGradient: {
        icon: '<i class="fa-solid fa-grate-droplet"></i>',
        uniforms: {
            texCount: {
                type: "float",
                default: 1,
                min: 1,
                max: 4,
                step: 1,
            },
            smoothing: {
                type: "float",
                default: 0.1,
                min: 0,
                max: 0.25,
            },
            useNormals: {
                type: "bool",
                default: false,
            },
            tex0Begin: {
                type: "float",
                default: 0,
                min: 0,
                max: 1,
            },
            tex1Begin: {
                type: "float",
                default: 0.25,
                min: 0,
                max: 1,
            },
            tex2Begin: {
                type: "float",
                default: 0.5,
                min: 0,
                max: 1,
            },
            tex3Begin: {
                type: "float",
                default: 0.75,
                min: 0,
                max: 1,
            },
            textureDiffuse0: {
                type: "sampler2D",
                default: null,
            },
            color0: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat0: {
                type: "float",
                default: 1,
            },
            textureDiffuse1: {
                type: "sampler2D",
                default: null,
            },
            color1: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat1: {
                type: "float",
                default: 1,
            },
            textureDiffuse2: {
                type: "sampler2D",
                default: null,
            },
            color2: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat2: {
                type: "float",
                default: 1,
            },
            textureDiffuse3: {
                type: "sampler2D",
                default: null,
            },
            color3: {
                type: "vec3",
                default: "#ffffff",
            },
            repeat3: {
                type: "float",
                default: 1,
            },
        },
        varying: {
            height_percent: {
                type: "float",
            },
        },
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                float currentY = (modelMatrix * vec4( transformed, 1.0 )).y;
                float currentYDelta = (currentY - yPos) / mDepth;
                textureGradient_height_percent = clamp(currentYDelta, 0.0, 1.0);
                `,
            },
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <map_fragment>",
                shaderCode: `
                #ifdef USE_UV
                float percent = textureGradient_height_percent;
                if(textureGradient_useNormals){
                    percent = max(0.0,shader_vNormal.y);
                }
                float blend = textureGradient_smoothing;
                vec4 finalColor = texelColor;
                if(percent >= textureGradient_tex0Begin && percent <= (textureGradient_tex1Begin + blend) && textureGradient_texCount > 0.0){
                    vec2 textureGradient_vUv = vec2(vUv.x, vUv.y) * (textureGradient_repeat0);
                    vec4 textureGradientTexture = sRGBToLinear(texture( textureGradient_textureDiffuse0, textureGradient_vUv ));
                    textureGradientTexture.a *= texelColor.a;
                    textureGradientTexture.rgb *= textureGradient_color0;
                    finalColor = mix(finalColor, textureGradientTexture, textureGradientTexture.a);
                }
                if(percent >= (textureGradient_tex1Begin - blend) && textureGradient_texCount > 1.0){
                    vec2 textureGradient_vUv = vec2(vUv.x, vUv.y) * (textureGradient_repeat1);
                    vec4 textureGradientTexture = sRGBToLinear(texture( textureGradient_textureDiffuse1, textureGradient_vUv ));
                    textureGradientTexture.a *= texelColor.a;
                    textureGradientTexture.rgb *= textureGradient_color1;
                    float fac = 1.0;
                    if(percent <= textureGradient_tex1Begin){
                        fac = (percent - (textureGradient_tex1Begin - blend)) / (blend);
                    }
                    finalColor = mix(finalColor, textureGradientTexture, textureGradientTexture.a*fac);
                }
                if(percent >= (textureGradient_tex2Begin - blend) && textureGradient_texCount > 2.0){
                    vec2 textureGradient_vUv = vec2(vUv.x, vUv.y) * (textureGradient_repeat2);
                    vec4 textureGradientTexture = sRGBToLinear(texture( textureGradient_textureDiffuse2, textureGradient_vUv ));
                    textureGradientTexture.a *= texelColor.a;
                    textureGradientTexture.rgb *= textureGradient_color2;
                    float fac = 1.0;
                    if(percent <= textureGradient_tex2Begin){
                        fac = (percent - (textureGradient_tex2Begin - blend)) / (blend);
                    }
                    finalColor = mix(finalColor, textureGradientTexture, textureGradientTexture.a*fac);
                }
                if(percent >= (textureGradient_tex3Begin - blend) && textureGradient_texCount > 3.0){
                    vec2 textureGradient_vUv = vec2(vUv.x, vUv.y) * (textureGradient_repeat3);
                    vec4 textureGradientTexture = sRGBToLinear(texture( textureGradient_textureDiffuse3, textureGradient_vUv ));
                    textureGradientTexture.a *= texelColor.a;
                    textureGradientTexture.rgb *= textureGradient_color3;
                    float fac = 1.0;
                    if(percent <= textureGradient_tex3Begin){
                        fac = (percent - (textureGradient_tex3Begin - blend)) / (blend);
                    }
                    finalColor = mix(finalColor, textureGradientTexture, textureGradientTexture.a*fac);
                }
                texelColor = finalColor;
                diffuseColor = texelColor;
                #endif
                `,
            },
        ],
    },
    sound: {
        icon: `<i class="fas fa-music"></i>`,
        uniforms: {
            intensity: {
                type: "float",
                default: 1,
            },
            glow: {
                type: "bool",
                default: false,
            },
            chroma: {
                type: "bool",
                default: false,
            },
            croma_offset_angle: {
                type: "float",
                default: 0,
                min: 0,
                max: 360,
            },
            flat_bottom: {
                type: "bool",
                default: true,
            },
        },
        varying: {
            ground_blend_percent: {
                type: "float",
                value: 0,
            },
        },
        vertexShader: [
            {
                mode: SHADERS_CONSTS.APPEND,
                injectionPoint: "#include <begin_vertex>",
                shaderCode: `
                vec3 original_transformed = transformed.xyz;
                transformed.xyz *= sound*sound_intensity;
                if(sound_flat_bottom){
                    float delta_y = transformed.y - original_transformed.y;
                    transformed.y += abs(delta_y);
                }
                `,
            },
        ],
        fragmentShader: [
            {
                mode: SHADERS_CONSTS.PREPEND,
                injectionPoint: "#include <fog_fragment>",
                shaderCode: `
                float sound_fac = ((sound.x + sound.y + sound.z - 3.0)/3.0);
                if(sound_chroma){
                    float chromaAngle = mod(sound_fac * 6.28 + sound_croma_offset_angle, 6.28);
                    gl_FragColor.rgb = hueShift(gl_FragColor.rgb, chromaAngle);
                }
                if(sound_glow){
                    gl_FragColor.rgb *= (1.0 + sound_fac);
                }
                `,
            },
        ],
    },
};

function getSizesForShader(entity3D) {
    if (entity3D.isInstanced) {
        return {
            mDepth: entity3D.instancedBBSize.y,
            mWidth: entity3D.instancedBBSize.x,
            mHeight: entity3D.instancedBBSize.z,
            yPos: entity3D.mesh.position.y - entity3D.instancedBBSize.y / 2,
            textureRepeat: entity3D.textureRepeat ?? 1,
        };
    } else {
        const model = entity3D.mesh;
        return {
            mDepth: entity3D.bb.depth,
            mWidth: entity3D.bb.width,
            mHeight: entity3D.bb.height,
            yPos: model.position.y - entity3D.bb.depth / 2,
            textureRepeat: entity3D.textureRepeat ?? 1,
        };
    }
}

let yPosV3 = new THREE.Vector3();

function getYpos(entity3D) {
    return entity3D.mesh.getWorldPosition(yPosV3).y;
}

/*
#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}
*/

/*
#define FLAT_TOP_HEXAGON

// Helper vector. If you're doing anything that involves regular triangles or hexagons, the
// 30-60-90 triangle will be involved in some way, which has sides of 1, sqrt(3) and 2.
#ifdef FLAT_TOP_HEXAGON
const vec2 s = vec2(1.7320508, 1);
#else
const vec2 s = vec2(1, 1.7320508);
#endif


float hex(in vec2 p)
{    
    p = abs(p);
    
    #ifdef FLAT_TOP_HEXAGON
    return max(dot(p, s*.5), p.y); // Hexagon.
    #else
    return max(dot(p, s*.5), p.x); // Hexagon.
    #endif    
}

vec4 getHex(vec2 p)
{        
    #ifdef FLAT_TOP_HEXAGON
    vec4 hC = floor(vec4(p, p - vec2(1, .5))/s.xyxy) + .5;
    #else
    vec4 hC = floor(vec4(p, p - vec2(.5, 1))/s.xyxy) + .5;
    #endif
    

    vec4 h = vec4(p - hC.xy*s, p - (hC.zw + .5)*s);

    return dot(h.xy, h.xy) < dot(h.zw, h.zw) 
        ? vec4(h.xy, hC.xy) 
        : vec4(h.zw, hC.zw + .5);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{

}
*/


/* Reactive Wind

if(wind_reactive && wind_ground_blend_percent > 0.1){
    int token_array_size = int(tokens[0].w + 1.0);

    for(int i = 1; i < token_array_size; i++) {
        float distance = distance(vWorldPositionFoW.xyz, tokens[i].xyz);
        vec4 diff = vec4(vWorldPositionFoW.xyz - tokens[i].xyz, 0.0);
        diff.y = 0.0;
        diff = diff * current_matrix;
        vec3 dir = normalize(diff.xyz);
        float maxDist = tokens[i].w * gridSize * 1.1;
        if(distance < maxDist) {
            windOffset += wind_reactive_intensity * (dir.xz * (maxDist / distance) * gridSize * wind_ground_blend_percent);
        }
    }
}

*/