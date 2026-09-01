// Keep in sync with `apps/web/src/lib/webhooks/sign.ts`.
import { createHmac } from 'node:crypto';

export function buildSignatureHeader(
  rawBody: string,
  secret: string,
  timestampSeconds: number,
): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}
