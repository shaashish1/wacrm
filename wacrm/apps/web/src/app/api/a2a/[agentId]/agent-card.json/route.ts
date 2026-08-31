import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getAgentCard, isA2AAgentId } from '@/lib/a2a/cards';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    await requireRole('viewer');
    const { agentId } = await params;
    if (!isA2AAgentId(agentId)) {
      return NextResponse.json({ error: 'Unknown agent' }, { status: 404 });
    }
    const origin = new URL(request.url).origin;
    return NextResponse.json(getAgentCard(agentId, origin));
  } catch (err) {
    return toErrorResponse(err);
  }
}
