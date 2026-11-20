'use strict';

const { silverDials, SILVER_TEXT } = require('./silver-dials');
const { instrumentType } = require('./instrument-type');
const { PORSCHE_CENTRE, PORSCHE_DIALS, SILVER_SIDE_DIALS } = require('./panel-layout');

const INK = '#eef4ff';
const SOFT = '#acbbd5';
const RIM_WIDTH = 2.7;
const DEFAULT_FULL_RANGE_KM = 800;
const BLACK_FACE = { rim: '#9095a7', edge: '#262832', face: '#08090e', glow: '#10111a', ring: '#171923' };
const PALETTES = {
    navy: { rim: '#9194a5', edge: '#2c2d3c', face: '#242631', glow: '#3d3f4e', ring: '#53556a' },
    blue: { rim: '#91a7db', edge: '#24315b', face: '#131c40', glow: '#1645b0', ring: '#2561db' },
    silver: { rim: '#d7d7dc', edge: '#34353c', face: '#727277', glow: '#b3b3b9', ring: '#bebec4',
        centreFace: ['#bdbdc2', '#e4e4e8', '#e0e0e3'], ink: '#ffffff', soft: '#ffffff',
        textShadow: '#3b3c45', outline: true },
    magenta: { rim: '#dbaccb', edge: '#572744', face: '#39142f', glow: '#981464', ring: '#d52a94' },
    red: Object.assign({ centreRing: '#db2b50', centreGlow: '#ff5c72', textShadow: '#391221' }, BLACK_FACE),
    yellow: Object.assign({ centreRing: '#e5a91e', centreGlow: '#ffda6c', textShadow: '#33260d' }, BLACK_FACE),
    whiteRing: Object.assign({ centreRing: '#e2e5ec', centreGlow: '#f9fbff', textShadow: '#3b3c45', outline: true }, BLACK_FACE),
    blueRing: Object.assign({ centreRing: '#194cda', centreGlow: '#4394ff', textShadow: '#0b2368' }, BLACK_FACE),
};
const SLOTS = ['leftOuter', 'leftInner', 'rightInner', 'rightOuter'];
const SILVER_SLOTS = Object.keys(SILVER_SIDE_DIALS);
const NAMES = {
    battery: '12 V battery', analogueSpeed: 'Speedometer', oilGauges: 'Oil pressure & temp', coolantGauge: 'Coolant gauge',
    coolant: 'Coolant', oil: 'Engine oil', ambient: 'Outside temperature', range: 'Fuel range',
    clock: 'Clock', tyres: 'Tyre pressures', temps: 'Oil and coolant',
    media: 'Now playing', waze: 'Waze', none: 'Blank', rpm: 'Engine RPM', fuelRange: 'Fuel & range',
};
const SHORT = { coolant: 'COOLANT', oil: 'OIL', ambient: 'OUTSIDE', range: 'RANGE' };
const MAP_ROADS = [
    [[-90, 14], [-53, -18], [-29, -22], [9, -44], [63, -51], [92, -70]],
    [[-93, -29], [-58, -43], [-19, -65], [29, -81]],
    [[-53, 90], [-37, 55], [-36, 17], [-14, -20], [5, -80]],
    [[65, 91], [42, 62], [39, 19], [64, -15], [93, -24]],
    [[-89, 47], [-43, 41], [-11, 21], [42, 19], [91, -1]],
    [[20, 95], [7, 43], [8, 14], [25, -29], [47, -56]],
    [[-61, -12], [-19, 2], [27, -19], [88, -10]],
];
const MAP_ROUTE = [[-19, 90], [-2, 43], [-3, 9], [7, -5], [46, -19], [68, -56]];
const DEMO = {
    speed: 0, rpm: 0, coolant: 19, oil: 20, ambient: 15, range: 418,
    batteryVolts: 13.8, batteryCharge: 83, oilPressure: 2.6, odometerKm: 50706,
    pressureUnit: 'bar', tyres: [2.4, 2.4, 2.6, 2.6],
};

