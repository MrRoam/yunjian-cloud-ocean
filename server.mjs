import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4187);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.mp4':'video/mp4', '.jpg':'image/jpeg', '.gz':'application/octet-stream' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(target);
    const headers={ 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges':'bytes' };
    const range=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if(range&&(range[1]||range[2])){
      const start=range[1]?Number(range[1]):Math.max(0,bytes.length-Number(range[2]));
      const end=range[1]&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
      if(start>=bytes.length||start>end){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});res.end();return;}
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});
      res.end(bytes.subarray(start,end+1));
    }else{res.writeHead(200,{...headers,'Content-Length':bytes.length});res.end(bytes);}
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`云间 · http://127.0.0.1:${port}`));
