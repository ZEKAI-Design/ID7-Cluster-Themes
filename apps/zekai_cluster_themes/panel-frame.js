'use strict';

const { Canvas } = require('./kit/canvas');
const { panel } = require('./dials');
const { PANEL_WIDTH, PANEL_HEIGHT, panelLayout } = require('./panel-layout');
const { wazeFullPanel } = require('./waze-full-screen');
const { vdoPanel } = require('./vdo-retro');

function renderPanelFrame(theme, choices, data, demo = false, canvas = new Canvas(PANEL_WIDTH, PANEL_HEIGHT)) {
    const liveFullMap = theme === 'wazeFull' && data.mapSlot === 'fullMap';
    canvas.clear(liveFullMap ? '#00000000' : theme === 'vdoRetro' ? '#070809' : '#030507');
    const layout = panelLayout(theme);
    if (theme === 'wazeFull') {
        wazeFullPanel(canvas, data, { demo, active: liveFullMap, w: PANEL_WIDTH, h: PANEL_HEIGHT });
    } else if (theme === 'vdoRetro') {
        vdoPanel(canvas, data, Object.assign(layout, { demo }));
    } else {
        panel(canvas, theme, choices, data, Object.assign(layout, {
            demo, background: false, clock: data.clock, mapSlot: data.mapSlot,
        }));
    }
    // In a side dial, the compatible Waze provider draws its map above
    // this image. Keep the face opaque if the provider stops drawing.
    return canvas;
}

// Fifteen 48-pixel bands fit within the renderer client's dirty rectangle limit.
function sendPanelFrame(client, ref, canvas, previous) {
    const pixels = Buffer.from(canvas.d.buffer);
    if (!previous) return client.pixels(ref, null, pixels);
    const lastPixels = Buffer.from(previous.d.buffer);
    const next = new Uint32Array(canvas.d.buffer);
    const last = new Uint32Array(previous.d.buffer);
    const rects = [];
    const rows = [];
    const width = canvas.w;
    const bandHeight = 48;
    for (let band = 0; band < canvas.h; band += bandHeight) {
        let x0 = width, x1 = -1, y0 = -1, y1 = -1;
        const end = Math.min(band + bandHeight, canvas.h);
        for (let y = band; y < end; y++) {
            const start = y * width;
            const byteStart = start * 4;
            const byteEnd = byteStart + width * 4;
            if (pixels.compare(lastPixels, byteStart, byteEnd, byteStart, byteEnd) === 0) continue;
            if (y0 < 0) y0 = y;
            y1 = y;
            for (let x = 0; x < x0; x++) {
                if (next[start + x] !== last[start + x]) { x0 = x; break; }
            }
            for (let x = width - 1; x > x1; x--) {
                if (next[start + x] !== last[start + x]) { x1 = x; break; }
            }
        }
        if (y0 < 0) continue;
        rects.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
        for (let y = y0; y <= y1; y++) {
            rows.push(pixels.slice((y * width + x0) * 4, (y * width + x1 + 1) * 4));
        }
    }
    return !rects.length || client.pixels(ref, rects, Buffer.concat(rows));
}

module.exports = { renderPanelFrame, sendPanelFrame };
