import { randomBytes } from "node:crypto";

import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";

import { drainAfterTasks } from "../../../support/after-queue";
import {
  PUBLIC_ORIGIN,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedSession,
  seedVerifiedAccount,
  setCookieLinesOf,
  sha256Hex,
  wireOf,
  type AccountWorld,
  type SeededAccount,
} from "../../../support/account-world";

const flag = vi.hoisted(() => ({ on: false }));

vi.mock("@/account/profile/email-change-enabled", () => ({
  get EMAIL_CHANGE_ENABLED() {
    return flag.on;
  },
}));
vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/account/account-kitchen-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountKitchenStoreModule(),
  ),
);
vi.mock("@/lib/server/account/turnstile-verification", () =>
  import("../../../support/account-world").then((world) =>
    world.turnstileModule(),
  ),
);
vi.mock("next/server", async (original) => {
  const queue = await import("../../../support/after-queue");
  return queue.nextServerModule(await original<typeof import("next/server")>());
});
vi.mock("@/lib/server/mail/create-customer-mail-sender", () =>
  import("../../../support/account-world").then((world) =>
    world.customerMailSenderModule(),
  ),
);
vi.mock("@/lib/server/account/breached-password", () =>
  import("../../../support/account-world").then((world) =>
    world.breachedPasswordModule(),
  ),
);

const { POST: requestChange } = await import(
  "@/app/api/account/email-change/route"
);
const { POST: confirmChange } = await import(
  "@/app/api/account/email-change/confirm/route"
);
const { POST: revertChange } = await import(
  "@/app/api/account/email-change/revert/route"
);
const { POST: changePasswordRoute } = await import(
  "@/app/api/account/password/route"
);
const { POST: completeReset } = await import(
  "@/app/api/account/password-reset/complete/route"
);
const { POST: signInRoute } = await import("@/app/api/account/login/route");
const { POST: logOutRoute } = await import("@/app/api/account/logout/route");
const { POST: exportRoute } = await import("@/app/api/account/export/route");
const { PATCH: saveProfileRoute } = await import(
  "@/app/api/account/profile/route"
);
const { POST: registerRoute } = await import(
  "@/app/api/account/register/route"
);

/**
 * The whole address-change recovery path through the real routes, the fake store and the mail queue (plan 14.3,
 * criteria R-1, R-5, R-7, R-8, R-9): request (E8), confirm (E9), the undo link read out of the mail to the old address,
 * and the revert with a new password. Then the counterexamples a stranger or an intruder could try.
 *
 * `Date` is faked and moved by hand, so the route's own expiry (`new Date()` plus 24 hours) and the fake store's clock
 * are the same clock, and so are the limiter's windows. Every test starts a day-and-a-half after the last one so the
 * shared-network buckets (20 link completions an hour) never carry over between property runs.
 */

const FIRST_INSTANT_MS = Date.parse("2026-10-20T08:00:00.000Z");
const ONE_SECOND_MS = 1_000;
const ONE_HOUR_MS = 3_600_000;
const UNDO_LINK_LIFETIME_MS = 24 * ONE_HOUR_MS;
const NEXT_WORLD_STEP_MS = 36 * ONE_HOUR_MS;
const CONFIRM_LINK = /\/account\/confirm-email#t=([A-Za-z0-9_-]{43})/;
const UNDO_LINK = /\/account\/revert-email#t=([A-Za-z0-9_-]{43})/;
const REQUEST_NOTICE_KEY = /^account-mail\/email-change-requested\//;
const CHANGE_LINK_KEY = /^account-mail\/email-change\//;
const UNDO_NOTICE_KEY = /^account-mail\/email-changed\//;
const PASSWORD_CHANGED_KEY_PREFIX = "account-mail/password-changed/";
const PASSWORD_CHANGED_KEY = new RegExp(`^${PASSWORD_CHANGED_KEY_PREFIX}`);
const LEFT_ADDRESS_NOTICE_KEY = /^account-mail\/email-change-reverted\//;
const SAFE_PASSWORD_PREFIX = "a long enough passphrase number";

let world: AccountWorld;
let worldCount = 0;
let serial = 0;

interface Person {
  readonly id: string;
  /** Moves with every confirmed change and every revert. */
  email: string;
  /** Moves with every password change and every revert. */
  password: string;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  worldCount += 1;
  vi.setSystemTime(FIRST_INSTANT_MS + worldCount * NEXT_WORLD_STEP_MS);
  flag.on = true;
  vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", PUBLIC_ORIGIN);
});

