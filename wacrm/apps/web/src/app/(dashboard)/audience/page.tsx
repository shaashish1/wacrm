"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageIntro } from "@/components/layout/page-intro";
import { AUDIENCE_NAV, SectionNav } from "@/components/layout/section-nav";
import {
  ConsentGateLegend,
} from "@/components/product/consent-gate-legend";

type Counts = {
  people: number | null;
  lists: number | null;
  waGroups: number | null;
  stop: number | null;
  eligible: number | null;
};

export default function AudiencePage() {
  const { accountId } = useAuth();
  const [counts, setCounts] = useState<Counts>({
    people: null,
    lists: null,
    waGroups: null,
    stop: null,
    eligible: null,
  });
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();

    const [peopleRes, stopRes, consentRes, listsRes, waRes] =
      await Promise.allSettled([
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
          .eq("opted_out", true),
        supabase
          .from("consents")
          .select("contact_id")
          .eq("account_id", accountId)
          .eq("channel", "whatsapp")
          .is("revoked_at", null),
        fetch("/api/contact-groups").then((r) => r.json()),
        fetch("/api/whatsapp/groups").then((r) => r.json()),
      ]);

    const people =
      peopleRes.status === "fulfilled" ? (peopleRes.value.count ?? 0) : null;
    const stop =
      stopRes.status === "fulfilled" ? (stopRes.value.count ?? 0) : null;

    let eligible: number | null = null;
    if (consentRes.status === "fulfilled" && !consentRes.value.error) {
      const ids = new Set(
        (consentRes.value.data ?? [])
          .map((row) => row.contact_id as string | null)
          .filter((id): id is string => !!id),
      );
      if (stopRes.status === "fulfilled" && !stopRes.value.error && ids.size > 0) {
        const { data: stopped } = await supabase
          .from("contacts")
          .select("id")
          .eq("account_id", accountId)
          .eq("opted_out", true)
          .in("id", [...ids]);
        const stoppedSet = new Set((stopped ?? []).map((r) => r.id as string));
        eligible = [...ids].filter((id) => !stoppedSet.has(id)).length;
      } else {
        eligible = ids.size;
      }
    }

    const lists =
      listsRes.status === "fulfilled" && Array.isArray(listsRes.value?.data)
        ? listsRes.value.data.length
        : null;
    const waGroups =
      waRes.status === "fulfilled" && Array.isArray(waRes.value?.groups)
        ? waRes.value.groups.length
        : null;

    setCounts({ people, lists, waGroups, stop, eligible });
    setLoaded(true);
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <SectionNav items={AUDIENCE_NAV} label="Audience" />
      <PageIntro description="People, lists, and WhatsApp groups in one book. Extract is stored. It is not a send list. An imported book is not opted in." />

      <div className="grid gap-3 md:grid-cols-3">
        <AudienceCard
          href="/contacts"
          kicker="People"
          title="The book"
          body="Names and phones you hold. Import does not grant consent."
          stat={loaded ? formatCount(counts.people) : "…"}
          statLabel="in the book"
        />
        <AudienceCard
          href="/contact-groups"
          kicker="Lists"
          title="Segments"
          body="Static lists and smart segments. A list is not a send set."
          stat={loaded ? formatCount(counts.lists) : "…"}
          statLabel="lists"
        />
        <AudienceCard
          href="/wa-groups"
          kicker="WhatsApp groups"
          title="Extract"
          body="Group membership is stored as extract. Extract is not consent."
          stat={loaded ? formatCount(counts.waGroups) : "…"}
          statLabel="groups synced"
        />
      </div>

      <ConsentGateLegend />

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Consent state
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Counts below are from this account’s ledger. Missing numbers
          stay blank — they are not guessed.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Fact
            label="Eligible"
            value={loaded ? formatCount(counts.eligible) : "…"}
            hint="Active WhatsApp consent · not opted out"
            accent="sky"
          />
          <Fact
            label="Need consent"
            value={
              loaded
                ? formatNeedConsent(counts.people, counts.eligible, counts.stop)
                : "…"
            }
            hint="In the book · no landing yes"
          />
          <Fact
            label="STOP"
            value={loaded ? formatCount(counts.stop) : "…"}
            hint="Opted out · never re-ask in-thread"
            accent="refuse"
          />
        </dl>
      </section>
    </div>
  );
}

function formatCount(n: number | null): string {
  return n == null ? "—" : String(n);
}

function formatNeedConsent(
  people: number | null,
  eligible: number | null,
  stop: number | null,
): string {
  if (people == null || eligible == null || stop == null) return "—";
  return String(Math.max(0, people - eligible - stop));
}

function AudienceCard({
  href,
  kicker,
  title,
  body,
  stat,
  statLabel,
}: {
  href: string;
  kicker: string;
  title: string;
  body: string;
  stat: string;
  statLabel: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/40"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
        {kicker}
      </p>
      <h2 className="font-heading mt-2 text-base font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      <p className="mt-4 font-heading text-2xl font-semibold tabular-nums text-foreground">
        {stat}
      </p>
      <p className="text-xs text-muted-foreground">{statLabel}</p>
    </Link>
  );
}

function Fact({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "sky" | "refuse";
}) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <dt
        className={
          accent === "sky"
            ? "font-heading text-sm font-semibold text-primary"
            : accent === "refuse"
              ? "font-heading text-sm font-semibold text-red-400"
              : "font-heading text-sm font-semibold text-muted-foreground"
        }
      >
        {label}
      </dt>
      <dd className="mt-1 font-heading text-xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
