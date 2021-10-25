import * as THREE from "../lib/three.module.js";
import {factor} from '../main.js'; 

export class Ruler3D {
    constructor(parent){
        this._parent = parent;
        this.color = new THREE.Color(game.user.color);
        this.textColor = new THREE.Color(canvas.scene.data.gridColor ?? 0x000000);
        this.origin = new THREE.Vector3(0,0,0);
        this.target = new THREE.Vector3(0,0,0);
        this.sphereRadius = 0.008;
        this.lineRadius = 0.001;
        this.loadFont();
    }

    async loadFont(){
        this.font = await new THREE.FontLoader().loadAsync('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/fonts/helvetiker_regular.typeface.json');
    }

    set object(value){
        if(!value){
            this._object = null;
            this._parent.scene.remove(this.line);
            this._parent.scene.remove(this.sphere1);
            this._parent.scene.remove(this.sphere2);
            this._parent.scene.remove(this.text);
        }else{
            const token3d = value.userData.token3D;
            const target = value.userData.isHitbox ? value.parent : value;
            this._object = target;
            this.origin = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
        }

        this.updateVisibility();
    }

    set origin(position){
        this._origin = position;
        this.updateVisibility();
        if(!this.line) return;
        this.update();
    }

    updateVisibility(){}

    update(){
        if(!this._object || !this._origin) return;
        this._parent.scene.remove(this.line);
        this._parent.scene.remove(this.sphere1);
        this._parent.scene.remove(this.sphere2);
        this._parent.scene.remove(this.text);
        //draw ruler
        const geometry = new THREE.TubeGeometry(
            new THREE.LineCurve3(this._origin, this._object.position),
            1,
            this.lineRadius,
            8,
        );
        this.line = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({
                color: this.color,
                linewidth: 20,
                transparent: true,
                opacity: 0.5,
            })
        );
        //draw spheres
        this.sphere1 = new THREE.Mesh(
            new THREE.SphereGeometry(this.sphereRadius, 16, 16),
            new THREE.MeshBasicMaterial({
                color: this.color,
                transparent: true,
                opacity: 0.5,
            })
        );
        this.sphere2 = this.sphere1.clone();
        this.sphere1.position.copy(this._origin);
        this.sphere2.position.copy(this._object.position);
        //draw floating text
        const distance = (this._origin.distanceTo(this._object.position)*factor/canvas.scene.dimensions.size*canvas.scene.dimensions.distance).toFixed(2) + ` ${canvas.scene.data.gridUnits}.`;
        this.text = new THREE.Mesh(
            new THREE.TextGeometry(distance, {
                font: this.font,
                size: 0.03,
                height: 0.01,
                curveSegments: 8,
                bevelEnabled: false,
            }),
            new THREE.MeshBasicMaterial({
                color: 0x000000,
            })
        );
        this.text.position.set(
            (this._object.position.x + this._origin.x) / 2,
            (this._object.position.y + this._origin.y) / 2,
            (this._object.position.z + this._origin.z) / 2
        );
        //center text
        this.text.geometry.computeBoundingBox();
        const centerOffset = -0.5 * (this.text.geometry.boundingBox.max.x - this.text.geometry.boundingBox.min.x);
        this.text.geometry.translate(centerOffset, 0, 0);
        //set text to face camera
        this.text.lookAt(this._parent.camera.position);
        //always in front
        this.text.renderOrder = 2;
        this.text.material.depthTest = false;
        this.text.material.depthWrite = false;

        this._parent.scene.add(this.line);
        this._parent.scene.add(this.sphere1);
        this._parent.scene.add(this.sphere2);
        this._parent.scene.add(this.text);
    }
}