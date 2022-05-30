import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js';



export class PresetMaterialHandler{
    constructor(materials){
        this.materials = {};
        materials.forEach(m => {
            this.materials[m.id] = new PresetMaterial(m);
        });
    }

    get(materialId){
        if(materialId.startsWith("preset-")) materialId = materialId.replace("preset-", "");
        return this.materials[materialId].get();
    }


}

class PresetMaterial{
    constructor(mat){
        this.matData = mat;
        this.loader = new THREE.TextureLoader();
        this.maps = {
            map: `/${this.matData.id}_Color.webp`,
            normalMap: `/${this.matData.id}_NormalGL.webp`,
            roughnessMap: `/${this.matData.id}_Roughness.webp`,
            metalnessMap: `/${this.matData.id}_Metalness.webp`,
            aoMap: `/${this.matData.id}_AO.webp`,
            displacementMap: `/${this.matData.id}_Displacement.webp`,
            emissiveMap: `/${this.matData.id}_Emissive.webp`,
        };
        for(let k of Object.keys(this.maps)){
            if(!this.matData.mapIndex.includes(k)) delete this.maps[k];
        }
    }

    get(){
        if(this._material) return this._material.clone();
        const matData = {}
        for(let k of Object.keys(this.maps)){
            matData[k] = this.loader.load(this.matData.rootDir + `/${this.matData.id}` + this.maps[k]);
        }
        if(this.maps.metalnessMap) matData.metalness = 1;
        
        this._material = new THREE.MeshStandardMaterial(matData)
        return this._material.clone();
    }

}

const rootDir = "modules/levels-3d-preview/assets/materials";

export const presetMaterials = [
    {
        id: "basic-plastic",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap"],
    },
    {
        id: "premium-plastic",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap"],
    },
    {
        id: "bronze",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap", "metalnessMap"],
    },
    {
        id: "copper",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap", "metalnessMap"],
    },
    {
        id: "steel",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap", "metalnessMap"],
    },
    {
        id: "hammered-steel",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap", "metalnessMap"],
    },
    {
        id: "leather",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap"],
    },
    {
        id: "marble",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap"],
    },
    {
        id: "wood",
        rootDir: rootDir,
        name: "",
        mapIndex: ["map", "normalMap", "roughnessMap"],
    },

]

export async function populateScene(){
    const root = "modules/canvas3dtokencompendium/miniatures/Adventurers"
    const models = []

    await processDir(root);

    async function processDir(directory){
        const files = await FilePicker.browse("user", directory)
        for(let file of files.files){
            models.push(file)
        }
        for(let dir of files.dirs){
            await processDir(dir)
        }
    }

    let tokenDatas = []
    const size = canvas.scene.dimensions.size;
    const sceneStart = {
        x: canvas.scene.dimensions.paddingX+size,
        y: canvas.scene.dimensions.paddingY+size,
    }
    const rows = (canvas.scene.dimensions.sceneWidth / size)/2;
    const cols = (canvas.scene.dimensions.sceneHeight / size)/2;
    const max = rows*cols;
    let modelcount = 0;
    for(let model of models){
        const randomMaterial = presetMaterials[Math.floor(Math.random() * (presetMaterials.length-1))];
        const position = {
            x: sceneStart.x + (modelcount % rows) * size * 2,
            y: sceneStart.y + Math.floor(modelcount / rows) * size * 2,
        }
        const data = {
            name: model.name,
            flags: {
                "levels-3d-preview": {
                    "model3d": model,
                    "material": "preset-steel"// + randomMaterial.id,
                }
            },
            x: position.x,
            y: position.y,
        }
        modelcount++
        tokenDatas.push(data)
        if(modelcount >= max) break;
    }

    canvas.scene.createEmbeddedDocuments("Token", tokenDatas);

    console.log(models)


}