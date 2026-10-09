import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(root, pathname.replace(/^\/klecks\/?/, '') || 'index.html');
        if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
    } catch { res.writeHead(404); res.end(); }
}).listen(4173, '127.0.0.1');
