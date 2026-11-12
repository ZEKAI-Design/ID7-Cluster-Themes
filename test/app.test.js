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
const { TANK_LITRES } = require(app + 'silver-dials');
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

test('Five Dial palettes change the actual face and lower speed stays separate from range', () => {
    const settings = Object.fromEntries(spec.settings.map(({ key, options }) => [key, options]));
    assert.deepEqual(settings.five_faceColour.map(([id]) => id), Object.keys(PALETTES));
    const data = Object.assign({}, DEMO, { speed: 126, rpm: 850, range: 418 });
    const colours = new Set();
    for (const faceColour of Object.keys(PALETTES)) {
        const canvas = new Canvas(960, 320);
        const labels = [];
        const drawText = canvas.text.bind(canvas);
        canvas.text = (value, x, y, ...args) => {
            const width = drawText(value, x, y, ...args);
            labels.push([value, x, y, width, args[0]]);
            return width;
        };
        for (const speedPosition of ['centre', 'lower']) {
            labels.length = 0;
            panel(canvas, 'five', { faceColour, speedPosition }, data, { clock: '10:53' });
            const [, speedX, speedY, speedWidth, speedSize] = labels.find(([value]) => value === '126');
            const [, unitX, unitY, unitWidth, unitSize] = labels.find(([value]) => value === 'km/h');
            const [, , rangeY] = labels.find(([value]) => value === '418 km');
            assert.equal(speedX, 480);
            assert.equal(unitX, speedX);
            assert.ok(unitY > speedY && unitSize < speedSize);
            assert.equal(rangeY, 259);
            assert.ok(rangeY - unitY >= 26);
            if (speedPosition === 'lower') {
                assert.ok(speedY >= 205);
                assert.ok(Math.hypot(speedWidth / 2, speedY - 168) < 63);
                assert.ok(Math.hypot(unitWidth / 2, unitY - 168) < 63);
            } else {
                assert.equal(speedY, 178);
            }
        }
        const face = (257 * canvas.w + 480) * 4;
        colours.add(Buffer.from(canvas.d.subarray(face, face + 3)).toString('hex'));
    }
    assert.equal(colours.size, Object.keys(PALETTES).length);
});

test('Five Dial range arc follows the live range and stays empty with no reading', () => {
    const canvas = new Canvas(960, 320);
    const drawArc = canvas.arc.bind(canvas);
    let filled;
    canvas.arc = (...args) => {
        if (args[6] === '#dce7ff') filled = args[5] - args[4];
        return drawArc(...args);
    };
    for (const [range, span] of [[undefined, 0], [0, 0], [200, 11.5], [600, 34.5], [900, 46]]) {
        filled = 0;
        panel(canvas, 'five', { fullRangeKm: '800' }, { range }, {});
        assert.equal(filled, span);
    }
});

test('Silver Trio draws its default and customized side dials independently', () => {
    const canvas = new Canvas(960, 320);
    const labels = [];
    const drawText = canvas.text.bind(canvas);
    canvas.text = (value, ...args) => {
        labels.push(value);
        return drawText(value, ...args);
    };
    const data = { speed: 0, rpm: 810, fuelLitres: TANK_LITRES / 2, range: 307, ambient: 14.5, stage: 'P' };
    panel(canvas, 'silver', {}, data, { demo: true, clock: '10:53' });
    assert.ok(labels.includes('520'));
    assert.ok(labels.includes('13:50'));
    const white = (138 * canvas.w + 511) * 4;
    assert.ok(canvas.d[white] > 200);
    labels.length = 0;
    panel(canvas, 'silver', {}, data, { clock: '10:53' });
    for (const label of ['810', '307', '14.5°C', 'P', '10:53']) assert.ok(labels.includes(label));
    assert.equal(labels.includes('520'), false);
    labels.length = 0;
    panel(canvas, 'silver', {}, {}, {});
    assert.ok(labels.includes('--') && labels.includes('--:--'));
    assert.equal(labels.includes('P'), false);
    labels.length = 0;
    const slots = { leftInner: 'tyres', rightInner: 'waze', fallback: 'temps' };
    const customData = Object.assign({}, DEMO, data);
    panel(canvas, 'silver', slots, customData, {});
    for (const label of ['bar', 'OIL', 'COOLANT', 'KM/H']) assert.ok(labels.includes(label));
    for (const label of ['810', 'RPM', '307', 'KM RANGE']) assert.ok(labels.includes(label));
    labels.length = 0;
    panel(canvas, 'silver', slots, customData, { mapSlot: 'rightInner' });
    assert.ok(labels.includes('bar') && !labels.includes('COOLANT'));
    for (const label of ['810', 'RPM', '307', 'KM RANGE']) assert.ok(labels.includes(label));
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
        rightOuter: 'oil', fallback: 'g', faceColour: 'red', speedPosition: 'lower',
    };
    for (const theme of ['five', 'silver', 'digital']) {
        used.clear();
        panel(canvas, theme, slots, DEMO, { demo: true });
        assert.ok(used.has(FONTS.bold) && used.has(FONTS.regular));
    }
    const digits = getFont(FONTS.bold, 62, '0123456789').glyphs;
    assert.equal(new Set('0123456789'.split('').map((digit) => digits[digit.charCodeAt(0)][6])).size, 1);
});

