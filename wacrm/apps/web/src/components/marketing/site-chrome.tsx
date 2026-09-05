import Link from "next/link";

export function MarketingHeader() {
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-4 sm:px-8">
      <div className="flex min-w-0 items-baseline gap-3">
        <Link
          href="/"
          className="font-heading text-sm font-semibold tracking-tight text-foreground"
        >
          AudienceGate
        </Link>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          WhatsApp campaign CRM
        </span>
      </div>
      <nav className="flex items-center gap-4 text-sm">
        <Link
          href="/features"
          className="text-muted-foreground hover:text-foreground"
        >
          Features
        </Link>
        <Link
          href="/login"
          className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground"
        >
          Sign in
        </Link>
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border px-4 py-6 text-sm text-muted-foreground sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-heading text-foreground">AudienceGate</span>
        <Link href="/login" className="hover:text-foreground">
          Sign in
        </Link>
        <Link href="/signup" className="hover:text-foreground">
          Create account
        </Link>
      </div>
    </footer>
  );
}
