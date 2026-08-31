import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { ApiError, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireA2AAuth } from '@/lib/a2a/auth';
import { getAgentCard, isA2AAgentId } from '@/lib/a2a/cards';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    await requireA2AAuth(request, 'viewer');
    const { agentId } = await params;
    if (!isA2AAgentId(agentId)) {
      return NextResponse.json({ error: 'Unknown agent' }, { status: 404 });
    }
    const origin = new URL(request.url).origin;
    return NextResponse.json(getAgentCard(agentId, origin));
  } catch (err) {
    if (err instanceof ApiError) return toApiErrorResponse(err);
    return toErrorResponse(err);
  }
}
