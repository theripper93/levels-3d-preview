export function injectThreeModifications(THREE) {
    THREE.Object3D.prototype.toJSONClean = function (meta) {
        // meta is a string when called from JSON.stringify
        const isRootObject = meta === undefined || typeof meta === "string";

        const output = {};

        // meta is a hash used to collect geometries, materials.
        // not providing it implies that this is the root object
        // being serialized.
        if (isRootObject) {
            // initialize meta obj
            meta = {
                geometries: {},
                materials: {},
                textures: {},
                images: {},
                shapes: {},
                skeletons: {},
                animations: {},
            };

            output.metadata = {
                version: 4.5,
                type: "Object",
                generator: "Object3D.toJSON",
            };
        }

        // standard Object3D serialization

        const object = {};

        object.uuid = this.uuid;
        object.type = this.type;

        if (this.name !== "") object.name = this.name;
        if (this.castShadow === true) object.castShadow = true;
        if (this.receiveShadow === true) object.receiveShadow = true;
        if (this.visible === false) object.visible = false;
        if (this.frustumCulled === false) object.frustumCulled = false;
        if (this.renderOrder !== 0) object.renderOrder = this.renderOrder;
        const userDataCopy = { ...this.userData };
        delete userDataCopy.entity3D;
        delete userDataCopy.hitbox;
        delete userDataCopy.sightMesh;
        if (JSON.stringify(userDataCopy) !== "{}") object.userData = userDataCopy;

        object.layers = this.layers.mask;
        object.matrix = this.matrix.toArray();
        //object.matrixAutoUpdate = true;
        //if ( this.matrixAutoUpdate === false ) object.matrixAutoUpdate = false;

        // object specific properties

        if (this.isInstancedMesh) {
            object.type = "InstancedMesh";
            object.count = this.count;
            object.instanceMatrix = this.instanceMatrix.toJSON();
            if (this.instanceColor !== null) object.instanceColor = this.instanceColor.toJSON();
        }

        //

        function serialize(library, element) {
            if (library[element.uuid] === undefined) {
                library[element.uuid] = element.toJSON(meta);
            }

            return element.uuid;
        }

        if (this.isScene) {
            if (this.background) {
                if (this.background.isColor) {
                    object.background = this.background.toJSON();
                } else if (this.background.isTexture) {
                    object.background = this.background.toJSON(meta).uuid;
                }
            }

            if (this.environment && this.environment.isTexture) {
                object.environment = this.environment.toJSON(meta).uuid;
            }
        } else if (this.isMesh || this.isLine || this.isPoints) {
            object.geometry = serialize(meta.geometries, this.geometry);

            const parameters = this.geometry.parameters;

            if (parameters !== undefined && parameters.shapes !== undefined) {
                const shapes = parameters.shapes;

                if (Array.isArray(shapes)) {
                    for (let i = 0, l = shapes.length; i < l; i++) {
                        const shape = shapes[i];

                        serialize(meta.shapes, shape);
                    }
                } else {
                    serialize(meta.shapes, shapes);
                }
            }
        }

        if (this.isSkinnedMesh) {
            object.bindMode = this.bindMode;
            object.bindMatrix = this.bindMatrix.toArray();

            if (this.skeleton !== undefined) {
                serialize(meta.skeletons, this.skeleton);

                object.skeleton = this.skeleton.uuid;
            }
        }

        //

        if (this.children.length > 0) {
            object.children = [];

            for (let i = 0; i < this.children.length; i++) {
                object.children.push(this.children[i].toJSONClean(meta).object);
            }
        }

        //

        if (this.animations.length > 0) {
            object.animations = [];

            for (let i = 0; i < this.animations.length; i++) {
                const animation = this.animations[i];

                object.animations.push(serialize(meta.animations, animation));
            }
        }

        if (isRootObject) {
            const geometries = extractFromCache(meta.geometries);
            const materials = extractFromCache(meta.materials);
            const textures = extractFromCache(meta.textures);
            const images = extractFromCache(meta.images);
            const shapes = extractFromCache(meta.shapes);
            const skeletons = extractFromCache(meta.skeletons);
            const animations = extractFromCache(meta.animations);

            if (geometries.length > 0) output.geometries = geometries;
            //if ( materials.length > 0 ) output.materials = materials;
            //if ( textures.length > 0 ) output.textures = textures;
            //if ( images.length > 0 ) output.images = images;
            if (shapes.length > 0) output.shapes = shapes;
            if (skeletons.length > 0) output.skeletons = skeletons;
            if (animations.length > 0) output.animations = animations;
        }

        output.object = object;

        return output;

        // extract data from the cache hash
        // remove metadata on each item
        // and return as array
        function extractFromCache(cache) {
            const values = [];
            for (const key in cache) {
                const data = cache[key];
                delete data.metadata;
                values.push(data);
            }

            return values;
        }
    };
}