import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import type { MintVisitor, RequestVisitor } from "@lemnaria/persistence";
import type { NextRequest, NextResponse } from "next/server";

import { sha256Hex } from "./sha256-hex";
import { readVisitorRotationSecret } from "./visitor-rotation-secret";

/**
 * The one visitor cookie (ADR 0114 decision 1). Its name carries the `__Host-` prefix so the
 * browser itself enforces `Secure`, `Path=/` and no `Domain` — a sibling subdomain cannot set or
 * overwrite it (cookie tossing), and it is never sent beyond this host. That enforcement is also
 * why `cookies.delete` must never be used for this name: Next's `delete` serialises as `Set-Cookie`
 * with no `Secure` attribute (`next/dist/compiled/@edge-runtime/cookies`), and the browser silently
 * ignores a `__Host-` cookie set without one — the clear would look like it worked and would not
 * (M7 wave 7E3a plan, G7/G8). `clearVisitorCookie` below is the only way this name is ever cleared.
 */
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";

/** 256 bits from the platform CSPRNG, the same source and width `write-token.ts` uses and for the
 *  same reason: a secret drawn from `Math.random` is not a secret. */
const VISITOR_TOKEN_BYTES = 32;

/** Thirty days, sliding, refreshed by every successful save — ADR 0114 decision 1's lifetime row,
 *  which restates ADR 0019 decision 7's retention window rather than inventing a new number. */
const VISITOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Exactly what `randomBytes(32).toString("base64url")` produces: 32 bytes is 256 bits, and
 *  base64url spends 6 bits per character with no `=` padding, so the length is fixed at
 *  `ceil(256 / 6) = 43`. Also the one predicate that tells a well-formed carried cookie from a
 *  malformed one — D1's whole reuse-or-mint decision rests on this single check. */
const WELL_FORMED_VISITOR_VALUE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Every attribute both `setVisitorCookie` and `clearVisitorCookie` emit, drawn from **one**
 * constant so the two can never drift apart (M7 wave 7E3a D4) — a clear whose attributes differed
 * from the set would not necessarily match the cookie the browser is holding, and a `__Host-`
 * cookie that does not match on `Path` and `Secure` is not cleared at all, it is ignored.
 *
 * No environment conditional on `Secure`: browsers treat `http://localhost` as a secure context, so
 * local development and Playwright keep working without one (measured, criterion 6).
 */
const VISITOR_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

/** The label HMAC-SHA256 is keyed and domain-separated with (ADR 0114 Amendment H4) — a trailing
 *  NUL so no carried value, however chosen, can be crafted to collide with the label itself. */
const VISITOR_ROTATION_HMAC_LABEL = "lemnaria-visitor-rotation-v1\0";

/**
 * A minted visitor identity: the tagged instruction `mint` needs to store it, and every value that
 * instruction might resolve to, keyed by its own hash (ADR 0114 Amendment H1 / H4). `mint` reports
 * back which hash it actually stored, and `valueByHash` is what lets the caller find that value's
 * own preimage — the one the repository never learns, because it stores hashes only.
 */
export interface ResolvedVisitor {
  readonly mintVisitor: MintVisitor;
  readonly valueByHash: ReadonlyMap<string, string>;
}

/**
 * D1/H4's rotation decision, made once and handed to both the repository insert and the cookie.
 *
 * **Every mint reads `VISITOR_ROTATION_SECRET` first, whether or not this browser carried a
 * value** (Amendment H4's own table): a misconfigured secret must fail the very first mint, not
 * only a returning visitor's.
 *
 * **A well-formed carried value `O` resolves two candidates, never one.** `N_det = HMAC(secret, O)`
 * converges every concurrent mint from the same browser onto one value; `N_rand` is a fresh random
 * value, used when the repository's own condition (a)/(b) check finds no convergence to join
 * (Amendment H4). Both are handed to the repository as `mintVisitor`, and both are indexed in
 * `valueByHash` so whichever one the repository reports as stored can be looked up by its hash —
 * this function does not, and cannot, decide which one is used; that decision needs the database's
 * own snapshot, which only the repository's statement has.
 *
 * **An absent or malformed carried value has nothing to converge**, and resolves to a single fresh
 * random value the same way it always has.
 *
 * Reads the cookie only — it neither sets nor clears anything, so a caller can decide whether to
 * proceed (D6's cross-site refusal runs first) before any state changes.
 */
export function resolveVisitorForMint(
  request: Pick<NextRequest, "cookies">,
): ResolvedVisitor {
  const secret = readVisitorRotationSecret();
  const carried = readVisitorValue(request.cookies);
  const randomValue = randomBytes(VISITOR_TOKEN_BYTES).toString("base64url");
  const randomHash = sha256Hex(randomValue);

  if (carried === undefined || !WELL_FORMED_VISITOR_VALUE.test(carried)) {
    return {
      mintVisitor: { kind: "fresh", visitorHash: randomHash },
      valueByHash: new Map([[randomHash, randomValue]]),
    };
  }

  const deterministicValue = deriveDeterministicVisitorValue(secret, carried);
  const deterministicHash = sha256Hex(deterministicValue);
  return {
    mintVisitor: {
      kind: "rotate",
      detVisitorHash: deterministicHash,
      randVisitorHash: randomHash,
      fromVisitorHash: sha256Hex(carried),
    },
    valueByHash: new Map([
      [deterministicHash, deterministicValue],
      [randomHash, randomValue],
    ]),
  };
}

