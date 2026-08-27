/** Structured worker logs. Debug ingest / local file sinks are not used in production. */
export function agentLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId?: string,
  runId?: string,
) {
  console.log(`[Worker] ${location}: ${message}`, {
    ...(hypothesisId ? { hypothesisId } : {}),
    ...(runId ? { runId } : {}),
    ...data,
  });
}
