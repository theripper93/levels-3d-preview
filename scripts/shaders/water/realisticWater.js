import { getWaterState, refreshWaterBeds, waterQualityHigh } from "./bedDepth.js";
import { HIGHLIGHT_APPLY, HIGHLIGHT_GLSL, highlightUniforms, waterHighlight } from "./waterHighlight.js";

const GLOBALS = `
uniform sampler2D realisticWater_bed;
uniform mat4 realisticWater_bedMatrix;
uniform float realisticWater_size;
uniform float realisticWater_sdMax;
uniform float realisticWater_displace;
float rw_hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec3 rw_noised(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    float a = rw_hash(i);
    float b = rw_hash(i + vec2(1.0, 0.0));
    float c = rw_hash(i + vec2(0.0, 1.0));
    float d = rw_hash(i + vec2(1.0, 1.0));
    float k = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * vec2(b - a + k * u.y, c - a + k * u.x));
}
vec2 rw_bedUv(vec3 wp) {
    vec4 c = realisticWater_bedMatrix * vec4(wp, 1.0);
    return c.xy * 0.5 + 0.5;
}
vec4 rw_bedAt(vec3 wp) {
    return texture2D(realisticWater_bed, rw_bedUv(wp));
}
bool rw_hiddenAt(vec3 wp) {
    ivec2 s = textureSize(realisticWater_bed, 0);
    ivec2 i = clamp(ivec2(rw_bedUv(wp) * vec2(s)), ivec2(0), s - 1);
    return texelFetch(realisticWater_bed, i, 0).g > 500.0;
}
float rw_lambda() {
    return clamp(realisticWater_size * 0.2, 0.4, 10.0) * realisticWater_wave_scale;
}
vec3 rw_swell(vec2 p, float t, float lambda, vec2 dir) {
    vec3 r = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float ang = (fi - 1.5) * 0.5 + sin(fi * 2.3) * 0.2;
        vec2 d = vec2(dir.x * cos(ang) - dir.y * sin(ang), dir.x * sin(ang) + dir.y * cos(ang));
        float L = lambda * (1.0 - 0.17 * fi);
        float k = 6.28318 / L;
        float c = sqrt(9.8 / (1.5 * k));
        float a = 0.03 * L / (1.0 + fi * 0.3);
        float ph = k * (dot(d, p) - c * t) + fi * 1.7;
        r.x += a * sin(ph);
        r.yz += a * k * cos(ph) * d;
    }
    return r;
}
vec3 rw_ripple(vec2 q, float drift, float styl) {
    vec3 a = rw_noised(q + vec2(0.7, 0.3) * drift);
    vec3 b = rw_noised(mat2(0.8, -0.6, 0.6, 0.8) * q * 1.9 - vec2(-0.4, 0.8) * drift * 1.3);
    return vec3(a.x, a.yz + 0.95 * b.yz * (1.0 - styl));
}
float rw_cells(vec2 cp) {
    vec2 ci = floor(cp);
    vec2 cf = fract(cp);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j));
            float cd = length(cf - o - 0.1 - 0.8 * vec2(rw_hash(ci + o), rw_hash(ci + o + 19.19)));
            if (cd < f1) { f2 = f1; f1 = cd; } else if (cd < f2) { f2 = cd; }
        }
    }
    return f2 - f1;
}
vec4 rw_lavaLayer(vec2 q) {
    q += 0.5 * (vec2(rw_noised(q * 0.6).x, rw_noised(q * 0.6 + 5.2).x) - 0.5);
    vec3 a = rw_noised(q * 0.5);
    vec3 b = rw_noised(q * 1.3 + 3.1);
    vec3 c = rw_noised(q * 3.7 + 7.7);
    return vec4(0.55 * a.x + 0.3 * b.x + 0.15 * c.x, rw_cells(q * 1.4 + 0.3 * c.x), 0.275 * a.yz + 0.39 * b.yz + 0.555 * c.yz);
}
`;

