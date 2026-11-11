'use strict';

const fs = require('fs');
const path = require('path');
const { PANEL_WIDTH, PANEL_HEIGHT, panelLayout, SILVER_SIDE_DIALS, SILVER_SIDE_Y } = require('./panel-layout');

const STATUS_AGE_MS = 2500;
const REFRESH_MS = 750;
const MAP_SLOT = { leftInner: 306, rightInner: 654 };

class MapWindow {
    constructor(log, options = {}) {
        this.log = log;
        this.dir = options.dir || '/dev/shm/cluster-info';
        this.status = options.status || '/run/waze-on-cluster/status.json';
        this.now = options.now || Date.now;
        this.file = path.join(this.dir, 'map_window.txt');
        this.fd = null;
        this.leaseKey = null;
        this.nextPoll = 0;
        this.active = null;
        this.warned = false;
    }

    update(choices, theme) {
        const side = choices.mapMode === 'full'
            ? 'fullMap'
            : Object.keys(MAP_SLOT).find((slot) => choices[slot] === 'waze');
        if (!side) { this.release(); return null; }
        const rect = rectangle(side, theme);
        const leaseKey = [rect.x, rect.y, rect.w, rect.h].join(' ');
        if (this.fd !== null && this.leaseKey !== leaseKey) this.release();
        const now = this.now();
        if (now < this.nextPoll) return this.active;
        this.nextPoll = now + REFRESH_MS;
        this.active = null;
        try {
            const st = fs.statSync(this.status);
            const age = now - st.mtimeMs;
            if (age < 0 || age > STATUS_AGE_MS || !st.isFile() || st.size > 8192) return this.release();
            const state = JSON.parse(fs.readFileSync(this.status, 'utf8'));
            const changingTarget = this.fd !== null && state.target === 'panel' && state.state === 'starting';
            if ((state.state !== 'showing' && !changingTarget) || state.cluster === 0 || state.paused) return this.release();
            if (this.fd === null && state.target !== 'map') return null;
            if (this.fd === null) this.claim(leaseKey);
            if (!this.owns()) { this.release(); return null; }
            const stamp = new Date(now);
            fs.futimesSync(this.fd, stamp, stamp);
            if (state.target === 'panel' && state.state === 'showing') this.active = side;
        } catch (error) {
            this.release();
            if (!this.warned && error.code !== 'ENOENT' && error.code !== 'EEXIST') {
                this.warned = true;
                this.log.warn('Waze window unavailable: ' + error.message);
            }
        }
        return this.active;
    }

    claim(leaseKey) {
        try {
            fs.mkdirSync(this.dir, 0o1777);
            fs.chmodSync(this.dir, 0o1777);
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
        if (!fs.lstatSync(this.dir).isDirectory()) throw new Error('Waze handoff directory is unavailable');
        this.fd = fs.openSync(this.file, 'wx', 0o644);
        fs.writeFileSync(this.fd, 'panel ' + leaseKey + '\n');
        this.leaseKey = leaseKey;
    }

    owns() {
        if (this.fd === null) return false;
        try {
            const file = fs.lstatSync(this.file);
            const own = fs.fstatSync(this.fd);
            return file.isFile() && file.dev === own.dev && file.ino === own.ino;
        } catch (error) { return false; }
    }

    release() {
        this.active = null;
        if (this.fd === null) return null;
        try { if (this.owns()) fs.unlinkSync(this.file); } catch (error) { this.log.warn(error.message); }
        try { fs.closeSync(this.fd); } catch (error) { this.log.warn(error.message); }
        this.fd = null;
        this.leaseKey = null;
        this.nextPoll = 0;
        return null;
    }
}

function rectangle(side, theme) {
    if (side === 'fullMap') return { x: 0, y: 0, w: PANEL_WIDTH, h: PANEL_HEIGHT };
    const layout = panelLayout(theme);
    const cx = theme === 'silver' ? SILVER_SIDE_DIALS[side] : MAP_SLOT[side];
    const top = theme === 'silver' ? SILVER_SIDE_Y - 26.5 : 137.5;
    const x = Math.round(layout.x + (cx - 60) * layout.scale);
    const y = Math.round(layout.y + top * layout.scale);
    return { x, y, w: Math.round(120 * layout.scale), h: Math.round(53 * layout.scale) };
}

module.exports = { MapWindow, rectangle };
