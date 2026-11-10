'use strict';

const { EventEmitter } = require('events');
const MAX_RUN_MS = 12000;

class Preview extends EventEmitter {
    constructor(opts) {
        super();
        this.opts = opts;
        this.session = null;
        this.status = 'BMW original active';
    }

    show(theme, choices) {
        if (theme === 'stock') return this.stop('BMW original active');
        if (this.session) this.stop();
        if (!this.opts.canRun()) return this.stop('Waiting for confirmed P and zero speed');
        const client = this.opts.createClient();
        const session = { client, theme, choices, end: this.opts.now() + MAX_RUN_MS, ready: false };
        this.session = session;
        this.report('Connecting to cluster renderer');
        const current = () => this.session === session;
        const fault = (reason) => { if (current()) this.stop(reason); };
        client.on('ready', () => {
            if (!current() || session.ready || !this.check()) return;
            if (client.backend !== 'id7' || !String(client.targets).split(',').includes('panel:1920x720')) {
                return fault('Unsupported instrument display');
            }
            session.ready = true;
            session.ref = client.image({
                target: 'panel', klass: 'overlay', x: 0, y: 0, w: 1920, h: 640,
                iw: 960, ih: 320, sampling: 'bilinear', contend: false, fps: 2,
            });
            this.tick();
        });
        client.on('layer', (ref, state) => {
            if (!current() || ref !== session.ref) return;
            if (state === 'shown') {
                session.shown = true;
                this.report('Parked preview active');
            }
            if (['error', 'suspended', 'hidden'].includes(state)) fault('Renderer released the panel; BMW original active');
        });
        client.on('refused', () => fault('Renderer refused the theme; BMW original active'));
        client.on('disconnected', () => fault('Renderer disconnected; BMW original active'));
        client.connect();
        session.timer = setInterval(() => { if (current()) this.tick(); }, 125);
    }

    check() {
        const session = this.session;
        if (!session) return false;
        if (!this.opts.canRun()) {
            this.stop('Parking signal lost; BMW original active');
            return false;
        }
        const remaining = session.end - this.opts.now();
        if (remaining <= 0 || remaining > MAX_RUN_MS) {
            this.stop('Preview ended; BMW original active');
            return false;
        }
        if (!session.ready && remaining < MAX_RUN_MS - 3000) {
            this.stop('Cluster renderer unavailable; BMW original active');
            return false;
        }
        return true;
    }

    tick() {
        if (!this.check()) return;
        const session = this.session;
        if (!session.ready || (session.nextDraw && this.opts.now() < session.nextDraw)) return;
        session.nextDraw = this.opts.now() + 500;
        try {
            const data = this.opts.snapshot();
            data.mapSlot = session.shown && this.opts.map ? this.opts.map.update(session.choices) : null;
            const key = JSON.stringify(data);
            if (key === session.lastData) return;
            const frame = this.opts.paint(session.theme, session.choices, data);
            if (!this.check()) return;
            session.client.pixels(session.ref, null, frame);
            session.lastData = key;
        } catch (error) {
            this.stop('Preview drawing failed; BMW original active');
            this.opts.log.warn(error.message);
        }
    }

    stop(reason = 'BMW original active') {
        const session = this.session;
        this.session = null;
        if (session) {
            clearInterval(session.timer);
            session.client.close();
        }
        if (this.opts.map) this.opts.map.release();
        this.report(reason);
    }

    report(status) {
        if (status === this.status) return;
        this.status = status;
        this.emit('status', status);
    }
}

module.exports = { Preview, MAX_RUN_MS };
