'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const app = '../apps/zekai_cluster_themes/';
const { Car, SAFETY_MAX_AGE_MS } = require(app + 'car');
const { Preview, MAX_RUN_MS } = require(app + 'preview');
const { MapWindow, rectangle } = require(app + 'map-window');
const { panel, DEMO, SLOTS, PALETTES } = require(app + 'dials');
const { TANK_LITRES } = require(app + 'silver-dials');
const { FONTS } = require(app + 'instrument-type');
const { Canvas } = require('../kit/runtime/canvas');
const { get: getFont } = require('../kit/runtime/fonts');
const { Recorder, play } = require('../kit/runtime/record');
const spec = require(app + 'app.json');

test('only fresh, unambiguous P and zero speed permit preview', () => {
    let now = 100;
    const car = new Car(() => now);
    assert.equal(car.parked(), false);
    car.put('speed', 0);
    assert.equal(car.parked(), false);
    car.put('stage', 'P');
    assert.equal(car.parked(), true);
    car.put('selection', 'other');
    assert.equal(car.parked(), false);
    car.put('selection', 'P');
    car.put('speed', 0.015625);
    assert.equal(car.parked(), false);
    car.put('speed', 0);
    assert.equal(car.parked(), true);
    now += SAFETY_MAX_AGE_MS + 1;
    assert.equal(car.parked(), false);
    car.put('speed', 0);
    assert.equal(car.parked(), false);
});

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
    pixels() { this.frames++; }
}

test('renderer session requires parking, stays clear of the bottom, and times out', () => {
    let now = 100;
    let parked = false;
    let current = null;
    const preview = new Preview({
        now: () => now, canRun: () => parked, createClient: () => { current = new FakeRender(); return current; },
        paint: () => Buffer.alloc(4), snapshot: () => ({ speed: 0 }), log: console,
    });
    try {
        preview.show('five', {});
        assert.equal(current, null);
        parked = true;
        preview.show('five', {});
        assert.equal(current.frames, 0);
        current.emit('ready');
        assert.equal(current.frames, 1);
        assert.equal(current.args.h, 640);
        parked = false;
        preview.check();
        assert.equal(current.connected, false);

        parked = true;
        preview.show('digital', {});
        current.emit('ready');
        current.emit('disconnected');
        assert.equal(preview.session, null);

        preview.show('five', {});
        current.emit('ready');
        now += MAX_RUN_MS;
        preview.tick();
        assert.equal(current.connected, false);
        assert.equal(preview.session, null);
    } finally {
        preview.stop();
    }
});

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
        report({ target: 'map', state: 'showing', cluster: 1 });
        assert.equal(lease.update(choices), null);
        const rect = rectangle('rightInner');
        assert.equal(fs.readFileSync(file, 'utf8'), 'panel ' + [rect.x, rect.y, rect.w, rect.h].join(' ') + '\n');
        now += 800;
        report({ target: 'panel', state: 'showing', cluster: 1 });
        assert.equal(lease.update(choices), 'rightInner');
        now += 800;
        report({ target: 'panel', state: 'frozen', cluster: 1 });
        assert.equal(lease.update(choices), null);
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
            labels.push([value, x, y, width]);
            return width;
        };
        for (const speedPosition of ['centre', 'lower']) {
            labels.length = 0;
            panel(canvas, 'five', { faceColour, speedPosition }, data, { clock: '10:53' });
            const [, speedX, speedY, speedWidth] = labels.find(([value]) => value === '126');
            const [, , rangeY] = labels.find(([value]) => value === '418 km');
            assert.ok(rangeY - speedY >= 26);
            if (speedPosition === 'lower') {
                const [, unitX, unitY, unitWidth] = labels.find(([value]) => value === 'km/h');
                assert.ok(speedY >= 205);
                assert.equal(unitY, speedY);
                assert.ok(Math.hypot(speedX - speedWidth / 2 - 480, speedY - 168) < 63);
                assert.ok(Math.hypot(unitX + unitWidth / 2 - 480, unitY - 168) < 63);
            } else {
                assert.equal(speedY, 178);
            }
        }
        const face = (257 * canvas.w + 480) * 4;
        colours.add(Buffer.from(canvas.d.subarray(face, face + 3)).toString('hex'));
    }
    assert.equal(colours.size, Object.keys(PALETTES).length);
});