test('packaged theme starts without the UI, fills the panel and remembers manual shutdown', () => {
    const vm = require('node:vm');
    const artifact = path.resolve(__dirname, '../dist/zekai_cluster_themes/source/javascript');
    const entry = path.join(artifact, 'app.js');
    const packagedRequire = require('node:module').createRequire(entry);
    const spec = packagedRequire('./kit/app-spec.json');
    assert.equal(packagedRequire('../package.json').mguAppStartType, 'autostart');
    const handlers = new Map();
    const click = new Map();
    const values = new Map(spec.settings.map((item) => [item.key, item.default]));
    values.set('instrumentTheme', 'vdoRetro');
    const listeners = [];
    const renderers = [];
    const process = new EventEmitter();
    const app = new EventEmitter();
    let now = Date.now();
    class TestDate extends Date { static now() { return now; } }
    let frame, onVisible, interval, impl, background;
    const settings = {
        get: (key) => values.get(key),
        item: (key) => spec.settings.find((item) => item.key === key),
        set(key, value) { values.set(key, value); listeners.forEach((fn) => fn()); },
        cycle(key) {
            const options = this.item(key).options.map(([value]) => value);
            this.set(key, options[(options.indexOf(this.get(key)) + 1) % options.length]);
        },
        onChange(fn) { listeners.push(fn); },
    };
    const bgContext = {
        spec, app, settings, log: { warn() {} },
        signals: { watch: async (name, instance, fields) => { handlers.set(name, fields); } },
    };
    const renderStub = { ClusterRender: class extends FakeRender {
        constructor() { super(); renderers.push(this); }
    } };
    const serviceModule = { exports: {} };
    const servicePath = path.join(artifact, 'cluster-service.js');
    vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), {
        module: serviceModule, Buffer, process, Date: TestDate,
        setInterval(fn) { interval = fn; return fn; },
        clearInterval(fn) { if (interval === fn) interval = null; },
        require(name) { return name === './cluster_render_client' ? renderStub : packagedRequire(name); },
    }, { filename: servicePath });
    vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
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
        assert.equal(renderer.frames, 1);
        assert.equal(renderer.rects, null);
        assert.equal(renderer.bytes, 1920 * 720 * 4);
        handlers.get('de.bmw.infotainment.vehicle.Vehicle2').statusCarSpeed2({ speedVehicleCentreOfGravity: 68 * 64 });
        handlers.get('de.bmw.infrastructure.VehicleInformation').statusGearboxDrive({ statusActualStageDrive: 'D' });
        interval();
        assert.equal(renderer.frames, 2);
        assert.ok(renderer.rects.length > 0 && renderer.rects.length <= 15);
        assert.equal(renderer.bytes, renderer.rects.reduce((bytes, rect) => bytes + rect.w * rect.h * 4, 0));
        assert.ok(renderer.bytes < 1920 * 720 * 4);
        impl.start({
            settings, background,
            ui: {
                onClick: (key, fn) => click.set(key, fn),
                onVisible: (fn) => { onVisible = fn; },
                image: (name, record) => { assert.equal(name, 'MAIN_GFX'); frame = record; },
            },
            loop: (page, fps, render) => ({ kick: render }),
            onLayout() {},
            canvas: (width, height) => new Recorder(width, height),
        });
        assert.ok(frame.targets.some((target) => target.key === 'theme:vdoRetro'));
        frame.targets.find((target) => target.key === 'theme:silver').run();
        assert.equal(background.choices.leftInner, 'rpm');
        assert.equal(background.choices.rightInner, 'fuelRange');
        frame.targets.find((target) => target.key === 'slot:rightInner').run();
        assert.equal(background.choices.rightInner, 'media');
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
