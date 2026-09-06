"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthAlert, AuthShell } from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      },
    );

    if (resetError) {
      console.error(
        "[forgot-password] resetPasswordForEmail failed:",
        resetError.message,
      );
      setError(
        resetError.message === "Error sending recovery email"
          ? "Could not send email. Self-hosted Auth usually needs SMTP configured (GOTRUE_SMTP_HOST / USER / PASS on the GoTrue service). Sign in with your existing password, or create a new account if email confirmation is disabled."
          : resetError.message,
      );
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <AuthShell
        title="Check your email"
        description={
          <>
            If an account exists for{" "}
            <span className="text-foreground">{email}</span>, we sent a reset
            link. This page does not create an account.
          </>
        }
      >
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full")}
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset password"
      description="Enter the email you already use. This sends a reset link. It does not create an account."
    >
      <form onSubmit={handleReset} className="flex flex-col gap-4">
        {error && <AuthAlert>{error}</AuthAlert>}

        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-muted-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={Boolean(error)}
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 h-11 w-full">
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Reset password means send a reset link. Sign in and create account stay
        separate.
      </p>

      <Link
        href="/login"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "mt-6 h-11 w-full",
        )}
      >
        Back to sign in
      </Link>
    </AuthShell>
  );
}
