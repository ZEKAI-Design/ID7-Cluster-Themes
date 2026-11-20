"""Bake the CC0 Jigmo 20250912 font family into a paged 1-bit Han glyph file."""
import io
import struct
import sys
import zipfile
import zlib
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont


SIDE = 24
HAN_RANGES = (
    (0x4E00, 0x9FFF), (0x3400, 0x4DBF), (0x20000, 0x2A6DF),
    (0x2A700, 0x2B73F), (0x2B740, 0x2B81D), (0x2B820, 0x2CEAD),
    (0x2CEB0, 0x2EBE0), (0x30000, 0x3134A), (0x31350, 0x323AF),
    (0x2EBF0, 0x2EE5D), (0x323B0, 0x33479),
)
RANGES = (
    (0x2E80, 0x303F), (0x3100, 0x312F), (0x31A0, 0x31EF),
    (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF),
    (0xFE10, 0xFE6F), (0xFF00, 0xFFEF),
    (0x20000, 0x2EE5F), (0x2F800, 0x2FA1F), (0x30000, 0x323AF),
    (0x323B0, 0x3347F),
)
INDEX_PAGES = (max(end for _, end in RANGES) >> 8) + 1


def bake(source, output):
    pages = {}
    glyphs = set()
    with zipfile.ZipFile(source) as archive:
        for name in ('Jigmo.ttf', 'Jigmo2.ttf', 'Jigmo3.ttf'):
            member, = [p for p in archive.namelist() if Path(p).name == name]
            data = archive.read(member)
            font = ImageFont.truetype(io.BytesIO(data), 22)
            cmap = TTFont(io.BytesIO(data), lazy=True).getBestCmap()
            for cp in cmap:
                if cp in glyphs or not any(start <= cp <= end for start, end in RANGES):
                    continue
                image = Image.new('L', (SIDE, SIDE))
                ImageDraw.Draw(image).text((1, 20), chr(cp), font=font, fill=255, anchor='ls')
                bitmap = image.point(lambda value: 255 if value >= 96 else 0, mode='1').tobytes()
                if not any(bitmap):
                    continue
                glyphs.add(cp)
                page = pages.setdefault(cp >> 8, bytearray(256 * len(bitmap)))
                start = (cp & 255) * len(bitmap)
                page[start:start + len(bitmap)] = bitmap
    assert len(glyphs) >= 100000, len(glyphs)
    missing = [cp for start, end in HAN_RANGES for cp in range(start, end + 1) if cp not in glyphs]
    assert not missing, [f'U+{cp:X}' for cp in missing[:24]]
    assert all(ord(ch) in glyphs for ch in '繁體简体龘𠮷𰻞𱁬')
    index = bytearray(INDEX_PAGES * 8)
    chunks = []
    offset = len(index)
    for page, data in sorted(pages.items()):
        compressed = zlib.compress(data, 9)
        struct.pack_into('<II', index, page * 8, offset, len(compressed))
        chunks.append(compressed)
        offset += len(compressed)
    output.write_bytes(bytes(index) + b''.join(chunks))
    print('Baked', len(glyphs), 'Han and related glyphs')


if __name__ == '__main__':
    bake(Path(sys.argv[1]), Path(sys.argv[2]))
