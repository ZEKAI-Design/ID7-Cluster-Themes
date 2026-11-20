'use strict';

const { Canvas } = require('./kit/canvas');
const { panelLayout, SILVER_CENTRE, SILVER_SIDE_DIALS, SILVER_SIDE_Y } = require('./panel-layout');
const { paintSilverNeedle, speedAngle, rpmAngle, SILVER_PALETTES } = require('./silver-dials');

// Upload each needle and its shadow once, then rotate that image around the
// dial hub with small renderer messages as the vehicle signals change.
class SilverNeedles {
    constructor(client) {
        this.client = client;
        this.layers = [];
        this.lightFace = null;
    }

    add(cx, cy, centre, lightFace) {
        const { x, y, scale } = panelLayout('silver');
        const px = Math.ceil(32 * scale);
        const py = Math.ceil(98 * scale);
        const w = px + Math.ceil(6 * scale);
        const h = py + Math.ceil(27 * scale);
        const canvas = new Canvas(w, h);
        paintSilverNeedle(canvas, px, py, 0, scale, centre, lightFace);
        const ref = this.client.image({
            target: 'panel', klass: 'overlay', z: 1, x: Math.round(x + cx * scale) - px,
            y: Math.round(y + cy * scale) - py, w, h, iw: w, ih: h, px, py,
            visible: false, sampling: 'bilinear',
        });
        if (!ref) return false;
        this.layers.push({ ref, angle: null });
        return this.client.pixels(ref, null, Buffer.from(canvas.d.buffer));
    }

    prepare(choices) {
        const lightFace = Boolean((SILVER_PALETTES[choices.faceColour] || SILVER_PALETTES.silver).lightFace);
        if (this.lightFace === lightFace && this.layers.length === 2) return true;
        this.drop();
        this.lightFace = lightFace;
        return this.add(SILVER_CENTRE[0], SILVER_CENTRE[1], true, lightFace) &&
            this.add(SILVER_SIDE_DIALS.leftInner, SILVER_SIDE_Y, false, false);
    }

    update(data, choices, shown) {
        const angles = [
            speedAngle(data.speed),
            !choices.leftInner || choices.leftInner === 'rpm' ? rpmAngle(data.rpm) : null,
        ];
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            const angle = shown ? angles[i] : null;
            if (angle === layer.angle) continue;
            this.client.set(layer.ref, angle === null ? { visible: false } : { visible: true, rotate: angle });
            layer.angle = angle;
        }
    }

    owns(ref) { return this.layers.some((layer) => layer.ref === ref); }

    drop() {
        for (const { ref } of this.layers) this.client.drop(ref);
        this.layers = [];
    }
}

module.exports = { SilverNeedles };
