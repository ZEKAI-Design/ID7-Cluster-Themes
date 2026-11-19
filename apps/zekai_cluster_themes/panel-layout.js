'use strict';

const PANEL_WIDTH = 1920;
const PANEL_HEIGHT = 720;
const PORSCHE_CENTRE = [480, 168, 138];
const PORSCHE_DIALS = {
    leftOuter: [170, 181, 70],
    leftInner: [286, 173, 96],
    rightInner: [674, 173, 96],
    rightOuter: [790, 181, 70],
};
const SILVER_SIDE_DIALS = { leftInner: 252, rightInner: 708 };
const SILVER_SIDE_Y = 171;

function panelLayout(theme) {
    if (theme === 'five') {
        const scale = 2.48;
        const [cx, cy] = PORSCHE_CENTRE;
        return { scale, x: PANEL_WIDTH / 2 - cx * scale, y: PANEL_HEIGHT / 2 - cy * scale };
    }
    if (theme === 'silver') {
        const scale = 2.68;
        return { scale, x: PANEL_WIDTH / 2 - 480 * scale, y: 338 - 165 * scale };
    }
    if (theme === 'vdoRetro') {
        const scale = 2.26;
        return { scale, x: PANEL_WIDTH / 2 - 480 * scale, y: PANEL_HEIGHT / 2 - 163 * scale };
    }
    return { scale: 2, x: 0, y: 40 };
}

module.exports = { PANEL_WIDTH, PANEL_HEIGHT, panelLayout, PORSCHE_CENTRE, PORSCHE_DIALS, SILVER_SIDE_DIALS, SILVER_SIDE_Y };
