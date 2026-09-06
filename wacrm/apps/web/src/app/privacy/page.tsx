import type { Metadata } from "next";
import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What AudienceGate stores: account, contacts, consent, and message history you put in the CRM.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="px-4 py-12 sm:px-8 sm:py-16">
        <article className="mx-auto max-w-[68ch]">
          <h1 className="font-heading text-[36px] leading-[44px] font-semibold tracking-tight">
            Privacy
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated 6 September 2026
          </p>

          <h2 className="font-heading mt-10 text-lg font-semibold">
            What is stored
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            AudienceGate stores the account you create (name, email) and the
            CRM data you import or collect: contacts, groups, consent records,
            campaigns, and inbox history. Tenant landings collect the fields
            shown on that page, including STOP and consent.
          </p>

          <h2 className="font-heading mt-10 text-lg font-semibold">
            How it is used
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            That data runs the operator app: inbox, audience, consented
            campaigns, and deals. It is not used to invent a send list from
            extract. Extract stays in the CRM until a lawful yes.
          </p>

          <h2 className="font-heading mt-10 text-lg font-semibold">
            Processors
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A self-hosted instance typically uses Supabase for database and
            auth. If you enable Cloud API, Meta receives the messages you
            send. If you enable a specialist model key, that provider receives
            the prompts you send. Payment processors apply only if billing is
            turned on.
          </p>

          <h2 className="font-heading mt-10 text-lg font-semibold">
            Access and deletion
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            You can ask the operator who hosts your instance for a copy or
            deletion of account and CRM data. Active databases are cleared
            within 30 days after an account delete request is completed.
          </p>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
