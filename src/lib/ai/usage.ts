import { getSql } from "@/lib/db";
import type { AiCallContext } from "@/lib/ai/types";

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function logModelUsage(
  context: AiCallContext,
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd?: number | null;
  },
) {
  const sql = getSql();
  await sql`
    insert into model_usage (
      provider,
      model,
      task_type,
      creator_id,
      video_id,
      weekly_digest_id,
      input_tokens,
      output_tokens,
      estimated_cost_usd
    )
    values (
      ${context.provider},
      ${context.model},
      ${context.taskType},
      ${context.creatorId ?? null},
      ${context.videoId ?? null},
      ${context.weeklyDigestId ?? null},
      ${usage.inputTokens},
      ${usage.outputTokens},
      ${usage.estimatedCostUsd ?? null}
    )
  `;
}

export async function getMonthlyAiSpend() {
  const sql = getSql();
  const rows = await sql<{ total: string | null }[]>`
    select coalesce(sum(estimated_cost_usd), 0)::text as total
    from model_usage
    where created_at >= date_trunc('month', now())
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function canSpendOnOptionalAssets() {
  const budget = Number(process.env.MONTHLY_AI_BUDGET_USD ?? 25);
  const spend = await getMonthlyAiSpend();
  return spend < budget;
}
