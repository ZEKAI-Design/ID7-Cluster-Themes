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
const { PANEL_WIDTH, PANEL_HEIGHT, panelLayout, PORSCHE_CENTRE, PORSCHE_DIALS, BMW_GEAR_WINDOW } = require(app + 'panel-layout');
const { FONTS, TEXT_SIZE_RATIO } = require(app + 'instrument-type');
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
        this.pixelUploads = 0;
        this.images = new Map();
        this.assets = new Map();
        this.effects = new Map();
        this.transforms = new Map();
        this.uniforms = new Map();
        this.nextRef = 1;
    }

    connect() { this.connected = true; }
    close() { this.connected = false; }
    image(args) {
        const ref = this.nextRef++;
        if (ref === 1) this.args = args;
        this.images.set(ref, args);
        return ref;
    }
    asset(args) { const ref = this.nextRef++; this.assets.set(ref, args); return ref; }
    effect(args) { const ref = this.nextRef++; this.effects.set(ref, args); return ref; }
    bind() {}
    uniform(ref, name, value) {
        if (!this.uniforms.has(ref)) this.uniforms.set(ref, new Map());
        this.uniforms.get(ref).set(name, value);
    }
    set(ref, args) { this.transforms.set(ref, { ...this.transforms.get(ref), ...args }); }
    drop(ref) {
        this.images.delete(ref);
        this.assets.delete(ref);
        this.effects.delete(ref);
        this.transforms.delete(ref);
        this.uniforms.delete(ref);
    }
    pixels(ref, rects, pixels) {
        this.pixelUploads++;
        const image = this.images.get(ref);
        if (!image || image.w !== 1920) return true;
        this.frames++;
        this.rects = rects;
        this.bytes = pixels.length;
        return true;
    }
}

