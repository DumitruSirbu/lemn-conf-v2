import { readFileSync } from "node:fs";

import {
  countStaffFixturesForTests,
  newStaffFixtureMarker,
  plantStaffAccountForTests,
  plantStaffAuditEventForTests,
  plantStaffDesignForTests,
  plantStaffNoteForTests,
  plantStaffRequestForTests,
  plantStaffRequestStateForTests,
  removeStaffFixturesForTests,
  type StaffFixtureCounts,
} from "@lemnaria/persistence";
import type {
  RequestStatus,
  StaffAuditAction,
} from "@lemnaria/configurator-domain";
import type { BrowserContext } from "@playwright/test";
import { createTranslator, type Messages } from "next-intl";

import { ACCOUNT_KIND } from "../../../src/lib/server/rate-limit/bucket-subject";
import {
  STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY,
  STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY,
  STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY,
  STAFF_NOTE_BY_ACCOUNT_POLICY,
  STAFF_STATUS_BY_ACCOUNT_POLICY,
  STAFF_UNHIDE_BY_ACCOUNT_POLICY,
} from "../../../src/lib/server/rate-limit/limit-policy";
import { bucketKeyOfBlock, secretOfThisRun } from "./e2e-rate-limit-run";
import {
  mintSessionValue,
  sessionCookieOf,
  sessionTokenHashOf,
} from "./staff-session";

// A staff scenario on the test database for a spec to sign in to: accounts of each role holding a live session, and the
// kitchens, requests, statuses, notes and audit rows the staff screens read. Every row is planted and removed by
// `@lemnaria/persistence`'s staff fixtures under one marker; a spec plants its world in `beforeAll` and removes it in
// `afterAll`, which also proves nothing is left (`removeStaffWorld`).

/** The words of the Romanian screens, resolved from the same file the app reads, so a reworded label is not a typo here. */
const messages = JSON.parse(
  readFileSync(
    new URL("../../../src/messages/ro.json", import.meta.url),
    "utf8",
  ),
) as Messages;
const translator = createTranslator({ locale: "ro", messages });

export function romanian(
  key: string,
  values?: Readonly<Record<string, string | number>>,
): string {
  const translate = translator as unknown as (
    key: string,
    values?: Readonly<Record<string, string | number>>,
  ) => string;
  return translate(key, values);
}

/** `localhost` is the suite's own origin whatever its port; a cookie is host-only and carries no port. */
const SUITE_HOST_ORIGIN = "http://localhost";

export type StaffCookie = ReturnType<typeof sessionCookieOf>;

export interface WorldMember {
  readonly accountId: string;
  readonly email: string;
  readonly cookieValue: string;
  readonly cookie: StaffCookie;
}

export interface SentKitchenSpec {
  readonly name: string;
  readonly status?: RequestStatus;
  readonly notes?: readonly string[];
  readonly hasRequest?: boolean;
}

export interface StaffWorld {
  readonly marker: string;
  readonly operator: WorldMember;
  readonly administrator: WorldMember;
  readonly client: WorldMember;
  /** The counters the staff accounts' own requests fill; removed with the world. */
  readonly rateLimitKeys: readonly string[];
}

export async function plantStaffWorld(): Promise<StaffWorld> {
  const marker = newStaffFixtureMarker();
  const [operator, administrator, client] = await Promise.all([
    plantMember(marker, "operator"),
    plantMember(marker, "administrator"),
    plantMember(marker, "client"),
  ]);
  return {
    marker,
    operator,
    administrator,
    client,
    rateLimitKeys: [operator, administrator].flatMap(({ accountId }) =>
      STAFF_POLICIES.map((policy) =>
        bucketKeyOfBlock(secretOfThisRun(), policy.name, {
          kind: ACCOUNT_KIND,
          subject: accountId,
        }),
      ),
    ),
  };
}

const STAFF_POLICIES = [
  STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY,
  STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY,
  STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY,
  STAFF_NOTE_BY_ACCOUNT_POLICY,
  STAFF_STATUS_BY_ACCOUNT_POLICY,
  STAFF_UNHIDE_BY_ACCOUNT_POLICY,
] as const;

async function plantMember(
  marker: string,
  role: "operator" | "administrator" | "client",
): Promise<WorldMember> {
  const cookieValue = mintSessionValue();
  const { accountId, email } = await plantStaffAccountForTests(marker, {
    role,
    sessionTokenHash: sessionTokenHashOf(cookieValue),
  });
  return {
    accountId,
    email,
    cookieValue,
    cookie: sessionCookieOf(cookieValue, SUITE_HOST_ORIGIN),
  };
}

