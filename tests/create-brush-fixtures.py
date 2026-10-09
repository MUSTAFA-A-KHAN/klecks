"""Generate small, original test brushes with Python's independent plist/ZIP encoders."""
import pathlib
import plistlib
import struct
import zlib
import io
import zipfile

DEST = pathlib.Path(__file__).parent / 'fixtures'
DEST.mkdir(exist_ok=True)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

# An asymmetric white L on black lets rendering tests detect orientation and polarity.
pixels = b''.join(b'\0' + bytes(255 if (2 <= x < 5 and 2 <= y < 14) or
    (2 <= x < 12 and 11 <= y < 14) else 0 for x in range(16)) for y in range(16))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 16, 8, 0, 0, 0, 0)) + \
    chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')

def archive(name, inverted=False):
    return plistlib.dumps({'$archiver': 'NSKeyedArchiver', '$version': 100000,
        '$top': {'root': plistlib.UID(1)}, '$objects': ['$null', {
            'name': plistlib.UID(2), 'plotSpacing': 0.125, 'shapeInverted': inverted,
            'unusedNegative': -1, 'unusedData': b'abc'}, name]}, fmt=plistlib.FMT_BINARY)

def zipped(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as out:
        for name, data in files.items():
            out.writestr(name, data)
    return stream.getvalue()

brush = zipped({'Brush.archive': archive('Test L – 筆'), 'Shape.png': png})
(DEST / 'tip.brush').write_bytes(brush)
(DEST / 'mixed.brushset').write_bytes(zipped({
    'one/Brush.archive': archive('Set tip'), 'one/Shape.png': png,
    'missing/Brush.archive': archive('Bundled shape'),
    'inverted/Brush.archive': archive('Inverted', True), 'inverted/Shape.png': png,
    'one/Reset/Brush.archive': archive('Ignore reset'), 'one/Reset/Shape.png': png,
    'bad/Brush.archive': b'broken', 'bad/Shape.png': png,
}))
(DEST / 'nested.brushset').write_bytes(zipped({'Nested.brush': brush}))
(DEST / 'metadata.plist').write_bytes(archive('Test L – 筆'))
