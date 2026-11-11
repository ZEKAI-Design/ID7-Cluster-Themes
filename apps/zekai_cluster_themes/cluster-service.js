'use strict';

const { EventEmitter } = require('events');
const { ClusterRender } = require('./cluster_render_client');
const { Car } = require('./car');
const { MapWindow } = require('./map-window');
const { SLOTS, SILVER_SLOTS } = require('./dials');
const { PANEL_WIDTH, PANEL_HEIGHT } = require('./panel-layout');
const { renderPanelFrame, sendPanelFrame } = require('./panel-frame');

function localTime() {
    return new Date().toTimeString().slice(0, 5);
}

class ClusterService extends EventEmitter {
    constructor(context) {
        super();
        this.context = context;
        this.settings = context.settings;
        this.log = context.log;
        this.client = null;
        this.ref = null;
        this.connected = false;
        this.timer = null;
        this.lastFrame = null;
        this.lastPixels = null;
        this.message = 'Starting cluster theme service';
        this.theme = 'stock';
        this.choices = {};
        this.car = new Car();
        this.map = new MapWindow(this.log);
        this.car.watch(context);
        this.settings.onChange(() => this.configure());
        if (context.app && context.app.on) context.app.on('shutdown', () => this.destroy());
        process.on('exit', () => this.destroy());
        this.configure();
    }

    status() { return this.message; }

    report(message) {
        if (message === this.message) return;
        this.message = message;
        this.emit('status', message);
    }

    choice(key) {
        const item = this.settings.item(key);
        const value = this.settings.get(key);
        return item && item.options && item.options.some(([id]) => id === value) ? value : item.default;
    }

    selections(theme) {
        if (theme === 'stock' || theme === 'vdoRetro') return {};
        if (theme === 'wazeFull') return { mapMode: 'full' };
        const slots = {};
        const keys = theme === 'silver' ? SILVER_SLOTS : SLOTS;
        for (const key of keys.concat('fallback')) slots[key] = this.choice(theme + '_' + key);
        if (theme === 'five') {
            slots.faceColour = this.choice('five_faceColour');
            slots.speedPosition = this.choice('five_speedPosition');
        }
        return slots;
    }

    configure() {
        const theme = this.choice('instrumentTheme');
        const enabled = this.settings.get('clusterOverlayEnabled') !== false && theme !== 'stock';
        if (!enabled) {
            this.theme = 'stock';
            this.stop();
            return;
        }
        this.theme = theme;
        this.choices = this.selections(theme);
        this.lastFrame = null;
        if (!this.client) this.connect();
        else this.draw();
    }

    connect() {
        this.report('Connecting to the instrument panel');
        const client = new ClusterRender(this.context.spec.id);
        this.client = client;
        const current = () => this.client === client;
        client.on('ready', () => {
            if (!current()) return;
            if (client.backend !== 'id7' || !String(client.targets).split(',').includes('panel:' + PANEL_WIDTH + 'x' + PANEL_HEIGHT)) {
                this.report('This renderer does not expose the full ID7 panel');
                this.stop();
                return;
            }
            this.connected = true;
            if (!this.ref) {
                this.ref = client.image({
                    target: 'panel', klass: 'overlay', x: 0, y: 0, w: PANEL_WIDTH, h: PANEL_HEIGHT,
                    iw: PANEL_WIDTH, ih: PANEL_HEIGHT, sampling: 'nearest', contend: false, fps: 2,
                });
            }
            this.lastFrame = null;
            this.lastPixels = null;
            this.draw();
        });
        client.on('disconnected', () => {
            if (!current()) return;
            this.connected = false;
            this.lastFrame = null;
            this.map.release();
            this.report('Renderer reconnecting; selected theme will resume');
        });
        client.on('layer', (ref, state) => {
            if (!current() || ref !== this.ref) return;
            if (state === 'shown') this.report('Selected theme active until BMW original is chosen');
            else if (state === 'suspended') this.report('Theme suspended by another cluster layer');
            else if (state === 'error') this.report('Renderer reported a cluster layer error');
        });
        client.on('refused', () => { if (current()) this.report('Renderer refused the cluster theme'); });
        client.connect();
        this.timer = setInterval(() => this.draw(), 500);
    }

    draw() {
        if (!this.client || !this.connected || !this.ref || this.theme === 'stock') return;
        try {
            const data = this.car.snapshot();
            data.clock = localTime();
            data.mapSlot = this.map.update(this.choices, this.theme);
            const signature = JSON.stringify([this.theme, this.choices, data]);
            if (signature === this.lastFrame) return;

            const frame = renderPanelFrame(this.theme, this.choices, data);
            if (!sendPanelFrame(this.client, this.ref, frame, this.lastPixels)) return;
            this.lastPixels = frame;
            this.lastFrame = signature;
        } catch (error) {
            this.log.warn('cluster theme draw: ' + (error && error.message || error));
            this.report('Theme drawing stopped; select Enable selected theme to retry');
            this.stop();
        }
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        const client = this.client;
        this.client = null;
        this.ref = null;
        this.connected = false;
        this.lastFrame = null;
        this.lastPixels = null;
        this.map.release();
        if (client) client.close();
        this.report('BMW original active');
    }

    destroy() {
        this.stop();
    }
}

module.exports = { ClusterService };