test('Waze keeps the window through startup, releases on a frozen stream and respects current providers', () => {
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
        report({ target: 'map', state: 'idle', cluster: 1 });
        assert.equal(lease.update(choices), null);
        const rect = rectangle('rightInner');
        assert.equal(fs.readFileSync(file, 'utf8'), 'panel ' + [rect.x, rect.y, rect.w, rect.h].join(' ') + '\n');
        const inode = fs.statSync(file).ino;
        now += 800;
        report({ target: 'panel', state: 'idle', cluster: 1 });
        assert.equal(lease.update(choices), null);
        assert.equal(fs.statSync(file).ino, inode);
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

        const other = 'panel 100 200 800 288\n';
        fs.writeFileSync(file, other);
        fs.utimesSync(file, new Date(now), new Date(now));
        now += 800;
        report({ target: 'map', state: 'showing', cluster: 1 });
        assert.equal(lease.update(choices), null);
        lease.release();
        assert.equal(fs.readFileSync(file, 'utf8'), other);
        now += 5000;
        report({ target: 'map', state: 'showing', cluster: 1 });
        assert.equal(lease.update({ mapMode: 'full' }), null);
        assert.equal(fs.readFileSync(file, 'utf8'), 'panel 0 0 1920 720\n');
        now += 800;
        report({ target: 'panel', state: 'showing', cluster: 1, hosted: 1 });
        assert.equal(lease.update({ mapMode: 'full' }), null);
        assert.equal(fs.existsSync(file), false);
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
            const [, clockX, clockBaseline, , clockSize] = label('10:53');
            const [, temperatureX, temperatureBaseline, , temperatureSize] = label('15°C');
            if (faceColour === 'silver') assert.equal(speedColour, '#ffffff');
            assert.equal(speedX, cx);
            assert.equal(unitX, cx);
            assert.equal(rangeX, cx);
            assert.ok(unitY > speedY && unitSize < speedSize);
            assert.equal(rangeY, cy + 121);
            assert.deepEqual([clockX, temperatureX], [225, 735]);
            assert.equal(clockBaseline, 304);
            assert.equal(temperatureBaseline, clockBaseline);
            assert.equal(clockSize, 21 * TEXT_SIZE_RATIO * 0.9);
            assert.equal(temperatureSize, clockSize);
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
    assert.deepEqual([label('11:17').x, label('11:17').y], [225, 304]);
    assert.deepEqual([label('13°C').x, label('13°C').y], [735, 304]);
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
        readouts.set(value, { x, y, size, colour });
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
    assert.equal(labels.filter((value) => value === 'P').length, 1);
    assert.deepEqual(['P', 'R', 'N', 'D'].map((gear) => {
        const { x, y, size } = readouts.get(gear);
        return [x, y, size];
    }), [[346, 255, 12.6], [346, 268, 12.6], [346, 281, 12.6], [346, 294, 12.6]]);
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
    assert.ok(labels.every((label) => readouts.get(label).colour === '#ffffff'));
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

test('Rolls Royce side rims and their glow open toward the center', () => {
    const canvas = new Canvas(960, 320);
    const recording = new Recorder(960, 320);
    const preview = new Canvas(960, 320);
    const choices = { leftInner: 'none', rightInner: 'none' };
    panel(canvas, 'silver', choices, {}, {});
    panel(recording, 'silver', choices, {}, {});
    play(recording.words(), preview);
    for (const image of [canvas, preview]) {
        const rgb = (x, y) => Array.from(image.d.subarray((y * image.w + x) * 4, (y * image.w + x) * 4 + 3));
        const bg = rgb(0, 0);
        for (const [cx, inward] of [[252, 1], [708, -1]]) {
            assert.deepEqual(rgb(cx + inward * 96, 171), bg);
            assert.deepEqual(rgb(cx + inward * 89, 119), bg);
            assert.ok(Math.min(...rgb(cx - inward * 96, 171)) > 170);
        }
    }
});

test('Rolls Royce uses one radius for the full-height bezel and keeps the dial anchors', () => {
    const artifact = path.resolve(__dirname, '../dist/zekai_cluster_themes/source/javascript');
    const { renderPanelFrame } = require(path.join(artifact, 'panel-frame'));
    const canvas = new Canvas(PANEL_WIDTH, PANEL_HEIGHT);
    const circles = [];
    const drawCircle = canvas.circle.bind(canvas);
    canvas.circle = (x, y, r, colour) => {
        if (colour === '#2e3137') circles.push({ x, y, r });
        return drawCircle(x, y, r, colour);
    };
    const picture = renderPanelFrame('silver', {}, { speed: 0, rpm: 961, range: 519, fuelLitres: 7 }, false, canvas);
    assert.deepEqual(circles, [{ x: 960, y: 360, r: 350 }]);
    const rgba = (x, y) => Array.from(picture.d.subarray((y * PANEL_WIDTH + x) * 4, (y * PANEL_WIDTH + x + 1) * 4));
    const base = rgba(960, 0);
    assert.deepEqual(rgba(960, 9), base);
    assert.notDeepEqual(rgba(960, 10), base);
    assert.notDeepEqual(rgba(960, 709), base);
    assert.deepEqual(rgba(960, 710), base);
    const layout = panelLayout('silver');
    assert.equal(layout.scale, 2.68);
    assert.equal(layout.x + 480 * layout.scale, 960);
    assert.equal(layout.y + 165 * layout.scale, 338);
    assert.deepEqual(rgba(BMW_GEAR_WINDOW.x, BMW_GEAR_WINDOW.y), [0, 0, 0, 0]);
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
        if (x === 346 && ['P', 'R', 'N', 'D'].includes(value) && opts.font === FONTS.bold) highlighted.push(value);
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
    now += 1600;
    assert.equal(car.snapshot().rpm, null);
    render('P');
    options.onUnavailable();
    render(null);
    gearbox.statusGearboxDrive({ statusActualStageDrive: 1 });
    render('P');
});

test('Park clears a nonzero speed until a confirmed stop or new driving sample', () => {
    const { Car } = require(app + 'car');
    let now = 0;
    const car = new Car(() => now);
    car.put('stage', 'D');
    car.put('speed', 46);
    now += 25;
    car.put('selection', 'P');
    assert.equal(car.snapshot().speed, null);
    now += 25;
    car.put('speed', 46);
    assert.equal(car.snapshot().speed, null);
    car.put('speed', 0);
    assert.equal(car.snapshot().speed, 0);
    car.put('speed', 46);
    now += 25;
    car.put('stage', 'D');
    assert.equal(car.snapshot().speed, null);
    car.put('speed', 8);
    car.put('rpm', 900);
    assert.equal(car.snapshot().speed, 8);
    now += 751;
    assert.equal(car.snapshot().speed, null);
    assert.equal(car.snapshot().rpm, null);
});

test('a numeric or named driving gear can supersede a Park message', () => {
    const { Car } = require(app + 'car');
    const car = new Car(() => 100);
    const handlers = new Map();
    car.watch({ signals: { async watch(name, instance, fields) { handlers.set(name, fields); } } });
    const gear = handlers.get('de.bmw.infrastructure.VehicleInformation');
    const speed = handlers.get('de.bmw.infotainment.vehicle.Vehicle2');
    gear.statusGearboxDrive({ statusActualStageDrive: 1 });
    speed.statusCarSpeed2({ speedVehicleCentreOfGravity: 64 * 12 }, 'notification');
    assert.equal(car.motion().speed, null);
    gear.DataPowerTrain2({ statusGearSelectionDrive: 5 });
    assert.equal(car.snapshot().stage, 'D');
    speed.statusCarSpeed2({ speedVehicleCentreOfGravity: 64 * 12 }, 'notification');
    assert.equal(car.motion().speed, 12);
    gear.DataPowerTrain2({ statusGearSelectionDrive: 3 });
    assert.equal(car.motion().speed, null);
    gear.DataPowerTrain2({ statusGearSelectionDrive: '_1' });
    assert.equal(car.snapshot().stage, 'D');
    gear.statusGearboxDrive({ statusActualStageDrive: 2 });
    assert.equal(car.snapshot().stage, 'R');
    gear.statusGearboxDrive({ statusActualStageDrive: 3 });
    assert.equal(car.snapshot().stage, 'N');
    assert.match(car.takeMotionStats(), /speed 2 notifications/);
    assert.match(car.takeMotionStats(), /speed 0 notifications/);
});

test('motion notifications suppress fallback reads and supersede an in-flight getter', async () => {
    const vm = require('node:vm');
    const file = path.join(__dirname, '../kit/runtime/signals.js');
    const module = { exports: {} };
    let now = 0, read, notify, setAvailability, poll;
    const proxy = {
        init: async () => {},
        isAvailable: () => true,
        subscribeToAvailability(fn) { setAvailability = fn; },
        subscribe({ onReceive }) { notify = onReceive; },
        getValue() { return new Promise((resolve) => { read = resolve; }); },
    };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        module, __dirname: path.dirname(file),
        Date: { now: () => now },
        setImmediate,
        setInterval(fn) { poll = fn; },
        require(name) {
            if (name === 'fs') return { readFileSync: () => '{"fields":{"speed":{"getter":true}}}' };
            if (name === 'someip') return { buildProxy: async () => proxy };
            return require(name);
        },
    }, { filename: file });
    const tick = () => new Promise(setImmediate);
    const readings = [];
    await module.exports.watch('Vehicle2', '1', { speed: (value) => readings.push(value) }, null, {
        pollMs: 100, readTimeoutMs: 350, notifyFreshMs: { speed: 150 },
    });
    const initial = read;
    now = 30;
    notify(52);
    initial(40);
    await tick();
    now = 100;
    poll();
    await tick();
    assert.equal(read, initial);
    now = 200;
    poll();
    await tick();
    assert.notEqual(read, initial);
    read(56);
    await tick();
    assert.deepEqual(readings, [52, 56]);
    now = 300;
    poll();
    await tick();
    setAvailability(false);
    read(44);
    await tick();
    assert.deepEqual(readings, [52, 56]);
});

