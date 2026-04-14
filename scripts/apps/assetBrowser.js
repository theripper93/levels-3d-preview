import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

let _this = null;

const LIST_ITEM_TEMPLATE = `
<li draggable="true" data-tooltip="{{displayName}} ({{output}})"
data-search="{{search}}" data-output="{{output}}" data-displayname="{{displayName}}" data-src="{{preview}}">
<img src="{{preview}}" alt="" loading="lazy">
<i data-tooltip="{{displayName}}" class="material-name">{{displayName}}</i>
</li>
`;

export class AssetBrowser extends HandlebarsApplication {

    constructor() {
        super();
        canvas.tiles.activate();
        game.Levels3DPreview.CONFIG.UI.windows.AssetBrowser = this;
        this._maxCount = 400;
        this._hasSelected = false;
        this.lastPlacementPosition = new game.Levels3DPreview.THREE.Vector3();
        game.Levels3DPreview.renderer.domElement.addEventListener("mouseup", this._on3DCanvasClick, false);
        game.Levels3DPreview.renderer.domElement.addEventListener("mousemove", this._on3DCanvasMove, false);
        this.tilePreCrateHookId = Hooks.on("preCreateTile", this._onTileCreate.bind(this));
        this._paintTourDone = game.settings.get("levels-3d-preview", "assetbrowserpainttour");
        _this = this;
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            classes: ["three-canvas-compendium-app"],
            window: {
                title: "Asset Browser",
                resizable: true,
            },
            position: {
                width: 390,
                height: window.innerHeight * 0.8,
            },
            dragDrop: [{ dragSelector: "li", dropSelector: "" }],
        });
    }

    static get PARTS() {
        return {
            tabs: {
                template: 'modules/levels-3d-preview/templates/material-explorer/tab-navigation.hbs',
            },
            options: {
                template: 'modules/levels-3d-preview/templates/material-explorer/tab-options.hbs',
            },
            utility: {
                template: 'modules/levels-3d-preview/templates/material-explorer/tab-utility.hbs',
            },
            content: {
                template: `modules/levels-3d-preview/templates/material-explorer/content.hbs`,
            }
        }
    };

    static get TABS() {
        return {
            primary: {
                tabs: [
                    { id: "options", icon: "fas fa-gears", label: "Options" },
                    { id: "utility", icon: "fas fa-screwdriver-wrench", label: "Utility" },
                ],
                initial: "options",
            },
        }
    }

    get sources() {
        const sources = AssetBrowser.defaultSources;
        const custom = game.settings.get("levels-3d-preview", "assetBrowserCustomPath");
        if (custom) sources.push(custom);
        return sources;
    }

    static fileCache = null;
    static dataCache = null;
    static assetCache = [];

    static defaultSources = [];

    static get exclude() {
        return [];
    }

    static scale = 1;
    
    static density = 1;

    get title() {
        return "Asset Browser: " + this._assetCount + " assets available";
    }

    get currentPoint() {
        return game.Levels3DPreview.interactionManager.mouseIntersection3DCollision(undefined, true, "compendium")[0];
    }

    _on3DCanvasMove(event) {
        if (!event.shiftKey || event.which !== 1 || !_this.quickPlacementOptions.paint) return;
        if (!_this._hasSelected || !_this.currentPoint?.point) return;
        const currentPos = _this.currentPoint.point;
        if (!_this.lastPlacementPosition) return _this._on3DCanvasClick(event, true);
        if (!currentPos || currentPos.distanceTo(_this.lastPlacementPosition) < 1 / AssetBrowser.density) return;
        _this._on3DCanvasClick(event, true);
    }

    _on3DCanvasClick(event, fromDrag = false) {
        if (!event.shiftKey && !fromDrag) return;
        const currentIntersect = _this.currentPoint;
        if (!_this._hasSelected || (event.which !== 1 && !fromDrag) || !currentIntersect) return;
        canvas.tiles.releaseAll();
        const dragData = _this.buildTileData();

        game.Levels3DPreview.interactionManager._onDrop(event, dragData);
    }

    _onTileCreate(tile, tileData) {
        if (!this.quickPlacementOptions.paint) return;
        const isBox = tileData.flags["levels-3d-preview"].dynaMesh === "box";
        const isPolygon = tileData.flags["levels-3d-preview"].fromPolygonTool;
        if (!isBox && !isPolygon) return;
        const depth = tileData.flags["levels-3d-preview"].depth;
        const elevation = tileData.elevation + (depth * canvas.scene.dimensions.distance) / canvas.scene.dimensions.size;
        let { x, y, width, height } = tileData;
        // x -= width / 2;
        // y -= height / 2;
        const approxArea = width * height;
        const pointCount = (approxArea / Math.pow(canvas.grid.size, 2)) * AssetBrowser.density * 0.3;
        const polygonToolPoints = isPolygon ? AssetBrowser.toWorldSpace(AssetBrowser.getPolygonFromTile(tileData).polygon, x, y) : [x, y, x + width, y, x + width, y + height, x, y + height, x, y].map((n) => parseInt(n));
        const isClosed = isPolygon ? polygonToolPoints[0] === polygonToolPoints[polygonToolPoints.length - 2] && polygonToolPoints[1] === polygonToolPoints[polygonToolPoints.length - 1] : true;
        const randomPoints = getRandomPointsInsidePolygon(polygonToolPoints, pointCount, isClosed);
        const pos3D = (...args) => game.Levels3DPreview.CONFIG.entityClass.Ruler3D.posCanvasTo3d(...args);
        const collisionPoints = [];
        for (const point of randomPoints) {
            const origin = pos3D({ x: point.x, y: point.y, z: elevation + canvas.scene.dimensions.distance });
            const target = pos3D({ x: point.x, y: point.y, z: elevation - 1000 });
            const collision = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(origin, target, "collision", false, false, false, true);
            if (collision) {
                const dragData = _this.buildTileData(null, collision[0]);
                game.Levels3DPreview.interactionManager._onDrop(new Event("click"), dragData);
            }
        }
        return false;
    }

    static toWorldSpace(polygon, x, y) {
        return polygon.map((n, index) => index % 2 == 0 ? n + x : n + y);
    }

    static getPolygonFromTile(tileDocument) {
        const flags = tileDocument.flags["levels-3d-preview"]?.model3d;
        if (flags) {
            if (!flags.includes("#")) return {thickness: null, polygon: flags.split(",").map((s) => parseInt(s))};
            const [thickness, points] = flags.split("#");
            const isWall = tileDocument.flags["levels-3d-preview"]?.dynaMesh == "polygonbevelsolidify" || tileDocument.flags["levels-3d-preview"]?.dynaMesh == "polygonbevelsolidifyjagged";
            let mappedPoints = points.split(",").map((s) => parseInt(s));
            if(isWall) mappedPoints = mappedPoints.map((p) => p + thickness*2)
            return {thickness: parseInt(thickness), polygon: mappedPoints};
        }
        return null;
    }

    async _autoScatterOnTile(tile) {
        const THREE = game.Levels3DPreview.THREE;
        const options = await this.autoScatterDialog();
        if (!options) return;
        const scatterEdges = options.edges;
        const scatterSurface = options.surfaces;
        const count = options.count;
        const tile3d = game.Levels3DPreview.tiles[tile.id];
        const mesh = game.Levels3DPreview.tiles[tile.id].mesh.children[0];

        const elevation = tile.document.elevation;
        const depth = tile.document.flags["levels-3d-preview"].depth;
        const rect = [tile.document.x - tile.document.width / 2, tile.document.y - tile.document.height / 2, tile.document.width, tile.document.height];
        const nPointsMax = count || Math.max(1, Math.floor(rect[2] * rect[3] * AssetBrowser.density * 0.0001));

        if (scatterEdges) {
            const points = [];
            const segments = [];
            const tempSegments = [];

            mesh.traverse((child) => {
                if (child.isMesh && child.visible) {
                    const positions = [];
                    const geometry = child.geometry;
                    const positionAttribute = geometry.attributes.position;
                    const normalAttribute = geometry.attributes.normal;

                    const faces = [];

                    const indexAttribute = geometry.index;

                    if (indexAttribute) {
                        for (let i = 0; i < indexAttribute.count; i += 3) {
                            const face = new THREE.Vector3(indexAttribute.getX(i), indexAttribute.getX(i + 1), indexAttribute.getX(i + 2));
                            faces.push(face);
                        }
                    }

                    for (let i = 0; i < positionAttribute.count; i++) {
                        const position = new THREE.Vector3();
                        position.fromBufferAttribute(positionAttribute, i);
                        const originalPosition = position.clone();
                        position.applyMatrix4(child.matrixWorld);
                        const normal = new THREE.Vector3();
                        normal.fromBufferAttribute(normalAttribute, i);
                        normal.transformDirection(child.matrixWorld);
                        //game.Levels3DPreview.scene.add(new THREE.ArrowHelper( normal, position, 0.1, new THREE.Color(normal.x,normal.y,normal.z) ));
                        positions.push({ position: originalPosition, worldPosition: position, normal, faces: faces.filter((face) => face.x === i || face.y === i || face.z === i) });
                    }

                    //group positions that share a face into segments
                    let positionsToCheck = [...positions];
                    for (const position of positions) {
                        const currentPosition = position;
                        positionsToCheck = positionsToCheck.filter((p) => p !== currentPosition);
                        const currentSegments = [];
                        for (const positionToCheck of positionsToCheck) {
                            const normalDistance = currentPosition.normal.distanceTo(positionToCheck.normal);
                            const yDistance = Math.abs(currentPosition.worldPosition.y - positionToCheck.worldPosition.y);
                            if (normalDistance < 0.1 && yDistance < 0.05) {
                                currentSegments.push({ start: currentPosition, end: positionToCheck });
                            }
                        }
                        tempSegments.push(...currentSegments);
                    }
                }
            });

            for (const segment of tempSegments) {
                //calculate segment normal
                const normal1 = segment.start.normal;
                const normal2 = segment.end.normal;
                const avgNormal = new THREE.Vector3((normal1.x + normal2.x) / 2, (normal1.y + normal2.y) / 2, (normal1.z + normal2.z) / 2);
                avgNormal.normalize();
                if (avgNormal.y > 0.2 && avgNormal.y < 0.8) segments.push(segment);
            }

            const density = AssetBrowser.density;
            for (const segment of segments) {
                let invalid = false;
                const line3 = new THREE.LineCurve3(segment.start.worldPosition, segment.end.worldPosition);
                const length = line3.v1.distanceTo(line3.v2);
                const nPoints = Math.max(1, Math.floor(length * density));
                const linePoints = [];
                for (let i = 0; i < nPoints; i++) {
                    linePoints.push(line3.getPoint(Math.random()));
                }
                for (const point of linePoints) {
                    if (invalid) break;
                    const origin = point.clone();
                    const target = point.clone();
                    target.y -= 1000;
                    const collision = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(origin, target, "collision", false, false, false, true);
                    if (collision?.length && Math.abs(collision[0].point.y - origin.y) > 0.01) invalid = true;
                }
                if (invalid) continue;
                for (const point of linePoints) {
                    points.push({ point, face: { normal: segment.start.normal } });
                }
            }
            if (points.length > (count || nPointsMax * 0.1)) {
                //randomly remove points until we have the desired amount
                while (points.length > (count || nPointsMax * 0.1)) {
                    const index = Math.floor(Math.random() * points.length);
                    points.splice(index, 1);
                }
            }
            const proceed = await foundry.applications.api.DialogV2.confirm({
                window: { title: "Scatter on Edges" },
                content: `<p>Scattering ${points.length} assets on edges of the selected tile. Proceed?</p>`,
                defaultYes: true,
            });
            if (proceed) {
                for (const point of points) {
                    const origin = point.point.clone();
                    const target = point.point.clone();
                    target.y -= 1000;
                    origin.y += 0.05;
                    const collision = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(origin, target, "collision", false, false, false, true);
                    if (collision?.length) point.point = collision[0].point;
                    const dragData = this.buildTileData(null, point);
                    game.Levels3DPreview.interactionManager._onDrop(new Event("click"), dragData);
                }
            }
        }

        if (scatterSurface) {
            const noise3D = new game.Levels3DPreview.UTILS.NOISE.ImprovedNoise();
            const randomOffset = new THREE.Vector3(Math.random(), Math.random(), Math.random());
            const randomScale = Math.random() + 0.5;
            const nPoints = nPointsMax;
            const points = [];
            const pos3D = (...args) => game.Levels3DPreview.CONFIG.entityClass.Ruler3D.posCanvasTo3d(...args);
            for (let i = 0; i < nPoints; i++) {
                const x = Math.random() * rect[2] + rect[0];
                const y = Math.random() * rect[3] + rect[1];
                const origin = pos3D({ x, y, z: elevation });
                origin.y += depth / 1000 + 0.1;
                const noiseVector = new THREE.Vector3(origin.x + randomOffset.x, origin.y + randomOffset.y, origin.z + randomOffset.z);
                noiseVector.multiplyScalar(randomScale);
                const noise = noise3D.noise(noiseVector.x, noiseVector.y, noiseVector.z);
                if (Math.random() > noise) continue;
                const target = origin.clone();
                target.y -= 1000;
                const collision = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(origin, target, "collision", false, false, false, true);
                if (collision?.length) {
                    let isCorrectTile = collision[0].object.userData?.entity3D == tile3d;
                    collision[0].object.traverseAncestors((obj) => {
                        if (obj.userData?.entity3D == tile3d) isCorrectTile = true;
                    });
                    const isFlatSurface = Math.abs(collision[0].face.normal.y) > 0.5;
                    if (isFlatSurface && isCorrectTile) points.push(collision[0]);
                }
            }

            const proceed = await foundry.applications.api.DialogV2.confirm({
                title: "Scatter on Surface",
                content: `<p>Scattering ${points.length} assets on the surface of the selected tile. Proceed?</p>`,
                defaultYes: true,
            });
            if (proceed) {
                for (const point of points) {
                    const dragData = this.buildTileData(null, point);
                    game.Levels3DPreview.interactionManager._onDrop(new Event("click"), dragData);
                }
            }
        }
    }

    async autoScatterDialog() {
        let edges, surfaces;
        const res = await foundry.applications.api.DialogV2.prompt({
            window: { title: "Smart Scatter" },
            content: `
                <p>Do you wish to scatter tiles on Edges, Surfaces or Both?</p>
                <hr>
                <div style="display: grid; grid-template-columns: 1fr 1fr;">
                    <div class="form-group" style="display: flex;align-items: center;">
                        <input type="checkbox" id="edges" name="edges" checked>
                        <label for="edges">Edges</label>
                    </div>
                    <div class="form-group" style="display: flex;align-items: center;">
                        <input type="checkbox" id="surfaces" name="surfaces" checked>
                        <label for="surfaces">Surfaces</label>
                    </div>
                </div>
                <hr>
            `,
            submit: (res, dialog) => {
                edges = dialog.element?.querySelector("#edges").checked;
                surfaces = dialog.element?.querySelector("#surfaces").checked;
            },
            rejectClose: true,
        });
        if (res == "ok") {
            return { edges, surfaces };
        } else {
            return null;
        }
    }

    buildTileData(src, collisionPoint) {
        const currentIntersect = collisionPoint ?? _this.currentPoint;
        if (currentIntersect?.point) _this.lastPlacementPosition.copy(currentIntersect.point);
        const srcs = [];
        src ? srcs.push(src) : _this.element.querySelectorAll("li.selected").forEach(el => srcs.push(el.dataset.output));
        const randomSrc = srcs[Math.floor(Math.random() * srcs.length)];
        const angle = parseFloat(_this.element.querySelector("#angle").value || 0);
        let color = _this.element.querySelector("#color").value;
        const options = _this.quickPlacementOptions;
        let normal = null;
        let scale = AssetBrowser.scale;
        const grid = options.grid;
        const randomRotate = options.rotation;
        const rotation = randomRotate ? Math.random() * 360 : angle;
        if (options.scale) scale *= Math.random() + 0.5;
        if (options.normal) normal = currentIntersect?.face?.normal ?? { x: 0, y: 1, z: 0 };
        if (options.colorvar) {
            const threecolor = new game.Levels3DPreview.THREE.Color(color);
            const hsl = threecolor.getHSL(new game.Levels3DPreview.THREE.Color());
            const hue = hsl.h + (Math.random() - 0.5) * 0.05;
            const sat = hsl.s + (Math.random() - 0.5) * 0.4;
            const lum = hsl.l + (Math.random() - 0.5) * 0.4;
            threecolor.setHSL(hue, sat, lum);
            color = "#" + threecolor.getHexString();
        }
        //AssetBrowser.scale = scale;
        const sight = _this.quickPlacementOptions.sight;
        const collision = _this.quickPlacementOptions.collision;
        const cameraCollision = _this.quickPlacementOptions.cameraCollision;
        const isImage = !randomSrc.toLowerCase().endsWith(".glb") && !randomSrc.toLowerCase().endsWith(".gltf");
        const dragData = {
            type: "Tile",
            texture: { src: randomSrc },
            tileSize: canvas.dimensions.size / scale,
            params: { color, sight, collision, cameraCollision, dynaMesh: isImage ? "billboard2" : "default", castShadow: !isImage },
            coord3d: currentIntersect?.point ?? null,
            assetBrowser: {
                grid,
                normal,
                rotation,
                pos: options.center,
            },
        };
        if (src) delete dragData.coord3d;

        return dragData;
    }

    _onDragStart(event) {
        canvas.tiles.releaseAll();
        const src = event.currentTarget.dataset.output;
        const dragData = _this.buildTileData(src);
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    async _prepareContext(options) {
        const data = await super._prepareContext(options);
        data.assetPacks = AssetBrowser.assetPacks;
        if (AssetBrowser.dataCache) {
            this._assetCount = AssetBrowser.dataCache.materials.length;
            AssetBrowser.dataCache.scale = AssetBrowser.scale || 1;
            AssetBrowser.dataCache.density = AssetBrowser.density || 1;
            AssetBrowser.dataCache.angle = AssetBrowser.angle || 0;
            return {
                ...AssetBrowser.dataCache,
                tabs: this._prepareTabs("primary"),
            };
        }
        const materials = [];
        const files = AssetBrowser.fileCache ?? (await this.getSources());
        AssetBrowser.fileCache = files;
        for (let file of files) {
            const filename = file.split("/").pop().replaceAll("%20", "_");
            const cleanName = filename.replaceAll("_", " ").replace(".glb", "").replace(".gltf", "");
            materials.push({
                displayName: cleanName.replace("MZ4250 - ", ""),
                preview: file.replace(".glb", ".webp").replace(".gltf", ".webp"),
                output: file,
                search: file.split("/assets/Tiles/").pop(),
            });
        }
        materials.push(...AssetBrowser.assetCache);
        materials.sort((a, b) => a.displayName.localeCompare(b.displayName));
        data.materials = materials;
        data.isAssetBrowser = true;
        data.scale = AssetBrowser.scale || 1;
        data.density = AssetBrowser.density || 1;
        data.angle = AssetBrowser.angle || 0;
        this._assetCount = materials.length;
        AssetBrowser.dataCache = data;
        data.tabs = this._prepareTabs("primary");
        return data;
    }

    async getSources() {
        const files = [];
        const billboards = await AssetBrowser.getFiles("modules/canvas3dcompendium/assets/Vegetation_billboard/high_res", "", "webp");
        files.push(...billboards);
        for (let target of this.sources) {
            let sourceFiles;
            try {
                sourceFiles = await AssetBrowser.getFiles(target, "");
            } catch (e) {
                try {
                    sourceFiles = await AssetBrowser.getFiles(target, "user");
                } catch (e) {
                    sourceFiles = [];
                }
            }
            files.push(...sourceFiles);
        }
        return files;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        html.querySelector(".window-title").innerText = this.title;

        html.querySelector(`.tab[data-tab="options"]`).style.display = "";
        html.querySelectorAll(".tab-button").forEach(btn => btn.addEventListener("click", (e) => {
            const tab = e.currentTarget.dataset.tab;
            html.querySelectorAll(".tab").forEach(el => el.style.display = "none");
            html.querySelector(`.tab[data-tab="${tab}"]`).style.display = "";
            html.querySelectorAll(".tab-button").forEach(el => el.classList.remove("active"));
            e.currentTarget.classList.add("active");
        }));
        html.querySelector("#toggle-tabs").addEventListener("click", (e) => {
            html.querySelectorAll(".tab").forEach(el => el.classList.toggle("hidden"));
            e.currentTarget.querySelector("i").classList.toggle("fa-caret-up");
            e.currentTarget.querySelector("i").classList.toggle("fa-caret-down");
        });
        html.querySelector("#selected-notification").style.display = "none";
        html.querySelectorAll(".material-confirm").forEach(el => el.classList.add("hidden"));
        html.addEventListener("keyup", (e) => { if (e.target.matches("#search")) this.onSearch(e); });
        html.querySelectorAll("input").forEach(el => el.dispatchEvent(new Event("keyup")));
        html.querySelector("#asset-packs").addEventListener("change", e => this.onSearch(e) );
        html.querySelectorAll(".quick-placement-toggle").forEach(btn => btn.addEventListener("click", (e) => {
                btn.classList.toggle("active");
                if (!this._paintTourDone && btn.dataset.action == "paint") {
                    game.settings.set("levels-3d-preview", "assetbrowserpainttour", true);
                    this._paintTourDone = true;
                    setTimeout(() => {
                        game.tours.get("levels-3d-preview.asset-browser-paint").start();
                    }, 2000);
                }
        }));
        html.querySelectorAll(".utility-button").forEach(btn => btn.addEventListener("click", (e) => {
            const action = btn.dataset.action;
            runScript.bind(this)(action);
        }));
        html.querySelector("#scale").addEventListener("change", (e) => AssetBrowser.scale = parseFloat(e.target.value));
        html.querySelector("#density").addEventListener("change", (e) => AssetBrowser.density = parseFloat(e.target.value));
        this.onSearch();
    }

    activateListElementListeners(li) {
        const html = this.element;
        li.addEventListener("mouseup", (e) => {
            const isSelect = e.target.closest("li").classList.contains("selected");
            if (!e.ctrlKey && !e.shiftKey) html.querySelectorAll("li").forEach(el => el.classList.remove("selected"));
            if (e.ctrlKey) e.target.closest("li").classList.toggle("selected");
            if (e.shiftKey) {
                const selected = html.querySelectorAll("li.selected");
                if (selected.length === 0) {
                    e.target.closest("li").classList.add("selected");
                } else {
                    const allLis = [...html.querySelectorAll("li")];
                    const start = allLis.indexOf(selected[0]);
                    const end = allLis.indexOf(li);
                    const min = Math.min(start, end);
                    const max = Math.max(start, end);
                    allLis.forEach((el, i) => {
                        if (i >= min && i <= max) el.classList.add("selected");
                    });
                }
            }
            if (!isSelect) {
                e.target.closest("li").classList.add("selected");
            }
            this._hasSelected = html.querySelectorAll("li.selected").length > 0;
            html.querySelector("#selected-notification").style.display = this._hasSelected ? "" : "none";
            li.addEventListener("dragstart", this._onDragStart);
            if (this._hasSelected) canvas.tiles.releaseAll();
        });
    }

    onSearch() {
        const value = this.element.querySelector("#search").value;
        const packData = this.element
            .querySelector("#asset-packs")
            .value
            .split(",")
            .filter((p) => p)
            .map((p) => p.trim().toLowerCase().replaceAll(" ", "%20"));
        const packName = packData[0].toLowerCase();
        const pack = packData.filter((p) => p !== packName);
        let count = 0;

        const results = [];
        for (const material of AssetBrowser.dataCache.materials) {
            const displayName = material.displayName;
            const search = material.search;
            const searchLC = search.toLowerCase();
            if (count >= this._maxCount) break;
            const inSearch = searchLC.includes(value.toLowerCase()) || displayName.toLowerCase().includes(value.toLowerCase());
            const packMatch = packName === "all" || (material.output.includes(packName) && pack.some((p) => searchLC.includes(p)));
            if (inSearch && packMatch) {
                count++;
                results.push(material);
            }
        }
        const html = results.map((m) => this.generateListItem(m)).join("");
        this.element.querySelector("ol").innerHTML = html;
        this.element.querySelectorAll("li").forEach((li) => {
            this.activateListElementListeners(li);
        });
    }

    generateListItem(data) {
        return Handlebars.compile(LIST_ITEM_TEMPLATE)({ ...data });
    }

    startTour(force = false) {
        const done = game.settings.get("levels-3d-preview", "assetbrowsertour");
        if (done && !force) return;
        game.settings.set("levels-3d-preview", "assetbrowsertour", true);
        setTimeout(() => {
            game.tours.get("levels-3d-preview.asset-browser").start();
        }, 2000);
    }

    _getHeaderControls() {
	    const buttons = super._getHeaderControls();
        buttons.unshift({
            label: "",
            class: "tour",
            icon: "fas fa-question",
            onClick: () => {
                const tour = game.tours.get(`levels-3d-preview.${this.id}`);
                tour ? tour.start() : ui.notifications.warn("No tour found for this panel.");
            },
        });
        return buttons;
    }

    get quickPlacementOptions() {
        const options = {};
        const quickPlacementToggles = this.element.querySelectorAll(".quick-placement-toggle");
        for (let toggle of quickPlacementToggles) {
            const action = toggle.dataset.action;
            options[action] = toggle.classList.contains("active");
        }
        return options;
    }

    async _render(...args) {
        const res = await super._render(...args);
        this.startTour();
        return res;
    }

    async close(...args) {
        super.close(...args);
        Hooks.off("preCreateTile", this.tilePreCrateHookId);
        game.Levels3DPreview.renderer.domElement.removeEventListener("mouseup", this._on3DCanvasClick, false);
        game.Levels3DPreview.renderer.domElement.removeEventListener("mousemove", this._on3DCanvasMove, false);
        game.Levels3DPreview.CONFIG.UI.windows.AssetBrowser = null;
    }

    static registerPack(packId, packName, assetPacks = [], options = {}) {
        let packPath = `modules/${packId}`;
        if (options.subfolder) packPath += `/${options.subfolder}`;
        if (!AssetBrowser.defaultSources.includes(packPath)) AssetBrowser.defaultSources.push(packPath);
        if (!assetPacks.length) return;
        assetPacks.map((p) => {
            p.query = packId + "," + p.query;
            p.query = p.query.toLowerCase();
            p.query.replaceAll(" ", "%20");
            return p;
        });
        assetPacks.sort((a, b) => a.name.localeCompare(b.name));
        if (!AssetBrowser.assetPacks[packId]) {
            AssetBrowser.assetPacks[packId] = { name: packName, packs: assetPacks };
        } else {
            AssetBrowser.assetPacks[packId].packs.push(...assetPacks);
        }
    }

    static registerAssets(assets) {
        for (const asset of assets) {
            const file = asset.output;
            if (!file) throw new Error("Asset Browser: Asset has no file path in the 'output' property");
            const filename = file.split("/").pop().replaceAll("%20", "_");
            const cleanName = filename.replaceAll("_", " ").replace(".glb", "").replace(".gltf", "");
            AssetBrowser.assetCache.push({
                displayName: asset.displayName ?? cleanName,
                preview: asset.preview ?? file.replace(".glb", ".webp").replace(".gltf", ".webp"),
                output: file,
                search: asset.search ?? file.split("/assets/Tiles/").pop(),
            });
        }
    }

    static async getFiles(root, source = "user", extC = ["glb", "gltf"], outerPass = true) {
        const files = [];
        extC = extC instanceof Array ? extC : [extC];
        const fp = new foundry.applications.apps.FilePicker({current: root});
        source = fp.activeSource;
        const contents = await foundry.applications.apps.FilePicker.implementation.browse(source, root);
        const indexFile = contents.files.find((f) => f.endsWith("index.json"));
        if (indexFile) {
            const index = await foundry.utils.fetchJsonWithTimeout(indexFile);
            files.push(...index.map((f) => root + "/" + f));
            return files;
        }
        for (let file of contents.files) {
            const ext = file.split(".").pop();
            if (extC.includes(ext.toLowerCase())) files.push(file);
        }
        let notification;
        if (outerPass) notification = ui.notifications.notify(`Loading assets`, "info", { progress: true });
        for (let i = 0; i < contents.dirs.length; i++) {
            let folder = contents.dirs[i];
            if (outerPass) notification.update({pct: Math.round(((i + 1) / contents.dirs.length)), message: `Loading assets in folder: ${folder}`});
            files.push(...(await AssetBrowser.getFiles(folder, source, extC, false)));
        }
        if (outerPass && notification) {
            notification.update({pct: 1, message: `Assets loaded`});
        }

        return files;
    }
}

