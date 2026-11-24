import * as THREE from "three";

const ICON_RES = 256;
const LABEL_RES = 2;
const FALLBACK_ICON = "icons/svg/book.svg";
const materials = new Map();
const iconTextures = new Map();
let shared = null;
let labelRadiusRatio = null;

function canvasTexture(width, height, draw) {
    const cnv = document.createElement("canvas");
    cnv.width = width;
    cnv.height = height;
    draw(cnv.getContext("2d"), width, height);
    const texture = new THREE.CanvasTexture(cnv);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export function getShared() {
    if (shared) return shared;
    const ground = new THREE.PlaneGeometry(1, 1);
    ground.rotateX(-Math.PI / 2);
    shared = {
        plane: new THREE.PlaneGeometry(1, 1),
        circle: new THREE.CircleGeometry(1, 24),
        ground,
        line: new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]),
        hitMaterial: new THREE.MeshBasicMaterial({ visible: false }),
        lineMaterial: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }),
        textures: {
            disc: canvasTexture(128, 128, (ctx, w) => {
                ctx.fillStyle = "#fff";
                ctx.beginPath();
                ctx.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
                ctx.fill();
            }),
            ring: canvasTexture(128, 128, (ctx, w) => {
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.arc(w / 2, w / 2, w / 2 - 5, 0, Math.PI * 2);
                ctx.stroke();
            }),
            shadow: canvasTexture(128, 128, (ctx, w, h) => {
                const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
                gradient.addColorStop(0, "rgba(0,0,0,0.55)");
                gradient.addColorStop(0.5, "rgba(0,0,0,0.25)");
                gradient.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, w, h);
            }),
        },
    };
    return shared;
}

export function basicMaterial(key, params) {
    let material = materials.get(key);
    if (!material) {
        material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...params });
        materials.set(key, material);
    }
    return material;
}

export function isCoverIcon(src) {
    return !/\.svg$/i.test(src.split("?")[0]);
}

async function loadImage(src) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = src;
    await image.decode();
    return image;
}

function iconCanvas(image, cover) {
    const texture = canvasTexture(ICON_RES, ICON_RES, (ctx, size) => {
        const iw = image.naturalWidth || image.width || 1;
        const ih = image.naturalHeight || image.height || 1;
        if (cover) {
            const crop = Math.min(iw, ih);
            ctx.drawImage(image, (iw - crop) / 2, (ih - crop) / 2, crop, crop, 0, 0, size, size);
            ctx.globalCompositeOperation = "destination-in";
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        const ratio = iw / ih;
        const w = ratio >= 1 ? size : size * ratio;
        const h = ratio >= 1 ? size / ratio : size;
        ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    });
    texture.anisotropy = 4;
    return texture;
}

function iconTexture(src) {
    if (!iconTextures.has(src)) {
        const promise = loadImage(src)
            .then((image) => iconCanvas(image, isCoverIcon(src)))
            .catch(() => loadImage(FALLBACK_ICON).then((image) => iconCanvas(image, false)))
            .catch(() => null);
        iconTextures.set(src, promise);
    }
    return iconTextures.get(src);
}

export function iconMaterial(src, color, opacity) {
    const key = `icon|${src}|${color}|${opacity}`;
    let material = materials.get(key);
    if (material) return material;
    material = new THREE.MeshBasicMaterial({ color, transparent: true, alphaTest: 0.05, opacity, depthWrite: false, toneMapped: false, visible: false });
    materials.set(key, material);
    iconTexture(src).then((texture) => {
        if (!texture) return;
        material.map = texture;
        material.visible = true;
        material.needsUpdate = true;
    });
    return material;
}

function labelRadius() {
    if (labelRadiusRatio !== null) return labelRadiusRatio;
    const tooltip = document.getElementById("tooltip");
    const style = tooltip ? getComputedStyle(tooltip) : null;
    const radius = parseFloat(style?.borderTopLeftRadius);
    const size = parseFloat(style?.fontSize);
    labelRadiusRatio = radius >= 0 && size > 0 ? radius / size : 4 / 14;
    return labelRadiusRatio;
}

export function makeLabel(text, { family, size, color }) {
    const fontSize = size * LABEL_RES;
    const font = `600 ${fontSize}px "${family}", sans-serif`;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = font;
    const padX = fontSize * 0.55;
    const padY = fontSize * 0.32;
    const width = Math.ceil(probe.measureText(text).width + padX * 2);
    const height = Math.ceil(fontSize * 1.25 + padY * 2);
    const radius = Math.min(fontSize * labelRadius(), height / 2);
    const texture = canvasTexture(width, height, (ctx, w, h) => {
        ctx.fillStyle = "rgba(14,15,20,0.78)";
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, radius);
        ctx.fill();
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        ctx.fillText(text, w / 2, h / 2 + fontSize * 0.04);
    });
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    return { texture, width: width / LABEL_RES, height: height / LABEL_RES };
}
