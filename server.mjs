import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
});
const BASE_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});

function safeRelativePath(requestTarget) {
  if (typeof requestTarget !== 'string' || !requestTarget.startsWith('/')) return null;
  let decoded;
  try { decoded = decodeURIComponent(requestTarget.split(/[?#]/, 1)[0]); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) return null;
  const parts = decoded.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..' || part.startsWith('.'))) return null;
  if (decoded.endsWith('/') && parts.length > 0) return null;
  const name = parts.length === 0 ? 'index.html' : parts.join('/');
  if (!Object.hasOwn(TYPES, extname(name).toLowerCase())) return null;
  return name;
}

function reply(res, statusCode, body, extra = {}) {
  res.writeHead(statusCode, {
    ...BASE_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(body);
}

export function createRequestHandler(root = APP_ROOT) {
  const base = resolve(root);
  return async function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return reply(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    }
    if (req.url?.split('?', 1)[0] === '/health') {
      const body = JSON.stringify({ ok: true, service: 'lizaty666-web' });
      res.writeHead(200, { ...BASE_HEADERS, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    const relative = safeRelativePath(req.url);
    if (relative === null) return reply(res, 404, req.method === 'HEAD' ? undefined : 'Not Found');
    try {
      const candidate = resolve(base, relative);
      if (!candidate.startsWith(base + sep)) return reply(res, 404, req.method === 'HEAD' ? undefined : 'Not Found');
      const real = await realpath(candidate);
      if (!real.startsWith(base + sep)) return reply(res, 404, req.method === 'HEAD' ? undefined : 'Not Found');
      const info = await stat(real);
      if (!info.isFile()) return reply(res, 404, req.method === 'HEAD' ? undefined : 'Not Found');
      res.writeHead(200, {
        ...BASE_HEADERS,
        'Content-Type': TYPES[extname(real).toLowerCase()],
        'Content-Length': info.size,
        'Cache-Control': extname(real).toLowerCase() === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=3600',
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(real).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return reply(res, 404, req.method === 'HEAD' ? undefined : 'Not Found');
      return reply(res, 500, req.method === 'HEAD' ? undefined : 'Internal Server Error');
    }
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createServer(createRequestHandler());
  server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'started', service: 'lizaty666-web', port })));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