AssetBrowser.assetPacks = {};

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScript(id) {
    switch (id) {
        case "merge":
            game.Levels3DPreview.UTILS.autoMergeTiles();
            break;
        case "split":
            game.Levels3DPreview.UTILS.unmergeTiles();
            break;
        case "lock":
            const tiles = canvas.tiles.controlled;
            if (!tiles.length) return ui.notifications.error("Please select a tile to lock/unlock.");
            const locked = tiles[0].document.locked;
            const updates = tiles.map((tile) => {
                return { _id: tile.id, locked: !tile.data.locked };
            });
            await canvas.scene.updateEmbeddedDocuments("Tile", updates);
            ui.notifications.info(`Tile/s ${locked ? "unlocked" : "locked"}.`);
            break;
        case "extrude":
            game.Levels3DPreview.UTILS.extractPointsFromDrawing();
            break;
        case "extrude-walls":
            game.Levels3DPreview.UTILS.extrudeWalls();
            break;
        case "smart-scatter":
            if (!canvas.tiles.controlled.length || !this.element.querySelectorAll("li.selected").length) return ui.notifications.error("Please select a tile to scatter assets on and one or more assets to scatter.");
            ui.notifications.info("Scattering assets...The canvas will freeze for a few seconds.");
            await wait(1000);
            for (let tile of canvas.tiles.controlled) {
                this._autoScatterOnTile(tile);
            }
            break;
        case "vines":
            let radius;
            const res = await foundry.applications.api.DialogV2.prompt({
                window: { title: "Vines" },
                content: `
                    <p>Please confirm the vines propagation radius. Using values higher than 1000 is NOT suggested</p>
                    <hr>
                    <form>
                        <div class="form-group">
                            <label for="radius">Radius <span class="units">(Pixels)</span></label>
                            <div class="form-fields">
                                <input type="number" value="500" max="1000" min="100" step="1" name="radius">
                            </div>
                        </div>
                    </form>
                    <hr>
                `,
                submit: (res, dialog) => radius = parseInt(dialog.element?.querySelector('[name="radius"]')?.value),
                rejectClose: true,
            });
            if (res !== "ok") return;
            ui.notifications.info("Click on the canvas to create vines. Right click to cancel.");
            const onClickHandler = (event) => {
                game.Levels3DPreview.renderer.domElement.removeEventListener("mouseup", onClickHandler, false);
                if (event.button === 0) game.Levels3DPreview.CONFIG.entityClass.ProceduralVines.createVinesTile(1, radius / 1000);
            };
            game.Levels3DPreview.renderer.domElement.addEventListener("mouseup", onClickHandler, false);
    }
    if (id.includes("overlay")) overlayPresets[id.replace("overlay-", "")]();
}

