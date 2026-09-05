"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { useTranslations } from "next-intl";

const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/notifications": "notifications",
  "/contacts": "audience",
  "/pipelines": "deals",
  "/broadcasts": "broadcasts",
  "/campaigns": "campaigns",
  "/automations": "automations",
  "/settings": "settings",
  "/flows": "flows",
  "/agents": "agents",
  "/wa-groups": "waGroups",
  "/contact-groups": "contactGroups",
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => pathname.startsWith(path));
  return match ? match[1] : "dashboard";
}

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const titleKey = getPageTitleKey(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t("openMenu")}
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="font-heading truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {t(titleKey)}
        </h1>
      </div>

      <ModeToggle />
    </header>
  );
}
