import { createServer } from 'http';

export const httpServer = createServer();

type EmitTarget = { emit: (event: string, ...args: unknown[]) => void };
type IoLike = {
  to: (room: string) => EmitTarget;
  on: (event: string, handler: (...args: any[]) => void) => void;
  sockets: {
    adapter: { rooms: { get: (id: string) => { size?: number } | undefined } };
  };
};

function createStubIo(): IoLike {
  const noop: EmitTarget = { emit: () => {} };
  return {
    to: () => noop,
    on: () => {},
    sockets: { adapter: { rooms: { get: () => undefined } } },
  };
}

function createIo(): IoLike {
  try {
    // Lazy require so a missing install does not crash the worker.
    // QR codes are still persisted to the sessions table.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Server } = require('socket.io') as typeof import('socket.io');
    return new Server(httpServer, { cors: { origin: '*' } });
  } catch (err) {
    console.warn(
      '[Worker] socket.io is not installed; QR codes will be stored in the database only.',
      err,
    );
    return createStubIo();
  }
}

export const io = createIo();
