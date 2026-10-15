import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// `node:crypto`'s ESM namespace is frozen, so `vi.spyOn` can't wrap its export directly — `vi.mock`
// intercepts the module at resolution time instead. The real implementation still runs; the spy
// only records that the platform CSPRNG is what produced the token.
const randomBytesSpy = vi.hoisted(() => vi.fn());
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  randomBytesSpy.mockImplementation(actual.randomBytes);
  return { ...actual, randomBytes: randomBytesSpy };
});

const { mintWriteToken, readWriteTokenHash, setWriteTokenCookie } =
  await import("../../../src/lib/server/write-token");

const DESIGN_ID = "V1StGXR8Z5jdHi6BmyT_a";
const OTHER_DESIGN_ID = "kZ9qLm3XnP0rTuVwYbCdE";
const COOKIE_NAME = `lemnaria_write_token_${DESIGN_ID}`;
const THIRTY_DAYS_IN_SECONDS = 2_592_000;
const SAMPLE_SIZE = 10_000;

function setCookieHeaderFor(designId: string, token: string): string {
  const response = NextResponse.json({ id: designId });
  setWriteTokenCookie(response, { designId, token });
  return response.headers.get("set-cookie") ?? "";
}

function requestCarrying(cookieHeader: string): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${DESIGN_ID}`, {
    method: "PUT",
    headers: { cookie: cookieHeader },
  });
}

describe("mintWriteToken", () => {
  it("draws its token from the platform CSPRNG, at 256 bits", () => {
    randomBytesSpy.mockClear();

    mintWriteToken();

    expect(randomBytesSpy).toHaveBeenCalledWith(32);
  });

  it("never repeats a token across a large sample", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      tokens.add(mintWriteToken().token);
    }

    expect(tokens.size).toBe(SAMPLE_SIZE);
  });

  it("pairs the token with its SHA-256 digest and nothing else", () => {
    const { token, hash } = mintWriteToken();

    expect(hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(hash).not.toBe(token);
  });

  it("calls no non-cryptographic random source anywhere in the module", () => {
    // Watched as a call rather than searched for as text: `Math["random"]()` is the same source and
    // spells itself past any pattern. Every export is driven, since the claim is about the module.
    const mathRandom = vi.spyOn(Math, "random");

    const { token } = mintWriteToken();
    setCookieHeaderFor(DESIGN_ID, token);
    readWriteTokenHash(requestCarrying(`${COOKIE_NAME}=${token}`), DESIGN_ID);
    const callsToMathRandom = mathRandom.mock.calls.length;
    mathRandom.mockRestore();

    expect(callsToMathRandom).toBe(0);
  });
});

describe("setWriteTokenCookie", () => {
  it("marks the cookie HttpOnly, Secure and SameSite=Lax", () => {
    const header = setCookieHeaderFor(DESIGN_ID, "token-value");

    expect(header).toMatch(/;\s*HttpOnly/i);
    expect(header).toMatch(/;\s*Secure/i);
    expect(header).toMatch(/;\s*SameSite=lax/i);
  });

  it("expires with ADR 0019's 30-day retention window", () => {
    const header = setCookieHeaderFor(DESIGN_ID, "token-value");

    expect(header).toMatch(
      new RegExp(`;\\s*Max-Age=${String(THIRTY_DAYS_IN_SECONDS)}`),
    );
  });

  it("scopes the cookie to the one design's write path, by name and by path", () => {
    const header = setCookieHeaderFor(DESIGN_ID, "token-value");

    expect(header).toContain(`${COOKIE_NAME}=token-value`);
    expect(header).toMatch(
      new RegExp(`;\\s*Path=/api/designs/${DESIGN_ID}(;|$)`),
    );
  });
});

describe("readWriteTokenHash", () => {
  it("returns the digest of the token the request carries for that design", () => {
    const { token, hash } = mintWriteToken();

    const read = readWriteTokenHash(
      requestCarrying(`${COOKIE_NAME}=${token}`),
      DESIGN_ID,
    );

    expect(read).toBe(hash);
  });

  it("finds nothing when the request carries no cookie at all", () => {
    expect(readWriteTokenHash(requestCarrying(""), DESIGN_ID)).toBeUndefined();
  });

  it("finds nothing when the cookie is present but empty", () => {
    expect(
      readWriteTokenHash(requestCarrying(`${COOKIE_NAME}=`), DESIGN_ID),
    ).toBeUndefined();
  });

  it("does not accept another design's cookie for this design", () => {
    const { token } = mintWriteToken();
    const otherDesignCookie = `lemnaria_write_token_${OTHER_DESIGN_ID}=${token}`;

    expect(
      readWriteTokenHash(requestCarrying(otherDesignCookie), DESIGN_ID),
    ).toBeUndefined();
  });
});
