'use strict';

const DATA_MAX_AGE_MS = 12000;
const PRESSURE_UNITS = { 1: 'bar', 2: 'kPa', 3: 'psi', BAR: 'bar', KPA: 'kPa', PSI: 'psi' };
const CONSUMPTION_UNITS = {
    VERBRAUCH_IN_L_S_100KM: 'l100', VERBRAUCH_IN_MPG_UK: 'mpgUk', VERBRAUCH_IN_MPG_US: 'mpgUs', VERBRAUCH_IN_KM_S_L: 'kml',
    1: 'l100', 2: 'mpgUk', 3: 'mpgUs', 4: 'kml',
};

function scaled(raw, invalid, factor, offset) {
    return Number.isInteger(raw) && raw >= 0 && raw < invalid ? raw * factor + offset : null;
}

function economyMpgUs(raw, unit) {
    const value = scaled(raw, 65535, 0.1, 0);
    const kind = CONSUMPTION_UNITS[unit];
    if (value === null || value <= 0) return null;
    if (kind === 'l100') return 235.214583 / value;
    if (kind === 'mpgUk') return value * 1.20095;
    if (kind === 'mpgUs') return value;
    if (kind === 'kml') return value * 2.35214583;
    return null;
}

class Car {
    constructor(now = Date.now) {
        this.now = now;
        this.values = Object.create(null);
    }

    put(key, value) {
        this.values[key] = { value, at: this.now() };
    }

    get(key, maxAge = DATA_MAX_AGE_MS) {
        const sample = this.values[key];
        const age = sample ? this.now() - sample.at : Infinity;
        return age >= 0 && age <= maxAge ? sample.value : null;
    }

    snapshot() {
        const data = {};
        for (const key of Object.keys(this.values)) data[key] = this.get(key);
        return data;
    }

    watch(ctx) {
        const add = (name, fields, pollMs) => ctx.signals.watch(name, '1', fields, ctx.log, {
            pollMs, readTimeoutMs: 1000, shouldPoll: () => !ctx.ui || ctx.ui.isVisible('MAIN'),
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
                this.put('odometerKm', scaled(v && v.mileageKilometre, 16777215, 1, 0));
            },
            statusBordcomputerAverage: (v) => this.put('economyMpgUs', economyMpgUs(
                v && v.consumptionAverage1BC1, v && v.statusUnitOfMeasurementConsumptionBC)),
            statusBordcomputerTravelData: (v) => this.put('tripKm', scaled(v && v.wayPassed, 65535, 1, 0)),
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

module.exports = { Car, economyMpgUs };
