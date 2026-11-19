'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const app = '../apps/zekai_cluster_themes/';
const { MapWindow, rectangle } = require(app + 'map-window');
const { panel, DEMO, SLOTS, PALETTES } = require(app + 'dials');
const { SILVER_PALETTES, TANK_LITRES } = require(app + 'silver-dials');
const { vdoPanel } = require(app + 'vdo-retro');
const { PANEL_WIDTH, PANEL_HEIGHT, panelLayout, PORSCHE_CENTRE, PORSCHE_DIALS } = require(app + 'panel-layout');
const { FONTS } = require(app + 'instrument-type');
const { Canvas } = require('../kit/runtime/canvas');
const { get: getFont } = require('../kit/runtime/fonts');
const { Recorder, play } = require('../kit/runtime/record');
const spec = require(app + 'app.json');

class FakeRender extends EventEmitter {
    constructor() {
        super();
        this.backend = 'id7';
        this.targets = 'map:1088x480,panel:1920x720,hud:800x480';
        this.frames = 0;
    }

    connect() { this.connected = true; }
    close() { this.connected = false; }
    image(args) { this.args = args; return 1; }
    pixels(ref, rects, pixels) {
        this.frames++;
        this.rects = rects;
        this.bytes = pixels.length;
        return true;
    }
}

