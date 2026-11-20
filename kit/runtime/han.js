'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIDE = 24;
const GLYPH_BYTES = SIDE * SIDE / 8;
const pages = new Map();
const faces = new Map();
let pack;

function glyph(cp) {
    if (cp < 0x2e80 || cp > 0x3347f) return null;
    if (pack === undefined) {
        try { pack = fs.readFileSync(path.join(__dirname, 'fonts', 'han.bin')); }
        catch (error) { pack = null; }
    }
    const page = cp >>> 8;
    const index = page * 8;
    if (!pack || index + 8 > pack.length) return null;
    if (!pages.has(page)) {
        const offset = pack.readUInt32LE(index);
        const bytes = pack.readUInt32LE(index + 4);
        if (!offset || !bytes) return null;
        if (pages.size >= 16) pages.delete(pages.keys().next().value);
        pages.set(page, zlib.inflateSync(pack.slice(offset, offset + bytes)));
    }
    const start = (cp & 255) * GLYPH_BYTES;
    const bitmap = pages.get(page).slice(start, start + GLYPH_BYTES);
    if (!bitmap.some((value) => value !== 0)) return null;
    return bitmap;
}

function face(cp, bitmap) {
    if (!faces.has(cp)) {
        const alpha = Buffer.alloc(SIDE * SIDE);
        for (let i = 0; i < alpha.length; i++) {
            if ((bitmap[i >> 3] & (128 >> (i & 7))) !== 0) alpha[i] = 255;
        }
        if (faces.size >= 128) faces.delete(faces.keys().next().value);
        faces.set(cp, { atlasW: SIDE, atlasH: SIDE, alpha, size: 22 });
    }
    return faces.get(cp);
}

module.exports = { glyph, face, metrics: [0, 0, SIDE, SIDE, -1, -20, 22] };
