'use strict';

const PANEL_WIDTH = 1920;
const PANEL_HEIGHT = 720;
const SILVER_SIDE_DIALS = { leftInner: 265, rightInner: 695 };
const SILVER_SIDE_Y = 171;

function panelLayout(theme) {
    if (theme === 'five') {
        const scale = 2.48;
        return { scale, x: PANEL_WIDTH / 2 - 480 * scale, y: PANEL_HEIGHT / 2 - 168 * scale };
    }
    return { scale: 2, x: 0, y: 40 };
}

module.exports = { PANEL_WIDTH, PANEL_HEIGHT, panelLayout, SILVER_SIDE_DIALS, SILVER_SIDE_Y };
