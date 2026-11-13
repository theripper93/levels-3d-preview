import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "assets" / "particles"
OUTPUT = SOURCE / "atlas"
MANIFEST = ROOT / "scripts" / "vfx" / "atlas.js"
MODULE_URL = "modules/levels-3d-preview/assets/particles"

SHEETS = {"flame2x2": 2, "lightning_4x4": 2, "smoke9x9": 3, "debris_2x2": 2, "splash_2x2": 2}


def numbered(prefix, count, suffix=""):
    return [f"{prefix}_{i:02d}{suffix}" for i in range(1, count + 1)]


SPRITE_ORDER = [
    *numbered("circle", 5), *numbered("light", 3), "flare_01", "emberssmall", "stars", *numbered("star", 9),
    *numbered("magic", 5), *numbered("symbol", 2), *numbered("twirl", 3), *numbered("window", 5),
    *numbered("fire", 2), *numbered("flame", 7), "flame2x2", *numbered("muzzle", 5), *numbered("scorch", 3),
    *numbered("spark", 7), "lightning_4x4", *numbered("trace", 7), "scratch_01", *numbered("slash", 6), "mist_01",
    *numbered("smoke", 10), "smoke9x9", "dust", *numbered("dirt", 3), "debris_2x2", "splash_2x2",
    "flame_05_rotated", "flame_06_rotated", *numbered("muzzle", 5, "_rotated"), "spark_05_rotated", "spark_06_rotated", *numbered("trace", 10, "_rotated"),
]

VARIANT_SETS = {
    "circle_ring": ("circle_01", 4),
    "star": ("star_01", 9),
    "twirl": ("twirl_01", 3),
    "fire": ("fire_01", 2),
    "flame_wisp": ("flame_01", 4),
    "flame_tongue": ("flame_05", 2),
    "muzzle": ("muzzle_01", 5),
    "scorch": ("scorch_01", 3),
    "spark_arc": ("spark_01", 4),
    "spark_bolt": ("spark_05", 2),
    "trace": ("trace_01", 7),
    "smoke": ("smoke_01", 10),
    "dirt": ("dirt_01", 3),
    "muzzle_rotated": ("muzzle_01_rotated", 5),
    "trace_rotated": ("trace_01_rotated", 7),
    "spiral": ("spiral_1", 40),
}

GLYPH_ORDER = [f"spiral_{i}" for i in range(1, 41)]

EXISTING_ATLASES = {
    "toon1": ("atlas_1_10x10.webp", 10),
    "toon2": ("atlas_2_10x10.webp", 10),
}

EXISTING_SPRITES = {
    "toon_disc": ("toon1", 0, 1, "single"),
    "toon_dot": ("toon1", 1, 1, "single"),
    "toon_cloud": ("toon1", 2, 1, "single"),
    "toon_triangle": ("toon1", 3, 1, "single"),
    "toon_ring": ("toon1", 4, 1, "single"),
    "toon_cross": ("toon1", 5, 1, "single"),
    "toon_crater": ("toon1", 6, 1, "single"),
    "toon_ring_dissolve": ("toon1", 10, 9, "sequence"),
    "toon_disc_wipe": ("toon1", 19, 9, "sequence"),
    "toon_puff_pop": ("toon1", 28, 9, "sequence"),
    "toon_arc_fade": ("toon1", 37, 9, "sequence"),
    "toon_puff_scatter": ("toon1", 46, 9, "sequence"),
    "toon_donut_wipe": ("toon1", 55, 9, "sequence"),
    "toon_zap": ("toon1", 64, 9, "sequence"),
    "toon_ring_break": ("toon1", 73, 9, "sequence"),
    "toon_spike_burst": ("toon1", 82, 9, "sequence"),
    "toon_streak_fade": ("toon1", 91, 9, "sequence"),
    "toon_arrow_shrink": ("toon2", 19, 8, "sequence"),
    "toon_disc_hole": ("toon2", 27, 9, "sequence"),
    "toon_droplet": ("toon2", 36, 9, "sequence"),
    "toon_disc_erode": ("toon2", 45, 8, "sequence"),
    "toon_swoosh": ("toon2", 53, 9, "variants"),
    "toon_arc_loops": ("toon2", 62, 9, "sequence"),
    "toon_spark_burst": ("toon2", 71, 8, "sequence"),
    "toon_blob": ("toon2", 79, 9, "variants"),
}

