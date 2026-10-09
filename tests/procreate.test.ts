import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { zipSync } from 'fflate';
import { readBinaryPlist } from '../src/app/script/klecks/brushes/procreate/binary-plist';
import { extractProcreate } from '../src/app/script/klecks/brushes/procreate/import-procreate';
import { readProfile, pressureFactor, curvePressure } from '../src/app/script/klecks/brushes/procreate/brush-profile';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test('reads independent binary plist fixtures including Unicode, UID, and signed integers', () => {
    const plist = readBinaryPlist(fixture('metadata.plist'));
    assert.equal(plist.$objects[2], 'Test L – 筆');
    assert.equal(plist.$objects[1].unusedNegative, -1);
    assert.equal(plist.$top.root['CF$UID'], 1);
});
test('extracts a single brush with diameter-to-radius spacing conversion', () => {
    const result = extractProcreate(fixture('tip.brush'), 'tip.BRUSH');
    assert.equal(result.tips.length, 1);
    assert.equal(result.tips[0].name, 'Test L – 筆');
    assert.equal(result.tips[0].spacing, 0.25);
    assert.equal(result.tips[0].inverted, false);
    assert.deepEqual(result.skipped, []);
});
test('imports a mixed set, reports unsupported records, and ignores Reset backups', () => {
    const result = extractProcreate(fixture('mixed.brushset'), 'mixed.brushset');
    assert.deepEqual(result.tips.map((tip) => tip.name), ['Set tip', 'Inverted']);
    assert.equal(result.tips[1].inverted, true);
    assert.deepEqual(result.skipped, ['Bundled shape', 'bad']);
});
test('supports nested .brush files in brush sets', () => {
    assert.equal(extractProcreate(fixture('nested.brushset'), 'nested.brushset').tips[0].name, 'Test L – 筆');
});
test('rejects wrong formats, empty ZIPs, corrupt files, and excessive compressed input', () => {
    assert.throws(() => extractProcreate(fixture('tip.brush'), 'tip.zip'), /Choose/);
    assert.throws(() => extractProcreate(zipSync({}), 'empty.brush'), /No Procreate/);
    assert.throws(() => extractProcreate(new Uint8Array([1, 2, 3]), 'bad.brush'));
    assert.throws(() => extractProcreate(new Uint8Array(50 * 1024 * 1024 + 1), 'big.brush'), /50 MB/);
});
test('rejects oversized expanded assets before decompression', () => {
    const bytes = zipSync({ 'Shape.png': new Uint8Array([1]) });
    // Forge the central directory's uncompressed size; no large allocation needed.
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length - 24; i++) {
        if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 101 * 1024 * 1024, true);
    }
    assert.throws(() => extractProcreate(bytes, 'huge.brush'), /100 MB/);
});
test('rejects malformed plist offsets and recursive object graphs', () => {
    const bytes = fixture('metadata.plist');
    bytes.fill(255, bytes.length - 8);
    assert.throws(() => readBinaryPlist(bytes), /Invalid/);
    // Root array at offset 8 points to itself.
    const cycle = new Uint8Array(43);
    cycle.set(new TextEncoder().encode('bplist00'));
    cycle.set([0xa1, 0, 8], 8);
    cycle[17] = cycle[18] = 1;
    cycle[26] = 1;
    cycle[42] = 10;
    assert.throws(() => readBinaryPlist(cycle), /Invalid/);
});

test('maps archived flow/depth/count fields and clamps invalid dynamic settings', () => {
    const { profile, unhandled } = readProfile({ shapeCount: 0.5, grainDepth: 0.25,
        dynamicsGlazedFlow: 0.4, dynamicsPressureSize: -0.5, shapeScatter: 1.6,
        shapeRoundness: NaN, mysteryEffect: 42 });
    assert.equal(profile.count, 8);
    assert.equal(profile.grainDepth, 0.25);
    assert.equal(profile.flow, 0.4);
    assert.equal(profile.scatter, 1.6);
    assert.equal(profile.roundness, 1);
    assert.deepEqual(unhandled, ['mysteryEffect']);
    assert.equal(pressureFactor(0, 1, 0.1), 0.1);
    assert.equal(pressureFactor(1, -0.5, 0), 0.5);
});

test('reads archived pressure point arrays and interpolates their response', () => {
    const { profile } = readProfile({ dynamicsPressureSizeCurve: { points: {
        'NS.objects': ['{0.000000, 0.000000}', '{0.5, 0.25}', '{1.000000, 1.000000}'],
    } } });
    assert.equal(curvePressure(0.5, profile.sizeCurve), 0.25);
    assert.equal(curvePressure(0.75, profile.sizeCurve), 0.625);
    assert.equal(curvePressure(-1, profile.sizeCurve), 0);
    assert.equal(curvePressure(2, profile.sizeCurve), 1);
});

test('retains grain and secondary assets, preserves set ordering, and avoids extra dual entries', () => {
    const result = extractProcreate(fixture('advanced.brushset'), 'advanced.brushset');
    assert.deepEqual(result.tips.map((tip) => tip.name), ['Solid', 'Textured', 'Dual']);
    assert.ok(result.tips[1].grain?.length);
    assert.ok(result.tips[2].secondary?.archive.length);
    assert.ok(result.tips[2].secondary?.shape?.length);
    assert.ok(result.tips[2].unhandled.includes('Dual brush component (Sub01)'));
    assert.deepEqual(result.skipped, []);
});