function number(value, decimals = 0) {
    return Number.isFinite(value) ? value.toFixed(decimals) : '--';
}

const PORSCHE_GAUGES = {
    battery: [{ field: 'batteryVolts', unit: 'V', min: 8, max: 16, start: 225, end: 315, divisions: 4 }],
    analogueSpeed: [{ field: 'speed', unit: 'km/h', min: 0, max: 300, start: 182, end: 390, divisions: 30 }],
    oilGauges: [
        { field: 'oilPressure', unit: 'bar', min: 0, max: 6, start: 315, end: 405, divisions: 6, dy: -27 },
        { field: 'oil', unit: '°C', min: 50, max: 150, start: 225, end: 135, divisions: 4, dy: 27 },
    ],
    coolantGauge: [{ field: 'coolant', unit: '°C', min: 60, max: 120, start: 135, end: 45, divisions: 4 }],
};

function circleSegment(a, b, radius) {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const length = dx * dx + dy * dy;
    if (!length) return null;
    const p = (a[0] * dx + a[1] * dy) / length;
    const discriminant = p * p + (radius * radius - a[0] * a[0] - a[1] * a[1]) / length;
    if (discriminant <= 0) return null;
    const bound = Math.sqrt(discriminant);
    const start = Math.max(0, -p - bound);
    const end = Math.min(1, -p + bound);
    return start < end ? [[a[0] + dx * start, a[1] + dy * start], [a[0] + dx * end, a[1] + dy * end]] : null;
}

