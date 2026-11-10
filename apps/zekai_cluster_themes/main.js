'use strict';

const mgu = require('./kit/mgu');
const { Canvas } = require('./kit/canvas');
const { ClusterRender } = require('./cluster_render_client');
const { Car } = require('./car');
const { Preview } = require('./preview');
const { MapWindow, rectangle } = require('./map-window');
const { panel, SLOTS, NAMES, DEMO, PALETTES } = require('./dials');

const THEMES = [['stock', 'BMW original'], ['five', 'Five Dial'], ['silver', 'Silver Trio'], ['digital', 'Digital']];
const SLOT_LABELS = ['Left outer', 'Left inner', 'Right inner', 'Right outer'];
const SILVER_READOUTS = [['Left dial', 'Engine RPM'], ['Centre dial', 'Vehicle speed'], ['Right dial', 'Fuel & range']];

function localTime() {
    return new Date().toTimeString().slice(0, 5);
}

mgu.run({
    start(ctx) {
        const { ui, settings, log } = ctx;
        const canRun = () => ui.isVisible('MAIN') && ui.hasFocus('MAIN') && car.parked();
        const car = new Car(Date.now, () => preview.check());
        const map = new MapWindow(log);
        const preview = new Preview({
            now: Date.now, canRun, log, map,
            snapshot: () => Object.assign(car.snapshot(), { clock: localTime() }),
            createClient: () => new ClusterRender(ctx.spec.id),
            paint(theme, choices, data) {
                const cv = new Canvas(960, 320);
                panel(cv, theme, choices, data, { clock: data.clock, mapSlot: data.mapSlot });
                if (data.mapSlot) {
                    const rect = rectangle(data.mapSlot);
                    const left = Math.floor(rect.x / 2);
                    const right = Math.ceil((rect.x + rect.w) / 2);
                    for (let y = Math.floor(rect.y / 2); y < Math.ceil((rect.y + rect.h) / 2); y++) {
                        cv.d.fill(0, (y * cv.w + left) * 4, (y * cv.w + right) * 4);
                    }
                }
                return Buffer.from(cv.d.buffer);
            },
        });

        function choice(key) {
            const item = settings.item(key);
            const value = settings.get(key);
            return item.options.some(([id]) => id === value) ? value : item.default;
        }

        function selections(theme) {
            if (theme === 'stock' || theme === 'silver') return {};
            const slots = {};
            for (const key of SLOTS.concat('fallback')) slots[key] = choice(theme + '_' + key);
            if (theme === 'five') {
                slots.faceColour = choice('five_faceColour');
                slots.speedPosition = choice('five_speedPosition');
            }
            return slots;
        }

        function apply() {
            const theme = choice('instrumentTheme');
            preview.show(theme, selections(theme));
        }

        const loop = ctx.loop('MAIN', 3, render);
        let last = '';
        function render() {
            const theme = choice('instrumentTheme');
            const slots = selections(theme);
            const status = preview.status;
            const signature = JSON.stringify([theme, slots, status]);
            if (signature === last) return;
            last = signature;
            const cv = ctx.canvas(1600, 520);
            const label = (str, x, y, size, color = '#e9f1ff') => cv.text(str, x, y, size, color, { literal: true });
            cv.fillRect(0, 0, 1600, 520, '#0b1018');
            cv.roundRect(16, 18, 304, 478, 16, '#161f2e');
            label('THEMES', 40, 61, 24, '#a9ccf1');
            THEMES.forEach(([id, title], i) => {
                const y = 83 + i * 53;
                cv.roundRect(38, y, 260, 45, 9, id === theme ? '#2a4562' : '#202b3a');
                label(title, 57, y + 30, 23);
                cv.target(38, y, 260, 45, () => settings.set('instrumentTheme', id), 'theme:' + id, 9);
            });
            if (theme === 'five') {
                const appearance = [
                    ['five_faceColour', 'FACE COLOUR', slots.faceColour],
                    ['five_speedPosition', 'DIGITAL SPEED', slots.speedPosition],
                ];
                appearance.forEach(([key, title, value], i) => {
                    const y = 301 + i * 62;
                    const labelText = settings.item(key).options.find(([id]) => id === value)[1];
                    cv.roundRect(38, y, 260, 55, 9, '#202b3a');
                    label(title, 52, y + 19, 14, '#b4c2d6');
                    label(labelText, 52, y + 44, 23);
                    if (key === 'five_faceColour') cv.circle(274, y + 28, 9, PALETTES[value].ring);
                    cv.target(38, y, 260, 55, () => settings.cycle(key), key, 9);
                });
            }
            label('G05 / iDrive 7', 40, 445, 24);
            label('12-second parked preview', 40, 473, 19, '#adbcd2');

            cv.roundRect(338, 18, 1245, 478, 16, '#161f2e');
            label('Instrument preview', 362, 58, 26);
            label('SIMULATED DATA', 1351, 58, 18, '#a9ccf1');
            cv.roundRect(359, 77, 1202, 298, 11, '#030507');
            panel(cv, theme, slots, DEMO, { demo: true, x: 514, y: 78, scale: 0.92, clock: '10:53' });
            const readouts = theme === 'silver' ? SILVER_READOUTS
                : SLOTS.map((key, i) => [SLOT_LABELS[i], NAMES[slots[key]] || 'BMW original', key]);
            const column = Math.floor(1212 / readouts.length);
            readouts.forEach(([title, value, key], i) => {
                const x = 359 + i * column;
                cv.roundRect(x, 387, column - 11, 62, 9, '#223045');
                label(title, x + 13, 407, 17, '#b4c2d6');
                label(value, x + 13, 435, 23);
                if (theme !== 'stock' && key) {
                    cv.target(x, 387, column - 11, 62, () => settings.cycle(theme + '_' + key), 'slot:' + key, 9);
                }
            });
            label(status, 361, 480, 22, '#a9ccf1');
            return ui.image('MAIN_GFX', cv);
        }

        function refresh() {
            last = '';
            loop.kick();
        }

        preview.on('status', refresh);
        settings.onChange(() => { preview.stop(); refresh(); });
        ctx.onLayout(refresh);
        ui.onVisible((name, visible) => {
            if (name !== 'MAIN') return;
            if (!visible) preview.stop();
            refresh();
        });
        ui.onFocus((name, focused) => { if (name === 'MAIN' && !focused) preview.stop(); });
        ui.onClick('BTN_SETTINGS', () => preview.stop());
        ui.onClick('BTN_APPLY', apply);
        ui.onClick('BTN_RESTORE', () => preview.stop());
        process.on('exit', () => preview.stop());
        car.watch(ctx);
        refresh();
    },
});
