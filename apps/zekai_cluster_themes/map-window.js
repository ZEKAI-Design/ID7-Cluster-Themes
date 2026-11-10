'use strict';

const fs = require('fs');
const path = require('path');

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
        this.nextPoll = 0;
        this.active = null;
        this.warned = false;
    }

    update(choices) {
        const side = Object.keys(MAP_SLOT).find((slot) => choices[slot] === 'waze');
        if (!side) { this.release(); return null; }
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
            if (this.fd === null) this.claim(side);
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

    claim(side) {
        try {
            fs.mkdirSync(this.dir, 0o1777);
            fs.chmodSync(this.dir, 0o1777);
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
        if (!fs.lstatSync(this.dir).isDirectory()) throw new Error('Waze handoff directory is unavailable');
        this.fd = fs.openSync(this.file, 'wx', 0o644);
        const rect = rectangle(side);
        fs.writeFileSync(this.fd, 'panel ' + [rect.x, rect.y, rect.w, rect.h].join(' ') + '\n');
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
        return null;
    }
}

function rectangle(side) {
    // The overlay uses a half-resolution texture; the Waze window uses panel pixels.
    return { x: MAP_SLOT[side] * 2 - 120, y: 275, w: 240, h: 106 };
}

module.exports = { MapWindow, rectangle };
