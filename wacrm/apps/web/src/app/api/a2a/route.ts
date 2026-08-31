import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { ApiError, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireA2AAuth } from '@/lib/a2a/auth';
import { cancelA2ATask, getA2ATask, runA2ATask } from '@/lib/a2a/runner';
import { getAgentCard, isA2AAgentId, listAgentIds } from '@/lib/a2a/cards';

interface JsonRpcBody {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result });
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  status = 400,
) {
  return NextResponse.json(
    { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
    { status },
  );
}

/**
 * Same-origin A2A JSON-RPC subset: message/send, tasks/get, tasks/cancel,
 * agents/list. Cards also live at GET /api/a2a/:agentId/agent-card.json.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireA2AAuth(request, 'agent');
    const body = (await request.json().catch(() => ({}))) as JsonRpcBody;
    const method = body.method ?? '';
    const params = body.params ?? {};
    const id = body.id ?? null;

    if (method === 'agents/list' || method === 'GetAgentCard') {
      const origin = new URL(request.url).origin;
      return rpcResult(
        id,
        listAgentIds().map((agentId) => getAgentCard(agentId, origin)),
      );
    }

    if (method === 'tasks/get' || method === 'GetTask') {
      const taskId = String(params.id ?? params.taskId ?? '');
      if (!taskId) return rpcError(id, -32602, 'id is required');
      const task = await getA2ATask(ctx.supabase, ctx.accountId, taskId);
      if (!task) return rpcError(id, -32004, 'Task not found', 404);
      return rpcResult(id, task);
    }

    if (method === 'tasks/cancel' || method === 'CancelTask') {
      const taskId = String(params.id ?? params.taskId ?? '');
      if (!taskId) return rpcError(id, -32602, 'id is required');
      const task = await cancelA2ATask(ctx.supabase, ctx.accountId, taskId);
      if (!task) return rpcError(id, -32004, 'Task not found or not cancelable', 404);
      return rpcResult(id, task);
    }

    if (method === 'message/send' || method === 'SendMessage') {
      const agentId = String(params.agentId ?? params.agent_id ?? '');
      if (!isA2AAgentId(agentId)) {
        return rpcError(
          id,
          -32602,
          'agentId must be compliance, qualifier, content, booking, or analytics',
        );
      }
      const skill = typeof params.skill === 'string' ? params.skill : undefined;
      const message = (params.message as Record<string, unknown> | undefined) ?? {};
      const data =
        message.data && typeof message.data === 'object'
          ? (message.data as Record<string, unknown>)
          : params;
      const task = await runA2ATask(ctx.supabase, {
        accountId: ctx.accountId,
        userId: ctx.userId,
        agentId,
        skill,
        input: data,
        contextId: typeof params.contextId === 'string' ? params.contextId : undefined,
      });
      return rpcResult(id, task);
    }

    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    if (err instanceof ApiError) return toApiErrorResponse(err);
    return toErrorResponse(err);
  }
}

export async function GET(request: Request) {
  try {
    await requireA2AAuth(request, 'viewer');
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      agents: listAgentIds().map((agentId) => ({
        id: agentId,
        card: `${origin}/api/a2a/${agentId}/agent-card.json`,
      })),
    });
  } catch (err) {
    if (err instanceof ApiError) return toApiErrorResponse(err);
    return toErrorResponse(err);
  }
}