test('Waze window is leased only while the map is live and respects other providers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-test-'));
    const status = path.join(root, 'status.json');
    const dir = path.join(root, 'shared');
    const file = path.join(dir, 'map_window.txt');
    let now = Date.now();
    const log = { warn() {} };
    const lease = new MapWindow(log, { dir, status, now: () => now });
    function report(value) {
        fs.writeFileSync(status, JSON.stringify(value));
        const stamp = new Date(now - 20);
        fs.utimesSync(status, stamp, stamp);
    }
    try {
        const choices = { rightInner: 'waze' };
        assert.equal(lease.update(choices), null);
        now += 800;
        report({ target: 'map', state: 'starting', cluster: 1 });
        assert.equal(lease.update(choices), null);
        const rect = rectangle('rightInner');
        assert.equal(fs.readFileSync(file, 'utf8'), 'panel ' + [rect.x, rect.y, rect.w, rect.h].join(' ') + '\n');
        now += 800;
        report({ target: 'panel', state: 'showing', cluster: 1 });
        assert.equal(lease.update(choices), 'rightInner');
        assert.equal(lease.update(choices, 'silver'), null);
        const silverRect = rectangle('rightInner', 'silver');
        assert.equal(fs.readFileSync(file, 'utf8'), 'panel ' + [silverRect.x, silverRect.y, silverRect.w, silverRect.h].join(' ') + '\n');
        now += 800;
        report({ target: 'panel', state: 'showing', cluster: 1 });
        assert.equal(lease.update(choices, 'silver'), null);
        now += 800;
        report({ target: 'panel', state: 'showing', cluster: 1 });
        assert.equal(lease.update(choices, 'silver'), 'rightInner');
        now += 800;
        report({ target: 'panel', state: 'frozen', cluster: 1 });
        assert.equal(lease.update(choices, 'silver'), null);
        assert.equal(fs.existsSync(file), false);

        fs.writeFileSync(file, 'another app');
        now += 800;
        report({ target: 'map', state: 'showing', cluster: 1 });
        assert.equal(lease.update(choices), null);
        lease.release();
        assert.equal(fs.readFileSync(file, 'utf8'), 'another app');
    } finally {
        lease.release();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('both custom themes render with demo and missing signals; media and map are inner-only', () => {
    for (const item of spec.settings) {
        const options = new Map(item.options || []);
        assert.equal(options.has('g'), false);
        if (item.aliases && item.aliases.g) assert.ok(options.has(item.aliases.g));
    }
    for (const theme of ['five', 'digital']) {
        const selections = {};
        for (const slot of SLOTS.concat('fallback')) {
            const item = spec.settings.find((setting) => setting.key === theme + '_' + slot);
            selections[slot] = item.default;
            if (slot.endsWith('Outer')) assert.equal(item.options.some(([id]) => id === 'waze' || id === 'media'), false);
        }
        const record = new Recorder(960, 320);
        const canvas = new Canvas(960, 320);
        panel(record, theme, selections, DEMO, { demo: true, clock: '10:53' });
        play(record.words(), canvas);
        assert.ok(canvas.d.some((value) => value !== 0));
        panel(canvas, theme, selections, {}, { clock: '10:53' });
        assert.ok(canvas.d.some((value) => value > 200));
    }
});

test('VW 2000 round bezels nearly fill the panel without clipping', () => {
    const canvas = new Canvas(PANEL_WIDTH, PANEL_HEIGHT);
    const bezels = [];
    const miniDials = [];
    const labels = [];
    const drawCircle = canvas.circle.bind(canvas);
    const drawText = canvas.text.bind(canvas);
    canvas.circle = (x, y, r, colour) => {
        if (colour === '#101214') bezels.push({ x, y, r });
        if (colour === '#202326' && r > 40) miniDials.push({ x, y, r });
        return drawCircle(x, y, r, colour);
    };
    canvas.text = (value, ...args) => { labels.push(value); return drawText(value, ...args); };
    vdoPanel(canvas, Object.assign({}, DEMO, { coolant: 91 }), panelLayout('vdoRetro'));
    assert.equal(bezels.length, 2);
    const [left, right] = bezels;
    assert.ok(left.x - left.r > 50 && left.x - left.r < 75);
    assert.ok(PANEL_WIDTH - right.x - right.r > 50 && PANEL_WIDTH - right.x - right.r < 75);
    for (const { y, r } of bezels) {
        assert.ok(y - r > 25 && y - r < 45);
        assert.ok(PANEL_HEIGHT - y - r > 25 && PANEL_HEIGHT - y - r < 45);
    }
    assert.equal(miniDials.length, 2);
    for (const { x, y, r } of miniDials) assert.ok(Math.hypot(x - right.x, y - right.y) + r < right.r);
    assert.ok(labels.includes('COOLANT') && labels.includes('91°C'));
});

test('Porsche palettes share the lower readout positions and coloured rings open below the RPM scale', () => {
    const settings = Object.fromEntries(spec.settings.map(({ key, options }) => [key, options]));
    assert.deepEqual(settings.five_faceColour.map(([id]) => id), Object.keys(PALETTES));
    const data = Object.assign({}, DEMO, { speed: 126, rpm: 850, range: 418 });
    const colours = new Set();
    let blackSideFaces;
    const [cx, cy] = PORSCHE_CENTRE;
    for (const faceColour of Object.keys(PALETTES)) {
        const canvas = new Canvas(960, 320);
        const wideRing = Boolean(PALETTES[faceColour].centreRing);
        const pixel = (x, y) => {
            const offset = (Math.round(y) * canvas.w + Math.round(x)) * 4;
            return canvas.d.subarray(offset, offset + 3);
        };
        const labels = [];
        const drawText = canvas.text.bind(canvas);
        canvas.text = (value, x, y, ...args) => {
            const width = drawText(value, x, y, ...args);
            labels.push([value, x, y, width, args[0], args[1]]);
            return width;
        };
        for (const speedPosition of ['centre', 'lower']) {
            labels.length = 0;
            panel(canvas, 'five', { faceColour, speedPosition }, data, { clock: '10:53' });
            const label = (name) => labels.find(([value, , , , , colour]) =>
                value === name && colour !== PALETTES[faceColour].textShadow);
            const [, speedX, speedY, , speedSize, speedColour] = label('126');
            const [, unitX, unitY, , unitSize] = label('km/h');
            const [, rangeX, rangeY] = label('418 km');
            if (faceColour === 'silver') assert.equal(speedColour, '#ffffff');
            assert.equal(speedX, cx);
            assert.equal(unitX, cx);
            assert.equal(rangeX, cx);
            assert.ok(unitY > speedY && unitSize < speedSize);
            assert.equal(rangeY, cy + 121);
            if (speedPosition === 'lower') {
                assert.equal(speedY, cy + 75);
                assert.equal(unitY, cy + 89);
            } else {
                assert.equal(speedY, 178);
            }
            if (wideRing) {
                for (let rpm = 0; rpm <= 8; rpm++) {
                    const [, x, baseline] = label(String(rpm));
                    const radius = Math.hypot(x - cx, baseline - 7 - cy);
                    assert.ok(radius > 78 && radius < 124, 'RPM numbers sit on the coloured ring');
                }
            }
        }
        colours.add(Buffer.from(pixel(cx + 35, cy - 111)).toString('hex'));
        if (wideRing) {
            assert.ok(Math.max(...pixel(cx + 33, cy + 17)) < 30);
            assert.ok(Math.max(...pixel(cx, cy + 101)) < 40);
            const ringColour = Buffer.from(PALETTES[faceColour].centreRing.slice(1), 'hex');
            assert.ok(pixel(cx + 7, cy - 132).every((channel, index) => Math.abs(channel - ringColour[index]) <= 16));
            assert.ok(Math.max(...pixel(cx + 7, cy - 134)) < 55, 'a thin dark border separates the ring from the rim');
            const redlineAngle = 111 * Math.PI / 180;
            const redline = pixel(cx + 131 * Math.sin(redlineAngle), cy - 131 * Math.cos(redlineAngle));
            assert.ok(redline[0] > 200 && redline[1] < 100 && redline[2] < 100, 'redline meets the outer coloured edge');
            for (const [angle, coloured] of [[222, false], [228, true], [132, true], [138, false]]) {
                const radians = angle * Math.PI / 180;
                const rgb = pixel(cx + 117 * Math.sin(radians), cy - 117 * Math.cos(radians));
                assert.equal(Math.max(...rgb) > 40, coloured, 'ring ends at the marked diagonal');
            }
            const sides = Object.values(PORSCHE_DIALS).map(([x]) => Array.from(pixel(x, 196)));
            assert.ok(sides.every((rgb) => Math.max(...rgb) < 30));
            if (blackSideFaces) assert.deepEqual(sides, blackSideFaces);
            blackSideFaces = sides;
        }
    }
    assert.equal(colours.size, Object.keys(PALETTES).length);
});

test('Porsche RPM grooves are closely spaced and leave a clear gap around the numerals', () => {
    const canvas = new Canvas(960, 320);
    const [cx, cy] = PORSCHE_CENTRE;
    const labels = new Map();
    const grooves = [];
    const drawText = canvas.text.bind(canvas);
    const drawArc = canvas.arc.bind(canvas);
    canvas.text = (value, x, baseline, ...args) => {
        const width = drawText(value, x, baseline, ...args);
        if (/^[0-8]$/.test(value)) labels.set(value, { x, baseline, width });
        return width;
    };
    canvas.arc = (x, y, inner, outer, start, end, colour, style) => {
        if (x === cx && y === cy && style && style.round) grooves.push({ inner, outer, start, end });
        return drawArc(x, y, inner, outer, start, end, colour, style);
    };
    panel(canvas, 'five', { faceColour: 'navy' }, {}, {});
    assert.equal(labels.size, 9);
    const bounds = [...labels.values()];
    assert.deepEqual([...new Set(grooves.map(({ inner }) => inner))], [83, 89, 95, 101, 107, 113]);
    assert.ok(grooves.length > 6, 'grooves split into separate strokes around labels');
    for (const { inner, outer, start, end } of grooves) {
        assert.ok(outer - inner >= 2);
        for (let angle = start; angle <= end; angle += 0.25) {
            const radians = angle * Math.PI / 180;
            for (const radius of [inner, outer]) {
                const x = cx + radius * Math.sin(radians);
                const y = cy - radius * Math.cos(radians);
                assert.ok(!bounds.some((label) => Math.abs(x - label.x) < label.width / 2 + 1.8
                    && y > label.baseline - 17 && y < label.baseline + 2));
            }
        }
    }
});

test('Porsche face fills the native panel with a small bezel margin and keeps Waze centered in the side dials', () => {
    const layout = panelLayout('five');
    const [cx, cy, radius] = PORSCHE_CENTRE;
    assert.ok(Math.abs(layout.x + cx * layout.scale - PANEL_WIDTH / 2) < 1);
    const top = layout.y + (cy - radius) * layout.scale;
    const bottom = PANEL_HEIGHT - layout.y - (cy + radius) * layout.scale;
    assert.ok(top >= 12 && top <= 20 && Math.abs(top - bottom) < 1);
    const [leftX, , leftRadius] = PORSCHE_DIALS.leftOuter;
    const [rightX, , rightRadius] = PORSCHE_DIALS.rightOuter;
    const left = layout.x + (leftX - leftRadius) * layout.scale;
    const right = PANEL_WIDTH - layout.x - (rightX + rightRadius) * layout.scale;
    assert.ok(left >= 12 && left <= 20 && Math.abs(left - right) < 1);
    for (const side of ['leftInner', 'rightInner']) {
        const [sideX, sideY] = PORSCHE_DIALS[side];
        const map = rectangle(side, 'five');
        assert.ok(Math.abs(map.x + map.w / 2 - (layout.x + sideX * layout.scale)) < 1);
        assert.ok(Math.abs(map.y + map.h / 2 - (layout.y + sideY * layout.scale)) < 1);
    }
});

test('Porsche range arc follows the live range and stays empty with no reading', () => {
    const canvas = new Canvas(960, 320);
    const drawArc = canvas.arc.bind(canvas);
    let filled;
    canvas.arc = (...args) => {
        if (['#dce7ff', '#ff715d'].includes(args[6])) filled = args[5] - args[4];
        return drawArc(...args);
    };
    for (const [range, span] of [[undefined, 0], [0, 0], [80, 6], [200, 15], [600, 45], [900, 60]]) {
        filled = 0;
        panel(canvas, 'five', { fullRangeKm: '800' }, { range }, {});
        assert.equal(filled, span);
    }
});

test('Porsche gauges draw real readings and omit the needle when voltage or pressure is unavailable', () => {
    const canvas = new Canvas(960, 320);
    const labels = [];
    let needles = 0;
    const drawLine = canvas.line.bind(canvas);
    canvas.line = (x0, y0, x1, y1, width, colour) => {
        if (colour === '#f3f2fc') needles++;
        return drawLine(x0, y0, x1, y1, width, colour);
    };
    const drawText = canvas.text.bind(canvas);
    canvas.text = (value, x, y, size, ...args) => {
        labels.push({ value, x, y, size });
        return drawText(value, x, y, size, ...args);
    };
    const slots = { leftOuter: 'battery', leftInner: 'analogueSpeed', rightInner: 'oilGauges', rightOuter: 'coolantGauge' };
    const live = { batteryVolts: 13.8, oilPressure: 2.6, oil: 103, coolant: 91, speed: 87, rpm: 2100, ambient: 13, odometerKm: 17 };
    panel(canvas, 'five', slots, live, { clock: '11:17' });
    const label = (value) => labels.find((entry) => entry.value === value);
    assert.equal(needles, 6);
    const [cx, cy, radius] = PORSCHE_DIALS.leftInner;
    const speedMarks = new Map(labels.filter(({ x }) => x > cx - radius && x < cx + radius)
        .map((entry) => [entry.value, entry]));
    for (const speed of [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300]) {
        const { x, y, size } = speedMarks.get(String(speed));
        const markSize = speed % 60 === 0 ? 18 : 12;
        assert.equal(size, markSize * 0.81);
        assert.ok(Math.hypot(x - cx, y - markSize / 4 - cy) >= radius - 32);
    }
    assert.equal(speedMarks.has('100'), false);
    assert.equal(label('17 km').x, cx);
    assert.ok(label('17 km').y < cy);
    assert.ok(labels.some(({ value, x, y }) => value === 'km/h' && x === cx && y === cy + 32));
    for (const value of ['V', 'bar', '°C', '0.0', '3.0', '6.0']) assert.ok(label(value), value);
    assert.equal(labels.filter(({ value }) => value === '87').length, 1);
    for (const value of ['87 km/h', 'VEHICLE SPEED', 'OIL PRESSURE', 'OIL TEMP', 'COOLANT']) assert.equal(label(value), undefined);
    assert.deepEqual([label('11:17').x, label('11:17').y], [225, 282]);
    assert.deepEqual([label('13°C').x, label('13°C').y], [735, 282]);
    labels.length = 0;
    needles = 0;
    panel(canvas, 'five', slots, { batteryCharge: 83 }, {});
    assert.equal(needles, 0);
    assert.ok(label('83% SOC'));
    assert.ok(label('-- km'));
    assert.ok(label('--°C'));
    assert.equal(label('0.0 bar'), undefined);
});

test('Porsche shows total mileage from the BMW signal until the next sample', () => {
    const { Car } = require(app + 'car');
    let now = 0;
    const car = new Car(() => now);
    const watchers = new Map();
    car.watch({ signals: { async watch(name, instance, handlers) { watchers.set(name, handlers); } } });
    const kombi = watchers.get('de.bmw.infotainment.KombiIF');
    const canvas = new Canvas(960, 320);
    const [dialX, dialY] = PORSCHE_DIALS.leftInner;
    const drawText = canvas.text.bind(canvas);
    let readout;
    canvas.text = (value, x, y, ...args) => {
        if (x === dialX && y === dialY - 28) readout = value;
        return drawText(value, x, y, ...args);
    };
    const check = (expected) => {
        readout = undefined;
        panel(canvas, 'five', { leftInner: 'analogueSpeed' }, car.snapshot(), {});
        assert.equal(readout, expected);
    };

    check('-- km');
    kombi.statusBordcomputerTravelData({ wayPassed: 17 });
    kombi.statusRangeTankStatus({ mileageKilometre: 50706, range: 418 });
    check('50706 km');
    now += 60000;
    check('50706 km');
    kombi.statusRangeTankStatus({ mileageKilometre: 50707, range: 417 });
    check('50707 km');
    kombi.statusRangeTankStatus({ mileageKilometre: 16777215, range: 417 });
    check('-- km');
});

test('clock settings apply Vancouver, US Pacific, custom offset, minute correction and AM/PM', () => {
    const { clusterClock } = require(app + 'cluster-clock');
    const values = {};
    const settings = { get: (key) => values[key] };
    const now = Date.UTC(2026, 10, 18, 15, 4);
    assert.equal(clusterClock(settings, now), '08:04');
    values.clockZone = 'pacific';
    assert.equal(clusterClock(settings, now), '07:04');
    values.clockZone = 'custom';
    values.clockOffset = 5.5;
    values.clockCorrection = 10;
    values.clockFormat = '12';
    assert.equal(clusterClock(settings, now), '8:44 PM');
});

test('Porsche voltage and pressure use validated DME readings', async () => {
    const artifact = path.resolve(__dirname, '../dist/zekai_cluster_themes/source/javascript');
    const { EngineReadings } = require(path.join(artifact, 'engine-readings'));
    const readings = {};
    const engine = new EngineReadings({}, (key, value) => { readings[key] = value; });
    const volts = 13800, absolute = 3600, ambient = 25600;
    const inputs = { 0x5853: volts, 0x4436: absolute, 0x4201: ambient };
    engine.link = { available: true, read: async (ecu, id) => {
        assert.equal(ecu, 0x12);
        const value = inputs[id];
        return [0x62, id >> 8, id & 255, value >> 8, value & 255];
    } };
    await engine.read(true, true, engine.generation);
    assert.equal(readings.batteryVolts, 13.8);
    assert.equal(readings.oilPressure, 2.6);
    inputs[0x5853] = 65535;
    inputs[0x4201] = 65535;
    await engine.read(true, true, engine.generation);
    assert.deepEqual(readings, { batteryVolts: null, oilPressure: null });
});

test('Rolls Royce draws its default and customized side dials independently', () => {
    const canvas = new Canvas(960, 320);
    const labels = [];
    const readouts = new Map();
    const drawText = canvas.text.bind(canvas);
    canvas.text = (value, x, y, size, colour, opts) => {
        labels.push(value);
        readouts.set(value, { x, y, colour });
        return drawText(value, x, y, size, colour, opts);
    };
    const data = { speed: 0, rpm: 810, fuelLitres: TANK_LITRES / 2, range: 307, ambient: 14.5, stage: 'P' };
    panel(canvas, 'silver', {}, data, { demo: true, clock: '10:53' });
    assert.ok(labels.includes('520'));
    assert.ok(labels.includes('10:53'));
    labels.length = 0;
    panel(canvas, 'silver', {}, data, { clock: '10:53' });
    for (const label of ['810', '307', '14.5°C', 'P', '10:53']) assert.ok(labels.includes(label));
    assert.deepEqual([readouts.get('810').x, readouts.get('307').x], [303, 657]);
    assert.equal(readouts.get('810').y, 181);
    assert.equal(readouts.get('307').y, 181);
    assert.equal(readouts.get('10:53').y, readouts.get('14.5°C').y);
    assert.ok(readouts.get('10:53').y > 272);
    for (const gear of ['P', 'R', 'N', 'D']) assert.ok(readouts.get(gear).x > 816);
    assert.equal(labels.includes('520'), false);
    labels.length = 0;
    panel(canvas, 'silver', {}, {}, {});
    assert.ok(labels.includes('--') && labels.includes('--:--'));
    assert.equal(readouts.get('P').colour, readouts.get('R').colour);
    labels.length = 0;
    const slots = { leftInner: 'tyres', rightInner: 'waze', fallback: 'temps' };
    const customData = Object.assign({}, DEMO, data);
    panel(canvas, 'silver', slots, customData, {});
    for (const label of ['bar', 'OIL', 'COOLANT', 'KM/H']) assert.ok(labels.includes(label));
    for (const label of ['810', 'RPM', '307', 'KM RANGE']) assert.ok(labels.includes(label));
    assert.deepEqual([readouts.get('810').y, readouts.get('307').y], [280, 280]);
    panel(canvas, 'silver', { rightInner: 'tyres' }, customData, {});
    assert.deepEqual([readouts.get('810').y, readouts.get('307').y], [181, 280]);
    labels.length = 0;
    panel(canvas, 'silver', slots, customData, { mapSlot: 'rightInner' });
    assert.ok(labels.includes('bar') && !labels.includes('COOLANT'));
    for (const label of ['810', 'RPM', '307', 'KM RANGE']) assert.ok(labels.includes(label));

    panel(canvas, 'silver', { leftInner: 'none', rightInner: 'none' }, {}, {});
    const blue = (x, y) => canvas.d[(y * canvas.w + x) * 4 + 2];
    for (const cx of [252, 708]) {
        assert.equal(blue(cx + 35, 170), blue(cx - 1, 206));
        assert.ok(blue(cx + 35, 170) > blue(cx + 70, 170));
        assert.ok(blue(cx - 1, 170) > blue(cx + 35, 170));
    }
});

test('Rolls Royce moves both side needles and highlights the actual gear from vehicle signals', () => {
    const { Car } = require(app + 'car');
    let now = 0;
    const car = new Car(() => now);
    const interfaces = new Map();
    car.watch({ signals: { async watch(name, instance, handlers, log, options) {
        interfaces.set(name, { handlers, options });
    } } });
    const { handlers: gearbox, options } = interfaces.get('de.bmw.infrastructure.VehicleInformation');
    const { handlers: engine } = interfaces.get('de.bmw.infotainment.vehicle.CDS');
    const { handlers: fuel } = interfaces.get('de.bmw.infotainment.KombiIF');
    const canvas = new Canvas(960, 320);
    const drawLine = canvas.line.bind(canvas);
    const drawText = canvas.text.bind(canvas);
    const drawShadow = canvas.featheredQuad.bind(canvas);
    let needles = [];
    let highlighted = [];
    let shadows = [];
    canvas.featheredQuad = (points, colour, widths) => {
        shadows.push(points);
        return drawShadow(points, colour, widths);
    };
    canvas.line = (x1, y1, x2, y2, width, colour) => {
        if (colour === '#07080b') needles.push([x2, y2]);
        return drawLine(x1, y1, x2, y2, width, colour);
    };
    canvas.text = (value, x, y, size, colour, opts) => {
        if (x === 823 && colour === '#e8e9ed') highlighted.push(value);
        if (value === 'KM/H') assert.equal(y, 259);
        return drawText(value, x, y, size, colour, opts);
    };
    const render = (gear) => {
        needles = [];
        highlighted = [];
        shadows = [];
        panel(canvas, 'silver', {}, car.snapshot(), {});
        assert.deepEqual(highlighted, gear ? [gear] : []);
        return needles;
    };
    engine.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 800 * 4 });
    fuel.statusRangeTankStatus({ fluidLevelFuelTank: 55 });
    gearbox.DataPowerTrain2({ statusGearSelectionDrive: 3 });
    const before = render('P');
    assert.equal(before.length, 2);
    const beforeShadows = shadows;
    assert.equal(beforeShadows.length, 2);
    engine.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 2400 * 4 });
    fuel.statusRangeTankStatus({ fluidLevelFuelTank: 23 });
    gearbox.statusGearboxDrive({ statusActualStageDrive: 'R' });
    const after = render('R');
    assert.notDeepEqual(after[0], before[0]);
    assert.notDeepEqual(after[1], before[1]);
    assert.notDeepEqual(shadows[0], beforeShadows[0]);
    assert.notDeepEqual(shadows[1], beforeShadows[1]);
    for (const gear of ['N', 'D', 'P']) {
        gearbox.statusGearboxDrive({ statusActualStageDrive: gear });
        render(gear);
    }
    now += 60000;
    render('P');
    options.onUnavailable();
    render(null);
    gearbox.statusGearboxDrive({ statusActualStageDrive: 1 });
    render('P');
});

