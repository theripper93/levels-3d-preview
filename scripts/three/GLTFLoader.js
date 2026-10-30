import { GLTFLoader as ThreeGLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";

class GLTFSingleScenePlugin {
    constructor(parser) {
        this.parser = parser;
        this.name = "levels3d_single_scene";
    }

    beforeRoot() {
        const json = this.parser.json;
        if (json.scenes?.length > 1) json.scenes = [json.scenes[2] ?? json.scenes[0]];
    }
}

export class GLTFLoader extends ThreeGLTFLoader {
    constructor(manager) {
        super(manager);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
        this.setDRACOLoader(dracoLoader);
        this.register((parser) => new GLTFSingleScenePlugin(parser));
    }
}
