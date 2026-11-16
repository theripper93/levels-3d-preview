import { Object3D, Color, PerspectiveCamera, Vector2, Matrix4 } from "three";

function createShadowStub() {
    return {
        autoUpdate: false,
        needsUpdate: false,
        map: null,
        mapPass: null,
        camera: new PerspectiveCamera(90, 1, 0.5, 500),
        mapSize: new Vector2(512, 512),
        matrix: new Matrix4(),
        bias: 0,
        normalBias: 0,
        radius: 1,
        blurSamples: 8,
        intensity: 1,
        updateMatrices() {},
        dispose() {},
    };
}

export class ClusterLight extends Object3D {
    constructor({ type = "point", color = 0xffffff, intensity = 1, distance = 0, decay = 2, angle = Math.PI / 3, penumbra = 0, unbinned = false } = {}) {
        super();
        this.type = type === "spot" ? "ClusterSpotLight" : "ClusterPointLight";
        this.isClusterLight = true;
        this.isPointLight = type !== "spot";
        this.isSpotLight = type === "spot";
        this.color = new Color(color);
        this.intensity = intensity;
        this.distance = distance;
        this.baseDistance = 0;
        this.decay = decay;
        this.angle = angle;
        this.penumbra = penumbra;
        this.unbinned = unbinned;
        this.castShadow = false;
        this.source = null;
        this.mask = null;
        this.map = null;
        this.target = new Object3D();
        this.shadow = createShadowStub();
        if (this.isSpotLight) this.position.copy(Object3D.DEFAULT_UP);
        this.updateMatrix();
        this.addEventListener("added", onAdded);
        this.addEventListener("removed", onRemoved);
    }

    get manager() {
        return game.Levels3DPreview?.clusterManager;
    }

    dispose() {
        this.manager?.unregister(this);
    }
}

function onAdded() {
    this.manager?.register(this);
}

function onRemoved() {
    this.manager?.unregister(this);
}