test('Rolls Royce exposes ten selectable palettes with distinct central faces and legible speed text', () => {
    const setting = spec.settings.find((item) => item.key === 'silver_faceColour');
    assert.equal(setting.options.length, 10);
    assert.deepEqual(setting.options.map(([id]) => id), Object.keys(SILVER_PALETTES));
    const canvas = new Canvas(960, 320);
    const faces = new Set();
    const textColours = [];
    const drawText = canvas.text.bind(canvas);
    canvas.text = (value, x, y, size, colour, opts) => {
        if (value === 'KM/H') textColours.push(colour);
        return drawText(value, x, y, size, colour, opts);
    };
    for (const [faceColour] of setting.options) {
        panel(canvas, 'silver', { faceColour }, { speed: 86 }, {});
        const center = (246 * canvas.w + 520) * 4;
        const side = (210 * canvas.w + 265) * 4;
        faces.add(Buffer.from(canvas.d.subarray(center, center + 3)).toString('hex'));
        assert.ok(Math.max(...canvas.d.subarray(side, side + 3)) < 65);
        assert.equal(textColours.pop(), SILVER_PALETTES[faceColour].darkText ? '#111720' : '#f5f5fb');
    }
    assert.equal(faces.size, 10);
});

test('all custom instruments use the bundled Hanken Grotesk weights', () => {
    const canvas = new Canvas(960, 320);
    const allowed = new Set(Object.values(FONTS));
    const drawText = canvas.text.bind(canvas);
    const used = new Set();
    canvas.text = (value, x, y, size, colour, opts) => {
        assert.ok(allowed.has(opts.font));
        const font = getFont(opts.font, size, value);
        assert.equal(font.family, opts.font);
        for (const char of value) assert.ok(font.glyphs[char.codePointAt(0)], 'Missing glyph: ' + char);
        used.add(opts.font);
        return drawText(value, x, y, size, colour, opts);
    };
    const slots = {
        leftOuter: 'coolant', leftInner: 'media', rightInner: 'waze',
        rightOuter: 'oil', fallback: 'temps', faceColour: 'magenta', speedPosition: 'lower',
    };
    for (const theme of ['five', 'silver', 'digital']) {
        used.clear();
        panel(canvas, theme, slots, DEMO, { demo: true });
        assert.ok(used.has(FONTS.bold));
        if (theme === 'five') assert.deepEqual([...used], [FONTS.bold]);
        else assert.ok(used.has(FONTS.regular));
    }
    const digits = getFont(FONTS.bold, 62, '0123456789').glyphs;
    assert.equal(new Set('0123456789'.split('').map((digit) => digits[digit.charCodeAt(0)][6])).size, 1);
});

