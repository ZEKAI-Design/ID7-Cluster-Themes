'use strict';

const mgu = require('./kit/mgu');
const { Canvas } = require('./kit/canvas');
const { ClusterService } = require('./cluster-service');
const { panel, SLOTS, SILVER_SLOTS, NAMES, DEMO, PALETTES } = require('./dials');
const { wazeFullPanel } = require('./waze-full-screen');
const { vdoPanel } = require('./vdo-retro');
const { PANEL_WIDTH, PANEL_HEIGHT, panelLayout } = require('./panel-layout');

const THEMES = [['stock', 'BMW original'], ['five', 'Five Dial'], ['silver', 'Silver Trio'], ['digital', 'Digital'], ['wazeFull', 'Waze Full Map'], ['vdoRetro', 'VDO Retro 2000']];
const SLOT_LABELS = ['Left outer', 'Left inner', 'Right inner', 'Right outer'];

mgu.run({
    background(context) {
        return new ClusterService(context);
    },
    start(ctx) {
        const { ui, settings, background } = ctx;

        function choice(key) {
            const item = settings.item(key);
            const value = settings.get(key);
            return item.options.some(([id]) => id === value) ? value : item.default;
        }

        function selections(theme) {
            if (theme === 'stock' || theme === 'vdoRetro') return {};
            if (theme === 'wazeFull') return { mapMode: 'full' };
            const slots = {};
            const keys = theme === 'silver' ? SILVER_SLOTS : SLOTS;
            for (const key of keys.concat('fallback')) slots[key] = choice(theme + '_' + key);
            if (theme === 'five') {
                slots.faceColour = choice('five_faceColour');
                slots.speedPosition = choice('five_speedPosition');
                slots.fullRangeKm = choice('five_fullRangeKm');
            }
            return slots;
        }

        function apply() { settings.set('clusterOverlayEnabled', true); }
        function restore() { settings.set('clusterOverlayEnabled', false); }

        const loop = ctx.loop('MAIN', 3, render);
        let last = '';
        function render() {
            const theme = choice('instrumentTheme');
            const slots = selections(theme);
            const status = background ? background.status() : 'Background cluster service unavailable';
            const signature = JSON.stringify([theme, slots, status]);
            if (signature === last) return;
            last = signature;
            const cv = ctx.canvas(1600, 520);
            const label = (str, x, y, size, color = '#e9f1ff') => cv.text(str, x, y, size, color, { literal: true });
            cv.fillRect(0, 0, 1600, 520, '#0b1018');
            cv.roundRect(16, 18, 304, 478, 16, '#161f2e');
            label('THEMES', 40, 61, 24, '#a9ccf1');
            THEMES.forEach(([id, title], i) => {
                const y = 81 + i * 35;
                cv.roundRect(38, y, 260, 31, 7, id === theme ? '#2a4562' : '#202b3a');
                label(title, 57, y + 22, 18);
                cv.target(38, y, 260, 31, () => settings.set('instrumentTheme', id), 'theme:' + id, 9);
            });
            if (theme === 'five') {
                const appearance = [
                    ['five_faceColour', 'FACE COLOUR', slots.faceColour],
                    ['five_speedPosition', 'DIGITAL SPEED', slots.speedPosition],
                ];
                appearance.forEach(([key, title, value], i) => {
                    const y = 306 + i * 58;
                    const labelText = settings.item(key).options.find(([id]) => id === value)[1];
                    cv.roundRect(38, y, 260, 52, 9, '#202b3a');
                    label(title, 52, y + 19, 14, '#b4c2d6');
                    label(labelText, 52, y + 44, 23);
                    if (key === 'five_faceColour') cv.circle(274, y + 28, 9, PALETTES[value].ring);
                    cv.target(38, y, 260, 52, () => settings.cycle(key), key, 9);
                });
            }
            label('G05 / iDrive 7', 40, 445, 24);
            label('Auto-start • persistent display', 40, 473, 17, '#adbcd2');

            cv.roundRect(338, 18, 1245, 478, 16, '#161f2e');
            label('Instrument preview', 362, 58, 26);
            label('SIMULATED DATA', 1351, 58, 18, '#a9ccf1');
            cv.roundRect(359, 77, 1202, 298, 11, '#030507');
            if (theme === 'wazeFull') {
                wazeFullPanel(cv, Object.assign({}, DEMO, { speed: 84, rpm: 2100, coolant: 91, oil: 98, stage: 'D', clock: '10:53' }), {
                    demo: true, x: 359, y: 77, w: 1202, h: 298,
                });
            } else if (theme === 'vdoRetro') {
                vdoPanel(cv, Object.assign({}, DEMO, {
                    speed: 68, rpm: 1850, coolant: 91, oil: 98, ambient: 15,
                    economyMpgUs: 29.4, odometerKm: 152112, tripKm: 6.8, fuelLitres: 41,
                }), { demo: true, x: 514, y: 78, scale: 0.92 });
            } else if (theme === 'silver') {
                const layout = panelLayout(theme);
                const fit = 298 / PANEL_HEIGHT;
                panel(cv, theme, slots, DEMO, {
                    demo: true, background: false, clock: '10:53',
                    x: 960 - PANEL_WIDTH * fit / 2 + layout.x * fit,
                    y: 77 + layout.y * fit,
                    scale: layout.scale * fit,
                });
            } else {
                panel(cv, theme, slots, DEMO, { demo: true, x: 514, y: 78, scale: 0.92, clock: '10:53' });
            }
            const readouts = theme === 'vdoRetro' ? [['Speed', 'MPH + km/h dual scale'], ['Engine', 'RPM / fuel / coolant'], ['Trip', 'Odometer / trip / AVG MPG']]
                : theme === 'wazeFull' ? [['Map', 'Full instrument display'], ['Top', 'Speed + time + gear'], ['Bottom', 'Range + RPM + temperatures']]
                : theme === 'silver' ? [
                    ['Left dial', NAMES[slots.leftInner], 'leftInner'],
                    ['Centre dial', 'Vehicle speed'],
                    ['Right dial', NAMES[slots.rightInner], 'rightInner'],
                ]
                : SLOTS.map((key, i) => [SLOT_LABELS[i], NAMES[slots[key]] || 'BMW original', key]);
            const column = Math.floor(1212 / readouts.length);
            readouts.forEach(([title, value, key], i) => {
                const x = 359 + i * column;
                cv.roundRect(x, 387, column - 11, 62, 9, '#223045');
                label(title, x + 13, 407, 17, '#b4c2d6');
                label(value, x + 13, 435, 23);
                if (!['stock', 'wazeFull', 'vdoRetro'].includes(theme) && key) {
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

        if (background && background.on) background.on('status', refresh);
        settings.onChange(refresh);
        ctx.onLayout(refresh);
        ui.onVisible((name, visible) => {
            if (name !== 'MAIN') return;
            refresh();
        });
        ui.onClick('BTN_APPLY', apply);
        ui.onClick('BTN_RESTORE', restore);
        refresh();
    },
});
