import * as THREE from "three";

export const HIGHLIGHT_GLSL = `
uniform float rwh_active;
uniform sampler2D rwh_mask;
uniform vec4 rwh_frame;
uniform vec4 rwh_color;
uniform float rwh_line;
float rwh_cell(ivec2 c, ivec2 s) {
    if (any(lessThan(c, ivec2(0))) || any(greaterThanEqual(c, s))) return 0.0;
    return step(0.5, texelFetch(rwh_mask, c, 0).r);
}
float rwh_alpha(vec3 wp) {
    vec2 g = (wp.xz - rwh_frame.xy) / rwh_frame.zw;
    vec2 fw = max(fwidth(g), vec2(1e-6));
    ivec2 s = textureSize(rwh_mask, 0);
    ivec2 c = ivec2(floor(g));
    vec2 f = fract(g);
    float m = rwh_cell(c, s);
    vec2 lo = f / fw;
    vec2 hi = (1.0 - f) / fw;
    float d = 1e4;
    if (rwh_cell(c + ivec2(-1, 0), s) != m) d = min(d, lo.x);
    if (rwh_cell(c + ivec2(1, 0), s) != m) d = min(d, hi.x);
    if (rwh_cell(c + ivec2(0, -1), s) != m) d = min(d, lo.y);
    if (rwh_cell(c + ivec2(0, 1), s) != m) d = min(d, hi.y);
    if (rwh_cell(c + ivec2(-1, -1), s) != m) d = min(d, length(vec2(lo.x, lo.y)));
    if (rwh_cell(c + ivec2(1, -1), s) != m) d = min(d, length(vec2(hi.x, lo.y)));
    if (rwh_cell(c + ivec2(-1, 1), s) != m) d = min(d, length(vec2(lo.x, hi.y)));
    if (rwh_cell(c + ivec2(1, 1), s) != m) d = min(d, length(vec2(hi.x, hi.y)));
    float line = clamp(rwh_line - d, 0.0, 1.0);
    return max(m * rwh_color.a, line * 0.9);
}
`;

export const HIGHLIGHT_APPLY = `
if (rwh_active > 0.5) {
    float rwh_a = rwh_alpha(realisticWater_wpos);
    outgoingLight = mix(outgoingLight, rwh_color.rgb, rwh_a);
    diffuseColor.a = mix(diffuseColor.a, 1.0, rwh_a);
}
`;

const empty = new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat);
empty.unpackAlignment = 1;
empty.needsUpdate = true;

export const highlightUniforms = {
    rwh_active: { value: 0 },
    rwh_mask: { value: empty },
    rwh_frame: { value: new THREE.Vector4(0, 0, 1, 1) },
    rwh_color: { value: new THREE.Vector4(1, 1, 1, 0.45) },
    rwh_line: { value: 1 },
};

export const waterHighlight = {
    set({ x, z, cellW, cellH, nx, ny, cells, color = "#4fa3e0", opacity = 0.45, outline = 1 }) {
        let texture = highlightUniforms.rwh_mask.value;
        if (texture === empty || texture.image.width !== nx || texture.image.height !== ny) {
            if (texture !== empty) texture.dispose();
            texture = new THREE.DataTexture(new Uint8Array(nx * ny), nx, ny, THREE.RedFormat);
            texture.unpackAlignment = 1;
            highlightUniforms.rwh_mask.value = texture;
        }
        const data = texture.image.data;
        data.fill(0);
        for (const c of cells) if (c >= 0 && c < data.length) data[c] = 255;
        texture.needsUpdate = true;
        const rgb = new THREE.Color(color);
        highlightUniforms.rwh_frame.value.set(x, z, cellW, cellH);
        highlightUniforms.rwh_color.value.set(rgb.r, rgb.g, rgb.b, opacity);
        highlightUniforms.rwh_line.value = outline;
        highlightUniforms.rwh_active.value = 1;
    },
    setRect(x0, z0, x1, z1, options = {}) {
        this.set({ ...options, x: Math.min(x0, x1), z: Math.min(z0, z1), cellW: Math.abs(x1 - x0) || 1e-4, cellH: Math.abs(z1 - z0) || 1e-4, nx: 1, ny: 1, cells: [0] });
    },
    clear() {
        highlightUniforms.rwh_active.value = 0;
    },
};
