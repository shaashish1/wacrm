import type { Metadata } from "next";
import { CampaignsProductFrame } from "@/components/campaigns/campaigns-product-frame";
import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: "AudienceGate",
  description:
    "WhatsApp campaign CRM with a hard consent gate. Extract is stored. It is not a send list.",
  robots: { index: true, follow: true },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#campaigns"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground"
      >
        Skip to campaigns
      </a>
      <MarketingHeader />
      <main className="px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-[1120px]">
          <h1 className="font-heading max-w-[20ch] text-[36px] leading-[44px] font-semibold tracking-tight text-foreground">
            Send only to people who said yes.
          </h1>
          <p className="mt-4 max-w-[54ch] text-sm leading-6 text-muted-foreground">
            Extract is stored. It is not a send list. Compliance can refuse
            the send. STOP is honored and never re-asked in-thread.
          </p>
          <div id="campaigns" className="mt-10">
            <CampaignsProductFrame />
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
