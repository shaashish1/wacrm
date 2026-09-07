"use client";

import type { Deal } from "@/types";

/**
 * Honest deal counts from the loaded board. No weighted forecast,
 * no invented close rates.
 */
export function DealsSummary({ deals }: { deals: Deal[] }) {
  const open = deals.filter((d) => d.status !== "won" && d.status !== "lost");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = (d: Deal) => {
    const ts = d.updated_at ?? d.created_at;
    return ts ? new Date(ts) >= monthStart : false;
  };
  const won = deals.filter((d) => d.status === "won" && thisMonth(d)).length;
  const lost = deals.filter((d) => d.status === "lost" && thisMonth(d)).length;

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <Fact label="Open" value={String(open.length)} hint="On this board" />
      <Fact label="Won this month" value={String(won)} hint="From deal status" />
      <Fact label="Lost this month" value={String(lost)} hint="From deal status" />
    </section>
  );
}

function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="font-heading mt-1 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