const VERTEX = `
float rw_sy = max(length(modelMatrix[1].xyz), 1e-5);
realisticWater_top = normalize(mat3(modelMatrix) * normal).y > 0.5 ? 1.0 : 0.0;
vec4 rw_w = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
rw_w = instanceMatrix * rw_w;
#endif
rw_w = modelMatrix * rw_w;
if (realisticWater_top > 0.5 && realisticWater_displace > 0.5) {
    vec2 rw_dir = vec2(cos(realisticWater_flow_direction), sin(realisticWater_flow_direction));
    float rw_la = rw_lambda();
    vec3 rw_sw = rw_swell(rw_w.xz / gridSize, time * 0.1, rw_la, rw_dir);
    vec4 rw_b = rw_bedAt(rw_w.xyz);
    float rw_fade = smoothstep(0.0, 0.75, rw_b.r) * smoothstep(0.0, min(2.0, max(realisticWater_sdMax, 0.05)), rw_b.g);
    float rw_amp = min(1.0, 0.02 * realisticWater_size / max(0.09 * rw_la * realisticWater_wave_strength, 1e-4));
    float rw_dy = rw_sw.x * gridSize * realisticWater_wave_strength * rw_amp * rw_fade;
    transformed.y += rw_dy / rw_sy;
    rw_w.y += rw_dy;
}
realisticWater_wpos = rw_w.xyz;
`;

