import * as THREE from "../lib/three.module.js";

const pathCache = {};

const loading = new Set();

export async function imageTo3d(image, returnGeometry = false, MAX_SIDE = 64, ALPHA_THRESHOLD = 1) {
    if (loading.has(image.src)) {
        while (loading.has(image.src)) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    } else {
        loading.add(image.src);
    }
    MAX_SIDE = 256;
    const [w, h] = getSimplifiedSize(image, MAX_SIDE);
    let geometry = pathCache[image.src];
    if (!geometry) {
        const path = pathCache[image.src] ?? getOutline(image, w, h, ALPHA_THRESHOLD).flat().flat();
        const vec2Array = [];
        for (let i = 0; i < path.length; i += 2) {
            vec2Array.push(new THREE.Vector3(path[i], path[i + 1], 0));
        }

        //order points by distance from each other
        const orderedPoints = [];
        orderedPoints.push(vec2Array[0]);
        vec2Array.splice(0, 1);
        while (vec2Array.length > 0) {
            const lastPoint = orderedPoints[orderedPoints.length - 1];
            let closestPoint = vec2Array[0];
            let closestDistance = lastPoint.distanceTo(closestPoint);
            for (let i = 1; i < vec2Array.length; i++) {
                const distance = lastPoint.distanceTo(vec2Array[i]);
                if (distance < closestDistance) {
                    closestPoint = vec2Array[i];
                    closestDistance = distance;
                }
            }
            orderedPoints.push(closestPoint);
            vec2Array.splice(vec2Array.indexOf(closestPoint), 1);
        }

        const curve = new THREE.CatmullRomCurve3(orderedPoints, true, "catmullrom", 0.1);

        const points = curve.getSpacedPoints(MAX_SIDE);
        points.push(points[0]);
        const shape = new THREE.Shape(points);
        const bevelRatio = MAX_SIDE / 256;
        const extrudeSettings = {
            steps: 1,
            depth: MAX_SIDE / 64,
            bevelEnabled: true,
            bevelThickness: 0.1 * bevelRatio,
            bevelSize: 2 * bevelRatio,
        };
        geometry = new THREE.ExtrudeBufferGeometry(shape, extrudeSettings);

        //uv mapping
        const uvAttribute = geometry.getAttribute("uv");
        const positionAttribute = geometry.getAttribute("position");
        const positionArrayCount = positionAttribute.count;
        const width = w;
        const height = h;
        //inflate along normals

        for (let i = 0; i < positionArrayCount; i++) {
            const x = positionAttribute.getX(i);
            const y = positionAttribute.getY(i);
            const u = x / width;
            const v = 1 - y / height;
            uvAttribute.setXY(i, u, v);
        }
        uvAttribute.needsUpdate = true;

        geometry.center();
        geometry.rotateX(Math.PI);

        pathCache[image.src] = geometry;
    }
    if (returnGeometry) {
        loading.delete(image.src);
        return geometry.clone();
    }
    const mesh = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    loading.delete(image.src);
    return group;
}

function getSimplifiedSize(image, MAX_SIDE = 64) {
    const maxDimension = Math.max(image.width, image.height);
    const newMaxDimension = Math.min(maxDimension, MAX_SIDE);
    const scale = newMaxDimension / maxDimension;
    const newWidth = Math.floor(image.width * scale);
    const newHeight = Math.floor(image.height * scale);
    return [newWidth, newHeight];
}

function getOutline(image, w, h, alphaThreshold = 200) {
    const alphaChannel = getImageData(image, alphaThreshold, w - 2, h - 2);
    //const simplified = simplifyImage(alphaChannel, image.width, image.height, 0.5)
    const path = extractExternalContour(alphaChannel, w, h);
    return path;
}

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

function getImageData(image, alphaThreshold = 200, width, height) {
    canvas.width = width + 2;
    canvas.height = height + 2;
    const w = canvas.width;
    const h = canvas.height;

    ctx.drawImage(image, 1, 1, w - 2, h - 2);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    //return only the alpha channel
    const alphaChannel = new Uint8ClampedArray(data.length / 4);
    for (let i = 0; i < data.length; i += 4) {
        alphaChannel[i / 4] = data[i + 3] > alphaThreshold ? 255 : 0;
    }

    return alphaChannel;
}

function extractContour(imageData, width, height) {
    // Function to get the index in the 1D array for given x and y coordinates
    function getIndex(x, y) {
        return y * width + x;
    }

    // Function to check if a pixel is non-transparent
    function isNonTransparent(x, y) {
        const index = getIndex(x, y);
        return imageData[index] > 0; // Alpha channel (A) value is greater than 0
    }

    // Extract the contour lines
    const contourLines = [];

    // Traverse all pixels and find non-transparent pixels with at least one transparent neighbor
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (isNonTransparent(x, y)) {
                // Check if the pixel is non-transparent
                let hasTransparentNeighbor = false;

                // Check if any of the four neighbors is transparent
                if (!isNonTransparent(x + 1, y) || !isNonTransparent(x - 1, y) || !isNonTransparent(x, y + 1) || !isNonTransparent(x, y - 1)) {
                    hasTransparentNeighbor = true;
                }

                if (hasTransparentNeighbor) {
                    // Add the contour point
                    contourLines.push([[x, y]]);
                }
            }
        }
    }

    return contourLines;
}

function extractExternalContour(alphaArray, width, height) {
    // Function to get the index in the 1D array for given x and y coordinates
    function getIndex(x, y) {
        return y * width + x;
    }

    // Function to flood-fill an area with a specific value
    function floodFill(x, y, fillValue) {
        const stack = [[x, y]];

        while (stack.length) {
            const [currentX, currentY] = stack.pop();

            if (currentX >= 0 && currentX < width && currentY >= 0 && currentY < height) {
                const currentIndex = getIndex(currentX, currentY);
                if (alphaArray[currentIndex] == 0) {
                    // Check if the pixel is non-transparent
                    alphaArray[currentIndex] = fillValue;

                    stack.push([currentX + 1, currentY]);
                    stack.push([currentX - 1, currentY]);
                    stack.push([currentX, currentY + 1]);
                    stack.push([currentX, currentY - 1]);
                }
            }
        }
    }

    const FILL_VALUE = 128;

    // Step 1: Find the first pixel below the alpha threshold to start the flood fill
    let startX = -1;
    let startY = -1;
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (alphaArray[getIndex(x, y)] <= 0) {
                startX = x;
                startY = y;
                break;
            }
        }
        if (startX !== -1) break;
    }

    if (startX === -1) {
        // No pixel found below the alpha threshold, return empty contour
        return [];
    }

    // Step 2: Flood fill the image with a specific value (-1)
    floodFill(startX, startY, FILL_VALUE);

    // Step 3: Set all values that are not -1 in the original array to 255
    for (let i = 0; i < alphaArray.length; i++) {
        if (alphaArray[i] === FILL_VALUE) {
            alphaArray[i] = 0;
        } else {
            alphaArray[i] = 255;
        }
    }

    //drawDebugContext(alphaArray, width, height);

    return extractContour(alphaArray, width, height);
}

function drawDebugContext(alphaArray, width, height) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < alphaArray.length; i++) {
        const isFill = alphaArray[i] === 512;
        data[i * 4] = alphaArray[i];
        data[i * 4 + 1] = 0;
        data[i * 4 + 2] = 0;
        data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    document.body.appendChild(canvas);
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.zIndex = "1000";
}
