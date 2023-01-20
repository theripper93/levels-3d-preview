import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js'; 

export class Grid3D {
    constructor(){
        this.buildPlaneThickness = 0.1;
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
        const gridColor = canvas.scene.grid.color ?? 0x424242;
        const gridHelper = new THREE.GridHelper(
          size,
          divisions,
          gridColor,
          gridColor
        );
        gridHelper.colorGrid = gridColor;
        gridHelper.position.set(size/2, 0.0, size/2);
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = canvas.scene.grid.alpha;
        gridHelper.userData.ignoreHover = true;
        this.grid = gridHelper;
        this.setVisibility();
        this.scene.add(gridHelper);
        this.createBuildPlane();
        this.setPosition();
    }

    setVisibility(){
      if(!this.grid) return;
      this.grid.visible = false//!(canvas.scene.getFlag("levels-3d-preview", "renderBackground") ?? true);
    }

    createBuildPlane(){
        const plane = new THREE.Mesh(
          new THREE.BoxGeometry(canvas.scene.dimensions.sceneWidth/factor, this.buildPlaneThickness, canvas.scene.dimensions.sceneHeight/factor),
          new THREE.MeshStandardMaterial({ color: "#fc03f4", transparent:true, opacity: 0.5 })
        );
        plane.position.set((canvas.grid.width/factor)/2 , -100000, (canvas.grid.height/factor)/2);
        plane.visible = false;
        this.secondaryGrid = plane;
        this.scene.add(plane);
    }

    async createGrid(){
        const base64 = canvas.app.renderer.extract.base64(canvas.grid.grid)
        const texture = await new THREE.TextureLoader().load(base64);
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(canvas.grid.width/factor, canvas.grid.height/factor),
          new THREE.MeshBasicMaterial({ map: texture, transparent:true })
        );
        plane.rotateX(-Math.PI / 2);
        plane.position.set((canvas.grid.width/factor)/2 + canvas.grid.grid._localBounds.minX/factor, 0.01 + Ruler3D.unitsToPixels(canvas.primary.background.elevation), (canvas.grid.height/factor)/2 + canvas.grid.grid._localBounds.minY/factor);
        this.grid = plane;
        this.scene.add(plane);
    }

    setPosition(){
        if(this.grid) this.grid.position.y = 0.001;
        if(this.secondaryGrid){
          this.secondaryGrid.visible = false;
          this.secondaryGrid.position.y = -100000;
        }
    }

    updateGrid(){
        if(!this.secondaryGrid || !CONFIG.Levels.UI?.rangeEnabled || !CONFIG.Levels.UI?.range || isNaN(CONFIG.Levels.UI?.range[0])) return this.setPosition();
        this.secondaryGrid.visible = CONFIG.Levels.UI.rangeEnabled ? true : false;
        this.secondaryGrid.position.y = ((CONFIG.Levels.UI.range[0]*canvas.grid.size)/canvas.scene.grid.distance)/factor-this.buildPlaneThickness/2;
        this.grid.position.y = this.secondaryGrid.position.y + 0.0001 + this.buildPlaneThickness/2;
      }

    get scene(){
        return game.Levels3DPreview.scene
    }
}