test('live dial face cache matches a fresh render as readings and themes change', () => {
    const artifact = path.resolve(__dirname, '../dist/zekai_cluster_themes/source/javascript');
    const { renderPanelFrame } = require(path.join(artifact, 'panel-frame'));
    const canvas = new Canvas(PANEL_WIDTH, PANEL_HEIGHT);
    const cache = {};
    const faces = [
        ['five', { rightInner: 'media', faceColour: 'magenta' }],
        ['five', { rightInner: 'media', faceColour: 'navy', speedPosition: 'lower' }],
        ['silver', { rightInner: 'media' }],
        ['vdoRetro', {}],
    ];
    for (const [theme, choices] of faces) {
        let face;
        for (const speed of [42, 78]) {
            const data = { speed, rpm: 1900 + speed * 5, fuelLitres: 32, range: 420, coolant: 91,
                media: { title: 'Test song at ' + speed, artist: 'Test artist' } };
            const live = renderPanelFrame(theme, choices, data, false, canvas, cache);
            const fresh = renderPanelFrame(theme, choices, data);
            assert.equal(Buffer.compare(live.d, fresh.d), 0);
            if (face) assert.equal(cache.pixels, face);
            face = cache.pixels;
        }
    }
});

test('distant changes in one band send small rectangles and reconstruct the complete frame', () => {
    const artifact = path.resolve(__dirname, '../dist/zekai_cluster_themes/source/javascript');
    const { sendPanelFrame } = require(path.join(artifact, 'panel-frame'));
    const previous = new Canvas(PANEL_WIDTH, PANEL_HEIGHT);
    const current = new Canvas(PANEL_WIDTH, PANEL_HEIGHT);
    previous.clear('#030507');
    current.d.set(previous.d);
    current.fillRect(110, 52, 25, 20, '#eeeeee');
    current.fillRect(900, 61, 30, 10, '#eeeeee');
    current.fillRect(1500, 58, 20, 18, '#eeeeee');
    let sent = false;
    const client = { pixels(ref, rects, data) {
        sent = true;
        assert.equal(rects.length, 3);
        assert.equal(data.length, (25 * 20 + 30 * 10 + 20 * 18) * 4);
        let offset = 0;
        for (const { x, y, w, h } of rects) {
            for (let row = y; row < y + h; row++) {
                previous.d.set(data.subarray(offset, offset + w * 4), (row * PANEL_WIDTH + x) * 4);
                offset += w * 4;
            }
        }
        return true;
    } };
    assert.equal(sendPanelFrame(client, 1, current, previous), true);
    assert.equal(sent, true);
    assert.equal(Buffer.compare(previous.d, current.d), 0);
    sent = false;
    assert.equal(sendPanelFrame(client, 1, current, previous), true);
    assert.equal(sent, false);
});

