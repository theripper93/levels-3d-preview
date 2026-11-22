import { BufferAttribute, BufferGeometry } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { buildStampMasks, pointInPoly } from "./terrainMasks.js";

function surfaceIndex(nx, ny, w, h, holes) {
    const index = [];
    for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
            const x = ((i + 0.5) / (nx - 1)) * w, y = ((j + 0.5) / (ny - 1)) * h;
            if (holes.some((p) => pointInPoly(x, y, p))) continue;
            const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
            index.push(a, c, b, b, c, d);
        }
    }
    return index;
}

export const TERRAIN_JOBS = {
    masks: ({ data, nx, ny, layers }) => buildStampMasks(data, nx, ny, layers),
    surface: ({ positions, nx, ny, w, h, holes }) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(positions, 3));
        geometry.setIndex(surfaceIndex(nx, ny, w, h, holes));
        const { roots, index } = MeshBVH.serialize(new MeshBVH(geometry), { cloneBuffers: false });
        return { roots, index };
    },
};

export function transferables(value, out = new Set()) {
    if (value instanceof ArrayBuffer) out.add(value);
    else if (ArrayBuffer.isView(value)) out.add(value.buffer);
    else if (value && typeof value === "object") for (const v of Object.values(value)) transferables(v, out);
    return out;
}