const FRAGMENT = `
if (realisticWater_top < 0.99) discard;
if (rw_hiddenAt(realisticWater_wpos)) discard;
float rw_t = time * 0.1;
float rw_styl = step(0.5, realisticWater_style);
float rw_lava = step(0.001, realisticWater_crust);
vec2 rw_p = realisticWater_wpos.xz / gridSize;
vec2 rw_dir = vec2(cos(realisticWater_flow_direction), sin(realisticWater_flow_direction));
vec4 rw_bed0 = rw_bedAt(realisticWater_wpos);
if (rw_bed0.r <= 0.0) discard;
float rw_sm = max(realisticWater_sdMax, 0.05);
float rw_sd = min(rw_bed0.g, rw_sm);
float rw_hw = max(4.0 * length(rw_bed0.ba), 0.05);
vec2 rw_fd = dot(rw_bed0.ba, rw_bed0.ba) > 1e-6 ? normalize(rw_bed0.ba) : rw_dir;
vec2 rw_fw2 = fwidth(rw_p);
float rw_fw = max(rw_fw2.x, rw_fw2.y);
float rw_la = rw_lambda();
float rw_str = realisticWater_wave_strength * mix(1.0, 1.6, rw_styl);
vec3 rw_sw = rw_swell(rw_p, rw_t, rw_la, rw_dir);
float rw_crest = smoothstep(0.55, 0.9, rw_sw.x / (0.07 * rw_la)) * smoothstep(0.6, 1.2, realisticWater_wave_strength);
vec2 rw_grad = rw_sw.yz * rw_str * (1.0 - smoothstep(0.1, 0.5, rw_fw / rw_la));
float rw_rs = max(min(realisticWater_ripple_size, 0.6 * rw_sm), 0.02);
float rw_drift = 0.35 * sqrt(rw_rs) * rw_t / rw_rs;
float rw_ph0 = fract(rw_t);
float rw_ph1 = fract(rw_t + 0.5);
float rw_w0 = 1.0 - abs(1.0 - 2.0 * rw_ph0);
vec2 rw_fv = rw_fd * realisticWater_flow_speed;
vec2 rw_a0 = rw_p - rw_fv * rw_ph0;
vec2 rw_a1 = rw_p - rw_fv * rw_ph1 + vec2(0.37, 0.61) * rw_rs * 3.0;
float rw_lod = 1.0 - smoothstep(0.15, 0.7, rw_fw / rw_rs);
float rw_ra = min(0.05 + 0.12 * realisticWater_wave_strength, 0.14) * mix(1.0, 0.7, rw_styl) * mix(1.0, 0.25, rw_lava);
vec3 rw_rip = mix(rw_ripple(rw_a1 / rw_rs, rw_drift, rw_styl), rw_ripple(rw_a0 / rw_rs, rw_drift, rw_styl), rw_w0);
rw_grad += rw_rip.yz * rw_ra * rw_lod;
float rw_crack = 1.0;
vec3 rw_lavaCol = vec3(0.0);
vec3 rw_lavaEm = vec3(0.0);
if (rw_lava > 0.0) {
    float rw_cen = smoothstep(0.0, 1.0, rw_sd / clamp(rw_hw, 0.3, 3.0));
    float rw_cs = clamp(rw_rs * 1.2, 0.2, 0.5 * rw_sm);
    float rw_lt = time * 0.004;
    float rw_q0 = fract(rw_lt);
    float rw_q1 = fract(rw_lt + 0.5);
    float rw_tw = 1.0 - abs(1.0 - 2.0 * rw_q0);
    float rw_qw = smoothstep(0.2, 0.8, rw_tw);
    vec2 rw_lv = rw_fd * realisticWater_flow_speed * 5.5;
    vec2 rw_m0 = (rw_p - rw_lv * rw_q0) / rw_cs;
    vec2 rw_m1 = (rw_p - rw_lv * rw_q1) / rw_cs;
    vec4 rw_k0 = rw_lavaLayer(rw_m0);
    vec4 rw_k1 = rw_lavaLayer(rw_m1 + vec2(17.3, 9.1));
    vec4 rw_k = mix(rw_k1, rw_k0, rw_qw);
    float rw_c = rw_k.x - 0.78 + 0.5 * realisticWater_crust * mix(0.95, 0.3, rw_cen);
    rw_c = max(rw_c, (0.05 + 0.15 * rw_k.x - rw_sd) * realisticWater_crust - 1.0 + smoothstep(0.0, 0.2, realisticWater_crust));
    float rw_ce = mix(0.03, 0.004, rw_styl) + fwidth(rw_c);
    float rw_cm = smoothstep(-rw_ce, rw_ce, rw_c);
    rw_crack = 1.0 - rw_cm;
    vec3 rw_gr = mix(rw_noised(rw_m1 * 9.0 + 1.3), rw_noised(rw_m0 * 9.0 + 1.3), rw_qw);
    float rw_swd = (0.015 + 0.05 * rw_gr.x) * smoothstep(0.3, 0.6, rw_k.x + 0.4 * rw_gr.x - 0.2);
    float rw_seam = smoothstep(0.0, 0.4, realisticWater_crust) * mix(1.0 - smoothstep(rw_swd - fwidth(rw_k1.y), rw_swd + fwidth(rw_k1.y), rw_k1.y), 1.0 - smoothstep(rw_swd - fwidth(rw_k0.y), rw_swd + fwidth(rw_k0.y), rw_k0.y), rw_qw);
    float rw_mn = mix(rw_noised(rw_m1 * 2.2).x + 0.5 * rw_noised(rw_m1 * 5.3 + 2.7).x, rw_noised(rw_m0 * 2.2).x + 0.5 * rw_noised(rw_m0 * 5.3 + 2.7).x, rw_tw) / 1.5;
    float rw_mT = 0.5 + 0.42 * rw_cen + 0.3 * (rw_mn - 0.5) + 0.15 * (rw_k.x - 0.5) + 0.12 * (rw_gr.x - 0.5) - 0.3 * smoothstep(0.55, 0.8, rw_mn) - 0.45 * smoothstep(-0.12, 0.0, rw_c);
    float rw_cT = 0.04 * rw_k.x + rw_seam * (0.75 - 0.5 * smoothstep(0.03, 0.2, rw_c)) + 0.55 * (1.0 - smoothstep(0.0, 0.04, rw_c));
    float rw_T = clamp(mix(rw_mT, rw_cT, rw_cm), 0.0, 1.1);
    float rw_tq = rw_T * 4.0;
    float rw_taq = fwidth(rw_tq) + 1e-3;
    rw_T = mix(rw_T, (floor(rw_tq) + smoothstep(0.5 - rw_taq, 0.5 + rw_taq, fract(rw_tq))) / 4.0, rw_styl);
    vec3 rw_hc = mix(realisticWater_glow_color, realisticWater_shallow_color, smoothstep(0.25, 0.6, rw_T));
    rw_hc = mix(rw_hc, realisticWater_foam_color, smoothstep(0.6, 0.88, rw_T));
    rw_hc = mix(rw_hc, vec3(1.0, 0.93, 0.78), smoothstep(0.92, 1.1, rw_T));
    rw_lavaEm = rw_hc * smoothstep(0.08, 0.4, rw_T) * (0.3 + 2.0 * rw_T * rw_T);
    rw_lavaCol = mix(rw_hc * 0.25, realisticWater_deep_color * (0.35 + 0.7 * rw_k.x + 0.6 * rw_gr.x * rw_gr.x), rw_cm);
    rw_grad += (rw_k.zw * mix(0.03, 0.3, rw_cm) + rw_gr.yz * 9.0 * mix(0.004, 0.025, rw_cm)) / rw_cs * rw_lod;
}
float rw_pop = 0.0;
if (realisticWater_bubbles > 0.0) {
    float rw_bs = min(min(max(rw_rs * 2.0, 0.2), max(realisticWater_size * 0.12, 0.08)), 0.5 * rw_sm);
    vec2 rw_bp = rw_p / rw_bs;
    vec2 rw_bi = floor(rw_bp);
    float rw_h0 = rw_hash(rw_bi);
    if (rw_h0 < realisticWater_bubbles) {
        float rw_ph = fract(rw_t * mix(1.0, 0.4, rw_lava) * (0.35 + 0.4 * rw_hash(rw_bi + 7.1)) + rw_h0 * 13.7);
        vec2 rw_dv = rw_bp - (rw_bi + 0.5 + (vec2(rw_hash(rw_bi + 3.3), rw_hash(rw_bi + 5.9)) - 0.5) * 0.4);
        float rw_dist = length(rw_dv) + 1e-4;
        float rw_bw = 0.035 + 0.02 * rw_ph;
        float rw_x = (rw_dist - rw_ph * 0.3) / rw_bw;
        rw_pop = exp(-rw_x * rw_x) * (1.0 - rw_ph);
        rw_grad += -2.0 * rw_x / rw_bw * rw_pop * rw_dv / rw_dist * 0.04 * rw_lod * mix(1.0, rw_crack, rw_lava);
    }
}
float rw_scum = 0.0;
if (realisticWater_scum > 0.0) {
    vec2 rw_sp = (rw_p - rw_dir * realisticWater_flow_speed * rw_t) / clamp(0.5 * rw_sm, 0.25, 1.0);
    rw_sp += 0.6 * (vec2(rw_noised(rw_sp * 2.1).x, rw_noised(rw_sp * 2.1 + 7.3).x) - 0.5);
    float rw_sn = 0.7 * rw_noised(rw_sp * 0.6).x + 0.3 * rw_noised(rw_sp * 3.1 + 5.3).x;
    float rw_sth = 0.8 - 0.5 * realisticWater_scum - 0.15 * rw_noised(rw_sp * 1.3).x * 1.5 * (1.0 - smoothstep(0.0, 0.4 * rw_sm, rw_sd));
    float rw_saa = fwidth(rw_sn) + 0.02;
    rw_scum = smoothstep(rw_sth - rw_saa, rw_sth + rw_saa, rw_sn) * (1.0 - rw_lava);
    rw_scum *= 0.85 + 0.15 * step(0.35, rw_noised(rw_p * 14.0).x);
    rw_grad *= 1.0 - 0.85 * rw_scum;
}
vec3 rw_n = normalize(vec3(-rw_grad.x, 1.0, -rw_grad.y));
#ifdef RW_HQ
vec2 rw_off = rw_n.xz * 0.15 * gridSize * (1.0 - rw_lava);
#else
vec2 rw_off = vec2(0.0);
#endif
vec4 rw_bed = rw_bedAt(realisticWater_wpos + vec3(rw_off.x, 0.0, rw_off.y));
float rw_edge = smoothstep(0.0, 0.03 + 1.5 * fwidth(rw_bed0.r), rw_bed0.r);
if (rw_edge <= 0.0) discard;
float rw_cl = max(realisticWater_clarity * min(1.0, rw_sm), 0.01);
float rw_d = max(rw_bed.r, 0.0);
float rw_tc = 1.0 - exp(-rw_d / rw_cl);
float rw_ta = 1.0 - exp(-rw_d / (0.3 * rw_cl));
float rw_fn = rw_noised(rw_p * 1.5 / rw_rs + rw_drift).x;
#ifdef RW_HQ
rw_fn = rw_fn * 0.65 + 0.35 * rw_noised(rw_p * 4.0 / rw_rs - rw_drift * 1.7).x;
#endif
float rw_nb = realisticWater_clarity < 0.5 ? 2.0 : 3.0;
float rw_bx = rw_tc * rw_nb + 0.35 + (rw_noised(rw_p * 0.7 / rw_rs).x - 0.5) * mix(0.15, 0.3, step(1.5, rw_sm));
float rw_taa = fwidth(rw_bx) + 1e-4;
float rw_band = clamp((floor(rw_bx) + smoothstep(1.0 - rw_taa, 1.0, fract(rw_bx))) / rw_nb, 0.0, rw_nb < 2.5 ? 0.7 : 1.0);
if (rw_nb < 2.5) rw_band = 0.3 + 0.7 * rw_band;
rw_tc = mix(rw_tc, rw_band, rw_styl * (1.0 - rw_lava));
vec3 rw_col = mix(realisticWater_shallow_color, realisticWater_deep_color, rw_tc) * mix(0.7, 1.0, rw_styl);
float rw_wall = 1.0 - smoothstep(0.5, 1.5, rw_sm);
rw_col *= mix(1.0, mix(0.55, 1.0, smoothstep(0.0, 0.25 * rw_sm, rw_sd)), rw_wall);
float rw_alpha = realisticWater_opacity * mix(mix(mix(0.6, 0.15, smoothstep(0.2, 1.0, realisticWater_clarity)), 1.0, rw_ta), mix(mix(0.97, 0.85, smoothstep(0.2, 1.0, realisticWater_clarity)), 1.0, rw_tc), rw_styl);
float rw_fwid = min(mix(0.08, 0.35, realisticWater_foam) * clamp(0.5 + realisticWater_size * 0.02, 0.5, 1.2), 0.3 * rw_sm);
rw_fwid = min(rw_fwid, 0.3 * rw_hw);
float rw_em = 1.0 - smoothstep(0.0, rw_fwid, min(rw_sd, rw_bed0.r * 4.0));
float rw_pulse = 0.5 + 0.5 * sin(rw_sd / rw_fwid * 6.0 - rw_t * 1.6 + rw_fn * 3.0);
float rw_foamR = smoothstep(rw_fn * 1.1 + 0.45, rw_fn * 1.1 + 0.65,rw_em * rw_em * (0.6 + 0.6 * rw_pulse));
float rw_lx = (rw_sd - rw_fwid * (0.6 + 0.3 * sin(rw_t * 2.5 + rw_fn * 2.0))) / (0.3 * rw_fwid);
rw_foamR = max(rw_foamR, 0.3 * exp(-rw_lx * rw_lx) * smoothstep(0.3, 0.6, rw_fn) * step(3.5 * rw_fwid, rw_hw));
ivec2 rw_bs2 = textureSize(realisticWater_bed, 0);
float rw_tx = realisticWater_size / float(max(rw_bs2.x, rw_bs2.y));
float rw_sdw = rw_sd + (rw_fn - 0.5) * rw_fwid * 0.3 * step(0.5, rw_sm);
float rw_aa = max(fwidth(rw_sdw), 0.5 * rw_tx) + 1e-4;
float rw_ph = fract(rw_t * 0.25);
float rw_l1 = min(max(min(rw_fwid * 0.45, 0.15 * rw_hw), 1.2 * rw_tx), 0.12 * rw_sm);
float rw_line1 = 1.0 - smoothstep(rw_l1 - rw_aa, rw_l1 + rw_aa, rw_sdw);
float rw_lw = rw_fwid * 0.12 * (1.0 - rw_ph);
float rw_line2 = (1.0 - smoothstep(rw_lw - rw_aa, rw_lw + rw_aa, abs(rw_sdw - min(rw_fwid * (0.6 + 1.2 * rw_ph), 0.6 * min(rw_sm, rw_hw))))) * smoothstep(0.0, 0.2, rw_ph) * (1.0 - smoothstep(0.75, 1.0, rw_ph)) * step(0.35, rw_fn) * step(3.5 * rw_fwid, rw_hw);
float rw_foam = mix(rw_foamR, max(rw_line1, rw_line2), rw_styl) * step(0.001, realisticWater_foam) * (1.0 - rw_lava);
float rw_cx = dot(rw_p, vec2(-rw_fd.y, rw_fd.x));
float rw_sx = mix(rw_sd + 0.3 * (rw_noised(rw_p * 0.8).x - 0.5), rw_cx, smoothstep(0.8, 1.5, rw_hw)) * 3.0 / rw_rs;
float rw_sw0 = mix(0.08, 0.02, rw_styl);
float rw_st = mix(smoothstep(0.85 - rw_sw0, 0.85 + rw_sw0, rw_noised(vec2(rw_sx, 0.0) + rw_a1 * 0.25 / rw_rs).x), smoothstep(0.85 - rw_sw0, 0.85 + rw_sw0, rw_noised(vec2(rw_sx, 0.0) + rw_a0 * 0.25 / rw_rs).x), smoothstep(0.0, 1.0, rw_w0));
float rw_bank = smoothstep(rw_fwid * 0.5, rw_fwid * 0.5 + min(0.15, 0.3 * rw_hw), rw_sd) * (1.0 - smoothstep(0.55, 0.85, rw_sd / rw_hw)) * smoothstep(0.45, 0.6, rw_noised(rw_a0 * 1.2 / rw_rs).x) * mix(1.0, 0.5, rw_styl * smoothstep(0.8, 1.5, rw_hw));
rw_foam = max(rw_foam, rw_st * clamp(realisticWater_flow_speed * 1.6, 0.0, 1.0) * realisticWater_foam * rw_lod * rw_bank * (1.0 - rw_lava));
rw_foam = max(rw_foam, realisticWater_foam * mix(rw_crest * smoothstep(0.4, 0.7, rw_fn), step(0.6, rw_crest * (0.5 + rw_fn)), rw_styl) * (1.0 - rw_lava));
float rw_sk = rw_noised(vec2(dot(rw_p, vec2(0.8, 0.6)) * 1.5, dot(rw_p, vec2(-0.6, 0.8)) * 9.0) / min(rw_rs, 0.3) + vec2(rw_drift, 0.0)).x;
float rw_spk = smoothstep(0.95, 0.95 + fwidth(rw_sk) + 1e-3, rw_sk) * smoothstep(0.4, 1.2, rw_sm) * step(0.34, rw_tc) * rw_styl * (1.0 - rw_lava) * rw_lod * (1.0 - rw_scum);
rw_foam = max(rw_foam, rw_spk * 0.9);
rw_pop *= mix(1.0, rw_crack, rw_lava);
rw_foam = max(rw_foam, rw_pop * 0.6 * (1.0 - rw_lava));
float rw_ca = rw_noised(rw_p * 0.8 / rw_rs + rw_n.xz * 3.0 + rw_drift).x;
float rw_caus = pow(1.0 - abs(rw_ca * 2.0 - 1.0), 6.0) * (1.0 - rw_tc) * (1.0 - rw_styl) * (1.0 - rw_lava) * rw_lod * (1.0 - rw_scum) * smoothstep(0.3, 1.0, realisticWater_clarity);
rw_col += rw_caus * 0.5 * realisticWater_shallow_color;
rw_alpha += rw_caus * 0.15;
rw_col = mix(rw_col, rw_lavaCol * mix(1.0, 0.3, rw_crack), rw_lava);
rw_col = mix(rw_col, realisticWater_foam_color * (0.8 + 0.3 * rw_fn), rw_scum);
rw_alpha = max(rw_alpha, rw_scum);
rw_col = mix(rw_col, mix(mix(realisticWater_foam_color, realisticWater_shallow_color, 0.25), realisticWater_foam_color, rw_styl), rw_foam);
rw_alpha = max(rw_alpha, rw_foam * mix(0.8, 0.95, rw_styl)) * rw_edge * opacity;
diffuseColor = vec4(rw_col, clamp(rw_alpha, 0.0, 1.0));
float rw_gl = pow(rw_em, 3.0) * 0.5 + 0.12 * (0.6 + 0.4 * sin(rw_t * 2.0 + rw_fn * 6.28)) + rw_pop * step(0.001, realisticWater_bubbles);
vec3 rw_emis = realisticWater_glow * mix(realisticWater_glow_color * rw_gl * mix(1.0, 0.5, rw_styl), rw_lavaEm + realisticWater_foam_color * rw_pop, rw_lava);
float rw_rough = mix(mix(0.35, 0.04, realisticWater_reflectivity), 0.6, rw_styl);
rw_rough = max(mix(rw_rough, 0.85, max(rw_foam, rw_lava * (1.0 - rw_crack))), 0.9 * rw_scum);
`;