/** `N_det = HMAC(secret, O)` (ADR 0114 Amendment H4). The key is decoded from the secret's own
 *  base64url encoding, never used as raw text — the secret and a visitor value share an encoding,
 *  not a byte length. The output is base64url of the 32-byte tag, which is already a well-formed
 *  visitor value with no further encoding step. */
function deriveDeterministicVisitorValue(
  secret: string,
  carried: string,
): string {
  const key = Buffer.from(secret, "base64url");
  return createHmac("sha256", key)
    .update(VISITOR_ROTATION_HMAC_LABEL + carried, "utf8")
    .digest("base64url");
}

/** Sets the visitor cookie to `value`, with a fresh 30-day `Max-Age`. The only two callers are the
 *  mint (D1) and `refreshVisitorCookie`; nothing else may set this cookie. */
export function setVisitorCookie(response: NextResponse, value: string): void {
  response.cookies.set(VISITOR_COOKIE_NAME, value, {
    ...VISITOR_COOKIE_ATTRIBUTES,
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * A successful save's refresh: re-emits the **request's own** well-formed value, so the cookie's
 * lifetime slides with use exactly as the write-token cookie's does. Never mints — an absent or
 * malformed value is left alone, because minting here would hand a browser that arrived with no
 * identity (or a tampered one) a fresh one on the strength of a save to a design it may not even
 * own, which is not this function's decision to make.
 *
 * **Callers must gate this on `saveAuthorized`'s `ownsVisitor` (M7 wave 7E3b D3 / Amendment H3)
 * before calling it at all.** A request's value can be well-formed and still not be the row's
 * current one — another tab may have rotated it away between the read and this write — and
 * re-emitting it then would lock the browser out of every design it owns. This function's own
 * well-formedness check is not a substitute for that gate; it only keeps this function total.
 */
export function refreshVisitorCookie({
  request,
  response,
}: {
  request: Pick<NextRequest, "cookies">;
  response: NextResponse;
}): void {
  const carried = readVisitorValue(request.cookies);
  if (carried === undefined || !WELL_FORMED_VISITOR_VALUE.test(carried)) return;
  setVisitorCookie(response, carried);
}

/**
 * Clears the visitor cookie — the resume routes' only tool for "this browser's identity matches no
 * design" (D4). Emits the same attributes `setVisitorCookie` does, with `Max-Age=0`, and **never**
 * `response.cookies.delete`, which drops `Secure` and so cannot clear a `__Host-` cookie at all
 * (see the module doc comment).
 */
export function clearVisitorCookie(response: NextResponse): void {
  response.cookies.set(VISITOR_COOKIE_NAME, "", {
    ...VISITOR_COOKIE_ATTRIBUTES,
    maxAge: 0,
  });
}

/**
 * D3: what a resume route read from the cookie, before it decides anything. Three states rather
 * than two, and the distinction is load-bearing for D4 — `absent` never clears (there is nothing to
 * clear and no query is issued), while `malformed` clears *and* issues no query. Collapsing the two
 * the way `resolveVisitorForMint` does for its own purposes would clear a cookie that was never
 * there.
 */
export type CarriedVisitorCookie =
  | { readonly kind: "absent" }
  | { readonly kind: "malformed" }
  | { readonly kind: "well-formed"; readonly hash: string };

/** Reads and shape-checks the cookie for a resume route — never sets or clears anything, exactly
 *  like `resolveVisitorForMint`, so D6-style ordering (decide first, mutate second) stays possible
 *  here too even though nothing currently needs it. */
export function readVisitorCookieForResume(
  cookies: VisitorCookieReader,
): CarriedVisitorCookie {
  const carried = readVisitorValue(cookies);
  if (carried === undefined) return { kind: "absent" };
  if (!WELL_FORMED_VISITOR_VALUE.test(carried)) return { kind: "malformed" };
  return { kind: "well-formed", hash: sha256Hex(carried) };
}

/**
 * D4's own read for the share route: well-formed → hash, `undefined` for anything else. Collapses
 * `readVisitorCookieForResume`'s three states to two on purpose — the share route's refusal is
 * identical whether the cookie is absent or malformed, and issues no query in either case, so the
 * distinction that matters to D4 (resume's clear-vs-leave-alone) buys the share route nothing.
 */
export function readVisitorHash(
  cookies: VisitorCookieReader,
): string | undefined {
  const carried = readVisitorValue(cookies);
  if (carried === undefined || !WELL_FORMED_VISITOR_VALUE.test(carried))
    return undefined;
  return sha256Hex(carried);
}

/**
 * A save's own read (M7 wave 7E3b D3 / Amendment H3): the tagged shape `saveAuthorized` needs to
 * answer whether the request's value is the row's current one, built on `readVisitorHash`'s own
 * collapse of absent and malformed to one case — D3's rule is unconditional either way ("a request
 * without a well-formed cookie still gets no refresh").
 */
export function resolveRequestVisitor(
  cookies: VisitorCookieReader,
): RequestVisitor {
  const hash = readVisitorHash(cookies);
  return hash === undefined
    ? { kind: "absent" }
    : { kind: "present", visitorHash: hash };
}

/** Anything that can be asked for a cookie by name, declared structurally so a caller need not
 *  build a full `NextRequest` — the same shape `write-token.ts`'s `WriteCookieReader` uses. */
export interface VisitorCookieReader {
  get(name: string): { readonly value: string } | undefined;
}

function readVisitorValue(cookies: VisitorCookieReader): string | undefined {
  const value = cookies.get(VISITOR_COOKIE_NAME)?.value;
  return value === undefined || value === "" ? undefined : value;
}