afterEach(() => {
  flag.on = false;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function nextPassword(): string {
  serial += 1;
  return `${SAFE_PASSWORD_PREFIX} ${String(serial)}`;
}

async function startWorld(locale = "ru"): Promise<Person> {
  world = freshAccountWorld();
  mailMark = 0;
  captureConsole();
  serial += 1;
  const email = `ana.${String(serial)}@example.test`;
  tick(NEXT_WORLD_STEP_MS);
  const seeded = await seedVerifiedAccount({ email, locale });
  return { id: seeded.id, email, password: seeded.password };
}

function tick(milliseconds = ONE_SECOND_MS): void {
  vi.setSystemTime(Date.now() + milliseconds);
}

function post(
  handler: (request: ReturnType<typeof accountRequest>) => Promise<Response>,
  path: string,
  json: unknown,
  init: Parameters<typeof accountRequest>[1] = {},
) {
  return handler(accountRequest(path, { method: "POST", json, ...init }));
}

async function sessionOf(person: Person): Promise<string> {
  const asSeeded = { id: person.id } as SeededAccount;
  return (await seedSession(asSeeded)).cookie;
}

function revert(token: string, newPassword: unknown, search = "") {
  return post(
    revertChange,
    "/api/account/email-change/revert",
    { token, newPassword },
    { search },
  );
}

let mailMark = 0;

function forgetMailSoFar(): void {
  mailMark = world.mail.sent.length;
}

function mailSinceMark() {
  return world.mail.sent.slice(mailMark);
}

function mailsTo(recipient: string, key: RegExp) {
  return world.mail.sent.filter(
    (mail) => mail.recipient === recipient && key.test(mail.key),
  );
}

function tokenOf(mail: { text: string } | undefined, link: RegExp): string {
  const value = link.exec(mail?.text ?? "")?.[1];
  if (value === undefined) throw new Error("the mail carried no link");
  return value;
}

interface ConfirmedChange {
  /** The value of the undo link, as the old address read it. */
  readonly undoValue: string;
  /** The instant the confirm ran, from which the link lives a day. */
  readonly confirmedAtMs: number;
}

/** E8 then E9, through the routes, reading the link out of the mail: the person's address and sessions move. */
async function changeAddressByRoutes(
  person: Person,
  newEmail: string,
): Promise<ConfirmedChange> {
  const leaving = person.email;
  const asked = await post(
    requestChange,
    "/api/account/email-change",
    { newEmail, currentPassword: person.password },
    { cookie: await sessionOf(person) },
  );
  expect(asked.status).toBe(202);
  await drainAfterTasks();
  tick();
  const changeValue = tokenOf(
    mailsTo(newEmail, CHANGE_LINK_KEY).at(-1),
    CONFIRM_LINK,
  );
  const confirmedAtMs = Date.now();
  const confirmed = await post(
    confirmChange,
    "/api/account/email-change/confirm",
    {
      token: changeValue,
    },
  );
  expect(confirmed.status).toBe(200);
  await drainAfterTasks();
  tick();
  person.email = newEmail;
  const undoValue = tokenOf(
    mailsTo(leaving, UNDO_NOTICE_KEY).at(-1),
    UNDO_LINK,
  );
  return { undoValue, confirmedAtMs };
}

async function isLive(cookie: string): Promise<boolean> {
  const value = cookie.split("=")[1] ?? "";
  const lookup = await world.sessions.findLive({
    tokenHash: sha256Hex(value),
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
  });
  return lookup.kind === "live";
}

function signIn(email: string, password: string) {
  return post(signInRoute, "/api/account/login", { email, password });
}

async function addressOfAccount(id: string): Promise<string | undefined> {
  const found = await world.accounts.findById(id);
  return found.kind === "found" ? found.account.email : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// The whole flow

describe("request, confirm, undo link in the old address's mail, revert with a new password", () => {
  it("restores the address, ends every session, tells both addresses, and the old password is dead", async () => {
    const person = await startWorld();
    const original = person.email;
    const oldPassword = person.password;
    const intruderSession = await sessionOf(person);
    const newAddress = "intruder.inbox@example.test";

    const { undoValue } = await changeAddressByRoutes(person, newAddress);
    const sessionBetween = await sessionOf(person);

    expect(mailsTo(original, REQUEST_NOTICE_KEY)).toHaveLength(1);
    expect(mailsTo(original, REQUEST_NOTICE_KEY)[0]?.text).toContain(
      newAddress,
    );
    const undoMail = mailsTo(original, UNDO_NOTICE_KEY)[0];
    expect(undoMail?.text).toContain("/account/revert-email#t=");
    expect(undoMail?.text).not.toMatch(/revert-email\?/);
    expect(undoMail?.html ?? "").not.toMatch(/revert-email\?/);
    expect(await isLive(intruderSession)).toBe(false);
    expect(await addressOfAccount(person.id)).toBe(newAddress);
    expect((await signIn(newAddress, oldPassword)).status).toBe(200);
    forgetMailSoFar();
    tick();

    const newPassword = nextPassword();
    const answer = await revert(undoValue, newPassword);
    await drainAfterTasks();

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ status: "email-reverted" });
    expect(setCookieLinesOf(answer)).toEqual([]);
    expect(await addressOfAccount(person.id)).toBe(original);
    expect(await isLive(sessionBetween)).toBe(false);
    expect(mailsTo(original, PASSWORD_CHANGED_KEY)).toHaveLength(1);
    const leftNotice = mailsTo(newAddress, LEFT_ADDRESS_NOTICE_KEY);
    expect(leftNotice).toHaveLength(1);
    expect(leftNotice[0]?.text).not.toContain("#t=");
    expect(mailSinceMark()).toHaveLength(2);
    expect((await signIn(original, oldPassword)).status).toBe(401);
    expect((await signIn(newAddress, oldPassword)).status).toBe(401);
    const signedIn = await signIn(original, newPassword);
    expect(signedIn.status).toBe(200);
  });

  it("refuses, as the new password, the one the account holds now, and keeps the link usable", async () => {
    const person = await startWorld();
    const { undoValue } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );

    const refused = await revert(undoValue, person.password);

    expect(refused.status).toBe(400);
    expect(await jsonOf(refused)).toEqual({
      status: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_UNCHANGED" }],
    });
    expect((await revert(undoValue, nextPassword())).status).toBe(200);
  });

  it("takes the link once: a replay is link-invalid and changes nothing", async () => {
    const person = await startWorld();
    const { undoValue } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    expect((await revert(undoValue, nextPassword())).status).toBe(200);
    const before = JSON.stringify(world.accounts.heldAccounts());
    const heldBefore = JSON.stringify(world.accounts.heldTokens());

    const replay = await revert(undoValue, nextPassword());

    expect(replay.status).toBe(400);
    expect(await jsonOf(replay)).toEqual({ status: "link-invalid" });
    expect(JSON.stringify(world.accounts.heldAccounts())).toBe(before);
    expect(JSON.stringify(world.accounts.heldTokens())).toBe(heldBefore);
  });

  it("lets only one of two simultaneous uses of the link through, with one pair of notices", async () => {
    const person = await startWorld();
    const original = person.email;
    const { undoValue } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    forgetMailSoFar();

    const answers = await Promise.all([
      revert(undoValue, nextPassword()),
      revert(undoValue, nextPassword()),
    ]);
    await drainAfterTasks();

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(
      mailSinceMark().map(({ recipient, key }) => [
        recipient,
        key.startsWith(PASSWORD_CHANGED_KEY_PREFIX) ? "restored" : "left",
      ]),
    ).toEqual([
      [original, "restored"],
      ["away@example.test", "left"],
    ]);
  });

  it("tells the restored address and not the address left when a chain brings the account back to where it is", async () => {
    const person = await startWorld();
    const home = person.email;
    const first = await changeAddressByRoutes(person, "away@example.test");
    await changeAddressByRoutes(person, home);
    forgetMailSoFar();

    const answer = await revert(first.undoValue, nextPassword());
    await drainAfterTasks();

    expect(answer.status).toBe(200);
    expect(await addressOfAccount(person.id)).toBe(home);
    expect(mailSinceMark().map(({ recipient }) => recipient)).toEqual([home]);
  });
});

