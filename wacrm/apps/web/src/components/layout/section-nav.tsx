"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SectionNavItem = {
  href: string;
  label: string;
};

export const AUDIENCE_NAV: SectionNavItem[] = [
  { href: "/audience", label: "Audience" },
  { href: "/contacts", label: "People" },
  { href: "/contact-groups", label: "Lists" },
  { href: "/wa-groups", label: "WhatsApp groups" },
];

export const CAMPAIGNS_NAV: SectionNavItem[] = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/broadcasts", label: "Broadcasts" },
];

export function SectionNav({
  items,
  label,
}: {
  items: SectionNavItem[];
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