/** Signs a browser context in as this person, as the server's own cookie would: it holds the cookie and nothing else. */
export async function signIn(
  context: BrowserContext,
  member: WorldMember,
): Promise<void> {
  await context.addCookies([member.cookie]);
}

/** Removes the world and says what it found: every figure must then be zero, or a row was left behind. */
export async function removeStaffWorld(world: StaffWorld): Promise<{
  readonly removed: StaffFixtureCounts;
  readonly left: StaffFixtureCounts;
}> {
  const scope = { rateLimitKeys: world.rateLimitKeys };
  const removed = await removeStaffFixturesForTests(world.marker, scope);
  const left = await countStaffFixturesForTests(world.marker, scope);
  return { removed, left };
}

export const NOTHING_LEFT: StaffFixtureCounts = Object.freeze({
  designNotes: 0,
  designRequestStates: 0,
  staffAuditEvents: 0,
  contactSubmissions: 0,
  designShareLinks: 0,
  designs: 0,
  accountSessions: 0,
  accountEmailTokens: 0,
  accounts: 0,
  rateLimitCounters: 0,
});

/** A sent kitchen of the world's client, with the request, the status and the notes the spec names; answers its id. */
export async function plantSentKitchen(
  world: StaffWorld,
  spec: SentKitchenSpec,
): Promise<string> {
  const designId = await plantStaffDesignForTests(world.marker, {
    kind: "visible",
    ownerAccountId: world.client.accountId,
    name: spec.name,
  });
  if (spec.hasRequest ?? true) {
    await plantStaffRequestForTests(world.marker, { designId });
  }
  if (spec.status !== undefined) {
    await plantStaffRequestStateForTests(world.marker, {
      designId,
      status: spec.status,
      changedByAccountId: world.operator.accountId,
    });
  }
  for (const body of spec.notes ?? []) {
    await plantStaffNoteForTests(world.marker, {
      designId,
      authorAccountId: world.operator.accountId,
      body,
    });
  }
  return designId;
}

/** A kitchen the client hid or deleted, or a draft no account holds. */
export function plantOtherKitchen(
  world: StaffWorld,
  kind: "hidden" | "client-deleted" | "visitor-draft",
  name: string,
): Promise<string> {
  return plantStaffDesignForTests(world.marker, {
    kind,
    ...(kind === "visitor-draft"
      ? {}
      : { ownerAccountId: world.client.accountId }),
    name,
  });
}

/** An audit row of a staff member, for a kitchen when the action names one. */
export function plantAuditRow(
  world: StaffWorld,
  spec: {
    readonly actor: WorldMember;
    readonly action: StaffAuditAction;
    readonly designId?: string;
    /** The client whose kitchen it is, as the application records it for an action on a kitchen. */
    readonly subject?: WorldMember;
  },
): Promise<string> {
  return plantStaffAuditEventForTests(world.marker, {
    actorAccountId: spec.actor.accountId,
    action: spec.action,
    ...(spec.designId === undefined ? {} : { designId: spec.designId }),
    ...(spec.subject === undefined
      ? {}
      : { subjectAccountId: spec.subject.accountId }),
  });
}

export function countOf(world: StaffWorld): Promise<StaffFixtureCounts> {
  return countStaffFixturesForTests(world.marker, {
    rateLimitKeys: world.rateLimitKeys,
  });
}

export const OPERATOR_OPENED_ROWS = 24;
export const OPERATOR_LISTED_ROWS = 6;
export const ADMINISTRATOR_NOTE_ROWS = 2;

/**
 * The audit log of a scenario: the operator opened a kitchen 24 times and listed the kitchens 6 times, and the administrator
 * then added a note twice, each planted after the one before so the administrator's rows are the newest. Thirty rows are
 * the operator's, more than a page of either width.
 */
export async function plantAuditScenario(world: StaffWorld): Promise<void> {
  const designId = await plantSentKitchen(world, {
    name: `${world.marker} jurnal`,
    status: "new",
  });
  for (let row = 0; row < OPERATOR_OPENED_ROWS; row += 1) {
    await plantAuditRow(world, {
      actor: world.operator,
      action: "kitchen-opened",
      designId,
      subject: world.client,
    });
  }
  for (let row = 0; row < OPERATOR_LISTED_ROWS; row += 1) {
    await plantAuditRow(world, {
      actor: world.operator,
      action: "kitchens-listed",
    });
  }
  for (let row = 0; row < ADMINISTRATOR_NOTE_ROWS; row += 1) {
    await plantAuditRow(world, {
      actor: world.administrator,
      action: "note-added",
      designId,
      subject: world.client,
    });
  }
}
