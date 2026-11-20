import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('_site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain' };
http.createServer((req, res) => {
 let name;
 try { name = decodeURIComponent(new URL(req.url, 'http://preview').pathname).replace(/^\/SCORCHNG\//, '/'); }
 catch { res.writeHead(400); res.end(); return; }
 const file = path.resolve(root, '.' + (name.endsWith('/') ? name + 'index.html' : name));
 if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
 res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
 fs.createReadStream(file).pipe(res);
}).listen(8001, '0.0.0.0', () => console.log('Static preview on port 8001'));