describe("with the e-mail change switched off (R-9)", () => {
  it("answers E8 and E9 with an empty 404 and counts nothing, and a link minted while it was on still reverts", async () => {
    const person = await startWorld();
    const { undoValue } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    flag.on = false;
    limiterLedger.counted.length = 0;

    const asked = await post(
      requestChange,
      "/api/account/email-change",
      { newEmail: "another@example.test", currentPassword: person.password },
      { cookie: await sessionOf(person) },
    );
    const confirmed = await post(
      confirmChange,
      "/api/account/email-change/confirm",
      {
        token: "A".repeat(43),
      },
    );

    for (const answer of [asked, confirmed]) {
      expect(answer.status).toBe(404);
      expect(await answer.clone().text()).toBe("");
    }
    expect(limiterLedger.counted).toEqual([]);
    const reverted = await revert(undoValue, nextPassword());
    expect(reverted.status).toBe(200);
    expect(await jsonOf(reverted)).toEqual({ status: "email-reverted" });
  });

  it("answers a well-formed unknown token with link-invalid, never 404", async () => {
    await startWorld();
    flag.on = false;

    const answer = await revert("B".repeat(43), nextPassword());

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "link-invalid" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Counterexamples

describe("the link at the instant it expires", () => {
  it("works one millisecond before the day is out", async () => {
    const person = await startWorld();
    const { undoValue, confirmedAtMs } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    vi.setSystemTime(confirmedAtMs + UNDO_LINK_LIFETIME_MS - 1);

    expect((await revert(undoValue, nextPassword())).status).toBe(200);
  });

  it("is link-invalid at the instant the day is out, and nothing is written", async () => {
    const person = await startWorld();
    const { undoValue, confirmedAtMs } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    vi.setSystemTime(confirmedAtMs + UNDO_LINK_LIFETIME_MS);
    const accountsBefore = JSON.stringify(world.accounts.heldAccounts());
    const tokensBefore = JSON.stringify(world.accounts.heldTokens());

    const answer = await revert(undoValue, nextPassword());

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "link-invalid" });
    expect(JSON.stringify(world.accounts.heldAccounts())).toBe(accountsBefore);
    expect(JSON.stringify(world.accounts.heldTokens())).toBe(tokensBefore);
  });

  it("answers the instant and the unknown token the same bytes", async () => {
    const person = await startWorld();
    const { undoValue, confirmedAtMs } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    const unknown = await wireOf(await revert("C".repeat(43), nextPassword()));
    vi.setSystemTime(confirmedAtMs + UNDO_LINK_LIFETIME_MS);

    expect(await wireOf(await revert(undoValue, nextPassword()))).toBe(unknown);
  });
});

describe("a link is the token's, not the caller's", () => {
  it("restores the account the link names even when the caller holds another account's session, and touches only that account", async () => {
    const victim = await startWorld();
    const { undoValue } = await changeAddressByRoutes(
      victim,
      "away@example.test",
    );
    const other = await seedVerifiedAccount({
      email: "other.person@example.test",
      locale: "ro",
    });
    const otherSession = await seedSession(other);
    const otherBefore = JSON.stringify(
      world.accounts.heldAccounts().find(({ id }) => id === other.id),
    );

    const answer = await revert(undoValue, nextPassword());

    expect(answer.status).toBe(200);
    expect(await isLive(otherSession.cookie)).toBe(true);
    expect(
      JSON.stringify(
        world.accounts.heldAccounts().find(({ id }) => id === other.id),
      ),
    ).toBe(otherBefore);
  });

  it("does not accept the token from the query string, nor changed in case, spacing or padding, and the real link survives each", async () => {
    const person = await startWorld();
    const { undoValue } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    const before = JSON.stringify(world.accounts.heldTokens());
    const password = nextPassword();

    const answers = [
      await revert("", password, `?token=${undoValue}`),
      await revert("", password, `?t=${undoValue}`),
      await revert(undoValue.toUpperCase(), password),
      await revert(`${undoValue} `, password),
      await revert(` ${undoValue}`, password),
      await revert(`${undoValue}\n`, password),
      await revert(`${undoValue}=`, password),
      await revert([undoValue] as unknown as string, password),
      await revert(
        { toString: () => undoValue } as unknown as string,
        password,
      ),
    ];

    for (const [index, answer] of answers.entries()) {
      expect([index, answer.status]).toEqual([index, 400]);
      expect([index, await jsonOf(answer)]).toEqual([
        index,
        { status: "link-invalid" },
      ]);
    }
    expect(JSON.stringify(world.accounts.heldTokens())).toBe(before);
    expect((await revert(undoValue, password)).status).toBe(200);
  });
});

describe("the intruder who changed the password before the revert (a residual the owner accepted)", () => {
  it("still lets the link work, refuses the intruder's own password as the new one, and then ends the intruder's sessions and password", async () => {
    const person = await startWorld();
    const original = person.email;
    const { undoValue } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    const intruderPassword = nextPassword();
    const changed = await post(
      changePasswordRoute,
      "/api/account/password",
      { currentPassword: person.password, newPassword: intruderPassword },
      { cookie: await sessionOf(person) },
    );
    expect(changed.status).toBe(200);
    person.password = intruderPassword;
    const intruderSession = await sessionOf(person);

    const refused = await revert(undoValue, intruderPassword);
    const restored = await revert(undoValue, nextPassword());

    expect(refused.status).toBe(400);
    expect(await jsonOf(refused)).toEqual({
      status: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_UNCHANGED" }],
    });
    expect(restored.status).toBe(200);
    expect(await isLive(intruderSession)).toBe(false);
    expect((await signIn("away@example.test", intruderPassword)).status).toBe(
      401,
    );
    expect((await signIn(original, intruderPassword)).status).toBe(401);
  });
});

describe("every reachable takeover of the address a live link restores", () => {
  const VARIANTS = (address: string): string[] => [
    address,
    address.toUpperCase(),
    address.replace(/^./, (first) => first.toUpperCase()),
    ` ${address} `,
  ];

  it("fails through the register route in each spelling, and the revert then restores the address", async () => {
    const person = await startWorld();
    const original = person.email;
    const { undoValue } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );

    for (const spelling of VARIANTS(original)) {
      const answer = await post(registerRoute, "/api/account/register", {
        email: spelling,
        password: nextPassword(),
        locale: "ro",
        privacyNoticeVersion: "2026-10-draft",
      });
      expect([spelling, answer.status]).toEqual([spelling, 202]);
    }
    await drainAfterTasks();

    expect(
      world.accounts
        .heldAccounts()
        .filter(({ email }) => email.toLowerCase() === original.toLowerCase()),
    ).toEqual([]);
    expect((await revert(undoValue, nextPassword())).status).toBe(200);
    expect(await addressOfAccount(person.id)).toBe(original);
  });

  it("gets another account's change request to the address no link, and the revert still works", async () => {
    const person = await startWorld();
    const original = person.email;
    const { undoValue } = await changeAddressByRoutes(
      person,
      "away@example.test",
    );
    const rival = await seedVerifiedAccount({
      email: "rival@example.test",
      locale: "ro",
    });
    await post(
      requestChange,
      "/api/account/email-change",
      { newEmail: original, currentPassword: rival.password },
      { cookie: (await seedSession(rival)).cookie },
    );
    await drainAfterTasks();

    expect(mailsTo(original, CHANGE_LINK_KEY)).toEqual([]);
    expect(mailsTo("rival@example.test", REQUEST_NOTICE_KEY)).toHaveLength(1);
    expect((await revert(undoValue, nextPassword())).status).toBe(200);
    expect(await addressOfAccount(rival.id)).toBe("rival@example.test");
    expect(await addressOfAccount(person.id)).toBe(original);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R-5 through the routes

type RouteAction =
  | "change-password"
  | "reset-completion"
  | "sign-in"
  | "logout-everywhere"
  | "request-change"
  | "request-own-address"
  | "confirm-change"
  | "confirm-change-home"
  | "profile-edit"
  | "export"
  | "wait";

const ROUTE_ACTIONS: readonly RouteAction[] = [
  "change-password",
  "reset-completion",
  "sign-in",
  "logout-everywhere",
  "request-change",
  "request-own-address",
  "confirm-change",
  "confirm-change-home",
  "profile-edit",
  "export",
  "wait",
];

const routeStepArbitrary = fc.record({
  action: fc.constantFrom(...ROUTE_ACTIONS),
  /** A wait of up to 4 hours; eight of them can pass the day. */
  waitMs: fc.integer({ min: 1, max: 4 * ONE_HOUR_MS }),
});

/** The per-account caps (5 requests a day) belong to the limiter, not to survival: the run asks for at most 4 more. */
const REQUESTS_PER_RUN = 4;

interface RouteRun {
  readonly person: Person;
  readonly home: string;
  requestsLeft: number;
}

async function runRouteAction(
  run: RouteRun,
  step: { action: RouteAction; waitMs: number },
): Promise<void> {
  const { person } = run;
  switch (step.action) {
    case "change-password": {
      const next = nextPassword();
      const answer = await post(
        changePasswordRoute,
        "/api/account/password",
        { currentPassword: person.password, newPassword: next },
        { cookie: await sessionOf(person) },
      );
      expect(answer.status).toBe(200);
      person.password = next;
      break;
    }
    case "reset-completion": {
      const value = randomBytes(32).toString("base64url");
      await world.accounts.issueToken({
        accountId: person.id,
        purpose: "reset-password",
        tokenHash: sha256Hex(value),
        expiresAt: new Date(Date.now() + ONE_HOUR_MS),
      });
      const next = nextPassword();
      const answer = await post(
        completeReset,
        "/api/account/password-reset/complete",
        { token: value, newPassword: next },
      );
      expect(answer.status).toBe(200);
      person.password = next;
      break;
    }
    case "sign-in":
      expect((await signIn(person.email, person.password)).status).toBe(200);
      break;
    case "logout-everywhere":
      expect(
        (
          await post(
            logOutRoute,
            "/api/account/logout",
            { scope: "everywhere" },
            { cookie: await sessionOf(person) },
          )
        ).status,
      ).toBe(204);
      break;
    case "request-change":
    case "request-own-address":
      await requestOnly(run, step.action === "request-own-address");
      break;
    case "confirm-change":
    case "confirm-change-home":
      await confirmOnly(run, step.action === "confirm-change-home");
      break;
    case "profile-edit":
      expect(
        (
          await saveProfileRoute(
            accountRequest("/api/account/profile", {
              method: "PATCH",
              json: { name: `Name ${String(serial)}` },
              cookie: await sessionOf(person),
            }),
          )
        ).status,
      ).toBe(200);
      break;
    case "export":
      expect([200, 429]).toContain(
        (
          await post(
            exportRoute,
            "/api/account/export",
            {},
            {
              cookie: await sessionOf(person),
            },
          )
        ).status,
      );
      break;
    case "wait":
      tick(step.waitMs);
      break;
  }
  await drainAfterTasks();
  tick();
}

async function requestOnly(run: RouteRun, toOwnAddress: boolean) {
  if (run.requestsLeft === 0) return;
  run.requestsLeft -= 1;
  serial += 1;
  const answer = await post(
    requestChange,
    "/api/account/email-change",
    {
      newEmail: toOwnAddress
        ? run.person.email
        : `pending.${String(serial)}@example.test`,
      currentPassword: run.person.password,
    },
    { cookie: await sessionOf(run.person) },
  );
  expect(answer.status).toBe(202);
}

async function confirmOnly(run: RouteRun, goesHome: boolean) {
  if (run.requestsLeft === 0) return;
  run.requestsLeft -= 1;
  serial += 1;
  const target =
    goesHome && run.person.email !== run.home
      ? run.home
      : `moved.${String(serial)}@example.test`;
  const leaving = run.person.email;
  const asked = await post(
    requestChange,
    "/api/account/email-change",
    { newEmail: target, currentPassword: run.person.password },
    { cookie: await sessionOf(run.person) },
  );
  expect(asked.status).toBe(202);
  await drainAfterTasks();
  tick();
  const changeValue = tokenOf(
    mailsTo(target, CHANGE_LINK_KEY).at(-1),
    CONFIRM_LINK,
  );
  const confirmed = await post(
    confirmChange,
    "/api/account/email-change/confirm",
    {
      token: changeValue,
    },
  );
  expect(confirmed.status).toBe(200);
  run.person.email = target;
  expect(await addressOfAccount(run.person.id)).toBe(target);
  expect(leaving).not.toBe(target);
}

describe("R-5 through the routes: the first undo link survives anything its account does afterwards", () => {
  it("restores the first address, with a new password, after any sequence of up to 8 later actions, unless the day is out (40 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(routeStepArbitrary, { minLength: 0, maxLength: 8 }),
        async (steps) => {
          const person = await startWorld();
          const home = person.email;
          const first = await changeAddressByRoutes(
            person,
            "away@example.test",
          );
          const run: RouteRun = {
            person,
            home,
            requestsLeft: REQUESTS_PER_RUN,
          };

          for (const step of steps) await runRouteAction(run, step);

          const isStillWithinTheDay =
            Date.now() < first.confirmedAtMs + UNDO_LINK_LIFETIME_MS;
          const answer = await revert(first.undoValue, nextPassword());
          if (isStillWithinTheDay) {
            expect(answer.status).toBe(200);
            expect(await addressOfAccount(person.id)).toBe(home);
          } else {
            expect(answer.status).toBe(400);
            expect(await jsonOf(answer)).toEqual({ status: "link-invalid" });
          }
        },
      ),
      { numRuns: 40 },
    );
  }, 240_000);
});
