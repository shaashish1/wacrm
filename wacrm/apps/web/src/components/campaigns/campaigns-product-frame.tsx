import { cn } from "@/lib/utils";

export type CampaignRow = {
  name: string;
  status: "draft" | "paused" | "active";
  audience: "Need consent" | "Eligible" | "Extract only";
  gate: "—" | "Ready" | "Out of send";
};

export const DEMO_CAMPAIGN_ROWS: CampaignRow[] = [
  {
    name: "Consult intro — weekday",
    status: "draft",
    audience: "Need consent",
    gate: "—",
  },
  {
    name: "Tour follow-up",
    status: "paused",
    audience: "Eligible",
    gate: "Ready",
  },
  {
    name: "Extract book — miami event",
    status: "draft",
    audience: "Extract only",
    gate: "Out of send",
  },
];

const NAV = ["Inbox", "Audience", "Campaigns", "Deals", "Settings"] as const;

function statusLabel(status: CampaignRow["status"]) {
  if (status === "draft") return "Draft";
  if (status === "paused") return "Paused";
  return "Active";
}

/**
 * The operator Campaigns surface. Marketing crops this same frame.
 * Labels only — no invented counts.
 */
export function CampaignsProductFrame({
  rows = DEMO_CAMPAIGN_ROWS,
  selectedName = "Consult intro — weekday",
  accountName = "Maya",
  accountMeta = "Cedarline Wellness",
  className,
}: {
  rows?: CampaignRow[];
  selectedName?: string;
  accountName?: string;
  accountMeta?: string;
  className?: string;
}) {
  const selected = rows.find((r) => r.name === selectedName) ?? rows[0];
  const refused = selected?.audience !== "Eligible";

  return (
    <div
      className={cn(
        "flex min-h-[540px] overflow-hidden rounded-lg border border-border bg-background text-left",
        className,
      )}
    >
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-border px-3 py-5 sm:w-[220px]">
        <p className="font-heading text-sm font-semibold text-foreground">
          AudienceGate
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          WhatsApp campaign CRM
        </p>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Primary">
          {NAV.map((item) => {
            const active = item === "Campaigns";
            return (
              <span
                key={item}
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item}
              </span>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-border pt-3">
          <p className="text-sm text-foreground">{accountName}</p>
          <p className="text-xs text-muted-foreground">{accountMeta}</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-[22px] leading-7 font-semibold tracking-tight text-foreground">
              Campaigns
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Consented audience only. Compliance can refuse.
            </p>
          </div>
          <span className="hidden rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground sm:inline">
            New campaign
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">
                  Audience
                </th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                  Gate
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const on = row.name === selected?.name;
                return (
                  <tr
                    key={row.name}
                    className={cn(
                      "border-b border-border last:border-0",
                      on && "bg-muted/60",
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {row.name}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {statusLabel(row.status)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                      {row.audience}
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                      {row.gate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected ? (
          <div className="mt-5 rounded-lg border border-border bg-card p-5">
            <h3 className="font-heading text-base font-semibold text-foreground">
              {selected.name}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {statusLabel(selected.status)} · WhatsApp · consult / intro / tour
            </p>

            {refused ? (
              <div className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3.5 py-3">
                <p className="font-heading text-sm font-semibold text-red-400">
                  Compliance refused this send.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No consented recipients in the audience. Extract is stored.
                  It is not a send list.
                </p>
              </div>
            ) : null}

            <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Send set
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <GateCol
                title="Eligible"
                accent="sky"
                lines={[
                  "Active WhatsApp consent",
                  "Not opted out",
                  selected.audience === "Eligible" ? "Ready" : "— none in this draft",
                ]}
              />
              <GateCol
                title="Need consent"
                lines={["Extract only", "Stays in CRM", "Out of send"]}
              />
              <GateCol
                title="STOP"
                accent="refuse"
                lines={[
                  "Honored immediately",
                  "Never re-ask in-thread",
                  "—",
                ]}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground",
                  refused && "opacity-45",
                )}
              >
                Schedule
              </span>
              <span className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium text-foreground">
                Keep as draft
              </span>
              {refused ? (
                <span className="text-xs text-muted-foreground">
                  Schedule stays off until the send set is eligible.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GateCol({
  title,
  lines,
  accent,
}: {
  title: string;
  lines: string[];
  accent?: "sky" | "refuse";
}) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-3">
      <p
        className={cn(
          "font-heading text-sm font-semibold",
          accent === "sky" && "text-primary",
          accent === "refuse" && "text-red-400",
          !accent && "text-muted-foreground",
        )}
      >
        {title}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
