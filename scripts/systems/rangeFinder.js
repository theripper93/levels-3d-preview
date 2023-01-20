import * as THREE from "../lib/three.module.js";
import { factor } from "../main.js";
import { Ruler3D } from "./ruler3d.js";

export class RangeFinder {
    constructor(token, options = {}) {
        if (!token.visible) return;
        this.options = options;
        const RFMode = this._parent.rangeFinderMode;
        if (RFMode === "none") return;
        if (RFMode === "combat" && !game.combat?.started) return;
        this.tokenId = token.id;
        this.token = token;
        this.sources = (options.sources ?? canvas.tokens.controlled).filter((t) => t.id != token.id).map((t) => this._parent.tokens[t.id]);
        if (!this.sources.length) return;
        this.target = this._parent.tokens[token.id].mesh.position.clone().lerp(this._parent.tokens[token.id].head, 0.5);
        this.target3d = this._parent.tokens[token.id];
        this.lineRadius = 0.001;
        this.meshes = [];
        this.labels = [];
        this._parent.rangeFinders.push(this);
        this.init();
    }

    get _parent() {
        return game.Levels3DPreview;
    }

    init() {
        for (const token of this.sources) {
            this.createCurve(token.mesh.position.clone().lerp(token.head, 0.5), token);
        }
    }

    createCurve(origin, origin3d) {
        const target = this.target;
        const distance = Ruler3D.measureMinTokenDistance(origin3d, this.target3d);

        let midcurve = origin.clone().lerp(target, 0.5); //new THREE.Vector3(this._origin.x + (targetPos.x - this._origin.x)/2, this._origin.y + (targetPos.y - this._origin.y)/2, this._origin.z + (targetPos.z - this._origin.z)/2);
        midcurve.y += origin.distanceTo(target) / 2;
        const bezCtrlg = midcurve.clone();
        const curve = new THREE.QuadraticBezierCurve3(origin, bezCtrlg, target);
        midcurve = curve.getPoint(1);

        const geometry = new THREE.TubeGeometry(curve, 64, this.lineRadius, 8);

        const RFCurve = new THREE.Mesh(geometry, this.getMaterial());

        const label = $(`<div id="levels3d-ruler-text" class="rangefinder"></div>`);
        if (this.options.style) label.css(this.options.style);
        $("body").append(label);
        const text = this.options.text ?? `${distance}${canvas.scene.grid.units}.`;
        label.text(text);
        Ruler3D.centerElement(label, midcurve);
        RFCurve.userData.label = label;
        RFCurve.userData.textPos = midcurve;

        this.meshes.push(RFCurve);
        this._parent.scene.add(RFCurve);
    }

    getMaterial() {
        return new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
                curvecolor: {
                    value: this.getColor(),
                },
            },
            vertexShader: `
       
        varying vec2 vUv; 

          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          }
        `,
            fragmentShader: `
           
        varying vec2 vUv;
        uniform vec3 curvecolor;
         
          void main() {     
           
          gl_FragColor = vec4(curvecolor.x, curvecolor.y, curvecolor.z , sin(vUv.x * 3.14) * sin(vUv.x * 3.14));
          
        }
      `,
        });
    }

    getColor() {
        const disposition = this.token.document.disposition;
        let disp = "NEUTRAL";
        for (const [k, v] of Object.entries(CONST.TOKEN_DISPOSITIONS)) {
            if (v === disposition) {
                disp = k;
            }
        }
        const color = CONFIG.Canvas.dispositionColors[disp];
        return new THREE.Color(this.options.color ?? color);
    }

    updateText() {
        this.meshes.forEach((mesh) => {
            Ruler3D.centerElement(mesh.userData.label, mesh.userData.textPos);
        });
    }

    destroy() {
        this.meshes.forEach((mesh) => {
            mesh.removeFromParent();
            mesh.userData.label.remove();
        });
        game.Levels3DPreview.rangeFinders = game.Levels3DPreview.rangeFinders.filter((rf) => rf != this);
    }

    static setHooks() {
        Hooks.on("hoverToken", (token, hover) => {
            if (!game.Levels3DPreview._active) return;
            if (hover) {
                new RangeFinder(token);
            } else {
                game.Levels3DPreview.rangeFinders.forEach((rf) => {
                    if (rf.tokenId === token.id) {
                        rf.destroy();
                    }
                });
            }
        });
    }
}
