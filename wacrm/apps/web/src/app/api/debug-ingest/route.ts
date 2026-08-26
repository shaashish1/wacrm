import { appendFile } from 'fs/promises';
import { NextResponse } from 'next/server';

const LOG_PATH = 'D:/Projects/whatsapp/debug-978181.log';
const INGEST =
  'http://127.0.0.1:7430/ingest/9d2e93b4-70b1-476c-91a3-033ad518f09e';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const line = body.trimEnd() + '\n';
    await appendFile(LOG_PATH, line);
    fetch(INGEST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '978181',
      },
      body,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
