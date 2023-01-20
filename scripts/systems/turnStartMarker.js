import * as THREE from "../lib/three.module.js";
import { Ruler3D } from "./ruler3d.js";
import {factor} from '../main.js';

export class turnStartMarker{

    constructor(parent){
        this._parent = parent;
        this.init()
        this.update()
    }

    init(){
        const sphereGeometry = new THREE.TorusGeometry(0.3*canvas.dimensions.size/factor,0.007 , 32, 32);
        const sphereMaterial = new THREE.MeshBasicMaterial({color: game.user.color, blending: THREE.MultiplyBlending});
        this.mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.mesh.rotation.set(Math.PI/2,0,0)
        this.scene.add(this.mesh)
    }

    update(){
        this.mesh.visible = this.visible
        if(!this.mesh) return;
        if(!this.token) return;
        const token = this.token;
        const tokenPos = Ruler3D.posCanvasTo3d({x: token.center.x,y: token.center.y,z: token.document.elevation})
        this.mesh.position.set(tokenPos.x,tokenPos.y,tokenPos.z)
        const size = Math.min(token.document.width,token.document.height)
        this.mesh.scale.set(size,size,0.5)
    }

    get token(){
        if(!game.combat?.current?.tokenId) return null
        if(this._token?.id === game.combat?.current?.tokenId) return this._token
        this._token = canvas.tokens.get(game.combat.current.tokenId)
        return this._token
    }

    get visible(){
        if(!this.token?.isOwner) return false
        return game.combat?.started ? true : false
    }

    get scene(){
        return this._parent.scene
    }

}