const PRESETS = {
    water: { shallow_color: "#318b85", deep_color: "#0d3f5c", foam_color: "#ffffff", glow_color: "#ffffff", opacity: 0.92, clarity: 1.2, flow_speed: 0.05, wave_strength: 0.5, wave_scale: 1, ripple_size: 0.35, foam: 0.6, bubbles: 0, scum: 0, reflectivity: 0.8, glow: 0, crust: 0 },
    ocean: { shallow_color: "#248893", deep_color: "#062b49", foam_color: "#ffffff", glow_color: "#ffffff", opacity: 0.95, clarity: 2, flow_speed: 0.03, wave_strength: 1.2, wave_scale: 2, ripple_size: 0.5, foam: 0.9, bubbles: 0, scum: 0, reflectivity: 0.9, glow: 0, crust: 0 },
    river: { shallow_color: "#368371", deep_color: "#1b5560", foam_color: "#ffffff", glow_color: "#ffffff", opacity: 0.9, clarity: 0.5, flow_speed: 0.6, wave_strength: 0.3, wave_scale: 0.6, ripple_size: 0.3, foam: 0.7, bubbles: 0, scum: 0, reflectivity: 0.75, glow: 0, crust: 0 },
    swamp: { shallow_color: "#6b7a2e", deep_color: "#2c3516", foam_color: "#4f6b1f", glow_color: "#ffffff", opacity: 0.98, clarity: 0.25, flow_speed: 0.02, wave_strength: 0.1, wave_scale: 0.5, ripple_size: 0.4, foam: 0.3, bubbles: 0.15, scum: 0.5, reflectivity: 0.35, glow: 0, crust: 0 },
    acid: { shallow_color: "#c8f03a", deep_color: "#2f7a0a", foam_color: "#ecffb8", glow_color: "#7dff1a", opacity: 0.92, clarity: 0.25, flow_speed: 0.05, wave_strength: 0.3, wave_scale: 0.6, ripple_size: 0.3, foam: 0.6, bubbles: 0.5, scum: 0, reflectivity: 0.3, glow: 0.6, crust: 0 },
    lava: { shallow_color: "#ff7a10", deep_color: "#2b2927", foam_color: "#ffc828", glow_color: "#d2300a", opacity: 1, clarity: 0.05, flow_speed: 0.3, wave_strength: 0.15, wave_scale: 0.5, ripple_size: 0.6, foam: 0, bubbles: 0.3, scum: 0, reflectivity: 0.15, glow: 1.4, crust: 0.01 },
    magicalFire: { shallow_color: "#b45cff", deep_color: "#1d1430", foam_color: "#f0c8ff", glow_color: "#7a1fff", opacity: 1, clarity: 0.05, flow_speed: 0.35, wave_strength: 0.15, wave_scale: 0.5, ripple_size: 0.6, foam: 0, bubbles: 0.35, scum: 0, reflectivity: 0.15, glow: 1.6, crust: 0.01 },
};