function getRandomPointsInsidePolygon(polygon, nPoints, isClosed = true) {
    const pointPolygon = [];
    for (let i = 0; i < polygon.length; i += 2) {
        const x = polygon[i];
        const y = polygon[i + 1];
        pointPolygon.push({ x, y });
    }
    if (isClosed) {
        const minX = Math.min(...pointPolygon.map((p) => p.x));
        const maxX = Math.max(...pointPolygon.map((p) => p.x));
        const minY = Math.min(...pointPolygon.map((p) => p.y));
        const maxY = Math.max(...pointPolygon.map((p) => p.y));
        polygon = new PIXI.Polygon(polygon);
        const points = [];
        while (points.length < nPoints) {
            const point = { x: Math.random() * (maxX - minX) + minX, y: Math.random() * (maxY - minY) + minY };
            if (polygon.contains(point.x, point.y)) points.push(point);
        }

        return points;
    } else {
        const THREE = game.Levels3DPreview.THREE;
        const v2Array = pointPolygon.map((p) => new THREE.Vector2(p.x, p.y));
        const curve = new THREE.SplineCurve(v2Array);
        const points = [];
        for (let i = 0; i < nPoints; i++) {
            const t = Math.random();
            const point = curve.getPoint(t);
            points.push(point);
        }
        return points;
    }
}

