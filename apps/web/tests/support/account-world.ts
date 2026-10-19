import { createHash } from "node:crypto";

import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import {
  FakeAccountKitchenStore,
  FakeSentMarkStore,
  createFakeAccountAndSessionStores,
  generateDesignId,
  type FakeAccountStore,
  type FakeSessionStore,
} from "@lemnaria/persistence";
import { NextRequest, type NextResponse } from "next/server";
import { afterEach, vi } from "vitest";

import {
  SESSION_COOKIE_NAME,
  mintSessionValue,
} from "@/lib/server/account/session-cookie";
import {
  createFakeCustomerMailSender,
  type FakeCustomerMailSender,
} from "@/lib/server/mail/fake-mail-sender";
import { forgetAfterTasks } from "./after-queue";
import { readDigester } from "@/lib/server/digest/digest-secret";
import {
  ALL_LIMIT_POLICIES,
  longestWaitSecondsOf,
} from "@/lib/server/rate-limit/limit-policy";
import type { RateLimitStore } from "@lemnaria/persistence";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

// The account routes' world for a test: the persistence package's own fakes joined as the database joins them, the
// ports a route reaches beyond them (mail, the breach check, the challenge), and a ledger of what the limiter was asked.
// What a test fakes is the database and the network; the route, the session lookup, the limiter's decision and the
// response builders are the real ones. A test file mocks the instance modules with the `...Module()` factories below,
// then calls `freshAccountWorld()` in `beforeEach`.

export const ORIGIN = "https://lemnaria.test";
export const PUBLIC_ORIGIN = "https://lemnaria.example";
export const DEFAULT_PASSWORD = "correct horse battery staple";

export const READ_POLICY_NAME = "read-by-block-per-60-utc-minutes";
export const SAVE_BY_ACCOUNT_POLICY_NAME =
  "design-save-by-account-per-60-utc-minutes";
export const MINT_POLICY_NAME = "design-mint-per-chisinau-day";
export const DUPLICATE_BY_ACCOUNT_POLICY_NAME =
  "design-duplicate-by-account-per-1440-utc-minutes";
export const PROFILE_POLICY_NAME =
  "account-profile-by-account-per-60-utc-minutes";
export const PASSWORD_CHECK_HOUR_POLICY_NAME =
  "account-password-check-by-account-per-60-utc-minutes";
export const PASSWORD_CHECK_DAY_POLICY_NAME =
  "account-password-check-by-account-per-1440-utc-minutes";
export const EMAIL_CHANGE_BY_ACCOUNT_POLICY_NAME =
  "account-email-change-by-account-per-1440-utc-minutes";
export const EMAIL_CHANGE_MAIL_POLICY_NAME =
  "account-email-change-mail-by-address-per-1440-utc-minutes";
export const TOKEN_COMPLETE_POLICY_NAME =
  "account-token-complete-by-block-per-60-utc-minutes";
export const EXPORT_POLICY_NAME =
  "account-export-by-account-per-1440-utc-minutes";

const MILLISECONDS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------------------------------------------------
// The world

type Interceptor = (
  real: () => Promise<unknown>,
  args: readonly unknown[],
) => Promise<unknown>;

export interface AccountWorld {
  readonly accounts: FakeAccountStore;
  readonly sessions: FakeSessionStore;
  readonly kitchens: FakeAccountKitchenStore;
  readonly sentMarks: FakeSentMarkStore;
  readonly mail: FakeCustomerMailSender;
  /** Every port method the route called, in order, as `store.method`. */
  readonly calls: string[];
  /** Each share link revocation a hide or a delete asked for. */
  readonly revokedShareLinks: { designId: string; at: Date }[];
  /** The stores a route reaches, each recording its calls and honouring `intercept`. */
  readonly tracedAccounts: FakeAccountStore;
  readonly tracedSessions: FakeSessionStore;
  readonly tracedKitchens: FakeAccountKitchenStore;
  /** The database's clock, which a test advances. */
  readonly advance: (milliseconds: number) => void;
  readonly now: () => Date;
  /** Replaces the answer of one port method (`accounts.changePassword`) for the rest of the test. */
  readonly intercept: (method: string, interceptor: Interceptor) => void;
  /** Makes one port method reject, with a message that must never reach a response or a log. */
  readonly failOn: (method: string) => void;
  /** What the breach check answers. */
  breach: "breached" | "not-breached" | "unknown";
}

