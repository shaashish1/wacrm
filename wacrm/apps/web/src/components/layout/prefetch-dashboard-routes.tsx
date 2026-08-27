"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DASHBOARD_NAV_HREFS } from "@/lib/dashboard-nav";

function isDashboardPath(pathname: string): boolean {
  return DASHBOARD_NAV_HREFS.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

/**
 * Warms Next.js App Router destinations so the first sidebar click does
 * not stall on on-demand compile. Dashboard pages are dynamic (auth
 * cookies), and Next 15+ skips viewport prefetch for those unless
 * `prefetch={true}` is set — this covers the same list on layout mount.
 */
export function PrefetchDashboardRoutes() {
  const router = useRouter();
  const pathname = usePathname();
  const inDashboard = isDashboardPath(pathname);
  const warmedRef = useRef(false);

  useEffect(() => {
    if (!inDashboard) return;

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const warm = () => {
      if (warmedRef.current) return;
      warmedRef.current = true;
      for (const href of DASHBOARD_NAV_HREFS) {
        void router.prefetch(href);
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(warm, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(warm, 400);
    }

    return () => {
      if (idleId !== undefined) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [inDashboard, router]);

  return null;
}
