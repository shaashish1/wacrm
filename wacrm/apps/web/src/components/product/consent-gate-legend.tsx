import { cn } from "@/lib/utils";

export function ConsentGateLegend({
  className,
}: {
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-5", className)}>
      <h2 className="font-heading text-base font-semibold text-foreground">
        Consent gate
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Extract is stored. It is not a send list. Audience is the contact
        group with active WhatsApp consent, not opted out. Compliance can
        refuse the send.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <GateCol
          title="Eligible"
          accent="sky"
          lines={["Landing yes", "Not opted out", "Can be scheduled"]}
        />
        <GateCol
          title="Need consent"
          lines={["Extract only", "Stays in the book", "Out of send"]}
        />
        <GateCol
          title="STOP"
          accent="refuse"
          lines={["Honored immediately", "Never re-ask in-thread", "Out of send"]}
        />
      </div>
    </section>
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

export function ConsentLabel({
  state,
}: {
  state: "eligible" | "need_consent" | "stop";
}) {
  if (state === "stop") {
    return (
      <span className="font-heading text-xs font-semibold text-red-400">
        STOP
      </span>
    );
  }
  if (state === "eligible") {
    return (
      <span className="font-heading text-xs font-semibold text-primary">
        Eligible
      </span>
    );
  }
  return (
    <span className="font-heading text-xs font-semibold text-muted-foreground">
      Need consent
    </span>
  );
}
