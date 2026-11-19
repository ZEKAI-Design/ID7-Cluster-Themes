'use strict';

const NORMAL_PERIOD_MS = 640;
const FAST_PERIOD_MS = 320;
const CLUSTER_DIRECTIONS = {
    0: 'off', BEIDE_BLINKER_AUS: 'off',
    1: 'left', BLINKER_LINKS_EIN: 'left',
    2: 'right', BLINKER_RECHTS_EIN: 'right',
    3: 'both', BEIDE_BLINKER_EIN: 'both',
};
const STALK_DIRECTIONS = {
    1: 'left', 3: 'left', TIPP_BLINKEN_LINKS_EIN: 'left', DAUER_BLINKEN_LINKS_EIN: 'left',
    2: 'right', 4: 'right', TIPP_BLINKEN_RECHTS_EIN: 'right', DAUER_BLINKEN_RECHTS_EIN: 'right',
    8: 'both', BEIDSEITIGES_BLINKEN_EIN: 'both',
};
const ACTIVE_DIRECTIONS = {
    7: 'left', 9: 'left', DAUERBLINKEN_LINKS: 'left', TIPPBLINKEN_LINKS: 'left',
    8: 'right', 10: 'right', DAUERBLINKEN_RECHTS: 'right', TIPPBLINKEN_RECHTS: 'right',
    6: 'both', WARNBLINKEN_MANUELL: 'both',
};

function fields(value, key) {
    if (!value || typeof value !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(value, key)) return value;
    for (const nested of Object.values(value)) {
        const found = fields(nested, key);
        if (found) return found;
    }
    return null;
}

function knownDirection(table, value) {
    return Object.prototype.hasOwnProperty.call(table, value) ? table[value] : null;
}

class TurnIndicator {
    constructor(now) {
        this.now = now;
        this.reset();
    }

    reset() {
        this.hasInstrumentStatus = false;
        this.sync = null;
        this.direction = 'off';
        this.period = NORMAL_PERIOD_MS;
        this.startedAt = 0;
    }

    set(direction, period, restart = false) {
        if (restart || direction !== this.direction || period !== this.period) this.startedAt = this.now();
        this.direction = direction;
        this.period = period;
    }

    instrumentStatus(value) {
        const status = fields(value, 'statusIndicateDirection');
        if (!status) return;
        const direction = knownDirection(CLUSTER_DIRECTIONS, status.statusIndicateDirection);
        if (!direction) return this.reset();

        this.hasInstrumentStatus = true;
        const { frequencyIndicateDirection: cadence, statusIndicateDirectionInstrumentPack: lamp,
            statusIndicateDirectionStop: sync } = status;
        const suppressed = lamp === 1 || lamp === 'BLINKERKONTROLL_MINUS_LAMPEN_IM_KOMBI_AUS';
        const stopped = cadence === 0 || cadence === 'NICHT_BLINKEN';
        const fast = cadence === 2 || cadence === 'DEFEKT_MINUS_BLINKTAKT';
        const restart = sync !== this.sync && (sync === 1 || sync === 2 ||
            sync === 'SYNCHRONISATION' || sync === 'NEUEN_BLINKTAKT_STARTEN');
        this.sync = sync;
        this.set(suppressed || stopped ? 'off' : direction, fast ? FAST_PERIOD_MS : NORMAL_PERIOD_MS, restart);
    }

    lightFunction(value) {
        if (this.hasInstrumentStatus) return;
        const status = fields(value, 'controlIndicateDirection') || fields(value, 'activeFunctionIndicateDirection');
        if (!status) return;
        const control = status.controlIndicateDirection;
        const active = status.activeFunctionIndicateDirection;
        const direction = knownDirection(STALK_DIRECTIONS, control) || knownDirection(ACTIVE_DIRECTIONS, active);
        if (direction) this.set(direction, NORMAL_PERIOD_MS);
        else if (control === 0 || control === 'BLINKEN_AUS' || active === 0 || active === 'BLINKEN_AUS') {
            this.set('off', NORMAL_PERIOD_MS);
        }
    }

    lit(now) {
        const elapsed = now - this.startedAt;
        return this.direction !== 'off' && elapsed >= 0 && elapsed % this.period < this.period / 2;
    }
}

module.exports = { TurnIndicator };
