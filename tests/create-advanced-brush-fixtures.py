"""Original advanced fixtures; does not contain any third-party brush assets."""
import pathlib
import plistlib
import struct
import zipfile
import zlib

dest = pathlib.Path(__file__).parent / 'fixtures'
with zipfile.ZipFile(dest / 'tip.brush') as source:
    shape = source.read('Shape.png')
    base = plistlib.loads(source.read('Brush.archive'))

def metadata(name, **settings):
    return plistlib.dumps({'$top': {'root': plistlib.UID(1)}, '$objects': ['$null', {
        'name': plistlib.UID(2), 'plotSpacing': 0.2, **settings}, name]}, fmt=plistlib.FMT_BINARY)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

pixels = b''.join(b'\0' + bytes(255 if x % 4 < 2 else 0 for x in range(16)) for y in range(16))
grain = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 16, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
files = {
    'textured/Brush.archive': metadata('Textured', grainDepth=1.0, textureScale=0.25, textureZoom=0.0, renderingMaxTransfer=True),
    'textured/Shape.png': shape, 'textured/Grain.png': grain,
    'solid/Brush.archive': metadata('Solid', shapeCount=0.0625), 'solid/Shape.png': shape,
    'dual/Brush.archive': metadata('Dual', dualBlendMode=11), 'dual/Shape.png': shape,
    'dual/Sub01/Brush.archive': metadata('Secondary'), 'dual/Sub01/Shape.png': shape,
    'brushset.plist': plistlib.dumps({'brushes': ['solid', 'textured', 'dual']}, fmt=plistlib.FMT_BINARY),
}
with zipfile.ZipFile(dest / 'advanced.brushset', 'w', zipfile.ZIP_DEFLATED) as target:
    for name, data in files.items():
        info = zipfile.ZipInfo(name)
        info.compress_type = zipfile.ZIP_DEFLATED
        target.writestr(info, data)
# XML keyed archives represent UID objects as CF$UID dictionaries.
xml = {'$top': {'root': {'CF$UID': 1}}, '$objects': ['$null', {
    'name': {'CF$UID': 2}, 'plotSpacing': 0.125, 'shapeInverted': False}, 'XML tip']}
with zipfile.ZipFile(dest / 'xml.brush', 'w', zipfile.ZIP_DEFLATED) as target:
    target.writestr(zipfile.ZipInfo('Brush.archive'), plistlib.dumps(xml))
    target.writestr(zipfile.ZipInfo('Shape.png'), shape)

solid_pixels = b''.join(b'\0' + bytes([255] * 16) for _ in range(16))
solid_shape = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 16, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(solid_pixels)) + chunk(b'IEND', b'')
with zipfile.ZipFile(dest / 'transfer.brush', 'w', zipfile.ZIP_DEFLATED) as target:
    target.writestr(zipfile.ZipInfo('Brush.archive'), metadata('Transfer', renderingMaxTransfer=True, paintOpacity=0.25))
    target.writestr(zipfile.ZipInfo('Shape.png'), solid_shape)