const slider = (def, min, max, step) => ({ type: "float", default: def, min, max, step });

export const realisticWater = {
    icon: `<i class="fas fa-water-ladder"></i>`,
    presets: PRESETS,
    highlight: waterHighlight,
    groups: {
        basics: ["enabled", "preset", "style", "contained"],
        colour: ["shallow_color", "deep_color", "opacity", "clarity"],
        motion: ["flow_direction", "flow_speed", "wave_strength", "wave_scale", "ripple_size"],
        surface: ["foam", "foam_color", "bubbles", "scum", "reflectivity"],
        glow: ["glow", "glow_color", "crust"],
    },
    refresh: () => refreshWaterBeds(),
    cacheKey: () => (waterQualityHigh() ? "rwHQ" : "rwLQ"),
    uniforms: {
        style: { type: "float", default: 0, choices: { 0: "levels3dpreview.shaders.realisticWater.styles.realistic", 1: "levels3dpreview.shaders.realisticWater.styles.stylized" } },
        contained: { type: "bool", default: true },
        shallow_color: { type: "vec3", default: PRESETS.water.shallow_color },
        deep_color: { type: "vec3", default: PRESETS.water.deep_color },
        opacity: slider(0.92, 0, 1, 0.01),
        clarity: slider(1.2, 0.02, 6, 0.01),
        flow_direction: slider(0, 0, 360, 1),
        flow_speed: slider(0.05, 0, 3, 0.01),
        wave_strength: slider(0.5, 0, 2, 0.01),
        wave_scale: slider(1, 0.1, 5, 0.05),
        ripple_size: slider(0.35, 0.05, 2, 0.01),
        foam: slider(0.6, 0, 1, 0.01),
        foam_color: { type: "vec3", default: PRESETS.water.foam_color },
        bubbles: slider(0, 0, 1, 0.01),
        scum: slider(0, 0, 1, 0.01),
        reflectivity: slider(0.8, 0, 1, 0.01),
        glow: slider(0, 0, 5, 0.05),
        glow_color: { type: "vec3", default: "#ffffff" },
        crust: slider(0, 0, 1, 0.01),
    },
    varying: {
        wpos: { type: "vec3" },
        top: { type: "float" },
    },
    vertexShader: [
        { mode: "append", injectionPoint: "#include <common>", noConditional: true, shaderCode: GLOBALS },
        { mode: "append", injectionPoint: "#include <begin_vertex>", noConditional: true, shaderCode: VERTEX },
    ],
    fragmentShader: [
        { mode: "append", injectionPoint: "#include <common>", noConditional: true, shaderCode: GLOBALS + HIGHLIGHT_GLSL },
        { mode: "append", injectionPoint: "#include <color_fragment>", noConditional: true, shaderCode: FRAGMENT },
        { mode: "append", injectionPoint: "#include <roughnessmap_fragment>", noConditional: true, shaderCode: "roughnessFactor = rw_rough;" },
        { mode: "append", injectionPoint: "#include <metalnessmap_fragment>", noConditional: true, shaderCode: "metalnessFactor = 0.0;" },
        { mode: "append", injectionPoint: "#include <normal_fragment_maps>", noConditional: true, shaderCode: "normal = normalize((viewMatrix * vec4(rw_n, 0.0)).xyz);" },
        { mode: "append", injectionPoint: "#include <emissivemap_fragment>", noConditional: true, shaderCode: "totalEmissiveRadiance = rw_emis;\n#define L3D_VM_KEEP (rw_emis * rw_lava)" },
        {
            mode: "prepend",
            injectionPoint: "#include <opaque_fragment>",
            noConditional: true,
            shaderCode: `
            float rw_nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
            float rw_fr = 0.05 + 0.95 * pow(1.0 - rw_nv, 3.0);
            diffuseColor.a = mix(diffuseColor.a, 1.0, rw_fr * realisticWater_reflectivity * rw_edge * mix(1.0, 0.3, rw_styl) * (1.0 - rw_lava) * (1.0 - rw_scum));
            ${HIGHLIGHT_APPLY}`,
        },
    ],
    onApply(mesh, entity3D, params) {
        const state = getWaterState(entity3D);
        state.meshes.add(mesh);
        state.params = params;
        const material = mesh.material;
        material.transparent = true;
        material.alphaTest = 0;
        material.envMapIntensity = Number(params.reflectivity ?? 0.8) * (Number(params.style) > 0.5 ? 0.4 : 1);
        mesh.castShadow = false;
    },
    onCompile(shader, { mesh, entity3D }) {
        const state = getWaterState(entity3D);
        const geometry = mesh.geometry;
        shader.uniforms.realisticWater_bed = state.uniforms.bed;
        shader.uniforms.realisticWater_bedMatrix = state.uniforms.bedMatrix;
        shader.uniforms.realisticWater_size = state.uniforms.size;
        shader.uniforms.realisticWater_sdMax = state.uniforms.sdMax;
        shader.uniforms.realisticWater_displace = { value: geometry.attributes.position.count > 64 ? 1 : 0 };
        Object.assign(shader.uniforms, highlightUniforms);
        if (waterQualityHigh()) shader.fragmentShader = "#define RW_HQ\n" + shader.fragmentShader;
    },
};
