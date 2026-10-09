import { readBinaryPlist } from './binary-plist';

/** Accept both binary and XML property lists. XML parsing never expands custom entities. */
export function readPlist(bytes: Uint8Array): any {
    if (bytes.length > 1024 * 1024) throw new Error('Brush metadata exceeds 1 MB');
    const text = new TextDecoder().decode(bytes);
    if (text.startsWith('bplist00')) return readBinaryPlist(bytes);
    if (/<!ENTITY/i.test(text)) throw new Error('Unsupported XML entities');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.tagName !== 'plist') {
        throw new Error('Invalid property list');
    }
    let budget = 20000;
    const read = (el: Element | null, depth = 0): any => {
        if (!el || depth > 40 || --budget < 0) throw new Error('Invalid property list');
        const children = Array.from(el.children);
        switch (el.tagName) {
            case 'true': return true;
            case 'false': return false;
            case 'string': case 'key': case 'date': case 'data': return el.textContent || '';
            case 'integer': case 'real': {
                const value = Number(el.textContent);
                if (!Number.isFinite(value)) throw new Error('Invalid number');
                return value;
            }
            case 'array': return children.map((child) => read(child, depth + 1));
            case 'dict': {
                const value = Object.create(null);
                if (children.length % 2) throw new Error('Invalid dictionary');
                for (let i = 0; i < children.length; i += 2) {
                    if (children[i].tagName !== 'key') throw new Error('Invalid dictionary key');
                    value[children[i].textContent || ''] = read(children[i + 1], depth + 1);
                }
                return value;
            }
            default: throw new Error('Unsupported property list value');
        }
    };
    return read(doc.documentElement.firstElementChild);
}
