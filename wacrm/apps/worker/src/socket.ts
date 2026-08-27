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

const corsOrigin = process.env.NEXT_PUBLIC_SITE_URL || true;

export const io = new Server(httpServer, {
  cors: { origin: corsOrigin },
});