test('Silver Trio draws demo, live and missing readings distinctly', () => {
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

test('packaged HMI entry renders settings, applies a parked preview and restores on page exit', async () => {
    const vm = require('node:vm');
    const artifact = path.resolve(__dirname, '../dist/zekai_cluster_themes/source/javascript');
    const entry = path.join(artifact, 'app.js');
    const packagedRequire = require('node:module').createRequire(entry);
    const source = fs.readFileSync(entry, 'utf8');
    const handlers = new Map();
    const click = new Map();
    const values = new Map(spec.settings.map((item) => [item.key, item.default]));
    const renderers = [];
    let visible = true;
    let frame = null;
    let afterSettings;
    let onVisible;
    const ctx = {
        log: { info() {}, warn() {} }, spec,
        ui: {
            isVisible: () => visible, hasFocus: () => true,
            onClick: (key, callback) => click.set(key, callback),
            onVisible: (callback) => { onVisible = callback; },
            onFocus() {},
            image: (name, record) => { assert.equal(name, 'MAIN_GFX'); frame = record; },
        },
        settings: {
            get: (key) => values.get(key),
            item: (key) => spec.settings.find((item) => item.key === key),
            set(key, value) { values.set(key, value); afterSettings(); },
            cycle(key) {
                const options = this.item(key).options.map(([id]) => id);
                this.set(key, options[(options.indexOf(this.get(key)) + 1) % options.length]);
            },
            onChange: (callback) => { afterSettings = callback; },
        },
        signals: { watch: async (name, instance, callbacks) => { handlers.set(name, callbacks); } },
        loop: (page, fps, render) => ({ kick: render }),
        onLayout() {},
        canvas: (width, height) => new Recorder(width, height),
    };
    const context = {
        Buffer, process: new EventEmitter(),
        require: (name) => {
            if (name === './kit/mgu') return { run: (app) => app.start(ctx) };
            if (name === './cluster_render_client') return { ClusterRender: class extends FakeRender {
                constructor() { super(); renderers.push(this); }
            } };
            return packagedRequire(name);
        },
    };
    vm.runInNewContext(source, context, { filename: entry });
    try {
        assert.equal(frame.targets.length, 10);
        frame.targets.find((target) => target.key === 'five_faceColour').run();
        frame.targets.find((target) => target.key === 'five_speedPosition').run();
        assert.equal(values.get('five_faceColour'), 'blue');
        assert.equal(values.get('five_speedPosition'), 'lower');
        assert.ok(click.has('BTN_SETTINGS'));
        click.get('BTN_APPLY')();
        assert.equal(renderers.length, 0);
        handlers.get('de.bmw.infotainment.vehicle.Vehicle2').statusCarSpeed2({ speedVehicleCentreOfGravity: 0 });
        handlers.get('de.bmw.infrastructure.VehicleInformation').statusGearboxDrive({ statusActualStageDrive: 'P' });
        click.get('BTN_APPLY')();
        assert.equal(renderers.length, 1);
        const renderer = renderers[0];
        renderer.emit('ready');
        assert.equal(renderer.frames, 1);
        assert.equal(renderer.connected, true);
        visible = false;
        onVisible('MAIN', false);
        assert.equal(renderer.connected, false);

        visible = true;
        onVisible('MAIN', true);
        frame.targets.find((target) => target.key === 'theme:digital').run();
        assert.equal(values.get('instrumentTheme'), 'digital');
        assert.equal(frame.targets.filter((target) => target.key.startsWith('slot:')).length, 4);
        assert.equal(frame.targets.some((target) => target.key === 'five_speedPosition'), false);
        frame.targets.find((target) => target.key === 'theme:five').run();
        assert.equal(values.get('five_speedPosition'), 'lower');

        frame.targets.find((target) => target.key === 'theme:silver').run();
        assert.equal(values.get('instrumentTheme'), 'silver');
        assert.equal(frame.targets.some((target) => target.key.startsWith('slot:')), false);
        handlers.get('de.bmw.infotainment.KombiIF').statusRangeTankStatus({ range: 307, fluidLevelFuelTank: 40 });
        click.get('BTN_APPLY')();
        assert.equal(renderers.length, 2);
        renderers[1].emit('ready');
        assert.equal(renderers[1].frames, 1);
        click.get('BTN_RESTORE')();
        assert.equal(renderers[1].connected, false);
    } finally {
        context.process.emit('exit');
    }
});
