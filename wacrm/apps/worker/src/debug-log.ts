import { appendFileSync } from 'fs';

const LOG_PATH = 'D:/Projects/whatsapp/debug-978181.log';
const INGEST =
  'http://127.0.0.1:7430/ingest/9d2e93b4-70b1-476c-91a3-033ad518f09e';

export function agentLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'post-fix',
) {
  const payload = {
    sessionId: '978181',
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  const body = JSON.stringify(payload);
  fetch(INGEST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '978181',
    },
    body,
  }).catch(() => {});
  try {
    appendFileSync(LOG_PATH, body + '\n');
  } catch {
    // ignore debug I/O failures
  }
}
