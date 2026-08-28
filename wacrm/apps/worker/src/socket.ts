import { createServer } from 'http';
import { Server } from 'socket.io';

function healthResponse(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  const url = req.url ?? '/';
  if (url === '/health' || url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'worker' }));
    return true;
  }
  return false;
}

export const httpServer = createServer((req, res) => {
  if (healthResponse(req, res)) return;
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

/**
 * Lock Socket.IO CORS to the CRM origin(s). Never fall back to `true`
 * (reflect any Origin) — that is equivalent to `*` with credentials.
 *
 * Sources, in order:
 *   NEXT_PUBLIC_SITE_URL (comma-separated allowed)
 *   SOCKET_CORS_ORIGINS (optional extra list)
 *   http://localhost:3100 and 127.0.0.1:3100 when NODE_ENV !== production
 *     or when no site URL was configured (local compose / next start)
 */
function socketCorsOrigins(): string[] {
  const split = (raw: string | undefined) =>
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);

  const origins = new Set<string>([
    ...split(process.env.NEXT_PUBLIC_SITE_URL),
    ...split(process.env.SOCKET_CORS_ORIGINS),
  ]);

  if (process.env.NODE_ENV !== 'production' || origins.size === 0) {
    origins.add('http://localhost:3100');
    origins.add('http://127.0.0.1:3100');
  }

  return [...origins];
}

export const io = new Server(httpServer, {
  cors: {
    origin: socketCorsOrigins(),
    methods: ['GET', 'POST'],
  },
});
