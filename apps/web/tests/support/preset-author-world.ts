import type { Role } from "@lemnaria/configurator-domain";
import {
  createFakeAccountAndSessionStores,
  type FakeAccountStore,
  type FakeSessionStore,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { vi } from "vitest";

import {
  SESSION_COOKIE_NAME,
  mintSessionValue,
} from "@/lib/server/account/session-cookie";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { sha256Hex } from "@/lib/server/sha256-hex";

/**
 * The accounts and sessions a preset-authoring test signs in with: the persistence package's fakes behind the real
 * session read, the real cookie parse and the real capability table. It is not `account-world`, whose limiter ledger
 * names every bucket a request counts and so rejects the design routes' own write-token buckets.
 */
export interface PresetAuthorWorld {
  readonly accounts: FakeAccountStore;
  readonly sessions: FakeSessionStore;
  /** Moves the database's clock forward, to cross an idle lifetime. */
  readonly advance: (milliseconds: number) => void;
  /** A live session of a new account with this role; `isEmailConfirmed` false leaves the address unconfirmed. */
  readonly signIn: (account: {
    role: Role;
    isEmailConfirmed?: boolean;
  }) => Promise<SeededPresetSession>;
  /** Makes every session lookup reject, as a store that is down does. */
  readonly breakSessionLookups: () => void;
}

export interface SeededPresetSession {
  readonly accountId: string;
  /** The `Cookie` request header value. */
  readonly cookie: string;
  readonly tokenHash: string;
}

export const MILLISECONDS_PER_DAY = 86_400_000;
/** Unseen this long, an administrator's session ends: the production table's own figure, so a change to it is seen. */
export const ADMINISTRATOR_IDLE_LIFETIME_MS =
  IDLE_LIFETIME_SECONDS_BY_ROLE.administrator * 1000;
const ABSOLUTE_LIFETIME_MS = 7 * MILLISECONDS_PER_DAY;
/** The argon2id shape the stores demand, of no password: nothing here checks one. */
const PASSWORD_HASH_STAND_IN =
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export const AUTHOR_DESIGN_ID = "V1StGXR8Z5jdHi6BmyT_a";
export const AUTHOR_WRITE_TOKEN = "write-token-for-the-design-under-test";
export const AUTHOR_VISITOR_VALUE = "a".repeat(43);
export const AUTHOR_WRITE_COOKIE_NAME = `lemnaria_write_token_${AUTHOR_DESIGN_ID}`;
export const AUTHOR_VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
/** The `Cookie` pairs that prove a design's own write token and visitor, with no session beside them. */
export const AUTHOR_CREDENTIALS_COOKIE = `${AUTHOR_WRITE_COOKIE_NAME}=${AUTHOR_WRITE_TOKEN}; ${AUTHOR_VISITOR_COOKIE_NAME}=${AUTHOR_VISITOR_VALUE}`;

const PRESET_ROUTE_URL = "https://example.test/api/designs/any/preset";

/** A request whose only header is this `Cookie` value. */
export function requestCarrying(
  cookie: string,
  url: string = PRESET_ROUTE_URL,
): NextRequest {
  return new NextRequest(url, { headers: { cookie } });
}

let current: PresetAuthorWorld | undefined;

export function freshPresetAuthorWorld(): PresetAuthorWorld {
  let offsetMs = 0;
  const now = () => new Date(Date.now() + offsetMs);
  const { accounts, sessions } = createFakeAccountAndSessionStores(now);
  let accountCount = 0;

  async function signIn({
    role,
    isEmailConfirmed = true,
  }: {
    role: Role;
    isEmailConfirmed?: boolean;
  }): Promise<SeededPresetSession> {
    accountCount += 1;
    const email = `${role}-${String(accountCount)}@lemnaria.test`;
    const created = await accounts.createUnverified({
      email,
      emailNormalForm: email,
      phone: undefined,
      locale: "ro",
      privacyNoticeVersion: "placeholder",
      passwordHash: PASSWORD_HASH_STAND_IN,
    });
    if (created.kind !== "created") throw new Error("seed: address taken");
    if (isEmailConfirmed) await confirmEmail(created.accountId);
    if (role !== "client") accounts.setRoleOf(created.accountId, role);
    return startSession(created.accountId);
  }

  async function confirmEmail(accountId: string): Promise<void> {
    const tokenHash = sha256Hex(`verify-${accountId}`);
    await accounts.issueToken({
      accountId,
      purpose: "verify-email",
      tokenHash,
      expiresAt: new Date(now().getTime() + MILLISECONDS_PER_DAY),
    });
    await accounts.confirmEmail({
      tokenHash,
      accountId,
      verifiedPasswordHash: PASSWORD_HASH_STAND_IN,
    });
  }

  async function startSession(accountId: string): Promise<SeededPresetSession> {
    const value = mintSessionValue();
    const tokenHash = sha256Hex(value);
    const created = await sessions.create({
      tokenHash,
      accountId,
      expectedPasswordHash: PASSWORD_HASH_STAND_IN,
      absoluteExpiresAt: new Date(now().getTime() + ABSOLUTE_LIFETIME_MS),
    });
    if (created.kind !== "created") throw new Error("seed: session refused");
    return { accountId, cookie: `${SESSION_COOKIE_NAME}=${value}`, tokenHash };
  }

  current = {
    accounts,
    sessions,
    advance: (milliseconds) => {
      offsetMs += milliseconds;
    },
    signIn,
    breakSessionLookups: () => {
      vi.spyOn(sessions, "findLive").mockRejectedValue(
        new Error("session store is down"),
      );
    },
  };
  return current;
}

/** The module a test's `vi.mock("@/lib/server/account/session-store-instance", ...)` answers with. */
export function presetAuthorSessionStoreModule() {
  return { getSessionStore: () => requireWorld().sessions };
}

function requireWorld(): PresetAuthorWorld {
  if (current === undefined) {
    throw new Error("No world: call freshPresetAuthorWorld() in beforeEach");
  }
  return current;
}