let current: AccountWorld | undefined;

export const DRIVER_FAILURE_MARKER = "DRIVER-FAILURE-MARKER-5531";

export function currentAccountWorld(): AccountWorld {
  if (current === undefined) {
    throw new Error("No account world: call freshAccountWorld() in beforeEach");
  }
  return current;
}

export function freshAccountWorld(): AccountWorld {
  limiterLedger.reset();
  watchTheLimiter();
  forgetAfterTasks();
  hashingLedger.reset();
  let offsetMs = 0;
  const now = () => new Date(Date.now() + offsetMs);
  const { accounts, sessions } = createFakeAccountAndSessionStores(now);
  const revokedShareLinks: AccountWorld["revokedShareLinks"] = [];
  const kitchens = new FakeAccountKitchenStore({
    now,
    revokeShareLinksOf: (designId, at) => {
      revokedShareLinks.push({ designId, at });
    },
  });
  const calls: string[] = [];
  const interceptors = new Map<string, Interceptor>();
  const trace = <Store extends object>(label: string, inner: Store): Store =>
    traced({ label, inner, calls, interceptors });
  const world: AccountWorld = {
    accounts,
    sessions,
    kitchens,
    sentMarks: new FakeSentMarkStore(kitchens),
    mail: createFakeCustomerMailSender(),
    calls,
    revokedShareLinks,
    tracedAccounts: trace("accounts", accounts),
    tracedSessions: trace("sessions", sessions),
    tracedKitchens: trace("kitchens", kitchens),
    advance: (milliseconds) => {
      offsetMs += milliseconds;
    },
    now,
    intercept: (method, interceptor) => {
      interceptors.set(method, interceptor);
    },
    failOn: (method) => {
      interceptors.set(method, () =>
        Promise.reject(new Error(DRIVER_FAILURE_MARKER)),
      );
    },
    breach: "not-breached",
  };
  current = world;
  return world;
}