LOOSE_GLOB = ("magiccircles", "magic_circle_*.webp")

BAKED = {
    "sprites": {"file": "sprites.webp", "grid": 12, "cell": 136, "pad": 4, "encode": {"lossless": True, "quality": 100}},
    "glyphs": {"file": "glyphs.webp", "grid": 7, "cell": 256, "pad": 4, "encode": {"quality": 90, "alpha_quality": 70}},
}


def find_source(name):
    for folder in (SOURCE, SOURCE / "Rotated"):
        for extension in (".png", ".webp"):
            path = folder / f"{name}{extension}"
            if path.exists():
                return path
    raise FileNotFoundError(name)


def load_rgba(path):
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)


def split_sheet(pixels, grid):
    size = pixels.shape[0] // grid
    return [pixels[r * size:(r + 1) * size, c * size:(c + 1) * size] for r in range(grid) for c in range(grid)]


def resize_premultiplied(pixels, size):
    data = pixels.astype(np.float32) / 255
    alpha = data[..., 3]
    channels = [data[..., i] * alpha for i in range(3)] + [alpha]
    resized = [np.asarray(Image.fromarray(channel, "F").resize((size, size), Image.LANCZOS)) for channel in channels]
    alpha = np.clip(resized[3], 0, 1)
    safe = np.maximum(alpha, 1e-6)
    rgb = [np.clip(channel / safe, 0, 1) for channel in resized[:3]]
    out = np.stack([*rgb, alpha], axis=-1)
    return np.round(out * 255).astype(np.uint8)


def bleed_colour(cells):
    rgb = cells[..., :3].astype(np.float32)
    known = cells[..., 3] > 0
    rgb[~known] = 0
    fillable = known.any(axis=(1, 2))
    offsets = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
    while not known[fillable].all():
        padded_rgb = np.pad(rgb * known[..., None], ((0, 0), (1, 1), (1, 1), (0, 0)))
        padded_known = np.pad(known, ((0, 0), (1, 1), (1, 1))).astype(np.float32)
        height, width = known.shape[1:]
        total = np.zeros_like(rgb)
        count = np.zeros(known.shape, dtype=np.float32)
        for dy, dx in offsets:
            total += padded_rgb[:, 1 + dy:1 + dy + height, 1 + dx:1 + dx + width]
            count += padded_known[:, 1 + dy:1 + dy + height, 1 + dx:1 + dx + width]
        fresh = ~known & (count > 0)
        rgb[fresh] = total[fresh] / count[fresh][:, None]
        known |= fresh
    out = cells.copy()
    out[..., :3] = np.round(rgb).astype(np.uint8)
    return out


def build_atlas(spec, tiles):
    grid, cell, pad = spec["grid"], spec["cell"], spec["pad"]
    if len(tiles) > grid * grid:
        raise ValueError(f"{spec['file']}: {len(tiles)} tiles do not fit a {grid}x{grid} grid")
    cells = np.zeros((len(tiles), cell, cell, 4), dtype=np.uint8)
    inner = cell - 2 * pad
    for i, tile in enumerate(tiles):
        if tile.shape[0] != inner:
            tile = resize_premultiplied(tile, inner)
        cells[i, pad:pad + inner, pad:pad + inner] = tile
    cells = bleed_colour(cells)
    atlas = np.zeros((grid * cell, grid * cell, 4), dtype=np.uint8)
    for i in range(len(tiles)):
        row, col = divmod(i, grid)
        atlas[row * cell:(row + 1) * cell, col * cell:(col + 1) * cell] = cells[i]
    path = OUTPUT / spec["file"]
    Image.fromarray(atlas, "RGBA").save(path, "WEBP", method=6, exact=True, **spec["encode"])
    if spec["encode"].get("lossless") and not np.array_equal(load_rgba(path), atlas):
        raise RuntimeError(f"{path} did not round-trip losslessly")
    return path


