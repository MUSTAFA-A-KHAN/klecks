/** Bounded binary plist reader for Procreate's NSKeyedArchiver metadata. */
export function readBinaryPlist(bytes: Uint8Array): any {
    const fail = (): never => { throw new Error('Invalid brush metadata'); };
    if (bytes.length < 40 || bytes.length > 1024 * 1024 ||
        new TextDecoder().decode(bytes.subarray(0, 8)) !== 'bplist00') {
        return fail();
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const uint = (offset: number, size: number): number => {
        if (size < 1 || size > 8 || offset < 0 || offset + size > bytes.length) return fail();
        let result = 0;
        for (let i = 0; i < size; i++) result = result * 256 + bytes[offset + i];
        if (!Number.isSafeInteger(result)) return fail();
        return result;
    };
    const trailer = bytes.length - 32;
    const offsetSize = bytes[trailer + 6];
    const refSize = bytes[trailer + 7];
    const count = uint(trailer + 8, 8);
    const root = uint(trailer + 16, 8);
    const table = uint(trailer + 24, 8);
    if (count > 20000 || count < 1 || refSize < 1 || refSize > 4 ||
        offsetSize < 1 || offsetSize > 8 || table < 8 || table + count * offsetSize > trailer) return fail();
    const cache = new Map<number, any>();
    const active = new Set<number>();
    let budget = 100000;
    const read = (id: number, depth = 0): any => {
        if (--budget < 0 || depth > 40 || id >= count || active.has(id)) return fail();
        if (cache.has(id)) return cache.get(id);
        let pos = uint(table + id * offsetSize, offsetSize);
        if (pos < 8 || pos >= table) return fail();
        const marker = bytes[pos++];
        const type = marker >> 4;
        let length = marker & 15;
        if ([4, 5, 6, 10, 13].includes(type) && length === 15) {
            const sizeMarker = bytes[pos++];
            if (sizeMarker >> 4 !== 1 || (sizeMarker & 15) > 3) return fail();
            const size = 2 ** (sizeMarker & 15);
            length = uint(pos, size);
            pos += size;
        }
        const check = (size: number) => {
            if (size > 1024 * 1024 || pos + size > table) fail();
        };
        let value: any;
        active.add(id);
        if (type === 0) {
            if (![0, 8, 9].includes(length)) return fail();
            value = length === 0 ? null : length === 9;
        } else if (type === 1 || type === 8) {
            const size = type === 8 ? length + 1 : 2 ** length;
            check(size);
            if (type === 8) value = { 'CF$UID': uint(pos, size) };
            else if (size === 8) {
                value = view.getInt32(pos) * 2 ** 32 + view.getUint32(pos + 4);
                if (!Number.isSafeInteger(value)) return fail();
            } else value = uint(pos, size);
        } else if (type === 2 || type === 3) {
            const size = 2 ** length;
            check(size);
            if (size !== 4 && size !== 8) return fail();
            value = size === 4 ? view.getFloat32(pos) : view.getFloat64(pos);
        } else if (type === 4 || type === 5 || type === 6) {
            const size = length * (type === 6 ? 2 : 1);
            check(size);
            const data = bytes.subarray(pos, pos + size);
            value = type === 4 ? data : new TextDecoder(type === 6 ? 'utf-16be' : 'utf-8').decode(data);
        } else if (type === 10 || type === 13) {
            check(length * refSize * (type === 13 ? 2 : 1));
            if (length > 20000) return fail();
            value = type === 10 ? [] : Object.create(null);
            for (let i = 0; i < length; i++) {
                const item = read(uint(pos + i * refSize, refSize), depth + 1);
                if (type === 10) value.push(item);
                else {
                    if (typeof item !== 'string') return fail();
                    value[item] = read(uint(pos + (length + i) * refSize, refSize), depth + 1);
                }
            }
        } else return fail();
        active.delete(id);
        cache.set(id, value);
        return value;
    };
    return read(root);
}