function panel(canvas, theme, selections, data, opts) {
    const demo = Boolean(opts.demo);
    const palette = PALETTES[selections.faceColour] || PALETTES.navy;
    const scale = opts.scale || 1;
    const ox = opts.x || 0;
    const oy = opts.y || 0;
    const x = (v) => ox + v * scale;
    const y = (v) => oy + v * scale;
    if (opts.background !== false) canvas.fillRect(x(0), y(0), 960 * scale, 320 * scale, '#030507');
    const arc = (cx, cy, r0, r1, a0, a1, color, style) =>
        canvas.arc(x(cx), y(cy), r0 * scale, r1 * scale, a0, a1, color, style);
    const disc = (cx, cy, r, color) => canvas.circle(x(cx), y(cy), r * scale, color);
    const box = (lx, ly, w, h, r, color) => canvas.roundRect(x(lx), y(ly), w * scale, h * scale, r * scale, color);
    const line = (ax, ay, bx, by, width, color) =>
        canvas.line(x(ax), y(ay), x(bx), y(by), width * scale, color);
    const type = instrumentType(canvas, x, y, scale, INK, theme === 'five' ? 0.9 : 1);
    const { measure, fitBold } = type;
    const dialInk = theme === 'five' && palette.ink || INK;
    const dialSoft = theme === 'five' && palette.soft || SOFT;
    const text = (value, cx, cy, size, colour = INK, weight = 'regular', spacing = 0, embolden = 0) => {
        if (theme === 'silver') colour = SILVER_TEXT;
        const faceWeight = theme === 'five' ? 'bold' : weight;
        if (theme === 'five' && palette.textShadow) {
            if (palette.outline) {
                const edge = (size >= 32 ? 0.95 : 0.6) + embolden;
                type.text(value, cx - edge, cy, size, palette.textShadow, faceWeight, spacing);
                type.text(value, cx + edge, cy, size, palette.textShadow, faceWeight, spacing);
                type.text(value, cx, cy - edge, size, palette.textShadow, faceWeight, spacing);
                type.text(value, cx, cy + edge, size, palette.textShadow, faceWeight, spacing);
            } else type.text(value, cx, cy + 0.9, size, palette.textShadow, faceWeight, spacing);
        }
        if (embolden > 0) {
            type.text(value, cx - embolden, cy, size, colour, faceWeight, spacing);
            type.text(value, cx + embolden, cy, size, colour, faceWeight, spacing);
        }
        return type.text(value, cx, cy, size, colour, faceWeight, spacing);
    };
    const quad = (pts, color) => canvas.quad(pts.map(([px, py]) => [x(px), y(py)]), color);
    const trace = (pts, width, color) => {
        for (let i = 1; i < pts.length; i++) line(...pts[i - 1], ...pts[i], width, color);
    };
    const frame = (cx, cy, radius, [face, glow, base] = [palette.face, palette.glow, palette.ring]) => {
        disc(cx, cy, radius, palette.edge);
        arc(cx, cy, radius - RIM_WIDTH, radius, 0, 360, palette.rim, {
            ramp: ['#e0e8fa', palette.rim, palette.edge, palette.rim, '#e0e8fa'],
        });
        const r = radius - 4;
        canvas.card(x(cx - r), y(cy - r), 2 * r * scale, 2 * r * scale, r * scale,
            [[0, face], [0.35, face], [0.76, glow], [1, base]]);
        arc(cx, cy, radius - 5.6, radius - 4.5, 0, 360, palette.edge);
    };

    const point = (cx, cy, degrees, radius) => {
        const a = degrees * Math.PI / 180;
        return [cx + radius * Math.sin(a), cy - radius * Math.cos(a)];
    };
    const needle = (cx, cy, degrees, length, width, hub) => {
        const tip = point(cx, cy, degrees, length);
        const tail = point(cx, cy, degrees, -length * 0.18);
        line(...tail, ...tip, width + 2, '#14141c');
        line(...tail, ...tip, width, '#f3f2fc');
        disc(cx, cy, hub + 1.5, '#14141c');
        disc(cx, cy, hub, '#a2a4b4');
        disc(cx - hub * 0.18, cy - hub * 0.18, hub * 0.54, '#bfc1cc');
    };
    const oilIcon = (cx, cy) => {
        trace([[cx - 10, cy - 3], [cx - 6, cy - 2], [cx - 5, cy + 4], [cx + 4, cy + 4],
            [cx + 10, cy - 3], [cx + 3, cy - 2], [cx, cy - 4], [cx - 6, cy - 4], [cx - 10, cy - 6],
            [cx - 10, cy - 3]], 1.25, dialInk);
        line(cx - 2, cy - 4, cx - 2, cy - 7, 1.25, dialInk);
        line(cx - 4, cy - 7, cx, cy - 7, 1.25, dialInk);
        disc(cx + 10, cy + 1, 1.25, dialInk);
    };
    const paintGauge = (kind, cx, cy, radius, staticFace) => {
        const gauges = PORSCHE_GAUGES[kind];
        const scaleRadius = radius - 4;
        const speedometer = kind === 'analogueSpeed';
        const split = kind === 'oilGauges';
        if (staticFace) {
            if (kind === 'battery') {
                trace([[cx - 7, cy - 27], [cx + 7, cy - 27], [cx + 7, cy - 18],
                    [cx - 7, cy - 18], [cx - 7, cy - 27]], 1.2, dialInk);
                for (const dx of [-4, 4]) line(cx + dx, cy - 29, cx + dx, cy - 27, 1.3, dialInk);
                line(cx - 5, cy - 23, cx - 2, cy - 23, 1.1, dialInk);
                line(cx + 2, cy - 23, cx + 5, cy - 23, 1.1, dialInk);
                line(cx + 3.5, cy - 24.5, cx + 3.5, cy - 21.5, 1.1, dialInk);
            }
            if (split) oilIcon(cx + 27, cy + 1);
            if (kind === 'coolantGauge') {
                line(cx, cy - 32, cx, cy - 21, 2, dialInk);
                disc(cx, cy - 21, 2.5, dialInk);
                for (const offset of [0, 4]) line(cx + 1, cy - 30 + offset, cx + 5, cy - 30 + offset, 1.1, dialInk);
                trace([[cx - 8, cy - 16], [cx - 4, cy - 14], [cx, cy - 16], [cx + 4, cy - 14],
                    [cx + 8, cy - 16]], 1.3, dialInk);
            }
        } else if (speedometer) {
            text(number(data.odometerKm) + ' km', cx, cy - 28, 13, dialInk, 'medium');
        }
        for (const gauge of gauges) {
            const { field, unit, min, max, start, end, divisions } = gauge;
            const pivotY = cy + (gauge.dy || 0);
            const unitX = cx + (split ? 27 : 0);
            const unitY = split ? pivotY + 4 : cy + 32;
            const angle = (fraction) => start + (end - start) * fraction;
            const majorEvery = speedometer ? 6 : divisions / 2;
            const labelsEvery = speedometer ? 3 : majorEvery;
            const scaleLabel = (index) => {
                const fraction = index / divisions;
                const a = angle(fraction);
                const major = index % majorEvery === 0;
                const size = speedometer ? (major ? 18 : 12) : 16;
                const label = number(min + (max - min) * fraction, field === 'oilPressure' ? 1 : 0);
                const radians = a * Math.PI / 180;
                const halfWidth = measure(label, size, 'bold') / 2;
                const reach = Math.abs(Math.sin(radians)) * halfWidth
                    + Math.abs(Math.cos(radians)) * size * 0.29;
                const inset = Math.max(split ? 19 : 16, (major ? 8 : 6) + reach + 4);
                const [x, y] = point(cx, cy, a, scaleRadius - inset);
                return { label, x, y, size, halfWidth };
            };
            const drawScaleLabel = ({ label, x, y, size }) => text(label, x, y + size * 0.25, size, dialInk, 'bold');
            const foregroundText = (label, x, baseline, size, colour) => {
                const outline = palette.textShadow || palette.face;
                for (const [dx, dy] of [[-0.9, 0], [0.9, 0], [0, -0.9], [0, 0.9]]) {
                    type.text(label, x + dx, baseline + dy, size, outline, 'bold');
                }
                text(label, x, baseline, size, colour, 'bold');
            };
            if (staticFace) {
                for (let i = 0; i <= divisions; i++) {
                    const fraction = i / divisions;
                    const a = angle(fraction);
                    const major = i % majorEvery === 0;
                    const labelled = i % labelsEvery === 0;
                    line(...point(cx, cy, a, scaleRadius - (major ? 8 : labelled ? 6 : 4)),
                        ...point(cx, cy, a, scaleRadius), major ? 2.1 : 0.9, labelled ? dialInk : dialSoft);
                    if (labelled) drawScaleLabel(scaleLabel(i));
                }
                text(unit, unitX, unitY, 12, dialSoft, 'medium');
                if (field === 'oil' || field === 'coolant') {
                    line(...point(cx, cy, start, scaleRadius - 5), ...point(cx, cy, start, scaleRadius - 1), 2, '#48b6ff');
                    line(...point(cx, cy, end, scaleRadius - 5), ...point(cx, cy, end, scaleRadius - 1), 2, '#ff655c');
                }
                continue;
            }
            const value = data[field];
            if (Number.isFinite(value)) {
                const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
                const [tipX, tipY] = point(cx, cy, angle(fraction), scaleRadius - 3);
                const dx = tipX - cx;
                const dy = tipY - pivotY;
                const length = Math.hypot(dx, dy);
                needle(cx, pivotY, Math.atan2(dx, -dy) * 180 / Math.PI, length, split ? 2.2 : 2.7, 5);
                // Keep the closest scale number readable when the live pointer passes beneath it.
                const mark = scaleLabel(Math.round(fraction * divisions / labelsEvery) * labelsEvery);
                const clearance = Math.abs(dy) * mark.halfWidth + Math.abs(dx) * mark.size * 0.29;
                if (Math.abs((mark.x - cx) * dy - (mark.y - pivotY) * dx) < clearance + length * 2) {
                    foregroundText(mark.label, mark.x, mark.y + mark.size * 0.25, mark.size, dialInk);
                }
                if (speedometer && dy > 0 && Math.abs(dx * (unitY - pivotY)) < dy * (measure(unit, 12, 'bold') / 2 + 2)) {
                    foregroundText(unit, unitX, unitY, 12, dialSoft);
                }
            } else if (field === 'batteryVolts' && Number.isFinite(data.batteryCharge)) {
                text(number(data.batteryCharge) + '% SOC', cx, cy + 47, 11, dialInk, 'medium');
            } else if (!speedometer) {
                text('--', unitX + (split ? 20 : 0), unitY + (split ? 0 : 13), 12, dialInk, 'medium');
            }
        }
    };
    const labels = (cx, cy, label, value, size = 25) => {
        text(value, cx, cy + 4, size, dialInk);
        text(label, cx, cy + 24, 12, dialSoft, 'medium');
    };
    const temperature = (kind, cx, cy) => {
        const k = cy - 26;
        if (kind === 'coolant') {
            arc(cx - 3, k + 10, 3.5, 5, 45, 315, dialInk);
            trace([[cx - 6, k + 7], [cx - 6, k - 4], [cx - 4, k - 6], [cx - 2, k - 4], [cx - 2, k + 7]], 1.5, dialInk);
            line(cx - 4, k + 9, cx - 4, k + 3, 1.6, dialInk);
            line(cx + 1, k - 1, cx + 6, k - 1, 1.4, dialInk);
            line(cx + 1, k + 3, cx + 4, k + 3, 1.4, dialInk);
        } else {
            trace([[cx - 13, k + 1], [cx - 6, k + 3], [cx - 4, k], [cx + 5, k], [cx + 8, k + 3], [cx + 13, k], [cx + 14, k + 3], [cx + 6, k + 9], [cx - 7, k + 9], [cx - 13, k + 1]], 1.5, dialInk);
            line(cx, k, cx, k - 5, 1.5, dialInk);
            line(cx - 4, k - 5, cx + 4, k - 5, 1.5, dialInk);
            disc(cx + 13, k + 11, 2, dialInk);
        }
        text(number(data[kind]) + '°C', cx, cy + 19, 30, dialInk, 'bold');
        text(kind === 'oil' ? 'OIL TEMP' : 'COOLANT', cx, cy + 39, 12, dialSoft, 'bold', 0.9);
    };
    const demoCover = (cx, cy) => {
        canvas.card(x(cx - 44), y(cy - 56), 88 * scale, 88 * scale, 6 * scale,
            [[0, '#ad525e'], [0.47, '#df9174'], [1, '#363054']]);
        disc(cx + 10, cy - 26, 15, '#ffd3a8');
        const hills = (pts, base, color) => {
            canvas.fillUnder(pts.map(([px, py]) => [x(cx + px), y(cy + py)]), y(cy + base), color);
        };
        hills([[-44, 14], [-20, -20], [5, 3], [23, -13], [44, 15]], 26, '#563a52');
        hills([[-44, 19], [-20, 0], [1, 17], [17, 10], [44, 20]], 28, '#262a43');
        box(cx - 43, cy + 26, 86, 4, 2, '#1a2036');
        text('Night Drive', cx, cy + 55, 20, dialInk, 'bold');
        text('The Midnight', cx, cy + 70, 13, dialSoft);
    };
    const demoMap = (cx, cy) => {
        const k = theme === 'five' ? 0.77 : 1;
        const place = ([px, py]) => [cx + px * k, cy + py * k];
        const badge = (bx, by, w, h, r, fill) => box(...place([bx, by]), w * k, h * k, r * k, fill);
        disc(cx, cy, 79 * k, '#101a26');
        const strokes = (points, width, colour) => {
            for (let i = 1; i < points.length; i++) {
                const segment = circleSegment(points[i - 1], points[i], 76 - width / 2);
                if (segment) {
                    line(...place(segment[0]), ...place(segment[1]), width * k, colour);
                }
            }
        };
        for (const road of MAP_ROADS) strokes(road, 1.8, '#3b4b5c');
        strokes(MAP_ROUTE, 8, '#172440');
        strokes(MAP_ROUTE, 4.9, '#a2bbff');
        quad([[-3, 19], [6, 39], [-3, 35], [-12, 39]].map(place), '#407bd0');
        quad([[-3, 23], [3, 36], [-3, 33], [-9, 36]].map(place), '#e7f1ff');
        badge(-49, -67, 98, 29, 6, '#455e7b');
        badge(-48, -66, 96, 27, 5, '#1c3147');
        trace([[-33, -46], [-33, -55], [-21, -55]].map(place), 1.6 * k, INK);
        trace([[-25, -59], [-21, -55], [-25, -51]].map(place), 1.6 * k, INK);
        text('350 m', ...place([9, -47]), 16 * k, INK, 'bold');
        badge(-32, 55, 64, 19, 4, '#172333');
        text('WAZE', ...place([0, 69]), 11 * k, INK, 'bold', 0.9);
    };
    const mediaLine = (value, size, weight) => {
        if (theme === 'five') weight = 'bold';
        if (measure(value, size, weight) <= 128) return value;
        const characters = Array.from(value);
        let lo = 0;
        let hi = characters.length;
        while (lo < hi) {
            const count = Math.ceil((lo + hi) / 2);
            const candidate = characters.slice(0, count).join('') + '...';
            if (measure(candidate, size, weight) <= 128) lo = count;
            else hi = count - 1;
        }
        return characters.slice(0, lo).join('').trim() + '...';
    };
    const paintSlot = (kind, cx, cy) => {
        if (kind === 'none') return;
        if (kind === 'clock') return labels(cx, cy, 'TIME', opts.clock || '--:--');
        if (theme === 'five' && (kind === 'oil' || kind === 'coolant')) return temperature(kind, cx, cy);
        if (SHORT[kind]) {
            const unit = kind === 'range' ? ' km' : '°C';
            return labels(cx, cy, SHORT[kind], number(data[kind]) + unit, kind === 'range' ? 21 : 25);
        }
        if (kind === 'temps') {
            labels(cx, cy - 24, 'OIL', number(data.oil) + '°C', 20);
            return labels(cx, cy + 25, 'COOLANT', number(data.coolant) + '°C', 20);
        }
        if (kind === 'tyres') {
            const tyres = data.pressureUnit && data.tyres || [];
            for (let i = 0; i < 4; i++) {
                const dx = i % 2 === 0 ? -29 : 29;
                const dy = i < 2 ? -15 : 21;
                text(number(tyres[i], data.pressureUnit === 'bar' ? 1 : 0), cx + dx, cy + dy, 18, dialInk);
            }
            return text(data.pressureUnit || 'TYRES', cx, cy + 45, 12, dialSoft);
        }
        if (kind === 'waze' && !demo) return paintSlot(selections.fallback, cx, cy);
        if (kind === 'media') {
            if (demo) return demoCover(cx, cy);
            box(cx - 25, cy - 44, 50, 50, 5, '#1a2435');
            disc(cx - 6, cy - 13, 5, INK);
            line(cx - 2, cy - 13, cx - 2, cy - 32, 3, INK);
            line(cx - 2, cy - 32, cx + 10, cy - 27, 3, INK);
            const media = data.media;
            if (media && media.title) {
                if (media.source) text(media.source.toUpperCase(), cx, cy - 54, 10, dialSoft, 'bold');
                text(mediaLine(media.title, 16, 'bold'), cx, cy + 28, 16, dialInk, 'bold');
                return text(mediaLine(media.artist || '', 13, 'regular'), cx, cy + 47, 13, dialSoft);
            }
            text('NOW PLAYING', cx, cy + 28, 14, dialInk, 'bold');
            return text('No track data', cx, cy + 47, 12, dialSoft);
        }
        if (kind === 'waze') return demoMap(cx, cy);
    };

    if (theme === 'silver') return silverDials(canvas, data, opts, selections, paintSlot);

    if (theme === 'stock') {
        text('BMW original', 480, 156, 38);
        text('Factory instrument display', 480, 195, 19, SOFT);
        return;
    }

    if (theme === 'digital') {
        const positions = [[164, 174, 55], [306, 164, 77], [654, 164, 77], [796, 174, 55]];
        for (let index = 0; index < SLOTS.length; index++) {
            const [cx, cy, radius] = positions[index];
            const kind = selections[SLOTS[index]];
            if (kind === 'none') continue;
            box(cx - radius, cy - radius, radius * 2, radius * 2, 14, '#101a29');
            if (opts.mapSlot !== SLOTS[index]) paintSlot(kind, cx, cy);
        }
        const speed = number(data.speed);
        text(speed, 480, 174, fitBold(speed, 77, 174), INK, 'bold');
        text('km/h', 480, 201, 20, SOFT, 'medium');
        const rpm = Number.isFinite(data.rpm) ? Math.max(0, Math.min(1, data.rpm / 8000)) : 0;
        box(390, 223, 180, 5, 2, '#243246');
        if (rpm > 0) box(390, 223, 180 * rpm, 5, 2, '#accfff');
        text(number(data.rpm) + ' RPM', 480, 249, 16, SOFT);
        return;
    }

    const positions = SLOTS.map((slot) => PORSCHE_DIALS[slot]);
    const contentOffsets = [-10, 0, 0, 10];
    const lowSpeed = selections.speedPosition !== 'centre';
    const [centreX, centreY, centreRadius] = PORSCHE_CENTRE;
    const rpmStart = 233;
    const rpmSpan = 254;
    const rpmLabelSize = 27;
    const rpmWeight = 0.8;
    const wideRing = Boolean(palette.centreRing);
    const ringOuter = centreRadius - RIM_WIDTH - 2.2;
    const rangeStart = 150;
    const rangeEnd = 210;
    const rangeInner = centreRadius - 6.5;
    const rangeOuter = centreRadius - 3.5;
    const paintBackground = opts.paintBackground || ((paint) => paint());
    paintBackground(() => {
        [0, 3, 1, 2].forEach((index) => {
            const [cx, cy, radius] = positions[index];
            const offset = contentOffsets[index];
            frame(cx, cy, radius);
            const kind = selections[SLOTS[index]];
            if (PORSCHE_GAUGES[kind]) paintGauge(kind, cx + offset, cy, radius - Math.abs(offset), true);
        });
        frame(centreX, centreY, centreRadius, palette.centreFace);
        if (wideRing) {
            // Leave the bottom quarter clear for the digital speed and range.
            arc(centreX, centreY, 78, ringOuter, 225, 495, palette.centreRing, {
                ramp: [palette.centreRing, palette.centreGlow, palette.centreRing, palette.centreGlow, palette.centreRing],
                rampFrom: 0,
                rampTo: 360,
            });
        }
        // The lower sector of the bezel is shared with the fuel-range gauge.
        arc(centreX, centreY, rangeInner - 1.5, rangeOuter + 1.5, rangeStart, rangeEnd, '#171a24');
        arc(centreX, centreY, rangeInner, rangeOuter, rangeStart, rangeEnd, '#596275');
        const rpmLabels = Array.from({ length: 9 }, (_, index) => {
            const [x, y] = point(centreX, centreY, rpmStart + index * rpmSpan / 8, 103);
            const label = String(index);
            return { label, x, baseline: y + 7, halfWidth: measure(label, rpmLabelSize, 'bold') / 2 + rpmWeight };
        });
        const grooveWidth = 2.2;
        const grooveEnd = rpmStart + rpmSpan;
        // Clip each stroke separately so the face shows through around every label.
        for (let radius = 83; radius <= 113; radius += 6) {
            let segmentStart = null;
            for (let angle = rpmStart; angle <= grooveEnd; angle += 0.5) {
                const [x, y] = point(centreX, centreY, angle, radius + grooveWidth / 2);
                const nearLabel = rpmLabels.some((mark) => Math.abs(x - mark.x) <= mark.halfWidth + 4
                    && y >= mark.baseline - 21 && y <= mark.baseline + 5);
                if (!nearLabel && segmentStart === null) segmentStart = angle;
                if ((nearLabel || angle === grooveEnd) && segmentStart !== null) {
                    if (angle - segmentStart >= 1.5) {
                        arc(centreX, centreY, radius, radius + grooveWidth, segmentStart, angle, '#0d101ca6', { round: true });
                    }
                    segmentStart = null;
                }
            }
        }
        const redlineOuter = wideRing ? ringOuter : 133;
        arc(centreX, centreY, redlineOuter - 5, redlineOuter, 456, grooveEnd, '#f04a46');
        for (let i = 0; i <= 40; i++) {
            const major = i % 5 === 0;
            const angle = rpmStart + i * (rpmSpan / 40);
            const r = wideRing ? (major ? 119 : 125) : (major ? 129 : 131);
            const outside = point(centreX, centreY, angle, 134);
            const inside = point(centreX, centreY, angle, r);
            const width = major ? 2.1 : 0.85;
            if (wideRing && palette.outline) line(...outside, ...inside, width + 1, palette.textShadow);
            line(...outside, ...inside, width, '#ebedf8');
        }
        for (const mark of rpmLabels) text(mark.label, mark.x, mark.baseline, rpmLabelSize, dialInk, 'bold', 0, rpmWeight);
        text('1/min × 1000', centreX, lowSpeed ? 139 : 124, 12, dialSoft, 'medium');
    });
    positions.forEach(([cx, cy, radius], index) => {
        const slot = SLOTS[index];
        if (opts.mapSlot === slot) return;
        const kind = selections[slot];
        const offset = contentOffsets[index];
        if (PORSCHE_GAUGES[kind]) paintGauge(kind, cx + offset, cy, radius - Math.abs(offset), false);
        else paintSlot(kind, cx + offset, cy);
    });
    if (Number.isFinite(data.rpm)) {
        const angle = rpmStart + rpmSpan * Math.max(0, Math.min(1, data.rpm / 8000));
        if (lowSpeed) needle(centreX, centreY, angle, 88, 3.1, 7);
        else {
            line(...point(centreX, centreY, angle, 69), ...point(centreX, centreY, angle, 88), 5, '#14141c');
            line(...point(centreX, centreY, angle, 69), ...point(centreX, centreY, angle, 88), 3, '#f3f2fc');
        }
    }
    const speed = number(data.speed);
    const speedSize = lowSpeed ? 55 : 62;
    const speedY = lowSpeed ? centreY + 75 : 178;
    const unitY = lowSpeed ? centreY + 89 : 204;
    text(speed, centreX, speedY, fitBold(speed, speedSize, 105), dialInk, 'bold');
    text('km/h', centreX, unitY, 10, dialInk, 'medium');
    text(number(data.range) + ' km', centreX, centreY + 121, 17, dialInk, 'medium');
    const fullRange = Number(selections.fullRangeKm) || DEFAULT_FULL_RANGE_KM;
    const fill = Number.isFinite(data.range) ? Math.max(0, Math.min(1, data.range / fullRange)) : 0;
    if (fill > 0) {
        arc(centreX, centreY, rangeInner, rangeOuter, rangeEnd - (rangeEnd - rangeStart) * fill, rangeEnd,
            fill < 0.12 ? '#ff715d' : '#dce7ff');
    }
    const clock = opts.clock || '--:--';
    text(clock, 225, 282, 15, INK, 'bold');
    text(number(data.ambient) + '°C', 735, 282, 15, INK, 'bold');

}

module.exports = { panel, SLOTS, SILVER_SLOTS, NAMES, DEMO, PALETTES };
