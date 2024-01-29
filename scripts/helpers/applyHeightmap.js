import * as THREE from "../lib/three.module.js";

export async function applyHeightmap(geometry, src, offset=10, zeroRadius=0) {

    const positionAttributes = geometry.getAttribute("position");
    const count = positionAttributes.count;
    geometry.computeBoundingBox();
    const maxX = geometry.boundingBox.max.x;
    const minX = geometry.boundingBox.min.x;
    const maxZ = geometry.boundingBox.max.z;
    const minZ = geometry.boundingBox.min.z;
    const minY = geometry.boundingBox.min.y;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;

    const image = await new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
    });

 
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 128;
    canvas.height = 128;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const xzCenter = new THREE.Vector2((maxX + minX) / 2, (maxZ + minZ) / 2);

    for (let i = 0; i < count; i++) {
        const x = positionAttributes.getX(i);
        const y = positionAttributes.getY(i);
        const z = positionAttributes.getZ(i);
        const u = (x - minX) / (maxX - minX);
        const v = (z - minZ) / (maxZ - minZ);
        const w = Math.floor(u * canvas.width);
        const h = Math.floor(v * canvas.height);
        const index = (h * canvas.width + w) * 4;
        const r = data[index];
        if (r == undefined) continue;
        const distanceFromCenter = (xzCenter.distanceTo(new THREE.Vector2(x, z)) - zeroRadius) / 10;
        const height = y + r / 255 * offset * Math.max(0,Math.min(1, distanceFromCenter));
        positionAttributes.setY(i, height);
    }

    positionAttributes.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
}