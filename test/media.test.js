'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const dir = '../dist/zekai_cluster_themes/source/javascript/';
const { porscheGaugeLayout, panel } = require(dir + 'dials');
const { PORSCHE_CENTRE } = require(dir + 'panel-layout');
const { Canvas } = require(dir + 'kit/canvas');
const { Car } = require(dir + 'car');
const { findCover } = require(dir + 'online-artwork');
const { renderPanelFrame } = require(dir + 'panel-frame');

function sampleCover() {
    const cover = new Canvas(20, 20);
    cover.clear('#e01e53');
    return cover.png();
}

test('front-seat artwork reassembles out of order and is associated with the current track', async () => {
    const car = new Car();
    const handlers = new Map();
    car.watch({ signals: { async watch(iface, instance, fields) { handlers.set(instance, fields); } }, log: {} });
    const hmi = handlers.get('HMI_CID');
    const player = handlers.get('CarPlayMedia');
    const bytes = sampleCover();
    const info = { trackId: 42, menuEntry: 7 };
    hmi.playerMetadata({ ...info, sink: 'FRONT', firstLineText: '罕見𠮷', firstLineType: 'TITLE',
        secondLineText: '歌手 - 專輯', secondLineType: 'ARTIST' });
    player.currentItemMetadata([{ key: 3, value: { stringValue: '罕見𠮷' } }, { key: 5, value: '歌手' }]);
    player.playerState('PLAYER_STATE_PLAY');
    const mid = Math.floor(bytes.length / 2);
    const packet = { ...info, coverArtId: 1, sink: 'FRONT', totalSize: bytes.length };
    hmi.coverArt({ ...packet, offset: mid, coverArt: [...bytes.subarray(mid)] });
    assert.equal(car.snapshot().media.artwork, undefined);
    hmi.coverArt({ ...packet, sink: 'FOND_LEFT', offset: 0, coverArt: bytes.subarray(0, mid) });
    assert.equal(car.snapshot().media.artwork, undefined);
    await car.mediaArtwork.receive({ ...packet, offset: 0, coverArt: bytes.subarray(0, mid) });
    const track = car.snapshot().media;
    assert.equal(track.title, '罕見𠮷');
    assert.deepEqual([...track.artwork.pixels.subarray(0, 4)], [224, 30, 83, 255]);
    assert.equal(JSON.stringify(track).includes('pixels'), false);
    const artwork = renderPanelFrame('silver', { leftInner: 'media' }, { media: track });
    const placeholder = renderPanelFrame('silver', { leftInner: 'media' }, { media: { ...track } });
    assert.equal(Buffer.compare(artwork.d, placeholder.d) === 0, false);
    player.currentItemMetadata([{ key: 'TITLE', value: 'New track' }]);
    assert.equal(car.snapshot().media.artwork, undefined);
});

test('online search can use the album and artist in a combined CarPlay line', async () => {
    const id = '41bab3f6-d6e2-4820-b1b8-e1cab0480f84';
    const calls = [];
    const art = await findCover({ title: 'Current text', artist: 'The Weeknd - After Hours' }, async (url) => {
        calls.push(url);
        if (calls.length === 2) return sampleCover();
        return Buffer.from(JSON.stringify({ 'release-groups': [{ title: 'After Hours', id,
            'artist-credit': [{ name: 'The Weeknd' }] }] }));
    });
    assert.match(decodeURIComponent(calls[0]), /releasegroup:"After Hours" AND artist:"The Weeknd"/);
    assert.equal(calls[1], 'https://coverartarchive.org/release-group/' + id + '/front-250');
    assert.equal(art.side, 128);
});

test('long Porsche media lines fit in the visible area of either side circle', () => {
    const [mainX, mainY, radius] = PORSCHE_CENTRE;
    for (const slot of ['leftInner', 'rightInner']) {
        const [cx, cy, r] = porscheGaugeLayout(slot);
        const canvas = new Canvas(960, 320);
        let lines = 0;
        const drawText = canvas.text.bind(canvas);
        canvas.text = (value, x, y, size, ink, opts) => {
            const width = drawText(value, x, y, size, ink, opts);
            if (opts.hanFallback) {
                lines++;
                const inward = x - Math.sign(x - mainX) * width / 2;
                assert.ok(Math.hypot(inward - mainX, y - mainY - size) > radius + 4);
                assert.ok(Math.hypot(x - cx + Math.sign(x - cx) * width / 2, y - cy + 4) < r - 5);
            }
            return width;
        };
        panel(canvas, 'five', { [slot]: 'media' }, {
            media: { title: 'Talk to me without a very long name', artist: 'The Weeknd - After Hours and beyond' },
        }, {});
        assert.equal(lines, 2);
    }
});

test('the cached Porsche face changes its battery scale when voltage returns', () => {
    const choices = { leftOuter: 'battery' };
    const cache = {};
    renderPanelFrame('five', choices, { batteryCharge: 90 }, false, undefined, cache);
    const soc = cache.key;
    const volts = { batteryCharge: 90, batteryVolts: 13.5 };
    const updated = renderPanelFrame('five', choices, volts, false, undefined, cache);
    assert.notEqual(cache.key, soc);
    assert.equal(Buffer.compare(updated.d, renderPanelFrame('five', choices, volts).d), 0);
});

test('supplementary Han glyphs in the release are rendered and measured consistently', {
    skip: !process.env.REQUIRE_HAN_FONT,
}, () => {
    const han = require(dir + 'kit/han');
    for (const symbol of ['𠮷', '𰻞', '𱁬', String.fromCodePoint(0x33479)]) {
        const cp = symbol.codePointAt(0);
        assert.ok(han.glyph(cp), 'missing U+' + cp.toString(16));
        const canvas = new Canvas(120, 40);
        const style = { literal: true, hanFallback: true, font: 'instrument_regular' };
        const line = 'ABC ' + symbol + '繁體';
        assert.equal(canvas.text(line, 4, 29, 16, '#ffffff', style), canvas.textWidth(line, 16, style));
        assert.ok(canvas.d.some((value) => value > 0));
    }
});