test('packaged theme starts without the UI, fills the panel and remembers manual shutdown', () => {
    const vm = require('node:vm');
    const artifact = path.resolve(__dirname, '../dist/zekai_cluster_themes/source/javascript');
    const entry = path.join(artifact, 'app.js');
    const packagedRequire = require('node:module').createRequire(entry);
    const spec = packagedRequire('./kit/app-spec.json');
    assert.equal(packagedRequire('../package.json').mguAppStartType, 'autostart');
    const { renderPanelFrame } = packagedRequire('./panel-frame');
    const { listSheet } = packagedRequire('./kit/sheet');
    const sheetTheme = packagedRequire('./kit/themes').theme();
    for (const theme of ['five', 'silver']) {
        const side = 'rightInner';
        for (const kind of ['media', 'waze']) {
            const picture = renderPanelFrame(theme, { [side]: kind }, { mapSlot: kind === 'waze' ? side : null });
            for (let i = 3; i < picture.d.length; i += 4) assert.equal(picture.d[i], 255);
        }
    }
    const handlers = new Map();
    const watchInstances = new Map();
    const watchOptions = new Map();
    const click = new Map();
    const values = new Map(spec.settings.map((item) => [item.key, item.default]));
    values.set('instrumentTheme', 'vdoRetro');
    const listeners = [];
    const renderers = [];
    const process = new EventEmitter();
    const app = new EventEmitter();
    let now = Date.UTC(2026, 10, 19, 8, 17, 12);
    class TestDate extends Date { static now() { return now; } }
    let frame, onVisible, previewTick, interval, motion, impl, background;
    const settings = {
        schema: spec.settings,
        get: (key) => values.get(key),
        item: (key) => spec.settings.find((item) => item.key === key),
        set(key, value) { values.set(key, value); listeners.forEach((fn) => fn()); },
        onChange(fn) { listeners.push(fn); },
    };
    const bgContext = {
        spec, app, settings, log: { warn() {} },
        signals: { watch: async (name, instance, fields, log, opts) => {
            handlers.set(name, fields);
            watchInstances.set(name, instance);
            watchOptions.set(name, opts);
        } },
    };
    const renderStub = { ClusterRender: class extends FakeRender {
        constructor() { super(); renderers.push(this); }
    } };
    const serviceModule = { exports: {} };
    const servicePath = path.join(artifact, 'cluster-service.js');
    vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), {
        module: serviceModule, Buffer, process, Date: TestDate,
        setInterval(fn, ms) { assert.equal(ms, 50); interval = fn; return fn; },
        clearInterval(fn) { if (interval === fn) interval = null; },
        setTimeout(fn) { motion = fn; return fn; },
        clearTimeout(fn) { if (motion === fn) motion = null; },
        require(name) { return name === './cluster_render_client' ? renderStub : packagedRequire(name); },
    }, { filename: servicePath });
    vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
        Date: TestDate,
        require(name) {
            if (name === './kit/mgu') return { run(value) { impl = value; } };
            if (name === './cluster-service') return serviceModule.exports;
            return packagedRequire(name);
        },
    }, { filename: entry });
    try {
        background = impl.background(bgContext);
        assert.equal(background.theme, 'vdoRetro');
        const renderer = renderers[0];
        renderer.emit('ready');
        assert.equal(renderer.args.h, 720);
        assert.equal(renderer.args.w, 1920);
        assert.equal(renderer.args.iw, renderer.args.w);
        assert.equal(renderer.args.ih, renderer.args.h);
        assert.equal(renderer.args.sampling, 'nearest');
        assert.equal(renderer.args.fps, 20);
        assert.equal(renderer.frames, 1);
        assert.equal(renderer.rects, null);
        assert.equal(renderer.bytes, 1920 * 720 * 4);
        const vehicle2 = 'de.bmw.infotainment.vehicle.Vehicle2';
        const cds = 'de.bmw.infotainment.vehicle.CDS';
        assert.equal(watchOptions.get(vehicle2).pollMs, 100);
        assert.equal(watchInstances.get(vehicle2), '1');
        assert.equal(watchOptions.get(cds).pollMs, 100);
        assert.equal(watchOptions.get(cds).pollByField.statusEngineTemperature, 2500);
        handlers.get('de.bmw.infrastructure.VehicleInformation').statusGearboxDrive({ statusActualStageDrive: 'D' });
        now += 100;
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 68 * 64 });
        assert.equal(renderer.frames, 2);
        assert.ok(renderer.rects.length > 0 && renderer.rects.length <= 15);
        assert.equal(renderer.bytes, renderer.rects.reduce((bytes, rect) => bytes + rect.w * rect.h * 4, 0));
        assert.ok(renderer.bytes < 1920 * 720 * 4);
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 72 * 64 });
        handlers.get(cds).statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 1730 * 4 });
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 77 * 64 });
        handlers.get(cds).statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 2100 * 4 });
        assert.equal(renderer.frames, 2);
        now += 50;
        motion();
        assert.equal(renderer.frames, 3);
        assert.equal(JSON.parse(background.lastFrame)[2].speed, 77);
        assert.equal(JSON.parse(background.lastFrame)[2].rpm, 2100);
        const lightInterface = 'de.bmw.body.Light';
        const light = handlers.get(lightInterface);
        const lightProxy = packagedRequire('../manifest.json').proxies[lightInterface];
        assert.equal(watchInstances.get(lightInterface), lightProxy.instances);
        assert.equal(lightProxy.attributes.Indicators, 's');
        const darkLens = background.lastPixels.d.slice();
        light.Indicators({ statusIndicateDirection: 'BLINKER_LINKS_EIN', frequencyIndicateDirection: 1 });
        now += 50;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].turnLamp, true);
        assert.ok(renderer.bytes < 10000);
        const litLens = background.lastPixels.d.slice();
        assert.notDeepEqual(litLens, darkLens);
        now += 330;
        light.Indicators({ statusIndicateDirection: 'BLINKER_LINKS_EIN', frequencyIndicateDirection: 1 });
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].turnLamp, false);
        assert.deepEqual(background.lastPixels.d, darkLens);
        light.Indicators({ statusIndicateDirection: 2, frequencyIndicateDirection: 1 });
        now += 50;
        interval();
        assert.deepEqual(background.lastPixels.d, litLens);
        light.Indicators({ statusIndicateDirection: 3, frequencyIndicateDirection: 1,
            statusIndicateDirectionInstrumentPack: 'BLINKERKONTROLL_MINUS_LAMPEN_IM_KOMBI_AUS' });
        now += 50;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].turnLamp, false);
        watchOptions.get(lightInterface).onUnavailable();
        light.StatusFunctionsIndicators2({ controlIndicateDirection: 'BEIDSEITIGES_BLINKEN_EIN' });
        now += 50;
        interval();
        assert.deepEqual(background.lastPixels.d, litLens);
        light.StatusFunctionsIndicators2({ controlIndicateDirection: 'BLINKEN_AUS' });
        now += 50;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].turnLamp, false);

        let picker;
        impl.start({
            settings, background,
            ui: {
                onClick: (key, fn) => click.set(key, fn),
                onVisible: (fn) => { onVisible = fn; },
                image: (name, record) => { assert.equal(name, 'MAIN_GFX'); frame = record; },
            },
            loop: (page, fps, render) => { previewTick = render; return { kick: render }; },
            onLayout() {},
            openSetting: (key) => { picker = listSheet(settings, null, { setting: settings.item(key), swatch: impl.settingSwatch }); },
            canvas: (width, height) => new Recorder(width, height),
        });
        function select(target, key, value) {
            const saved = settings.get(key);
            frame.targets.find((item) => item.key === target).run();
            assert.equal(settings.get(key), saved);
            assert.equal(picker.open.key, key);
            const targets = picker.draw(new Recorder(1600, 520), sheetTheme);
            assert.equal(targets.length, settings.item(key).options.length + 1);
            const index = settings.item(key).options.findIndex(([id]) => id === value);
            assert.equal(targets[index + 1].act(), 'close');
            assert.equal(settings.get(key), value);
        }
        assert.ok(frame.targets.some((target) => target.key === 'theme:vdoRetro'));
        frame.targets.find((target) => target.key === 'theme:silver').run();
        assert.equal(background.choices.faceColour, 'silver');
        select('silver_faceColour', 'silver_faceColour', 'amethyst');
        assert.equal(background.choices.faceColour, 'amethyst');
        now += 50;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[1].faceColour, 'amethyst');
        assert.equal(background.choices.needleEffect, 'classic');
        select('silver_needleEffect', 'silver_needleEffect', 'starlight');
        assert.equal(background.choices.needleEffect, 'starlight');
        const previewWords = frame.words().slice();
        now += 125;
        previewTick();
        assert.notDeepEqual(frame.words(), previewWords);
        interval();

        now += 50;
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 86 * 64 });
        assert.equal(JSON.parse(background.lastFrame)[3], now);
        const trailPixels = background.lastPixels.d.slice();
        now += 250;
        interval();
        assert.notDeepEqual(background.lastPixels.d, trailPixels);
        now += 450;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[3], null);
        const settledFrame = renderer.frames;
        now += 50;
        interval();
        assert.equal(renderer.frames, settledFrame);
        select('silver_needleEffect', 'silver_needleEffect', 'classic');
        assert.equal(background.choices.needleEffect, 'classic');

        assert.equal(background.choices.leftInner, 'rpm');
        assert.equal(background.choices.rightInner, 'fuelRange');
        const defaultRollsDials = { ...background.choices };
        select('slot:leftInner', 'silver_leftInner', 'media');
        assert.equal(background.choices.leftInner, 'media');
        assert.deepEqual({ ...background.choices, leftInner: 'rpm' }, defaultRollsDials);
        settings.set('silver_leftInner', 'rpm');
        select('slot:rightInner', 'silver_rightInner', 'media');
        assert.equal(background.choices.rightInner, 'media');
        assert.deepEqual({ ...background.choices, rightInner: 'fuelRange' }, defaultRollsDials);
        const mediaInterface = 'de.bmw.infotainment.hmi.hmimediastate.HmiMediaState';
        const mediaProxy = packagedRequire('../manifest.json').proxies[mediaInterface];
        assert.deepEqual(mediaProxy, { instances: 'HMI_CID', attributes: { playerMetadata: 'rs' } });
        assert.equal(watchInstances.get(mediaInterface), mediaProxy.instances);
        const receiveMedia = handlers.get(mediaInterface).playerMetadata;
        receiveMedia({ sink: 'FRONT', firstLineType: 1, firstLineText: 'Front Artist',
            secondLineType: 'TITLE', secondLineText: 'First Song' });
        receiveMedia({ sink: 1, firstLineType: 'TITLE', firstLineText: 'Rear Song' });
        now += 100;
        interval();
        assert.deepEqual(JSON.parse(background.lastFrame)[2].media, { title: 'First Song', artist: 'Front Artist' });
        const firstSongPixels = background.lastPixels.d.slice();
        receiveMedia({ sink: 0, threeRowText: 'Second Song\nSecond Artist' });
        now += 100;
        interval();
        assert.deepEqual(JSON.parse(background.lastFrame)[2].media, { title: 'Second Song', artist: 'Second Artist' });
        assert.equal(Buffer.compare(firstSongPixels, background.lastPixels.d) === 0, false);
        receiveMedia({ sink: 'FRONT' });
        now += 100;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].media, null);
        const playerInterface = 'de.bmw.infotainment.entertainment.mediaplayer.MediaPlayer';
        const player = handlers.get(playerInterface);
        assert.equal(watchInstances.get(playerInterface), 'CarPlayMedia');
        receiveMedia({ sink: 'FRONT', firstLineType: 'TITLE', firstLineText: 'BMW title' });
        player.playerState('PLAYER_STATE_PLAY');
        player.currentItemMetadata([{ key: 'TITLE', value: { stringValue: 'CarPlay title' } },
            { key: 'ARTIST', value: { stringValue: 'CarPlay artist' } }]);
        now += 50;
        interval();
        assert.deepEqual(JSON.parse(background.lastFrame)[2].media,
            { title: 'CarPlay title', artist: 'CarPlay artist', source: 'CarPlay' });
        player.playerState('PLAYER_STATE_STOP');
        now += 50;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].media.title, 'BMW title');
        const themes = new Map(spec.settings.find((item) => item.key === 'instrumentTheme').options);
        assert.deepEqual(['five', 'silver', 'vdoRetro'].map((id) => themes.get(id)), ['Porsche', 'Rolls Royce', 'VW 2000']);
        frame.targets.find((target) => target.key === 'theme:five').run();
        frame.targets.find((target) => target.key === 'five_faceColour').run();
        assert.equal(settings.get('five_faceColour'), 'navy');
        picker.move(7);
        assert.equal(picker.press(), 'close');
        assert.equal(settings.get('five_faceColour'), 'blueRing');
        frame.targets.find((target) => target.key === 'five_faceColour').run();
        picker.move(-1);
        assert.equal(picker.back(), 'close');
        assert.equal(settings.get('five_faceColour'), 'blueRing');
        settings.set('five_leftOuter', 'clock');
        settings.set('five_speedPosition', 'centre');
        frame.targets.find((target) => target.key === 'porsche:restoreLayout').run();
        assert.equal(background.choices.leftOuter, 'battery');
        assert.equal(background.choices.speedPosition, 'lower');
        for (const slot of SLOTS) {
            const prior = { ...background.choices };
            select('slot:' + slot, 'five_' + slot, 'none');
            assert.equal(background.choices[slot], 'none');
            assert.deepEqual({ ...background.choices, [slot]: prior[slot] }, prior);
        }
        frame.targets.find((target) => target.key === 'theme:vdoRetro').run();
        onVisible('MAIN', false);
        assert.equal(renderer.connected, true);
        renderer.emit('layer', 1, 'suspended', 'another layer');
        interval();
        assert.equal(renderer.args.contend, false);
        assert.equal(renderers.length, 1);
        renderer.emit('layer', 1, 'shown');
        renderer.pixels = () => { throw new Error('simulated frame failure'); };
        background.lastPixels = null;
        background.lastFrame = null;
        now += 100;
        interval();
        assert.equal(renderer.connected, false);
        assert.match(background.status(), /reconnecting/);
        now += 1999;
        interval();
        assert.equal(renderers.length, 1);
        now += 1;
        interval();
        const recovered = renderers[1];
        recovered.emit('ready');
        assert.equal(recovered.frames, 1);
        click.get('BTN_RESTORE')();
        assert.equal(values.get('clusterOverlayEnabled'), false);
        assert.equal(recovered.connected, false);
        const restarted = impl.background(bgContext);
        assert.equal(renderers.length, 2);
        assert.equal(restarted.status(), 'BMW original active');
        click.get('BTN_APPLY')();
        assert.equal(values.get('clusterOverlayEnabled'), true);
        assert.equal(restarted.theme, 'vdoRetro');
        assert.equal(restarted.client.connected, true);
        app.emit('shutdown');
        assert.equal(restarted.client, null);
    } finally {
        process.emit('exit');
    }
});
