'use strict';

const { instrumentType } = require('./instrument-type');
const { SILVER_SIDE_DIALS, SILVER_SIDE_Y: SIDE_Y } = require('./panel-layout');

// 2019 X5 xDrive40i, BMW Canada MY19 product guide. The raw KombiIF field is litres.
const TANK_LITRES = 83;
const SPEED_SCALE_KMH = 260;
const RPM_SCALE = 8000;
const CENTRE_Y = 165;
const TRAIL_LIFETIME_MS = 650;
const TRAIL_MAX_SAMPLES = 8;
const CHROME = '#e8e9ed';
const SILVER = '#bec2cb';
const SILVER_PALETTES = {
    silver: { upper: '#252730', mid: '#484a55', lower: '#747783', rim: '#d4d6df', side: '#181b28' },
    amethyst: { upper: '#221a32', mid: '#4b365e', lower: '#9574a9', rim: '#b696d0', side: '#20182c' },
    cuprite: { upper: '#351a2c', mid: '#752c45', lower: '#e56b69', rim: '#df7985', side: '#211622' },
    chalcedon: { upper: '#344956', mid: '#6d8697', lower: '#c5d5dd', rim: '#bed7e8', side: '#16232d', darkText: true },
    lapis: { upper: '#182741', mid: '#2b4671', lower: '#6d92c6', rim: '#93b4e2', side: '#171e31' },
    fireOpal: { upper: '#593036', mid: '#ca6545', lower: '#ffbf83', rim: '#f7b789', side: '#211c29', darkText: true },
    gold: { upper: '#25242c', mid: '#42414c', lower: '#686579', rim: '#d6b379', side: '#191c29' },
    citrine: { upper: '#57421d', mid: '#b38535', lower: '#f6d888', rim: '#ebc771', side: '#21202a', darkText: true },
    jade: { upper: '#254444', mid: '#4e8d83', lower: '#a7d9cd', rim: '#a4d8d1', side: '#14282d', darkText: true },
    peridot: { upper: '#414526', mid: '#818748', lower: '#c2c980', rim: '#c4c985', side: '#19242b', darkText: true },
};
const DEMO = {
    speed: 0, rpm: 780, range: 520, fuelLitres: 83, ambient: 15, stage: 'P', clock: '13:50',
};

function point(cx, cy, angle, radius, cross = 0) {
    const rad = angle * Math.PI / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    return [cx + sin * radius + cos * cross, cy - cos * radius + sin * cross];
}

function fraction(value, max) {
    return Number.isFinite(value) && value >= 0 && value <= max ? value / max : null;
}

function valueText(value, decimals = 0) {
    return Number.isFinite(value) ? value.toFixed(decimals) : '--';
}

function speedAngle(speed) {
    return Number.isFinite(speed) && speed >= 0 ? -136 + Math.min(speed / SPEED_SCALE_KMH, 1) * 272 : null;
}

function updateSilverTrail(trail, speed, now) {
    const angle = speedAngle(speed);
    const gap = now - trail.now;
    const samples = angle === null || gap < 0 || gap >= TRAIL_LIFETIME_MS
        ? [] : (trail.samples || []).filter((sample) => now - sample.at < TRAIL_LIFETIME_MS);
    if (angle !== null && gap >= 0 && gap < TRAIL_LIFETIME_MS && Number.isFinite(trail.angle) && angle !== trail.angle) {
        samples.push({ angle: trail.angle, direction: Math.sign(angle - trail.angle), at: now });
        if (samples.length > TRAIL_MAX_SAMPLES) samples.shift();
    }
    trail.now = now;
    trail.angle = angle;
    trail.samples = samples;
    return trail;
}