const overlayPresets = {
    grassy: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/canvas3dcompendium/assets/Materials/_Stylized2/Grass_04/Grass_04_Color.webp", color: "#ffffff", strength: 1, coveragePercent: 1, inclination: 0.6, repeat: 9, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    icy: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/canvas3dcompendium/assets/Materials/_Stylized2/Ice_02/Ice_02_Color.webp", color: "#ffffff", strength: 1, coveragePercent: 1, inclination: 0.6, repeat: 8, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    dirty: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/canvas3dcompendium/assets/Materials/Ground045/Ground045_Color.webp", color: "#61451f", strength: 1, coveragePercent: 1, inclination: 0.3, repeat: 8, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    sandy: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/canvas3dcompendium/assets/Materials/_Stylized2/Sand_04/Sand_04_Color.webp", color: "#fbb05b", strength: 1, coveragePercent: 1, inclination: 0.45, repeat: 8, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    leafy: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/canvas3dcompendium/assets/Materials/ScatteredLeaves007/ScatteredLeaves007_Color.webp", color: "#ff7b00", strength: 1, coveragePercent: 1, inclination: 0.58, repeat: 15, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: true, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    dusty: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/baileywiki-maps-premium-towns/maps/fx-tiles/overlay-fx/overlay-grunge-dust-02.webp", color: "#d17a00", strength: 0.75, coveragePercent: 1, inclination: 0.3, repeat: 15, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    cobwebs: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/baileywiki-maps-premium-towns/maps/fx-tiles/overlay-fx/overlay-biological-webs-04.webp", color: "#ffffff", strength: 0.75, coveragePercent: 1, inclination: 0.3, repeat: 15, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    bloody: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/baileywiki-maps-premium-towns/maps/fx-tiles/overlay-fx/overlay-blood-02.webp", color: "#8d3f3f", strength: 1, coveragePercent: 1, inclination: 0.3, repeat: 5, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    cracked: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/baileywiki-maps-premium-towns/maps/fx-tiles/overlay-fx/overlay-cracks-02.webp", color: "#000000", strength: 1, coveragePercent: 1, inclination: 0.3, repeat: 3, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
    vines: () => {
        if (!canvas.activeLayer.controlled.length) return ui.notifications.error("No object selected, please select at least one object.");
        const updates = [];
        const shaderData = { overlay: { enabled: true, textureDiffuse: "modules/baileywiki-maps-premium-towns/maps/fx-tiles/overlay-fx/overlay-nature-vines-01.webp", color: "#ffffff", strength: 1, coveragePercent: 1, inclination: -0.63, repeat: 10, rotation_angle: 0, offsetX: 0, offsetY: 0, black_alpha: false, add_blend: false, mult_blend: false } };
        canvas.activeLayer.controlled.forEach((obj) => {
            updates.push({
                _id: obj.id,
                flags: {
                    "levels-3d-preview": {
                        shaders: shaderData,
                    },
                },
            });
        });
        canvas.scene.updateEmbeddedDocuments(canvas.activeLayer.options.objectClass.embeddedName, updates);
    },
};