function traced<Store extends object>({
  label,
  inner,
  calls,
  interceptors,
}: {
  label: string;
  inner: Store;
  calls: string[];
  interceptors: Map<string, Interceptor>;
}): Store {
  return new Proxy(inner, {
    get(target, property) {
      const member: unknown = Reflect.get(target, property, target);
      if (typeof member !== "function" || typeof property !== "string") {
        return member;
      }
      const method = `${label}.${property}`;
      return (...args: unknown[]): unknown => {
        calls.push(method);
        const real = () =>
          Promise.resolve(
            (member as (...rest: unknown[]) => unknown).apply(target, args),
          );
        const interceptor = interceptors.get(method);
        return interceptor === undefined ? real() : interceptor(real, args);
      };
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// vi.mock factories: `vi.mock(id, () => accountStoreModule())` in the test file

export function accountStoreModule() {
  return { getAccountStore: () => currentAccountWorld().tracedAccounts };
}

export function sessionStoreModule() {
  return { getSessionStore: () => currentAccountWorld().tracedSessions };
}

export function accountKitchenStoreModule() {
  return { getAccountKitchenStore: () => currentAccountWorld().tracedKitchens };
}

export function customerMailSenderModule() {
  return {
    createCustomerMailSender: () => ({
      kind: "sender" as const,
      sender: currentAccountWorld().mail,
    }),
  };
}

export function breachedPasswordModule() {
  return {
    isBreachedPassword: () => Promise.resolve(currentAccountWorld().breach),
  };
}

export function turnstileModule() {
  return { verifyTurnstile: () => Promise.resolve("passed" as const) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The limiter's ledger
//
// The limiter's decision is real in every route test (`no-test-only-reach-in-source.test.ts`): what is replaced is the
// store it counts in. The ledger wraps that store's `recordHits`, so it sees each bucket the limiter asks for. A bucket
// is named by a keyed digest of its policy's name and its subject, so the ledger finds the policy again by making that
// digest for every policy against every subject it knows (the shared network block, the test network's block, and the
// accounts and addresses a test has seeded or typed). A policy it may be told to refuse is refused by the store
// answering a count far above any figure, which the real judgement turns into the real refusal, with the real wait.

interface KnownSubject {
  readonly kind: string;
  readonly subject: string;
}

const NETWORK_SUBJECTS: readonly KnownSubject[] = [
  { kind: "shared", subject: "" },
  { kind: "ipv4-block", subject: "192.0.2" },
];

const COUNT_ABOVE_ANY_FIGURE = 1_000_000;

export const limiterLedger = {
  /** The name of the policy of every bucket the limiter counted, in order. */
  counted: [] as string[],
  /** Policies whose bucket the store answers with a count past the figure, so the limiter refuses. The value is not
   *  used: the wait is the real window's. */
  refusing: new Map<string, number>(),
  /** Policies whose bucket the store cannot count, so the limiter cannot judge. */
  unavailable: new Set<string>(),
  subjects: [...NETWORK_SUBJECTS] as KnownSubject[],
  knowAccount(accountId: string): void {
    this.subjects.push({ kind: "account", subject: accountId });
  },
  knowAddress(address: string): void {
    this.subjects.push({ kind: "address", subject: address.toLowerCase() });
  },
  reset(): void {
    this.counted.length = 0;
    this.refusing.clear();
    this.unavailable.clear();
    this.subjects = [...NETWORK_SUBJECTS];
  },
};

function nameOfBucketKey(key: string): string {
  const digester = readDigester(process.env);
  if (digester.status !== "usable") return `unknown:${key.slice(0, 8)}`;
  for (const policy of ALL_LIMIT_POLICIES) {
    for (const { kind, subject } of limiterLedger.subjects) {
      const made = digester.digest({
        purpose: "rate-limit-bucket",
        fields: { policyName: policy.name, subjectKind: kind, subject },
      });
      if (made === key) return policy.name;
    }
  }
  return `unknown:${key.slice(0, 8)}`;
}

/** Wraps the setup's fake counters of this test: every bucket asked for is recorded under its policy's name, and a
 *  policy the test has marked is refused or cannot be counted. Everything else is counted for real. */
const countingOf = new WeakMap<object, RateLimitStore["recordHits"]>();

export function watchTheLimiter(): void {
  const store = getRateLimitStore();
  // watched again within one test (a test that makes several worlds): the first, unwatched `recordHits` is kept
  const real = countingOf.get(store) ?? store.recordHits.bind(store);
  countingOf.set(store, real);
  vi.spyOn(store, "recordHits").mockImplementation((buckets) => {
    const names = buckets.map(({ key }) => nameOfBucketKey(key));
    limiterLedger.counted.push(...names);
    if (names.some((name) => limiterLedger.unavailable.has(name))) {
      return Promise.reject(new Error(DRIVER_FAILURE_MARKER));
    }
    if (names.some((name) => limiterLedger.refusing.has(name))) {
      return Promise.resolve(buckets.map(() => COUNT_ABOVE_ANY_FIGURE));
    }
    return real(buckets);
  });
}

// A bucket the ledger cannot name would make a negative assertion ("this bucket was not counted") pass for the wrong
// reason, so a test that leaves one behind fails here, and the fix is to teach the ledger the subject.
afterEach(() => {
  const unnamed = limiterLedger.counted.filter((name) =>
    name.startsWith("unknown:"),
  );
  limiterLedger.counted.length = 0;
  if (unnamed.length > 0) {
    throw new Error(
      `The limiter counted ${String(unnamed.length)} bucket(s) the ledger could not name (${unnamed.join(", ")}): teach it the subject with limiterLedger.knowAccount or knowAddress.`,
    );
  }
});

/** Asserts a refusal's wait is a whole number of seconds no longer than the whole of the policy's window. */
export function expectAWaitWithinTheWindowOf(
  answer: Response,
  policyName: string,
): void {
  const policy = ALL_LIMIT_POLICIES.find(({ name }) => name === policyName);
  if (policy === undefined) throw new Error(`no policy ${policyName}`);
  const wait = Number(answer.headers.get("retry-after"));
  if (
    !Number.isInteger(wait) ||
    wait < 1 ||
    wait > longestWaitSecondsOf(policy.window)
  ) {
    throw new Error(
      `Retry-After ${String(answer.headers.get("retry-after"))} is not 1 to ${String(longestWaitSecondsOf(policy.window))} seconds`,
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The password hash's ledger

export const hashingLedger = {
  checks: 0,
  hashes: 0,
  /** Makes every verification answer `failed`, as a platform that cannot compute does. */
  failChecks: false,
  reset(): void {
    this.checks = 0;
    this.hashes = 0;
    this.failChecks = false;
  },
};

/** `password-hash` counting how many argon2id verifications and hashes ran. */
export function passwordHashModule<
  Module extends {
    checkPassword: (...args: never[]) => Promise<unknown>;
    hashPassword: (...args: never[]) => Promise<unknown>;
  },
>(original: Module): Module {
  return {
    ...original,
    checkPassword: (...args: never[]) => {
      hashingLedger.checks += 1;
      if (hashingLedger.failChecks) return Promise.resolve("failed");
      return original.checkPassword(...args);
    },
    hashPassword: (...args: never[]) => {
      hashingLedger.hashes += 1;
      return original.hashPassword(...args);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Accounts, sessions and kitchens

const hashByPassword = new Map<string, Promise<string>>();

/** A test that mocks `password-hash` to count its work must not count the work of seeding an account, so the real
 *  module is asked for at the moment of seeding (and not at import, which would wait on that very mock). */
async function actualHashPassword(password: string): Promise<string> {
  const actual = await vi.importActual<
    typeof import("@/lib/server/account/password-hash")
  >("@/lib/server/account/password-hash");
  return actual.hashPassword(password);
}

/** A real argon2id hash of `password`, made once per process: a test about hashing makes its own. */
export function hashOf(password: string): Promise<string> {
  let hash = hashByPassword.get(password);
  if (hash === undefined) {
    hash = actualHashPassword(password);
    hashByPassword.set(password, hash);
  }
  return hash;
}

export interface SeededAccount {
  readonly id: string;
  readonly email: string;
  readonly password: string;
  readonly passwordHash: string;
}

export async function seedVerifiedAccount({
  email,
  password = DEFAULT_PASSWORD,
  locale = "ro",
  role = "client",
}: {
  email: string;
  password?: string;
  locale?: string;
  role?: "client" | "operator" | "administrator";
}): Promise<SeededAccount> {
  const { accounts } = currentAccountWorld();
  const passwordHash = await hashOf(password);
  const created = await accounts.createUnverified({
    email,
    emailNormalForm: email.toLowerCase(),
    phone: undefined,
    locale,
    privacyNoticeVersion: "placeholder",
    passwordHash,
  });
  if (created.kind !== "created") throw new Error("seed: address taken");
  limiterLedger.knowAccount(created.accountId);
  limiterLedger.knowAddress(email);
  await confirmAddress(created.accountId, passwordHash);
  if (role !== "client") accounts.setRoleOf(created.accountId, role);
  return { id: created.accountId, email, password, passwordHash };
}

export async function seedUnverifiedAccount(
  email: string,
): Promise<SeededAccount> {
  const { accounts } = currentAccountWorld();
  const passwordHash = await hashOf(DEFAULT_PASSWORD);
  const created = await accounts.createUnverified({
    email,
    emailNormalForm: email.toLowerCase(),
    phone: undefined,
    locale: "ro",
    privacyNoticeVersion: "placeholder",
    passwordHash,
  });
  if (created.kind !== "created") throw new Error("seed: address taken");
  limiterLedger.knowAccount(created.accountId);
  limiterLedger.knowAddress(email);
  return {
    id: created.accountId,
    email,
    password: DEFAULT_PASSWORD,
    passwordHash,
  };
}

async function confirmAddress(
  accountId: string,
  passwordHash: string,
): Promise<void> {
  const { accounts, now } = currentAccountWorld();
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
    verifiedPasswordHash: passwordHash,
  });
}

export interface SeededSession {
  /** The `Cookie` request header value. */
  readonly cookie: string;
  readonly value: string;
  readonly tokenHash: string;
}

/** A live session of the account, made as a sign-in makes one. */
export async function seedSession(
  account: SeededAccount,
): Promise<SeededSession> {
  const { sessions, accounts, now } = currentAccountWorld();
  const value = mintSessionValue();
  const tokenHash = sha256Hex(value);
  const expectedPasswordHash = accounts.passwordHashOf(account.id);
  if (expectedPasswordHash === undefined) throw new Error("seed: no account");
  const created = await sessions.create({
    tokenHash,
    accountId: account.id,
    expectedPasswordHash,
    absoluteExpiresAt: new Date(now().getTime() + 30 * MILLISECONDS_PER_DAY),
  });
  if (created.kind !== "created") throw new Error("seed: session refused");
  return { cookie: `${SESSION_COOKIE_NAME}=${value}`, value, tokenHash };
}

export function cookieOfValue(value: string): string {
  return `${SESSION_COOKIE_NAME}=${value}`;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function aDesignId(): string {
  return generateDesignId();
}

export function aDesign(label = "plain"): Design {
  return { ...KITCHEN_L_DESIGN, presetId: `preset-${label}` };
}

export interface KitchenSeed {
  readonly accountId: string;
  readonly id?: string;
  readonly name?: string;
  readonly updatedAt?: Date;
  readonly sentAt?: Date;
  readonly hiddenAt?: Date;
  readonly deletedAt?: Date;
  readonly design?: Design;
}

export function seedKitchen(seed: KitchenSeed): string {
  const id = seed.id ?? generateDesignId();
  currentAccountWorld().kitchens.seed({
    id,
    accountId: seed.accountId,
    design: seed.design ?? aDesign(id.slice(0, 4)),
    ...(seed.name === undefined ? {} : { name: seed.name }),
    ...(seed.updatedAt === undefined ? {} : { updatedAt: seed.updatedAt }),
    ...(seed.sentAt === undefined ? {} : { sentAt: seed.sentAt }),
    ...(seed.hiddenAt === undefined ? {} : { hiddenAt: seed.hiddenAt }),
    ...(seed.deletedAt === undefined ? {} : { deletedAt: seed.deletedAt }),
  });
  return id;
}

// ---------------------------------------------------------------------------------------------------------------------
// Requests and answers

export interface AccountRequestInit {
  readonly method?: string;
  /** Sent as the JSON body; a string is sent as it is. */
  readonly json?: unknown;
  readonly cookie?: string;
  readonly headers?: Record<string, string>;
  /** `same-origin` unless a test is about the guard; `null` leaves the header out. */
  readonly secFetchSite?: string | null;
  readonly contentType?: string | null;
  readonly search?: string;
}

export function accountRequest(
  path: string,
  init: AccountRequestInit = {},
): NextRequest {
  const {
    method = "GET",
    json,
    cookie,
    headers = {},
    secFetchSite = "same-origin",
    contentType,
    search = "",
  } = init;
  const hasBody = json !== undefined;
  if (hasBody) knowAddressesTyped(json);
  const built: Record<string, string> = { ...headers };
  if (secFetchSite !== null) built["sec-fetch-site"] = secFetchSite;
  if (cookie !== undefined) built.cookie = cookie;
  const type = contentType === undefined ? "application/json" : contentType;
  if (hasBody && type !== null) built["content-type"] = type;
  return new NextRequest(`${ORIGIN}${path}${search}`, {
    method,
    headers: built,
    ...(hasBody
      ? { body: typeof json === "string" ? json : JSON.stringify(json) }
      : {}),
  });
}

/** Status, every header (sorted) and the body text: what "byte-identical" compares. */
export async function wireOf(answer: Response): Promise<string> {
  const headers = [...answer.headers].sort(([first], [second]) =>
    first.localeCompare(second),
  );
  return JSON.stringify([answer.status, headers, await answer.clone().text()]);
}

export async function jsonOf(answer: Response): Promise<unknown> {
  return answer.clone().json();
}

export function setCookieLinesOf(answer: Response | NextResponse): string[] {
  return answer.headers.getSetCookie();
}

// ---------------------------------------------------------------------------------------------------------------------
// The account log

export interface CapturedAccountLine {
  readonly event: string;
  readonly outcome: string;
  readonly policy?: string;
}

/** Silences the console and collects the `[account]` lines (and every other console argument, for a leak scan). */
export function captureConsole(): {
  readonly accountLines: () => CapturedAccountLine[];
  readonly everything: () => string;
} {
  const seen: unknown[][] = [];
  for (const method of [
    "debug",
    "error",
    "info",
    "log",
    "trace",
    "warn",
  ] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      seen.push(args);
    });
  }
  return {
    accountLines: () =>
      seen
        .filter(([label]) => label === "[account]")
        .map(([, line]) => line as CapturedAccountLine),
    everything: () => JSON.stringify(seen),
  };
}

/** A body that types an address teaches the ledger that address as a subject it may find a bucket of. */
function knowAddressesTyped(json: unknown): void {
  const text = typeof json === "string" ? json : JSON.stringify(json);
  for (const match of text.matchAll(/[^"\s\\]+@[^"\s\\]+/g)) {
    limiterLedger.knowAddress(match[0]);
  }
}