function silverDials(canvas, data, opts, selections, paintSlot) {
    const readings = opts.demo ? DEMO : data;
    const palette = SILVER_PALETTES[selections.faceColour] || SILVER_PALETTES.silver;
    const readingInk = palette.darkText ? '#111720' : '#f5f5fb';
    const centreMark = palette.darkText ? '#202a3c70' : '#d1d4e27a';
    const fineMark = palette.darkText ? '#202a3c4e' : '#c4c7d45c';
    const scale = opts.scale || 1;
    const x = (v) => (opts.x || 0) + v * scale;
    const y = (v) => (opts.y || 0) + v * scale;
    const ring = (cx, cy, r0, r1, a0, a1, colour, ramp) =>
        canvas.arc(x(cx), y(cy), r0 * scale, r1 * scale, a0, a1, colour, ramp ? { ramp } : undefined);
    const disc = (cx, cy, radius, colour) => canvas.circle(x(cx), y(cy), radius * scale, colour);
    const radialGlow = (cx, cy, radius, colour, inner = 0) =>
        canvas.radialGlow(x(cx), y(cy), radius * scale, colour, inner * scale);
    const face = (cx, cy, radius, stops) =>
        canvas.card(x(cx - radius), y(cy - radius), radius * 2 * scale, radius * 2 * scale, radius * scale, stops);
    const line = (a, b, width, colour) => canvas.line(x(a[0]), y(a[1]), x(b[0]), y(b[1]), width * scale, colour);
    const plate = (points, colour) => canvas.quad(points.map(([px, py]) => [x(px), y(py)]), colour);
    const { text, fitBold } = instrumentType(canvas, x, y, scale, CHROME);

    function mark(cx, cy, angle, inner, outer, width, colour) {
        line(point(cx, cy, angle, inner), point(cx, cy, angle, outer), width, colour);
    }

    function needleShadow(p, size) {
        const shadow = (width) => [p(94, 0), p(-23, 0), p(-16, -width * 0.68), p(71, -width)];
        if (canvas.featheredQuad) {
            canvas.featheredQuad(shadow(29).map(([px, py]) => [x(px), y(py)]),
                '#05070e9c', [1, 9 * size * scale, 28 * size * scale, 11 * size * scale]);
        } else {
            // The preview recorder supports solid polygons.
            for (let width = 29; width >= 2; width -= 2.5) plate(shadow(width), '#05070e13');
        }
    }

    function needleTrail(trail, currentAngle) {
        for (const sample of trail.samples) {
            const age = (trail.now - sample.at) / TRAIL_LIFETIME_MS;
            const opacity = Math.pow(1 - age, 1.7);
            // Seed each group so its particles keep their positions as they fade.
            let seed = sample.at >>> 0;
            const random = () => {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            for (let i = 0; i < 24; i++) {
                const spread = 3 + 23 * Math.pow(random(), 1.55) + age * 11;
                const angle = sample.angle - sample.direction * spread;
                const radius = 102 - 46 * Math.pow(random(), 1.65) - age * 5;
                const size = 0.37 + 0.51 * Math.pow(random(), 2);
                const alpha = Math.round((54 + 149 * random()) * opacity);
                if (!alpha || Math.abs(angle - currentAngle) > 50) continue;
                const [px, py] = point(480, CENTRE_Y, angle, radius);
                if (size > 0.65) disc(px, py, size * 2.5, [188, 201, 240, Math.round(alpha * 0.16)]);
                disc(px, py, size, [237, 242, 255, alpha]);
            }
        }
    }

    function sideFace(slot, defaultKind) {
        const cx = SILVER_SIDE_DIALS[slot];
        const left = slot === 'leftInner';
        const r = 96;
        const start = left ? 137 : -44;
        const end = left ? 405 : 224;
        const open = '#0c0e1300';
        radialGlow(cx, SIDE_Y, r + 11, '#a6b0d346', r);
        disc(cx, SIDE_Y, r + 1, '#363944');
        disc(cx, SIDE_Y, r - 1, '#08090d');
        disc(cx, SIDE_Y, r - 4, palette.side + '54');
        radialGlow(cx, SIDE_Y, r - 4, palette.rim + '4d');
        ring(cx, SIDE_Y, r - 5, r - 2, start, end, '#181b22', [open, '#515763', '#42454e', '#777c85', open]);
        ring(cx, SIDE_Y, r - 2, r + 1, start, end, CHROME, [open, '#e5e6ec', '#fbfaf7', '#dbdce5', open]);

        if ((selections[slot] || defaultKind) !== defaultKind) return;
        const sign = left ? -1 : 1;
        for (let n = 0; n <= 42; n++) {
            const angle = sign * n * (180 / 42);
            const major = n % 21 === 0;
            mark(cx, SIDE_Y, angle, major ? 40 : 49, major ? 71 : 56, major ? 1.1 : 0.7,
                major ? '#b2b3bc' : '#525666');
        }
        text(left ? '8' : '100', cx, SIDE_Y - 68, 14, SILVER, 'bold');
        text(left ? '4' : '50', cx + sign * 75, SIDE_Y + 5, 14, SILVER, 'bold');
        text(left ? '0' : '0%', cx, SIDE_Y + 78, 13, SILVER, 'bold');

        disc(cx, SIDE_Y, 10, '#050609');
    }

    function sideReading(slot, defaultKind, value, readout, unit) {
        const cx = SILVER_SIDE_DIALS[slot];
        const left = slot === 'leftInner';
        const kind = selections[slot] || defaultKind;
        const custom = kind !== defaultKind;
        if (custom && opts.mapSlot !== slot) paintSlot(kind, cx, SIDE_Y);
        if (!custom && value !== null) {
            const angle = (left ? -1 : 1) * (1 - value) * 180;
            const size = 68 / 95;
            const p = (distance, cross = 0) => point(cx, SIDE_Y, angle, distance * size, cross * size);
            needleShadow(p, size);
            line(p(-23), p(95), 2.8, '#07080b');
            line(p(-23), p(95), 1.15, '#dedfe7');
        }
        const readoutX = cx + (left ? 1 : -1) * (custom ? 108 : 51);
        const baseline = custom ? 280 : SIDE_Y + 10;
        text(valueText(readout), readoutX, baseline, 25);
        text(unit, readoutX, baseline + 17, 11, SILVER, 'bold', 0.9);
    }

    const rpm = fraction(readings.rpm, RPM_SCALE);
    const fuel = fraction(readings.fuelLitres, TANK_LITRES);
    const paintBackground = opts.paintBackground || ((paint) => paint());
    paintBackground(() => {
        sideFace('leftInner', 'rpm');
        sideFace('rightInner', 'fuelRange');
        disc(480, CENTRE_Y, 121, '#2e3137');
        ring(480, CENTRE_Y, 119, 121, 0, 360, '#92949b', ['#9598a0', '#464951', '#252830', '#5f636b', '#9598a0']);
        ring(480, CENTRE_Y, 114, 118, 0, 360, '#101217');
        face(480, CENTRE_Y, 113, [[0, palette.upper], [0.24, palette.upper], [0.58, palette.mid], [1, palette.lower]]);
        ring(480, CENTRE_Y, 111, 113, 0, 360, '#5c6068', ['#4d4f57', '#696d79', '#454852', palette.rim, '#4d4f57']);

        for (let n = 0; n <= 84; n++) {
            const angle = -136 + (272 / 84) * n;
            const major = n % 14 === 0;
            mark(480, CENTRE_Y, angle, major ? 54 : 69, major ? 100 : 82,
                major ? 1.0 : 0.55, major ? centreMark : fineMark);
        }
        text('R', 477, CENTRE_Y - 37, 23, centreMark);
        text('R', 483, CENTRE_Y - 31, 23, centreMark);

        disc(480, CENTRE_Y, 18, palette.mid);
        disc(480, CENTRE_Y, 11, '#272729');
    });
    sideReading('leftInner', 'rpm', rpm, readings.rpm, 'RPM');
    sideReading('rightInner', 'fuelRange', fuel, readings.range, 'KM RANGE');
    const speed = opts.demo && Number.isFinite(opts.previewSpeed) ? opts.previewSpeed : readings.speed;
    const angle = speedAngle(speed);
    if (angle !== null) {
        const p = (distance, cross) => point(480, CENTRE_Y, angle, distance, cross);
        needleShadow(p, 1);
        if (selections.needleEffect === 'starlight' && opts.needleTrail) needleTrail(opts.needleTrail, angle);
        const blade = [p(95, 0), p(6, 2.5), p(-23, 0), p(6, -3.5)];
        plate(blade, '#08090b');
        line(blade[0], blade[3], 0.9, palette.darkText ? '#626670' : '#bac0cd');
    }
    const speedText = valueText(angle === null ? null : speed);
    const speedSize = fitBold(speedText, 54, 130);
    const speedY = CENTRE_Y + 78;
    if (palette.darkText) {
        text(speedText, 480, speedY + 0.8, speedSize, '#ffffff54', 'bold');
    }
    text(speedText, 480, speedY, speedSize, readingInk, 'bold');
    text('KM/H', 480, speedY + 16, 13, readingInk, 'bold', 1.1);

    const clock = opts.clock || (opts.demo ? DEMO.clock : '--:--');
    const statusY = 282;
    text(clock, 155, statusY, 19, SILVER);
    text(Number.isFinite(readings.ambient) ? valueText(readings.ambient, 1) + '°C' : '--°C', 808, statusY, 19, SILVER);
    const activeGear = readings.stage || readings.selection;
    const gearX = 823;
    ['P', 'R', 'N', 'D'].forEach((gear, index) => {
        const active = gear === activeGear;
        text(gear, gearX, 142 + index * 18, 16, active ? CHROME : '#7f8490', active ? 'bold' : 'regular');
    });
}

module.exports = { silverDials, updateSilverTrail, SILVER_PALETTES, TANK_LITRES };
