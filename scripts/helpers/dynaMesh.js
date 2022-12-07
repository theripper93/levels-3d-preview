import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from '../lib/three-mesh-bvh.js';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class DynaMesh{
    constructor(type, {width = 1, height = 1, depth = 1, resolution = 1}){
        this.type = type;
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.resolution = resolution;
    }

    create(){
        const geometry = this._constructGeometry();
        let mesh;
        if(this.type == "billboard") mesh = this._createBillboardMesh(geometry);
        else if(this.type == "billboard2") mesh = this._createBillboardMeshCross(geometry);
        else mesh = new THREE.Mesh(geometry, this._material);
        mesh.traverse((child) => {
            if(child.isMesh) child.geometry.computeBoundsTree();
        });
        return mesh;
    }

    _createBillboardMesh(geometry){
        const material = this._material;
        const mesh1 = new THREE.Mesh(geometry, material);
        const mesh2 = new THREE.Mesh(geometry, material);
        const mesh3 = new THREE.Mesh(geometry, material);

        mesh1.rotation.set(0, Math.PI/3, 0);
        mesh2.rotation.set(0, 0, 0);
        mesh3.rotation.set(0, -Math.PI/3, 0);

        const group = new THREE.Group();
        group.add(mesh1);
        group.add(mesh2);
        group.add(mesh3);
        return group;
    }

    _createBillboardMeshCross(geometry){
        const material = this._material;
        const mesh1 = new THREE.Mesh(geometry, material);
        const mesh2 = new THREE.Mesh(geometry, material);

        mesh1.rotation.set(0, Math.PI/2, 0);

        const group = new THREE.Group();
        group.add(mesh1);
        group.add(mesh2);
        return group;
    }

    _constructGeometry(){
        if(!this[`_construct${this.type}`]){
            console.error(`DynaMesh: ${this.type} is not a valid type`);
            this.type = "box";
        }
        return this[`_construct${this.type}`]();
    }

    _constructbillboard(){
        return new THREE.PlaneGeometry(this.width, this.height, Math.ceil(this.resolution), Math.ceil(this.resolution));
    }

    _constructbillboard2(){
        return this._constructbillboard();
    }

    _constructbox(){
        const geometry = new THREE.BoxGeometry(
            this.width,
            this.depth,
            this.height,
            Math.ceil((this.width/this._gridUnit)*this.resolution),
            Math.ceil((this.depth/this._gridUnit)*this.resolution),
            Math.ceil((this.height/this._gridUnit)*this.resolution)
        );
        return geometry;
    }

    _constructsphere(){
        const geometry = new THREE.SphereGeometry(
            this._avgAll,
            Math.ceil((this._avgWidthHeight/this._gridUnit)*this.resolution),
            Math.ceil((this.depth/this._gridUnit)*this.resolution)
        );
        return geometry;
    }

    _constructcylinder(){
        const geometry = new THREE.CylinderGeometry(
            this._avgWidthHeight,
            this._avgWidthHeight,
            this.depth,
            Math.ceil((this._avgWidthHeight/this._gridUnit)*this.resolution),
            Math.ceil((this.depth/this._gridUnit)*this.resolution),
            false
        );
        return geometry;
    }

    _constructtube(){
        const geometry = new THREE.CylinderGeometry(
            this._avgWidthHeight,
            this._avgWidthHeight,
            this.depth,
            Math.ceil((this._avgWidthHeight/this._gridUnit)*this.resolution),
            Math.ceil((this.depth/this._gridUnit)*this.resolution),
            true
        );
        return geometry;
    }

    _constructcone(){
        const geometry = new THREE.ConeGeometry(
            this._avgWidthHeight,
            this.depth,
            Math.ceil((this._avgWidthHeight/this._gridUnit)*this.resolution),
            Math.ceil((this.depth/this._gridUnit)*this.resolution),
            false
        );
        return geometry;
    }

    _constructdome(){
        const geometry = new THREE.SphereGeometry(
            this._avgAll,
            Math.ceil((this._avgWidthHeight/this._gridUnit)*this.resolution),
            Math.ceil((this.depth/this._gridUnit)*this.resolution),
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
        );
        return geometry;
    }

    get _avgWidthHeight(){
        return ((this.width + this.height) / 2) * this.resolution;
    }

    get _avgAll(){
        return ((this.width + this.height + this.depth) / 3) * this.resolution;
    }

    get _gridUnit(){
        return canvas.scene.dimensions.size / factor;
    }

    get _material(){
        switch (this.type) {
            case "billboard":
                return new THREE.MeshStandardMaterial({ alphaTest: 0.5, color: 0xffffff, side: THREE.DoubleSide });
            case "billboard2":
                return new THREE.MeshStandardMaterial({ alphaTest: 0.5, color: 0xffffff, side: THREE.DoubleSide });
            default:
                return new THREE.MeshStandardMaterial({ color: 0xffffff });
        }
    }
}