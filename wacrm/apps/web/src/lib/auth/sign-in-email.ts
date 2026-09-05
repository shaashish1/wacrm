/**
 * Sign-in accepts a full email only. Do not append a hidden domain
 * and do not create an account from this path.
 */
export function parseSignInEmail(
  raw: string,
): { email: string } | { error: string } {
  const email = raw.trim();
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return {
      error: "Enter a full email address. Sign in does not append a domain.",
    };
  }
  return { email };
}
