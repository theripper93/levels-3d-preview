import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 

export class Grid3D {
    constructor(){
        if(!canvas.scene.getFlag("levels-3d-preview", "enableGrid")) return;
        this.init();
    }

    async init(){
        const size =
        (Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
          factor)
        ;
      const divisions =
        (Math.max(canvas.scene.dimensions.width, canvas.dimensions.height) /
          canvas.scene.dimensions.size)
        ;
        const gridMode = game.settings.get("levels-3d-preview", "gridMode");
        if(gridMode === "fast"){
          const gridColor = canvas.scene.data.gridColor ?? 0x424242;
          const gridHelper = new THREE.GridHelper(
            size,
            divisions,
            gridColor,
            gridColor
          );
          gridHelper.colorGrid = gridColor;
          gridHelper.position.set(size/2, 0.01, size/2);
          gridHelper.material.transparent = true;
          gridHelper.material.opacity = canvas.scene.data.gridAlpha;
          gridHelper.userData.ignoreHover = true;
          this.grid = gridHelper;
          this.scene.add(gridHelper);
          this.secondaryGrid = new THREE.GridHelper(
            size,
            divisions,
            "#5c9aff",
            "#5c9aff"
          );
          this.secondaryGrid.material.opacity = 0.2;
        this.secondaryGrid.material.transparent = true;
          this.secondaryGrid.position.set(size/2, 0.01, size/2);
        }else{
          await this.createGrid();
        }
        this.secondaryGrid.visible = false;
        this.scene.add(this.secondaryGrid);
        this.setPosition();
    }

    async createGrid(){
        const base64 = canvas.app.renderer.extract.base64(canvas.grid.grid)
        const texture = await new THREE.TextureLoader().load(base64);
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(canvas.grid.width/factor, canvas.grid.height/factor),
          new THREE.MeshBasicMaterial({ map: texture, transparent:true })
        );
        plane.rotateX(-Math.PI / 2);
        plane.position.set((canvas.grid.width/factor)/2 + canvas.grid.grid._localBounds.minX/factor, 0.01, (canvas.grid.height/factor)/2 + canvas.grid.grid._localBounds.minY/factor);
        this.grid = plane;
        this.scene.add(plane);
    }

    setPosition(){
        this.grid.position.y = 0.001;
        this.secondaryGrid.position.y = 0.1;
    }

    updateGrid(){
        if(!this.secondaryGrid) return;
        this.secondaryGrid.visible = canvas.tokens.controlled.length > 0;
        if(!this.secondaryGrid.visible){
            this.secondaryGrid.position.y = 0;
            return;
        }
        const y = game.Levels3DPreview.tokens[canvas.tokens.controlled[0].id].mesh.position.y;
        this.secondaryGrid.position.y = y;
    }

    get scene(){
        return game.Levels3DPreview.scene
    }
}