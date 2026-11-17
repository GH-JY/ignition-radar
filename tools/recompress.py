"""Re-encode the entry's screenshots as palette PNGs, in place.

Each screenshots/*.png keeps its pixel dimensions, name and count: the pixels are
converted to RGB and then to an adaptive 96-colour palette; only a file that would
land over the 512 KiB cap drops to 64 and then 48 colours. Files are encoded in
memory and replaced only once the bytes fit, so a failure leaves the original.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image

MAX_BYTES = 524_288
COLOR_STEPS = (96, 64, 48)

root = Path(__file__).resolve().parents[1]
shots = sorted((root / "screenshots").glob("*.png"))
if not shots:
    sys.exit("recompress: no screenshots/*.png found")

total = 0
for path in shots:
    before = path.stat().st_size
    with Image.open(path) as source:
        source.load()
        size = source.size
        rgb = source.convert("RGB")

    encoded = None
    for colors in COLOR_STEPS:
        buffer = io.BytesIO()
        rgb.convert("P", palette=Image.ADAPTIVE, colors=colors).save(
            buffer, format="PNG", optimize=True
        )
        data = buffer.getvalue()
        if len(data) <= MAX_BYTES:
            encoded = data
            break

    if encoded is None:
        sys.exit(f"recompress: {path.name} stays over {MAX_BYTES} bytes at 48 colours")

    with Image.open(io.BytesIO(encoded)) as check:
        if check.size != size:
            sys.exit(f"recompress: {path.name} changed size {size} -> {check.size}")

    path.write_bytes(encoded)
    total += len(encoded)
    print(f"{path.name}: {before} -> {len(encoded)} bytes, {colors} colours, {size[0]}x{size[1]}")

print(f"total: {total} bytes across {len(shots)} files")
