import type { Capability } from "@lemnaria/configurator-domain";

import { SESSION_ENDPOINT } from "@/account/session/use-account-session";
import { NO_REFERRER_POLICY } from "@/account/send-account-request";

import {
  isBlankText,
  type ProfileBlanks,
  type ProfileOffer,
} from "./contact-form-model";

// The two reads that decide and fill a contact form's prefill. Both are GETs of the signed-in account's own routes;
// neither is sent for a visitor beyond the session read, and neither answer is kept anywhere but the form's memory.

const PROFILE_ENDPOINT = "/api/account/profile";

/** The own-design capability, held only by a confirmed client: the profile is read for a session that lists it, and for
 *  no other (staff and an unconfirmed address hold the profile route's own capability too). The header's client test
 *  asks for `design.read.own` instead: it decides what to offer, while this decides whose profile may be filled, which
 *  is the capability the server's own fill checks. see ADR 0179 d1. */
const PREFILL_CAPABILITY: Capability = "design.edit.own";

/** `unknown` is a read that failed or answered something unreadable: it says nothing about who is signed in. */
export type PrefillSession =
  | { readonly kind: "client"; readonly email: string }
  | { readonly kind: "not-client" }
  | { readonly kind: "unknown" };

/** The signed-in account's optional details, `null` for one never given. */
export interface AccountProfile {
  readonly name: string | null;
  readonly address: string | null;
  readonly phone: string | null;
}

/** What the form offers its fields: a blank detail is the empty text, and the address is the form's locality. */
export function offerOf(profile: AccountProfile): ProfileOffer {
  return {
    name: profile.name ?? "",
    phone: profile.phone ?? "",
    locality: profile.address ?? "",
  };
}

export function blanksOf(profile: AccountProfile): ProfileBlanks {
  return {
    name: isBlankText(profile.name),
    phone: isBlankText(profile.phone),
    locality: isBlankText(profile.address),
  };
}

const UNKNOWN_SESSION: PrefillSession = { kind: "unknown" };
const NOT_A_CLIENT: PrefillSession = { kind: "not-client" };

export async function readPrefillSession(): Promise<PrefillSession> {
  const body = await readJsonOf(SESSION_ENDPOINT);
  return body === undefined ? UNKNOWN_SESSION : sessionFrom(body);
}

/** The profile, or nothing for any answer that is not a `200` with the three details. */
export async function readAccountProfile(): Promise<
  AccountProfile | undefined
> {
  const body = await readJsonOf(PROFILE_ENDPOINT);
  return body === undefined ? undefined : profileFrom(body);
}

function sessionFrom(body: unknown): PrefillSession {
  if (typeof body !== "object" || body === null) return UNKNOWN_SESSION;
  const { state, email, capabilities } = body as Record<string, unknown>;
  if (state === "anonymous") return NOT_A_CLIENT;
  if (state !== "signed-in" || typeof email !== "string")
    return UNKNOWN_SESSION;
  if (!Array.isArray(capabilities)) return UNKNOWN_SESSION;
  return capabilities.includes(PREFILL_CAPABILITY)
    ? { kind: "client", email }
    : NOT_A_CLIENT;
}

function profileFrom(body: unknown): AccountProfile | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { name, address, phone } = body as Record<string, unknown>;
  if (!isTextOrNull(name) || !isTextOrNull(address) || !isTextOrNull(phone)) {
    return undefined;
  }
  return { name, address, phone };
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** The body of a `200`, or nothing: a refusal, a failure and unreadable text are all "no answer". */
async function readJsonOf(path: string): Promise<unknown> {
  try {
    const response = await fetch(path, { referrerPolicy: NO_REFERRER_POLICY });
    if (!response.ok) return undefined;
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}
