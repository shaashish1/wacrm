import type { Metadata } from "next";
import { CampaignsProductFrame } from "@/components/campaigns/campaigns-product-frame";
import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Extract is stored. It is not a send list. The Campaigns gate, consent ledger, and specialists that exist.",
  robots: { index: true, follow: true },
};

const LOG = [
  {
    date: "2026-08-31",
    title: "Consent gate",
    body: "Audience is contact group ∩ active WhatsApp consent ∩ not opted out. Extract stays in the CRM and out of send.",
  },
  {
    date: "2026-08-31",
    title: "Compliance can refuse",
    body: "The ledger re-checks at schedule fire. Schedule stays off when the send set is empty.",
  },
  {
    date: "2026-08-31",
    title: "STOP",
    body: "Honored immediately. Never re-asked in-thread.",
  },
  {
    date: "2026-08-31",
    title: "Specialists, not chatbots",
    body: "Compliance, Qualifier, Content, Booking, and Analytics over same-origin A2A. Consult, intro, or tour only.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-[1120px]">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
            /features
          </p>
          <h1 className="font-heading mt-3 max-w-[22ch] text-[36px] leading-[44px] font-semibold tracking-tight text-foreground">
            Extract is stored. It is not a send list.
          </h1>
          <p className="mt-4 max-w-[54ch] text-sm leading-6 text-muted-foreground">
            The same Campaigns surface. QR pairing is unofficial WhatsApp —
            ban risk is real, not a warranty.
          </p>
          <div className="mt-10">
            <CampaignsProductFrame />
          </div>
          <ol className="mt-12 space-y-6 border-t border-border pt-8">
            {LOG.map((row) => (
              <li key={row.title} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                <time className="text-xs text-muted-foreground">{row.date}</time>
                <div>
                  <p className="font-heading text-sm font-semibold text-foreground">
                    {row.title}
                  </p>
                  <p className="mt-1 max-w-[60ch] text-sm leading-6 text-muted-foreground">
                    {row.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