test('Rolls Royce has white text in all ten palettes, including native speed and RPM digits', () => {
    const setting = spec.settings.find((item) => item.key === 'silver_faceColour');
    assert.equal(setting.options.length, 10);
    assert.deepEqual(setting.options.map(([id]) => id), Object.keys(SILVER_PALETTES));
    const canvas = new Canvas(960, 320);
    const faces = new Set();
    const stamp = new Map();
    const drawText = canvas.text.bind(canvas);
    canvas.text = (value, x, y, size, colour, opts) => {
        stamp.set([value, x].join('|'), colour);
        return drawText(value, x, y, size, colour, opts);
    };
    const artifact = path.resolve(__dirname, '../dist/zekai_cluster_themes/source/javascript');
    const { SilverDigits } = require(path.join(artifact, 'silver-digits'));
    const renderer = new FakeRender();
    const digits = new SilverDigits(renderer);
    assert.equal(digits.prepare(), true);
    const [speedRef, rpmRef] = [...renderer.effects.keys()];
    const data = { speed: 86, rpm: 2400, range: 519, ambient: 15.5, stage: 'D' };
    for (const [faceColour] of setting.options) {
        stamp.clear();
        const choices = { faceColour };
        panel(canvas, 'silver', choices, data, {});
        const center = (246 * canvas.w + 520) * 4;
        const side = (210 * canvas.w + 265) * 4;
        faces.add(Buffer.from(canvas.d.subarray(center, center + 3)).toString('hex'));
        assert.ok(Math.max(...canvas.d.subarray(side, side + 3)) < 65);
        assert.ok([...stamp.values()].every((colour) => colour === '#ffffff'));
        digits.update(data, choices, true);
        const speedInk = renderer.uniforms.get(speedRef).get('u_ink');
        assert.deepEqual(speedInk.slice(0, 3), [1, 1, 1]);
        assert.equal(speedInk[3] > 0, Boolean(SILVER_PALETTES[faceColour].lightFace));
        assert.deepEqual(renderer.uniforms.get(rpmRef).get('u_ink'), [1, 1, 1, 0]);
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
        assert.ok(rects.length >= 3 && rects.length <= 15);
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
            const { x, y, w, h } = BMW_GEAR_WINDOW;
            let transparent = 0;
            for (let row = 0; row < PANEL_HEIGHT; row++) {
                for (let col = 0; col < PANEL_WIDTH; col++) {
                    const alpha = picture.d[(row * PANEL_WIDTH + col) * 4 + 3];
                    const gear = theme === 'silver' && row >= y && row < y + h && col >= x && col < x + w;
                    if (alpha === 0) transparent++;
                    assert.equal(alpha, gear ? 0 : 255);
                }
            }
            assert.equal(transparent, theme === 'silver' ? w * h : 0);
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
    let frame, onVisible, previewTick, interval, motion, delay, impl, background;
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
        setTimeout(fn, ms) { motion = fn; delay = ms; return fn; },
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
        assert.deepEqual(lightProxy.attributes, { StatusFunctionsIndicators: 's', StatusFunctionsIndicators2: 's' });
        assert.deepEqual(Object.keys(light).sort(), Object.keys(lightProxy.attributes).sort());
        const darkLens = background.lastPixels.d.slice();
        light.StatusFunctionsIndicators({ controlIndicateDirection: 'DAUER_BLINKEN_LINKS_EIN', activeFunctionIndicateDirection: 'DAUERBLINKEN_LINKS' });
        now += 50;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].turnLamp, true);
        assert.ok(renderer.bytes < 10000);
        const litLens = background.lastPixels.d.slice();
        assert.notDeepEqual(litLens, darkLens);
        now += 330;
        light.StatusFunctionsIndicators2({ controlIndicateDirection: 3 });
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].turnLamp, false);
        assert.deepEqual(background.lastPixels.d, darkLens);
        light.StatusFunctionsIndicators2({ controlIndicateDirection: 0, activeFunctionIndicateDirection: 8 });
        now += 50;
        interval();
        assert.deepEqual(background.lastPixels.d, litLens);
        watchOptions.get(lightInterface).onUnavailable();
        now += 50;
        interval();
        assert.equal(JSON.parse(background.lastFrame)[2].turnLamp, false);
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
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 77 * 64 });
        frame.targets.find((target) => target.key === 'theme:silver').run();
        renderer.emit('layer', 1, 'shown');
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
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 77 * 64 });
        interval();
        const trailRef = background.silverStarlight.layers[0].ref;
        const framesBeforeTrail = renderer.frames;

        now += 50;
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 86 * 64 });
        interval();
        assert.equal(renderer.transforms.get(trailRef).visible, true);
        const initialFade = renderer.uniforms.get(trailRef).get('u_fade')[0];
        assert.equal(renderer.frames, framesBeforeTrail);
        now += 250;
        interval();
        assert.ok(renderer.uniforms.get(trailRef).get('u_fade')[0] < initialFade);
        assert.equal(renderer.frames, framesBeforeTrail);
        now += 450;
        interval();
        assert.equal(renderer.transforms.get(trailRef).visible, false);
        const settledFrame = renderer.frames;
        now += 50;
        interval();
        assert.equal(renderer.frames, settledFrame);
        select('silver_needleEffect', 'silver_needleEffect', 'classic');
        assert.equal(background.choices.needleEffect, 'classic');

        assert.equal(background.choices.leftInner, 'rpm');
        assert.equal(background.choices.rightInner, 'fuelRange');
        const defaultRollsDials = { ...background.choices };
        renderer.emit('layer', 1, 'shown');
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 86 * 64 });
        now += 50;
        handlers.get(cds).statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 2400 * 4 });
        motion();
        const [speedNeedle, rpmNeedle] = [...renderer.images.keys()].slice(1);
        const [speedDigits, rpmDigits] = [...renderer.effects.keys()];
        assert.equal(renderer.images.size, 3);
        assert.ok(renderer.transforms.get(speedNeedle).visible);
        assert.equal(renderer.transforms.get(rpmNeedle).rotate, (2400 / 8000 - 1) * 180);
        assert.equal(renderer.assets.size, 2);
        now += 1;
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 87 * 64 });
        handlers.get(cds).statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 2500 * 4 });
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 90 * 64 });
        assert.equal(delay, 15);
        assert.equal(renderer.transforms.get(speedNeedle).rotate, -136 + 86 / 260 * 272);
        const framesBeforeMotion = renderer.frames;
        now += delay;
        motion();
        assert.equal(renderer.transforms.get(speedNeedle).rotate, -136 + 90 / 260 * 272);
        assert.equal(renderer.transforms.get(rpmNeedle).rotate, (2500 / 8000 - 1) * 180);
        assert.equal(renderer.frames, framesBeforeMotion);
        const movingDigits = renderer.uniforms.get(speedDigits).get('u_glyphs');
        const frameCount = renderer.frames;
        renderer.blocked = true;
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 22 * 64 });
        now += 50;
        interval();
        assert.equal(renderer.uniforms.get(speedDigits).get('u_glyphs'), movingDigits);
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 0 });
        handlers.get(cds).statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 850 * 4 });
        renderer.blocked = false;
        renderer.emit('drain');
        if (renderer.transforms.get(speedNeedle).rotate !== -136) {
            now += 50;
            motion();
        }
        assert.equal(renderer.transforms.get(speedNeedle).rotate, -136);
        assert.equal(renderer.transforms.get(rpmNeedle).rotate, (850 / 8000 - 1) * 180);
        assert.equal(renderer.frames, frameCount);
        const font = getFont(FONTS.bold, 54 * 2.68 * 0.9, '0123456789-');
        assert.deepEqual(Array.from(renderer.uniforms.get(speedDigits).get('u_glyphs').slice(0, 8)),
            [...font.glyphs[48].slice(0, 4), 0, 0, 0, 0]);
        assert.ok(renderer.uniforms.get(rpmDigits).has('u_positions'));
        select('slot:leftInner', 'silver_leftInner', 'media');
        assert.equal(background.choices.leftInner, 'media');
        assert.deepEqual({ ...background.choices, leftInner: 'rpm' }, defaultRollsDials);
        now += 50;
        interval();
        assert.equal(renderer.transforms.get(rpmNeedle).visible, false);
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
        settings.set('five_faceColour', 'red');
        const sendPorscheSpeed = (speed) => handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: speed * 64 });
        const sendPorscheRpm = (rpm) => handlers.get(cds).statusEngineSpeed2({ actualValueRPMEngineCrankshaft: rpm * 4 });
        sendPorscheSpeed(66);
        sendPorscheRpm(1750);
        now += 50;
        interval();
        const porsche = background.porscheMotion;
        const [tach, speedometer] = porsche.needles.layers;
        const lowerDigits = porsche.digits.labels[0];
        const lowerPosition = renderer.transforms.get(lowerDigits.ref).y;
        assert.equal(renderer.transforms.get(tach.ref).rotate, 233 + 254 * 1750 / 8000);
        assert.equal(renderer.transforms.get(speedometer.ref).rotate, 182 + 208 * 66 / 300);
        assert.equal(renderer.images.size, 3);
        // cluster-render accounts for two copies of every mutable texture,
        // including a standard 1088x480 map's I420 buffers from another app.
        const rendererBudget = 16 * 1024 * 1024;
        const wazeBuffers = 1088 * 720 * 4;
        const imageBytes = [...renderer.images.values()].reduce((bytes, { iw, ih, w, h }) =>
            bytes + (iw || w) * (ih || h) * 8, 0);
        const assetBytes = [...renderer.assets.values()].reduce((bytes, { w, h, format }) =>
            bytes + w * h * (format === 'r8' ? 2 : 8), 0);
        const total = wazeBuffers + imageBytes + assetBytes;
        assert.ok(total < rendererBudget);
        assert.ok(total + 478 * 478 * 8 > rendererBudget, '0.8.21 separate speed scale exceeds the shared budget');
        const uploads = renderer.pixelUploads;
        now += 1;
        sendPorscheSpeed(79);
        sendPorscheRpm(2130);
        sendPorscheSpeed(86);
        sendPorscheRpm(2360);
        assert.ok(delay >= 0 && delay <= 16);
        now += 16;
        motion();
        assert.equal(renderer.transforms.get(tach.ref).rotate, 233 + 254 * 2360 / 8000);
        assert.equal(renderer.transforms.get(speedometer.ref).rotate, 182 + 208 * 86 / 300);
        assert.equal(lowerDigits.value, '86');
        assert.equal(renderer.pixelUploads, uploads);
        renderer.blocked = true;
        sendPorscheSpeed(20);
        sendPorscheSpeed(0);
        sendPorscheRpm(850);
        renderer.blocked = false;
        renderer.emit('drain');
        now += 16;
        motion();
        assert.equal(renderer.transforms.get(speedometer.ref).rotate, 182);
        assert.equal(lowerDigits.value, '0');
        assert.equal(renderer.pixelUploads, uploads);
        settings.set('five_speedPosition', 'centre');
        settings.set('five_rightOuter', 'analogueSpeed');
        now += 50;
        interval();
        assert.equal(porsche.needles.layers.length, 3);
        assert.ok(renderer.transforms.get(porsche.digits.labels[0].ref).y < lowerPosition);
        const centreUploads = renderer.pixelUploads;
        now += 16;
        sendPorscheSpeed(47);
        sendPorscheRpm(1200);
        motion();
        assert.equal(porsche.digits.labels[0].value, '47');
        for (const entry of porsche.needles.layers.slice(1)) {
            assert.equal(renderer.transforms.get(entry.ref).rotate, 182 + 208 * 47 / 300);
        }
        assert.equal(renderer.pixelUploads, centreUploads);
        for (const slot of SLOTS) {
            const prior = { ...background.choices };
            select('slot:' + slot, 'five_' + slot, 'none');
            assert.equal(background.choices[slot], 'none');
            assert.deepEqual({ ...background.choices, [slot]: prior[slot] }, prior);
        }
        frame.targets.find((target) => target.key === 'theme:vdoRetro').run();
        assert.equal(renderer.images.size, 1);
        onVisible('MAIN', false);
        assert.equal(renderer.connected, true);
        renderer.emit('layer', 1, 'suspended', 'another layer');
        interval();
        assert.equal(renderer.args.contend, false);
        assert.equal(renderers.length, 1);
        renderer.emit('layer', 1, 'shown');
        renderer.blocked = true;
        now += 100;
        interval();
        now += 399;
        interval();
        assert.equal(renderer.connected, true);
        now += 1;
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
        settings.set('instrumentTheme', 'silver');
        assert.equal(restarted.client, null);
        assert.match(restarted.status(), /Waiting for live speed/);
        const sendZero = () => handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 0 });
        const mountSilver = () => {
            sendZero();
            interval();
            assert.equal(restarted.client, null);
            now += 400;
            sendZero();
            interval();
            assert.equal(restarted.client, null);
            now += 350;
            sendZero();
            interval();
            const current = restarted.client;
            assert.equal(current.connected, true);
            current.emit('ready');
            current.emit('layer', 1, 'shown');
            interval();
            return current;
        };
        const live = mountSilver();
        now += 800;
        interval();
        assert.equal(live.connected, true);
        now += 1500;
        interval();
        assert.equal(live.connected, false);
        assert.match(restarted.status(), /Waiting for live speed/);
        const remounted = mountSilver();
        const digitRef = [...remounted.effects.keys()][0];
        const renderedFrames = remounted.frames;
        remounted.emit('refused', 'layer', digitRef, 'simulated shader refusal');
        assert.equal(restarted.client, null);
        assert.match(restarted.status(), /Rolls Royce live rendering unavailable · simulated shader refusal/);
        now += 100;
        sendZero();
        interval();
        assert.equal(restarted.client, null);
        assert.equal(remounted.frames, renderedFrames);

        // The service keeps two copies of images and assets and shares its limit with other clients.
        const pixelLimit = 16 * 1024 * 1024;
        const memoryFull = "the service's pixel memory is full";
        function refusedAllocation(renderer, otherBytes) {
            const allocations = [...renderer.images].map(([ref, { iw, ih }]) => [ref, 'layer', iw * ih * 8])
                .concat([...renderer.assets].map(([ref, { w, h, format }]) => [ref, 'asset', w * h * (format === 'r8' ? 2 : 8)]))
                .sort(([first], [second]) => first - second);
            return allocations.find(([, , bytes]) => (otherBytes += bytes) > pixelLimit);
        }
        function reconnectSilver(ms) {
            now += ms;
            sendZero();
            interval();
            const renderer = restarted.client;
            assert.ok(renderer && renderer.connected);
            renderer.emit('ready');
            return renderer;
        }

        settings.set('silver_needleEffect', 'starlight');
        restarted.retryNativeMotion();
        const fullSize = restarted.client;
        fullSize.emit('ready');
        const [refusedRef, op] = refusedAllocation(fullSize, 4450000);
        assert.equal(op, 'asset');
        assert.ok(restarted.silverDigits.owns(refusedRef));
        fullSize.emit('refused', op, refusedRef, memoryFull);
        assert.equal(fullSize.connected, false);
        assert.equal(restarted.client, null);
        assert.match(restarted.status(), /reconnecting/);
        // Additional errors for the rejected asset can still arrive from the old socket.
        fullSize.emit('layer', refusedRef, 'error', memoryFull);
        const reduced = reconnectSilver(2000);
        assert.deepEqual([reduced.args.w, reduced.args.h, reduced.args.iw, reduced.args.ih], [1920, 720, 1440, 540]);
        assert.equal(reduced.args.sampling, 'bilinear');
        assert.equal(reduced.bytes, 1440 * 540 * 4);
        assert.equal(refusedAllocation(reduced, 1920 * 720 * 6), undefined);
        const gearAlpha = (x, y) => restarted.lastPixels.d[(y * 1440 + x) * 4 + 3];
        assert.equal(gearAlpha(1035, 487), 0);
        assert.equal(gearAlpha(1094, 539), 0);
        assert.equal(gearAlpha(1034, 487), 255);
        reduced.emit('layer', restarted.ref, 'shown');
        assert.equal(restarted.status(), 'Selected theme active');
        now += 50;
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 74 * 64 });
        handlers.get(cds).statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 2050 * 4 });
        motion();
        assert.equal(restarted.silverDigits.labels[0].value, '74');
        assert.equal(restarted.silverDigits.labels[1].value, '2050');
        assert.equal(reduced.transforms.get(restarted.silverNeedles.layers[0].ref).rotate, -136 + 74 / 260 * 272);
        now += 50;
        handlers.get(vehicle2).statusCarSpeed2({ speedVehicleCentreOfGravity: 82 * 64 });
        motion();
        assert.ok(restarted.silverStarlight.layers.some(({ ref }) => reduced.transforms.get(ref)?.visible));
        assert.equal(reduced.frames, 1);

        now += 50;
        handlers.get('de.bmw.infrastructure.VehicleInformation').statusGearboxDrive({ statusActualStageDrive: 'D' });
        interval();
        assert.equal(reduced.frames, 2);
        assert.ok(reduced.rects.every(({ x, y, w, h }) => x + w <= 1440 && y + h <= 540));

        // A busy shared renderer may also reject the smaller background on a later reconnect.
        const [backgroundRef] = refusedAllocation(reduced, 10700000);
        assert.equal(backgroundRef, restarted.ref);
        reduced.emit('layer', backgroundRef, 'error', memoryFull);
        assert.equal(reduced.connected, false);
        const smallest = reconnectSilver(2000);
        assert.deepEqual([smallest.args.w, smallest.args.h, smallest.args.iw, smallest.args.ih], [1920, 720, 960, 360]);
        assert.equal(smallest.bytes, 960 * 360 * 4);
        assert.equal(refusedAllocation(smallest, 10700000), undefined);
        smallest.emit('layer', restarted.ref, 'shown');
        assert.equal(restarted.status(), 'Selected theme active');

        const mapRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-full-map-test-'));
        const status = path.join(mapRoot, 'status.json');
        const map = new MapWindow(bgContext.log, { dir: mapRoot, status, now: () => now });
        restarted.map = map;
        try {
            frame.targets.find((target) => target.key === 'theme:wazeFull').run();
            assert.equal(restarted.theme, 'wazeFull');
            assert.ok(frame.words().length > 0);
            const renderer = restarted.client;
            renderer.emit('ready');
            assert.equal(renderer.images.size, 0);
            assert.match(restarted.status(), /map provider not running/);
            function wazeStatus(target, state) {
                now += 800;
                fs.writeFileSync(status, JSON.stringify({ target, state, cluster: 1 }));
                fs.utimesSync(status, new Date(now - 5), new Date(now - 5));
                interval();
            }
            wazeStatus('map', 'showing');
            assert.equal(renderer.images.size, 0);
            assert.match(restarted.status(), /map is in BMW view/);
            wazeStatus('panel', 'idle');
            assert.ok(fs.existsSync(map.file));
            assert.equal(renderer.images.size, 0);
            wazeStatus('panel', 'showing');
            assert.equal(renderer.images.size, 1);
            assert.equal(renderer.frames, 2);
            assert.deepEqual([...renderer.images.values()].map(({ iw, ih }) => [iw, ih]), [[1920, 720]]);
            const rgba = (x, y) => restarted.lastPixels.d.slice((y * PANEL_WIDTH + x) * 4, (y * PANEL_WIDTH + x) * 4 + 4);
            assert.deepEqual(Array.from(rgba(960, 360)), [0, 0, 0, 0]);
            assert.ok(rgba(192, 30)[3] > 0 && rgba(192, 703)[3] > 0);
            const lastRef = restarted.ref;
            renderer.emit('layer', lastRef, 'shown');
            wazeStatus('panel', 'frozen');
            assert.equal(renderer.images.size, 0);
            assert.equal(fs.existsSync(map.file), false);
            assert.match(restarted.status(), /BMW original active/);
            wazeStatus('map', 'showing');
            wazeStatus('panel', 'showing');
            assert.notEqual(restarted.ref, lastRef);
            assert.equal(renderer.frames, 3);
            settings.set('instrumentTheme', 'stock');
            assert.equal(fs.existsSync(map.file), false);
        } finally {
            map.release();
            fs.rmSync(mapRoot, { recursive: true, force: true });
        }
        app.emit('shutdown');
        assert.equal(restarted.client, null);
    } finally {
        process.emit('exit');
    }
});
