import { describe, expect, it } from "vitest";
import { parseSignInEmail } from "./sign-in-email";

describe("parseSignInEmail", () => {
  it("accepts a full email", () => {
    expect(parseSignInEmail("maya@cedarline.example")).toEqual({
      email: "maya@cedarline.example",
    });
  });

  it("does not invent a domain for a local-part", () => {
    expect(parseSignInEmail("maya")).toEqual({
      error: "Enter a full email address. Sign in does not append a domain.",
    });
  });

  it("rejects a trailing at-sign", () => {
    expect(parseSignInEmail("maya@")).toEqual({
      error: "Enter a full email address. Sign in does not append a domain.",
    });
  });
});
