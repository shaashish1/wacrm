import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Description + actions under the shell header title.
 * The header owns the page name — do not put a second h1 here.
 */
export function PageIntro({
  description,
  actions,
  children,
  className,
}: {
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  if (!description && !actions && !children) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {description ? (
          <p className="max-w-[60ch] text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