def bake():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    atlases = {}
    sprites = {}

    sprite_tiles = []
    for name in SPRITE_ORDER:
        pixels = load_rgba(find_source(name))
        tiles = split_sheet(pixels, SHEETS[name]) if name in SHEETS else [pixels]
        sprites[name] = ("sprites", len(sprite_tiles), len(tiles), "variants" if name in SHEETS else "single")
        sprite_tiles.extend(tiles)

    glyph_tiles = []
    for name in GLYPH_ORDER:
        sprites[name] = ("glyphs", len(glyph_tiles), 1, "single")
        glyph_tiles.append(load_rgba(find_source(name)))

    for atlas_id, tiles in (("sprites", sprite_tiles), ("glyphs", glyph_tiles)):
        spec = BAKED[atlas_id]
        path = build_atlas(spec, tiles)
        atlases[atlas_id] = (f"{MODULE_URL}/atlas/{spec['file']}", spec["grid"], spec["pad"] / spec["cell"])
        print(f"{path.relative_to(ROOT)}: {spec['grid']}x{spec['grid']} cells of {spec['cell']}px, {len(tiles)} used, {path.stat().st_size} bytes")

    for name, (first, count) in VARIANT_SETS.items():
        atlas_id, index, _, _ = sprites[first]
        sprites[name] = (atlas_id, index, count, "variants")

    for atlas_id, (file, grid) in EXISTING_ATLASES.items():
        if not (SOURCE / file).exists():
            raise FileNotFoundError(file)
        atlases[atlas_id] = (f"{MODULE_URL}/{file}", grid, 0)
    sprites.update(EXISTING_SPRITES)

    folder, pattern = LOOSE_GLOB
    for path in sorted((SOURCE / folder).glob(pattern)):
        atlases[path.stem] = (f"{MODULE_URL}/{folder}/{path.name}", 1, 0)
        sprites[path.stem] = (path.stem, 0, 1, "single")

    write_manifest(atlases, sprites)
    print(f"{MANIFEST.relative_to(ROOT)}: {len(atlases)} atlases, {len(sprites)} sprites")


def js_key(name):
    return name if re.fullmatch(r"[A-Za-z_$][\w$]*", name) else json.dumps(name)


def write_manifest(atlases, sprites):
    atlas_lines = [f"    {js_key(k)}: {{ src: {json.dumps(src)}, cols: {grid}, rows: {grid}, inset: {inset:.6g} }}," for k, (src, grid, inset) in atlases.items()]
    sprite_lines = [f"    {js_key(k)}: {{ atlas: {json.dumps(atlas)}, index: {index}, frames: {frames}, kind: {json.dumps(kind)} }}," for k, (atlas, index, frames, kind) in sprites.items()]
    MANIFEST.write_text(MANIFEST_TEMPLATE.replace("__ATLASES__", "\n".join(atlas_lines)).replace("__SPRITES__", "\n".join(sprite_lines)), encoding="utf-8", newline="\n")


MANIFEST_TEMPLATE = """export const GENERATED_BY = "bake-vfx-atlas.py";

export const ATLASES = {
__ATLASES__
};

export const SPRITES = {
__SPRITES__
};

const PARTICLE_PATH = /modules\\/levels-3d-preview\\/assets\\/particles\\/(?:[^/?#]+\\/)*([^/?#.]+)\\.[^/?#.]+(?:[?#].*)?$/i;

export function getSprite(name) {
    return SPRITES[name];
}

export function spriteNameFromPath(path) {
    const name = PARTICLE_PATH.exec(path ?? "")?.[1].toLowerCase();
    return name && Object.hasOwn(SPRITES, name) ? name : undefined;
}

export function getSpriteUV(name, frame = 0) {
    const sprite = SPRITES[name];
    const { cols, rows, inset } = ATLASES[sprite.atlas];
    const tile = sprite.index + frame;
    const col = tile % cols;
    const row = Math.floor(tile / cols);
    return { u: (col + inset) / cols, v: (rows - row - 1 + inset) / rows, w: (1 - 2 * inset) / cols, h: (1 - 2 * inset) / rows };
}
"""


if __name__ == "__main__":
    bake()
