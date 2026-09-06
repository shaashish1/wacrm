import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <p className="font-heading text-lg font-semibold tracking-tight text-foreground">
            AudienceGate
          </p>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            WhatsApp campaign CRM
          </p>
          <CardTitle className="font-heading text-xl font-semibold tracking-tight text-foreground">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription className="text-muted-foreground">
              {description}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
    >
      {children}
    </div>
  );
}
