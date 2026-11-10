'use strict';

const FONTS = {
    regular: 'instrument_regular',
    medium: 'instrument_medium',
    bold: 'instrument_bold',
};
const TEXT_SIZE_RATIO = 0.9;

function instrumentType(canvas, x, y, scale, ink) {
    const textScale = scale * TEXT_SIZE_RATIO;
    const measure = (value, size, weight = 'regular') => canvas.textWidth(value, size * textScale, {
        literal: true, font: FONTS[weight],
    }) / scale;
    return {
        text(value, cx, cy, size, colour = ink, weight = 'regular', spacing = 0) {
            return canvas.text(value, x(cx), y(cy), size * textScale, colour, {
                align: 'center', literal: true, font: FONTS[weight], spacing: spacing * textScale,
            });
        },
        measure,
        fitBold(value, size, maxWidth) {
            const width = measure(value, size, 'bold');
            return width > maxWidth ? size * maxWidth / width : size;
        },
    };
}

module.exports = { instrumentType, FONTS };
