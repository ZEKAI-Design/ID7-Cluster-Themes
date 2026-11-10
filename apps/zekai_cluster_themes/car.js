'use strict';

const SAFETY_MAX_AGE_MS = 2200;
const DATA_MAX_AGE_MS = 12000;
const PRESSURE_UNITS = { 1: 'bar', 2: 'kPa', 3: 'psi', BAR: 'bar', KPA: 'kPa', PSI: 'psi' };

function scaled(raw, invalid, factor, offset) {
    return Number.isInteger(raw) && raw >= 0 && raw < invalid ? raw * factor + offset : null;
}

class Car {
    constructor(now = Date.now, onSafety = () => {}) {
        this.now = now;
        this.onSafety = onSafety;
        this.values = Object.create(null);
    }

    put(key, value) {
        this.values[key] = { value, at: this.now() };
        if (key === 'speed' || key === 'stage' || key === 'selection') this.onSafety();
    }

    get(key, maxAge = DATA_MAX_AGE_MS) {
        const sample = this.values[key];
        const age = sample ? this.now() - sample.at : Infinity;
        return age >= 0 && age <= maxAge ? sample.value : null;
    }

    parked() {
        if (this.get('speed', SAFETY_MAX_AGE_MS) !== 0) return false;
        const stage = this.get('stage', SAFETY_MAX_AGE_MS);
        const selection = this.get('selection', SAFETY_MAX_AGE_MS);
        if ((stage !== null && stage !== 'P') || (selection !== null && selection !== 'P')) return false;
        return stage === 'P' || selection === 'P';
    }

    snapshot() {
        const data = {};
        for (const key of Object.keys(this.values)) data[key] = this.get(key);
        return data;
    }

    watch(ctx) {
        const add = (name, fields, pollMs) => ctx.signals.watch(name, '1', fields, ctx.log, {
            pollMs, readTimeoutMs: 1000, shouldPoll: () => ctx.ui.isVisible('MAIN'),
        }).catch((error) => ctx.log.warn('Signal unavailable: ' + name + ' ' + error.message));

        add('de.bmw.infotainment.vehicle.Vehicle2', {
            statusCarSpeed2: (v) => this.put('speed', scaled(v && v.speedVehicleCentreOfGravity, 65535, 1 / 64, 0)),
        }, 600);
        add('de.bmw.infrastructure.VehicleInformation', {
            statusGearboxDrive: (v) => {
                const x = v && v.statusActualStageDrive;
                this.put('stage', x === 'P' || x === 1 ? 'P' : 'other');
            },
            DataPowerTrain2: (v) => {
                const x = v && v.statusGearSelectionDrive;
                this.put('selection', x === 'P' || x === 3 ? 'P' : 'other');
            },
        }, 700);
        add('de.bmw.infotainment.vehicle.CDS', {
            statusEngineSpeed2: (v) => this.put('rpm', scaled(v && v.actualValueRPMEngineCrankshaft, 65535, 0.25, 0)),
            statusEngineTemperature: (v) => {
                this.put('coolant', scaled(v && v.temperatureEngineDrive, 255, 1, -48));
                this.put('oil', scaled(v && v.temperatureEngineOilDrive, 255, 1, -48));
            },
        }, 2500);
        add('de.bmw.infotainment.vehicle.CDS2', {
            statusLateralAccelerationMassCenter: (v) => this.put('gLat', scaled(v && v.lateralAccelerationCentreOfGravity, 65535, 0.002 / 9.80665, -65 / 9.80665)),
            statusLongitudinalAccelerationMassCenter: (v) => this.put('gLong', scaled(v && v.longitudinalAccelerationCentreOfGravity, 65535, 0.002 / 9.80665, -65 / 9.80665)),
        }, 2500);
        add('de.bmw.infotainment.KombiIF', {
            statusRangeTankStatus: (v) => {
                this.put('range', scaled(v && v.range, 4095, 1, 0));
                this.put('fuelLitres', scaled(v && v.fluidLevelFuelTank, 255, 1, 0));
            },
        }, 4500);
        add('de.bmw.infrastructure.EnvironmentalInformation', {
            ExteriorTemperature: (v) => this.put('ambient', scaled(v && v.temperatureExterior, 255, 0.5, -40)),
        }, 4500);
        add('de.bmw.infotainment.vehicle.Vehicle', {
            statusNewCurrentUnitsStatusExt: (v) => this.put('pressureUnit', PRESSURE_UNITS[v && v.unitOfMeasurementAirPressure] || null),
        }, 4500);
        add('de.bmw.infotainment.vehicle.TPMS', {
            statusTyrePressure: (v) => this.put('tyres', ['FL', 'FR', 'RL', 'RR'].map((key) =>
                scaled(v && v['actualValuePressureTyre' + key + 'H'], 65532, 0.1, 0))),
        }, 5000);
    }
}

module.exports = { Car, SAFETY_MAX_AGE_MS };
