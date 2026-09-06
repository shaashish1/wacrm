import type { Metadata } from "next";
import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "AudienceGate terms. Unofficial WhatsApp Web pairing is a ban risk, not a warranty.",
  robots: { index: true, follow: true },
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="px-4 py-12 sm:px-8 sm:py-16">
        <article className="mx-auto max-w-[68ch]">
          <h1 className="font-heading text-[36px] leading-[44px] font-semibold tracking-tight">
            Terms
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated 6 September 2026
          </p>

          <h2 className="font-heading mt-10 text-lg font-semibold">
            Using AudienceGate
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            AudienceGate is a WhatsApp campaign CRM with a consent gate. You
            may use it only if you have lawful permission to message each
            person you schedule. Group extract is not consent. STOP must be
            honored. If you do not agree, do not use the product.
          </p>

          <h2 className="font-heading mt-10 text-lg font-semibold">
            Unofficial WhatsApp Web
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            QR pairing uses unofficial WhatsApp Web. Meta can restrict or ban
            a number. Pace settings are pacing, not a ban warranty. You accept
            that risk when you connect that path. Official Cloud API is a
            separate connection.
          </p>

          <h2 className="font-heading mt-10 text-lg font-semibold">
            Acceptable use
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Do not send unsolicited campaigns, clinical detail, or content that
            breaks WhatsApp or applicable marketing law. You are responsible
            for the send set and the copy.
          </p>

          <h2 className="font-heading mt-10 text-lg font-semibold">
            Liability
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            To the extent the law allows, the operator is not liable for
            indirect loss, account restriction, or data loss from your use of
            the service or an unofficial connection.
          </p>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
